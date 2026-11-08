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
// Gọi migrate qua helper: nếu module mục tiêu đang nạp dở (circular require —
// vd entry point là src/game/guilds.js: guilds → database → guilds), Node trả về
// module rỗng và `migrate` là undefined → trước đây sẽ crash
// "TypeError: migrateGuilds is not a function". Helper này bỏ qua êm trong trường
// hợp đó; lần require lại sau (khi module đã nạp xong) sẽ chạy bình thường.
function runMigrate(modPath, label) {
  let mod;
  try {
    mod = require(modPath);
  } catch (e) {
    console.error(`[migrate] Không nạp được ${modPath}:`, e.message);
    return;
  }
  // Kiểm tra qua property descriptor trước: module đang trong vòng require chỉ có
  // vài key đã export, đọc thẳng `mod.migrate` sẽ kích hoạt cảnh báo
  // "Accessing non-existent property 'migrate' of module exports inside
  // circular dependency". hasOwnProperty thì không.
  const hasMigrate = Object.prototype.hasOwnProperty.call(mod, 'migrate');
  if (!hasMigrate || typeof mod.migrate !== 'function') {
    // Module đang trong vòng require (vd entry point là src/game/guilds.js:
    // guilds → database → guilds). Không chạy được ngay, nhưng KHÔNG được bỏ
    // luôn — nếu bỏ thì các bảng của module đó không bao giờ được tạo.
    // Đợi module nạp xong rồi chạy lại.
    deferMigrate(modPath, label);
    return;
  }
  mod.migrate();
}

// Đăng ký migrate chạy lại ngay khi module thoát khỏi vòng require.
// Dùng setTimeout(0): chạy sau khi call stack nạp module hiện tại hoàn tất,
// tức lúc module.exports đã có đủ, trước khi bot xử lý message đầu tiên.
function deferMigrate(modPath, label) {
  setTimeout(() => {
    try {
      const m = require(modPath);
      if (typeof m.migrate === 'function') {
        m.migrate();
        console.log(`🔁 ${label}: chạy lại sau khi thoát vòng require`);
      }
    } catch (e) {
      console.error(`[migrate] ${label} chạy lại thất bại:`, e.message);
    }
  }, 0);
}
// Lưu ý: require ở cuối để tránh vòng lặp require
// ===== Cột cơ bản phải có trước khi các feature migrate chạy =====
// Nhiều migrate ở dưới (vd gather_zones.seedDefaults) INSERT vào `items` với các
// cột do feature khác thêm bằng ALTER TABLE. Trước đây thứ tự phụ thuộc vào
// đường nạp module: nếu `slots.migrate()` chưa chạy (vd entry point là
// src/game/slots.js) thì seeder crash "table items has no column named
// accessory_type". Đảm bảo cột tồn tại trước để thứ tự nạp không còn quan trọng.
const BASE_COLUMNS = {
  items: [
    ['accessory_type', "TEXT NOT NULL DEFAULT ''"],
    ['armor_slot',     "TEXT NOT NULL DEFAULT ''"],
    ['armor_type',     "TEXT NOT NULL DEFAULT ''"],
    ['weapon_type',    "TEXT NOT NULL DEFAULT ''"],
    ['class_req',      "TEXT NOT NULL DEFAULT ''"],
    ['soulbound',      'INTEGER NOT NULL DEFAULT 0'],
    ['min_level',      'INTEGER NOT NULL DEFAULT 0'],
  ],
  players: [
    ['primary_class', "TEXT NOT NULL DEFAULT ''"],
    ['class_data',    "TEXT NOT NULL DEFAULT '{}'"],
    ['active_pet',    "TEXT NOT NULL DEFAULT ''"],
    ['last_heal',     'INTEGER NOT NULL DEFAULT 0'],
  ],
  monsters: [
    ['elite_tier', 'INTEGER NOT NULL DEFAULT 0'],
  ],
};

function ensureBaseColumns() {
  for (const [table, cols] of Object.entries(BASE_COLUMNS)) {
    let existing;
    try {
      existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    } catch {
      continue; // bảng chưa tồn tại — migrate riêng của nó sẽ tạo
    }
    for (const [name, def] of cols) {
      if (existing.has(name)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      console.log(`🔧 ensureBaseColumns: ${table}.${name}`);
    }
  }
}
ensureBaseColumns();

runMigrate('../game/classes', 'migrateClass');

runMigrate('../game/slots', 'migrateSlots');

runMigrate('../game/quests', 'migrateQuests');

runMigrate('../game/achievements', 'migrateAchievements');

runMigrate('../game/channels', 'migrateChannels');

runMigrate('../game/pets', 'migratePets');

runMigrate('../game/jobs', 'migrateJobs');

runMigrate('../game/gather_zones', 'migrateGatherZones');

runMigrate('../game/recipes', 'migrateRecipes');

runMigrate('../game/pvp', 'migratePvp');

runMigrate('../game/trade', 'migrateTrade');

runMigrate('../game/guilds', 'migrateGuilds');

// Image support cho items/monsters/zones/pets/achievements (chạy SAU các migrate trên)
runMigrate('../game/images', 'migrateImages');

// Lootbox system
runMigrate('../game/lootbox', 'migrateLootbox');

// Redeem code system
runMigrate('../game/redeem', 'migrateRedeem');

// Settings (cooldown overrides, etc)
runMigrate('../game/settings', 'migrateSettings');

// Level requirement (cột min_level cho items)
runMigrate('../game/level_req', 'migrateLevelReq');

// Turn-based battle system
runMigrate('../game/battle', 'migrateBattle');

// Nội dung mở rộng: zone mới + quái mới + vũ khí/giáp/phụ kiện/tiêu hao mới.
// Chạy SAU level_req để các item mới được giữ đúng min_level khai báo
// (inferMinLevel chỉ backfill khi min_level = 0).
runMigrate('../game/expansive_seed', 'migrateExpansive');

// Cân bằng vũ khí: lấp lỗ hổng tier + đưa ATK 3 class về cùng mốc.
// Phải chạy SAU expansive_seed (dùng các id vũ khí mới của module đó).
runMigrate('../game/weapon_balance', 'migrateWeaponBalance');

// Cân bằng chỉ số quái (45 con, 9 zone) — chạy 1 lần, có guard trong meta.
// Phải chạy SAU expansive_seed vì cần quái của các zone mới đã tồn tại.
runMigrate('../game/balance_seed', 'migrateBalanceSeed');

// ===== One-shot rename: VN → EN (chỉ chạy 1 lần) =====
const { renameAll } = require('./rename_items');
renameAll();
