const { getPlayer, updatePlayer } = require('../game/player');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'daily',
  aliases: ['diemdanh'],
  description: 'Điểm danh hàng ngày nhận vàng + hồi máu',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const now = Date.now();
    const remain = DAY_MS - (now - p.last_daily);
    if (remain > 0) {
      const h = Math.floor(remain / 3600000);
      const m = Math.floor((remain % 3600000) / 60000);
      return msg.reply(`⏳ Quay lại sau **${h}h ${m}m** nữa.`);
    }
    const reward = 100 + p.level * 20;
    updatePlayer(msg.author.id, {
      last_daily: now,
      gold: p.gold + reward,
      hp: p.max_hp,
    });
    return msg.reply(`🎁 Điểm danh thành công! Nhận **${reward}** 💰 và hồi đầy HP.`);
  },
};
