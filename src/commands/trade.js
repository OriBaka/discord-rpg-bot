const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer } = require('../game/player');
const { getItem } = require('../game/items');
const trade = require('../game/trade');

function resolveTarget(msg, arg) {
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  if (!arg) return null;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || null;
}

function formatOffer(offer) {
  const parts = [];
  if (offer.gold > 0) parts.push(`💰 ${offer.gold} vàng`);
  for (const [itemId, qty] of Object.entries(offer.items)) {
    const it = getItem(itemId);
    parts.push(`📦 ${qty}× ${it?.name || itemId}`);
  }
  return parts.length > 0 ? parts.join('\n') : '*Trống*';
}

function buildTradeEmbed(t) {
  const pA = getPlayer(t.user_a);
  const pB = getPlayer(t.user_b);
  const offerA = trade.parseOffer(t.offer_a);
  const offerB = trade.parseOffer(t.offer_b);
  const readyA = t.ready_a ? '✅' : '⬜';
  const readyB = t.ready_b ? '✅' : '⬜';

  return new EmbedBuilder().setColor(0xFEE75C)
    .setTitle(`🤝 Trade: ${pA?.name || t.user_a} ⇄ ${pB?.name || t.user_b}`)
    .addFields(
      { name: `${readyA} ${pA?.name || 'User A'} đưa`, value: formatOffer(offerA), inline: true },
      { name: `${readyB} ${pB?.name || 'User B'} đưa`, value: formatOffer(offerB), inline: true },
    )
    .setFooter({ text: `Cả 2 ready → tự động execute. Đổi offer → reset ready.` });
}

function buildTradeButtons(tradeId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trade:ready:${tradeId}`).setLabel('✅ Ready').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`trade:unready:${tradeId}`).setLabel('⬜ Unready').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`trade:cancel:${tradeId}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
  );
}

async function showTradeStatus(msg, t, prefix) {
  return msg.reply({ embeds: [buildTradeEmbed(t)], components: [buildTradeButtons(t.id)] });
}

module.exports = {
  name: 'trade',
  aliases: ['tr', 'doi'],
  description: 'Trade item/gold giữa 2 player',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ====== help ======
    if (!sub || sub === 'help') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle('🤝 Trade Commands')
        .setDescription([
          `\`${prefix}trade @user\` — mở phiên trade mới`,
          `\`${prefix}trade view\` — xem trade hiện tại`,
          `\`${prefix}trade add gold <số>\` — thêm vàng vào offer`,
          `\`${prefix}trade add item <id> [qty]\` — thêm item vào offer`,
          `\`${prefix}trade remove gold\` — bỏ vàng ra`,
          `\`${prefix}trade remove item <id>\` — bỏ item ra`,
          `\`${prefix}trade ready\` — đánh dấu sẵn sàng (cả 2 → execute)`,
          `\`${prefix}trade unready\` — bỏ đánh dấu sẵn sàng`,
          `\`${prefix}trade cancel\` — huỷ trade`,
          '',
          '⚠️ Đổi offer sẽ reset ready của CẢ 2 bên (chống scam).',
          '⏳ Trade expire sau 5 phút không tương tác.',
        ].join('\n'))] });
    }

    // ====== cancel ======
    if (sub === 'cancel') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply('💡 Bạn không có trade nào đang mở.');
      trade.setStatus(t.id, 'cancelled');
      return msg.reply(`✅ Đã huỷ trade với <@${t.user_a === msg.author.id ? t.user_b : t.user_a}>.`);
    }

    // ====== view ======
    if (sub === 'view' || sub === 'status' || sub === 'show') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply('💡 Bạn không có trade nào đang mở.');
      return showTradeStatus(msg, t, prefix);
    }

    // ====== ready / unready ======
    if (sub === 'ready') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply('💡 Bạn không có trade nào đang mở.');
      const side = trade.getSide(t, msg.author.id);
      trade.setReady(t.id, side, true);

      // Reload + check cả 2 ready chưa
      const t2 = trade.getTradeById(t.id);
      if (t2.ready_a && t2.ready_b) {
        const res = trade.executeTrade(t2);
        if (!res.ok) return msg.reply(`❌ Trade failed: ${res.error}`);
        const pA = getPlayer(t2.user_a);
        const pB = getPlayer(t2.user_b);
        const oA = trade.parseOffer(t2.offer_a);
        const oB = trade.parseOffer(t2.offer_b);
        return msg.reply({ embeds: [new EmbedBuilder().setColor(0x57F287)
          .setTitle('✅ Trade Completed!')
          .addFields(
            { name: `${pA?.name} đã nhận`, value: formatOffer(oB), inline: true },
            { name: `${pB?.name} đã nhận`, value: formatOffer(oA), inline: true },
          )] });
      }
      return msg.reply(`✅ Bạn đã ready. Đợi đối tác ready.\n👉 Dùng \`${prefix}trade view\` để xem trạng thái.`);
    }

    if (sub === 'unready') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply('💡 Bạn không có trade nào đang mở.');
      const side = trade.getSide(t, msg.author.id);
      trade.setReady(t.id, side, false);
      return msg.reply('✅ Đã bỏ ready.');
    }

    // ====== add ======
    if (sub === 'add') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply(`💡 Bạn chưa có trade nào. Dùng \`${prefix}trade @user\` để mở.`);
      const what = (args[1] || '').toLowerCase();
      const side = trade.getSide(t, msg.author.id);
      const offer = trade.getOffer(t, side);

      if (what === 'gold') {
        const amount = parseInt(args[2]);
        if (isNaN(amount) || amount < 0) return msg.reply('❌ Số vàng không hợp lệ.');
        if (amount > p.gold) return msg.reply(`❌ Bạn chỉ có ${p.gold} vàng.`);
        offer.gold = amount; // SET (không cộng dồn) để dễ điều chỉnh
        trade.updateOffer(t.id, side, offer);
        return msg.reply(`✅ Đã set vàng offer = **${amount}**. (Ready của cả 2 bên đã reset)`);
      }

      if (what === 'item') {
        const itemId = args[2];
        const qty = Math.max(1, parseInt(args[3]) || 1);
        if (!itemId) return msg.reply(`❌ Cú pháp: \`${prefix}trade add item <id> [qty]\``);
        const itemObj = getItem(itemId);
        if (!itemObj) return msg.reply(`❌ Item \`${itemId}\` không tồn tại.`);

        // Chặn soulbound
        if (itemObj.soulbound) {
          return msg.reply(`🔒 **${itemObj.name}** là item soulbound — không thể trade.`);
        }

        // Calculate total qty đã offer + thêm
        const currentQty = offer.items[itemId] || 0;
        const newQty = currentQty + qty;
        const haveRow = require('../db/database').prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(msg.author.id, itemId);
        const have = haveRow?.qty || 0;
        if (newQty > have) return msg.reply(`❌ Bạn chỉ có ${have}× ${itemObj.name}, đã offer ${currentQty}.`);

        offer.items[itemId] = newQty;
        trade.updateOffer(t.id, side, offer);
        return msg.reply(`✅ Đã thêm **${qty}× ${itemObj.name}** (tổng ${newQty}). Ready reset.`);
      }

      return msg.reply(`❌ \`${prefix}trade add gold <số>\` hoặc \`${prefix}trade add item <id> [qty]\``);
    }

    // ====== remove ======
    if (sub === 'remove' || sub === 'rm') {
      const t = trade.getActiveTrade(msg.author.id);
      if (!t) return msg.reply('💡 Không có trade nào.');
      const what = (args[1] || '').toLowerCase();
      const side = trade.getSide(t, msg.author.id);
      const offer = trade.getOffer(t, side);

      if (what === 'gold') {
        offer.gold = 0;
        trade.updateOffer(t.id, side, offer);
        return msg.reply('✅ Đã bỏ vàng khỏi offer.');
      }
      if (what === 'item') {
        const itemId = args[2];
        if (!itemId) return msg.reply(`❌ Cú pháp: \`${prefix}trade remove item <id>\``);
        if (!offer.items[itemId]) return msg.reply('❌ Item không có trong offer.');
        delete offer.items[itemId];
        trade.updateOffer(t.id, side, offer);
        return msg.reply(`✅ Đã bỏ \`${itemId}\` khỏi offer.`);
      }
      if (what === 'all') {
        offer.gold = 0;
        offer.items = {};
        trade.updateOffer(t.id, side, offer);
        return msg.reply('✅ Đã clear toàn bộ offer.');
      }
      return msg.reply(`❌ \`${prefix}trade remove gold | item <id> | all\``);
    }

    // ====== Default: mở trade mới với @user ======
    const target = resolveTarget(msg, args[0]);
    if (!target) {
      return msg.reply(`❌ Cú pháp: \`${prefix}trade @user\` hoặc \`${prefix}trade help\``);
    }
    if (target.id === msg.author.id) return msg.reply('❌ Không thể trade với chính mình.');
    if (target.bot) return msg.reply('❌ Không thể trade với bot.');

    const targetPlayer = getPlayer(target.id);
    if (!targetPlayer) return msg.reply(`❌ **${target.username}** chưa có nhân vật.`);

    // Check existing trade
    const existing = trade.getActiveTrade(msg.author.id);
    if (existing) return msg.reply(`❌ Bạn đang có trade với <@${existing.user_a === msg.author.id ? existing.user_b : existing.user_a}>. Cancel trước.`);
    const existingTarget = trade.getActiveTrade(target.id);
    if (existingTarget) return msg.reply(`❌ **${target.username}** đang trong trade khác.`);

    const t = trade.createTrade(msg.author.id, target.id);
    const embed = new EmbedBuilder().setColor(0xFEE75C)
      .setTitle(`🤝 Trade với ${target.username}`)
      .setDescription(
        `Phiên trade đã mở. Cả 2 bên thêm offer:\n` +
        `\`${prefix}trade add gold 1000\`\n` +
        `\`${prefix}trade add item dragon_scale 3\`\n\n` +
        `Sau đó bấm nút Ready bên dưới (hoặc \`${prefix}trade ready\`).`
      );
    return msg.reply({ embeds: [embed], components: [buildTradeButtons(t.id)] });
  },
};

module.exports.buildTradeEmbed = buildTradeEmbed;
module.exports.buildTradeButtons = buildTradeButtons;
module.exports.formatOffer = formatOffer;
