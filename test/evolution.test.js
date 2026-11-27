const {test,before}=require('node:test');const assert=require('node:assert/strict');const h=require('./harness');
let db,evo,player,jobs,builds,skills,commands,n=0;
before(()=>{h.quiet();db=require('../src/db/database');evo=require('../src/game/evolution');player=require('../src/game/player');jobs=require('../src/game/jobs');builds=require('../src/game/skill_builds');skills=require('../src/game/skills');commands=h.loadCommands();h.loud();});
function user(root='magic',level=25){const id=`EVOLVE_${++n}`;player.createPlayer(id,id);player.updatePlayer(id,{primary_class:root,level});return id;}
function ready(id,domain,root){if(domain==='class')player.updatePlayer(id,{primary_class:root,level:25});else jobs.updateJob(id,root,{level:25});for(let i=0;i<20;i++)evo.recordAction({id:`${domain}_${root}_${i}`,author:{id}},domain==='class'?'hunt':root);}
function select(id,domain,root,branch){assert.ok(!evo.act(id,'trial',domain,root,branch).error);const preview=evo.act(id,'choose',domain,root,branch);assert.ok(preview.token,JSON.stringify(preview));const r=evo.act(id,'confirm',domain,root,branch,preview.token);assert.equal(r.chosen,true,JSON.stringify(r));return r;}
test('all eight roots publish exactly two complete branches and selection requires level, work and explicit confirmation',()=>{
 for(const [domain,trees]of Object.entries(evo.TREES))for(const [root,t]of Object.entries(trees)){
  assert.equal(Object.keys(t.branches).length,2);const u=user();const branch=Object.keys(t.branches)[0];
  assert.ok(evo.act(u,'choose',domain,root,branch).error);
  ready(u,domain,root);assert.match(evo.act(u,'choose',domain,root,branch).error,/diễn tập/);
  assert.ok(!evo.act(u,'trial',domain,root,branch).error);
  const p=evo.act(u,'choose',domain,root,branch,undefined,1000);assert.equal(evo.choice(u,domain,root),null);
  assert.ok(evo.act(u,'confirm',domain,root,branch,'wrong',2000).error);
  assert.ok(evo.act(u,'confirm',domain,root,branch,p.token,601000).error);
  select(u,domain,root,branch);assert.equal(evo.choice(u,domain,root),branch);
 }
});
test('all sixteen branches are independently selectable and skill gates reject opposite branch and wrong class',()=>{
 for(const [domain,trees]of Object.entries(evo.TREES))for(const [root,t]of Object.entries(trees))for(const b of Object.values(t.branches)){
  const u=user();ready(u,domain,root);select(u,domain,root,b.id);
  const other=Object.keys(t.branches).find(k=>k!==b.id);assert.ok(evo.act(u,'trial',domain,root,other).error);
  if(domain==='class'){
   assert.ok(builds.unlocked(root,25,u).some(s=>s.id===b.skill));
   assert.ok(!builds.unlocked(root,24,u).some(s=>s.id===b.skill));
   const otherSkill=t.branches[other].skill;assert.ok(builds.set(u,root,25,[otherSkill]).error);
   assert.ok(!builds.set(u,root,25,[b.skill]).error);
   assert.ok(builds.set(u,root==='magic'?'melee':'magic',25,[b.skill]).error);
   const r=skills.getSkill(b.skill).resolve({atk:100,hp:400,max_hp:1000,buffs:{}},{def:100,hp:1000,max_hp:1000,buffs:{}});assert.ok(r.dmg>0&&Number.isFinite(r.dmg));
  }
 }
});
test('progress dedups events, separates classes/jobs, ignores missing IDs; class selection follows active class',()=>{
 const u=user('magic');for(let i=0;i<30;i++)evo.recordAction({id:'same',author:{id:u}},'hunt');assert.equal(evo.state(u,'class','magic').progress,1);
 evo.recordAction({author:{id:u}},'hunt');assert.equal(evo.state(u,'class','magic').progress,1);
 player.updatePlayer(u,{primary_class:'ranged'});evo.recordAction({id:'ranged1',author:{id:u}},'hunt');assert.equal(evo.state(u,'class','ranged').progress,1);
 ready(u,'class','magic');evo.act(u,'trial','class','magic','hexer');const preview=evo.act(u,'choose','class','magic','hexer');player.updatePlayer(u,{primary_class:'ranged'});
 assert.match(evo.act(u,'confirm','class','magic','hexer',preview.token).error,/đúng class/);assert.equal(evo.choice(u,'class','magic'),null);
});
test('one class choice does not prevent choosing another; skill reset/preset/reset character cannot erase immutable choice',()=>{
 const u=user();ready(u,'class','magic');select(u,'class','magic','hexer');ready(u,'class','ranged');select(u,'class','ranged','hunter');
 player.updatePlayer(u,{primary_class:'magic'});assert.equal(evo.choice(u,'class','magic'),'hexer');assert.ok(!builds.set(u,'magic',25,['withering_hex']).error);
 builds.preset(u,'save','branch');builds.reset(u,'magic');assert.ok(!builds.preset(u,'load','branch').error);
 assert.throws(()=>db.prepare('UPDATE evolution_choices SET branch=? WHERE user_id=?').run('elementalist',u),/permanent/);
 assert.throws(()=>db.prepare('DELETE FROM evolution_choices WHERE user_id=?').run(u),/permanent/);
 db.prepare('DELETE FROM players WHERE user_id=?').run(u);player.createPlayer(u,u);
 assert.equal(evo.choice(u,'class','magic'),'hexer');assert.equal(evo.choice(u,'class','ranged'),'hunter');assert.ok(evo.act(u,'choose','class','magic','elementalist').error);
});
test('professional bonuses respect level/caps and do not leak into other jobs',()=>{
 const a=user(),b=user();ready(a,'job','mining');select(a,'job','mining','vein_miner');ready(b,'job','mining');select(b,'job','mining','geologist');
 const buffs=require('../src/game/job_buffs');assert.equal(buffs.bonus(a,'mining',25).extraChance,0.03);assert.equal(buffs.bonus(a,'mining',24).extraChance,0);assert.equal(buffs.bonus(a,'fishing',25).extraChance,0);
 assert.equal(jobs.addJobXp(b,'mining',100).xpGained,110);assert.equal(jobs.addJobXp(a,'mining',100).xpGained,100);
 jobs.updateJob(b,'mining',{level:24,xp:0});assert.equal(jobs.addJobXp(b,'mining',100).xpGained,100);assert.equal(evo.choice(b,'job','mining'),'geologist');
 ready(a,'job','crafting');select(a,'job','crafting','smith');assert.equal(buffs.bonus(a,'crafting',25).saveChance,0.03);
});
test('confirmation rechecks eligibility and pending token replacement, and trial has no economic mutation',()=>{
 const u=user();ready(u,'class','magic');const before=player.getPlayer(u);
 evo.act(u,'trial','class','magic','hexer');assert.deepEqual(player.getPlayer(u),before);
 const a=evo.act(u,'choose','class','magic','hexer');const b=evo.act(u,'choose','class','magic','hexer');assert.notEqual(a.token,b.token);
 assert.ok(evo.act(u,'confirm','class','magic','hexer',a.token).error);
 player.updatePlayer(u,{level:24});assert.ok(evo.act(u,'confirm','class','magic','hexer',b.token).error);assert.equal(evo.choice(u,'class','magic'),null);
});
test('selection blocked during active battle on either side, while stored branch skill works through battle snapshot',()=>{
 const u=user(),battle=require('../src/game/battle');ready(u,'class','magic');evo.act(u,'trial','class','magic','hexer');
 const id=battle.createBattle({mode:'pve',user_a:u,channel_id:'C',hp_a:1000,max_hp_a:1000,hp_b:1000,max_hp_b:1000,atk_a:100,def_a:100,atk_b:50,def_b:100});
 assert.match(evo.act(u,'choose','class','magic','hexer').error,/trận/);db.prepare("UPDATE battles SET status='ended' WHERE id=?").run(id);
 select(u,'class','magic','hexer');builds.set(u,'magic',25,['withering_hex']);
 const next=battle.createBattle({mode:'pve',user_a:u,channel_id:'C',hp_a:1000,max_hp_a:1000,hp_b:1000,max_hp_b:1000,atk_a:100,def_a:100,atk_b:50,def_b:100});
 const r=battle.processAction(battle.getBattle(next),'a','withering_hex');assert.ok(!r.error,r.error);assert.ok(battle.getBattle(next).hp_b<1000);
});
test('commands show preview/lock warning and slash routes same service',async()=>{
 const u=user();ready(u,'class','magic');const m=h.fakeMessage(u);await commands.get('evolve').execute(m,['class','magic']);assert.match(m._text(),/Chú Thuật Sư/);
 await commands.get('evolve').execute(m,['trial','class','magic','hexer']);await commands.get('evolve').execute(m,['choose','class','magic','hexer']);assert.match(m._text(),/VĨNH VIỄN/);assert.equal(evo.choice(u,'class','magic'),null);
 const d=require('../src/slash/definitions').definitions.find(x=>x.data.name==='evolve');assert.deepEqual(d.handler.extractArgs({options:{getString:()=> 'class magic'}}),['class','magic']);
});
test('existing class switch API and actual admin reset preserve independently locked branches',async()=>{
 const u=user();ready(u,'class','magic');select(u,'class','magic','hexer');const classes=require('../src/game/classes');classes.syncPrimaryClassData(u);classes.unlockClass(u,'ranged');
 assert.equal(classes.setPrimaryClass(u,'ranged'),true);assert.equal(evo.choice(u,'class','magic'),'hexer');assert.equal(classes.setPrimaryClass(u,'magic'),true);assert.equal(player.getPlayer(u).level,25);
 const m=h.fakeMessage('EVO_ADMIN',{mention:{id:u,username:u}});await commands.get('admin').execute(m,['reset',u]);assert.equal(player.getPlayer(u),undefined);assert.equal(evo.choice(u,'class','magic'),'hexer');
 player.createPlayer(u,u);assert.ok(evo.act(u,'choose','class','magic','elementalist').error);
});
test('real successful gameplay counts work, cooldown/list/admin item grants do not; craft batch counts once',async()=>{
 const u=user('magic',25);player.updatePlayer(u,{atk:99999,def:9999,hp:99999,max_hp:99999});
 for(const wt of ['pickaxe','fishing_rod']){const it=db.prepare('SELECT id FROM items WHERE weapon_type=? ORDER BY min_level LIMIT 1').get(wt);player.addItem(u,it.id,1);}
 const real=Math.random;Math.random=()=>0;
 try{
  for(const [cmd,domain,root]of [['hunt','class','magic'],['mine','job','mining'],['fish','job','fishing'],['gather','job','foraging']]){
   const m=h.fakeMessage(u);m.id=`EVO_REAL_${cmd}`;await commands.get(cmd).execute(m,cmd==='hunt'?['slime']:[]);
   assert.equal(evo.state(u,domain,root).progress,1,m._text());
   const blocked=h.fakeMessage(u);blocked.id=`EVO_BLOCK_${cmd}`;await commands.get(cmd).execute(blocked,cmd==='hunt'?['slime']:[]);assert.equal(evo.state(u,domain,root).progress,1);
  }
  for(const [type,root]of [['craft','crafting'],['cook','cooking']]){
   const r=db.prepare('SELECT * FROM recipes WHERE type=? ORDER BY min_job_level LIMIT 1').get(type);jobs.updateJob(u,root,{level:25});for(const input of JSON.parse(r.inputs))player.addItem(u,input.item_id,input.qty*3);
   const m=h.fakeMessage(u);m.id=`EVO_REAL_${type}`;await commands.get(type).execute(m,[r.id,'x3']);assert.equal(evo.state(u,'job',root).progress,1,m._text());
  }
 }finally{Math.random=real;}
});
test('simultaneous confirmations in two processes produce exactly one immutable selection, surviving restart',async()=>{
 const u=user();ready(u,'class','magic');evo.act(u,'trial','class','magic','hexer');const p=evo.act(u,'choose','class','magic','hexer');
 const {execFile}=require('node:child_process');const script=`const db=require('./src/db/database');const e=require('./src/game/evolution');const r=e.act(process.argv[1],'confirm','class','magic','hexer',process.argv[2]);if(!r.chosen&&!/khóa/.test(r.error||''))throw Error(JSON.stringify(r));if(e.choice(process.argv[1],'class','magic')!=='hexer')process.exit(2);db.close();`;
 const child=()=>new Promise((resolve,reject)=>execFile(process.execPath,['-e',script,u,p.token],{cwd:h.ROOT,env:process.env},err=>err?reject(err):resolve()));await Promise.all([child(),child()]);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM evolution_choices WHERE user_id=?').get(u).n,1);assert.equal(evo.choice(u,'class','magic'),'hexer');
});
