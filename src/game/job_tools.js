// CÔNG CỤ BỔ TRỢ NGHỀ (job tools)
//
// VẤN ĐỀ ĐO ĐƯỢC trước khi viết module này:
//   1. Bonus của pickaxe/cần câu tính THEO TIER, không theo món:
//        common ×1.00, rare ×1.15, epic ×1.30, legendary ×1.50
//      Mà bảng công cụ chỉ có common/rare/epic → nâng cấp TRONG CÙNG TIER
//      không thay đổi gì: pick_iron (2000g) và pick_silver (4200g) đều ×1.15;
//      pick_gold (12250g) và pick_mithril (26000g) đều ×1.30. Người chơi trả
//      thêm 4200 vàng để nhận đúng 0% cải thiện.
//   2. Bonus chỉ có NHÂN SỐ LƯỢNG, không có cơ hội rơi: trượt drop thì công cụ
//      xịn cũng vô dụng (rơi hay không là như nhau với mọi pickaxe).
//   3. Chỉ mining/fishing có công cụ. Foraging (nghề yield cao nhất), cooking
//      và crafting không có gì để mua sau khi mở nghề → 3/5 nghề không có
//      đường tiến bộ nào ngoài cày cấp.
//
// GIẢI PHÁP
//   Mỗi công cụ có thông số RIÊNG trong bảng `job_tools`:
//     drop_bonus   : +% cơ hội rơi  (chance × (1 + drop_bonus), chặn ở 100%)
//     qty_bonus    : +% số lượng    (giữ đúng mức cũ theo tier → không nerf ai)
//     extra_chance : cooking — cơ hội ra thêm 1 món nữa
//     save_chance  : crafting — cơ hội KHÔNG tiêu nguyên liệu
//   Bảng này đọc từ DB nên %item / %shop hiện thông số mà không phải sửa code
//   khi thêm công cụ mới (chỉ cần thêm row).
//
// CÂN BẰNG: drop_bonus tối đa +15% ⇒ sản lượng kỳ vọng +15% (giá bán/item
// không đổi). qty_bonus giữ NGUYÊN giá trị cũ theo tier nên không ai bị nerf.
// Foraging cố tình KHÔNG có qty_bonus: đo được gold/min Lv.50 của foraging
// (333) đã cao hơn mining (286) và fishing (236) — nhân thêm số lượng ở đó sẽ
// nới rộng khoảng cách thay vì thu hẹp. Xem tools/measure_jobs.js.

const db = require('../db/database');

const META_KEY = 'job_tools_v2';

// [item_id, job, drop_bonus, qty_bonus, extra_chance, save_chance]
const STATS = [
  // === PICKAXE (mining) — qty giữ đúng tier cũ: common 1.00, rare 1.15, epic 1.30
  ['pick_wood',     'mining', 0.00, 0.00, 0, 0],
  ['pick_copper',   'mining', 0.03, 0.00, 0, 0],
  ['pick_iron',     'mining', 0.06, 0.15, 0, 0],
  ['pick_silver',   'mining', 0.09, 0.15, 0, 0],
  ['pick_gold',     'mining', 0.12, 0.30, 0, 0],
  ['pick_mithril',  'mining', 0.15, 0.30, 0, 0],

  // === CẦN CÂU (fishing) — cùng thang với pickaxe
  ['rod_wood',      'fishing', 0.00, 0.00, 0, 0],
  ['rod_bamboo',    'fishing', 0.03, 0.00, 0, 0],
  ['rod_iron',      'fishing', 0.06, 0.15, 0, 0],
  ['rod_silver',    'fishing', 0.09, 0.15, 0, 0],
  ['rod_gold',      'fishing', 0.12, 0.30, 0, 0],
  ['rod_mithril',   'fishing', 0.15, 0.30, 0, 0],

  // === GIỎ HÁI (foraging) — chỉ cộng cơ hội rơi, xem ghi chú cân bằng ở trên
  ['basket_reed',   'foraging', 0.05, 0.00, 0, 0],
  ['basket_bamboo', 'foraging', 0.10, 0.00, 0, 0],
  ['basket_moon',   'foraging', 0.15, 0.00, 0, 0],

  // === DAO BẾP (cooking) — cơ hội ra thêm 1 món
  ['knife_kitchen', 'cooking',  0, 0, 0.05, 0],
  ['knife_steel',   'cooking',  0, 0, 0.10, 0],
  ['knife_master',  'cooking',  0, 0, 0.18, 0],

  // === BÚA THỢ (crafting) — cơ hội không tiêu nguyên liệu
  ['hammer_tinker', 'crafting', 0, 0, 0, 0.05],
  ['hammer_iron',   'crafting', 0, 0, 0, 0.10],
  ['hammer_master', 'crafting', 0, 0, 0, 0.18],
];

// Công cụ MỚI (pickaxe/cần câu đã có trong farm_tools_seed).
// type='tool' (không phải 'weapon') để không lọt vào bảng vũ khí chiến đấu:
// mô hình cân bằng lọc type='weapon', và %equip từ chối type lạ → công cụ chỉ
// nằm trong túi, đúng ý "bổ trợ nghề", không chiếm slot chiến đấu.
const NEW_ITEMS = [
  // Giỏ hái — foraging
  { id: 'basket_reed',   name: '🧺 Reed Basket',     tier: 'common', price: 150,  min_level: 1,
    desc: 'Giỏ đan từ sậy ven sông. Nhặt được nấm và quả rơi vãi mà tay không bỏ sót — người hái lượm nào cũng bắt đầu từ đây.' },
  { id: 'basket_bamboo', name: '🧺 Bamboo Basket',   tier: 'rare',   price: 1200, min_level: 12,
    desc: 'Giỏ tre hai ngăn, có nắp đậy giữ thảo dược không bị dập. Nặng hơn giỏ sậy nhưng chứa được gấp đôi.' },
  { id: 'basket_moon',   name: '🧺 Moonweave Basket', tier: 'epic',  price: 7000, min_level: 25,
    desc: 'Đan từ sợi cỏ chỉ nở về đêm, thành giỏ mỏng như vải. Thứ bỏ vào đây không bị rơi ra dù chạy qua bụi gai.' },

  // Dao bếp — cooking
  { id: 'knife_kitchen', name: '🔪 Kitchen Knife',   tier: 'common', price: 200,  min_level: 1,
    desc: 'Dao thép một lưỡi của quán trọ. Sắc đủ để cắt thịt, mẻ đủ để phải mài mỗi tối — nhưng chưa làm hỏng bữa nào.' },
  { id: 'knife_steel',   name: '🔪 Steel Chef Knife', tier: 'rare',  price: 1600, min_level: 12,
    desc: 'Lưỡi thép cân bằng đúng chuẩn, cắt một nhát qua cả khúc cá mà không nát thớ. Người nấu ăn giỏi đánh giá dao, không đánh giá nồi.' },
  { id: 'knife_master',  name: '🔪 Master Cleaver',  tier: 'epic',   price: 9000, min_level: 28,
    desc: 'Lưỡi dày bản rộng của đầu bếp trưởng, sống dao khắc tên bảy người đã dùng trước đó. Mỗi nhát cắt đều chia đúng phần.' },

  // Búa thợ — crafting
  { id: 'hammer_tinker', name: '🔨 Tinker Hammer',   tier: 'common', price: 200,  min_level: 1,
    desc: 'Búa nhỏ của thợ sửa đồ, đầu búa nặng vừa tay. Gõ đúng nhịp thì miếng sắt không nứt — gõ sai thì phải nấu lại từ đầu.' },
  { id: 'hammer_iron',   name: '🔨 Iron Smith Hammer', tier: 'rare', price: 1600, min_level: 12,
    desc: 'Cán gỗ dẻo, đầu sắt rèn liền khối. Cân nặng dồn hết vào mặt búa nên một nhát là đủ, tiết kiệm cả vật liệu lẫn sức.' },
  { id: 'hammer_master', name: '🔨 Master Forge Hammer', tier: 'epic', price: 9000, min_level: 28,
    desc: 'Búa của thợ rèn làng, truyền tay qua bốn đời. Không phải vì nó đẹp — mà vì chưa ai rèn được cái cân bằng hơn.' },
];

// Thang tier để so sánh 2 công cụ cùng job (cao hơn = tốt hơn khi cùng min_level)
const TIER_RANK = { common: 1, rare: 2, epic: 3, legendary: 4 };

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_tools (
      item_id      TEXT PRIMARY KEY,
      job          TEXT NOT NULL,               -- mining | fishing | foraging | cooking | crafting
      drop_bonus   REAL NOT NULL DEFAULT 0,     -- +% cơ hội rơi
      qty_bonus    REAL NOT NULL DEFAULT 0,     -- +% số lượng
      extra_chance REAL NOT NULL DEFAULT 0,     -- cooking: +1 món
      save_chance  REAL NOT NULL DEFAULT 0      -- crafting: không tiêu nguyên liệu
    );
  `);

  // 1) Tạo công cụ mới (idempotent theo id — KHÔNG dùng guard meta cho phần này,
  //    nếu không DB đã tồn tại sẽ không bao giờ nhận được công cụ thêm sau).
  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, price, sell, desc, min_level)
    VALUES (?,?,?,?,0,0,?,?,?,?)`);
  let itemsAdded = 0;
  for (const t of NEW_ITEMS) {
    const sell = Math.round(t.price * 0.4);
    itemsAdded += insItem.run(t.id, t.name, 'tool', t.tier, t.price, sell, t.desc, t.min_level).changes;
  }

  // 2) Bán ở shop — công cụ phải có đường mua, nếu không lại là nội dung chết
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  let shopAdded = 0;
  for (const t of NEW_ITEMS) shopAdded += insShop.run(t.id).changes;

  // 3) Thông số công cụ (chỉ khi item tồn tại — pickaxe/cần câu do
  //    farm_tools_seed tạo, nên module này phải chạy SAU nó)
  const itemExists = db.prepare('SELECT 1 FROM items WHERE id = ?');
  const insStat = db.prepare(`INSERT OR IGNORE INTO job_tools
    (item_id, job, drop_bonus, qty_bonus, extra_chance, save_chance) VALUES (?,?,?,?,?,?)`);
  let statsAdded = 0;
  const missing = [];
  for (const s of STATS) {
    if (!itemExists.get(s[0])) { missing.push(s[0]); continue; }
    statsAdded += insStat.run(...s).changes;
  }
  if (missing.length > 0) {
    console.warn(`⚠️  job_tools: bỏ ${missing.length} công cụ chưa tồn tại: ${missing.join(', ')}`);
  }

  // 4) Meta chỉ để log 1 lần
  db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  if (!db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(META_KEY, String(Date.now()));
    if (itemsAdded || statsAdded) {
      console.log(`🧰 Job tools: +${itemsAdded} công cụ bổ trợ, +${statsAdded} bộ thông số`);
    }
    if (shopAdded > 0) console.log(`🏪 Job tools: +${shopAdded} công cụ vào shop`);
  }
}

function getTool(itemId) {
  return db.prepare('SELECT * FROM job_tools WHERE item_id = ?').get(itemId) || null;
}

function getToolsByJob(job) {
  return db.prepare(`SELECT jt.*, i.name, i.tier, i.price, i.min_level, i.desc
    FROM job_tools jt JOIN items i ON i.id = jt.item_id
    WHERE jt.job = ? ORDER BY i.min_level, i.price`).all(job);
}

// Công cụ tốt nhất người chơi ĐANG CÓ và ĐỦ CẤP cho nghề này.
// Không đòi equip: công cụ nằm trong túi, đúng quy ước của %mine/%fish.
function bestTool(userId, job, jobLevel = null) {
  jobLevel ??= require('./jobs').getJob(userId, job).level;
  const rows = db.prepare(`SELECT jt.*, i.name, i.tier, i.min_level
    FROM inventory inv
    JOIN items i      ON i.id = inv.item_id
    JOIN job_tools jt ON jt.item_id = inv.item_id
    WHERE inv.user_id = ? AND inv.qty > 0 AND jt.job = ? AND COALESCE(i.min_level, 0) <= ?`)
    .all(userId, job, jobLevel);
  if (rows.length === 0) return null;
  rows.sort((a, b) => {
    const lv = (b.min_level || 0) - (a.min_level || 0);
    if (lv !== 0) return lv;
    return (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0);
  });
  return rows[0];
}

// Gói bonus đã chuẩn hoá để command dùng thẳng.
// drop/qty là hệ số nhân (1 = không đổi) — tránh mỗi lệnh tự cộng trừ khác nhau.
function bonus(userId, job, jobLevel = null) {
  const tool = bestTool(userId, job, jobLevel);
  const st = tool || { drop_bonus: 0, qty_bonus: 0, extra_chance: 0, save_chance: 0 };
  return {
    tool,
    dropMult: 1 + (st.drop_bonus || 0),
    qtyMult: 1 + (st.qty_bonus || 0),
    extraChance: st.extra_chance || 0,
    saveChance: st.save_chance || 0,
  };
}

// Mô tả ngắn để in trong lệnh / %item (nguồn duy nhất, tránh mỗi chỗ một kiểu)
function describe(tool) {
  if (!tool) return '';
  const parts = [];
  if (tool.drop_bonus > 0) parts.push(`+${Math.round(tool.drop_bonus * 100)}% cơ hội rơi`);
  if (tool.qty_bonus > 0) parts.push(`+${Math.round(tool.qty_bonus * 100)}% số lượng`);
  if (tool.extra_chance > 0) parts.push(`+${Math.round(tool.extra_chance * 100)}% ra thêm 1 món`);
  if (tool.save_chance > 0) parts.push(`+${Math.round(tool.save_chance * 100)}% không tiêu nguyên liệu`);
  return parts.join(' • ') || 'không có bonus';
}

module.exports = {
  migrate, getTool, getToolsByJob, bestTool, bonus, describe,
  STATS, NEW_ITEMS, TIER_RANK,
};
