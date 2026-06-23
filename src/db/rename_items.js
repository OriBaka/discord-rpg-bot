// One-shot script: rename items/monsters/zones từ tiếng Việt sang English.
// Tự động chạy 1 lần khi bot start. Có flag để không chạy lại.

const db = require('./database');

// Map: id → tên English mới
const ITEM_NAMES = {
  // Weapons
  wood_sword: '🗡️ Wooden Sword',
  rusty_dagger: '🔪 Rusty Dagger',
  iron_sword: '⚔️ Iron Sword',
  silver_bow: '🏹 Silver Bow',
  steel_sword: '🗡️ Steel Sword',
  flame_staff: '🔥 Flame Staff',
  dragon_sword: '🐉 Dragon Sword',
  void_blade: '🌌 Void Blade',

  // Armors (old single armor)
  cloth_armor: '👕 Cloth Armor',
  leather_armor: '🦺 Leather Armor',
  chain_armor: '⛓️ Chain Mail',
  iron_armor: '🛡️ Iron Armor',
  knight_armor: '⚜️ Knight Armor',
  dragon_armor: '🐲 Dragon Armor',
  void_robe: '👻 Void Robe',

  // Consumables
  potion_s: '🧪 Small Health Potion',
  potion_m: '🧪 Medium Health Potion',
  potion_l: '🧪 Large Health Potion',
  elixir: '✨ Elixir of Life',

  // Materials
  slime_gel: '🟢 Slime Gel',
  rat_tail: '🐀 Rat Tail',
  wolf_fang: '🦷 Wolf Fang',
  bat_wing: '🦇 Bat Wing',
  goblin_ear: '👂 Goblin Ear',
  spider_silk: '🕸️ Spider Silk',
  scorpion_tail: '🦂 Scorpion Tail',
  orc_tusk: '🦏 Orc Tusk',
  troll_horn: '🦬 Troll Horn',
  dragon_scale: '🔶 Dragon Scale',
  void_essence: '💜 Void Essence',

  // Class tokens
  class_token_melee: '🎖️ Warrior Insignia',
  class_token_magic: '🎖️ Mage Insignia',
  class_token_ranged: '🎖️ Archer Insignia',

  // Accessories — Rings
  copper_ring: '💍 Copper Ring',
  silver_ring: '💍 Silver Ring',
  gold_ring: '💍 Gold Ring',
  dragon_ring: '💍 Dragon Ring',
  flame_ring: '🔥 Flame Ring',
  guardian_ring: '🛡️ Guardian Ring',

  // Necklaces
  leather_necklace: '📿 Leather Necklace',
  pearl_necklace: '📿 Pearl Necklace',
  phoenix_amulet: '🔥 Phoenix Amulet',
  void_amulet: '🌌 Void Amulet',

  // Special
  lucky_charm: '🍀 Lucky Charm',
  hunter_mark: '🎯 Hunter\'s Mark',
  scholar_tome: '📖 Scholar\'s Tome',
  void_compass: '🧭 Void Compass',

  // Armor parts — Head
  cloth_hat: '🎩 Cloth Hat',
  leather_cap: '🧢 Leather Cap',
  iron_helm: '⛑️ Iron Helm',
  knight_helm: '👑 Knight Helm',
  dragon_helm: '🐲 Dragon Helm',
  mage_hood: '🎓 Mage Hood',
  archmage_hood: '🪄 Archmage Hood',
  hunter_hood: '🏹 Hunter Hood',
  ranger_hat: '🪶 Ranger Hat',

  // Chest
  cloth_robe: '👕 Cloth Robe',
  leather_vest: '🦺 Leather Vest',
  chain_mail: '⛓️ Chain Mail',
  iron_plate: '🛡️ Iron Plate',
  knight_plate: '⚜️ Knight Plate',
  dragon_plate: '🐲 Dragon Plate',
  mage_robe: '🧙 Mage Robe',
  archmage_robe: '✨ Archmage Robe',
  void_robe_chest: '👻 Void Robe',
  hunter_vest: '🎯 Hunter Vest',
  ranger_garb: '🪶 Ranger Garb',

  // Legs
  cloth_pants: '👖 Cloth Pants',
  leather_pants: '👖 Leather Pants',
  iron_greaves: '🦿 Iron Greaves',
  knight_greaves: '⚜️ Knight Greaves',
  dragon_greaves: '🐲 Dragon Greaves',
  mage_pants: '🧙 Mage Pants',
  hunter_pants: '🪶 Hunter Pants',

  // Feet
  cloth_shoes: '👞 Cloth Shoes',
  leather_boots: '👢 Leather Boots',
  iron_boots: '🥾 Iron Boots',
  knight_boots: '⚜️ Knight Boots',
  dragon_boots: '🐲 Dragon Boots',
  mage_slippers: '✨ Mage Slippers',
  hunter_boots: '🦅 Hunter Boots',

  // Hands
  cloth_gloves: '🧤 Cloth Gloves',
  leather_gloves: '🧤 Leather Gloves',
  iron_gauntlets: '🥊 Iron Gauntlets',
  knight_gauntlets: '⚜️ Knight Gauntlets',
  dragon_claws: '🐲 Dragon Claws',
  mage_gloves: '✋ Mage Gloves',
  archmage_gloves: '🪄 Archmage Gloves',
  hunter_gloves: '🎯 Hunter Gloves',
  ranger_gloves: '🪶 Ranger Gloves',

  // Offhand — Shields
  wood_shield: '🪵 Wooden Shield',
  iron_shield: '🛡️ Iron Shield',
  knight_shield: '⚜️ Knight Shield',
  dragon_shield: '🐲 Dragon Shield',

  // Orbs
  crystal_orb: '🔮 Crystal Orb',
  flame_orb: '🔥 Flame Orb',
  void_orb: '🌌 Void Orb',

  // Quivers
  leather_quiver: '🎒 Leather Quiver',
  hunter_quiver: '🏹 Hunter Quiver',
  ranger_quiver: '🎯 Master Quiver',
  void_quiver: '🌌 Void Quiver',

  // Generic offhand
  small_buckler: '🛡️ Small Buckler',
  traveler_pouch: '💼 Traveler\'s Pouch',
};

const MONSTER_NAMES = {
  slime: '🟢 Slime',
  giant_rat: '🐀 Giant Rat',
  wolf: '🐺 Wild Wolf',
  forest_bear: '🐻 Forest Bear',
  bat: '🦇 Vampire Bat',
  cave_spider: '🕷️ Cave Spider',
  goblin: '👺 Goblin',
  goblin_chief: '👹 Goblin Chief',
  scorpion: '🦂 Desert Scorpion',
  mummy: '🧟 Mummy',
  sand_worm: '🪱 Sand Worm',
  orc: '👹 Orc Warrior',
  yeti: '🦍 Yeti',
  troll: '🧌 Mountain Troll',
  young_dragon: '🐲 Young Dragon',
  dragon: '🐉 Ancient Dragon',
  void_dragon: '🌌 Void Dragon',
};

const ZONE_NAMES = {
  forest: '🌲 Wildwood Forest',
  cave: '🕳️ Dark Cave',
  desert: '🏜️ Crimson Desert',
  mountain: '⛰️ Snow Mountain',
  dragon_lair: '🐉 Dragon\'s Lair',
};

function renameAll() {
  // Tạo bảng meta để track migration đã chạy
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  const flag = db.prepare('SELECT value FROM meta WHERE key = ?').get('rename_to_english_v1');
  if (flag) return; // Đã chạy rồi

  console.log('🌍 Đang đổi tên item/monster/zone sang English...');

  const updItem = db.prepare('UPDATE items SET name = ? WHERE id = ?');
  const updMon  = db.prepare('UPDATE monsters SET name = ? WHERE id = ?');
  const updZone = db.prepare('UPDATE zones SET name = ? WHERE id = ?');

  let itemCount = 0, monCount = 0, zoneCount = 0;
  for (const [id, name] of Object.entries(ITEM_NAMES)) {
    const r = updItem.run(name, id);
    if (r.changes > 0) itemCount++;
  }
  for (const [id, name] of Object.entries(MONSTER_NAMES)) {
    const r = updMon.run(name, id);
    if (r.changes > 0) monCount++;
  }
  for (const [id, name] of Object.entries(ZONE_NAMES)) {
    const r = updZone.run(name, id);
    if (r.changes > 0) zoneCount++;
  }

  // Đánh dấu đã chạy
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('rename_to_english_v1', String(Date.now()));

  console.log(`✅ Đã đổi tên: ${itemCount} items, ${monCount} monsters, ${zoneCount} zones`);
}

module.exports = { renameAll }; 
