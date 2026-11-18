const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const aura = require('./aura');
const { tierInfo } = require('./tiers');
function describe(state, key) { return require('../commands/aura').describe(state, key); }
function comparison(s) {
  if (!s?.pending_stat) return 'Roll để tạo một kết quả chờ. Aura đang dùng không bị thay đổi.';
  if (!s.active_stat) return 'Chưa có Aura đang dùng. Nhận ô chờ để kích hoạt.';
  if (s.pending_stat !== s.active_stat) return 'Khác hướng build — không thể kết luận mạnh/yếu chỉ bằng %. Nhận sẽ mất Aura đang dùng.';
  const delta = s.pending_percent - s.active_percent;
  return delta === 0 ? 'Cùng hiệu ứng và cùng mức buff. Nhận không tăng sức mạnh.'
    : `${delta > 0 ? '↑ Tăng' : '⚠️ GIẢM'} ${Math.abs(delta)} điểm % cùng hiệu ứng (${s.active_percent}% → ${s.pending_percent}%).`;
}
function button(user, token, action, label, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder().setCustomId(`aura:${action}:${user}:${token}`).setLabel(label).setStyle(style).setDisabled(disabled);
}
function render(user, notice = '', details = false) {
  const s = aura.get(user), rev = aura.token(s);
  const embed = new EmbedBuilder().setColor(tierInfo(s?.active_tier).color).setTitle('✨ AURA · Khí lực')
    .setDescription((notice ? notice + '\n\n' : '') + `**Đang dùng**\n${describe(s, 'active')}\n\n**Ô chờ**\n${describe(s, 'pending')}`)
    .addFields({ name: 'So sánh trước khi nhận', value: comparison(s) },
      { name: 'Chi phí & tỷ lệ', value: `${aura.COST} vàng/lượt, không hoàn lại. Common 60% · Rare 28% · Epic 10% · Legendary 2%. Mỗi hiệu ứng 6,25%, độc lập tier. Không pity.` },
      { name: 'Lưu ý', value: 'Roll thay ô chờ cũ, không thay Aura đang dùng. Accept thay Aura đang dùng kể cả khi yếu hơn. Buff nghề chịu trần công cụ/vật phẩm. Xem aura help để tra hiệu ứng.' })
    .setFooter({ text: `Đã roll ${s?.rolls || 0} lượt · tiêu ${s?.gold_spent || 0} vàng · nút chỉ dành cho chủ hồ sơ` });
  if (details) embed.addFields(
    { name: 'Độ hiếm', value: aura.TIERS.map(t => `${t.id}: ${t.chance}% · +${t.min}–${t.max}%`).join('\n') },
    { name: 'Hiệu ứng', value: Object.entries(aura.EFFECTS).map(([id,e]) => `${id}: ${e.name}`).join('\n') });
  return { content: '', embeds: [embed], components: [new ActionRowBuilder().addComponents(
    button(user,rev,'roll',`Roll · ${aura.COST} vàng`,ButtonStyle.Primary),
    button(user,rev,'accept','Accept',ButtonStyle.Success,!s?.pending_stat),
    button(user,rev,'discard','Discard',ButtonStyle.Danger,!s?.pending_stat),
    button(user,rev,'refresh','Làm mới'))] };
}
async function handle(interaction) {
  const parts = interaction.customId.split(':');
  if (parts.length !== 4) return interaction.reply({ content: 'Nút Aura không hợp lệ.', ephemeral: true });
  const [,action,user,rev] = parts;
  if (interaction.user.id !== user) return interaction.reply({ content: 'Nút này chỉ dành cho chủ hồ sơ Aura.', ephemeral: true });
  if (!require('./player').getPlayer(user)) return interaction.reply({ content: 'Nhân vật không còn tồn tại.', ephemeral: true });
  const s = aura.get(user);
  if (action === 'refresh') return interaction.update(render(user));
  if (rev !== aura.token(s)) return interaction.reply({ content: aura.STALE, ephemeral: true });
  if (['roll','accept','discard'].includes(action)) {
    if (action !== 'roll' && !s?.pending_stat) return interaction.reply({ content: 'Không có Aura chờ.', ephemeral: true });
    const next = { roll:'pay', accept:'apply', discard:'drop' }[action];
    const text = action === 'roll'
      ? `Xác nhận tiêu **${aura.COST} vàng** không hoàn lại? Ô chờ hiện tại sẽ bị thay thế, không bảo đảm kết quả tốt hơn.\n${describe(s,'pending')}`
      : `${describe(s,'active')}\n↓\n${describe(s,'pending')}\n${comparison(s)}\n` + (action === 'accept' ? '**Xác nhận thay Aura đang dùng? Không thể hoàn tác.**' : '**Xác nhận bỏ ô chờ? Aura đang dùng được giữ lại.**');
    return interaction.reply({ content: text, ephemeral: true, components: [new ActionRowBuilder().addComponents(
      button(user,rev,next,action === 'roll' ? `Trả ${aura.COST} vàng & roll` : 'Xác nhận',ButtonStyle.Danger),
      button(user,rev,'refresh','Hủy / Quay lại'))] });
  }
  let result, notice;
  if (action === 'pay') { result = aura.roll(user, Date.now(), undefined, rev); notice = 'Đã roll. Kết quả mới ở ô chờ, chưa có hiệu lực.'; }
  else if (action === 'apply' || action === 'drop') { result = aura.resolve(user, action === 'apply', rev); notice = action === 'apply' ? 'Đã nhận Aura mới. Áp dụng cho trận mới.' : 'Đã bỏ ô chờ.'; }
  else return interaction.reply({ content: 'Hành động Aura không hợp lệ.', ephemeral: true });
  if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
  return interaction.update(render(user, notice));
}
module.exports = { render, handle, comparison };
