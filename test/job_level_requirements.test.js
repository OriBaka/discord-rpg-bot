const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, player, jobs, tools, buffs, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); player = require('../src/game/player'); jobs = require('../src/game/jobs'); tools = require('../src/game/job_tools'); buffs = require('../src/game/job_buffs'); commands = h.loadCommands(); h.loud(); });
function user(level) { const id = `JOB_GATE_${++n}`; player.createPlayer(id, id); player.updatePlayer(id, { level }); return id; }
function job(id, type, level) { jobs.getJob(id, type); jobs.updateJob(id, type, { level }); }
test('all five jobs select tools by their own level, independently of high/low character level', () => {
  for (const type of jobs.JOB_TYPES) {
    const top = tools.getToolsByJob(type).at(-1);
    const novice = user(99); player.addItem(novice, top.item_id); job(novice, type, 1);
    assert.equal(tools.bestTool(novice, type), null);
    const expert = user(1); player.addItem(expert, top.item_id); job(expert, type, top.min_level);
    assert.equal(tools.bestTool(expert, type).item_id, top.item_id);
    const wrongJob = jobs.JOB_TYPES.find(j => j !== type); job(novice, wrongJob, 99);
    assert.equal(tools.bestTool(novice, type), null);
  }
});
test('buff activation uses the matching profession and consumes only when qualified, for every job', async () => {
  for (const type of jobs.JOB_TYPES) {
    const item = buffs.getBuffItemsByJob(type).at(-1);
    const id = user(99); player.addItem(id, item.item_id, 2); job(id, type, 1);
    const denied = h.fakeMessage(id); await commands.get('use').execute(denied, [item.item_id]);
    assert.match(denied._text(), new RegExp(`${type} Lv`));
    assert.equal(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(id, item.item_id).qty, 2);
    player.updatePlayer(id, { level: 1 }); job(id, type, item.min_level);
    await commands.get('use').execute(h.fakeMessage(id), [item.item_id]);
    assert.equal(buffs.get(id, type).item_id, item.item_id);
    assert.equal(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(id, item.item_id).qty, 1);
  }
});
test('generic requirements and item details distinguish profession tools from combat gear and tomes', () => {
  const id = user(1); job(id, 'mining', 6);
  const req = require('../src/game/level_req'), items = require('../src/game/items');
  assert.equal(req.canUse(player.getPlayer(id), items.getItem('pick_copper')).ok, true);
  assert.equal(req.canUse(player.getPlayer(id), items.getItem('iron_sword')).ok, false);
  assert.equal(req.jobRequirement(items.getItem('tome_blood_rend')), null);
  const fields = require('../src/game/item_display').statPairs(items.getItem('pick_copper'));
  assert.ok(fields.some(f => f.name.includes('Cấp nghề') && f.value === 'mining Lv.6'));
});
test('job summary and shop show eligible profession level even for character Lv1', async () => {
  const id = user(1); job(id, 'mining', 6); player.addItem(id, 'pick_copper');
  const summary = h.fakeMessage(id); await commands.get('job').execute(summary, []); assert.match(summary._text(), /Copper Pickaxe/);
  let payload; await commands.get('shop').renderShopPage({ userId: id, msg: h.fakeMessage(id), filter: 'tool', page: 0, playerGold: 400, playerLevel: 1, replyFn: p => { payload = p; } });
  // Item detail is authoritative even when shop categorizes legacy picks as weapons.
  const detail = h.fakeMessage(id); await commands.get('info').execute(detail, ['item', 'pick_copper']);
  assert.match(detail._text(), /mining Lv.6/); assert.ok(payload.embeds.length);
});
test('existing buff activated under old character-level rule pauses without losing charges until job qualifies', () => {
  const id = user(99); job(id, 'mining', 1);
  assert.ok(buffs.activate(id, 'torch_oil', 25).ok); // previously valid stored state
  const before = buffs.get(id, 'mining');
  assert.equal(buffs.bonus(id, 'mining').buff, null);
  assert.deepEqual(buffs.get(id, 'mining'), before);
  job(id, 'mining', 25); assert.equal(buffs.bonus(id, 'mining').buff.item_id, 'torch_oil');
});
