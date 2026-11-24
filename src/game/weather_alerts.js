const db=()=>require('../db/database');
function migrate(){db().exec(`CREATE TABLE IF NOT EXISTS weather_alerts(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,weather TEXT NOT NULL,period TEXT NOT NULL,
 matched INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,weather,period));
 CREATE TABLE IF NOT EXISTS weather_alert_channels(guild_id TEXT PRIMARY KEY,channel_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS weather_alert_roles(guild_id TEXT NOT NULL,weather TEXT NOT NULL,period TEXT NOT NULL,role_id TEXT NOT NULL,matched INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,weather,period));`);
 if(!db().prepare('PRAGMA table_info(weather_alerts)').all().some(c=>c.name==='role_synced'))db().exec('ALTER TABLE weather_alerts ADD COLUMN role_synced INTEGER NOT NULL DEFAULT 0');
}
const WEATHERS=['any','clear','rain','storm','fog','snow'], PERIODS=['any','day','night'];
function matches(r,s){return (r.weather==='any'||r.weather===s.weather)&&(r.period==='any'||r.period===s.period);}
function manage(guild,user,action,weather,period){
 if(action==='list')return db().prepare('SELECT weather,period FROM weather_alerts WHERE guild_id=? AND user_id=? ORDER BY weather,period').all(guild,user);
 if(action==='off'){db().prepare('DELETE FROM weather_alerts WHERE guild_id=? AND user_id=?').run(guild,user);return;}
 if(!['add','remove'].includes(action)||!WEATHERS.includes(weather)||!PERIODS.includes(period)||weather==='any'&&period==='any')throw new Error('Chọn clear/rain/storm/fog/snow/any và day/night/any (không dùng any any).');
 if(action==='remove')db().prepare('DELETE FROM weather_alerts WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(guild,user,weather,period);
 else db().prepare('INSERT OR IGNORE INTO weather_alerts(guild_id,user_id,weather,period) VALUES(?,?,?,?)').run(guild,user,weather,period);
}
// Never reuse arbitrary named roles: only bot-created, persisted IDs with no permissions.
const locks=new Map();
async function locked(guild,fn){
 const previous=locks.get(guild)||Promise.resolve();
 const work=previous.catch(()=>{}).then(fn);locks.set(guild,work);
 try{return await work;}finally{if(locks.get(guild)===work)locks.delete(guild);}
}
async function ensureRole(guild,weather,period){
 const row=db().prepare('SELECT * FROM weather_alert_roles WHERE guild_id=? AND weather=? AND period=?').get(guild.id,weather,period);
 let role=null;
 if(row){try{role=await guild.roles.fetch(row.role_id);}catch(e){if(e.code!==10011)throw e;}}
 if(role){
  if(!role.editable || role.managed || role.permissions.bitfield!==0n || role.mentionable)throw new Error('Role cảnh báo bị sửa quyền/mentionable hoặc nằm cao hơn bot. Cần role không quyền, không mentionable, dưới role bot.');
  return role;
 }
 role=await guild.roles.create({name:`Weather · ${weather} · ${period}`,permissions:[],mentionable:false,reason:'Opt-in weather condition alerts'});
 db().prepare('INSERT INTO weather_alert_roles(guild_id,weather,period,role_id) VALUES(?,?,?,?) ON CONFLICT(guild_id,weather,period) DO UPDATE SET role_id=excluded.role_id,matched=0').run(guild.id,weather,period,role.id);
 db().prepare('UPDATE weather_alerts SET role_synced=0 WHERE guild_id=? AND weather=? AND period=?').run(guild.id,weather,period);
 return role;
}
async function change(guild,user,action,weather,period){return locked(guild.id,async()=>{
 if(action==='list')return manage(guild.id,user,action);
 if(action==='add'){
  if(!WEATHERS.includes(weather)||!PERIODS.includes(period)||weather==='any'&&period==='any')throw new Error('Điều kiện không hợp lệ; dùng clear/rain/storm/fog/snow/any và day/night/any.');
  const role=await ensureRole(guild,weather,period);
  const member=await guild.members.fetch(user);await member.roles.add(role,'Player opted into weather alerts');
  manage(guild.id,user,'add',weather,period);
  db().prepare('UPDATE weather_alerts SET role_synced=1 WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(guild.id,user,weather,period);
 }else{
  const rows=manage(guild.id,user,'list').filter(r=>action==='off'||r.weather===weather&&r.period===period);
  const member=await guild.members.fetch(user);
  for(const r of rows){
   const role=db().prepare('SELECT role_id FROM weather_alert_roles WHERE guild_id=? AND weather=? AND period=?').get(guild.id,r.weather,r.period);
   let existing=null;
   if(role){try{existing=await guild.roles.fetch(role.role_id);}catch(e){if(e.code!==10011)throw e;}}
   if(existing)await member.roles.remove(role.role_id,'Player opted out of weather alerts');
   manage(guild.id,user,'remove',r.weather,r.period);
   if(!db().prepare('SELECT 1 FROM weather_alerts WHERE guild_id=? AND weather=? AND period=?').get(guild.id,r.weather,r.period))db().prepare('UPDATE weather_alert_roles SET matched=0 WHERE guild_id=? AND weather=? AND period=?').run(guild.id,r.weather,r.period);
  }
 }
});}
// Existing subscriptions migrate lazily after an admin configures the separate channel.
async function notify(client,state){
 for(const sub of db().prepare('SELECT * FROM weather_alert_channels').all()){
  try{await locked(sub.guild_id,async()=>{
   const channel=await client.channels.fetch(sub.channel_id);
   if(!channel||channel.guildId!==sub.guild_id||!channel.isTextBased()||typeof channel.send!=='function')return;
   if(!channel.permissionsFor(client.user)?.has(['ViewChannel','SendMessages','MentionEveryone']))return;
   const guild=channel.guild;
   const groups=db().prepare('SELECT DISTINCT weather,period FROM weather_alerts WHERE guild_id=?').all(sub.guild_id);
   const due=[];
   for(const group of groups){
    try{
     const role=await ensureRole(guild,group.weather,group.period);
     for(const r of db().prepare('SELECT user_id FROM weather_alerts WHERE guild_id=? AND weather=? AND period=? AND role_synced=0').all(sub.guild_id,group.weather,group.period)){
      try{
       const member=await guild.members.fetch(r.user_id);await member.roles.add(role,'Migrate weather alert subscription');
       db().prepare('UPDATE weather_alerts SET role_synced=1 WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(sub.guild_id,r.user_id,group.weather,group.period);
      }catch(e){if(e.code===10007)manage(sub.guild_id,r.user_id,'remove',group.weather,group.period);else throw e;}
     }
     const row=db().prepare('SELECT * FROM weather_alert_roles WHERE guild_id=? AND weather=? AND period=?').get(sub.guild_id,group.weather,group.period);
     if(!matches(group,state))db().prepare('UPDATE weather_alert_roles SET matched=0 WHERE role_id=?').run(role.id);
     else if(!row.matched && db().prepare('SELECT 1 FROM weather_alerts WHERE guild_id=? AND weather=? AND period=? AND role_synced=1').get(sub.guild_id,group.weather,group.period))due.push(role.id);
    }catch(e){console.error('[weather alert role]',sub.guild_id,e.message);}
   }
   // At most 17 condition roles; never a list of user mentions.
   if(due.length){
    await channel.send({content:`🔔 Điều kiện đang xuất hiện!\n${require('./world_weather').describe(state)}\n${due.map(id=>`<@&${id}>`).join(' ')}\nDùng weather watch list/off để quản lý nhắc.`,allowedMentions:{parse:[],roles:due,users:[]}});
    db().transaction(()=>{for(const id of due)db().prepare('UPDATE weather_alert_roles SET matched=1 WHERE role_id=?').run(id);})();
   }
  });}catch(e){console.error('[weather alerts]',sub.guild_id,e.message);}
 }
}
module.exports={migrate,matches,manage,change,notify};
