const { EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../game/player');
const jobs = require('../game/jobs');

function resolveTarget(msg, arg) {
  if (!arg) return msg.author;
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  const id = arg?.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || msg.author;
}

function progressBar(cur, max, len = 10) {
  const ratio = Math.min(1, cur / max);
  const filled = Math.round(ratio * len);
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

module.exports = {
  name: 'job',
  aliases: ['jobs', 'nghe', 'profession'],
  description: 'Xem level các nghề. !job, !job @user, !job top <type>',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    // ===== top =====
    if (sub === 'top' || sub === 'leaderboard' || sub === 'bxh') {
      const jobType = (args[1] || '').toLowerCase();
      if (!jobs.JOB_TYPES.includes(jobType)) {
        return msg.reply(`❌ Cú pháp: \`${prefix}job top <${jobs.JOB_TYPES.join('|')}>\``);
      }
      const top = jobs.getJobLeaderboard(jobType, 10);
      if (top.length === 0) return msg.reply('💡 Chưa ai cày nghề này.');
      const info = jobs.JOB_INFO[jobType];
      const lines = top.map((r, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `**${i+1}.**`;
        return `${medal} **${r.name}** — Lv.${r.level} (${r.xp} XP)`;
      });
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`${info.icon} BXH ${info.name}`)
        .setDescription(lines.join('\n'))] });
    }

    // ===== view player jobs =====
    const target = resolveTarget(msg, args[0]);
    const p = getPlayer(target.id);
    if (!p) return msg.reply(`❌ ${target.username} chưa có nhân vật.`);

    const allJobs = jobs.getAllJobs(target.id);
    const fields = jobs.JOB_TYPES.map(jt => {
      const j = allJobs[jt];
      const info = jobs.JOB_INFO[jt];
      const next = jobs.xpToNext(j.level);
      return {
        name: `${info.icon} ${info.name}`,
        value: `**Lv.${j.level}**\n${progressBar(j.xp, next)}\n${j.xp}/${next} XP`,
        inline: true,
      };
    });

    const embed = new EmbedBuilder().setColor(0x5865F2)
      .setTitle(`🛠️ Nghề của ${p.name}`)
      .addFields(fields)
      .setFooter({ text: `${prefix}job top <type> xem BXH` });
    return msg.reply({ embeds: [embed] });
  },
}; 
