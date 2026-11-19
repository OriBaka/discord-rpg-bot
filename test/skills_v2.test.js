const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, battle, player, builds, skills, cmds, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); battle = require('../src/game/battle'); player = require('../src/game/player'); builds = require('../src/game/skill_builds'); skills = require('../src/game/skills'); cmds = h.loadCommands(); h.loud(); });
function user(cls = 'melee', level = 45) { const id = `SKILLS_${++n}`; player.createPlayer(id, id); player.updatePlayer(id, { level, primary_class: cls }); return id; }
function fight(cls = 'melee', ids, fields = {}) {
  const id = user(cls); if (ids) assert.ok(!builds.set(id, cls, 45, ids).error);
  const bid = battle.createBattle({ user_a: id, mode: 'pve', channel_id: 'C', hp_a: 1000, max_hp_a: 1000, hp_b: 10000, max_hp_b: 10000, atk_a: 100, def_a: 100, atk_b: 100, def_b: 100, ...fields });
  battle.setMessageId(bid, 'M'); return battle.getBattle(bid);
}
function action(b, sk, actor = 'a') { const result = battle.processAction(battle.getBattle(b.id), actor, sk); assert.ok(!result.error, result.error); return battle.getBattle(b.id); }
function enemy(b) { return action(b, 'attack', 'b'); }
function effects(b, side = 'a') { return JSON.parse(b['buffs_' + side]); }
test('base and acquired catalog skills have scaling roles, consistent finite damage and documented unlocks/costs', () => {
  assert.equal(Object.keys(skills.SKILLS).length, 33);
  for (const cls of ['melee', 'magic', 'ranged']) {
    assert.equal(skills.getSkillsForClass(cls).filter(s => !s.book).length, 6);
    assert.equal(builds.unlocked(cls, 1).length, 3);
    assert.equal(builds.unlocked(cls, 12).length, 4);
    assert.equal(builds.unlocked(cls, 25).length, 5);
    assert.equal(builds.unlocked(cls, 40).length, 6);
  }
  for (const s of Object.values(skills.SKILLS)) {
    assert.ok(s.desc && s.cost >= 0 && s.cost <= 40 && s.cd >= 0);
    const result = s.resolve({ atk: 100, max_hp: 1000, hp: 400, buffs: {} }, { def: 100000, max_hp: 1000, hp: 500, buffs: {} });
    assert.ok(Number.isFinite(result.dmg || result.heal || 0));
  }
  assert.equal(skills.getSkill('__proto__'), null);
  assert.ok(skills.SKILLS.fireball.resolve({ atk: 200 }, { def: 20 }).applyBuff.value > skills.SKILLS.fireball.resolve({ atk: 100 }, { def: 20 }).applyBuff.value);
});
test('loadouts are free, per class, persistent, reject locked/duplicate/foreign skills and cap at four', () => {
  const id = user('melee', 1), before = player.getPlayer(id);
  for (const ids of [[], ['execute'], ['slash', 'slash'], ['fireball'], Object.keys(skills.SKILLS).slice(0, 5)]) assert.ok(builds.set(id, 'melee', 1, ids).error);
  assert.ok(!builds.set(id, 'melee', 1, ['charge', 'slash']).error);
  assert.deepEqual(builds.get(id, 'melee', 1), ['charge', 'slash']);
  assert.ok(!builds.set(id, 'magic', 45, ['meteor']).error);
  builds.migrate(); assert.deepEqual(builds.get(id, 'melee', 1), ['charge', 'slash']);
  assert.deepEqual(player.getPlayer(id), before);
  builds.reset(id, 'melee'); assert.equal(builds.get(id, 'melee', 1).length, 3);
});
test('battle snapshots class/loadout; later level, class and build changes cannot inject skills', () => {
  const b = fight('melee', ['slash', 'whirlwind']);
  builds.set(b.user_a, 'melee', 45, ['execute']); player.updatePlayer(b.user_a, { primary_class: 'magic' });
  assert.ok(battle.processAction(b, 'a', 'execute').error);
  assert.ok(battle.processAction(b, 'a', 'fireball').error);
  assert.ok(battle.processAction(b, 'a', 'rage').error);
  assert.ok(battle.processAction(b, 'b', 'slash').error);
  assert.equal(action(b, 'slash').turn, 'b');
});
test('energy is bounded, invalid casts are free, attack/defend replenish and resources survive migrate', () => {
  let b = fight(); battle.updateBattle(b.id, { energy_a: 0 }); b = battle.getBattle(b.id);
  assert.ok(battle.processAction(b, 'a', 'charge').error); assert.deepEqual(battle.getBattle(b.id), b);
  b = action(b, 'defend'); assert.equal(b.energy_a, 26);
  b = enemy(b); b = action(b, 'whirlwind'); assert.equal(b.energy_a, 9);
  b = enemy(b); b = action(b, 'attack'); assert.equal(b.energy_a, 35);
  battle.updateBattle(b.id, { energy_a: 99 }); b = enemy(b); b = action(b, 'attack'); assert.equal(b.energy_a, 100);
  h.quiet(); battle.migrate(); h.loud(); assert.equal(battle.getBattle(b.id).energy_a, 100);
});
test('cooldowns only decrease on owner turns, including stun skips, and block recasting', () => {
  let b = fight(); b = action(b, 'whirlwind'); assert.equal(JSON.parse(b.cooldowns_a).whirlwind, 3);
  b = enemy(b); assert.equal(JSON.parse(b.cooldowns_a).whirlwind, 3);
  assert.ok(battle.processAction(b, 'a', 'whirlwind').error);
  battle.updateBattle(b.id, { buffs_a: JSON.stringify({ stun: { turns: 1 } }) });
  b = action(b, 'attack'); assert.equal(JSON.parse(b.cooldowns_a).whirlwind, 2);
  b = enemy(b); b = action(b, 'attack'); assert.equal(JSON.parse(b.cooldowns_a).whirlwind, 1);
  b = enemy(b); b = action(b, 'attack'); assert.equal(JSON.parse(b.cooldowns_a).whirlwind, undefined);
  b = enemy(b); assert.ok(!battle.processAction(b, 'a', 'whirlwind').error);
});
test('defend survives the enemy action, blocks direct damage but not DoT and expires on owner turn', () => {
  let b = fight(); const raw = skills.mitigated(b.atk_b, b.def_a);
  b = action(b, 'defend'); assert.equal(effects(b).defend.turns, 1);
  b = enemy(b); assert.equal(b.hp_a, 1000 - Math.floor(raw * 0.5)); assert.ok(effects(b).defend);
  battle.updateBattle(b.id, { buffs_a: JSON.stringify({ ...effects(b), burn: { turns: 2, value: 13 } }) });
  b = action(b, 'attack'); assert.equal(b.hp_a, 1000 - Math.floor(raw * 0.5) - 13); assert.ok(!effects(b).defend);
  b = enemy(b); assert.equal(b.hp_a, 1000 - Math.floor(raw * 0.5) - 13 - raw);
});
test('burn ticks once per affected owner turn, never on caster action; lethal DoT prevents healing', () => {
  let b = fight('magic'); b = action(b, 'fireball'); const dot = effects(b, 'b').burn.value;
  const hit = b.hp_b; b = enemy(b); assert.equal(b.hp_b, hit - dot); assert.equal(effects(b, 'b').burn.turns, 2);
  b = action(b, 'defend'); assert.equal(b.hp_b, hit - dot);
  b = enemy(b); assert.equal(b.hp_b, hit - 2 * dot);
  battle.updateBattle(b.id, { hp_a: 5, buffs_a: JSON.stringify({ burn: { turns: 2, value: 10 } }) });
  b = action(b, 'heal'); assert.equal(b.status, 'ended'); assert.equal(b.winner, 'b'); assert.equal(b.hp_a, 0);
});
test('combo consumes real momentum/mark/burn and cannot be collected twice', () => {
  for (const [cls, setup, finisher, key] of [['melee', 'slash', 'whirlwind', 'momentum'], ['magic', 'fireball', 'arcane_burst', 'burn'], ['ranged', 'trap', 'aimed_shot', 'mark']]) {
    let b = fight(cls, [setup, finisher]); b = action(b, setup); b = enemy(b);
    const before = b.hp_b; b = action(b, finisher);
    assert.match(b.last_log, /COMBO/);
    assert.ok(!effects(b, key === 'momentum' ? 'a' : 'b')[key]);
    const raw = skills.getSkill(finisher).resolve({ atk: 100, buffs: {} }, { def: skills.effectiveDef(100, effects(b, 'b')), hp: 5000, max_hp: 10000, buffs: {} }).dmg;
    assert.ok(before - b.hp_b > raw);
  }
});
test('CC skips exactly one turn and gives cross-type immunity for one owner turn', () => {
  let b = fight(); b = action(b, 'charge');
  const hp = b.hp_a; b = enemy(b); assert.equal(b.hp_a, hp); assert.ok(effects(b, 'b').control_guard);
  // Grant a second CC to test immunity independent of cooldown enforcement.
  battle.updateBattle(b.id, { cooldowns_a: '{}', energy_a: 100 });
  b = action(b, 'charge'); assert.ok(!effects(b, 'b').stun); assert.match(b.last_log, /kháng/);
  b = enemy(b); assert.ok(b.hp_a < hp); assert.ok(!effects(b, 'b').control_guard);
});
test('cleanse removes harmful effects but preserves buffs, and cannot cast out of hard CC', () => {
  let b = fight('magic'); battle.updateBattle(b.id, { hp_a: 500, buffs_a: JSON.stringify({ atk_down: { turns: 3, value: 0.3 }, burn: { turns: 3, value: 5 }, atk_up: { turns: 3, value: 0.2 } }) });
  b = action(b, 'heal'); assert.ok(!effects(b).atk_down && !effects(b).burn); assert.ok(effects(b).atk_up); assert.equal(b.hp_a, 745);
  b = enemy(b); battle.updateBattle(b.id, { cooldowns_a: '{}', buffs_a: JSON.stringify({ freeze: { turns: 1 } }) });
  const hp = b.hp_a; b = action(b, 'heal'); assert.equal(b.hp_a, hp); assert.equal(JSON.parse(b.cooldowns_a).heal, undefined);
});
test('repeat/stale/finished or wrong-side actions never spend twice and rollback on update failure', () => {
  const b = fight(); action(b, 'slash'); const after = battle.getBattle(b.id);
  assert.ok(battle.processAction(b, 'a', 'slash').error); assert.deepEqual(battle.getBattle(b.id), after);
  let c = fight();
  db.exec(`CREATE TRIGGER fail_skill_turn BEFORE UPDATE ON battles WHEN NEW.id=${c.id} BEGIN SELECT RAISE(ABORT,'turn failure'); END;`);
  try { assert.throws(() => action(c, 'slash'), /turn failure/); } finally { db.exec('DROP TRIGGER fail_skill_turn'); }
  assert.deepEqual(battle.getBattle(c.id), c);
});
test('legacy rows retain old catalog/energy rules through schema migration', () => {
  let b = fight('ranged'); battle.updateBattle(b.id, { rules_version: 1, energy_a: 0 }); b = battle.getBattle(b.id);
  h.quiet(); battle.migrate(); h.loud();
  const old = require('../src/game/legacy_skills').getSkill('aimed_shot').resolve({ atk: 100 }, { def: 100 }).dmg;
  b = action(b, 'aimed_shot'); assert.equal(b.hp_b, 10000 - old); assert.equal(b.energy_a, 0);
  const buttons = require('../src/commands/battle').buildActionButtons(b.id, 'ranged');
  assert.ok(buttons[1].components.every(c => !c.data.custom_id.includes(':steady_aim')));
});
test('UI exposes snapshot loadout, costs, energy, CD, boss forecast and stable tower skill IDs', () => {
  const b = fight('magic', ['fireball', 'meteor', 'barrier', 'heal'], { is_elite: 2 });
  battle.updateBattle(b.id, { energy_a: 5, cooldowns_a: '{"meteor":2}' });
  const cmd = require('../src/commands/battle');
  const rows = cmd.buildActionButtons(b.id, 'melee');
  assert.equal(rows[1].components.length, 4);
  assert.ok(rows[1].components.find(c => c.data.custom_id.includes(':meteor:')).data.disabled);
  assert.ok(rows[1].components.some(c => c.data.label.includes('NL')));
  const view = cmd.buildBattleEmbed(battle.getBattle(b.id), 'A', 'B');
  assert.ok(view.data.fields.some(f => f.value.includes('Boss dự kiến')));
  for (const row of rows) for (const c of row.components) assert.ok(c.data.custom_id.length <= 100);
});
test('skills prefix and slash support info/equip/reset and show truthful mode scope', async () => {
  const id = user(); const msg = h.fakeMessage(id);
  await cmds.get('skills').execute(msg, []); assert.match(msg._text(), /tối đa 4/);
  await cmds.get('skills').execute(msg, ['equip', 'slash', 'execute']); assert.deepEqual(builds.get(id, 'melee', 45), ['slash', 'execute']);
  await cmds.get('skills').execute(msg, ['info', 'execute']); assert.match(msg._text(), /35%/);
  await cmds.get('skills').execute(msg, ['reset']); assert.equal(builds.get(id, 'melee', 45).length, 4);
  const def = require('../src/slash/definitions').definitions.find(d => d.data.name === 'skills'); assert.ok(def);
  assert.deepEqual(def.handler.extractArgs({ options: { getString: name => name === 'action' ? 'equip' : 'slash execute' } }), ['equip', 'slash', 'execute']);
});
test('boss uses its own turn counter so Roar and Rage both occur and telegraph agrees', () => {
  const b = fight('melee', undefined, { is_elite: 2 });
  assert.equal(battle.pickMobAction({ ...b, round: 2 }), 'attack');
  assert.equal(battle.pickMobAction({ ...b, round: 6 }), 'roar');
  assert.equal(battle.pickMobAction({ ...b, round: 12 }), 'rage');
  assert.equal(battle.pickMobAction({ ...b, rules_version: 1, round: 6 }), 'rage');
  const view = require('../src/commands/battle').buildBattleEmbed({ ...b, round: 5 }, 'A', 'B');
  assert.ok(view.data.fields.some(f => f.value.includes('Roar')));
});
test('new battle button routing rejects stale panels and runs exactly one player and enemy turn', async () => {
  const b = fight(); const buttons = require('../src/buttons');
  const input = (customId, extra = {}) => {
    const i = { customId, user: { id: b.user_a }, channelId: 'C', message: { id: 'M' },
      reply: async p => { i.response = p; i.method = 'reply'; }, update: async p => { i.response = p; i.method = 'update'; }, ...extra };
    return i;
  };
  const id = `bt:act:${b.id}:slash:${b.round}`;
  const wrongPanel = input(id, { message: { id: 'OLD' } });
  await buttons.handle(wrongPanel); assert.equal(wrongPanel.method, 'reply'); assert.deepEqual(battle.getBattle(b.id), b);
  const valid = input(id); await buttons.handle(valid); assert.equal(valid.method, 'update');
  const updated = battle.getBattle(b.id); assert.equal(updated.round, b.round + 2); assert.equal(updated.turn, 'a');
  const duplicate = input(id); await buttons.handle(duplicate); assert.equal(duplicate.method, 'reply'); assert.deepEqual(battle.getBattle(b.id), updated);
});
test('battle resume restores stored skills/resources without reroll or changing HP', async () => {
  let b = fight('magic', ['fireball', 'meteor', 'heal']); b = action(b, 'fireball'); b = enemy(b);
  const msg = h.fakeMessage(b.user_a);
  await cmds.get('battle').execute(msg, ['resume']);
  const after = battle.getBattle(b.id);
  for (const key of ['hp_a', 'hp_b', 'energy_a', 'skills_a', 'round', 'cooldowns_a']) assert.equal(after[key], b[key]);
  assert.equal(after.message_id, 'REPLY1'); assert.equal(after.channel_id, 'CHAN1');
});
test('advanced skill effects resolve through the engine, including guard, burst, execute and evasive cleanse', () => {
  let b = fight('melee', ['iron_guard', 'execute', 'guard_break']);
  b = action(b, 'iron_guard'); assert.equal(effects(b).defend.turns, 2); assert.ok(effects(b).momentum);
  b = enemy(b); b = action(b, 'guard_break'); assert.equal(effects(b, 'b').def_down.value, 0.25);
  const execute = skills.getSkill('execute');
  const a = { atk: 100, buffs: {} };
  assert.ok(execute.resolve(a, { def: 100, hp: 300, max_hp: 1000 }).dmg > execute.resolve(a, { def: 100, hp: 500, max_hp: 1000 }).dmg);
  let mage = fight('magic', ['fireball', 'meteor', 'barrier']);
  mage = action(mage, 'fireball'); mage = enemy(mage); mage = action(mage, 'meteor');
  assert.match(mage.last_log, /COMBO/); assert.ok(!effects(mage, 'b').burn);
  mage = enemy(mage); mage = action(mage, 'barrier'); assert.equal(effects(mage).defend.value, 0.45);
  let ranger = fight('ranged', ['steady_aim', 'evasive_step', 'piercing_arrow']);
  ranger = action(ranger, 'steady_aim'); assert.equal(effects(ranger).atk_up.value, 0.2); assert.ok(effects(ranger, 'b').mark);
  ranger = enemy(ranger); ranger = action(ranger, 'piercing_arrow'); assert.match(ranger.last_log, /COMBO/); assert.ok(!effects(ranger, 'b').mark);
  ranger = enemy(ranger); battle.updateBattle(ranger.id, { buffs_a: JSON.stringify({ atk_down: { turns: 2, value: 0.3 }, def_down: { turns: 2, value: 0.3 }, burn: { turns: 2, value: 5 } }) });
  ranger = action(ranger, 'evasive_step'); assert.ok(!effects(ranger).atk_down && !effects(ranger).def_down); assert.ok(effects(ranger).burn && effects(ranger).defend);
});
test('schema defaults leave historical rows on v1 while new creations always opt into v2', () => {
  const id = user();
  const oldId = db.prepare(`INSERT INTO battles(mode,channel_id,user_a,hp_a,hp_b,max_hp_a,max_hp_b,atk_a,atk_b,def_a,def_b)
    VALUES ('pve','C',?,100,100,100,100,10,10,1,1)`).run(id).lastInsertRowid;
  assert.equal(battle.getBattle(oldId).rules_version, 1);
  h.quiet(); battle.migrate(); h.loud(); assert.equal(battle.getBattle(oldId).rules_version, 1);
  assert.equal(fight().rules_version, 2);
});
test('PvP side B uses its own snapshot, cooldown and energy without altering side A resources', () => {
  const a = user('melee'), b = user('magic');
  const id = battle.createBattle({ mode: 'pvp', channel_id: 'C', user_a: a, user_b: b, hp_a: 1000, max_hp_a: 1000, hp_b: 1000, max_hp_b: 1000, atk_a: 100, def_a: 100, atk_b: 100, def_b: 100, turn: 'b' });
  const after = action({ id }, 'freeze', 'b'); assert.equal(after.energy_b, 43); assert.equal(after.energy_a, 60);
  assert.equal(JSON.parse(after.cooldowns_b).freeze, 4); assert.ok(effects(after, 'a').freeze);
});
