// CHỢ NGƯỜI CHƠI — xem / đăng bán / mua / huỷ / tìm / lịch sử giá
//
// Vì sao có lệnh này: `%sell` bán cho NPC với giá cố định (≈40% giá shop), nên
// nguyên liệu hiếm KHÔNG có giá thị trường — người có 20 mithril ore và người
// cần 2 cái để chế đồ không gặp nhau được. Xem src/game/market.js để biết luật
// (escrow, thuế, hạn tin, giới hạn tin/người).
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer } = require('../game/player');
const { tierInfo } = require('../game/tiers');
const display = require('../game/item_display');
const paginator = require('../game/paginator');
const market = require('../game/market');

const CATEGORY_ORDER = ['material', 'consumable', 'weapon', 'armor', 'accessory', 'offhand', 'tool', 'other'];

// Nhãn loại hàng lấy từ item_display (nguồn duy nhất) → thêm type mới vào game
// là chợ tự có nhãn, không phải sửa file này.
function categoryLabel(type) {
  return display.typeLabel(type).replace(/^\S+\s/, '') || type;
}

function categoriesOf(listings) {
  const counts = new Map();
  for (const l of listings) {
    const k = l.type || 'other';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return b[1] - a[1];
    })
    .slice(0, 4)
    .map(([key]) => ({ key, label: categoryLabel(key).slice(0, 20), emoji: display.typeLabel(key).split(' ')[0] }));
}

function sellerName(userId) {
  const row = db.prepare('SELECT name FROM players WHERE user_id = ?').get(userId);
  return row ? row.name : userId;
}

function ago(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatLine(l) {
  const t = tierInfo(l.tier || 'common');
  const total = l.price * l.qty;
  return `${t.emoji} **${l.name}** ×${l.qty} — **${l.price}** 💰/món (tổng ${total})\n` +
    `   \`#${l.id}\` • ${sellerName(l.seller_id)} • ${ago(l.created_at)} trước\n` +
    `   \`${prefix()}market buy ${l.id}\` để mua`;
}

function prefix() { return require('../game/prefix').getPrefix(); }

function renderMarketPage({ userId, filter, page, replyFn }) {
  market.cleanupExpired();
  const all = market.allListings();
  const cats = categoriesOf(all);
  const filterOptions = [{ key: 'all', label: 'All', emoji: '🏪' }, ...cats];
  const active = (filter === 'all' || cats.some(c => c.key === filter)) ? filter : 'all';
  const filtered = active === 'all' ? all : all.filter(l => (l.type || 'other') === active);
  // Rẻ trước: người mua thường tìm món rẻ nhất của loại mình cần
  filtered.sort((a, b) => a.price - b.price);

  const { embed, components } = paginator.build({
    domain: 'market',
    userId,
    items: filtered,
    filter: active,
    filterOptions,
    page,
    title: `🏪 Chợ người chơi — ${active === 'all' ? 'All' : categoryLabel(active)}`,
    color: 0x9B59B6,
    formatItem: (l) => formatLine(l),
    footer: `Đăng bán: ${prefix()}market sell <item> <giá> [qty] • Thuế ${Math.round(market.TAX_PCT * 100)}% • Tin hết hạn sau 7 ngày`,
  });
  if (filtered.length === 0) {
    embed.setDescription(`*Chợ đang trống.*\nĐăng bán món đầu tiên: \`${prefix()}market sell <item_id> <giá> [qty]\`\n` +
      `💡 Nguyên liệu hiếm, đồ ăn, vũ khí/giáp **không soulbound** đều bán được.`);
  }
  return replyFn({ embeds: [embed], components });
}

function helpEmbed() {
  const p = prefix();
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('🏪 Chợ người chơi')
    .setDescription([
      `\`${p}market\` — xem chợ (lọc theo loại bằng nút hoặc \`${p}market material\`)`,
      `\`${p}market sell <item_id> <giá> [qty]\` — đăng bán (giá tính cho 1 món)`,
      `\`${p}market buy <#id> [qty]\` — mua`,
      `\`${p}market mine\` — tin bạn đang bán (kèm nút huỷ)`,
      `\`${p}market cancel <#id>\` — huỷ tin, nhận lại item`,
      `\`${p}market search <từ khoá>\` — tìm theo tên/id`,
      `\`${p}market recent [item_id]\` — giá bán gần đây (để biết nên đăng bao nhiêu)`,
      '',
      `📌 Luật: tối đa **${market.MAX_LISTINGS_PER_USER}** tin/người • thuế **${Math.round(market.TAX_PCT * 100)}%** (vàng thuế bị huỷ) • tin hết hạn sau **7 ngày** và item được trả lại.`,
      '🔒 Không đăng bán được: item **soulbound** và phần đang **trang bị**.',
    ].join('\n'));
}

module.exports = {
  name: 'market',
  aliases: ['cho', 'ah', 'marketplace'],
  description: 'Chợ người chơi: !market, sell, buy, mine, cancel, search, recent',
  async execute(msg, args) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix()}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ===== help =====
    if (sub === 'help' || sub === 'huongdan') {
      return msg.reply({ embeds: [helpEmbed()] });
    }

    // ===== sell <item_id> <price> [qty] =====
    if (sub === 'sell' || sub === 'ban' || sub === 'list') {
      const itemId = args[1];
      const price = parseInt(args[2]);
      const qty = Math.max(1, parseInt(args[3]) || 1);
      if (!itemId || isNaN(price)) {
        return msg.reply(`❌ Cú pháp: \`${prefix()}market sell <item_id> <giá> [qty]\` (giá cho 1 món)\n` +
          `💡 Xem id trong \`${prefix()}inv\`.`);
      }

      const res = market.createListing(msg.author.id, itemId, price, qty);
      if (!res.ok) {
        const it = res.item;
        switch (res.error) {
          case 'no_item': return msg.reply(`❌ Item \`${itemId}\` không tồn tại.`);
          case 'soulbound': return msg.reply(`🔒 **${it.name}** là soulbound — không bán được (cũng không trade được).`);
          case 'price_low': return msg.reply(`❌ Giá phải ≥ ${market.MIN_PRICE} vàng/món.`);
          case 'price_high': return msg.reply(`❌ Giá tối đa ${market.MAX_PRICE.toLocaleString('en-US')} vàng/món.`);
          case 'qty': return msg.reply('❌ Số lượng phải ≥ 1.');
          case 'too_many': return msg.reply(`❌ Bạn đang có ${market.MAX_LISTINGS_PER_USER} tin — huỷ bớt bằng \`${prefix()}market mine\`.`);
          case 'not_enough': {
            const bits = [`❌ Không đủ **${it.name}** để bán: bạn có ${res.owned}`];
            if (res.equipped > 0) bits.push(`(${res.equipped} đang trang bị, chỉ bán được ${res.free})`);
            bits.push(`\n💡 Tháo ra trước: \`${prefix()}unequip\`.`);
            return msg.reply(bits.join(' '));
          }
          default: return msg.reply('❌ Không đăng bán được.');
        }
      }

      const l = res.listing;
      return msg.reply(`✅ Đã đăng bán **${l.name}** ×${l.qty} — **${l.price}** 💰/món (tổng **${l.price * l.qty}**).\n` +
        `Mã tin: \`#${l.id}\` • thuế ${Math.round(market.TAX_PCT * 100)}% khi bán được → bạn nhận **${Math.floor(l.price * l.qty * (1 - market.TAX_PCT))}**.\n` +
        `🔒 Item đã được giữ ở chợ (không dùng được cho tới khi huỷ/hết hạn).`);
    }

    // ===== buy <#id> [qty] =====
    if (sub === 'buy' || sub === 'mua') {
      const raw = (args[1] || '').replace('#', '');
      const id = parseInt(raw);
      const qty = Math.max(1, parseInt(args[2]) || 1);
      if (!raw || isNaN(id)) return msg.reply(`❌ Cú pháp: \`${prefix()}market buy <#id> [qty]\``);

      const res = market.buy(msg.author.id, id, qty);
      if (!res.ok) {
        switch (res.error) {
          case 'no_listing': return msg.reply(`❌ Tin \`#${id}\` không tồn tại (có thể đã bán hoặc hết hạn). Gõ \`${prefix()}market\`.`);
          case 'own_listing': return msg.reply('❌ Đây là tin của chính bạn.');
          case 'qty': return msg.reply('❌ Số lượng phải ≥ 1.');
          case 'qty_exceeds': return msg.reply(`❌ Tin này chỉ còn **${res.listing.qty}** món.`);
          case 'no_gold': return msg.reply(`💸 Không đủ vàng: cần **${res.total}**, bạn có **${res.gold}**.`);
          default: return msg.reply('❌ Không mua được.');
        }
      }

      const left = res.remaining > 0 ? `\nTin còn **${res.remaining}** món.` : '\nTin đã bán hết.';
      // Báo cho người bán (best-effort: nhiều người tắt DM)
      try {
        if (msg.client?.users?.fetch) {
          const u = await msg.client.users.fetch(res.listing.seller_id).catch(() => null);
          if (u) {
            await u.send(`💰 **${res.listing.name}** ×${res.qty} của bạn đã bán với giá ${res.total} vàng — bạn nhận **${res.payout}** (thuế ${res.tax}).`).catch(() => {});
          }
        }
      } catch { /* DM đóng thì thôi, không chặn giao dịch */ }

      return msg.reply(`✅ Đã mua **${res.listing.name}** ×${res.qty} — trả **${res.total}** 💰.${left}\n` +
        `Người bán nhận ${res.payout} (thuế ${res.tax} bị huỷ).`);
    }

    // ===== mine — tin của mình =====
    if (sub === 'mine' || sub === 'cuatoi' || sub === 'mylist') {
      market.cleanupExpired();
      const rows = market.listingsBySeller(msg.author.id);
      if (rows.length === 0) {
        return msg.reply(`💡 Bạn chưa đăng bán gì. \`${prefix()}market sell <item_id> <giá> [qty]\``);
      }
      const lines = rows.map(l => {
        const t = tierInfo(l.tier || 'common');
        return `\`#${l.id}\` ${t.emoji} **${l.name}** ×${l.qty} — **${l.price}** 💰/món • ${ago(l.created_at)} trước`;
      });
      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(`📦 Tin đang bán của ${p.name} (${rows.length}/${market.MAX_LISTINGS_PER_USER})`)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: `Huỷ: ${prefix()}market cancel <#id> • item được trả lại túi` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== cancel <#id> =====
    if (sub === 'cancel' || sub === 'huy' || sub === 'unlist') {
      const id = parseInt((args[1] || '').replace('#', ''));
      if (isNaN(id)) return msg.reply(`❌ Cú pháp: \`${prefix()}market cancel <#id>\``);
      const res = market.cancel(msg.author.id, id);
      if (!res.ok) {
        if (res.error === 'not_owner') return msg.reply('❌ Đây không phải tin của bạn.');
        return msg.reply(`❌ Tin \`#${id}\` không tồn tại.`);
      }
      return msg.reply(`✅ Đã huỷ tin \`#${id}\` — nhận lại **${res.listing.qty}× ${res.listing.name}**.`);
    }

    // ===== search <từ khoá> =====
    if (sub === 'search' || sub === 'find' || sub === 'tim') {
      const term = args.slice(1).join(' ').trim();
      if (!term) return msg.reply(`❌ Cú pháp: \`${prefix()}market search <từ khoá>\``);
      market.cleanupExpired();
      const rows = market.search(term);
      if (rows.length === 0) return msg.reply(`💡 Không có tin nào khớp **${term}**.`);
      const lines = rows.slice(0, 10).map(l => formatLine(l));
      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(`🔍 "${term}" — ${rows.length} tin`)
        .setDescription(lines.join('\n\n').slice(0, 4000));
      return msg.reply({ embeds: [embed] });
    }

    // ===== recent [item_id] — lịch sử giá =====
    if (sub === 'recent' || sub === 'history' || sub === 'gia') {
      const itemId = args[1] || null;
      const rows = market.recentSales(itemId, 10);
      if (rows.length === 0) {
        return msg.reply(itemId
          ? `💡 Chưa có ai bán \`${itemId}\` trên chợ.`
          : '💡 Chợ chưa có giao dịch nào.');
      }
      const lines = rows.map(r => {
        const t = tierInfo(db.prepare('SELECT tier FROM items WHERE id=?').get(r.item_id)?.tier || 'common');
        return `${t.emoji} **${r.name}** ×${r.qty} — **${r.price}** 💰/món • ${ago(r.sold_at)} trước`;
      });
      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(itemId ? `📈 Giá gần đây: ${itemId}` : '📈 Giao dịch gần đây')
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Giá hiển thị là giá/món, đã bao gồm cả tin mua một phần' });
      return msg.reply({ embeds: [embed] });
    }

    // ===== mặc định: xem chợ (tham số = filter loại hàng) =====
    return renderMarketPage({
      userId: msg.author.id,
      filter: sub || 'all',
      page: 0,
      replyFn: (opts) => msg.reply(opts),
    });
  },
};

// Export cho button handler (phân trang)
module.exports.renderMarketPage = renderMarketPage;
