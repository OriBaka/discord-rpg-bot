// Source-exclusive sidegrades. No new slots, hidden buffs, or divine artifacts.
const CRAFT_LINES = [
  { id: 'runeforged', name: 'Runeforged', lv: 30, atk: 34, tier: 'epic', job: 25, ingots: 4, material: 'gem_ruby', qty: 2 },
  { id: 'rimeforged', name: 'Rimeforged', lv: 40, atk: 48, tier: 'legendary', job: 35, ingots: 7, material: 'dragon_scale', qty: 3 },
  { id: 'starforged', name: 'Starforged', lv: 45, atk: 62, tier: 'legendary', job: 45, ingots: 10, material: 'dragon_bone', qty: 4 },
];
const TROPHIES = [
  { id: 'trophy_cinder_ring', name: 'Cinder Trophy Ring', lv: 25, tier: 'epic', slot: 'ring', mob: 'ember_phoenix', chance: 0.06 },
  { id: 'trophy_obsidian_pendant', name: 'Obsidian Trophy Pendant', lv: 25, tier: 'epic', slot: 'necklace', mob: 'obsidian_golem', chance: 0.05 },
  { id: 'trophy_abyss_pendant', name: 'Abyss Trophy Pendant', lv: 30, tier: 'epic', slot: 'necklace', mob: 'abyss_leviathan', chance: 0.08 },
  { id: 'trophy_glacier_sigil', name: 'Glacier Trophy Sigil', lv: 30, tier: 'epic', slot: 'special', mob: 'glacier_wyrm', chance: 0.05 },
  { id: 'trophy_void_pendant', name: 'Void Trophy Pendant', lv: 40, tier: 'legendary', slot: 'necklace', mob: 'void_harbinger', chance: 0.05 },
  { id: 'trophy_star_ring', name: 'Star Trophy Ring', lv: 45, tier: 'legendary', slot: 'ring', mob: 'star_devourer', chance: 0.08 },
];
function migrate(retry = true) {
  const db = require('../db/database');
  if (!db.open) return;
  // recipes can itself be the first module importing database during startup.
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='recipes' AND type='table'").get()) {
    if (retry) setTimeout(() => migrate(false), 0);
    return;
  }
  const ladder = require('./gear_ladder');
  const { PIECES } = require('./adventurer_gear');
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM meta WHERE key=?').get('exclusive_gear_v1')) return;
    const insert = db.prepare(`INSERT INTO items
      (id,name,type,tier,atk,def,price,sell,desc,min_level,class_req,weapon_type,armor_type,armor_slot,accessory_type)
      VALUES (@id,@name,@type,@tier,@atk,@def,0,@sell,@desc,@lv,@cls,@weapon,@armor,@slot,@acc)`);
    for (const line of CRAFT_LINES) {
      for (const [suffix, name, type, cls, weapon, slot] of PIECES) {
        const id = `${line.id}_${suffix}`;
        const desc = `Trang bị ${line.name} do thợ rèn chế tác; chỉ chế tạo, không bán NPC hay rơi từ quái. Không có thưởng bộ.`;
        insert.run({ id, name: `${line.name} ${name}`, type, tier: line.tier,
          atk: type === 'weapon' ? line.atk : type === 'offhand' ? ladder.offhandValue(line.lv) : 0,
          def: type === 'armor' ? ladder.armorDef(slot, line.lv) : type === 'offhand' ? ladder.offhandValue(line.lv) : 0,
          sell: line.ingots * 100, desc, lv: line.lv, cls, weapon, armor: type === 'armor' ? 'light' : '', slot, acc: '' });
        db.prepare(`INSERT INTO recipes
          (id,name,type,job_type,min_job_level,inputs,output_id,output_qty,xp_gain,desc,created_by,created_at)
          VALUES (?,?,'craft','crafting',?,?,?,1,?,?,'system',?)`).run(
          `recipe_${id}`, `Forge ${line.name} ${name}`, line.job,
          JSON.stringify([{ item_id: 'mithril_ingot', qty: line.ingots }, { item_id: line.material, qty: line.qty }]),
          id, line.job * 5, desc, Date.now());
      }
    }
    for (const t of TROPHIES) {
      // Fail atomically if a source is misspelled: never seed unobtainable loot.
      if (!db.prepare('SELECT 1 FROM monsters WHERE id=?').get(t.mob)) throw new Error(`Missing trophy source: ${t.mob}`);
      insert.run({ id: t.id, name: t.name, type: 'accessory', tier: t.tier,
        atk: ladder.accValue(t.lv), def: ladder.accValue(t.lv), sell: t.lv * 30,
        desc: `Chiến lợi phẩm từ ${t.mob}; chỉ rơi khi săn quái này, không bán NPC hay chế tạo. Không có hiệu ứng ẩn.`,
        lv: t.lv, cls: '', weapon: '', armor: '', slot: '', acc: t.slot });
      db.prepare('INSERT INTO monster_drops(monster_id,item_id,chance,qty) VALUES (?,?,?,1)').run(t.mob, t.id, t.chance);
    }
    db.prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('exclusive_gear_v1', '1');
  })();
}
module.exports = { CRAFT_LINES, TROPHIES, migrate };
