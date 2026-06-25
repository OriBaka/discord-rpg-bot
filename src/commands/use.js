const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, removeItem, hasItem } = require('../game/player');
const { ITEMS } = require('../game/items');
const lootbox = require('../game/lootbox');

module.exports = {
  name: 'use',
  aliases: ['dung', 'open'],
  description: 'Dùng vật phẩm tiêu hao hoặc mở hộp quà: !use <id> [qty]',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0];
    const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id || !ITEMS[id]) return msg.reply(`❌ Sai ID. Xem \`${prefix}inv\`.`);
    const it = ITEMS[id];
    if (!['consumable', 'lootbox'].includes(it.type)) {
      return msg.reply('❌ Vật phẩm này không dùng được.');
    }
    if (!hasItem(msg.author.id, id, qty)) return msg.reply(`❌ Bạn không có đủ ${qty}× vật phẩm này.`);

    // ===== LOOTBOX =====
    if (it.type === 'lootbox') {
      const table = lootbox.getLootTable(id);
      if (table.length === 0) {
        return msg.reply(`❌ Lootbox **${it.name}** chưa có nội dung. Báo admin set bằng \`${prefix}lootbox add\`.`);
      }

      // Mở qty lần
      const allSummary = [];
      const ctx = { client: msg.client, guildId: msg.guild?.id };
      for (let i = 0; i < qty; i++) {
        removeItem(msg.author.id, id, 1);
        const { rewards } = lootbox.openLootbox(id, 1);
        const summary = lootbox.applyRewards(msg.author.id, rewards, ctx);
        allSummary.push(...summary);
      }

      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`🎁 Mở ${qty}× ${it.name}`)
        .setDescription(allSummary.length > 0 ? allSummary.join('\n') : '*(Không nhận được gì? Báo admin check loot_table)*');
      if (it.image_url) embed.setThumbnail(it.image_url);
      return msg.reply({ embeds: [embed] });
    }

    // ===== CONSUMABLE thường =====
    if (qty > 1) return msg.reply('💡 Bình máu/consumable chỉ dùng 1 cái mỗi lần.');
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
