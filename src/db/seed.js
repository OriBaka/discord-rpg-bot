// Seed dữ liệu mặc định khi DB rỗng. Chỉ chạy nếu bảng chưa có data.
function seedDefaults(db) {
  const itemCount = db.prepare('SELECT COUNT(*) c FROM items').get().c;
  if (itemCount > 0) return; // đã seed rồi

  console.log('🌱 Seeding default data...');

  // ========== ITEMS ==========
  const items = [
    // === WEAPONS ===
    // Common
    ['wood_sword',    '🗡️ Wooden Sword',     'weapon', 'common',    3,  0, 0,   50,    20, 'A basic training sword'],
    ['rusty_dagger',  '🔪 Rusty Dagger',     'weapon', 'common',    5,  0, 0,   100,   40, 'A thief\'s weapon'],
    // Rare
    ['iron_sword',    '⚔️ Iron Sword',       'weapon', 'rare',      10, 0, 0,   300,   120, 'Handcrafted iron blade'],
    ['silver_bow',    '🏹 Silver Bow',       'weapon', 'rare',      14, 0, 0,   500,   200, 'A skilled hunter\'s bow'],
    // Epic
    ['steel_sword',   '🗡️ Steel Sword',      'weapon', 'epic',      20, 0, 0,   1000,  400, 'Sharp as a razor'],
    ['flame_staff',   '🔥 Flame Staff',      'weapon', 'epic',      25, 0, 0,   1500,  600, 'Summons hellfire'],
    // Legendary
    ['dragon_sword',  '🐉 Dragon Sword',     'weapon', 'legendary', 40, 0, 0,   5000,  2000, 'Forged from ancient dragon fangs'],
    ['void_blade',    '🌌 Void Blade',       'weapon', 'legendary', 55, 0, 0,   8000,  3200, 'Cuts through space itself'],

    // === ARMORS (chest — sẽ migrate sang armor_slot='chest') ===
    ['cloth_armor',   '👕 Cloth Armor',      'armor',  'common',    0,  2, 0,   40,    15, 'Better than nothing'],
    ['leather_armor', '🦺 Leather Armor',    'armor',  'common',    0,  5, 0,   150,   60, 'Soft tanned leather'],
    ['chain_armor',   '⛓️ Chain Mail',       'armor',  'rare',      0,  10, 0,  400,   160, 'Hand-woven iron chains'],
    ['iron_armor',    '🛡️ Iron Armor',       'armor',  'rare',      0,  15, 0,  800,   320, 'Full body protection'],
    ['knight_armor',  '⚜️ Knight Armor',     'armor',  'epic',      0,  22, 0,  1800,  720, 'Royal knight gear'],
    ['dragon_armor',  '🐲 Dragon Armor',     'armor',  'legendary', 0,  35, 0,  4500,  1800, 'Reforged dragon scales'],
    ['void_robe',     '👻 Void Robe',        'armor',  'legendary', 0,  45, 0,  7000,  2800, 'Absorbs damage into the void'],

    // === CONSUMABLES ===
    ['potion_s',  '🧪 Small Health Potion',  'consumable', 'common', 0, 0, 50,   30,  10, 'Restores 50 HP'],
    ['potion_m',  '🧪 Medium Health Potion', 'consumable', 'rare',   0, 0, 150,  100, 35, 'Restores 150 HP'],
    ['potion_l',  '🧪 Large Health Potion',  'consumable', 'epic',   0, 0, 400,  280, 90, 'Restores 400 HP'],
    ['elixir',    '✨ Elixir of Life',       'consumable', 'legendary', 0, 0, 9999, 1500, 500, 'Fully restores HP'],

    // === MATERIALS (drop từ quái) ===
    ['slime_gel',     '🟢 Slime Gel',        'material', 'common', 0, 0, 0, 0, 5,   'Sticky and gross'],
    ['rat_tail',      '🐀 Rat Tail',         'material', 'common', 0, 0, 0, 0, 8,   'Rather... smelly'],
    ['wolf_fang',     '🦷 Wolf Fang',        'material', 'common', 0, 0, 0, 0, 18,  'Sharp and pointy'],
    ['bat_wing',      '🦇 Bat Wing',         'material', 'common', 0, 0, 0, 0, 22,  'Thin and fragile'],
    ['goblin_ear',    '👂 Goblin Ear',       'material', 'rare',   0, 0, 0, 0, 35,  'Goblin hunting trophy'],
    ['spider_silk',   '🕸️ Spider Silk',      'material', 'rare',   0, 0, 0, 0, 45,  'Stronger than steel'],
    ['scorpion_tail', '🦂 Scorpion Tail',    'material', 'rare',   0, 0, 0, 0, 60,  'Contains venom'],
    ['orc_tusk',      '🦏 Orc Tusk',         'material', 'epic',   0, 0, 0, 0, 90,  'Large and heavy'],
    ['troll_horn',    '🦬 Troll Horn',       'material', 'epic',   0, 0, 0, 0, 140, 'Hard as stone'],
    ['dragon_scale',  '🔶 Dragon Scale',     'material', 'legendary', 0, 0, 0, 0, 300, 'Harder than diamond'],
    ['void_essence',  '💜 Void Essence',     'material', 'legendary', 0, 0, 0, 0, 500, 'Primordial energy'],

    // === CLASS TOKENS (đặc biệt — dùng để unlock class) ===
    ['class_token_melee',  '🎖️ Warrior Insignia', 'material', 'epic', 0, 0, 0, 0, 0, 'Special item to unlock Warrior class'],
    ['class_token_magic',  '🎖️ Mage Insignia',    'material', 'epic', 0, 0, 0, 0, 0, 'Special item to unlock Mage class'],
    ['class_token_ranged', '🎖️ Archer Insignia',  'material', 'epic', 0, 0, 0, 0, 0, 'Special item to unlock Archer class'],
  ];

  const insItem = db.prepare(`INSERT INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const it of items) insItem.run(...it);

  // ========== ZONES ==========
  const zones = [
    ['forest',      '🌲 Wildwood Forest',  1,  'A peaceful forest near town, perfect for beginners'],
    ['cave',        '🕳️ Dark Cave',        5,  'A damp cavern filled with small creatures'],
    ['desert',      '🏜️ Crimson Desert',   10, 'A scorching wasteland with venomous beasts'],
    ['mountain',    '⛰️ Snow Mountain',    15, 'Freezing peaks hiding powerful monsters'],
    ['dragon_lair', '🐉 Dragon\'s Lair',   20, 'Extremely dangerous territory — high level only'],
  ];
  const insZone = db.prepare('INSERT INTO zones (id, name, min_level, desc) VALUES (?,?,?,?)');
  for (const z of zones) insZone.run(...z);

  // ========== MONSTERS ==========
  // [id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight]
  const monsters = [
    // FOREST (Lv 1-7)
    ['slime',       '🟢 Slime',            'forest', 30,   5,  1,  8,   5,   12,  30],
    ['giant_rat',   '🐀 Giant Rat',        'forest', 45,   8,  2,  12,  8,   18,  25],
    ['wolf',        '🐺 Wild Wolf',        'forest', 75,   13, 4,  22,  14,  28,  20],
    ['forest_bear', '🐻 Forest Bear',      'forest', 130,  20, 7,  40,  25,  45,  10],

    // CAVE (Lv 5-12)
    ['bat',         '🦇 Vampire Bat',      'cave',   65,   14, 3,  20,  12,  25,  25],
    ['cave_spider', '🕷️ Cave Spider',      'cave',   100,  18, 5,  32,  20,  40,  20],
    ['goblin',      '👺 Goblin',           'cave',   140,  22, 8,  48,  30,  55,  20],
    ['goblin_chief','👹 Goblin Chief',     'cave',   220,  32, 12, 80,  55,  95,  10],

    // DESERT (Lv 10-18)
    ['scorpion',    '🦂 Desert Scorpion',  'desert', 180,  30, 10, 70,  45,  85,  25],
    ['mummy',       '🧟 Mummy',            'desert', 280,  38, 15, 110, 70,  130, 20],
    ['sand_worm',   '🪱 Sand Worm',        'desert', 380,  45, 18, 150, 95,  180, 15],

    // MOUNTAIN (Lv 15-25)
    ['orc',         '👹 Orc Warrior',      'mountain', 450, 55, 22, 200, 130, 220, 20],
    ['snowman',     '⛄ Living Snowman',   'mountain', 380, 48, 18, 180, 110, 200, 18],
    ['yeti',        '🦍 Yeti',             'mountain', 600, 65, 28, 270, 180, 300, 15],
    ['troll',       '🧌 Mountain Troll',   'mountain', 850, 80, 35, 380, 250, 420, 10],

    // DRAGON LAIR (Lv 20+)
    ['young_dragon','🐲 Young Dragon',     'dragon_lair', 1200, 95,  40, 500,  350, 600,  20],
    ['dragon',      '🐉 Ancient Dragon',   'dragon_lair', 2200, 130, 55, 900,  650, 1100, 10],
    ['void_dragon', '🌌 Void Dragon',      'dragon_lair', 4000, 180, 75, 1600, 1200, 2000, 3],
  ];
  const insMon = db.prepare(`INSERT INTO monsters
    (id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const m of monsters) insMon.run(...m);

  // ========== MONSTER DROPS ==========
  const drops = [
    // Forest
    ['slime', 'slime_gel', 0.85, 1],
    ['giant_rat', 'rat_tail', 0.7, 1],
    ['wolf', 'wolf_fang', 0.55, 1],
    ['forest_bear', 'wolf_fang', 0.6, 2],
    ['forest_bear', 'potion_s', 0.2, 1],
    // Cave
    ['bat', 'bat_wing', 0.75, 1],
    ['cave_spider', 'spider_silk', 0.5, 1],
    ['goblin', 'goblin_ear', 0.65, 1],
    ['goblin', 'potion_s', 0.15, 1],
    ['goblin_chief', 'goblin_ear', 0.9, 2],
    ['goblin_chief', 'potion_m', 0.25, 1],
    // Desert
    ['scorpion', 'scorpion_tail', 0.6, 1],
    ['mummy', 'potion_m', 0.3, 1],
    ['mummy', 'spider_silk', 0.4, 1],
    ['sand_worm', 'scorpion_tail', 0.5, 2],
    // Mountain
    ['orc', 'orc_tusk', 0.55, 1],
    ['orc', 'potion_m', 0.2, 1],
    ['snowman', 'potion_m', 0.3, 1],
    ['yeti', 'troll_horn', 0.4, 1],
    ['troll', 'troll_horn', 0.7, 1],
    ['troll', 'potion_l', 0.25, 1],
    // Dragon
    ['young_dragon', 'dragon_scale', 0.5, 1],
    ['young_dragon', 'potion_l', 0.3, 1],
    ['dragon', 'dragon_scale', 0.85, 2],
    ['dragon', 'elixir', 0.1, 1],
    ['void_dragon', 'void_essence', 0.7, 1],
    ['void_dragon', 'dragon_scale', 1.0, 3],
    ['void_dragon', 'elixir', 0.3, 1],
  ];
  const insDrop = db.prepare('INSERT INTO monster_drops (monster_id, item_id, chance, qty) VALUES (?,?,?,?)');
  for (const d of drops) insDrop.run(...d);

  // ========== SHOP DEFAULT ==========
  // Mặc định bán: vũ khí/giáp common+rare + tất cả potion
  const shopItems = [
    'wood_sword', 'rusty_dagger', 'iron_sword', 'silver_bow',
    'cloth_armor', 'leather_armor', 'chain_armor', 'iron_armor',
    'potion_s', 'potion_m', 'potion_l',
  ];
  const insShop = db.prepare('INSERT INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  for (const id of shopItems) insShop.run(id);

  console.log(`✅ Seeded: ${items.length} items, ${zones.length} zones, ${monsters.length} monsters, ${drops.length} drops, ${shopItems.length} shop items`);
}

module.exports = { seedDefaults };
