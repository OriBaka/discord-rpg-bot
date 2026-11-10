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

const META_KEY = 'monster_balance_v3';

const MONSTERS = [
  ['slime',    72,   42,   2,    40,    29,    67, 30],
  ['giant_rat',    72,   36,   2,    40,    29,    67, 30],
  ['forest_wisp',    72,   42,   4,    47,    34,    79, 20],
  ['wolf',    72,   36,   6,    47,    34,    79, 20],
  ['forest_bear',    88,   42,   7,    62,    45,   104, 10],
  ['moss_golem',    88,   36,  10,    62,    45,   104, 10],
  ['bat',   129,   60,   0,    82,    59,   138, 30],
  ['cave_spider',   129,   52,   0,    82,    59,   138, 30],
  ['goblin',   149,   60,   0,    96,    69,   161, 20],
  ['blind_stalker',   149,   52,   0,    96,    69,   161, 20],
  ['goblin_chief',   149,   60,   0,   125,    90,   210, 10],
  ['cave_golem',   168,   52,   0,   125,    90,   210, 10],
  ['bog_toad',   149,   80,   2,   112,    81,   188, 30],
  ['leech_swarm',   188,   70,   3,   112,    81,   188, 30],
  ['swamp_lurker',   188,   80,   5,   132,    95,   222, 20],
  ['mire_witch',   188,   70,   7,   132,    95,   222, 20],
  ['bog_colossus',   188,   80,   9,   171,   123,   287, 10],
  ['scorpion',   168,   98,   2,   147,   106,   247, 30],
  ['dust_raider',   188,   85,   3,   147,   106,   247, 30],
  ['mummy',   207,   98,   6,   173,   125,   291, 20],
  ['sun_wraith',   207,   85,   8,   173,   125,   291, 20],
  ['sand_worm',   227,   98,  11,   225,   162,   378, 10],
  ['cactus_horror',   227,   85,  14,   225,   162,   378, 10],
  ['snowman',   324,  116,   4,   248,   179,   417, 30],
  ['frost_wolf',   402,  101,   5,   248,   179,   417, 30],
  ['orc',   363,  116,  11,   292,   210,   491, 20],
  ['yeti',   402,  101,  14,   292,   210,   491, 20],
  ['ice_elemental',   383,  116,  19,   380,   274,   638, 10],
  ['troll',   422,  101,  25,   380,   274,   638, 10],
  ['stone_berserker',   383,  116,  19,   380,   274,   638, 10],
  ['drake_whelp',   500,  116,   2,   365,   263,   613, 30],
  ['young_dragon',   500,  116,   6,   430,   310,   722, 20],
  ['lair_guardian',   617,  101,   9,   430,   310,   722, 20],
  ['dragon',   597,  116,  11,   559,   402,   939, 10],
  ['void_dragon',   676,  101,  15,   559,   402,   939, 10],
  ['magma_hound',   852,  138,  10,   497,   358,   835, 30],
  ['ember_phoenix',   910,  120,  14,   497,   358,   835, 30],
  ['obsidian_golem',   871,  138,  27,   585,   421,   983, 20],
  ['char_giant',   930,  120,  37,   585,   421,   983, 20],
  ['frost_revenant',   617,  301,   8,  1218,   877,  2046, 30],
  ['glacier_wyrm',   676,  301,  21,  1433,  1032,  2407, 20],
  ['abyss_leviathan',   715,  301,  37,  1863,  1341,  3130, 10],
  ['void_harbinger',   813,  433,  11,   964,   694,  1620, 30],
  ['astral_sentinel',   891,  433,  29,  1134,   816,  1905, 20],
  ['star_devourer',   969,  376,  39,  1134,   816,  1905, 20],
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
