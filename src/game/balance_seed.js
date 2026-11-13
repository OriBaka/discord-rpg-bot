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

const META_KEY = 'monster_balance_v5';

const MONSTERS = [
            ['slime', 110, 10, 6, 40, 29, 67, 30],
            ['giant_rat', 122, 9, 6, 40, 29, 67, 30],
            ['forest_wisp', 117, 10, 6, 47, 34, 79, 20],
            ['wolf', 130, 9, 6, 47, 34, 79, 20],
            ['forest_bear', 122, 10, 6, 69, 50, 116, 10],
            ['moss_golem', 134, 9, 6, 69, 50, 116, 10],
            ['bat', 284, 22, 15, 82, 59, 138, 30],
            ['cave_spider', 325, 20, 15, 82, 59, 138, 30],
            ['blind_stalker', 306, 22, 15, 96, 69, 161, 20],
            ['goblin', 335, 20, 15, 96, 69, 161, 20],
            ['cave_golem', 322, 22, 15, 140, 101, 235, 10],
            ['goblin_chief', 351, 20, 15, 140, 101, 235, 10],
            ['bog_toad', 379, 31, 20, 112, 81, 188, 30],
            ['leech_swarm', 430, 28, 20, 112, 81, 188, 30],
            ['mire_witch', 406, 31, 20, 132, 95, 222, 20],
            ['swamp_lurker', 439, 28, 20, 132, 95, 222, 20],
            ['bog_colossus', 428, 31, 20, 191, 138, 321, 10],
            ['dust_raider', 421, 37, 23, 147, 106, 247, 30],
            ['scorpion', 483, 34, 23, 147, 106, 247, 30],
            ['mummy', 457, 37, 23, 173, 125, 291, 20],
            ['sun_wraith', 494, 34, 23, 173, 125, 291, 20],
            ['cactus_horror', 475, 37, 23, 251, 181, 422, 10],
            ['sand_worm', 527, 34, 23, 251, 181, 422, 10],
            ['frost_wolf', 753, 53, 39, 248, 179, 417, 30],
            ['snowman', 827, 48, 39, 248, 179, 417, 30],
            ['orc', 765, 53, 39, 292, 210, 491, 20],
            ['yeti', 865, 48, 39, 292, 210, 491, 20],
            ['ice_elemental', 816, 53, 39, 423, 305, 711, 10],
            ['stone_berserker', 879, 48, 39, 423, 305, 711, 10],
            ['troll', 816, 53, 39, 423, 305, 711, 10],
            ['drake_whelp', 890, 70, 48, 365, 263, 613, 30],
            ['lair_guardian', 908, 70, 48, 430, 310, 722, 20],
            ['young_dragon', 1033, 63, 48, 430, 310, 722, 20],
            ['dragon', 928, 70, 48, 623, 449, 1047, 10],
            ['void_dragon', 1051, 63, 48, 623, 449, 1047, 10],
            ['ember_phoenix', 1545, 79, 68, 497, 358, 835, 30],
            ['magma_hound', 1802, 71, 68, 497, 358, 835, 30],
            ['char_giant', 1633, 79, 68, 585, 421, 983, 20],
            ['obsidian_golem', 1809, 71, 68, 585, 421, 983, 20],
            ['frost_revenant', 2091, 84, 79, 1218, 877, 2046, 30],
            ['glacier_wyrm', 2157, 84, 79, 1433, 1032, 2407, 20],
            ['abyss_leviathan', 2250, 84, 79, 2078, 1496, 3491, 10],
            ['void_harbinger', 6750, 50, 110, 964, 694, 1620, 30],
            ['astral_sentinel', 6845, 50, 110, 1134, 816, 1905, 20],
            ['star_devourer', 7793, 45, 110, 1134, 816, 1905, 20],
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
