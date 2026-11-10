// Test cho hệ thống điểm danh mới (%daily — chuỗi 7 ngày).
// Chạy: npm test
//
// Ba thứ dễ vỡ nhất và đều đã từng vỡ trong lúc phát triển:
//   1. Chuỗi đứt/không đứt theo đúng mốc thời gian.
//   2. Ngày 7 tặng vật phẩm theo bậc level (không phải item cố định).
//   3. Streak > 7 vẫn hiển thị đúng "ngày thứ mấy của chu kỳ" — nếu tính sai
//      thì người chơi ngày thứ 8 sẽ thấy "0/7".
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

// ── Chu kỳ 7 ngày ────────────────────────────────────────────────────────────
test('daily: streak > 7 quay vòng đúng về ngày 1 (không ra 0/7)', async () => {
  const uid = freshPlayer();
  for (let i = 0; i < 8; i++) {
    await claim(uid);
    rewind(uid, 24.1);
  }
  const p = player.getPlayer(uid);
  assert.strictEqual(p.daily_streak, 8, 'streak liên tiếp phải là 8, không reset');
  assert.strictEqual(p.daily_total, 8);
  assert.strictEqual(p.daily_best, 8);

  // Bảng phải nói "1/7 ngày của chu kỳ này", không phải "0/7"
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['xem']);
  assert.ok(/Đã nhận 1\/7/.test(msg._text()),
    `phải hiện 1/7 của chu kỳ, nhận: ${msg._text().slice(0, 120)}`);
});

test('daily: bảng xem có đủ 7 ngày và đánh dấu ngày hiện tại', async () => {
  const uid = freshPlayer({ level: 12 });
  const msg = fakeMessage(uid);
  await cmd.execute(msg, ['xem']);
  const txt = msg._text();
  for (let d = 1; d <= 7; d++) {
    assert.ok(new RegExp(`Ngày ${d}\\b`).test(txt), `bảng thiếu ngày ${d}`);
  }
  assert.ok(txt.includes('👉'), 'phải đánh dấu ngày tiếp theo');
  assert.ok(/Điểm danh 7 ngày/.test(txt));
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
    const total = daily.REWARDS.reduce((a, r) => a + Math.round(rate.gold * r.goldKill), 0);
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
