// RAID BOSS TUẦN — hệ thống đánh boss theo nhóm (nhiều người, chia sát thương).
//
// ---------------------------------------------------------------------------
// VÌ SAO CẦN HỆ THỐNG NÀY
// ---------------------------------------------------------------------------
// Hai lỗ hổng đo được của game hiện tại:
//
// 1. KHÔNG CÓ CHƠI NHÓM. `%hunt` là mô phỏng tuyệt đối đơn độc: mỗi người tự
//    đánh bản sao quái của riêng mình. Dù 20 người trong bang cùng gõ `%hunt`
//    thì không ai tương tác với ai. Với game Discord (chơi cạnh nhau trong
//    cùng một kênh chat), đây là mất mát lớn nhất — không có lý do xã hội nào
//    để ở lại server.
//
// 2. NỘI DUNG HẾT Ở LV.45. Vũ khí cao nhất Lv.45, zone cao nhất Lv.40, và
//    0 vật phẩm có min_level > 45 — trong khi player lên được Lv.100. Nghĩa
//    là 86% chặng đường không có phần thưởng mới nào.
//
// Cách hệ thống này giải quyết: một con boss CHUNG cho cả server mỗi tuần,
// mọi người cùng đánh vào MỘT thanh máu. Sát thương dồn lại, ai gây nhiều
// nhất được thưởng nhiều nhất. Đây là lý do quay lại hàng ngày (kiểm tra boss
// còn bao nhiêu máu) mà không cần cày thêm giờ.
//
// ---------------------------------------------------------------------------
// THIẾT KẾ ĐỂ MỞ RỘNG (quan trọng — đọc trước khi thêm boss)
// ---------------------------------------------------------------------------
// Muốn thêm boss mới: chỉ thêm một entry vào BOSS_POOL. Không sửa logic.
// Mỗi boss khai báo `minLevel` để người mới không bị chặn, `hpBase` để cân
// độ khó, và `drops` để quyết phần thưởng. Hệ thống tự chọn boss phù hợp khi
// tuần mới bắt đầu (xoay vòng theo tuần, nên mỗi tuần một con khác nhau).
//
// Muốn thêm độ khó (heroic/nightmare)? Đó là nhân vào `hpBase` và `drops`,
// không phải tạo bảng mới — xem `scaleForDifficulty`.
//
// KHÔNG lưu HP boss dạng "còn lại" trong một cột duy nhất rồi UPDATE liên tục:
// cách đó sai khi 2 người đánh cùng lúc (mất sát thương). Nay lưu từng lần
// đánh vào raid_attacks, HP còn lại = hp_total - SUM(damage). Nhờ vậy:
//   • Không mất sát thương khi đánh đồng thời (INSERT độc lập nhau).
//   • Có bảng xếp hạng sát thương tự nhiên (SUM GROUP BY user).
//   • Truy vết được ai đánh bao nhiêu, lúc nào.

const db = require('../db/database');

// Require lười — tránh vòng lặp với database.js (module này được nạp từ
// chuỗi migration, mà player.js cũng require database.js).
function playerMod() { return require('./player'); }
function itemMod() { return require('./items'); }
function guildMod() { return require('./guilds'); }

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const HOUR_MS = 60 * 60 * 1000;

// Số lượt đánh mỗi người mỗi tuần. Đủ để thấy tiến bộ, không đủ để một người
// gánh cả server — buộc phải rủ nhau cùng đánh.
const ATTACKS_PER_WEEK = 5;

// Cooldown giữa 2 lượt đánh của cùng một người (tránh spam dồn 5 lượt/1 phút).
const ATTACK_COOLDOWN_MS = 10 * 60 * 1000;

// Một lượt đánh của người chơi = mô phỏng nhiều hiệp đánh vào boss.
// Boss raid không đánh trả theo kiểu giết người chơi — nó là "bài kiểm tra
// sát thương", nên người chơi luôn sống, chỉ khác nhau ở lượng máu gây ra.
// Lý do: nếu boss giết được người chơi thì người yếu không dám đánh, và
// thanh máu chung sẽ không bao giờ đầy → hệ thống chết.
const ROUNDS_PER_ATTACK = 20;

// ---------------------------------------------------------------------------
// DANH SÁCH BOSS
//
// `minLevel`  : level tối thiểu để đánh (không chặn người mới ở boss tuần đầu)
// `hpBase`    : HP cho một tuần; nhân với số người tham gia khi khởi tạo
// `atk`/`def` : dùng cho công thức sát thương chung của combat.js
// `drops`     : phần thưởng cho người top sát thương (xem grantRewards)
// ---------------------------------------------------------------------------
const BOSS_POOL = [
  {
    id: 'raid_goblin_king',
    name: '👺 Goblin King',
    zone: 'forest',
    minLevel: 1,
    hpBase: 88_000,
    atk: 90,
    def: 20,
    desc: 'Vua của lũ goblin ở rìa Forest. Hắn không mạnh — hắn chỉ đông.',
    drops: { gold: 25_000, xp: 6_000, items: [['potion_m', 3]] },
  },
  {
    id: 'raid_bone_titan',
    name: '💀 Bone Titan',
    zone: 'cave',
    minLevel: 10,
    hpBase: 198_000,
    atk: 150,
    def: 50,
    desc: 'Bộ xương của một sinh vật chưa từng được ghi tên, đứng dậy sau nghìn năm.',
    drops: { gold: 60_000, xp: 15_000, items: [['potion_l', 2]] },
  },
  {
    id: 'raid_ember_wyrm',
    name: '🔥 Ember Wyrm',
    zone: 'volcano',
    minLevel: 25,
    hpBase: 269_000,
    atk: 260,
    def: 90,
    desc: 'Con rồng non sống trong Ember Peak. Lửa của nó chưa đủ nóng để giết — chỉ để đe.',
    drops: { gold: 140_000, xp: 40_000, items: [['potion_astral', 1]] },
  },
  {
    id: 'raid_void_herald',
    name: '🌌 Void Herald',
    zone: 'astral_ruins',
    minLevel: 40,
    hpBase: 325_000,
    atk: 400,
    def: 130,
    desc: 'Kẻ mang tin từ phía bên kia Astral Ruins. Nó không tấn công — nó chỉ hiện diện, và sự hiện diện đó đủ để giết.',
    drops: { gold: 300_000, xp: 90_000, items: [['elixir', 1]] },
  },
];

function migrate() {
  db.exec(`
    -- Mỗi tuần một dòng. Tuần mới = dòng mới, tuần cũ giữ lại làm lịch sử.
    CREATE TABLE IF NOT EXISTS raid_bosses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key    TEXT NOT NULL UNIQUE,   -- '2026-W45'
      boss_id     TEXT NOT NULL,
      hp_total    INTEGER NOT NULL,
      started_at  INTEGER NOT NULL,
      ends_at     INTEGER NOT NULL,
      defeated_at INTEGER,                -- NULL = chưa hạ được
      settled     INTEGER NOT NULL DEFAULT 0
    );

    -- Từng lượt đánh. HP còn lại = hp_total - SUM(damage) của tuần đó.
    -- Không UPDATE một cột hp → an toàn khi đánh đồng thời.
    CREATE TABLE IF NOT EXISTS raid_attacks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      raid_id    INTEGER NOT NULL,
      user_id    TEXT NOT NULL,
      guild_id   INTEGER,
      damage     INTEGER NOT NULL,
      attacked_at INTEGER NOT NULL
    );

    -- Một người chỉ được nhận thưởng 1 lần/tuần dù đánh bao nhiêu lượt.
    CREATE TABLE IF NOT EXISTS raid_rewards (
      raid_id  INTEGER NOT NULL,
      user_id  TEXT NOT NULL,
      gold     INTEGER NOT NULL DEFAULT 0,
      xp       INTEGER NOT NULL DEFAULT 0,
      items    TEXT NOT NULL DEFAULT '[]',
      tier     TEXT NOT NULL DEFAULT 'none',
      granted_at INTEGER NOT NULL,
      PRIMARY KEY (raid_id, user_id)
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_raid_attacks_raid ON raid_attacks(raid_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_raid_attacks_user ON raid_attacks(raid_id, user_id)`);

  console.log('🐲 Raid boss: migrated');
}

// ---------------------------------------------------------------------------
// TUẦN — dùng ISO week (thứ 2 là đầu tuần), đúng cảm giác "boss tuần"
// ---------------------------------------------------------------------------
function weekKey(ts = Date.now()) {
  const d = new Date(ts);
  // Chuyển sang UTC để kết quả không phụ thuộc timezone máy chủ
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thứ 2 = 1 ... Chủ nhật = 7
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);   // về thứ 5 của tuần ISO
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc - yearStart) / DAY_MS + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Mốc bắt đầu và kết thúc của tuần chứa `ts` (thứ 2 00:00 UTC → thứ 2 tuần sau)
function weekRange(ts = Date.now()) {
  const d = new Date(ts);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - (dayNum - 1));
  const start = utc.getTime();
  return { start, end: start + WEEK_MS };
}

// ---------------------------------------------------------------------------
// Chọn boss cho tuần — xoay vòng theo tuần nên mỗi tuần một con khác nhau.
// Ưu tiên boss mà server "đủ trình" đánh: nếu chọn boss minLevel 40 cho một
// server toàn người Lv.5 thì thanh máu sẽ không bao giờ đầy. Vì vậy lọc theo
// level trung bình của người chơi, có fallback về boss yếu nhất.
// ---------------------------------------------------------------------------
function pickBoss(weekKeyStr) {
  // Level của người chơi CAO NHẤT — không dùng trung bình.
  //
  // Lý do: nếu server có 1 người Lv.50 và 20 người Lv.5, trung bình là ~7 nên
  // hệ thống chọn boss Lv.1 → người Lv.50 thấy boss vô nghĩa. Ngược lại nếu
  // dùng trung bình và chọn boss quá cao thì đa số không đánh được (đã gặp:
  // server toàn Lv.20 nhưng chọn Ember Wyrm yêu cầu Lv.25 → cả server bị chặn).
  //
  // Neo theo người CAO NHẤT nhưng lùi 1 bậc: boss phải là thử thách cho người
  // mạnh nhất, mà vẫn trong tầm với của số đông.
  // Dùng PERCENTILE 75, không dùng MAX cũng không dùng AVG.
  //
  // Đo bằng mô phỏng 4 tuần với 6 người (5,10,15,20,22,25):
  //   • MAX  → chọn boss minLevel 25, nhưng 4/6 người dưới Lv.20 bị CHẶN
  //            không đánh được → cả tuần chỉ gây 32% máu, người chơi chán.
  //   • AVG  → chọn boss quá yếu so với nhóm khá giả, boss chết trong 1-2 lượt.
  //   • P75  → "trình độ của phần lớn người chơi": boss vừa sức 3/4 server,
  //            người yếu nhất vẫn xem được BXH và lên cấp để tham gia tuần sau.
  //
  // Đây là con số đúng cho câu hỏi "server này đánh được boss nào", vì nó
  // bỏ qua cả ngoại lệ mạnh nhất lẫn nhóm tài khoản bỏ hoang.
  const levels = db.prepare('SELECT level FROM players ORDER BY level').all().map(r => r.level);
  const p75 = levels.length
    ? levels[Math.min(levels.length - 1, Math.floor(levels.length * 0.75))]
    : 1;
  const eligible = BOSS_POOL.filter(b => b.minLevel <= p75);
  const pool = eligible.length ? eligible : [BOSS_POOL[0]];

  // Ưu tiên boss KHÓ NHẤT mà phần lớn server đủ trình — luôn có thử thách
  // nhưng không chặn số đông. Xoay vòng trong 2 boss khó nhất đủ điều kiện.
  const top = pool.slice(-2);
  let h = 0;
  for (let i = 0; i < weekKeyStr.length; i++) h = (h * 31 + weekKeyStr.charCodeAt(i)) >>> 0;
  return top[h % top.length];
}

// Số người chơi "hoạt động" — dùng để scale HP boss cho khớp quy mô server
function activePlayerCount() {
  return Math.max(1, db.prepare('SELECT COUNT(*) c FROM players').get().c);
}

// Số người ĐÃ THẬT SỰ đánh boss tuần trước. Dùng làm cơ sở scale HP tuần này,
// để boss khớp với số người thật sự chơi chứ không phải số tài khoản tồn tại.
// Trả 0 nếu chưa có tuần nào (tuần đầu tiên) → bên gọi dùng tổng người chơi.
function lastWeekParticipants() {
  const prev = db.prepare(`SELECT id FROM raid_bosses WHERE ends_at <= ?
    ORDER BY ends_at DESC LIMIT 1`).get(Date.now());
  if (!prev) return 0;
  return db.prepare('SELECT COUNT(DISTINCT user_id) c FROM raid_attacks WHERE raid_id = ?')
    .get(prev.id).c;
}

// Tổng hợp sát thương của một tuần
function raidDamage(raidId) {
  return db.prepare('SELECT COALESCE(SUM(damage),0) d FROM raid_attacks WHERE raid_id = ?')
    .get(raidId).d;
}

// Lấy (hoặc tạo) boss của tuần hiện tại
function getCurrentRaid(now = Date.now()) {
  const wk = weekKey(now);
  let raid = db.prepare('SELECT * FROM raid_bosses WHERE week_key = ?').get(wk);
  if (raid) return decorate(raid);

  const boss = pickBoss(wk);
  const { start, end } = weekRange(now);
  // HP neo theo SÁT THƯƠNG THẬT của người chơi ở level tương ứng, không dùng
  // hằng số tuỳ tiện.
  //
  // Đo được (damageAfterDef với def của boss, 20 hiệp/lượt):
  //   Lv.1 → ~350 sát thương/lượt,  Lv.20 → ~1.750,  Lv.50 → ~3.950,
  //   Lv.90 → ~5.375,  Lv.130 → ~6.500.
  //
  // Số người tham gia = số người ĐÃ ĐÁNH tuần trước (fallback: tổng người chơi).
  //
  // Từng sai: lấy TỔNG số người chơi trong DB. Server 3 người nhưng chỉ 1
  // người thật sự đánh → HP đặt cho 3 người, người đó không bao giờ hạ nổi
  // boss (đo được: 5/5 lượt chỉ gây 24.711/27.981 máu, hụt 12% và chắc chắn
  // thất bại). Boss phải khó vì ĐÔNG NGƯỜI, không phải vì chôn số người không
  // tồn tại. Tuần đầu tiên chưa có dữ liệu thì dùng tổng người chơi.
  //
  // Mục tiêu: người tham gia dùng hết 5 lượt → hạ được boss (90% máu), nên
  // cần đông người ĐỂ HẠ NHANH, không phải để hạ được.
  const players = activePlayerCount();
  const lastParticipants = lastWeekParticipants();

  // Tuần ĐẦU TIÊN chưa biết bao nhiêu người thật sự chơi: dùng 40% tổng số
  // tài khoản. Lý do: rất nhiều server có tài khoản "đăng ký rồi bỏ", và nếu
  // đặt HP theo toàn bộ tài khoản thì tuần đầu sẽ không ai hạ nổi boss —
  // người chơi thử một lần, thấy bất khả thi, rồi bỏ luôn hệ thống.
  // Boss tuần đầu phải DỄ để mọi người thấy nó hoạt động; từ tuần 2 trở đi
  // HP tự hiệu chỉnh theo đúng số người tham gia thật.
  const participants = lastParticipants > 0
    ? lastParticipants
    : Math.max(1, Math.round(players * 0.4));

  // Sát thương kỳ vọng neo theo level TRUNG BÌNH của server, không theo
  // người mạnh nhất và không theo minLevel của boss.
  //
  // Hai lần sai trước, đều đo được bằng mô phỏng nhiều tuần:
  //   • min(boss.minLevel, maxLv) → server Lv.20 gặp boss minLevel 1 thì tính
  //     theo Lv.1, boss chết trong 2 đòn.
  //   • MAX(level) → server có 1 người Lv.25 và 5 người Lv.5–15 thì HP neo
  //     theo Lv.25, và cả server chỉ gây được 20% máu/tuần. Người mạnh nhất
  //     là ngoại lệ, không phải chuẩn.
  //
  // Trung bình phản ánh đúng "một người chơi điển hình gây bao nhiêu", nên
  // tổng sát thương của N người ≈ N × perAttack — đúng giả định của công thức HP.
  const avgLv = db.prepare('SELECT COALESCE(AVG(level), 1) a FROM players').get().a;
  const perAttack = expectedDamagePerAttack(Math.max(1, avgLv), boss.def);
  const hp = Math.round(participants * ATTACKS_PER_WEEK * perAttack * 0.9);

  db.prepare(`INSERT INTO raid_bosses (week_key, boss_id, hp_total, started_at, ends_at)
              VALUES (?,?,?,?,?)`).run(wk, boss.id, hp, start, end);

  raid = db.prepare('SELECT * FROM raid_bosses WHERE week_key = ?').get(wk);
  return decorate(raid);
}

// Sát thương kỳ vọng của MỘT lượt đánh (20 hiệp) ở level tham chiếu.
// Không dùng combat thật vì cần hàm thuần, tất định — HP boss phải ổn định
// giữa các lần khởi tạo, không nhảy theo random.
//
// `bossDef` PHẢI được truyền vào từ boss thật sắp mở.
//
// Từng sai: hàm tự tra boss theo `minLevel === refLevel`. Không boss nào có
// minLevel 80, nên nó fallback về BOSS_POOL[0] (goblin, def 20) trong khi boss
// thật là Ember Wyrm (def 90). HP bị đặt cao hơn thực tế ~27%, và boss trở
// thành bất khả thi: đo được 5/5 lượt chỉ gây 24.308/27.981 máu.
function expectedDamagePerAttack(refLevel, bossDef = BOSS_POOL[0].def) {
  // ATK phải lấy từ CHÍNH bảng chỉ số của class (classes.statsAtLevel), không
  // phải công thức chép tay.
  //
  // Bản cũ viết cứng `10 + 3 * (lv - 1)` và một bảng vũ khí chia bậc thô
  // (62/40/20/7/0). Cả hai đều lạc hậu sau khi thang chỉ số được làm lại:
  // ATK thật của 3 class bây giờ đi theo `growth` riêng, còn vũ khí tốt nhất
  // ở mỗi level là dữ liệu trong bảng items. Sai lệch này làm HP boss bị đặt
  // sai (đã từng khiến boss bất khả thi: 5/5 lượt chỉ gây 24.308/27.981 máu).
  const classes = require('./classes');
  const db = require('../db/database');   // đọc bảng items để biết đồ tốt nhất
  let baseAtk = 0, n = 0;
  for (const cls of ['melee', 'magic', 'ranged']) {
    const st = classes.statsAtLevel(cls, Math.max(1, Math.min(45, Math.round(refLevel))));
    if (st) { baseAtk += st.atk; n++; }
  }
  baseAtk = n ? baseAtk / n : 10 + 3 * (refLevel - 1);

  // Trang bị: vũ khí + tay phụ + phụ kiện — ĐÚNG các slot mà slots.js cộng.
  // Chỉ cộng vũ khí (bản đầu của hàm này) làm sát thương kỳ vọng thấp hơn
  // thực tế 30% ở Lv.25-40, vì tay phụ + 4 món phụ kiện đóng góp tới 40% ATK.
  // Hệ quả: HP boss bị đặt thấp → boss chết trước khi hết tuần.
  const lv = Math.round(refLevel);
  const bestAtk = (where, n = 1) => {
    try {
      return db.prepare(`SELECT atk FROM items WHERE ${where} AND min_level<=?
        ORDER BY (atk+def) DESC, atk DESC LIMIT ${n}`).all(lv);
    } catch { return []; }
  };
  const sumAtk = (rows) => rows.reduce((s, r) => s + (r.atk || 0), 0);
  const weaponAtk = sumAtk(bestAtk(`type='weapon' AND weapon_type IN
    ('sword','axe','mace','staff','wand','orb','bow','crossbow','gun')`));
  const offAtk = sumAtk(bestAtk(`type='offhand'`));
  let accAtk = 0;
  for (const [type, count] of [['ring', 2], ['necklace', 1], ['special', 1]]) {
    accAtk += sumAtk(bestAtk(`type='accessory' AND accessory_type='${type}'`, count));
  }

  const totalAtk = baseAtk + weaponAtk + offAtk + accAtk;
  // Giảm thương theo DEF — DÙNG CHUNG mitigation.js (K=200, trần 75%).
  // Bản cũ hardcode `bossDef / (bossDef + 240)` và trần 0.75: từ khi K đổi
  // thành 200, mọi con số raid đều lệch ~10-15%.
  const { mitigation, MITIGATION_CAP } = require('./mitigation');
  const reduction = Math.min(MITIGATION_CAP, mitigation(bossDef));
  const perHit = totalAtk * (1 - reduction);
  // Crit 15% × 1.6 → hệ số kỳ vọng 0.85 + 0.15×1.6 = 1.09
  const critFactor = 0.85 + 0.15 * 1.6;
  return perHit * critFactor * ROUNDS_PER_ATTACK;
}

function getBossDef(bossId) {
  return BOSS_POOL.find(b => b.id === bossId) || BOSS_POOL[0];
}

// Gắn thêm thông tin tính toán (không lưu vào DB)
function decorate(raid) {
  const boss = getBossDef(raid.boss_id);
  const dealt = raidDamage(raid.id);
  const hpLeft = Math.max(0, raid.hp_total - dealt);
  return {
    ...raid,
    boss,
    damageDealt: dealt,
    hp_left: hpLeft,
    hp_pct: raid.hp_total > 0 ? hpLeft / raid.hp_total : 0,
    defeated: !!raid.defeated_at || hpLeft <= 0,
    week: raid.week_key,
  };
}

// ---------------------------------------------------------------------------
// LƯỢT ĐÁNH CÒN LẠI
// ---------------------------------------------------------------------------
function attacksUsed(raidId, userId) {
  return db.prepare('SELECT COUNT(*) c FROM raid_attacks WHERE raid_id = ? AND user_id = ?')
    .get(raidId, userId).c;
}

function lastAttackAt(raidId, userId) {
  return db.prepare('SELECT MAX(attacked_at) m FROM raid_attacks WHERE raid_id = ? AND user_id = ?')
    .get(raidId, userId).m || 0;
}

// Trạng thái của một người trong tuần này
function getPlayerStatus(raid, userId, now = Date.now()) {
  const used = attacksUsed(raid.id, userId);
  const left = Math.max(0, ATTACKS_PER_WEEK - used);
  const last = lastAttackAt(raid.id, userId);
  const cdLeft = Math.max(0, last + ATTACK_COOLDOWN_MS - now);
  return {
    used,
    left,
    cooldownMs: cdLeft,
    canAttack: left > 0 && cdLeft === 0 && !raid.defeated,
  };
}

// ---------------------------------------------------------------------------
// ĐÁNH BOSS
//
// Trả về { ok, damage, rounds, ... } hoặc { ok:false, reason }
// LƯU Ý: người chơi KHÔNG mất HP và KHÔNG chết khi đánh raid — đây là bài
// kiểm tra sát thương, không phải trận sinh tử. Lý do thiết kế: nếu người yếu
// chết thì họ không dám đánh, thanh máu chung không bao giờ đầy, hệ thống chết.
// ---------------------------------------------------------------------------
function attack(raid, player, opts = {}) {
  const now = opts.now || Date.now();
  const status = getPlayerStatus(raid, player.user_id, now);

  if (raid.defeated) return { ok: false, reason: 'defeated' };
  if (status.left <= 0) return { ok: false, reason: 'no_attacks' };
  if (status.cooldownMs > 0) return { ok: false, reason: 'cooldown', cooldownMs: status.cooldownMs };

  const boss = raid.boss;
  const combat = require('./combat');
  const stats = playerMod().getEffectiveStats(player);

  // Mô phỏng nhiều hiệp: mỗi hiệp người chơi đánh vào boss, boss không giết
  // được người chơi nên ta chỉ cộng dồn sát thương gây ra.
  let damage = 0;
  let crits = 0;
  for (let r = 0; r < ROUNDS_PER_ATTACK; r++) {
    let dmg = combat.damageAfterDef(stats.atk, boss.def);
    if (combat.rollCrit()) { dmg = Math.round(dmg * combat.CRIT_MULT); crits++; }
    damage += dmg;
  }

  // Không thể gây nhiều hơn máu còn lại — tránh "overkill" làm sai bảng xếp hạng
  damage = Math.min(damage, raid.hp_left);

  db.prepare(`INSERT INTO raid_attacks (raid_id, user_id, guild_id, damage, attacked_at)
              VALUES (?,?,?,?,?)`)
    .run(raid.id, player.user_id, opts.guildId || null, damage, now);

  // Sát thương raid quy đổi thành XP BANG. Đây là lý do bang hội có ý nghĩa
  // thật: bang càng đông người đánh raid thì bang lên cấp càng nhanh, buff
  // vàng/XP cho mọi thành viên càng cao → vòng lặp "rủ nhau chơi".
  //
  // Tỷ lệ: 1 XP bang / 8 sát thương. Đo được: một người Lv.20 gây ~1.500
  // sát thương/lượt → ~190 XP bang/lượt, 5 lượt = ~940 XP/thành viên/tuần.
  // Bang 5 người đánh đủ = ~4.700 XP/tuần, đủ lên khoảng 1 cấp bang mỗi 2
  // tuần ở cấp thấp (guild xpToNext lv1 = ~1.000). Đủ để thấy tiến bộ, không
  // đủ để bỏ qua việc cày hunt.
  let guildXp = 0;
  if (opts.guildId) {
    try {
      guildXp = Math.floor(damage / 8);
      if (guildXp > 0) guildMod().addGuildXp(opts.guildId, guildXp, player.user_id);
    } catch { guildXp = 0; }
  }

  // Đánh dấu hạ được boss nếu đây là đòn cuối
  const dealt = raidDamage(raid.id);
  const killed = dealt >= raid.hp_total;
  if (killed && !raid.defeated_at) {
    db.prepare('UPDATE raid_bosses SET defeated_at = ? WHERE id = ?').run(now, raid.id);
  }

  return { ok: true, damage, crits, rounds: ROUNDS_PER_ATTACK, killed, dealt, guildXp };
}

// ---------------------------------------------------------------------------
// BẢNG XẾP HẠNG SÁT THƯƠNG
// ---------------------------------------------------------------------------
function leaderboard(raidId, limit = 10) {
  return db.prepare(`
    SELECT a.user_id, SUM(a.damage) dmg, COUNT(*) hits,
           p.name, p.level, p.class
    FROM raid_attacks a
    LEFT JOIN players p ON p.user_id = a.user_id
    WHERE a.raid_id = ?
    GROUP BY a.user_id
    ORDER BY dmg DESC
    LIMIT ?`).all(raidId, limit);
}

// Xếp hạng theo BANG — tổng sát thương của các thành viên.
// Đây là lý do bang hội có ý nghĩa: bang mạnh = boss chết nhanh hơn.
function guildLeaderboard(raidId, limit = 10) {
  return db.prepare(`
    SELECT a.guild_id, SUM(a.damage) dmg, COUNT(DISTINCT a.user_id) members,
           g.name, g.tag, g.level
    FROM raid_attacks a
    JOIN guilds g ON g.id = a.guild_id
    WHERE a.raid_id = ? AND a.guild_id IS NOT NULL
    GROUP BY a.guild_id
    ORDER BY dmg DESC
    LIMIT ?`).all(raidId, limit);
}

// ---------------------------------------------------------------------------
// PHẦN THƯỞNG
//
// Chia theo hạng, không chia đều: người góp nhiều máu nhất phải được nhiều
// nhất, nếu không chẳng ai buộc phải đánh mạnh. Nhưng vẫn có thưởng cho mọi
// người đã tham gia (không ai ra về tay trắng) — người mới vẫn có lý do góp.
//
// Tỷ lệ: hạng 1 = 100% phần thưởng boss, hạng 2-3 = 60%, hạng 4-10 = 35%,
// còn lại (có tham gia) = 20%.
// ---------------------------------------------------------------------------
function rewardTier(rank) {
  if (rank === 1) return { tier: 'mvp', mult: 1.0 };
  if (rank <= 3) return { tier: 'top3', mult: 0.6 };
  if (rank <= 10) return { tier: 'top10', mult: 0.35 };
  return { tier: 'participant', mult: 0.2 };
}

// Trao thưởng cho một tuần. Idempotent: gọi nhiều lần không nhân đôi thưởng
// (raid_rewards có PRIMARY KEY (raid_id, user_id)).
function settleRewards(raidId, opts = {}) {
  const raid = db.prepare('SELECT * FROM raid_bosses WHERE id = ?').get(raidId);
  if (!raid) return { ok: false, reason: 'no_raid' };
  if (raid.settled && !opts.force) return { ok: false, reason: 'already_settled' };

  const boss = getBossDef(raid.boss_id);

  // Thưởng phụ thuộc vào việc CÓ HẠ ĐƯỢC BOSS hay không.
  //
  // Từng trả thưởng đầy đủ dù boss còn sống — nghĩa là cả server có thể
  // "đánh cho có" rồi nhận nguyên phần thưởng, và thanh máu chung trở thành
  // vô nghĩa. Nay: hạ boss = 100%, không hạ = 35% (vẫn có thưởng để người
  // tham gia không ra về tay trắng, nhưng chênh lệch đủ lớn để tạo động lực).
  const defeated = !!raid.defeated_at || raidDamage(raidId) >= raid.hp_total;
  const defeatMult = defeated ? 1.0 : 0.35;

  const rows = db.prepare(`
    SELECT user_id, SUM(damage) dmg FROM raid_attacks
    WHERE raid_id = ? GROUP BY user_id ORDER BY dmg DESC`).all(raidId);

  const now = Date.now();
  const granted = [];
  const P = playerMod();
  const I = itemMod();

  rows.forEach((row, i) => {
    const rank = i + 1;
    const { tier, mult } = rewardTier(rank);
    const gold = Math.round(boss.drops.gold * mult * defeatMult);
    const xp = Math.round(boss.drops.xp * mult * defeatMult);
    // Vật phẩm chỉ cho top 10 — phần thưởng vật chất phải khan hiếm
    // Vật phẩm CHỈ khi hạ được boss — thứ khan hiếm nhất phải gắn với
    // thành tích chung, không thể đạt được bằng cách đánh vài lượt rồi bỏ.
    const items = (rank <= 10 && defeated)
      ? boss.drops.items.map(([id, q]) => [id, Math.max(1, Math.round(q * mult))])
      : [];

    const already = db.prepare('SELECT 1 FROM raid_rewards WHERE raid_id = ? AND user_id = ?')
      .get(raidId, row.user_id);
    if (already) return;

    const p = P.getPlayer(row.user_id);
    if (p) {
      P.updatePlayer(row.user_id, { gold: (p.gold || 0) + gold });
      P.addXpAndLevel(row.user_id, xp);
      for (const [id, q] of items) {
        if (I.getItem(id)) P.addItem(row.user_id, id, q);
      }
    }

    db.prepare(`INSERT OR IGNORE INTO raid_rewards (raid_id, user_id, gold, xp, items, tier, granted_at)
                VALUES (?,?,?,?,?,?,?)`)
      .run(raidId, row.user_id, gold, xp, JSON.stringify(items), tier, now);

    granted.push({ user_id: row.user_id, rank, tier, gold, xp, items, damage: row.dmg });
  });

  db.prepare('UPDATE raid_bosses SET settled = 1 WHERE id = ?').run(raidId);
  return { ok: true, granted, boss, defeated, defeatMult };
}

// Người chơi đã nhận thưởng tuần này chưa
function getReward(raidId, userId) {
  return db.prepare('SELECT * FROM raid_rewards WHERE raid_id = ? AND user_id = ?')
    .get(raidId, userId) || null;
}

// Tuần trước — để người chơi xem kết quả tuần vừa rồi
function getPreviousRaid(now = Date.now()) {
  const prev = db.prepare(`SELECT * FROM raid_bosses WHERE ends_at <= ? ORDER BY ends_at DESC LIMIT 1`)
    .get(now);
  return prev ? decorate(prev) : null;
}

// Dọn dẹp: tự chốt thưởng cho các tuần đã kết thúc mà chưa settle.
// Gọi định kỳ từ index.js (mỗi giờ) để không cần ai bấm tay.
function settleExpired(now = Date.now()) {
  const expired = db.prepare(`SELECT * FROM raid_bosses
    WHERE ends_at <= ? AND settled = 0`).all(now);
  const results = [];
  for (const r of expired) {
    const res = settleRewards(r.id);
    results.push({ week: r.week_key, ...res });
  }
  return results;
}

module.exports = {
  migrate,
  BOSS_POOL, ATTACKS_PER_WEEK, ATTACK_COOLDOWN_MS, ROUNDS_PER_ATTACK,
  weekKey, weekRange,
  getCurrentRaid, getPreviousRaid, getBossDef, expectedDamagePerAttack,
  attacksUsed, lastWeekParticipants,
  getPlayerStatus, attack, raidDamage,
  leaderboard, guildLeaderboard,
  settleRewards, settleExpired, getReward, rewardTier,
};
