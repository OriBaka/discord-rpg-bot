const { EmbedBuilder } = require('discord.js');
const { getItem, createItem, updateItem, deleteItem } = require('../game/items');
const { TIERS } = require('../game/tiers');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
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
          '`type` — weapon | offhand | armor | accessory | consumable | material | pet',
          `\`tier\` — ${Object.keys(TIERS).join(' | ')}`,
          '`atk`, `def`, `heal` — Chỉ số (số nguyên)',
          '`price`, `sell` — Giá mua/bán',
          '`desc` — Mô tả (trong ngoặc kép)',
          '`class_req` (hoặc `class`) — melee | magic | ranged (để trống = dùng chung)',
          '`armor_slot` — head | chest | legs | feet | hands (bắt buộc nếu type=armor)',
          '`accessory_type` — ring | necklace | special (bắt buộc nếu type=accessory)',
          '`weapon_type` — sword | axe | bow | staff | shield | orb | quiver... (gợi ý)',
          '`armor_type` — heavy | medium | light | robe (gợi ý)',
          '`soulbound` (hoặc `sb`) — true/false: cấm trade item này',
          '',
          `💡 Xem chi tiết item: \`${prefix}info item <id>\``,
        ].join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin mới được quản lý item.');

    // Tokenize phần còn lại (bỏ command "item" và sub-command như "create"/"edit")
    // Hỗ trợ cả smart quotes (mobile tự đổi " → "")
    const tokens = getRestTokens(msg, prefix, 2);

    // ===== item create =====
    if (sub === 'create' || sub === 'new') {
      const id = tokens[0];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}item create <id> name="..." type=... ...\``);
      if (getItem(id)) return msg.reply(`❌ Item \`${id}\` đã tồn tại. Dùng \`${prefix}item edit\`.`);
      const kv = parseKV(tokens.slice(1));
      if (!kv.name || !kv.type) {
        return msg.reply('❌ Phải có `name=...` và `type=...`.');
      }
      const allowedTypes = ['weapon', 'offhand', 'armor', 'accessory', 'consumable', 'material', 'pet', 'lootbox'];
      if (!allowedTypes.includes(kv.type)) {
        return msg.reply(`❌ type phải là: ${allowedTypes.join('/')}`);
      }
      const tier = kv.tier || 'common';
      if (!TIERS[tier]) return msg.reply(`❌ tier phải là: ${Object.keys(TIERS).join('/')}`);
      // Validate accessory_type
      if (kv.type === 'accessory') {
        const allowedAcc = ['ring', 'necklace', 'special'];
        if (!kv.accessory_type || !allowedAcc.includes(kv.accessory_type)) {
          return msg.reply(`❌ Item type=accessory cần \`accessory_type=...\` (${allowedAcc.join('/')})`);
        }
      }
      // Validate armor_slot
      if (kv.type === 'armor') {
        const allowedSlots = ['head', 'chest', 'legs', 'feet', 'hands'];
        if (!kv.armor_slot || !allowedSlots.includes(kv.armor_slot)) {
          return msg.reply(`❌ Item type=armor cần \`armor_slot=...\` (${allowedSlots.join('/')})`);
        }
      }

      const isSb = kv.soulbound === 'true' || kv.soulbound === '1' || kv.sb === 'true' || kv.sb === '1';
      try {
        const db = require('../db/database');
        db.prepare(`INSERT INTO items
          (id, name, type, tier, atk, def, heal, price, sell, desc, class_req, weapon_type, armor_type, accessory_type, armor_slot, soulbound)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(
            id, kv.name, kv.type, tier,
            parseInt(kv.atk) || 0, parseInt(kv.def) || 0, parseInt(kv.heal) || 0,
            parseInt(kv.price) || 0, parseInt(kv.sell) || 0,
            kv.desc || '',
            kv.class_req || kv.class || '',
            kv.weapon_type || '',
            kv.armor_type || '',
            kv.accessory_type || '',
            kv.armor_slot || '',
            isSb ? 1 : 0,
          );
        const it = getItem(id);
        const sbTag = isSb ? ' 🔒 **SOULBOUND**' : '';
        return msg.reply(`✅ Đã tạo **${it.name}** (\`${it.id}\`)${sbTag}. Xem: \`${prefix}info item ${it.id}\``);
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
      const numKeys = ['atk', 'def', 'heal', 'price', 'sell', 'soulbound'];
      const strKeys = ['name', 'desc', 'type', 'tier', 'class_req', 'weapon_type', 'armor_type', 'accessory_type', 'armor_slot', 'image_url'];
      const keyMap = { class: 'class_req', sb: 'soulbound', img: 'image_url', image: 'image_url' };
      for (const rawK of Object.keys(kv)) {
        const k = keyMap[rawK] || rawK;
        if (strKeys.includes(k))      fields[k] = kv[rawK];
        else if (k === 'soulbound') {
          fields.soulbound = (kv[rawK] === 'true' || kv[rawK] === '1' || kv[rawK] === 'yes') ? 1 : 0;
        }
        else if (numKeys.includes(k)) fields[k] = parseInt(kv[rawK]) || 0;
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
