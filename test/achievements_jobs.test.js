// Test cho thành tựu nghề (mining / fishing / foraging / cooking / crafting).
//
// Khoá các yêu cầu:
//   1. Seed đủ và idempotent: 10 mốc theo nghề + 2 mốc "mọi nghề" + 2 mốc
//      chế tác, mọi target_id phải là nghề CÓ THẬT trong JOB_TYPES.
//   2. `job_level` mở đúng mốc, không mở sớm, không mở nhầm nghề khác.
//   3. `job_all_level` đòi MỌI nghề — thiếu một nghề thì không mở.
//   4. `craft_total` đếm theo số món và mở đúng món thứ N (không trễ 1 nhịp).
//   5. addJobXp tự check khi lên cấp và trả về danh sách vừa mở.
//   6. Người chơi THẤY thông báo: %mine/%gather in "Thành tựu mới" ngay khi mở.
//   7. Thưởng (điểm + vàng) thật sự được cộng.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, jobs, ach, achCmd, mineCmd, gatherCmd, gz, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  jobs = require(`${ROOT}/src/game/jobs`);
  ach = require(`${ROOT}/src/game/achievements`);
  achCmd = require(`${ROOT}/src/commands/achievement`);
  mineCmd = require(`${ROOT}/src/commands/mine`);
  gatherCmd = require(`${ROOT}/src/commands/gather`);
  gz = require(`${ROOT}/src/game/gather_zones`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (level) => {
  const uid = `ACH${++seq}`;
  player.createPlayer(uid, `a${seq}`);
  if (level) player.updatePlayer(uid, { level });
  return uid;
};
const setJobLevel = (uid, job, level, xp = 0) => jobs.updateJob(uid, job, { level, xp });

// ─────────────────────────────────────────────────────────────
// 1. Seed
// ─────────────────────────────────────────────────────────────
test('seed thành tựu nghề: đủ mốc và đúng nghề có thật', () => {
  const jobAchs = db.prepare("SELECT * FROM achievements WHERE objective = 'job_level'").all();
  assert.strictEqual(jobAchs.length, 10, `có ${jobAchs.length} mốc job_level, cần 10 (5 nghề × 2)`);

  for (const a of jobAchs) {
    assert.ok(jobs.JOB_INFO[a.target_id], `${a.id} trỏ tới nghề không tồn tại: ${a.target_id}`);
    assert.ok(a.desc && a.desc.trim().length > 0, `${a.id} thiếu mô tả`);
    assert.ok(a.target_qty > 0);
  }
  // Mỗi nghề phải có ít nhất 2 mốc — nghề nào bị bỏ quên thì test này bắt
  for (const j of jobs.JOB_TYPES) {
    const n = jobAchs.filter(a => a.target_id === j).length;
    assert.ok(n >= 2, `nghề ${j} chỉ có ${n} thành tựu`);
  }

  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM achievements WHERE objective='job_all_level'").get().c, 2);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM achievements WHERE objective='craft_total'").get().c, 2);
});

test('seed idempotent: migrate lại không nhân đôi thành tựu', () => {
  const before = db.prepare('SELECT COUNT(*) c FROM achievements').get().c;
  ach.migrate();
  ach.migrate();
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM achievements').get().c, before);
});

// ─────────────────────────────────────────────────────────────
// 2. job_level
// ─────────────────────────────────────────────────────────────
test('job_level: mở đúng mốc, không mở sớm', () => {
  const uid = newPlayer();
  setJobLevel(uid, 'mining', 9);
  let granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(!granted.includes('job_mining_10'), 'mở job_mining_10 khi mới Lv.9');

  setJobLevel(uid, 'mining', 10);
  granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(granted.includes('job_mining_10'), 'Lv.10 mà không mở Pit Boss');
  assert.ok(!granted.includes('job_mining_25'), 'mở mốc Lv.25 khi mới Lv.10');

  setJobLevel(uid, 'mining', 25);
  granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(granted.includes('job_mining_25'), 'Lv.25 mà không mở Deep Delver');
});

test('job_level: nghề khác không mở nhầm', () => {
  const uid = newPlayer();
  setJobLevel(uid, 'fishing', 25);
  const granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(granted.includes('job_fishing_25'));
  assert.ok(!granted.includes('job_mining_25'), 'câu cá Lv.25 lại mở thành tựu đào mỏ');
  assert.ok(!granted.includes('job_all_10'), 'chỉ 1 nghề mà mở "mọi nghề"');
});

// ─────────────────────────────────────────────────────────────
// 3. job_all_level
// ─────────────────────────────────────────────────────────────
test('job_all_level: đòi MỌI nghề, thiếu một nghề là không mở', () => {
  const uid = newPlayer();
  for (const j of jobs.JOB_TYPES) setJobLevel(uid, j, 10);
  setJobLevel(uid, 'cooking', 3);            // tụt 1 nghề xuống
  let granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(!granted.includes('job_all_10'), 'thiếu cooking Lv.10 mà vẫn mở Jack of All Trades');

  setJobLevel(uid, 'cooking', 10);
  granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(granted.includes('job_all_10'), 'đủ 5 nghề Lv.10 mà không mở');

  // job_all_25 chưa mở vì chỉ mới Lv.10
  assert.ok(!ach.hasUnlocked(uid, 'job_all_25'));
});

test('job_all_level: nghề chưa từng chạm (không có row) tính là Lv.0', () => {
  const uid = newPlayer();
  setJobLevel(uid, 'mining', 10);
  setJobLevel(uid, 'fishing', 10);
  // 3 nghề còn lại chưa có row player_jobs
  const granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(!granted.includes('job_all_10'), 'nghề chưa chạm phải tính là Lv.0');
});

// ─────────────────────────────────────────────────────────────
// 4. craft_total
// ─────────────────────────────────────────────────────────────
test('craft_total: đếm số món, cộng dồn qua nhiều lần chế', () => {
  const uid = newPlayer();
  ach.trackCraft(uid, 60);
  assert.ok(!ach.checkAndGrant(uid).map(a => a.id).includes('craft_100'), 'mới 60 món đã mở Artisan');

  ach.trackCraft(uid, 40);
  assert.strictEqual(ach.getPlayerStats(uid).total_crafts, 100);
  const granted = ach.checkAndGrant(uid).map(a => a.id);
  assert.ok(granted.includes('craft_100'), 'đúng 100 món mà không mở Artisan');
  assert.ok(!granted.includes('craft_500'));
});

test('craft_total: bỏ qua số lượng âm/0', () => {
  const uid = newPlayer();
  ach.trackCraft(uid, 0);
  ach.trackCraft(uid, -5);
  assert.strictEqual(ach.getPlayerStats(uid).total_crafts, 0);
});

// ─────────────────────────────────────────────────────────────
// 5. addJobXp tự check
// ─────────────────────────────────────────────────────────────
test('addJobXp lên cấp thì tự check và trả về thành tựu vừa mở', () => {
  const uid = newPlayer();
  // Đặt sát mốc Lv.10: xp còn thiếu 1
  setJobLevel(uid, 'mining', 9, jobs.xpToNext(9) - 1);
  const res = jobs.addJobXp(uid, 'mining', 10);
  assert.strictEqual(res.level, 10);
  const unlocked = (res.achievements || []).map(a => a.id);
  assert.ok(unlocked.includes('job_mining_10'), `addJobXp không trả về thành tựu: ${unlocked}`);
});

test('addJobXp không lên cấp thì không tốn công check', () => {
  const uid = newPlayer();
  const res = jobs.addJobXp(uid, 'mining', 1);
  assert.deepStrictEqual(res.achievements, []);
});

// ─────────────────────────────────────────────────────────────
// 6. Người chơi thấy thông báo trong lệnh
// ─────────────────────────────────────────────────────────────
test('%mine hiện "Thành tựu mới" đúng lúc lên Lv.10', async () => {
  const uid = newPlayer(20);          // pickaxe cần level
  // %mine yêu cầu có pickaxe trong túi
  const pick = db.prepare("SELECT id FROM items WHERE weapon_type='pickaxe' ORDER BY min_level LIMIT 1").get();
  player.addItem(uid, pick.id, 1);
  setJobLevel(uid, 'mining', 9, jobs.xpToNext(9) - 1);
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const m = fakeMessage(uid);
    await mineCmd.execute(m, [], '%');
    const t = out(m) || (m._out || []).join('\n');
    assert.match(t, /Lv\.UP/, `%mine không báo lên cấp:\n${t}`);
    assert.match(t, /Thành tựu mới/, `%mine không báo thành tựu:\n${t}`);
    assert.match(t, /Pit Boss/);
  } finally {
    Math.random = realRandom;
  }
  assert.ok(ach.hasUnlocked(uid, 'job_mining_10'));
});

test('%gather cũng báo thành tựu nghề (không chỉ mine)', async () => {
  const uid = newPlayer();
  setJobLevel(uid, 'foraging', 9, jobs.xpToNext(9) - 1);
  const zone = gz.getZonesByJob('foraging')[0];
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const m = fakeMessage(uid);
    await gatherCmd.execute(m, [zone.id], '%');
    const t = out(m);
    assert.match(t, /Thành tựu mới/, `%gather không báo thành tựu:\n${t}`);
    assert.match(t, /Green Thumb/);
  } finally {
    Math.random = realRandom;
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Thưởng thật
// ─────────────────────────────────────────────────────────────
test('mở thành tựu nghề được cộng điểm + vàng như thành tựu khác', () => {
  const uid = newPlayer();
  const def = ach.getAchievement('job_mining_10');
  const goldBefore = db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
  setJobLevel(uid, 'mining', 10);
  // Thưởng vàng/XP chỉ được cấp khi có context (applyRewardsAndNotify)
  ach.checkAndGrant(uid, { client: null, guildId: null });

  const stats = ach.getPlayerStats(uid);
  assert.strictEqual(stats.ach_points, def.points, 'không cộng điểm thành tựu');
  const goldAfter = db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
  assert.strictEqual(goldAfter - goldBefore, def.reward_gold, 'không cộng vàng thưởng');
});

// ─────────────────────────────────────────────────────────────
// 8. Hiển thị
// ─────────────────────────────────────────────────────────────
test('%ach list có thành tựu nghề và trạng thái mở khoá', () => {
  const uid = newPlayer();
  setJobLevel(uid, 'mining', 10);
  ach.checkAndGrant(uid);

  // %ach list nay phân trang → quét MỌI trang (yêu cầu: không mất thành tựu nào)
  const all = require(`${ROOT}/src/game/achievements`).getAllAchievements();
  const userAch = new Set(require(`${ROOT}/src/game/achievements`).getPlayerAchievements(uid).map(a => a.id));
  let text = '';
  for (let page = 0; page < 20; page++) {
    let payload = null;
    achCmd.renderAchList({ userId: uid, page, all, userAch, hiddenCount: 0, replyFn: (p) => { payload = p; } });
    const d = payload.embeds[0].data;
    text += (d.description || '') + '\n';
    const m = /Trang (\d+)\/(\d+)/.exec(d.footer?.text || '');
    if (!m || Number(m[1]) >= Number(m[2])) break;
  }
  assert.match(text, /Pit Boss/, 'không thấy thành tựu nghề trong %ach list');
  assert.match(text, /Deep Delver/);
  assert.match(text, /Grand Artisan/);
});

test('%achdebug giải thích được vì sao thành tựu nghề chưa mở', () => {
  const uid = newPlayer();
  setJobLevel(uid, 'mining', 4);
  const debugCmd = require(`${ROOT}/src/commands/achdebug`);
  const m = fakeMessage(uid);
  debugCmd.execute(m, ['job_mining_25'], '%');
  const t = out(m);
  assert.match(t, /Lv\.4/, `%achdebug không hiện cấp nghề hiện tại:\n${t}`);
  assert.match(t, /25/);
});

// ─────────────────────────────────────────────────────────────
// 9. Admin tạo được thành tựu nghề
// ─────────────────────────────────────────────────────────────
test('%ach admin create nhận obj=job_level và từ chối nghề không tồn tại', async () => {
  const uid = 'ADMIN1';
  const bad = fakeMessage(uid, { ownerId: uid });
  bad.content = '%ach admin create job_bad_1 name="Bad" obj=job_level target=astrology qty=5';
  await achCmd.execute(bad, ['admin', 'create', 'job_bad_1', 'name="Bad"', 'obj=job_level', 'target=astrology', 'qty=5'], '%');
  assert.match(out(bad), /không tồn tại/, out(bad));

  const ok = fakeMessage(uid, { ownerId: uid });
  ok.content = '%ach admin create job_test_mine name="Test Miner" obj=job_level target=mining qty=3 points=5';
  await achCmd.execute(ok, ['admin', 'create', 'job_test_mine', 'name="Test Miner"', 'obj=job_level', 'target=mining', 'qty=3', 'points=5'], '%');
  const created = ach.getAchievement('job_test_mine');
  assert.ok(created, `không tạo được thành tựu: ${out(ok)}`);
  assert.strictEqual(created.objective, 'job_level');
  assert.strictEqual(created.target_id, 'mining');
});

test('%cook thật cộng bộ đếm craft_total (không chỉ trackCraft trực tiếp)', async () => {
  const uid = newPlayer(50);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='cook' ORDER BY min_job_level LIMIT 1").get();
  for (const inp of JSON.parse(recipe.inputs)) player.addItem(uid, inp.item_id, inp.qty);
  const craft = require(`${ROOT}/src/commands/craft`);
  const before = ach.getPlayerStats(uid).total_crafts;
  await craft.cook.execute(fakeMessage(uid), [recipe.id], '%');
  assert.strictEqual(ach.getPlayerStats(uid).total_crafts, before + recipe.output_qty,
    '%cook không cộng bộ đếm craft_total');
});
