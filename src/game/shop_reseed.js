// Reseed shop v2: potions + weapon/armor/tool theo mốc 1/10/20/30/40/50
// Chỉ chạy khi admin gọi %admin shopreset
function getDb() { return require('./../db/database'); }

// === Items definition (những item mới cần tạo nếu chưa có) ===
const NEW_ITEMS = [
  // ========== POTIONS ==========
  { id: 'potion_xl', name: '🧪 XL Health Potion', type: 'consumable', tier: 'legendary', heal: 500, price: 500, sell: 100, desc: 'Hồi 500 HP.' },
  { id: 'elixir', name: '✨ Elixir', type: 'consumable', tier: 'legendary', heal: 9999, price: 1500, sell: 300, desc: 'Hồi đầy HP.' },

  // ========== PICKAXES (LV1/10/20/30/40/50) ==========
  { id: 'pick_wood', name: '⛏️ Wooden Pickaxe', type: 'weapon', tier: 'common', atk: 1, price: 30, sell: 6, weapon_type: 'pickaxe', desc: 'Bắt buộc để đào mỏ. Common tier.' },
  { id: 'pick_copper', name: '⛏️ Copper Pickaxe', type: 'weapon', tier: 'common', atk: 2, price: 150, sell: 30, weapon_type: 'pickaxe', desc: 'Pickaxe cấp 10. +15% qty' },
  { id: 'pick_iron', name: '⛏️ Iron Pickaxe', type: 'weapon', tier: 'rare', atk: 3, price: 500, sell: 100, weapon_type: 'pickaxe', desc: 'Pickaxe cấp 20. Rare tier +15% qty' },
  { id: 'pick_silver', name: '⛏️ Silver Pickaxe', type: 'weapon', tier: 'rare', atk: 4, price: 1200, sell: 240, weapon_type: 'pickaxe', desc: 'Pickaxe cấp 30. Rare tier +15% qty' },
  { id: 'pick_gold', name: '⛏️ Gold Pickaxe', type: 'weapon', tier: 'epic', atk: 6, price: 3000, sell: 600, weapon_type: 'pickaxe', desc: 'Pickaxe cấp 40. Epic tier +30% qty' },
  { id: 'pick_mithril', name: '⛏️ Mithril Pickaxe', type: 'weapon', tier: 'epic', atk: 8, price: 8000, sell: 1600, weapon_type: 'pickaxe', desc: 'Pickaxe cấp 50. Epic tier +30% qty' },

  // ========== FISHING RODS (LV1/10/20/30/40/50) ==========
  { id: 'rod_wood', name: '🎣 Wooden Rod', type: 'weapon', tier: 'common', atk: 1, price: 30, sell: 6, weapon_type: 'fishing_rod', desc: 'Bắt buộc để câu cá. Common tier.' },
  { id: 'rod_bamboo', name: '🎣 Bamboo Rod', type: 'weapon', tier: 'common', atk: 2, price: 150, sell: 30, weapon_type: 'fishing_rod', desc: 'Fishing rod cấp 10. +15% qty' },
  { id: 'rod_iron', name: '🎣 Iron Rod', type: 'weapon', tier: 'rare', atk: 3, price: 500, sell: 100, weapon_type: 'fishing_rod', desc: 'Fishing rod cấp 20. Rare +15% qty' },
  { id: 'rod_silver', name: '🎣 Silver Rod', type: 'weapon', tier: 'rare', atk: 4, price: 1200, sell: 240, weapon_type: 'fishing_rod', desc: 'Fishing rod cấp 30. Rare +15% qty' },
  { id: 'rod_gold', name: '🎣 Gold Rod', type: 'weapon', tier: 'epic', atk: 6, price: 3000, sell: 600, weapon_type: 'fishing_rod', desc: 'Fishing rod cấp 40. Epic +30% qty' },
  { id: 'rod_mithril', name: '🎣 Mithril Rod', type: 'weapon', tier: 'epic', atk: 8, price: 8000, sell: 1600, weapon_type: 'fishing_rod', desc: 'Fishing rod cấp 50. Epic +30% qty' },

  // ========== WEAPONS MELEE (LV1/10/20/30/40/50) — atk tăng dần ==========
  { id: 'sword_wood', name: '🗡️ Wooden Sword', type: 'weapon', tier: 'common', atk: 5, price: 50, sell: 10, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí cơ bản LV1.' },
  { id: 'sword_iron', name: '⚔️ Iron Sword', type: 'weapon', tier: 'common', atk: 12, price: 250, sell: 50, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV10.' },
  { id: 'sword_steel', name: '⚔️ Steel Sword', type: 'weapon', tier: 'rare', atk: 25, price: 800, sell: 160, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV20.' },
  { id: 'sword_silver', name: '⚔️ Silver Sword', type: 'weapon', tier: 'rare', atk: 40, price: 2000, sell: 400, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV30.' },
  { id: 'sword_gold', name: '⚔️ Gold Sword', type: 'weapon', tier: 'epic', atk: 60, price: 5000, sell: 1000, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV40.' },
  { id: 'sword_mithril', name: '⚔️ Mithril Sword', type: 'weapon', tier: 'epic', atk: 85, price: 12000, sell: 2400, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV50 (đỉnh shop).' },

  // ========== WEAPONS MAGIC ==========
  { id: 'staff_wood', name: '🪄 Wooden Staff', type: 'weapon', tier: 'common', atk: 5, price: 50, sell: 10, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí cơ bản LV1.' },
  { id: 'staff_apprentice', name: '🪄 Apprentice Staff', type: 'weapon', tier: 'common', atk: 12, price: 250, sell: 50, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí LV10.' },
  { id: 'staff_mage', name: '🔮 Mage Staff', type: 'weapon', tier: 'rare', atk: 25, price: 800, sell: 160, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí LV20.' },
  { id: 'staff_wizard', name: '🔮 Wizard Staff', type: 'weapon', tier: 'rare', atk: 40, price: 2000, sell: 400, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí LV30.' },
  { id: 'staff_arcane', name: '✨ Arcane Staff', type: 'weapon', tier: 'epic', atk: 60, price: 5000, sell: 1000, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí LV40.' },
  { id: 'staff_mithril', name: '✨ Mithril Staff', type: 'weapon', tier: 'epic', atk: 85, price: 12000, sell: 2400, class_req: 'magic', weapon_type: 'staff', desc: 'Vũ khí LV50 (đỉnh shop).' },

  // ========== WEAPONS RANGED ==========
  { id: 'bow_wood', name: '🏹 Wooden Bow', type: 'weapon', tier: 'common', atk: 5, price: 50, sell: 10, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí cơ bản LV1.' },
  { id: 'bow_short', name: '🏹 Short Bow', type: 'weapon', tier: 'common', atk: 12, price: 250, sell: 50, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí LV10.' },
  { id: 'bow_long', name: '🏹 Long Bow', type: 'weapon', tier: 'rare', atk: 25, price: 800, sell: 160, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí LV20.' },
  { id: 'bow_composite', name: '🏹 Composite Bow', type: 'weapon', tier: 'rare', atk: 40, price: 2000, sell: 400, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí LV30.' },
  { id: 'bow_elven', name: '🏹 Elven Bow', type: 'weapon', tier: 'epic', atk: 60, price: 5000, sell: 1000, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí LV40.' },
  { id: 'bow_mithril', name: '🏹 Mithril Bow', type: 'weapon', tier: 'epic', atk: 85, price: 12000, sell: 2400, class_req: 'ranged', weapon_type: 'bow', desc: 'Vũ khí LV50 (đỉnh shop).' },

  // ========== ARMOR (chest, mốc 1/10/20/30/40/50) ==========
  { id: 'armor_cloth', name: '👕 Cloth Vest', type: 'armor', tier: 'common', def: 3, price: 40, sell: 8, armor_slot: 'chest', desc: 'Áo cơ bản LV1.' },
  { id: 'armor_leather', name: '🦺 Leather Vest', type: 'armor', tier: 'common', def: 8, price: 200, sell: 40, armor_slot: 'chest', desc: 'Áo LV10.' },
  { id: 'armor_chain', name: '⛓️ Chain Mail', type: 'armor', tier: 'rare', def: 15, price: 700, sell: 140, armor_slot: 'chest', desc: 'Áo LV20.' },
  { id: 'armor_iron', name: '🛡️ Iron Plate', type: 'armor', tier: 'rare', def: 25, price: 1800, sell: 360, armor_slot: 'chest', desc: 'Áo LV30.' },
  { id: 'armor_steel', name: '🛡️ Steel Plate', type: 'armor', tier: 'epic', def: 40, price: 4500, sell: 900, armor_slot: 'chest', desc: 'Áo LV40.' },
  { id: 'armor_mithril', name: '🛡️ Mithril Plate', type: 'armor', tier: 'epic', def: 60, price: 10000, sell: 2000, armor_slot: 'chest', desc: 'Áo LV50 (đỉnh shop).' },
];

// === Shop entries (item_id + price override optional) ===
// price=null → dùng price của item
const SHOP_ENTRIES = [
  // Potions (5 loại basic → advanced)
  'potion_s', 'potion_m', 'potion_l', 'potion_xl', 'elixir',
  // Pickaxes 6 mốc
  'pick_wood', 'pick_copper', 'pick_iron', 'pick_silver', 'pick_gold', 'pick_mithril',
  // Rods 6 mốc
  'rod_wood', 'rod_bamboo', 'rod_iron', 'rod_silver', 'rod_gold', 'rod_mithril',
  // Weapons melee 6 mốc
  'sword_wood', 'sword_iron', 'sword_steel', 'sword_silver', 'sword_gold', 'sword_mithril',
  // Weapons magic 6 mốc
  'staff_wood', 'staff_apprentice', 'staff_mage', 'staff_wizard', 'staff_arcane', 'staff_mithril',
  // Weapons ranged 6 mốc
  'bow_wood', 'bow_short', 'bow_long', 'bow_composite', 'bow_elven', 'bow_mithril',
  // Armor 6 mốc
  'armor_cloth', 'armor_leather', 'armor_chain', 'armor_iron', 'armor_steel', 'armor_mithril',
];

function reseedShop() {
  const db = getDb();

  // 1. Upsert items mới (INSERT OR IGNORE — giữ items cũ, chỉ thêm mới)
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO items (id, name, type, tier, atk, def, heal, price, sell, class_req, weapon_type, armor_slot, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let itemsAdded = 0;
  for (const it of NEW_ITEMS) {
    const info = insertItem.run(
      it.id, it.name, it.type, it.tier || 'common',
      it.atk || 0, it.def || 0, it.heal || 0,
      it.price || 0, it.sell || 0,
      it.class_req || '', it.weapon_type || '', it.armor_slot || '',
      it.desc || ''
    );
    if (info.changes > 0) itemsAdded++;
  }

  // 2. WIPE shop cũ
  db.prepare('DELETE FROM shop').run();

  // 3. Insert shop entries mới
  const insertShop = db.prepare('INSERT INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  let shopAdded = 0;
  for (const id of SHOP_ENTRIES) {
    const info = insertShop.run(id);
    if (info.changes > 0) shopAdded++;
  }

  return { itemsAdded, shopAdded, wiped: 'yes' };
}

module.exports = { reseedShop, NEW_ITEMS, SHOP_ENTRIES };
 
