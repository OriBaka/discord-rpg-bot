const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, player, tools, buffs, zones, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); player = require('../src/game/player'); tools = require('../src/game/job_tools'); buffs = require('../src/game/job_buffs'); zones = require('../src/game/gather_zones'); commands = h.loadCommands(); h.loud(); });
function user(level) { const id = `FARM_SELECT_${++n}`; player.createPlayer(id, id); player.updatePlayer(id, { level: 1, gold: 10000 }); for (const job of ['mining', 'fishing']) { const jobs = require('../src/game/jobs'); jobs.getJob(id, job); jobs.updateJob(id, job, { level }); } return id; }
async function run(id, command) {
  const original = zones.rollDrops; let observed;
  zones.rollDrops = (zone, options) => { observed = options; return []; };
  const msg = h.fakeMessage(id);
  try { await commands.get(command).execute(msg, []); } finally { zones.rollDrops = original; }
  return { msg, observed };
}
test('mine/fish display the same eligible tool that supplies actual drop bonuses, across same-tier upgrades and inventory orders', async () => {
  for (const [command, job, pairs] of [
    ['mine', 'mining', [['pick_wood', 'pick_copper'], ['pick_iron', 'pick_silver'], ['pick_gold', 'pick_mithril']]],
    ['fish', 'fishing', [['rod_wood', 'rod_bamboo'], ['rod_iron', 'rod_silver'], ['rod_gold', 'rod_mithril']]],
  ]) for (const pair of pairs) for (const order of [pair, [...pair].reverse()]) {
    const best = db.prepare('SELECT * FROM items WHERE id=?').get(pair[1]); const id = user(best.min_level);
    for (const item of order) player.addItem(id, item);
    const { msg, observed } = await run(id, command);
    assert.ok(msg._text().includes(`**${best.name}**`), msg._text());
    assert.equal(buffs.bonus(id, job, best.min_level).tool.item_id, best.id);
    assert.equal(observed.chanceMult, 1 + tools.getTool(best.id).drop_bonus);
  }
});
test('buying copper while retaining wood immediately changes mine display and uses +3% drop at Mining Lv6', async () => {
  const id = user(6); player.addItem(id, 'pick_wood');
  await commands.get('buy').execute(h.fakeMessage(id), ['pick_copper']);
  const { msg, observed } = await run(id, 'mine');
  assert.match(msg._text(), /\*\*⛏️ Copper Pickaxe\*\*/); assert.equal(observed.chanceMult, 1.03);
  assert.equal(db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='pick_wood'").get(id).qty, 1);
});
test('under-level upgrades are not used and the displayed reason names job level requirement', async () => {
  for (const [command, wood, upgrade] of [['mine', 'pick_wood', 'pick_copper'], ['fish', 'rod_wood', 'rod_bamboo']]) {
    const id = user(5); player.addItem(id, wood); player.addItem(id, upgrade);
    const { msg, observed } = await run(id, command);
    const name = db.prepare('SELECT name FROM items WHERE id=?').get(wood).name;
    assert.ok(msg._text().includes(`**${name}**`)); assert.match(msg._text(), /cấp nghề (Mining|Fishing) 6/);
    assert.equal(observed.chanceMult, 1);
  }
});
test('zero-quantity upgrades do not supply bonuses or appear as active tools; no eligible tool still blocks gathering', async () => {
  const id = user(6); player.addItem(id, 'pick_wood');
  db.prepare("INSERT INTO inventory(user_id,item_id,qty) VALUES (?,'pick_copper',0)").run(id);
  const result = await run(id, 'mine'); assert.match(result.msg._text(), /\*\*⛏️ Wooden Pickaxe\*\*/); assert.equal(result.observed.chanceMult, 1);
  const locked = user(1); player.addItem(locked, 'pick_copper');
  const denied = await run(locked, 'mine'); assert.equal(denied.observed, undefined); assert.match(denied.msg._text(), /cần Mining Lv/);
});
