const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, gear;
before(() => { h.quiet(); db = require('../src/db/database'); gear = require('../src/game/exclusive_gear'); h.loadCommands(); h.loud(); });
test('33 mid-to-late game crafted items have recipes only and valid ingredients', () => {
  const pieces = require('../src/game/adventurer_gear').PIECES;
  assert.equal(pieces.length * gear.CRAFT_LINES.length, 33);
  for (const line of gear.CRAFT_LINES) for (const [suffix] of pieces) {
    const id = `${line.id}_${suffix}`;
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    assert.equal(item.min_level, line.lv);
    assert.equal(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(id), undefined);
    assert.equal(db.prepare('SELECT 1 FROM monster_drops WHERE item_id=?').get(id), undefined);
    const r = db.prepare('SELECT * FROM recipes WHERE output_id=?').get(id);
    assert.equal(r.min_job_level, line.job);
    for (const i of JSON.parse(r.inputs)) {
      assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(i.item_id));
      assert.ok(i.qty > 0);
    }
  }
});
test('trophies drop only from documented hunt targets with correct chance and slots', () => {
  const ladder = require('../src/game/gear_ladder');
  for (const t of gear.TROPHIES) {
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(t.id);
    assert.equal(item.accessory_type, t.slot);
    assert.equal(item.atk, ladder.accValue(t.lv));
    assert.equal(item.def, item.atk);
    assert.equal(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(t.id), undefined);
    assert.equal(db.prepare('SELECT 1 FROM recipes WHERE output_id=?').get(t.id), undefined);
    const drops = db.prepare('SELECT * FROM monster_drops WHERE item_id=?').all(t.id);
    assert.equal(drops.length, 1);
    assert.equal(drops[0].monster_id, t.mob);
    assert.equal(drops[0].chance, t.chance);
    const { rollLoot } = require('../src/game/combat');
    const old = Math.random;
    try {
      Math.random = () => t.chance - 0.001;
      assert.ok(rollLoot({ drops, gold: [0, 0] }).items.some(i => i.item_id === t.id));
      Math.random = () => t.chance;
      assert.equal(rollLoot({ drops, gold: [0, 0] }).items.length, 0);
    } finally { Math.random = old; }
  }
});
test('exclusive seed and generic stat migration are restart-safe', () => {
  const snapshot = () => db.prepare("SELECT id,atk,def FROM items WHERE id LIKE 'trophy_%' OR id LIKE 'runeforged_%' OR id LIKE 'rimeforged_%' OR id LIKE 'starforged_%' ORDER BY id").all();
  const before = snapshot();
  assert.equal(before.length, 39);
  gear.migrate();
  require('../src/game/gear_ladder').migrate();
  assert.deepEqual(snapshot(), before);
});
test('handbook exposes real recipe and hunt instructions for exclusive lines', () => {
  const handbook = require('../src/game/handbook');
  assert.ok(handbook.lookup(db, 'runeforged_sword').sources.some(s => s.includes('craft recipe_runeforged_sword')));
  for (const t of gear.TROPHIES) {
    const entry = handbook.lookup(db, t.id);
    assert.ok(entry.sources.some(s => s.includes(`hunt ${t.mob}`)));
    assert.ok(!entry.sources.some(s => s.includes('craft ')));
  }
});
