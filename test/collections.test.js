const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, player, collection, ach, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); player = require('../src/game/player'); collection = require('../src/game/collections'); ach = require('../src/game/achievements'); commands = h.loadCommands(); h.loud(); });
function user() { const id = `COLLECTION_${++n}`; player.createPlayer(id, id); return id; }

test('fish/gather catalog includes every ordinary drop once plus five weather rares each', () => {
  for (const [kind, job] of Object.entries(collection.JOBS)) {
    const items = collection.catalog(kind);
    assert.equal(items.filter(i => i.rare).length, 5);
    assert.equal(new Set(items.map(i => i.id)).size, items.length);
    for (const row of db.prepare('SELECT d.item_id FROM gather_drops d JOIN gather_zones z ON z.id=d.zone_id WHERE z.job_type=?').all(job)) assert.ok(items.some(i => i.id === row.item_id));
  }
  assert.deepEqual(collection.catalog('__proto__'), []);
});

test('all ten first-item achievements grant exactly once and survive inventory removal', () => {
  const id = user();
  const before = ach.getPlayerStats(id).ach_points;
  const rares = require('../src/game/weather_rares').RARES;
  for (const r of rares) {
    player.addItem(id, r.id);
    assert.ok(collection.has(id, r.id));
    assert.ok(ach.hasUnlocked(id, `first_${r.id}`));
    const stamp = db.prepare('SELECT discovered_at FROM player_collections WHERE user_id=? AND item_id=?').get(id, r.id).discovered_at;
    player.removeItem(id, r.id, 1);
    assert.ok(collection.has(id, r.id));
    player.addItem(id, r.id, 2);
    assert.equal(db.prepare('SELECT discovered_at FROM player_collections WHERE user_id=? AND item_id=?').get(id, r.id).discovered_at, stamp);
    const a = ach.getAchievement(`first_${r.id}`);
    assert.equal(a.points, 15); assert.equal(a.reward_gold + a.reward_xp, 0); assert.equal(a.reward_item, '');
  }
  assert.equal(ach.getPlayerStats(id).ach_points - before, 150);
});

test('ordinary lifetime discoveries are isolated per player; invalid quantities and unrelated items do not count', () => {
  const a = user(), b = user();
  player.addItem(a, 'fish_carp', 2); player.removeItem(a, 'fish_carp', 2);
  assert.ok(collection.has(a, 'fish_carp')); assert.ok(!collection.has(b, 'fish_carp'));
  player.addItem(a, 'potion_s'); assert.ok(!collection.has(a, 'potion_s'));
  assert.equal(collection.record(a, 'dew_clover', 0), false);
  assert.equal(collection.record(a, 'dew_clover', -1), false);
  assert.equal(collection.record(a, 'dew_clover', 1.5), false);
  assert.equal(collection.record(a, 'dew_clover', NaN), false);
});

test('backfill inventory is one-time, grants only new point achievements and does not duplicate rewards', () => {
  const id = user();
  db.prepare('INSERT INTO inventory(user_id,item_id,qty) VALUES (?,?,1)').run(id, 'dew_clover');
  db.prepare('INSERT INTO inventory(user_id,item_id,qty) VALUES (?,?,1)').run(id, 'fish_carp');
  db.prepare("DELETE FROM meta WHERE key='collections_backfill_v1'").run();
  const before = player.getPlayer(id);
  collection.migrate();
  assert.ok(collection.has(id, 'dew_clover')); assert.ok(collection.has(id, 'fish_carp'));
  assert.ok(ach.hasUnlocked(id, 'first_dew_clover'));
  const points = ach.getPlayerStats(id).ach_points;
  collection.migrate();
  assert.equal(ach.getPlayerStats(id).ach_points, points);
  assert.deepEqual(player.getPlayer(id), before);
});

test('collection command shows progress, missing conditions and page navigation for both books', async () => {
  const id = user(); player.addItem(id, 'dew_clover');
  const msg = h.fakeMessage(id); const payloads = [];
  msg.reply = async p => { payloads.push(p); return { id: 'MSG' }; };
  await commands.get('collection').execute(msg, []); assert.match(payloads.at(-1), /Fish/);
  for (const kind of ['fish', 'gather']) {
    const pages = Math.ceil(collection.catalog(kind).length / 8);
    let rendered = '';
    for (let p = 1; p <= pages; p++) {
      await commands.get('collection').execute(msg, [kind, String(p)]);
      const embed = payloads.at(-1).embeds[0].data;
      assert.ok(embed.description.length < 4096);
      assert.match(embed.footer.text, /Hiếm/);
      rendered += embed.description;
    }
    assert.match(rendered, /⬜/); assert.match(rendered, /%/);
    if (kind === 'gather') { assert.match(rendered, /✅/); assert.match(rendered, /Cỏ Ba Lá/); }
  }
  await commands.get('collection').execute(msg, ['fish', '-1']); assert.equal(typeof payloads.at(-1), 'string');
  await commands.get('collection').execute(msg, ['bad']); assert.match(payloads.at(-1), /Dùng/);
});

test('real rare catch shows first-achievement notice once without increasing rare quantities', async () => {
  const id = user(), jobs = require('../src/game/jobs'), rares = require('../src/game/weather_rares');
  jobs.getJob(id, 'foraging');
  const saved = rares.roll;
  try {
    rares.roll = () => [rares.RARES[0]];
    const a = h.fakeMessage(id); await commands.get('gather').execute(a, ['sunlit_meadow']);
    assert.match(a._text(), /Lần đầu sưu tập/);
    jobs.updateJob(id, 'foraging', { last_action: 0 });
    const b = h.fakeMessage(id); await commands.get('gather').execute(b, ['sunlit_meadow']);
    assert.doesNotMatch(b._text(), /Lần đầu sưu tập/);
    assert.equal(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(id, 'dew_clover').qty, 2);
  } finally { rares.roll = saved; }
});

test('reset clears discoveries and new achievements, restart preserves normal saved discoveries', async () => {
  const id = user(); player.addItem(id, 'dew_clover');
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, ['-e', `console.log=()=>{}; const c=require('./src/game/collections'); process.stdout.write(JSON.stringify(c.has(${JSON.stringify(id)},'dew_clover')));`], { cwd: h.ROOT, env: { ...process.env }, encoding: 'utf8' });
  assert.equal(out, 'true');
  await commands.get('admin').execute(h.fakeMessage('ADMIN', { mention: { id, username: id } }), ['reset', `<@${id}>`]);
  assert.ok(!collection.has(id, 'dew_clover')); assert.ok(!ach.hasUnlocked(id, 'first_dew_clover'));
  player.createPlayer(id, id); player.addItem(id, 'dew_clover');
  assert.ok(ach.hasUnlocked(id, 'first_dew_clover'));
});

test('slash collection routes kind and page to the common handler', () => {
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'collection');
  assert.equal(def.handler.cmdName, 'collection');
  assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'fish', getInteger: () => 2 } }), ['fish', '2']);
});
