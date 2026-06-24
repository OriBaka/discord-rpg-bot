// Recipe system: chung cho cooking & crafting
const db = require('./../db/database');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL,            -- cook | craft
      job_type     TEXT NOT NULL,            -- cooking | crafting
      min_job_level INTEGER NOT NULL DEFAULT 1,
      inputs       TEXT NOT NULL DEFAULT '[]', -- JSON: [{item_id, qty}, ...]
      output_id    TEXT NOT NULL,
      output_qty   INTEGER NOT NULL DEFAULT 1,
      xp_gain      INTEGER NOT NULL DEFAULT 10,
      desc         TEXT NOT NULL DEFAULT '',
      created_by   TEXT NOT NULL DEFAULT 'system',
      created_at   INTEGER NOT NULL DEFAULT 0
    );
  `);

  seedDefaults();
}

function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) c FROM recipes').get().c;
  if (count > 0) return;

  // === FOOD ITEMS (output của cooking) — type=consumable, có thể có buff temporary ===
  // Để đơn giản: food = consumable heal HP. Buff khác sẽ implement trong food.js sau.
  const foods = [
    ['food_fish_soup',  '🍲 Fish Soup',       'consumable', 'common', 0, 0, 80,  0, 15,  'Warming fish soup (heal 80)'],
    ['food_grilled_fish','🐟 Grilled Fish',   'consumable', 'common', 0, 0, 120, 0, 20,  'Tasty grilled fish (heal 120)'],
    ['food_salmon_sushi','🍣 Salmon Sushi',   'consumable', 'rare',   0, 0, 250, 0, 40,  'Fresh salmon sushi (heal 250)'],
    ['food_tuna_steak', '🥩 Tuna Steak',     'consumable', 'rare',   0, 0, 400, 0, 70,  'Juicy tuna steak (heal 400)'],
    ['food_seafood_platter','🍱 Seafood Platter','consumable','epic',  0, 0, 800, 0, 150, 'Royal seafood (heal 800)'],
    ['food_kraken_dish','🐙 Kraken Dish',    'consumable', 'legendary', 0, 0, 1500, 0, 300, 'Legendary kraken meal (heal 1500)'],
  ];

  // === SMELTED MATERIALS (output của crafting trung gian) ===
  const ingots = [
    ['copper_ingot',  '🟧 Copper Ingot',  'material', 'common', 0, 0, 0, 0, 12,  'Smelted copper'],
    ['iron_ingot',    '⬜ Iron Ingot',     'material', 'common', 0, 0, 0, 0, 30,  'Smelted iron'],
    ['gold_ingot',    '🟨 Gold Ingot',     'material', 'rare',   0, 0, 0, 0, 80,  'Smelted gold'],
    ['mithril_ingot', '✨ Mithril Ingot',  'material', 'epic',   0, 0, 0, 0, 180, 'Refined mithril'],
  ];

  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,'','','','','')`);
  for (const it of [...foods, ...ingots]) insItem.run(...it);

  // === RECIPES ===
  // Format: [id, name, type, job_type, min_lv, inputs JSON, output, qty, xp, desc]
  const recipes = [
    // === COOKING ===
    ['recipe_fish_soup',     'Fish Soup',      'cook', 'cooking', 1,  '[{"item_id":"fish_small","qty":2}]',                     'food_fish_soup',      1, 10, 'Basic fish soup'],
    ['recipe_grilled_fish',  'Grilled Fish',   'cook', 'cooking', 5,  '[{"item_id":"fish_carp","qty":1},{"item_id":"coal","qty":1}]', 'food_grilled_fish',   1, 20, 'Grilled over coal'],
    ['recipe_salmon_sushi',  'Salmon Sushi',   'cook', 'cooking', 15, '[{"item_id":"fish_salmon","qty":2}]',                    'food_salmon_sushi',   1, 50, 'Requires steady hands'],
    ['recipe_tuna_steak',    'Tuna Steak',     'cook', 'cooking', 25, '[{"item_id":"fish_tuna","qty":1},{"item_id":"coal","qty":2}]', 'food_tuna_steak',     1, 80, 'Juicy and rare'],
    ['recipe_seafood_platter','Seafood Platter','cook', 'cooking', 40, '[{"item_id":"fish_swordfish","qty":1},{"item_id":"fish_tuna","qty":1},{"item_id":"fish_salmon","qty":1}]', 'food_seafood_platter', 1, 150, 'Royal feast'],
    ['recipe_kraken_dish',   'Kraken Dish',    'cook', 'cooking', 60, '[{"item_id":"fish_kraken","qty":1},{"item_id":"fish_void","qty":1}]', 'food_kraken_dish', 1, 300, 'Legendary meal'],

    // === CRAFTING — Smelting ===
    ['recipe_copper_ingot',  'Smelt Copper',   'craft','crafting', 1,  '[{"item_id":"copper_ore","qty":2},{"item_id":"coal","qty":1}]', 'copper_ingot',  1, 8,  'Smelt copper ore'],
    ['recipe_iron_ingot',    'Smelt Iron',     'craft','crafting', 8,  '[{"item_id":"iron_ore","qty":2},{"item_id":"coal","qty":1}]',   'iron_ingot',    1, 15, 'Smelt iron ore'],
    ['recipe_gold_ingot',    'Smelt Gold',     'craft','crafting', 20, '[{"item_id":"gold_ore","qty":2},{"item_id":"coal","qty":2}]',   'gold_ingot',    1, 40, 'Smelt gold ore'],
    ['recipe_mithril_ingot', 'Smelt Mithril',  'craft','crafting', 35, '[{"item_id":"mithril_ore","qty":2},{"item_id":"coal","qty":3}]', 'mithril_ingot', 1, 80, 'Refine mithril'],

    // === CRAFTING — Weapons ===
    ['recipe_iron_sword',    'Forge Iron Sword',   'craft','crafting', 10, '[{"item_id":"iron_ingot","qty":3}]',                          'iron_sword',    1, 30,  'Forge a basic iron sword'],
    ['recipe_steel_sword',   'Forge Steel Sword',  'craft','crafting', 25, '[{"item_id":"iron_ingot","qty":5},{"item_id":"coal","qty":3}]','steel_sword',  1, 70,  'Forge steel from iron'],
    ['recipe_silver_bow',    'Craft Silver Bow',   'craft','crafting', 15, '[{"item_id":"silver_ore","qty":3},{"item_id":"spider_silk","qty":2}]', 'silver_bow', 1, 50,  'Craft a hunter bow'],
    ['recipe_flame_staff',   'Craft Flame Staff',  'craft','crafting', 25, '[{"item_id":"mithril_ingot","qty":1},{"item_id":"gem_ruby","qty":1}]', 'flame_staff', 1, 100, 'Imbue staff with fire'],
    ['recipe_dragon_sword',  'Forge Dragon Sword', 'craft','crafting', 50, '[{"item_id":"dragon_bone","qty":3},{"item_id":"dragon_scale","qty":5},{"item_id":"mithril_ingot","qty":3}]', 'dragon_sword', 1, 300, 'Forge from dragon parts'],

    // === CRAFTING — Armor (chest examples) ===
    ['recipe_iron_plate',    'Forge Iron Plate',   'craft','crafting', 12, '[{"item_id":"iron_ingot","qty":4}]',                          'iron_plate',    1, 35,  'Iron chest armor'],
    ['recipe_dragon_plate',  'Forge Dragon Plate', 'craft','crafting', 50, '[{"item_id":"dragon_scale","qty":8},{"item_id":"mithril_ingot","qty":4}]', 'dragon_plate', 1, 350, 'Legendary chest armor'],

    // === CRAFTING — Accessories ===
    ['recipe_copper_ring',   'Craft Copper Ring',  'craft','crafting', 3,  '[{"item_id":"copper_ingot","qty":1}]',                        'copper_ring',   1, 10,  'Simple ring'],
    ['recipe_silver_ring',   'Craft Silver Ring',  'craft','crafting', 12, '[{"item_id":"silver_ore","qty":2}]',                          'silver_ring',   1, 25,  'Silver ring'],
    ['recipe_gold_ring',     'Craft Gold Ring',    'craft','crafting', 25, '[{"item_id":"gold_ingot","qty":1},{"item_id":"gem_ruby","qty":1}]', 'gold_ring',  1, 60,  'Gold ring with ruby'],
    ['recipe_dragon_ring',   'Craft Dragon Ring',  'craft','crafting', 55, '[{"item_id":"dragon_bone","qty":1},{"item_id":"gold_ingot","qty":3},{"item_id":"diamond","qty":1}]', 'dragon_ring', 1, 250, 'Engraved dragon ring'],
  ];

  const ins = db.prepare(`INSERT INTO recipes
    (id, name, type, job_type, min_job_level, inputs, output_id, output_qty, xp_gain, desc, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  for (const r of recipes) ins.run(...r, now);

  console.log(`🌱 Seeded ${foods.length + ingots.length} food/ingot items, ${recipes.length} recipes`);
}

// === CRUD ===
function getRecipe(id) {
  return db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
}

function getAllRecipes() {
  return db.prepare('SELECT * FROM recipes ORDER BY type, min_job_level').all();
}

function getRecipesByType(type) {
  return db.prepare('SELECT * FROM recipes WHERE type = ? ORDER BY min_job_level').all(type);
}

function parseInputs(recipe) {
  try { return JSON.parse(recipe.inputs || '[]'); }
  catch { return []; }
}

function createRecipe(data) {
  db.prepare(`INSERT INTO recipes
    (id, name, type, job_type, min_job_level, inputs, output_id, output_qty, xp_gain, desc, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(data.id, data.name, data.type, data.job_type,
         data.min_job_level || 1,
         typeof data.inputs === 'string' ? data.inputs : JSON.stringify(data.inputs || []),
         data.output_id, data.output_qty || 1, data.xp_gain || 10,
         data.desc || '', data.created_by || 'system', Date.now());
  return getRecipe(data.id);
}

function deleteRecipe(id) {
  return db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes > 0;
}

module.exports = {
  migrate,
  getRecipe, getAllRecipes, getRecipesByType,
  parseInputs,
  createRecipe, deleteRecipe,
}; 
