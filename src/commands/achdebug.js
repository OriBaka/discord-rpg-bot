// Debug command: kiểm tra tại sao 1 achievement không trigger
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const achievements = require('../game/achievements');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

function resolveTarget(msg, arg) {
  if (!arg) return msg.author;
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  const id = arg?.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || msg.author;
}

module.exports = {
  name: 'achdebug',
  aliases: ['achd', 'debugach'],
  description: 'Debug achievement: !achdebug <ach_id> [@user]',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');

    const prefix = process.env.PREFIX || '!';
    const achId = args[0];
    if (!achId) return msg.reply(`❌ Cú pháp: \`${prefix}achdebug <ach_id> [@user]\``);

    const ach = achievements.getAchievement(achId);
    if (!ach) return msg.reply(`❌ Achievement \`${achId}\` không tồn tại.`);

    const target = resolveTarget(msg, args[1]);
    const userId = target.id;

    // Diagnose
    const lines = [];
    lines.push(`**Achievement**: ${ach.icon} ${ach.name} \`${ach.id}\``);
    lines.push(`**Objective**: \`${ach.objective}\` target=\`${ach.target_id || '(none)'}\` qty=${ach.target_qty}`);
    lines.push(`**User**: ${target.username} \`${userId}\``);
    lines.push('');

    // Check user đã có ach chưa
    const has = achievements.hasUnlocked(userId, achId);
    lines.push(`✅ Đã unlock?  → **${has ? 'YES (không trigger lại)' : 'NO'}**`);

    // Check player tồn tại
    const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
    lines.push(`✅ Player tồn tại?  → **${player ? 'YES' : 'NO ← phải có nhân vật trước!'}**`);

    if (!player) {
      const embed = new EmbedBuilder().setColor(0xED4245)
        .setTitle('🔍 Achievement Debug').setDescription(lines.join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    // Check theo objective
    const stats = achievements.getPlayerStats(userId);
    let conditionMet = false, detail = '';

    switch (ach.objective) {
      case 'kill_count':
        detail = `Total kills: **${stats.total_kills}** / ${ach.target_qty}`;
        conditionMet = stats.total_kills >= ach.target_qty;
        break;
      case 'kill_monster':
        detail = `(check qua hook checkKillMonster mỗi lần hunt)`;
        break;
      case 'gold_total':
        detail = `Total gold: **${stats.total_gold}** / ${ach.target_qty}`;
        conditionMet = stats.total_gold >= ach.target_qty;
        break;
      case 'level_reach':
        detail = `Level: **${player.level}** / ${ach.target_qty}`;
        conditionMet = player.level >= ach.target_qty;
        break;
      case 'quest_complete':
        detail = `Quests done: **${stats.total_quests}** / ${ach.target_qty}`;
        conditionMet = stats.total_quests >= ach.target_qty;
        break;
      case 'item_collect': {
        const itExists = db.prepare('SELECT id, name FROM items WHERE id = ?').get(ach.target_id);
        if (!itExists) {
          detail = `❌ Item \`${ach.target_id}\` KHÔNG TỒN TẠI trong DB!`;
        } else {
          const inv = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, ach.target_id);
          const have = inv?.qty || 0;
          detail = `Item \`${ach.target_id}\` (${itExists.name}): có **${have}** / cần ${ach.target_qty}`;
          conditionMet = have >= ach.target_qty;
        }
        break;
      }
    }

    lines.push(`📊 **Condition**: ${detail}`);
    lines.push(`🎯 **Should unlock?**  → ${conditionMet ? '✅ **YES**' : '❌ NO'}`);

    if (!has && conditionMet) {
      // Force-grant
      lines.push('');
      lines.push('🔧 **Auto-fix**: Đang force grant...');
      const a = achievements.grantAchievement(userId, achId);
      lines.push(a ? `✅ Đã grant **${a.name}**!` : '❌ Grant fail');
    }

    const embed = new EmbedBuilder()
      .setColor(conditionMet && !has ? 0x57F287 : 0xFEE75C)
      .setTitle('🔍 Achievement Debug')
      .setDescription(lines.join('\n'));
    return msg.reply({ embeds: [embed] });
  },
}; 
