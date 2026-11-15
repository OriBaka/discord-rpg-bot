// NGUỒN cho 3 Huy Hiệu class (class_token_*) — mở khoá class thứ 2.
//
// Vấn đề: `classes.checkUnlockRequirements` đòi `class_token_<class>` và UI
// (`%class unlock`) ghi "Săn boss hoặc nhận từ admin". Nhưng kiểm tra chéo 7
// nguồn (shop / mob drop / recipe / lootbox / redeem / achievement / gather) cho
// thấy cả 3 huy hiệu KHÔNG CÓ NGUỒN NÀO — nhánh multi-class đã code xong 90% mà
// trên thực tế chỉ admin tự tay đưa item mới dùng được.
//
// Cách sửa: gắn mỗi huy hiệu vào một BOSS cuối game (elite_tier = 2), tỉ lệ 15%.
// Chọn boss thay vì shop để giữ tinh thần "phải đi săn mới có", và 15% là đủ để
// người chơi cày 5-10 trận boss là có, không thành xổ số.
//
// Boss chỉ được seed khi ai đó gõ `%battle` (battle.js gọi seedBattleMobs), nên
// module này chủ động gọi seedBattleMobs() trước — nhờ vậy từ lần khởi động đầu
// tiên, `%battle` đã có elite/boss để đánh và `%info mobs` nhìn thấy chúng.
const TOKEN_BOSSES = [
  ['boss_demon_king', 'class_token_melee',  0.15],
  ['boss_wyrm',       'class_token_ranged', 0.15],
  ['boss_void_lord',  'class_token_magic',  0.15],
];

function migrate() {
  const db = require('../db/database');

  // 1) Bảo đảm mob elite/boss tồn tại (idempotent). Nếu bước này lỗi (thiếu bảng
  //    ...), vẫn tiếp tục — drop sẽ được bỏ qua vì boss không tồn tại.
  try {
    require('./battle_mobs_seed').seedBattleMobs();
  } catch (e) {
    console.error('[class_token_sources] không seed được boss:', e.message);
  }

  const itemExists = db.prepare('SELECT 1 FROM items WHERE id = ?');
  const mobExists = db.prepare('SELECT 1 FROM monsters WHERE id = ?');
  // monster_drops có PRIMARY KEY (monster_id, item_id) → OR IGNORE an toàn khi
  // chạy lại mỗi lần khởi động.
  const insDrop = db.prepare(`INSERT OR IGNORE INTO monster_drops
    (monster_id, item_id, chance, qty) VALUES (?,?,?,?)`);

  let added = 0;
  for (const [mobId, itemId, chance] of TOKEN_BOSSES) {
    if (!itemExists.get(itemId) || !mobExists.get(mobId)) continue;
    added += insDrop.run(mobId, itemId, chance, 1).changes;
  }
  if (added > 0) {
    console.log(`🎖️ Class tokens: +${added} nguồn drop từ boss (mở khoá class thứ 2)`);
  }
}

module.exports = { migrate, TOKEN_BOSSES };
