// Can bang VU KHI giua 3 class.
//
// Van de phat hien khi do: bang vu khi truoc day lech nghiem trong
//   - Lv.1 : Chiến Binh có rusty_dagger atk 5, Pháp Sư & Cung Thủ KHÔNG có vũ khí (atk 0)
//   - Lv.12: Cung Thủ 14 vs Chiến Binh 10
//   - Lv.25: Chiến Binh 20, Pháp Sư 25, Cung Thủ vẫn 18 (không có vũ khí mới)
//   - Lv.40: Chiến Binh 55, Pháp Sư/Cung Thủ vẫn 40/37
// Vi ATK là nguồn sát thương duy nhất và DEF đã giảm thương theo tỉ lệ, chênh
// ATK 5-15 điểm làm win-rate lệch 20-40 điểm giữa các class — không bảng quái
// nào cân được.
//
// Cách sửa: mỗi mốc level có ĐỦ vũ khí cho cả 3 class, cùng ATK. Khác biệt
// giữa class được thể hiện ở DEF của vũ khí (Chiến Binh +DEF, Pháp Sư/Cung 0)
// và ở chỉ số gốc của class, KHÔNG ở ATK.
//
// Chạy tự động trong chuỗi migrate (idempotent, chỉ UPDATE giá trị đang thiếu).

const db = require('../db/database');

// Mốc level → atk chuẩn cho mọi class ở mốc đó
const ATK_BY_LEVEL = {
  1: 5, 6: 8, 12: 14, 18: 20, 25: 26, 30: 34, 35: 40, 40: 48, 45: 62,
};

// Vũ khí cần THÊM (id mới) để lấp lỗ hổng
// Format: { id, name, tier, atk, def, price, sell, min_level, class_req, weapon_type, desc }
const NEW_WEAPONS = [
  // Lv.1 — Pháp Sư và Cung Thủ trước đây không có vũ khí nào
  { id: 'apprentice_wand', name: '🪄 Apprentice Wand', tier: 'common', atk: 5, def: 0, price: 50, sell: 20, min_level: 1, class_req: 'magic', weapon_type: 'wand', desc: 'First wand of every young mage.' },
  { id: 'short_bow',       name: '🏹 Short Bow',       tier: 'common', atk: 5, def: 0, price: 50, sell: 20, min_level: 1, class_req: 'ranged', weapon_type: 'bow', desc: 'Light enough to draw before you can aim.' },

  // Lv.12 — Cung Thủ trước đây nhảy cóc lên 14 trong khi các class khác còn 10-8
  { id: 'staff_ash',       name: '🌿 Ashwood Staff',   tier: 'rare', atk: 14, def: 0, price: 340, sell: 136, min_level: 12, class_req: 'magic', weapon_type: 'staff', desc: 'Ashwood drinks mana and gives it back twice.' },

  // Lv.25 — Cung Thủ trước đây không có vũ khí nào ở mốc này
  { id: 'bow_windcut',     name: '🏹 Windcut Bow',     tier: 'epic', atk: 26, def: 0, price: 1600, sell: 640, min_level: 25, class_req: 'ranged', weapon_type: 'bow', desc: 'Arrows leave no sound, only a cut in the air.' },

  // Lv.40 — Pháp Sư và Cung Thủ trước đây vẫn dùng đồ Lv.35
  { id: 'staff_voidsong',  name: '🌌 Voidsong Staff',  tier: 'legendary', atk: 48, def: 0, price: 6200, sell: 2480, min_level: 40, class_req: 'magic', weapon_type: 'staff', desc: 'It hums with the sound of a place that is not here.' },
  { id: 'bow_dragonbone',  name: '🐉 Dragonbone Bow',  tier: 'legendary', atk: 48, def: 0, price: 6000, sell: 2400, min_level: 40, class_req: 'ranged', weapon_type: 'bow', desc: 'Strung with a tendon from something enormous.' },
];

// Vũ khí CŨ cần chỉnh ATK cho khớp mốc (và bù lại khi trước đó bị lệch)
// [id, atk mới, def mới (null = giữ nguyên)]
const ATK_FIXES = [
  ['wood_sword',          5, 0],
  ['rusty_dagger',        5, 0],
  ['sword_bronze',        8, 1],
  ['staff_oak',           8, 0],
  ['bow_hunting',         8, 0],
  ['iron_sword',         14, 0],
  ['silver_bow',         14, 0],
  ['sword_broad',        20, 2],
  ['staff_crystal',      20, 0],
  ['bow_recurve',        20, 0],
  ['steel_sword',        26, 2],
  ['flame_staff',        26, 0],
  ['sword_warblade',     34, 3],
  ['staff_storm',        34, 0],
  ['bow_stormfeather',   34, 0],
  ['sword_emberforge',   40, 4],
  ['staff_soulfire',     40, 0],
  ['bow_emberwind',      40, 0],
  ['dragon_sword',       48, 2],
  ['void_blade',         48, 0],
  ['sword_astral',       62, 6],
  ['staff_astral',       62, 0],
  ['bow_astral',         62, 0],
];

function migrate() {
  const has = db.prepare('SELECT 1 FROM items WHERE id = ?');

  // 1) Thêm vũ khí còn thiếu (không ghi đè nếu admin đã thêm)
  const ins = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc,
     class_req, weapon_type, armor_type, accessory_type, armor_slot, min_level)
    VALUES (?,?,?,?,?,0,0,?,?,?,?,?,'','','',?)`);
  let added = 0;
  for (const w of NEW_WEAPONS) {
    added += ins.run(w.id, w.name, 'weapon', w.tier, w.atk, w.price, w.sell,
      w.desc, w.class_req, w.weapon_type, w.min_level).changes;
  }

  // 2) Chỉnh ATK các vũ khí cũ cho khớp mốc
  const upd = db.prepare('UPDATE items SET atk = ?, def = ? WHERE id = ? AND type = ?');
  let fixed = 0;
  for (const [id, atk, def] of ATK_FIXES) {
    if (!has.get(id)) continue;
    fixed += upd.run(atk, def, id, 'weapon').changes;
  }

  // 3) Bán trong shop: vũ khí khởi đầu của Pháp Sư / Cung Thủ
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  for (const id of ['apprentice_wand', 'short_bow', 'staff_ash', 'bow_windcut']) insShop.run(id);

  if (added > 0) console.log(`🗡️ Weapon balance: +${added} vũ khí mới (lấp lỗ hổng tier)`);
  if (fixed > 0) console.log(`🗡️ Weapon balance: ${fixed} vũ khí chỉnh lại ATK cho đều 3 class`);
}

module.exports = { migrate, NEW_WEAPONS, ATK_FIXES, ATK_BY_LEVEL };
