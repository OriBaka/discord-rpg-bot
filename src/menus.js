const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('./game/player');
const { getItem } = require('./game/items');
const { clearEquipped } = require('./game/slots');

async function handle(interaction) {
  const customId = interaction.customId;
  const parts = customId.split(':');
  const [domain, action, ...rest] = parts;

  if (domain === 'inv') {
    if (action === 'select') {
      const selectedValue = interaction.values[0];
      const itemId = selectedValue.split(':')[1];
      return showItemActions(interaction, itemId);
    }
  }
  return interaction.reply({ content: '❌ Hành động menu không xác định.', ephemeral: true });
}

async function showItemActions(interaction, itemId) {
  const p = getPlayer(interaction.user.id);
  if (!p) return interaction.reply({ content: '❌ Bạn chưa có nhân vật.', ephemeral: true });
  const it = getItem(itemId);
  if (!it) return interaction.reply({ content: '❌ Item không tồn tại.', ephemeral: true });
  if (!hasItem(interaction.user.id, itemId, 1)) return interaction.reply({ content: '❌ Bạn không còn sở hữu item này.', ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setTitle(`📦 Quản lý vật phẩm: ${it.name}`)
    .setDescription(`ID: \`${it.id}\`\n${it.desc || 'Không có mô tả.'}`)
    .addFields({ name: 'Số lượng', value: `Bạn đang sở hữu item này.` });

  const actions = [];
  if (it.type === 'consumable') actions.push(new ButtonBuilder().setCustomId(`item:use:${itemId}`).setLabel('Dùng').setStyle(ButtonStyle.Success));
  if (['weapon', 'armor', 'accessory'].includes(it.type)) {
    actions.push(new ButtonBuilder().setCustomId(`item:equip:${itemId}`).setLabel('Trang bị').setStyle(ButtonStyle.Primary));
    actions.push(new ButtonBuilder().setCustomId(`item:unequip:${itemId}`).setLabel('Tháo').setStyle(ButtonStyle.Secondary));
  }
  actions.push(new ButtonBuilder().setCustomId(`item:sell:${itemId}`).setLabel('Bán').setStyle(ButtonStyle.Danger));

  const rows = [];
  for (let i = 0; i < actions.length; i += 5) rows.push(new ActionRowBuilder().addComponents(actions.slice(i, i + 5)));

  return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
}

module.exports = { handle }; 
