const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const db = require('../db/database');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

function getShopList() {
  return db.prepare(`SELECT s.item_id, s.price, i.name, i.type, i.tier
    FROM shop s JOIN items i ON i.id = s.item_id
    ORDER BY i.type, s.price`).all();
}

module.exports = {
  name: 'shop',
  aliases: ['store', 'cuahang'],
  description: 'Cửa hàng. !shop, admin: !shop add/remove/setprice',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();
    const p = getPlayer(msg.author.id);

    // ===== Admin: !shop add <id> [price] =====
    if (sub === 'add') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin mới được thêm/sửa shop.');
      const id = args[1]; const customPrice = parseInt(args[2]);
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}shop add <item_id> [giá]\``);
      const it = getItem(id);
      if (!it) return msg.reply(`❌ Item \`${id}\` không tồn tại.`);
      const price = isNaN(customPrice) ? it.price : customPrice;
      if (price <= 0) return msg.reply('❌ Giá phải > 0.');
      db.prepare('INSERT OR REPLACE INTO shop (item_id, price) VALUES (?, ?)').run(id, price);
      return msg.reply(`✅ Đã thêm **${it.name}** vào shop với giá **${price}** 💰`);
    }

    // ===== Admin: !shop remove <id> =====
    if (sub === 'remove' || sub === 'rm' || sub === 'del') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      const id = args[1];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}shop remove <item_id>\``);
      const r = db.prepare('DELETE FROM shop WHERE item_id = ?').run(id);
      if (r.changes === 0) return msg.reply('❌ Không có item này trong shop.');
      return msg.reply(`✅ Đã xoá \`${id}\` khỏi shop.`);
    }

    // ===== Admin: !shop setprice <id> <giá> =====
    if (sub === 'setprice' || sub === 'price') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      const id = args[1]; const price = parseInt(args[2]);
      if (!id || isNaN(price) || price <= 0) {
        return msg.reply(`❌ Cú pháp: \`${prefix}shop setprice <item_id> <giá>\``);
      }
      const r = db.prepare('UPDATE shop SET price = ? WHERE item_id = ?').run(price, id);
      if (r.changes === 0) return msg.reply('❌ Item chưa có trong shop. Dùng `shop add` trước.');
      return msg.reply(`✅ Đã đặt giá \`${id}\` = **${price}** 💰`);
    }

    // ===== !shop list (mặc định) =====
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const rows = getShopList();
    if (rows.length === 0) {
      return msg.reply('🏪 Shop trống! Admin có thể thêm item bằng `shop add <id>`.');
    }

    // Group theo type
    const groups = {};
    for (const r of rows) (groups[r.type] = groups[r.type] || []).push(r);

    const embed = new EmbedBuilder()
      .setColor(0xEB459E).setTitle('🏪 Cửa Hàng')
      .setFooter({ text: `Vàng: ${p.gold} 💰 • ${prefix}buy <id> [qty]` });

    const labels = { weapon: '🗡️ Vũ khí', armor: '🛡️ Giáp', consumable: '🧪 Tiêu hao', material: '📦 Nguyên liệu' };
    for (const type of Object.keys(groups)) {
      const lines = groups[type].map(r => {
        const emoji = tierInfo(r.tier).emoji;
        return `${emoji} ${r.name} — **${r.price}** 💰 \`${r.item_id}\``;
      });
      embed.addFields({ name: labels[type] || type, value: lines.join('\n').slice(0, 1024) });
    }
    return msg.reply({ embeds: [embed] });
  },
};

// ===== buy =====
module.exports.buy = {
  name: 'buy',
  aliases: ['mua'],
  description: 'Mua vật phẩm: !buy <id> [qty]',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}buy <id> [qty]\``);

    const shopRow = db.prepare('SELECT price FROM shop WHERE item_id = ?').get(id);
    if (!shopRow) return msg.reply('❌ Vật phẩm không có trong shop. Gõ `' + prefix + 'shop` để xem.');
    const it = getItem(id);
    if (!it) return msg.reply('❌ Item không tồn tại.');

    const total = shopRow.price * qty;
    if (p.gold < total) return msg.reply(`💸 Không đủ vàng! Cần **${total}**, bạn có **${p.gold}**.`);
    updatePlayer(msg.author.id, { gold: p.gold - total });
    addItem(msg.author.id, id, qty);
    return msg.reply(`✅ Đã mua **${qty}x ${it.name}** với giá **${total}** 💰`);
  },
};

// ===== sell =====
module.exports.sell = {
  name: 'sell',
  aliases: ['ban'],
  description: 'Bán vật phẩm: !sell <id> [qty]',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}sell <id> [qty]\``);
    const it = getItem(id);
    if (!it) return msg.reply('❌ Sai ID vật phẩm.');
    if (!hasItem(msg.author.id, id, qty)) return msg.reply('❌ Không đủ vật phẩm để bán.');
    const gain = (it.sell || Math.floor((it.price || 0) / 3)) * qty;
    removeItem(msg.author.id, id, qty);
    updatePlayer(msg.author.id, { gold: p.gold + gain });
    return msg.reply(`✅ Đã bán **${qty}x ${it.name}** thu **${gain}** 💰`);
  },
};
