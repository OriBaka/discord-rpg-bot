// Autocomplete cho admin slash commands
const db = require('../db/database');

function filterChoices(list, input, limit = 25) {
  const q = (input || '').toLowerCase().trim();
  let result = q
    ? list.filter(c => c.name.toLowerCase().includes(q) || String(c.value).toLowerCase().includes(q))
    : list;
  return result.slice(0, limit);
}

function toChoice(id, name) {
  let n = `${name || id} (${id})`;
  if (n.length > 100) n = n.slice(0, 97) + '...';
  return { name: n, value: id };
}

// Providers per option name (theo cấu trúc slash admin)
async function handle(interaction) {
  const focused = interaction.options.getFocused(true);
  const cmdName = interaction.commandName;
  const optName = focused.name;
  const input = focused.value || '';

  try {
    // === /adm gold|xp|item|... — option 'id' ===
    if (cmdName === 'adm') {
      if (optName === 'id') {
        // /adm item, /adm takeitem — item ID
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /shopadm ===
    if (cmdName === 'shopadm') {
      if (optName === 'item') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'add') {
          // Item chưa có trong shop
          const notInShop = db.prepare(`SELECT id, name FROM items
            WHERE id NOT IN (SELECT item_id FROM shop) ORDER BY name LIMIT 100`).all();
          return interaction.respond(filterChoices(notInShop.map(i => toChoice(i.id, i.name)), input));
        }
        // remove/setprice — item đã trong shop
        const inShop = db.prepare(`SELECT i.id, i.name FROM shop s
          JOIN items i ON i.id = s.item_id ORDER BY i.name LIMIT 100`).all();
        return interaction.respond(filterChoices(inShop.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /itemadm ===
    if (cmdName === 'itemadm') {
      if (optName === 'id') {
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /mobadm (monster CRUD, không còn group zone) ===
    if (cmdName === 'mobadm') {
      if (optName === 'id' || optName === 'mob') {
        const mobs = db.prepare('SELECT id, name FROM monsters ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(mobs.map(m => toChoice(m.id, m.name)), input));
      }
      if (optName === 'zone') {
        const zones = db.prepare('SELECT id, name FROM zones ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(zones.map(z => toChoice(z.id, z.name)), input));
      }
      if (optName === 'item') {
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /mobzone (zone CRUD, tách khỏi /mobadm) ===
    if (cmdName === 'mobzone') {
      if (optName === 'id') {
        const zones = db.prepare('SELECT id, name FROM zones ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(zones.map(z => toChoice(z.id, z.name)), input));
      }
    }

    // === /questadm ===
    if (cmdName === 'questadm') {
      if (optName === 'id') {
        const quests = db.prepare('SELECT id, name FROM quests ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(quests.map(q => toChoice(q.id, q.name)), input));
      }
    }

    // === /achadm ===
    if (cmdName === 'achadm') {
      if (optName === 'id') {
        const achs = db.prepare('SELECT id, name FROM achievements ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(achs.map(a => toChoice(a.id, a.name)), input));
      }
    }

    // === /petadm ===
    if (cmdName === 'petadm') {
      if (optName === 'id') {
        const pets = db.prepare('SELECT id, name FROM pets ORDER BY tier, name LIMIT 100').all();
        return interaction.respond(filterChoices(pets.map(p => toChoice(p.id, p.name)), input));
      }
      if (optName === 'mob') {
        const mobs = db.prepare('SELECT id, name FROM monsters ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(mobs.map(m => toChoice(m.id, m.name)), input));
      }
      if (optName === 'pet') {
        const pets = db.prepare('SELECT id, name FROM pets ORDER BY tier, name LIMIT 100').all();
        return interaction.respond(filterChoices(pets.map(p => toChoice(p.id, p.name)), input));
      }
    }

    // === /gzadm ===
    if (cmdName === 'gzadm') {
      if (optName === 'id' || optName === 'zone') {
        const zones = db.prepare('SELECT id, name, job_type FROM gather_zones ORDER BY name LIMIT 100').all();
        return interaction.respond(filterChoices(zones.map(z => ({ name: `${z.name} [${z.job_type}] (${z.id})`, value: z.id })), input));
      }
      if (optName === 'item') {
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /recipeadm ===
    if (cmdName === 'recipeadm') {
      const group = interaction.options.getSubcommandGroup(false);
      if (optName === 'id') {
        const type = group; // craft | cook
        const recipes = db.prepare('SELECT id, name FROM recipes WHERE type = ? ORDER BY name LIMIT 100').all(type);
        return interaction.respond(filterChoices(recipes.map(r => toChoice(r.id, r.name)), input));
      }
      if (optName === 'output') {
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    // === /lbadm ===
    if (cmdName === 'lbadm') {
      if (optName === 'id') {
        // Lootbox items
        const boxes = db.prepare("SELECT id, name FROM items WHERE type = 'lootbox' ORDER BY name LIMIT 50").all();
        return interaction.respond(filterChoices(boxes.map(b => toChoice(b.id, b.name)), input));
      }
      if (optName === 'reward_id') {
        // Tùy type: item/pet — không phân biệt được ở đây (type chọn cùng lúc)
        // Fallback: chỉ list items
        const items = db.prepare('SELECT id, name FROM items ORDER BY name LIMIT 200').all();
        return interaction.respond(filterChoices(items.map(i => toChoice(i.id, i.name)), input));
      }
    }

    return interaction.respond([]);
  } catch (err) {
    console.error('[admin autocomplete]', err.message);
    try { await interaction.respond([]); } catch {}
  }
}

module.exports = { handle };
