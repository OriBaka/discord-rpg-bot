// Pet system: collect + active 1 pet at a time. Buff hoặc non-buff.
const db = require('../db/database');

function migrate() {
  db.exec(`
    -- Bảng pets: định nghĩa các loại pet
    CREATE TABLE IF NOT EXISTS pets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      icon        TEXT NOT NULL DEFAULT '🐾',
      tier        TEXT NOT NULL DEFAULT 'common',
      desc        TEXT NOT NULL DEFAULT '',
      -- Buff (có thể tất cả = 0 → non-buff/cosmetic)
      atk_bonus     INTEGER NOT NULL DEFAULT 0,
      def_bonus     INTEGER NOT NULL DEFAULT 0,
      hp_bonus      INTEGER NOT NULL DEFAULT 0,
      gold_bonus_pct INTEGER NOT NULL DEFAULT 0,  -- +X% gold sau combat
      xp_bonus_pct   INTEGER NOT NULL DEFAULT 0,  -- +X% XP sau combat
      drop_bonus_pct INTEGER NOT NULL DEFAULT 0,  -- +X% drop rate
      -- Cách thu thập
      shard_id    TEXT NOT NULL DEFAULT '',   -- item_id của shard (nếu dùng cơ chế ghép)
      shard_qty   INTEGER NOT NULL DEFAULT 0, -- cần bao nhiêu shard để ghép
      created_by  TEXT NOT NULL DEFAULT 'system',
      created_at  INTEGER NOT NULL DEFAULT 0
    );

    -- Bảng player_pets: pet user đã sở hữu
    CREATE TABLE IF NOT EXISTS player_pets (
      user_id   TEXT NOT NULL,
      pet_id    TEXT NOT NULL,
      qty       INTEGER NOT NULL DEFAULT 1,  -- có thể có nhiều con cùng loại
      obtained_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, pet_id)
    );

    -- Bảng pet_shards: shard cho player (riêng inventory để không lẫn item)
    CREATE TABLE IF NOT EXISTS pet_shards (
      user_id  TEXT NOT NULL,
      shard_id TEXT NOT NULL,
      qty      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, shard_id)
    );

    -- Bảng pet_drops: mob nào drop pet/shard gì
    CREATE TABLE IF NOT EXISTS pet_drops (
      monster_id TEXT NOT NULL,
      pet_id     TEXT,                 -- drop pet trực tiếp (null nếu drop shard)
      shard_id   TEXT,                 -- drop shard (null nếu drop pet)
      chance     REAL NOT NULL,
      qty        INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (monster_id, pet_id, shard_id)
    );
  `);

  // Thêm cột active_pet vào players
  const cols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!cols.includes('active_pet')) {
    db.exec(`ALTER TABLE players ADD COLUMN active_pet TEXT NOT NULL DEFAULT ''`);
    console.log('🔧 Migrated players: thêm active_pet');
  }

  // Thêm cột hidden cho pets
  const petCols = db.prepare("PRAGMA table_info(pets)").all().map(c => c.name);
  if (!petCols.includes('hidden')) {
    db.exec(`ALTER TABLE pets ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`);
    console.log('🔧 Migrated pets: thêm hidden');
  }

  // Seed pet mặc định
  seedDefaults();
}

function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) c FROM pets').get().c;
  if (count > 0) return;

  // [id, name, icon, tier, desc, atk, def, hp, gold_pct, xp_pct, drop_pct, shard_id, shard_qty]
  // Quy ước:
  //   - Pet "tự nhiên" (động vật/sinh vật thật) → drop trực tiếp từ động vật cùng loài
  //   - Pet "ghép từ mảnh" → từ quái dạng vật thể (slime, snowman)
  //   - Pet "đặc biệt" (Bunny/Fox/Owl/Unicorn) → reserve, admin tự gán mob hoặc dùng cho event
  const pets = [
    // ============================================================
    // === DIRECT DROP — Động vật & sinh vật (drop từ quái cùng loài)
    // ============================================================
    // COMMON
    ['pet_baby_rat',  'Baby Rat',      '🐭', 'common', 'Cute little rat (+5 HP, +2% gold)',   0,  0, 5,  2, 0, 0, '', 0],

    // RARE
    ['pet_wolf_cub',  'Wolf Cub',      '🐺', 'rare',   'Loyal wolf cub (+10 ATK, +15 HP)',    10, 0, 15, 0, 0, 0, '', 0],
    ['pet_bear_cub',  'Bear Cub',      '🐻', 'rare',   'Sturdy bear cub (+10 DEF, +20 HP)',   0, 10, 20, 0, 0, 0, '', 0],
    ['pet_bat',       'Pet Bat',       '🦇', 'rare',   'Loyal bat (+5% drop rate, +2 ATK)',   2,  0, 0,  0, 0, 5, '', 0],
    ['pet_spider',    'Pet Spider',    '🕷️', 'rare',   'Tiny spider companion (+8 ATK, +3 DEF)',  8,  3, 0,  0, 0, 0, '', 0],
    ['pet_baby_scorpion', 'Baby Scorpion', '🦂', 'rare', 'Small but venomous (+8 ATK, +2 DEF)', 8, 2, 0, 0, 0, 0, '', 0],

    // EPIC
    ['pet_yeti_cub',  'Yeti Cub',      '🦍', 'epic',   'Fluffy yeti (+15 ATK, +10 DEF, +30 HP)',     15, 10, 30, 0, 0, 0, '', 0],

    // LEGENDARY
    ['pet_dragonling',     'Dragonling',      '🐉', 'legendary', 'Baby young dragon (+20 ATK, +15 DEF, +30 HP)', 20, 15, 30, 0, 0, 0, '', 0],
    ['pet_mini_dragon',    'Mini Dragon',     '🐲', 'legendary', 'Tiny ancient dragon (+30 ATK, +20 DEF, +50 HP)', 30, 20, 50, 0, 0, 0, '', 0],
    ['pet_mini_void_dragon', 'Mini Void Dragon', '🌌', 'legendary', 'Tiny void dragon (+10% all, +20 ATK/DEF)',    20, 20, 0, 10, 10, 10, '', 0],

    // ============================================================
    // === SHARD CRAFT — Pet từ quái dạng vật thể (slime, snowman)
    // ============================================================
    // Slime pet — ghép từ slime_shard (drop từ slime)
    ['pet_slime',       'Slime Pet',      '🟢', 'rare', 'A cute jellyball companion (+10 HP, +5% drop)', 0, 3, 10, 0, 0, 5, 'slime_shard', 8],

    // Snowman pet — ghép từ snow_ball (drop từ snowman)
    ['pet_snowman',     'Snowman Pal',    '⛄', 'rare', 'Frosty companion (+8 DEF, +15 HP)',            0, 8, 15, 0, 0, 0, 'snow_ball', 8],

    // ============================================================
    // === SPECIAL/EVENT — Reserve cho event/lootbox
    // ============================================================
    ['pet_void_cat',  'Void Cat',      '🐈‍⬛', 'legendary', '[Event] Cat from the void (+10% all)',     15, 15, 0, 10, 10, 10, '', 0],
  ];

  const insPet = db.prepare(`INSERT INTO pets
    (id, name, icon, tier, desc, atk_bonus, def_bonus, hp_bonus, gold_bonus_pct, xp_bonus_pct, drop_bonus_pct, shard_id, shard_qty, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  for (const p of pets) insPet.run(...p, now);

  // === DROPS ===
  // Quy tắc:
  //   - Mỗi mob chỉ drop tối đa 1 pet HOẶC 1 loại shard (không cùng lúc nhiều loại)
  //   - Động vật/sinh vật/insect → drop PET TRỰC TIẾP (rate thấp)
  //   - Vật thể/cấu trúc (slime, snowman) → drop SHARD để ghép
  //   - Quái hình người/undead (goblin, orc, troll, mummy) → KHÔNG drop pet
  const drops = [
    // ============================================================
    // === DIRECT DROPS — 1 pet baby/mini cho mỗi mob ===
    // ============================================================
    // Forest
    ['giant_rat',    'pet_baby_rat',          null, 0.020, 1],  // baby version
    ['wolf',         'pet_wolf_cub',          null, 0.010, 1],  // cub
    ['forest_bear',  'pet_bear_cub',          null, 0.012, 1],  // cub

    // Cave
    ['bat',          'pet_bat',               null, 0.015, 1],  // chính loài
    ['cave_spider',  'pet_spider',            null, 0.012, 1],  // chính loài

    // Desert
    ['scorpion',     'pet_baby_scorpion',     null, 0.015, 1],  // baby version

    // Mountain
    ['yeti',         'pet_yeti_cub',          null, 0.010, 1],  // cub

    // Dragon Lair — mini/baby dragon
    ['young_dragon', 'pet_dragonling',        null, 0.025, 1],  // baby version
    ['dragon',       'pet_mini_dragon',       null, 0.020, 1],  // mini version
    ['void_dragon',  'pet_mini_void_dragon',  null, 0.030, 1],  // mini version

    // ============================================================
    // === SHARD DROPS — Vật thể (ghép pet) ===
    // ============================================================
    ['slime',        null, 'slime_shard',  0.40, 1],
    ['snowman',      null, 'snow_ball',    0.35, 1],
  ];

  const insDrop = db.prepare('INSERT INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)');
  for (const d of drops) insDrop.run(...d);

  console.log(`🌱 Seeded ${pets.length} pets + ${drops.length} pet/shard drops`);
}

// === Pet CRUD ===
function getPet(id) {
  return db.prepare('SELECT * FROM pets WHERE id = ?').get(id);
}
function getAllPets() {
  return db.prepare('SELECT * FROM pets ORDER BY tier, name').all();
}
function createPet(data) {
  db.prepare(`INSERT INTO pets
    (id, name, icon, tier, desc, atk_bonus, def_bonus, hp_bonus, gold_bonus_pct, xp_bonus_pct, drop_bonus_pct, shard_id, shard_qty, hidden, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      data.id, data.name, data.icon || '🐾', data.tier || 'common', data.desc || '',
      data.atk_bonus || 0, data.def_bonus || 0, data.hp_bonus || 0,
      data.gold_bonus_pct || 0, data.xp_bonus_pct || 0, data.drop_bonus_pct || 0,
      data.shard_id || '', data.shard_qty || 0,
      data.hidden ? 1 : 0,
      data.created_by || 'system', Date.now()
    );
  return getPet(data.id);
}
function deletePet(id) {
  db.prepare('DELETE FROM player_pets WHERE pet_id = ?').run(id);
  db.prepare('DELETE FROM pet_drops WHERE pet_id = ?').run(id);
  return db.prepare('DELETE FROM pets WHERE id = ?').run(id).changes > 0;
}

// === Player pet ownership ===
function getPlayerPets(userId) {
  return db.prepare(`SELECT pp.*, p.* FROM player_pets pp
    JOIN pets p ON p.id = pp.pet_id
    WHERE pp.user_id = ?
    ORDER BY p.tier, p.name`).all(userId);
}

function hasPet(userId, petId) {
  const row = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, petId);
  return row && row.qty > 0;
}

function addPet(userId, petId, qty = 1, context = null) {
  const row = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, petId);
  if (row) {
    db.prepare('UPDATE player_pets SET qty = qty + ? WHERE user_id=? AND pet_id=?')
      .run(qty, userId, petId);
  } else {
    db.prepare('INSERT INTO player_pets (user_id, pet_id, qty, obtained_at) VALUES (?,?,?,?)')
      .run(userId, petId, qty, Date.now());
  }
  // Hook: check achievement
  try {
    const achievements = require('./achievements');
    achievements.checkAndGrant(userId, context);
  } catch {}
}

function removePet(userId, petId, qty = 1) {
  const row = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, petId);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM player_pets WHERE user_id=? AND pet_id=?').run(userId, petId);
  } else {
    db.prepare('UPDATE player_pets SET qty = qty - ? WHERE user_id=? AND pet_id=?')
      .run(qty, userId, petId);
  }
  return true;
}

// === Pet shards ===
function getShard(userId, shardId) {
  const row = db.prepare('SELECT qty FROM pet_shards WHERE user_id=? AND shard_id=?').get(userId, shardId);
  return row?.qty || 0;
}

function getAllShards(userId) {
  return db.prepare('SELECT shard_id, qty FROM pet_shards WHERE user_id=? AND qty > 0').all(userId);
}

function addShard(userId, shardId, qty = 1) {
  const row = db.prepare('SELECT qty FROM pet_shards WHERE user_id=? AND shard_id=?').get(userId, shardId);
  if (row) {
    db.prepare('UPDATE pet_shards SET qty = qty + ? WHERE user_id=? AND shard_id=?')
      .run(qty, userId, shardId);
  } else {
    db.prepare('INSERT INTO pet_shards (user_id, shard_id, qty) VALUES (?,?,?)')
      .run(userId, shardId, qty);
  }
}

function removeShard(userId, shardId, qty) {
  const row = db.prepare('SELECT qty FROM pet_shards WHERE user_id=? AND shard_id=?').get(userId, shardId);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM pet_shards WHERE user_id=? AND shard_id=?').run(userId, shardId);
  } else {
    db.prepare('UPDATE pet_shards SET qty = qty - ? WHERE user_id=? AND shard_id=?')
      .run(qty, userId, shardId);
  }
  return true;
}

// === Combine shards thành pet ===
function combineShards(userId, petId, context = null) {
  const pet = getPet(petId);
  if (!pet) return { ok: false, reason: 'pet_not_found' };
  if (!pet.shard_id || pet.shard_qty <= 0) return { ok: false, reason: 'no_shard_recipe' };
  const have = getShard(userId, pet.shard_id);
  if (have < pet.shard_qty) {
    return { ok: false, reason: 'not_enough_shards', need: pet.shard_qty, have, shard_id: pet.shard_id };
  }
  removeShard(userId, pet.shard_id, pet.shard_qty);
  addPet(userId, petId, 1, context);
  return { ok: true, pet };
}

// === Active pet ===
function getActivePet(userId) {
  const p = db.prepare('SELECT active_pet FROM players WHERE user_id=?').get(userId);
  if (!p?.active_pet) return null;
  return getPet(p.active_pet);
}

function setActivePet(userId, petId) {
  if (petId === null || petId === '') {
    db.prepare('UPDATE players SET active_pet=? WHERE user_id=?').run('', userId);
    return true;
  }
  if (!hasPet(userId, petId)) return false;
  db.prepare('UPDATE players SET active_pet=? WHERE user_id=?').run(petId, userId);
  return true;
}

// === Pet drops (admin) ===
function addPetDrop(monsterId, { pet_id = null, shard_id = null, chance, qty = 1 }) {
  if (!pet_id && !shard_id) throw new Error('Cần pet_id hoặc shard_id');
  db.prepare(`INSERT OR REPLACE INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)`)
    .run(monsterId, pet_id, shard_id, chance, qty);
}

function removePetDrop(monsterId, petId = null, shardId = null) {
  return db.prepare('DELETE FROM pet_drops WHERE monster_id=? AND (pet_id IS ? OR pet_id = ?) AND (shard_id IS ? OR shard_id = ?)')
    .run(monsterId, petId, petId, shardId, shardId).changes > 0;
}

function getPetDrops(monsterId) {
  return db.prepare('SELECT * FROM pet_drops WHERE monster_id = ?').all(monsterId);
}

function getAllPetDrops() {
  return db.prepare(`SELECT pd.*, m.name as mob_name FROM pet_drops pd
    LEFT JOIN monsters m ON m.id = pd.monster_id ORDER BY pd.monster_id`).all();
}

// === Cleanup pet thừa: xóa các pet không có nguồn hợp lệ ===
// "Có nguồn hợp lệ" = có entry trong pet_drops (drop trực tiếp) HOẶC có shard_id (ghép mảnh)
// keepList: nếu truyền vào thì dùng whitelist đó thay vì auto-detect
function cleanupExtraPets(keepList = null) {
  // Lấy tất cả pet hiện có
  const all = db.prepare('SELECT id, shard_id, shard_qty FROM pets').all();

  let toDelete;
  if (keepList) {
    // Chế độ whitelist thủ công
    toDelete = all.filter(p => !keepList.includes(p.id)).map(p => p.id);
  } else {
    // Auto-detect: giữ lại pet có drop entry HOẶC có shard recipe
    const petsWithDrop = new Set(
      db.prepare('SELECT DISTINCT pet_id FROM pet_drops WHERE pet_id IS NOT NULL').all().map(r => r.pet_id)
    );
    toDelete = all
      .filter(p => {
        const hasDirectDrop = petsWithDrop.has(p.id);
        const hasShardRecipe = p.shard_id && p.shard_qty > 0;
        return !hasDirectDrop && !hasShardRecipe;
      })
      .map(p => p.id);
  }

  if (toDelete.length === 0) return { deleted: 0, kept: all.length, deletedIds: [] };

  const delPet = db.prepare('DELETE FROM pets WHERE id = ?');
  const delPlayerPet = db.prepare('DELETE FROM player_pets WHERE pet_id = ?');
  const delDrop = db.prepare('DELETE FROM pet_drops WHERE pet_id = ?');
  // Unset active_pet nếu user đang active pet bị xóa
  const unsetActive = db.prepare("UPDATE players SET active_pet = '' WHERE active_pet = ?");

  for (const id of toDelete) {
    delPlayerPet.run(id);
    delDrop.run(id);
    unsetActive.run(id);
    delPet.run(id);
  }

  return { deleted: toDelete.length, kept: all.length - toDelete.length, deletedIds: toDelete };
}

// === Reset toàn bộ drop table về default seed (admin tool) ===
function resetDropsToDefault() {
  db.prepare('DELETE FROM pet_drops').run();

  // Cùng list với seedDefaults (drops section)
  const drops = [
    // Direct drops — baby/mini cho mỗi mob có pet
    ['giant_rat',    'pet_baby_rat',          null, 0.020, 1],
    ['wolf',         'pet_wolf_cub',          null, 0.010, 1],
    ['forest_bear',  'pet_bear_cub',          null, 0.012, 1],
    ['bat',          'pet_bat',               null, 0.015, 1],
    ['cave_spider',  'pet_spider',            null, 0.012, 1],
    ['scorpion',     'pet_baby_scorpion',     null, 0.015, 1],
    ['yeti',         'pet_yeti_cub',          null, 0.010, 1],
    ['young_dragon', 'pet_dragonling',        null, 0.025, 1],
    ['dragon',       'pet_mini_dragon',       null, 0.020, 1],
    ['void_dragon',  'pet_mini_void_dragon',  null, 0.030, 1],
    // Shard drops
    ['slime',        null, 'slime_shard',  0.40, 1],
    ['snowman',      null, 'snow_ball',    0.35, 1],
  ];

  const ins = db.prepare('INSERT INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)');
  for (const d of drops) ins.run(...d);
  return drops.length;
}

// === Roll pet drops khi giết quái ===
function rollPetDrops(monsterId, dropBonusPct = 0) {
  const drops = getPetDrops(monsterId);
  const result = []; // [{ pet_id?, shard_id?, qty }]
  for (const d of drops) {
    const chance = d.chance * (1 + dropBonusPct / 100);
    if (Math.random() < chance) {
      result.push({ pet_id: d.pet_id, shard_id: d.shard_id, qty: d.qty });
    }
  }
  return result;
}

// === Tổng buff từ active pet ===
function getPetBonus(userId) {
  const pet = getActivePet(userId);
  if (!pet) return { atk: 0, def: 0, hp: 0, gold_pct: 0, xp_pct: 0, drop_pct: 0 };
  return {
    atk: pet.atk_bonus,
    def: pet.def_bonus,
    hp:  pet.hp_bonus,
    gold_pct: pet.gold_bonus_pct,
    xp_pct:   pet.xp_bonus_pct,
    drop_pct: pet.drop_bonus_pct,
  };
}

module.exports = {
  migrate,
  getPet, getAllPets, createPet, deletePet,
  getPlayerPets, hasPet, addPet, removePet,
  getShard, getAllShards, addShard, removeShard,
  combineShards,
  getActivePet, setActivePet,
  addPetDrop, removePetDrop, getPetDrops, getAllPetDrops, rollPetDrops,
  resetDropsToDefault, cleanupExtraPets,
  getPetBonus,
};
