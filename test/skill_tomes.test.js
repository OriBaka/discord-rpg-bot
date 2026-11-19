const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, tomes, skills, builds, player, commands, battle, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); tomes = require('../src/game/skill_tomes'); skills = require('../src/game/skills'); builds = require('../src/game/skill_builds'); player = require('../src/game/player'); battle = require('../src/game/battle'); commands = h.loadCommands(); h.loud(); });
function user(cls = 'melee', level = 45) { const id = `TOME_${++n}`; player.createPlayer(id, id); player.updatePlayer(id, { primary_class: cls, level, gold: 10000 }); return id; }
function count(id, item) { return db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(id, item)?.qty || 0; }
function teach(id, skill) { player.addItem(id, tomes.bookId(skill)); const result = tomes.learn(id, tomes.bookId(skill)); assert.ok(!result.error, result.error); }
function create(guild = 'G', id = `EVENT_${++n}`, skill = 'lantern_oath', max = 2, now = 1000) { assert.ok(tomes.createEvent(guild, id, skill, 1, max, 'ADMIN', now).ok); return id; }
test('15 acquired skills cover all classes and five level/source bands without auto-opening limited events', () => {
  assert.equal(tomes.catalog().length, 15); assert.equal(Object.keys(skills.SKILLS).length, 33);
  for (const cls of ['melee', 'magic', 'ranged']) {
    const list = tomes.catalog().filter(s => s.class === cls);
    assert.deepEqual(list.map(s => s.level), [8, 18, 30, 40, 45]);
    assert.deepEqual(list.map(s => s.source.kind), ['quest', 'shop', 'hunt', 'boss', 'event']);
  }
  assert.equal(db.prepare('SELECT COUNT(*) n FROM skill_events').get().n, 0);
});
test('every book has an exact real source; dormant limited templates have no permanent source', () => {
  for (const s of tomes.catalog()) {
    const item = db.prepare('SELECT * FROM items WHERE id=?').get(tomes.bookId(s.id));
    assert.ok(item); assert.equal(item.type, 'consumable'); assert.equal(item.class_req, s.class); assert.equal(item.min_level, s.level);
    const shop = db.prepare('SELECT * FROM shop WHERE item_id=?').get(item.id);
    const drops = db.prepare('SELECT * FROM monster_drops WHERE item_id=?').all(item.id);
    const quest = db.prepare('SELECT * FROM quests WHERE id=?').get(`study_${s.id}`);
    if (s.source.kind === 'shop') assert.equal(shop.price, 1800); else assert.ok(!shop);
    if (['hunt', 'boss'].includes(s.source.kind)) {
      assert.equal(drops.length, 1); assert.equal(drops[0].chance, s.source.chance); assert.equal(drops[0].monster_id, s.source.mob);
      assert.ok(db.prepare('SELECT 1 FROM monsters WHERE id=?').get(s.source.mob));
    } else assert.equal(drops.length, 0);
    if (s.source.kind === 'quest') { assert.equal(quest.type, 'custom'); assert.equal(quest.reward_item, `${item.id}:1`); } else assert.ok(!quest);
    assert.equal(item.soulbound, s.source.kind === 'event' ? 1 : 0);
  }
});
test('only learned acquired skills enter allowed loadouts; level/class checks never consume books', () => {
  const id = user('melee', 1), book = 'tome_riposte_cut'; player.addItem(id, book, 2);
  assert.ok(tomes.learn(id, book).error); assert.equal(count(id, book), 2);
  player.updatePlayer(id, { level: 45, primary_class: 'magic' });
  assert.ok(tomes.learn(id, book).error); assert.equal(count(id, book), 2);
  player.updatePlayer(id, { primary_class: 'melee' });
  assert.ok(builds.set(id, 'melee', 45, ['riposte_cut']).error);
  assert.ok(tomes.learn(id, book).skill); assert.equal(count(id, book), 1);
  assert.ok(!builds.set(id, 'melee', 45, ['slash', 'riposte_cut']).error);
  assert.ok(tomes.learn(id, book).error); assert.equal(count(id, book), 1);
  assert.ok(builds.set(id, 'melee', 1, ['riposte_cut']).error);
  builds.reset(id, 'melee'); assert.ok(tomes.knows(id, 'riposte_cut'));
});
test('learning is atomic with inventory consumption and persistent across migration', () => {
  const id = user(), book = 'tome_blood_rend'; player.addItem(id, book);
  db.exec("CREATE TRIGGER fail_tome BEFORE INSERT ON learned_skills BEGIN SELECT RAISE(ABORT,'learning failure'); END;");
  try { assert.throws(() => tomes.learn(id, book), /learning failure/); } finally { db.exec('DROP TRIGGER fail_tome'); }
  assert.equal(count(id, book), 1); assert.ok(!tomes.knows(id, 'blood_rend'));
  assert.ok(tomes.learn(id, book).skill); tomes.migrate(); assert.ok(tomes.knows(id, 'blood_rend')); assert.equal(count(id, book), 0);
  assert.ok(tomes.learn(user(), book).error);
});
test('quest accept -> kill -> claim -> use -> equip works with no duplicate quest rewards', async () => {
  const id = user('ranged', 8), msg = h.fakeMessage(id), quest = 'study_tracking_arrow', book = 'tome_tracking_arrow';
  await commands.get('quest').execute(msg, ['accept', quest]);
  const q = require('../src/game/quests'); for (let i = 0; i < 5; i++) q.onKillMonster(id, 'wolf');
  await commands.get('quest').execute(msg, ['claim', quest]); assert.equal(count(id, book), 1);
  await commands.get('quest').execute(msg, ['claim', quest]); assert.equal(count(id, book), 1);
  const hp = player.getPlayer(id).hp; await commands.get('use').execute(msg, [book]);
  assert.ok(tomes.knows(id, 'tracking_arrow')); assert.equal(count(id, book), 0); assert.equal(player.getPlayer(id).hp, hp);
  await commands.get('skills').execute(msg, ['equip', 'tracking_arrow', 'aimed_shot']);
  assert.deepEqual(builds.get(id, 'ranged', 8), ['tracking_arrow', 'aimed_shot']);
});
test('shop book purchases and use obey price, one-book learning and no accidental healing', async () => {
  const id = user('magic', 18), msg = h.fakeMessage(id), book = 'tome_purifying_light';
  await commands.get('buy').execute(msg, [book]); assert.equal(count(id, book), 1); assert.equal(player.getPlayer(id).gold, 8200);
  player.addItem(id, book); await commands.get('use').execute(msg, [book, '2']); assert.equal(count(id, book), 2);
  await commands.get('use').execute(msg, [book]); assert.ok(tomes.knows(id, 'purifying_light')); assert.equal(count(id, book), 1);
  await commands.get('use').execute(msg, [book]); assert.equal(count(id, book), 1);
});
test('hunt/boss books are delivered by standard loot rolls with no class bias', () => {
  const old = Math.random; const { getMonster } = require('../src/game/monsters');
  try {
    Math.random = () => 0;
    for (const s of tomes.catalog().filter(s => ['hunt', 'boss'].includes(s.source.kind))) {
      const loot = require('../src/game/combat').rollLoot(getMonster(s.source.mob));
      assert.ok(loot.items.some(i => i.item_id === tomes.bookId(s.id)));
    }
  } finally { Math.random = old; }
});
test('limited events validate templates, time/cap and never reset reused IDs', () => {
  for (const [skill, hours, cap] of [['slash', 1, 2], ['blood_rend', 1, 2], ['lantern_oath', 0, 2], ['lantern_oath', 721, 2], ['lantern_oath', 1, 0]]) assert.ok(tomes.createEvent('G', `BAD_${++n}`, skill, hours, cap, 'A').error);
  const e = create(); assert.ok(tomes.createEvent('G', e, 'lantern_oath', 1, 2, 'A').error);
  tomes.closeEvent('G', e); assert.ok(tomes.createEvent('G', e, 'lantern_oath', 1, 2, 'A').error);
});
test('limited claim enforces server, class, duplicate, expiry and total quota atomically', () => {
  const e = create('LOCAL', undefined, 'lantern_oath', 1), id = user('melee', 1);
  assert.ok(tomes.claimEvent('OTHER', e, id, 2000).error);
  assert.ok(tomes.claimEvent('LOCAL', e, user('magic'), 2000).error);
  assert.ok(tomes.claimEvent('LOCAL', e, id, 3601000).error);
  assert.ok(tomes.claimEvent('LOCAL', e, id, 2000).item); assert.equal(count(id, 'tome_lantern_oath'), 1);
  assert.ok(tomes.claimEvent('LOCAL', e, id, 2000).error);
  assert.ok(tomes.claimEvent('LOCAL', e, user(), 2000).error);
  assert.equal(tomes.events('LOCAL').find(x => x.id === e).claims, 1);
  assert.ok(tomes.learn(id, 'tome_lantern_oath').error); assert.equal(count(id, 'tome_lantern_oath'), 1);
  tomes.closeEvent('LOCAL', e); player.updatePlayer(id, { level: 45 });
  assert.ok(tomes.learn(id, 'tome_lantern_oath').skill); // expiration/closure doesn't revoke a collected book
});
test('failed event reward delivery rolls back both claim marker and last quota slot', () => {
  const e = create('ROLLBACK', undefined, 'lantern_oath', 1), id = user(), old = player.addItem;
  player.addItem = () => { throw new Error('delivery failure'); };
  try { assert.throws(() => tomes.claimEvent('ROLLBACK', e, id, 2000), /delivery failure/); } finally { player.addItem = old; }
  assert.equal(tomes.events('ROLLBACK')[0].claims, 0);
  assert.ok(tomes.claimEvent('ROLLBACK', e, id, 2000).item);
});
test('admin-only event commands enforce privileges, guild scope and public listing/claim', async () => {
  const admin = user('magic'), plain = h.fakeMessage(admin, { admin: false });
  await commands.get('skills').execute(plain, ['event', 'create', 'ui', 'festival_flare', '24', '2']); assert.match(plain._text(), /Chỉ admin/);
  const msg = h.fakeMessage(admin); await commands.get('skills').execute(msg, ['event', 'create', 'ui', 'festival_flare', '24', '2']);
  const learner = user('magic'), publicMsg = h.fakeMessage(learner, { admin: false });
  await commands.get('skills').execute(publicMsg, ['events']); assert.match(publicMsg._text(), /festival_flare/);
  await commands.get('skills').execute(publicMsg, ['claim', 'ui']); assert.equal(count(learner, 'tome_festival_flare'), 1);
  await commands.get('skills').execute(publicMsg, ['event', 'close', 'ui']); assert.match(publicMsg._text(), /Chỉ admin/);
});
test('book ownership alone cannot inject a skill into a battle; learning applies only to future snapshots', () => {
  const id = user(), data = { mode: 'pve', user_a: id, channel_id: 'C', hp_a: 1000, max_hp_a: 1000, hp_b: 10000, max_hp_b: 10000, atk_a: 100, atk_b: 10, def_a: 100, def_b: 100 };
  const oldId = battle.createBattle(data); teach(id, 'blood_rend'); builds.set(id, 'melee', 45, ['blood_rend']);
  assert.ok(battle.processAction(battle.getBattle(oldId), 'a', 'blood_rend').error);
  const next = battle.createBattle(data); assert.ok(!battle.processAction(battle.getBattle(next), 'a', 'blood_rend').error);
  assert.ok(JSON.parse(battle.getBattle(next).buffs_b).bleed);
});
test('all acquired skills are valid in real snapshotted turns after legitimate learning', () => {
  for (const s of tomes.catalog()) {
    const id = user(s.class); teach(id, s.id); assert.ok(!builds.set(id, s.class, 45, [s.id]).error);
    const bid = battle.createBattle({ mode: 'pve', user_a: id, channel_id: 'C', hp_a: 500, max_hp_a: 1000, hp_b: 10000, max_hp_b: 10000, atk_a: 100, atk_b: 10, def_a: 100, def_b: 100 });
    const result = battle.processAction(battle.getBattle(bid), 'a', s.id); assert.ok(!result.error, `${s.id}: ${result.error}`);
    const b = battle.getBattle(bid); assert.ok(b.energy_a >= 0 && b.energy_a <= 100); assert.equal(b.turn, 'b');
  }
});
test('handbook/skills expose sources and book usage without automatically learning or claiming', async () => {
  const id = user(), msg = h.fakeMessage(id), before = builds.get(id, 'melee', 45);
  await commands.get('skills').execute(msg, []); await commands.get('skills').execute(msg, ['info', 'lantern_oath']);
  assert.match(msg._text(), /CHƯA HỌC/); assert.match(msg._text(), /limited/);
  for (const s of tomes.catalog()) {
    const found = require('../src/game/handbook').lookup(db, tomes.bookId(s.id));
    assert.ok(found.sources.length); assert.ok(found.uses.some(x => x.includes(`use ${tomes.bookId(s.id)}`)));
  }
  assert.deepEqual(builds.get(id, 'melee', 45), before);
  for (const payload of msg._out) assert.ok(payload.length < 6000);
});
