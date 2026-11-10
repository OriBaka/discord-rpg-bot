// ĐIỂM DANH HÀNG NGÀY — hệ thống chuỗi + phần thưởng leo thang.
//
// ---------------------------------------------------------------------------
// VẤN ĐỀ CỦA HỆ THỐNG CŨ (đo được, không phải cảm tính)
// ---------------------------------------------------------------------------
// `%daily` cũ chỉ có 3 dòng logic:
//     reward = 100 + level * 20
//     if (còn hạn) báo "quay lại sau"
//     nhận → +vàng, hồi đầy HP
//
// Ba hệ quả:
//   1. KHÔNG có lý do quay lại đều. Ngày thứ 2 và ngày thứ 30 giống hệt nhau.
//      Bỏ một ngày cũng chẳng mất gì → không ai điểm danh vì muốn, chỉ vì
//      nhớ ra thì bấm.
//   2. Phần thưởng không theo kịp game. Ở Lv.40, 900 vàng ≈ 0,65 kill ở
//      astral_ruins (1380 vàng/kill) — trong khi một lần hunt mất 10 giây.
//      Người chơi endgame có lý do chính đáng để bỏ qua hoàn toàn.
//   3. Một dòng text, không có gì để nhìn. Không biết mình đang ở ngày thứ
//      mấy, còn gì phía trước, đã bỏ lỡ gì.
//
// ---------------------------------------------------------------------------
// HỆ THỐNG MỚI
// ---------------------------------------------------------------------------
//   • CHUỖI 7 NGÀY: ngày 1→7 phần thưởng leo thang. Ngày 7 là mốc lớn.
//     Đứt chuỗi (bỏ >1 ngày) thì quay về ngày 1 — đây là thứ tạo lý do
//     quay lại đều, giống mọi game mobile.
//   • PHẦN THƯỞNG THEO BẬC: mỗi ngày có vàng + (XP / item / hồi máu),
//     và có một "ngày đặc biệt" trong tuần tặng item thật.
//   • KHÔNG PHẠT NẶNG: bỏ 1 ngày chỉ mất streak, KHÔNG mất gì đã có.
//     Người chơi bận việc quay lại vẫn nhận được thưởng ngày 1 ngay.
//   • CÓ THỂ XEM TRƯỚC: `%daily xem` hiện cả 7 ngày + đang ở đâu.
//
// Cân bằng: tổng vàng 7 ngày ≈ 15–20 kill ở zone tương ứng level người chơi,
// để daily là "thu nhập thụ động có ý nghĩa" chứ không phải nguồn thu chính.
// (Đo: forest 60/kill · desert 218 · volcano 649 · astral 1380.)

const db = require('../db/database');

// KHÔNG require './player' ở đầu file: database.js nạp game/daily.js để chạy
// migration, mà game/player.js cũng require database.js → vòng lặp. Khi đó
// các hàm của player còn undefined và test circular-dependency bắt được.
// Require lười bên trong hàm là đủ rẻ (module đã cache).
function playerMod() { return require('./player'); }
function itemMod() { return require('./items'); }

const DAY_MS = 24 * 60 * 60 * 1000;

// Cho phép trễ tối đa 20 giờ so với mốc 24h, để người chơi lệch giờ sinh hoạt
// (đi làm về muộn) không bị đứt chuỗi oan. Quá 44h kể từ lần trước = đứt.
const GRACE_MS = 20 * 60 * 60 * 1000;
const BREAK_MS = DAY_MS + GRACE_MS;   // 44h

// ---------------------------------------------------------------------------
// PHẦN THƯỞNG 7 NGÀY
//
// `goldKill` = phần thưởng vàng tính bằng "số kill tương đương" — rồi nhân
// với vàng/kill của zone phù hợp level người chơi. Nhờ vậy daily không bị vô
// nghĩa ở cấp cao (lỗi của hệ thống cũ) mà cũng không phá kinh tế cấp thấp.
// ---------------------------------------------------------------------------
const REWARDS = [
  { day: 1, goldKill: 1.5, xpKill: 0.5, label: 'Khởi động' },
  { day: 2, goldKill: 2.0, xpKill: 0.5, label: 'Đều đặn' },
  { day: 3, goldKill: 2.5, xpKill: 0.8, label: 'Bám trụ' },
  { day: 4, goldKill: 3.0, xpKill: 0.8, label: 'Nửa đường' },
  { day: 5, goldKill: 3.5, xpKill: 1.0, label: 'Sắp tới' },
  { day: 6, goldKill: 4.0, xpKill: 1.0, label: 'Gần đích' },
  { day: 7, goldKill: 6.0, xpKill: 1.5, label: 'Trọn tuần', item: true },
];

// Phần thưởng vật phẩm của ngày 7 — vật phẩm hồi máu theo BẬC LEVEL.
//
// KHÔNG dùng lootbox: bảng `loot_tables` đang rỗng và chủ dự án đã quyết định
// để dành nó cho sự kiện. Bậc level để người chơi Lv.40 không nhận potion
// hồi 50 HP (vô nghĩa với max_hp ~700).
const DAY7_ITEMS = [
  { maxLevel: 10,  item_id: 'potion_m' },
  { maxLevel: 25,  item_id: 'potion_l' },
  { maxLevel: 999, item_id: 'food_seafood_platter' },
];

function day7Item(level) {
  return (DAY7_ITEMS.find(x => level <= x.maxLevel) || DAY7_ITEMS[DAY7_ITEMS.length - 1]).item_id;
}

// ---------------------------------------------------------------------------
// Schema — thêm cột đếm chuỗi vào players
// ---------------------------------------------------------------------------
function migrate() {
  const cols = db.prepare('PRAGMA table_info(players)').all().map(c => c.name);
  if (!cols.includes('daily_streak')) {
    db.exec("ALTER TABLE players ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 Migrated players: thêm daily_streak');
  }
  if (!cols.includes('daily_total')) {
    db.exec("ALTER TABLE players ADD COLUMN daily_total INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 Migrated players: thêm daily_total');
  }
  if (!cols.includes('daily_best')) {
    db.exec("ALTER TABLE players ADD COLUMN daily_best INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 Migrated players: thêm daily_best');
  }
}

// ---------------------------------------------------------------------------
// Vàng/kill theo zone phù hợp level — dùng để neo phần thưởng.
// Lấy zone có min_level cao nhất mà người chơi đã mở.
// ---------------------------------------------------------------------------
function zoneRate(level) {
  const z = db.prepare(`SELECT gold_min, gold_max FROM monsters WHERE zone_id = (
      SELECT id FROM zones WHERE min_level <= ? ORDER BY min_level DESC LIMIT 1
    )`).all(level);
  if (!z.length) return { gold: 60, xp: 46 };
  const g = z.reduce((a, m) => a + (m.gold_min + m.gold_max) / 2, 0) / z.length;
  const mz = db.prepare(`SELECT xp FROM monsters WHERE zone_id = (
      SELECT id FROM zones WHERE min_level <= ? ORDER BY min_level DESC LIMIT 1
    )`).all(level);
  const x = mz.length ? mz.reduce((a, m) => a + m.xp, 0) / mz.length : 46;
  return { gold: Math.round(g), xp: Math.round(x) };
}

// ---------------------------------------------------------------------------
// Trạng thái điểm danh: còn hạn? đứt chuỗi? ngày tiếp theo là ngày mấy?
// ---------------------------------------------------------------------------
function getStatus(player, now = Date.now()) {
  const since = now - (player.last_daily || 0);
  const canClaim = since >= DAY_MS;
  const broken = since >= BREAK_MS;
  const streak = broken ? 0 : (player.daily_streak || 0);

  // Ngày tiếp theo trong chuỗi 7 ngày: 1..7
  const nextDay = (streak % 7) + 1;

  return {
    canClaim,
    broken,
    streak,
    nextDay,
    // Thời gian còn phải chờ (chỉ có nghĩa khi !canClaim)
    remainMs: canClaim ? 0 : DAY_MS - since,
    // Vẫn kịp giữ chuỗi nếu điểm danh trước mốc này
    keepStreakUntilMs: broken ? 0 : Math.max(0, BREAK_MS - since),
  };
}

// ---------------------------------------------------------------------------
// Cấp phần thưởng
// ---------------------------------------------------------------------------
function grantReward(userId, player, day, opts = {}) {
  const r = REWARDS.find(x => x.day === day) || REWARDS[0];
  const rate = zoneRate(player.level);
  const gold = Math.round(rate.gold * r.goldKill);
  const xp = Math.round(rate.xp * r.xpKill);

  const granted = { gold, xp, item: null, healed: false };

  // Vàng + XP. addXpAndLevel nhận (userId, xpGain) và tự đọc lại player,
  // nên phải truyền userId chứ không phải object player.
  const { updatePlayer, addItem, addXpAndLevel } = playerMod();
  const lvl = addXpAndLevel(userId, xp);
  // addXpAndLevel trả { newLevel, levelsGained, ... } — KHÔNG có .level.
  // Dùng sai tên field khiến thông báo "lên cấp" không bao giờ hiện.
  if (lvl && lvl.levelsGained && lvl.levelsGained.length) granted.levelUp = lvl.newLevel;
  updatePlayer(userId, { gold: (player.gold || 0) + gold });

  // Hồi máu vào ngày lẻ — nhịp nghỉ giữa các ngày, không dồn hết vào 1 ngày
  if (day % 2 === 1 && player.hp < player.max_hp) {
    updatePlayer(userId, { hp: player.max_hp });
    granted.healed = true;
  }

  // Ngày 7: tặng vật phẩm theo bậc level
  if (day === 7 && !opts.dryRun) {
    const pick = day7Item(player.level);
    const it = itemMod().getItem(pick);
    if (it) {
      addItem(userId, pick, 1);
      granted.item = pick;
    } else {
      // Fallback: không có item thì cộng thêm vàng, KHÔNG im lặng bỏ thưởng
      const extra = Math.round(rate.gold * 3);
      updatePlayer(userId, { gold: (player.gold || 0) + gold + extra });
      granted.gold += extra;
    }
  }

  return granted;
}

module.exports = {
  migrate,
  DAY_MS, GRACE_MS, BREAK_MS,
  REWARDS, DAY7_ITEMS, day7Item,
  getStatus, grantReward, zoneRate,
};
