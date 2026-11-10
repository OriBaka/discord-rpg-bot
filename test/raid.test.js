// Test cho hệ thống raid boss tuần.
// Chạy: npm test
//
// Những chỗ dễ vỡ nhất và đều từng vỡ trong lúc phát triển:
//   1. HP còn lại phải tính bằng SUM(raid_attacks) — nếu ai đó "tối ưu" thành
//      một cột hp_left và UPDATE nó, sát thương sẽ mất khi 2 người đánh cùng lúc.
//   2. Thưởng phải KHÁC NHAU giữa hạ boss và không hạ boss, nếu không thanh
//      máu chung vô nghĩa (đã từng trả 100% dù boss còn sống).
//   3. settleRewards phải idempotent — background job chạy mỗi giờ, gọi 2 lần
//      không được nhân đôi thưởng.
//   4. HP boss phải neo theo level người chơi thật, không theo minLevel của
//      boss (đã từng làm boss chết trong 2 đòn của 2 người).
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, loadCommands, fakeMessage, quiet, loud } = require('./harness');

let db, player, guilds, raid, cmd, cmds, userSeq = 0;

function freshPlayer(overrides = {}) {
  const uid = `RB${++userSeq}`;
  player.createPlayer(uid, `rb${userSeq}`);
  if (Object.keys(overrides).length) player.updatePlayer(uid, overrides);
  return uid;
}

// Xoá HẲN raid của tuần hiện tại để lần gọi sau tạo mới với HP tính lại.
// Cần thiết vì HP boss chỉ tính một lần khi tạo row (đúng thiết kế: máu boss
// không được đổi giữa tuần), và các test chạy chung một DB.
function freshRaid() {
  const wk = raid.weekKey();
  const old = db.prepare('SELECT * FROM raid_bosses WHERE week_key = ?').get(wk);
  if (old) {
    db.prepare('DELETE FROM raid_attacks WHERE raid_id = ?').run(old.id);
    db.prepare('DELETE FROM raid_rewards WHERE raid_id = ?').run(old.id);
    db.prepare('DELETE FROM raid_bosses WHERE id = ?').run(old.id);
  }
  return raid.getCurrentRaid();
}

// Reset sạch raid của tuần hiện tại để mỗi test độc lập
function resetRaid() {
  const r = raid.getCurrentRaid();
  db.prepare('DELETE FROM raid_attacks WHERE raid_id = ?').run(r.id);
  db.prepare('DELETE FROM raid_rewards WHERE raid_id = ?').run(r.id);
  db.prepare('UPDATE raid_bosses SET defeated_at = NULL, settled = 0 WHERE id = ?').run(r.id);
  return raid.getCurrentRaid();
}

// Giả lập thời gian trôi để bỏ qua cooldown 10 phút
function later(mins) { return Date.now() + mins * 60 * 1000; }

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  guilds = require(`${ROOT}/src/game/guilds`);
  raid = require(`${ROOT}/src/game/raid`);
  cmds = loadCommands();
  cmd = cmds.get('raid');
  loud();
  assert.ok(cmd, 'phải load được lệnh raid');
});

// ── Tuần ISO ─────────────────────────────────────────────────────────────────
test('raid: weekKey đúng chuẩn ISO (thứ 2 đầu tuần)', () => {
  const at = (s) => new Date(s + 'T12:00:00Z').getTime();
  assert.strictEqual(raid.weekKey(at('2026-11-04')), '2026-W45');
  // 30/12/2024 thuộc tuần 1 của 2025 theo ISO 8601
  assert.strictEqual(raid.weekKey(at('2024-12-30')), '2025-W01');
  // Chủ nhật cùng tuần với thứ 2 trước đó
  assert.strictEqual(raid.weekKey(at('2026-11-08')), raid.weekKey(at('2026-11-02')));
});

test('raid: weekRange là 7 ngày, bắt đầu thứ 2', () => {
  const { start, end } = raid.weekRange(new Date('2026-11-04T12:00:00Z').getTime());
  assert.strictEqual(end - start, 7 * 24 * 60 * 60 * 1000);
  const d = new Date(start);
  assert.strictEqual(d.getUTCDay(), 1, 'phải bắt đầu vào thứ 2');
});

test('raid: cùng tuần thì getCurrentRaid trả cùng một boss', () => {
  const a = raid.getCurrentRaid();
  const b = raid.getCurrentRaid();
  assert.strictEqual(a.id, b.id);
  assert.strictEqual(a.week, b.week);
});

// ── HP boss ──────────────────────────────────────────────────────────────────
test('raid: HP boss neo theo level người chơi, không theo minLevel boss', () => {
  // Boss yếu nhất (minLevel 1) nhưng server toàn người Lv.20 → HP phải tính
  // theo Lv.20, không phải Lv.1
  for (let i = 0; i < 3; i++) freshPlayer({ level: 20 });
  const r = freshRaid();
  const perLv1 = raid.expectedDamagePerAttack(1);
  const perLv20 = raid.expectedDamagePerAttack(20);
  // HP phải lớn hơn hẳn mức "tính theo Lv.1"
  assert.ok(r.hp_total > perLv1 * 6,
    `HP ${r.hp_total} quá thấp so với sát thương Lv.1 (${perLv1.toFixed(0)}/lượt)`);
  assert.ok(r.hp_total > 0);
  assert.ok(perLv20 > perLv1, 'sát thương Lv.20 phải cao hơn Lv.1');
});

test('raid: HP boss khớp với số người tham gia (không quá dễ, không bất khả thi)', () => {
  // Mục tiêu cân bằng: số người THAM GIA dùng hết 5 lượt thì hạ được boss
  // (khoảng 90% máu). Tuần đầu dùng 40% tổng tài khoản nên hệ số thấp hơn.
  for (let i = 0; i < 5; i++) freshPlayer({ level: 20 });
  const r = freshRaid();
  const perAttack = raid.expectedDamagePerAttack(20, r.boss.def);
  const totalPlayers = db.prepare('SELECT COUNT(*) c FROM players').get().c;

  // Nếu TẤT CẢ người chơi cùng đánh: phải thừa sức (không bất khả thi)
  const allIn = totalPlayers * raid.ATTACKS_PER_WEEK * perAttack;
  assert.ok(r.hp_total <= allIn,
    `HP ${r.hp_total} vượt quá sát thương tối đa của cả server (${allIn.toFixed(0)})`);

  // Không được quá dễ: phải cần nhiều hơn 1 người
  const onePlayer = raid.ATTACKS_PER_WEEK * perAttack;
  assert.ok(r.hp_total > onePlayer,
    `HP ${r.hp_total} quá thấp — 1 người đã hạ được boss của cả server`);
});

// ── Đánh boss ────────────────────────────────────────────────────────────────
test('raid: đánh boss trừ lượt và gây sát thương', () => {
  const uid = freshPlayer({ level: 20 });
  const r = resetRaid();
  const res = raid.attack(r, player.getPlayer(uid), { now: Date.now() });
  assert.strictEqual(res.ok, true);
  assert.ok(res.damage > 0, 'phải gây sát thương dương');
  const st = raid.getPlayerStatus(raid.getCurrentRaid(), uid);
  assert.strictEqual(st.used, 1);
  assert.strictEqual(st.left, raid.ATTACKS_PER_WEEK - 1);
});

test('raid: sát thương cộng dồn vào HP chung (SUM, không ghi đè)', () => {
  const a = freshPlayer({ level: 20 });
  const b = freshPlayer({ level: 20 });
  const r = resetRaid();
  const hp0 = r.hp_left;
  const r1 = raid.attack(raid.getCurrentRaid(), player.getPlayer(a), { now: Date.now() });
  const r2 = raid.attack(raid.getCurrentRaid(), player.getPlayer(b), { now: Date.now() });
  const after = raid.getCurrentRaid();
  assert.strictEqual(after.hp_left, hp0 - r1.damage - r2.damage,
    'HP còn lại phải bằng hp_total - tổng sát thương của cả hai');
  assert.strictEqual(raid.raidDamage(after.id), r1.damage + r2.damage);
});

test('raid: cooldown 10 phút chặn đánh liên tiếp', () => {
  const uid = freshPlayer({ level: 20 });
  resetRaid();
  const ok1 = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  assert.strictEqual(ok1.ok, true);
  const ok2 = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  assert.strictEqual(ok2.ok, false);
  assert.strictEqual(ok2.reason, 'cooldown');
});

test('raid: dùng hết 5 lượt thì bị chặn', () => {
  const uid = freshPlayer({ level: 20 });
  resetRaid();
  for (let i = 0; i < raid.ATTACKS_PER_WEEK; i++) {
    const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: later(i * 11) });
    assert.strictEqual(res.ok, true, `lượt ${i + 1} phải đánh được`);
  }
  const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: later(100) });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'no_attacks');
});

test('raid: người chơi KHÔNG mất HP khi đánh raid', () => {
  // Thiết kế: raid là bài kiểm tra sát thương, không phải trận sinh tử.
  // Nếu người yếu chết thì họ không dám đánh → thanh máu chung không bao giờ đầy.
  const uid = freshPlayer({ level: 20, hp: 100, max_hp: 385 });
  resetRaid();
  raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  const p = player.getPlayer(uid);
  assert.strictEqual(p.hp, 100, 'HP phải giữ nguyên');
});

// ── Hạ boss ──────────────────────────────────────────────────────────────────
// Đánh boss đến chết bằng NHIỀU người — đây là thiết kế cốt lõi: HP scale theo
// số người tham gia nên một người không gánh nổi boss của server đông người.
function teamKillBoss(levels, opts = {}) {
  const r = resetRaid();
  // Số người cần = HP / (sát thương mỗi người × số lượt), cộng dư 2 người.
  // Không hardcode số người: HP phụ thuộc quy mô DB dùng chung giữa các test.
  const perLv = levels[0];
  const perAttack = raid.expectedDamagePerAttack(perLv, r.boss.def);
  const need = Math.ceil(r.hp_total / (perAttack * raid.ATTACKS_PER_WEEK)) + 2;
  const actual = Array.from({ length: Math.max(levels.length, need) }, () => perLv);
  const uids = actual.map(lv => freshPlayer({ level: lv, atk: 10 + 3 * (lv - 1) + (lv >= 45 ? 62 : 0) }));
  let guard = 0;
  while (!raid.getCurrentRaid().defeated && guard < 400) {
    guard++;
    for (const uid of uids) {
      const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), {
        now: later(guard * 11), guildId: opts.guildId,
      });
      if (!res.ok && res.reason === 'no_attacks') continue;
      if (res.ok && res.killed) return { uids, died: true };
    }
  }
  return { uids, died: raid.getCurrentRaid().defeated };
}

test('raid: hạ boss thì đánh dấu defeated và chặn đánh tiếp', () => {
  const { died } = teamKillBoss([40, 40, 40]);
  const fin = raid.getCurrentRaid();
  assert.strictEqual(died && fin.defeated, true,
    `3 người Lv.40 phải hạ được boss (còn ${fin.hp_left}/${fin.hp_total})`);
  assert.strictEqual(fin.hp_left, 0);
  const sample = db.prepare('SELECT user_id FROM raid_attacks WHERE raid_id = ? LIMIT 1').get(fin.id);
  const res = raid.attack(fin, player.getPlayer(sample.user_id), { now: later(99999) });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'defeated');
});

test('raid: không thể gây quá số máu còn lại (chống overkill sai BXH)', () => {
  const uid = freshPlayer({ level: 60 });
  player.updatePlayer(uid, { atk: 10 + 3 * 59 + 62 });
  const r = resetRaid();
  // Đánh cho boss còn rất ít máu
  let guard = 0;
  while (raid.getCurrentRaid().hp_left > 1500 && guard < 100) {
    guard++;
    const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: later(guard * 11) });
    if (!res.ok) break;
  }
  const before = raid.getCurrentRaid().hp_left;
  const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: later(9999) });
  if (res.ok) {
    assert.ok(res.damage <= before, `sát thương ${res.damage} > máu còn lại ${before}`);
    assert.strictEqual(raid.getCurrentRaid().hp_left, 0);
  }
});

// ── Bảng xếp hạng ────────────────────────────────────────────────────────────
test('raid: BXH sắp xếp giảm dần theo sát thương', () => {
  // Phải set `atk` thật: attack() đọc getEffectiveStats(player), KHÔNG suy ra
  // sát thương từ level. Từng viết test chỉ set level nên 2 người gây sát
  // thương như nhau và thứ tự BXH ngẫu nhiên.
  const strong = freshPlayer({ level: 30, atk: 200 });
  const weak = freshPlayer({ level: 5, atk: 20 });
  resetRaid();
  raid.attack(raid.getCurrentRaid(), player.getPlayer(strong), { now: Date.now() });
  raid.attack(raid.getCurrentRaid(), player.getPlayer(weak), { now: Date.now() });
  const rows = raid.leaderboard(raid.getCurrentRaid().id, 10);
  assert.ok(rows.length >= 2);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].dmg >= rows[i].dmg, 'BXH phải giảm dần');
  }
  assert.strictEqual(rows[0].user_id, strong, 'người mạnh hơn phải top 1');
});

test('raid: BXH bang cộng dồn sát thương của thành viên', () => {
  const leader = freshPlayer({ level: 20, gold: 99999 });
  const m1 = freshPlayer({ level: 20, gold: 99999 });
  const g = guilds.createGuild(leader, 'RD1', 'Raid Guild');
  assert.strictEqual(g.ok, true, `tạo bang phải thành công: ${JSON.stringify(g)}`);
  guilds.acceptInvite(m1, g.guild.id);
  resetRaid();
  const guild = guilds.getPlayerGuild(leader);
  raid.attack(raid.getCurrentRaid(), player.getPlayer(leader), { guildId: guild.id, now: Date.now() });
  raid.attack(raid.getCurrentRaid(), player.getPlayer(m1), { guildId: guild.id, now: Date.now() });
  const rows = raid.guildLeaderboard(raid.getCurrentRaid().id, 5);
  const mine = rows.find(r => r.guild_id === guild.id);
  assert.ok(mine, 'bang phải có mặt trong BXH');
  assert.strictEqual(mine.members, 2, 'phải đếm 2 thành viên khác nhau');
  assert.ok(mine.dmg > 0);
});

test('raid: đánh raid cộng XP cho bang', () => {
  const leader = freshPlayer({ level: 20, gold: 99999 });
  const g = guilds.createGuild(leader, 'RD2', 'Xp Guild');
  const guild = guilds.getPlayerGuild(leader);
  const xpBefore = guilds.getGuild(guild.id).xp;
  resetRaid();
  const res = raid.attack(raid.getCurrentRaid(), player.getPlayer(leader), {
    guildId: guild.id, now: Date.now(),
  });
  const xpAfter = guilds.getGuild(guild.id).xp;
  const guildLeveled = guilds.getGuild(guild.id).level > guild.level;
  assert.ok(xpAfter > xpBefore || guildLeveled,
    `bang phải nhận XP (trước ${xpBefore}, sau ${xpAfter}, res.guildXp=${res.guildXp})`);
  assert.ok(res.guildXp > 0, 'kết quả phải báo XP bang đã cộng');
});

// ── Thưởng ───────────────────────────────────────────────────────────────────
test('raid: rewardTier giảm dần theo hạng', () => {
  assert.ok(raid.rewardTier(1).mult > raid.rewardTier(2).mult);
  assert.ok(raid.rewardTier(2).mult > raid.rewardTier(5).mult);
  assert.ok(raid.rewardTier(5).mult > raid.rewardTier(50).mult);
  assert.strictEqual(raid.rewardTier(1).tier, 'mvp');
  assert.strictEqual(raid.rewardTier(50).tier, 'participant');
});

test('raid: thưởng khi KHÔNG hạ được boss phải thấp hơn rõ rệt', () => {
  // Đã từng trả 100% dù boss còn sống → cả server "đánh cho có" vẫn nhận
  // nguyên thưởng, thanh máu chung thành vô nghĩa.
  const uid = freshPlayer({ level: 5 });
  const r = resetRaid();
  raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  const res = raid.settleRewards(raid.getCurrentRaid().id);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.defeated, false);
  assert.ok(res.defeatMult < 1, 'hệ số thưởng khi không hạ boss phải < 1');
  const granted = res.granted.find(g => g.user_id === uid);
  assert.ok(granted, 'người tham gia vẫn phải có thưởng (không ra về tay trắng)');
  assert.deepStrictEqual(granted.items, [], 'không hạ boss thì không có vật phẩm');
});

test('raid: hạ được boss thì thưởng đầy đủ + có vật phẩm', () => {
  const { uids, died } = teamKillBoss([40, 40, 40]);
  const uid = uids[0];
  const fin = raid.getCurrentRaid();
  assert.strictEqual(died && fin.defeated, true);
  const res = raid.settleRewards(fin.id);
  assert.strictEqual(res.defeated, true);
  assert.strictEqual(res.defeatMult, 1);
  const granted = res.granted.find(g => g.user_id === uid);
  assert.ok(granted.items.length > 0, 'hạ boss phải có vật phẩm');
  // Vật phẩm thật sự vào inventory
  const inv = db.prepare('SELECT item_id FROM inventory WHERE user_id = ? AND qty > 0').all(uid);
  assert.ok(inv.length > 0, 'vật phẩm phải được thêm vào túi');
});

test('raid: settleRewards idempotent — gọi 2 lần không nhân đôi thưởng', () => {
  // Background job chạy mỗi giờ; nếu không idempotent thì thưởng sẽ nhân lên.
  const uid = freshPlayer({ level: 10 });
  const r = resetRaid();
  raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  const first = raid.settleRewards(raid.getCurrentRaid().id);
  assert.strictEqual(first.ok, true);
  const goldAfterFirst = player.getPlayer(uid).gold;

  const second = raid.settleRewards(raid.getCurrentRaid().id);
  assert.strictEqual(second.ok, false, 'lần 2 phải bị chặn');
  assert.strictEqual(second.reason, 'already_settled');
  assert.strictEqual(player.getPlayer(uid).gold, goldAfterFirst, 'vàng không được tăng thêm');
});

test('raid: settleExpired chốt các tuần đã qua', () => {
  const uid = freshPlayer({ level: 10 });
  const r = resetRaid();
  raid.attack(raid.getCurrentRaid(), player.getPlayer(uid), { now: Date.now() });
  // Đẩy tuần này về quá khứ
  db.prepare('UPDATE raid_bosses SET ends_at = ? WHERE id = ?').run(Date.now() - 1000, r.id);
  const results = raid.settleExpired();
  assert.ok(results.length >= 1, 'phải chốt được ít nhất 1 tuần');
  const mine = results.find(x => x.week === r.week);
  assert.ok(mine && mine.ok, 'tuần của mình phải được chốt');
});

// ── Lệnh ─────────────────────────────────────────────────────────────────────
test('raid: lệnh trả lỗi rõ ràng khi chưa có nhân vật', async () => {
  const msg = fakeMessage('CHUA_CO_NHAN_VAT');
  await cmd.execute(msg, []);
  assert.match(msg._text(), /start/);
});

test('raid: %raid hiển thị máu, lượt, và gợi ý đánh', async () => {
  const uid = freshPlayer({ level: 20 });
  const msg = fakeMessage(uid);
  await cmd.execute(msg, []);
  const txt = msg._text();
  assert.match(txt, /HP/);
  assert.match(txt, /Lượt của bạn/);
  assert.ok(raid.BOSS_POOL.some(b => txt.includes(b.name)), 'phải hiện tên boss');
});

test('raid: chặn người chưa đủ level', async () => {
  const uid = freshPlayer({ level: 1 });
  const r = resetRaid();
  // Ép boss hiện tại có minLevel cao để test nhánh chặn
  const hard = raid.BOSS_POOL[raid.BOSS_POOL.length - 1];
  db.prepare('UPDATE raid_bosses SET boss_id = ?, hp_total = ? WHERE id = ?')
    .run(hard.id, 999999, r.id);
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['danh']);
  assert.match(msg._text(), /yêu cầu Lv\./, `phải báo thiếu level: ${msg._text()}`);
  assert.strictEqual(raid.attacksUsed(r.id, uid), 0, 'không được tính lượt');
});
