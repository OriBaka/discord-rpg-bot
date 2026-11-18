const { EmbedBuilder } = require('discord.js');
const { getPlayer, createPlayer } = require('../game/player');
const { CLASSES, isClassDisabled } = require('../game/classes');

module.exports = {
  name: 'start',
  aliases: ['begin', 'taotk'],
  description: 'Tạo nhân vật mới',
  async execute(msg) {
    const prefix = require('../game/prefix').getPrefix();
    const existing = getPlayer(msg.author.id);
    if (existing) {
      if (require('../game/adventurer_gear').claimSupplies(msg.author.id)) return msg.reply(`🎒 Đã nhận 3 potion_s hỗ trợ tân thủ (một lần, Lv.1–5). Dùng ${prefix}use potion_s. Bộ giáp Dawnwatch giá 300 vàng đủ 5 món; tra ${prefix}find dawnwatch.`);
      return msg.reply(`⚠️ Bạn đã có nhân vật **${existing.name}** rồi! Dùng \`${prefix}me\` để xem.`);
    }
    const p = createPlayer(msg.author.id, msg.author.username);

    require('../game/adventurer_gear').claimSupplies(msg.author.id);
    // Liệt kê class có sẵn
    const classLines = Object.values(CLASSES).map(c => {
      const lock = isClassDisabled(c.id) ? ' 🚫' : '';
      return `${c.name} \`${c.id}\` — ${c.desc}${lock}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`🎉 Chào mừng ${p.name}!`)
      .setDescription(
        `Bạn vừa bước chân vào thế giới phiêu lưu! Đã nhận 3 potion_s; dùng ${prefix}use potion_s khi mất máu. Bộ giáp Dawnwatch 5 món giá tổng 300 vàng, tra ${prefix}find dawnwatch.\n\n` +
        `**Bước tiếp theo:** chọn class khởi đầu của bạn.\n\n` +
        classLines.join('\n') + '\n\n' +
        `👉 Gõ: \`${prefix}class pick <id>\` (ví dụ: \`${prefix}class pick melee\`)`
      )
      .setFooter({ text: `Đã tặng 3 potion_s. Chọn class rồi hunt slime để làm quen.` });
    return msg.reply({ embeds: [embed] });
  },
};
