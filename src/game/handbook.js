// Public catalog only: never expose player inventories, event codes or admin settings.
function parseInputs(value) { try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch { return []; } }
function search(db, query, limit = 20, offset = 0) {
  const q = String(query).trim().slice(0, 80);
  const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  return db.prepare("SELECT id,name,type,tier FROM items WHERE id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' ORDER BY id LIMIT ? OFFSET ?").all(like, like, limit, offset);
}
function lookup(db, id) {
  const item = db.prepare('SELECT id,name,type,tier,desc,sell FROM items WHERE id=?').get(id);
  if (!item) return null;
  const sources = [];
  const tome = require('./skill_tomes').fromBook(id);
  if (tome?.source.kind === 'event') sources.push('Sự kiện limited do admin server mở · skills events / skills claim <id>; không có nguồn thường trực.');
  const shop = db.prepare('SELECT price FROM shop WHERE item_id=?').get(id);
  if (shop) sources.push(`Shop: ${shop.price} vàng/món · buy ${id}`);
  for (const r of db.prepare(`SELECT m.id,m.name,z.name zone,d.chance,d.qty FROM monster_drops d JOIN monsters m ON m.id=d.monster_id JOIN zones z ON z.id=m.zone_id WHERE d.item_id=? ORDER BY z.min_level,m.id`).all(id)) sources.push(`Săn ${r.name} (${r.zone}): ${(r.chance * 100).toFixed(1)}% ×${r.qty} · hunt ${r.id}`);
  for (const r of db.prepare(`SELECT z.id,z.name,z.min_job_level,z.job_type,d.chance,d.qty_min,d.qty_max FROM gather_drops d JOIN gather_zones z ON z.id=d.zone_id WHERE d.item_id=? ORDER BY z.min_job_level,z.id`).all(id)) sources.push(`${r.name} · ${r.job_type} Lv.${r.min_job_level}: ${(r.chance * 100).toFixed(1)}% ×${r.qty_min}–${r.qty_max} · ${{ mining: 'mine', fishing: 'fish', foraging: 'gather' }[r.job_type] || 'gather'} ${r.id}`);
  const recipes = db.prepare('SELECT id,name,type,inputs,output_id,output_qty,min_job_level,job_type FROM recipes ORDER BY id').all();
  function recipeText(r) { return `${r.name} · ${r.job_type} Lv.${r.min_job_level} · ${r.type === 'cook' ? 'cook' : 'craft'} ${r.id}: ` + parseInputs(r.inputs).map(i => `${i.qty}× ${i.item_id}`).join(' + ') + ` → ${r.output_qty}× ${r.output_id}`; }
  for (const r of recipes.filter(r => r.output_id === id)) sources.push(recipeText(r));
  for (const r of db.prepare("SELECT l.lootbox_id,i.name,l.guaranteed FROM loot_tables l JOIN items i ON i.id=l.lootbox_id WHERE l.reward_type IN ('item','shard') AND l.reward_id=? ORDER BY l.lootbox_id").all(id)) sources.push(`Hộp ${r.name} (${r.lootbox_id}): ${r.guaranteed ? 'mục bảo đảm' : 'ngẫu nhiên theo trọng số; xem loot table'}`);
  const contains = value => (value || '').split(',').some(s => s.split(':')[0].trim() === id);
  for (const r of db.prepare('SELECT id,name,reward_item FROM quests ORDER BY id').all()) if (contains(r.reward_item)) sources.push(`Nhiệm vụ: ${r.name} (${r.id}), cần được giao và hoàn thành.`);
  for (const r of db.prepare('SELECT name,reward_item FROM achievements WHERE hidden=0 ORDER BY id').all()) if (contains(r.reward_item)) sources.push(`Thành tựu: ${r.name}`);
  for (const step of require('./story').STEPS) if (step.item === id) sources.push(`Chính tuyến: ${step.chapter} / ${step.title} · thưởng một lần.`);
  const uses = recipes.filter(r => parseInputs(r.inputs).some(i => i.item_id === id)).map(recipeText);
  if (tome) uses.push(`Học vĩnh viễn ${tome.name}: use ${id} · ${tome.class} Lv.${tome.level}; skills equip ${tome.id} để dùng ở trận mới.`);
  return { item, sources, uses, note: 'Tỷ lệ cơ bản trước bonus công cụ/buff. Chợ người chơi và quà sự kiện có thể là nguồn bổ sung; không công khai code sự kiện. Nguồn trong sổ không bỏ qua điều kiện cấp, nhiệm vụ hoặc nguyên liệu.' };
}
module.exports = { search, lookup };
