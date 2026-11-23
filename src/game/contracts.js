const { randomBytes } = require('node:crypto');
const DAY=86400000;
const GOALS=Object.freeze({hunt:10,fishing:10,mining:10,foraging:10});
function migrate(){require('../db/database').exec(`
 CREATE TABLE IF NOT EXISTS coop_contracts(id TEXT PRIMARY KEY,leader TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS coop_members(contract_id TEXT NOT NULL,user_id TEXT NOT NULL,joined INTEGER NOT NULL,points INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(contract_id,user_id));
 CREATE INDEX IF NOT EXISTS coop_user ON coop_members(user_id,joined);
 CREATE TABLE IF NOT EXISTS coop_progress(contract_id TEXT NOT NULL,kind TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(contract_id,kind));
 CREATE TABLE IF NOT EXISTS coop_events(user_id TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
 CREATE TABLE IF NOT EXISTS coop_rewards(contract_id TEXT NOT NULL,user_id TEXT NOT NULL,merit INTEGER NOT NULL,PRIMARY KEY(contract_id,user_id));`);}
function createService(db,clock=Date.now){
 const atomic=fn=>db.transaction(fn).immediate();
 const fail=s=>{throw new Error(s);};
 function expire(){db.prepare("UPDATE coop_contracts SET status='expired' WHERE status IN ('recruiting','active') AND expires<=?").run(clock());}
 function current(u){return db.prepare("SELECT c.* FROM coop_contracts c JOIN coop_members m ON m.contract_id=c.id WHERE m.user_id=? AND c.status IN ('recruiting','active') ORDER BY c.created DESC LIMIT 1").get(u);}
 function view(id){const c=db.prepare('SELECT * FROM coop_contracts WHERE id=?').get(id);if(!c)return null;return {...c,members:db.prepare('SELECT user_id,points FROM coop_members WHERE contract_id=? ORDER BY joined,user_id').all(id),progress:db.prepare('SELECT kind,amount FROM coop_progress WHERE contract_id=?').all(id),rewards:db.prepare('SELECT user_id,merit FROM coop_rewards WHERE contract_id=?').all(id)};}
 function canJoin(u){
  if(!db.prepare('SELECT 1 FROM players WHERE user_id=?').get(u))fail('Cần tạo nhân vật trước.');
  if(current(u))fail('Bạn đang có hợp đồng chưa kết thúc.');
  if(db.prepare('SELECT 1 FROM coop_members WHERE user_id=? AND joined>?').get(u,clock()-DAY))fail('Mỗi người tham gia hợp đồng tối đa một lần mỗi 24 giờ (kể cả hủy/hết hạn).');
 }
 function act(u,action,id){atomic(expire);return atomic(()=>{
  if(action==='profile'){
   const row=db.prepare('SELECT COALESCE(SUM(merit),0) merit,COUNT(*) completed FROM coop_rewards WHERE user_id=?').get(u);
   return {...row,badge:row.completed>=25?'Trụ Cột Đồng Đội':row.completed>=10?'Bạn Đồng Hành':row.completed>=1?'Chung Sức':'Chưa có'};
  }
  if(action==='create'){
   canJoin(u);let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(view(code));
   db.prepare("INSERT INTO coop_contracts VALUES(?,?,'recruiting',?,?)").run(code,u,clock(),clock()+DAY);
   db.prepare('INSERT INTO coop_members(contract_id,user_id,joined) VALUES(?,?,?)').run(code,u,clock());
   for(const kind of Object.keys(GOALS))db.prepare('INSERT INTO coop_progress(contract_id,kind) VALUES(?,?)').run(code,kind);
   return view(code);
  }
  const c=id?db.prepare('SELECT * FROM coop_contracts WHERE id=?').get(String(id).toUpperCase()):current(u)||db.prepare('SELECT c.* FROM coop_contracts c JOIN coop_members m ON m.contract_id=c.id WHERE m.user_id=? ORDER BY c.rowid DESC LIMIT 1').get(u);
  if(!c)fail('Chưa có hợp đồng. Dùng contract create hoặc contract join <mã>.');
  const members=view(c.id).members;
  if(action==='status')return view(c.id);
  if(action==='join'){
   if(c.status!=='recruiting' || members.length>=4)fail('Đội đã khóa hoặc đủ 4 người.');
   canJoin(u);db.prepare('INSERT INTO coop_members(contract_id,user_id,joined) VALUES(?,?,?)').run(c.id,u,clock());return view(c.id);
  }
  if(c.leader!==u)fail('Chỉ trưởng đội được bắt đầu/hủy.');
  if(c.status!=='recruiting')fail('Đội đã khóa; không hủy, đổi người hoặc bắt đầu lại.');
  if(action==='start'){
   if(members.length<2)fail('Cần ít nhất 2 người để bắt đầu.');
   db.prepare("UPDATE coop_contracts SET status='active' WHERE id=?").run(c.id);return view(c.id);
  }
  if(action==='cancel'){db.prepare("UPDATE coop_contracts SET status='cancelled' WHERE id=?").run(c.id);return view(c.id);}
  fail('Thao tác không hợp lệ.');
 });}
 function record(u,eventId,kind){return atomic(()=>{
  expire();if(!eventId||!Object.hasOwn(GOALS,kind))return null;
  const c=current(u);if(!c || c.status!=='active')return null;
  const inserted=db.prepare('INSERT OR IGNORE INTO coop_events VALUES(?,?)').run(u,eventId);if(!inserted.changes)return null;
  const p=db.prepare('SELECT amount FROM coop_progress WHERE contract_id=? AND kind=?').get(c.id,kind);
  if(p.amount>=GOALS[kind] || db.prepare('SELECT points FROM coop_members WHERE contract_id=? AND user_id=?').get(c.id,u).points>=20)return null;
  db.prepare('UPDATE coop_progress SET amount=amount+1 WHERE contract_id=? AND kind=?').run(c.id,kind);
  db.prepare('UPDATE coop_members SET points=points+1 WHERE contract_id=? AND user_id=?').run(c.id,u);
  const v=view(c.id);
  if(v.progress.every(p=>p.amount>=GOALS[p.kind]) && v.members.filter(m=>m.points>0).length>=2){
   db.prepare("UPDATE coop_contracts SET status='completed' WHERE id=?").run(c.id);
   for(const m of v.members.filter(m=>m.points>0))db.prepare('INSERT INTO coop_rewards VALUES(?,?,?)').run(c.id,m.user_id,m.points*5);
  }
  return view(c.id);
 });}
 return {act,record};
}
let service;
function getService(){return service ||= createService(require('../db/database'));}
// Hooks use successful gameplay only, not inventory grants/admin commands.
function recordAction(msg,kind){
 const id=msg._interaction?.id || msg.id;
 if(!id)return null;
 try{return getService().record(msg.author.id,`${kind}:${id}`,kind);}catch(e){console.error('[contract hook]',e);return null;}
}
module.exports={migrate,GOALS,createService,getService,recordAction};
