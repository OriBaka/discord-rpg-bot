const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const h=require('./harness');
let db, casino, commands,n=0;
before(()=>{h.quiet();db=require('../src/db/database');casino=require('../src/game/casino');commands=h.loadCommands();h.loud();});
function fixture(rng) {let now=1000000;const service=casino.createService(db,()=>now,rng);const a=`CA${++n}`,b=`CB${n}`;service.run(a,'daily');service.run(b,'daily');return {a,b,run:service.run,time:x=>now+=x};}
const balance=(f,u)=>f.run(u,'balance').chips;
test('free chip claim survives service restart and has strict 24h boundary',()=>{
 const f=fixture();assert.equal(balance(f,f.a),1000);assert.throws(()=>f.run(f.a,'daily'),/24/);
 assert.throws(()=>casino.createService(db,()=>1000001).run(f.a,'daily'),/24/);
 f.time(86400000);assert.equal(f.run(f.a,'daily').chips,2000);
});
test('slot payout table, stake validation and RPG separation',()=>{
 for(const [rolls,payout] of [[[0,0,0],100],[[0,0,1],10],[[0,1,2],0]]) {
  let i=0;const f=fixture(()=>rolls[i++]);const g=f.run(f.a,'slot',['10']);assert.equal(g.status,'done');assert.equal(balance(f,f.a),990+payout);
  assert.throws(()=>f.run(f.a,'accept',[g.id]));assert.equal(balance(f,f.a),990+payout);
 }
 const f=fixture();for(const s of ['9','501','20x','2.5','-10','Infinity'])assert.throws(()=>f.run(f.a,'slot',[s]));assert.equal(balance(f,f.a),1000);
 assert.equal(db.prepare('SELECT 1 FROM players WHERE user_id=?').get(f.a),undefined);
});
test('dice escrow, participant permissions, tie and exactly once accept',()=>{
 const f=fixture(()=>4);const g=f.run(f.a,'dice',['100',f.b]);assert.equal(balance(f,f.a),900);assert.equal(balance(f,f.b),1000);
 assert.throws(()=>f.run(f.a,'accept',[g.id]));assert.throws(()=>f.run('other','status',[g.id]));
 const r=f.run(f.b,'accept',[g.id]);assert.deepEqual(r.data.rolls,[4,4]);assert.equal(balance(f,f.a),1000);assert.equal(balance(f,f.b),1000);
 assert.throws(()=>f.run(f.b,'accept',[g.id]));
});
test('pending cancellation, insufficient accept and lazy expiry preserve escrow',()=>{
 const f=fixture();const g=f.run(f.a,'rps',['500',f.b]);
 db.prepare('UPDATE casino_wallets SET chips=0 WHERE user_id=?').run(f.b);
 assert.throws(()=>f.run(f.b,'accept',[g.id]),/đủ/);assert.equal(f.run(f.a,'status',[g.id]).status,'pending');
 assert.throws(()=>f.run(f.b,'slot',['10']),/chưa kết/);
 f.run(f.b,'decline',[g.id]);assert.equal(balance(f,f.a),1000);
 const g2=f.run(f.a,'rps',['100',f.b]);f.time(300000);assert.throws(()=>f.run(f.b,'accept',[g2.id]));assert.equal(balance(f,f.a),1000);
});
test('RPS keeps choices sealed, disallows changes and settles proper winner',()=>{
 const f=fixture();const g=f.run(f.a,'rps',['100',f.b]);f.run(f.b,'accept',[g.id]);
 const first=f.run(f.a,'pick',[g.id,'rock']);assert.deepEqual(first.data,{chosen:1});assert.deepEqual(f.run(f.b,'status',[g.id]).data,{chosen:1});
 assert.throws(()=>f.run(f.a,'pick',[g.id,'paper']));
 const r=f.run(f.b,'pick',[g.id,'scissors']);assert.equal(r.status,'done');assert.equal(r.data[f.a],'rock');assert.equal(balance(f,f.a),1100);assert.equal(balance(f,f.b),900);
 assert.throws(()=>f.run(f.b,'pick',[g.id,'rock']));assert.equal(balance(f,f.a),1100);
});
test('RPS timeout: one choice wins by forfeit; no choices refund; fixed deadline across restart',()=>{
 for(const pick of [true,false]) {const f=fixture();const g=f.run(f.a,'rps',['100',f.b]);f.run(f.b,'accept',[g.id]);if(pick)f.run(f.b,'pick',[g.id,'paper']);f.time(300000);assert.equal(f.run(f.a,'status',[g.id]).status,'done');assert.equal(balance(f,f.a),pick?900:1000);assert.equal(balance(f,f.b),pick?1100:1000);}
});
test('blackjack no deck/hole leak, validates even stake, bust/stand and timeout never pay twice',()=>{
 const f=fixture((lo,hi)=>hi-1);assert.throws(()=>f.run(f.a,'blackjack',['11']));
 const g=f.run(f.a,'blackjack',['100']);assert.equal(g.data.deck,undefined);assert.equal(g.data.dealer[1],'?');
 const r=f.run(f.a,'hit',[g.id]);assert.equal(r.status,'done');assert.equal(balance(f,f.a),900);
 assert.throws(()=>f.run(f.a,'stand',[g.id]));
 const g2=f.run(f.a,'blackjack',['100']);assert.equal(f.run(f.a,'stand',[g2.id]).status,'done');
 const g3=f.run(f.a,'blackjack',['100']);f.time(300000);assert.equal(f.run(f.a,'status',[g3.id]).status,'done');assert.equal(balance(f,f.a),800);
 assert.equal(casino.score([1,1,9]),21);assert.equal(casino.score([1,13,5]),16);
});
test('transaction rollback restores both escrow and game state on settlement error',()=>{
 const f=fixture(()=>3);const g=f.run(f.a,'dice',['100',f.b]);
 db.exec("CREATE TRIGGER casino_test_fail BEFORE UPDATE ON casino_games WHEN NEW.status='done' BEGIN SELECT RAISE(ABORT,'test settlement failure'); END");
 try{assert.throws(()=>f.run(f.b,'accept',[g.id]),/test settlement/);}finally{db.exec('DROP TRIGGER casino_test_fail');}
 assert.equal(balance(f,f.a),900);assert.equal(balance(f,f.b),1000);assert.equal(f.run(f.a,'status',[g.id]).status,'pending');
 f.run(f.b,'accept',[g.id]);assert.equal(balance(f,f.a),1000);assert.equal(balance(f,f.b),1000);
});
test('commands reject public RPS pick and bots, accept help and have slash route',async()=>{
 const m=h.fakeMessage('CSCMD');await commands.get('casino').execute(m,['pick','id','rock']);assert.match(m._text(),/DM bot/);
 const bot=h.fakeMessage('CSCMD',{mention:{id:'123456789012345678',bot:true}});await commands.get('casino').execute(bot,['dice','123456789012345678','10']);assert.match(bot._text(),/không bot/);
 await commands.get('casino').execute(m,[]);assert.match(m._text(),/69,44/);
 const defs=require('../src/slash/definitions');const list=Array.isArray(defs)?defs:defs.definitions;const d=list.find(x=>x.data.name==='casino');assert.equal(d.handler.cmdName,'casino');assert.deepEqual(d.handler.extractArgs({options:{getString:()=> 'slot 10'}}),['slot','10']);
});
test('duplicate Discord delivery returns original outcome without rerolling/debiting',()=>{
 const f=fixture(()=>0);const service=casino.createService(db,()=>1000000,()=>0);
 const first=service.run(f.a,'slot',['100'],'request-1');
 const chips=balance(f,f.a);
 assert.deepEqual(service.run(f.a,'slot',['100'],'request-1'),first);assert.equal(balance(f,f.a),chips);
 assert.equal(f.run(f.a,'status').id,first.id);
});
test('natural blackjack pays 3:2 profit and never exposes undealt cards',()=>{
 // Deterministic scripted shuffle placing A,K for player and 9,8 for dealer.
 const desired=[1,13,9,8], deck=[];for(let s=0;s<4;s++)for(let c=1;c<=13;c++)deck.push(c);
 let idx=0;
 const f=fixture((lo,hi)=>{const i=hi-1;const j=idx<4?deck.findIndex((c,k)=>k<=i&&c===desired[idx++]):i;[deck[i],deck[j]]=[deck[j],deck[i]];return j;});
 const g=f.run(f.a,'blackjack',['100']);assert.equal(g.status,'done');assert.equal(g.data.natural,true);assert.equal(balance(f,f.a),1150);assert.equal(g.data.deck,undefined);
});
test('two processes accepting the same dice wager settle escrow exactly once',async()=>{
 const f=fixture();const g=f.run(f.a,'dice',['100',f.b]);
 const {execFile}=require('node:child_process');
 const script=`const db=require('./src/db/database'); const s=require('./src/game/casino').createService(db,()=>1000000,()=>3); try{s.run(process.argv[1],'accept',[process.argv[2]]);}catch(e){if(!/kết thúc/.test(e.message))throw e;} db.close();`;
 const child=()=>new Promise((resolve,reject)=>execFile(process.execPath,['-e',script,f.b,g.id],{cwd:h.ROOT,env:process.env},(e)=>e?reject(e):resolve()));
 await Promise.all([child(),child()]);assert.equal(balance(f,f.a),1000);assert.equal(balance(f,f.b),1000);assert.equal(f.run(f.a,'status',[g.id]).status,'done');
});
test('blackjack hit/stand resolve own active game without ID, including after service restart',()=>{
 const f=fixture((lo,hi)=>hi-1);
 const g=f.run(f.a,'blackjack',['100']);
 const restarted=casino.createService(db,()=>1000000,(lo,hi)=>hi-1);
 assert.throws(()=>restarted.run(f.b,'stand'),/không có ván blackjack/);
 assert.equal(restarted.run(f.a,'stand').id,g.id);
 assert.throws(()=>restarted.run(f.a,'stand'),/không có ván blackjack/);
 const next=f.run(f.a,'blackjack',['100']);
 assert.equal(restarted.run(f.a,'hit').id,next.id);
 assert.equal(f.run(f.a,'status',[next.id]).status,'done');
});
test('ID-free blackjack actions do not select PvP or expired games',()=>{
 const f=fixture((lo,hi)=>hi-1);
 const duel=f.run(f.a,'rps',['100',f.b]);
 assert.throws(()=>f.run(f.a,'hit'),/không có ván blackjack/);
 assert.equal(f.run(f.a,'status',[duel.id]).status,'pending');
 f.run(f.a,'cancel',[duel.id]);
 const bj=f.run(f.a,'blackjack',['100']);f.time(300000);
 assert.throws(()=>f.run(f.a,'stand'),/không có ván blackjack/);
 assert.equal(f.run(f.a,'status',[bj.id]).status,'done');
 assert.equal(balance(f,f.a),900);
});
test('blackjack command help and live prompt show short hit/stand syntax',async()=>{
 const m=h.fakeMessage('BJ_SHORT_HELP');await commands.get('casino').execute(m,['help']);
 assert.match(m._text(),/casino hit hoặc %casino stand/);
 assert.doesNotMatch(m._text(),/hit\/stand <mã-ván>/);
 // Use a pre-created deterministic hand to exercise command rendering without a new deal.
 const id='BJ_SHORT_PROMPT';const service=casino.createService(db,Date.now,(lo,hi)=>hi-1);
 service.run(id,'daily');service.run(id,'blackjack',['100']);
 const live=h.fakeMessage(id);await commands.get('casino').execute(live,['status']);
 assert.match(live._text(),/casino hit hoặc %casino stand \(không cần mã ván\)/);
});
