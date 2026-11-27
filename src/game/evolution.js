// Tier one only. Choices are permanent per Discord account + domain + root.
const {randomBytes}=require('node:crypto');
const db=()=>require('../db/database');
const tree=(name,a,b)=>({name,level:25,required:20,branches:{[a.id]:a,[b.id]:b}});
const branch=(id,name,desc,bonus)=>({id,name,desc,...bonus});
const TREES={
 class:{
  melee:tree('Chiến Binh',branch('guardian','Hộ Vệ','Mở Shield Riposte: 120% ATK và giảm 35% sát thương trực tiếp trong 1 lượt.',{skill:'shield_riposte'}),branch('berserker','Cuồng Chiến','Mở Frenzy Strike: 180% ATK; dưới 50% HP tăng 25% sát thương.',{skill:'frenzy_strike'})),
  magic:tree('Pháp Sư',branch('elementalist','Nguyên Tố Sư','Mở Elemental Weave: 150% ATK; tiêu Burn tăng 30% sát thương.',{skill:'elemental_weave'}),branch('hexer','Chú Thuật Sư','Mở Withering Hex: 110% ATK, giảm 15% ATK địch 3 lượt.',{skill:'withering_hex'})),
  ranged:tree('Cung Thủ',branch('sharpshooter','Thiện Xạ','Mở Precision Bolt: 180% ATK bỏ 35% DEF.',{skill:'precision_bolt'}),branch('hunter','Thợ Săn','Mở Snaring Shot: 130% ATK, tạo Dấu săn và giảm 20% ATK địch 2 lượt.',{skill:'snaring_shot'})),
 },
 job:{
  mining:tree('Mining',branch('vein_miner','Thợ Mạch Quặng','+3 điểm % cơ hội thêm 1 nguyên liệu thường; chung trần bonus nghề. Không nhân đồ hiếm thời tiết.',{extra:0.03}),branch('geologist','Nhà Địa Chất','+10% XP Mining, không nhân XP nhân vật.',{xp:0.10})),
  fishing:tree('Fishing',branch('net_fisher','Ngư Phủ','+3 điểm % cơ hội thêm 1 cá thường; chung trần bonus nghề. Không nhân cá hiếm thời tiết.',{extra:0.03}),branch('ichthyologist','Nhà Ngư Học','+10% XP Fishing.',{xp:0.10})),
  foraging:tree('Foraging',branch('herbalist','Dược Thảo Sư','+3 điểm % cơ hội thêm 1 nguyên liệu thường; chung trần bonus nghề. Không nhân cây hiếm thời tiết.',{extra:0.03}),branch('forest_keeper','Người Giữ Rừng','+10% XP Foraging.',{xp:0.10})),
  cooking:tree('Cooking',branch('chef','Bếp Trưởng','+3 điểm % cơ hội không tiêu nguyên liệu khi nấu, vẫn cần đủ nguyên liệu; chung trần bonus nghề.',{save:0.03}),branch('culinary_scholar','Học Giả Ẩm Thực','+10% XP Cooking.',{xp:0.10})),
  crafting:tree('Crafting',branch('smith','Thợ Rèn','+3 điểm % cơ hội không tiêu nguyên liệu khi chế, vẫn cần đủ nguyên liệu; chung trần bonus nghề.',{save:0.03}),branch('artisan','Nghệ Nhân','+10% XP Crafting.',{xp:0.10})),
 }
};
function migrate(){db().exec(`CREATE TABLE IF NOT EXISTS evolution_choices(user_id TEXT NOT NULL,domain TEXT NOT NULL,root TEXT NOT NULL,branch TEXT NOT NULL,chosen_at INTEGER NOT NULL,PRIMARY KEY(user_id,domain,root));
 CREATE TABLE IF NOT EXISTS evolution_progress(user_id TEXT NOT NULL,domain TEXT NOT NULL,root TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,domain,root));
 CREATE TABLE IF NOT EXISTS evolution_events(user_id TEXT NOT NULL,event_id TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
 CREATE TABLE IF NOT EXISTS evolution_trials(user_id TEXT NOT NULL,domain TEXT NOT NULL,root TEXT NOT NULL,branch TEXT NOT NULL,PRIMARY KEY(user_id,domain,root,branch));
 CREATE TABLE IF NOT EXISTS evolution_pending(user_id TEXT NOT NULL,domain TEXT NOT NULL,root TEXT NOT NULL,branch TEXT NOT NULL,token TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(user_id,domain,root));
 CREATE TRIGGER IF NOT EXISTS evolution_no_update BEFORE UPDATE ON evolution_choices BEGIN SELECT RAISE(ABORT,'Evolution choices are permanent'); END;
 CREATE TRIGGER IF NOT EXISTS evolution_no_delete BEFORE DELETE ON evolution_choices BEGIN SELECT RAISE(ABORT,'Evolution choices are permanent'); END;`);}
function definition(domain,root){return Object.hasOwn(TREES,domain)&&Object.hasOwn(TREES[domain],root)?TREES[domain][root]:null;}
function choice(user,domain,root){return db().prepare('SELECT branch FROM evolution_choices WHERE user_id=? AND domain=? AND root=?').get(user,domain,root)?.branch||null;}
function progress(user,domain,root){return db().prepare('SELECT amount FROM evolution_progress WHERE user_id=? AND domain=? AND root=?').get(user,domain,root)?.amount||0;}
function state(user,domain,root){
 const t=definition(domain,root);if(!t)return {error:'Cây không hợp lệ. Dùng class melee/magic/ranged hoặc job mining/fishing/foraging/cooking/crafting.'};
 const p=require('./player').getPlayer(user);let level=0;
 if(p)level=domain==='class'?(p.primary_class===root?p.level:require('./classes').getClassData(p)[root]?.level||0):require('./jobs').getJob(user,root).level;
 return {tree:t,level,progress:progress(user,domain,root),branch:choice(user,domain,root)};
}
function check(user,domain,root,branch){
 const s=state(user,domain,root),p=require('./player').getPlayer(user);
 if(s.error)return s.error;
 if(!branch||!Object.hasOwn(s.tree.branches,branch))return 'Nhánh không hợp lệ.';
 if(!p)return 'Cần tạo nhân vật trước.';
 if(s.branch)return `Đã khóa nhánh ${s.branch}, không thể chọn lại hoặc đổi nhánh.`;
 if(require('./skill_builds').inBattle(user))return 'Hãy kết thúc trận đang hoạt động trước.';
 if(domain==='class'&&p.primary_class!==root)return 'Cần chuyển sang đúng class gốc trước.';
 if(s.level<25||s.progress<20)return 'Cần Lv.25 đúng class/nghề và 20 hoạt động thành công sau khi tính năng ra mắt (hunt theo class hiện tại; nghề theo nghề tương ứng).';
 return null;
}
function act(user,action,domain,root,branch,token,now=Date.now()){
 return db().transaction(()=>{
  const error=check(user,domain,root,branch);if(error)return {error};
  const b=definition(domain,root).branches[branch];
  if(action==='trial'){
   // Standardized demonstration: no rewards, no HP/inventory/cooldown mutation.
   let demo=b.desc;
   if(b.skill){const r=require('./skills').getSkill(b.skill).resolve({atk:100,def:50,hp:400,max_hp:1000,buffs:{}},{atk:100,def:100,hp:1000,max_hp:1000,buffs:{}});demo=JSON.stringify(r);}
   db().prepare('INSERT OR IGNORE INTO evolution_trials VALUES(?,?,?,?)').run(user,domain,root,branch);return {demo,branch:b};
  }
  if(!db().prepare('SELECT 1 FROM evolution_trials WHERE user_id=? AND domain=? AND root=? AND branch=?').get(user,domain,root,branch))return {error:'Xem diễn tập nhánh bằng evolve trial trước khi chọn.'};
  if(action==='choose'){
   const code=randomBytes(5).toString('hex');db().prepare('INSERT INTO evolution_pending VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,domain,root) DO UPDATE SET branch=excluded.branch,token=excluded.token,expires=excluded.expires').run(user,domain,root,branch,code,now+600000);
   return {token:code,branch:b,locked:Object.keys(definition(domain,root).branches).filter(id=>id!==branch)};
  }
  if(action!=='confirm')return {error:'Thao tác không hợp lệ.'};
  const pending=db().prepare('SELECT * FROM evolution_pending WHERE user_id=? AND domain=? AND root=?').get(user,domain,root);
  if(!pending||pending.branch!==branch||pending.token!==token||pending.expires<=now)return {error:'Xác nhận sai hoặc hết hạn 10 phút. Hãy choose lại.'};
  db().prepare('INSERT INTO evolution_choices VALUES(?,?,?,?,?)').run(user,domain,root,branch,now);
  db().prepare('DELETE FROM evolution_pending WHERE user_id=? AND domain=? AND root=?').run(user,domain,root);
  return {branch:b,chosen:true};
 }).immediate();
}
function jobBonus(user,root,level){
 if(level<25)return {};
 const id=choice(user,'job',root);return id?definition('job',root)?.branches[id]||{}:{};
}
function recordAction(msg,kind){
 const id=msg._interaction?.id||msg.id;if(!id)return;
 try{db().transaction(()=>{
  const p=require('./player').getPlayer(msg.author.id);if(!p)return;
  const domain=kind==='hunt'?'class':'job',root=kind==='hunt'?p.primary_class:kind;
  if(!definition(domain,root))return;
  if(!db().prepare('INSERT OR IGNORE INTO evolution_events VALUES(?,?)').run(p.user_id,`${kind}:${id}`).changes)return;
  db().prepare('INSERT INTO evolution_progress VALUES(?,?,?,1) ON CONFLICT(user_id,domain,root) DO UPDATE SET amount=MIN(20,amount+1)').run(p.user_id,domain,root);
 }).immediate();}catch(e){console.error('[evolution progress]',e);}
}
module.exports={TREES,migrate,definition,choice,state,act,jobBonus,recordAction};
