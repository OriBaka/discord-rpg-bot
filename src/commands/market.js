// CHỢ NGƯỜI CHƠI — xem / đăng bán / mua / huỷ / tìm / lịch sử giá
//
// Vì sao có lệnh này: `%sell` bán cho NPC với giá cố định (≈40% giá shop), nên
// nguyên liệu hiếm KHÔNG có giá thị trường — người có 20 mithril ore và người
// cần 2 cái để chế đồ không gặp nhau được. Xem src/game/market.js để biết luật
// (escrow, thuế, hạn tin, giới hạn tin/người).
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

function prefix() { return require('../game/prefix').getPrefix(); }

function formatLine(l) {
  const t = tierInfo(l.tier || 'common');
  const total = l.price * l.qty;
  // Không còn dòng "gõ %market buy #id" — đã có nút 🛒 ngay dưới; chừa chỗ cho
  // nhiều tin hơn mỗi trang.
  return `${t.emoji} **${l.name}** ×${l.qty} — **${l.price}** 💰/món (tổng ${total})\n` +
    `   \`#${l.id}\` • ${sellerName(l.seller_id)} • ${ago(l.created_at)} trước`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GỢI Ý GIÁ
//
// Trước đây `%market sell <id> <giá>` bắt người chơi tự đoán giá trong khi họ
// không có thông tin gì (giá NPC không nói lên giá thị trường). Gợi ý lấy từ
// giao dịch THẬT nếu có, không thì suy ra từ giá NPC và ghi rõ là suy đoán.
// ─────────────────────────────────────────────────────────────────────────────
function priceHint(itemId) {
  const it = db.prepare('SELECT id, name, type, tier, sell, price, soulbound FROM items WHERE id = ?').get(itemId);
  if (!it) return null;
  const npc = it.sell || Math.floor((it.price || 0) / 3) || 0;
  const recent = market.recentSales(itemId, 5);
  if (recent.length > 0) {
    const prices = recent.map(r => r.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    return {
      item: it, npc, source: 'market', suggested: median,
      min: prices[0], max: prices[prices.length - 1], sales: recent.length, recent,
    };
  }
  const suggested = Math.min(Math.max(npc * 2, market.MIN_PRICE), market.MAX_PRICE);
  return { item: it, npc, source: 'npc', suggested, sales: 0, recent: [] };
}

// Vài món bán được: không soulbound, còn phần không bị trang bị.
function sellableRows(userId) {
  const { getEquippedCount } = require('../game/slots');
  const rows = db.prepare('SELECT item_id, qty FROM inventory WHERE user_id = ?').all(userId);
  const out = [];
  for (const row of rows) {
    const it = db.prepare('SELECT id, name, type, tier, sell, price, soulbound FROM items WHERE id = ?').get(row.item_id);
    if (!it || it.soulbound) continue;
    const equipped = getEquippedCount(userId, it.id);
    const free = row.qty - equipped;
    if (free <= 0) continue;
    const hint = priceHint(it.id);
    out.push({ ...it, qty: row.qty, free, hint });
  }
  // Món đáng tiền nhất lên trước — ai vào đây cũng để bán đồ giá trị
  out.sort((a, b) => (b.hint.suggested * b.free) - (a.hint.suggested * a.free) || a.name.localeCompare(b.name));
  return out;
}

function sellableFilters(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.type, (counts.get(r.type) || 0) + 1);
  const cats = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => ({ key, label: categoryLabel(key).slice(0, 20), emoji: display.typeLabel(key).split(' ')[0] }));
  return [{ key: 'all', label: 'Tất cả', emoji: '🎒' }, ...cats];
}

const SELLABLE_PER_PAGE = 6;

function renderSellablePage({ userId, filter, page, replyFn, notice }) {
  const rows = sellableRows(userId);
  const filterOptions = sellableFilters(rows);
  const active = (filter === 'all' || filterOptions.some(f => f.key === filter)) ? filter : 'all';
  const filtered = active === 'all' ? rows : rows.filter(r => r.type === active);

  const { embed, components } = paginator.build({
    domain: 'mksell',
    userId,
    items: filtered,
    filter: active,
    filterOptions,
    page,
    perPage: SELLABLE_PER_PAGE,
    title: `🏷️ Chọn món để bán lên chợ — ${active === 'all' ? 'Tất cả' : categoryLabel(active)}`,
    color: 0x9B59B6,
    formatItem: (r) => {
      const t = tierInfo(r.tier || 'common');
      const badge = r.hint.source === 'market' ? `📈 ${r.hint.suggested}` : `~${r.hint.suggested}`;
      return `${t.emoji} **${r.name}** ×${r.qty} (bán được ${r.free}) — **${badge}** 💰/món
` +
        `   \`${prefix()}market sell ${r.id} ${r.hint.suggested}\` (theo gợi ý)`;
    },
    footer: `📈 = giá chợ gần đây • ~ = ước tính từ giá NPC • thuế ${Math.round(market.TAX_PCT * 100)}%`,
  });

  if (notice) {
    const base = filtered.length === 0 ? '' : (embed.data.description || '');
    embed.setDescription(`${notice}${base ? '\n\n' + base : ''}`.slice(0, 4000) || notice);
  }

  if (filtered.length === 0) {
    embed.setDescription(rows.length === 0
      ? `*Không có món nào bán được.*
🔒 Món **soulbound** và phần đang **trang bị** không đăng bán được.
💡 Kiếm thêm: \`${prefix()}hunt\`, \`${prefix()}mine\`.`
      : `*Không có món **${categoryLabel(active)}** nào bán được.*`);
  }
  return replyFn({ embeds: [embed], components });
}

function priceHintEmbed(userId, itemId) {
  const p = prefix();
  const hint = priceHint(itemId);
  if (!hint) return null;
  const it = hint.item;
  const t = tierInfo(it.tier || 'common');
  const ownedRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, it.id);
  const owned = ownedRow?.qty || 0;
  const equipped = require('../game/slots').getEquippedCount(userId, it.id);
  const free = Math.max(0, owned - equipped);

  const lines = [`${t.emoji} **${it.name}** \`${it.id}\``];
  if (hint.source === 'market') {
    const range = hint.min === hint.max ? `${hint.min}` : `${hint.min}–${hint.max}`;
    lines.push(`📈 Giá chợ gần đây: **${range}** 💰/món (${hint.sales} giao dịch) → gợi ý **${hint.suggested}**`);
  } else {
    lines.push(`~ Chưa ai bán món này trên chợ. Giá NPC ${hint.npc} 💰 → gợi ý **${hint.suggested}** 💰/món (2× giá NPC)`);
  }
  lines.push(`🏷️ Giá hợp lệ: ${market.MIN_PRICE}–${market.MAX_PRICE.toLocaleString('en-US')} 💰/món`);
  lines.push(`🎒 Bạn có **${owned}**${equipped > 0 ? ` (đang mặc ${equipped})` : ''} → bán được **${free}**`);
  lines.push('');
  if (it.soulbound) {
    lines.push('🔒 Món này **soulbound** — không đăng bán được.');
  } else if (owned === 0) {
    lines.push(`👉 Bạn không có món này trong túi — \`${p}market sell\` để xem món bán được.`);
  } else if (free <= 0) {
    lines.push(`👉 Không còn món nào rảnh để bán (đang mặc hết). Tháo ra: \`${p}unequip\``);
  } else {
    lines.push(`👉 Đăng bán: \`${p}market sell ${it.id} ${hint.suggested}\` (bán cả ${free}: \`${p}market sell ${it.id} ${hint.suggested} ${free}\`)`);
  }
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('💰 Gợi ý giá bán').setDescription(lines.join('\n'));
}

// Số tin mỗi trang = số nút mua tối đa (Discord: 5 nút/row) → mọi tin hiện ra
// đều bấm mua được, không có tin "nhìn thấy mà phải gõ tay".
const MARKET_PER_PAGE = 5;

function buildBuyRow(slice, userId, filter, page) {
  if (slice.length === 0) return null;
  const row = new ActionRowBuilder();
  for (const l of slice.slice(0, 5)) {
    const own = l.seller_id === userId;
    const btn = new ButtonBuilder()
      .setCustomId(`mkbuy:${l.id}:${userId}:${filter}:${page}`)
      .setLabel(own ? `#${l.id} của bạn` : `#${l.id} · ${l.price}💰`)
      .setEmoji('🛒')
      .setStyle(own ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(own);
    row.addComponents(btn);
  }
  return row;
}

function renderMarketPage({ userId, filter, page, replyFn }) {
  market.cleanupExpired();
  const all = market.allListings();
  const cats = categoriesOf(all);
  const filterOptions = [{ key: 'all', label: 'Tất cả', emoji: '🏪' }, ...cats];
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
    perPage: MARKET_PER_PAGE,
    title: `🏪 Chợ người chơi — ${active === 'all' ? 'Tất cả' : categoryLabel(active)}`,
    color: 0x9B59B6,
    formatItem: (l) => formatLine(l),
    footer: `🛒 bấm nút để mua 1 món • ${prefix()}market sell để xem món bán được + giá gợi ý • thuế ${Math.round(market.TAX_PCT * 100)}%`,
  });

  // Chèn row nút mua giữa row filter và row điều hướng
  const maxPage = Math.max(0, Math.ceil(filtered.length / MARKET_PER_PAGE) - 1);
  const shownPage = Math.max(0, Math.min(page, maxPage));
  const slice = filtered.slice(shownPage * MARKET_PER_PAGE, shownPage * MARKET_PER_PAGE + MARKET_PER_PAGE);
  const buyRow = buildBuyRow(slice, userId, active, shownPage);
  if (buyRow) {
    const hasNav = maxPage > 0;
    components.splice(hasNav ? components.length - 1 : components.length, 0, buyRow);
  }
  if (filtered.length === 0) {
    embed.setDescription(`*Chợ đang trống.*\nXem món bạn bán được + giá gợi ý: \`${prefix()}market sell\`\n` +
      `💡 Nguyên liệu hiếm, đồ ăn, vũ khí/giáp **không soulbound** đều bán được.`);
  }
  return replyFn({ embeds: [embed], components });
}

function helpEmbed() {
  const p = prefix();
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('🏪 Chợ người chơi')
    .setDescription([
      `\`${p}market\` — xem chợ (lọc theo loại bằng nút hoặc \`${p}market material\`), bấm nút 🛒 để mua`,
      `\`${p}market sell\` — xem món **bán được** kèm **giá gợi ý** (món soulbound / đang mặc bị ẩn)`,
      `\`${p}market sell <item_id>\` — gợi ý giá cho 1 món (dựa trên giá chợ gần đây, không có thì 2× giá NPC)`,
      `\`${p}market sell <item_id> <giá> [qty]\` — đăng bán (giá tính cho 1 món)`,
      `\`${p}market buy <#id> [qty]\` — mua bằng lệnh (nút 🛒 chỉ mua 1 món)`,
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

      // Không nêu món → liệt kê món BÁN ĐƯỢC kèm giá gợi ý (thay vì bắt nhớ id)
      if (!itemId) {
        return renderSellablePage({
          userId: msg.author.id, filter: args[2] || 'all', page: 0,
          replyFn: (opts) => msg.reply(opts),
        });
      }

      // Có món nhưng chưa có giá → gợi ý giá (dựa trên giao dịch thật / giá NPC)
      if (isNaN(price)) {
        const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId);
        if (!exists) {
          // Gõ sai id (hoặc gõ tên loại hàng) → đưa danh sách món bán được thay
          // vì báo lỗi cụt. Filter theo loại vẫn dùng được qua nút.
          return renderSellablePage({
            userId: msg.author.id, filter: itemId, page: 0,
            notice: `⚠️ Không có item \`${itemId}\` — đây là món bạn bán được (lọc theo loại bằng nút).`,
            replyFn: (opts) => msg.reply(opts),
          });
        }
        return msg.reply({ embeds: [priceHintEmbed(msg.author.id, itemId)] });
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

// Export cho button handler (phân trang + nút mua) và test
module.exports.renderMarketPage = renderMarketPage;
module.exports.renderSellablePage = renderSellablePage;
module.exports.priceHint = priceHint;
module.exports.priceHintEmbed = priceHintEmbed;
module.exports.MARKET_PER_PAGE = MARKET_PER_PAGE;
