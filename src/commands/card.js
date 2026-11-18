// No external avatars/URLs are fetched: rendering uses only bundled assets.
const busy = new Set();
let active = 0;
module.exports = {
  name: 'card', aliases: [], description: 'Xuất profile card ảnh PNG của bạn',
  async execute(msg) {
    const id = msg.author.id;
    if (!require('../game/player').getPlayer(id)) return msg.reply('Tạo nhân vật trước bằng lệnh start.');
    if (busy.has(id) || active >= 2) return msg.reply('Đang dựng ảnh, thử lại sau vài giây.');
    busy.add(id); active++;
    try {
      const png = await require('../game/profile_card').renderCard(id);
      return await msg.reply({ files: [{ attachment: png, name: 'profile-card.png' }] });
    } catch (err) {
      console.error('[card]', err);
      return msg.reply('Không dựng được ảnh lúc này. Bạn vẫn có thể xem hồ sơ bằng me.');
    } finally { active--; busy.delete(id); }
  },
};
