const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'help',
  aliases: ['h', 'giup'],
  description: 'Danh sách lệnh',
  async execute(msg) {
    const prefix = require('../game/prefix').getPrefix();
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
          `\`${prefix}battle list\` xem elite/boss\n` +
          `\`${prefix}battle <mob_id>\` trận turn-based có skill\n` +
          `\`${prefix}heal\` nghỉ quán trọ (cooldown 10 phút)\n` +
          `\`${prefix}use <id>\` dùng bình máu / mở lootbox` },
        { name: '💼 Trang bị', value:
          `\`${prefix}equip <id> [slot]\` mặc đồ (auto chọn slot)\n` +
          `\`${prefix}unequip <slot|all>\` tháo trang bị\n` +
          `\`${prefix}compare <id1> [id2]\` so sánh 2 món\n` +
          `\`${prefix}upgrade\` xem cấp nâng cấp vũ khí (+1..+5)\n` +
          `\`${prefix}upgrade <id>\` nâng cấp vũ khí đang mặc\n` +
          `\`${prefix}upgrade list\` bảng chi phí nâng cấp\n` +
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
        { name: '🏰 Bang hội', value:
          `\`${prefix}guild\` xem bang / hướng dẫn\n` +
          `\`${prefix}guild create <tag> <tên>\` lập bang (Lv.5, 500 vàng)\n` +
          `\`${prefix}guild invite @user\` mời thành viên\n` +
          `\`${prefix}guild vault\` kho chung\n` +
          `\`${prefix}guild top\` BXH bang • buff vàng/XP khi hunt\n` +
          `*Thành viên đánh boss tuần sẽ cộng XP cho bang → bang lên cấp nhanh hơn*` },
        { name: '🐲 Boss tuần (raid)', value:
          `\`${prefix}raid\` xem máu boss tuần + lượt đánh còn lại\n` +
          `\`${prefix}raid danh\` đánh boss (5 lượt/tuần, chia sát thương)\n` +
          `\`${prefix}raid top\` BXH sát thương cá nhân\n` +
          `\`${prefix}raid bang\` BXH sát thương theo bang hội\n` +
          `\`${prefix}raid thuong\` nhận thưởng tuần trước\n` +
          `*Cả server đánh chung một thanh máu — hạ boss mới có thưởng đầy đủ*` },
        { name: '⚔️ PvP & Trade', value:
          `\`${prefix}duel @user [gold]\` thách đấu\n` +
          `\`${prefix}duel accept/decline\` phản hồi\n` +
          `\`${prefix}duel top\` BXH PvP\n` +
          `\`${prefix}trade @user\` mở phiên trao đổi\n` +
          `\`${prefix}trade help\` xem hướng dẫn chi tiết` },
        { name: '🎁 Khác', value:
          `\`${prefix}daily\` điểm danh — chuỗi 7 ngày, thưởng leo thang\n` +
          `\`${prefix}daily xem\` xem bảng 7 ngày + đang ở đâu\n` +
          `\`${prefix}redeem <code>\` nhập code nhận thưởng` },
      );

    if (showAdmin) {
      embed.addFields({
        name: '🛠️ Admin (chỉ bạn thấy)',
        value:
          `\`${prefix}adm help\` **cửa vào chính** — tất cả lệnh admin\n` +
          `\`${prefix}admin help\` (cũ) quản trị + class + channel notify\n` +
          `\`${prefix}item help\` tạo/sửa item\n` +
          `\`${prefix}mob help\` tạo/sửa quái & zone\n` +
          `\`${prefix}quest admin\` tạo/sửa quest\n` +
          `\`${prefix}ach admin\` tạo/sửa achievement\n` +
          `\`${prefix}pet admin\` tạo/sửa pet + drop\n` +
          `\`${prefix}gatherzone\` (hoặc \`${prefix}gz\`) quản lý zone mining/fishing\n` +
          `\`${prefix}craft admin\` / \`${prefix}cook admin\` tạo/sửa recipe\n` +
          `\`${prefix}upgrade admin\` chỉnh nguyên liệu nâng cấp theo mốc\n` +
          `\`${prefix}shop add/remove/setprice\` chỉnh shop\n` +
          `\`${prefix}setimage <type> <id> <url>\` gán ảnh\n` +
          `\`${prefix}lootbox\` quản lý hộp quà event\n` +
          `\`${prefix}redeem admin\` tạo/quản lý code\n` +
          `\`${prefix}slashadmin\` (hoặc \`${prefix}sla\`) quản lý slash commands\n` +
          `\`${prefix}petrestore\` khôi phục pet bị thiếu (dùng 1 lần)\n` +
          `\`${prefix}achdebug\` debug tiến độ thành tựu`,
      });
    }

    embed.setFooter({ text: 'Chúc bạn cày vui!' });
    return msg.reply({ embeds: [embed] });
  },
};
