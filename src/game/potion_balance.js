// CHUYỂN BÌNH MÁU TỪ SỐ CỐ ĐỊNH SANG % MAX HP.
//
// Vì sao phải làm: sau khi thang HP được làm lại (Lv.1 = 60 HP → Lv.45 = 632),
// các bình máu vẫn giữ số hồi CỐ ĐỊNH từ thời HP còn tính bằng hàng nghìn:
//
//   id               heal cũ   % max HP ở Lv.1 / Lv.10 / Lv.30 / Lv.45
//   potion_l           400     100%  / 100%  /  92%  /  63%
//   potion_ancient    1200     100%  / 100%  / 100%  / 100%
//   potion_astral     2500     100%  / 100%  / 100%  / 100%
//   elixir            9999     100%  / 100%  / 100%  / 100%
//
// Nghĩa là: một bình 700 vàng "hồi 1200 HP" thực chất là hồi đầy máu ở MỌI
// cấp, còn bình nhỏ 30 vàng "hồi 50 HP" chỉ còn 8% max HP ở Lv.45 — thang giá
// đảo lộn hoàn toàn. Đổi sang % thì mỗi bình giữ đúng vai trò của nó ở mọi cấp.
//
// Bảng dưới đây là GIÁ TRỊ CUỐI (không phải công thức), chọn theo giá:
//   ~0,9 vàng / 1% max HP cho bình thường, đắt hơn ở bình cao cấp vì tiện mang.
//
// Chạy 1 lần cho mỗi DB (guard bằng meta) và CHỈ ghi khi item tồn tại — không
// tạo item mới, để không đụng vào các seed khác.
// KHÔNG require database ở top-level: database.js gọi migrate() của module này
// trong lúc chính nó đang nạp dở → require vòng → database.js thấy module rỗng
// và HOÃN migrate (deferMigrate). Với bot thì hoãn 1 tick là vô hại, nhưng với
// script/test chạy đồng bộ thì migrate không bao giờ chạy và item giữ số cũ
// (đo được: elixir vẫn heal 9999, heal_pct 0). Require bên trong hàm thì
// module.exports của database đã sẵn sàng.
let _db = null;
const getDb = () => (_db = _db || require('../db/database'));

const META_KEY = 'potion_balance_v1';

// id → % max HP. heal được đặt về 0 để use.js dùng heal_pct (xem use.js).
const POTIONS = {
  potion_s: 25,
  potion_m: 45,
  potion_l: 55,
  potion_xl: 60,
  potion_percent: 35,      // đã là % từ trước — giữ nguyên giá trị
  potion_full: 65,
  potion_ancient: 70,
  potion_astral: 85,
  elixir: 100,
  // Thức ăn nấu/câu được: cũng là thuốc hồi máu, cùng vấn đề
  food_fish_soup: 25,
  food_grilled_fish: 30,
  food_trout_smoked: 30,
  food_salmon_sushi: 40,
  food_tuna_steak: 50,
  food_golden_sashimi: 55,
  food_seafood_platter: 65,
  food_kraken_dish: 80,
};

// Giá phải đi cùng %. Đo được sau khi đổi sang %: potion_l 55% giá 280 vàng
// còn potion_percent 35% giá 400 vàng — bình đắt hơn lại hồi ít hơn, nên không
// ai mua. Chỉ ghi đè những món lệch thang; các món khác giữ giá seed.
const PRICE_FIX = {
  potion_percent: 60,    // 35% — giữa potion_s (25%, 30) và potion_m (45%, 100)
  potion_full: 620,      // 65%
  potion_astral: 1400,   // 85% — trước 1600, cao hơn cả elixir 100%
  elixir: 2000,          // 100% max HP → đắt nhất
};

function migrate() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  // Đảm bảo cột tồn tại trên DB cũ (expansive_seed cũng thêm, nhưng ở đây cần
  // chắc chắn vì migrate này chạy sau và phụ thuộc vào nó).
  const cols = db.prepare('PRAGMA table_info(items)').all().map(c => c.name);
  if (!cols.includes('heal_pct')) {
    db.exec('ALTER TABLE items ADD COLUMN heal_pct INTEGER NOT NULL DEFAULT 0');
  }

  const upd = db.prepare('UPDATE items SET heal = 0, heal_pct = ?, desc = ? WHERE id = ?');
  const getDesc = db.prepare('SELECT desc FROM items WHERE id = ?');
  let changed = 0;
  for (const [id, pct] of Object.entries(POTIONS)) {
    const cur = getDesc.get(id);
    if (!cur) continue;                      // item không tồn tại → không tạo mới
    // Mô tả phải khớp với con số thật, nếu không người chơi đọc "hồi 1200 HP"
    // trong khi bình chỉ hồi 70% max HP.
    let desc = cur.desc || '';
    if (/\d+\s*HP/.test(desc)) desc = desc.replace(/\d+\s*HP/, `${pct}% max HP`);
    changed += upd.run(pct, desc, id).changes;   // thứ tự khớp SQL: heal_pct, desc, id
  }

  const updPrice = db.prepare('UPDATE items SET price = ? WHERE id = ?');
  for (const [id, price] of Object.entries(PRICE_FIX)) updPrice.run(price, id);

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));
  if (changed > 0) {
    console.log(`🧪 Balance: ${changed} bình máu/thức ăn hồi theo % max HP`);
  }
}

module.exports = { migrate, POTIONS, META_KEY };
