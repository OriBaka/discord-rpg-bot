// Notify channel config (per guild)
const db = require('./../db/database');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notify_channels (
      guild_id   TEXT NOT NULL,
      type       TEXT NOT NULL,        -- quest | achievement | levelup | announce
      channel_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, type)
    )
  `);
}

const VALID_TYPES = ['quest', 'achievement', 'levelup', 'announce'];

function setChannel(guildId, type, channelId) {
  if (!VALID_TYPES.includes(type)) return false;
  db.prepare(`INSERT OR REPLACE INTO notify_channels (guild_id, type, channel_id) VALUES (?,?,?)`)
    .run(guildId, type, channelId);
  return true;
}

function unsetChannel(guildId, type) {
  return db.prepare('DELETE FROM notify_channels WHERE guild_id=? AND type=?')
    .run(guildId, type).changes > 0;
}

function getChannel(guildId, type) {
  const row = db.prepare('SELECT channel_id FROM notify_channels WHERE guild_id=? AND type=?').get(guildId, type);
  return row?.channel_id || null;
}

function listChannels(guildId) {
  return db.prepare('SELECT type, channel_id FROM notify_channels WHERE guild_id=?').all(guildId);
}

// Helper: gửi message đến channel notify (nếu có)
async function notify(client, guildId, type, payload) {
  if (!guildId) return;
  const channelId = getChannel(guildId, type);
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch?.isTextBased()) return;
    await ch.send(payload);
  } catch (err) {
    console.error(`[notify ${type}] Failed:`, err.message);
  }
}

module.exports = {
  VALID_TYPES, migrate,
  setChannel, unsetChannel, getChannel, listChannels,
  notify,
}; 
