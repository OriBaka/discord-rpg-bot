// Test cho hệ thống điểm danh mới (%daily — chu kỳ 30 ngày).
// Chạy: npm test
//
// Ba thứ dễ vỡ nhất và đều đã từng vỡ trong lúc phát triển:
//   1. Chuỗi đứt/không đứt theo đúng mốc thời gian.
//   2. Ngày 7 tặng vật phẩm theo bậc level (không phải item cố định).
//   3. Chu kỳ 30 ngày quay vòng nhưng streak và kỷ lục vẫn tiếp tục.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, loadCommands, fakeMessage, quiet, loud } = require('./harness');

let db, player, daily, cmd, cmds, userSeq = 0;

function freshPlayer(overrides = {}) {
  const uid = `D${++userSeq}`;
  player.createPlayer(uid, `d${userSeq}`);
  if (Object.keys(overrides).length) player.updatePlayer(uid, overrides);
  return uid;
}

// Lùi mốc last_daily về quá khứ để giả lập "đã N giờ trôi qua"
function rewind(uid, hours) {
  db.prepare('UPDATE players SET last_daily = last_daily - ? WHERE user_id = ?')
    .run(Math.round(hours * 3600 * 1000), uid);
}

// Điểm danh 1 lần, trả về text đã trả lời
async function claim(uid) {
  const msg = fakeMessage(uid);
  await cmd.execute(msg, []);
  return msg._text();
}

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  daily = require(`${ROOT}/src/game/daily`);
  cmds = loadCommands();
  cmd = cmds.get('daily');
  loud();
  assert.ok(cmd, 'phải load được lệnh daily');
});

// ── Schema ───────────────────────────────────────────────────────────────────
test('daily: migration thêm đủ 3 cột chuỗi', () => {
  const cols = db.prepare('PRAGMA table_info(players)').all().map(c => c.name);
  for (const c of ['daily_streak', 'daily_total', 'daily_best']) {
    assert.ok(cols.includes(c), `thiếu cột ${c}`);
  }
});

test('daily: migration idempotent — gọi lại không lỗi', () => {
  assert.doesNotThrow(() => { daily.migrate(); daily.migrate(); });
});

// ── Mốc thời gian ────────────────────────────────────────────────────────────
test('daily: chưa đủ 24h thì không cho điểm danh', async () => {
  const uid = freshPlayer();
  await claim(uid);
  const before = player.getPlayer(uid).gold;
  const txt = await claim(uid);
  assert.ok(/Quay lại sau/.test(txt), `phải báo còn chờ, nhận: ${txt}`);
  assert.strictEqual(player.getPlayer(uid).gold, before, 'không được cộng vàng lần 2');
});

test('daily: đúng 24h thì điểm danh được', async () => {
  const uid = freshPlayer();
  await claim(uid);
  rewind(uid, 24.1);
  const txt = await claim(uid);
  assert.ok(/Ngày 2/.test(txt), `phải là ngày 2, nhận: ${txt}`);
});

test('daily: nghỉ 30h (trong ân hạn 20h) vẫn giữ chuỗi', async () => {
  const uid = freshPlayer();
  await claim(uid);            // ngày 1 → streak 1
  rewind(uid, 30);
  await claim(uid);
  assert.strictEqual(player.getPlayer(uid).daily_streak, 2,
    'trễ 6h so với mốc 24h phải vẫn giữ chuỗi');
});

test('daily: nghỉ 45h (quá 44h) thì đứt chuỗi về 1', async () => {
  const uid = freshPlayer();
  await claim(uid);
  rewind(uid, 25);
  await claim(uid);            // streak 2
  assert.strictEqual(player.getPlayer(uid).daily_streak, 2);
  rewind(uid, 45);             // quá BREAK_MS
  const txt = await claim(uid);
  assert.strictEqual(player.getPlayer(uid).daily_streak, 1, 'chuỗi phải về 1');
  assert.ok(/đứt/.test(txt), `phải báo đứt chuỗi, nhận: ${txt}`);
});

test('daily: getStatus — mốc canClaim/broken chính xác', () => {
  const t0 = 1_700_000_000_000;
  const p = { last_daily: t0, daily_streak: 3 };
  assert.strictEqual(daily.getStatus(p, t0 + 1e6).canClaim, false);
  assert.strictEqual(daily.getStatus(p, t0 + daily.DAY_MS).canClaim, true);
  assert.strictEqual(daily.getStatus(p, t0 + daily.DAY_MS + 1).canClaim, true);
  assert.strictEqual(daily.getStatus(p, t0 + daily.BREAK_MS - 1).broken, false);
  assert.strictEqual(daily.getStatus(p, t0 + daily.BREAK_MS).broken, true);
  // Đứt thì streak hiển thị 0, và ngày tiếp theo là ngày 1
  const b = daily.getStatus(p, t0 + daily.BREAK_MS);
  assert.strictEqual(b.streak, 0);
  assert.strictEqual(b.nextDay, 1);
});

// ── Chu kỳ 30 ngày ────────────────────────────────────────────────────────────
test('daily: ngày 8 tiếp tục chu kỳ 30 ngày, không reset chuỗi', async () => {
  const uid = freshPlayer();
  for (let i = 0; i < 8; i++) {
    await claim(uid);
    rewind(uid, 24.1);
  }
  const p = player.getPlayer(uid);
  assert.strictEqual(p.daily_streak, 8, 'streak liên tiếp phải là 8, không reset');
  assert.strictEqual(p.daily_total, 8);
  assert.strictEqual(p.daily_best, 8);

  // Ngày 8 không quay vòng sớm như chu kỳ 7 ngày cũ.
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['xem']);
  assert.ok(/Đã nhận 8\/30/.test(msg._text()),
    `phải hiện 8/30 của chu kỳ, nhận: ${msg._text().slice(0, 120)}`);
});

test('daily: bảng xem giữ đủ tuần đầu và đánh dấu ngày hiện tại', async () => {
  const uid = freshPlayer({ level: 12 });
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['xem']);
  const txt = msg._text();
  for (let d = 1; d <= 7; d++) {
    assert.ok(new RegExp(`Ngày ${d}\\b`).test(txt), `bảng thiếu ngày ${d}`);
  }
  assert.ok(txt.includes('👉'), 'phải đánh dấu ngày tiếp theo');
  assert.ok(/Điểm danh 30 ngày/.test(txt));
});

test('daily: xem bảng KHÔNG điểm danh (không đổi state)', async () => {
  const uid = freshPlayer();
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['xem']);
  const p = player.getPlayer(uid);
  assert.strictEqual(p.last_daily, 0, 'xem không được set last_daily');
  assert.strictEqual(p.daily_total, 0);
});

// ── Phần thưởng ──────────────────────────────────────────────────────────────
test('daily: thưởng tăng dần qua 7 ngày', async () => {
  const uid = freshPlayer({ level: 20 });
  const golds = [];
  for (let i = 0; i < 7; i++) {
    const before = player.getPlayer(uid).gold;
    await claim(uid);
    golds.push(player.getPlayer(uid).gold - before);
    rewind(uid, 24.1);
  }
  for (let i = 1; i < golds.length; i++) {
    assert.ok(golds[i] >= golds[i - 1],
      `ngày ${i + 1} (${golds[i]}) phải >= ngày ${i} (${golds[i - 1]})`);
  }
  assert.ok(golds[6] > golds[0] * 2,
    `ngày 7 phải thưởng hơn gấp đôi ngày 1: ${golds[0]} → ${golds[6]}`);
});

test('daily: ngày 7 tặng vật phẩm, và đúng bậc theo level', async () => {
  const low = freshPlayer({ level: 5 });
  const high = freshPlayer({ level: 45 });
  for (const uid of [low, high]) {
    for (let i = 0; i < 7; i++) { await claim(uid); rewind(uid, 24.1); }
  }
  const inv = (uid) => db.prepare('SELECT item_id FROM inventory WHERE user_id = ? AND qty > 0')
    .all(uid).map(r => r.item_id);
  const lowInv = inv(low), highInv = inv(high);
  assert.ok(lowInv.includes(daily.day7Item(5)), `Lv.5 phải nhận ${daily.day7Item(5)}, có: ${lowInv}`);
  assert.ok(highInv.includes(daily.day7Item(45)), `Lv.45 phải nhận ${daily.day7Item(45)}, có: ${highInv}`);
  assert.notStrictEqual(daily.day7Item(5), daily.day7Item(45),
    'bậc thấp và bậc cao phải khác item — nếu giống thì bảng bậc vô dụng');
});

test('daily: ngày lẻ hồi đầy HP khi đang mất máu', async () => {
  const uid = freshPlayer({ level: 10 });
  player.updatePlayer(uid, { hp: 5 });
  await claim(uid);                       // ngày 1 = lẻ → hồi
  const p = player.getPlayer(uid);
  assert.strictEqual(p.hp, p.max_hp, 'ngày 1 phải hồi đầy HP');
});

test('daily: XP được cộng và có thể lên cấp', async () => {
  const uid = freshPlayer({ level: 1, xp: 0 });
  await claim(uid);
  assert.ok(player.getPlayer(uid).xp > 0 || player.getPlayer(uid).level > 1,
    'phải nhận được XP');
});

// ── Cân bằng ─────────────────────────────────────────────────────────────────
test('daily: 7 ngày ≈ 15–30 kill ở zone tương ứng (không phá kinh tế)', () => {
  for (const lv of [1, 10, 20, 30, 40, 50]) {
    const rate = daily.zoneRate(lv);
    const total = daily.REWARDS.slice(0, 7).reduce((a, r) => a + Math.round(rate.gold * r.goldKill), 0);
    const kills = total / rate.gold;
    assert.ok(kills >= 15 && kills <= 30,
      `Lv.${lv}: 7 ngày = ${kills.toFixed(1)} kill (phải trong 15–30)`);
  }
});

test('daily: phần thưởng thích ứng level — Lv.40 nhiều hơn Lv.1', () => {
  const low = daily.zoneRate(1).gold;
  const high = daily.zoneRate(40).gold;
  assert.ok(high > low * 4, `Lv.40 phải thưởng cao hơn hẳn Lv.1: ${low} vs ${high}`);
});

// ── Kỷ lục ───────────────────────────────────────────────────────────────────
test('daily: daily_best giữ kỷ lục kể cả sau khi đứt chuỗi', async () => {
  const uid = freshPlayer();
  for (let i = 0; i < 3; i++) { await claim(uid); rewind(uid, 24.1); }
  assert.strictEqual(player.getPlayer(uid).daily_best, 3);
  rewind(uid, 50);                        // đứt
  await claim(uid);
  const p = player.getPlayer(uid);
  assert.strictEqual(p.daily_streak, 1, 'chuỗi hiện tại về 1');
  assert.strictEqual(p.daily_best, 3, 'kỷ lục phải giữ nguyên 3');
});

test('daily: thông báo LÊN CẤP thực sự hiện khi đủ XP', async () => {
  // Bug từng có: grantReward đọc res.level trong khi addXpAndLevel trả
  // { newLevel } → nhánh thông báo không bao giờ chạy, im lặng mất tính năng.
  const uid = freshPlayer({ level: 1, xp: 0 });
  const before = player.getPlayer(uid).level;
  for (let i = 0; i < 7; i++) {
    const txt = await claim(uid);
    if (player.getPlayer(uid).level > before) {
      assert.ok(/LÊN CẤP/.test(txt), `phải báo lên cấp, nhận: ${txt}`);
      return;
    }
    rewind(uid, 24.1);
  }
  assert.fail('7 ngày điểm danh phải đủ XP để lên ít nhất 1 cấp');
});

test('daily: các mốc 14/21/30 có thưởng và số lượng quà tăng dần, không nhận lặp', async () => {
  for (const [day, count] of [[14, 2], [21, 3], [30, 5]]) {
    const uid = freshPlayer({ level: 25, daily_streak: day - 1, daily_best: day - 1, last_daily: Date.now() - daily.DAY_MS - 1000 });
    const initial = player.getPlayer(uid), rate = daily.zoneRate(initial.level), reward = daily.REWARDS[day - 1];
    const item = daily.day7Item(initial.level);
    const txt = await claim(uid);
    assert.ok(txt.includes(`Ngày ${day}/30`));
    assert.ok(txt.includes(`${count}×`));
    assert.strictEqual(player.getPlayer(uid).gold, initial.gold + Math.round(rate.gold * reward.goldKill));
    assert.strictEqual(player.getPlayer(uid).daily_streak, day);
    const qty = () => db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, item)?.qty || 0;
    assert.strictEqual(qty(), count);
    await claim(uid);
    assert.strictEqual(qty(), count);
    assert.strictEqual(player.getPlayer(uid).daily_streak, day);
  }
  assert.ok(daily.REWARDS[13].goldKill < daily.REWARDS[20].goldKill);
  assert.ok(daily.REWARDS[20].goldKill < daily.REWARDS[29].goldKill);
});

test('daily: qua ngày 30 quay lại ngày 1 nhưng giữ streak, total và best', async () => {
  const uid = freshPlayer({ daily_streak: 29, daily_total: 49, daily_best: 29, last_daily: Date.now() - daily.DAY_MS - 1000 });
  await claim(uid); rewind(uid, 24.1);
  assert.strictEqual(daily.getStatus(player.getPlayer(uid)).nextDay, 1);
  const txt = await claim(uid);
  assert.ok(txt.includes('Ngày 1/30'));
  const p = player.getPlayer(uid);
  assert.strictEqual(p.daily_streak, 31); assert.strictEqual(p.daily_best, 31); assert.strictEqual(p.daily_total, 51);
  const msg = fakeMessage(uid); await cmd.execute(msg, ['xem']);
  assert.ok(msg._text().includes('Đã nhận 1/30'));
});

test('daily: đứt chuỗi trước mốc 14/21/30 trở về ngày 1, không nhận quà mốc', async () => {
  for (const day of [14, 21, 30]) {
    const uid = freshPlayer({ daily_streak: day - 1, daily_best: day - 1, last_daily: Date.now() - daily.BREAK_MS - 1000 });
    const txt = await claim(uid);
    assert.ok(txt.includes('Ngày 1/30'));
    assert.strictEqual(player.getPlayer(uid).daily_streak, 1);
    assert.strictEqual(player.getPlayer(uid).daily_best, day - 1);
    assert.strictEqual(player.getInventory(uid).length, 0);
  }
});

test('daily: bảng đủ 30 ngày, đúng lượng quà và nằm trong giới hạn Discord', async () => {
  const uid = freshPlayer({ level: 99 });
  const msg = fakeMessage(uid); let payload;
  msg.reply = async p => { payload = p; };
  const before = player.getPlayer(uid);
  await cmd.execute(msg, ['xem']);
  const data = payload.embeds[0].data;
  const text = JSON.stringify(data);
  for (let day = 1; day <= 30; day++) assert.ok(text.includes(`Ngày ${day}**`), `thiếu ngày ${day}`);
  assert.ok(text.includes('2×')); assert.ok(text.includes('3×')); assert.ok(text.includes('5×'));
  assert.ok(data.description.length <= 4096);
  assert.ok(data.fields.every(f => f.value.length <= 1024));
  const size = data.title.length + data.description.length + data.footer.text.length + data.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(size <= 6000, `embed size ${size}`);
  assert.deepStrictEqual(player.getPlayer(uid), before);
});

test('daily: lỗi thưởng mốc rollback vàng, XP, quà và tiến độ cùng nhau', async () => {
  const uid = freshPlayer({ level: 25, daily_streak: 29, daily_best: 29, last_daily: Date.now() - daily.DAY_MS - 1000 });
  const before = player.getPlayer(uid), saved = player.addItem;
  player.addItem = () => { throw new Error('daily reward failure'); };
  try { await assert.rejects(() => claim(uid), /daily reward failure/); }
  finally { player.addItem = saved; }
  assert.deepStrictEqual(player.getPlayer(uid), before);
  assert.strictEqual(player.getInventory(uid).length, 0);
  assert.ok((await claim(uid)).includes('Ngày 30/30'));
});
