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
    case 'item': if (!player.hasItem(user, step.target, step.qty)) player.addItem(user, step.target, step.qty); break;
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
  assert.equal(finalPlayer.gold, initialGold + story.STEPS.reduce((sum, step) => sum + step.gold, 0));
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

test('chapter 2 is appended at the old completion cursor without replaying rewards', () => {
  const oldIds = ['prologue_watch', 'prologue_tracks', 'prologue_supplies', 'chapter1_fangs', 'chapter1_offering', 'chapter1_prepare', 'chapter1_alpha', 'chapter1_return'];
  assert.deepEqual(story.STEPS.slice(0, 8).map(s => s.id), oldIds);
  assert.equal(story.STEPS.length, 28);
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=8,progress=0 WHERE user_id=?').run(id);
  const before = player.getPlayer(id);
  story.migrate(); story.migrate();
  assert.equal(story.start(id), false);
  assert.equal(story.status(id).current.id, 'chapter2_departure');
  assert.deepEqual(player.getPlayer(id), before);
  assert.equal(story.claim(id).step.id, 'chapter2_departure');
  assert.equal(player.getPlayer(id).gold, before.gold + 100);
});

test('chapter 2 exact rewards, unique keepsake and letter handover survive restart/migrations', () => {
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=8 WHERE user_id=?').run(id);
  player.addItem(id, 'story_watchers_mark', 1);
  const before = player.getPlayer(id);
  const steps = story.STEPS.slice(8, 18);
  assert.equal(steps.reduce((n, s) => n + s.gold, 0), 1830);
  assert.equal(steps.reduce((n, s) => n + s.xp, 0), 650);
  for (const step of steps) {
    eventFor(id, step);
    assert.equal(story.claim(id).step.id, step.id);
  }
  assert.equal(player.getPlayer(id).gold, before.gold + 1830);
  assert.ok(!player.hasItem(id, 'story_whitepost_letters', 1));
  assert.ok(player.hasItem(id, 'story_dawn_whistle', 1));
  assert.ok(player.hasItem(id, 'story_watchers_mark', 1));
  const end = player.getPlayer(id);
  story.migrate();
  assert.equal(story.status(id).current.id, 'chapter3_summons');
  assert.equal(story.start(id), false);
  assert.deepEqual(player.getPlayer(id), end);
  assert.equal(player.getInventory(id).find(i => i.item_id === 'story_dawn_whistle').qty, 1);
});

test('chapter 2 elite requires a matching win on the active step, not tower or old kills', () => {
  const id = newPlayer(); story.start(id);
  quests.onKillBoss(id, 'elite_whitepost_keeper', 1);
  db.prepare('UPDATE player_story SET step=14 WHERE user_id=?').run(id);
  assert.equal(story.status(id).current.id, 'chapter2_guardian');
  for (const [mob, tier] of [['elite_wolf', 1], ['tower_15', 2], ['elite_whitepost_keeper', 0]]) quests.onKillBoss(id, mob, tier);
  quests.onKillMonster(id, 'elite_whitepost_keeper');
  assert.equal(story.status(id).progress, 0);
  assert.ok(story.claim(id).error);
  quests.onKillBoss(id, 'elite_whitepost_keeper', 1);
  assert.equal(story.status(id).progress, 1);
  assert.equal(story.claim(id).step.id, 'chapter2_guardian');
});

test('chapter 2 letter handover rolls back completely if granting rewards fails', () => {
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=16 WHERE user_id=?').run(id);
  player.addItem(id, 'story_whitepost_letters', 1);
  const before = player.getPlayer(id);
  const saved = player.addXpAndLevel;
  player.addXpAndLevel = () => { throw new Error('chapter2 rollback'); };
  try { assert.throws(() => story.claim(id), /chapter2 rollback/); }
  finally { player.addXpAndLevel = saved; }
  assert.equal(story.status(id).current.id, 'chapter2_delivery');
  assert.ok(player.hasItem(id, 'story_whitepost_letters', 1));
  assert.deepEqual(player.getPlayer(id), before);
});

test('chapter 2 items are noncombat soulbound story-only rewards, not repeat drops or shop gear', async () => {
  const id = newPlayer();
  for (const itemId of ['story_whitepost_letters', 'story_dawn_whistle']) {
    const item = require('../src/game/items').getItem(itemId);
    assert.equal(item.soulbound, 1); assert.equal(item.sell, 0);
    assert.equal(item.atk + item.def, 0); assert.equal(item.type, 'material');
    assert.equal(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(itemId), undefined);
    assert.equal(db.prepare('SELECT 1 FROM monster_drops WHERE item_id=?').get(itemId), undefined);
    assert.equal(db.prepare('SELECT 1 FROM recipes WHERE output_id=?').get(itemId), undefined);
    player.addItem(id, itemId, 1);
    const msg = fakeMessage(id);
    await commands.get('sell').execute(msg, [itemId]);
    assert.match(msg._text(), /soulbound/);
    assert.ok(player.hasItem(id, itemId, 1));
    assert.ok(require('../src/game/handbook').lookup(db, itemId).sources.some(s => s.includes('Chương 2')));
  }
});

test('chapter 2 commands show availability, continuation, journal and honest completion', async () => {
  const id = newPlayer(), msg = fakeMessage(id), cmd = commands.get('story');
  await cmd.execute(msg, []);
  assert.match(msg._text(), /chương 2/);
  story.start(id);
  db.prepare('UPDATE player_story SET step=8 WHERE user_id=?').run(id);
  await cmd.execute(msg, []);
  assert.match(msg._text(), /Những lá thư dưới tuyết/);
  await cmd.execute(msg, ['journal']);
  assert.match(msg._text(), /Đèn cho người đi tới/);
  db.prepare('UPDATE player_story SET step=18 WHERE user_id=?').run(id);
  await cmd.execute(msg, []);
  assert.match(msg._text(), /Chương 3/);
  assert.match(msg._text(), /Mực chưa kịp khô/);
});

test('chapter 2 elite can be beaten by each class at recommended level using ordinary skills', () => {
  const audit = require('../tools/build_audit');
  const target = db.prepare("SELECT * FROM monsters WHERE id='elite_whitepost_keeper'").get();
  assert.equal(target.elite_tier, 1);
  for (const cls of audit.CLASSES) {
    quiet();
    let f;
    try { f = audit.makeFixture(db, cls, 18, 'neutral', `C2_BALANCE_${cls}`); }
    finally { loud(); }
    const ids = require('../src/game/skills').getSkillsForClass(cls).filter(s => !s.book && s.level <= 18).slice(0, 4).map(s => s.id);
    const result = audit.fight(audit.initial(f, target, ids), 'tactical');
    assert.equal(result.winner, 'a', `${cls}: ${JSON.stringify(result)}`);
    assert.ok(result.turns <= 12);
  }
});

test('real hunts of chapter 2 mobs deliver active kill and elite story events', async () => {
  for (const [cursor, mob] of [[9, 'rime_hound'], [14, 'elite_whitepost_keeper']]) {
    const id = newPlayer(); story.start(id);
    db.prepare('UPDATE player_story SET step=? WHERE user_id=?').run(cursor, id);
    player.updatePlayer(id, { level: 18, atk: 100000, def: 100000, hp: 10000, max_hp: 10000 });
    const msg = fakeMessage(id);
    await commands.get('hunt').execute(msg, [mob]);
    assert.equal(story.status(id).progress, 1, msg._text());
  }
});

test('chapter 3 appends after all 18 old cursors and resumes completed chapter 2 without reset', () => {
  const c2 = require('../src/game/story_chapter2').STEPS;
  assert.deepEqual(story.STEPS.slice(8, 18).map(s => s.id), c2.map(s => s.id));
  assert.equal(story.STEPS.length, 28);
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=18 WHERE user_id=?').run(id);
  const before = player.getPlayer(id);
  story.migrate(); story.migrate();
  assert.equal(story.status(id).current.id, 'chapter3_summons');
  assert.equal(story.start(id), false);
  assert.deepEqual(player.getPlayer(id), before);
  assert.equal(story.claim(id).step.id, 'chapter3_summons');
  assert.equal(player.getPlayer(id).gold, before.gold + 150);
});

test('chapter 3 is independently completable by multiple players with exact once-only rewards', () => {
  const steps = require('../src/game/story_chapter3').STEPS;
  assert.equal(steps.reduce((n, s) => n + s.gold, 0), 2180);
  assert.equal(steps.reduce((n, s) => n + s.xp, 0), 820);
  for (let n = 0; n < 2; n++) {
    const id = newPlayer(); story.start(id);
    db.prepare('UPDATE player_story SET step=18 WHERE user_id=?').run(id);
    player.addItem(id, 'story_watchers_mark', 1); player.addItem(id, 'story_dawn_whistle', 1);
    const before = player.getPlayer(id);
    for (const step of steps) {
      assert.equal(story.status(id).current.id, step.id);
      eventFor(id, step);
      assert.equal(story.claim(id).step.id, step.id);
    }
    assert.equal(player.getPlayer(id).gold, before.gold + 2180);
    assert.ok(!player.hasItem(id, 'story_ash_ledger', 1));
    assert.ok(player.hasItem(id, 'story_watchers_mark', 1));
    assert.ok(player.hasItem(id, 'story_dawn_whistle', 1));
    assert.equal(player.getInventory(id).find(i => i.item_id === 'story_witness_seal').qty, 1);
    const end = player.getPlayer(id);
    assert.equal(story.status(id).current, undefined);
    assert.ok(story.claim(id).error);
    story.migrate(); assert.equal(story.start(id), false);
    assert.deepEqual(player.getPlayer(id), end);
  }
});

test('chapter 3 ledger handover rechecks inventory and rolls back reward failures', () => {
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=25 WHERE user_id=?').run(id);
  assert.equal(story.status(id).current.id, 'chapter3_record');
  assert.ok(story.claim(id).error);
  player.addItem(id, 'story_ash_ledger', 1);
  const before = player.getPlayer(id), saved = player.addXpAndLevel;
  player.addXpAndLevel = () => { throw new Error('ledger rollback'); };
  try { assert.throws(() => story.claim(id), /ledger rollback/); }
  finally { player.addXpAndLevel = saved; }
  assert.deepEqual(player.getPlayer(id), before);
  assert.equal(story.status(id).current.id, 'chapter3_record');
  assert.ok(player.hasItem(id, 'story_ash_ledger', 1));
  assert.equal(story.claim(id).step.id, 'chapter3_record');
  assert.ok(!player.hasItem(id, 'story_ash_ledger', 1));
});

test('chapter 3 progression ignores old, wrong, ordinary and tower boss events', () => {
  const id = newPlayer(); story.start(id);
  quests.onKillBoss(id, 'boss_ash_registrar', 2);
  db.prepare('UPDATE player_story SET step=23 WHERE user_id=?').run(id);
  assert.equal(story.status(id).current.id, 'chapter3_warden');
  quests.onKillMonster(id, 'boss_ash_registrar');
  quests.onKillBoss(id, 'boss_ash_registrar', 0);
  quests.onKillBoss(id, 'elite_whitepost_keeper', 1);
  quests.onKillBoss(id, 'tower_15', 2);
  assert.equal(story.status(id).progress, 0);
  quests.onKillBoss(id, 'boss_ash_registrar', 2);
  assert.equal(story.claim(id).step.id, 'chapter3_warden');
});

test('chapter 3 story items remain soulbound noncombat and story-only', async () => {
  const id = newPlayer();
  for (const itemId of ['story_ash_ledger', 'story_witness_seal']) {
    const item = require('../src/game/items').getItem(itemId);
    assert.equal(item.soulbound, 1); assert.equal(item.sell, 0);
    assert.equal(item.type, 'material'); assert.equal(item.atk + item.def, 0);
    assert.equal(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(itemId), undefined);
    assert.equal(db.prepare('SELECT 1 FROM monster_drops WHERE item_id=?').get(itemId), undefined);
    assert.equal(db.prepare('SELECT 1 FROM recipes WHERE output_id=?').get(itemId), undefined);
    assert.ok(require('../src/game/handbook').lookup(db, itemId).sources.some(s => s.includes('Chương 3')));
    player.addItem(id, itemId, 1);
    const msg = fakeMessage(id);
    await commands.get('sell').execute(msg, [itemId]);
    assert.match(msg._text(), /soulbound/);
    assert.ok(player.hasItem(id, itemId, 1));
  }
});

test('chapter 3 completion makes the unreleased global boundary explicit and journal fits Discord', async () => {
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=28 WHERE user_id=?').run(id);
  const msg = fakeMessage(id);
  await commands.get('story').execute(msg, []);
  assert.match(msg._text(), /hết Chương 3/);
  assert.match(msg._text(), /toàn bộ người chơi bot/);
  assert.match(msg._text(), /chưa phát hành/);
  assert.match(msg._text(), /không giữ chỗ/);
  assert.ok(story.STEPS.every(s => !s.id.startsWith('chapter4')));
  const payloads = []; msg.reply = async p => { payloads.push(p); };
  await commands.get('story').execute(msg, ['journal']);
  assert.ok(payloads[0].embeds[0].data.description.length <= 4096);
  assert.match(payloads[0].embeds[0].data.description, /Lịch sử chưa có người viết/);
  for (const s of story.STEPS) assert.ok(s.text.length + s.title.length + 10 < 4096);
});

test('chapter 3 boss is beatable at Lv25 with baseline skills for each class', () => {
  const audit = require('../tools/build_audit');
  const target = db.prepare("SELECT * FROM monsters WHERE id='boss_ash_registrar'").get();
  assert.equal(target.elite_tier, 2);
  for (const cls of audit.CLASSES) {
    quiet(); let f;
    try { f = audit.makeFixture(db, cls, 25, 'neutral', `C3_BALANCE_${cls}`); }
    finally { loud(); }
    const ids = require('../src/game/skills').getSkillsForClass(cls).filter(s => !s.book && s.level <= 25).slice(0, 4).map(s => s.id);
    const b = audit.initial(f, target, ids);
    assert.equal(b.is_elite, 2);
    const result = audit.fight(b, 'tactical');
    assert.equal(result.winner, 'a', `${cls}: ${JSON.stringify(result)}`);
    assert.ok(result.turns <= 15);
  }
});

test('real chapter 3 hunts deliver story events for both new monsters', async () => {
  for (const [cursor, mob] of [[19, 'ash_moth'], [23, 'boss_ash_registrar']]) {
    const id = newPlayer(); story.start(id);
    db.prepare('UPDATE player_story SET step=? WHERE user_id=?').run(cursor, id);
    player.updatePlayer(id, { level: 25, atk: 100000, def: 100000, hp: 10000, max_hp: 10000 });
    const msg = fakeMessage(id);
    await commands.get('hunt').execute(msg, [mob]);
    assert.equal(story.status(id).progress, 1, msg._text());
  }
});

test('completed chapter 2 cursor survives a process restart and opens chapter 3 on the existing DB', () => {
  const id = newPlayer(); story.start(id);
  db.prepare('UPDATE player_story SET step=18,progress=0 WHERE user_id=?').run(id);
  const before = player.getPlayer(id);
  const { execFileSync } = require('node:child_process');
  const result = execFileSync(process.execPath, ['-e', `
    console.log = () => {};
    const story = require('./src/game/story');
    const state = story.status(${JSON.stringify(id)});
    process.stdout.write(JSON.stringify({ step: state.step, current: state.current.id,
      startedAgain: story.start(${JSON.stringify(id)}) }));
  `], { cwd: require('./harness').ROOT, encoding: 'utf8', env: { ...process.env } });
  assert.deepEqual(JSON.parse(result), { step: 18, current: 'chapter3_summons', startedAgain: false });
  assert.deepEqual(player.getPlayer(id), before);
});
