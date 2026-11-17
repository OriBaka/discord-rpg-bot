const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, fakeMessage, loadCommands } = require('./harness');
let db, story, player, quests, commands;
let count = 0;
before(() => {
  quiet();
  db = require('../src/db/database');
  story = require('../src/game/story');
  player = require('../src/game/player');
  quests = require('../src/game/quests');
  commands = loadCommands();
  loud();
});
function newPlayer() {
  const id = `STORY_${++count}`;
  player.createPlayer(id, id);
  return id;
}
function eventFor(user, step) {
  switch (step.kind) {
    case 'kill': for (let i = 0; i < step.qty; i++) quests.onKillMonster(user, step.target); break;
    case 'gather': quests.onGather(user, step.target, step.qty); break;
    case 'craft': quests.onCraft(user, 'a_recipe', step.qty); break;
    case 'boss': quests.onKillBoss(user, step.target, 1); break;
    case 'item': player.addItem(user, step.target, step.qty); break;
  }
}

test('story starts explicitly, is idempotent, and does not change veteran stats', () => {
  const id = newPlayer();
  player.updatePlayer(id, { level: 35, gold: 12345 });
  const original = player.getPlayer(id);
  assert.equal(story.status(id), null);
  quests.onKillMonster(id, 'slime');
  assert.equal(story.start('MISSING_PLAYER'), false);
  assert.equal(story.start(id), true);
  assert.equal(story.start(id), false);
  assert.equal(story.status(id).step, 0);
  assert.deepEqual(player.getPlayer(id), original);
});

test('only active step and matching successful events count, capped at target', () => {
  const id = newPlayer();
  story.start(id);
  quests.onKillMonster(id, 'slime'); // Not active yet.
  story.claim(id);
  assert.equal(story.status(id).progress, 0);
  assert.ok(story.claim(id).error);
  quests.onKillMonster(id, 'wolf');
  quests.onGather(id, 'foraging', 5);
  assert.equal(story.status(id).progress, 0);
  for (let i = 0; i < 8; i++) quests.onKillMonster(id, 'slime');
  assert.equal(story.status(id).progress, 3);
  story.claim(id);
  quests.onGather(id, 'mining', 8);
  quests.onGather(id, 'foraging', -3);
  assert.equal(story.status(id).progress, 0);
  quests.onGather(id, 'foraging', 3);
  story.claim(id);
  assert.equal(story.status(id).progress, 0);
});

test('handover rechecks current inventory; sold items do not count and are consumed once', () => {
  const id = newPlayer();
  story.start(id);
  db.prepare('UPDATE player_story SET step=4 WHERE user_id=?').run(id);
  player.addItem(id, 'wolf_fang', 2);
  assert.equal(story.status(id).progress, 2);
  player.removeItem(id, 'wolf_fang', 1);
  assert.ok(story.claim(id).error);
  player.addItem(id, 'wolf_fang', 2);
  assert.ok(story.claim(id).step);
  assert.equal(player.getInventory(id).find(i => i.item_id === 'wolf_fang').qty, 1);
  assert.equal(story.status(id).step, 5);
  assert.ok(story.claim(id).error);
});

test('craft/cook hook advances preparation and ordinary/wrong elite kills cannot satisfy finale', () => {
  const id = newPlayer();
  story.start(id);
  db.prepare('UPDATE player_story SET step=5 WHERE user_id=?').run(id);
  quests.onCraft(id, 'food_fish_soup', 1);
  assert.equal(story.status(id).progress, 1);
  story.claim(id);
  quests.onKillMonster(id, 'elite_wolf'); // Kill event alone is not a boss event.
  quests.onKillBoss(id, 'elite_wolf', 0);
  quests.onKillBoss(id, 'elite_slime', 1);
  assert.equal(story.status(id).progress, 0);
  quests.onKillBoss(id, 'elite_wolf', 1);
  assert.equal(story.status(id).progress, 1);
});

test('entire story awards exact one-time rewards and never resets on migrate/start', () => {
  const id = newPlayer();
  const initialGold = player.getPlayer(id).gold;
  story.start(id);
  for (const step of story.STEPS) {
    assert.equal(story.status(id).current.id, step.id);
    eventFor(id, step);
    assert.equal(story.claim(id).step.id, step.id);
  }
  const finalPlayer = player.getPlayer(id);
  assert.equal(finalPlayer.gold, initialGold + 1120);
  const mark = player.getInventory(id).find(i => i.item_id === 'story_watchers_mark');
  assert.equal(mark.qty, 1);
  assert.equal(story.status(id).current, undefined);
  assert.ok(story.claim(id).error);
  assert.equal(story.start(id), false);
  story.migrate();
  assert.equal(story.status(id).step, story.STEPS.length);
  assert.deepEqual(player.getPlayer(id), finalPlayer);
  assert.equal(player.getInventory(id).find(i => i.item_id === mark.item_id).qty, 1);
});

test('failed reward rolls back currency, XP, progress and handed-over items atomically', () => {
  const id = newPlayer();
  story.start(id);
  db.prepare('UPDATE player_story SET step=4 WHERE user_id=?').run(id);
  player.addItem(id, 'wolf_fang', 2);
  const originalPlayer = player.getPlayer(id);
  const saved = player.addXpAndLevel;
  player.addXpAndLevel = () => { throw new Error('simulated reward failure'); };
  try { assert.throws(() => story.claim(id), /simulated/); }
  finally { player.addXpAndLevel = saved; }
  assert.equal(story.status(id).step, 4);
  assert.equal(story.status(id).progress, 2);
  assert.deepEqual(player.getPlayer(id), originalPlayer);
  assert.equal(player.getInventory(id).find(i => i.item_id === 'wolf_fang').qty, 2);
});

test('progress isolated between players; daily quests continue to update', () => {
  const a = newPlayer(), b = newPlayer();
  story.start(a); story.start(b);
  story.claim(a); story.claim(b);
  quests.createQuest({ id: 'story_test_daily', type: 'daily', name: 'Daily', objective: 'kill', target_id: 'slime', target_qty: 5 });
  quests.assignQuest(a, 'story_test_daily');
  quests.onKillMonster(a, 'slime');
  assert.equal(story.status(a).progress, 1);
  assert.equal(story.status(b).progress, 0);
  assert.equal(quests.getPlayerQuest(a, 'story_test_daily').progress, 1);
});

test('commands explain start, render progress and journal, and reject invalid action', async () => {
  const cmd = commands.get('story');
  const id = newPlayer();
  const msg = fakeMessage(id);
  const payloads = [];
  const reply = msg.reply;
  msg.reply = async payload => { payloads.push(payload); return reply(payload); };
  await cmd.execute(msg, []);
  assert.match(msg._text(), /story start/);
  await cmd.execute(msg, ['start']);
  assert.match(payloads.at(-1).embeds[0].data.description, /Ngọn đèn cuối phố/);
  await cmd.execute(msg, ['journal']);
  assert.match(msg._text(), /Sổ hành trình/);
  await cmd.execute(msg, ['not_valid']);
  assert.match(msg._text(), /story claim/);
  const missing = fakeMessage('NOT_REGISTERED');
  await cmd.execute(missing, []);
  assert.match(missing._text(), /start/);
});

test('story item sources and objectives exist; keepsake cannot be sold, traded or listed', async () => {
  for (const step of story.STEPS) {
    if (['kill', 'boss'].includes(step.kind)) assert.ok(db.prepare('SELECT 1 FROM monsters WHERE id=?').get(step.target));
    if (step.item) assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(step.item));
  }
  const id = newPlayer();
  player.addItem(id, 'story_watchers_mark', 1);
  const msg = fakeMessage(id);
  await commands.get('sell').execute(msg, ['story_watchers_mark']);
  assert.match(msg._text(), /soulbound/);
  assert.equal(player.getInventory(id).find(i => i.item_id === 'story_watchers_mark').qty, 1);
  const item = require('../src/game/items').getItem('story_watchers_mark');
  assert.equal(item.soulbound, 1);
  assert.equal(item.atk + item.def, 0);
});

test('admin character reset clears story even with SQLite foreign keys disabled', async () => {
  const id = newPlayer();
  story.start(id);
  story.claim(id);
  const msg = fakeMessage('RESET_ADMIN', { mention: { id, username: id } });
  await commands.get('admin').execute(msg, ['reset', `<@${id}>`]);
  assert.equal(story.status(id), null);
});

test('real hunt and craft commands feed story progress', async () => {
  const id = newPlayer();
  story.start(id);
  story.claim(id);
  player.updatePlayer(id, { atk: 100000, def: 100000, hp: 10000, max_hp: 10000 });
  const msg = fakeMessage(id);
  await commands.get('hunt').execute(msg, ['slime']);
  assert.equal(story.status(id).progress, 1);
  db.prepare('UPDATE player_story SET step=5, progress=0 WHERE user_id=?').run(id);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='craft' AND min_job_level=1 LIMIT 1").get();
  assert.ok(recipe);
  for (const input of JSON.parse(recipe.inputs)) player.addItem(id, input.item_id, input.qty);
  await commands.get('craft').execute(msg, [recipe.id]);
  assert.equal(story.status(id).progress, 1);
});

test('progress survives module/process restart and migrations on an existing DB', () => {
  const id = newPlayer();
  story.start(id);
  story.claim(id);
  quests.onKillMonster(id, 'slime');
  const { execFileSync } = require('node:child_process');
  const result = execFileSync(process.execPath, ['-e', `
    console.log = () => {};
    const story = require('./src/game/story');
    // Opening the existing database runs additive migrations again.
    const state = story.status(${JSON.stringify(id)});
    process.stdout.write(JSON.stringify({ step: state.step, progress: state.progress }));
  `], { cwd: require('./harness').ROOT, encoding: 'utf8', env: { ...process.env } });
  assert.deepEqual(JSON.parse(result), { step: 1, progress: 1 });
});

test('slash story action routes to the shared prefix handler', () => {
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'story');
  assert.ok(def);
  assert.equal(def.handler.cmdName, 'story');
  for (const action of ['start', 'claim', 'journal']) {
    assert.deepEqual(def.handler.extractArgs({ options: { getString: () => action } }), [action]);
  }
  assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'view' } }), []);
});
