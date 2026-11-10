// CƠ CHẾ NÂNG CẤP VŨ KHÍ (+1 → +5).
//
// Yêu cầu của chủ dự án:
//   • Nâng cấp kiểu +1, +2... KHÔNG đổi tên vũ khí, chỉ thêm hậu tố "+N".
//   • Nguyên liệu tăng dần theo cấp; cấp càng cao càng cần đồ hiếm.
//   • Nguyên liệu lấy từ nhiều nguồn: hunt, mine, boss, nhiệm vụ, sự kiện.
//   • Trước mắt giới hạn +5.
//   • Số lượng/loại nguyên liệu thay đổi theo PHẨM CHẤT vũ khí,
//     nhưng KHÔNG tạo quá nhiều bảng công thức rườm rà.
//
// ---------------------------------------------------------------------------
// VẤN ĐỀ KIẾN TRÚC — đọc trước khi sửa bất cứ dòng nào
// ---------------------------------------------------------------------------
// Bảng `inventory` có khoá chính (user_id, item_id): nó chỉ biết "bạn có 3 cái
// iron_sword", KHÔNG có khái niệm từng món riêng lẻ. Nhưng "iron_sword +2" là
// một *instance* có thuộc tính riêng — nếu nhét nó vào inventory thì phải đổi
// khoá chính và sửa 15+ chỗ đọc inventory (trade, guild, quest, achievement,
// autocomplete...). Rủi ro rất cao, đổi lại gần như không có gì.
//
// Cách làm: bảng riêng `item_upgrades(user_id, item_id, level)`.
//   • Không đụng inventory / trade / quest / achievement / autocomplete.
//   • Chỉ số cộng thêm đọc đúng 1 chỗ: slots.getTotalBonus().
//   • Cấp gắn với LOẠI vũ khí, không với slot đang mặc — nên nâng +5 cho dao
//     gỗ rồi thay dragon_sword vào slot KHÔNG kế thừa +5 (đã cân nhắc và loại
//     bỏ phương án gắn-theo-slot: nó cho phép nâng cấp 1 lần dùng mãi).
//
// Hệ quả cần biết: nếu bạn sở hữu 2 cái iron_sword thì cả 2 đều là +N (chúng
// chia sẻ 1 dòng trong inventory nên không thể khác nhau). Bán vũ khí KHÔNG
// xoá cấp nâng cấp — nếu mua lại đúng món đó thì cấp vẫn còn. Đây là lựa chọn
// có chủ ý: người chơi không bị mất công vì lỡ tay bán, và cũng không thể
// biến cấp nâng cấp thành vàng (bán vẫn chỉ nhận giá gốc).
//
// ---------------------------------------------------------------------------
// CÂN BẰNG — con số dưới đây được ĐO, không phải đoán
// ---------------------------------------------------------------------------
// Mục tiêu win-rate đã chốt là 65–75% tại mốc mở khoá zone. Ở các mốc đó,
// cộng ATK phẳng là ý tồi: +5 ATK ở Lv.1 là +21% ATK (đẩy 68% → 87%) nhưng
// ở Lv.40 chỉ là +2% (vô nghĩa). Vì vậy bonus tính theo % ATK CỦA VŨ KHÍ:
//
//     bonus(+N) = ceil( weapon.atk × 2% × N )
//
// Đo tại mốc mở khoá zone, 3 class × 9 zone (bỏ các ô đã 100%):
//     +0:  66–77%      +5:  68–86%      trung bình +5,2 điểm
// Chọn 2%/cấp thay vì 3%/cấp (3% cho trung bình +6,9 và đỉnh 88%).
// Nghĩa là: nâng cấp là một khoản đầu tư thấy rõ, KHÔNG phải nút thắng game.
// Người chơi KHÔNG nâng cấp vẫn thắng được; người nâng cấp thắng nhàn hơn.

const db = require('../db/database');
const { getItem } = require('./items');

const MAX_LEVEL = 5;

// Bonus mỗi cấp = 2% ATK của vũ khí (làm tròn lên, tối thiểu 0)
const BONUS_PER_LEVEL_PCT = 0.02;

// ---------------------------------------------------------------------------
// CHI PHÍ NÂNG CẤP — suy ra từ công thức, KHÔNG phải bảng 20 dòng
//
// Yêu cầu: "tùy phẩm chất mà số lượng và vật phẩm thay đổi" nhưng "không quá
// nhiều công thức rườm rà". Cách giải: chi phí là tích của 3 tham số độc lập,
// mỗi tham số một trục — thêm phẩm chất mới chỉ cần thêm 1 dòng.
//
//   Trục 1 — CẤP NÂNG CẤP (+1..+5): quyết định VẬT PHẨM gì.
//   Trục 2 — PHẨM CHẤT vũ khí:     quyết định SỐ LƯỢNG (nhân).
//   Trục 3 — CẤP ĐỘ vũ khí:        quyết định bậc nguyên liệu bắt đầu.
//
// ---------------------------------------------------------------------------
// TRỤC 3 — vì sao cần: đo từ DB cho thấy nếu mọi vũ khí dùng chung một thang
// nguyên liệu thì chi phí bị NGƯỢC:
//     copper_sword  atk 5   +5 = +1 ATK  nhưng vẫn đòi 3× Dragon Scale
//     dragon_sword  atk 48  +5 = +5 ATK  cũng đòi 3× Dragon Scale
// Tức là đồ yếu chịu chi phí y hệt đồ mạnh nhưng nhận 1/5 lợi ích — nâng cấp
// đồ cấp thấp thành cái bẫy. Vì vậy bậc nguyên liệu bắt đầu dời theo độ mạnh
// vũ khí: vũ khí Lv.1 dùng nguyên liệu Lv.1, vũ khí Lv.40 dùng nguyên liệu Lv.40.
// ---------------------------------------------------------------------------
const MATERIAL_LADDER = [
  'stone',         // 0 — mine stone_quarry / hunt Moss Golem
  'copper_ore',    // 1 — mine stone_quarry
  'iron_ore',      // 2 — mine iron_mine
  'gold_ore',      // 3 — mine gold_vein
  'gem_ruby',      // 4 — mine gold_vein, hunt Ember Phoenix
  'gem_sapphire',  // 5 — mine mithril_cave, hunt Obsidian Golem
  'diamond',       // 6 — mine dragon_mine, hunt Star Devourer
  'dragon_scale',  // 7 — hunt Young/Ancient/Void Dragon
];

// Số lượng giảm dần khi nguyên liệu hiếm lên: 4 → 3 → 3 → 2 → 1
const BASE_QTY = [4, 3, 3, 2, 1];

// Trục 2 — phẩm chất: nhân số lượng + vàng
const TIER_MULT = {
  common: 1.0,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

// Trục 3 — bậc nguyên liệu khởi điểm theo cấp độ vũ khí.
// min_level 1–10 → bậc 0 · 11–20 → 1 · 21–30 → 2 · 31+ → 3
function ladderStart(minLevel) {
  return Math.max(0, Math.min(3, Math.floor(((minLevel || 1) - 1) / 10)));
}

// Vàng: cũng theo bậc, để nâng cấp đồ cấp thấp không tốn 37 kill
const GOLD_BASE_BY_BAND = [150, 350, 700, 1500];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS item_upgrades (
    user_id  TEXT NOT NULL,
    item_id  TEXT NOT NULL,
    level    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item_id),
    FOREIGN KEY (user_id) REFERENCES players(user_id) ON DELETE CASCADE
  )`);
}

// ---------------------------------------------------------------------------
// Đọc / ghi cấp nâng cấp — theo LOẠI vũ khí (item_id)
// ---------------------------------------------------------------------------
function getLevel(userId, itemId) {
  if (!itemId) return 0;
  const row = db.prepare('SELECT level FROM item_upgrades WHERE user_id=? AND item_id=?')
    .get(userId, itemId);
  return row ? row.level : 0;
}

/** Map item_id → level, nạp 1 lần cho cả lượt tính chỉ số */
function getLevels(userId) {
  const rows = db.prepare('SELECT item_id, level FROM item_upgrades WHERE user_id=?').all(userId);
  const map = {};
  for (const r of rows) map[r.item_id] = r.level;
  return map;
}

function setLevel(userId, itemId, level) {
  if (level <= 0) {
    db.prepare('DELETE FROM item_upgrades WHERE user_id=? AND item_id=?').run(userId, itemId);
  } else {
    db.prepare(`INSERT INTO item_upgrades (user_id, item_id, level) VALUES (?,?,?)
      ON CONFLICT(user_id, item_id) DO UPDATE SET level = excluded.level`)
      .run(userId, itemId, level);
  }
}

// ---------------------------------------------------------------------------
// Bonus chỉ số từ nâng cấp
// Bonus tính theo ATK của vũ khí đang mặc ở slot đó.
// ---------------------------------------------------------------------------
function upgradeBonus(item, level) {
  if (!item || !level) return { atk: 0, def: 0 };
  const base = item.atk > 0 ? item.atk : item.def;
  if (!base) return { atk: 0, def: 0 };
  const amount = Math.ceil(base * BONUS_PER_LEVEL_PCT * level);
  // Vũ khí thiên công (atk>0) cộng ATK; món thiên thủ (atk=0, def>0) cộng DEF.
  // Giữ đúng bản chất món đồ thay vì biến mọi thứ thành ATK.
  if (item.atk > 0) return { atk: amount, def: 0 };
  return { atk: 0, def: amount };
}

// ---------------------------------------------------------------------------
// Chi phí nâng cấp của 1 món đồ ở cấp hiện tại → cấp tiếp theo
// ---------------------------------------------------------------------------
function getUpgradeCost(item, currentLevel) {
  const next = currentLevel + 1;
  if (next > MAX_LEVEL) return null;

  const mult = TIER_MULT[item.tier] || 1.0;
  const band = ladderStart(item.min_level);
  const matIdx = Math.min(MATERIAL_LADDER.length - 1, band + (next - 1));
  const itemId = MATERIAL_LADDER[matIdx];
  const qty = Math.max(1, Math.round(BASE_QTY[next - 1] * mult));
  const gold = Math.round(GOLD_BASE_BY_BAND[band] * next * mult);

  return {
    next_level: next,
    gold,
    materials: [{ item_id: itemId, qty }],
    tier_mult: mult,
    band,
  };
}

// Toàn bộ lộ trình +1..+5 của 1 món (dùng cho lệnh xem trước)
function getUpgradePath(item) {
  const path = [];
  for (let lv = 0; lv < MAX_LEVEL; lv++) {
    const c = getUpgradeCost(item, lv);
    if (c) path.push(c);
  }
  return path;
}

function isValidUpgradeTarget(item) {
  if (!item) return false;
  // Nâng cấp áp cho vũ khí chiến đấu. Công cụ farm (pickaxe/fishing_rod) bị
  // loại vì chúng không tham gia combat, và bonus ở đây tính theo ATK —
  // công cụ farm có atk = 0 nên nâng cấp sẽ không có tác dụng gì.
  return item.type === 'weapon'
    && item.weapon_type !== 'pickaxe'
    && item.weapon_type !== 'fishing_rod';
}

module.exports = {
  migrate,
  MAX_LEVEL,
  BONUS_PER_LEVEL_PCT,
  TIER_MULT,
  MATERIAL_LADDER,
  BASE_QTY,
  GOLD_BASE_BY_BAND,
  ladderStart,
  getLevel,
  getLevels,
  setLevel,
  upgradeBonus,
  getUpgradeCost,
  getUpgradePath,
  isValidUpgradeTarget,
};
