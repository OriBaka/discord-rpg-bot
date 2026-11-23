const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, world, player, commands, seq = 0;
before(() => { h.quiet(); db = require('../src/db/database'); world = require('../src/game/world_story'); player = require('../src/game/player'); commands = h.loadCommands(); h.loud(); });
function user(done = true) {
  const id = `WORLD_${++seq}`; player.createPlayer(id, id);
  require('../src/game/story').start(id);
  if (done) db.prepare('UPDATE player_story SET step=28 WHERE user_id=?').run(id);
  return id;
}
function fixture(steps = [{ kind: 'kill', target: 'slime', qty: 2 }, { kind: 'boss', target: 'elite_wolf', qty: 1 }]) {
  let now = Date.now();
  const id = `test_chapter_${++seq}`;
  const definition = { id, title: 'Synthetic test only', ready: true, steps,
    choices: [{ id: 'seal', label: 'Keep sealed', consequence: 'Test outcome A' }, { id: 'open', label: 'Open door', consequence: 'Test outcome B' }] };
  const service = world.createService(db, { [id]: definition }, () => now);
  const opens = now + world.NOTICE_MS;
  const schedule = () => service.schedule(id, opens, 'TEST_ADMIN');
  const event = (uid, key, kind, target, amount = 1, at = now) => service.record(uid, id, key, kind, target, amount, at);
  return { id, definition, service, opens, schedule, event, now: () => now, setNow: value => { now = value; } };
}
function close(f) {
  const state = f.service.state(f.id);
  if (state.status === 'scheduled') db.prepare("UPDATE world_story_chapters SET status='cancelled' WHERE id=?").run(f.id); // test fixture cleanup only
  else if (state.status === 'awaiting_choice') f.service.choose(state.winner_id, f.id, 'seal');
}
test('production Chapter4 is locked at API and command level; migrations never seed a race/history', async () => {
  assert.equal(world.CONTENT.chapter4.ready, false);
  assert.equal(world.getService().state().status, 'locked');
  assert.ok(world.getService().schedule('chapter4', Date.now() + 10 * world.NOTICE_MS, 'ADMIN').error);
  assert.equal(db.prepare("SELECT 1 FROM world_story_chapters WHERE id='chapter4'").get(), undefined);
  const msg = h.fakeMessage(user()); await commands.get('worldstory').execute(msg, []);
  assert.match(msg._text(), /chưa có cuộc đua/);
  await commands.get('worldstory').execute(msg, ['join']); assert.match(msg._text(), /chưa mở/);
  world.migrate(); assert.equal(db.prepare('SELECT COUNT(*) n FROM world_history').get().n, 0);
});
test('schedule requires published valid content and real 24h notice, no overlapping or overwritten chapters', () => {
  const f = fixture();
  assert.ok(f.service.schedule(f.id, f.now() + 1000, 'ADMIN').error);
  assert.ok(!f.schedule().error);
  assert.ok(f.schedule().error);
  const g = fixture(); assert.ok(g.schedule().error);
  // Definition edits after scheduling cannot change the race snapshot.
  f.definition.steps[0].qty = 99;
  assert.equal(f.service.state(f.id).definition.steps[0].qty, 2);
  assert.equal(f.service.state(f.id).phase, 'scheduled');
  f.setNow(f.opens); assert.equal(f.service.state(f.id).phase, 'active');
  close(f);
});
test('join gates time and Chapter3, progress gates original event time, dedup and active step', () => {
  const f = fixture(), a = user(), b = user(false); assert.ok(!f.schedule().error);
  assert.ok(f.service.join(a, f.id).error);
  f.setNow(f.opens + 100);
  assert.ok(f.service.join(b, f.id).error); assert.ok(!f.service.join(a, f.id).error);
  assert.ok(f.event(a, 'early', 'kill', 'slime', 2, f.opens - 1).error);
  assert.ok(f.event(a, 'prejoin', 'kill', 'slime', 2, f.opens + 99).error);
  assert.ok(f.event(a, 'future', 'kill', 'slime', 2, f.now() + 1).error);
  assert.ok(f.event(a, 'bad', 'kill', 'slime', -1).error);
  assert.equal(f.event(a, 'wrong', 'boss', 'elite_wolf').matched, false);
  f.event(a, 'one', 'kill', 'slime');
  assert.equal(f.event(a, 'one', 'kill', 'slime').duplicate, true);
  assert.equal(f.event(a, 'two', 'kill', 'slime', 1000).advanced, true);
  assert.equal(f.event(a, 'wrong', 'boss', 'elite_wolf').duplicate, true, 'old unmatched event cannot be reused on next step');
  const done = f.event(a, 'boss', 'boss', 'elite_wolf'); assert.equal(done.winner, a);
  assert.equal(f.service.state(f.id).status, 'awaiting_choice');
  assert.ok(f.service.choose(b, f.id, 'seal').error);
  assert.ok(f.service.choose(a, f.id, 'freeform arbitrary').error);
  const before = player.getPlayer(a);
  assert.equal(f.service.choose(a, f.id, 'open').choice, 'open');
  assert.ok(f.service.choose(a, f.id, 'seal').error);
  assert.deepEqual(player.getPlayer(a), before, 'no item/currency/stat acquisition');
  assert.equal(f.service.history().find(r => r.chapter_id === f.id).choice_id, 'open');
});
test('two processes finishing concurrently produce exactly one winner on shared SQLite DB', async () => {
  const f = fixture([{ kind: 'kill', target: 'slime', qty: 1 }]), users = [user(), user()];
  assert.ok(!f.schedule().error); f.setNow(f.opens);
  for (const u of users) f.service.join(u, f.id);
  const { execFile } = require('node:child_process');
  const run = u => new Promise((resolve, reject) => {
    const script = `console.log=()=>{}; const w=require('./src/game/world_story'); const s=w.createService(require('./src/db/database'),{},()=>${f.now()}); process.stdout.write(JSON.stringify(s.record(${JSON.stringify(u)},${JSON.stringify(f.id)},'finish','kill','slime',1,${f.now()})));`;
    execFile(process.execPath, ['-e', script], { cwd: h.ROOT, env: { ...process.env } }, (err, out) => err ? reject(err) : resolve(JSON.parse(out)));
  });
  const results = await Promise.all(users.map(run));
  assert.equal(results.filter(r => r.winner).length, 1);
  const winner = f.service.state(f.id).winner_id;
  assert.ok(users.includes(winner));
  f.service.choose(winner, f.id, 'seal');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM world_history WHERE chapter_id=?').get(f.id).n, 1);
});
test('history and pending winner survive reset/restart; history rows cannot be edited or removed', async () => {
  const f = fixture([{ kind: 'kill', target: 'slime', qty: 1 }]), a = user();
  f.schedule(); f.setNow(f.opens); f.service.join(a, f.id); f.event(a, 'finish', 'kill', 'slime');
  const name = player.getPlayer(a).name;
  await commands.get('admin').execute(h.fakeMessage('ADMIN', { mention: { id: a, username: a } }), ['reset', `<@${a}>`]);
  assert.equal(f.service.state(f.id).winner_id, a);
  // Identity is the Discord account; deleting the character does not steal their reserved decision.
  assert.equal(f.service.choose(a, f.id, 'seal').choice, 'seal');
  const history = f.service.history().find(r => r.chapter_id === f.id); assert.equal(history.winner_name, name);
  assert.throws(() => db.prepare('UPDATE world_history SET choice_id=? WHERE chapter_id=?').run('open', f.id), /immutable/);
  assert.throws(() => db.prepare('DELETE FROM world_history WHERE chapter_id=?').run(f.id), /immutable/);
  const out = require('node:child_process').execFileSync(process.execPath, ['-e', `console.log=()=>{};const db=require('./src/db/database');process.stdout.write(JSON.stringify(db.prepare('SELECT * FROM world_history WHERE chapter_id=?').get(${JSON.stringify(f.id)})));`], { cwd: h.ROOT, env: { ...process.env }, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), history);
});
test('choice and history commit together; storage failure leaves winner awaiting their choice', () => {
  const f = fixture([{ kind: 'kill', target: 'slime', qty: 1 }]), a = user();
  f.schedule(); f.setNow(f.opens); f.service.join(a, f.id); f.event(a, 'finish', 'kill', 'slime');
  db.exec("CREATE TRIGGER test_world_fail BEFORE UPDATE ON world_story_chapters WHEN NEW.status='resolved' BEGIN SELECT RAISE(ABORT,'simulated choice failure'); END");
  try { assert.throws(() => f.service.choose(a, f.id, 'seal'), /simulated/); } finally { db.exec('DROP TRIGGER test_world_fail'); }
  assert.equal(f.service.state(f.id).status, 'awaiting_choice');
  assert.equal(db.prepare('SELECT 1 FROM world_history WHERE chapter_id=?').get(f.id), undefined);
  assert.equal(f.service.choose(a, f.id, 'seal').choice, 'seal');
});
test('only bot admins can attempt schedule; no public/admin progress setter exists; slash routes shared handler', async () => {
  const saved = process.env.ADMIN_IDS; process.env.ADMIN_IDS = 'BOT_ADMIN';
  try {
    const guildAdmin = h.fakeMessage('GUILD_ADMIN');
    await commands.get('worldstory').execute(guildAdmin, ['schedule', 'chapter4', '2099-01-01T00:00:00Z']);
    assert.match(guildAdmin._text(), /Chỉ admin bot/);
    const botAdmin = h.fakeMessage('BOT_ADMIN');
    await commands.get('worldstory').execute(botAdmin, ['schedule', 'chapter4', '2099-01-01T00:00:00Z']);
    assert.match(botAdmin._text(), /chưa được phát hành/);
    await commands.get('worldstory').execute(botAdmin, ['setprogress', '999']); assert.match(botAdmin._text(), /Không có lệnh/);
    await commands.get('worldstory').execute(botAdmin, ['history', '-1']); assert.match(botAdmin._text(), /Trang phải/);
    const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'worldstory');
    assert.equal(def.handler.cmdName, 'worldstory');
    assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'history 2' } }), ['history', '2']);
  } finally { if (saved === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = saved; }
});

test('published definitions still reject nonexistent targets or mismatched catalog IDs', () => {
  const f = fixture([{ kind: 'kill', target: 'no_such_monster', qty: 1 }]);
  assert.ok(f.schedule().error);
  assert.equal(db.prepare('SELECT 1 FROM world_story_chapters WHERE id=?').get(f.id), undefined);
  f.definition.steps[0].target = 'slime'; f.definition.id = 'wrong_id';
  assert.ok(f.schedule().error);
  f.definition.id = f.id; f.definition.ready = false;
  assert.ok(f.schedule().error);
});

test('failed winning event rolls back progress, dedup receipt and winner reservation, permitting a safe retry', () => {
  const f = fixture([{ kind: 'kill', target: 'slime', qty: 1 }]), a = user();
  f.schedule(); f.setNow(f.opens); f.service.join(a, f.id);
  db.exec("CREATE TRIGGER test_finish_fail BEFORE UPDATE ON world_story_chapters WHEN NEW.status='awaiting_choice' BEGIN SELECT RAISE(ABORT,'finish failure'); END");
  try { assert.throws(() => f.event(a, 'finish', 'kill', 'slime'), /finish failure/); }
  finally { db.exec('DROP TRIGGER test_finish_fail'); }
  assert.equal(db.prepare('SELECT step FROM world_story_progress WHERE chapter_id=? AND user_id=?').get(f.id, a).step, 0);
  assert.equal(db.prepare('SELECT 1 FROM world_story_events WHERE chapter_id=?').get(f.id), undefined);
  assert.equal(f.service.state(f.id).winner_id, null);
  assert.equal(f.event(a, 'finish', 'kill', 'slime').winner, a);
  close(f);
});
