// Gather zones cho mining/fishing
const db = require('./../db/database');

function migrate() {
  db.exec(`
    -- Zones cho mining/fishing (chung schema)
    CREATE TABLE IF NOT EXISTS gather_zones (
      id           TEXT PRIMARY KEY,
      job_type     TEXT NOT NULL,        -- mining | fishing
      name         TEXT NOT NULL,
      icon         TEXT NOT NULL DEFAULT '',
      desc         TEXT NOT NULL DEFAULT '',
      min_job_level INTEGER NOT NULL DEFAULT 1,
      cooldown_ms  INTEGER NOT NULL DEFAULT 30000,
      base_xp      INTEGER NOT NULL DEFAULT 10
    );

    -- Drops cho gather zones
    CREATE TABLE IF NOT EXISTS gather_drops (
      zone_id    TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      chance     REAL NOT NULL,
      qty_min    INTEGER NOT NULL DEFAULT 1,
      qty_max    INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (zone_id, item_id)
    );
  `);

  seedDefaults();
}

function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) c FROM gather_zones').get().c;
  if (count > 0) return;

  // === MINING ZONES ===
  const miningZones = [
    ['stone_quarry',  'mining', 'Stone Quarry',     '🪨', 'Stone & copper for beginners',     1,  30000, 10],
    ['iron_mine',     'mining', 'Iron Mine',        '⛏️', 'Iron deposits & coal',             10, 35000, 25],
    ['gold_vein',     'mining', 'Gold Vein',        '🏆', 'Gold ore for wealthy miners',      20, 40000, 50],
    ['mithril_cave',  'mining', 'Mithril Cave',     '✨', 'Rare mithril ore',                  35, 50000, 100],
    ['dragon_mine',   'mining', 'Dragon Bone Mine', '🐉', 'Ancient dragon bones & gems',      50, 60000, 200],
  ];

  // === FISHING ZONES ===
  const fishingZones = [
    ['village_pond',  'fishing', 'Village Pond',    '🪣', 'Small fish for beginners',         1,  30000, 10],
    ['river',         'fishing', 'Clear River',     '🏞️', 'Salmon and trout',                10, 35000, 25],
    ['lake',          'fishing', 'Deep Lake',       '🏝️', 'Large fish & rare catches',       20, 40000, 50],
    ['ocean',         'fishing', 'Vast Ocean',      '🌊', 'Tuna, swordfish & treasures',     35, 50000, 100],
    ['void_pool',     'fishing', 'Void Pool',       '🌌', 'Mysterious creatures from beyond', 50, 60000, 200],
  ];

  const insZone = db.prepare(`INSERT INTO gather_zones
    (id, job_type, name, icon, desc, min_job_level, cooldown_ms, base_xp)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (const z of [...miningZones, ...fishingZones]) insZone.run(...z);

  // === ITEMS cho mining/fishing (thêm vào bảng items) ===
  // Ores
  const ores = [
    ['stone',         '🪨 Stone',          'material', 'common', 0, 0, 0, 0, 2,   'Common stone'],
    ['copper_ore',    '🟫 Copper Ore',     'material', 'common', 0, 0, 0, 0, 5,   'Soft metal ore'],
    ['iron_ore',      '⛓️ Iron Ore',       'material', 'common', 0, 0, 0, 0, 12,  'Smelt for iron ingots'],
    ['coal',          '🪨 Coal',           'material', 'common', 0, 0, 0, 0, 8,   'Burns hot'],
    ['gold_ore',      '🟡 Gold Ore',       'material', 'rare',   0, 0, 0, 0, 35,  'Precious gold ore'],
    ['silver_ore',    '⚪ Silver Ore',      'material', 'rare',   0, 0, 0, 0, 25,  'Shiny silver'],
    ['mithril_ore',   '✨ Mithril Ore',    'material', 'epic',   0, 0, 0, 0, 80,  'Legendary lightweight metal'],
    ['gem_ruby',      '💎 Ruby',           'material', 'epic',   0, 0, 0, 0, 120, 'Fiery red gem'],
    ['gem_sapphire',  '💎 Sapphire',       'material', 'epic',   0, 0, 0, 0, 120, 'Deep blue gem'],
    ['dragon_bone',   '🦴 Dragon Bone',    'material', 'legendary', 0, 0, 0, 0, 250, 'Bone of an ancient dragon'],
    ['diamond',       '💠 Diamond',        'material', 'legendary', 0, 0, 0, 0, 300, 'Hardest known material'],
  ];

  // Fish
  const fish = [
    ['fish_small',    '🐟 Small Fish',     'material', 'common', 0, 0, 0, 0, 3,   'Tiny river fish'],
    ['fish_carp',     '🐠 Carp',           'material', 'common', 0, 0, 0, 0, 6,   'Common carp'],
    ['fish_trout',    '🐟 Trout',          'material', 'common', 0, 0, 0, 0, 10,  'Freshwater trout'],
    ['fish_salmon',   '🐠 Salmon',         'material', 'rare',   0, 0, 0, 0, 25,  'Pink salmon'],
    ['fish_tuna',     '🐟 Tuna',           'material', 'rare',   0, 0, 0, 0, 40,  'Large tuna'],
    ['fish_swordfish','🗡️ Swordfish',      'material', 'epic',   0, 0, 0, 0, 80,  'Sharp-nosed predator'],
    ['fish_golden',   '✨ Golden Fish',    'material', 'epic',   0, 0, 0, 0, 150, 'Legendary lucky fish'],
    ['fish_kraken',   '🐙 Kraken Tentacle','material', 'legendary', 0, 0, 0, 0, 300, 'Tentacle of a sea beast'],
    ['fish_void',     '🐡 Void Fish',      'material', 'legendary', 0, 0, 0, 0, 350, 'Fish from another dimension'],
  ];

  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,'','','','','')`);
  for (const it of [...ores, ...fish]) insItem.run(...it);

  // === DROPS ===
  // Mining
  const miningDrops = [
    // stone_quarry
    ['stone_quarry', 'stone',       0.80, 1, 3],
    ['stone_quarry', 'copper_ore',  0.40, 1, 2],
    ['stone_quarry', 'iron_ore',    0.10, 1, 1],
    // iron_mine
    ['iron_mine',    'iron_ore',    0.70, 1, 3],
    ['iron_mine',    'coal',        0.50, 1, 2],
    ['iron_mine',    'silver_ore',  0.20, 1, 1],
    ['iron_mine',    'stone',       0.40, 1, 2],
    // gold_vein
    ['gold_vein',    'gold_ore',    0.50, 1, 2],
    ['gold_vein',    'silver_ore',  0.40, 1, 2],
    ['gold_vein',    'iron_ore',    0.30, 1, 2],
    ['gold_vein',    'gem_ruby',    0.08, 1, 1],
    ['gold_vein',    'gem_sapphire',0.08, 1, 1],
    // mithril_cave
    ['mithril_cave', 'mithril_ore', 0.35, 1, 2],
    ['mithril_cave', 'gem_ruby',    0.20, 1, 1],
    ['mithril_cave', 'gem_sapphire',0.20, 1, 1],
    ['mithril_cave', 'gold_ore',    0.30, 1, 2],
    ['mithril_cave', 'diamond',     0.05, 1, 1],
    // dragon_mine
    ['dragon_mine',  'dragon_bone', 0.40, 1, 2],
    ['dragon_mine',  'mithril_ore', 0.40, 1, 2],
    ['dragon_mine',  'diamond',     0.20, 1, 1],
    ['dragon_mine',  'gold_ore',    0.40, 1, 3],
  ];

  // Fishing
  const fishingDrops = [
    // village_pond
    ['village_pond', 'fish_small',  0.80, 1, 2],
    ['village_pond', 'fish_carp',   0.30, 1, 1],
    // river
    ['river',        'fish_trout',  0.60, 1, 2],
    ['river',        'fish_salmon', 0.25, 1, 1],
    ['river',        'fish_carp',   0.40, 1, 1],
    // lake
    ['lake',         'fish_salmon', 0.50, 1, 2],
    ['lake',         'fish_tuna',   0.25, 1, 1],
    ['lake',         'fish_trout',  0.40, 1, 2],
    // ocean
    ['ocean',        'fish_tuna',   0.50, 1, 2],
    ['ocean',        'fish_swordfish', 0.25, 1, 1],
    ['ocean',        'fish_salmon', 0.40, 1, 2],
    ['ocean',        'fish_golden', 0.05, 1, 1],
    // void_pool
    ['void_pool',    'fish_void',   0.30, 1, 1],
    ['void_pool',    'fish_kraken', 0.20, 1, 1],
    ['void_pool',    'fish_golden', 0.15, 1, 1],
    ['void_pool',    'fish_swordfish', 0.40, 1, 2],
  ];

  const insDrop = db.prepare(`INSERT INTO gather_drops
    (zone_id, item_id, chance, qty_min, qty_max) VALUES (?,?,?,?,?)`);
  for (const d of [...miningDrops, ...fishingDrops]) insDrop.run(...d);

  console.log(`🌱 Seeded ${miningZones.length + fishingZones.length} gather zones, ${ores.length + fish.length} items, ${miningDrops.length + fishingDrops.length} drops`);
}

// === CRUD ===
function getZone(id) {
  return db.prepare('SELECT * FROM gather_zones WHERE id = ?').get(id);
}

function getZonesByJob(jobType) {
  return db.prepare('SELECT * FROM gather_zones WHERE job_type = ? ORDER BY min_job_level').all(jobType);
}

function getDrops(zoneId) {
  return db.prepare('SELECT * FROM gather_drops WHERE zone_id = ?').all(zoneId);
}

function rollDrops(zoneId) {
  const drops = getDrops(zoneId);
  const result = [];
  for (const d of drops) {
    if (Math.random() < d.chance) {
      const qty = d.qty_min + Math.floor(Math.random() * (d.qty_max - d.qty_min + 1));
      result.push({ item_id: d.item_id, qty });
    }
  }
  return result;
}

// === Admin ===
function createZone(data) {
  db.prepare(`INSERT INTO gather_zones
    (id, job_type, name, icon, desc, min_job_level, cooldown_ms, base_xp)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(data.id, data.job_type, data.name, data.icon || '', data.desc || '',
         data.min_job_level || 1, data.cooldown_ms || 30000, data.base_xp || 10);
  return getZone(data.id);
}

function deleteZone(id) {
  db.prepare('DELETE FROM gather_drops WHERE zone_id = ?').run(id);
  return db.prepare('DELETE FROM gather_zones WHERE id = ?').run(id).changes > 0;
}

function addDrop(zoneId, itemId, chance, qtyMin = 1, qtyMax = 1) {
  db.prepare(`INSERT OR REPLACE INTO gather_drops
    (zone_id, item_id, chance, qty_min, qty_max) VALUES (?,?,?,?,?)`)
    .run(zoneId, itemId, chance, qtyMin, qtyMax);
}

function removeDrop(zoneId, itemId) {
  return db.prepare('DELETE FROM gather_drops WHERE zone_id=? AND item_id=?')
    .run(zoneId, itemId).changes > 0;
}

module.exports = {
  migrate,
  getZone, getZonesByJob, getDrops, rollDrops,
  createZone, deleteZone, addDrop, removeDrop,
}; 
