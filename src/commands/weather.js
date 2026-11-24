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
    if (action === 'watch') {
      if (!msg.guild) return msg.reply('Đăng ký nhắc trong server có kênh bản tin thời tiết, không phải DM.');
      const alerts = require('../game/weather_alerts');
      const sub = (args[1] || 'list').toLowerCase();
      const weatherAliases = { mua:'rain', quang:'clear', giong:'storm', suong:'fog', tuyet:'snow' };
      const periodAliases = { ngay:'day', dem:'night' };
      const rawWeather = (args[2] || '').toLowerCase(), rawPeriod = (args[3] || 'any').toLowerCase();
      const weather = weatherAliases[rawWeather] || rawWeather;
      const period = periodAliases[rawPeriod] || rawPeriod;
      if (sub === 'channel') {
        const permitted = botAdmin || msg.guild.ownerId === msg.author.id || msg.member?.permissions?.has('ManageGuild') || msg.member?.permissions?.has('Administrator');
        if (!permitted) return msg.reply('🔒 Cần Manage Server hoặc Administrator để đặt kênh cảnh báo.');
        const db = require('../db/database');
        if (args[2] === 'off') { db.prepare('DELETE FROM weather_alert_channels WHERE guild_id=?').run(msg.guild.id); return msg.reply('✅ Đã tạm dừng kênh cảnh báo riêng; giữ đăng ký và role.'); }
        const id = /^<#(\d+)>$/.exec(args[2] || '')?.[1] || (/^\d+$/.test(args[2] || '') ? args[2] : null);
        if (!id) return msg.reply(`Dùng ${p}weather watch channel #kênh-riêng hoặc off.`);
        const bulletin = db.prepare('SELECT channel_id FROM weather_channels WHERE guild_id=?').get(msg.guild.id);
        if (bulletin?.channel_id === id) return msg.reply('Chọn kênh cảnh báo khác kênh bản tin thời tiết.');
        const channel = await msg.client.channels.fetch(id).catch(() => null);
        if (!channel || channel.guildId !== msg.guild.id || !channel.isTextBased() || typeof channel.send !== 'function') return msg.reply('Kênh phải là kênh nhắn tin trong server này.');
        if (!channel.permissionsFor(msg.client.user)?.has(['ViewChannel','SendMessages','MentionEveryone'])) return msg.reply('Bot cần View Channel, Send Messages và Mention Everyone tại kênh cảnh báo để ping role không công khai mentionable.');
        const me = await msg.guild.members.fetchMe();
        if (!me.permissions.has('ManageRoles')) return msg.reply('Bot cần Manage Roles; đặt role bot cao hơn các role Weather do bot tạo.');
        db.prepare('INSERT INTO weather_alert_channels VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id').run(msg.guild.id,id);
        return msg.reply({content:`✅ Kênh ping role riêng: <#${id}>. Bot tự tạo role theo điều kiện khi cần, chuyển đăng ký cũ trong các lượt kiểm tra tiếp theo. Bản tin thường không đổi.`,allowedMentions:{parse:[]}});
      }
      const usage = `Dùng ${p}weather watch add rain night (mưa VÀ đêm), add rain any (mưa bất kỳ buổi), add any night (mọi thời tiết lúc đêm). Thời tiết: clear/rain/storm/fog/snow/any; buổi: day/night/any. Xem: watch list; xóa một điều kiện: watch remove rain night; tắt hết: watch off.`;
      if (!['list','add','remove','off'].includes(sub) || (['add','remove'].includes(sub) && (args.length < 3 || args.length > 4)) || (['list','off'].includes(sub) && args.length > 2)) return msg.reply(usage);
      if (sub === 'add' && !require('../db/database').prepare('SELECT 1 FROM weather_alert_channels WHERE guild_id=?').get(msg.guild.id)) return msg.reply(`Server chưa có kênh cảnh báo riêng. Nhờ quản trị dùng ${p}weather watch channel #kênh-riêng trước khi đăng ký.`);
      try {
        const rows = await alerts.change(msg.guild, msg.author.id, sub, weather, period);
        if (sub === 'list') return msg.reply({ content: `🔔 **Nhắc thời tiết của bạn tại server này**\n${rows.length ? rows.map(r => `${world.WEATHER[r.weather] || 'Mọi thời tiết'} · ${{day:'ban ngày',night:'ban đêm',any:'mọi buổi'}[r.period]}`).join('\n') : 'Chưa đăng ký.'}\n${usage}`, allowedMentions: { parse: [] } });
        return msg.reply(sub === 'add' ? '✅ Đã theo dõi. Đã gán role điều kiện. Bot ping role tại kênh cảnh báo riêng khi điều kiện mới khớp (kiểm tra mỗi 30 giây). Nếu nhóm đã được nhắc trong đợt hiện tại, bạn chờ đợt kế tiếp để tránh ping lại cả nhóm.' : sub === 'off' ? '✅ Đã tắt mọi nhắc thời tiết của bạn tại server này.' : '✅ Đã xóa điều kiện nhắc này.');
      } catch (e) { if (e.code) return msg.reply('❌ Không cập nhật được role. Kiểm tra Manage Roles, thứ tự role bot và quyền truy cập server rồi thử lại; chưa báo thành công.'); return msg.reply(`❌ ${e.message}\n${usage}`); }
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
      if (db.prepare('SELECT channel_id FROM weather_alert_channels WHERE guild_id=?').get(msg.guild.id)?.channel_id === id) return msg.reply('Kênh bản tin phải khác kênh cảnh báo riêng.');
      db.prepare("INSERT INTO weather_channels(guild_id,channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,last_key=''").run(msg.guild.id, id);
      return msg.reply({ content: `✅ Đặt bản tin tại <#${id}>. Gửi điều kiện hiện tại trong vòng 30 giây, sau đó mỗi chu kỳ thời tiết hoặc đổi ngày/đêm.`, allowedMentions: { parse: [] } });
    }
    if (action === 'rares') {
      const rows = require('../game/weather_rares').RARES;
      return msg.reply(rows.map(r => `${r.name} · \`${r.zone}\` · ${world.WEATHER[r.weather]} / ${r.period === 'day' ? 'ngày' : 'đêm'} · ${(r.chance * 100).toFixed(1)}%`).join('\n') + '\nChỉ roll khi đủ cấp nghề/dụng cụ và thực hiện lượt fish/gather hợp lệ. Ngoài điều kiện = 0%; mỗi lần trúng ×1, không nhân bonus.');
    }
    if (action && action !== 'help') return msg.reply(`Dùng ${p}weather, ${p}weather watch list, ${p}weather rares, ${p}weather channel #kênh/off; admin bot: interval <phút>, time HH:MM/reset, dayhours <giờ đầu> <giờ cuối>.`);
    const s = world.current();
    const db = require('../db/database');
    const channel = msg.guild && db.prepare('SELECT channel_id FROM weather_channels WHERE guild_id=?').get(msg.guild.id);
    return msg.reply({ content: `🌍 ${world.describe(s)}\nThời tiết chung toàn bot, bốc đều ngẫu nhiên mỗi ${s.interval_ms / 60000} phút, có thể lặp. Lần tới <t:${Math.floor(s.next_at / 1000)}:R>.\nNgày ${s.day_start}:00–${s.day_end}:00; ngoài khung là đêm. Đồng hồ: UTC+7${s.clock_offset ? `, lệch admin ${s.clock_offset / 60000} phút` : ' (giờ Việt Nam)'}.\nKênh bản tin server: ${channel ? `<#${channel.channel_id}>` : 'chưa đặt'}.\n${require('../game/weather_rares').availableText(s)}\n${p}weather watch list đăng ký ping thời tiết/buổi; ${p}weather rares xem cây/cá hiếm; ${p}weather help xem cấu hình.`, allowedMentions: { parse: [] } });
  },
};
