const {test,before}=require('node:test');const assert=require('node:assert/strict');const h=require('./harness');
let db,contracts,player,commands,n=0;
before(()=>{h.quiet();db=require('../src/db/database');contracts=require('../src/game/contracts');player=require('../src/game/player');commands=h.loadCommands();h.loud();});
function fixture(){let now=100000000;const s=contracts.createService(db,()=>now);const users=Array.from({length:5},()=>{const u=`COOP_${++n}`;player.createPlayer(u,u);return u;});return {...s,users,time:x=>now+=x};}
function team(f){const [a,b]=f.users;const g=f.act(a,'create');f.act(b,'join',g.id);f.act(a,'start',g.id);return g.id;}
function progress(f,id){return f.act(f.users[0],'status',id);}
test('recruiting, membership, leader checks and locked roster',()=>{
 const f=fixture(),[a,b,c,d,e]=f.users;const g=f.act(a,'create');assert.match(g.id,/^[A-F0-9]{6}$/);
 assert.throws(()=>f.act(a,'start'),/ít nhất 2/);assert.throws(()=>f.act(b,'create')&&f.act(b,'join',g.id),/chưa kết thúc/);
 // b is now leading a separate team; invite c/d/e instead.
 f.act(c,'join',g.id);f.act(d,'join',g.id);f.act(e,'join',g.id);
 assert.throws(()=>f.act(c,'start',g.id),/trưởng đội/);f.act(a,'start');
 assert.throws(()=>f.act(a,'cancel'),/khóa/);assert.throws(()=>f.act(b,'join',g.id),/khóa/);
 assert.equal(progress(f,g.id).members.length,4);
});
test('completion requires shared work, caps goals and contribution; rewards exactly once and survive restart',()=>{
 const f=fixture(),[a,b]=f.users,id=team(f);let i=0;
 for(const kind of Object.keys(contracts.GOALS))for(let k=0;k<10;k++)f.record(a,`a${i++}`,kind);
 assert.equal(progress(f,id).members.find(m=>m.user_id===a).points,20);assert.equal(progress(f,id).status,'active');
 for(const kind of Object.keys(contracts.GOALS))for(let k=0;k<10;k++)f.record(b,`b${i++}`,kind);
 const done=progress(f,id);assert.equal(done.status,'completed');assert.equal(done.rewards.length,2);assert.equal(done.rewards.reduce((s,r)=>s+r.merit,0),200);
 assert.equal(f.act(a,'profile').merit,100);assert.equal(f.act(a,'profile').badge,'Chung Sức');
 f.record(a,'extra','hunt');assert.equal(f.act(a,'profile').merit,100);
 const restarted=contracts.createService(db,()=>100000000);assert.equal(restarted.act(a,'profile').merit,100);assert.equal(restarted.act(a,'status').status,'completed');
});
test('no pre-start/outsider credit; duplicate event cannot advance; every action counts one only',()=>{
 const f=fixture(),[a,b,c]=f.users,g=f.act(a,'create');f.act(b,'join',g.id);
 assert.equal(f.record(a,'pre','hunt'),null);f.act(a,'start');assert.equal(f.record(c,'outside','hunt'),null);
 f.record(a,'stable','hunt');f.record(a,'stable','hunt');assert.equal(progress(f,g.id).progress.find(p=>p.kind==='hunt').amount,1);
 assert.equal(f.record(a,'unknown','gold'),null);assert.equal(progress(f,g.id).members.find(m=>m.user_id===a).points,1);
});
test('expiry/cancel do not grant rewards or bypass 24h participation gate; boundary reopens safely',()=>{
 const f=fixture(),[a,b]=f.users,g=f.act(a,'create');f.act(a,'cancel');assert.throws(()=>f.act(a,'create'),/24 giờ/);
 f.time(86400000);const next=f.act(a,'create');f.act(b,'join',next.id);f.act(a,'start');f.record(a,'one','hunt');
 f.time(86400000);assert.equal(f.record(b,'late','hunt'),null);assert.equal(progress(f,next.id).status,'expired');assert.equal(f.act(a,'profile').merit,0);
 assert.notEqual(f.act(a,'create').id,next.id);
});
test('settlement failure rolls back progress, event receipt and all merit',()=>{
 const f=fixture(),[a,b]=f.users,id=team(f);let i=0;
 for(const kind of ['hunt','fishing'])for(let k=0;k<10;k++)f.record(a,`aa${i++}`,kind);
 for(const kind of ['mining','foraging'])for(let k=0;k<(kind==='foraging'?9:10);k++)f.record(b,`bb${i++}`,kind);
 db.exec("CREATE TRIGGER coop_test_fail BEFORE INSERT ON coop_rewards BEGIN SELECT RAISE(ABORT,'reward failed'); END");
 try{assert.throws(()=>f.record(b,'finish','foraging'),/reward failed/);}finally{db.exec('DROP TRIGGER coop_test_fail');}
 assert.equal(progress(f,id).status,'active');assert.equal(f.act(a,'profile').merit,0);
 assert.equal(f.record(b,'finish','foraging').status,'completed');assert.equal(f.act(b,'profile').merit,100);
});
test('reset character leaves roster/cooldown/profile intact; nonexistent players cannot enroll',()=>{
 const f=fixture(),[a,b]=f.users,id=team(f);db.prepare('DELETE FROM players WHERE user_id=?').run(a);
 assert.equal(progress(f,id).members.length,2);assert.throws(()=>f.act('NOCHAR','create'),/nhân vật/);
 player.createPlayer(a,a);assert.throws(()=>f.act(a,'create'),/chưa kết thúc/);
});
test('command and slash route expose rules, recruitment and profile',async()=>{
 const u=`COOP_CMD_${++n}`;player.createPlayer(u,u);const m=h.fakeMessage(u);
 await commands.get('contract').execute(m,['help']);assert.match(m._text(),/20\/40/);
 await commands.get('contract').execute(m,['create']);assert.match(m._text(),/recruiting/);
 await commands.get('contract').execute(m,['profile']);assert.match(m._text(),/Công trạng/);
 const defs=require('../src/slash/definitions');const list=Array.isArray(defs)?defs:defs.definitions;const d=list.find(x=>x.data.name==='contract');assert.deepEqual(d.handler.extractArgs({options:{getString:()=> 'join ABC123'}}),['join','ABC123']);
});
test('real gameplay hooks count successful hunt/mine/fish/gather, not cooldown/list/admin inventory',async()=>{
 const [a,b]=Array.from({length:2},()=>{const id=`COOP_LIVE_${++n}`;player.createPlayer(id,id);return id;});
 const s=contracts.getService();const g=s.act(a,'create');s.act(b,'join',g.id);s.act(a,'start');
 for(const wt of ['pickaxe','fishing_rod']){const it=db.prepare('SELECT id FROM items WHERE weapon_type=? ORDER BY min_level LIMIT 1').get(wt);player.addItem(a,it.id,1);}
 assert.equal(s.act(a,'status').members.find(m=>m.user_id===a).points,0);
 player.updatePlayer(a,{atk:99999,def:9999,max_hp:99999,hp:99999});
 const old=Math.random;Math.random=()=>0;
 try{
  for(const [cmd,kind] of [['hunt','hunt'],['mine','mining'],['fish','fishing'],['gather','foraging']]){
   const m=h.fakeMessage(a);m.id=`LIVE_${cmd}`;
   await commands.get(cmd).execute(m,cmd==='hunt'?['slime']:[]);
   assert.equal(s.act(a,'status').progress.find(p=>p.kind===kind).amount,1,`${cmd}: ${m._text()}`);
   const blocked=h.fakeMessage(a);blocked.id=`BLOCK_${cmd}`;await commands.get(cmd).execute(blocked,cmd==='hunt'?['slime']:[]);
   assert.equal(s.act(a,'status').progress.find(p=>p.kind===kind).amount,1);
   const list=h.fakeMessage(a);list.id=`LIST_${cmd}`;await commands.get(cmd).execute(list,['list']);
   assert.equal(s.act(a,'status').progress.find(p=>p.kind===kind).amount,1);
  }
 }finally{Math.random=old;}
});
test('two processes replaying final contribution issue one completion and one reward set',async()=>{
 const f=fixture(),[a,b]=f.users,id=team(f);let i=0;
 for(const kind of ['hunt','fishing'])for(let k=0;k<10;k++)f.record(a,`conA${i++}`,kind);
 for(const kind of ['mining','foraging'])for(let k=0;k<(kind==='foraging'?9:10);k++)f.record(b,`conB${i++}`,kind);
 const {execFile}=require('node:child_process');const script=`const db=require('./src/db/database'); const s=require('./src/game/contracts').createService(db,()=>100000000); s.record(process.argv[1],'concurrent-finish','foraging'); db.close();`;
 const child=()=>new Promise((resolve,reject)=>execFile(process.execPath,['-e',script,b],{cwd:h.ROOT,env:process.env},e=>e?reject(e):resolve()));
 await Promise.all([child(),child()]);assert.equal(progress(f,id).status,'completed');assert.equal(progress(f,id).rewards.length,2);assert.equal(f.act(b,'profile').merit,100);
});
