// Danh sách item trong game. Mở rộng tự do!
// type: 'weapon' | 'armor' | 'consumable' | 'material'
const ITEMS = {
  // ===== Vũ khí =====
  wood_sword:   { id: 'wood_sword',   name: '🗡️ Kiếm Gỗ',        type: 'weapon', atk: 3,  price: 50,   sell: 20 },
  iron_sword:   { id: 'iron_sword',   name: '⚔️ Kiếm Sắt',       type: 'weapon', atk: 8,  price: 250,  sell: 100 },
  steel_sword:  { id: 'steel_sword',  name: '🗡️ Kiếm Thép',      type: 'weapon', atk: 15, price: 800,  sell: 320 },
  dragon_sword: { id: 'dragon_sword', name: '🐉 Kiếm Rồng',      type: 'weapon', atk: 30, price: 3000, sell: 1200 },

  // ===== Giáp =====
  cloth_armor:  { id: 'cloth_armor',  name: '👕 Áo Vải',          type: 'armor', def: 2,  price: 40,   sell: 15 },
  leather_armor:{ id: 'leather_armor',name: '🦺 Giáp Da',         type: 'armor', def: 6,  price: 200,  sell: 80 },
  iron_armor:   { id: 'iron_armor',   name: '🛡️ Giáp Sắt',       type: 'armor', def: 12, price: 700,  sell: 280 },
  dragon_armor: { id: 'dragon_armor', name: '🐲 Giáp Rồng',      type: 'armor', def: 25, price: 2800, sell: 1100 },

  // ===== Tiêu hao =====
  potion_s:     { id: 'potion_s',     name: '🧪 Bình Máu Nhỏ',    type: 'consumable', heal: 50,  price: 30,  sell: 10 },
  potion_m:     { id: 'potion_m',     name: '🧪 Bình Máu Vừa',    type: 'consumable', heal: 150, price: 100, sell: 35 },
  potion_l:     { id: 'potion_l',     name: '🧪 Bình Máu Lớn',    type: 'consumable', heal: 400, price: 280, sell: 90 },

  // ===== Nguyên liệu (drop từ quái) =====
  slime_gel:    { id: 'slime_gel',    name: '🟢 Nhớt Slime',      type: 'material', sell: 5 },
  wolf_fang:    { id: 'wolf_fang',    name: '🦷 Nanh Sói',        type: 'material', sell: 15 },
  goblin_ear:   { id: 'goblin_ear',   name: '👂 Tai Goblin',     type: 'material', sell: 25 },
  orc_tusk:     { id: 'orc_tusk',     name: '🦏 Ngà Orc',         type: 'material', sell: 60 },
  dragon_scale: { id: 'dragon_scale', name: '🔶 Vảy Rồng',        type: 'material', sell: 200 },
};

module.exports = { ITEMS }; 
