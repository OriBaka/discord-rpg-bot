const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, p, b, battle, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); p = require('../src/game/player'); b = require('../src/game/skill_builds'); battle = require('../src/game/battle'); commands = h.loadCommands(); h.loud(); });
function user(cls = 'melee') { const id = `PRESET_${++n}`; p.createPlayer(id, id); p.updatePlayer(id, { primary_class: cls, level: 45 }); return id; }
function fight(a, other) { return battle.createBattle({ mode: other ? 'pvp' : 'pve', user_a: a, user_b: other, channel_id: 'C', hp_a: 1000, max_hp_a: 1000, hp_b: 1000, max_hp_b: 1000, atk_a: 100, atk_b: 100, def_a: 100, def_b: 100 }); }
test('three presets per class save, overwrite, load, delete without money or class leakage', () => {
  const id = user(), original = p.getPlayer(id).gold;
  b.set(id, 'melee', 45, ['slash', 'charge']);
  for (const name of ['boss', 'tower', 'combo']) assert.ok(!b.preset(id, 'save', name).error);
  assert.ok(b.preset(id, 'save', 'fourth').error);
  b.set(id, 'melee', 45, ['execute']); assert.ok(!b.preset(id, 'save', 'boss').error);
  assert.deepEqual(b.preset(id, 'load', 'tower').skills, ['slash', 'charge']);
  assert.deepEqual(b.preset(id, 'load', 'boss').skills, ['execute']);
  assert.ok(!b.preset(id, 'delete', 'combo').error); assert.equal(b.presets(id, 'melee').length, 2);
  p.updatePlayer(id, { primary_class: 'magic' });
  assert.ok(b.preset(id, 'load', 'boss').error); assert.ok(!b.preset(id, 'save', 'boss').error);
  assert.equal(b.presets(id, 'magic').length, 1); assert.equal(p.getPlayer(id).gold, original);
  assert.ok(b.preset(user(), 'load', 'boss').error);
});
test('loading revalidates level/learned skills and corrupt data without changing equipped build', () => {
  const id = user(); b.set(id, 'melee', 45, ['execute']); b.preset(id, 'save', 'boss');
  b.set(id, 'melee', 45, ['slash']); p.updatePlayer(id, { level: 1 });
  assert.ok(b.preset(id, 'load', 'boss').error); assert.deepEqual(b.get(id, 'melee', 1), ['slash']);
  p.updatePlayer(id, { level: 45 });
  db.prepare('UPDATE skill_presets SET skills=? WHERE user_id=?').run('["blood_rend"]', id);
  assert.ok(b.preset(id, 'load', 'boss').error);
  db.prepare('UPDATE skill_presets SET skills=? WHERE user_id=?').run('broken', id);
  assert.ok(b.preset(id, 'load', 'boss').error);
  assert.ok(b.preset(id, 'save', '../../bad').error);
});
test('active PvE, Tower and PvP user_b block preset mutations and equip/reset commands; snapshots stay unchanged', async () => {
  for (const mode of ['pve', 'tower', 'pvp']) {
    const id = user(), other = user(); b.set(id, 'melee', 45, ['slash']); b.preset(id, 'save', 'boss');
    const bid = mode === 'pvp' ? fight(other, id) : fight(id);
    if (mode === 'tower') battle.updateBattle(bid, { mode: 'tower' });
    const before = battle.getBattle(bid);
    for (const action of ['save', 'load', 'delete']) assert.ok(b.preset(id, action, 'boss').error);
    for (const args of [['equip', 'execute'], ['reset'], ['load', 'boss']]) {
      const msg = h.fakeMessage(id); await commands.get('skills').execute(msg, args); assert.match(msg._text(), /kết thúc trận/);
    }
    assert.deepEqual(battle.getBattle(bid), before);
    battle.updateBattle(bid, { status: 'ended' }); assert.ok(!b.preset(id, 'load', 'boss').error);
  }
});
test('preset persistence survives module/process restart and reset clears saved builds', async () => {
  const id = user(); b.set(id, 'melee', 45, ['slash', 'charge']); b.preset(id, 'save', 'boss');
  const out = require('node:child_process').execFileSync(process.execPath, ['-e', `console.log=()=>{};process.stdout.write(JSON.stringify(require('./src/game/skill_builds').presets(${JSON.stringify(id)},'melee')));`], { cwd: h.ROOT, env: { ...process.env }, encoding: 'utf8' });
  assert.equal(JSON.parse(out)[0].name, 'boss');
  await commands.get('admin').execute(h.fakeMessage('ADMIN', { mention: { id, username: id } }), ['reset', `<@${id}>`]);
  assert.equal(b.presets(id, 'melee').length, 0);
});
