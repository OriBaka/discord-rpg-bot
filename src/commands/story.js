const { EmbedBuilder } = require('discord.js');
const story = require('../game/story');
const { getPrefix } = require('../game/prefix');

function reward(step) {
  const item = step.item && require('../game/items').getItem(step.item);
  return `${step.gold} 💰 • ${step.xp} XP` + (item ? ` • ${step.itemQty}× ${item.name}` : '');
}
module.exports = {
  name: 'story', aliases: ['cottruyen'], description: 'Chính tuyến Thất Đại Tội: story start / claim / journal',
  async execute(msg, args = []) {
    const p = getPrefix();
    const uid = msg.author.id;
    if (!require('../game/player').getPlayer(uid)) return msg.reply(`Tạo nhân vật trước bằng \`${p}start\`.`);
    const action = (args[0] || '').toLowerCase();
    let notice = '';
    if (action === 'start') {
      notice = story.start(uid) ? '📖 Bạn mở cuốn sổ hành trình.\n' : '📖 Hành trình đã bắt đầu; không reset tiến độ.\n';
    } else if (action === 'claim') {
      const result = story.claim(uid);
      if (result.error) return msg.reply(result.error.replace('story start', `${p}story start`));
      notice = `✅ Hoàn thành **${result.step.title}**! Nhận ${reward(result.step)}.\n`;
    } else if (action && action !== 'journal' && action !== 'help') {
      return msg.reply(`Dùng \`${p}story\`, \`${p}story start\`, \`${p}story claim\`, \`${p}story journal\`.`);
    }
    const state = story.status(uid);
    if (!state) return msg.reply(`📖 **Thất Đại Tội — Những người đứng đợi**\nChương mở đầu, chương 1 và chương 2 đã có sẵn. Không khóa zone, không reset nhân vật.\nBắt đầu bằng \`${p}story start\`. Chỉ hành động sau khi nhận từng bước mới được tính; mục tiêu giao đồ kiểm tra túi hiện tại.`);
    if (action === 'journal') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('📔 Sổ hành trình')
        .setDescription(story.STEPS.map((s, i) => `${i < state.step ? '✅' : i === state.step ? '📍' : '🔒'} ${s.chapter.split(' — ')[0]} · ${s.title}`).join('\n'))
        .setFooter({ text: `${p}story để đọc bước hiện tại. Các bước sau mở lần lượt, không khóa zone.` })] });
    }
    if (!state.current) return msg.reply(notice + '🏁 Đã hoàn thành chính tuyến đến hết Chương 2 — Những lá thư dưới tuyết. Manh mối Kho Tro đang chờ trong chương tiếp theo (chưa phát hành). Xem lại các mốc bằng `' + p + 'story journal`.');
    const step = state.current;
    return msg.reply({ content: notice || undefined, embeds: [new EmbedBuilder().setColor(0xD4AF37)
      .setTitle(`📖 ${step.chapter}`).setDescription(`**${step.title}**\n\n${step.text}`)
      .addFields({ name: `Mục tiêu · ${state.progress}/${step.qty}`, value: step.goal.replaceAll('{p}', p) },
        { name: 'Thưởng một lần', value: reward(step) })
      .setFooter({ text: `${p}story claim để hoàn thành • ${p}story journal xem các mốc • chỉ tính tiến độ bước đang mở` })] });
  },
};
