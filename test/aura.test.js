const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, fakeMessage, loadCommands } = require('./harness');
let db, player, aura, commands, seq = 0;
before(() => { quiet(); db = require('../src/db/database'); player = require('../src/game/player'); aura = require('../src/game/aura'); commands = loadCommands(); loud(); });
function user(gold = 50000) { const id = `AURA_${++seq}`; player.createPlayer(id, id); player.updatePlayer(id, { gold, atk: 100, def: 100 }); return id; }
function rng(...values) { return max => { const n = values.shift(); assert.ok(n >= 0 && n < max); return n; }; }

test('all 100 tier tickets match published odds and value boundaries', () => {
  const counts = {};
  for (let ticket = 0; ticket < 100; ticket++) {
    const r = aura.generate(rng(ticket, 0, 0)); counts[r.tier] = (counts[r.tier] || 0) + 1;
    assert.equal(r.stat, 'atk');
    assert.equal(r.percent, aura.TIERS.find(t => t.id === r.tier).min);
  }
  assert.deepEqual(counts, { common: 60, rare: 28, epic: 10, legendary: 2 });
  assert.deepEqual(aura.generate(rng(99, 1, 2)), { stat: 'def', tier: 'legendary', percent: 12 });
});
test('roll charges once, logs the sink and does not buff until accepted', () => {
  const id = user(); const initial = player.getEffectiveStats(player.getPlayer(id));
  aura.roll(id, 10000, rng(99, 0, 2));
  assert.equal(player.getPlayer(id).gold, 47500);
  assert.deepEqual(player.getEffectiveStats(player.getPlayer(id)), initial);
  assert.equal(aura.get(id).pending_percent, 12);
  assert.equal(db.prepare("SELECT SUM(amount) n FROM gold_sink_log WHERE user_id=? AND kind='aura'").get(id).n, aura.COST);
  assert.deepEqual(aura.resolve(id, true), {});
  const stats = player.getEffectiveStats(player.getPlayer(id));
  assert.equal(stats.atk, initial.atk + 12); assert.equal(stats.def, initial.def);
  assert.equal(player.getPlayer(id).atk, 100);
  assert.ok(aura.resolve(id, true).error);
});
test('reroll changes only pending; discard retains active, accept can downgrade without stacking', () => {
  const id = user(); aura.roll(id, 10000, rng(99, 0, 2)); aura.resolve(id, true);
  aura.roll(id, 12000, rng(0, 1, 0));
  assert.equal(aura.get(id).active_percent, 12); aura.resolve(id, false);
  assert.equal(aura.get(id).active_percent, 12); assert.equal(aura.get(id).pending_stat, null);
  aura.roll(id, 14000, rng(0, 1, 0)); aura.resolve(id, true);
  assert.deepEqual(aura.bonus(id, 100, 100), { atk: 0, def: 1 });
  assert.equal(aura.get(id).rolls, 3); assert.equal(aura.get(id).gold_spent, 7500);
});
test('insufficient gold and cooldown never roll or charge', () => {
  const id = user(2499); const never = () => { throw new Error('should not draw'); };
  assert.ok(aura.roll(id, 10000, never).error); assert.equal(aura.get(id), null);
  player.updatePlayer(id, { gold: 5000 }); aura.roll(id, 10000, rng(0, 0, 0));
  assert.ok(aura.roll(id, 10001, never).error); assert.equal(player.getPlayer(id).gold, 2500);
  assert.ok(aura.roll('NOT_A_PLAYER', 10000, never).error);
});
test('failed ledger insert rolls back gold, candidate, roll count and timestamp', () => {
  const id = user();
  db.exec("CREATE TRIGGER aura_fail BEFORE INSERT ON gold_sink_log BEGIN SELECT RAISE(ABORT,'aura test failure'); END");
  try { assert.throws(() => aura.roll(id, 10000, rng(99, 0, 2)), /aura test failure/); }
  finally { db.exec('DROP TRIGGER aura_fail'); }
  assert.equal(player.getPlayer(id).gold, 50000); assert.equal(aura.get(id), null);
});
test('bonus floors, scales from supplied stats, and absent aura is neutral', () => {
  const id = user(); assert.deepEqual(aura.bonus(id, 999, 999), { atk: 0, def: 0 });
  aura.roll(id, 10000, rng(99, 0, 2)); aura.resolve(id, true);
  assert.deepEqual(aura.bonus(id, 109, 900), { atk: 13, def: 0 });
});
test('migration preserves active/pending and leaderboard ignores pending-only users', () => {
  const id = user(); aura.roll(id, 10000, rng(99, 0, 2));
  assert.equal(aura.top().some(r => r.name === id), false);
  aura.resolve(id, true); aura.roll(id, 12000, rng(0, 1, 0));
  const state = aura.get(id); aura.migrate(); assert.deepEqual(aura.get(id), state);
  assert.ok(aura.top().some(r => r.name === id));
});
test('commands require confirmation, share slash routing, show aura and clear on reset', async () => {
  const id = user(); const msg = fakeMessage(id);
  await commands.get('aura').execute(msg, ['roll']); assert.equal(aura.get(id), null);
  await commands.get('aura').execute(msg, ['roll', 'confirm']); assert.ok(aura.get(id).pending_stat);
  await commands.get('aura').execute(msg, ['accept']);
  await commands.get('me').execute(msg, []); assert.match(msg._text(), /Aura/);
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'aura');
  assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'roll', getBoolean: () => true } }), ['roll', 'confirm']);
  const admin = fakeMessage('ADMIN', { mention: { id, username: id } });
  await commands.get('admin').execute(admin, ['reset', `<@${id}>`]); assert.equal(aura.get(id), null);
});
