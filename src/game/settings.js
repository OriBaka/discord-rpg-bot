// Admin-configurable settings (cooldown overrides, etc)
// Key format: cd_<action>, cd_mining_<zone_id>, cd_fishing_<zone_id>, etc
function getDb() { return require('./../db/database'); }

function migrate() {
  const db = getDb();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      updated_by TEXT DEFAULT ''
    )
  `).run();
  console.log('⚙️ Settings system: migrated');
}

// === Core ===
function get(key, fallback = null) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : fallback;
}

function getInt(key, fallback = null) {
  const v = get(key, null);
  if (v === null) return fallback;
  const n = parseInt(v);
  return isNaN(n) ? fallback : n;
}

function set(key, value, by = '') {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value, updated_by) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%s','now'), updated_by=excluded.updated_by
  `).run(key, String(value), by);
}

function remove(key) {
  const db = getDb();
  const info = db.prepare('DELETE FROM settings WHERE key=?').run(key);
  return info.changes > 0;
}

function all() {
  const db = getDb();
  return db.prepare('SELECT * FROM settings ORDER BY key').all();
}

function clearAllCooldowns() {
  const db = getDb();
  const info = db.prepare("DELETE FROM settings WHERE key LIKE 'cd\\_%' ESCAPE '\\'").run();
  return info.changes;
}

// === Cooldown resolver ===
// Return override (ms) or null
function getCdOverride(action, zoneId = null) {
  const key = zoneId ? `cd_${action}_${zoneId}` : `cd_${action}`;
  return getInt(key, null);
}

module.exports = {
  migrate,
  get, getInt, set, remove, all,
  getCdOverride, clearAllCooldowns,
};
 
