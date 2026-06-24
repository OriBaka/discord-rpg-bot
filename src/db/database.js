const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Trên Railway: mount volume tại /data và set env DB_PATH=/data/rpg.db
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

-- Bảng items (thay cho hardcode trong items.js)
CREATE TABLE IF NOT EXISTS items (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,           -- weapon | armor | consumable | material
  tier      TEXT NOT NULL DEFAULT 'common', -- common | rare | epic | legendary
  atk       INTEGER NOT NULL DEFAULT 0,
  def       INTEGER NOT NULL DEFAULT 0,
  heal      INTEGER NOT NULL DEFAULT 0,
  price     INTEGER NOT NULL DEFAULT 0,  -- giá mua trong shop (0 = không bán)
  sell      INTEGER NOT NULL DEFAULT 0,  -- giá bán
  desc      TEXT NOT NULL DEFAULT ''
);

-- Bảng zones (khu vực săn quái)
CREATE TABLE IF NOT EXISTS zones (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  min_level INTEGER NOT NULL DEFAULT 1,
  desc      TEXT NOT NULL DEFAULT ''
);

-- Bảng monsters (thay cho hardcode trong monsters.js)
CREATE TABLE IF NOT EXISTS monsters (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  zone_id   TEXT NOT NULL,
  hp        INTEGER NOT NULL,
  atk       INTEGER NOT NULL,
  def       INTEGER NOT NULL,
  xp        INTEGER NOT NULL,
  gold_min  INTEGER NOT NULL,
  gold_max  INTEGER NOT NULL,
  weight    INTEGER NOT NULL DEFAULT 10,  -- tỉ trọng spawn trong zone (cao = hay gặp)
  FOREIGN KEY (zone_id) REFERENCES zones(id) ON DELETE CASCADE
);

-- Bảng monster_drops
CREATE TABLE IF NOT EXISTS monster_drops (
  monster_id TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  chance     REAL NOT NULL,   -- 0.0 - 1.0
  qty        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (monster_id, item_id),
  FOREIGN KEY (monster_id) REFERENCES monsters(id) ON DELETE CASCADE
);

-- Bảng shop (override price hoặc thêm item bán)
CREATE TABLE IF NOT EXISTS shop (
  item_id   TEXT PRIMARY KEY,
  price     INTEGER NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);
`);

// ===== Seed dữ liệu lần đầu (chỉ chạy khi bảng rỗng) =====
const { seedDefaults } = require('./seed');
seedDefaults(db);

module.exports = db;

// ===== Migrations cho các feature mới (chạy sau khi seed) =====
// Lưu ý: require ở cuối để tránh vòng lặp require
const { migrate: migrateClass } = require('../game/classes');
migrateClass();

const { migrate: migrateSlots } = require('../game/slots');
migrateSlots();

const { migrate: migrateQuests } = require('../game/quests');
migrateQuests();

const { migrate: migrateAchievements } = require('../game/achievements');
migrateAchievements();

const { migrate: migrateChannels } = require('../game/channels');
migrateChannels();

// ===== One-shot rename: VN → EN (chỉ chạy 1 lần) =====
const { renameAll } = require('./rename_items');
renameAll();
