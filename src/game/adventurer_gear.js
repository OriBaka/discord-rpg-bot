// New equipment lines use the existing stat ladder: more sources and identity,
// not power creep or new equipment slots. Seed once, including existing DBs.
const LINES = [
  { id:'dawnwatch', name:'Dawnwatch', lv:1, tier:'common', atk:5, mat:'copper_ingot', count:1, job:1, price:60, lore:'Trang bị của người gác đèn mới vào nghề, dễ sửa và vừa túi tiền.' },
  { id:'trailwarden', name:'Trailwarden', lv:12, tier:'rare', atk:14, mat:'iron_ingot', count:3, job:8, price:600, lore:'Trang bị của đội tuần đường dài, mang dấu những chuyến hộ tống qua hang đá.' },
  { id:'emberguard', name:'Emberguard', lv:25, tier:'epic', atk:26, mat:'iron_ingot', count:8, job:20, price:2400, lore:'Trang bị tôi bằng than nóng cho những người gác đường tới miền tro lửa.' },
];
const PIECES = [
  ['sword','Sword','weapon','melee','sword','',''],
  ['wand','Wand','weapon','magic','wand','',''],
  ['bow','Bow','weapon','ranged','bow','',''],
  ['helm','Helm','armor','','','head',''],
  ['coat','Coat','armor','','','chest',''],
  ['leggings','Leggings','armor','','','legs',''],
  ['boots','Boots','armor','','','feet',''],
  ['gloves','Gloves','armor','','','hands',''],
  ['shield','Shield','offhand','melee','shield','',''],
  ['focus','Focus','offhand','magic','orb','',''],
  ['quiver','Quiver','offhand','ranged','quiver','',''],
];
function migrate(retry = true) {
  const db=require('../db/database'); const ladder=require('./gear_ladder');
  if (!db.open) return;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='recipes'").get()) {
    if (retry) setTimeout(() => migrate(false), 0);
    return;
  }
  db.exec('CREATE TABLE IF NOT EXISTS beginner_supplies (user_id TEXT PRIMARY KEY, claimed_at INTEGER NOT NULL)');
  db.transaction(()=>{
    if(db.prepare('SELECT 1 FROM meta WHERE key=?').get('adventurer_gear_v1'))return;
    for(const line of LINES) for(const [suffix,name,type,cls,weapon,slot,acc] of PIECES){
      const id=line.id+'_'+suffix;
      const atk=type==='weapon'?line.atk:type==='offhand'?ladder.offhandValue(line.lv):0;
      const def=type==='armor'?ladder.armorDef(slot,line.lv):type==='offhand'?ladder.offhandValue(line.lv):0;
      const price=line.lv===1?(slot==='chest'?80:type==='armor'?55:type==='weapon'?100:90):line.price;
      db.prepare(`INSERT OR IGNORE INTO items
        (id,name,type,tier,atk,def,price,sell,desc,min_level,class_req,weapon_type,armor_type,armor_slot,accessory_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,line.name+' '+name,type,line.tier,atk,def,price,Math.floor(price*0.25),line.lore,line.lv,cls,weapon,type==='armor'?'light':'',slot,acc);
      // Dawnwatch offers a complete 300-gold armor set. Later lines are earned
      // through crafting, preserving meaningful NPC-vs-player supply choices.
      if(line.lv===1) db.prepare('INSERT OR IGNORE INTO shop(item_id,price) VALUES (?,?)').run(id,price);
      db.prepare(`INSERT OR IGNORE INTO recipes(id,name,type,job_type,min_job_level,inputs,output_id,output_qty,xp_gain,desc,created_by,created_at)
        VALUES (?,?,'craft','crafting',?,?,?,1,?,?, 'system',?)`).run('recipe_'+id,'Forge '+line.name+' '+name,line.job,JSON.stringify([{item_id:line.mat,qty:line.count},{item_id:'wolf_fang',qty:line.lv===1?1:2}]),id,line.lv===1?8:line.lv===12?20:40,line.lore,Date.now());
    }
    db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('adventurer_gear_v1','1');
  })();
}
function claimSupplies(user){
  const db=require('../db/database');
  return db.transaction(()=>{
    const p=db.prepare('SELECT level FROM players WHERE user_id=?').get(user);
    if(!p || p.level>5)return false;
    if(!db.prepare('INSERT OR IGNORE INTO beginner_supplies VALUES (?,?)').run(user,Date.now()).changes)return false;
    require('./player').addItem(user,'potion_s',3);
    return true;
  })();
}
module.exports={LINES,PIECES,migrate,claimSupplies};
