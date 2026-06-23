// Wrapper đọc monsters từ DB
const db = require('../db/database');

function getMonster(id) {
  const m = db.prepare('SELECT * FROM monsters WHERE id = ?').get(id);
  if (!m) return null;
  m.gold = [m.gold_min, m.gold_max];
  m.drops = db.prepare('SELECT item_id, chance, qty FROM monster_drops WHERE monster_id = ?').all(id);
  return m;
}

function getAllMonsters() {
  return db.prepare('SELECT * FROM monsters ORDER BY zone_id, hp').all();
}

function getMonstersInZone(zoneId) {
  return db.prepare('SELECT * FROM monsters WHERE zone_id = ?').all(zoneId);
}

function getZone(id) {
  return db.prepare('SELECT * FROM zones WHERE id = ?').get(id) || null;
}

function getAllZones() {
  return db.prepare('SELECT * FROM zones ORDER BY min_level').all();
}

// Pick quái theo zone (weight-based random)
function pickMonsterInZone(zoneId) {
  const list = getMonstersInZone(zoneId);
  if (list.length === 0) return null;
  const total = list.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * total;
  for (const m of list) {
    r -= m.weight;
    if (r <= 0) return getMonster(m.id);
  }
  return getMonster(list[list.length - 1].id);
}

// Tự động chọn zone phù hợp với level
function pickZoneForLevel(level) {
  const zones = getAllZones().filter(z => level >= z.min_level);
  if (zones.length === 0) return getAllZones()[0];
  // Ưu tiên zone có min_level gần với player level (challenging)
  return zones[zones.length - 1];
}

// Pick quái auto theo level
function pickMonsterForLevel(level) {
  const zone = pickZoneForLevel(level);
  if (!zone) return null;
  return pickMonsterInZone(zone.id);
}

// === CRUD cho admin ===
function createMonster({ id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight = 10 }) {
  db.prepare(`INSERT INTO monsters (id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight);
  return getMonster(id);
}

function updateMonster(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE monsters SET ${setClause} WHERE id = ?`).run(...values, id);
  return getMonster(id);
}

function deleteMonster(id) {
  return db.prepare('DELETE FROM monsters WHERE id = ?').run(id).changes > 0;
}

function addDrop(monsterId, itemId, chance, qty = 1) {
  db.prepare(`INSERT OR REPLACE INTO monster_drops (monster_id, item_id, chance, qty)
    VALUES (?,?,?,?)`).run(monsterId, itemId, chance, qty);
}

function removeDrop(monsterId, itemId) {
  return db.prepare('DELETE FROM monster_drops WHERE monster_id=? AND item_id=?')
    .run(monsterId, itemId).changes > 0;
}

// === Zone CRUD ===
function createZone({ id, name, min_level, desc = '' }) {
  db.prepare('INSERT INTO zones (id, name, min_level, desc) VALUES (?,?,?,?)')
    .run(id, name, min_level, desc);
  return getZone(id);
}

function updateZone(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE zones SET ${setClause} WHERE id = ?`).run(...values, id);
  return getZone(id);
}

function deleteZone(id) {
  return db.prepare('DELETE FROM zones WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  getMonster, getAllMonsters, getMonstersInZone,
  getZone, getAllZones,
  pickMonsterInZone, pickZoneForLevel, pickMonsterForLevel,
  createMonster, updateMonster, deleteMonster,
  addDrop, removeDrop,
  createZone, updateZone, deleteZone,
};
