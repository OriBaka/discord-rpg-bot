// Autocomplete providers: trả về choices dựa trên context + input
const db = require('../db/database');

// Helper: filter list theo input (Discord auto-fuzzy nhưng mình giúp narrow trước)
function filterChoices(list, input, limit = 25) {
  const q = (input || '').toLowerCase().trim();
  let result = q
    ? list.filter(c => c.name.toLowerCase().includes(q) || c.value.toLowerCase().includes(q))
    : list;
  return result.slice(0, limit);
}

function toChoice(id, name, prefix = '') {
  // Discord choice name max 100 chars
  let n = `${prefix}${name || id} (${id})`;
  if (n.length > 100) n = n.slice(0, 97) + '...';
  return { name: n, value: id };
}

// ============================================================
// Providers
// ============================================================
const providers = {
  // Tất cả item (cho info item)
  item_all: (i, input) => {
    const items = db.prepare('SELECT id, name, tier FROM items ORDER BY tier, name LIMIT 200').all();
    const choices = items.map(it => toChoice(it.id, it.name));
    return filterChoices(choices, input);
  },

  // Item user đang sở hữu (cho sell, etc.)
  item_owned: (i, input) => {
    const items = db.prepare(`SELECT i.id, i.name, inv.qty
      FROM inventory inv JOIN items i ON i.id = inv.item_id
      WHERE inv.user_id = ? AND inv.qty > 0
      ORDER BY i.tier DESC, i.name LIMIT 100`).all(i.user.id);
    const choices = items.map(it => ({ name: `${it.name} (×${it.qty})`, value: it.id }));
    return filterChoices(choices, input);
  },

  // Item user có và không soulbound (cho trade additem)
  item_owned_tradeable: (i, input) => {
    const items = db.prepare(`SELECT i.id, i.name, inv.qty, i.soulbound
      FROM inventory inv JOIN items i ON i.id = inv.item_id
      WHERE inv.user_id = ? AND inv.qty > 0 AND COALESCE(i.soulbound, 0) = 0
      ORDER BY i.tier DESC, i.name LIMIT 100`).all(i.user.id);
    const choices = items.map(it => ({ name: `${it.name} (×${it.qty})`, value: it.id }));
    return filterChoices(choices, input);
  },

  // Item có thể equip (weapon/armor/offhand/accessory) user đang sở hữu
  item_equippable: (i, input) => {
    const items = db.prepare(`SELECT i.id, i.name, i.type, inv.qty
      FROM inventory inv JOIN items i ON i.id = inv.item_id
      WHERE inv.user_id = ? AND inv.qty > 0
      AND i.type IN ('weapon', 'offhand', 'armor', 'accessory')
      ORDER BY i.tier DESC, i.name LIMIT 100`).all(i.user.id);
    const choices = items.map(it => ({ name: `${it.name} [${it.type}]`, value: it.id }));
    return filterChoices(choices, input);
  },

  // Item tiêu hao user đang sở hữu
  item_consumable: (i, input) => {
    const items = db.prepare(`SELECT i.id, i.name, inv.qty
      FROM inventory inv JOIN items i ON i.id = inv.item_id
      WHERE inv.user_id = ? AND inv.qty > 0 AND i.type = 'consumable'
      ORDER BY i.tier, i.name LIMIT 50`).all(i.user.id);
    const choices = items.map(it => ({ name: `${it.name} (×${it.qty})`, value: it.id }));
    return filterChoices(choices, input);
  },

  // Item trong shop
  item_shop: (i, input) => {
    const items = db.prepare(`SELECT s.item_id, i.name, s.price
      FROM shop s JOIN items i ON i.id = s.item_id
      ORDER BY s.price LIMIT 100`).all();
    const choices = items.map(it => ({ name: `${it.name} — ${it.price}💰`, value: it.item_id }));
    return filterChoices(choices, input);
  },

  // Monster
  monster: (i, input) => {
    const mobs = db.prepare('SELECT id, name FROM monsters ORDER BY name LIMIT 100').all();
    return filterChoices(mobs.map(m => toChoice(m.id, m.name)), input);
  },

  // Zone (hunt — combine monster + zone)
  hunt_target: (i, input) => {
    const zones = db.prepare('SELECT id, name FROM zones').all();
    const mobs = db.prepare('SELECT id, name FROM monsters').all();
    const choices = [
      ...zones.map(z => ({ name: `📍 ${z.name} (zone)`, value: z.id })),
      ...mobs.map(m => ({ name: `👹 ${m.name}`, value: m.id })),
    ];
    return filterChoices(choices, input, 25);
  },

  // Zone mining
  zone_mining: (i, input) => {
    const zones = db.prepare("SELECT id, name FROM gather_zones WHERE job_type = 'mining' ORDER BY min_job_level").all();
    return filterChoices(zones.map(z => toChoice(z.id, z.name)), input);
  },

  // Zone fishing
  zone_fishing: (i, input) => {
    const zones = db.prepare("SELECT id, name FROM gather_zones WHERE job_type = 'fishing' ORDER BY min_job_level").all();
    return filterChoices(zones.map(z => toChoice(z.id, z.name)), input);
  },

  // Pet — context-dependent
  pet_dynamic: (i, input) => {
    const sub = i.options.getSubcommand(false);
    if (sub === 'combine') {
      // Pet ghép từ shard (player có thể craft)
      const pets = db.prepare("SELECT id, name, shard_id, shard_qty FROM pets WHERE shard_id != '' AND COALESCE(hidden, 0) = 0 ORDER BY tier, name").all();
      return filterChoices(pets.map(p => ({ name: `${p.name} (${p.shard_qty}× ${p.shard_id})`, value: p.id })), input);
    }
    if (sub === 'active') {
      // Pet user đang sở hữu + "none"
      const owned = db.prepare(`SELECT pp.pet_id, p.name FROM player_pets pp
        JOIN pets p ON p.id = pp.pet_id WHERE pp.user_id = ? ORDER BY p.tier, p.name`).all(i.user.id);
      const list = [{ name: 'None (tắt active pet)', value: 'none' },
                    ...owned.map(p => ({ name: p.name, value: p.pet_id }))];
      return filterChoices(list, input);
    }
    return [];
  },

  // Recipe craft
  recipe_craft: (i, input) => {
    const r = db.prepare("SELECT id, name, min_job_level FROM recipes WHERE type = 'craft' ORDER BY min_job_level").all();
    return filterChoices(r.map(x => ({ name: `${x.name} (Lv.${x.min_job_level}+)`, value: x.id })), input);
  },

  // Recipe cook
  recipe_cook: (i, input) => {
    const r = db.prepare("SELECT id, name, min_job_level FROM recipes WHERE type = 'cook' ORDER BY min_job_level").all();
    return filterChoices(r.map(x => ({ name: `${x.name} (Lv.${x.min_job_level}+)`, value: x.id })), input);
  },

  // Quest dynamic — claim/accept khác nhau
  quest_dynamic: (i, input) => {
    const sub = i.options.getSubcommand(false);
    if (sub === 'claim') {
      // Quest user đang nhận và có progress >= target (sắp claim được)
      const list = db.prepare(`SELECT pq.quest_id as id, q.name, pq.progress, q.target_qty
        FROM player_quests pq JOIN quests q ON q.id = pq.quest_id
        WHERE pq.user_id = ? AND pq.claimed = 0 ORDER BY pq.assigned_at DESC`).all(i.user.id);
      return filterChoices(list.map(q => ({
        name: `${q.name} (${q.progress}/${q.target_qty}${q.progress >= q.target_qty ? ' ✨' : ''})`,
        value: q.id,
      })), input);
    }
    if (sub === 'accept') {
      // Custom quest available chưa accept
      const accepted = db.prepare('SELECT quest_id FROM player_quests WHERE user_id = ?').all(i.user.id).map(r => r.quest_id);
      let avail = db.prepare("SELECT id, name FROM quests WHERE type = 'custom'").all();
      avail = avail.filter(q => !accepted.includes(q.id));
      return filterChoices(avail.map(q => toChoice(q.id, q.name)), input);
    }
    return [];
  },

  // Info dynamic — chọn item/mob/zone tùy subcommand
  info_dynamic: (i, input) => {
    const sub = i.options.getSubcommand(false);
    if (sub === 'item') return providers.item_all(i, input);
    if (sub === 'mob')  return providers.monster(i, input);
    if (sub === 'zone') {
      const zones = db.prepare('SELECT id, name FROM zones').all();
      return filterChoices(zones.map(z => toChoice(z.id, z.name)), input);
    }
    return [];
  },
};

// Main entry: dispatch theo command name
function handle(interaction, autoKey) {
  try {
    const focused = interaction.options.getFocused(true);
    const input = focused?.value || '';
    const provider = providers[autoKey];
    if (!provider) return [];
    return provider(interaction, input);
  } catch (err) {
    console.error('[autocomplete]', autoKey, err.message);
    return [];
  }
}

module.exports = { handle, providers }; 
