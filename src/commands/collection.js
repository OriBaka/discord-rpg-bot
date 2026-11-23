const { EmbedBuilder } = require('discord.js');
const collections = require('../game/collections');
const { getPrefix } = require('../game/prefix');
module.exports = {
  name: 'collection', aliases: ['collections', 'bosuutap'], description: 'Sổ sưu tập fish/gather, lưu cả món đã bán hoặc dùng hết',
  async execute(msg, args = []) {
    const p = getPrefix(), uid = msg.author.id;
    if (!require('../game/player').getPlayer(uid)) return msg.reply(`Tạo nhân vật bằng ${p}start trước.`);
    const kind = (args[0] || '').toLowerCase();
    if (!kind) {
      const summary = ['fish', 'gather'].map(k => {
        const items = collections.list(uid, k);
        return `${k === 'fish' ? '🎣 Fish' : '🌿 Gather'}: **${items.filter(i => i.discovered_at).length}/${items.length}** · ${p}collection ${k}`;
      });
      return msg.reply(summary.join('\n') + '\nGhi nhận lần đầu nhận từ mọi nguồn (tự tìm, mua, trao đổi, quà). Đã bán/dùng hết vẫn giữ dấu.');
    }
    if (!Object.hasOwn(collections.JOBS, kind) || (args[1] && !/^[1-9]\d*$/.test(args[1]))) return msg.reply(`Dùng ${p}collection fish [trang] hoặc ${p}collection gather [trang].`);
    const items = collections.list(uid, kind), perPage = 8, pages = Math.max(1, Math.ceil(items.length / perPage));
    const page = Math.min(Number(args[1] || '1'), pages);
    const weather = require('../game/world_weather');
    const rows = items.slice((page - 1) * perPage, page * perPage).map(i => {
      const condition = i.rare ? `${weather.WEATHER[i.rare.weather]} · ${i.rare.period === 'day' ? 'ban ngày' : 'ban đêm'} · ${(i.rare.chance * 100).toFixed(1)}%` : 'Nguồn thường';
      return `${i.discovered_at ? '✅' : '⬜'} **${i.name.slice(0, 100)}**${i.rare ? ' ✨ Hiếm' : ''}\n\`${i.id}\` · ${i.sources.join(', ').slice(0, 160)}\n${condition}${i.discovered_at ? ` · ghi nhận <t:${Math.floor(i.discovered_at / 1000)}:d>` : ''}`;
    });
    const rareItems = items.filter(i => i.rare);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(kind === 'fish' ? 0x3498DB : 0x57F287)
      .setTitle(`${kind === 'fish' ? '🎣 Fish' : '🌿 Gather'} — Bộ sưu tập ${items.filter(i => i.discovered_at).length}/${items.length}`)
      .setDescription(rows.join('\n\n') || 'Chưa có vật phẩm trong danh mục.')
      .setFooter({ text: `Trang ${page}/${pages} • Hiếm ${rareItems.filter(i => i.discovered_at).length}/${rareItems.length} • ${p}collection ${kind} <trang> • Bán/dùng hết vẫn giữ dấu` })], allowedMentions: { parse: [] } });
  },
};
