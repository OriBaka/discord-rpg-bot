// Hệ thống slot trang bị. Mở rộng dễ — chỉ cần thêm vào SLOTS.
const db = require('../db/database');
const { getItem } = require('./items');

// === Định nghĩa các slot ===
// item_type: loại item được equip (weapon/offhand/armor/accessory/pet)
// armor_slot: nếu là armor thì phải khớp (head/chest/legs/feet/hands)
// accessory_type: nếu là accessory thì phải khớp (ring/necklace/special)
// order: thứ tự hiển thị
const SLOTS = {
  weapon:   { id: 'weapon',   name: '🗡️ Vũ khí chính',    item_type: 'weapon',    armor_slot: null,    accessory_type: null,        order: 1  },
  offhand:  { id: 'offhand',  name: '🛡️ Tay phụ',         item_type: 'offhand',   armor_slot: null,    accessory_type: null,        order: 2  },
  head:     { id: 'head',     name: '⛑️ Đầu',              item_type: 'armor',     armor_slot: 'head',  accessory_type: null,        order: 3  },
  chest:    { id: 'chest',    name: '👕 Thân',             item_type: 'armor',     armor_slot: 'chest', accessory_type: null,        order: 4  },
  legs:     { id: 'legs',     name: '👖 Quần',             item_type: 'armor',     armor_slot: 'legs',  accessory_type: null,        order: 5  },
  feet:     { id: 'feet',     name: '👢 Giày',             item_type: 'armor',     armor_slot: 'feet',  accessory_type: null,        order: 6  },
  hands:    { id: 'hands',    name: '🧤 Găng tay',         item_type: 'armor',     armor_slot: 'hands', accessory_type: null,        order: 7  },
  ring1:    { id: 'ring1',    name: '💍 Nhẫn 1',           item_type: 'accessory', armor_slot: null,    accessory_type: 'ring',      order: 8  },
  ring2:    { id: 'ring2',    name: '💍 Nhẫn 2',           item_type: 'accessory', armor_slot: null,    accessory_type: 'ring',      order: 9  },
  necklace: { id: 'necklace', name: '📿 Dây chuyền',       item_type: 'accessory', armor_slot: null,    accessory_type: 'necklace',  order: 10 },
  special:  { id: 'special',  name: '✨ Phụ kiện đặc biệt',item_type: 'accessory', armor_slot: null,    accessory_type: 'special',   order: 11 },
  pet:      { id: 'pet',      name: '🐾 Pet',              item_type: 'pet',       armor_slot: null,    accessory_type: null,        order: 12 }, // Phase 3
};

const SLOT_ORDER = Object.values(SLOTS).sort((a, b) => a.order - b.order).map(s => s.id);

function migrate() {
  // Bảng equipped: lưu mọi slot dạng key-value
  db.exec(`CREATE TABLE IF NOT EXISTS equipped (
    user_id TEXT NOT NULL,
    slot    TEXT NOT NULL,
    item_id TEXT NOT NULL,
    PRIMARY KEY (user_id, slot)
  )`);

  // Thêm cột mới cho items
  const cols = db.prepare("PRAGMA table_info(items)").all().map(c => c.name);
  if (!cols.includes('accessory_type')) {
    db.exec(`ALTER TABLE items ADD COLUMN accessory_type TEXT NOT NULL DEFAULT ''`);
    console.log('🔧 Migrated items: thêm accessory_type');
  }
  if (!cols.includes('armor_slot')) {
    db.exec(`ALTER TABLE items ADD COLUMN armor_slot TEXT NOT NULL DEFAULT ''`);
    console.log('🔧 Migrated items: thêm armor_slot');
  }

  // Migrate weapon_id và armor_id cũ từ players → equipped
  // (chỉ chạy nếu equipped trống)
  const eqCount = db.prepare('SELECT COUNT(*) c FROM equipped').get().c;
  if (eqCount === 0) {
    const players = db.prepare("SELECT user_id, weapon_id, armor_id FROM players WHERE weapon_id IS NOT NULL OR armor_id IS NOT NULL").all();
    const ins = db.prepare('INSERT INTO equipped (user_id, slot, item_id) VALUES (?, ?, ?)');
    for (const p of players) {
      if (p.weapon_id) ins.run(p.user_id, 'weapon', p.weapon_id);
      // armor cũ → giả định là chest (slot chính)
      if (p.armor_id)  ins.run(p.user_id, 'chest', p.armor_id);
    }
    if (players.length > 0) console.log(`🔧 Migrated ${players.length} player(s) equipment → equipped table`);
  }

  // Migrate cũ: nếu armor cũ chưa có armor_slot, gán mặc định = 'chest'
  // (vì trước đây armor chỉ có 1 slot duy nhất)
  const armorWithoutSlot = db.prepare("SELECT id FROM items WHERE type='armor' AND (armor_slot IS NULL OR armor_slot='')").all();
  if (armorWithoutSlot.length > 0) {
    db.prepare("UPDATE items SET armor_slot='chest' WHERE type='armor' AND (armor_slot IS NULL OR armor_slot='')").run();
    console.log(`🔧 Migrated ${armorWithoutSlot.length} armor items → armor_slot='chest'`);
  }

  // Seed accessory + armor parts + offhand
  seedAccessories();
  seedArmorParts();
  seedOffhands();
}

function seedAccessories() {
  const existing = db.prepare("SELECT COUNT(*) c FROM items WHERE type = 'accessory'").get().c;
  if (existing > 0) return;

  const items = [
    // RINGS
    ['copper_ring',   '💍 Nhẫn Đồng',       'accessory', 'common',    2, 1, 0, 80,   30,  'Nhẫn rẻ tiền cho người mới', '', '', '', 'ring',     ''],
    ['silver_ring',   '💍 Nhẫn Bạc',        'accessory', 'rare',      5, 3, 0, 350,  140, 'Tăng nhẹ ATK & DEF',          '', '', '', 'ring',     ''],
    ['gold_ring',     '💍 Nhẫn Vàng',       'accessory', 'epic',      10, 6, 0, 1200, 480, 'Nhẫn quý tộc',                '', '', '', 'ring',     ''],
    ['dragon_ring',   '💍 Nhẫn Rồng',       'accessory', 'legendary', 20, 12, 0, 4000, 1600, 'Khắc rồng cổ — mạnh mẽ',    '', '', '', 'ring',     ''],
    ['flame_ring',    '🔥 Nhẫn Lửa',        'accessory', 'epic',      15, 0, 0, 1500, 600, 'Tăng mạnh ATK (cho pháp sư)', 'magic', '', '', 'ring', ''],
    ['guardian_ring', '🛡️ Nhẫn Hộ Mệnh',    'accessory', 'epic',      0, 18, 0, 1500, 600, 'Tăng mạnh DEF (cho chiến binh)', 'melee', '', '', 'ring', ''],

    // NECKLACES
    ['leather_necklace', '📿 Dây Chuyền Da',   'accessory', 'common',    1, 1, 0, 50,   20,  'Đơn giản',                '', '', '', 'necklace', ''],
    ['pearl_necklace',   '📿 Dây Chuyền Ngọc', 'accessory', 'rare',      4, 4, 30, 400,  160, 'Hồi 30 HP tự động/trận', '', '', '', 'necklace', ''],
    ['phoenix_amulet',   '🔥 Bùa Phượng Hoàng','accessory', 'epic',      8, 8, 100, 1800, 720, 'Hồi 100 HP tự động/trận','', '', '', 'necklace', ''],
    ['void_amulet',      '🌌 Bùa Hư Vô',       'accessory', 'legendary', 18, 18, 200, 5000, 2000, 'Cực mạnh, hồi 200 HP', '', '', '', 'necklace', ''],

    // SPECIAL ACCESSORIES
    ['lucky_charm',   '🍀 Bùa May Mắn',    'accessory', 'rare',      0, 0, 0, 800,  320,  '+10% gold sau combat',       '', '', '', 'special',  ''],
    ['hunter_mark',   '🎯 Dấu Ấn Thợ Săn', 'accessory', 'epic',      0, 0, 0, 2000, 800,  '+15% drop rate item',         '', '', '', 'special',  ''],
    ['scholar_tome',  '📖 Cổ Thư Học Giả', 'accessory', 'epic',      0, 0, 0, 2000, 800,  '+20% XP nhận được',           '', '', '', 'special',  ''],
    ['void_compass',  '🧭 La Bàn Hư Vô',   'accessory', 'legendary', 0, 0, 0, 6000, 2400, '+25% gold, +25% XP, +20% drop','', '', '', 'special', ''],
  ];

  const ins = db.prepare(`INSERT INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of items) ins.run(...it);

  const shopAdds = ['copper_ring', 'silver_ring', 'leather_necklace', 'pearl_necklace', 'lucky_charm'];
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  for (const id of shopAdds) insShop.run(id);

  console.log(`🌱 Seeded ${items.length} accessories (${shopAdds.length} into shop)`);
}

function seedArmorParts() {
  // Kiểm tra đã có armor head chưa (= seed armor parts mới)
  const existing = db.prepare("SELECT COUNT(*) c FROM items WHERE type='armor' AND armor_slot='head'").get().c;
  if (existing > 0) return;

  // Format: [id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot]
  const items = [
    // === HEAD ===
    ['cloth_hat',      '🎩 Mũ Vải',        'armor', 'common',    0, 1, 0, 30,   12,   'Đội cho ấm đầu',         '',       '', 'light',  '', 'head'],
    ['leather_cap',    '🧢 Mũ Da',         'armor', 'common',    0, 3, 0, 100,  40,   'Mũ da đơn giản',         '',       '', 'light',  '', 'head'],
    ['iron_helm',      '⛑️ Mũ Sắt',        'armor', 'rare',      0, 7, 0, 400,  160,  'Bảo vệ đầu cứng cáp',    'melee',  '', 'heavy',  '', 'head'],
    ['knight_helm',    '👑 Mũ Hiệp Sĩ',    'armor', 'epic',      0, 14, 0, 1200, 480,  'Mũ trận hoàng gia',     'melee',  '', 'heavy',  '', 'head'],
    ['dragon_helm',    '🐲 Mũ Rồng',       'armor', 'legendary', 0, 22, 0, 3500, 1400, 'Vảy rồng đúc thành mũ',  'melee',  '', 'heavy',  '', 'head'],
    ['mage_hood',      '🎓 Mũ Trùm Phép',  'armor', 'rare',      2, 5, 0, 400,  160,  'Tăng cả ATK & DEF',      'magic',  '', 'robe',   '', 'head'],
    ['archmage_hood',  '🪄 Mũ Đại Pháp Sư','armor', 'legendary', 8, 16, 0, 3500, 1400, 'Mũ của bậc thầy phép',   'magic',  '', 'robe',   '', 'head'],
    ['hunter_hood',    '🏹 Mũ Trùm Thợ Săn','armor', 'rare',     2, 6, 0, 400,  160,  'Giấu mặt khi ẩn nấp',    'ranged', '', 'medium', '', 'head'],
    ['ranger_hat',     '🪶 Mũ Cung Thủ',   'armor', 'epic',      4, 11, 0, 1200, 480,  'Phong cách kiểm lâm',    'ranged', '', 'medium', '', 'head'],

    // === CHEST (thay armor cũ) ===
    ['cloth_robe',     '👕 Áo Vải Mỏng',   'armor', 'common',    0, 2, 0, 40,   15,   'Mặc cho có',             '',       '', 'light',  '', 'chest'],
    ['leather_vest',   '🦺 Áo Da',         'armor', 'common',    0, 6, 0, 200,  80,   'Áo da thuộc',            '',       '', 'light',  '', 'chest'],
    ['chain_mail',     '⛓️ Áo Giáp Xích',  'armor', 'rare',      0, 12, 0, 500, 200,  'Xích sắt đan tay',        'melee',  '', 'medium', '', 'chest'],
    ['iron_plate',     '🛡️ Giáp Sắt',      'armor', 'rare',      0, 18, 0, 900, 360,  'Bảo vệ thân trên',       'melee',  '', 'heavy',  '', 'chest'],
    ['knight_plate',   '⚜️ Giáp Hiệp Sĩ',  'armor', 'epic',      0, 28, 0, 2000, 800, 'Trang phục hoàng gia',   'melee',  '', 'heavy',  '', 'chest'],
    ['dragon_plate',   '🐲 Giáp Rồng',     'armor', 'legendary', 0, 42, 0, 5000, 2000,'Vảy rồng cổ',            'melee',  '', 'heavy',  '', 'chest'],
    ['mage_robe',      '🧙 Áo Choàng Phép','armor', 'rare',      4, 8, 0, 500,  200, 'Tăng cả ATK',             'magic',  '', 'robe',   '', 'chest'],
    ['archmage_robe',  '✨ Áo Đại Pháp Sư','armor', 'epic',      10, 18, 0, 2000, 800,'Áo của bậc thầy',        'magic',  '', 'robe',   '', 'chest'],
    ['void_robe_chest','👻 Áo Hư Vô',      'armor', 'legendary', 18, 32, 0, 5000, 2000,'Hấp thụ sát thương',    'magic',  '', 'robe',   '', 'chest'],
    ['hunter_vest',    '🎯 Áo Thợ Săn',    'armor', 'rare',      3, 10, 0, 500,  200, 'Nhẹ và bền',             'ranged', '', 'medium', '', 'chest'],
    ['ranger_garb',    '🪶 Áo Cung Thủ',   'armor', 'epic',      6, 20, 0, 2000, 800, 'Áo của kiểm lâm',        'ranged', '', 'medium', '', 'chest'],

    // === LEGS ===
    ['cloth_pants',    '👖 Quần Vải',      'armor', 'common',    0, 2, 0, 40,   15,   'Cơ bản',                 '',       '', 'light',  '', 'legs'],
    ['leather_pants',  '👖 Quần Da',       'armor', 'common',    0, 4, 0, 150,  60,   'Thoải mái',              '',       '', 'light',  '', 'legs'],
    ['iron_greaves',   '🦿 Quần Sắt',      'armor', 'rare',      0, 10, 0, 600, 240, 'Nặng nhưng chắc',         'melee',  '', 'heavy',  '', 'legs'],
    ['knight_greaves', '⚜️ Quần Hiệp Sĩ',  'armor', 'epic',      0, 18, 0, 1500, 600, 'Hoàng gia',              'melee',  '', 'heavy',  '', 'legs'],
    ['dragon_greaves', '🐲 Quần Rồng',     'armor', 'legendary', 0, 28, 0, 4000, 1600,'Cứng như đá',            'melee',  '', 'heavy',  '', 'legs'],
    ['mage_pants',     '🧙 Quần Pháp Sư',  'armor', 'rare',      2, 6, 0, 500,  200, 'Thuận tiện vẽ phù',       'magic',  '', 'robe',   '', 'legs'],
    ['hunter_pants',   '🪶 Quần Cung Thủ', 'armor', 'rare',      2, 8, 0, 500,  200, 'Linh hoạt',               'ranged', '', 'medium', '', 'legs'],

    // === FEET ===
    ['cloth_shoes',    '👞 Giày Vải',      'armor', 'common',    0, 1, 0, 30,   12,   'Mềm mại',                '',       '', 'light',  '', 'feet'],
    ['leather_boots',  '👢 Giày Da',       'armor', 'common',    0, 3, 0, 120,  48,   'Bền hơn',                '',       '', 'light',  '', 'feet'],
    ['iron_boots',     '🥾 Giày Sắt',      'armor', 'rare',      0, 7, 0, 400,  160, 'Đạp mạnh',                'melee',  '', 'heavy',  '', 'feet'],
    ['knight_boots',   '⚜️ Giày Hiệp Sĩ',  'armor', 'epic',      0, 14, 0, 1200, 480,'Hoàng gia',              'melee',  '', 'heavy',  '', 'feet'],
    ['dragon_boots',   '🐲 Giày Rồng',     'armor', 'legendary', 0, 22, 0, 3500, 1400,'Bước chân long lanh',    'melee',  '', 'heavy',  '', 'feet'],
    ['mage_slippers',  '✨ Giày Pháp Sư',  'armor', 'rare',      2, 5, 0, 400,  160, 'Nhẹ nhàng',               'magic',  '', 'robe',   '', 'feet'],
    ['hunter_boots',   '🦅 Giày Cung Thủ', 'armor', 'rare',      2, 6, 0, 400,  160, 'Im lặng khi di chuyển',   'ranged', '', 'medium', '', 'feet'],

    // === HANDS ===
    ['cloth_gloves',   '🧤 Găng Vải',      'armor', 'common',    0, 1, 0, 30,   12,   'Cơ bản',                 '',       '', 'light',  '', 'hands'],
    ['leather_gloves', '🧤 Găng Da',       'armor', 'common',    1, 2, 0, 100,  40,   'Cầm vũ khí chắc hơn',    '',       '', 'light',  '', 'hands'],
    ['iron_gauntlets', '🥊 Găng Sắt',      'armor', 'rare',      2, 7, 0, 400,  160, 'Tăng cả ATK & DEF',       'melee',  '', 'heavy',  '', 'hands'],
    ['knight_gauntlets','⚜️ Găng Hiệp Sĩ', 'armor', 'epic',      5, 14, 0, 1200, 480,'Hoàng gia',              'melee',  '', 'heavy',  '', 'hands'],
    ['dragon_claws',   '🐲 Vuốt Rồng',     'armor', 'legendary', 10, 22, 0, 3500, 1400,'Sắc như dao',           'melee',  '', 'heavy',  '', 'hands'],
    ['mage_gloves',    '✋ Găng Pháp Sư',  'armor', 'rare',      4, 4, 0, 400,  160, 'Tăng phép',               'magic',  '', 'robe',   '', 'hands'],
    ['archmage_gloves','🪄 Găng Đại Phép', 'armor', 'epic',      10, 10, 0, 1200, 480,'Tăng mạnh phép thuật',  'magic',  '', 'robe',   '', 'hands'],
    ['hunter_gloves',  '🎯 Găng Thợ Săn',  'armor', 'rare',      4, 5, 0, 400,  160, 'Bắn cung chính xác hơn',  'ranged', '', 'medium', '', 'hands'],
    ['ranger_gloves',  '🪶 Găng Cung Thủ', 'armor', 'epic',      9, 11, 0, 1200, 480,'Bắn chuẩn xác',           'ranged', '', 'medium', '', 'hands'],
  ];

  const ins = db.prepare(`INSERT INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of items) ins.run(...it);

  // Thêm 1 số đồ basic vào shop
  const shopAdds = [
    'cloth_hat', 'leather_cap',
    'cloth_robe', 'leather_vest',
    'cloth_pants', 'leather_pants',
    'cloth_shoes', 'leather_boots',
    'cloth_gloves', 'leather_gloves',
  ];
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  for (const id of shopAdds) insShop.run(id);

  console.log(`🌱 Seeded ${items.length} armor parts (head/chest/legs/feet/hands)`);
}

function seedOffhands() {
  // Check đã có offhand chưa
  const existing = db.prepare("SELECT COUNT(*) c FROM items WHERE type='offhand'").get().c;
  if (existing > 0) return;

  const items = [
    // [id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot]
    // === SHIELDS (melee) ===
    ['wood_shield',    '🪵 Khiên Gỗ',       'offhand', 'common',    0, 5, 0, 100,  40,  'Khiên cơ bản',                    'melee',  'shield',  '', '', ''],
    ['iron_shield',    '🛡️ Khiên Sắt',      'offhand', 'rare',      0, 12, 0, 500, 200, 'Bền và chắc',                     'melee',  'shield',  '', '', ''],
    ['knight_shield',  '⚜️ Khiên Hiệp Sĩ',  'offhand', 'epic',      2, 20, 0, 1500, 600,'Hoàng gia',                       'melee',  'shield',  '', '', ''],
    ['dragon_shield',  '🐲 Khiên Rồng',     'offhand', 'legendary', 5, 35, 0, 4500, 1800,'Phản 10% sát thương',            'melee',  'shield',  '', '', ''],

    // === ORBS (magic) ===
    ['crystal_orb',    '🔮 Cầu Pha Lê',     'offhand', 'rare',      8, 0, 20, 500,  200, 'Tăng phép & hồi nhẹ',             'magic',  'orb',     '', '', ''],
    ['flame_orb',      '🔥 Cầu Lửa',        'offhand', 'epic',      18, 0, 0, 1500, 600, 'Tăng mạnh phép tấn công',         'magic',  'orb',     '', '', ''],
    ['void_orb',       '🌌 Cầu Hư Vô',      'offhand', 'legendary', 30, 5, 50, 4500, 1800,'Đỉnh cao phép thuật',            'magic',  'orb',     '', '', ''],

    // === QUIVERS (ranged) ===
    ['leather_quiver', '🎒 Túi Tên Da',     'offhand', 'common',    3, 0, 0, 80,   30,  'Túi đựng tên cơ bản',             'ranged', 'quiver',  '', '', ''],
    ['hunter_quiver',  '🏹 Túi Tên Thợ Săn','offhand', 'rare',      8, 2, 0, 500,  200, 'Tăng ATK & DEF nhẹ',              'ranged', 'quiver',  '', '', ''],
    ['ranger_quiver',  '🎯 Túi Tên Bậc Thầy','offhand', 'epic',      16, 4, 0, 1500, 600,'Mũi tên chính xác',              'ranged', 'quiver',  '', '', ''],
    ['void_quiver',    '🌌 Túi Tên Hư Vô',  'offhand', 'legendary', 28, 8, 0, 4500, 1800,'Mũi tên xuyên không gian',       'ranged', 'quiver',  '', '', ''],

    // === BUCKLER (dùng chung — không class_req) ===
    ['small_buckler',  '🛡️ Khiên Nhỏ',      'offhand', 'common',    0, 3, 0, 60,   24,  'Khiên nhỏ, ai cũng dùng được',    '',       'buckler', '', '', ''],
    ['traveler_pouch', '💼 Túi Lữ Hành',    'offhand', 'rare',      2, 2, 10, 350,  140, 'Tăng nhẹ ATK/DEF/heal',           '',       'pouch',   '', '', ''],
  ];

  const ins = db.prepare(`INSERT INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const it of items) ins.run(...it);

  // Add một số vào shop
  const shopAdds = ['wood_shield', 'iron_shield', 'leather_quiver', 'crystal_orb', 'small_buckler', 'traveler_pouch'];
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  for (const id of shopAdds) insShop.run(id);

  console.log(`🌱 Seeded ${items.length} offhand items`);
}

// ===== Equipped CRUD =====
function getEquipped(userId) {
  const rows = db.prepare('SELECT slot, item_id FROM equipped WHERE user_id = ?').all(userId);
  const map = {};
  for (const r of rows) map[r.slot] = r.item_id;
  return map;
}

function setEquipped(userId, slot, itemId) {
  if (itemId === null || itemId === undefined) {
    db.prepare('DELETE FROM equipped WHERE user_id=? AND slot=?').run(userId, slot);
  } else {
    db.prepare(`INSERT INTO equipped (user_id, slot, item_id) VALUES (?,?,?)
      ON CONFLICT(user_id, slot) DO UPDATE SET item_id = excluded.item_id`)
      .run(userId, slot, itemId);
  }
}

function clearEquipped(userId, slotPattern) {
  if (slotPattern === 'all' || slotPattern === '*') {
    db.prepare('DELETE FROM equipped WHERE user_id=?').run(userId);
  } else {
    db.prepare('DELETE FROM equipped WHERE user_id=? AND slot=?').run(userId, slotPattern);
  }
}

// ===== Tính chỉ số hiệu lực =====
function getTotalBonus(userId) {
  const equipped = getEquipped(userId);
  let atk = 0, def = 0, heal = 0;
  for (const slot of Object.keys(equipped)) {
    const it = getItem(equipped[slot]);
    if (!it) continue;
    atk  += it.atk  || 0;
    def  += it.def  || 0;
    heal += it.heal || 0;
  }
  return { atk, def, heal };
}

// ===== Tìm slot phù hợp để equip 1 item =====
function findSlotForItem(item, equipped) {
  if (item.type === 'weapon')  return 'weapon';
  if (item.type === 'offhand') return 'offhand';
  if (item.type === 'pet')     return 'pet';

  // armor: theo armor_slot
  if (item.type === 'armor') {
    if (item.armor_slot && SLOTS[item.armor_slot]) return item.armor_slot;
    return 'chest'; // fallback
  }

  // accessory: tìm slot khớp accessory_type
  if (item.type === 'accessory') {
    const at = item.accessory_type;
    if (!at) return null;
    if (at === 'ring') {
      if (!equipped.ring1) return 'ring1';
      if (!equipped.ring2) return 'ring2';
      return 'ring1';
    }
    if (at === 'necklace') return 'necklace';
    if (at === 'special')  return 'special';
  }
  return null;
}

// ===== Check item có hợp với slot không =====
function isItemValidForSlot(item, slotId) {
  const slot = SLOTS[slotId];
  if (!slot) return false;
  if (item.type !== slot.item_type) return false;
  if (slot.armor_slot && item.armor_slot !== slot.armor_slot) return false;
  if (slot.accessory_type && item.accessory_type !== slot.accessory_type) return false;
  return true;
}

module.exports = {
  SLOTS, SLOT_ORDER,
  migrate,
  getEquipped, setEquipped, clearEquipped,
  getTotalBonus,
  findSlotForItem, isItemValidForSlot,
}; 
