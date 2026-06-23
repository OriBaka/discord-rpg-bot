const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  aliases: ['h', 'giup'],
  description: 'Danh sách lệnh',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const isOwner   = msg.guild && msg.guild.ownerId === msg.author.id;
    const hasAdmin  = msg.member && msg.member.permissions?.has('Administrator');
    const adminIds  = (process.env.ADMIN_IDS || '').split(',').map(s=>s.trim());
    const showAdmin = isOwner || hasAdmin || adminIds.includes(msg.author.id);

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Hướng dẫn lệnh')
      .setDescription(`Prefix hiện tại: \`${prefix}\``)
      .addFields(
        { name: '👤 Nhân vật', value: `\`${prefix}start\` tạo nhân vật\n\`${prefix}me\` xem hồ sơ\n\`${prefix}inv\` xem túi đồ\n\`${prefix}top\` bảng xếp hạng` },
        { name: '⚔️ Chiến đấu', value: `\`${prefix}hunt\` đi săn (CD 30s)\n\`${prefix}heal\` nghỉ quán trọ\n\`${prefix}use <id>\` dùng bình máu` },
        { name: '💼 Trang bị', value: `\`${prefix}equip <id>\` trang bị vũ khí/giáp` },
        { name: '🏪 Chợ', value: `\`${prefix}shop\` xem cửa hàng\n\`${prefix}buy <id> [qty]\` mua đồ\n\`${prefix}sell <id> [qty]\` bán đồ` },
        { name: '🎁 Khác', value: `\`${prefix}daily\` điểm danh nhận vàng` },
      );

    if (showAdmin) {
      embed.addFields({
        name: '🛠️ Admin (chỉ bạn thấy)',
        value: `\`${prefix}admin help\` xem các lệnh quản trị`,
      });
    }

    embed.setFooter({ text: 'Chúc bạn cày vui!' });
    return msg.reply({ embeds: [embed] });
  },
};
