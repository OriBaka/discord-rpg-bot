// Hệ thống Class. 3 class cơ bản: melee / magic / ranged.
// Admin có thể disable class (toàn server) hoặc lock/unlock cho từng user.

const db = require('./../db/database');

// === Định nghĩa class cơ bản ===
const CLASSES = {
  melee: {
    id: 'melee',
    name: '⚔️ Chiến Binh',
    desc: 'Cận chiến, ATK & DEF cao, HP nhiều',
    emoji: '⚔️',
    base: { hp: 120, atk: 12, def: 8 },         // chỉ số gốc lv 1
    growth: { hp: 18, atk: 3, def: 3 },          // mỗi lv tăng
    weapon_types: ['sword', 'axe', 'mace'],      // loại vũ khí dùng được
    armor_types:  ['heavy', 'medium', 'light'],
    color: 0xE74C3C,
  },
  magic: {
    id: 'magic',
    name: '🔮 Pháp Sư',
    desc: 'Phép thuật, ATK rất cao, HP/DEF thấp',
    emoji: '🔮',
    base: { hp: 80, atk: 18, def: 3 },
    growth: { hp: 10, atk: 5, def: 1 },
    weapon_types: ['staff', 'wand', 'orb'],
    armor_types:  ['robe', 'light'],
    color: 0x9B59B6,
  },
  ranged: {
    id: 'ranged',
    name: '🏹 Cung Thủ',
    desc: 'Tầm xa, ATK cao, né tránh tốt',
    emoji: '🏹',
    base: { hp: 100, atk: 15, def: 5 },
    growth: { hp: 14, atk: 4, def: 2 },
    weapon_types: ['bow', 'crossbow', 'gun'],
    armor_types:  ['medium', 'light'],
    color: 0x2ECC71,
  },
};

// === Migrate DB lần đầu ===
function migrate() {
  // Thêm cột vào players (nếu chưa có)
  const cols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!cols.includes('primary_class')) {
    db.exec(`ALTER TABLE players ADD COLUMN primary_class TEXT NOT NULL DEFAULT '';`);
  }
  if (!cols.includes('class_data')) {
    // JSON map: { melee: {level, xp, hp, max_hp, atk, def}, magic: {...} }
    db.exec(`ALTER TABLE players ADD COLUMN class_data TEXT NOT NULL DEFAULT '{}';`);
  }

  // Thêm cột class_req cho items (vũ khí/giáp)
  const itemCols = db.prepare("PRAGMA table_info(items)").all().map(c => c.name);
  if (!itemCols.includes('class_req')) {
    db.exec(`ALTER TABLE items ADD COLUMN class_req TEXT NOT NULL DEFAULT '';`);
    db.exec(`ALTER TABLE items ADD COLUMN weapon_type TEXT NOT NULL DEFAULT '';`);
    db.exec(`ALTER TABLE items ADD COLUMN armor_type TEXT NOT NULL DEFAULT '';`);
    console.log('🔧 Migrated items: thêm class_req, weapon_type, armor_type');
  }

  // Bảng class_settings (admin disable class toàn server)
  db.exec(`CREATE TABLE IF NOT EXISTS class_settings (
    class_id TEXT PRIMARY KEY,
    disabled INTEGER NOT NULL DEFAULT 0,
    reason   TEXT NOT NULL DEFAULT ''
  );`);

  // Seed item class-locked nếu chưa có
  seedClassItems();
}

function seedClassItems() {
  // Update các item legendary/epic hiện có để gắn class
  const updates = [
    // === MELEE: sword/axe/mace, heavy/medium armor ===
    ['wood_sword',    'melee',  'sword', ''],
    ['iron_sword',    'melee',  'sword', ''],
    ['steel_sword',   'melee',  'sword', ''],
    ['dragon_sword',  'melee',  'sword', ''],
    ['void_blade',    'melee',  'sword', ''],
    ['rusty_dagger',  '',       'sword', ''], // dùng chung (item basic)
    ['cloth_armor',   '',       '', 'light'],  // chung
    ['leather_armor', '',       '', 'light'],  // chung
    ['chain_armor',   'melee',  '', 'medium'],
    ['iron_armor',    'melee',  '', 'heavy'],
    ['knight_armor',  'melee',  '', 'heavy'],
    ['dragon_armor',  'melee',  '', 'heavy'],

    // === MAGIC: staff/wand/orb, robe/light armor ===
    ['flame_staff',   'magic',  'staff', ''],
    ['void_robe',     'magic',  '', 'robe'],

    // === RANGED: bow/crossbow, medium/light armor ===
    ['silver_bow',    'ranged', 'bow', ''],
  ];

  const upd = db.prepare('UPDATE items SET class_req=?, weapon_type=?, armor_type=? WHERE id=?');
  for (const [id, cr, wt, at] of updates) upd.run(cr, wt, at, id);
}

// === Helpers ===
function classInfo(id) {
  return CLASSES[id] || null;
}

function getAllClasses() {
  return Object.values(CLASSES);
}

function isClassDisabled(classId) {
  const row = db.prepare('SELECT disabled FROM class_settings WHERE class_id = ?').get(classId);
  return row && row.disabled === 1;
}

function setClassDisabled(classId, disabled, reason = '') {
  db.prepare(`INSERT OR REPLACE INTO class_settings (class_id, disabled, reason) VALUES (?,?,?)`)
    .run(classId, disabled ? 1 : 0, reason);
}

function getDisabledReason(classId) {
  const row = db.prepare('SELECT reason FROM class_settings WHERE class_id = ?').get(classId);
  return row?.reason || '';
}

// Lấy class_data (JSON parsed) của 1 player
function getClassData(player) {
  try { return JSON.parse(player.class_data || '{}'); } catch { return {}; }
}

function saveClassData(userId, data) {
  db.prepare('UPDATE players SET class_data = ? WHERE user_id = ?')
    .run(JSON.stringify(data), userId);
}

// Khởi tạo data cho 1 class mới của player
function initClassFor(classId) {
  const cls = classInfo(classId);
  if (!cls) return null;
  return {
    level: 1,
    xp: 0,
    hp: cls.base.hp,
    max_hp: cls.base.hp,
    atk: cls.base.atk,
    def: cls.base.def,
    unlocked_at: Date.now(),
  };
}

// Tính chỉ số đầy đủ ở level n
function statsAtLevel(classId, level) {
  const cls = classInfo(classId);
  if (!cls) return null;
  return {
    max_hp: cls.base.hp  + (level - 1) * cls.growth.hp,
    atk:    cls.base.atk + (level - 1) * cls.growth.atk,
    def:    cls.base.def + (level - 1) * cls.growth.def,
  };
}

// Set class hiện tại của player (đã unlock)
function setPrimaryClass(userId, classId) {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
  if (!player) return false;
  const data = getClassData(player);
  if (!data[classId]) return false; // chưa unlock

  // Đồng bộ chỉ số hiện tại của player với class này
  const cd = data[classId];
  db.prepare(`UPDATE players SET
    primary_class = ?, level = ?, xp = ?, hp = ?, max_hp = ?, atk = ?, def = ?
    WHERE user_id = ?`)
    .run(classId, cd.level, cd.xp, cd.hp, cd.max_hp, cd.atk, cd.def, userId);
  return true;
}

// Lưu chỉ số class hiện tại (gọi khi đổi class hoặc lên cấp)
function syncPrimaryClassData(userId) {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
  if (!player || !player.primary_class) return;
  const data = getClassData(player);
  data[player.primary_class] = {
    ...(data[player.primary_class] || {}),
    level: player.level, xp: player.xp,
    hp: player.hp, max_hp: player.max_hp,
    atk: player.atk, def: player.def,
  };
  saveClassData(userId, data);
}

// Unlock 1 class cho player (admin hoặc tự unlock qua điều kiện)
function unlockClass(userId, classId) {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
  if (!player) return { ok: false, reason: 'no player' };
  const data = getClassData(player);
  if (data[classId]) return { ok: false, reason: 'already unlocked' };
  data[classId] = initClassFor(classId);
  saveClassData(userId, data);
  return { ok: true };
}

function lockClass(userId, classId) {
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
  if (!player) return false;
  const data = getClassData(player);
  delete data[classId];
  saveClassData(userId, data);
  // Nếu đang dùng class bị lock → unset
  if (player.primary_class === classId) {
    db.prepare('UPDATE players SET primary_class = ? WHERE user_id = ?').run('', userId);
  }
  return true;
}

// Check 1 item có equip được cho class hiện tại không
function canEquipItem(player, item) {
  if (!item.class_req) return { ok: true }; // item chung
  if (!player.primary_class) return { ok: false, reason: 'no_class' };
  if (item.class_req !== player.primary_class) {
    return { ok: false, reason: 'wrong_class', required: item.class_req };
  }
  return { ok: true };
}

// === Điều kiện unlock class mới ===
// Mặc định: cày class chính tới Lv.10 + có 1 'class_token' của class muốn unlock
// Có thể mở rộng sau (quest, item đặc biệt...)
const UNLOCK_REQUIREMENTS = {
  min_primary_level: 10,
  token_item_prefix: 'class_token_', // class_token_melee, class_token_magic, class_token_ranged
};

function checkUnlockRequirements(player, classId) {
  // Đã unlock rồi?
  const data = getClassData(player);
  if (data[classId]) return { ok: false, reason: 'already_unlocked' };

  // Class này bị admin disable?
  if (isClassDisabled(classId)) return { ok: false, reason: 'class_disabled' };

  // Player phải đang có 1 primary class (đã chọn ban đầu)
  if (!player.primary_class) return { ok: false, reason: 'no_primary' };

  // Class chính của player phải đạt lv tối thiểu
  if (player.level < UNLOCK_REQUIREMENTS.min_primary_level) {
    return { ok: false, reason: 'low_level', required: UNLOCK_REQUIREMENTS.min_primary_level };
  }

  // Phải có token của class muốn unlock
  const tokenId = UNLOCK_REQUIREMENTS.token_item_prefix + classId;
  const inv = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(player.user_id, tokenId);
  if (!inv || inv.qty < 1) {
    return { ok: false, reason: 'no_token', token: tokenId };
  }

  return { ok: true, token: tokenId };
}

module.exports = {
  CLASSES, classInfo, getAllClasses,
  isClassDisabled, setClassDisabled, getDisabledReason,
  getClassData, saveClassData, initClassFor, statsAtLevel,
  setPrimaryClass, syncPrimaryClassData,
  unlockClass, lockClass,
  canEquipItem,
  UNLOCK_REQUIREMENTS, checkUnlockRequirements,
  migrate,
}; 
