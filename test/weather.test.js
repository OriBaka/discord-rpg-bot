const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, world, rares, player, jobs, commands, seq = 0;
before(() => {
  h.quiet(); db = require('../src/db/database'); world = require('../src/game/world_weather');
  rares = require('../src/game/weather_rares'); player = require('../src/game/player'); jobs = require('../src/game/jobs'); commands = h.loadCommands(); h.loud();
});
const t = Date.parse('2026-11-16T00:00:00Z'); // 07:00 VN
function reset() { db.prepare('DELETE FROM world_weather').run(); }
function user(job) {
  const id = `WEATHER_${++seq}`; player.createPlayer(id, id);
  jobs.getJob(id, job); jobs.updateJob(id, job, { level: 50 });
  const tool = require('../src/game/job_tools').getToolsByJob(job)[0];
  if (tool) player.addItem(id, tool.item_id);
  return id;
}
test('persisted random weather only rolls when due, may repeat, and skips offline backlog', () => {
  reset(); let calls = 0; const rng = () => { calls++; return 0; };
  const first = world.current(t, rng);
  assert.equal(first.weather, 'clear'); assert.equal(first.next_at, t + 1800000);
  assert.equal(world.current(t + 1799999, rng).revision, first.revision);
  assert.equal(calls, 1);
  const second = world.current(t + 1800000, rng);
  assert.equal(second.weather, first.weather); assert.equal(second.revision, first.revision + 1);
  world.migrate(); assert.equal(world.current(t + 1800001, rng).next_at, second.next_at);
  const late = world.current(t + 86400000, rng);
  assert.equal(late.revision, second.revision + 1); assert.equal(calls, 3);
});
test('VN day boundaries and configurable clock, day hours and interval persist without rerolling', () => {
  reset(); world.current(t, () => 0);
  assert.equal(world.current(Date.parse('2026-11-15T22:59:00Z'), () => 0).period, 'night');
  assert.equal(world.current(Date.parse('2026-11-15T23:00:00Z'), () => 0).period, 'day');
  assert.equal(world.current(Date.parse('2026-11-16T10:59:00Z'), () => 0).period, 'day');
  assert.equal(world.current(Date.parse('2026-11-16T11:00:00Z'), () => 0).period, 'night');
  assert.equal(world.configure('time', ['21:30'], t), null);
  let s = world.current(t); assert.equal(s.hour, 21); assert.equal(s.minute, 30); assert.equal(s.period, 'night');
  assert.equal(world.current(t + 60000).minute, 31);
  assert.equal(world.configure('time', ['reset'], t), null); assert.equal(world.current(t).hour, 7);
  assert.equal(world.configure('dayhours', ['8', '20'], t), null); assert.equal(world.current(t).period, 'night');
  assert.equal(world.configure('interval', ['45'], t), null); assert.equal(world.current(t).next_at, t + 2700000);
  const before = db.prepare('SELECT * FROM world_weather').get();
  for (const [kind, args] of [['time', ['24:00']], ['interval', ['0']], ['interval', ['2foo']], ['dayhours', ['20', '6']]]) assert.ok(world.configure(kind, args, t));
  assert.deepEqual(db.prepare('SELECT * FROM world_weather').get(), before);
});
test('all conditional sources are real, outside conditions never roll RNG, threshold is strict', () => {
  for (const r of rares.RARES) {
    assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(r.id));
    assert.ok(db.prepare('SELECT 1 FROM gather_zones WHERE id=?').get(r.zone));
    assert.equal(db.prepare('SELECT 1 FROM gather_drops WHERE item_id=?').get(r.id), undefined);
    assert.equal(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(r.id), undefined);
    assert.equal(db.prepare('SELECT 1 FROM monster_drops WHERE item_id=?').get(r.id), undefined);
    const state = { weather: r.weather, period: r.period };
    assert.deepEqual(rares.roll(r.zone, state, () => 0), [r]);
    assert.deepEqual(rares.roll(r.zone, state, () => r.chance), []);
    const fail = () => { assert.fail('outside condition must not consume RNG'); };
    assert.deepEqual(rares.roll(r.zone, { ...state, weather: 'invalid' }, fail), []);
    assert.deepEqual(rares.roll(r.zone, { ...state, period: r.period === 'day' ? 'night' : 'day' }, fail), []);
    assert.deepEqual(rares.roll('stone_quarry', state, fail), []);
    assert.ok(require('../src/game/handbook').lookup(db, r.id).sources.some(s => s.includes('ngoài điều kiện = 0%')));
  }
});
test('actual fish/gather commands grant exactly one conditional item; rejected and cooldown actions never roll', async () => {
  const savedCurrent = world.current, savedRoll = rares.roll;
  try {
    for (const r of rares.RARES) {
      const job = db.prepare('SELECT job_type FROM gather_zones WHERE id=?').get(r.zone).job_type;
      const id = user(job), cmd = commands.get(job === 'fishing' ? 'fish' : 'gather');
      world.current = () => ({ weather: r.weather, period: r.period, hour: 7, minute: 0 });
      let calls = 0; rares.roll = (zone, state) => { calls++; return savedRoll(zone, state, () => 0); };
      const msg = h.fakeMessage(id); await cmd.execute(msg, [r.zone]);
      assert.equal(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(id, r.id).qty, 1);
      assert.match(msg._text(), /HIẾM THEO THỜI TIẾT/);
      assert.equal(calls, 1);
      await cmd.execute(msg, [r.zone]); assert.equal(calls, 1, 'cooldown');
      await cmd.execute(msg, ['invalid']); assert.equal(calls, 1, 'wrong zone');
      jobs.updateJob(id, job, { level: 1, last_action: 0 });
      if (r.zone !== 'sunlit_meadow' && r.zone !== 'village_pond') {
        await cmd.execute(msg, [r.zone]); assert.equal(calls, 1, 'level gate');
      }
    }
  } finally { world.current = savedCurrent; rares.roll = savedRoll; }
});
test('global settings deny guild admins, allow configured bot admins; channel config is guild scoped', async () => {
  const cmd = commands.get('weather'), saved = process.env.ADMIN_IDS;
  try {
    process.env.ADMIN_IDS = 'BOT_ADMIN';
    const denied = h.fakeMessage('SERVER_ADMIN');
    await cmd.execute(denied, ['interval', '60']); assert.match(denied._text(), /Chỉ admin bot/);
    const allowed = h.fakeMessage('BOT_ADMIN'); await cmd.execute(allowed, ['interval', '60']);
    assert.equal(world.current().interval_ms, 3600000);
    const msg = h.fakeMessage('SERVER_ADMIN');
    msg.client = { user: {}, channels: { fetch: async () => ({ guildId: msg.guild.id, isTextBased: () => true, send: async () => {}, permissionsFor: () => ({ has: () => true }) }) } };
    await cmd.execute(msg, ['channel', '123']);
    assert.equal(db.prepare('SELECT channel_id FROM weather_channels WHERE guild_id=?').get(msg.guild.id).channel_id, '123');
    await cmd.execute(msg, ['channel', 'off']);
    assert.equal(db.prepare('SELECT 1 FROM weather_channels WHERE guild_id=?').get(msg.guild.id), undefined);
    const nonAdmin = h.fakeMessage('USER', { admin: false });
    await cmd.execute(nonAdmin, ['channel', '123']); assert.match(nonAdmin._text(), /Cần quyền/);
  } finally { if (saved === undefined) delete process.env.ADMIN_IDS; else process.env.ADMIN_IDS = saved; }
});
test('notification subscriptions share one world, deduplicate repeats, retry failures and survive migrate', async () => {
  db.prepare('DELETE FROM weather_channels').run(); reset();
  world.current(Date.now(), () => 0);
  for (const id of ['A', 'B']) db.prepare('INSERT INTO weather_channels(guild_id,channel_id) VALUES (?,?)').run(id, id);
  const sent = []; let fail = true;
  const client = { channels: { fetch: async id => ({ guildId: id, isTextBased: () => true, send: async p => {
    if (id === 'A' && fail) throw new Error('no permissions'); sent.push([id, p]);
  } }) } };
  const error = console.error; console.error = () => {};
  try { await world.tick(client); } finally { console.error = error; }
  assert.equal(sent.length, 1); assert.equal(sent[0][0], 'B');
  fail = false; await world.tick(client); assert.equal(sent.length, 2);
  assert.equal(sent[0][1].content, sent[1][1].content);
  assert.deepEqual(sent[0][1].allowedMentions, { parse: [] });
  world.migrate(); await world.tick(client); assert.equal(sent.length, 2);
  // Even the same weather in a NEW revision must generate a bulletin.
  db.prepare('UPDATE world_weather SET revision=revision+1 WHERE id=1').run();
  await world.tick(client); assert.equal(sent.length, 4);
});
test('slash weather routes to the shared handler', () => {
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'weather');
  assert.equal(def.handler.cmdName, 'weather');
  assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'time 21:30' } }), ['time', '21:30']);
});

test('world state and clock settings survive an actual process restart', () => {
  reset(); const now = Date.now(); world.current(now, () => 0.4);
  assert.equal(world.configure('time', ['20:45'], now), null);
  const expected = world.current(now);
  const { execFileSync } = require('node:child_process');
  const output = execFileSync(process.execPath, ['-e', `
    console.log = () => {};
    const world = require('./src/game/world_weather');
    process.stdout.write(JSON.stringify(world.current(${now})));
  `], { cwd: h.ROOT, encoding: 'utf8', env: { ...process.env } });
  assert.deepEqual(JSON.parse(output), expected);
});

test('day/night notifications key changes at boundaries but not just at midnight', () => {
  reset();
  const before = Date.parse('2026-11-16T16:59:00Z'); // 23:59 VN
  world.current(before, () => 0);
  const night = world.current(before);
  assert.equal(world.current(before + 60000).key, night.key);
  const sunrise = Date.parse('2026-11-16T23:00:00Z');
  // Hold weather revision constant to isolate the day/night boundary.
  db.prepare('UPDATE world_weather SET next_at=?').run(sunrise + 86400000);
  assert.notEqual(world.current(sunrise).key, night.key);
});

test('channel registration rejects cross-server channels and missing send permissions', async () => {
  const msg = h.fakeMessage('CHANNEL_ADMIN');
  db.prepare('DELETE FROM weather_channels WHERE guild_id=?').run(msg.guild.id);
  msg.client = { user: {}, channels: { fetch: async () => ({ guildId: 'OTHER_GUILD', isTextBased: () => true, send: async () => {} }) } };
  await commands.get('weather').execute(msg, ['channel', '999']);
  assert.match(msg._text(), /trong server này/);
  assert.equal(db.prepare('SELECT 1 FROM weather_channels WHERE guild_id=?').get(msg.guild.id), undefined);
  msg.client.channels.fetch = async () => ({ guildId: msg.guild.id, isTextBased: () => true, send: async () => {}, permissionsFor: () => ({ has: () => false }) });
  await commands.get('weather').execute(msg, ['channel', '999']);
  assert.match(msg._text(), /View Channel/);
  assert.equal(db.prepare('SELECT 1 FROM weather_channels WHERE guild_id=?').get(msg.guild.id), undefined);
});
