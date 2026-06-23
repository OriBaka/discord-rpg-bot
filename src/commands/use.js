const { getPlayer, updatePlayer, removeItem, hasItem } = require('../game/player');
const { ITEMS } = require('../game/items');

module.exports = {
  name: 'use',
  aliases: ['dung'],
  description: 'Dùng vật phẩm tiêu hao: !use <id>',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0];
    if (!id || !ITEMS[id]) return msg.reply(`❌ Sai ID. Xem \`${prefix}inv\`.`);
    const it = ITEMS[id];
    if (it.type !== 'consumable') return msg.reply('❌ Vật phẩm này không dùng được.');
    if (!hasItem(msg.author.id, id, 1)) return msg.reply('❌ Bạn không có vật phẩm này.');

    removeItem(msg.author.id, id, 1);
    if (it.heal) {
      const newHp = Math.min(p.max_hp, p.hp + it.heal);
      const healed = newHp - p.hp;
      updatePlayer(msg.author.id, { hp: newHp });
      return msg.reply(`🧪 Dùng **${it.name}**, hồi **${healed}** HP. (HP: ${newHp}/${p.max_hp})`);
    }
    return msg.reply(`✅ Đã dùng **${it.name}**.`);
  },
};
