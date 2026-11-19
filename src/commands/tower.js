const { EmbedBuilder } = require('discord.js');
const tower = require('../game/tower');
module.exports = {
  name: 'tower', aliases: ['thap', 'watchtower'],
  description: 'Tháp Canh 15 tầng: tower | tower start [tầng] | tower leave | tower top',
  async execute(msg, args = []) {
    const player = require('../game/player').getPlayer(msg.author.id);
    const prefix = require('../game/prefix').getPrefix();
    if (!player) return msg.reply(`Hãy dùng ${prefix}start để tạo nhân vật trước.`);
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'top') {
      const rows = tower.top();
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('🏯 Tháp Canh · BXH')
        .setDescription(rows.map((r, i) => `${i + 1}. **${r.name}** · tầng ${r.highest}/15`).join('\n') || 'Chưa ai vượt tầng.')
        .setFooter({ text: 'Cùng tầng: người chạm mốc trước xếp trên. Danh hiệu nằm trong hồ sơ tower.' })] });
    }
    if (sub === 'leave') {
      const active = tower.active(player.user_id);
      if (!active) return msg.reply('Bạn không có trận Tháp đang diễn ra.');
      require('../db/database').transaction(() => {
        require('../game/battle').endBattle(active.id, 'draw', ['Đã rời Tháp.']);
        tower.settle(active.id);
      })();
      return msg.reply('Đã rời Tháp. Tiến độ giữ nguyên, không mất HP/vàng; có thể thử lại miễn phí.');
    }
    if (sub && !['start', 'help', 'status'].includes(sub)) return msg.reply(`Dùng ${prefix}tower help để xem hướng dẫn.`);
    if (sub === 'start') {
      const requested = args[1] === undefined ? undefined : Number(args[1]);
      if (requested !== undefined && !Number.isInteger(requested)) return msg.reply('Tầng phải là số nguyên 1–15.');
      const result = tower.start(player.user_id, requested, msg.channel.id);
      if (result.error) return msg.reply(result.error);
      const sent = await msg.reply(require('../game/tower_ui').render(result.battle, result.resumed ? 'Tiếp tục trận đang có.' : 'Bước vào Tháp Canh.'));
      require('../game/battle').updateBattle(result.battle.id, { message_id: sent.id, channel_id: msg.channel.id });
      return;
    }
    const active = tower.active(player.user_id);
    if (active && sub !== 'help') {
      const sent = await msg.reply(require('../game/tower_ui').render(active, 'Đã mở lại trận đang có. Bảng cũ hết hiệu lực.'));
      require('../game/battle').updateBattle(active.id, { message_id: sent.id, channel_id: msg.channel.id });
      return;
    }
    const progress = tower.progress(player.user_id);
    const next = tower.floorInfo(Math.min(15, progress.highest + 1));
    const badges = Object.entries(tower.BADGES).filter(([floor]) => progress.highest >= Number(floor)).map(([, name]) => name);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('🏯 Tháp Canh · Ngọn đèn trên cao')
      .setDescription('Sau cột mốc cũ, người gác đèn mở cánh cửa Tháp. Những bóng canh giữ không phải người chết trở về, mà là ký ức để người sống luyện tay.\n15 tầng cố định, boss mỗi 5 tầng. Không phí vào, không mất vàng hoặc HP thật; mỗi lượt bắt đầu đầy HP mô phỏng.')
      .addFields({ name: 'Tiến độ', value: `Cao nhất: ${progress.highest}/15\n${progress.highest === 15 ? 'Đã hoàn thành! Có thể luyện lại.' : `Tầng kế: ${next.floor} · khuyến nghị Lv.${next.level} · ${next.hp} HP / ${next.atk} ATK / ${next.def} DEF`}\nDanh hiệu: ${badges.join(', ') || 'Chưa có'}` },
        { name: 'Lệnh', value: `${prefix}tower start [tầng] · vào tầng kế hoặc luyện tầng đã mở\n${prefix}tower · xem hồ sơ / tiếp tục trận\n${prefix}tower leave · rời trận\n${prefix}tower top · BXH` },
        { name: 'Luật', value: 'Chỉ thưởng vàng lần vượt đầu mỗi tầng; danh hiệu mốc 5/10/15 chỉ để trưng bày trong Tháp. Không XP/drop/tiến độ nhiệm vụ. Class, trang bị, nâng cấp và Aura chụp lúc vào. Tối đa 120 cặp lượt; hết hạn sau 30 phút không thao tác. Thua/thoát vẫn giữ tầng cao nhất.' })] });
  },
};
