const { EmbedBuilder } = require('discord.js');
const pvp = require('./game/pvp');
const trade = require('./game/trade');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('./game/player');
const duelCmd = require('./commands/duel');
const tradeCmd = require('./commands/trade');
const shopCmd = require('./commands/shop');
const { getItem } = require('./game/items');
const { canEquipItem } = require('./game/classes');
const { getEquipped, setEquipped, findSlotForItem, isItemValidForSlot } = require('./game/slots');

async function handle(interaction) {
  const customId = interaction.customId;
  const parts = customId.split(':');
  const [domain, action, ...rest] = parts;

  if (domain === 'shop') {
    const page = parseInt(rest[0]);
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ content: '❌ Bạn chưa có nhân vật.', ephemeral: true });
    const result = shopCmd.renderShopPage(p, page);
    if (!result) return interaction.reply({ content: '🏪 Shop hiện tại không có gì để bán.', ephemeral: true });
    return interaction.update({ embeds: [result.embed], components: [result.buttons] });
  }

  if (domain === 'item') {
    const itemId = rest[0];
    const p = getPlayer(interaction.user.id);
    if (!p) return interaction.reply({ content: '❌ Bạn chưa có nhân vật.', ephemeral: true });
    const it = getItem(itemId);
    if (!it) return interaction.reply({ content: '❌ Item không tồn tại.', ephemeral: true });

    if (action === 'use') {
      if (!hasItem(interaction.user.id, itemId, 1)) return interaction.reply({ content: '❌ Bạn không có vật phẩm này.', ephemeral: true });
      if (!['consumable', 'lootbox'].includes(it.type)) return interaction.reply({ content: '❌ Item không dùng được.', ephemeral: true });
      if (it.type === 'lootbox') {
        const lootbox = require('./game/lootbox');
        const { rewards } = lootbox.openLootbox(itemId, 1);
        removeItem(interaction.user.id, itemId, 1);
        const summary = lootbox.applyRewards(interaction.user.id, rewards, { client: interaction.client, guildId: interaction.guild?.id });
        return interaction.reply({ content: `🎁 Mở **${it.name}**: \n${summary.join('\n') || 'Không nhận được gì.'}`, ephemeral: true });
      }
      removeItem(interaction.user.id, itemId, 1);
      if (it.heal) {
        const newHp = Math.min(p.max_hp, p.hp + it.heal);
        const healed = newHp - p.hp;
        updatePlayer(interaction.user.id, { hp: newHp });
        return interaction.reply({ content: `🧪 Dùng **${it.name}**, hồi **${healed}** HP. (HP: ${newHp}/${p.max_hp})`, ephemeral: true });
      }
      return interaction.reply({ content: `✅ Đã dùng **${it.name}**.`, ephemeral: true });
    }

    if (action === 'equip') {
      if (!hasItem(interaction.user.id, itemId, 1)) return interaction.reply({ content: '❌ Bạn không có vật phẩm này.', ephemeral: true });
      const check = canEquipItem(p, it);
      if (!check.ok) return interaction.reply({ content: `🚫 ${check.reason === 'wrong_class' ? 'Sai class' : 'Không đủ yêu cầu'} để trang bị item này.`, ephemeral: true });
      const equipped = getEquipped(interaction.user.id);
      const targetSlot = findSlotForItem(it, equipped);
      if (!targetSlot) return interaction.reply({ content: '❌ Không tìm thấy slot phù hợp.', ephemeral: true });
      setEquipped(interaction.user.id, targetSlot, itemId);
      return interaction.reply({ content: `✅ Đã trang bị **${it.name}**!`, ephemeral: true });
    }

    if (action === 'unequip') {
      const equipped = getEquipped(interaction.user.id);
      let slotToClear = null;
      for (const [slot, id] of Object.entries(equipped)) {
        if (id === itemId) { slotToClear = slot; break; }
      }
      if (!slotToClear) return interaction.reply({ content: '❌ Bạn không trang bị item này.', ephemeral: true });
      setEquipped(interaction.user.id, slotToClear, null);
      return interaction.reply({ content: `✅ Đã tháo **${it.name}** khỏi slot ${slotToClear}.`, ephemeral: true });
    }

    if (action === 'sell') {
      if (!hasItem(interaction.user.id, itemId, 1)) return interaction.reply({ content: '❌ Bạn không có vật phẩm này.', ephemeral: true });
      const gain = (it.sell || Math.floor((it.price || 0) / 3));
      removeItem(interaction.user.id, itemId, 1);
      updatePlayer(interaction.user.id, { gold: p.gold + gain });
      return interaction.reply({ content: `✅ Đã bán **${it.name}** thu **${gain}** 💰`, ephemeral: true });
    }
  }

  if (domain === 'duel') {
    const duelId = parseInt(rest[0]);
    const expectedDefender = rest[1];
    const duel = pvp.getDuelById(duelId);
    if (!duel) return interaction.reply({ content: '❌ Duel không tồn tại hoặc đã hết hạn.', ephemeral: true });
    if (duel.status !== 'pending') return interaction.reply({ content: '❌ Duel này đã kết thúc.', ephemeral: true });
    if (interaction.user.id !== expectedDefender) return interaction.reply({ content: '❌ Chỉ người được thách đấu mới phản hồi được.', ephemeral: true });
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
      const challenger = getPlayer(duel.challenger);
      const defender = getPlayer(duel.defender);
      if (!challenger || !defender) {
        pvp.setDuelStatus(duelId, 'declined');
        return interaction.update({ content: '❌ Một bên không có nhân vật.', embeds: [], components: [] });
      }
      if (duel.gold_stake > 0) {
        if (challenger.gold < duel.gold_stake || defender.gold < duel.gold_stake) {
          pvp.setDuelStatus(duelId, 'declined');
          return interaction.update({ content: `❌ Một trong hai không đủ vàng cược.`, embeds: [], components: [] });
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

  if (domain === 'trade') {
    const tradeId = parseInt(rest[0]);
    const t = trade.getTradeById(tradeId);
    if (!t) return interaction.reply({ content: '❌ Trade không tồn tại.', ephemeral: true });
    if (t.status !== 'open') return interaction.reply({ content: '❌ Trade này đã đóng.', ephemeral: true });
    const side = trade.getSide(t, interaction.user.id);
    if (!side) return interaction.reply({ content: '❌ Bạn không phải là thành viên của trade này.', ephemeral: true });
    if (action === 'cancel') {
      trade.setStatus(tradeId, 'cancelled');
      await interaction.update({ content: `❌ <@${interaction.user.id}> đã huỷ trade.`, embeds: [], components: [] });
      return;
    }
    if (action === 'unready') {
      trade.setReady(tradeId, side, false);
      const t2 = trade.getTradeById(tradeId);
      await interaction.update({ embeds: [tradeCmd.buildTradeEmbed(t2)], components: [tradeCmd.buildTradeButtons(tradeId)] });
      return;
    }
    if (action === 'ready') {
      trade.setReady(tradeId, side, true);
      const t2 = trade.getTradeById(tradeId);
      if (t2.ready_a && t2.ready_b) {
        const res = trade.executeTrade(t2);
        if (!res.ok) {
          trade.setReady(tradeId, side, false);
          const t3 = trade.getTradeById(tradeId);
          return interaction.reply({ content: `❌ Trade failed: ${res.error}`, ephemeral: true });
        }
        const pA = getPlayer(t2.user_a);
        const pB = getPlayer(t2.user_b);
        const oA = trade.parseOffer(t2.offer_a);
        const oB = trade.parseOffer(t2.offer_b);
        return interaction.update({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Trade Completed!').addFields({ name: `${pA?.name} nhận`, value: tradeCmd.formatOffer(oB), inline: true }, { name: `${pB?.name} nhận`, value: tradeCmd.formatOffer(oA), inline: true })], components: [] });
      }
      await interaction.update({ embeds: [tradeCmd.buildTradeEmbed(t2)], components: [tradeCmd.buildTradeButtons(tradeId)] });
      return;
    }
  }

  return interaction.reply({ content: '❌ Action không xác định.', ephemeral: true });
}

module.exports = { handle };
