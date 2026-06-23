const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  aliases: ['h', 'giup'],
  description: 'Danh sách lệnh',
  async execute(msg) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Hướng dẫn lệnh')
      .setDescription('Prefix: `!` (có thể đổi trong `.env`)')
      .addFields(
        { name: '👤 Nhân vật', value: '`!start` tạo nhân vật\n`!me` xem hồ sơ\n`!inv` xem túi đồ\n`!top` bảng xếp hạng' },
        { name: '⚔️ Chiến đấu', value: '`!hunt` đi săn quái (CD 30s)\n`!heal` nghỉ quán trọ\n`!use <id>` dùng bình máu' },
        { name: '💼 Trang bị', value: '`!equip <id>` trang bị vũ khí/giáp' },
        { name: '🏪 Chợ', value: '`!shop` xem cửa hàng\n`!buy <id> [qty]` mua đồ\n`!sell <id> [qty]` bán đồ' },
        { name: '🎁 Khác', value: '`!daily` điểm danh nhận vàng' },
      )
      .setFooter({ text: 'Chúc bạn cày vui!' });
    return msg.reply({ embeds: [embed] });
  },
}; 
