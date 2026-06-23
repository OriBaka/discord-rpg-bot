const { getPlayer, createPlayer } = require('../game/player');

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
    return msg.reply(
      `🎉 Chào mừng **${p.name}** đến với thế giới phiêu lưu!\n` +
      `👉 Gõ \`${prefix}help\` để xem các lệnh.\n` +
      `👉 Gõ \`${prefix}hunt\` để bắt đầu đánh quái!`
    );
  },
};
