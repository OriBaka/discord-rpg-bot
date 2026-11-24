const db=()=>require('../db/database');
function migrate(){db().exec(`CREATE TABLE IF NOT EXISTS weather_alerts(
 guild_id TEXT NOT NULL,user_id TEXT NOT NULL,weather TEXT NOT NULL,period TEXT NOT NULL,
 matched INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,weather,period));`);}
const WEATHERS=['any','clear','rain','storm','fog','snow'], PERIODS=['any','day','night'];
function matches(r,s){return (r.weather==='any'||r.weather===s.weather)&&(r.period==='any'||r.period===s.period);}
function manage(guild,user,action,weather,period){
 if(action==='list')return db().prepare('SELECT weather,period FROM weather_alerts WHERE guild_id=? AND user_id=? ORDER BY weather,period').all(guild,user);
 if(action==='off'){db().prepare('DELETE FROM weather_alerts WHERE guild_id=? AND user_id=?').run(guild,user);return;}
 if(!['add','remove'].includes(action)||!WEATHERS.includes(weather)||!PERIODS.includes(period)||weather==='any'&&period==='any')throw new Error('Chọn clear/rain/storm/fog/snow/any và day/night/any (không dùng any any).');
 if(action==='remove')db().prepare('DELETE FROM weather_alerts WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(guild,user,weather,period);
 else db().prepare('INSERT OR IGNORE INTO weather_alerts(guild_id,user_id,weather,period) VALUES(?,?,?,?)').run(guild,user,weather,period);
}
// Called by the existing serialized 30-second weather worker. Independent of bulletin last_key.
async function notify(client,state){
 for(const sub of db().prepare('SELECT * FROM weather_channels').all()){
  const rows=db().prepare('SELECT * FROM weather_alerts WHERE guild_id=?').all(sub.guild_id);
  const due=[];
  for(const r of rows){
   if(!matches(r,state))db().prepare('UPDATE weather_alerts SET matched=0 WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(r.guild_id,r.user_id,r.weather,r.period);
   else if(!r.matched)due.push(r);
  }
  if(!due.length)continue;
  try{
   const channel=await client.channels.fetch(sub.channel_id);
   if(!channel||channel.guildId!==sub.guild_id||!channel.isTextBased()||typeof channel.send!=='function')continue;
   const users=[...new Set(due.map(r=>r.user_id))];
   // 40 snowflake mentions stay well below Discord's 2,000 characters / 100 mentions limit.
   for(let i=0;i<users.length;i+=40){
    const batch=users.slice(i,i+40);
    // Re-read opt-ins after asynchronous channel fetch and previous sends (unsubscribe may race).
    const live=due.filter(r=>batch.includes(r.user_id)&&db().prepare('SELECT 1 FROM weather_alerts WHERE guild_id=? AND user_id=? AND weather=? AND period=? AND matched=0').get(r.guild_id,r.user_id,r.weather,r.period));
    const ids=[...new Set(live.map(r=>r.user_id))];if(!ids.length)continue;
    await channel.send({content:`🔔 Điều kiện thời tiết bạn theo dõi đã xuất hiện!\n${require('./world_weather').describe(state)}\n${ids.map(id=>`<@${id}>`).join(' ')}\nDùng weather watch list/off để xem hoặc tắt nhắc tại server này.`,allowedMentions:{parse:[],users:ids}});
    db().transaction(()=>{for(const r of live)db().prepare('UPDATE weather_alerts SET matched=1 WHERE guild_id=? AND user_id=? AND weather=? AND period=?').run(r.guild_id,r.user_id,r.weather,r.period);})();
   }
  }catch(e){console.error('[weather alerts]',sub.guild_id,e.message);}
 }
}
module.exports={migrate,matches,manage,notify};
