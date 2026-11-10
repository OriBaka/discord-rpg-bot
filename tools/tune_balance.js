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

// He so cua TRAN: ATK quai = (maxHP trung binh * MAX_HIT_PCT * hitFrac) / (1-giam).
// hitFrac = 1.00 -> nguoi KHONG do vua cham tran; nguoi MAC GIAP nhan it hon
// tran (vi DEF cao hon) -> giap co tac dung. Gia tri duoc quet tung zone.
const TARGET_HIT_FRAC = 1.00;
const MAX_HIT_PCT_USED = MAX_HIT_PCT;   // đọc từ nguồn chung, không hardcode

const xpToNext = l => Math.floor(50 * Math.pow(l, 1.5));
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const CRIT_FACTOR = 1 + CRIT_CHANCE * (CRIT_MULT - 1);
const KILLS_PER_LEVEL = 12;
const GOLD_PER_XP = 1.2;
const SIMS = 300;

function playerDmgPerRound(pAtk, mobDef) {
  return Math.max(1, pAtk * (1 - mitigation(mobDef))) * CRIT_FACTOR;
}

function buildZone(zid, hitFrac = TARGET_HIT_FRAC, tierDelta = 0) {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get(zid);
  const lv = zone.min_level;
  const P = CLASSES.map(c => playerAt(lv, c, 1));       // full đồ
  const pAtk = P.reduce((s, p) => s + p.atk, 0) / 3;
  const pDef = P.reduce((s, p) => s + p.def, 0) / 3;

  // ATK quái = mức để đòn đánh (sau giảm thương theo DEF trung bình) rơi vào
  // `hitFrac` max HP. KHÔNG neo vào trần — neo vào trần là tự bịt đường tác
  // dụng của giáp.
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
  const N = lv === 1
    ? CLASSES.map(c => { const p = playerAt(1, c, 0); return { ...p, atk: p.atk + 5 }; })
    : CLASSES.map(c => playerAt(lv, c, 0));         // không đồ
  const avgMaxHp = N.reduce((s, p) => s + p.max_hp, 0) / 3;
  const nakedDef = N.reduce((s, p) => s + p.def, 0) / 3;
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
  const baseAtk = (avgMaxHp * MAX_HIT_PCT_USED * hitFrac) / (1 - mitigation(nakedDef));
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
const HIT_FRAC_GRID = [0.85, 1.00, 1.10, 1.18, 1.26, 1.36, 1.50, 1.70, 2.00, 2.50, 3.20, 4.00, 5.50];
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
  lines.push(zid.padEnd(14) + String(z.lv).padStart(4) + String(z.hitFrac.toFixed(2)).padStart(6) + '  |' +
    per.map(v => v.toFixed(0).padStart(6)).join(' ') + ' |' + zm.toFixed(0).padStart(4) +
    ' |' + sp.toFixed(0).padStart(5) + (inRange ? '' : '  <-- NGOAI'));
}
lines.push('TB ' + (sum / n).toFixed(1) + '%  |  ' + ok + '/' + n + ' zone trong 65-75%  |  chenh class lon nhat ' + maxSpread.toFixed(0) + ' diem');

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

module.exports = { out, LAYOUT, TIER };
