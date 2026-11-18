const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
const identity = require('../src/game/gear_identity');
let db, player, slots, items, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); player = require('../src/game/player'); slots = require('../src/game/slots'); items = require('../src/game/items'); commands = h.loadCommands(); h.loud(); });
function user(cls = 'melee') { const id = `STANCE_${++n}`; player.createPlayer(id, id); player.updatePlayer(id, { level: 45, primary_class: cls }); return player.getPlayer(id); }
const fake = id => ({ id, type: 'accessory' });
test('signed stances cap, cancel and cannot stack both positive bonuses', () => {
  assert.deepEqual(identity.apply(100, 100, [fake('ring_berserker')]), { atk: 103, def: 94 });
  assert.deepEqual(identity.apply(100, 100, [fake('ring_warden')]), { atk: 97, def: 106 });
  assert.equal(identity.score(Array(20).fill(fake('ring_berserker'))), 6);
  assert.equal(identity.score(Array(20).fill(fake('ring_warden'))), -6);
  assert.deepEqual(identity.apply(100, 100, [fake('ring_berserker'), fake('ring_warden')]), { atk: 100, def: 100 });
  for (const ids of [['ring_berserker'], ['ring_warden'], ['ring_berserker', 'ring_warden']]) {
    const value = identity.apply(100, 100, ids.map(fake));
    assert.ok(!(value.atk > 100 && value.def > 100));
  }
});
test('only named gear receives stances, new-player equipment remains neutral', () => {
  assert.equal(identity.points({ id: 'runeforged_sword', type: 'weapon' }), 1);
  assert.equal(identity.points({ id: 'runeforged_fake', type: 'weapon' }), 0);
  assert.equal(identity.points({ id: 'ring_berserker', type: 'material' }), 0);
  for (const id of ['dawnwatch_sword', 'trailwarden_coat', 'wood_sword', 'ring_arcanist']) assert.equal(identity.points({ id, type: 'weapon' }), 0);
});
test('real gear calculations apply identity before class share for every class', () => {
  for (const cls of ['melee', 'magic', 'ranged']) {
    const p = user(cls);
    const a = items.getItem('ring_berserker');
    const b = items.getItem('ring_warden');
    const offense = player.getEffectiveStats(p, { ring1: a.id });
    const defense = player.getEffectiveStats(p, { ring1: b.id });
    assert.ok(offense.atk >= defense.atk);
    assert.ok(offense.def <= defense.def);
    const plain = player.getEffectiveStats(p, {});
    assert.equal(plain.atk, p.atk);
    assert.equal(plain.def, p.def);
  }
});
test('preview agrees with actual equip, including upgrades; does not mutate equipment or inventory', () => {
  const p = user('magic');
  player.addItem(p.user_id, 'ring_berserker', 2);
  player.addItem(p.user_id, 'ring_warden', 1);
  slots.setEquipped(p.user_id, 'ring1', 'ring_warden');
  require('../src/game/upgrade').setLevel(p.user_id, 'ring_berserker', 5);
  const before = slots.getEquipped(p.user_id);
  const inventory = player.getInventory(p.user_id);
  const preview = require('../src/game/gear_preview').preview(p, items.getItem('ring_berserker'), 'ring1');
  assert.deepEqual(slots.getEquipped(p.user_id), before);
  assert.deepEqual(player.getInventory(p.user_id), inventory);
  slots.setEquipped(p.user_id, 'ring1', 'ring_berserker');
  assert.deepEqual(player.getEffectiveStats(p), preview.after);
  assert.equal(preview.old.id, 'ring_warden');
});
test('preview supports empty slots, ring2, ownership, level/class warnings and rejects invalid slot', () => {
  const p = user();
  const { preview } = require('../src/game/gear_preview');
  const ring = items.getItem('trophy_star_ring');
  const empty = preview(p, ring, 'ring2');
  assert.equal(empty.slot, 'ring2'); assert.ok(!empty.old);
  assert.ok(empty.warnings.some(w => w.includes('sở hữu')));
  assert.ok(preview(p, ring, 'head').error);
  const invalid = preview({ ...p, level: 1 }, items.getItem('starforged_wand'));
  assert.ok(invalid.warnings.some(w => w.includes('class')));
  assert.ok(invalid.warnings.some(w => w.includes('Lv.45')));
});
test('compare command exposes actual deltas, stance, real sources and missing ingredients', async () => {
  const p = user(); const msg = h.fakeMessage(p.user_id);
  await commands.get('compare').execute(msg, ['runeforged_sword']);
  assert.match(msg._text(), /đang mặc → thay bằng/);
  assert.match(msg._text(), /Công phá/);
  assert.match(msg._text(), /craft recipe_runeforged_sword/);
  assert.match(msg._text(), /mithril_ingot: 0\/4 \(thiếu 4\)/);
  assert.deepEqual(slots.getEquipped(p.user_id), {});
  const ring = h.fakeMessage(p.user_id);
  await commands.get('compare').execute(ring, ['trophy_star_ring', 'ring2']);
  assert.match(ring._text(), /hunt star_devourer/);
  assert.match(ring._text(), /ring2/);
});
