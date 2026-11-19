const { EmbedBuilder } = require('discord.js');
const tower = require('./tower');
function render(b, notice = '') {
  const run = tower.run(b.id), f = tower.floorInfo(run.floor);
  const p = require('./player').getPlayer(run.user_id);
  const cmd = require('../commands/battle');
  const embed = cmd.buildBattleEmbed(b, p.name, f.name)
    .setTitle(`🏯 Tháp Canh · Tầng ${f.floor}/15${f.boss ? ' · BOSS' : ''}`)
    .setDescription(`${notice ? notice + '\n' : ''}Lv.${f.level} khuyến nghị · HP mô phỏng, không mất HP/vàng thật.\nThưởng lần đầu: ${f.gold} vàng${f.badge ? ` · Danh hiệu: ${f.badge}` : ''}.`)
    .setFooter({ text: `Trận #${b.id} · Class cố định: ${run.class_id} · 30 phút không thao tác sẽ hết hạn` });
  if (b.status !== 'active') {
    embed.setColor(b.winner === 'a' ? 0x2ECC71 : 0x95A5A6);
    embed.addFields({ name: 'Kết quả', value: b.winner === 'a' ? '🏆 Vượt tầng! Dùng tower start để đi tiếp hoặc luyện lại.' : 'Chưa vượt tầng. Dùng tower start để thử lại miễn phí.' });
    return { embeds: [embed], components: [] };
  }
  const rows = cmd.buildActionButtons(b.id, run.class_id);
  for (const row of rows) for (const button of row.components) {
    const action = button.data.custom_id.split(':')[3];
    button.setCustomId(`tower:act:${b.id}:${b.round}:${action}`);
  }
  return { embeds: [embed], components: rows };
}
async function handle(interaction) {
  const parts = interaction.customId.split(':');
  const id = Number(parts[2]), round = Number(parts[3]);
  if (parts.length !== 5 || parts[1] !== 'act' || !Number.isSafeInteger(id) || !Number.isSafeInteger(round)) return interaction.reply({ content: 'Nút Tháp không hợp lệ.', ephemeral: true });
  const result = tower.act(interaction.user.id, id, round, parts[4], interaction.message?.id, interaction.channelId || interaction.channel?.id);
  if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
  const notice = result.battle.status === 'active' ? '' : result.reward.gold
    ? `🎁 Thưởng lần đầu: +${result.reward.gold} vàng.${result.reward.badge ? ` Danh hiệu: ${result.reward.badge}.` : ''}`
    : 'Không có thưởng mới; không mất vàng/HP thật.';
  return interaction.update(render(result.battle, notice));
}
module.exports = { render, handle };
