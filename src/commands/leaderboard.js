const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');

module.exports = {
  name: 'top',
  aliases: ['leaderboard', 'bxh'],
  description: 'Bảng xếp hạng theo level',
  async execute(msg) {
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
      .setDescription(lines.join('\n'));
    return msg.reply({ embeds: [embed] });
  },
}; 
