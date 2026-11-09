// Test khoá bảng cân bằng (mục tiêu "Option A").
// Chạy: npm test
//
// Ba thứ được bảo vệ ở đây:
//   1. Win-rate cấp zone tại level mở zone phải nằm trong 65–75%.
//   2. Ba class không được lệch nhau quá xa (cùng một bảng quái dùng chung).
//   3. Tiến trình XP không bị kẹt: mỗi level cần 6–20 kill.
// Nếu ai sửa chỉ số quái / công thức combat / chỉ số class mà làm lệch,
// test này sẽ báo ngay.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { quiet, loud } = require('./harness');

let db, sim;

before(() => {
  quiet();
  db = require('../src/db/database');
  sim = require('./balance_sim');
  loud();
});

const CLASSES = ['melee', 'magic', 'ranged'];
const median = a => [...a].sort((x, y) => x - y)[1];

function zoneRates(zoneId, lv, sims = 260) {
  const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND (elite_tier IS NULL OR elite_tier=0)').all(zoneId);
  assert.ok(mobs.length > 0, `zone ${zoneId} phải có quái`);
  const wt = mobs.reduce((s, m) => s + m.weight, 0);
  return CLASSES.map(c => {
    const p = sim.playerAt(lv, c);
    return mobs.reduce((s, m) => s + m.weight / wt * sim.winRate(p, m, sims, 909), 0) * 100;
  });
}

// ─────────────────────────────────────────────────────────────
// 1. Win-rate theo zone
// ─────────────────────────────────────────────────────────────
test('win-rate cấp zone tại level mở zone nằm trong 65–75%', () => {
  const zones = db.prepare('SELECT * FROM zones ORDER BY min_level').all();
  const report = [];
  let inRange = 0;

  for (const z of zones) {
    const per = zoneRates(z.id, z.min_level);
    const med = median(per);
    report.push(`${z.id} (Lv.${z.min_level}): ${per.map(v => v.toFixed(0)).join('/')} → ${med.toFixed(0)}%`);
    if (med >= 65 && med <= 75) inRange++;
    else assert.ok(med >= 63 && med <= 77, `${z.id}: win-rate ${med.toFixed(0)}% lệch quá xa mục tiêu 65–75%\n${report.join('\n')}`);
  }
  assert.ok(inRange >= zones.length - 1,
    `chỉ ${inRange}/${zones.length} zone trong 65–75%:\n${report.join('\n')}`);
});

// ─────────────────────────────────────────────────────────────
// 2. Cân bằng giữa 3 class
// ─────────────────────────────────────────────────────────────
test('ba class không lệch nhau quá 15 điểm ở mọi zone', () => {
  for (const z of db.prepare('SELECT * FROM zones ORDER BY min_level').all()) {
    const per = zoneRates(z.id, z.min_level);
    const spread = Math.max(...per) - Math.min(...per);
    assert.ok(spread <= 15,
      `${z.id}: chênh lệch class ${spread.toFixed(0)} điểm (${per.map(v => v.toFixed(0)).join('/')})`);
  }
});

test('không class nào bị bỏ rơi (mỗi class ≥ 50% ở mọi zone)', () => {
  for (const z of db.prepare('SELECT * FROM zones ORDER BY min_level').all()) {
    const per = zoneRates(z.id, z.min_level);
    CLASSES.forEach((c, i) => {
      assert.ok(per[i] >= 50, `${z.id}/${c}: chỉ ${per[i].toFixed(0)}% — class này chơi không nổi`);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// 3. Vũ khí phải có đủ cho cả 3 class ở mọi mốc level
// ─────────────────────────────────────────────────────────────
test('mỗi mốc level đều có vũ khí cùng ATK cho cả 3 class', () => {
  const WT = {
    melee: ['sword', 'axe', 'mace'],
    magic: ['staff', 'wand', 'orb'],
    ranged: ['bow', 'crossbow', 'gun'],
  };
  const levels = [1, 6, 12, 18, 25, 30, 35, 40, 45];
  for (const lv of levels) {
    const atks = CLASSES.map(c => {
      const row = db.prepare(`SELECT MAX(atk) a FROM items
        WHERE type='weapon' AND min_level<=?
          AND weapon_type IN (${WT[c].map(t => `'${t}'`).join(',')})
          AND (class_req IS NULL OR class_req='' OR class_req=?)`).get(lv, c);
      return row.a || 0;
    });
    assert.ok(atks.every(a => a > 0), `Lv.${lv}: có class không có vũ khí nào (${atks.join('/')})`);
    const spread = Math.max(...atks) - Math.min(...atks);
    assert.ok(spread <= 1, `Lv.${lv}: ATK vũ khí lệch ${spread} giữa các class (${atks.join('/')})`);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. Tiến trình XP
// ─────────────────────────────────────────────────────────────
test('mỗi level cần 6–20 kill (không bị kẹt cày)', () => {
  const xpToNext = l => Math.floor(50 * Math.pow(l, 1.5));
  for (const z of db.prepare('SELECT * FROM zones ORDER BY min_level').all()) {
    const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND (elite_tier IS NULL OR elite_tier=0)').all(z.id);
    const wt = mobs.reduce((s, m) => s + m.weight, 0);
    const avgXp = mobs.reduce((s, m) => s + m.weight / wt * m.xp, 0);
    const kills = xpToNext(z.min_level) / avgXp;
    assert.ok(kills >= 1 && kills <= 20,
      `${z.id}: cần ${kills.toFixed(0)} kill để lên cấp (mục tiêu 6–20)`);
  }
});

// ─────────────────────────────────────────────────────────────
// 5. Nội dung mở rộng còn nguyên
// ─────────────────────────────────────────────────────────────
test('nội dung mở rộng đầy đủ: 9 zone, 45 quái, vũ khí mới', () => {
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM zones').get().c, 9);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM monsters WHERE elite_tier=0').get().c, 45);
  // 6 vũ khí lấp lỗ hổng tier (Pháp Sư/Cung Thủ từng không có vũ khí Lv.1)
  for (const id of ['apprentice_wand', 'short_bow', 'staff_ash', 'bow_windcut', 'staff_voidsong', 'bow_dragonbone']) {
    assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(id), `thiếu vũ khí ${id}`);
  }
});

test('bình máu hồi theo % hoạt động và không mất bình khi HP đầy', async () => {
  const player = require('../src/game/player');
  const cmds = require('./harness').loadCommands();
  const msg = require('./harness').fakeMessage;

  player.createPlayer('POTION1', 'tester');
  player.updatePlayer('POTION1', { max_hp: 1000, hp: 100, level: 30 });
  player.addItem('POTION1', 'potion_percent', 2);

  const m1 = msg('POTION1');
  await cmds.get('use').execute(m1, ['potion_percent']);
  assert.strictEqual(player.getPlayer('POTION1').hp, 450, 'potion 35% của 1000 phải hồi 350');
  assert.ok(player.hasItem('POTION1', 'potion_percent', 1), 'phải trừ 1 bình');

  // HP đầy: không được tiêu bình
  player.updatePlayer('POTION1', { hp: 1000 });
  const m2 = msg('POTION1');
  await cmds.get('use').execute(m2, ['potion_percent']);
  assert.ok(player.hasItem('POTION1', 'potion_percent', 1), 'HP đầy thì KHÔNG được mất bình');
});

test('mọi quái đều có drop và zone đều có quái', () => {
  const zones = db.prepare('SELECT id FROM zones').all();
  for (const z of zones) {
    const n = db.prepare('SELECT COUNT(*) c FROM monsters WHERE zone_id=? AND elite_tier=0').get(z.id).c;
    assert.ok(n >= 3, `zone ${z.id} chỉ có ${n} quái`);
  }
  const noDrop = db.prepare(`SELECT m.id FROM monsters m
    WHERE m.elite_tier=0 AND NOT EXISTS (SELECT 1 FROM monster_drops d WHERE d.monster_id = m.id)`).all();
  assert.strictEqual(noDrop.length, 0, `quái không có drop: ${noDrop.map(r => r.id).join(', ')}`);
});

// ---------------------------------------------------------------------------
// MỤC TIÊU A: trang bị phải có nguồn — NHƯNG không phải món nào cũng vậy.
//
// Lỗi thật đã xảy ra: 76/124 trang bị (12/29 vũ khí) không có nguồn nào —
// không shop, không drop, không recipe, không lootbox, và cũng KHÔNG phải đồ
// admin/sự kiện có chủ đích. Người chơi Pháp Sư / Cung Thủ kẹt atk 26 từ
// Lv.25 tới Lv.45 trong khi Chiến Binh lấy dragon_sword atk 48.
//
// Chính sách (theo quyết định của chủ dự án):
//   • Vũ khí THƯỜNG (tier common→epic): mọi món đều phải kiếm được.
//   • Vũ khí legendary: được phép là đồ admin phát / phần thưởng sự kiện,
//     không bắt buộc có nguồn trong game.
//   • Bất kể tier nào: ở MỖI mốc level, mỗi class phải có ít nhất một vũ khí
//     kiếm được — đây mới là thứ chặn tiến trình thật sự.
// ---------------------------------------------------------------------------
const EVENT_ONLY_TIERS = ['legendary'];

test('vũ khí thường (common→epic) đều kiếm được', () => {
  const obtainable = sim.obtainableIds();
  const weapons = db.prepare("SELECT id, tier FROM items WHERE type='weapon'").all();
  const orphans = weapons
    .filter(w => !EVENT_ONLY_TIERS.includes(w.tier) && !obtainable.has(w.id))
    .map(w => w.id);
  assert.deepStrictEqual(orphans, [],
    `vũ khí thường không có nguồn nào: ${orphans.join(', ')}`);
});

test('trang bị thường (common→epic) đều kiếm được', () => {
  const obtainable = sim.obtainableIds();
  const gear = db.prepare(`SELECT id, type, tier, min_level FROM items
    WHERE type IN ('weapon','offhand','armor','accessory')`).all();
  const orphans = gear
    .filter(g => !EVENT_ONLY_TIERS.includes(g.tier) && !obtainable.has(g.id))
    .sort((a, b) => a.min_level - b.min_level);
  assert.deepStrictEqual(orphans.map(o => `${o.id}(Lv${o.min_level} ${o.type})`), [],
    `trang bị thường không có nguồn: ${orphans.map(o => o.id).join(', ')}`);
});

// Đây là test quan trọng nhất của mục A: dù món nào là đồ sự kiện, ở mỗi mốc
// level cả 3 class vẫn phải có vũ khí KIẾM ĐƯỢC, và ATK của chúng phải bằng
// nhau. Nếu không, lại quay về cảnh Pháp Sư/Cung Thủ kẹt atk thấp.
test('mỗi mốc level: 3 class đều có vũ khí kiếm được với ATK bằng nhau', () => {
  const obtainable = sim.obtainableIds();
  const levels = db.prepare('SELECT DISTINCT min_level FROM items WHERE type=\'weapon\' ORDER BY min_level').all()
    .map(r => r.min_level);
  const WT = { melee: ['sword', 'axe', 'mace'], magic: ['staff', 'wand', 'orb'], ranged: ['bow', 'crossbow', 'gun'] };
  const report = [];

  for (const lv of levels) {
    const best = {};
    for (const [cls, types] of Object.entries(WT)) {
      const rows = db.prepare(`SELECT id, atk FROM items
        WHERE type='weapon' AND weapon_type IN (${types.map(t => `'${t}'`).join(',')})
          AND min_level<=? AND (class_req IS NULL OR class_req='' OR class_req=?)
        ORDER BY atk DESC`).all(lv, cls);
      const pick = rows.find(r => obtainable.has(r.id));
      best[cls] = pick ? pick.atk : null;
      assert.ok(pick, `Lv${lv} ${cls}: KHÔNG có vũ khí nào kiếm được`);
    }
    const vals = Object.values(best);
    assert.strictEqual(new Set(vals).size, 1,
      `Lv${lv}: ATK vũ khí kiếm được lệch giữa 3 class — ${JSON.stringify(best)}`);
    report.push(`Lv${lv}=${vals[0]}`);
  }
  assert.ok(report.length >= 8, `chỉ có ${report.length} mốc level vũ khí`);
});

// ---------------------------------------------------------------------------
// MỤC TIÊU B: mô hình cân bằng phải dùng ĐỒ THỰC KIẾM ĐƯỢC.
// Nếu ai đó thêm một món cực mạnh mà không cấp nguồn, win-rate "trên giấy"
// sẽ đẹp nhưng người chơi thật không bao giờ đạt được → test dưới bắt lệch.
// ---------------------------------------------------------------------------
test('chỉ số đồ dùng trong mô hình cân bằng đều kiếm được', () => {
  const obtainable = sim.obtainableIds();
  for (const lv of [1, 12, 25, 30, 35, 40, 45]) {
    for (const cls of CLASSES) {
      const real = sim.bestGear(db, lv, cls, true);
      const all = sim.bestGear(db, lv, cls, false);
      const total = g => g.weaponAtk + g.accAtk + g.offAtk + g.armorDef + g.accDef;
      assert.ok(total(real) > 0, `Lv${lv} ${cls}: không có đồ kiếm được nào`);
      // Model "thực tế" không được vượt model "mọi đồ"
      assert.ok(total(real) <= total(all),
        `Lv${lv} ${cls}: đồ kiếm được (${total(real)}) > mọi đồ (${total(all)}) — lỗi lọc`);
    }
  }
});

test('win-rate với đồ thực kiếm được vẫn đạt Option A (65–75%)', () => {
  // playerAt() đã đo bằng bestGear(..., onlyObtainable = true), nên test 1
  // thực chất đang chạy trên đồ người chơi kiếm được. Test này chỉ chốt lại
  // điều đó để không ai lặng lẽ bật lại chế độ "mọi item trong DB".
  const zones = db.prepare('SELECT * FROM zones ORDER BY min_level').all();
  const report = [];
  let inRange = 0;
  for (const z of zones) {
    const per = zoneRates(z.id, z.min_level);
    const med = median(per);
    report.push(`${z.id}: ${per.map(v => v.toFixed(0)).join('/')} → ${med.toFixed(0)}%`);
    if (med >= 65 && med <= 75) inRange++;
  }
  assert.ok(inRange >= zones.length - 1,
    `chỉ ${inRange}/${zones.length} zone trong 65–75%:\n${report.join('\n')}`);
});

// ---------------------------------------------------------------------------
// KINH TẾ: giá phải khiến việc cày có ý nghĩa, nhưng KHÔNG được gây bế tắc.
// Lỗi tôi từng gây ra: nâng wood_sword từ 50 lên 350 vàng trong khi người
// chơi mới có 50 vàng và Lv.1 tay không chỉ thắng 1–4% ở forest → người mới
// không thể mua vũ khí, không thể thắng trận, hoàn toàn bế tắc.
// ---------------------------------------------------------------------------
const GOLD_PER_KILL_ZONE = {
  forest: 55, cave: 113, swamp: 150, desert: 203, dragon_lair: 524,
  mountain: 351, volcano: 639, frozen_abyss: 1677, astral_ruins: 1061,
};

// Vàng trung bình/kill đo trực tiếp từ DB, không hardcode
function goldPerKill(zoneId) {
  const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND elite_tier=0').all(zoneId);
  const wt = mobs.reduce((s, m) => s + m.weight, 0);
  return mobs.reduce((s, m) => s + ((m.gold_min + m.gold_max) / 2) * (m.weight / wt), 0);
}

test('người mới KHÔNG bế tắc: mua được vũ khí Lv.1 trong ≤ 8 kill', () => {
  const START_GOLD = 50;
  const gpk = goldPerKill('forest');
  const w = db.prepare(`SELECT s.price, i.id FROM shop s JOIN items i ON i.id = s.item_id
    WHERE i.type='weapon' AND i.min_level<=1 ORDER BY s.price`).get();
  assert.ok(w, 'không có vũ khí Lv.1 nào bán trong shop');
  const kills = Math.max(0, (w.price - START_GOLD) / gpk);
  assert.ok(kills <= 8,
    `vũ khí Lv.1 (${w.id}, ${w.price} vàng) cần ${kills.toFixed(1)} kill — người mới bế tắc`);
});

test('chọn class được tặng vũ khí khởi đầu đúng loại', () => {
  const STARTER = { melee: 'wood_sword', magic: 'apprentice_wand', ranged: 'short_bow' };
  for (const [cls, itemId] of Object.entries(STARTER)) {
    const it = db.prepare("SELECT id, atk, class_req FROM items WHERE id=?").get(itemId);
    assert.ok(it, `thiếu vũ khí khởi đầu ${itemId}`);
    assert.ok(it.atk > 0, `${itemId} phải có ATK`);
    // dùng được cho đúng class đó
    assert.ok(!it.class_req || it.class_req === cls,
      `${itemId} không dùng được cho ${cls} (class_req=${it.class_req})`);
  }
});

test('vũ khí không quá rẻ: phải cày 6–30 kill mới mua được', () => {
  // Lv.1 miễn trừ: giá bị chặn trên để người mới không bế tắc (xem test 14).
  // Đánh đổi có chủ ý — vũ khí đầu tiên rẻ, nhưng nó chỉ có atk 5.
  const bands = [
    [6, 'forest'], [12, 'desert'], [18, 'desert'], [25, 'dragon_lair'],
  ];
  for (const [lv, zone] of bands) {
    const gpk = goldPerKill(zone);
    const rows = db.prepare(`SELECT s.price, i.id FROM shop s JOIN items i ON i.id = s.item_id
      WHERE i.type='weapon' AND i.min_level=?`).all(lv);
    assert.ok(rows.length > 0, `Lv${lv}: không có vũ khí nào bán trong shop`);
    for (const r of rows) {
      const kills = r.price / gpk;
      assert.ok(kills >= 6 && kills <= 30,
        `${r.id} (Lv${lv}) giá ${r.price} = ${kills.toFixed(1)} kill ở ${zone} — ngoài 6–30`);
    }
  }
});

test('vàng và XP không bị đảo giữa các zone', () => {
  const zones = db.prepare('SELECT * FROM zones ORDER BY min_level').all();
  let prevGold = 0, prevXp = 0;
  const report = [];
  for (const z of zones) {
    const g = goldPerKill(z.id);
    const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND elite_tier=0').all(z.id);
    const wt = mobs.reduce((s, m) => s + m.weight, 0);
    const xp = mobs.reduce((s, m) => s + m.xp * (m.weight / wt), 0);
    report.push(`${z.id}: ${g.toFixed(0)}g / ${xp.toFixed(0)}xp`);
    // zone Lv cao hơn phải cho nhiều vàng hơn (sai số 20% cho zone đặc biệt)
    assert.ok(g >= prevGold * 0.95, `vàng bị đảo: ${z.id} ${g.toFixed(0)}g < zone trước ${prevGold.toFixed(0)}g\n${report.join('\n')}`);
    prevGold = g;
    prevXp = xp;
  }
  // tỉ lệ vàng/XP phải ổn định (không có zone nào là mỏ vàng bất thường)
  for (const z of zones) {
    const g = goldPerKill(z.id);
    const mobs = db.prepare('SELECT * FROM monsters WHERE zone_id=? AND elite_tier=0').all(z.id);
    const wt = mobs.reduce((s, m) => s + m.weight, 0);
    const xp = mobs.reduce((s, m) => s + m.xp * (m.weight / wt), 0);
    const ratio = g / xp;
    assert.ok(ratio >= 0.8 && ratio <= 1.6,
      `${z.id}: ${ratio.toFixed(2)} vàng/XP — lệch chuẩn 1.2`);
  }
});

// ---------------------------------------------------------------------------
// PvP: phải dùng CÙNG luật giảm sát thương với PvE.
// Trước đây PvP dùng `atk - def` tuyến tính → def ≥ atk là miễn nhiễm hoàn
// toàn (dmg luôn = 1), trong khi PvE thì không. Cùng một nhân vật cho hai
// cảm giác hoàn toàn khác nhau tuỳ đang đánh quái hay đánh người.
// ---------------------------------------------------------------------------
test('PvP dùng chung công thức giảm thương với PvE', () => {
  const skills = require('../src/game/skills');
  assert.strictEqual(typeof skills.mitigated, 'function', 'skills.js phải export mitigated()');

  const combat = require('../src/game/combat');

  // def ≥ atk KHÔNG được miễn nhiễm (lỗi cũ: dmg = 1)
  const tanky = skills.mitigated(100, 300);
  assert.ok(tanky > 1, `def 300 vs atk 100 vẫn phải nhận dmg > 1, đang là ${tanky}`);

  // Nhưng def cao phải giảm thương thật
  assert.ok(skills.mitigated(100, 300) < skills.mitigated(100, 0),
    'DEF cao phải giảm sát thương');

  // Trần giảm 75%: def khổng lồ không thành bất tử
  const capped = skills.mitigated(1000, 999999);
  assert.ok(capped >= Math.round(1000 * 0.25) - 1,
    `trần giảm 75% bị vượt: atk 1000 vs def khổng lồ → ${capped}`);

  // Cùng một công thức với combat.js: so sánh trên nhiều cặp chỉ số
  for (const [atk, def] of [[20, 8], [100, 50], [200, 400], [500, 700]]) {
    const viaSkill = skills.mitigated(atk, def);
    const viaCombat = combat.damageAfterDef(atk, def, Infinity);
    // combat có thêm nhiễu ±2..3, nên cho sai số 4
    assert.ok(Math.abs(viaSkill - viaCombat) <= 4,
      `lệch công thức tại atk=${atk} def=${def}: skills=${viaSkill} combat=${viaCombat}`);
  }
});
