// Seed elite + boss monsters cho %battle
function getDb() { return require('./../db/database'); }

// Format: [id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight, elite_tier, desc]
// elite_tier: 1=elite (x3 hp, x1.5 atk), 2=boss (x10 hp, has AI)
// zone_id phải tồn tại trong bảng zones: forest, cave, desert, mountain, dragon_lair
// desc: BẮT BUỘC — người chơi nhìn thấy quái trong %battle/%hunt, không thể là
//       một dòng chỉ số trần. (test/balance.test.js chặn mọi quái thiếu mô tả.)
const ELITE_MOBS = [
  // Elite (1)
  ['elite_slime',   '🟢 Giant Slime',       'forest',      120,  15,  5,   80,   80,   180,  10, 1,
    'Khối nhầy cao tới thắt lưng, nuốt chửng cả xác thú trong một lần. Lõi bên trong nó phát sáng mỗi khi có ai lại gần.'],
  ['elite_wolf',    '🐺 Alpha Wolf',        'forest',      180,  25,  8,   150,  200,  400,  10, 1,
    'Con sói đầu đàn, vai rộng hơn đồng loại một vòng. Nó không tru trước khi vồ — bầy chỉ lao theo sau khi máu đã đổ.'],
  ['elite_orc',     '👹 Orc Warlord',       'mountain',    350, 45, 15,   350,  600,  1000, 10, 1,
    'Orc mang giáp ghép từ khiên của kẻ đã chết dưới tay nó. Mỗi vết sẹo trên người là một bộ tộc đã bị xoá tên.'],
  ['elite_golem',   '🗿 Stone Golem',       'cave',        500, 55, 30,   500,  1000, 1800, 10, 1,
    'Tảng đá biết đi, khắc đầy những ký tự đã mờ. Nó không giận dữ, chỉ kiên nhẫn đứng chắn lối vào cho tới khi kẻ xâm nhập kiệt sức.'],
  ['elite_lich',    '💀 Ancient Lich',      'cave',        700, 80, 20,   800,  1800, 3000, 10, 1,
    'Pháp sư chết nhưng không chịu rời đi. Xương của nó giữ nguyên tư thế niệm chú cuối cùng, và câu chú ấy vẫn còn hiệu lực.'],
  ['elite_dragon',  '🐲 Young Dragon',      'dragon_lair', 900, 100, 25, 1200, 3000, 5000, 10, 1,
    'Rồng non chưa đủ tuổi để giữ lãnh thổ riêng, nên nó chiếm tổ của kẻ khác. Vảy còn mềm — nhưng móng thì không.'],

  // Boss (2) — endgame
  ['boss_demon_king', '👿 Demon King',      'cave',        2500, 130, 40, 3000, 5000, 12000, 10, 2,
    'Kẻ ngồi trên ngai làm từ xương của chính quân đoàn mình. Hắn không cần ra tay trước — chỉ cần chờ người ta đến.'],
  ['boss_wyrm',       '🐉 Ancient Wyrm',    'mountain',    3500, 150, 45, 5000, 8000, 20000, 10, 2,
    'Con rồng đã sống qua bốn triều đại của con người. Cả ngọn núi này là tổ của nó, và mọi lối mòn đều dẫn tới hàm nó.'],
  ['boss_void_lord',  '🌌 Void Lord',       'dragon_lair', 5000, 200, 60, 10000, 15000, 40000, 10, 2,
    'Thứ bước ra từ chỗ mà bản đồ không còn vẽ nữa. Nó không tấn công vì thù hận; nó tấn công vì ở đó từng có một khoảng trống cần lấp.'],
];

// Boss drops (rare items từ high tier seed)
const BOSS_DROPS = [
  // Demon King
  { mob: 'boss_demon_king', item: 'dragon_bone', chance: 0.8, qty: 3 },
  { mob: 'boss_demon_king', item: 'diamond', chance: 0.5, qty: 2 },
  { mob: 'boss_demon_king', item: 'gem_ruby', chance: 0.3, qty: 1 },

  // Ancient Wyrm
  { mob: 'boss_wyrm', item: 'dragon_scale', chance: 0.9, qty: 3 },
  { mob: 'boss_wyrm', item: 'dragon_bone', chance: 0.8, qty: 5 },
  { mob: 'boss_wyrm', item: 'diamond', chance: 0.4, qty: 1 },

  // Void Lord — end-game drops
  { mob: 'boss_void_lord', item: 'void_essence', chance: 0.9, qty: 5 },
  { mob: 'boss_void_lord', item: 'void_orb', chance: 0.35, qty: 1 },
  { mob: 'boss_void_lord', item: 'dragon_scale', chance: 0.8, qty: 5 },
];

// Elite drops (basic materials boost)
const ELITE_DROPS = [
  { mob: 'elite_slime', item: 'stone', chance: 1.0, qty: 5 },
  { mob: 'elite_wolf', item: 'coal', chance: 0.8, qty: 3 },
  { mob: 'elite_orc', item: 'iron_ore', chance: 0.9, qty: 5 },
  { mob: 'elite_golem', item: 'mithril_ore', chance: 0.6, qty: 3 },
  { mob: 'elite_lich', item: 'gem_sapphire', chance: 0.5, qty: 2 },
  { mob: 'elite_dragon', item: 'dragon_bone', chance: 0.7, qty: 2 },
];

function seedBattleMobs() {
  const db = getDb();
  let mobsAdded = 0, dropsAdded = 0;

  const insMob = db.prepare(`
    INSERT OR IGNORE INTO monsters (id, name, zone_id, hp, atk, def, xp, gold_min, gold_max, weight, elite_tier, desc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updMob = db.prepare('UPDATE monsters SET elite_tier=?, desc = CASE WHEN desc IS NULL OR trim(desc)=\'\' THEN ? ELSE desc END WHERE id=?');
  for (const m of ELITE_MOBS) {
    const info = insMob.run(...m);
    if (info.changes > 0) mobsAdded++;
    // Đảm bảo elite_tier đúng + bù mô tả cho DB cũ đã seed thiếu (elite/boss
    // trước đây được thêm vào sau, khi bảng đã có sẵn nên không có desc)
    updMob.run(m[10], m[11], m[0]);
  }

  // Bảng monster_drops KHÔNG có FK tới items, nên trước đây drop trỏ tới item
  // không tồn tại vẫn được ghi vào DB (đo được: boss_wyrm → diamond_ingot,
  // boss_void_lord → void_ingot — hai item chưa bao giờ tồn tại). Người chơi
  // hạ boss, roll trúng "drop" đó, và không nhận được gì. Kiểm tra tường minh
  // thay vì try/catch (try/catch chỉ bắt lỗi FK, mà FK thì không có).
  const itemExists = db.prepare('SELECT 1 FROM items WHERE id = ?');
  const insDrop = db.prepare(`INSERT OR IGNORE INTO monster_drops (monster_id, item_id, chance, qty) VALUES (?, ?, ?, ?)`);
  const missingItems = [];
  for (const d of [...ELITE_DROPS, ...BOSS_DROPS]) {
    if (!itemExists.get(d.item)) { missingItems.push(`${d.mob}→${d.item}`); continue; }
    const info = insDrop.run(d.mob, d.item, d.chance, d.qty);
    if (info.changes > 0) dropsAdded++;
  }
  if (missingItems.length > 0) {
    console.warn(`⚠️  battle_mobs_seed: bỏ ${missingItems.length} drop trỏ tới item không tồn tại: ${missingItems.join(', ')}`);
  }

  // Dọn drop rác đã lỡ ghi vào DB cũ (idempotent, chạy mỗi lần seed).
  const junk = db.prepare('DELETE FROM monster_drops WHERE item_id NOT IN (SELECT id FROM items)').run();

  return { mobsAdded, dropsAdded, junkRemoved: junk.changes, missingItems };
}

module.exports = { seedBattleMobs, ELITE_MOBS, BOSS_DROPS, ELITE_DROPS };
 
