const { EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../game/player');
const { getItem } = require('../game/items');
const { SLOTS, SLOT_ORDER, getEquipped, getTotalBonus } = require('../game/slots');
const { tierInfo } = require('../game/tiers');
const { classInfo } = require('../game/classes');

// Resolve target: mention hoặc User ID hoặc chính mình
function resolveTarget(msg, arg) {
  if (!arg) return msg.author;
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || msg.author;
}

module.exports = {
  name: 'gear',
  aliases: ['equip2', 'trang_bi', 'tb'],
  description: 'Xem trang bị đang mặc: !gear [@user]',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const target = resolveTarget(msg, args[0]);
    const p = getPlayer(target.id);
    if (!p) {
      return msg.reply(
        target.id === msg.author.id
          ? `❌ Bạn chưa có nhân vật. Gõ \`${prefix}start\`.`
          : `❌ **${target.username}** chưa có nhân vật.`
      );
    }

    const equipped = getEquipped(target.id);
    const bonus = getTotalBonus(target.id);
    const cls = p.primary_class ? classInfo(p.primary_class) : null;

    // Tạo dòng cho mỗi slot
    const lines = SLOT_ORDER.map(slotId => {
      const slot = SLOTS[slotId];
      const itemId = equipped[slotId];
      if (!itemId) {
        return `**${slot.name}** — *(trống)*`;
      }
      const it = getItem(itemId);
      if (!it) return `**${slot.name}** — \`${itemId}\` *(không rõ)*`;
      const t = tierInfo(it.tier);
      const stats = [];
      if (it.atk)  stats.push(`+${it.atk} ATK`);
      if (it.def)  stats.push(`+${it.def} DEF`);
      if (it.heal) stats.push(`+${it.heal} hồi/trận`);
      const statStr = stats.length > 0 ? ` *(${stats.join(', ')})*` : '';
      return `**${slot.name}** — ${t.emoji} ${it.name}${statStr}`;
    });

    const totalCount = Object.keys(equipped).length;
    const slotCount = SLOT_ORDER.length;

    const embed = new EmbedBuilder()
      .setColor(cls?.color || 0x5865F2)
      .setTitle(`💼 Trang bị: ${p.name}`)
      .setDescription(
        (cls ? `🎭 **${cls.name}** — Lv.${p.level}\n\n` : '') +
        lines.join('\n')
      )
      .addFields(
        { name: '📊 Tổng bonus', value:
          `⚔️ ATK: **+${bonus.atk}**\n` +
          `🛡️ DEF: **+${bonus.def}**\n` +
          (bonus.heal > 0 ? `❤️ Hồi/trận: **+${bonus.heal}**` : '') },
        { name: '🎯 Tổng chỉ số', value:
          `⚔️ ATK: **${p.atk + bonus.atk}** (gốc ${p.atk})\n` +
          `🛡️ DEF: **${p.def + bonus.def}** (gốc ${p.def})\n` +
          `❤️ HP: **${p.hp}/${p.max_hp}**`, inline: true },
      )
      .setFooter({ text: `Đang dùng ${totalCount}/${slotCount} slot • ID: ${target.id}` });

    return msg.reply({ embeds: [embed] });
  },
}; 
