// Lootbox system: item type=lootbox có loot_table chứa rewards ngẫu nhiên
function getDb() { return require('./../db/database'); }

function migrate() {
  const db = getDb();
  // Bảng loot_tables (1 lootbox = N entries, mỗi entry là 1 possible reward)
  db.exec(`
    CREATE TABLE IF NOT EXISTS loot_tables (
      lootbox_id   TEXT NOT NULL,        -- item id của lootbox
      reward_type  TEXT NOT NULL,        -- 'item' | 'pet' | 'shard' | 'gold' | 'xp'
      reward_id    TEXT NOT NULL DEFAULT '', -- id của item/pet/shard (rỗng nếu là gold/xp)
      qty_min      INTEGER NOT NULL DEFAULT 1,
      qty_max      INTEGER NOT NULL DEFAULT 1,
      weight       INTEGER NOT NULL DEFAULT 10,  -- trọng số random (cao = hay ra)
      guaranteed   INTEGER NOT NULL DEFAULT 0,   -- 1 = luôn cấp (không random)
      PRIMARY KEY (lootbox_id, reward_type, reward_id)
    );
  `);
}

// ===== CRUD =====
function getLootTable(lootboxId) {
  const db = getDb();
  return db.prepare('SELECT * FROM loot_tables WHERE lootbox_id = ?').all(lootboxId);
}

// Sửa một entry đã có (admin không phải xoá rồi thêm lại).
// fields: { qty_min, qty_max, weight, guaranteed } — bỏ trống thì giữ nguyên.
function updateLootEntry(lootboxId, rewardType, rewardId, fields = {}) {
  const db = getDb();
  const cur = db.prepare(`SELECT * FROM loot_tables
    WHERE lootbox_id=? AND reward_type=? AND reward_id=?`).get(lootboxId, rewardType, rewardId || '');
  if (!cur) return null;
  const next = {
    qty_min: fields.qty_min != null ? fields.qty_min : cur.qty_min,
    qty_max: fields.qty_max != null ? fields.qty_max : cur.qty_max,
    weight: fields.weight != null ? fields.weight : cur.weight,
    guaranteed: fields.guaranteed != null ? (fields.guaranteed ? 1 : 0) : cur.guaranteed,
  };
  if (next.qty_max < next.qty_min) next.qty_max = next.qty_min;
  db.prepare(`UPDATE loot_tables SET qty_min=?, qty_max=?, weight=?, guaranteed=?
    WHERE lootbox_id=? AND reward_type=? AND reward_id=?`)
    .run(next.qty_min, next.qty_max, next.weight, next.guaranteed, lootboxId, rewardType, rewardId || '');
  return db.prepare(`SELECT * FROM loot_tables
    WHERE lootbox_id=? AND reward_type=? AND reward_id=?`).get(lootboxId, rewardType, rewardId || '');
}

// Toàn bộ lootbox đang có (item type=lootbox), kèm thống kê nhanh.
function getAllLootboxes() {
  const db = getDb();
  const items = db.prepare("SELECT * FROM items WHERE type='lootbox' ORDER BY tier, name").all();
  return items.map(it => {
    const entries = getLootTable(it.id);
    const pool = entries.filter(e => e.guaranteed === 0);
    return {
      item: it,
      entries,
      pool_count: pool.length,
      guaranteed_count: entries.length - pool.length,
      total_weight: pool.reduce((s, e) => s + e.weight, 0),
    };
  });
}

// Nguồn kiếm một item (để phát hiện hộp quà không ai lấy được).
function itemSources(itemId) {
  const db = getDb();
  const src = [];
  if (db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(itemId)) src.push('shop');
  if (db.prepare('SELECT 1 FROM monster_drops WHERE item_id=?').get(itemId)) src.push('quái');
  if (db.prepare('SELECT 1 FROM gather_drops WHERE item_id=?').get(itemId)) src.push('khai thác');
  if (db.prepare('SELECT 1 FROM recipes WHERE output_id=?').get(itemId)) src.push('chế tạo');
  if (db.prepare('SELECT 1 FROM redeem_rewards WHERE reward_type=? AND reward_id=?').get('item', itemId)) src.push('redeem');
  try {
    const q = db.prepare('SELECT 1 FROM quests WHERE reward_item LIKE ?').get(`%${itemId}%`);
    if (q) src.push('quest');
  } catch { /* bảng quests có thể chưa có */ }
  try {
    const a = db.prepare('SELECT 1 FROM achievements WHERE reward_item=?').get(itemId);
    if (a) src.push('thành tựu');
  } catch { /* ignore */ }
  // Lootbox lồng nhau
  if (db.prepare("SELECT 1 FROM loot_tables WHERE reward_type='item' AND reward_id=?").get(itemId)) src.push('lootbox khác');
  return src;
}

function addLootEntry(lootboxId, entry) {
  const db = getDb();
  db.prepare(`INSERT OR REPLACE INTO loot_tables
    (lootbox_id, reward_type, reward_id, qty_min, qty_max, weight, guaranteed)
    VALUES (?,?,?,?,?,?,?)`)
    .run(lootboxId, entry.reward_type, entry.reward_id || '',
         entry.qty_min || 1, entry.qty_max || 1, entry.weight || 10, entry.guaranteed ? 1 : 0);
}

function removeLootEntry(lootboxId, rewardType, rewardId = '') {
  const db = getDb();
  return db.prepare('DELETE FROM loot_tables WHERE lootbox_id=? AND reward_type=? AND reward_id=?')
    .run(lootboxId, rewardType, rewardId).changes > 0;
}

function clearLootTable(lootboxId) {
  const db = getDb();
  return db.prepare('DELETE FROM loot_tables WHERE lootbox_id=?').run(lootboxId).changes;
}

// ===== Roll lootbox =====
// rolls: số lượng pick từ weighted random pool (default 1)
// guaranteed entries luôn được cấp ngoài rolls
function openLootbox(lootboxId, rolls = 1) {
  const table = getLootTable(lootboxId);
  if (table.length === 0) return { rewards: [], error: 'empty_table' };

  const guaranteed = table.filter(e => e.guaranteed === 1);
  const pool = table.filter(e => e.guaranteed === 0);

  const rewards = [];

  // Guaranteed first
  for (const e of guaranteed) {
    const qty = e.qty_min + Math.floor(Math.random() * (e.qty_max - e.qty_min + 1));
    rewards.push({ ...e, qty });
  }

  // Weighted random pick
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  if (pool.length > 0 && totalWeight > 0) {
    for (let i = 0; i < rolls; i++) {
      let r = Math.random() * totalWeight;
      for (const e of pool) {
        r -= e.weight;
        if (r <= 0) {
          const qty = e.qty_min + Math.floor(Math.random() * (e.qty_max - e.qty_min + 1));
          rewards.push({ ...e, qty });
          break;
        }
      }
    }
  }

  return { rewards };
}

// ===== Apply rewards (gọi sau khi roll) =====
// context = { client, guildId } cho notify achievement
function applyRewards(userId, rewards, context = null) {
  const { addItem, addXpAndLevel, updatePlayer, getPlayer } = require('./player');
  const { getItem } = require('./items');
  const pets = require('./pets');

  const summary = [];
  for (const r of rewards) {
    switch (r.reward_type) {
      case 'item': {
        const it = getItem(r.reward_id);
        if (!it) { summary.push(`❌ Item \`${r.reward_id}\` not found`); break; }
        addItem(userId, r.reward_id, r.qty, context);
        summary.push(`📦 +${r.qty}× ${it.name}`);
        break;
      }
      case 'pet': {
        const pet = pets.getPet(r.reward_id);
        if (!pet) { summary.push(`❌ Pet \`${r.reward_id}\` not found`); break; }
        pets.addPet(userId, r.reward_id, r.qty, context);
        summary.push(`🐾 +${r.qty}× ${pet.icon} ${pet.name}`);
        break;
      }
      case 'shard': {
        pets.addShard(userId, r.reward_id, r.qty);
        summary.push(`🧩 +${r.qty}× \`${r.reward_id}\``);
        break;
      }
      case 'gold': {
        const p = getPlayer(userId);
        if (p) updatePlayer(userId, { gold: p.gold + r.qty });
        summary.push(`💰 +${r.qty} vàng`);
        break;
      }
      case 'xp': {
        addXpAndLevel(userId, r.qty);
        summary.push(`✨ +${r.qty} XP`);
        break;
      }
    }
  }
  return summary;
}

module.exports = {
  migrate,
  getLootTable, addLootEntry, updateLootEntry, removeLootEntry, clearLootTable,
  getAllLootboxes, itemSources,
  openLootbox, applyRewards,
}; 
