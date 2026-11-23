const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, player, jobs, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); player = require('../src/game/player'); jobs = require('../src/game/jobs'); commands = h.loadCommands(); h.loud(); });
function user() { const id = `SETJOB_${++n}`; player.createPlayer(id, id); return id; }
function msg(id, admin = true) { return h.fakeMessage('JOB_ADMIN', { admin, mention: { id, username: id } }); }
test('setjoblevel supports all five professions, resets only XP and preserves cooldown and character stats', async () => {
  for (const job of jobs.JOB_TYPES) {
    const id = user(); jobs.getJob(id, job); jobs.updateJob(id, job, { xp: 20, last_action: 123456 });
    const before = player.getPlayer(id);
    const m = msg(id); await commands.get('admin').execute(m, ['setjoblevel', id, job, '9']);
    const actual = jobs.getJob(id, job);
    assert.equal(actual.level, 9); assert.equal(actual.xp, 0); assert.equal(actual.last_action, 123456);
    assert.deepEqual(player.getPlayer(id), before);
    assert.match(m._text(), /Lv.9/);
    await commands.get('admin').execute(m, ['joblevel', id, job, '1']);
    assert.equal(jobs.getJob(id, job).level, 1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM player_jobs WHERE user_id=?').get(id).n, 1);
  }
});
test('invalid inputs and unauthorized users cannot create or mutate profession rows', async () => {
  const id = user(); const before = player.getPlayer(id);
  for (const [job, level] of [['nojob', '20'], ['mining', '0'], ['fishing', '101'], ['cooking', '2.5'], ['crafting', '25oops'], ['foraging', '-1'], ['mining', 'NaN'], ['mining', '9007199254740993']]) {
    await commands.get('admin').execute(msg(id), ['setjoblevel', id, job, level]);
  }
  await commands.get('admin').execute(msg(id, false), ['setjoblevel', id, 'mining', '25']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM player_jobs WHERE user_id=?').get(id).n, 0);
  assert.deepEqual(player.getPlayer(id), before);
  const fresh = `NO_PLAYER_${++n}`;
  await commands.get('admin').execute(msg(fresh), ['setjoblevel', fresh, 'mining', '25invalid']);
  assert.equal(player.getPlayer(fresh), undefined);
});
test('profession achievements and rewards occur only once, even after downgrade/re-upgrade', async () => {
  const id = user(), m = msg(id);
  await commands.get('admin').execute(m, ['setjoblevel', id, 'mining', '25']);
  const a = require('../src/game/achievements');
  assert.ok(a.hasUnlocked(id, 'job_mining_10')); assert.ok(a.hasUnlocked(id, 'job_mining_25'));
  // Flush any character-level achievement unlocked by the profession reward XP.
  a.checkAndGrant(id, { client: m.client, guildId: m.guild.id });
  const before = player.getPlayer(id), points = a.getPlayerStats(id).ach_points;
  await commands.get('admin').execute(m, ['setjoblevel', id, 'mining', '1']);
  await commands.get('admin').execute(m, ['setjoblevel', id, 'mining', '25']);
  assert.deepEqual(player.getPlayer(id), before); assert.equal(a.getPlayerStats(id).ach_points, points);
});
test('adm player gateway routes command and tool eligibility follows the new profession level', async () => {
  const id = user(); player.addItem(id, 'pick_copper');
  const m = msg(id); m.client.commands = commands;
  await commands.get('adm').execute(m, ['player', 'setjoblevel', id, 'mining', '6']);
  assert.equal(jobs.getJob(id, 'mining').level, 6);
  assert.equal(require('../src/game/job_tools').bestTool(id, 'mining').item_id, 'pick_copper');
  await commands.get('adm').execute(m, ['player', 'setjoblevel', id, 'mining', '1']);
  assert.equal(require('../src/game/job_tools').bestTool(id, 'mining'), null);
});
test('slash adm setjoblevel has bounded schema and routes to same permission-checked handler', async () => {
  const definitions = require('../src/slash/admin_definitions');
  const list = Array.isArray(definitions) ? definitions : definitions.definitions;
  const adm = list.find(x => (x.data || x).name === 'adm' || (x.data || x).toJSON?.().name === 'adm');
  const json = (adm.data || adm).toJSON ? (adm.data || adm).toJSON() : (adm.data || adm);
  const sub = json.options.find(o => o.name === 'setjoblevel');
  assert.equal(sub.options.find(o => o.name === 'level').min_value, 1);
  assert.equal(sub.options.find(o => o.name === 'level').max_value, 100);
  assert.equal(sub.options.find(o => o.name === 'job').choices.length, 5);
  const id = user(), m = msg(id), replies = [];
  const client = { commands };
  await require('../src/slash/admin_handler').handle({
    commandName: 'adm', user: m.author, member: m.member, guild: m.guild, channel: m.channel, client,
    options: { getSubcommand: () => 'setjoblevel', getUser: () => ({ id, username: id }), getString: () => 'fishing', getInteger: () => 8 },
    deferReply: async () => {}, editReply: async p => { replies.push(p); }, reply: async p => { replies.push(p); },
  }, client);
  assert.equal(jobs.getJob(id, 'fishing').level, 8);
});
