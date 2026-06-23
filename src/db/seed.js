// Seed dữ liệu mặc định khi DB rỗng. Chỉ chạy nếu bảng chưa có data.
function seedDefaults(db) {
  const itemCount = db.prepare('SELECT COUNT(*) c FROM items').get().c;
  if (itemCount > 0) return; // đã seed rồi

  console.log('🌱 Seeding default data...');

  // ========== ITEMS ==========
  const items = [
    // === WEAPONS ===
    // Common
    ['wood_sword',    '🗡️ Kiếm Gỗ',          'weapon', 'common',    3,  0, 0,   50,    20, 'Kiếm tập sự cơ bản'],
    ['rusty_dagger',  '🔪 Dao Gỉ',           'weapon', 'common',    5,  0, 0,   100,   40, 'Vũ khí của trộm vặt'],
    // Rare
    ['iron_sword',    '⚔️ Kiếm Sắt',         'weapon', 'rare',      10, 0, 0,   300,   120, 'Kiếm sắt rèn thủ công'],
    ['silver_bow',    '🏹 Cung Bạc',         'weapon', 'rare',      14, 0, 0,   500,   200, 'Cung thợ săn lành nghề'],
    // Epic
    ['steel_sword',   '🗡️ Kiếm Thép',        'weapon', 'epic',      20, 0, 0,   1000,  400, 'Sắc bén như dao cạo'],
    ['flame_staff',   '🔥 Trượng Lửa',       'weapon', 'epic',      25, 0, 0,   1500,  600, 'Triệu hồi ngọn lửa địa ngục'],
    // Legendary
    ['dragon_sword',  '🐉 Kiếm Rồng',        'weapon', 'legendary', 40, 0, 0,   5000,  2000, 'Rèn từ nanh rồng cổ đại'],
    ['void_blade',    '🌌 Lưỡi Hư Vô',       'weapon', 'legendary', 55, 0, 0,   8000,  3200, 'Cắt cả không gian'],

    // === ARMORS ===
    ['cloth_armor',   '👕 Áo Vải',           'armor',  'common',    0,  2, 0,   40,    15, 'Mặc cho có'],
    ['leather_armor', '🦺 Giáp Da',          'armor',  'common',    0,  5, 0,   150,   60, 'Da thuộc mềm dẻo'],
    ['chain_armor',   '⛓️ Giáp Xích',        'armor',  'rare',      0,  10, 0,  400,   160, 'Xích sắt đan tay'],
    ['iron_armor',    '🛡️ Giáp Sắt',         'armor',  'rare',      0,  15, 0,  800,   320, 'Bảo vệ toàn thân'],
    ['knight_armor',  '⚜️ Giáp Hiệp Sĩ',     'armor',  'epic',      0,  22, 0,  1800,  720, 'Trang phục hiệp sĩ hoàng gia'],
    ['dragon_armor',  '🐲 Giáp Rồng',        'armor',  'legendary', 0,  35, 0,  4500,  1800, 'Vảy rồng cổ rèn lại'],
    ['void_robe',     '👻 Áo Choàng Hư Vô', 'armor',  'legendary', 0,  45, 0,  7000,  2800, 'Hấp thu sát thương vào hư không'],

    // === CONSUMABLES ===
    ['potion_s',  '🧪 Bình Máu Nhỏ',  'consumable', 'common', 0, 0, 50,   30,  10, 'Hồi 50 HP'],
    ['potion_m',  '🧪 Bình Máu Vừa',  'consumable', 'rare',   0, 0, 150,  100, 35, 'Hồi 150 HP'],
    ['potion_l',  '🧪 Bình Máu Lớn',  'consumable', 'epic',   0, 0, 400,  280, 90, 'Hồi 400 HP'],
    ['elixir',    '✨ Tiên Đan',      'consumable', 'legendary', 0, 0, 9999, 1500, 500, 'Hồi đầy HP'],

    // === MATERIALS (drop từ quái) ===
    ['slime_gel',     '🟢 Nhớt Slime',       'material', 'common', 0, 0, 0, 0, 5,   'Nhớp nháp'],
    ['rat_tail',      '🐀 Đuôi Chuột',       'material', 'common', 0, 0, 0, 0, 8,   'Khá... bốc mùi'],
    ['wolf_fang',     '🦷 Nanh Sói',         'material', 'common', 0, 0, 0, 0, 18,  'Sắc nhọn'],
    ['bat_wing',      '🦇 Cánh Dơi',         'material', 'common', 0, 0, 0, 0, 22,  'Mỏng manh'],
    ['goblin_ear',    '👂 Tai Goblin',       'material', 'rare',   0, 0, 0, 0, 35,  'Vật chứng săn goblin'],
    ['spider_silk',   '🕸️ Tơ Nhện',          'material', 'rare',   0, 0, 0, 0, 45,  'Bền hơn thép'],
    ['scorpion_tail', '🦂 Đuôi Bọ Cạp',      'material', 'rare',   0, 0, 0, 0, 60,  'Chứa nọc độc'],
    ['orc_tusk',      '🦏 Ngà Orc',          'material', 'epic',   0, 0, 0, 0, 90,  'To và nặng'],
    ['troll_horn',    '🦬 Sừng Troll',       'material', 'epic',   0, 0, 0, 0, 140, 'Cứng như đá'],
    ['dragon_scale',  '🔶 Vảy Rồng',         'material', 'legendary', 0, 0, 0, 0, 300, 'Cứng hơn kim cương'],
    ['void_essence',  '💜 Tinh Chất Hư Vô',  'material', 'legendary', 0, 0, 0, 0, 500, 'Năng lượng nguyên thủy'],

    // === CLASS TOKENS (đặc biệt — dùng để unlock class) ===
    ['class_token_melee',  '🎖️ Huy Hiệu Chiến Binh', 'material', 'epic', 0, 0, 0, 0, 0, 'Vật phẩm đặc biệt để học class Chiến Binh'],
    ['class_token_magic',  '🎖️ Huy Hiệu Pháp Sư',    'material', 'epic', 0, 0, 0, 0, 0, 'Vật phẩm đặc biệt để học class Pháp Sư'],
    ['class_token_ranged', '🎖️ Huy Hiệu Cung Thủ',   'material', 'epic', 0, 0, 0, 0, 0, 'Vật phẩm đặc biệt để học class Cung Thủ'],
  ];

  const insItem = db.prepare(`INSERT INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const it of items) insItem.run(...it);

  // ========== ZONES ==========
  const zones = [
    ['forest',      '🌲 Rừng Hoang',       1,  'Khu rừng xanh ngoài thành, hợp cho tân thủ'],
    ['cave',        '🕳️ Hang Tối',         5,  'Hang động ẩm thấp đầy quái nhỏ'],
    ['desert',      '🏜️ Sa Mạc Cát Đỏ',   10, 'Vùng đất khô cằn với sinh vật độc'],
    ['mountain',    '⛰️ Núi Tuyết',        15, 'Đỉnh núi lạnh giá ẩn chứa quái mạnh'],
    ['dragon_lair', '🐉 Hang Rồng',        20, 'Khu vực cực kỳ nguy hiểm — chỉ cho cao thủ'],
  ];
  const insZone = db.prepare('INSERT INTO zones (id, name, min_level, desc) VALUES (?,?,?,?)');
  for (const z of zones) insZone.run(...z);

  // ========== MONSTERS ==========
  // [id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight]
  const monsters = [
    // FOREST (Lv 1-7)
    ['slime',       '🟢 Slime',           'forest', 30,   5,  1,  8,   5,   12,  30],
    ['giant_rat',   '🐀 Chuột Khổng Lồ',  'forest', 45,   8,  2,  12,  8,   18,  25],
    ['wolf',        '🐺 Sói Hoang',       'forest', 75,   13, 4,  22,  14,  28,  20],
    ['forest_bear', '🐻 Gấu Rừng',        'forest', 130,  20, 7,  40,  25,  45,  10],

    // CAVE (Lv 5-12)
    ['bat',         '🦇 Dơi Hút Máu',     'cave',   65,   14, 3,  20,  12,  25,  25],
    ['cave_spider', '🕷️ Nhện Hang',       'cave',   100,  18, 5,  32,  20,  40,  20],
    ['goblin',      '👺 Goblin',          'cave',   140,  22, 8,  48,  30,  55,  20],
    ['goblin_chief','👹 Goblin Trưởng',  'cave',   220,  32, 12, 80,  55,  95,  10],

    // DESERT (Lv 10-18)
    ['scorpion',    '🦂 Bọ Cạp Sa Mạc',   'desert', 180,  30, 10, 70,  45,  85,  25],
    ['mummy',       '🧟 Xác Ướp',         'desert', 280,  38, 15, 110, 70,  130, 20],
    ['sand_worm',   '🪱 Sâu Cát',         'desert', 380,  45, 18, 150, 95,  180, 15],

    // MOUNTAIN (Lv 15-25)
    ['orc',         '👹 Orc Chiến Binh',  'mountain', 450, 55, 22, 200, 130, 220, 20],
    ['yeti',        '🦍 Yeti',            'mountain', 600, 65, 28, 270, 180, 300, 15],
    ['troll',       '🧌 Troll Núi',       'mountain', 850, 80, 35, 380, 250, 420, 10],

    // DRAGON LAIR (Lv 20+)
    ['young_dragon','🐲 Rồng Con',        'dragon_lair', 1200, 95,  40, 500,  350, 600,  20],
    ['dragon',      '🐉 Rồng Cổ Đại',     'dragon_lair', 2200, 130, 55, 900,  650, 1100, 10],
    ['void_dragon', '🌌 Rồng Hư Vô',      'dragon_lair', 4000, 180, 75, 1600, 1200, 2000, 3],
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
