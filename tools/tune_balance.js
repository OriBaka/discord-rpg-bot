// Công cụ cân bằng quái — TÍNH LẠI TOÀN BỘ 45 QUÁI.
//
// ---------------------------------------------------------------------------
// VÌ SAO VIẾT LẠI
//
// Bản cũ đặt ATK quái = capRef, trong đó
//     capRef = max_k( maxHp_k * 0.30 / (1 - mitigation(def_k)) ) * 1.10
// tức là vừa đủ để đòn đánh chạm TRẦN 30% max HP của class trì nhiều giáp
// nhất. Hệ quả: với class đó, mỗi đòn luôn lấy đúng 30% máu, KHÔNG PHỤ THUỘC
// DEF. Mặc thêm giáp không giảm được một điểm sát thương nào — toàn bộ nhánh
// trang bị phòng thủ thành trang trí. Đo được với K=240: cả bộ 5 món giáp da
// (750 vàng) chỉ giảm 6.8% sát thương nhận vào.
//
// NGUYÊN TẮC MỚI
//   1. ATK quái chọn sao cho người chơi full đồ ăn ~23% max HP mỗi đòn —
//      DƯỚI trần 30%. Nhờ vậy DEF còn dư địa để có tác dụng: mặc thêm giáp
//      thật sự giảm được sát thương, chứ không bị trần "đo hết".
//   2. HP quái bisect để trung vị 3 class đạt mục tiêu zone (70%).
//   3. Mỗi class phải tự đạt mục tiêu, không chỉ trung vị — nếu chỉ cân trung
//      vị thì có thể 2 class 80% và 1 class 50%, trung vị vẫn "đẹp".
//
// Chạy: node tools/tune_balance.js [--detail] [--json]
// ---------------------------------------------------------------------------
const path = require('path');
const { playerAt, winRate, mitigation, CRIT_CHANCE, CRIT_MULT, MAX_HIT_PCT } = require('../test/balance_sim');
const db = require('../src/db/database');

const CLASSES = ['melee', 'magic', 'ranged'];
const TIER_ORDER = { safe: 0, even: 0, danger: 0 };

// Danh sách quái THẬT trong DB, kèm tier và weight. Không hardcode weight —
// đọc từ DB để bảng sinh ra khớp đúng cấu trúc hiện có.
// (Bản cũ dùng tên quái đã bị đổi từ lâu, nên công cụ sinh ra 51 "quái ma"
//  không tồn tại, và bỏ sót 30 quái thật.)
const LAYOUT = {
  forest:       [['slime', 'safe'], ['giant_rat', 'safe'], ['forest_wisp', 'even'], ['wolf', 'even'], ['forest_bear', 'danger'], ['moss_golem', 'danger']],
  cave:         [['bat', 'safe'], ['cave_spider', 'safe'], ['blind_stalker', 'even'], ['goblin', 'even'], ['cave_golem', 'danger'], ['goblin_chief', 'danger']],
  swamp:        [['bog_toad', 'safe'], ['leech_swarm', 'safe'], ['mire_witch', 'even'], ['swamp_lurker', 'even'], ['bog_colossus', 'danger']],
  desert:       [['dust_raider', 'safe'], ['scorpion', 'safe'], ['mummy', 'even'], ['sun_wraith', 'even'], ['cactus_horror', 'danger'], ['sand_worm', 'danger']],
  mountain:     [['frost_wolf', 'safe'], ['snowman', 'safe'], ['orc', 'even'], ['yeti', 'even'], ['ice_elemental', 'danger'], ['stone_berserker', 'danger'], ['troll', 'danger']],
  dragon_lair:  [['drake_whelp', 'safe'], ['lair_guardian', 'even'], ['young_dragon', 'even'], ['dragon', 'danger'], ['void_dragon', 'danger']],
  volcano:      [['ember_phoenix', 'safe'], ['magma_hound', 'safe'], ['char_giant', 'even'], ['obsidian_golem', 'even']],
  frozen_abyss: [['frost_revenant', 'safe'], ['glacier_wyrm', 'even'], ['abyss_leviathan', 'danger']],
  astral_ruins: [['void_harbinger', 'safe'], ['astral_sentinel', 'even'], ['star_devourer', 'even']],
};

// Mục tiêu win-rate từng tier (tính cho hạng "điển hình" của tier đó).
const TIER = {
  safe:   { targets: [0.82, 0.78], weight: 30, xpMult: 0.85, defFrac: 0.45, defScale: 1 },
  even:   { targets: [0.70, 0.68], weight: 20, xpMult: 1.00, defFrac: 1.00, defScale: 1 },
  danger: { targets: [0.56, 0.58], weight: 10, xpMult: 1.45, defFrac: 1.70, defScale: 1 },
};

// ATK quái = (maxHP trung bình * hitFrac) / (1 - giảm thương của người KHÔNG đồ)
//
// hitFrac nay là TỈ LỆ MAX HP mất mỗi đòn, không còn là bội số của trần —
// trần sát thương đã bị bỏ (xem mitigation.js). Người không đồ ăn đúng
// hitFrac, người mặc giáp ăn ít hơn (DEF cao hơn) → giáp có tác dụng.
// Giá trị được quét từng zone để chênh lệch class nhỏ nhất.
const TARGET_HIT_FRAC = 0.12;

const xpToNext = l => Math.floor(50 * Math.pow(l, 1.5));
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const CRIT_FACTOR = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
const KILLS_PER_LEVEL = 12;
const GOLD_PER_XP = 1.2;
const SIMS = 300;

function playerDmgPerRound(pAtk, mobDef) {
  return Math.max(1, pAtk * (1 - mitigation(mobDef))) * CRIT_FACTOR;
}

// Trạng thái người mới thật: vừa tạo nhân vật, mặc đúng 1 vũ khí khởi đầu.
// Đo qua đúng code path của game (createPlayer → unlockClass → equip), không
// tự cộng số — nếu không lại là mô hình thứ hai lệch với game.
const STARTER_ITEM = { melee: 'wood_sword', magic: 'apprentice_wand', ranged: 'short_bow' };
// Người mới: dùng CHUNG hàm với test (test/balance_sim.js) để tool và test
// không bao giờ đo hai trạng thái khác nhau — đó chính là lỗi đã gặp: tool in
// forest 70% (full đồ Lv.1) còn test đo người mới thật và ra 0%.
const NEWBIE_FIGHTERS = () => require('../test/balance_sim').newbieFighters();

function buildZone(zid, hitFrac = TARGET_HIT_FRAC, tierDelta = 0) {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get(zid);
  const lv = zone.min_level;
  // ZONE ĐẦU (Lv.1): neo theo NGƯỜI MỚI THẬT, không theo "full đồ Lv.1".
  //
  // "Full đồ ở Lv.1" là trạng thái KHÔNG AI CÓ: giáp Lv.1 trong shop cộng 44
  // DEF, gấp 3 lần DEF gốc của người mới (6-8). Người vừa vào game chỉ có vũ
  // khí khởi đầu và 0 giáp. Cân quái theo trạng thái full-đồ-Lv.1 rồi đo người
  // mới thật thì họ giết quái cần 11 đòn trong khi chỉ sống được 6 → thắng 0%
  // ở forest. Đây đúng là lỗi "hunt zone đầu tiên mà ngỏm liên tục".
  //
  // Nên ở Lv.1: dùng chỉ số người mới (vũ khí khởi đầu, không giáp) làm chuẩn.
  const P = lv === 1 ? NEWBIE_FIGHTERS() : CLASSES.map(c => playerAt(lv, c, 1));
  const pAtk = P.reduce((s, p) => s + p.atk, 0) / 3;
  const pDef = P.reduce((s, p) => s + p.def, 0) / 3;

  // ATK quái = mức để đòn đánh (sau giảm thương theo DEF trung bình) rơi vào
  // `hitFrac` max HP.
  // ATK quái neo theo NGƯỜI CHƠI KHÔNG ĐỒ: người KHÔNG mặc giáp phải chạm
  // trần sát thương, người mặc giáp thì nhận ít hơn. Đó chính là chỗ để giáp
  // có tác dụng (bản cũ neo vào người full giáp nên luôn chạm trần → giáp
  // không bao giờ giảm được gì).
  //
  // Nhưng để 3 CLASS cân được với nhau thì cả 3 phải chạm trần khi KHÔNG đồ
  // — nếu không, khoảng cách độ bền giữa class lại lộ ra và không có bộ HP
  // quái nào cân được (xem chú thích MAX_HIT_PCT ở mitigation.js).
  // hitFrac = 1.0 nghĩa là "chạm trần đúng"; các mức thấp hơn được quét để
  // giữ giáp có tác dụng ở zone đầu, nơi giáp còn chênh lệch ít.
  // Zone Lv.1 phải neo theo NGƯỜI MỚI THẬT (chỉ có vũ khí khởi đầu), không
  // theo người chơi "không đồ nhưng đã lên level". Nếu không, quái sẽ đủ mạnh
  // để đẩy người mới vào trần 30% ngay từ trận đầu — họ chết sau 3.3 đòn
  // trong khi cần 4-5 đòn để giết, và lỗi "hunt zone đầu ngỏm liên tục" quay
  // lại dù full-đồ vẫn đạt 70%.
  // Neo ATK quái theo NGUY HIỂM LỚN NHẤT, không theo trung bình.
  //
  // Lỗi thật: lấy trung bình 3 class rồi tính ATK quái từ đó, nhưng độ bền
  // thực của 3 class KHÔNG bằng nhau khi chưa mặc đồ (họ chỉ bằng nhau khi
  // full đồ — đó chính là điều kiện đã cân). Khi chưa đồ, người mới sống được
  // 6-7 đòn trong khi cần 11 đòn để giết quái → thắng 0% ở forest.
  const N = lv === 1
    ? NEWBIE_FIGHTERS()                              // người mới THẬT, có vũ khí khởi đầu
    : CLASSES.map(c => playerAt(lv, c, 0));          // không đồ
  const fragileHp = N.slice().sort((a, b) => a.max_hp / (1 - mitigation(a.def))
    - b.max_hp / (1 - mitigation(b.def)))[0];
  const avgMaxHp = fragileHp.max_hp;
  const nakedDef = fragileHp.def;
  // hitFrac là bội số của TRẦN: 1.0 = người không đồ vừa chạm trần,
  // 1.5 = quái mạnh gấp rưỡi mức đó (mọi class đều chạm trần thoải mái).
  // LƯU Ý — điều KHÔNG hiệu quả (đã đo, đừng thử lại):
  // Đặt ATK quái đủ lớn để CẢ 3 class cùng chạm trần sát thương nghe có lý
  // (ai cũng chết sau 1/MAX_HIT_PCT đòn → khoảng cách HP/DEF biến mất), nhưng
  // đo thực tế: vẫn lệch 9-25 điểm và KHÔNG đổi khi tăng ATK gấp 2.5 lần.
  // Lý do: khi đã chạm trần, win-rate chỉ còn phụ thuộc SỐ ĐÒN ĐỂ GIẾT quái,
  // mà đại lượng đó chênh tới 16-22% giữa các class (volcano: Chiến Binh 4.50
  // đòn, Pháp Sư 3.70 đòn). Chênh lệch độ bền không phải thủ phạm — chênh
  // lệch SÁT THƯƠNG mới là. Xem tools/CAN_BANG.md.
  // Với zone Lv.1, `baseAtk` tính theo def của người YẾU NHẤT, nên mọi class
  // khác sẽ nhận ít hơn hitFrac. Nhưng quái còn được bisect HP theo `P` (chính
  // là người mới) — nếu chỉ neo ATK mà không nới, quái vẫn quá dai: người mới
  // cần 11 đòn để giết trong khi chỉ sống 6. Đo được: sau khi sửa điểm neo,
  // forest vẫn 0%. Nên nới thêm cho trạng thái newbie.

  const baseAtk = (avgMaxHp * hitFrac) / (1 - mitigation(nakedDef));
  const atkRef = Math.max(1, baseAtk);

  const midLevel = Math.max(3, Math.round((lv + lv + 4) / 2));
  const lowLvBoost = lv <= 2 ? 2.2 : lv <= 5 ? 1.25 : 1;
  const longZoneBoost = lv === 30 ? 1.9 : 1;
  const xpBudget = xpToNext(midLevel) / KILLS_PER_LEVEL * lowLvBoost * longZoneBoost;

  const weightOf = {};
  for (const r of db.prepare('SELECT id, weight FROM monsters WHERE zone_id=?').all(zid)) weightOf[r.id] = r.weight;

  TIER_ORDER.safe = TIER_ORDER.even = TIER_ORDER.danger = 0;
  const mobs = LAYOUT[zid].map(([mid, tier]) => {
    const cfg = TIER[tier];
    const vi = TIER_ORDER[tier]++ % cfg.targets.length;
    const target = Math.min(0.96, Math.max(0.05, cfg.targets[vi] + tierDelta));
    const bulky = (vi === 1);
    // DEF quái: đủ để tạo khác biệt giữa các con, nhưng KHÔNG được chặn quá
    // nhiều sát thương của class yếu nhất — vì sát thương mới là thứ quyết
    // định ai thắng khi mọi class đều chạm trần.
    //
    // Đo được: def quái 90 ở volcano làm Cung Thủ (atk thấp hơn) chỉ còn 27%
    // trong khi Chiến Binh 92% — dù trước đó tỉ lệ sát thương chỉ 1.16.
    // Chặn trên: def quái ≤ 30% ATK của class YẾU NHẤT → không class nào mất
    // quá 23% sát thương vì DEF quái.
    const minAtk = Math.min(...P.map(p => p.atk));
    const defRaw = pAtk * cfg.defFrac * cfg.defScale * (bulky ? 1.15 : 0.85);
    const def = Math.max(0, Math.round(Math.min(defRaw, minAtk * 0.30)));
    const atk = Math.max(1, Math.round(atkRef * (bulky ? 0.94 : 1.04)));

    // HP: bisect để TỪNG class đều gần mục tiêu. Hàm mục tiêu là trung vị.
    let lo = 1, hi = 60000, hp = 50, per = null, best = null;
    for (let it = 0; it < 16; it++) {
      hp = Math.max(1, Math.round((lo + hi) / 2));
      const probe = { hp, atk, def, max_hp: 0 };
      per = P.map(p => winRate(p, probe, SIMS, 4242 + lv));
      const med = median(per);
      if (med > target) lo = hp; else hi = hp;
    }
    // trả về mốc cuối cùng quanh target
    const probe = { hp, atk, def, max_hp: 0 };
    per = P.map(p => winRate(p, probe, SIMS, 4242 + lv));

    const xp = Math.max(1, Math.round(xpBudget * cfg.xpMult));
    return {
      id: mid, zone: zid, tier, lv, hp, atk, def, weight: weightOf[mid] || cfg.weight, xp,
      gold_min: Math.max(1, Math.round(xp * GOLD_PER_XP * 0.6)),
      gold_max: Math.round(xp * GOLD_PER_XP * 1.4), per,
    };
  });
  return { zid, lv, mobs, hitFrac, tierDelta };
}

function zonePer(z) {
  const wt = z.mobs.reduce((s, m) => s + m.weight, 0);
  return CLASSES.map((c, i) => z.mobs.reduce((s, m) => s + m.weight / wt * m.per[i], 0) * 100);
}

const ZONE_TARGET = { astral_ruins: 68 };
// Quét mức sát thương/đòn để tìm điểm làm CHÊNH LỆCH CLASS nhỏ nhất, không
// chỉ để trung vị đẹp. Với một bảng quái chung, mỗi class có "độ bền" khác
// nhau; chọn đúng mức sát thương là cách duy nhất để cả 3 cùng gần mục tiêu.
const HIT_FRAC_GRID = [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12, 0.14, 0.16, 0.18];
// Chạy NỐT các migrate bị hoãn trước khi đo.
//
// database.js hoãn migrate của module đang nằm trong vòng require
// (deferMigrate → setTimeout 0). Khi bot chạy thì việc đó vô hại vì message
// đầu tiên đến sau. Nhưng tools/tune_balance.js là script ĐỒNG BỘ: toàn bộ
// phép đo chạy xong trước khi setTimeout kịp bắn. Hệ quả đo được: seedClassItems
// chưa gán weapon_type cho vũ khí Lv.5, melee lấy được vũ khí yếu hơn → đo ra
// atk 44 thay vì 49, tool bisect HP quái theo một người chơi yếu hơn thực tế
// và cave in ra 63% cho Chiến Binh trong khi đo lại (tiến trình sạch) là 90%.
try { require('../src/game/classes').migrate(); } catch (e) { console.error('[tune] classes.migrate lỗi:', e.message); }
// Đo lại từ đầu: bảng item đã seed xong ở đây, nên bỏ mọi chỉ số đã cache
// trong lúc migrate (xem resetGearCache() trong test/balance_sim.js).
require('../test/balance_sim').resetGearCache();

const out = {};

for (const zid of Object.keys(LAYOUT)) {
  const zt = ZONE_TARGET[zid] ?? 70;
  let best = null;
  for (const hf of HIT_FRAC_GRID) {
    // bisect tierDelta để trung vị zone về mục tiêu
    let dlo = -0.4, dhi = 0.4, z = null;
    for (let k = 0; k < 8; k++) {
      const d = (dlo + dhi) / 2;
      z = buildZone(zid, hf, d);
      if (median(zonePer(z)) < zt) dlo = d; else dhi = d;
    }
    // Đo lại trên CHÍNH bảng quái vừa dựng (z.mobs), không dùng `per` cũ.
    // Trước đây chỗ này dùng lại biến `per` từ vòng lặp bisect — nên mọi
    // dòng báo cáo "giáp có tác dụng" đều hiển thị số của zone trước đó.
    const zoneMobs = z.mobs;
    const wt2 = zoneMobs.reduce((s, m) => s + m.weight, 0);
    const per2 = CLASSES.map((c, i) => zoneMobs.reduce((s, m) =>
      s + m.weight / wt2 * m.per[i], 0) * 100);
    const sp = Math.max(...per2) - Math.min(...per2);
    // Ưu tiên TUYỆT ĐỐI việc không class nào bị đẩy ra rìa (0-1% hoặc 100%).
    // Một zone mà Chiến Binh 100% / Pháp Sư 1% có trung vị "đẹp" nhưng không
    // chơi được — đó chính là kiểu lỗi bộ test cũ không bắt được.
    const extreme = per2.filter(v => v < 15 || v > 85).length * 200 +
                    per2.filter(v => v < 5 || v > 95).length * 400;
    const score = extreme + sp * 3 + Math.abs(median(per2) - zt) * 2;
    if (!best || score < best.score) best = { z, per: per2, sp, score, hf };
  }
  out[zid] = best.z;
  out[zid].per = best.per;
  out[zid].med = median(best.per);
  out[zid].hitFrac = best.hf;
}

// ---- bao cao ----
const lines = [];
lines.push('\nzone'.padEnd(14) + 'Lv'.padStart(4) + '  hit  |  melee  magic ranged |  med |  chenh');
let sum = 0, n = 0, ok = 0, maxSpread = 0;
for (const [zid, z] of Object.entries(out)) {
  const per = z.per, zm = z.med;
  sum += zm; n++;
  const inRange = zm >= 65 && zm <= 75;
  if (inRange) ok++;
  const sp = Math.max(...per) - Math.min(...per);
  maxSpread = Math.max(maxSpread, sp);
  lines.push(zid.padEnd(14) + String(z.lv).padStart(4) + String(z.hitFrac.toFixed(3)).padStart(7) + '  |' +
    per.map(v => v.toFixed(0).padStart(6)).join(' ') + ' |' + zm.toFixed(0).padStart(4) +
    ' |' + sp.toFixed(0).padStart(5) + (inRange ? '' : '  <-- NGOAI'));
}
lines.push('TB ' + (sum / n).toFixed(1) + '%  |  ' + ok + '/' + n + ' zone trong 65-75%  |  chenh class lon nhat ' + maxSpread.toFixed(0) + ' diem');

// KIEM TRA NGUOI MOI: chi co vu khi khoi dau, khong giap.
// Day la trang thai that cua nguoi vua vao game, va la thu ma nguoi dung bao
// "hunt moi zone dau tien ma ngom lien tuc". Phai do o day, khong chi do
// "full do" — full do o Lv.1 la trang thai khong ai co.
lines.push('\n=== nguoi moi (chi vu khi khoi dau, khong giap) o forest ===');
{
  const player = require('../src/game/player');
  const classes = require('../src/game/classes');
  const STARTER = { melee: 'wood_sword', magic: 'apprentice_wand', ranged: 'short_bow' };
  const fmobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND (elite_tier IS NULL OR elite_tier=0)').all('forest');
  const fwt = fmobs.reduce((s, m) => s + (m.weight || 10), 0);
  const rates = [];
  for (const cls of CLASSES) {
    db.prepare('DELETE FROM equipped WHERE user_id=?').run('__newbie_tune');
    db.prepare('DELETE FROM players WHERE user_id=?').run('__newbie_tune');
    player.createPlayer('__newbie_tune', 'n');
    classes.unlockClass('__newbie_tune', cls);
    classes.setPrimaryClass('__newbie_tune', cls);
    db.prepare('INSERT OR REPLACE INTO equipped (user_id, slot, item_id) VALUES (?,?,?)')
      .run('__newbie_tune', 'weapon', STARTER[cls]);
    const p = player.getPlayer('__newbie_tune');
    const st = player.getEffectiveStats(p);
    const f = { ...p, hp: p.max_hp, atk: st.atk, def: st.def };
    const r = fmobs.reduce((s, m) => s + (m.weight || 10) / fwt * winRate(f, m, 300, 7), 0) * 100;
    rates.push(r);
    lines.push(`  ${cls.padEnd(7)} atk ${st.atk} def ${st.def} hp ${p.max_hp} → ${r.toFixed(0)}%`);
    db.prepare('DELETE FROM equipped WHERE user_id=?').run('__newbie_tune');
    db.prepare('DELETE FROM players WHERE user_id=?').run('__newbie_tune');
  }
  const lo = Math.min(...rates);
  lines.push(`  → thap nhat ${lo.toFixed(0)}%` + (lo < 45 ? '  <-- NGUOI MOI SE CHET LIEN TUC' : ''));
}

// Kiem tra giap CO TAC DUNG: so sanh full do vs khong do o moi zone
lines.push('\n=== giap co tac dung khong (sat thuong nhan/don, Lv mo zone) ===');
lines.push('zone         khong do  full do   giam');
for (const [zid, z] of Object.entries(out)) {
  const lv = z.lv;
  const naked = playerAt(lv, 'melee', 0), full = playerAt(lv, 'melee', 1);
  const wt = z.mobs.reduce((s, m) => s + m.weight, 0);
  const dmg = (p) => z.mobs.reduce((s, m) => s + m.weight / wt *
    Math.min(Infinity, m.atk * (1 - mitigation(p.def))), 0);
  const d0 = dmg(naked), d1 = dmg(full);
  lines.push(zid.padEnd(13) + d0.toFixed(1).padStart(8) + d1.toFixed(1).padStart(9) +
    (d0 > 0 ? ((1 - d1 / d0) * 100).toFixed(0) + '%' : '—').padStart(7) +
    (d0 > 0 && (1 - d1 / d0) < 0.15 ? '  <-- GIAP VO DUNG' : ''));
}

if (process.argv.includes('--detail')) {
  for (const [zid, z] of Object.entries(out)) {
    lines.push('\n### ' + zid + ' (Lv.' + z.lv + ')');
    for (const m of z.mobs) {
      lines.push('  ' + m.id.padEnd(18) + m.tier.padEnd(7) + 'hp' + String(m.hp).padStart(5) +
        ' atk' + String(m.atk).padStart(4) + ' def' + String(m.def).padStart(4) +
        ' xp' + String(m.xp).padStart(5) + ' gold' + String(m.gold_min).padStart(4) + '-' + String(m.gold_max).padStart(5) +
        ' w' + String(m.weight).padStart(3) + ' | ' + m.per.map(v => (v * 100).toFixed(0).padStart(3) + '%').join('/'));
    }
  }
}
console.log(lines.join('\n'));

if (process.argv.includes('--json')) {
  require('fs').writeFileSync(path.join(__dirname, 'balance_out.json'), JSON.stringify({ zones: out }, null, 2));
  console.log('\n→ tools/balance_out.json');
}

// ---------------------------------------------------------------------------
// --write : ghi thang ket qua vao src/game/balance_seed.js
//
// Truoc day phai chep tay tu output sang file seed. Do chinh la ly do "so do
// tren cong cu" va "so trong game" lech nhau: chi can mot lan chep sai la
// bang quai trong game khac bang quai da do.
// ---------------------------------------------------------------------------
if (process.argv.includes('--write')) {
  const fs = require('fs');
  const seedPath = path.join(__dirname, '..', 'src', 'game', 'balance_seed.js');
  // GHI THEO ID, không theo thứ tự.
  //
  // Bản đầu tiên của đoạn này duyệt LAYOUT rồi thay cả khối MONSTERS. Nhưng
  // MONSTERS xếp theo ZONE (forest, cave, swamp, desert, mountain,
  // dragon_lair, volcano, frozen_abyss, astral_ruins) còn LAYOUT xếp khác, nên
  // chỉ số bị gán lệch hàng: slime nhận atk của quái khác (2 thay vì 9) và HP
  // 406 thay vì 193. Kết quả: forest thắng 100%.
  //
  // Nay đọc id trong từng dòng và thay tại chỗ — thứ tự nào cũng đúng.
  const byId = {};
  for (const zid of Object.keys(LAYOUT)) for (const m of out[zid].mobs) byId[m.id] = m;

  const seed = fs.readFileSync(seedPath, 'utf8');
  const start = seed.indexOf('const MONSTERS = [');
  const end = seed.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error('không tìm thấy MONSTERS trong balance_seed.js');
  const head = seed.slice(0, start);
  const body = seed.slice(start, end);
  let written = 0;
  // Khớp CẢ DÒNG (kể cả thụt lề) rồi dựng lại đúng thụt lề đó. Bản trước chỉ
  // khớp từ `['` nên phần lề cũ được giữ nguyên và cộng thêm 2 space mỗi lần
  // chạy — sau vài lần sinh bảng, file seed thụt lề rất sâu và diff rối.
  const body2 = body.replace(/^(\s*)\['([a-z_0-9]+)',\s*[^\]]*\],/gm, (line, indent, id) => {
    const m = byId[id];
    if (!m) return line;
    written++;
    return `${indent}['${id}', ${m.hp}, ${m.atk}, ${m.def}, ${m.xp}, ${m.gold_min}, ${m.gold_max}, ${m.weight}],`;
  });
  fs.writeFileSync(seedPath, head + body2 + seed.slice(end));
  if (written !== Object.keys(byId).length) {
    throw new Error(`ghi được ${written}/${Object.keys(byId).length} quái — id trong seed không khớp LAYOUT`);
  }
  console.log(`\n→ đã ghi ${written} quái vào src/game/balance_seed.js (theo id)`);
}

module.exports = { out, LAYOUT, TIER };
