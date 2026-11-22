const world = require('../game/world_weather');
const { getPrefix } = require('../game/prefix');
module.exports = {
  name: 'weather', aliases: ['thoitiet'], description: 'Thời tiết chung, giờ thế giới và vật sưu tầm hiếm',
  async execute(msg, args = []) {
    const p = getPrefix(), action = (args[0] || '').toLowerCase();
    const botAdmin = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(msg.author.id);
    if (['interval', 'time', 'dayhours'].includes(action)) {
      if (!botAdmin) return msg.reply('🔒 Chỉ admin bot trong ADMIN_IDS được chỉnh thời tiết/đồng hồ toàn thế giới.');
      const error = world.configure(action, args.slice(1));
      if (error) return msg.reply(error);
      return msg.reply(`✅ Đã lưu cấu hình chung toàn bot. ${world.describe(world.current())}`);
    }
    if (action === 'channel') {
      if (!msg.guild) return msg.reply('Chỉ cấu hình kênh trong server Discord.');
      const permitted = botAdmin || msg.guild.ownerId === msg.author.id || msg.member?.permissions?.has('ManageGuild') || msg.member?.permissions?.has('Administrator');
      if (!permitted) return msg.reply('🔒 Cần quyền Manage Server hoặc Administrator để đặt kênh.');
      const db = require('../db/database');
      if (args[1] === 'off') {
        db.prepare('DELETE FROM weather_channels WHERE guild_id=?').run(msg.guild.id);
        return msg.reply('✅ Đã tắt bản tin thời tiết cho server này.');
      }
      const id = /^<#(\d+)>$/.exec(args[1] || '')?.[1] || (/^\d+$/.test(args[1] || '') ? args[1] : null);
      if (!id) return msg.reply(`Dùng ${p}weather channel #kênh hoặc ${p}weather channel off.`);
      let channel;
      try { channel = await msg.client.channels.fetch(id); } catch { /* invalid/inaccessible channel */ }
      if (!channel || channel.guildId !== msg.guild.id || !channel.isTextBased() || typeof channel.send !== 'function') return msg.reply('Kênh phải là kênh nhắn tin trong server này mà bot truy cập được.');
      const permissions = channel.permissionsFor(msg.client.user);
      if (!permissions?.has(['ViewChannel', 'SendMessages'])) return msg.reply('Bot cần quyền View Channel và Send Messages tại kênh này.');
      db.prepare("INSERT INTO weather_channels(guild_id,channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,last_key=''").run(msg.guild.id, id);
      return msg.reply({ content: `✅ Đặt bản tin tại <#${id}>. Gửi điều kiện hiện tại trong vòng 30 giây, sau đó mỗi chu kỳ thời tiết hoặc đổi ngày/đêm.`, allowedMentions: { parse: [] } });
    }
    if (action === 'rares') {
      const rows = require('../game/weather_rares').RARES;
      return msg.reply(rows.map(r => `${r.name} · \`${r.zone}\` · ${world.WEATHER[r.weather]} / ${r.period === 'day' ? 'ngày' : 'đêm'} · ${(r.chance * 100).toFixed(1)}%`).join('\n') + '\nChỉ roll khi đủ cấp nghề/dụng cụ và thực hiện lượt fish/gather hợp lệ. Ngoài điều kiện = 0%; mỗi lần trúng ×1, không nhân bonus.');
    }
    if (action && action !== 'help') return msg.reply(`Dùng ${p}weather, ${p}weather rares, ${p}weather channel #kênh/off; admin bot: interval <phút>, time HH:MM/reset, dayhours <giờ đầu> <giờ cuối>.`);
    const s = world.current();
    const db = require('../db/database');
    const channel = msg.guild && db.prepare('SELECT channel_id FROM weather_channels WHERE guild_id=?').get(msg.guild.id);
    return msg.reply({ content: `🌍 ${world.describe(s)}\nThời tiết chung toàn bot, bốc đều ngẫu nhiên mỗi ${s.interval_ms / 60000} phút, có thể lặp. Lần tới <t:${Math.floor(s.next_at / 1000)}:R>.\nNgày ${s.day_start}:00–${s.day_end}:00; ngoài khung là đêm. Đồng hồ: UTC+7${s.clock_offset ? `, lệch admin ${s.clock_offset / 60000} phút` : ' (giờ Việt Nam)'}.\nKênh bản tin server: ${channel ? `<#${channel.channel_id}>` : 'chưa đặt'}.\n${p}weather rares xem cây/cá hiếm; ${p}weather help xem cấu hình.`, allowedMentions: { parse: [] } });
  },
};
