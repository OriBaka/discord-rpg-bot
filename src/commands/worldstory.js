const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const world = require('../game/world_story');
const { getPrefix } = require('../game/prefix');
const safe = s => escapeMarkdown(String(s).slice(0, 150));
module.exports = {
  name: 'worldstory', aliases: ['lichsu', 'worldlore'], description: 'Nền móng lịch sử chung: worldstory status / rules / history',
  async execute(msg, args = []) {
    const prefix = getPrefix(), service = world.getService(), action = (args[0] || 'status').toLowerCase();
    const reply = content => msg.reply({ content, allowedMentions: { parse: [] } });
    if (action === 'rules') return reply('🌍 **Lịch sử chung toàn bot — khung luật, chưa mở Chương 4**\n' +
      '• Hoàn tất Chương 3 chỉ là điều kiện tham gia, không giữ chỗ hay quyền về nhất.\n' +
      '• Nội dung phải được phát hành trong code và lịch mở công bố trước ít nhất 24 giờ thật. Đồng hồ/thời tiết game không đổi giờ mở.\n' +
      '• Tiến độ chỉ từ hành động thành công sau khi cuộc đua mở và đã tham gia; không nhận tiến độ do người chơi/admin tự nhập.\n' +
      '• Người đầu tiên hoàn tất mục tiêu được chốt nguyên tử, theo thứ tự giao dịch DB thành công. Người này mới được chọn kết cục có sẵn, đúng một lần.\n' +
      '• Khi đã có người về đích, cuộc đua dừng chờ họ quyết định; chưa có cơ chế tự chuyển quyền khi họ vắng mặt.\n' +
      '• Lịch sử giữ tên/ID/thời điểm/lựa chọn/hậu quả; reset nhân vật không xóa hoặc đổi người thắng.\n' +
      '• Nhiệm vụ hậu quả cho người đến sau, luật vận hành và phương án người thắng vắng mặt phải được chốt trước phát hành. Không mở nguồn sở hữu kiếm Thất Đại Tội.');
    if (action === 'history') {
      if (args[1] && (!/^[1-9]\d*$/.test(args[1]) || !Number.isSafeInteger(Number(args[1])) || Number(args[1]) > 100000)) return reply('Trang phải là số nguyên từ 1 đến 100000.');
      const page = Number(args[1] || 1), rows = service.history(1, page - 1);
      if (!rows.length) return reply('📜 Chưa có biến cố lịch sử ở trang này. Chương 3 cá nhân không tạo người thắng lịch sử chung.');
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle(`📜 Bia lịch sử toàn thế giới · trang ${page}`)
        .setDescription(rows.map(r => `**${safe(r.chapter_title)}**\nNgười quyết định: **${safe(r.winner_name)}** (ID: ${safe(r.winner_id)})\nVề đích: <t:${Math.floor(r.finished_at / 1000)}:F>\nChốt: <t:${Math.floor(r.decided_at / 1000)}:F> · **${safe(r.choice_label)}**\n${escapeMarkdown(r.consequence)}`).join('\n\n').slice(0, 4096))], allowedMentions: { parse: [] } });
    }
    if (action === 'schedule') {
      const admin = (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean).includes(msg.author.id);
      if (!admin) return reply('🔒 Chỉ admin bot trong ADMIN_IDS được lập lịch chung; admin server không có quyền này.');
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(args[2] || '')) return reply(`Dùng ${prefix}worldstory schedule chapter4 YYYY-MM-DDTHH:mm:ssZ (UTC thật). Hiện Chapter 4 vẫn khóa nội dung.`);
      const result = service.schedule(args[1], Date.parse(args[2]), msg.author.id);
      return reply(result.error || `Đã lưu lịch ${safe(result.id)}: <t:${Math.floor(result.opens_at / 1000)}:F>. Cần công bố giờ này cho tất cả người chơi.`);
    }
    if (action === 'join') {
      const result = service.join(msg.author.id);
      return reply(result.error || 'Đã tham gia chương thế giới hiện tại. Chỉ hành động thành công sau khi tham gia mới tính.');
    }
    if (action === 'choose') {
      const result = service.choose(msg.author.id, 'chapter4', args[1]);
      return reply(result.error || `Đã ghi lịch sử vĩnh viễn: ${safe(result.choice)}. Xem ${prefix}worldstory history.`);
    }
    if (action !== 'status') return reply(`Dùng ${prefix}worldstory status / rules / history [trang]. Không có lệnh tự đặt tiến độ hay người thắng.`);
    const state = service.state();
    if (state.status === 'locked') return reply(`🔒 **Chương 4 chưa phát hành — chưa có cuộc đua**\nMột lịch sử chung cho toàn bộ người chơi bot, không tách server.\nĐiều kiện Chương 3 của bạn: ${service.eligible(msg.author.id) ? 'đã hoàn thành' : 'chưa hoàn thành'}. Hoàn thành sớm không giữ chỗ/quyền ưu tiên.\n${prefix}worldstory rules xem khung luật · ${prefix}worldstory history xem bia lịch sử.\nHiện chưa có nhiệm vụ, lịch mở, lựa chọn lịch sử hay nguồn kiếm mới.`);
    const d = state.definition;
    return reply(`🌍 **${safe(d.title)}** · ${safe(state.phase)}\nGiờ mở: <t:${Math.floor(state.opens_at / 1000)}:F>\n${state.winner_id ? `Người về đích: ${safe(state.winner_name)} (ID: ${safe(state.winner_id)})` : 'Chưa có người về đích.'}\n` +
      (state.phase === 'awaiting_choice' ? d.choices.map(c => `${safe(c.id)} — ${safe(c.label)}`).join('\n') + `\nNgười thắng: ${prefix}worldstory choose <id> (không đổi lại).` : `${prefix}worldstory history xem kết cục đã chốt.`));
  },
};
