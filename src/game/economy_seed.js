// Cân bằng KINH TẾ: giá trang bị trong shop.
//
// Số đo trước khi sửa (DB mới, tools đo ở tests/economy.test.js):
//   • Vàng rơi = 1.20 × XP với MỌI con quái → không có chỗ nào bị đảo.
//   • NHƯNG vũ khí quá rẻ: 2–4 kill là mua được cây vũ khí mạnh nhất của tier.
//     Vd Lv.25 `bow_windcut` (atk 26) giá 1600 = 3.1 kill ở volcano.
//   • Hệ quả: phần thưởng vàng từ chiến đấu gần như vô nghĩa, người chơi không
//     cần cày — chỉ cần đi vài trận là đủ tiền mua đồ mạnh nhất.
//
// Cách sửa: neo giá vào "số kill cần để mua" theo từng mốc level, dùng vàng
// trung bình/kill của zone mà người chơi thực sự farm ở mốc đó.
//
// Mục tiêu: 6–20 kill cho vũ khí (khớp nhịp XP 9–15 kill/level), giáp và phụ
// kiện rẻ hơn vũ khí vì có nhiều slot phải trang bị.
//
// Idempotent + có guard meta: chỉ áp một lần, không đè giá admin đã chỉnh tay.

const db = require('../db/database');

const META_KEY = 'economy_v1';

// Vàng trung bình mỗi kill ở zone người chơi farm tại mỗi mốc level
// (đo từ bảng monsters, làm tròn theo weight).
// Đo lại SAU khi neo XP (xem MONSTER_XP_FIX) — 2 zone cuối đã đổi:
//   frozen_abyss 1677 → 832, astral_ruins 1273 → 1359
const GOLD_PER_KILL = {
  1: 55, 6: 55, 12: 150, 18: 203, 25: 639,
  30: 832, 35: 832, 40: 1359, 45: 1359,
};

// Số kill mục tiêu để mua vũ khí ở từng mốc.
// Càng cao cấp càng đắt hơn một chút — đồ cuối game nên là mục tiêu dài hơi,
// nhưng vẫn phải trong tầm với của một phiên chơi.
const WEAPON_KILLS = {
  1: 6, 6: 8, 12: 12, 18: 14, 25: 16,
  30: 18, 35: 20, 40: 22, 45: 25,
};

// Giáp và phụ kiện: rẻ hơn vũ khí vì phải mua nhiều slot
const ARMOR_KILLS_MUL = 0.6;
const ACC_KILLS_MUL = 0.7;

// Trang bị cấp thấp giữ giá sàn để người mới không bị chặn
const MIN_PRICE = 40;

// Trang bị Lv.1 KHÔNG được đắt hơn số vàng người mới có (50) cộng vài kill đầu.
// Đây là lỗi tôi từng gây ra: nâng wood_sword lên 350 trong khi người chơi mới
// có 50 vàng và tay không chỉ thắng 1–4% → bế tắc hoàn toàn.
// Vũ khí khởi đầu nay được tặng khi chọn class (src/commands/class.js), nhưng
// giá vẫn phải ở mức mua được để không chặn ai lỡ bán mất.
const STARTER_CAP = 150;

/** Giá bán lại = 40% giá mua (giữ nguyên tỉ lệ cũ của game) */
const SELL_RATIO = 0.4;

function goldAt(lv) {
  const keys = Object.keys(GOLD_PER_KILL).map(Number).sort((a, b) => a - b);
  let g = GOLD_PER_KILL[keys[0]];
  for (const k of keys) if (lv >= k) g = GOLD_PER_KILL[k];
  return g;
}

function weaponKillsAt(lv) {
  const keys = Object.keys(WEAPON_KILLS).map(Number).sort((a, b) => a - b);
  let k = WEAPON_KILLS[keys[0]];
  for (const key of keys) if (lv >= key) k = WEAPON_KILLS[key];
  return k;
}

/** Giá mục tiêu cho một món trang bị */
function targetPrice(item) {
  const lv = item.min_level || 1;
  const gold = goldAt(lv);
  const kills = weaponKillsAt(lv);
  let mul = 1;
  if (item.type === 'armor') mul = ARMOR_KILLS_MUL;
  else if (item.type === 'accessory') mul = ACC_KILLS_MUL;
  else if (item.type === 'offhand') mul = 0.8;

  // Tier cao hơn một chút so với món cùng mốc level
  const tierMul = { common: 1, uncommon: 1.05, rare: 1.1, epic: 1.2, legendary: 1.35 }[item.tier] || 1;

  const raw = gold * kills * mul * tierMul;
  // Làm tròn về bội số 50 cho dễ đọc
  let price = Math.max(MIN_PRICE, Math.round(raw / 50) * 50);
  // Chặn trên cho đồ Lv.1: người mới phải mua được
  if (lv <= 1) price = Math.min(price, STARTER_CAP);
  return price;
}

// ---------------------------------------------------------------------------
// ĐẢO XP/GOLD GIỮA 2 ZONE CUỐI
//
// Số đo: mỗi kill ở frozen_abyss (Lv.30) cho 1397 XP = 20.4% XP cần để lên
// Lv.31, còn astral_ruins (Lv.40) cho 1061 XP = chỉ 8.4%. Vàng đi theo XP
// (1.2×) nên zone cấp THẤP vừa lên cấp nhanh hơn vừa kiếm nhiều vàng hơn
// zone cấp cao — không ai có lý do đi tiếp.
//
// Chuẩn của game: 9–15 kill mỗi level. Neo lại 2 zone cuối về ~11 kill/level.
// Vàng giữ đúng tỉ lệ 1.2 × XP như toàn bộ game.
const MONSTER_XP_FIX = {
  // zone: [XP mục tiêu mỗi kill, hệ số áp cho từng con theo XP cũ]
  frozen_abyss: 747,   // Lv30→31 cần 8215 XP → ~11 kill
  astral_ruins: 1150,  // Lv40→41 cần 12649 XP → ~11 kill
};

const MAX_KILLS_PER_LEVEL = 15;

function migrateMonsterEconomy() {
  const upd = db.prepare('UPDATE monsters SET xp = ?, gold_min = ?, gold_max = ? WHERE id = ?');
  let changed = 0;

  for (const [zoneId, targetXp] of Object.entries(MONSTER_XP_FIX)) {
    const mobs = db.prepare('SELECT id, xp, gold_min, gold_max FROM monsters WHERE zone_id=? AND elite_tier=0').all(zoneId);
    if (mobs.length === 0) continue;
    // Giữ tương quan giữa các con trong zone: con khó hơn (XP cao hơn) vẫn
    // thưởng nhiều hơn, chỉ kéo trung bình về mục tiêu.
    const avg = mobs.reduce((s, m) => s + m.xp, 0) / mobs.length;
    if (avg <= 0) continue;
    const scale = targetXp / avg;

    for (const m of mobs) {
      const xp = Math.max(1, Math.round(m.xp * scale));
      // Giữ độ rộng gold_min..gold_max quanh 1.2 × XP như phần còn lại của game
      const goldMid = Math.round(xp * 1.2);
      const spread = Math.round(goldMid * 0.4); // ±20%
      upd.run(xp, Math.max(1, goldMid - spread), goldMid + spread, m.id);
      changed++;
    }
  }
  return changed;
}

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  // Sửa XP/vàng 2 zone cuối TRƯỚC, để bảng GOLD_PER_KILL ở trên khớp thực tế.
  const mobsChanged = migrateMonsterEconomy();
  if (mobsChanged > 0) {
    const detail = Object.entries(MONSTER_XP_FIX)
      .map(([z, xp]) => `${z}=${xp}xp/kill`).join(', ');
    console.log(`⚖️ Economy: neo XP ${mobsChanged} quái về ~${MAX_KILLS_PER_LEVEL} kill/level (${detail})`);
  }

  const shopRows = db.prepare(`SELECT s.item_id, s.price, i.type, i.tier, i.min_level, i.price base_price
    FROM shop s JOIN items i ON i.id = s.item_id
    WHERE i.type IN ('weapon','armor','accessory','offhand')`).all();

  const setShopPrice = db.prepare('UPDATE shop SET price = ? WHERE item_id = ?');
  const setSell = db.prepare('UPDATE items SET price = ?, sell = ? WHERE id = ?');

  let changed = 0;
  let sumBefore = 0, sumAfter = 0;

  for (const row of shopRows) {
    const target = targetPrice(row);
    if (target === row.price) continue;
    sumBefore += row.price;
    sumAfter += target;
    setShopPrice.run(target, row.item_id);
    // giữ items.price / items.sell đồng bộ để !item và bán lại không lệch
    setSell.run(target, Math.round(target * SELL_RATIO), row.item_id);
    changed++;
  }

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));

  if (changed > 0) {
    const avg = n => Math.round(n / changed);
    console.log(`💰 Economy: chỉnh giá ${changed} trang bị trong shop (TB ${avg(sumBefore)} → ${avg(sumAfter)} vàng)`);
  }
}

module.exports = { migrate, targetPrice, goldAt, weaponKillsAt, GOLD_PER_KILL, WEAPON_KILLS };
