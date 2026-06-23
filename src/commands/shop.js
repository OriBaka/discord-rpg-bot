const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('../game/player');
const { ITEMS } = require('../game/items');

const SHOP_IDS = [
  'wood_sword','iron_sword','steel_sword','dragon_sword',
  'cloth_armor','leather_armor','iron_armor','dragon_armor',
  'potion_s','potion_m','potion_l',
];

module.exports = {
  name: 'shop',
  aliases: ['store', 'cuahang'],
  description: 'Cửa hàng. !shop để xem, !buy <id>, !sell <id> [qty]',
  async execute(msg, args) {
    const sub = (args[0] || 'list').toLowerCase();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước nhé!');

    if (sub === 'list' || !['buy','sell'].includes(sub)) {
      const lines = SHOP_IDS.map(id => {
        const it = ITEMS[id];
        return `${it.name} — **${it.price}** 💰 \`${it.id}\``;
      });
      const embed = new EmbedBuilder()
        .setColor(0xEB459E).setTitle('🏪 Cửa Hàng')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Vàng của bạn: ${p.gold} 💰 • Dùng !buy <id>` });
      return msg.reply({ embeds: [embed] });
    }
  },
};

// Hai lệnh riêng buy/sell để code rõ ràng
module.exports.buy = {
  name: 'buy',
  aliases: ['mua'],
  description: 'Mua vật phẩm: !buy <id> [qty]',
  async execute(msg, args) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước.');
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id || !ITEMS[id] || !SHOP_IDS.includes(id)) {
      return msg.reply('❌ Vật phẩm không có trong shop. Gõ `!shop` để xem danh sách.');
    }
    const it = ITEMS[id];
    const total = it.price * qty;
    if (p.gold < total) return msg.reply(`💸 Không đủ vàng! Cần **${total}**, bạn có **${p.gold}**.`);
    updatePlayer(msg.author.id, { gold: p.gold - total });
    addItem(msg.author.id, id, qty);
    return msg.reply(`✅ Đã mua **${qty}x ${it.name}** với giá **${total}** 💰`);
  },
};

module.exports.sell = {
  name: 'sell',
  aliases: ['ban'],
  description: 'Bán vật phẩm: !sell <id> [qty]',
  async execute(msg, args) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước.');
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id || !ITEMS[id]) return msg.reply('❌ Sai ID vật phẩm.');
    if (!hasItem(msg.author.id, id, qty)) return msg.reply('❌ Không đủ vật phẩm để bán.');
    const it = ITEMS[id];
    const gain = (it.sell || Math.floor((it.price||0)/3)) * qty;
    removeItem(msg.author.id, id, qty);
    updatePlayer(msg.author.id, { gold: p.gold + gain });
    return msg.reply(`✅ Đã bán **${qty}x ${it.name}** thu **${gain}** 💰`);
  },
};
