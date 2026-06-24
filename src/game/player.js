const db = require('../db/database');
const { ITEMS } = require('./items');

// ===== Helpers =====
function xpToNext(level) {
  return Math.floor(50 * Math.pow(level, 1.5));
}

function getPlayer(userId) {
  return db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
}

function createPlayer(userId, name) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO players (user_id, name, created_at)
    VALUES (?, ?, ?)
  `).run(userId, name, now);
  return getPlayer(userId);
}

function updatePlayer(userId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE players SET ${setClause} WHERE user_id = ?`).run(...values, userId);
}

// ===== Stats có cộng trang bị (tổng hợp tất cả slot) =====
function getEffectiveStats(p) {
  // Dùng require trong hàm để tránh circular dependency
  const { getTotalBonus } = require('./slots');
  const bonus = getTotalBonus(p.user_id);
  return {
    atk: p.atk + bonus.atk,
    def: p.def + bonus.def,
    bonus_heal: bonus.heal, // hồi máu tự động/trận (necklace bonus)
  };
}

// ===== Inventory =====
function getInventory(userId) {
  return db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
}

function addItem(userId, itemId, qty = 1) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  if (row) {
    db.prepare('UPDATE inventory SET qty = qty + ? WHERE user_id=? AND item_id=?')
      .run(qty, userId, itemId);
  } else {
    db.prepare('INSERT INTO inventory (user_id, item_id, qty) VALUES (?, ?, ?)')
      .run(userId, itemId, qty);
  }
  // Hook: quest item collection
  try {
    const quests = require('./quests');
    quests.onItemCollect(userId, itemId);
  } catch {}
}

function removeItem(userId, itemId, qty = 1) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM inventory WHERE user_id=? AND item_id=?').run(userId, itemId);
  } else {
    db.prepare('UPDATE inventory SET qty = qty - ? WHERE user_id=? AND item_id=?')
      .run(qty, userId, itemId);
  }
  return true;
}

function hasItem(userId, itemId, qty = 1) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  return row && row.qty >= qty;
}

// ===== Level up =====
function addXpAndLevel(userId, xpGain) {
  const p = getPlayer(userId);
  let xp = p.xp + xpGain;
  let level = p.level;
  let max_hp = p.max_hp, atk = p.atk, def = p.def;
  const lvlUps = [];

  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    max_hp += 15;
    atk    += 3;
    def    += 2;
    lvlUps.push(level);
  }

  updatePlayer(userId, { xp, level, max_hp, atk, def, hp: max_hp /* full hồi khi lên cấp */ });

  // Auto-sync class_data nếu có primary_class
  if (p.primary_class && lvlUps.length > 0) {
    try {
      const { syncPrimaryClassData } = require('./classes');
      syncPrimaryClassData(userId);
    } catch {}
  }

  // Hook: quest tracking
  if (lvlUps.length > 0) {
    try {
      const quests = require('./quests');
      quests.onLevelUp(userId, level);
    } catch {}
  }

  return { newLevel: level, levelsGained: lvlUps, xpToNext: xpToNext(level), xp };
}

module.exports = {
  xpToNext,
  getPlayer,
  createPlayer,
  updatePlayer,
  getEffectiveStats,
  getInventory,
  addItem,
  removeItem,
  hasItem,
  addXpAndLevel,
};
