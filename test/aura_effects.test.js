const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, fakeMessage, loadCommands } = require('./harness');
let db, aura, player, jobs, commands, n = 0;
before(() => { quiet(); db = require('../src/db/database'); aura = require('../src/game/aura'); player = require('../src/game/player'); jobs = require('../src/game/jobs'); commands = loadCommands(); loud(); });
function user(effect, pct = 12) {
  const id = 'EFFECT_' + ++n; player.createPlayer(id,id);
  if (effect) db.prepare('INSERT INTO player_aura(user_id,active_stat,active_tier,active_percent) VALUES (?,?,?,?)').run(id,effect,'legendary',pct);
  return id;
}
test('all 16 effects can roll and old active/pending auras survive migration', () => {
  assert.equal(aura.STAT_KEYS.length, 16);
  aura.STAT_KEYS.forEach((stat, i) => {
    const draws = [99,i,2]; const r = aura.generate(max => { const v = draws.shift(); assert.ok(v < max); return v; });
    assert.deepEqual(r, { stat, tier:'legendary', percent:12 }); assert.ok(aura.effectName(stat));
  });
  const id = user('atk'); const old = aura.get(id); aura.migrate(); assert.deepEqual(aura.get(id),old);
});
test('HP aura preserves wounds and does not mutate base stats; conversion round-trips without healing', () => {
  const id=user('hp'); const p=player.getPlayer(id); p.hp=51;
  const eff=player.getEffectiveStats(p); assert.equal(eff.max_hp,112); assert.equal(eff.hp,57);
  assert.equal(aura.storedHp(eff.hp,eff.max_hp,p.max_hp),51);
  assert.equal(aura.storedHp(0,112,100),0);
  assert.ok(aura.storedHp(45,112,100)<51);
  assert.equal(player.getPlayer(id).max_hp,100);
  db.prepare('UPDATE player_aura SET active_stat=? WHERE user_id=?').run('def',id);
  assert.equal(player.getEffectiveStats(p).hp,51);
});
test('HP snapshot persists the original base max, even after aura is switched', () => {
  const id=user('hp'); const battle=require('../src/game/battle');
  const b=battle.createBattle({mode:'pve',channel_id:'c',user_a:id,hp_a:112,max_hp_a:112,base_max_hp_a:100,hp_b:10,max_hp_b:10,atk_a:10,def_a:5,atk_b:1,def_b:1});
  db.prepare('UPDATE player_aura SET active_stat=? WHERE user_id=?').run('atk',id);
  const row=battle.getBattle(b); assert.equal(row.base_max_hp_a,100);
  assert.equal(aura.storedHp(56,row.max_hp_a,row.base_max_hp_a),50);
});
test('XP effects apply only to chosen job and preserve small fractional bonuses', () => {
  for (const job of ['mining','fishing','foraging','crafting','cooking']) {
    const id=user(job+'_xp',1);
    for(let i=0;i<10;i++) jobs.addJobXp(id,job,10);
    const state=jobs.getJob(id,job);
    let earned=state.xp; for(let lv=1;lv<state.level;lv++) earned+=jobs.xpToNext(lv);
    assert.equal(earned,101);
    assert.equal(jobs.addJobXp(id,job==='mining'?'fishing':'mining',10).xpGained,10);
  }
});
test('drop/extra/save are isolated to correct jobs and respect existing caps', () => {
  const buffs=require('../src/game/job_buffs');
  for(const job of ['mining','fishing','foraging']) {
    const id=user(job+'_drop'); assert.ok(Math.abs(buffs.bonus(id,job).dropMult-1.12)<1e-8);
    assert.equal(buffs.bonus(id,'cooking').dropMult,1);
    const extra=user(job+'_extra'); assert.equal(buffs.bonus(extra,job).extraChance,0.12);
  }
  assert.equal(buffs.bonus(user('crafting_save'),'crafting').saveChance,0.12);
  assert.equal(buffs.bonus(user('cooking_extra'),'cooking').extraChance,0.12);
});
test('real mining extra aura adds exactly one per successful drop with fixed RNG', async () => {
  const a=user(), b=user('mining_extra');
  for(const id of [a,b]) player.addItem(id,'pick_wood',1);
  const saved=Math.random; Math.random=()=>0.01;
  try { for(const id of [a,b]) await commands.get('mine').execute(fakeMessage(id),['stone_quarry']); }
  finally { Math.random=saved; }
  const qty=id=>db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='coal'").get(id).qty;
  assert.equal(qty(b),qty(a)+1);
});
test('crafting save and cooking extra are connected to real crafting commands', async () => {
  const id=user('crafting_save'); player.addItem(id,'coal',1); player.addItem(id,'copper_ore',2);
  const saved=Math.random; Math.random=()=>0.01;
  try { await commands.get('craft').execute(fakeMessage(id),['recipe_copper_ingot']); }
  finally { Math.random=saved; }
  assert.equal(db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='coal'").get(id).qty,1);
  assert.equal(db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='copper_ingot'").get(id).qty,1);
});
test('all effect names fit aura embed fields', async () => {
  const id=user('hp'); let payload; const msg=fakeMessage(id); msg.reply=async p=>{payload=p;};
  await commands.get('aura').execute(msg,[]);
  for(const f of payload.embeds[0].data.fields) assert.ok(f.value.length<=1024);
});
test('cooking extra produces a real extra output without multiplying ingredients', async () => {
  const id=user('cooking_extra'); player.addItem(id,'fish_small',2);
  const saved=Math.random; Math.random=()=>0.01;
  try { await commands.get('cook').execute(fakeMessage(id),['recipe_fish_soup']); }
  finally { Math.random=saved; }
  assert.equal(db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='food_fish_soup'").get(id).qty,2);
});
test('real hunt HP and new battle snapshots use effective HP without healing on a zero-damage win', async () => {
  const id=user('hp'); player.updatePlayer(id,{hp:51,atk:100000});
  const p=player.getPlayer(id);
  const result=require('../src/game/combat').simulateBattle(p,{hp:1,def:0,atk:1,name:'test'});
  assert.equal(result.playerHpAfter,51);
  await commands.get('battle').execute(fakeMessage(id),['elite_slime']);
  const b=db.prepare('SELECT * FROM battles WHERE user_a=?').get(id);
  assert.equal(b.max_hp_a,112); assert.equal(b.hp_a,57); assert.equal(b.base_max_hp_a,100);
});
test('job XP remainder rolls back with failed XP update and type leaderboards filter safely', () => {
  const id=user('mining_xp',1); jobs.addJobXp(id,'mining',1);
  const old=db.prepare('SELECT * FROM aura_job_xp WHERE user_id=?').get(id);
  db.exec("CREATE TRIGGER xp_fail BEFORE UPDATE ON player_jobs BEGIN SELECT RAISE(ABORT,'xp failure'); END");
  try { assert.throws(()=>jobs.addJobXp(id,'mining',10),/xp failure/); }
  finally { db.exec('DROP TRIGGER xp_fail'); }
  assert.deepEqual(db.prepare('SELECT * FROM aura_job_xp WHERE user_id=?').get(id),old);
  assert.ok(aura.top('mining_xp').every(a=>a.active_stat==='mining_xp'));
});
