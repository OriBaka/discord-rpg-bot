// Hệ thống Class. 3 class cơ bản: melee / magic / ranged.
// Admin có thể disable class (toàn server) hoặc lock/unlock cho từng user.

const db = require('./../db/database');

// === Định nghĩa class cơ bản ===
//
// ---------------------------------------------------------------------------
// BA CLASS KHÁC NHAU Ở CÁCH ĐẠT ĐỘ BỀN, KHÔNG Ở ĐỘ BỀN
//
// Đây là hệ quả trực tiếp của việc bỏ trần sát thương (xem mitigation.js).
// Khi không còn trần, tỉ lệ thắng của một nhân vật phụ thuộc vào tích
//
//     ATK × độ bền thực,   độ bền thực = maxHP / (1 − giảm thương theo DEF)
//
// Hai nhân vật chỉ đấu công bằng khi tích này bằng nhau. Vì vậy:
//
//   • ATK giống nhau ở mọi cấp (base 15, +5/cấp) — khác nhau về sát thương
//     là bảo đảm lệch win-rate, và đo được là lệch rất mạnh (xem CAN_BANG.md).
//   • HP và DEF là hai ẩn của CÙNG một phương trình: class nào nhiều DEF hơn
//     thì bù lại ít HP hơn, và ngược lại.
//
// Kết quả là ba lối chơi khác nhau mà cùng độ bền:
//
//   ⚔️ Chiến Binh  HP thấp  · DEF cao   → "trâu bằng giáp", hưởng 100% giáp
//   🏹 Cung Thủ    HP vừa   · DEF vừa   → hưởng 72% giáp
//   🔮 Pháp Sư     HP cao   · DEF thấp  → "trâu bằng máu", hưởng 50% giáp
//
// Cùng một bộ giáp cho cả ba, nhưng ai mặc cũng khác nhau: đây là chỗ lớp
// giáp (heavy/medium/robe) có ý nghĩa — Chiến Binh mặc nặng hơn nên DEF thô
// của món đồ đi vào người nhiều hơn.
//
// Số đo (tools/tune_balance.js, K=200): độ bền thực 3 class lệch ≤ 11% ở mọi
// cấp 1–45, giáp giảm 10% (Lv.1) → 50% (Lv.45) sát thương nhận vào.
// ---------------------------------------------------------------------------
//
// HAI HỆ SỐ DƯỚI ĐÂY ĐI CẶP VỚI NHAU VÀ VỚI mitigation.js. Sửa một cái là
// phải đo lại bằng tools/tune_balance.js, không được sửa bằng cảm giác.
//
// Vì sao KHÔNG dùng bảng chỉ số phi tuyến: K=100 (bản trước) khiến giáp quá
// mạnh ở nửa sau game (DEF 400 → giảm 80%), buộc HP phải chênh 2.5 lần giữa
// Chiến Binh và Pháp Sư để bù — không biểu diễn được bằng growth tuyến tính
// và phải sinh bảng 45 dòng. Đổi K 100 → 200 giữ được cả hai: giáp 10–50%
// và growth tuyến tính, nên %class đọc được đúng chỉ số thật.
const CLASSES = {
  melee: {
    id: 'melee',
    name: '⚔️ Chiến Binh',
    desc: 'Cận chiến, DEF cao, HP thấp — trâu bằng giáp',
    emoji: '⚔️',
    // DEF 6 + 2/cấp: mỗi cấp +2 DEF tương đương +4.3% độ bền ở Lv.1 nhưng chỉ
    // +1.1% ở Lv.45 (vì giảm thương bão hoà dần) — nên DEF tăng tuyến tính là
    // đúng: nó giữ độ bền tăng đều chứ không vọt.
    // Giáp: hưởng 100% DEF của món đồ.
    base: { hp: 60, atk: 15, def: 6 },
    growth: { hp: 13, atk: 5, def: 2 },
    armor_share: 1.0,
    hp_band_mult: { 1: 1, 5: 1, 8: 1, 10: 1, 12: 1, 15: 1, 20: 1, 25: 1, 30: 1, 35: 1, 40: 1, 45: 1 },
    weapon_types: ['sword', 'axe', 'mace'],
    armor_types:  ['heavy', 'medium', 'light'],
    color: 0xE74C3C,
  },
  magic: {
    id: 'magic',
    name: '🔮 Pháp Sư',
    desc: 'Phép thuật, HP cao, DEF thấp — trâu bằng máu',
    emoji: '🔮',
    // HP cao nhất + DEF thấp nhất. Đây từng là class chết nhiều nhất khi còn
    // trần sát thương (trần làm HP vô nghĩa → ai DEF thấp thì chết trước).
    // Bỏ trần xong, HP mới thật sự có giá trị, và Pháp Sư đứng ngang hai class
    // kia. Vẫn chơi khác: ăn đòn nặng hơn nhưng có nhiều máu để đỡ.
    // Giáp: chỉ hưởng 50% DEF của món đồ (áo vải không che được như giáp sắt).
    base: { hp: 60, atk: 15, def: 4 },
    growth: { hp: 16, atk: 5, def: 2 },
    armor_share: 0.5,
    // Hệ số HP theo bậc giáp — xem giải thích dài dưới đây.
    hp_band_mult: { 1: 1.072, 5: 0.993, 8: 0.974, 10: 0.96, 12: 0.988, 15: 0.975, 20: 0.961, 25: 1.03, 30: 1.043, 35: 1.033, 40: 1.082, 45: 1.102 },
    weapon_types: ['staff', 'wand', 'orb'],
    armor_types:  ['robe', 'light'],
    color: 0x9B59B6,
  },
  ranged: {
    id: 'ranged',
    name: '🏹 Cung Thủ',
    desc: 'Tầm xa, cân bằng giữa HP và DEF',
    emoji: '🏹',
    base: { hp: 58, atk: 15, def: 5 },
    growth: { hp: 15, atk: 5, def: 2 },
    armor_share: 0.72,
    hp_band_mult: { 1: 1.051, 5: 0.995, 8: 0.975, 10: 0.966, 12: 0.982, 15: 0.97, 20: 0.96, 25: 0.993, 30: 0.998, 35: 0.993, 40: 1.016, 45: 1.024 },
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
  // Gắn class_req + weapon_type/armor_type cho các món KHUNG (starter + giáp cũ).
  //
  // CHỈ áp lên món ĐÃ TỒN TẠI và CHƯA có weapon_type. Lý do là lỗi thật:
  // hàm này chạy ở đầu chuỗi migrate (classes.migrate) trong khi phần lớn item
  // được seed ở các module sau. Vì vậy:
  //   • trên DB mới nó không gán được gì (dòng chưa tồn tại);
  //   • trên DB cũ nó gán đúng.
  // Hai DB cho ra hai trò chơi khác nhau — đo được: Lv.1 Chiến Binh thắng 44%
  // trên DB mới và 96% trên DB cũ, chỉ vì wood_sword thiếu weapon_type.
  //
  // Nay gear_ladder gọi lại hàm này SAU khi mọi item đã tồn tại (xem đầu file
  // gear_ladder.js), và điều kiện `weapon_type=''` bảo đảm không ghi đè loại
  // vũ khí mà weapon_balance/expansive_seed đã đặt (vd fish_swordfish dùng
  // 'sword' nhưng KHÔNG phải vũ khí chiến đấu).
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

  const upd = db.prepare(`UPDATE items SET class_req=?, weapon_type=?, armor_type=? WHERE id=?`);
  const updWeaponType = db.prepare(`UPDATE items SET class_req=? WHERE id=? AND weapon_type=''`);
  const setWeaponType = db.prepare(`UPDATE items SET class_req=?, weapon_type=? WHERE id=? AND weapon_type=''`);
  for (const [id, cr, wt, at] of updates) {
    if (wt) {
      // Vũ khí: chỉ gán weapon_type khi còn trống, nhưng LUÔN gán class_req.
      setWeaponType.run(cr, wt, id);
      updWeaponType.run(cr, id);
    } else if (at) {
      // Giáp: chỉ gán armor_type khi còn trống.
      db.prepare(`UPDATE items SET class_req=?, armor_type=? WHERE id=? AND armor_type=''`).run(cr, at, id);
      db.prepare(`UPDATE items SET class_req=? WHERE id=?`).run(cr, id);
    } else {
      upd.run(cr, wt, at, id);
    }
  }
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
  // Dùng statsAtLevel() thay vì cls.base.* để HP ở Lv.1 cũng đi qua hệ số bậc
  // giáp. Nếu không, người chơi bắt đầu lệch 1 HP so với công thức và độ lệch
  // đó theo họ suốt 44 cấp (đã đo: 44/44 lần lên cấp lệch).
  const s1 = statsAtLevel(classId, 1);
  return {
    level: 1,
    xp: 0,
    hp: s1.max_hp,
    max_hp: s1.max_hp,
    atk: s1.atk,
    def: s1.def,
    unlocked_at: Date.now(),
  };
}

// === Hệ số HP theo bậc level ===
//
// Ở mỗi bậc giáp (1 / 12 / 25 / 30 / 40 / 45), ngân sách DEF của giáp nhảy lên
// một mức mới. Ba class hưởng hệ số giáp khác nhau (1.0 / 0.72 / 0.5), nên
// ngay sau mỗi bậc, độ bền thực của họ lệch nhau vài phần trăm — âm thầm.
//
// Đo được trước khi thêm hệ số này (K=200, chỉ số class tuyến tính):
//   Lv.45  Chiến Binh 1801 · Cung Thủ 1766 · Pháp Sư 1638  → lệch 9.9%
//   Lv.40  Chiến Binh 1483 · Cung Thủ 1463 · Pháp Sư 1375  → lệch 7.8%
// Đủ để một class thắng ít hơn 5–8 điểm trong một trò mà mọi thứ khác đã bằng.
//
// Hệ số này bù đúng phần đó: mỗi class có một hệ số cho mỗi bậc, tính ngược từ
// "độ bền thực phải bằng Chiến Binh". Nó vẫn là HP TUYẾN TÍNH trong lòng mỗi
// bậc — chỉ nhảy một lần ở ranh giới bậc, cùng lúc với giáp.
//
// Số liệu sinh bởi tools/tune_balance.js; sau khi áp: lệch ≤ 2.3% ở mọi cấp
// (trừ Lv.1, xem ghi chú trong tune_balance.js).
function hpBandMult(classId, level) {
  const cls = classInfo(classId);
  const table = cls && cls.hp_band_mult;
  if (!table) return 1;
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let band = keys[0];
  for (const k of keys) if (level >= k) band = k;
  return table[band] ?? 1;
}

// Tính chỉ số đầy đủ ở level n.
// `hp` đã nhân hệ số bậc; `hp_unscaled` là đường cong gốc (dùng cho tài liệu).
function statsAtLevel(classId, level) {
  const cls = classInfo(classId);
  if (!cls) return null;
  const hpUnscaled = cls.base.hp + (level - 1) * cls.growth.hp;
  return {
    max_hp: Math.round(hpUnscaled * hpBandMult(classId, level)),
    hp_unscaled: hpUnscaled,
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
  getClassData, saveClassData, initClassFor, statsAtLevel, hpBandMult,
  setPrimaryClass, syncPrimaryClassData,
  unlockClass, lockClass,
  canEquipItem,
  UNLOCK_REQUIREMENTS, checkUnlockRequirements,
  migrate, seedClassItems,
};
