// Admin command để quản lý slash deployment thủ công
const { EmbedBuilder } = require('discord.js');
const deploy = require('../slash/deploy');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

module.exports = {
  name: 'slashadmin',
  aliases: ['sla'],
  description: 'Admin: quản lý slash command deployment',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');

    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🛠️ Slash Admin')
        .setDescription([
          `\`${prefix}sla list\` — list slash commands hiện tại trên server này + global`,
          `\`${prefix}sla redeploy\` — deploy lại slash (theo SLASH_GUILD_ID nếu set)`,
          `\`${prefix}sla clearglobal\` — XÓA toàn bộ slash global (fix duplicate)`,
          `\`${prefix}sla clearguild\` — XÓA toàn bộ slash của server hiện tại`,
          '',
          '⚠️ Sau khi clear, Discord có thể mất vài phút (guild) hoặc vài giờ (global) để cập nhật.',
        ].join('\n'))] });
    }

    if (sub === 'list') {
      try {
        const global = await deploy.listDeployedCommands(msg.client, null);
        const guild = msg.guild ? await deploy.listDeployedCommands(msg.client, msg.guild.id) : [];
        return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
          .setTitle('🛠️ Slash Commands Deployment')
          .addFields(
            { name: '🌐 Global', value: global.length > 0 ? global.map(c => `/${c.name}`).join(', ').slice(0, 1024) : '(empty)' },
            { name: '🏠 Guild ' + (msg.guild?.id || ''), value: guild.length > 0 ? guild.map(c => `/${c.name}`).join(', ').slice(0, 1024) : '(empty)' },
          )
          .setFooter({ text: 'Nếu cả 2 đều có command → Discord sẽ hiện duplicate!' })] });
      } catch (err) {
        return msg.reply(`❌ Lỗi: ${err.message}`);
      }
    }

    if (sub === 'redeploy') {
      await msg.reply('⏳ Đang deploy slash commands...');
      try {
        await deploy.deploySlashCommands(msg.client);
        return msg.channel.send('✅ Đã redeploy. Kiểm tra với `' + prefix + 'sla list`.');
      } catch (err) {
        return msg.channel.send(`❌ Lỗi: ${err.message}`);
      }
    }

    if (sub === 'clearglobal') {
      await msg.reply('⏳ Đang xóa global slash commands...');
      try {
        await deploy.clearGlobalCommands(msg.client);
        return msg.channel.send('✅ Đã xóa global. Discord có thể mất tới 1 giờ để cập nhật cho mọi user.');
      } catch (err) {
        return msg.channel.send(`❌ Lỗi: ${err.message}`);
      }
    }

    if (sub === 'clearguild') {
      if (!msg.guild) return msg.reply('❌ Phải dùng trong server.');
      await msg.reply('⏳ Đang xóa guild slash commands...');
      try {
        await deploy.clearGuildCommands(msg.client, msg.guild.id);
        return msg.channel.send('✅ Đã xóa guild commands. Cập nhật ngay.');
      } catch (err) {
        return msg.channel.send(`❌ Lỗi: ${err.message}`);
      }
    }

    return msg.reply(`❌ Sub không hợp lệ. Gõ \`${prefix}sla help\``);
  },
}; 
