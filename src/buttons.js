// Button interaction handler
const { EmbedBuilder } = require('discord.js');
const pvp = require('./game/pvp');
const trade = require('./game/trade');
const { getPlayer, updatePlayer } = require('./game/player');
const duelCmd = require('./commands/duel');
const tradeCmd = require('./commands/trade');

async function handle(interaction) {
  const customId = interaction.customId;
  const parts = customId.split(':');
  const [domain, action, ...rest] = parts;

  // ============================================================
  // DUEL BUTTONS
  // ============================================================
  if (domain === 'duel') {
    const duelId = parseInt(rest[0]);
    const expectedDefender = rest[1];
    const duel = pvp.getDuelById(duelId);
    if (!duel) {
      return interaction.reply({ content: '❌ Duel không tồn tại hoặc đã hết hạn.', ephemeral: true });
    }
    if (duel.status !== 'pending') {
      return interaction.reply({ content: '❌ Duel này đã kết thúc.', ephemeral: true });
    }

    // Check user phải đúng là defender
    if (interaction.user.id !== expectedDefender) {
      return interaction.reply({ content: '❌ Chỉ người được thách đấu mới phản hồi được.', ephemeral: true });
    }

    // Check expired
    if (Date.now() - duel.created_at > pvp.DUEL_EXPIRE_MS) {
      pvp.setDuelStatus(duelId, 'expired');
      return interaction.reply({ content: '⏱️ Duel đã hết hạn.', ephemeral: true });
    }

    if (action === 'decline') {
      pvp.setDuelStatus(duelId, 'declined');
      await interaction.update({ content: `❌ <@${interaction.user.id}> đã từ chối lời thách đấu.`, embeds: [], components: [] });
      return;
    }

    if (action === 'accept') {
      // Execute duel ngay
      const challenger = getPlayer(duel.challenger);
      const defender = getPlayer(duel.defender);
      if (!challenger || !defender) {
        pvp.setDuelStatus(duelId, 'declined');
        return interaction.update({ content: '❌ Một bên không có nhân vật.', embeds: [], components: [] });
      }

      // Re-check gold
      if (duel.gold_stake > 0) {
        if (challenger.gold < duel.gold_stake) {
          pvp.setDuelStatus(duelId, 'declined');
          return interaction.update({ content: `❌ ${challenger.name} không còn đủ vàng cược.`, embeds: [], components: [] });
        }
        if (defender.gold < duel.gold_stake) {
          pvp.setDuelStatus(duelId, 'declined');
          return interaction.update({ content: `❌ ${defender.name} không còn đủ vàng cược.`, embeds: [], components: [] });
        }
      }

      const s1 = duelCmd.getFullStats(duel.challenger);
      const s2 = duelCmd.getFullStats(duel.defender);
      const result = pvp.simulateDuel(challenger, defender, s1, s2);
      const winnerId = result.winnerId;
      const loserId = winnerId === duel.challenger ? duel.defender : duel.challenger;
      const winnerPlayer = winnerId === duel.challenger ? challenger : defender;
      const loserPlayer = winnerId === duel.challenger ? defender : challenger;

      if (duel.gold_stake > 0) {
        updatePlayer(winnerId, { gold: winnerPlayer.gold + duel.gold_stake });
        updatePlayer(loserId, { gold: Math.max(0, loserPlayer.gold - duel.gold_stake) });
      }
      const ratingResult = pvp.updateRating(winnerId, loserId);
      pvp.setDuelStatus(duelId, 'done', winnerId);

      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`⚔️ Duel: ${challenger.name} VS ${defender.name}`)
        .setDescription(result.log.slice(-8).join('\n'))
        .addFields(
          { name: '🏆 Winner', value: `<@${winnerId}> **${winnerPlayer.name}**`, inline: true },
          { name: '💰 Cược', value: duel.gold_stake > 0 ? `${duel.gold_stake} 💰` : 'Không', inline: true },
          { name: '📈 Rating', value: `${winnerPlayer.name}: **+${ratingResult.change}** (${ratingResult.winnerNewRating})\n${loserPlayer.name}: ${ratingResult.loserNewRating}`, inline: false },
        );

      await interaction.update({ embeds: [embed], components: [] });
      return;
    }
  }

  // ============================================================
  // TRADE BUTTONS
  // ============================================================
  if (domain === 'trade') {
    const tradeId = parseInt(rest[0]);
    const t = trade.getTradeById(tradeId);
    if (!t) {
      return interaction.reply({ content: '❌ Trade không tồn tại.', ephemeral: true });
    }
    if (t.status !== 'open') {
      return interaction.reply({ content: '❌ Trade này đã đóng.', ephemeral: true });
    }

    const side = trade.getSide(t, interaction.user.id);
    if (!side) {
      return interaction.reply({ content: '❌ Bạn không phải là thành viên của trade này.', ephemeral: true });
    }

    if (action === 'cancel') {
      trade.setStatus(tradeId, 'cancelled');
      await interaction.update({ content: `❌ <@${interaction.user.id}> đã huỷ trade.`, embeds: [], components: [] });
      return;
    }

    if (action === 'unready') {
      trade.setReady(tradeId, side, false);
      const t2 = trade.getTradeById(tradeId);
      await interaction.update({
        embeds: [tradeCmd.buildTradeEmbed(t2)],
        components: [tradeCmd.buildTradeButtons(tradeId)],
      });
      return;
    }

    if (action === 'ready') {
      trade.setReady(tradeId, side, true);
      const t2 = trade.getTradeById(tradeId);

      // Cả 2 ready → execute
      if (t2.ready_a && t2.ready_b) {
        const res = trade.executeTrade(t2);
        if (!res.ok) {
          // Reset ready của side này (vì lý do thường là không đủ res sau khi side khác đã ready)
          trade.setReady(tradeId, side, false);
          const t3 = trade.getTradeById(tradeId);
          return interaction.update({
            embeds: [
              tradeCmd.buildTradeEmbed(t3),
              new EmbedBuilder().setColor(0xED4245).setTitle('❌ Trade failed').setDescription(res.error),
            ],
            components: [tradeCmd.buildTradeButtons(tradeId)],
          });
        }
        const pA = getPlayer(t2.user_a);
        const pB = getPlayer(t2.user_b);
        const oA = trade.parseOffer(t2.offer_a);
        const oB = trade.parseOffer(t2.offer_b);
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(0x57F287)
            .setTitle('✅ Trade Completed!')
            .addFields(
              { name: `${pA?.name} đã nhận`, value: tradeCmd.formatOffer(oB), inline: true },
              { name: `${pB?.name} đã nhận`, value: tradeCmd.formatOffer(oA), inline: true },
            )],
          components: [],
        });
        return;
      }

      // Chưa cả 2 ready → update embed
      await interaction.update({
        embeds: [tradeCmd.buildTradeEmbed(t2)],
        components: [tradeCmd.buildTradeButtons(tradeId)],
      });
      return;
    }
  }

  // Unknown
  return interaction.reply({ content: '❌ Action không xác định.', ephemeral: true });
}

module.exports = { handle }; 
