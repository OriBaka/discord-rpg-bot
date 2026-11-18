const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet,loud,fakeMessage,loadCommands }=require('./harness');
let db,player,gear,commands,n=0;
before(()=>{quiet();db=require('../src/db/database');player=require('../src/game/player');gear=require('../src/game/adventurer_gear');commands=loadCommands();loud();});
function user(level=1){const id='ADVENTURER_'+ ++n;player.createPlayer(id,id);player.updatePlayer(id,{level});return id;}
test('three complete lines have 33 real items and obtainable crafting sources',()=>{
  assert.equal(gear.LINES.length*gear.PIECES.length,33);
  for(const line of gear.LINES)for(const [suffix]of gear.PIECES){
    const id=line.id+'_'+suffix;const item=db.prepare('SELECT * FROM items WHERE id=?').get(id);
    assert.ok(item,id);assert.equal(item.min_level,line.lv);assert.ok(item.desc);
    const recipe=db.prepare('SELECT * FROM recipes WHERE output_id=?').get(id);assert.ok(recipe,id);
    for(const input of JSON.parse(recipe.inputs))assert.ok(db.prepare('SELECT 1 FROM items WHERE id=?').get(input.item_id));
  }
});
test('beginner armor set is affordable without changing stat ladder or other equipment',()=>{
  const ladder=require('../src/game/gear_ladder');let cost=0;
  for(const [suffix,,,,,slot]of gear.PIECES){
    if(!slot)continue;
    const id='dawnwatch_'+suffix;const row=db.prepare('SELECT i.def,s.price FROM items i JOIN shop s ON s.item_id=i.id WHERE i.id=?').get(id);
    cost+=row.price;assert.equal(row.def,ladder.armorDef(slot,1));
  }
  assert.equal(cost,300);assert.ok(cost<require('../src/game/player').STARTING_GOLD);
  const before=db.prepare("SELECT * FROM items WHERE id='iron_sword'").get();
  gear.migrate();assert.deepEqual(db.prepare("SELECT * FROM items WHERE id='iron_sword'").get(),before);
  for(const line of gear.LINES){const atks=['sword','wand','bow'].map(s=>db.prepare('SELECT atk FROM items WHERE id=?').get(line.id+'_'+s).atk);assert.equal(new Set(atks).size,1);}
});
test('all lines retain stats when generic gear ladder runs on subsequent boots',()=>{
  const before=db.prepare("SELECT id,atk,def FROM items WHERE id LIKE 'dawnwatch_%' OR id LIKE 'trailwarden_%' OR id LIKE 'emberguard_%' ORDER BY id").all();
  require('../src/game/gear_ladder').migrate();
  assert.deepEqual(db.prepare("SELECT id,atk,def FROM items WHERE id LIKE 'dawnwatch_%' OR id LIKE 'trailwarden_%' OR id LIKE 'emberguard_%' ORDER BY id").all(),before);
});
test('supplies claimed once across start and class pick; older low-level players can claim',async()=>{
  const id=user();const msg=fakeMessage(id);
  await commands.get('start').execute(msg,[]);
  await commands.get('class').execute(msg,['pick','melee']);
  await commands.get('start').execute(msg,[]);
  assert.equal(db.prepare("SELECT qty FROM inventory WHERE user_id=? AND item_id='potion_s'").get(id).qty,3);
  assert.equal(gear.claimSupplies(user(6)),false);
});
test('novice inn costs 5–20 gold and cooldown is 60s; admin override still wins',async()=>{
  const id=user();player.updatePlayer(id,{hp:0});const msg=fakeMessage(id);
  await commands.get('heal').execute(msg);const p=player.getPlayer(id);
  assert.equal(p.hp,p.max_hp);assert.ok(400-p.gold>=5&&400-p.gold<=20);
  assert.match(msg._text(),/1m/);
  player.updatePlayer(id,{hp:1,last_heal:Date.now()-61000});
  await commands.get('heal').execute(msg);assert.equal(player.getPlayer(id).hp,100);
  const settings=require('../src/game/settings');settings.set('cd_heal',600000);
  try{
    player.updatePlayer(id,{hp:1,last_heal:Date.now()-61000});
    await commands.get('heal').execute(msg);assert.equal(player.getPlayer(id).hp,1);
  }finally{settings.remove('cd_heal');}
});
test('Lv6+ inn retains original costs and beginner claim rolls back on failure',async()=>{
  const id=user(6);player.updatePlayer(id,{hp:0});await commands.get('heal').execute(fakeMessage(id));assert.equal(player.getPlayer(id).gold,400-50-90);
  const novice=user();const old=player.addItem;player.addItem=()=>{throw new Error('test supplies failure');};
  try{assert.throws(()=>gear.claimSupplies(novice),/test supplies failure/);}finally{player.addItem=old;}
  assert.equal(gear.claimSupplies(novice),true);
});
