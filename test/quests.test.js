// Test cho 4 objective quest mới + 2 ngõ cụt nội dung (request #8).
//
// Khoá các yêu cầu:
//   1. KHÔNG còn nội dung chết: class_token_melee/magic/ranged phải có nguồn
//      rơi thật (nếu không, mở class #2 là bất khả thi), potion_astral phải
//      bán ở shop đúng giá trong bảng cân bằng.
//   2. Quest objective gather / craft / job_level / boss cộng tiến độ đúng,
//      đúng bộ lọc target và KHÔNG cộng nhầm (quái thường ≠ boss).
//   3. Quest kiểu trạng thái (level / job_level / item) không bị kẹt 0 khi
//      điều kiện đã đạt TRƯỚC lúc nhận quest.
//   4. Daily quest có phát nội dung nghề (gather/craft) và chỉ phát boss quest
//      khi người chơi đủ cấp.
//   5. Claim bằng lệnh %quest chạy thật với objective mới (end-to-end).
//   6. Seed idempotent: migrate chạy lại không nhân đôi drop.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, jobs, quests, questCmd, craft, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  jobs = require(`${ROOT}/src/game/jobs`);
  quests = require(`${ROOT}/src/game/quests`);
  questCmd = require(`${ROOT}/src/commands/quest`);
  craft = require(`${ROOT}/src/commands/craft`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (level) => {
  const uid = `QST${++seq}`;
  player.createPlayer(uid, `q${seq}`);
  if (level) player.updatePlayer(uid, { level });
  return uid;
};
let qseq = 0;
const customQuest = (objective, target_id, qty) => {
  const id = `t_q_${++qseq}`;
  quests.createQuest({
    id, type: 'custom', name: `Test ${objective}`, desc: 'test',
    objective, target_id: target_id || '', target_qty: qty,
    reward_gold: 100, reward_xp: 20, created_by: 'system',
  });
  return id;
};
const progressOf = (uid, qid) => quests.getPlayerQuest(uid, qid).progress;

// ─────────────────────────────────────────────────────────────
// 1. Ngõ cụt: class token + potion_astral
// ─────────────────────────────────────────────────────────────
test('class_token_* rơi từ boss thật (mở class #2 phải làm được)', () => {
  for (const tokenId of ['class_token_melee', 'class_token_ranged', 'class_token_magic']) {
    const drops = db.prepare(`
      SELECT md.monster_id, md.chance, m.elite_tier
      FROM monster_drops md JOIN monsters m ON m.id = md.monster_id
      WHERE md.item_id = ?`).all(tokenId);
    assert.ok(drops.length > 0, `${tokenId} vẫn là nội dung chết: không có nguồn rơi`);
    // Chỉ boss (elite_tier = 2) mới rơi token — không farm được từ quái thường.
    for (const d of drops) {
      assert.strictEqual(d.elite_tier, 2, `${tokenId} rơi từ ${d.monster_id} (tier ${d.elite_tier}), phải là boss`);
      assert.ok(d.chance > 0 && d.chance <= 1, `${tokenId} chance vô lý: ${d.chance}`);
    }
  }
});

test('mỗi class token có đúng 1 nguồn boss, và đủ 3 class mở được', () => {
  const classes = require(`${ROOT}/src/game/classes`);
  const tokens = ['class_token_melee', 'class_token_ranged', 'class_token_magic'];
  for (const t of tokens) {
    const n = db.prepare('SELECT COUNT(DISTINCT monster_id) c FROM monster_drops WHERE item_id=?').get(t).c;
    assert.strictEqual(n, 1, `${t} nên có đúng 1 nguồn boss, đang có ${n}`);
  }
  // Item token phải tồn tại trong bảng items để %inv/%trade hiển thị được.
  for (const t of tokens) {
    assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(t), `thiếu item ${t}`);
  }
  assert.ok(classes, 'module classes phải load được');
});

test('potion_astral bán ở shop đúng giá bảng cân bằng (1400)', () => {
  const row = db.prepare(`
    SELECT s.price shop_price, i.price item_price, i.heal_pct
    FROM shop s JOIN items i ON i.id = s.item_id
    WHERE s.item_id = 'potion_astral'`).get();
  assert.ok(row, 'potion_astral vẫn không bán ở đâu — nội dung chết');
  assert.strictEqual(row.shop_price, 1400, `shop bán ${row.shop_price}, bảng cân bằng ghi 1400`);
  assert.strictEqual(row.heal_pct, 85);
});

test('seed class token idempotent: chạy migrate lại không nhân đôi drop', () => {
  const before = db.prepare('SELECT COUNT(*) c FROM monster_drops WHERE item_id LIKE ?').get('class_token_%').c;
  const cts = require(`${ROOT}/src/game/class_token_sources`);
  cts.migrate();
  cts.migrate();
  const after = db.prepare('SELECT COUNT(*) c FROM monster_drops WHERE item_id LIKE ?').get('class_token_%').c;
  assert.strictEqual(after, before, 'migrate lặp lại làm nhân đôi drop token');
});

// ─────────────────────────────────────────────────────────────
// 2. Objective mới: cộng tiến độ đúng
// ─────────────────────────────────────────────────────────────
test('quest gather: cộng theo số nguyên liệu, target rỗng = mọi nghề', () => {
  const uid = newPlayer();
  const qid = customQuest('gather', '', 10);
  quests.assignQuest(uid, qid);

  quests.onGather(uid, 'mining', 3);
  assert.strictEqual(progressOf(uid, qid), 3);
  quests.onGather(uid, 'foraging', 4);
  assert.strictEqual(progressOf(uid, qid), 7, 'nghề khác vẫn phải tính khi target rỗng');

  // Không vượt quá target_qty
  quests.onGather(uid, 'fishing', 50);
  assert.strictEqual(progressOf(uid, qid), 10);
});

test('quest gather: target cụ thể chỉ tính đúng nghề đó', () => {
  const uid = newPlayer();
  const qid = customQuest('gather', 'fishing', 5);
  quests.assignQuest(uid, qid);

  quests.onGather(uid, 'mining', 4);
  assert.strictEqual(progressOf(uid, qid), 0, 'đào mỏ không được tính cho quest câu cá');
  quests.onGather(uid, 'fishing', 2);
  assert.strictEqual(progressOf(uid, qid), 2);
});

test('quest craft: tính theo số món và lọc theo recipe', () => {
  const uid = newPlayer();
  const anyId = customQuest('craft', '', 5);
  const specificId = customQuest('craft', 'potion_s', 2);
  quests.assignQuest(uid, anyId);
  quests.assignQuest(uid, specificId);

  quests.onCraft(uid, 'herb_salve', 2);
  assert.strictEqual(progressOf(uid, anyId), 2);
  assert.strictEqual(progressOf(uid, specificId), 0, 'recipe khác không được tính');

  quests.onCraft(uid, 'potion_s', 3);
  assert.strictEqual(progressOf(uid, anyId), 5);
  assert.strictEqual(progressOf(uid, specificId), 2, 'phải cap ở target_qty');
});

test('quest boss: quái thường KHÔNG tính, elite/boss mới tính', () => {
  const uid = newPlayer();
  const qid = customQuest('boss', '', 1);
  quests.assignQuest(uid, qid);

  quests.onKillBoss(uid, 'slime', 0);
  assert.strictEqual(progressOf(uid, qid), 0, 'hạ slime không được tính là hạ boss');

  quests.onKillBoss(uid, 'boss_wyrm', 2);
  assert.strictEqual(progressOf(uid, qid), 1);
});

test('quest boss: target cụ thể chỉ tính đúng con đó', () => {
  const uid = newPlayer();
  const qid = customQuest('boss', 'boss_void_lord', 1);
  quests.assignQuest(uid, qid);

  quests.onKillBoss(uid, 'boss_wyrm', 2);
  assert.strictEqual(progressOf(uid, qid), 0);
  quests.onKillBoss(uid, 'boss_void_lord', 2);
  assert.strictEqual(progressOf(uid, qid), 1);
});

test('quest đã claim không nhận thêm tiến độ', () => {
  const uid = newPlayer();
  const qid = customQuest('gather', '', 2);
  quests.assignQuest(uid, qid);
  quests.onGather(uid, 'mining', 2);
  quests.markClaimed(uid, qid);
  quests.onGather(uid, 'mining', 5);
  assert.strictEqual(progressOf(uid, qid), 2, 'quest đã claim bị cộng lại');
});

// ─────────────────────────────────────────────────────────────
// 3. Quest dạng trạng thái không được kẹt 0
// ─────────────────────────────────────────────────────────────
test('refreshStateQuests: nhận quest level SAU khi đã lên cấp vẫn hoàn thành được', () => {
  const uid = newPlayer(12);
  const qid = customQuest('level', '', 10);
  quests.assignQuest(uid, qid);
  assert.strictEqual(progressOf(uid, qid), 0);

  quests.refreshStateQuests(uid);
  assert.strictEqual(progressOf(uid, qid), 10, 'đã Lv.12 mà quest "đạt Lv.10" kẹt 0');
});

test('refreshStateQuests: quest job_level lấy đúng cấp nghề hiện tại', () => {
  const uid = newPlayer();
  const qid = customQuest('job_level', 'mining', 3);
  quests.assignQuest(uid, qid);

  // Đẩy mining lên Lv.3
  for (let i = 0; i < 20 && jobs.getJob(uid, 'mining').level < 3; i++) {
    jobs.addJobXp(uid, 'mining', 500);
  }
  assert.ok(jobs.getJob(uid, 'mining').level >= 3);

  quests.refreshStateQuests(uid);
  assert.strictEqual(progressOf(uid, qid), 3);

  // Nghề khác không ảnh hưởng
  const uid2 = newPlayer();
  const qid2 = customQuest('job_level', 'fishing', 3);
  quests.assignQuest(uid2, qid2);
  quests.refreshStateQuests(uid2);
  assert.strictEqual(progressOf(uid2, qid2), 0);
});

test('refreshStateQuests: quest item tính theo số lượng trong túi', () => {
  const uid = newPlayer();
  const qid = customQuest('item', 'potion_s', 3);
  quests.assignQuest(uid, qid);
  player.addItem(uid, 'potion_s', 2);
  quests.refreshStateQuests(uid);
  assert.strictEqual(progressOf(uid, qid), 2);
  player.addItem(uid, 'potion_s', 5);
  quests.refreshStateQuests(uid);
  assert.strictEqual(progressOf(uid, qid), 3, 'phải cap ở target_qty');
});

test('refreshStateQuests: không đụng quest đã claim', () => {
  const uid = newPlayer(20);
  const qid = customQuest('level', '', 10);
  quests.assignQuest(uid, qid);
  quests.markClaimed(uid, qid);
  quests.refreshStateQuests(uid);
  assert.strictEqual(progressOf(uid, qid), 0);
});

// ─────────────────────────────────────────────────────────────
// 4. Daily quest phát nội dung nghề
// ─────────────────────────────────────────────────────────────
test('daily quest có template gather + craft, boss chỉ khi đủ cấp', () => {
  // Bơm 400 người chơi để thống kê phân phối template (random 3/… mỗi ngày)
  const seen = new Set();
  const lowUid = newPlayer(1);
  for (let i = 0; i < 400; i++) {
    const uid = `DL${i}`;
    player.createPlayer(uid, `d${i}`);
    quests.generateDailyQuests(uid, 1);
    for (const pq of quests.getPlayerQuests(uid)) {
      if (pq.type === 'daily') seen.add(pq.objective);
    }
  }
  assert.ok(seen.has('gather'), 'daily không bao giờ có quest gather');
  assert.ok(seen.has('craft'), 'daily không bao giờ có quest craft');
  assert.ok(!seen.has('boss'), 'phát quest boss cho người Lv.1 (bất khả thi)');

  // Lv.20 mới có boss quest
  const seen20 = new Set();
  for (let i = 0; i < 400; i++) {
    const uid = `DH${i}`;
    player.createPlayer(uid, `h${i}`);
    quests.generateDailyQuests(uid, 20);
    for (const pq of quests.getPlayerQuests(uid)) {
      if (pq.type === 'daily') seen20.add(pq.objective);
    }
  }
  assert.ok(seen20.has('boss'), 'người chơi Lv.20 không bao giờ nhận quest boss');
  assert.ok(lowUid);
});

// ─────────────────────────────────────────────────────────────
// 5. %quest end-to-end với objective mới
// ─────────────────────────────────────────────────────────────
test('%quest claim trả thưởng cho quest job_level đã đạt từ trước', async () => {
  const uid = newPlayer();
  for (let i = 0; i < 20 && jobs.getJob(uid, 'fishing').level < 2; i++) {
    jobs.addJobXp(uid, 'fishing', 500);
  }
  const qid = customQuest('job_level', 'fishing', 2);
  quests.assignQuest(uid, qid);

  const goldBefore = db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
  const msg = fakeMessage(uid);
  await questCmd.execute(msg, ['claim', qid], '%');
  assert.match(out(msg), /Đã nhận thưởng/);
  assert.strictEqual(quests.getPlayerQuest(uid, qid).claimed, 1);
  assert.ok(db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold > goldBefore);
});

test('%quest claim từ chối quest gather chưa xong', async () => {
  const uid = newPlayer();
  const qid = customQuest('gather', '', 10);
  quests.assignQuest(uid, qid);
  quests.onGather(uid, 'mining', 4);

  const msg = fakeMessage(uid);
  await questCmd.execute(msg, ['claim', qid], '%');
  assert.match(out(msg), /chưa hoàn thành/);
  assert.strictEqual(quests.getPlayerQuest(uid, qid).claimed, 0);
});

test('%quest hiển thị tên nghề/recipe thay vì id thô', () => {
  const uid = newPlayer();
  quests.assignQuest(uid, customQuest('gather', 'mining', 5));
  quests.assignQuest(uid, customQuest('craft', '', 2));
  quests.assignQuest(uid, customQuest('job_level', 'foraging', 3));
  quests.assignQuest(uid, customQuest('boss', '', 1));

  const msg = fakeMessage(uid);
  questCmd.execute(msg, [], '%');
  const text = out(msg);
  assert.match(text, /Thu hoạch 5 ⛏️ Mining/, `không thấy tên nghề:\n${text}`);
  assert.match(text, /Chế hoặc nấu 2 món/);
  assert.match(text, /Đạt 🌿 Foraging Lv\.3/);
  assert.match(text, /Hạ 1 elite\/boss/);
});

// ─────────────────────────────────────────────────────────────
// 6. Hook thật trong lệnh craft/gather (không chỉ unit-test hàm)
// ─────────────────────────────────────────────────────────────
test('%cook thật sự cộng tiến độ quest craft', async () => {
  const uid = newPlayer();
  const qid = customQuest('craft', '', 1);
  quests.assignQuest(uid, qid);
  // Nguyên liệu cho herb_salve
  const recipe = db.prepare("SELECT * FROM recipes WHERE id='herb_salve'").get();
  if (!recipe) return; // seed khác thì bỏ qua, test khác đã phủ logic
  for (const inp of JSON.parse(recipe.inputs)) player.addItem(uid, inp.item_id, inp.qty);

  const msg = fakeMessage(uid);
  await craft.cook(msg, ['herb_salve'], '%');
  assert.strictEqual(progressOf(uid, qid), 1, '%cook không cộng quest craft');
});

test('%gather thật sự cộng tiến độ quest gather (theo số nguyên liệu)', async () => {
  const uid = newPlayer();
  const qid = customQuest('gather', '', 999);
  quests.assignQuest(uid, qid);
  const gather = require(`${ROOT}/src/commands/gather`);
  const gz = require(`${ROOT}/src/game/gather_zones`);
  const zone = gz.getZonesByJob('foraging')[0];

  const realRandom = Math.random;
  Math.random = () => 0;   // ép mọi roll rơi đồ thành công
  try {
    await gather.execute(fakeMessage(uid), [zone.id], '%');
  } finally {
    Math.random = realRandom;
  }

  const gained = db.prepare('SELECT COALESCE(SUM(qty),0) q FROM inventory WHERE user_id=?').get(uid).q;
  const prog = progressOf(uid, qid);
  assert.ok(prog > 0, '%gather không cộng tiến độ quest gather');
  assert.ok(prog <= gained, `tiến độ (${prog}) lớn hơn số nguyên liệu thực nhận (${gained})`);
});

test('%battle: thắng PvE cộng quest kill + gold + boss (trước đây không cộng gì)', async () => {
  const buttons = require(`${ROOT}/src/buttons`);
  assert.strictEqual(typeof buttons.finalizeBattle, 'function', 'chưa export finalizeBattle để test');
  const uid = newPlayer(20);
  const killId = customQuest('kill', '', 1);
  const bossId = customQuest('boss', 'boss_demon_king', 1);
  const goldId = customQuest('gold', '', 1);
  for (const q of [killId, bossId, goldId]) quests.assignQuest(uid, q);

  const battleRow = {
    id: 1, mode: 'pve', user_a: uid, user_b: '', monster_id: 'boss_demon_king',
    is_elite: 2, hp_a: 50, hp_b: 0, max_hp_a: 100, max_hp_b: 1,
    atk_a: 10, atk_b: 1, def_a: 1, def_b: 1, winner: 'a',
  };
  const interaction = { update: async () => ({}), user: { id: uid } };
  const realRandom = Math.random;
  Math.random = () => 0.99;   // không rơi đồ để test không phụ thuộc drop
  try {
    await buttons.finalizeBattle(interaction, battleRow, ['test']);
  } finally {
    Math.random = realRandom;
  }

  assert.strictEqual(progressOf(uid, killId), 1, 'thắng %battle không cộng quest kill');
  assert.strictEqual(progressOf(uid, bossId), 1, 'thắng boss trong %battle không cộng quest boss');
  assert.ok(progressOf(uid, goldId) > 0, 'thắng %battle không cộng quest gold');
});
