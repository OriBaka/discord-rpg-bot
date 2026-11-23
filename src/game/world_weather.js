// One persisted world clock/weather for the whole bot, never keyed by guild.
const db = () => require('../db/database');
const WEATHER = Object.freeze({ clear: '☀️ Trời quang', rain: '🌧️ Mưa', storm: '⛈️ Giông', fog: '🌫️ Sương mù', snow: '🌨️ Tuyết' });
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS world_weather (
    id INTEGER PRIMARY KEY CHECK(id=1), weather TEXT NOT NULL, next_at INTEGER NOT NULL,
    interval_ms INTEGER NOT NULL DEFAULT 1800000, clock_offset INTEGER NOT NULL DEFAULT 0,
    day_start INTEGER NOT NULL DEFAULT 6, day_end INTEGER NOT NULL DEFAULT 18, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS weather_channels (guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, last_key TEXT NOT NULL DEFAULT '');`);
}
function snapshot(row, now) {
  const date = new Date(now + 7 * 3600000 + row.clock_offset);
  const hour = date.getUTCHours();
  const period = hour >= row.day_start && hour < row.day_end ? 'day' : 'night';
  return { ...row, hour, minute: date.getUTCMinutes(), period,
    key: `${row.revision}:${period}` };
}
function current(now = Date.now(), rng = Math.random) {
  return db().transaction(() => {
    let row = db().prepare('SELECT * FROM world_weather WHERE id=1').get();
    if (!row || now >= row.next_at) {
      const types = Object.keys(WEATHER), weather = types[Math.floor(rng() * types.length)];
      if (!row) db().prepare('INSERT INTO world_weather(id,weather,next_at) VALUES (1,?,?)').run(weather, now + 1800000);
      else db().prepare('UPDATE world_weather SET weather=?,next_at=?,revision=revision+1 WHERE id=1').run(weather, now + row.interval_ms);
      row = db().prepare('SELECT * FROM world_weather WHERE id=1').get();
    }
    return snapshot(row, now);
  })();
}
function configure(kind, args, now = Date.now()) {
  current(now);
  if (kind === 'interval') {
    const minutes = Number(args[0]);
    if (!/^\d+$/.test(args[0] || '') || minutes < 1 || minutes > 1440) return 'Chu kỳ phải là số phút nguyên từ 1 đến 1440.';
    db().prepare('UPDATE world_weather SET interval_ms=?,next_at=?,revision=revision+1 WHERE id=1').run(minutes * 60000, now + minutes * 60000);
  } else if (kind === 'time') {
    let offset = 0;
    if (args[0] !== 'reset') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args[0] || '')) return 'Dùng time HH:MM hoặc time reset (giờ Việt Nam).';
      const [h, m] = args[0].split(':').map(Number), vn = new Date(now + 7 * 3600000);
      offset = (h * 60 + m - vn.getUTCHours() * 60 - vn.getUTCMinutes()) * 60000;
    }
    db().prepare('UPDATE world_weather SET clock_offset=?,revision=revision+1 WHERE id=1').run(offset);
  } else if (kind === 'dayhours') {
    const [start, end] = args.map(Number);
    if (args.length !== 2 || !args.every(a => /^\d+$/.test(a)) || !(start >= 0 && start < end && end <= 24)) return 'Dùng dayhours <bắt đầu 0–23> <kết thúc 1–24>; bắt đầu phải nhỏ hơn kết thúc.';
    db().prepare('UPDATE world_weather SET day_start=?,day_end=?,revision=revision+1 WHERE id=1').run(start, end);
  } else return 'Cấu hình không hợp lệ.';
  return null;
}
function describe(s) {
  return `${WEATHER[s.weather]} • ${s.period === 'day' ? '🌞 Ban ngày' : '🌙 Ban đêm'} • ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} giờ thế giới`;
}
let timer, pending, busy = false;
async function tick(client) {
  if (busy) return;
  busy = true;
  try {
    const state = current();
    for (const sub of db().prepare('SELECT * FROM weather_channels WHERE last_key<>?').all(state.key)) {
      try {
        const channel = await client.channels.fetch(sub.channel_id);
        if (!channel || channel.guildId !== sub.guild_id || !channel.isTextBased() || typeof channel.send !== 'function') continue;
        await channel.send({ content: `🌍 Bản tin thế giới\n${describe(state)}\nBốc thời tiết tiếp: <t:${Math.floor(state.next_at / 1000)}:R> (có thể trùng).\n${require('./weather_rares').availableText(state)}`, allowedMentions: { parse: [] } });
        db().prepare('UPDATE weather_channels SET last_key=? WHERE guild_id=? AND channel_id=?').run(state.key, sub.guild_id, sub.channel_id);
      } catch (err) { console.error('[weather notification]', sub.guild_id, err.message); }
    }
  } finally { busy = false; }
}
function start(client) {
  if (timer) return;
  const poll = () => {
    if (busy) return;
    pending = tick(client).catch(err => console.error('[weather]', err.message));
  };
  poll(); timer = setInterval(poll, 30000); timer.unref();
}
async function stop() { if (timer) clearInterval(timer); timer = null; await pending; }
module.exports = { WEATHER, migrate, current, configure, describe, tick, start, stop };
