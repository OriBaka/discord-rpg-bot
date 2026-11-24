const {test,before}=require('node:test');const assert=require('node:assert/strict');const h=require('./harness');
let db,alerts,world,commands;
before(()=>{h.quiet();db=require('../src/db/database');alerts=require('../src/game/weather_alerts');world=require('../src/game/world_weather');commands=h.loadCommands();h.loud();});
function reset(){db.exec('DELETE FROM weather_alerts; DELETE FROM weather_channels;');}
function channel(g='WA'){db.prepare('INSERT INTO weather_channels(guild_id,channel_id) VALUES(?,?)').run(g,g);}
function client(out,fail=false){return {channels:{fetch:async id=>({guildId:id,isTextBased:()=>true,send:async p=>{if(fail)throw Error('offline');out.push({id,...p});}})}};}
const state=(weather='rain',period='night')=>({weather,period,hour:20,minute:0});
test('matching supports AND weather/period and either wildcard, validates rules',()=>{
 assert.equal(alerts.matches({weather:'rain',period:'night'},state()),true);
 assert.equal(alerts.matches({weather:'rain',period:'day'},state()),false);
 assert.equal(alerts.matches({weather:'snow',period:'any'},state()),false);
 assert.equal(alerts.matches({weather:'any',period:'night'},state()),true);
 assert.throws(()=>alerts.manage('A','U','add','any','any'));
 assert.throws(()=>alerts.manage('A','U','add','typhoon','day'));
});
test('self-service opt-ins are per guild, deduplicated and removable without touching others',()=>{
 reset();alerts.manage('A','U','add','rain','night');alerts.manage('A','U','add','rain','night');alerts.manage('B','U','add','snow','any');alerts.manage('A','V','add','any','day');
 assert.equal(alerts.manage('A','U','list').length,1);
 alerts.manage('A','U','remove','rain','night');assert.equal(alerts.manage('A','U','list').length,0);
 alerts.manage('B','U','off');assert.equal(alerts.manage('A','V','list').length,1);
});
test('ping only newly matching opt-ins; multiple matching rules coalesce; continuous repeats do not re-ping',async()=>{
 reset();channel();const out=[];const c=client(out);
 alerts.manage('WA','111','add','rain','night');alerts.manage('WA','111','add','rain','any');alerts.manage('WA','222','add','snow','any');
 await alerts.notify(c,state());assert.equal(out.length,1);assert.deepEqual(out[0].allowedMentions,{parse:[],users:['111']});
 await alerts.notify(c,{...state(),revision:999});assert.equal(out.length,1);
 await alerts.notify(c,state('clear','day'));await alerts.notify(c,state());assert.equal(out.length,2);
 assert.ok(out.every(p=>!p.content.includes('<@222>')));
});
test('subscription added while bulletin key already sent is still delivered by weather worker',async()=>{
 reset();const s=world.current();channel();db.prepare('UPDATE weather_channels SET last_key=?').run(s.key);
 alerts.manage('WA','333','add',s.weather,s.period);const out=[];
 await world.tick(client(out));assert.equal(out.length,1);assert.match(out[0].content,/Điều kiện thời tiết/);
 await world.tick(client(out));assert.equal(out.length,1);
});
test('failed send retries, successful send persists marker through module reload',async()=>{
 reset();channel();alerts.manage('WA','444','add','rain','night');const out=[];
 const old=console.error;console.error=()=>{};try{await alerts.notify(client(out,true),state());}finally{console.error=old;}
 assert.equal(db.prepare('SELECT matched FROM weather_alerts').get().matched,0);
 await alerts.notify(client(out),state());assert.equal(out.length,1);
 delete require.cache[require.resolve('../src/game/weather_alerts')];await require('../src/game/weather_alerts').notify(client(out),state());assert.equal(out.length,1);
});
test('batching caps explicit mentions and no cross-guild deliveries; wrong guild is rejected',async()=>{
 reset();channel('WA');channel('WB');for(let i=0;i<85;i++)alerts.manage('WA',String(1000+i),'add','rain','any');alerts.manage('WB','9999','add','rain','any');
 const out=[];await alerts.notify(client(out),state());assert.equal(out.length,4);assert.ok(out.every(p=>p.allowedMentions.users.length<=40));
 assert.deepEqual(out.find(p=>p.id==='WB').allowedMentions.users,['9999']);
 alerts.manage('WA','7777','add','rain','any');
 await alerts.notify({channels:{fetch:async()=>({guildId:'OTHER',isTextBased:()=>true,send:async()=>assert.fail('cross guild')})}},state());
 assert.equal(db.prepare("SELECT matched FROM weather_alerts WHERE user_id='7777'").get().matched,0);
});
test('commands need no admin/character; server config required, only own subscriptions can be modified',async()=>{
 reset();const m=h.fakeMessage('WPLAYER',{admin:false});await commands.get('weather').execute(m,['watch','add','rain','night']);assert.match(m._text(),/chưa có kênh/);
 channel('GUILD1');await commands.get('weather').execute(m,['watch','add','mua','dem']);assert.equal(alerts.manage('GUILD1','WPLAYER','list').length,1);
 await commands.get('weather').execute(m,['watch','list']);assert.match(m._text(),/ban đêm/);
 alerts.manage('GUILD1','OTHER','add','snow','any');await commands.get('weather').execute(m,['watch','off']);assert.equal(alerts.manage('GUILD1','WPLAYER','list').length,0);assert.equal(alerts.manage('GUILD1','OTHER','list').length,1);
 const dm=h.fakeMessage('WPLAYER');dm.guild=null;await commands.get('weather').execute(dm,['watch','add','rain']);assert.match(dm._text(),/không phải DM/);
 const slash=require('../src/slash/definitions').definitions.find(d=>d.data.name==='weather');assert.deepEqual(slash.handler.extractArgs({options:{getString:()=> 'watch add any day'}}),['watch','add','any','day']);
});
test('opt-out while fetching channel is respected before sending',async()=>{
 reset();channel();alerts.manage('WA','TO_REMOVE','add','rain','night');
 await alerts.notify({channels:{fetch:async()=>{
  alerts.manage('WA','TO_REMOVE','off');
  return {guildId:'WA',isTextBased:()=>true,send:async()=>assert.fail('unsubscribed user pinged')};
 }}},state());
 assert.equal(alerts.manage('WA','TO_REMOVE','list').length,0);
});
test('subscriptions and matched state survive an actual process restart',()=>{
 reset();channel();alerts.manage('WA','PERSIST','add','snow','night');
 db.prepare("UPDATE weather_alerts SET matched=1 WHERE user_id='PERSIST'").run();
 const {execFileSync}=require('node:child_process');
 const script=`const db=require('./src/db/database'); const a=require('./src/game/weather_alerts'); const r=db.prepare("SELECT * FROM weather_alerts WHERE user_id='PERSIST'").get(); if(!r||r.matched!==1||a.manage('WA','PERSIST','list').length!==1)process.exit(2); db.close();`;
 execFileSync(process.execPath,['-e',script],{cwd:h.ROOT,env:process.env});
});
