// Pet system: collect + active 1 pet at a time. Buff hoặc non-buff.
//
// ── KHÍ HẬU (habitat) ────────────────────────────────────────────────────────
// Mỗi pet có `habitat` = zone_id nơi nó SỐNG. Luật:
//   • Pet chỉ rơi từ quái trong đúng zone khí hậu của nó (`rollPetDrops` lọc).
//   • Tiến hoá chỉ hợp lệ khi pet đích sống cùng khí hậu với pet gốc — không
//     có chuyện cá băng tiến hoá thành rồng lửa.
//   • `%pet collection` nhóm theo khí hậu thay vì theo nguồn, vì "nó sống ở đâu"
//     là thứ người chơi dùng để quyết định đi săn ở đâu.
// Trước đây drop table chỉ là (mob → pet) nên không có gì chặn việc gán một
// con pet tuyết vào mob núi lửa — dữ liệu vẫn "chạy" nhưng thế giới vô nghĩa.
//
// ── TIẾN HOÁ (evolve) ────────────────────────────────────────────────────────
// Bảng `pet_evolutions` cho phép admin tự tạo công thức: pet gốc + mảnh + vàng
// + cấp nhân vật → pet đích. Pet gốc bị TIÊU HAO (đây là "ghép lên", không phải
// mở khoá vĩnh viễn). Mọi bước đi qua transaction nên không thể mất pet/mảnh.
const db = require('../db/database');

// Khí hậu = zone. Nhãn chỉ dùng khi bảng `zones` chưa có dòng tương ứng.
const HABITATS = {
  forest:       { emoji: '🌲', label: 'Rừng Wildwood' },
  cave:         { emoji: '🕳️', label: 'Hang Động' },
  desert:       { emoji: '🏜️', label: 'Sa Mạc' },
  mountain:     { emoji: '⛰️', label: 'Núi Tuyết' },
  swamp:        { emoji: '🌫️', label: 'Đầm Lầy' },
  volcano:      { emoji: '🌋', label: 'Ember Peak' },
  frozen_abyss: { emoji: '🧊', label: 'Frozen Abyss' },
  astral_ruins: { emoji: '✨', label: 'Astral Ruins' },
  dragon_lair:  { emoji: '🐲', label: 'Dragon Lair' },
};

// Tên hiển thị của mảnh — id vẫn giữ nguyên (dữ liệu cũ dùng id thô).
const SHARD_NAMES = {
  slime_shard: 'Mảnh Slime',
  snow_ball: 'Cục Tuyết',
  shard_leaf: 'Mảnh Lá Rừng',
  shard_gloom: 'Mảnh Bóng Hang',
  shard_sun: 'Mảnh Nắng Cháy',
  shard_peak: 'Mảnh Đá Đỉnh Núi',
  shard_mire: 'Mảnh Bùn Đầm',
  shard_ember: 'Mảnh Than Hồng',
  shard_frost: 'Mảnh Băng Vĩnh Cửu',
  shard_star: 'Mảnh Sao Tàn',
  shard_scale: 'Mảnh Vảy Rồng',
};
function shardName(shardId) {
  return SHARD_NAMES[shardId] || shardId;
}

function habitatInfo(habitat) {
  const meta = HABITATS[habitat];
  if (!meta) return { id: habitat, emoji: '❔', label: habitat || 'Không rõ', zone_name: null };
  let zone = null;
  try { zone = db.prepare('SELECT name FROM zones WHERE id=?').get(habitat); } catch { /* chưa có bảng */ }
  // Tên zone trong DB có sẵn emoji ("🌲 Wildwood Forest") — bỏ đi để UI không
  // hiện "🌲 🌲 Wildwood Forest".
  const plain = zone?.name ? zone.name.replace(/^[^\p{L}\p{N}]+/u, '').trim() : null;
  return { id: habitat, emoji: meta.emoji, label: plain || meta.label, zone_name: zone?.name || null };
}

// ===== Seed data =====
// [id, name, icon, tier, desc, atk, def, hp, gold%, xp%, drop%, shard_id, shard_qty, habitat]
const SEED_PETS = [
  // ── Rừng ──────────────────────────────────────────────────────────────────
  ['pet_baby_rat',  'Baby Rat',      '🐭', 'common', 'Con chuột nhặt từ cống thị trấn. Nó chẳng giúp được gì nhiều, nhưng là con vật đầu tiên không bỏ chạy khi bạn quay lại.', 0, 0, 5, 2, 0, 0, '', 0, 'forest'],
  ['pet_wolf_cub',  'Wolf Cub',      '🐺', 'rare',   'Sói con mất bầy, đi theo bạn vì bạn là thứ duy nhất còn đứng về phía nó.', 10, 0, 15, 0, 0, 0, '', 0, 'forest'],
  ['pet_bear_cub',  'Bear Cub',      '🐻', 'rare',   'Gấu con bị bỏ lại sau một trận săn. Nó lớn nhanh hơn bạn tưởng, và vẫn coi bạn là con đầu đàn.', 0, 10, 20, 0, 0, 0, '', 0, 'forest'],
  ['pet_slime',     'Slime Pet',     '🟢', 'rare',   'Khối nhầy ghép lại từ những mảnh slime, giờ đã đủ để giữ hình. Nó theo bạn vì bạn là thứ ấm nhất quanh nó.', 0, 3, 10, 0, 0, 5, 'slime_shard', 8, 'forest'],
  // ── Hang ──────────────────────────────────────────────────────────────────
  ['pet_bat',       'Pet Bat',       '🦇', 'rare',   'Con dơi rơi khỏi trần hang khi còn quá nhỏ để bay. Giờ nó bay trước mặt bạn và thấy những thứ bạn chưa kịp thấy.', 2, 0, 0, 0, 0, 5, '', 0, 'cave'],
  ['pet_spider',    'Pet Spider',    '🕷️', 'rare',   'Nhện hang thuần hoá từ trứng, không có nọc. Nó giăng tơ quanh chỗ bạn ngủ — dấu hiệu nó coi đó là tổ.', 8, 3, 0, 0, 0, 0, '', 0, 'cave'],
  // ── Sa mạc ────────────────────────────────────────────────────────────────
  ['pet_baby_scorpion', 'Baby Scorpion', '🦂', 'rare', 'Bọ cạp con, nọc chưa đủ để giết người. Nó ngồi trên vai bạn và không bao giờ rời đi.', 8, 2, 0, 0, 0, 0, '', 0, 'desert'],
  // ── Núi ───────────────────────────────────────────────────────────────────
  ['pet_yeti_cub',  'Yeti Cub',      '🦍', 'epic',   'Yeti con lạc khỏi đàn trên Snow Mountain. Bộ lông nó ấm tới mức ngủ cạnh nó thì không cần lửa.', 15, 10, 30, 0, 0, 0, '', 0, 'mountain'],
  ['pet_snowman',   'Snowman Pal',   '⛄', 'rare',   'Người tuyết do một đứa trẻ trong làng dựng, giờ đi theo bạn. Nó không tan, vì bạn không để nó ở lại chỗ cũ.', 0, 8, 15, 0, 0, 0, 'snow_ball', 8, 'mountain'],
  // ── Đầm lầy ───────────────────────────────────────────────────────────────
  ['pet_bog_toad',  'Bog Toad',      '🐸', 'rare',   'Cóc đầm lầy da sần như vỏ cây mục. Nó nuốt đá cuội để tiêu hoá, nên bụng nó nặng tới mức phải bò chứ không nhảy.', 0, 6, 12, 0, 0, 3, '', 0, 'swamp'],
  // ── Núi lửa ───────────────────────────────────────────────────────────────
  ['pet_ember_pup', 'Ember Pup',     '🔥', 'rare',   'Chó con sinh ra trong tro nóng, lông nó luôn có mùi khét. Nó ngủ trên than và không hiểu vì sao bạn thấy lạ.', 10, 0, 0, 5, 0, 0, '', 0, 'volcano'],
  // ── Băng ──────────────────────────────────────────────────────────────────
  ['pet_frost_fox', 'Frost Fox',     '🦊', 'epic',   'Cáo băng chỉ hiện ra khi hơi thở của bạn đông lại thành tinh thể. Nó không để lại dấu chân, chỉ để lại sương.', 12, 8, 0, 0, 0, 0, '', 0, 'frozen_abyss'],
  // ── Astral ────────────────────────────────────────────────────────────────
  ['pet_star_moth', 'Star Moth',     '🦋', 'epic',   'Bướm đêm làm tổ trong bụi sao đã tắt. Cánh nó phát sáng bằng ánh sáng của ngôi sao đã chết từ lâu.', 6, 0, 0, 0, 6, 6, '', 0, 'astral_ruins'],
  ['pet_void_cat',  'Void Cat',      '🐈‍⬛', 'legendary', '[Event] Con mèo bước ra từ chỗ không có cửa. Không ai gọi nó tới, và nó cũng không giải thích.', 15, 15, 0, 10, 10, 10, '', 0, 'astral_ruins'],
  // ── Dragon Lair ───────────────────────────────────────────────────────────
  ['pet_dragonling',     'Dragonling',      '🐉', 'legendary', 'Rồng con nở từ một quả trứng trong Dragon\'s Lair. Nó chưa biết mình là giống gì, và có lẽ đó là điều tốt.', 20, 15, 30, 0, 0, 0, '', 0, 'dragon_lair'],
  ['pet_mini_dragon',    'Mini Dragon',     '🐲', 'legendary', 'Một Ancient Dragon thu nhỏ, không rõ vì sao. Nó nhớ những thứ nó chưa từng sống qua.', 30, 20, 50, 0, 0, 0, '', 0, 'dragon_lair'],
  ['pet_mini_void_dragon', 'Mini Void Dragon', '🌌', 'legendary', 'Rồng nhỏ đã chui qua vết thương hư không rồi thu lại kích thước. Nó không phản chiếu ánh sáng, chỉ phản chiếu bạn.', 20, 20, 0, 10, 10, 10, '', 0, 'dragon_lair'],

  // ===== DẠNG TIẾN HOÁ (chỉ lấy được bằng %pet evolve) =====
  ['pet_dire_wolf',     'Dire Wolf',       '🐺', 'epic',      'Sói con đã lớn qua mùa đói nhất của rừng. Nó không còn đi theo bạn nữa — nó đi trước và dọn đường.', 18, 0, 25, 0, 0, 0, '', 0, 'forest'],
  ['pet_war_bear',      'War Bear',        '🐻', 'epic',      'Gấu con giờ nặng gấp ba bạn. Bộ lông nó dày tới mức mũi tên cắm vào rồi gãy, không xuyên qua.', 0, 16, 35, 0, 0, 0, '', 0, 'forest'],
  ['pet_slime_king',    'Slime King',      '🟩', 'epic',      'Khối nhầy đã tự gắn một chiếc vương miện rỉ sét lên đầu. Không ai trao nó, nó chỉ nhặt được và quyết định mình là vua.', 0, 5, 25, 0, 0, 8, '', 0, 'forest'],
  ['pet_vampire_bat',   'Vampire Bat',     '🦇', 'epic',      'Con dơi đã học cách hút máu quái vật thay vì trái cây. Nó vẫn ngủ trên vai bạn, nhưng giờ bạn cảm thấy răng nó.', 6, 0, 0, 0, 0, 8, '', 0, 'cave'],
  ['pet_web_matriarch', 'Web Matriarch',   '🕸️', 'epic',      'Nhện đã đủ lớn để giăng tơ chặn cả một hành lang hang. Ruồi không dám vào, và quái vật cũng bắt đầu né.', 14, 6, 0, 0, 0, 0, '', 0, 'cave'],
  ['pet_scorpion_king', 'Scorpion King',   '🦂', 'epic',      'Bọ cạp đã lột xác tới lần cuối, nọc giờ đủ làm tê liệt một con quái trưởng thành trong ba nhịp thở.', 16, 6, 0, 0, 0, 0, '', 0, 'desert'],
  ['pet_yeti_elder',    'Yeti Elder',      '🦍', 'legendary', 'Yeti đã sống qua mùa đông của ba thế hệ. Nó không gầm nữa, chỉ đứng đó và tuyết tự tránh chỗ nó đứng.', 22, 16, 45, 0, 0, 0, '', 0, 'mountain'],
  ['pet_mire_tyrant',   'Mire King',       '🐊', 'epic',      'Cóc đầm lầy đã nuốt đủ đá để thành thứ khác. Bùn dưới chân nó đặc lại, và cá trong đầm bơi ngược chiều nó.', 12, 10, 20, 0, 0, 0, '', 0, 'swamp'],
  ['pet_ember_hound',   'Ember Hound',     '🔥', 'legendary', 'Chó tro đã cháy lần thứ hai và không tắt nữa. Dấu chân nó để lại trên đá là những vết nứt còn đỏ.', 20, 10, 0, 4, 0, 0, '', 0, 'volcano'],
  ['pet_frost_warden',  'Frost Warden',    '🧊', 'legendary', 'Cáo băng đã đứng đủ lâu ở rìa khe nứt để hơi lạnh của nó thành một lớp giáp không tan.', 0, 10, 40, 6, 0, 0, '', 0, 'frozen_abyss'],
  ['pet_astral_panther','Astral Panther',  '🐆', 'legendary', 'Bướm sao đã lột cánh và mọc lại thành bốn chân. Nó không còn ăn ánh sáng — nó đi theo bạn để tìm ánh sáng mới.', 20, 20, 0, 0, 8, 0, '', 0, 'astral_ruins'],
];

// [monster_id, pet_id|null, shard_id|null, chance, qty]
// Luật: mỗi mob tối đa 1 pet HOẶC 1 shard (không cùng lúc), và pet rơi phải
// đúng khí hậu của zone mà mob đó sống.
const SEED_DROPS = [
  // ── Direct drops ──
  ['giant_rat',    'pet_baby_rat',          null, 0.020, 1],
  ['wolf',         'pet_wolf_cub',          null, 0.010, 1],
  ['forest_bear',  'pet_bear_cub',          null, 0.012, 1],
  ['bat',          'pet_bat',               null, 0.015, 1],
  ['cave_spider',  'pet_spider',            null, 0.012, 1],
  ['scorpion',     'pet_baby_scorpion',     null, 0.015, 1],
  ['yeti',         'pet_yeti_cub',          null, 0.010, 1],
  ['bog_toad',     'pet_bog_toad',          null, 0.015, 1],
  ['magma_hound',  'pet_ember_pup',         null, 0.015, 1],
  ['frost_revenant','pet_frost_fox',        null, 0.012, 1],
  ['astral_sentinel','pet_star_moth',       null, 0.012, 1],
  ['young_dragon', 'pet_dragonling',        null, 0.025, 1],
  ['dragon',       'pet_mini_dragon',       null, 0.020, 1],
  ['void_dragon',  'pet_mini_void_dragon',  null, 0.030, 1],
  // ── Shard drops (ghép pet + tiến hoá) ──
  ['slime',        null, 'slime_shard',     0.40, 1],
  ['snowman',      null, 'snow_ball',       0.35, 1],
  ['forest_wisp',  null, 'shard_leaf',      0.18, 1],
  ['moss_golem',   null, 'shard_leaf',      0.18, 1],
  ['cave_golem',   null, 'shard_gloom',     0.18, 1],
  ['blind_stalker',null, 'shard_gloom',     0.15, 1],
  ['dust_raider',  null, 'shard_sun',       0.18, 1],
  ['sand_worm',    null, 'shard_sun',       0.15, 1],
  ['troll',        null, 'shard_peak',      0.18, 1],
  ['stone_berserker', null, 'shard_peak',   0.15, 1],
  ['leech_swarm',  null, 'shard_mire',      0.18, 1],
  ['swamp_lurker', null, 'shard_mire',      0.15, 1],
  ['char_giant',   null, 'shard_ember',     0.18, 1],
  ['obsidian_golem', null, 'shard_ember',   0.15, 1],
  ['glacier_wyrm', null, 'shard_frost',     0.18, 1],
  ['abyss_leviathan', null, 'shard_frost',  0.15, 1],
  ['star_devourer',null, 'shard_star',      0.15, 1],
  ['void_harbinger', null, 'shard_star',    0.15, 1],
  ['drake_whelp',  null, 'shard_scale',     0.18, 1],
  ['lair_guardian',null, 'shard_scale',     0.15, 1],
];

// [from, to, shard_id, shard_qty, gold_cost, min_level]
const SEED_EVOLUTIONS = [
  ['pet_wolf_cub',       'pet_dire_wolf',       'shard_leaf',  6, 200, 10],
  ['pet_bear_cub',       'pet_war_bear',        'shard_leaf',  6, 200, 10],
  ['pet_slime',          'pet_slime_king',      'shard_leaf',  8, 250, 14],
  ['pet_bat',            'pet_vampire_bat',     'shard_gloom', 6, 220, 12],
  ['pet_spider',         'pet_web_matriarch',   'shard_gloom', 6, 220, 12],
  ['pet_baby_scorpion',  'pet_scorpion_king',   'shard_sun',   6, 240, 14],
  ['pet_bog_toad',       'pet_mire_tyrant',     'shard_mire',  6, 260, 16],
  ['pet_ember_pup',      'pet_ember_hound',     'shard_ember', 6, 280, 18],
  ['pet_frost_fox',      'pet_frost_warden',    'shard_frost', 6, 320, 20],
  ['pet_yeti_cub',       'pet_yeti_elder',      'shard_peak',  8, 400, 22],
  ['pet_star_moth',      'pet_astral_panther',  'shard_star',  8, 600, 30],
  ['pet_dragonling',     'pet_mini_dragon',     'shard_scale', 10, 500, 25],
  ['pet_mini_dragon',    'pet_mini_void_dragon','shard_star',  12, 800, 35],
];

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

    -- Bảng pet_evolutions: công thức tiến hoá (admin tạo được)
    CREATE TABLE IF NOT EXISTS pet_evolutions (
      from_pet_id TEXT NOT NULL,
      to_pet_id   TEXT NOT NULL,
      shard_id    TEXT NOT NULL,
      shard_qty   INTEGER NOT NULL DEFAULT 1,
      gold_cost   INTEGER NOT NULL DEFAULT 0,
      min_level   INTEGER NOT NULL DEFAULT 1,
      created_by  TEXT NOT NULL DEFAULT 'system',
      created_at  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (from_pet_id, to_pet_id)
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
  // Thêm cột habitat (khí hậu) cho pets
  if (!petCols.includes('habitat')) {
    db.exec(`ALTER TABLE pets ADD COLUMN habitat TEXT NOT NULL DEFAULT ''`);
    console.log('🔧 Migrated pets: thêm habitat (khí hậu)');
  }

  // pet_drops có PK (monster_id, pet_id, shard_id) mà 2/3 cột là NULL được →
  // SQLite coi mỗi NULL là khác nhau, nên PK KHÔNG chặn được trùng. Hệ quả thật:
  // `%pet admin drop` cùng một mob 2 lần tạo 2 dòng, tỉ lệ rơi thành gấp đôi mà
  // không ai thấy. Dọn dòng trùng rồi tạo unique index theo COALESCE.
  db.exec(`
    DELETE FROM pet_drops
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM pet_drops
      GROUP BY monster_id, COALESCE(pet_id, ''), COALESCE(shard_id, '')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS pet_drops_unique
      ON pet_drops (monster_id, COALESCE(pet_id, ''), COALESCE(shard_id, ''));
  `);

  // Seed pet mặc định (chỉ khi bảng rỗng — server cũ đã có dữ liệu thì bỏ qua)
  seedDefaults();

  // Bổ sung/khí hậu hoá dữ liệu — chạy MỌI LẦN, idempotent. Server cũ chỉ có 13
  // pet nên phần này là thứ mang nội dung mới tới DB đang chạy.
  seedClimateAndEvolutions();
}

function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) c FROM pets').get().c;
  if (count > 0) return;
  insertPets(SEED_PETS);
  insertDrops(SEED_DROPS);
  insertEvolutions(SEED_EVOLUTIONS);
  console.log(`🌱 Seeded ${SEED_PETS.length} pets + ${SEED_DROPS.length} drop + ${SEED_EVOLUTIONS.length} công thức tiến hoá`);
}

function insertPets(list) {
  const ins = db.prepare(`INSERT OR IGNORE INTO pets
    (id, name, icon, tier, desc, atk_bonus, def_bonus, hp_bonus, gold_bonus_pct, xp_bonus_pct, drop_bonus_pct, shard_id, shard_qty, habitat, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  for (const p of list) ins.run(...p, now);
}

function insertDrops(list) {
  const ins = db.prepare('INSERT OR IGNORE INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)');
  for (const d of list) ins.run(...d);
}

function insertEvolutions(list) {
  const ins = db.prepare(`INSERT OR IGNORE INTO pet_evolutions
    (from_pet_id, to_pet_id, shard_id, shard_qty, gold_cost, min_level, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  const now = Date.now();
  for (const e of list) ins.run(...e, 'system', now);
}

// Gán khí hậu cho pet cũ + thêm pet/drop/recipe mới. Idempotent:
//   • UPDATE habitat chỉ điền chỗ trống (không đè admin đã sửa).
//   • Phần thêm pet/drop/recipe chạy MỘT LẦN (đánh dấu trong meta) để admin
//     xoá bớt nội dung không bị seed lại sau mỗi lần restart.
const CLIMATE_META_KEY = 'pets_climate_evo_v1';

function seedClimateAndEvolutions() {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

  const updHab = db.prepare("UPDATE pets SET habitat=? WHERE id=? AND (habitat IS NULL OR habitat='')");
  let habN = 0;
  for (const p of SEED_PETS) habN += updHab.run(p[13], p[0]).changes;
  if (habN > 0) console.log(`🌦️  Khí hậu: gán cho ${habN} pet`);

  if (db.prepare('SELECT 1 FROM meta WHERE key=?').get(CLIMATE_META_KEY)) return;

  const before = db.prepare('SELECT COUNT(*) c FROM pets').get().c;
  insertPets(SEED_PETS);
  insertDrops(SEED_DROPS);
  insertEvolutions(SEED_EVOLUTIONS);
  // Void Cat là pet event: ẩn khỏi danh sách cho tới khi ai đó thật sự có nó.
  db.prepare("UPDATE pets SET hidden=1 WHERE id='pet_void_cat'").run();
  const added = db.prepare('SELECT COUNT(*) c FROM pets').get().c - before;
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(CLIMATE_META_KEY, String(Date.now()));
  if (added > 0) {
    console.log(`🌦️  Khí hậu + tiến hoá: +${added} pet, ${SEED_EVOLUTIONS.length} công thức tiến hoá`);
  }
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
    (id, name, icon, tier, desc, atk_bonus, def_bonus, hp_bonus, gold_bonus_pct, xp_bonus_pct, drop_bonus_pct, shard_id, shard_qty, habitat, hidden, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      data.id, data.name, data.icon || '🐾', data.tier || 'common', data.desc || '',
      data.atk_bonus || 0, data.def_bonus || 0, data.hp_bonus || 0,
      data.gold_bonus_pct || 0, data.xp_bonus_pct || 0, data.drop_bonus_pct || 0,
      data.shard_id || '', data.shard_qty || 0,
      data.habitat || '',
      data.hidden ? 1 : 0,
      data.created_by || 'system', Date.now()
    );
  return getPet(data.id);
}
function setHabitat(petId, habitat) {
  if (habitat && !HABITATS[habitat]) return { ok: false, reason: 'unknown_habitat' };
  const res = db.prepare('UPDATE pets SET habitat=? WHERE id=?').run(habitat || '', petId);
  return res.changes > 0 ? { ok: true, pet: getPet(petId) } : { ok: false, reason: 'pet_not_found' };
}

// Xoá pet: dọn mọi thứ trỏ tới nó. Trước đây bỏ sót `players.active_pet` →
// người chơi vẫn giữ buff của con pet đã bị xoá khỏi DB.
function deletePet(id) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE players SET active_pet='' WHERE active_pet = ?").run(id);
    db.prepare('DELETE FROM player_pets WHERE pet_id = ?').run(id);
    db.prepare('DELETE FROM pet_drops WHERE pet_id = ?').run(id);
    db.prepare('DELETE FROM pet_evolutions WHERE from_pet_id = ? OR to_pet_id = ?').run(id, id);
    return db.prepare('DELETE FROM pets WHERE id = ?').run(id).changes > 0;
  });
  return tx();
}

// === Player pet ownership ===
function getPlayerPets(userId) {
  return db.prepare(`SELECT pp.qty, pp.obtained_at, p.* FROM player_pets pp
    JOIN pets p ON p.id = pp.pet_id
    WHERE pp.user_id = ?
    ORDER BY p.tier, p.name`).all(userId);
}

function hasPet(userId, petId) {
  const row = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, petId);
  return row && row.qty > 0;
}

// Ghi pet vào túi, KHÔNG chạy hook thành tựu (dùng được trong transaction).
function bumpPet(userId, petId, qty = 1) {
  const row = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, petId);
  if (row) {
    db.prepare('UPDATE player_pets SET qty = qty + ? WHERE user_id=? AND pet_id=?')
      .run(qty, userId, petId);
  } else {
    db.prepare('INSERT INTO player_pets (user_id, pet_id, qty, obtained_at) VALUES (?,?,?,?)')
      .run(userId, petId, qty, Date.now());
  }
}

function addPet(userId, petId, qty = 1, context = null) {
  bumpPet(userId, petId, qty);
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
  // Transaction: trước đây trừ mảnh rồi mới thêm pet; crash ở giữa là mất mảnh.
  const tx = db.transaction(() => {
    if (!removeShard(userId, pet.shard_id, pet.shard_qty)) throw new Error('not_enough_shards');
    bumpPet(userId, petId, 1);
  });
  tx();
  try { require('./achievements').checkAndGrant(userId, context); } catch {}
  return { ok: true, pet };
}

// === Tiến hoá ===
function getAllEvolutions() {
  return db.prepare(`SELECT e.*, f.name from_name, f.icon from_icon, f.habitat from_habitat,
      t.name to_name, t.icon to_icon, t.tier to_tier, t.habitat to_habitat
    FROM pet_evolutions e
    LEFT JOIN pets f ON f.id = e.from_pet_id
    LEFT JOIN pets t ON t.id = e.to_pet_id
    ORDER BY e.from_pet_id, e.min_level`).all();
}

function evolutionsFrom(petId) {
  return db.prepare(`SELECT e.*, t.name to_name, t.icon to_icon, t.tier to_tier, t.habitat to_habitat
    FROM pet_evolutions e LEFT JOIN pets t ON t.id = e.to_pet_id
    WHERE e.from_pet_id = ? ORDER BY e.min_level, e.to_pet_id`).all(petId);
}

function evolutionsTo(petId) {
  return db.prepare(`SELECT e.*, f.name from_name, f.icon from_icon
    FROM pet_evolutions e LEFT JOIN pets f ON f.id = e.from_pet_id
    WHERE e.to_pet_id = ? ORDER BY e.min_level, e.from_pet_id`).all(petId);
}

function getEvolution(fromId, toId) {
  return db.prepare('SELECT * FROM pet_evolutions WHERE from_pet_id=? AND to_pet_id=?').get(fromId, toId) || null;
}

// Có tạo vòng lặp không? (A→B đã có, giờ thêm B→A ⇒ B đi tới được A ⇒ vòng)
function wouldCycle(fromId, toId) {
  const seen = new Set();
  const stack = [toId];
  while (stack.length) {
    const cur = stack.pop();
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const r of db.prepare('SELECT to_pet_id FROM pet_evolutions WHERE from_pet_id=?').all(cur)) {
      stack.push(r.to_pet_id);
    }
  }
  return false;
}

function createEvolution({ from_pet_id, to_pet_id, shard_id, shard_qty = 1, gold_cost = 0, min_level = 1, created_by = 'system' }) {
  const from = getPet(from_pet_id), to = getPet(to_pet_id);
  if (!from) return { ok: false, reason: 'from_not_found' };
  if (!to) return { ok: false, reason: 'to_not_found' };
  if (from_pet_id === to_pet_id) return { ok: false, reason: 'same_pet' };
  if (!shard_id) return { ok: false, reason: 'no_shard' };
  if (!(shard_qty >= 1)) return { ok: false, reason: 'bad_qty' };
  if (!(gold_cost >= 0)) return { ok: false, reason: 'bad_gold' };
  if (!(min_level >= 1)) return { ok: false, reason: 'bad_level' };
  // Khí hậu: pet đích phải sống cùng vùng với pet gốc (bỏ qua nếu một bên chưa gán).
  if (from.habitat && to.habitat && from.habitat !== to.habitat) {
    return { ok: false, reason: 'habitat_mismatch', from_habitat: from.habitat, to_habitat: to.habitat };
  }
  if (wouldCycle(from_pet_id, to_pet_id)) return { ok: false, reason: 'cycle' };

  db.prepare(`INSERT OR REPLACE INTO pet_evolutions
    (from_pet_id, to_pet_id, shard_id, shard_qty, gold_cost, min_level, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(from_pet_id, to_pet_id, shard_id, shard_qty, gold_cost, min_level, created_by, Date.now());
  return { ok: true, recipe: getEvolution(from_pet_id, to_pet_id) };
}

function deleteEvolution(fromId, toId) {
  return db.prepare('DELETE FROM pet_evolutions WHERE from_pet_id=? AND to_pet_id=?').run(fromId, toId).changes > 0;
}

// %pet evolve — tiêu 1 pet gốc + mảnh + vàng để nhận pet đích.
// toId = null: nếu pet chỉ có 1 công thức thì tự chọn, nhiều công thức thì trả
// về danh sách để người chơi chọn.
function evolve(userId, fromId, toId = null) {
  const base = getPet(fromId);
  if (!base) return { ok: false, reason: 'pet_not_found' };
  const recipes = evolutionsFrom(fromId);
  if (recipes.length === 0) return { ok: false, reason: 'no_evolution' };

  let recipe;
  if (toId) {
    recipe = recipes.find(r => r.to_pet_id === toId);
    if (!recipe) return { ok: false, reason: 'no_recipe', choices: recipes };
  } else if (recipes.length === 1) {
    recipe = recipes[0];
  } else {
    return { ok: false, reason: 'ambiguous', choices: recipes };
  }

  if (!hasPet(userId, fromId)) return { ok: false, reason: 'no_base_pet', have: 0 };
  const p = db.prepare('SELECT level, gold, active_pet FROM players WHERE user_id=?').get(userId);
  if (!p) return { ok: false, reason: 'no_player' };
  if ((p.level || 1) < recipe.min_level) {
    return { ok: false, reason: 'level_too_low', need: recipe.min_level, have: p.level || 1 };
  }
  const haveShard = getShard(userId, recipe.shard_id);
  if (haveShard < recipe.shard_qty) {
    return { ok: false, reason: 'not_enough_shards', need: recipe.shard_qty, have: haveShard, shard_id: recipe.shard_id };
  }
  if ((p.gold || 0) < recipe.gold_cost) {
    return { ok: false, reason: 'not_enough_gold', need: recipe.gold_cost, have: p.gold || 0 };
  }

  const wasActive = p.active_pet === fromId;
  const tx = db.transaction(() => {
    if (!removeShard(userId, recipe.shard_id, recipe.shard_qty)) throw new Error('not_enough_shards');
    if (!removePet(userId, fromId, 1)) throw new Error('no_base_pet');
    if (recipe.gold_cost > 0) {
      const r = db.prepare('UPDATE players SET gold = gold - ? WHERE user_id=? AND gold >= ?')
        .run(recipe.gold_cost, userId, recipe.gold_cost);
      if (r.changes !== 1) throw new Error('not_enough_gold');
    }
    bumpPet(userId, recipe.to_pet_id, 1);
    // Pet đang đi theo mà bị tiêu hao → pet mới đi theo luôn, người chơi không
    // bị mất buff oan (và cũng không còn active trỏ vào pet đã mất).
    if (wasActive) db.prepare('UPDATE players SET active_pet=? WHERE user_id=?').run(recipe.to_pet_id, userId);
  });
  try {
    tx();
  } catch (err) {
    return { ok: false, reason: err.message };
  }
  try { require('./achievements').checkAndGrant(userId, null); } catch {}
  return {
    ok: true, from: base, to: getPet(recipe.to_pet_id), recipe,
    gold: recipe.gold_cost, shards: recipe.shard_qty, shard_id: recipe.shard_id,
  };
}

// === Active pet ===
// Chỉ trả pet nếu người chơi THẬT SỰ còn sở hữu. Trước đây hàm này tin mù vào
// players.active_pet: pet bị admin xoá / bị tiêu hao vẫn cộng buff mãi.
function getActivePet(userId) {
  const row = db.prepare(`SELECT p.active_pet, pp.qty FROM players p
    LEFT JOIN player_pets pp ON pp.user_id = p.user_id AND pp.pet_id = p.active_pet
    WHERE p.user_id = ?`).get(userId);
  if (!row?.active_pet) return null;
  if (!row.qty) {
    db.prepare("UPDATE players SET active_pet='' WHERE user_id=?").run(userId);
    return null;
  }
  return getPet(row.active_pet);
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
  // Chặn gán sai khí hậu NGAY LÚC TẠO: nếu để vào bảng rồi, rollPetDrops sẽ lặng
  // lẽ bỏ qua và admin ngồi chờ một drop không bao giờ rơi.
  if (pet_id) {
    const pet = getPet(pet_id);
    if (!pet) throw new Error(`Pet \`${pet_id}\` không tồn tại`);
    const mob = db.prepare('SELECT zone_id FROM monsters WHERE id=?').get(monsterId);
    if (!mob) throw new Error(`Quái \`${monsterId}\` không tồn tại`);
    if (pet.habitat && pet.habitat !== mob.zone_id) {
      const a = habitatInfo(pet.habitat), b = habitatInfo(mob.zone_id);
      throw new Error(`${pet.name} sống ở ${a.emoji} ${a.label}, còn ${monsterId} ở ${b.emoji} ${b.label} — sai khí hậu. Đổi bằng \`pet admin habitat\` nếu thật sự muốn.`);
    }
  }
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
  return db.prepare(`SELECT pd.*, m.name as mob_name, m.zone_id FROM pet_drops pd
    LEFT JOIN monsters m ON m.id = pd.monster_id ORDER BY pd.monster_id`).all();
}

// === Cleanup pet thừa: xóa các pet không có nguồn hợp lệ ===
// "Có nguồn hợp lệ" = drop trực tiếp | shard recipe | ĐÍCH của một công thức
// tiến hoá. (Thiếu vế cuối thì cleanup sẽ xoá sạch mọi dạng tiến hoá.)
function cleanupExtraPets(keepList = null) {
  const all = db.prepare('SELECT id, shard_id, shard_qty, hidden FROM pets').all();

  let toDelete;
  if (keepList) {
    toDelete = all.filter(p => !keepList.includes(p.id)).map(p => p.id);
  } else {
    const petsWithDrop = new Set(
      db.prepare('SELECT DISTINCT pet_id FROM pet_drops WHERE pet_id IS NOT NULL').all().map(r => r.pet_id)
    );
    const evoTargets = new Set(
      db.prepare('SELECT DISTINCT to_pet_id FROM pet_evolutions').all().map(r => r.to_pet_id)
    );
    toDelete = all
      .filter(p => {
        // Pet hidden là chỗ dành sẵn cho event/admin — không có nguồn rơi là chủ ý.
        if (p.hidden) return false;
        const hasDirectDrop = petsWithDrop.has(p.id);
        const hasShardRecipe = p.shard_id && p.shard_qty > 0;
        return !hasDirectDrop && !hasShardRecipe && !evoTargets.has(p.id);
      })
      .map(p => p.id);
  }

  if (toDelete.length === 0) return { deleted: 0, kept: all.length, deletedIds: [] };

  const delPet = db.prepare('DELETE FROM pets WHERE id = ?');
  const delPlayerPet = db.prepare('DELETE FROM player_pets WHERE pet_id = ?');
  const delDrop = db.prepare('DELETE FROM pet_drops WHERE pet_id = ?');
  const delEvo = db.prepare('DELETE FROM pet_evolutions WHERE from_pet_id = ? OR to_pet_id = ?');
  const unsetActive = db.prepare("UPDATE players SET active_pet = '' WHERE active_pet = ?");

  const tx = db.transaction(() => {
    for (const id of toDelete) {
      delPlayerPet.run(id);
      delDrop.run(id);
      delEvo.run(id, id);
      unsetActive.run(id);
      delPet.run(id);
    }
  });
  tx();

  return { deleted: toDelete.length, kept: all.length - toDelete.length, deletedIds: toDelete };
}

// === Reset toàn bộ drop table về default seed (admin tool) ===
function resetDropsToDefault() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM pet_drops').run();
    insertDrops(SEED_DROPS);
  });
  tx();
  return SEED_DROPS.length;
}

// === Roll pet drops khi giết quái ===
// zoneId: nếu không truyền thì tra từ bảng monsters. Pet chỉ rơi khi khí hậu
// của pet khớp zone của quái — chặn dữ liệu sai (pet tuyết rơi ở núi lửa).
function rollPetDrops(monsterId, dropBonusPct = 0, zoneId = null) {
  const drops = getPetDrops(monsterId);
  if (drops.length === 0) return [];
  const zone = zoneId || db.prepare('SELECT zone_id FROM monsters WHERE id=?').get(monsterId)?.zone_id || null;

  const result = [];
  for (const d of drops) {
    if (d.pet_id) {
      const pet = getPet(d.pet_id);
      if (!pet) continue;                       // drop trỏ tới pet không tồn tại
      if (pet.habitat && zone && pet.habitat !== zone) continue; // sai khí hậu
    }
    // Trần 100%: drop bonus +50% lên một dòng 0.8 sẽ thành 1.2 → luôn rơi.
    const chance = Math.max(0, Math.min(1, d.chance * (1 + dropBonusPct / 100)));
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

// === Truy vấn phụ trợ cho UI ===
// Mọi công thức (ghép mảnh + tiến hoá) dùng một shard — %pet shards cần biết
// TẤT CẢ, trước đây chỉ lấy công thức ghép đầu tiên nên shard tiến hoá hiện ra
// như mảnh vô dụng.
function recipesUsingShard(shardId) {
  const out = [];
  for (const p of db.prepare('SELECT id, name, icon, tier, shard_qty FROM pets WHERE shard_id=? AND shard_qty>0').all(shardId)) {
    out.push({ kind: 'combine', pet_id: p.id, name: p.name, icon: p.icon, need: p.shard_qty });
  }
  for (const e of db.prepare(`SELECT e.*, f.name from_name, f.icon from_icon, t.name to_name, t.icon to_icon
      FROM pet_evolutions e LEFT JOIN pets f ON f.id=e.from_pet_id LEFT JOIN pets t ON t.id=e.to_pet_id
      WHERE e.shard_id=?`).all(shardId)) {
    out.push({
      kind: 'evolve', from_id: e.from_pet_id, to_id: e.to_pet_id,
      name: `${e.from_name} → ${e.to_name}`, icon: e.to_icon || e.from_icon, need: e.shard_qty,
      gold: e.gold_cost, min_level: e.min_level,
    });
  }
  return out;
}

// Pet sống ở khí hậu nào (dùng cho %pet collection/%pet map).
function petsByHabitat() {
  const rows = db.prepare('SELECT * FROM pets ORDER BY tier, name').all();
  const map = new Map();
  for (const p of rows) {
    const key = p.habitat || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  return map;
}

module.exports = {
  HABITATS, habitatInfo, petsByHabitat, SHARD_NAMES, shardName,
  migrate,
  getPet, getAllPets, createPet, deletePet, setHabitat,
  getPlayerPets, hasPet, addPet, removePet,
  getShard, getAllShards, addShard, removeShard, recipesUsingShard,
  combineShards,
  getAllEvolutions, evolutionsFrom, evolutionsTo, getEvolution,
  createEvolution, deleteEvolution, evolve, wouldCycle,
  getActivePet, setActivePet,
  addPetDrop, removePetDrop, getPetDrops, getAllPetDrops, rollPetDrops,
  resetDropsToDefault, cleanupExtraPets,
  getPetBonus,
  // dữ liệu seed để test đối chiếu
  SEED_PETS, SEED_DROPS, SEED_EVOLUTIONS,
};
