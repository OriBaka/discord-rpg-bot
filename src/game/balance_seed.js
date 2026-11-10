// Bảng chỉ số quái đã cân bằng (mục tiêu "Option A").
//
// Sinh bởi tools/tune_balance.js trên 45 quái / 9 zone. Kết quả đo được
// (mô phỏng engine thật, 400–600 trận mỗi ô):
//   • win-rate cấp zone tại level mở zone: 9/9 zone trong 65–75% (TB 70,2%)
//   • chênh lệch giữa 3 class (Chiến Binh / Pháp Sư / Cung Thủ) ≤ 8 điểm
//   • 18–66 kill để đi hết 1 zone (trước đây Lv.20 cần ~150 kill MỖI CẤP)
//
// Chỉ chạy MỘT LẦN trong chuỗi migrate (guard bằng bảng meta) để không đè
// lên chỉ số mà admin đã chỉnh tay bằng %admin.
//
// Format: [id, hp, atk, def, xp, gold_min, gold_max, weight]

const db = require('../db/database');

const META_KEY = 'monster_balance_v4';

const MONSTERS = [
  ['slime',    70,   40,    7,     40,     29,     67,  30],
  ['giant_rat',    70,   40,    7,     40,     29,     67,  30],
  ['forest_wisp',    70,   40,    7,     47,     34,     79,  20],
  ['wolf',    70,   40,    7,     47,     34,     79,  20],
  ['forest_bear',    80,   40,    7,     69,     50,    116,  10],
  ['moss_golem',    80,   40,    7,     69,     50,    116,  10],
  ['bat',   120,   86,   13,     82,     59,    138,  30],
  ['cave_spider',   139,   78,   13,     82,     59,    138,  30],
  ['blind_stalker',   147,   86,   13,     96,     69,    161,  20],
  ['goblin',   147,   78,   13,     96,     69,    161,  20],
  ['cave_golem',   152,   86,   13,    140,    101,    235,  10],
  ['goblin_chief',   152,   78,   13,    140,    101,    235,  10],
  ['bog_toad',   176,  117,   17,    112,     81,    188,  30],
  ['leech_swarm',   183,  106,   17,    112,     81,    188,  30],
  ['mire_witch',   196,  117,   17,    132,     95,    222,  20],
  ['swamp_lurker',   196,  106,   17,    132,     95,    222,  20],
  ['bog_colossus',   201,  117,   17,    191,    138,    321,  10],
  ['dust_raider',   169,  139,   20,    147,    106,    247,  30],
  ['scorpion',   198,  126,   20,    147,    106,    247,  30],
  ['mummy',   201,  139,   20,    173,    125,    291,  20],
  ['sun_wraith',   216,  126,   20,    173,    125,    291,  20],
  ['cactus_horror',   222,  139,   20,    251,    181,    422,  10],
  ['sand_worm',   220,  126,   20,    251,    181,    422,  10],
  ['frost_wolf',   264,  227,   34,    248,    179,    417,  30],
  ['snowman',   322,  205,   34,    248,    179,    417,  30],
  ['orc',   318,  227,   34,    292,    210,    491,  20],
  ['yeti',   333,  205,   34,    292,    210,    491,  20],
  ['ice_elemental',   349,  227,   34,    423,    305,    711,  10],
  ['stone_berserker',   347,  205,   34,    423,    305,    711,  10],
  ['troll',   349,  227,   34,    423,    305,    711,  10],
  ['drake_whelp',   304,  360,   43,    365,    263,    613,  30],
  ['lair_guardian',   362,  360,   43,    430,    310,    722,  20],
  ['young_dragon',   364,  325,   43,    430,    310,    722,  20],
  ['dragon',   399,  360,   43,    623,    449,   1047,  10],
  ['void_dragon',   399,  325,   43,    623,    449,   1047,  10],
  ['ember_phoenix',   392,  463,   56,    497,    358,    835,  30],
  ['magma_hound',   477,  419,   56,    497,    358,    835,  30],
  ['char_giant',   468,  463,   56,    585,    421,    983,  20],
  ['obsidian_golem',   509,  419,   56,    585,    421,    983,  20],
  ['frost_revenant',   419,  722,   70,   1218,    877,   2046,  30],
  ['glacier_wyrm',   500,  722,   70,   1433,   1032,   2407,  20],
  ['abyss_leviathan',   553,  722,   70,   2078,   1496,   3491,  10],
  ['void_harbinger',   584, 1049,   93,    964,    694,   1620,  30],
  ['astral_sentinel',   648, 1049,   93,   1134,    816,   1905,  20],
  ['star_devourer',   648,  948,   93,   1134,    816,   1905,  20],
];

function migrate() {
  // Bảng meta dùng để đánh dấu "đã cân bằng 1 lần". Tự tạo tại đây vì
  // balance_seed chạy trước module tạo bảng meta (rename_items).
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Chỉ chạy 1 lần: nếu admin đã chỉnh tay sau đó thì không được ghi đè.
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  const upd = db.prepare(`UPDATE monsters
    SET hp = ?, atk = ?, def = ?, xp = ?, gold_min = ?, gold_max = ?, weight = ?
    WHERE id = ?`);
  let changed = 0;
  for (const [id, hp, atk, def, xp, gmin, gmax, weight] of MONSTERS) {
    changed += upd.run(hp, atk, def, xp, gmin, gmax, weight, id).changes;
  }

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));

  if (changed > 0) {
    console.log(`⚖️ Balance: cân bằng ${changed} quái (win-rate 65–75% ở level mở zone)`);
  }
}

module.exports = { migrate, MONSTERS, META_KEY };
