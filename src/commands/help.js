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
        { name: '👤 Nhân vật', value:
          `\`${prefix}start\` tạo nhân vật\n` +
          `\`${prefix}me\` xem hồ sơ\n` +
          `\`${prefix}inv [filter]\` xem túi đồ (vd \`${prefix}inv weapon\`, \`${prefix}inv ring\`)\n` +
          `\`${prefix}gear [@user]\` xem trang bị đang mặc\n` +
          `\`${prefix}top\` bảng xếp hạng\n` +
          `\`${prefix}class\` xem/đổi class` },
        { name: '⚔️ Chiến đấu', value:
          `\`${prefix}hunt\` đi săn auto theo lv\n` +
          `\`${prefix}hunt list\` xem các khu vực\n` +
          `\`${prefix}hunt <zone>\` săn ở khu vực cụ thể\n` +
          `\`${prefix}hunt <mob_id>\` săn quái chỉ định\n` +
          `\`${prefix}heal\` nghỉ quán trọ\n` +
          `\`${prefix}use <id>\` dùng bình máu` },
        { name: '💼 Trang bị', value:
          `\`${prefix}equip <id> [slot]\` mặc đồ (auto chọn slot)\n` +
          `\`${prefix}unequip <slot|all>\` tháo trang bị\n` +
          `Slots: weapon, offhand, head, chest, legs, feet, hands, ring1, ring2, necklace, special` },
        { name: '🏪 Chợ', value:
          `\`${prefix}shop\` xem cửa hàng\n` +
          `\`${prefix}buy <id> [qty]\` mua đồ\n` +
          `\`${prefix}sell <id> [qty]\` bán đồ` },
        { name: '📚 Tra cứu', value:
          `\`${prefix}info help\` xem các lệnh tra cứu\n` +
          `\`${prefix}info item <id>\` chi tiết item\n` +
          `\`${prefix}info mob <id>\` chi tiết quái\n` +
          `\`${prefix}info zone <id>\` chi tiết khu vực` },
        { name: '📜 Nhiệm vụ & Thành tựu', value:
          `\`${prefix}quest\` xem quest hằng ngày\n` +
          `\`${prefix}quest claim <id>\` nhận thưởng\n` +
          `\`${prefix}quest list\` xem custom quest\n` +
          `\`${prefix}ach [@user]\` xem thành tựu\n` +
          `\`${prefix}ach top\` BXH thành tựu` },
        { name: '🐾 Pet', value:
          `\`${prefix}pet\` xem pet của mình\n` +
          `\`${prefix}pet active <id>\` chọn pet đi theo\n` +
          `\`${prefix}pet shards\` xem mảnh pet\n` +
          `\`${prefix}pet combine <id>\` ghép mảnh thành pet\n` +
          `\`${prefix}pet collection\` xem tất cả pet có thể có` },
        { name: '🛠️ Nghề', value:
          `\`${prefix}job [@user]\` xem level các nghề\n` +
          `\`${prefix}mine [zone]\` đào mỏ (mining)\n` +
          `\`${prefix}fish [zone]\` câu cá (fishing)\n` +
          `\`${prefix}craft list\` / \`${prefix}craft <recipe>\` chế tạo\n` +
          `\`${prefix}cook list\` / \`${prefix}cook <recipe>\` nấu ăn` },
        { name: '⚔️ PvP & Trade', value:
          `\`${prefix}duel @user [gold]\` thách đấu\n` +
          `\`${prefix}duel accept/decline\` phản hồi\n` +
          `\`${prefix}duel top\` BXH PvP\n` +
          `\`${prefix}trade @user\` mở phiên trao đổi\n` +
          `\`${prefix}trade help\` xem hướng dẫn chi tiết` },
        { name: '🎁 Khác', value: `\`${prefix}daily\` điểm danh nhận vàng` },
      );

    if (showAdmin) {
      embed.addFields({
        name: '🛠️ Admin (chỉ bạn thấy)',
        value:
          `\`${prefix}admin help\` quản trị + class + channel notify\n` +
          `\`${prefix}item help\` tạo/sửa item\n` +
          `\`${prefix}mob help\` tạo/sửa quái & zone\n` +
          `\`${prefix}quest admin\` tạo/sửa quest\n` +
          `\`${prefix}ach admin\` tạo/sửa achievement\n` +
          `\`${prefix}pet admin\` tạo/sửa pet + drop\n` +
          `\`${prefix}gz\` quản lý mining/fishing zones\n` +
          `\`${prefix}craft admin\` / \`${prefix}cook admin\` tạo/sửa recipe\n` +
          `\`${prefix}shop add/remove/setprice\` chỉnh shop\n` +
          `\`${prefix}setimage <type> <id> <url>\` gán ảnh\n` +
          `\`${prefix}sla\` quản lý slash commands`,
      });
    }

    embed.setFooter({ text: 'Chúc bạn cày vui!' });
    return msg.reply({ embeds: [embed] });
  },
};
