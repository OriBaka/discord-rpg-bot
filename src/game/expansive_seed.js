// =============================================================================
// Expansive content seed: quái mới + zone mới + vật phẩm mới
//
// Mục tiêu: mỗi zone có quái ở 3 mức (dễ / vừa / khó) thay vì chỉ 1–2 con vừa sức,
// và mỗi mốc level có vũ khí/giáp/phụ kiện dùng được → đường tiến bộ liên tục.
//
// Toàn bộ INSERT là idempotent (INSERT OR IGNORE): chạy lại vô hại, không sửa
// dữ liệu người chơi đang có.
// =============================================================================
function getDb() { return require('./../db/database'); }

// ---------------------------------------------------------------------------
// ZONE MỚI — chỗ chơi cho Lv.30+, và vùng mid-game hiện còn thiếu
// ---------------------------------------------------------------------------
const NEW_ZONES = [
  ['swamp',         '🌫️ Murky Swamp',      8,  'Wet lowlands crawling with poison and rot — a tougher road out of the forest'],
  ['volcano',       '🌋 Ember Peak',       25, 'Cracked lava fields where the air itself burns'],
  ['frozen_abyss',  '🧊 Frozen Abyss',     30, 'A glacial rift sealed for millennia, home to things that should have stayed buried'],
  ['astral_ruins',  '✨ Astral Ruins',     40, 'Fragments of a shattered sky-citadel drifting at the edge of reality'],
];

// ---------------------------------------------------------------------------
// QUÁI MỚI
// Format: [id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight]
//
// Ba "archetype" được dùng để mỗi zone có nhịp độ khác nhau:
//   - "nhanh":  HP thấp,  ATK cao  → nguy hiểm, phải giết nhanh
//   - "trâu":   HP cao,   ATK thấp → trận dài, thử độ bền
//   - "giáp":   DEF cao             → cần sát thương lớn mới xuyên được
// ---------------------------------------------------------------------------
const NEW_MONSTERS = [
  // ── FOREST (Lv.1+) — thêm 2 con cho nhịp độ đa dạng ──────────────────────
  ['forest_wisp',      '🦋 Forest Wisp',        'forest',        55,  9,  1,   14,   10,   20, 18],  // nhanh
  ['moss_golem',       '🪨 Moss Golem',         'forest',       200, 14, 12,   55,   30,   55, 10],  // giáp

  // ── SWAMP (Lv.8+) — zone mới giữa forest và cave ────────────────────────
  ['bog_toad',         '🐸 Bog Toad',           'swamp',        120, 16,  6,   30,   18,   35, 25],
  ['swamp_lurker',     '🐊 Swamp Lurker',       'swamp',        190, 26, 10,   52,   30,   60, 20],  // nhanh
  ['leech_swarm',      '🪱 Leech Swarm',        'swamp',        160, 22,  5,   44,   25,   50, 20],
  ['mire_witch',       '🧙‍♀️ Mire Witch',        'swamp',        260, 34, 12,   85,   50,   95, 12],
  ['bog_colossus',     '🦎 Bog Colossus',       'swamp',        520, 40, 26,  150,  105,  190,  6],  // trâu + giáp

  // ── CAVE (Lv.5+) — thêm 2 con ───────────────────────────────────────────
  ['cave_golem',       '🗿 Cave Golem',         'cave',         300, 26, 22,   75,   45,   85, 10],  // giáp
  ['blind_stalker',    '👁️ Blind Stalker',      'cave',         190, 38,  8,   60,   42,   78, 12],  // nhanh

  // ── DESERT (Lv.10+) — thêm 3 con ────────────────────────────────────────
  ['dust_raider',      '🏺 Dust Raider',        'desert',       240, 40, 14,   78,   55,  100, 15],
  ['cactus_horror',    '🌵 Cactus Horror',      'desert',       420, 44, 24,  130,   85,  150, 10],  // giáp
  ['sun_wraith',       '☀️ Sun Wraith',         'desert',       300, 58, 12,  120,   80,  145,  8],  // nhanh

  // ── MOUNTAIN (Lv.15+) — thêm 3 con ──────────────────────────────────────
  ['frost_wolf',       '🐺 Frost Wolf',         'mountain',     430, 62, 20,  190,  120,  210, 14],  // nhanh
  ['ice_elemental',    '❄️ Ice Elemental',      'mountain',     760, 74, 34,  300,  190,  320, 10],
  ['stone_berserker',  '🪓 Stone Berserker',    'mountain',     980, 96, 30,  400,  240,  400,  7],  // trâu

  // ── DRAGON LAIR (Lv.20+) — thêm 2 con nhỏ để có đường vào ──────────────
  ['drake_whelp',      '🦎 Drake Whelp',        'dragon_lair',  900, 88, 30,  400,  280,  460, 18],
  ['lair_guardian',    '🗡️ Lair Guardian',     'dragon_lair', 1500, 105, 52,  700,  480,  800, 10],  // giáp

  // ── VOLCANO (Lv.25+) ────────────────────────────────────────────────────
  ['magma_hound',      '🔥 Magma Hound',        'volcano',     1400, 130, 45,  620,  420,  700, 20],  // nhanh
  ['char_giant',       '🌋 Char Giant',         'volcano',     2600, 150, 70,  900,  600, 1000, 12],  // trâu
  ['obsidian_golem',   '⚫ Obsidian Golem',     'volcano',     2000, 160, 95,  850,  560,  950, 10],  // giáp
  ['ember_phoenix',    '🦅 Ember Phoenix',      'volcano',     1700, 185, 50,  880,  580,  980,  8],  // nhanh

  // ── FROZEN ABYSS (Lv.30+) ───────────────────────────────────────────────
  ['glacier_wyrm',     '🐍 Glacier Wyrm',       'frozen_abyss', 3200, 190, 85, 1150,  750, 1250, 14],
  ['frost_revenant',   '👻 Frost Revenant',     'frozen_abyss', 2400, 215, 70, 1000,  680, 1150, 12],  // nhanh
  ['abyss_leviathan',  '🐋 Abyss Leviathan',    'frozen_abyss', 5200, 205, 110, 1500,  950, 1600,  6],  // trâu/giáp

  // ── ASTRAL RUINS (Lv.40+) ───────────────────────────────────────────────
  ['astral_sentinel',  '⚙️ Astral Sentinel',    'astral_ruins', 4800, 240, 130, 1700, 1050, 1800, 14],  // giáp
  ['void_harbinger',   '🌀 Void Harbinger',     'astral_ruins', 3900, 290,  95, 1600, 1000, 1700, 12],  // nhanh
  ['star_devourer',    '🌌 Star Devourer',      'astral_ruins', 9000, 300, 150, 2600, 1800, 3000,  5],  // boss-lite
];

// ---------------------------------------------------------------------------
// DROP CHO QUÁI MỚI (nối vào material sẵn có → nguyên liệu craft cao cấp)
// Format: [monster_id, item_id, chance, qty]
// ---------------------------------------------------------------------------
const NEW_MONSTER_DROPS = [
  // Forest bổ sung
  ['forest_wisp', 'bat_wing', 0.35, 1],
  ['moss_golem', 'stone', 0.8, 2],
  ['moss_golem', 'iron_ore', 0.25, 1],
  // Swamp
  ['bog_toad', 'slime_gel', 0.7, 2],
  ['swamp_lurker', 'spider_silk', 0.35, 1],
  ['swamp_lurker', 'potion_s', 0.2, 1],
  ['leech_swarm', 'slime_gel', 0.5, 2],
  ['leech_swarm', 'potion_s', 0.25, 1],
  ['mire_witch', 'goblin_ear', 0.4, 1],
  ['mire_witch', 'potion_m', 0.3, 1],
  ['bog_colossus', 'troll_horn', 0.3, 1],
  ['bog_colossus', 'iron_ore', 0.6, 2],
  ['bog_colossus', 'potion_l', 0.2, 1],
  // Cave
  ['cave_golem', 'stone', 0.9, 3],
  ['cave_golem', 'iron_ore', 0.55, 2],
  ['blind_stalker', 'bat_wing', 0.6, 2],
  ['blind_stalker', 'potion_m', 0.2, 1],
  // Desert
  ['dust_raider', 'scorpion_tail', 0.45, 1],
  ['cactus_horror', 'spider_silk', 0.5, 2],
  ['cactus_horror', 'potion_m', 0.25, 1],
  ['sun_wraith', 'gem_ruby', 0.15, 1],
  ['sun_wraith', 'potion_l', 0.2, 1],
  // Mountain
  ['frost_wolf', 'wolf_fang', 0.7, 2],
  ['ice_elemental', 'mithril_ore', 0.35, 1],
  ['ice_elemental', 'potion_l', 0.25, 1],
  ['stone_berserker', 'orc_tusk', 0.5, 1],
  ['stone_berserker', 'iron_ingot', 0.4, 1],
  // Dragon lair
  ['drake_whelp', 'dragon_scale', 0.3, 1],
  ['drake_whelp', 'potion_l', 0.2, 1],
  ['lair_guardian', 'dragon_bone', 0.45, 1],
  ['lair_guardian', 'dragon_scale', 0.55, 1],
  // Volcano
  ['magma_hound', 'coal', 0.6, 2],
  ['magma_hound', 'gem_ruby', 0.2, 1],
  ['char_giant', 'mithril_ingot', 0.3, 1],
  ['char_giant', 'potion_l', 0.25, 1],
  ['obsidian_golem', 'gem_sapphire', 0.3, 1],
  ['obsidian_golem', 'mithril_ore', 0.5, 2],
  ['ember_phoenix', 'gem_ruby', 0.45, 1],
  ['ember_phoenix', 'elixir', 0.1, 1],
  // Frozen abyss
  ['glacier_wyrm', 'dragon_scale', 0.5, 2],
  ['glacier_wyrm', 'mithril_ingot', 0.3, 1],
  ['frost_revenant', 'gem_sapphire', 0.4, 1],
  ['frost_revenant', 'potion_l', 0.3, 2],
  ['abyss_leviathan', 'dragon_bone', 0.6, 2],
  ['abyss_leviathan', 'potion_m', 0.5, 3],
  // Astral ruins
  ['astral_sentinel', 'void_essence', 0.35, 1],
  ['astral_sentinel', 'diamond', 0.3, 1],
  ['void_harbinger', 'void_essence', 0.5, 2],
  ['void_harbinger', 'elixir', 0.2, 1],
  ['star_devourer', 'void_essence', 0.9, 4],
  ['star_devourer', 'diamond', 0.7, 2],
  ['star_devourer', 'elixir', 0.4, 2],
];

// ---------------------------------------------------------------------------
// VŨ KHÍ MỚI — lấp các mốc level còn trống
// Hiện tại chỉ có 8 vũ khí: Lv.1, 12, 25, 40. Thiếu hẳn Lv.6–10, 18–20, 30–35.
// Phân bổ 3 class × các mốc, mỗi class có thiên hướng riêng
// (melee: def nhẹ • magic: atk cao nhất • ranged: cân bằng).
// Format: { id, name, type, tier, atk, def, price, sell, min_level, class_req, weapon_type, desc }
// ---------------------------------------------------------------------------
const NEW_WEAPONS = [
  // ── Lv.6 ──────────────────────────────────────────────────────────────────
  { id: 'sword_bronze',    name: '🗡️ Bronze Sword',      tier: 'common',   atk: 7,  def: 1, price: 220,   sell: 88,   min_level: 6,  class_req: 'melee',  weapon_type: 'sword', desc: 'Bronze holds an edge better than wood.' },
  { id: 'staff_oak',       name: '🪄 Oak Staff',         tier: 'common',   atk: 8,  def: 0, price: 220,   sell: 88,   min_level: 6,  class_req: 'magic',  weapon_type: 'staff', desc: 'Carved from a lightning-struck oak.' },
  { id: 'bow_hunting',     name: '🏹 Hunting Bow',       tier: 'common',   atk: 7,  def: 0, price: 220,   sell: 88,   min_level: 6,  class_req: 'ranged', weapon_type: 'bow',   desc: 'A practical bow for practical hunters.' },

  // ── Lv.18 ─────────────────────────────────────────────────────────────────
  { id: 'sword_broad',     name: '⚔️ Broadsword',        tier: 'rare',     atk: 17, def: 2, price: 700,   sell: 280,  min_level: 18, class_req: 'melee',  weapon_type: 'sword', desc: 'Wide blade that cleaves rather than thrusts.' },
  { id: 'staff_crystal',   name: '🔮 Crystal Staff',     tier: 'rare',     atk: 20, def: 0, price: 750,   sell: 300,  min_level: 18, class_req: 'magic',  weapon_type: 'staff', desc: 'A shard of living crystal focuses the wielder\'s will.' },
  { id: 'bow_recurve',     name: '🏹 Recurve Bow',       tier: 'rare',     atk: 18, def: 0, price: 720,   sell: 288,  min_level: 18, class_req: 'ranged', weapon_type: 'bow',   desc: 'Curved limbs snap arrows forward with vicious speed.' },

  // ── Lv.30 ─────────────────────────────────────────────────────────────────
  { id: 'sword_warblade',  name: '🗡️ Warblade',          tier: 'epic',     atk: 30, def: 3, price: 2600,  sell: 1040, min_level: 30, class_req: 'melee',  weapon_type: 'sword', desc: 'Built for war, balanced for the kill.' },
  { id: 'staff_storm',     name: '⚡ Storm Staff',       tier: 'epic',     atk: 34, def: 0, price: 2800,  sell: 1120, min_level: 30, class_req: 'magic',  weapon_type: 'staff', desc: 'Thunder answers when it strikes the ground.' },
  { id: 'bow_stormfeather', name: '🏹 Stormfeather Bow', tier: 'epic',     atk: 31, def: 0, price: 2700,  sell: 1080, min_level: 30, class_req: 'ranged', weapon_type: 'bow',   desc: 'Fletched with feathers that never touch the ground.' },

  // ── Lv.35 ─────────────────────────────────────────────────────────────────
  { id: 'sword_emberforge', name: '🔥 Emberforge Blade', tier: 'epic',     atk: 36, def: 4, price: 4200,  sell: 1680, min_level: 35, class_req: 'melee',  weapon_type: 'sword', desc: 'Forged in volcanic heat, still warm to the touch.' },
  { id: 'staff_soulfire',  name: '🔥 Soulfire Staff',    tier: 'epic',     atk: 40, def: 0, price: 4400,  sell: 1760, min_level: 35, class_req: 'magic',  weapon_type: 'staff', desc: 'Burns with a fire that feeds on memory.' },
  { id: 'bow_emberwind',   name: '🏹 Emberwind Bow',     tier: 'epic',     atk: 37, def: 0, price: 4300,  sell: 1720, min_level: 35, class_req: 'ranged', weapon_type: 'bow',   desc: 'Each arrow trails a line of cinders.' },

  // ── Lv.45 (end-game, sau Lv.40 legendary hiện có) ───────────────────────
  { id: 'sword_astral',    name: '✨ Astral Fang',       tier: 'legendary', atk: 62, def: 6, price: 12000, sell: 4800, min_level: 45, class_req: 'melee',  weapon_type: 'sword', desc: 'Its edge exists slightly out of phase with reality.' },
  { id: 'staff_astral',    name: '✨ Astral Scepter',    tier: 'legendary', atk: 68, def: 0, price: 12500, sell: 5000, min_level: 45, class_req: 'magic',  weapon_type: 'staff', desc: 'Channels starlight through a lattice of void-glass.' },
  { id: 'bow_astral',      name: '✨ Astral Longbow',    tier: 'legendary', atk: 64, def: 0, price: 12200, sell: 4880, min_level: 45, class_req: 'ranged', weapon_type: 'bow',   desc: 'Looses arrows that find their mark across any distance.' },
];

// ---------------------------------------------------------------------------
// GIÁP MỚI — lấp các slot còn thiếu ở mốc cao (legs/feet/hands max chỉ 22–28 def)
// Format: { id, name, tier, def, price, sell, min_level, armor_slot, armor_type, class_req, desc }
// ---------------------------------------------------------------------------
const NEW_ARMOR = [
  // ── LEGS Lv.30–45 (hiện max def 28 quá thấp so với chest 45) ──────────────
  { id: 'legs_warplate',   name: '👖 Warplate Leggings',  tier: 'epic',      def: 34, price: 2400,  sell: 960,  min_level: 30, armor_slot: 'legs',  armor_type: 'heavy',  class_req: 'melee',  desc: 'Articulated plate that moves like cloth.' },
  { id: 'legs_stormweave', name: '👖 Stormweave Leggings', tier: 'epic',     def: 26, price: 2400,  sell: 960,  min_level: 30, armor_slot: 'legs',  armor_type: 'robe',   class_req: 'magic',  desc: 'Woven from thread that shrugs off lightning.' },
  { id: 'legs_astral',     name: '👖 Astral Greaves',    tier: 'legendary', def: 42, price: 9000,  sell: 3600, min_level: 45, armor_slot: 'legs',  armor_type: 'heavy',  desc: 'Greaves that anchor the wearer to solid ground.' },

  // ── FEET Lv.30–45 (hiện max def 22) ───────────────────────────────────────
  { id: 'feet_warspirit',  name: '👢 Warspirit Boots',   tier: 'epic',      def: 30, price: 2200,  sell: 880,  min_level: 30, armor_slot: 'feet',  armor_type: 'heavy',  class_req: 'melee',  desc: 'Boots that never lose their footing.' },
  { id: 'feet_swiftshadow', name: '👢 Swiftshadow Boots', tier: 'epic',     def: 22, price: 2200,  sell: 880,  min_level: 30, armor_slot: 'feet',  armor_type: 'medium', class_req: 'ranged', desc: 'Silent, quick, and always one step ahead.' },
  { id: 'feet_astral',     name: '👢 Astral Striders',   tier: 'legendary', def: 38, price: 8500,  sell: 3400, min_level: 45, armor_slot: 'feet',  armor_type: 'light',  desc: 'Each step covers more distance than it should.' },

  // ── HANDS Lv.30–45 (hiện max def 22) ──────────────────────────────────────
  { id: 'hands_warfist',   name: '🧤 Warfist Gauntlets', tier: 'epic',      def: 30, price: 2200,  sell: 880,  min_level: 30, armor_slot: 'hands', armor_type: 'heavy',  class_req: 'melee',  desc: 'Punch through a wall and apologise later.' },
  { id: 'hands_runeweave', name: '🧤 Runeweave Gloves',  tier: 'epic',      def: 22, price: 2200,  sell: 880,  min_level: 30, armor_slot: 'hands', armor_type: 'robe',   class_req: 'magic',  desc: 'Stitched with runes that steady a casting hand.' },
  { id: 'hands_astral',    name: '🧤 Astral Grips',      tier: 'legendary', def: 38, price: 8500,  sell: 3400, min_level: 45, armor_slot: 'hands', armor_type: 'light',  desc: 'Grip anything, even things that resist being held.' },

  // ── HEAD / CHEST cao cấp cho đường magic & ranged ─────────────────────────
  { id: 'head_astral',     name: '👑 Astral Crown',      tier: 'legendary', def: 36, price: 8500,  sell: 3400, min_level: 45, armor_slot: 'head',  armor_type: 'light',  desc: 'A circlet of frozen starlight.' },
  { id: 'chest_astral',    name: '⚜️ Astral Cuirass',    tier: 'legendary', def: 55, price: 11000, sell: 4400, min_level: 45, armor_slot: 'chest', armor_type: 'medium', desc: 'Holds its shape even when struck by a god.' },
];

// ---------------------------------------------------------------------------
// PHỤ KIỆN MỚI — thêm lựa chọn theo lối chơi
// ---------------------------------------------------------------------------
const NEW_ACCESSORIES = [
  { id: 'ring_berserker',  name: '💍 Berserker Ring',   tier: 'epic',      atk: 16, def: 0,  heal: 0,   price: 2600,  sell: 1040, min_level: 28, accessory_type: 'ring',     desc: 'The more you bleed, the harder you swing.' },
  { id: 'ring_warden',     name: '💍 Warden Ring',      tier: 'epic',      atk: 0,  def: 22, heal: 0,   price: 2600,  sell: 1040, min_level: 28, accessory_type: 'ring',     desc: 'A ring worn by those who outlast sieges.' },
  { id: 'ring_arcanist',   name: '💍 Arcanist Ring',    tier: 'epic',      atk: 14, def: 8,  heal: 0,   price: 2800,  sell: 1120, min_level: 28, accessory_type: 'ring',     desc: 'Keeps a spell circling in the wearer\'s mind.' },
  { id: 'neck_soulbind',   name: '📿 Soulbind Pendant', tier: 'epic',      atk: 10, def: 10, heal: 180, price: 3200,  sell: 1280, min_level: 30, accessory_type: 'necklace', desc: 'Steadies the spirit and closes small wounds.' },
  { id: 'neck_astral',     name: '📿 Astral Chain',     tier: 'legendary', atk: 24, def: 24, heal: 320, price: 9500,  sell: 3800, min_level: 45, accessory_type: 'necklace', desc: 'Linked starlight that mends as it burns.' },
  { id: 'special_slayer',  name: '🎯 Slayer Sigil',     tier: 'epic',      atk: 12, def: 12, heal: 0,   price: 3400,  sell: 1360, min_level: 30, accessory_type: 'special',  desc: 'Marks prey worth killing.' },
  { id: 'special_astral',  name: '🔯 Astral Sigil',     tier: 'legendary', atk: 28, def: 28, heal: 0,   price: 10000, sell: 4000, min_level: 45, accessory_type: 'special',  desc: 'A sigil that rewrites small facts about reality.' },
];

// ---------------------------------------------------------------------------
// VẬT PHẨM TIÊU HAO MỚI
// ---------------------------------------------------------------------------
const NEW_CONSUMABLES = [
  // Potion theo % HP — dùng tốt ở level cao vì bình cố định trở nên quá yếu
  { id: 'potion_percent',  name: '💚 Rejuvenation Flask', tier: 'rare',      heal: 0,    heal_pct: 35, price: 400,  sell: 80,  desc: 'Restores 35% of your maximum HP.' },
  { id: 'potion_full',     name: '💖 Vitality Flask',     tier: 'epic',      heal: 0,    heal_pct: 65, price: 900,  sell: 180, desc: 'Restores 65% of your maximum HP.' },
  // Hồi HP mạnh cho end-game
  { id: 'potion_ancient',  name: '🏺 Ancient Tonic',      tier: 'legendary', heal: 1200, price: 700,  sell: 140, desc: 'Restores 1200 HP. Bitter, but it works.' },
  { id: 'potion_astral',   name: '✨ Astral Elixir',      tier: 'legendary', heal: 2500, price: 1600, sell: 320, desc: 'Restores 2500 HP. Tastes faintly of starlight.' },
];

// ---------------------------------------------------------------------------
// Migrate (idempotent)
// ---------------------------------------------------------------------------
function migrate() {
  const db = getDb();

  // --- Zone ---
  const insZone = db.prepare('INSERT OR IGNORE INTO zones (id, name, min_level, desc) VALUES (?,?,?,?)');
  let zonesAdded = 0;
  for (const z of NEW_ZONES) zonesAdded += insZone.run(...z).changes;
  if (zonesAdded > 0) console.log(`🌍 Expansive: +${zonesAdded} zone`);

  // --- Quái ---
  const insMon = db.prepare(`INSERT OR IGNORE INTO monsters
    (id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  let monAdded = 0;
  for (const m of NEW_MONSTERS) monAdded += insMon.run(...m).changes;
  if (monAdded > 0) console.log(`👹 Expansive: +${monAdded} quái`);

  // --- Drop quái (chỉ thêm nếu quái tồn tại) ---
  const insDrop = db.prepare('INSERT OR IGNORE INTO monster_drops (monster_id, item_id, chance, qty) VALUES (?,?,?,?)');
  const monExists = db.prepare('SELECT 1 FROM monsters WHERE id = ?');
  let dropsAdded = 0;
  for (const [mob, item, chance, qty] of NEW_MONSTER_DROPS) {
    if (!monExists.get(mob)) continue;
    dropsAdded += insDrop.run(mob, item, chance, qty).changes;
  }
  if (dropsAdded > 0) console.log(`🎁 Expansive: +${dropsAdded} drop`);

  // --- Items (weapon / armor / accessory / consumable) ---
  // Chỉ INSERT khi id chưa tồn tại — không ghi đè item admin đã chỉnh tay.
  const insItemFull = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc,
     class_req, weapon_type, armor_type, accessory_type, armor_slot, min_level)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let itemsAdded = 0;

  for (const w of NEW_WEAPONS) {
    itemsAdded += insItemFull.run(
      w.id, w.name, 'weapon', w.tier, w.atk, w.def || 0, 0, w.price, w.sell, w.desc,
      w.class_req, w.weapon_type, '', '', '', w.min_level
    ).changes;
  }
  for (const a of NEW_ARMOR) {
    itemsAdded += insItemFull.run(
      a.id, a.name, 'armor', a.tier, 0, a.def, 0, a.price, a.sell, a.desc,
      a.class_req || '', '', a.armor_type || '', '', a.armor_slot, a.min_level
    ).changes;
  }
  for (const c of NEW_ACCESSORIES) {
    itemsAdded += insItemFull.run(
      c.id, c.name, 'accessory', c.tier, c.atk, c.def, c.heal, c.price, c.sell, c.desc,
      '', '', '', c.accessory_type, '', c.min_level
    ).changes;
  }
  for (const p of NEW_CONSUMABLES) {
    itemsAdded += insItemFull.run(
      p.id, p.name, 'consumable', p.tier, 0, 0, p.heal, p.price, p.sell, p.desc,
      '', '', '', '', '', 0
    ).changes;
    // Bình hồi theo % max HP (heal_pct); heal = 0 nên phải lưu riêng.
    if (p.heal_pct) {
      const cols = db.prepare('PRAGMA table_info(items)').all().map(c => c.name);
      if (!cols.includes('heal_pct')) {
        db.exec('ALTER TABLE items ADD COLUMN heal_pct INTEGER NOT NULL DEFAULT 0');
        console.log('🔧 Migrated items: thêm heal_pct');
      }
      db.prepare('UPDATE items SET heal_pct = ? WHERE id = ?').run(p.heal_pct, p.id);
    }
  }
  if (itemsAdded > 0) console.log(`🛒 Expansive: +${itemsAdded} item`);

  // --- Bán trong shop: đồ phổ thông (giá rẻ, dùng được cho người mới) ---
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  const shopIds = [
    'sword_bronze', 'staff_oak', 'bow_hunting',
    'sword_broad', 'staff_crystal', 'bow_recurve',
    'potion_percent', 'potion_full', 'potion_ancient',
    'ring_warden', 'ring_berserker',
  ];
  let shopAdded = 0;
  for (const id of shopIds) shopAdded += insShop.run(id).changes;
  if (shopAdded > 0) console.log(`🏪 Expansive: +${shopAdded} item vào shop`);
}

module.exports = {
  migrate,
  NEW_ZONES, NEW_MONSTERS, NEW_MONSTER_DROPS,
  NEW_WEAPONS, NEW_ARMOR, NEW_ACCESSORIES, NEW_CONSUMABLES,
};
