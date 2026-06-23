const { EmbedBuilder } = require('discord.js');
const { getPlayer, createPlayer } = require('../game/player');
const { CLASSES, isClassDisabled } = require('../game/classes');

module.exports = {
  name: 'start',
  aliases: ['begin', 'taotk'],
  description: 'Tạo nhân vật mới',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const existing = getPlayer(msg.author.id);
    if (existing) {
      return msg.reply(`⚠️ Bạn đã có nhân vật **${existing.name}** rồi! Dùng \`${prefix}me\` để xem.`);
    }
    const p = createPlayer(msg.author.id, msg.author.username);

    // Liệt kê class có sẵn
    const classLines = Object.values(CLASSES).map(c => {
      const lock = isClassDisabled(c.id) ? ' 🚫' : '';
      return `${c.name} \`${c.id}\` — ${c.desc}${lock}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🎉 Chào mừng ${p.name}!`)
      .setDescription(
        `Bạn vừa bước chân vào thế giới phiêu lưu!\n\n` +
        `**Bước tiếp theo:** chọn class khởi đầu của bạn.\n\n` +
        classLines.join('\n') + '\n\n' +
        `👉 Gõ: \`${prefix}class pick <id>\` (ví dụ: \`${prefix}class pick melee\`)`
      )
      .setFooter({ text: `Sau khi chọn class, gõ ${prefix}hunt để đi săn!` });
    return msg.reply({ embeds: [embed] });
  },
};
