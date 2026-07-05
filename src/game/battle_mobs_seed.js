// Seed elite + boss monsters cho %battle
function getDb() { return require('./../db/database'); }

// Format: [id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight, elite_tier]
// elite_tier: 1=elite (x3 hp, x1.5 atk), 2=boss (x10 hp, has AI)
// zone_id phải tồn tại trong bảng zones: forest, cave, desert, mountain, dragon_lair
const ELITE_MOBS = [
  // Elite (1)
  ['elite_slime',   '🟢 Giant Slime',       'forest',      120,  15,  5,   80,   80,   180,  10, 1],
  ['elite_wolf',    '🐺 Alpha Wolf',        'forest',      180,  25,  8,   150,  200,  400,  10, 1],
  ['elite_orc',     '👹 Orc Warlord',       'mountain',    350, 45, 15,   350,  600,  1000, 10, 1],
  ['elite_golem',   '🗿 Stone Golem',       'cave',        500, 55, 30,   500,  1000, 1800, 10, 1],
  ['elite_lich',    '💀 Ancient Lich',      'cave',        700, 80, 20,   800,  1800, 3000, 10, 1],
  ['elite_dragon',  '🐲 Young Dragon',      'dragon_lair', 900, 100, 25, 1200, 3000, 5000, 10, 1],

  // Boss (2) — endgame
  ['boss_demon_king', '👿 Demon King',      'cave',        2500, 130, 40, 3000, 5000, 12000, 10, 2],
  ['boss_wyrm',       '🐉 Ancient Wyrm',    'mountain',    3500, 150, 45, 5000, 8000, 20000, 10, 2],
  ['boss_void_lord',  '🌌 Void Lord',       'dragon_lair', 5000, 200, 60, 10000, 15000, 40000, 10, 2],
];

// Boss drops (rare items từ high tier seed)
const BOSS_DROPS = [
  // Demon King
  { mob: 'boss_demon_king', item: 'dragon_bone', chance: 0.8, qty: 3 },
  { mob: 'boss_demon_king', item: 'diamond', chance: 0.5, qty: 2 },
  { mob: 'boss_demon_king', item: 'gem_ruby', chance: 0.3, qty: 1 },

  // Ancient Wyrm
  { mob: 'boss_wyrm', item: 'dragon_scale', chance: 0.9, qty: 3 },
  { mob: 'boss_wyrm', item: 'dragon_bone', chance: 0.8, qty: 5 },
  { mob: 'boss_wyrm', item: 'diamond_ingot', chance: 0.4, qty: 2 },

  // Void Lord — end-game drops
  { mob: 'boss_void_lord', item: 'void_essence', chance: 0.9, qty: 5 },
  { mob: 'boss_void_lord', item: 'void_ingot', chance: 0.5, qty: 1 },
  { mob: 'boss_void_lord', item: 'dragon_scale', chance: 0.8, qty: 5 },
];

// Elite drops (basic materials boost)
const ELITE_DROPS = [
  { mob: 'elite_slime', item: 'stone', chance: 1.0, qty: 5 },
  { mob: 'elite_wolf', item: 'coal', chance: 0.8, qty: 3 },
  { mob: 'elite_orc', item: 'iron_ore', chance: 0.9, qty: 5 },
  { mob: 'elite_golem', item: 'mithril_ore', chance: 0.6, qty: 3 },
  { mob: 'elite_lich', item: 'gem_sapphire', chance: 0.5, qty: 2 },
  { mob: 'elite_dragon', item: 'dragon_bone', chance: 0.7, qty: 2 },
];

function seedBattleMobs() {
  const db = getDb();
  let mobsAdded = 0, dropsAdded = 0;

  const insMob = db.prepare(`
    INSERT OR IGNORE INTO monsters (id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight, elite_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updMob = db.prepare('UPDATE monsters SET elite_tier=? WHERE id=?');
  for (const m of ELITE_MOBS) {
    const info = insMob.run(...m);
    if (info.changes > 0) mobsAdded++;
    // Đảm bảo elite_tier đúng (nếu mob đã có sẵn nhưng chưa flag)
    updMob.run(m[10], m[0]);
  }

  const insDrop = db.prepare(`INSERT OR IGNORE INTO monster_drops (monster_id, item_id, chance, qty) VALUES (?, ?, ?, ?)`);
  for (const d of [...ELITE_DROPS, ...BOSS_DROPS]) {
    try {
      const info = insDrop.run(d.mob, d.item, d.chance, d.qty);
      if (info.changes > 0) dropsAdded++;
    } catch (e) { /* item chưa tồn tại, skip */ }
  }

  return { mobsAdded, dropsAdded };
}

module.exports = { seedBattleMobs, ELITE_MOBS, BOSS_DROPS, ELITE_DROPS };
 
