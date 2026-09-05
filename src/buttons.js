// Button interaction handler
const { EmbedBuilder } = require('discord.js');
const pvp = require('./game/pvp');
const trade = require('./game/trade');
const { getPlayer, updatePlayer, addItem, addXpAndLevel } = require('./game/player');
const duelCmd = require('./commands/duel');
const tradeCmd = require('./commands/trade');

// Finalize battle: apply loot, XP, update player HP
async function finalizeBattle(interaction, battleRow, log) {
  const db = require('./db/database');
  const player = getPlayer(battleRow.user_a);
  const winner = battleRow.winner;

  const summary = [];
  summary.push(...(log || []));
  summary.push('---');

  // Update player HP to remaining
  const finalHp = Math.max(0, battleRow.hp_a);
  updatePlayer(battleRow.user_a, { hp: finalHp });

  if (winner === 'a') {
    // WIN — apply loot
    if (battleRow.mode === 'pve') {
      const mob = db.prepare('SELECT * FROM monsters WHERE id=?').get(battleRow.monster_id);
      const eliteMult = battleRow.is_elite === 2 ? 2 : (battleRow.is_elite === 1 ? 1.5 : 1);
      const goldRange = [mob.gold_min, mob.gold_max];
      const guilds = require('./game/guilds');
      const guildBonus = guilds.getGuildBonus(battleRow.user_a);
      const gold = Math.floor((Math.random() * (goldRange[1] - goldRange[0] + 1) + goldRange[0]) * eliteMult * (1 + (guildBonus.gold_pct || 0) / 100));
      updatePlayer(battleRow.user_a, { gold: player.gold + gold, hp: finalHp });
      const xpGained = Math.floor(mob.xp * eliteMult * (1 + (guildBonus.xp_pct || 0) / 100));
      const xpRes = addXpAndLevel(battleRow.user_a, xpGained);

      summary.push(`🏆 **VICTORY!**`);
      summary.push(`💰 +${gold} gold • ✨ +${xpGained} XP`);
      if (guildBonus.gold_pct || guildBonus.xp_pct) {
        summary.push(`🏰 Guild [${guildBonus.tag}]: +${guildBonus.gold_pct}% gold • +${guildBonus.xp_pct}% XP`);
      }
      if (xpRes.levelsGained && xpRes.levelsGained.length > 0) {
        summary.push(`🎉 **LEVEL UP!** Đạt LV${xpRes.level}`);
      }
      if (guildBonus.guild_id) {
        const gxp = Math.max(1, Math.floor(xpGained * 0.1));
        const gUp = guilds.addGuildXp(guildBonus.guild_id, gxp, battleRow.user_a);
        summary.push(`🏰 +${gxp} GXP`);
        if (gUp.levelsGained && gUp.levelsGained.length > 0) {
          summary.push(`🏰 **Guild lên Lv.${gUp.newLevel}!**`);
        }
      }

      // Drop items
      const drops = db.prepare('SELECT * FROM monster_drops WHERE monster_id=?').all(battleRow.monster_id);
      const drops2 = [];
      for (const d of drops) {
        if (Math.random() < d.chance) {
          const qty = d.qty || 1;
          addItem(battleRow.user_a, d.item_id, qty);
          const it = db.prepare('SELECT name FROM items WHERE id=?').get(d.item_id);
          drops2.push(`📦 +${qty}× ${it?.name || d.item_id}`);
        }
      }
      if (drops2.length > 0) summary.push(drops2.join('\n'));
    } else {
      summary.push(`🏆 **VICTORY!** Bạn thắng duel!`);
    }
  } else if (winner === 'b') {
    summary.push(`💀 **DEFEATED!** Bạn thua...`);
    // HP đã = 0 rồi
  } else if (winner === 'flee_a') {
    summary.push(`🏃 Bạn đã chạy thoát.`);
  } else {
    summary.push(`⚔️ Battle kết thúc.`);
  }

  const finalEmbed = new EmbedBuilder()
    .setColor(winner === 'a' ? 0x2ECC71 : (winner === 'b' ? 0xE74C3C : 0x95A5A6))
    .setTitle(winner === 'a' ? '🏆 Victory' : (winner === 'b' ? '💀 Defeat' : '⚔️ Battle End'))
    .setDescription(summary.join('\n').slice(0, 4000))
    .setFooter({ text: `Battle #${battleRow.id} • HP còn: ${finalHp}` });

  return interaction.update({ embeds: [finalEmbed], components: [] });
}

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
  // GUILD INVITE BUTTONS: guild:accept|decline:<guildId>:<userId>
  // ============================================================
  if (domain === 'guild') {
    const guildId = parseInt(rest[0], 10);
    const expectedUser = rest[1];
    if (interaction.user.id !== expectedUser) {
      return interaction.reply({ content: '❌ Chỉ người được mời mới bấm được.', ephemeral: true });
    }
    const guilds = require('./game/guilds');
    const g = guilds.getGuild(guildId);
    if (action === 'decline') {
      const res = guilds.declineInvite(interaction.user.id, guildId);
      if (!res.ok) return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
      await interaction.update({
        content: `❌ <@${interaction.user.id}> đã từ chối lời mời bang \`[${g?.tag || '?'}]\`.`,
        embeds: [],
        components: [],
      });
      return;
    }
    if (action === 'accept') {
      const res = guilds.acceptInvite(interaction.user.id, guildId);
      if (!res.ok) return interaction.reply({ content: `❌ ${res.error}`, ephemeral: true });
      try {
        const achievements = require('./game/achievements');
        achievements.checkAndGrant(interaction.user.id, { client: interaction.client, guildId: interaction.guildId });
      } catch {}
      await interaction.update({
        content: `✅ <@${interaction.user.id}> đã gia nhập \`[${res.guild.tag}]\` **${res.guild.name}**!`,
        embeds: [],
        components: [],
      });
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

  // ============================================================
  // PAGINATION BUTTONS: page:<domain>:<userId>:<filter>:<page>
  // ============================================================
  if (domain === 'page') {
    try {
      const paginator = require('./game/paginator');
      const decoded = paginator.decodeCustomId(customId);
      if (!decoded) {
        return interaction.reply({ content: '❌ Invalid page id: ' + customId, ephemeral: true });
      }
      // Check user (chỉ người gọi mới nhấn được)
      if (interaction.user.id !== decoded.userId) {
        return interaction.reply({ content: '❌ Chỉ người gọi lệnh mới điều khiển được. Gõ lệnh riêng của bạn để dùng.', ephemeral: true });
      }

      // Route theo domain
      if (decoded.domain === 'craft' || decoded.domain === 'cook') {
        const craftCmd = require('./commands/craft');
        const jobs = require('./game/jobs');
        const jobType = decoded.domain === 'craft' ? 'crafting' : 'cooking';
        const job = jobs.getJob(decoded.userId, jobType);
        const fakeMsg = { author: { id: decoded.userId }, reply: () => {} };
        return await craftCmd.renderRecipesPage({
          msg: fakeMsg,
          userId: decoded.userId,
          type: decoded.domain,
          filter: decoded.filter,
          page: decoded.page,
          jobLevel: job.level,
          replyFn: (opts) => interaction.update(opts),
        });
      }

      if (decoded.domain === 'shop') {
        const shopCmd = require('./commands/shop');
        const p = getPlayer(decoded.userId);
        return await shopCmd.renderShopPage({
          msg: { author: { id: decoded.userId } },
          userId: decoded.userId,
          filter: decoded.filter,
          page: decoded.page,
          playerGold: p?.gold || 0,
          playerLevel: p?.level || 1,
          replyFn: (opts) => interaction.update(opts),
        });
      }

      return interaction.reply({ content: '❌ Unknown page domain: ' + decoded.domain, ephemeral: true });
    } catch (err) {
      console.error('[page handler] ERROR:', err);
      const errMsg = `⚠️ Page error: \`${err.message}\`\nCustomId: \`${customId}\``;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: errMsg, ephemeral: true }).catch(() => {});
      }
      return interaction.reply({ content: errMsg, ephemeral: true }).catch(() => {});
    }
  }

  // Info button (disabled label giữa nav — chỉ để display)
  if (customId.startsWith('page_info')) {
    return interaction.deferUpdate().catch(() => {});
  }

  // ============================================================
  // BATTLE BUTTONS: bt:act:<battleId>:<skillId>
  // ============================================================
  if (domain === 'bt' && action === 'act') {
    try {
      const battleModule = require('./game/battle');
      const battleCmd = require('./commands/battle');
      const db = require('./db/database');
      const battleId = parseInt(rest[0]);
      const skillId = rest[1];

      const battleRow = battleModule.getBattle(battleId);
      if (!battleRow) return interaction.reply({ content: '❌ Battle không tồn tại.', ephemeral: true });
      if (battleRow.status !== 'active') return interaction.reply({ content: '❌ Battle đã kết thúc.', ephemeral: true });
      if (battleRow.user_a !== interaction.user.id && battleRow.user_b !== interaction.user.id) {
        return interaction.reply({ content: '❌ Không phải trận của bạn.', ephemeral: true });
      }
      // Check turn của user
      const isSideA = battleRow.user_a === interaction.user.id;
      if (isSideA && battleRow.turn !== 'a') return interaction.reply({ content: '⏳ Chưa đến turn của bạn.', ephemeral: true });
      if (!isSideA && battleRow.turn !== 'b') return interaction.reply({ content: '⏳ Chưa đến turn của bạn.', ephemeral: true });

      // Chặn boss actions
      if (['roar', 'rage'].includes(skillId)) {
        return interaction.reply({ content: '❌ Skill này chỉ boss dùng được.', ephemeral: true });
      }

      // Check class có skill này không (loại tránh melee dùng fireball chẳng hạn)
      const skills = require('./game/skills');
      const skill = skills.getSkill(skillId);
      if (!skill) return interaction.reply({ content: '❌ Skill không tồn tại.', ephemeral: true });
      const player = require('./game/player').getPlayer(interaction.user.id);
      if (skill.class && skill.class !== (player.primary_class || 'melee')) {
        return interaction.reply({ content: `❌ Skill này dành cho class ${skill.class}, bạn là ${player.primary_class || 'chưa chọn'}.`, ephemeral: true });
      }

      // Process action
      const result = battleModule.processAction(battleRow, isSideA ? 'a' : 'b', skillId);
      if (result.error) {
        return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      }

      // Reload battle after action
      let updated = battleModule.getBattle(battleId);

      // Kiểm tra battle end
      if (updated.status === 'ended') {
        return await finalizeBattle(interaction, updated, result.log);
      }

      // Nếu PvE: bot đi mob turn ngay
      if (updated.mode === 'pve') {
        const mobAction = battleModule.pickMobAction(updated);
        const mobResult = battleModule.processAction(updated, 'b', mobAction);
        updated = battleModule.getBattle(battleId);
        if (updated.status === 'ended') {
          return await finalizeBattle(interaction, updated, [...result.log, '---', ...mobResult.log]);
        }
      }

      // Update embed
      const mob = db.prepare('SELECT name FROM monsters WHERE id=?').get(updated.monster_id);
      const player2 = require('./game/player').getPlayer(updated.user_a);
      const embed = battleCmd.buildBattleEmbed(updated, player2.name, mob?.name || 'Mob');
      const rows = battleCmd.buildActionButtons(battleId, player2.primary_class || 'melee');
      return await interaction.update({ embeds: [embed], components: rows });
    } catch (err) {
      console.error('[battle button]', err);
      const msg = `⚠️ Battle error: \`${err.message}\``;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      }
      return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }

  // ============================================================
  // AGAIN BUTTON: again:<cmd>:<userId>:<argsEncoded>
  // ============================================================
  if (domain === 'again') {
    try {
      const again = require('./game/again_button');
      const decoded = again.decodeCustomId(customId);
      if (!decoded) {
        return interaction.reply({ content: '❌ Invalid again id.', ephemeral: true });
      }
      if (interaction.user.id !== decoded.userId) {
        return interaction.reply({ content: '❌ Chỉ người gọi lệnh mới nhấn được. Gõ lệnh riêng của bạn.', ephemeral: true });
      }

      const cmd = interaction.client.commands.get(decoded.cmd);
      if (!cmd) {
        return interaction.reply({ content: `❌ Command \`${decoded.cmd}\` không tìm thấy.`, ephemeral: true });
      }

      // Defer để bot chạy command mới (nó sẽ msg.reply với embed + button riêng)
      await interaction.deferUpdate().catch(() => {});

      // Build fake msg giả từ interaction
      const fakeMsg = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: interaction.channel,
        client: interaction.client,
        mentions: { users: { first: () => null }, channels: { first: () => null } },
        reply: (opts) => {
          // Send message mới trong channel (không reply-tag để đỡ noise)
          const payload = typeof opts === 'string' ? { content: opts } : opts;
          return interaction.channel.send(payload);
        },
      };

      await cmd.execute(fakeMsg, decoded.args);

      // Xóa row Again ở message cũ để tránh spam / conflict
      try {
        await interaction.message.edit({ components: [] });
      } catch { /* ignore */ }
    } catch (err) {
      console.error('[again handler]', err);
      const msg = `⚠️ Again error: \`${err.message}\``;
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      }
      return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
    return;
  }

  // Unknown
  return interaction.reply({ content: '❌ Action không xác định: ' + customId, ephemeral: true });
}

module.exports = { handle };
