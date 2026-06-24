const { EmbedBuilder } = require('discord.js');
const { getItem } = require('../game/items');
const {
  getMonster, createMonster, updateMonster, deleteMonster,
  addDrop, removeDrop, getZone, getAllZones,
  createZone, updateZone, deleteZone,
} = require('../game/monsters');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

module.exports = {
  name: 'mob',
  aliases: ['monster'],
  description: 'Quản lý quái vật (admin)',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0xED4245).setTitle('👹 Lệnh quản lý Quái (Admin)')
        .setDescription([
          `**Tạo quái:** \`${prefix}mob create <id> name="Tên" zone=forest hp=100 atk=15 def=5 xp=30 gold=20-50 weight=10\``,
          `**Sửa quái:** \`${prefix}mob edit <id> hp=200 atk=20\``,
          `**Xoá quái:** \`${prefix}mob delete <id>\``,
          `**Thêm drop:** \`${prefix}mob drop <mob_id> <item_id> <chance 0-1> [qty]\``,
          `**Xoá drop:** \`${prefix}mob undrop <mob_id> <item_id>\``,
          '',
          `**Zone:**`,
          `\`${prefix}mob zone create <id> name="Tên" minlv=10 desc="..."\``,
          `\`${prefix}mob zone edit <id> minlv=15\``,
          `\`${prefix}mob zone delete <id>\``,
          '',
          `💡 Xem chi tiết: \`${prefix}info mob <id>\` hoặc \`${prefix}info mobs\``,
        ].join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin mới được quản lý quái.');

    // Tokenize phần còn lại (bỏ "mob" + sub-command). Hỗ trợ smart quotes.
    let tokens = getRestTokens(msg, prefix, 2);

    // ===== ZONE management =====
    if (sub === 'zone') {
      const zsub = (tokens[0] || '').toLowerCase();
      tokens = tokens.slice(1);
      if (zsub === 'create' || zsub === 'new') {
        const id = tokens[0];
        if (!id) return msg.reply('❌ Thiếu id zone.');
        if (getZone(id)) return msg.reply(`❌ Zone \`${id}\` đã tồn tại.`);
        const kv = parseKV(tokens.slice(1));
        if (!kv.name) return msg.reply('❌ Cần `name="..."`');
        const z = createZone({
          id, name: kv.name,
          min_level: parseInt(kv.minlv) || parseInt(kv.min_level) || 1,
          desc: kv.desc || '',
        });
        return msg.reply(`✅ Đã tạo zone **${z.name}** (\`${z.id}\`).`);
      }
      if (zsub === 'edit') {
        const id = tokens[0];
        if (!id || !getZone(id)) return msg.reply('❌ Zone không tồn tại.');
        const kv = parseKV(tokens.slice(1));
        const fields = {};
        if (kv.name) fields.name = kv.name;
        if (kv.desc) fields.desc = kv.desc;
        if (kv.minlv) fields.min_level = parseInt(kv.minlv);
        if (kv.min_level) fields.min_level = parseInt(kv.min_level);
        if (Object.keys(fields).length === 0) return msg.reply('❌ Không có field nào để sửa.');
        const z = updateZone(id, fields);
        return msg.reply(`✅ Đã sửa zone **${z.name}**.`);
      }
      if (zsub === 'delete' || zsub === 'del') {
        const id = tokens[0];
        if (!id || !getZone(id)) return msg.reply('❌ Zone không tồn tại.');
        deleteZone(id);
        return msg.reply(`🗑️ Đã xoá zone \`${id}\` (và toàn bộ quái trong đó).`);
      }
      return msg.reply(`❌ Cú pháp: \`${prefix}mob zone create/edit/delete\``);
    }

    // ===== mob create =====
    if (sub === 'create' || sub === 'new') {
      const id = tokens[0];
      if (!id) return msg.reply('❌ Thiếu id quái.');
      if (getMonster(id)) return msg.reply(`❌ Quái \`${id}\` đã tồn tại.`);
      const kv = parseKV(tokens.slice(1));
      if (!kv.name || !kv.zone) return msg.reply('❌ Cần `name="..."` và `zone=...`.');
      if (!getZone(kv.zone)) return msg.reply(`❌ Zone \`${kv.zone}\` không tồn tại. Xem \`${prefix}info zones\`.`);

      // gold dạng "20-50"
      let goldMin = 1, goldMax = 10;
      if (kv.gold) {
        const m = kv.gold.match(/^(\d+)-(\d+)$/);
        if (m) { goldMin = +m[1]; goldMax = +m[2]; }
        else { goldMin = goldMax = parseInt(kv.gold) || 1; }
      }

      try {
        const mob = createMonster({
          id, name: kv.name, zone_id: kv.zone,
          hp: parseInt(kv.hp) || 50,
          atk: parseInt(kv.atk) || 10,
          def: parseInt(kv.def) || 0,
          xp: parseInt(kv.xp) || 10,
          gold_min: goldMin, gold_max: goldMax,
          weight: parseInt(kv.weight) || 10,
        });
        return msg.reply(`✅ Đã tạo quái **${mob.name}** (\`${mob.id}\`). Xem: \`${prefix}info mob ${mob.id}\``);
      } catch (err) {
        return msg.reply(`❌ Lỗi: ${err.message}`);
      }
    }

    // ===== mob edit =====
    if (sub === 'edit' || sub === 'update') {
      const id = tokens[0];
      if (!id || !getMonster(id)) return msg.reply('❌ Quái không tồn tại.');
      const kv = parseKV(tokens.slice(1));
      const fields = {};
      if (kv.name) fields.name = kv.name;
      if (kv.zone) {
        if (!getZone(kv.zone)) return msg.reply('❌ Zone không tồn tại.');
        fields.zone_id = kv.zone;
      }
      const numKeys = ['hp', 'atk', 'def', 'xp', 'weight'];
      for (const k of numKeys) if (kv[k] !== undefined) fields[k] = parseInt(kv[k]);
      if (kv.gold) {
        const m = kv.gold.match(/^(\d+)-(\d+)$/);
        if (m) { fields.gold_min = +m[1]; fields.gold_max = +m[2]; }
      }
      if (Object.keys(fields).length === 0) return msg.reply('❌ Không có field nào.');
      const mob = updateMonster(id, fields);
      return msg.reply(`✅ Đã sửa **${mob.name}**. Xem: \`${prefix}info mob ${id}\``);
    }

    // ===== mob delete =====
    if (sub === 'delete' || sub === 'del') {
      const id = tokens[0];
      const m = getMonster(id);
      if (!m) return msg.reply('❌ Quái không tồn tại.');
      deleteMonster(id);
      return msg.reply(`🗑️ Đã xoá quái **${m.name}**.`);
    }

    // ===== mob drop <mob_id> <item_id> <chance> [qty] =====
    if (sub === 'drop') {
      const mobId = tokens[0]; const itemId = tokens[1];
      const chance = parseFloat(tokens[2]); const qty = parseInt(tokens[3]) || 1;
      if (!mobId || !itemId || isNaN(chance)) {
        return msg.reply(`❌ Cú pháp: \`${prefix}mob drop <mob_id> <item_id> <chance 0-1> [qty]\``);
      }
      if (!getMonster(mobId)) return msg.reply('❌ Quái không tồn tại.');
      if (!getItem(itemId)) return msg.reply('❌ Item không tồn tại.');
      if (chance < 0 || chance > 1) return msg.reply('❌ Chance phải 0-1.');
      addDrop(mobId, itemId, chance, qty);
      return msg.reply(`✅ Đã thêm drop **${itemId}** (${Math.round(chance*100)}%) cho **${mobId}**.`);
    }

    // ===== mob undrop =====
    if (sub === 'undrop' || sub === 'rmdrop') {
      const mobId = tokens[0]; const itemId = tokens[1];
      if (!mobId || !itemId) return msg.reply(`❌ Cú pháp: \`${prefix}mob undrop <mob_id> <item_id>\``);
      const ok = removeDrop(mobId, itemId);
      if (!ok) return msg.reply('❌ Không có drop này.');
      return msg.reply(`🗑️ Đã xoá drop.`);
    }

    return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}mob help\``);
  },
};
