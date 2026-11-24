const {test,before}=require('node:test');const assert=require('node:assert/strict');const h=require('./harness');
let db,alerts,commands,world;
before(()=>{h.quiet();db=require('../src/db/database');alerts=require('../src/game/weather_alerts');world=require('../src/game/world_weather');commands=h.loadCommands();h.loud();});
function setup(){db.exec('DELETE FROM weather_alerts; DELETE FROM weather_alert_channels; DELETE FROM weather_alert_roles; DELETE FROM weather_channels;');let next=100;const roles=new Map(),members=new Map(),sent=[];const guild={id:'GUILD1',ownerId:'OWNER',roles:{fetch:async id=>roles.get(id)||null,create:async opts=>{assert.deepEqual(opts.permissions,[]);assert.equal(opts.mentionable,false);const role={id:String(++next),editable:true,managed:false,mentionable:false,permissions:{bitfield:0n}};roles.set(role.id,role);return role;}},members:{fetchMe:async()=>({permissions:{has:()=>true}}),fetch:async id=>{if(!members.has(id))members.set(id,new Set());return {roles:{add:async role=>members.get(id).add(role.id),remove:async roleId=>members.get(id).delete(roleId)}};}}};const channel={id:'222',guildId:guild.id,guild,isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),send:async p=>sent.push(p)};const client={user:{id:'BOT'},channels:{fetch:async()=>channel}};db.prepare('INSERT INTO weather_alert_channels VALUES(?,?)').run(guild.id,channel.id);return {guild,channel,client,roles,members,sent};}
const state=(weather='rain',period='night')=>({weather,period,hour:20,minute:0});
test('AND/wildcard matching and validation remain unchanged',()=>{setup();assert.equal(alerts.matches({weather:'rain',period:'night'},state()),true);assert.equal(alerts.matches({weather:'rain',period:'day'},state()),false);assert.equal(alerts.matches({weather:'any',period:'night'},state()),true);assert.throws(()=>alerts.manage('A','U','add','any','any'));});
test('role per condition reused across users; opt-out removes only owned role and own preference',async()=>{
 const f=setup();await alerts.change(f.guild,'U','add','rain','night');await alerts.change(f.guild,'V','add','rain','night');assert.equal(f.roles.size,1);assert.deepEqual([...f.members.get('U')],[...f.members.get('V')]);
 await alerts.change(f.guild,'U','remove','rain','night');assert.equal(f.members.get('U').size,0);assert.equal(f.members.get('V').size,1);assert.equal(alerts.manage('GUILD1','V','list').length,1);
 await alerts.change(f.guild,'V','off');assert.equal(f.members.get('V').size,0);assert.equal(alerts.manage('GUILD1','V','list').length,0);
});
test('large groups ping condition role once with no individual mentions or bulletin dependency',async()=>{
 const f=setup();for(let i=0;i<100;i++)alerts.manage('GUILD1',String(i),'add','rain','night');
 await alerts.notify(f.client,state());assert.equal(f.sent.length,1);assert.equal(f.roles.size,1);assert.equal(f.members.size,100);
 assert.equal(f.sent[0].allowedMentions.roles.length,1);assert.deepEqual(f.sent[0].allowedMentions.users,[]);assert.deepEqual(f.sent[0].allowedMentions.parse,[]);assert.ok(f.sent[0].content.length<500);assert.match(f.sent[0].content,/<@&/);
 await alerts.notify(f.client,{...state(),revision:999});assert.equal(f.sent.length,1);
 await alerts.notify(f.client,state('clear','day'));await alerts.notify(f.client,state());assert.equal(f.sent.length,2);
});
test('new subscriber in already-notified group does not ping all members again',async()=>{
 const f=setup();await alerts.change(f.guild,'U','add','rain','night');await alerts.notify(f.client,state());
 await alerts.change(f.guild,'V','add','rain','night');await alerts.notify(f.client,state());assert.equal(f.sent.length,1);assert.equal(f.members.get('V').size,1);
});
test('legacy subscriptions sync lazily, deleted roles recreate safely; failed send retries',async()=>{
 const f=setup();alerts.manage('GUILD1','OLD','add','rain','night');await alerts.notify(f.client,state());assert.equal(f.members.get('OLD').size,1);
 f.roles.clear();await alerts.notify(f.client,state());assert.equal(f.roles.size,1);assert.equal(f.sent.length,2);
 await alerts.notify(f.client,state('clear','day'));const old=f.channel.send;f.channel.send=async()=>{throw Error('offline');};const log=console.error;console.error=()=>{};try{await alerts.notify(f.client,state());}finally{console.error=log;f.channel.send=old;}
 assert.equal(f.sent.length,2);await alerts.notify(f.client,state());assert.equal(f.sent.length,3);
});
test('missing channel or permissions and cross guild never ping; bulletin channel does not receive alerts',async()=>{
 const f=setup();alerts.manage('GUILD1','U','add','rain','night');
 f.channel.guildId='OTHER';await alerts.notify(f.client,state());assert.equal(f.sent.length,0);
 f.channel.guildId='GUILD1';f.channel.permissionsFor=()=>({has:()=>false});await alerts.notify(f.client,state());assert.equal(f.sent.length,0);
 db.prepare('DELETE FROM weather_alert_channels').run();db.prepare('INSERT INTO weather_channels(guild_id,channel_id) VALUES(?,?)').run('GUILD1','222');await alerts.notify(f.client,state());assert.equal(f.sent.length,0);
});
test('modified privileged role is never assigned, role-add failure does not save false success',async()=>{
 const f=setup();await alerts.change(f.guild,'U','add','rain','night');[...f.roles.values()][0].permissions.bitfield=8n;
 await assert.rejects(()=>alerts.change(f.guild,'V','add','rain','night'),/Role cảnh báo/);assert.equal(alerts.manage('GUILD1','V','list').length,0);
 [...f.roles.values()][0].permissions.bitfield=0n;const old=f.guild.members.fetch;f.guild.members.fetch=async()=>({roles:{add:async()=>{throw Error('role error');}}});
 await assert.rejects(()=>alerts.change(f.guild,'V','add','rain','night'),/role error/);assert.equal(alerts.manage('GUILD1','V','list').length,0);f.guild.members.fetch=old;
});
test('command channel permission checks, separate channels, self-service and slash routing',async()=>{
 const f=setup();db.prepare('DELETE FROM weather_alert_channels').run();const m=h.fakeMessage('U',{admin:false});m.guild=f.guild;m.client=f.client;
 await commands.get('weather').execute(m,['watch','channel','222']);assert.match(m._text(),/Cần Manage Server/);
 m.member.permissions.has=()=>true;await commands.get('weather').execute(m,['watch','channel','222']);assert.match(m._text(),/Kênh ping role riêng/);
 await commands.get('weather').execute(m,['channel','222']);assert.match(m._text(),/phải khác/);
 await commands.get('weather').execute(m,['watch','add','mua','dem']);assert.equal(f.members.get('U').size,1);
 await commands.get('weather').execute(m,['watch','list']);assert.match(m._text(),/ban đêm/);
 await commands.get('weather').execute(m,['watch','off']);assert.equal(f.members.get('U').size,0);
 const slash=require('../src/slash/definitions').definitions.find(d=>d.data.name==='weather');assert.deepEqual(slash.handler.extractArgs({options:{getString:()=> 'watch add any day'}}),['watch','add','any','day']);
});
test('channel setup cannot use bulletin channel; does not change bulletin config',async()=>{
 const f=setup();db.prepare('INSERT INTO weather_channels(guild_id,channel_id) VALUES(?,?)').run('GUILD1','222');const m=h.fakeMessage('OWNER');m.guild=f.guild;m.client=f.client;
 await commands.get('weather').execute(m,['watch','channel','222']);assert.match(m._text(),/khác kênh bản tin/);assert.equal(db.prepare('SELECT channel_id FROM weather_channels').get().channel_id,'222');
});
test('serialized simultaneous subscriptions create exactly one role for same condition',async()=>{
 const f=setup();await Promise.all(['A','B','C'].map(u=>alerts.change(f.guild,u,'add','snow','any')));assert.equal(f.roles.size,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM weather_alerts').get().n,3);
});
test('role mapping and matched marker survive actual process restart',async()=>{
 const f=setup();await alerts.change(f.guild,'PERSIST','add','snow','night');await alerts.notify(f.client,state('snow','night'));
 const {execFileSync}=require('node:child_process');execFileSync(process.execPath,['-e',`const db=require('./src/db/database');const r=db.prepare("SELECT * FROM weather_alert_roles WHERE weather='snow'").get();if(!r||r.matched!==1||!db.prepare("SELECT role_synced FROM weather_alerts WHERE user_id='PERSIST'").get().role_synced)process.exit(2);db.close();`],{cwd:h.ROOT,env:process.env});
});
test('failed opt-out leaves subscription for retry; deleted role does not prevent opt-out',async()=>{
 const f=setup();await alerts.change(f.guild,'U','add','rain','night');
 const original=f.guild.members.fetch;
 f.guild.members.fetch=async()=>({roles:{remove:async()=>{throw Error('forbidden');}}});
 await assert.rejects(()=>alerts.change(f.guild,'U','off'),/forbidden/);assert.equal(alerts.manage('GUILD1','U','list').length,1);
 f.guild.members.fetch=original;f.guild.roles.fetch=async()=>{const e=Error('Unknown Role');e.code=10011;throw e;};
 await alerts.change(f.guild,'U','off');assert.equal(alerts.manage('GUILD1','U','list').length,0);
});
