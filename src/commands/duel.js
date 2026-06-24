const { EmbedBuilder } = require('discord.js');
const { getPlayer, getEffectiveStats, updatePlayer } = require('../game/player');
const pvp = require('../game/pvp');
const pets = require('../game/pets');
const channels = require('../game/channels');

function resolveTarget(msg, arg) {
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  if (!arg) return null;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || null;
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

// Tính effective stats có cộng pet bonus
function getFullStats(userId) {
  const p = getPlayer(userId);
  if (!p) return null;
  const eff = getEffectiveStats(p);
  const petBonus = pets.getPetBonus(userId);
  return {
    atk: eff.atk + (petBonus.atk || 0),
    def: eff.def + (petBonus.def || 0),
    max_hp_bonus: petBonus.hp || 0,
  };
}

module.exports = {
  name: 'duel',
  aliases: ['pvp', 'dau'],
  description: 'PvP đấu với người chơi khác. !duel @user [gold]',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ====== top =====
    if (sub === 'top' || sub === 'bxh' || sub === 'leaderboard') {
      const top = pvp.getTopRated(10);
      if (top.length === 0) return msg.reply('💡 Chưa có ai đấu PvP.');
      const lines = top.map((r, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `**${i+1}.**`;
        const total = r.wins + r.losses;
        const winRate = total > 0 ? Math.round(r.wins / total * 100) : 0;
        return `${medal} **${r.name}** — ${r.rating} pt (${r.wins}W/${r.losses}L, ${winRate}%)`;
      });
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
        .setTitle('⚔️ PvP Leaderboard').setDescription(lines.join('\n'))] });
    }

    // ====== stats (của mình hoặc user khác) =====
    if (sub === 'stats' || sub === 'info') {
      const target = resolveTarget(msg, args[1]) || msg.author;
      const s = pvp.getStats(target.id);
      const total = s.wins + s.losses;
      const winRate = total > 0 ? Math.round(s.wins / total * 100) : 0;
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
        .setTitle(`⚔️ PvP Stats: ${target.username}`)
        .addFields(
          { name: '🏆 Rating', value: `${s.rating}`, inline: true },
          { name: '✅ Wins',   value: `${s.wins}`, inline: true },
          { name: '❌ Losses', value: `${s.losses}`, inline: true },
          { name: '📊 Win Rate', value: `${winRate}%`, inline: true },
          { name: '⚔️ Total Duels', value: `${total}`, inline: true },
        )] });
    }

    // ====== accept =====
    if (sub === 'accept' || sub === 'yes' || sub === 'ok') {
      const duel = pvp.getActiveDuel(msg.author.id);
      if (!duel) return msg.reply('❌ Không có lời thách đấu nào.');
      if (duel.defender !== msg.author.id) return msg.reply('❌ Bạn không phải là người được thách đấu.');
      return executeDuel(msg, duel, prefix);
    }

    // ====== decline =====
    if (sub === 'decline' || sub === 'no' || sub === 'cancel') {
      const duel = pvp.getActiveDuel(msg.author.id);
      if (!duel) return msg.reply('❌ Không có lời thách đấu nào.');
      pvp.setDuelStatus(duel.id, 'declined');
      const who = duel.defender === msg.author.id ? 'từ chối' : 'huỷ';
      return msg.reply(`✅ Đã ${who} lời thách đấu.`);
    }

    // ====== status =====
    if (sub === 'status') {
      const duel = pvp.getActiveDuel(msg.author.id);
      if (!duel) return msg.reply('💡 Bạn không có duel nào đang chờ.');
      const remain = pvp.DUEL_EXPIRE_MS - (Date.now() - duel.created_at);
      const isDef = duel.defender === msg.author.id;
      const other = isDef ? duel.challenger : duel.defender;
      return msg.reply(
        `⚔️ Duel với <@${other}>\n` +
        `💰 Cược: ${duel.gold_stake} vàng\n` +
        `⏳ Còn lại: ${formatTime(remain)}\n` +
        (isDef ? `→ \`${prefix}duel accept\` hoặc \`${prefix}duel decline\`` : '→ Đợi đối thủ phản hồi...')
      );
    }

    // ====== Default: thách đấu ======
    const target = resolveTarget(msg, args[0]);
    if (!target) {
      return msg.reply(
        `❌ Cú pháp:\n` +
        `\`${prefix}duel @user [gold]\` — thách đấu\n` +
        `\`${prefix}duel accept/decline\` — phản hồi\n` +
        `\`${prefix}duel status\` — xem duel đang chờ\n` +
        `\`${prefix}duel stats [@user]\` — xem PvP stats\n` +
        `\`${prefix}duel top\` — bảng xếp hạng`
      );
    }
    if (target.id === msg.author.id) return msg.reply('❌ Không thể tự thách đấu chính mình.');
    if (target.bot) return msg.reply('❌ Không thể thách bot.');

    const targetPlayer = getPlayer(target.id);
    if (!targetPlayer) return msg.reply(`❌ **${target.username}** chưa có nhân vật.`);

    // Check cooldown
    const cdRemain = pvp.getCooldownRemaining(msg.author.id);
    if (cdRemain > 0) return msg.reply(`⏳ Bạn đang cooldown PvP, còn **${formatTime(cdRemain)}**.`);

    // Check existing duel
    const existing = pvp.getActiveDuel(msg.author.id);
    if (existing) return msg.reply(`❌ Bạn đang có duel pending. Dùng \`${prefix}duel status\` hoặc \`${prefix}duel decline\`.`);
    const existingTarget = pvp.getActiveDuel(target.id);
    if (existingTarget) return msg.reply(`❌ **${target.username}** đang trong duel khác.`);

    // Parse gold stake
    const goldStake = Math.max(0, parseInt(args[1]) || 0);
    if (goldStake > p.gold) return msg.reply(`❌ Bạn không đủ ${goldStake} vàng (có ${p.gold}).`);
    if (goldStake > targetPlayer.gold) return msg.reply(`❌ **${target.username}** không đủ ${goldStake} vàng.`);

    // Create duel
    const duel = pvp.createDuel(msg.author.id, target.id, goldStake);

    return msg.reply(
      `⚔️ <@${target.id}>, **${msg.author.username}** thách đấu bạn!\n` +
      (goldStake > 0 ? `💰 Cược: **${goldStake}** vàng\n` : '🆓 Không cược\n') +
      `⏳ Bạn có **60 giây** để \`${prefix}duel accept\` hoặc \`${prefix}duel decline\``
    );
  },
};

async function executeDuel(msg, duel, prefix) {
  const challenger = getPlayer(duel.challenger);
  const defender = getPlayer(duel.defender);
  if (!challenger || !defender) return msg.reply('❌ Một bên không tồn tại nữa.');

  // Re-check gold (có thể đã thay đổi)
  if (duel.gold_stake > 0) {
    if (challenger.gold < duel.gold_stake) {
      pvp.setDuelStatus(duel.id, 'declined');
      return msg.reply(`❌ ${challenger.name} không còn đủ vàng cược. Duel huỷ.`);
    }
    if (defender.gold < duel.gold_stake) {
      pvp.setDuelStatus(duel.id, 'declined');
      return msg.reply(`❌ ${defender.name} không còn đủ vàng cược. Duel huỷ.`);
    }
  }

  // Get full stats
  const s1 = getFullStats(duel.challenger);
  const s2 = getFullStats(duel.defender);

  // Simulate
  const result = pvp.simulateDuel(challenger, defender, s1, s2);
  const winnerId = result.winnerId;
  const loserId = winnerId === duel.challenger ? duel.defender : duel.challenger;
  const winnerPlayer = winnerId === duel.challenger ? challenger : defender;
  const loserPlayer = winnerId === duel.challenger ? defender : challenger;

  // Transfer gold
  if (duel.gold_stake > 0) {
    updatePlayer(winnerId, { gold: winnerPlayer.gold + duel.gold_stake });
    updatePlayer(loserId, { gold: Math.max(0, loserPlayer.gold - duel.gold_stake) });
  }

  // Update rating
  const ratingResult = pvp.updateRating(winnerId, loserId);
  pvp.setDuelStatus(duel.id, 'done', winnerId);

  // Build result embed
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle(`⚔️ Duel: ${challenger.name} VS ${defender.name}`)
    .setDescription(result.log.slice(-8).join('\n'))
    .addFields(
      { name: '🏆 Winner', value: `<@${winnerId}> **${winnerPlayer.name}**`, inline: true },
      { name: '💰 Cược', value: duel.gold_stake > 0 ? `${duel.gold_stake} 💰` : 'Không', inline: true },
      { name: '📈 Rating', value: `${winnerPlayer.name}: **+${ratingResult.change}** (${ratingResult.winnerNewRating})\n${loserPlayer.name}: ${ratingResult.loserNewRating}`, inline: false },
    );

  return msg.reply({ embeds: [embed] });
           } 
