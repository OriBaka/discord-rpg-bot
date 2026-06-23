const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Trên Railway: mount volume tại /data và set env DB_PATH=/data/rpg.db
// Local: mặc định lưu vào ./data/rpg.db
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'rpg.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

console.log(`💾 SQLite DB: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ===== Schema =====
db.exec(`
CREATE TABLE IF NOT EXISTS players (
  user_id    TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  class      TEXT NOT NULL DEFAULT 'Tân Thủ',
  level      INTEGER NOT NULL DEFAULT 1,
  xp         INTEGER NOT NULL DEFAULT 0,
  hp         INTEGER NOT NULL DEFAULT 100,
  max_hp     INTEGER NOT NULL DEFAULT 100,
  atk        INTEGER NOT NULL DEFAULT 10,
  def        INTEGER NOT NULL DEFAULT 5,
  gold       INTEGER NOT NULL DEFAULT 50,
  weapon_id  TEXT,
  armor_id   TEXT,
  last_hunt  INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id  TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  qty      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES players(user_id) ON DELETE CASCADE
);
`);

module.exports = db;
