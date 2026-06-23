const { getPlayer, updatePlayer, hasItem } = require('../game/player');
const { ITEMS } = require('../game/items');

module.exports = {
  name: 'equip',
  aliases: ['trangbi'],
  description: 'Trang bị vũ khí/giáp: !equip <id>',
  async execute(msg, args) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước.');
    const id = args[0];
    if (!id || !ITEMS[id]) return msg.reply('❌ Sai ID. Xem `!inv`.');
    const it = ITEMS[id];
    if (!['weapon','armor'].includes(it.type)) {
      return msg.reply('❌ Vật phẩm này không trang bị được.');
    }
    if (!hasItem(msg.author.id, id, 1)) return msg.reply('❌ Bạn không có vật phẩm này.');
    const field = it.type === 'weapon' ? 'weapon_id' : 'armor_id';
    updatePlayer(msg.author.id, { [field]: id });
    return msg.reply(`✅ Đã trang bị **${it.name}**!`);
  },
}; 
