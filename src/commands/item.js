const { EmbedBuilder } = require('discord.js');
const { getItem, createItem, updateItem, deleteItem } = require('../game/items');
const { TIERS } = require('../game/tiers');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

// Parse arg dạng key=value (atk=10 def=5 price=100 ...)
function parseKV(args) {
  const out = {};
  for (const a of args) {
    const i = a.indexOf('=');
    if (i < 0) continue;
    const k = a.slice(0, i).toLowerCase();
    const v = a.slice(i + 1);
    out[k] = v;
  }
  return out;
}

module.exports = {
  name: 'item',
  aliases: ['it'],
  description: 'Quản lý item (admin): create, edit, delete',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C).setTitle('🔨 Lệnh quản lý Item (Admin)')
        .setDescription([
          `**Tạo:** \`${prefix}item create <id> name="Tên" type=weapon tier=rare atk=10 price=500\``,
          `**Sửa:** \`${prefix}item edit <id> atk=15 price=600\``,
          `**Xoá:** \`${prefix}item delete <id>\``,
          '',
          '**Các field:**',
          '`name` — Tên (bao trong ngoặc kép nếu có khoảng trắng)',
          '`type` — weapon | armor | consumable | material',
          `\`tier\` — ${Object.keys(TIERS).join(' | ')}`,
          '`atk`, `def`, `heal` — Chỉ số (số nguyên)',
          '`price`, `sell` — Giá mua/bán',
          '`desc` — Mô tả (trong ngoặc kép)',
          '',
          `💡 Xem chi tiết item: \`${prefix}info item <id>\``,
        ].join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin mới được quản lý item.');

    // Gộp lại args để parse string có dấu nháy
    // Vì Discord tách args bằng space, ta cần re-join và parse lại
    const raw = msg.content.slice(prefix.length).trim();
    // Bỏ "item create" hoặc "item edit" ra
    const restAfterSub = raw.replace(/^\S+\s+\S+\s*/, ''); // bỏ "item create"
    // Tách bằng regex để giữ chuỗi trong ngoặc kép
    const tokens = restAfterSub.match(/[^\s"]+|"([^"]*)"/g)?.map(t =>
      t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
    ) || [];

    // ===== item create =====
    if (sub === 'create' || sub === 'new') {
      const id = tokens[0];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}item create <id> name="..." type=... ...\``);
      if (getItem(id)) return msg.reply(`❌ Item \`${id}\` đã tồn tại. Dùng \`${prefix}item edit\`.`);
      const kv = parseKV(tokens.slice(1));
      if (!kv.name || !kv.type) {
        return msg.reply('❌ Phải có `name=...` và `type=...`.');
      }
      const allowedTypes = ['weapon', 'armor', 'consumable', 'material'];
      if (!allowedTypes.includes(kv.type)) {
        return msg.reply(`❌ type phải là: ${allowedTypes.join('/')}`);
      }
      const tier = kv.tier || 'common';
      if (!TIERS[tier]) return msg.reply(`❌ tier phải là: ${Object.keys(TIERS).join('/')}`);

      try {
        const it = createItem({
          id, name: kv.name, type: kv.type, tier,
          atk: parseInt(kv.atk) || 0,
          def: parseInt(kv.def) || 0,
          heal: parseInt(kv.heal) || 0,
          price: parseInt(kv.price) || 0,
          sell: parseInt(kv.sell) || 0,
          desc: kv.desc || '',
        });
        return msg.reply(`✅ Đã tạo **${it.name}** (\`${it.id}\`). Xem: \`${prefix}info item ${it.id}\``);
      } catch (err) {
        return msg.reply(`❌ Lỗi: ${err.message}`);
      }
    }

    // ===== item edit =====
    if (sub === 'edit' || sub === 'update') {
      const id = tokens[0];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}item edit <id> field=value ...\``);
      if (!getItem(id)) return msg.reply(`❌ Item \`${id}\` không tồn tại.`);
      const kv = parseKV(tokens.slice(1));
      if (Object.keys(kv).length === 0) return msg.reply('❌ Cần ít nhất 1 field để sửa.');

      const fields = {};
      const numKeys = ['atk', 'def', 'heal', 'price', 'sell'];
      for (const k of Object.keys(kv)) {
        if (k === 'name' || k === 'desc') fields[k] = kv[k];
        else if (k === 'type' || k === 'tier') fields[k] = kv[k];
        else if (numKeys.includes(k)) fields[k] = parseInt(kv[k]) || 0;
      }
      if (fields.tier && !TIERS[fields.tier]) {
        return msg.reply(`❌ tier không hợp lệ.`);
      }
      try {
        const it = updateItem(id, fields);
        return msg.reply(`✅ Đã sửa **${it.name}**. Xem: \`${prefix}info item ${id}\``);
      } catch (err) {
        return msg.reply(`❌ Lỗi: ${err.message}`);
      }
    }

    // ===== item delete =====
    if (sub === 'delete' || sub === 'del' || sub === 'remove') {
      const id = tokens[0];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}item delete <id>\``);
      const it = getItem(id);
      if (!it) return msg.reply('❌ Item không tồn tại.');
      deleteItem(id);
      return msg.reply(`🗑️ Đã xoá **${it.name}** (\`${id}\`).`);
    }

    return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}item help\``);
  },
}; 
