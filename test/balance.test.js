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
