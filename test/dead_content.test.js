// Chống "nội dung chết": vật phẩm tồn tại nhưng không có đường nào để lấy.
//
// Trước đây (audit 2026-11) có 4 món như vậy:
//   class_token_melee / class_token_ranged / class_token_magic
//     → `%class unlock` (mở class thứ 2) chạy đúng code nhưng KHÔNG ai có token,
//       nên cả nhánh class thứ hai là bất khả thi trên server thật.
//   potion_astral (85% max HP, 1400 vàng trong bảng cân bằng)
//     → không shop, không drop, không recipe.
// Test này khoá lại toàn bộ lớp lỗi đó, không chỉ 4 món cụ thể: mọi item phải
// có ít nhất một nguồn, và nguồn phải là nguồn thật (bảng có dữ liệu thật).
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, quiet, loud } = require('./harness');

let db, quests, classes;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  quests = require(`${ROOT}/src/game/quests`);
  classes = require(`${ROOT}/src/game/classes`);
  loud();
});

// Gom mọi nguồn kiếm item trong hệ thống. Thêm nguồn mới (market, event…)
// thì phải thêm vào đây — nếu không test sẽ báo nhầm là nội dung chết.
function collectSources() {
  const src = new Map(); // item_id -> [nguồn]
  const add = (id, where) => {
    if (!id) return;
    if (!src.has(id)) src.set(id, []);
    src.get(id).push(where);
  };

  for (const r of db.prepare('SELECT item_id FROM shop').all()) add(r.item_id, 'shop');
  for (const r of db.prepare('SELECT item_id FROM monster_drops').all()) add(r.item_id, 'monster_drop');
  for (const r of db.prepare('SELECT output_id FROM recipes').all()) add(r.output_id, 'recipe');
  for (const r of db.prepare('SELECT item_id FROM gather_drops').all()) add(r.item_id, 'gather');
  for (const r of db.prepare('SELECT shard_id FROM pet_drops').all()) add(r.shard_id, 'pet');
  for (const r of db.prepare("SELECT reward_id FROM redeem_rewards WHERE reward_type='item'").all()) {
    add(r.reward_id, 'redeem');
  }
  for (const r of db.prepare('SELECT reward_item FROM quests').all()) {
    for (const part of (r.reward_item || '').split(',')) add(part.split(':')[0], 'quest');
  }
  return src;
}

test('KHÔNG có vật phẩm nào không kiếm được', () => {
  const src = collectSources();
  const dead = db.prepare('SELECT id, name, type FROM items ORDER BY id').all()
    .filter(i => !src.has(i.id));
  assert.deepStrictEqual(
    dead.map(d => `${d.id} (${d.type})`), [],
    'vật phẩm không có nguồn nào — người chơi thấy trong %item nhưng không bao giờ lấy được'
  );
});

test('mọi nguồn drop trỏ tới item có thật (không drop rác)', () => {
  const dangling = [];
  for (const r of db.prepare('SELECT monster_id, item_id FROM monster_drops').all()) {
    if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(r.item_id)) {
      dangling.push(`${r.monster_id} → ${r.item_id}`);
    }
  }
  for (const r of db.prepare('SELECT zone_id, item_id FROM gather_drops').all()) {
    if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(r.item_id)) {
      dangling.push(`gather ${r.zone_id} → ${r.item_id}`);
    }
  }
  assert.deepStrictEqual(dangling, [], 'drop trỏ tới item không tồn tại');
});

test('cả 3 class token đều có nguồn rơi và item tương ứng', () => {
  for (const t of ['class_token_melee', 'class_token_ranged', 'class_token_magic']) {
    assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(t), `thiếu item ${t}`);
    const n = db.prepare('SELECT COUNT(*) c FROM monster_drops WHERE item_id=?').get(t).c;
    assert.ok(n > 0, `${t} không có nguồn rơi → không thể mở class thứ 2`);
  }
});

test('elite/boss được seed ngay khi khởi động (không phải đợi %battle)', () => {
  // Bẫy cũ: monster elite nằm trong seedBattleMobs() chỉ chạy ở src/commands/battle.js,
  // nên DB mới tinh có 0 con elite_tier>=1 → mọi audit về endgame đọc sai.
  const elite = db.prepare('SELECT id, elite_tier, desc FROM monsters WHERE elite_tier >= 1').all();
  assert.ok(elite.length >= 9, `chỉ có ${elite.length} elite/boss trong DB mới`);
  for (const m of elite) {
    assert.ok(m.desc && m.desc.trim().length > 0, `${m.id} thiếu mô tả`);
  }
  assert.ok(elite.some(m => m.elite_tier === 2), 'không có boss tier 2 nào');
});

test('potion_astral mua được ở shop đúng giá bảng cân bằng', () => {
  const row = db.prepare(`SELECT s.price shop_price, i.price item_price
    FROM shop s JOIN items i ON i.id = s.item_id WHERE s.item_id='potion_astral'`).get();
  assert.ok(row, 'potion_astral không bán ở shop');
  assert.strictEqual(row.shop_price, 1400);
  assert.strictEqual(row.item_price, 1400, 'giá item và giá shop lệch nhau');
});

test('nội dung nghề có quest để người chơi biết mà chơi', () => {
  const src = require(`${ROOT}/src/game/quests`);
  // generateDailyQuests phải có khả năng sinh objective gather + craft
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const uid = `DEAD${i}`;
    require(`${ROOT}/src/game/player`).createPlayer(uid, `d${i}`);
    src.generateDailyQuests(uid, 20);
    for (const pq of src.getPlayerQuests(uid)) if (pq.type === 'daily') seen.add(pq.objective);
  }
  for (const obj of ['gather', 'craft', 'kill', 'gold', 'level']) {
    assert.ok(seen.has(obj), `daily quest không bao giờ có objective ${obj}`);
  }
  assert.ok(classes, 'module classes phải load được');
});
