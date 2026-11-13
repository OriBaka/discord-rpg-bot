// CƠ CHẾ "VUI" CHO FARM — chuỗi liên tiếp, mạch khoáng, kho báu hiếm.
//
// Trước đây một lần đào luôn trả về đúng một embed giống nhau:
//     "+2 Copper Ore, +1 Stone"
// Không bao giờ có gì bất ngờ, không có gì để mong đợi, nên farm chỉ là
// việc bấm nút chờ cooldown. Ba cơ chế dưới đây thêm biến thiên mà KHÔNG
// phá cân bằng: chúng chỉ đổi *cách* nhận nguyên liệu, không tăng tổng
// sức mạnh người chơi một cách tuyến tính.
//
// Ba cơ chế:
//
//   1. CHUỖI LIÊN TIẾP (streak)
//      Mỗi lần đào/câu TRÚNG thì chuỗi +1. Một lần TRƯỢT (không tìm thấy gì)
//      là đứt chuỗi về 0. Nghỉ quá 15 phút cũng đứt.
//      Điểm quan trọng: chuỗi phải ĐỨT được, nếu không nó thành buff vĩnh
//      viễn chứ không phải cơ chế vui. Tỉ lệ trượt tự nhiên của các zone là
//      7–29% (đo từ gather_drops), nên chuỗi thực tế thường dài 3–14 lần —
//      vừa đủ để mốc ×1.15 / ×1.3 / ×1.5 có ý nghĩa mà không thành mặc định.
//      Phần thưởng là SỐ LƯỢNG nguyên liệu, không phải nguyên liệu hiếm hơn
//      — chuỗi thưởng cho sự kiên trì, không phải nguồn duy nhất của thứ gì.
//
//   2. MẠCH KHOÁNG (vein)
//      Mỗi lần đào có cơ hội nhỏ phát hiện một mạch giàu: lần đó nhân đôi
//      số lượng. Với câu cá gọi là "luồng cá". Ngẫu nhiên, không cộng dồn.
//
//   3. KHO BÁU HIẾM (treasure)
//      Tỉ lệ rất nhỏ (≈1%) để một lần đào cho một món trang bị/đá quý hiếm
//      thay vì nguyên liệu thường. Đây là phần "không bao giờ đoán trước"
//      — và là lý do người chơi vẫn đào dù đã đủ nguyên liệu.
//
// Toàn bộ trạng thái chuỗi lưu ở bảng riêng, có guard tạo bảng, idempotent.

const db = require('../db/database');

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS farm_streaks (
      user_id     TEXT NOT NULL,
      job_type    TEXT NOT NULL,
      streak      INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      last_at     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, job_type)
    );
  `);
}

// Nghỉ quá lâu thì mất chuỗi. 15 phút — đủ để người chơi đi làm việc khác
// rồi quay lại mà không mất, nhưng không đủ để bỏ cả ngày vẫn giữ chuỗi.
const STREAK_TIMEOUT_MS = 15 * 60 * 1000;

// Mốc chuỗi → hệ số thưởng số lượng.
// Mốc 3/6/10 chọn theo phân bố trượt thật: ở stone_quarry (dễ nhất) xác suất
// đạt chuỗi 10 là 32%, còn ở void_pool (khó nhất) là 3,5% — người chơi ở
// zone khó có thử thách thật, không phải buff miễn phí.
const STREAK_TIERS = [
  { min: 10, mult: 1.5,  label: '🔥🔥🔥 Bất bại' },
  { min: 6,  mult: 1.3,  label: '🔥🔥 Sung sức' },
  { min: 3,  mult: 1.15, label: '🔥 Vào guồng' },
];

function streakMult(streak) {
  for (const t of STREAK_TIERS) if (streak >= t.min) return t.mult;
  return 1;
}

function streakLabel(streak) {
  for (const t of STREAK_TIERS) if (streak >= t.min) return t.label;
  return '';
}

/** Đọc chuỗi hiện tại (tự reset nếu đã quá hạn) */
function getStreak(userId, jobType) {
  ensureTable();
  const row = db.prepare('SELECT * FROM farm_streaks WHERE user_id=? AND job_type=?')
    .get(userId, jobType);
  if (!row) return { streak: 0, best: 0 };
  if (Date.now() - row.last_at > STREAK_TIMEOUT_MS) return { streak: 0, best: row.best_streak };
  return { streak: row.streak, best: row.best_streak };
}

/** Tăng chuỗi sau một lần farm thành công */
function bumpStreak(userId, jobType) {
  ensureTable();
  const cur = getStreak(userId, jobType);
  const streak = cur.streak + 1;
  const best = Math.max(cur.best, streak);
  db.prepare(`INSERT INTO farm_streaks (user_id, job_type, streak, best_streak, last_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, job_type) DO UPDATE SET
      streak=excluded.streak, best_streak=excluded.best_streak, last_at=excluded.last_at`)
    .run(userId, jobType, streak, best, Date.now());
  return { streak, best };
}

/** Đứt chuỗi — gọi khi một lần farm trượt (không tìm thấy gì) */
function resetStreak(userId, jobType) {
  ensureTable();
  const cur = getStreak(userId, jobType);
  db.prepare(`INSERT INTO farm_streaks (user_id, job_type, streak, best_streak, last_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, job_type) DO UPDATE SET
      streak=0, best_streak=excluded.best_streak, last_at=excluded.last_at`)
    .run(userId, jobType, 0, cur.best, Date.now());
  return { streak: 0, best: cur.best };
}

// ---------------------------------------------------------------------------
// MẠCH KHOÁNG / LUỒNG CÁ — nhân đôi số lượng một lần, ngẫu nhiên
// ---------------------------------------------------------------------------
const VEIN_CHANCE = 0.12;

function rollVein(rng = Math.random) {
  return rng() < VEIN_CHANCE;
}

// ---------------------------------------------------------------------------
// KHO BÁU HIẾM — tỉ lệ nhỏ, cho đồ hiếm thay vì nguyên liệu thường
//
// Mỗi zone có bảng kho báu riêng, chọn món *phù hợp mốc level của zone* để
// không phá cân bằng: kho báu Lv.1 không bao giờ cho đồ Lv.40.
// Toàn bộ đều là món ĐÃ CÓ NGUỒN khác (quái/shop/craft) — kho báu là đường
// tắt may mắn, không phải nguồn duy nhất của bất cứ thứ gì.
// ---------------------------------------------------------------------------
const TREASURE_CHANCE = 0.01;

const TREASURES = {
  // zone → [item_id]
  stone_quarry: ['copper_ring', 'leather_necklace'],
  iron_mine: ['iron_ingot', 'gem_ruby'],
  gold_vein: ['gold_ingot', 'gem_sapphire'],
  mithril_cave: ['mithril_ingot', 'diamond'],
  dragon_mine: ['dragon_bone', 'dragon_scale'],
  village_pond: ['pearl_necklace', 'fish_golden'],
  river: ['silver_ring', 'fish_salmon'],
  lake: ['gem_sapphire', 'fish_tuna'],
  ocean: ['fish_swordfish', 'diamond'],
  void_pool: ['void_essence', 'fish_void'],
  // Foraging — toàn món ĐÃ CÓ nguồn khác (shop/khoáng), kho báu chỉ là đường tắt
  sunlit_meadow: ['potion_s', 'leather_necklace'],
  whisper_woods: ['potion_m', 'silver_ring'],
  mossy_marsh: ['potion_percent', 'gem_sapphire'],
  ancient_grove: ['potion_full', 'gold_ingot'],
  world_tree_roots: ['potion_astral', 'mithril_ingot'],
};

function rollTreasure(zoneId, rng = Math.random) {
  if (rng() >= TREASURE_CHANCE) return null;
  const pool = TREASURES[zoneId];
  if (!pool || pool.length === 0) return null;
  const itemId = pool[Math.floor(rng() * pool.length)];
  const qty = 1;
  return { item_id: itemId, qty };
}

module.exports = {
  ensureTable,
  getStreak, bumpStreak, resetStreak, streakMult, streakLabel,
  STREAK_TIERS, STREAK_TIMEOUT_MS,
  rollVein, VEIN_CHANCE,
  rollTreasure, TREASURES, TREASURE_CHANCE,
};
