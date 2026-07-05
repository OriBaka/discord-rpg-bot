// Shared paginator helper: build embed + buttons cho list
// Support filter groups + prev/next
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PER_PAGE = 8;

// Stateless: encode toàn bộ state vào customId
// Format: page:<domain>:<userId>:<filter>:<page>
// VD: page:craft:123456789:weapon:0
// Filter=all → hiện tất cả. Filter khác = filter key

function encodeCustomId(domain, userId, filter, page) {
  return `page:${domain}:${userId}:${filter}:${page}`;
}

function decodeCustomId(customId) {
  const parts = customId.split(':');
  if (parts[0] !== 'page') return null;
  return {
    domain: parts[1],
    userId: parts[2],
    filter: parts[3],
    page: parseInt(parts[4]) || 0,
  };
}

// Build page: {embed, components}
// Input:
//   domain: 'craft' | 'cook' | 'shop' | ...
//   userId: người gọi (để check khi click)
//   items: array (đã lọc theo filter)
//   filter: current filter key
//   filterOptions: [{key, label, emoji}, ...]
//   page: current page
//   title: embed title
//   color: embed color
//   formatItem: function(item, idx) → string
//   footer: text (optional)
function build({ domain, userId, items, filter, filterOptions, page, title, color, formatItem, footer, perPage = PER_PAGE }) {
  const total = items.length;
  const maxPage = Math.max(0, Math.ceil(total / perPage) - 1);
  page = Math.max(0, Math.min(page, maxPage));

  const start = page * perPage;
  const end = Math.min(start + perPage, total);
  const slice = items.slice(start, end);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      total === 0
        ? '_(trống)_'
        : slice.map((it, i) => formatItem(it, start + i)).join('\n\n').slice(0, 4000)
    )
    .setFooter({ text: `Trang ${page+1}/${Math.max(1, maxPage+1)} • ${total} mục${footer ? ' • ' + footer : ''}` });

  const components = [];

  // Row 1: filter buttons (nếu có nhiều hơn 1 filter option)
  if (filterOptions && filterOptions.length > 1) {
    const filterRow = new ActionRowBuilder();
    for (const opt of filterOptions.slice(0, 5)) {
      const isCurrent = opt.key === filter;
      filterRow.addComponents(
        new ButtonBuilder()
          .setCustomId(encodeCustomId(domain, userId, opt.key, 0))
          .setLabel(opt.label)
          .setEmoji(opt.emoji || '📁')
          .setStyle(isCurrent ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(isCurrent)
      );
    }
    components.push(filterRow);
  }

  // Row 2: page nav
  if (maxPage > 0) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(encodeCustomId(domain, userId, filter, page - 1))
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId(`page_info_${page+1}_${maxPage+1}`)
        .setLabel(`${page+1} / ${maxPage+1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(encodeCustomId(domain, userId, filter, page + 1))
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= maxPage),
    );
    components.push(navRow);
  }

  return { embed, components };
}

module.exports = { build, decodeCustomId, encodeCustomId, PER_PAGE };
