// High-tier crafting seed: items tier 60-100 + recipes
// Chỉ chạy khi admin gọi %admin hightierreset
function getDb() { return require('./../db/database'); }

// === NEW MATERIALS (ingots + special) ===
const NEW_MATERIALS = [
  // Ingots trung gian cho tier cao
  { id: 'diamond_ingot', name: '💠 Refined Diamond', type: 'material', tier: 'epic', price: 0, sell: 200, desc: 'Kim cương đã tinh luyện.' },
  { id: 'void_essence',  name: '🌀 Void Essence',   type: 'material', tier: 'legendary', price: 0, sell: 500, desc: 'Tinh chất từ Void Pool. Cần để craft T90+.' },
  { id: 'void_ingot',    name: '🌌 Void Ingot',     type: 'material', tier: 'legendary', price: 0, sell: 1500, desc: 'Tinh luyện từ void_essence + mithril.' },
  { id: 'dragon_scale',  name: '🐲 Dragon Scale',   type: 'material', tier: 'legendary', price: 0, sell: 400, desc: 'Vảy rồng, hiếm. Drop từ dragon_mine (thêm).' },
];

// === TIER 60-100 GEAR (weapons + armor + tools) ===
const NEW_GEAR = [
  // ========== WEAPONS MELEE T60-T100 ==========
  { id: 'sword_mithril_forged', name: '⚔️ Forged Mithril Sword', type: 'weapon', tier: 'epic',      atk: 110, sell: 3000,  class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí forged LV60.' },
  { id: 'sword_diamond',        name: '💠 Diamond Sword',        type: 'weapon', tier: 'epic',      atk: 145, sell: 5000,  class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV70.' },
  { id: 'sword_dragon_forged',  name: '🐲 Dragon Bone Sword',    type: 'weapon', tier: 'legendary', atk: 190, sell: 9000,  class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV80.' },
  { id: 'sword_apocalypse',     name: '☄️ Apocalypse Blade',     type: 'weapon', tier: 'legendary', atk: 245, sell: 15000, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV90.' },
  { id: 'sword_void',           name: '🌌 Void Blade',           type: 'weapon', tier: 'legendary', atk: 320, sell: 30000, class_req: 'melee', weapon_type: 'sword', desc: 'Vũ khí LV100 (đỉnh).' },

  // ========== WEAPONS MAGIC T60-T100 ==========
  { id: 'staff_mithril_forged', name: '✨ Forged Mithril Staff', type: 'weapon', tier: 'epic',      atk: 110, sell: 3000,  class_req: 'magic',  weapon_type: 'staff', desc: 'Vũ khí forged LV60.' },
  { id: 'staff_diamond',        name: '💠 Diamond Staff',        type: 'weapon', tier: 'epic',      atk: 145, sell: 5000,  class_req: 'magic',  weapon_type: 'staff', desc: 'Vũ khí LV70.' },
  { id: 'staff_dragon_forged',  name: '🐲 Dragon Bone Staff',    type: 'weapon', tier: 'legendary', atk: 190, sell: 9000,  class_req: 'magic',  weapon_type: 'staff', desc: 'Vũ khí LV80.' },
  { id: 'staff_apocalypse',     name: '☄️ Apocalypse Staff',     type: 'weapon', tier: 'legendary', atk: 245, sell: 15000, class_req: 'magic',  weapon_type: 'staff', desc: 'Vũ khí LV90.' },
  { id: 'staff_void',           name: '🌌 Void Staff',           type: 'weapon', tier: 'legendary', atk: 320, sell: 30000, class_req: 'magic',  weapon_type: 'staff', desc: 'Vũ khí LV100 (đỉnh).' },

  // ========== WEAPONS RANGED T60-T100 ==========
  { id: 'bow_mithril_forged',   name: '🏹 Forged Mithril Bow',   type: 'weapon', tier: 'epic',      atk: 110, sell: 3000,  class_req: 'ranged', weapon_type: 'bow',   desc: 'Vũ khí forged LV60.' },
  { id: 'bow_diamond',          name: '💠 Diamond Bow',          type: 'weapon', tier: 'epic',      atk: 145, sell: 5000,  class_req: 'ranged', weapon_type: 'bow',   desc: 'Vũ khí LV70.' },
  { id: 'bow_dragon_forged',    name: '🐲 Dragon Bone Bow',      type: 'weapon', tier: 'legendary', atk: 190, sell: 9000,  class_req: 'ranged', weapon_type: 'bow',   desc: 'Vũ khí LV80.' },
  { id: 'bow_apocalypse',       name: '☄️ Apocalypse Bow',       type: 'weapon', tier: 'legendary', atk: 245, sell: 15000, class_req: 'ranged', weapon_type: 'bow',   desc: 'Vũ khí LV90.' },
  { id: 'bow_void',             name: '🌌 Void Bow',             type: 'weapon', tier: 'legendary', atk: 320, sell: 30000, class_req: 'ranged', weapon_type: 'bow',   desc: 'Vũ khí LV100 (đỉnh).' },

  // ========== ARMOR CHEST T60-T100 ==========
  { id: 'armor_mithril_forged', name: '🛡️ Forged Mithril Plate', type: 'armor', tier: 'epic',      def: 75,  sell: 2500, armor_slot: 'chest', desc: 'Armor LV60.' },
  { id: 'armor_diamond',        name: '💠 Diamond Plate',        type: 'armor', tier: 'epic',      def: 100, sell: 4500, armor_slot: 'chest', desc: 'Armor LV70.' },
  { id: 'armor_dragon',         name: '🐲 Dragon Scale Armor',   type: 'armor', tier: 'legendary', def: 135, sell: 8000, armor_slot: 'chest', desc: 'Armor LV80.' },
  { id: 'armor_apocalypse',     name: '☄️ Apocalypse Armor',     type: 'armor', tier: 'legendary', def: 175, sell: 14000, armor_slot: 'chest', desc: 'Armor LV90.' },
  { id: 'armor_void',           name: '🌌 Void Plate',           type: 'armor', tier: 'legendary', def: 230, sell: 28000, armor_slot: 'chest', desc: 'Armor LV100 (đỉnh).' },

  // ========== PICKAXES T60-T100 ==========
  { id: 'pick_diamond',    name: '⛏️ Diamond Pickaxe',    type: 'weapon', tier: 'epic',      atk: 10, sell: 2500,  weapon_type: 'pickaxe', desc: 'Pickaxe LV60. Epic +30% qty' },
  { id: 'pick_dragon',     name: '⛏️ Dragon Pickaxe',     type: 'weapon', tier: 'legendary', atk: 12, sell: 5000,  weapon_type: 'pickaxe', desc: 'Pickaxe LV70. Legendary +50% qty' },
  { id: 'pick_apocalypse', name: '⛏️ Apocalypse Pickaxe', type: 'weapon', tier: 'legendary', atk: 15, sell: 9000,  weapon_type: 'pickaxe', desc: 'Pickaxe LV80. Legendary +50% qty' },
  { id: 'pick_void',       name: '⛏️ Void Pickaxe',       type: 'weapon', tier: 'legendary', atk: 20, sell: 18000, weapon_type: 'pickaxe', desc: 'Pickaxe LV100 (đỉnh). Legendary +50% qty' },

  // ========== FISHING RODS T60-T100 ==========
  { id: 'rod_diamond',    name: '🎣 Diamond Rod',    type: 'weapon', tier: 'epic',      atk: 10, sell: 2500,  weapon_type: 'fishing_rod', desc: 'Rod LV60. Epic +30% qty' },
  { id: 'rod_dragon',     name: '🎣 Dragon Rod',     type: 'weapon', tier: 'legendary', atk: 12, sell: 5000,  weapon_type: 'fishing_rod', desc: 'Rod LV70. Legendary +50% qty' },
  { id: 'rod_apocalypse', name: '🎣 Apocalypse Rod', type: 'weapon', tier: 'legendary', atk: 15, sell: 9000,  weapon_type: 'fishing_rod', desc: 'Rod LV80. Legendary +50% qty' },
  { id: 'rod_void',       name: '🎣 Void Rod',       type: 'weapon', tier: 'legendary', atk: 20, sell: 18000, weapon_type: 'fishing_rod', desc: 'Rod LV100 (đỉnh). Legendary +50% qty' },
];

// === RECIPES ===
// Format: [id, name, min_lv, inputs_json, output_id, output_qty, xp, desc]
const NEW_RECIPES = [
  // ========== INGOTS TRUNG GIAN ==========
  ['recipe_diamond_ingot', 'Refine Diamond', 55, '[{"item_id":"diamond","qty":2},{"item_id":"coal","qty":3}]', 'diamond_ingot', 1, 100, 'Tinh luyện diamond thô'],
  ['recipe_void_ingot',    'Refine Void',    75, '[{"item_id":"void_essence","qty":2},{"item_id":"mithril_ore","qty":5},{"item_id":"coal","qty":5}]', 'void_ingot', 1, 250, 'Kết hợp void essence + mithril'],

  // ========== WEAPONS MELEE ==========
  ['recipe_sword_mithril_forged', 'Forge Mithril Sword',    60, '[{"item_id":"mithril_ore","qty":10},{"item_id":"gold_ore","qty":3},{"item_id":"gem_ruby","qty":2}]',                                                              'sword_mithril_forged', 1, 200, 'Rèn Mithril Sword T60'],
  ['recipe_sword_diamond',        'Forge Diamond Sword',    70, '[{"item_id":"mithril_ore","qty":15},{"item_id":"diamond_ingot","qty":3},{"item_id":"gem_sapphire","qty":3}]',                                                    'sword_diamond',        1, 350, 'Rèn Diamond Sword T70'],
  ['recipe_sword_dragon_forged',  'Forge Dragon Sword',     80, '[{"item_id":"dragon_bone","qty":10},{"item_id":"mithril_ore","qty":20},{"item_id":"diamond_ingot","qty":5}]',                                                    'sword_dragon_forged',  1, 600, 'Rèn Dragon Sword T80'],
  ['recipe_sword_apocalypse',     'Forge Apocalypse Blade', 90, '[{"item_id":"dragon_bone","qty":25},{"item_id":"diamond_ingot","qty":10},{"item_id":"gem_ruby","qty":3},{"item_id":"gem_sapphire","qty":3},{"item_id":"void_essence","qty":1}]', 'sword_apocalypse',     1, 1000, 'Rèn Apocalypse Blade T90'],
  ['recipe_sword_void',           'Forge Void Blade',      100, '[{"item_id":"dragon_bone","qty":50},{"item_id":"void_ingot","qty":5},{"item_id":"diamond_ingot","qty":20},{"item_id":"dragon_scale","qty":10}]',                 'sword_void',           1, 2000, 'Rèn Void Blade T100 (đỉnh)'],

  // ========== WEAPONS MAGIC ==========
  ['recipe_staff_mithril_forged', 'Craft Mithril Staff',    60, '[{"item_id":"mithril_ore","qty":10},{"item_id":"gold_ore","qty":3},{"item_id":"gem_sapphire","qty":2}]',                                                          'staff_mithril_forged', 1, 200, 'Craft Mithril Staff T60'],
  ['recipe_staff_diamond',        'Craft Diamond Staff',    70, '[{"item_id":"mithril_ore","qty":15},{"item_id":"diamond_ingot","qty":3},{"item_id":"gem_ruby","qty":3}]',                                                         'staff_diamond',        1, 350, 'Craft Diamond Staff T70'],
  ['recipe_staff_dragon_forged',  'Craft Dragon Staff',     80, '[{"item_id":"dragon_bone","qty":10},{"item_id":"mithril_ore","qty":20},{"item_id":"diamond_ingot","qty":5}]',                                                     'staff_dragon_forged',  1, 600, 'Craft Dragon Staff T80'],
  ['recipe_staff_apocalypse',     'Craft Apocalypse Staff', 90, '[{"item_id":"dragon_bone","qty":25},{"item_id":"diamond_ingot","qty":10},{"item_id":"gem_ruby","qty":3},{"item_id":"gem_sapphire","qty":3},{"item_id":"void_essence","qty":1}]', 'staff_apocalypse',     1, 1000, 'Craft Apocalypse Staff T90'],
  ['recipe_staff_void',           'Craft Void Staff',      100, '[{"item_id":"dragon_bone","qty":50},{"item_id":"void_ingot","qty":5},{"item_id":"diamond_ingot","qty":20},{"item_id":"dragon_scale","qty":10}]',                  'staff_void',           1, 2000, 'Craft Void Staff T100 (đỉnh)'],

  // ========== WEAPONS RANGED ==========
  ['recipe_bow_mithril_forged',   'Craft Mithril Bow',      60, '[{"item_id":"mithril_ore","qty":10},{"item_id":"gold_ore","qty":3},{"item_id":"gem_sapphire","qty":2}]',                                                          'bow_mithril_forged',   1, 200, 'Craft Mithril Bow T60'],
  ['recipe_bow_diamond',          'Craft Diamond Bow',      70, '[{"item_id":"mithril_ore","qty":15},{"item_id":"diamond_ingot","qty":3},{"item_id":"gem_ruby","qty":3}]',                                                         'bow_diamond',          1, 350, 'Craft Diamond Bow T70'],
  ['recipe_bow_dragon_forged',    'Craft Dragon Bow',       80, '[{"item_id":"dragon_bone","qty":10},{"item_id":"mithril_ore","qty":20},{"item_id":"diamond_ingot","qty":5}]',                                                     'bow_dragon_forged',    1, 600, 'Craft Dragon Bow T80'],
  ['recipe_bow_apocalypse',       'Craft Apocalypse Bow',   90, '[{"item_id":"dragon_bone","qty":25},{"item_id":"diamond_ingot","qty":10},{"item_id":"gem_ruby","qty":3},{"item_id":"gem_sapphire","qty":3},{"item_id":"void_essence","qty":1}]', 'bow_apocalypse',       1, 1000, 'Craft Apocalypse Bow T90'],
  ['recipe_bow_void',             'Craft Void Bow',        100, '[{"item_id":"dragon_bone","qty":50},{"item_id":"void_ingot","qty":5},{"item_id":"diamond_ingot","qty":20},{"item_id":"dragon_scale","qty":10}]',                  'bow_void',             1, 2000, 'Craft Void Bow T100 (đỉnh)'],

  // ========== ARMOR CHEST ==========
  ['recipe_armor_mithril_forged', 'Forge Mithril Plate',    60, '[{"item_id":"mithril_ore","qty":12},{"item_id":"gold_ore","qty":5},{"item_id":"iron_ore","qty":10}]',                                                              'armor_mithril_forged', 1, 200, 'Forge Mithril Plate T60'],
  ['recipe_armor_diamond',        'Forge Diamond Plate',    70, '[{"item_id":"mithril_ore","qty":18},{"item_id":"diamond_ingot","qty":4},{"item_id":"gem_sapphire","qty":4}]',                                                     'armor_diamond',        1, 350, 'Forge Diamond Plate T70'],
  ['recipe_armor_dragon',         'Forge Dragon Armor',     80, '[{"item_id":"dragon_scale","qty":8},{"item_id":"mithril_ore","qty":25},{"item_id":"diamond_ingot","qty":5}]',                                                     'armor_dragon',         1, 600, 'Forge Dragon Armor T80'],
  ['recipe_armor_apocalypse',     'Forge Apocalypse Armor', 90, '[{"item_id":"dragon_scale","qty":20},{"item_id":"diamond_ingot","qty":10},{"item_id":"gem_ruby","qty":3},{"item_id":"gem_sapphire","qty":3},{"item_id":"void_essence","qty":1}]','armor_apocalypse',     1, 1000, 'Forge Apocalypse Armor T90'],
  ['recipe_armor_void',           'Forge Void Plate',      100, '[{"item_id":"dragon_scale","qty":40},{"item_id":"void_ingot","qty":5},{"item_id":"diamond_ingot","qty":25}]',                                                     'armor_void',           1, 2000, 'Forge Void Plate T100 (đỉnh)'],

  // ========== PICKAXES T60-T100 (4 recipes) ==========
  ['recipe_pick_diamond',    'Forge Diamond Pickaxe',    60, '[{"item_id":"diamond_ingot","qty":3},{"item_id":"mithril_ore","qty":8}]',                                                            'pick_diamond',    1, 180, 'Pickaxe T60'],
  ['recipe_pick_dragon',     'Forge Dragon Pickaxe',     70, '[{"item_id":"dragon_bone","qty":5},{"item_id":"diamond_ingot","qty":3},{"item_id":"mithril_ore","qty":12}]',                          'pick_dragon',     1, 300, 'Pickaxe T70'],
  ['recipe_pick_apocalypse', 'Forge Apocalypse Pickaxe', 85, '[{"item_id":"dragon_bone","qty":15},{"item_id":"diamond_ingot","qty":8},{"item_id":"gem_ruby","qty":2}]',                              'pick_apocalypse', 1, 700, 'Pickaxe T85'],
  ['recipe_pick_void',       'Forge Void Pickaxe',      100, '[{"item_id":"void_ingot","qty":3},{"item_id":"dragon_bone","qty":30},{"item_id":"diamond_ingot","qty":15}]',                           'pick_void',       1, 1500, 'Pickaxe T100 (đỉnh)'],

  // ========== FISHING RODS T60-T100 (4 recipes) ==========
  ['recipe_rod_diamond',    'Craft Diamond Rod',    60, '[{"item_id":"diamond_ingot","qty":3},{"item_id":"mithril_ore","qty":8}]',                                                            'rod_diamond',    1, 180, 'Rod T60'],
  ['recipe_rod_dragon',     'Craft Dragon Rod',     70, '[{"item_id":"dragon_bone","qty":5},{"item_id":"diamond_ingot","qty":3},{"item_id":"mithril_ore","qty":12}]',                          'rod_dragon',     1, 300, 'Rod T70'],
  ['recipe_rod_apocalypse', 'Craft Apocalypse Rod', 85, '[{"item_id":"dragon_bone","qty":15},{"item_id":"diamond_ingot","qty":8},{"item_id":"gem_sapphire","qty":2}]',                          'rod_apocalypse', 1, 700, 'Rod T85'],
  ['recipe_rod_void',       'Craft Void Rod',      100, '[{"item_id":"void_ingot","qty":3},{"item_id":"dragon_bone","qty":30},{"item_id":"diamond_ingot","qty":15}]',                           'rod_void',       1, 1500, 'Rod T100 (đỉnh)'],
];

// === VOID POOL & DRAGON MINE — thêm drop void_essence + dragon_scale ===
// (Chỉ add nếu chưa có)
const NEW_GATHER_DROPS = [
  // Void essence từ Void Pool (fishing lv 50)
  { zone_id: 'void_pool', item_id: 'void_essence', chance: 0.08, qty_min: 1, qty_max: 1 },
  // Dragon scale từ Dragon Bone Mine (mining lv 50)
  { zone_id: 'dragon_mine', item_id: 'dragon_scale', chance: 0.15, qty_min: 1, qty_max: 1 },
];

function seedHighTier() {
  const db = getDb();
  const { inferMinLevel } = require('./level_req');
  let itemsAdded = 0, recipesAdded = 0, dropsAdded = 0;

  // 1. Add materials + gear
  const insItem = db.prepare(`
    INSERT OR IGNORE INTO items (id, name, type, tier, atk, def, heal, price, sell, class_req, weapon_type, armor_slot, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updMinLevel = db.prepare('UPDATE items SET min_level = ? WHERE id = ?');
  for (const it of [...NEW_MATERIALS, ...NEW_GEAR]) {
    const info = insItem.run(
      it.id, it.name, it.type, it.tier || 'common',
      it.atk || 0, it.def || 0, it.heal || 0,
      it.price || 0, it.sell || 0,
      it.class_req || '', it.weapon_type || '', it.armor_slot || '',
      it.desc || ''
    );
    if (info.changes > 0) itemsAdded++;
    try {
      const lv = inferMinLevel(it);
      updMinLevel.run(lv, it.id);
    } catch (e) { /* ignore */ }
  }

  // 2. Add recipes (INSERT OR IGNORE để không đè existing)
  const insRecipe = db.prepare(`
    INSERT OR IGNORE INTO recipes (id, name, type, job_type, min_job_level, inputs, output_id, output_qty, xp_gain, desc, created_by, created_at)
    VALUES (?, ?, 'craft', 'crafting', ?, ?, ?, ?, ?, ?, 'system', strftime('%s','now'))
  `);
  for (const r of NEW_RECIPES) {
    const [id, name, minLv, inputs, outputId, outputQty, xp, desc] = r;
    const info = insRecipe.run(id, name, minLv, inputs, outputId, outputQty, xp, desc);
    if (info.changes > 0) recipesAdded++;
  }

  // 3. Add gather drops
  const insDrop = db.prepare('INSERT OR IGNORE INTO gather_drops (zone_id, item_id, chance, qty_min, qty_max) VALUES (?, ?, ?, ?, ?)');
  for (const d of NEW_GATHER_DROPS) {
    const info = insDrop.run(d.zone_id, d.item_id, d.chance, d.qty_min, d.qty_max);
    if (info.changes > 0) dropsAdded++;
  }

  return { itemsAdded, recipesAdded, dropsAdded };
}

module.exports = { seedHighTier, NEW_MATERIALS, NEW_GEAR, NEW_RECIPES, NEW_GATHER_DROPS };
