const { EmbedBuilder } = require('discord.js');
const aura = require('../game/aura');
const { getPrefix } = require('../game/prefix');
const { tierInfo } = require('../game/tiers');
function describe(s, prefix = 'active') {
  if (!s?.[prefix + '_stat']) return 'Chưa có';
  const tier = s[prefix + '_tier'];
  return `${tierInfo(tier).emoji} **${tier.toUpperCase()} · ${aura.effectName(s[prefix + '_stat']) + ' · ' + (aura.EFFECTS[s[prefix + '_stat']]?.label || s[prefix + '_stat'])} +${s[prefix + '_percent']}%**`;
}
module.exports = {
  name: 'aura', aliases: [], description: 'Aura: roll bằng vàng, buff chiến đấu hoặc nghề; aura help để xem tỷ lệ',
  async execute(msg, args = []) {
    const p = getPrefix(); const uid = msg.author.id;
    if (!require('../game/player').getPlayer(uid)) return msg.reply(`Tạo nhân vật trước bằng ${p}start.`);
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'top') {
      const effect = args[1] || '';
      if (effect && !Object.hasOwn(aura.EFFECTS, effect)) return msg.reply('ID hiệu ứng không hợp lệ. Xem danh sách bằng aura help.');
      const rows = aura.top(effect);
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('✨ Aura · Top 10')
        .setDescription(rows.length ? rows.map((r, i) => `${i + 1}. **${r.name}** — ${describe(r)}`).join('\n') : 'Chưa có ai kích hoạt aura.')
        .setFooter({ text: 'Xếp theo % aura đang dùng; không phải tổng sức mạnh nhân vật.' })] });
    }
    let notice = '';
    if (sub === 'roll') {
      if (args[1] !== 'confirm') return msg.reply(`Mỗi lượt tiêu **${aura.COST} vàng**, không hoàn lại. Thay ô chờ cũ, giữ nguyên aura đang dùng.\nGõ \`${p}aura roll confirm\` để roll. Tỷ lệ: Common 60%, Rare 28%, Epic 10%, Legendary 2%.`);
      const result = aura.roll(uid);
      if (result.error) return msg.reply(result.error);
      notice = `Đã tiêu ${aura.COST} vàng. Aura mới ở ô chờ; chưa có hiệu lực.\n`;
    } else if (sub === 'accept' || sub === 'discard') {
      const result = aura.resolve(uid, sub === 'accept');
      if (result.error) return msg.reply(result.error);
      notice = sub === 'accept' ? '✅ Đã thay aura đang dùng. Chỉ áp dụng cho trận mới.\n' : 'Đã bỏ ô chờ, giữ aura đang dùng.\n';
    } else if (sub && sub !== 'help') return msg.reply(`Dùng ${p}aura [roll confirm | accept | discard | top | help].`);
    const state = aura.get(uid);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(tierInfo(state?.active_tier).color).setTitle('✨ AURA · Khí lực')
      .setDescription(notice + `**Đang dùng**\n${describe(state)}\n\n**Ô chờ**\n${describe(state, 'pending')}`)
      .addFields({ name: 'Tỷ lệ & sức mạnh', value: aura.TIERS.map(t => `${t.id}: ${t.chance}% · +${t.min}–${t.max}%`).join('\n') },
        { name: 'Quy tắc', value: '16 hiệu ứng có xác suất bằng nhau (6,25% mỗi loại), độc lập tier. Một aura duy nhất; không pity. Drop nhân tỷ lệ cơ bản; extra/save cộng điểm %. Có trần công cụ + buff. HP theo tỷ lệ máu, không hồi miễn phí. Ô chờ chưa buff.' },
        { name: 'Hiệu ứng', value: Object.entries(aura.EFFECTS).map(([id, e]) => `${id}: ${e.name}`).join('\n') },
        { name: 'Cách dùng', value: `${p}aura roll confirm — ${aura.COST} vàng/lượt\n${p}aura accept — nhận ô chờ, mất aura đang dùng\n${p}aura discard — bỏ ô chờ\n${p}aura top [effect_id] — BXH theo hiệu ứng\nĐã roll ${state?.rolls || 0} lượt · tiêu ${state?.gold_spent || 0} vàng` })] });
  },
  describe,
};
