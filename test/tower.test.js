const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, tower, battle, player, ui, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); tower = require('../src/game/tower'); battle = require('../src/game/battle'); player = require('../src/game/player'); ui = require('../src/game/tower_ui'); commands = h.loadCommands(); h.loud(); });
function user(fields = {}) {
  const id = `TOWER_${++n}`; player.createPlayer(id, id);
  player.updatePlayer(id, { primary_class: 'melee', level: 45, atk: 1000000, hp: 7, ...fields });
  return id;
}
function start(id, floor) {
  const r = tower.start(id, floor, 'CHAN');
  assert.ok(!r.error, r.error);
  battle.updateBattle(r.battle.id, { message_id: 'MSG' });
  return battle.getBattle(r.battle.id);
}
function act(id, b, skill = 'attack') { return tower.act(id, b.id, b.round, skill, 'MSG', 'CHAN'); }
function click(id, b, overrides = {}) {
  const i = { customId: `tower:act:${b.id}:${b.round}:attack`, user: { id }, message: { id: 'MSG' }, channelId: 'CHAN',
    reply: async p => { i.response = p; i.method = 'reply'; }, update: async p => { i.response = p; i.method = 'update'; }, ...overrides };
  return i;
}
test('15 fixed floors, bosses each 5, no huntable tower monsters or equipment sources', () => {
  for (let i = 1; i <= 15; i++) {
    const f = tower.floorInfo(i); assert.equal(f.boss, i % 5 === 0);
    assert.ok(f.hp > 0 && f.atk > 0 && f.gold > 0);
  }
  assert.equal(tower.floorInfo(16), null);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM monsters WHERE id LIKE 'tower_%'").get().n, 0);
});
test('start uses full virtual HP and actual gear stats but never charges or alters character', () => {
  const id = user({ hp: 0 }); const before = player.getPlayer(id);
  const stats = player.getEffectiveStats(before);
  const b = start(id);
  assert.equal(b.hp_a, stats.max_hp); assert.equal(b.atk_a, stats.atk); assert.equal(b.def_a, stats.def);
  assert.equal(b.mode, 'tower'); assert.deepEqual(player.getPlayer(id), before);
  assert.equal(tower.run(b.id).class_id, 'melee');
  assert.equal(tower.start(id, 2, 'CHAN').battle.id, b.id);
});
test('locked/invalid floors, class requirement and active PvE/PvP block entry', () => {
  const id = user();
  for (const floor of [0, 2, 16, 1.5, NaN]) assert.ok(tower.start(id, floor, 'CHAN').error);
  const noClass = user({ primary_class: '' }); assert.ok(tower.start(noClass, 1, 'CHAN').error);
  const other = user(); const b = start(other);
  battle.updateBattle(b.id, { mode: 'pvp', user_b: id });
  assert.ok(tower.start(id, 1, 'CHAN').error);
});
test('full climb rewards once per floor, milestone badges, replay cannot farm rewards or change real HP', () => {
  const id = user(); const before = player.getPlayer(id); let total = 0;
  for (let floor = 1; floor <= 15; floor++) {
    const b = start(id); const result = act(id, b);
    assert.equal(result.battle.winner, 'a'); assert.equal(tower.progress(id).highest, floor);
    assert.equal(result.reward.gold, tower.floorInfo(floor).gold);
    total += result.reward.gold;
    if (floor % 5 === 0) assert.equal(result.reward.badge, tower.BADGES[floor]);
    assert.equal(tower.settle(b.id).gold, 0);
    assert.ok(act(id, b).error);
  }
  const replay = start(id, 5); assert.equal(act(id, replay).reward.gold, 0);
  const after = player.getPlayer(id);
  assert.equal(after.gold, before.gold + total); assert.equal(after.hp, before.hp); assert.equal(after.xp, before.xp);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tower_rewards WHERE user_id=?').get(id).n, 15);
});
test('loss and successful flee preserve character and progress and permit free retry', () => {
  const id = user({ atk: 1 }); const before = player.getPlayer(id);
  let b = start(id); battle.updateBattle(b.id, { hp_a: 1, atk_b: 99999 }); b = battle.getBattle(b.id);
  assert.equal(act(id, b).battle.winner, 'b'); assert.equal(tower.progress(id).highest, 0);
  b = start(id); const old = Math.random;
  try { Math.random = () => 0; assert.equal(act(id, b, 'flee').battle.winner, 'flee_a'); } finally { Math.random = old; }
  assert.deepEqual(player.getPlayer(id), before); assert.equal(tower.progress(id).highest, 0);
  assert.ok(start(id));
});
test('expired runs release active lock without rewards and survive idempotent migration', () => {
  const id = user(); const b = start(id);
  battle.updateBattle(b.id, { updated_at: 1 }); // updateBattle overwrites timestamps; age explicitly.
  db.prepare('UPDATE battles SET updated_at=1 WHERE id=?').run(b.id);
  assert.equal(tower.active(id), null); assert.equal(battle.getBattle(b.id).status, 'timeout');
  assert.equal(tower.settle(b.id).gold, 0); tower.migrate();
  assert.equal(tower.run(b.id).settled, 1); assert.ok(start(id));
});
test('owner, stale round, class, boss-only skills, panel and channel are validated before mutation', () => {
  const id = user({ atk: 1 }); const b = start(id);
  assert.ok(act('OTHER', b).error);
  assert.ok(tower.act(id, b.id, b.round, 'attack', 'OLD', 'CHAN').error);
  assert.ok(tower.act(id, b.id, b.round, 'attack', 'MSG', 'OTHER').error);
  for (const skill of ['rage', 'roar', 'fireball', 'missing']) assert.ok(act(id, b, skill).error);
  assert.deepEqual(battle.getBattle(b.id), b);
  const result = act(id, b); assert.ok(!result.error);
  const snapshot = battle.getBattle(b.id); assert.ok(act(id, b).error);
  assert.deepEqual(battle.getBattle(b.id), snapshot);
  player.updatePlayer(id, { primary_class: 'magic' });
  assert.ok(act(id, snapshot, 'fireball').error); // snapshot class remains melee
});
test('action and first-clear reward roll back together on storage failure', () => {
  const id = user(); const b = start(id); const gold = player.getPlayer(id).gold;
  db.exec(`CREATE TRIGGER fail_tower_reward BEFORE INSERT ON tower_rewards BEGIN SELECT RAISE(ABORT,'reward failure'); END;`);
  try { assert.throws(() => act(id, b), /reward failure/); } finally { db.exec('DROP TRIGGER fail_tower_reward'); }
  assert.deepEqual(battle.getBattle(b.id), b); assert.equal(tower.run(b.id).settled, 0);
  assert.equal(player.getPlayer(id).gold, gold); assert.equal(tower.progress(id).highest, 0);
  assert.ok(act(id, b).reward.gold > 0);
});
test('button routing finishes tower without generic PvE loot and rejects generic battle buttons', async () => {
  const id = user(); const b = start(id);
  const generic = click(id, b, { customId: `bt:act:${b.id}:attack` });
  await require('../src/buttons').handle(generic); assert.match(generic.response.content, /tower/);
  assert.equal(battle.getBattle(b.id).status, 'active');
  const i = click(id, b); await require('../src/buttons').handle(i);
  assert.equal(i.method, 'update'); assert.equal(i.response.components.length, 0);
  const duplicate = click(id, b); await ui.handle(duplicate); assert.equal(duplicate.response.ephemeral, true);
  const stranger = click('OTHER', b); await ui.handle(stranger); assert.equal(stranger.response.ephemeral, true);
});
test('UI round tokens, fields and buttons respect Discord limits', () => {
  const id = user(); const b = start(id); const view = ui.render(b);
  for (const field of view.embeds[0].data.fields) assert.ok(field.value.length <= 1024);
  for (const row of view.components) for (const button of row.components) {
    assert.ok(button.data.custom_id.startsWith(`tower:act:${b.id}:${b.round}:`));
    assert.ok(button.data.custom_id.length <= 100);
  }
});
test('command status resumes stored run; leave is safe, keeps real HP and unlocks retry', async () => {
  const id = user({ atk: 1 }); const b = start(id); const msg = h.fakeMessage(id);
  await commands.get('tower').execute(msg, []);
  assert.equal(battle.getBattle(b.id).message_id, 'REPLY1');
  const before = player.getPlayer(id);
  await commands.get('tower').execute(msg, ['leave']);
  assert.equal(battle.getBattle(b.id).status, 'ended'); assert.equal(tower.run(b.id).settled, 1);
  assert.deepEqual(player.getPlayer(id), before); assert.equal(tower.progress(id).highest, 0);
});
test('leaderboard uses highest floor then earliest reach; progress survives migrate', () => {
  const id = user(); act(id, start(id)); const before = tower.progress(id);
  tower.migrate(); assert.deepEqual(tower.progress(id), before);
  const rows = tower.top(); assert.ok(rows.length <= 10); assert.ok(rows[0].highest >= rows.at(-1).highest);
});
test('all three classes can clear every floor at recommended full-gear baseline with class skills', () => {
  const sim = require('./balance_sim');
  const skills = require('../src/game/skills');
  for (const cls of ['melee', 'magic', 'ranged']) for (let floor = 1; floor <= 15; floor++) {
    const info = tower.floorInfo(floor), stats = sim.playerAt(info.level, cls);
    // Baseline fixture already contains full gear totals, so do not equip twice.
    const id = user({ primary_class: cls, level: info.level, hp: stats.hp, max_hp: stats.hp, atk: stats.atk, def: stats.def });
    db.prepare('INSERT INTO tower_progress(user_id,highest) VALUES (?,?)').run(id, floor - 1);
    let b = start(id, floor);
    for (let turn = 0; turn < 120 && b.status === 'active'; turn++) {
      const cooldowns = JSON.parse(b.cooldowns_a);
      const score = skill => {
        const r = skill.resolve({ atk: b.atk_a, hp: b.hp_a, max_hp: b.max_hp_a }, { def: b.def_b, atk: b.atk_b });
        return (skill.id === 'heal' && b.hp_a < b.max_hp_a * 0.65 ? 9999 : 0) + (r.dmg || 0)
          + (r.applyBuff?.key === 'burn' ? 20 : 0) + (['stun', 'freeze'].includes(r.applyBuff?.key) ? b.atk_b : 0);
      };
      const skill = skills.getSkillsForClass(cls).filter(s => !cooldowns[s.id]).sort((a, z) => score(z) - score(a))[0];
      const result = act(id, b, skill?.id || 'attack');
      assert.ok(!result.error, result.error); b = result.battle;
    }
    assert.equal(b.winner, 'a', `${cls} floor ${floor} at Lv.${info.level}`);
  }
});
test('round limit ends in draw without farming and lets player retry', () => {
  const id = user({ atk: 1 }); let b = start(id);
  battle.updateBattle(b.id, { round: 239, atk_b: 1, hp_b: 999999 });
  b = battle.getBattle(b.id); const before = player.getPlayer(id);
  const result = act(id, b, 'defend');
  assert.equal(result.battle.winner, 'draw'); assert.equal(result.reward.gold, 0);
  assert.deepEqual(player.getPlayer(id), before); assert.ok(start(id));
});
test('slash schema registers tower with bounded floor and correct command arguments', () => {
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'tower');
  assert.ok(def); const schema = def.data.toJSON();
  assert.equal(schema.options.find(o => o.name === 'floor').min_value, 1);
  assert.equal(schema.options.find(o => o.name === 'floor').max_value, 15);
  assert.deepEqual(def.handler.extractArgs({ options: { getString: () => 'start', getInteger: () => 5 } }), ['start', '5']);
});
