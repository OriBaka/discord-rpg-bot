// Model cân bằng: chỉ số "tốt nhất đạt được ở level N" + xác suất thắng.
//
// Có 2 hàm quan trọng:
//   bestGear/playerAt — dò DB thật, lọc theo class như !equip (class_req).
//   winChance         — xác suất thắng 1 quái, tính giải tích (khớp simulateBattle
//                       trong src/game/combat.js, sai số < 2% so với mô phỏng 4000 trận).
// Dùng bởi test/balance.test.js và tools/zone_rate.js.
const CLS = {
  melee:  { base: { hp: 120, atk: 12, def: 8 }, growth: { hp: 18, atk: 3, def: 3 } },
  magic:  { base: { hp: 80,  atk: 18, def: 3 }, growth: { hp: 10, atk: 5, def: 1 } },
  ranged: { base: { hp: 100, atk: 15, def: 5 }, growth: { hp: 14, atk: 4, def: 2 } },
};

// Hằng số phải khớp src/game/combat.js
const MAX_ROUNDS = 100;
const MITIGATION_K = 240;
const MITIGATION_CAP = 0.75;
const CRIT_CHANCE = 0.15;
const CRIT_MULT = 1.6;
const MAX_HIT_PCT = 0.30;
const RAND_MEAN = 0.5;      // rand(-2,3) có trung bình 0.5
const RAND_SD = Math.sqrt((4 * 4 + 4 + 1) / 12); // ~1.71

const WEAPON_TYPES = {
  melee: ['sword', 'axe', 'mace'],
  magic: ['staff', 'wand', 'orb'],
  ranged: ['bow', 'crossbow', 'gun'],
};

/**
 * Tập id trang bị THỰC SỰ kiếm được: có bán ở shop, drop từ quái, chế được,
 * hoặc nằm trong lootbox. Trang bị không có nguồn nào thì người chơi KHÔNG
 * bao giờ có → không được tính vào mô hình cân bằng.
 *
 * Bài học: trước đây mô hình lấy "MAX(atk) có trong DB", nên báo win-rate
 * 70% trong khi thực tế Pháp Sư/Cung Thủ kẹt ở atk 26 từ Lv.25 đến Lv.45
 * vì 12 vũ khí Lv.30–45 không có nguồn nào.
 */
function obtainableIds() {
  const db = require('../src/db/database');
  const ids = new Set();
  const add = (sql, col) => {
    try { for (const r of db.prepare(sql).all()) if (r[col]) ids.add(r[col]); } catch { /* bảng chưa có */ }
  };
  add('SELECT item_id FROM shop', 'item_id');
  add('SELECT DISTINCT item_id FROM monster_drops', 'item_id');
  add('SELECT output_id FROM recipes', 'output_id');
  add('SELECT DISTINCT reward_id FROM loot_tables', 'reward_id');
  add('SELECT DISTINCT reward_id FROM redeem_rewards', 'reward_id');
  add('SELECT DISTINCT reward_item FROM achievements WHERE reward_item IS NOT NULL', 'reward_item');
  add('SELECT DISTINCT item_id FROM gather_drops', 'item_id');
  return ids;
}

/**
 * Điều kiện SQL: item phải nằm trong danh sách kiếm được.
 * Chỉ lấy id là TRANG BỊ, và so sánh bằng tham số thay vì nội suy — danh sách
 * material (hơn trăm id) từng làm câu SQL dài và dễ sai.
 */
function obtainableSql(ids) {
  if (!ids || ids.size === 0) return { clause: '', params: [] };
  const gear = [...ids].filter(id => GEAR_IDS.has(id));
  if (gear.length === 0) return { clause: '', params: [] };
  return { clause: `AND id IN (${gear.map(() => '?').join(',')})`, params: gear };
}

// Tập id trang bị (nạp 1 lần) để lọc danh sách kiếm được.
// Dùng cờ riêng: trước đây kiểm tra `size > 0` nên nếu lần gọi đầu DB chưa
// có item, cờ không bao giờ được nạp lại → bộ lọc "chỉ đồ kiếm được" bị bỏ qua
// và các test cân bằng lại đọc chỉ số của đồ không có nguồn.
let GEAR_IDS = new Set();
let GEAR_LOADED = false;
function loadGearIds() {
  if (GEAR_LOADED) return GEAR_IDS;
  const db = require('../src/db/database');
  GEAR_IDS = new Set(db.prepare(`SELECT id FROM items
    WHERE type IN ('weapon','offhand','armor','accessory')`).all().map(r => r.id));
  GEAR_LOADED = GEAR_IDS.size > 0;
  return GEAR_IDS;
}

/**
 * Đồ tốt nhất ĐẠT ĐƯỢC ở level `lv` cho class `cls` (lọc class_req như !equip).
 *
 * QUAN TRỌNG: phải chọn theo TỪNG MÓN (ORDER BY ... LIMIT 1) rồi mới cộng
 * atk/def của chính món đó. Trước đây dùng MAX(atk) và MAX(def) riêng rẽ trên
 * các query khác nhau, nên có thể lấy atk của món này ghép def của món kia →
 * chỉ số ảo, có lúc vượt cả "mọi item trong DB".
 */
function bestGear(db, lv, cls = 'melee', onlyObtainable = true) {
  loadGearIds();
  const ob = onlyObtainable ? obtainableSql(obtainableIds()) : { clause: '', params: [] };
  const okClass = `AND (class_req IS NULL OR class_req='' OR class_req='${cls}')`;
  const wts = WEAPON_TYPES[cls].map(t => `'${t}'`).join(',');
  const TIE = '(atk+def) DESC, atk DESC';
  const best = (where, orderBy = 'atk DESC') =>
    db.prepare(`SELECT atk, def FROM items WHERE ${where} AND min_level<=${lv} ${okClass} ${ob.clause}
      ORDER BY ${orderBy} LIMIT 1`).get(...ob.params) || { atk: 0, def: 0 };

  const w = best(`type='weapon' AND weapon_type IN (${wts})`);

  // Giáp theo từng slot: mỗi slot lấy 1 món có def cao nhất
  let armorDef = 0;
  for (const slot of ['head', 'chest', 'legs', 'feet', 'hands']) {
    armorDef += best(`type='armor' AND armor_slot='${slot}'`, 'def DESC').def || 0;
  }
  // Tay phụ: 1 món, ưu tiên tổng atk+def
  const off = best(`type='offhand'`, TIE);

  // Phụ kiện: 2 nhẫn + 1 dây chuyền + 1 đặc biệt (đúng như slots.js)
  const acc = [];
  for (const [type, n] of [['ring', 2], ['necklace', 1], ['special', 1]]) {
    const rows = db.prepare(`SELECT atk, def FROM items WHERE type='accessory' AND accessory_type=?
        AND min_level<=${lv} ${okClass} ${ob.clause}
        ORDER BY ${TIE} LIMIT ${n}`).all(type, ...ob.params);
    for (const r of rows) acc.push(r);
  }

  const sum = (arr, k) => arr.reduce((s, r) => s + (r[k] || 0), 0);
  return {
    weaponAtk: w.atk || 0,
    armorDef,
    offAtk: off.atk || 0,
    accAtk: sum(acc, 'atk'),
    accDef: sum(acc, 'def'),
  };
}

/**
 * Chỉ số người chơi ở level `lv`, đo bằng ĐÚNG code path của game.
 * gear = 1 → đồ tốt nhất đạt được; gear = 0.6 → mới có 60% phần cộng từ đồ
 * (mô phỏng người chơi chưa sưu tầm đủ).
 */
const _statsCache = new Map();
function playerAt(a, b, c, d) {
  // Hỗ trợ cả playerAt(lv, cls, gear) và playerAt(db, lv, cls, gear)
  let lv, clsId, gear;
  if (typeof a === 'number') { lv = a; clsId = b || 'melee'; gear = typeof c === 'number' ? c : 1; }
  else { lv = b; clsId = c || 'melee'; gear = typeof d === 'number' ? d : 1; }
  const key = lv + '|' + clsId;
  if (!_statsCache.has(key)) {
    _statsCache.set(key, { full: measurePlayer(lv, clsId, true), base: measurePlayer(lv, clsId, false) });
  }
  const { full, base } = _statsCache.get(key);
  const mix = (b, f) => Math.round(b + (f - b) * gear);
  const max_hp = full.hp;                       // HP không phụ thuộc đồ
  return {
    user_id: 'SIM', level: lv, hp: max_hp, max_hp,
    atk: mix(base.atk, full.atk),
    def: mix(base.def, full.def),
  };
}

/** Giảm sát thương theo DEF (khớp damageAfterDef của combat.js) */
function mitigation(def) {
  return Math.min(MITIGATION_CAP, Math.max(0, def) / (Math.max(0, def) + MITIGATION_K));
}

/** Sát thương trung bình 1 đòn, đã tính crit kỳ vọng — dùng cho báo cáo */
function avgDamage(atk, def, receiverMaxHp = Infinity) {
  let dmg = Math.max(1, atk * (1 - mitigation(def)) + RAND_MEAN);
  if (Number.isFinite(receiverMaxHp)) dmg = Math.min(dmg, receiverMaxHp * MAX_HIT_PCT);
  return dmg * (1 + CRIT_CHANCE * (CRIT_MULT - 1));
}

// ---- Monte Carlo có seed: mô phỏng ĐÚNG thuật toán của simulateBattle ----
// Dùng RNG riêng để kết quả lặp lại được (test không bị flaky) và để
// không đụng tới Math.random của tiến trình khác.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;      // LCG
    return s / 4294967296;
  };
}
const SIMS = Number(process.env.BALANCE_SIMS || 500);

function winRate(p, m, sims = SIMS, seed = 12345) {
  const rng = makeRng(seed);
  const rand = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
  const dmgOf = (atk, def, recvHp) => {
    const red = Math.min(MITIGATION_CAP, Math.max(0, def) / (Math.max(0, def) + MITIGATION_K));
    let d = Math.max(1, atk * (1 - red) + rand(-2, 3));
    if (Number.isFinite(recvHp)) d = Math.min(d, Math.max(1, recvHp * MAX_HIT_PCT));
    return Math.max(1, Math.round(d));
  };
  let wins = 0;
  for (let i = 0; i < sims; i++) {
    let pHp = p.hp, mHp = m.hp, round = 0;
    while (pHp > 0 && mHp > 0 && round < MAX_ROUNDS) {
      round++;
      let pd = dmgOf(p.atk, m.def);
      if (rng() < CRIT_CHANCE) pd = Math.round(pd * CRIT_MULT);
      mHp -= pd;
      if (mHp <= 0) break;
      let md = dmgOf(m.atk, p.def, p.max_hp);
      if (rng() < CRIT_CHANCE) md = Math.round(md * CRIT_MULT);
      pHp -= md;
    }
    if (mHp <= 0) wins++;
  }
  return wins / sims;
}

/** Xác suất thắng 1 quái */
function winChance(p, m) {
  return winRate(p, m);
}

/** Win-rate của zone: bốc quái theo weight, đúng như pickMonsterInZone */
function zoneWinRate(db, zoneId, lv, clsId = 'melee', gear = 1) {
  const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND (elite_tier IS NULL OR elite_tier=0)').all(zoneId);
  if (!mobs.length) return null;
  const p = playerAt(db, lv, clsId, gear);
  const total = mobs.reduce((s, m) => s + (m.weight || 10), 0);
  return mobs.reduce((s, m) => s + (m.weight || 10) / total * winChance(p, m), 0) * 100;
}

function erf(x) { // Abramowitz & Stegun 7.1.26
  const sign = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * y;
}

/**
 * Do chi so THAT: tao player qua dung code path (class -> len cap -> equip do
 * tot nhat), roi doc getEffectiveStats. Khong dung cong thuc gia lap nen khong
 * bao gio lech voi game. Tra ve { hp, atk, def }.
 */
function measurePlayer(lv, clsId = 'melee', withGear = true) {
  const ROOT = require('path').join(__dirname, '..');
  const player = require(`${ROOT}/src/game/player`);
  const classes = require(`${ROOT}/src/game/classes`);
  const db = require(`${ROOT}/src/db/database`);

  const uid = `__sim_${clsId}`;
  db.prepare('DELETE FROM equipped WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
  player.createPlayer(uid, uid);
  classes.unlockClass(uid, clsId);
  classes.setPrimaryClass(uid, clsId);

  let guard = 0;
  while (player.getPlayer(uid).level < lv && guard++ < 200) {
    const cur = player.getPlayer(uid);
    player.addXpAndLevel(uid, player.xpToNext(cur.level) - cur.xp);
  }

  if (!withGear) {
    const p0 = player.getPlayer(uid);
    const b = { hp: p0.max_hp, atk: p0.atk, def: p0.def };
    db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
    return b;
  }
  const ins = db.prepare('INSERT OR REPLACE INTO equipped (user_id, slot, item_id) VALUES (?,?,?)');
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const okClass = "AND (class_req IS NULL OR class_req='' OR class_req=?)";
  const wts = WEAPON_TYPES[clsId].map(t => `'${t}'`).join(',');

  const w = one(`SELECT id FROM items WHERE type='weapon' AND min_level<=? ${okClass}
      AND weapon_type IN (${wts}) ORDER BY atk DESC LIMIT 1`, lv, clsId);
  if (w) ins.run(uid, 'weapon', w.id);
  for (const slot of ['head', 'chest', 'legs', 'feet', 'hands']) {
    const a = one(`SELECT id FROM items WHERE type='armor' AND armor_slot=? AND min_level<=? ${okClass}
        ORDER BY def DESC LIMIT 1`, slot, lv, clsId);
    if (a) ins.run(uid, slot, a.id);
  }
  const off = one(`SELECT id FROM items WHERE type='offhand' AND min_level<=? ${okClass}
      ORDER BY (atk+def) DESC LIMIT 1`, lv, clsId);
  if (off) ins.run(uid, 'offhand', off.id);
  const accSlots = { ring: ['ring1', 'ring2'], necklace: ['necklace'], special: ['special'] };
  for (const [type, slots] of Object.entries(accSlots)) {
    const list = db.prepare(`SELECT id FROM items WHERE type='accessory' AND accessory_type=?
        AND min_level<=? ${okClass} ORDER BY (atk+def) DESC LIMIT ${slots.length}`).all(type, lv, clsId);
    list.forEach((it, i) => ins.run(uid, slots[i], it.id));
  }

  const p = player.getPlayer(uid);
  const st = player.getEffectiveStats(p);
  const out = { hp: p.max_hp, atk: st.atk, def: st.def };
  db.prepare('DELETE FROM equipped WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
  return out;
}

module.exports = {
  measurePlayer, playerAt,
  CLS, bestGear, obtainableIds, avgDamage, winChance, winRate, zoneWinRate, erf, makeRng,
  MAX_ROUNDS, MITIGATION_K, MITIGATION_CAP, CRIT_CHANCE, CRIT_MULT, MAX_HIT_PCT, mitigation,
};
