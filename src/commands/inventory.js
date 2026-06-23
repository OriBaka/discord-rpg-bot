const { EmbedBuilder } = require('discord.js');
const { getPlayer, getInventory } = require('../game/player');
const { ITEMS } = require('../game/items');

module.exports = {
  name: 'inv',
  aliases: ['bag', 'inventory', 'tui'],
  description: 'Xem túi đồ',
  async execute(msg) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước nhé!');

    const items = getInventory(msg.author.id);
    if (items.length === 0) {
      return msg.reply('🎒 Túi đồ trống trơn! Đi `!hunt` để nhặt loot nào.');
    }

    const grouped = { weapon: [], armor: [], consumable: [], material: [] };
    for (const r of items) {
      const it = ITEMS[r.item_id];
      if (!it) continue;
      grouped[it.type]?.push(`${it.name} x${r.qty} \`${it.id}\``);
    }

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🎒 Túi đồ của ${p.name}`)
      .addFields(
        { name: '🗡️ Vũ khí',    value: grouped.weapon.join('\n')     || '—' },
        { name: '🦺 Giáp',       value: grouped.armor.join('\n')      || '—' },
        { name: '🧪 Tiêu hao',   value: grouped.consumable.join('\n') || '—' },
        { name: '📦 Nguyên liệu', value: grouped.material.join('\n')   || '—' },
      )
      .setFooter({ text: 'Dùng !equip <id> hoặc !use <id>' });

    return msg.reply({ embeds: [embed] });
  },
}; 
