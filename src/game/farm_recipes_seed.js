// NỐI NGUYÊN LIỆU FARM VÀO CHUỖI CHẾ TÁC.
//
// Vì sao file này tồn tại: `recipes.js` chỉ seed khi bảng `recipes` RỖNG
// (`seedDefaults()` return sớm nếu count > 0), nên mọi recipe thêm sau này
// phải nằm ở một migration riêng — nếu nhét vào danh sách cũ thì chỉ DB mới
// tinh mới thấy, còn DB đang chạy thật thì không.
//
// Vấn đề được sửa (đo từ DB): trong 20 nguyên liệu rơi ra từ farm, có 4 món
// không được recipe nào dùng — tức là người chơi đào/câu ra rồi chỉ biết bán:
//
//     fish_trout     🐟 Trout        (river Lv.10 60%, lake Lv.20 40%)
//     fish_golden    ✨ Golden Fish   (ocean Lv.35 5%, void_pool Lv.50 15%)
//     gem_sapphire   💎 Sapphire     (gold_vein Lv.20 8%, mithril_cave Lv.35 20%)
//     stone          🪨 Stone        (stone_quarry Lv.1)
//
// Với vai trò farm = "nguồn nguyên liệu", nguyên liệu không có đầu ra là lỗi
// thiết kế: người chơi có lý do đào nhưng không có lý do GIỮ. Ba món đầu được
// nối vào chuỗi chế tác dưới đây.
//
// Riêng `stone` được giữ nguyên là nguyên liệu bán lấy vàng — đây là quyết
// định có chủ ý, không phải bỏ sót: stone là nguyên liệu của zone Lv.1 mà
// người chơi mới farm đầu tiên. Nếu bắt buộc stone phải có trong recipe thì
// hoặc là recipe đó vô dụng, hoặc là mọi recipe cấp thấp đều bị khoá sau một
// nguyên liệu rác. Để nó làm "vàng lẻ" cho người mới là vai trò tốt hơn.
//
// Nguyên tắc: các recipe mới KHÔNG tạo nguyên liệu mới, chỉ dùng đồ đã có
// trong game và nối vào đúng nghề (cooking / crafting) đã tồn tại.

const db = require('../db/database');

const META_KEY = 'farm_recipes_v1';

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const done = db.prepare('SELECT value FROM meta WHERE key = ?').get(META_KEY);
  if (done) return;

  const now = Date.now();

  // --- Vật phẩm đầu ra mới (chỉ 3 món, mỗi món là đầu ra của 1 recipe) ---
  // Format khớp schema items: id, name, type, tier, atk, def, heal, price,
  // sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot
  const newItems = [
    ['food_trout_smoked', '🐟 Smoked Trout', 'consumable', 'common', 0, 0, 160, 0, 45,
      'Cá hồi suối hun khói trên than, thơm và chắc thịt (hồi 160 HP)'],
    ['food_golden_sashimi', '✨ Golden Sashimi', 'consumable', 'rare', 0, 0, 550, 0, 180,
      'Cá vàng thái lát mỏng, ánh lên như có nắng bên trong (hồi 550 HP)'],
    ['sapphire_amulet', '💎 Sapphire Amulet', 'accessory', 'epic', 6, 12, 0, 0, 1100,
      'Mặt dây chuyền nạm sapphire cắt cạnh, mát lạnh khi đeo vào cổ'],
  ];

  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc,
     class_req, weapon_type, armor_type, accessory_type, armor_slot)
    VALUES (?,?,?,?,?,?,?,?,?,?,'','','','','')`);
  let itemsAdded = 0;
  for (const it of newItems) itemsAdded += insItem.run(...it).changes;

  // --- Recipe mới ---
  // [id, name, type, job_type, min_lv, inputs, output, qty, xp, desc]
  //
  // Mốc level chọn để lấp khoảng trống trong chuỗi hiện có (đang nhảy
  // Lv5 → Lv15 ở cooking, Lv25 → Lv35 ở crafting):
  const newRecipes = [
    // Trout: river Lv.10 (60%) / lake Lv.20 (40%). Recipe Lv.8 — mở được
    // ngay khi vừa vào river. CỐ Ý không dùng coal: coal chỉ rơi ở iron_mine
    // (Lv.10 MINING), nên nếu recipe câu cá đòi coal thì người chỉ chơi
    // fishing sẽ bị chặn bởi một nghề khác. Giữ chuỗi cá khép kín.
    ['recipe_trout_smoked', 'Smoke Trout', 'cook', 'cooking', 8,
      '[{"item_id":"fish_trout","qty":2},{"item_id":"fish_carp","qty":1}]',
      'food_trout_smoked', 1, 30, 'Trout smoked over wood'],

    // Golden Fish: ocean Lv.35 (5%) / void_pool Lv.50 (15%) — rất hiếm.
    // Mốc Lv.25 nằm giữa chuỗi cooking (Lv.15 sushi → Lv.25 tuna), và cũng
    // là mốc mà người chơi có thể gặp golden fish nhờ kho báu ở zone thấp.
    ['recipe_golden_sashimi', 'Slice Golden Fish', 'cook', 'cooking', 25,
      '[{"item_id":"fish_golden","qty":1},{"item_id":"fish_salmon","qty":1}]',
      'food_golden_sashimi', 1, 75, 'Golden fish, sliced thin'],

    // Sapphire: gold_vein Lv.20 (8%) / mithril_cave Lv.35 (20%).
    // Trước đây sapphire chỉ để bán — giờ là nguyên liệu chính của 1 phụ kiện.
    // Cần `gold_ingot` (chế từ gold_ore ở crafting Lv.20) nên đây là recipe
    // nối mining → crafting, đúng vai trò "farm nuôi chế tác".
    ['recipe_sapphire_amulet', 'Craft Sapphire Amulet', 'craft', 'crafting', 30,
      '[{"item_id":"gem_sapphire","qty":2},{"item_id":"gold_ingot","qty":1}]',
      'sapphire_amulet', 1, 120, 'Set a cut sapphire in gold'],
  ];

  const insRecipe = db.prepare(`INSERT OR IGNORE INTO recipes
    (id, name, type, job_type, min_job_level, inputs, output_id, output_qty,
     xp_gain, desc, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'system',?)`);
  let recipesAdded = 0;
  for (const r of newRecipes) recipesAdded += insRecipe.run(...r, now).changes;

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(now));

  if (recipesAdded > 0) {
    console.log(`🍳 Farm recipes: +${recipesAdded} recipe, +${itemsAdded} vật phẩm`);
  }
}

module.exports = { migrate, META_KEY };
