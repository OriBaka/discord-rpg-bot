const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
const audit = require('../tools/build_audit');
let db;
before(() => { h.quiet(); db = require('../src/db/database'); h.loud(); });

test('audit fixtures respect level/class, inventory quantities and distinct high-level stances', () => {
  h.quiet();
  try {
    for (const cls of audit.CLASSES) for (const style of ['neutral', 'attack', 'guard']) {
      const f = audit.makeFixture(db, cls, 45, style, `LEGAL_${cls}_${style}`);
      assert.equal(f.stance, { neutral: 0, attack: 6, guard: -6 }[style]);
      for (const id of Object.values(f.eq)) {
        const item = require('../src/game/items').getItem(id);
        assert.ok(item.min_level <= 45);
        assert.ok(!item.class_req || item.class_req === cls);
        assert.ok(!/sin_|that_dai_toi/.test(id));
        const copies = Object.values(f.eq).filter(x => x === id).length;
        assert.ok(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(f.player.user_id, id).qty >= copies);
      }
    }
  } finally { h.loud(); }
});

test('pure audit matches persisted Tower snapshots and every turn for all classes', () => {
  const tower = require('../src/game/tower'), battle = require('../src/game/battle');
  const builds = require('../src/game/skill_builds'), skills = require('../src/game/skills');
  const fields = ['hp_a', 'hp_b', 'max_hp_a', 'max_hp_b', 'atk_a', 'atk_b', 'def_a', 'def_b', 'energy_a', 'energy_b', 'buffs_a', 'buffs_b', 'cooldowns_a', 'cooldowns_b', 'round', 'turn', 'is_elite', 'skills_a', 'class_a', 'status'];
  for (const cls of audit.CLASSES) {
    h.quiet();
    let f;
    try { f = audit.makeFixture(db, cls, 45, 'neutral', `PARITY_${cls}`); } finally { h.loud(); }
    const user = f.player.user_id;
    const ids = skills.getSkillsForClass(cls).filter(s => !s.book).slice(0, 4).map(s => s.id);
    assert.ok(!builds.set(user, cls, 45, ids).error);
    db.prepare('INSERT INTO tower_progress(user_id,highest) VALUES (?,14)').run(user);
    let actual = tower.start(user, 15, 'AUDIT').battle;
    battle.setMessageId(actual.id, 'MSG');
    let expected = audit.initial(f, tower.floorInfo(15), ids);
    let turns = 0;
    while (actual.status === 'active') {
      for (const key of fields) assert.equal(expected[key], actual[key], `${cls}/${turns}/${key}`);
      const before = JSON.stringify(expected);
      const action = audit.choose(expected, 'tactical');
      assert.equal(JSON.stringify(expected), before, 'counterfactual search is pure');
      assert.equal(audit.choose(expected, 'tactical'), action, 'deterministic selection');
      expected = audit.response(audit.advance(expected, 'a', action));
      const result = tower.act(user, actual.id, actual.round, action, 'MSG', 'AUDIT');
      assert.ok(!result.error, result.error);
      actual = result.battle;
      assert.ok(++turns < 120);
    }
    for (const key of fields) assert.equal(expected[key], actual[key], `${cls}/end/${key}`);
    assert.equal(expected.winner, actual.winner);
  }
});

test('audit maps database elite tiers into boss AI snapshots', () => {
  const f = { player: { primary_class: 'melee' }, stats: { atk: 100, def: 100, max_hp: 1000 } };
  const target = db.prepare("SELECT * FROM monsters WHERE id='boss_wyrm'").get();
  const b = audit.initial(f, target, ['slash']);
  assert.equal(b.is_elite, 2);
  assert.equal(require('../src/game/battle').pickMobAction({ ...b, round: 6 }), 'roar');
});

test('profession estimator enumerates rounded quantities and extra drops like runtime', () => {
  const measure = require('../tools/measure_jobs');
  const gz = require('../src/game/gather_zones');
  for (const job of ['mining', 'fishing', 'foraging']) {
    const zone = measure.bestZone(job, 18);
    const stats = { qty_bonus: 0.25, drop_bonus: 0.2, extra_chance: 0.1 };
    let expected = 0;
    for (const d of gz.getDrops(zone.id)) {
      const sell = db.prepare('SELECT sell FROM items WHERE id=?').get(d.item_id).sell;
      const mult = job === 'foraging' ? gz.levelBonusMult(18, zone.min_job_level) : 1.25;
      const quantities = Array.from({ length: d.qty_max - d.qty_min + 1 }, (_, i) => Math.max(1, Math.round((d.qty_min + i) * mult)) + 0.1);
      expected += Math.min(1, d.chance * 1.2) * quantities.reduce((a, b) => a + b, 0) / quantities.length * sell;
    }
    assert.ok(Math.abs(measure.goldPerAction(zone, 18, stats) - expected) < 1e-8);
  }
});
