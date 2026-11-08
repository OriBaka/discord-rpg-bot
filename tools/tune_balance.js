// Sinh bang chi so quai (Option A) theo DUONG CONG THIET KE.
// Chay: node tools/tune_balance.js [db] [--detail] [--json]
//
// Cach lam: khong de optimizer tu do chon tung chi so (se ra quai giong het
// nhau), ma dinh nghia 3 archetype theo "so luot de giet" va "so don chiu duoc",
// roi tinh nguoc ra hp/atk/def. Chi co MOT hang so `ease` duoc tinh chinh de
// win-rate trung binh cua moi zone roi vao 65-75%.
//
// Nho vay: quai manh dan theo zone (don dieu), trong 1 zone co con de/con kho,
// cac con cung tier van khac nhau nhung cung muc do nguy hiem.
const path = require('path');
const D = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const { playerAt, winRate, mitigation, CRIT_CHANCE, CRIT_MULT, MAX_HIT_PCT } = require('../test/balance_sim');

const db = new D(process.argv[2] || path.join(__dirname, '..', 'data', 'rpg.db'));
const CLASSES = ['melee', 'magic', 'ranged'];
const SIMS = Number(process.env.TUNE_SIMS || 400);

// archetype: rounds = so luot de giet; hits = so don chiu duoc truoc khi guc;
// defFrac = def quai theo % atk nguoi choi
// target = win-rate muc tieu cho tung con (bac nguy hiem), tinh theo trung vi
// 3 class. Nho co nhieu bac nen trong 1 zone van co con de / con kho.
const TIER = {
  safe:   { targets: [0.86, 0.82], hits: 9, defFrac: 0.06, weight: 30, xpMult: 0.85 },
  even:   { targets: [0.70, 0.62], hits: 5, defFrac: 0.16, weight: 20, xpMult: 1.00 },
  danger: { targets: [0.48, 0.38], hits: 3, defFrac: 0.28, weight: 10, xpMult: 1.30 },
};
const TIER_ORDER = { safe: 0, even: 0, danger: 0 };

// Bo cuc: [mob_id, tier]. Thu tu trong moi tier la "bien the" (chi so lech nhe)
const LAYOUT = {
  forest:      [['slime','safe'],['giant_rat','safe'],['forest_wisp','even'],['wolf','even'],['forest_bear','danger'],['moss_golem','danger']],
  cave:        [['bat','safe'],['cave_spider','safe'],['goblin','even'],['blind_stalker','even'],['goblin_chief','danger'],['cave_golem','danger']],
  swamp:       [['bog_toad','safe'],['leech_swarm','safe'],['swamp_lurker','even'],['mire_witch','even'],['bog_colossus','danger']],
  desert:      [['scorpion','safe'],['dust_raider','safe'],['mummy','even'],['sun_wraith','even'],['sand_worm','danger'],['cactus_horror','danger']],
  mountain:    [['snowman','safe'],['frost_wolf','safe'],['orc','even'],['yeti','even'],['ice_elemental','danger'],['troll','danger'],['stone_berserker','danger']],
  dragon_lair: [['drake_whelp','safe'],['young_dragon','even'],['lair_guardian','even'],['dragon','danger'],['void_dragon','danger']],
  volcano:     [['magma_hound','safe'],['ember_phoenix','safe'],['obsidian_golem','even'],['char_giant','even']],
  frozen_abyss:[['frost_revenant','safe'],['glacier_wyrm','even'],['abyss_leviathan','danger']],
  astral_ruins:[['void_harbinger','safe'],['astral_sentinel','even'],['star_devourer','even']],
};

const xpToNext = l => Math.floor(50 * Math.pow(l, 1.5));
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const CRIT_FACTOR = 1 + CRIT_CHANCE * (CRIT_MULT - 1);   // sat thuong ky vong khi co crit
const KILLS_PER_LEVEL = 12;
const GOLD_PER_XP = 1.2;

/** Sat thuong ky vong nguoi choi gay ra moi luot, voi def quai cho truoc */
function playerDmgPerRound(pAtk, mobDef) {
  return Math.max(1, pAtk * (1 - mitigation(mobDef))) * CRIT_FACTOR;
}

/**
 * Dung 1 zone.
 *  atk duoc tinh tu "so don chiu duoc" (hits) -> quyet dinh khoang cach class.
 *  hp duoc BISECT rieng tung con de trung vi 3 class dat muc tieu cua tier.
 */
function buildZone(zid, hitsMul = 1, atkBoost = 1, defScale = 1, tierDelta = 0) {
  const zone = db.prepare('SELECT * FROM zones WHERE id=?').get(zid);
  const lv = zone.min_level;
  const P = CLASSES.map(c => playerAt(lv, c));
  const pAtk = P.reduce((s, p) => s + p.atk, 0) / 3;
  const pDef = P.reduce((s, p) => s + p.def, 0) / 3;
  const pHp  = P.reduce((s, p) => s + p.max_hp, 0) / 3;
  // atk du de cham TRAN 30%/don cua CA 3 class. Khi do moi class deu mat
  // dung 30% HP moi don → so don chiu duoc giong nhau tuyet doi, khoang cach
  // HP/DEF giua cac class bien mat (da kiem chung: chenh = 0 diem).
  const capRef = Math.max(...P.map(p => (p.max_hp * MAX_HIT_PCT) / (1 - mitigation(p.def)))) * 1.10;
  // XP tinh theo muc level ma player se o lai lau nhat trong zone nay:
  // zone mo o Lv.5 thi player cay den ~Lv.9 moi sang zone sau -> giua khoang
  // lech 1 nua so voi level mo zone (khong de zone dau qua de).
  const midLevel = Math.max(3, Math.round((lv + lv + 4) / 2));
  // Zone cấp thấp bị "lợi" vì xpToNext bám level mở zone (Lv.1 chỉ cần 50 XP
  // mà người chơi cày tới Lv.4-5 mới sang zone sau) -> nâng nhẹ cho khỏi quá nhanh.
  const lowLvBoost = lv <= 2 ? 2.2 : lv <= 5 ? 1.25 : 1;
  // frozen_abyss (Lv.30) phai "gánh" 10 level (30→40) trước khi có zone kế,
  // trong khi các zone khác chỉ 5 level → tăng XP để không phải cày gấp đôi.
  const longZoneBoost = lv === 30 ? 1.9 : 1;
  const xpBudget = xpToNext(midLevel) / KILLS_PER_LEVEL * lowLvBoost * longZoneBoost;

  let variant = 0;
  TIER_ORDER.safe = TIER_ORDER.even = TIER_ORDER.danger = 0;
  const mobs = LAYOUT[zid].map(([mid, tier]) => {
    const cfg = TIER[tier];
    const vi = TIER_ORDER[tier]++ % cfg.targets.length;
    const target = Math.min(0.96, Math.max(0.05, cfg.targets[vi] + tierDelta));
    const bulky = (vi === 1);
    const def = Math.round(pAtk * cfg.defFrac * defScale * (bulky ? 1.15 : 0.85));
    // ATK quai: du de cham TRAN sat thuong cua ca 3 class. Khi moi class deu
    // mat dung 30% HP/don thi so don chiu duoc la nhu nhau (4), khoang cach
    // HP giua class bien mat -> 1 bang quai can bang duoc cho ca 3.
    const atk = Math.max(1, Math.round(capRef * hitsMul * atkBoost * (bulky ? 0.92 : 1.06)));

    // bisect hp: trung vi win-rate 3 class = muc tieu cua tier
    let lo = 1, hi = 40000, hp = 50, per = null;
    for (let it = 0; it < 12; it++) {
      hp = Math.max(1, Math.round((lo + hi) / 2));
      const probe = { hp, atk, def, max_hp: 0 };
      per = P.map(p => winRate(p, probe, SIMS, 4242 + lv));
      if (median(per) > target) lo = hp; else hi = hp;
    }
    const xp = Math.max(1, Math.round(xpBudget * cfg.xpMult));
    const mob = {
      id: mid, zone: zid, tier, lv, hp, atk, def, weight: cfg.weight, xp,
      gold_min: Math.max(1, Math.round(xp * GOLD_PER_XP * 0.6)),
      gold_max: Math.round(xp * GOLD_PER_XP * 1.4), per,
    };
    return mob;
  });
  return { zid, lv, mobs, hitsMul, atkBoost, defScale, tierDelta };
}

function zonePer(z) {
  const wt = z.mobs.reduce((s, m) => s + m.weight, 0);
  return CLASSES.map((c, i) => z.mobs.reduce((s, m) => s + m.weight / wt * m.per[i], 0) * 100);
}

// Voi moi zone: chon `hitsMul` (do manh don danh cua quai) lam KHOANG CACH
// giua 3 class nho nhat, mien la khong con ti le thang nao bi don ve 0/100.
const HITS_GRID = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.15];
const BOOST_GRID = [0.9, 1.0, 1.1, 1.2, 1.35, 1.5, 1.7];
const DEF_GRID = [0, 0.4, 0.8, 1.2];
// astral_ruins là zone cuối, người chơi tới đây thường đã có đồ tốt hơn
// mức tối thiểu → cho khó hơn một chút vẫn công bằng.
const ZONE_TARGET = { astral_ruins: 68 };
const out = {};
for (const zid of Object.keys(LAYOUT)) {
  let best = null;
  for (const hm of HITS_GRID) {
   for (const ds of DEF_GRID) {
    for (const boost of BOOST_GRID) {
      // bisect tierDelta de trung vi zone = muc tieu
      let dlo = -0.4, dhi = 0.4, z = null;
      for (let k = 0; k < 8; k++) {
        const d = (dlo + dhi) / 2;
        z = buildZone(zid, hm, boost, ds, d);
        if (median(zonePer(z)) < (ZONE_TARGET[zid] ?? 70)) dlo = d; else dhi = d;
      }
      const per = zonePer(z);
      const sp = Math.max(...per) - Math.min(...per);
      const extreme = per.filter(v => v < 4 || v > 96).length * 12;
      // uu tien: khong lech class, roi moi den dung muc tieu zone
      const zt = ZONE_TARGET[zid] ?? 70;
      const score = sp * 2 + extreme + Math.abs(median(per) - zt) * 2;
      if (!best || score < best.score) best = { z, per, sp, score };
    }
   }
  }
  out[zid] = best.z;
  out[zid].per = best.per;
  out[zid].med = median(best.per);
}

// ---- bao cao ----
const lines = [];
lines.push('\nzone'.padEnd(14) + 'Lv'.padStart(4) + '  hits boost  |  melee  magic ranged |  med |  zone');
let sum = 0, n = 0, ok = 0, maxSpread = 0;
for (const [zid, z] of Object.entries(out)) {
  const per = z.per, zm = z.med;
  sum += zm; n++;
  const inRange = zm >= 65 && zm <= 75;
  if (inRange) ok++;
  const sp = Math.max(...per) - Math.min(...per);
  maxSpread = Math.max(maxSpread, sp);
  lines.push(zid.padEnd(14) + String(z.lv).padStart(4) + String(z.hitsMul.toFixed(1)).padStart(6) + String(z.atkBoost.toFixed(2)).padStart(6) + '  |' +
    per.map(v => v.toFixed(0).padStart(6)).join(' ') + ' |' + zm.toFixed(0).padStart(4) + ' | ' +
    zm.toFixed(1) + '%' + (inRange ? '' : '  <-- NGOAI') + '  (chenh class ' + sp.toFixed(0) + ')');
}
lines.push('TB ' + (sum / n).toFixed(1) + '%  |  ' + ok + '/' + n + ' zone trong 65-75%  |  chenh class lon nhat ' + maxSpread.toFixed(0) + ' diem');

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

module.exports = { out, LAYOUT, TIER, EASE };
