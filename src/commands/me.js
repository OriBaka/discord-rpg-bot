const { EmbedBuilder } = require('discord.js');
const { getPlayer, getEffectiveStats, xpToNext } = require('../game/player');
const { ITEMS } = require('../game/items');
const { classInfo, getClassData } = require('../game/classes');

module.exports = {
  name: 'me',
  aliases: ['profile', 'tt', 'nv'],
  description: 'Xem thông tin nhân vật',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Bạn chưa có nhân vật. Gõ \`${prefix}start\` để tạo!`);

    const eff = getEffectiveStats(p);
    const weapon = p.weapon_id ? ITEMS[p.weapon_id]?.name : '—';
    const armor  = p.armor_id  ? ITEMS[p.armor_id]?.name  : '—';
    const need   = xpToNext(p.level);

    const cls = p.primary_class ? classInfo(p.primary_class) : null;
    const data = getClassData(p);
    const unlockedClasses = Object.keys(data);
    const classLine = cls
      ? `${cls.name}${unlockedClasses.length > 1 ? ` *(+${unlockedClasses.length - 1} class khác)*` : ''}`
      : `❓ *Chưa chọn — dùng* \`${prefix}class pick\``;

    const embed = new EmbedBuilder()
      .setColor(cls?.color || 0x5865F2)
      .setTitle(`📜 Hồ sơ: ${p.name}`)
      .setDescription(`**🎭 Class:** ${classLine}`)
      .addFields(
        { name: '🎚️ Cấp độ', value: `Lv. **${p.level}**\nXP: ${p.xp}/${need}`, inline: true },
        { name: '❤️ HP',     value: `${p.hp}/${p.max_hp}`, inline: true },
        { name: '💰 Vàng',   value: `${p.gold}`, inline: true },
        { name: '⚔️ ATK',    value: `${eff.atk} (gốc ${p.atk})`, inline: true },
        { name: '🛡️ DEF',    value: `${eff.def} (gốc ${p.def})`, inline: true },
        { name: '\u200B',    value: '\u200B', inline: true },
        { name: '🗡️ Vũ khí', value: weapon, inline: true },
        { name: '🦺 Giáp',   value: armor,  inline: true },
      )
      .setFooter({ text: `ID: ${msg.author.id}` });

    return msg.reply({ embeds: [embed] });
  },
};
