const collections = require('../game/collections');
const { getPrefix } = require('../game/prefix');
const FILTERS = { all: 'Tất cả', missing: 'Chưa có', owned: 'Đã có', rare: 'Hiếm' };
function render({ userId, kind, filter = 'all', page = 0, replyFn }) {
  if (!Object.hasOwn(collections.JOBS, kind) || !Object.hasOwn(FILTERS, filter) || !require('../game/player').getPlayer(userId)) return replyFn({ content: 'Sổ sưu tập hoặc nhân vật không hợp lệ.', components: [] });
  const items = collections.list(userId, kind);
  const filtered = items.filter(i => filter === 'all' || filter === 'rare' && i.rare || filter === 'owned' && i.discovered_at || filter === 'missing' && !i.discovered_at);
  const rares = items.filter(i => i.rare), weather = require('../game/world_weather');
  const result = require('../game/paginator').build({
    domain: 'collection', userId, items: filtered, page, perPage: 8,
    filter: `${kind}.${filter}`, filterOptions: Object.entries(FILTERS).map(([key, label]) => ({ key: `${kind}.${key}`, label })),
    color: kind === 'fish' ? 0x3498DB : 0x57F287,
    title: `${kind === 'fish' ? '🎣 Fish' : '🌿 Gather'} — Bộ sưu tập ${items.filter(i => i.discovered_at).length}/${items.length} · ${FILTERS[filter]}`,
    footer: `Hiếm ${rares.filter(i => i.discovered_at).length}/${rares.length} • Bán/dùng hết vẫn giữ dấu`,
    formatItem: i => {
      const condition = i.rare ? `${weather.WEATHER[i.rare.weather]} · ${i.rare.period === 'day' ? 'ban ngày' : 'ban đêm'} · ${(i.rare.chance * 100).toFixed(1)}%` : 'Nguồn thường';
      return `${i.discovered_at ? '✅' : '⬜'} **${i.name.slice(0, 100)}**${i.rare ? ' ✨ Hiếm' : ''}\n\`${i.id}\` · ${i.sources.join(', ').slice(0, 160)}\n${condition}${i.discovered_at ? ` · ghi nhận <t:${Math.floor(i.discovered_at / 1000)}:d>` : ''}`;
    },
  });
  return replyFn({ embeds: [result.embed], components: result.components, allowedMentions: { parse: [] } });
}
module.exports = {
  name: 'collection', aliases: ['collections', 'bosuutap'], description: 'Sổ fish/gather: collection fish [trang] [all/missing/owned/rare]', render,
  async execute(msg, args = []) {
    const p = getPrefix(), uid = msg.author.id;
    if (!require('../game/player').getPlayer(uid)) return msg.reply(`Tạo nhân vật bằng ${p}start trước.`);
    const kind = (args[0] || '').toLowerCase();
    if (kind === 'title') {
      const m = collections.MILESTONES.find(m => m.kind === args[1]);
      const achievements = require('../game/achievements');
      if (!m || !achievements.hasUnlocked(uid, m.id)) return msg.reply(`Chưa mở danh hiệu. Hoàn thành 5/5 fish hiếm, 5/5 gather hiếm hoặc 10/10; dùng ${p}collection title fish/gather/all.`);
      achievements.updatePlayerStats(uid, { current_title: m.title });
      return msg.reply(`🎖️ Đã chọn danh hiệu: ${m.title}. Chỉ vinh danh, không tăng chỉ số.`);
    }
    if (!kind) {
      const summary = ['fish', 'gather'].map(k => {
        const items = collections.list(uid, k);
        return `${k === 'fish' ? '🎣 Fish' : '🌿 Gather'}: **${items.filter(i => i.discovered_at).length}/${items.length}** · ${p}collection ${k}`;
      });
      return msg.reply(summary.join('\n') + `\nGhi nhận từ mọi nguồn; bán/dùng hết vẫn giữ dấu. Mốc hiếm 5/5 cá, 5/5 cây, 10/10 mở danh hiệu: ${p}collection title fish/gather/all.`);
    }
    const rest = args.slice(1), pageArg = rest.find(a => /^\d+$/.test(a)), filter = rest.find(a => Object.hasOwn(FILTERS, a)) || 'all';
    if (!Object.hasOwn(collections.JOBS, kind) || rest.length > 2 || rest.some(a => a !== pageArg && !Object.hasOwn(FILTERS, a)) || (pageArg && (!Number.isSafeInteger(Number(pageArg)) || Number(pageArg) < 1))) return msg.reply(`Dùng ${p}collection fish [trang] [all/missing/owned/rare] hoặc ${p}collection gather ...`);
    return render({ userId: uid, kind, page: Number(pageArg || 1) - 1, filter, replyFn: payload => msg.reply(payload) });
  },
};
