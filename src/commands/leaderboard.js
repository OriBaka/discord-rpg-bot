const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');

module.exports = {
  name: 'top',
  aliases: ['leaderboard', 'bxh'],
  description: 'Bảng xếp hạng theo level',
  async execute(msg, args) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'guild' || sub === 'bang' || sub === 'clan') {
      const guilds = require('../game/guilds');
      const rows = guilds.listTop(10);
      if (rows.length === 0) return msg.reply('💡 Chưa có bang hội nào.');
      const lines = rows.map((g, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `**${i+1}.**`;
        return `${medal} \`[${g.tag}]\` **${g.name}** — Lv.${g.level} • ${g.members} tv • ${g.gold}💰`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x1ABC9C).setTitle('🏰 BXH Bang hội')
        .setDescription(lines.join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    const rows = db.prepare(`
      SELECT name, level, xp, gold FROM players
      ORDER BY level DESC, xp DESC
      LIMIT 10
    `).all();
    if (rows.length === 0) return msg.reply('Chưa có ai chơi cả!');
    const lines = rows.map((r, i) => {
      const medal = ['🥇','🥈','🥉'][i] || `**${i+1}.**`;
      return `${medal} **${r.name}** — Lv.${r.level} • ${r.gold}💰`;
    });
    const embed = new EmbedBuilder()
      .setColor(0xF1C40F).setTitle('🏆 Bảng Xếp Hạng')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${process.env.PREFIX || '!'}top guild — BXH bang hội` });
    return msg.reply({ embeds: [embed] });
  },
}; 
