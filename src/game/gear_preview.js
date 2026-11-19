// Read-only preview uses the same calculation path as combat, including upgrades,
// class armor share, stance, caps and Aura. Never temporarily equips into the DB.
function preview(player, item, slotArg) {
  const slots = require('./slots');
  const equipment = slots.getEquipped(player.user_id);
  const slot = slotArg || slots.findSlotForItem(item, equipment);
  if (!slot || !slots.isItemValidForSlot(item, slot)) return { error: 'Slot không phù hợp với món đồ.' };
  const old = require('./items').getItem(equipment[slot]);
  const next = { ...equipment, [slot]: item.id };
  const stats = require('./player').getEffectiveStats;
  const warnings = [];
  if (!require('./classes').canEquipItem(player, item).ok) warnings.push('Không đáp ứng class.');
  const gate = require('./level_req').canUse(player, item);
  if (!gate.ok) warnings.push(`Cần ${gate.job ? gate.job + ' ' : ''}Lv.${gate.req}.`);
  const owned = require('../db/database').prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(player.user_id, item.id)?.qty || 0;
  const needed = Object.values(next).filter(id => id === item.id).length;
  if (owned < needed) warnings.push(`Cần sở hữu ${needed} bản, đang có ${owned}.`);
  return { slot, old, before: stats(player, equipment), after: stats(player, next), warnings };
}
function materials(userId, itemId) {
  const db = require('../db/database');
  const recipes = db.prepare('SELECT * FROM recipes WHERE output_id=? ORDER BY id').all(itemId);
  return recipes.map(r => {
    const inputs = JSON.parse(r.inputs);
    return `craft ${r.id} · ${r.job_type} Lv.${r.min_job_level}\n` + inputs.map(i => {
      const have = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, i.item_id)?.qty || 0;
      return `${i.item_id}: ${have}/${i.qty} (thiếu ${Math.max(0, i.qty - have)})`;
    }).join('\n');
  });
}
module.exports = { preview, materials };
