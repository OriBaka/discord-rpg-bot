const { EmbedBuilder } = require('discord.js');
const aura = require('../game/aura');
const { getPrefix } = require('../game/prefix');
const { tierInfo } = require('../game/tiers');
function describe(s, prefix = 'active') {
  if (!s?.[prefix + '_stat']) return 'Chưa có';
  const tier = s[prefix + '_tier'];
  return `${tierInfo(tier).emoji} **${tier.toUpperCase()} · ${s[prefix + '_stat'].toUpperCase()} +${s[prefix + '_percent']}%**`;
}
module.exports = {
  name: 'aura', aliases: [], description: 'Aura: roll bằng vàng, buff ATK hoặc DEF; aura help để xem tỷ lệ',
  async execute(msg, args = []) {
    const p = getPrefix(); const uid = msg.author.id;
    if (!require('../game/player').getPlayer(uid)) return msg.reply(`Tạo nhân vật trước bằng ${p}start.`);
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'top') {
      const rows = aura.top();
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
        { name: 'Quy tắc', value: 'ATK / DEF: 50–50, giá trị trong mỗi tier chia đều. Một aura duy nhất, không cộng dồn. Không pity hoặc bảo đảm nâng cấp. Bonus làm tròn xuống trên chỉ số cơ bản + trang bị. Ô chờ chưa buff.' },
        { name: 'Cách dùng', value: `${p}aura roll confirm — ${aura.COST} vàng/lượt\n${p}aura accept — nhận ô chờ, mất aura đang dùng\n${p}aura discard — bỏ ô chờ\n${p}aura top — BXH\nĐã roll ${state?.rolls || 0} lượt · tiêu ${state?.gold_spent || 0} vàng` })] });
  },
  describe,
};
