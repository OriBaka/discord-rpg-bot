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
// ---------------------------------------------------------------------------
// CẤU HÌNH — giờ lấy từ DB, không hardcode
//
// Trước đây các bảng dưới là hằng số trong code: muốn đổi "mốc +5 cần 3 Dragon
// Scale" thì phải sửa file + restart bot. Nay chúng nằm ở bảng
// `upgrade_config`, admin chỉnh bằng `!upgrade admin` và có hiệu lực NGAY.
//
// Các hằng dưới đây là GIÁ TRỊ MẶC ĐỊNH: được seed vào DB lần đầu, và cũng
// là thứ được dùng nếu bảng trống/hỏng (không bao giờ để nâng cấp trả về rỗng).
// ---------------------------------------------------------------------------

// NGUYÊN LIỆU — thang 8 bậc, xếp theo độ hiếm tăng dần.
//
// Mốc nâng cấp N của một vũ khí dùng `LADDER[bậc + N - 1]`, trong đó
// `bậc = floor((min_level - 1) / 10)` chặn ở 0..3. Vũ khí cấp càng cao thì
// nguyên liệu càng dịch lên bậc hiếm hơn.
//
// VÌ SAO PHẢI DỊCH BẬC (lỗi thật đã bị loại):
//   Nếu mọi vũ khí dùng chung một thang thì `wood_sword` (Lv.1, atk 5) +5 đòi
//   `dragon_scale` — nguyên liệu CHỈ rơi từ rồng Lv.20+. Người chơi Lv.5
//   không bao giờ nâng cấp được, dù nâng cấp đó chỉ cho +1 ATK. Đúng loại lỗi
//   "nội dung có nhưng không ai chạm tới" như vụ công cụ farm.
const DEFAULT_LADDER = [
  { item_id: 'stone',        qty: 4 },  // bậc 0 — mine stone_quarry, hunt Moss Golem
  { item_id: 'copper_ore',   qty: 3 },  // bậc 1 — mine stone_quarry
  { item_id: 'iron_ore',     qty: 3 },  // bậc 2 — mine iron_mine
  { item_id: 'gold_ore',     qty: 2 },  // bậc 3 — mine gold_vein
  { item_id: 'gem_ruby',     qty: 2 },  // bậc 4 — mine gold_vein, hunt Ember Phoenix
  { item_id: 'gem_sapphire', qty: 2 },  // bậc 5 — mine mithril_cave, hunt Obsidian Golem
  { item_id: 'diamond',      qty: 1 },  // bậc 6 — mine dragon_mine, hunt Star Devourer
  { item_id: 'dragon_scale', qty: 1 },  // bậc 7 — hunt Young/Ancient/Void Dragon
];

// PHẨM CHẤT — nhân SỐ LƯỢNG nguyên liệu
const DEFAULT_TIER_MULT = {
  common: 1.0,
  rare: 1.5,
  epic: 2.0,
  legendary: 3.0,
};

// VÀNG — neo theo "số kill cần bỏ ra", không theo giá trị tuyệt đối.
//
// gold_band[bậc] = TỔNG vàng để đi hết +1..+5 ở bậc đó (với phẩm chất common).
// Chia cho 5 cấp theo trọng số 1:2:3:4:5 nên cấp sau đắt hơn cấp trước.
//
// Neo theo gold/kill đo được của zone tương ứng, nhân thêm gold_tier:
//     wooden  (bậc 0, common)    2.000 vàng  ≈ 33 kill @ forest   (60/kill)
//     iron    (bậc 1, rare)      8.050 vàng  ≈ 37 kill @ desert   (218/kill)
//     steel   (bậc 2, epic)     26.000 vàng  ≈ 40 kill @ volcano  (649/kill)
//     dragon  (bậc 3, legendary) 67.200 vàng ≈ 49 kill @ astral   (1380/kill)
// Tức là nâng hết một vũ khí tốn 33–49 kill ở đúng tầm level của nó — không
// phạt người chơi cấp thấp bằng một con số khổng lồ, và cũng không cho đồ
// endgame nâng cấp rẻ như đồ đầu game.
const DEFAULT_GOLD_BAND = [2000, 7000, 20000, 42000];

// gold_tier = hệ số vàng theo phẩm chất. Nhẹ hơn tier_mult vì phẩm chất đã
// được phản ánh ở nguyên liệu (thang bậc) rồi — nhân mạnh ở đây sẽ tính phí
// hai lần cho cùng một thứ.
const DEFAULT_GOLD_TIER = {
  common: 1.0,
  rare: 1.15,
  epic: 1.3,
  legendary: 1.6,
};

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

  // Cấu hình nâng cấp chỉnh được bằng lệnh admin.
  // Lưu dạng key/value JSON: đổi sang bảng quan hệ sẽ thành 3 bảng nữa cho
  // một thứ chỉ có ~15 con số — không đáng.
  db.exec(`CREATE TABLE IF NOT EXISTS upgrade_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Seed lần đầu (idempotent — chỉ ghi key chưa có)
  const seedIfMissing = (key, value) => {
    db.prepare('INSERT OR IGNORE INTO upgrade_config (key, value) VALUES (?, ?)')
      .run(key, JSON.stringify(value));
  };
  seedIfMissing('ladder', DEFAULT_LADDER);
  seedIfMissing('tier_mult', DEFAULT_TIER_MULT);
  seedIfMissing('gold_band', DEFAULT_GOLD_BAND);
  seedIfMissing('gold_tier', DEFAULT_GOLD_TIER);
}

// ---------------------------------------------------------------------------
// Đọc cấu hình — LUÔN quay về mặc định nếu DB trống/hỏng
// ---------------------------------------------------------------------------
function readKey(key, fallback) {
  try {
    const row = db.prepare('SELECT value FROM upgrade_config WHERE key=?').get(key);
    if (!row) return fallback;
    const v = JSON.parse(row.value);
    if (v === null || v === undefined) return fallback;
    return v;
  } catch {
    return fallback;
  }
}

function writeKey(key, value) {
  db.prepare(`INSERT INTO upgrade_config (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, JSON.stringify(value));
}

/** Cấu hình hiện hành (đọc mỗi lần gọi — 4 query, không đáng để cache) */
function getConfig() {
  const lad = readKey('ladder', DEFAULT_LADDER);
  const ladder = (Array.isArray(lad) && lad.length ? lad : DEFAULT_LADDER)
    .filter(e => e && typeof e === 'object' && e.item_id);
  return {
    ladder: ladder.length ? ladder : DEFAULT_LADDER,
    tier_mult: readKey('tier_mult', DEFAULT_TIER_MULT) || DEFAULT_TIER_MULT,
    gold_band: readKey('gold_band', DEFAULT_GOLD_BAND) || DEFAULT_GOLD_BAND,
    gold_tier: readKey('gold_tier', DEFAULT_GOLD_TIER) || DEFAULT_GOLD_TIER,
  };
}

/** Đưa toàn bộ cấu hình về mặc định (dùng cho !upgrade admin reset) */
function resetConfig() {
  writeKey('ladder', DEFAULT_LADDER);
  writeKey('tier_mult', DEFAULT_TIER_MULT);
  writeKey('gold_band', DEFAULT_GOLD_BAND);
  writeKey('gold_tier', DEFAULT_GOLD_TIER);
}

/** Trục 3 — bậc nguyên liệu theo cấp độ vũ khí */
function ladderBand(minLevel) {
  return Math.max(0, Math.min(3, Math.floor(((minLevel || 1) - 1) / 10)));
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

  const cfg = getConfig();
  const mult = cfg.tier_mult[item.tier] || 1.0;
  const band = ladderBand(item.min_level);

  // Mốc N của vũ khí bậc B dùng LADDER[B + N - 1]; chặn 2 đầu để không bao
  // giờ trả về undefined nếu admin rút ngắn thang.
  const idx = Math.max(0, Math.min(cfg.ladder.length - 1, band + next - 1));
  const entry = cfg.ladder[idx];
  const qty = Math.max(1, Math.round(entry.qty * mult));

  // Vàng: tổng của bậc chia theo trọng số 1:2:3:4:5 (tổng trọng số = 15)
  const bandTotal = cfg.gold_band[Math.min(band, cfg.gold_band.length - 1)] || 0;
  const goldTier = cfg.gold_tier[item.tier] || 1.0;
  const gold = Math.round(bandTotal * goldTier * next / 15);

  return {
    next_level: next,
    gold,
    materials: [{ item_id: entry.item_id, qty }],
    tier_mult: mult,
    band,
    ladder_index: idx,
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
  // mặc định (dùng cho reset và làm fallback)
  DEFAULT_LADDER,
  DEFAULT_TIER_MULT,
  DEFAULT_GOLD_BAND,
  DEFAULT_GOLD_TIER,
  // cấu hình sống
  getConfig, resetConfig,
  readKey, writeKey,
  ladderBand,
  getLevel,
  getLevels,
  setLevel,
  upgradeBonus,
  getUpgradeCost,
  getUpgradePath,
  isValidUpgradeTarget,
};
