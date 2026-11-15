// Thang chỉ số TRANG BỊ — nguồn duy nhất cho DEF của giáp và chỉ số phụ kiện.
//
// ---------------------------------------------------------------------------
// VÌ SAO PHẢI VIẾT LẠI
//
// Ba class từng dùng BA bảng giáp riêng, và phần lớn giáp bị khoá class_req.
// Đo được (trước khi sửa):
//
//   Lv.45  Chiến Binh hưởng 336 DEF từ giáp
//          Cung Thủ    hưởng 303
//          Pháp Sư     hưởng 300   → nhưng HP lại thấp hơn 28%
//
//   Lv.40  Chiến Binh 259 · Pháp Sư 183 · Cung Thủ 144
//   Lv.25  Chiến Binh 142 · Cung Thủ  77 · Pháp Sư  58
//
// Tức là có lúc Chiến Binh hưởng giáp gấp 2.4 lần Pháp Sư, có lúc lại hơn
// Pháp Sư chưa tới 1.2 lần — không có quy luật nào. Cộng thêm phụ kiện và
// tay phụ (atk/def khác nhau theo class) thì "ATK 3 class bằng nhau" ở vũ khí
// trở nên vô nghĩa: Lv.45 lệch tới 44 ATK.
//
// NAY: một bảng duy nhất.
//   • Giáp: mỗi BẬC level có tổng DEF cho 5 slot. Món nào cũng dùng được cho
//     class nào; khác biệt nằm ở hệ số `armor_share` của class (1.0 / 0.72 /
//     0.5 — xem classes.js). Nhờ vậy chỉ số đo được luôn khớp công thức.
//   • Phụ kiện: cả 4 món đều +ATK và +DEF bằng nhau ở mỗi bậc. Người chơi
//     chọn món theo HIỆU ỨNG (hồi máu, +vàng, +XP), không phải theo số — nên
//     lựa chọn trang bị không còn âm thầm đổi độ bền.
//   • Tay phụ: +ATK và +DEF như nhau. Vũ khí: +DEF = 0 (trước đây kiếm cộng
//     DEF, tức là vũ khí mạnh nhất cũng là giáp tốt nhất, và chỉ Chiến Binh
//     có).
//
// Idempotent: chạy lại chỉ ghi lại đúng những con số này.
// ---------------------------------------------------------------------------

const BANDS = [1, 12, 25, 30, 40, 45];

// Tổng DEF 5 slot giáp ở mỗi bậc, tính cho người hưởng 100% (Chiến Binh).
// Bậc 1 là 22 chứ không phải 14: người mới ở Lv.1 phải có giáp để mặc (và
// mua — giá bị chặn ở 150 vàng). Nếu ngân sách bậc 1 quá nhỏ, "không đồ" và
// "có đồ" gần như giống nhau, giáp mất tác dụng đúng ở nơi người chơi học về
// giáp lần đầu (đo được: 14 → giáp chỉ giảm 9% ở forest).
// Bậc 1 = 12 chứ không phải 45. Giáp Lv.1 cộng 45 DEF trong khi DEF gốc của
// người mới chỉ 6 — tức người mua đủ 5 món rẻ nhất mạnh lên 7 lần NGAY Lv.1.
// Hệ quả đo được: "full đồ Lv.1" thắng 100% ở forest trong khi người mới (chỉ
// có vũ khí khởi đầu) cần 11 đòn để giết quái và chỉ sống 6 đòn → 0%. Không
// có bảng quái nào phục vụ được cả hai trạng thái cách nhau 15 lần độ bền.
// 12 giữ được: giáp Lv.1 có cảm giác (+12 DEF trên nền 6), người mới vẫn thắng
// được, người mua đồ thắng cao hơn nhưng không phải bất tử.
const ARMOR_BUDGET = { 1: 40, 12: 52, 25: 88, 30: 104, 40: 148, 45: 176 };

// Chia ngân sách cho 5 slot. Tổng = 1.00.
const SLOT_SHARE = { chest: 0.34, legs: 0.18, head: 0.16, feet: 0.16, hands: 0.16 };

// Tổng (ATK + DEF) của 4 món phụ kiện ở mỗi bậc; mỗi món được 1/4, và món
// nào cũng +ATK = +DEF = 1/4 ngân sách.
const ACC_BUDGET = { 1: 8, 12: 24, 25: 48, 30: 64, 40: 88, 45: 104 };
const ACC_SLOTS = 4;   // 2 nhẫn + 1 dây chuyền + 1 đặc biệt (đúng như slots.js)

// Tay phụ: +ATK và +DEF bằng nhau.
const OFFHAND = { 1: 5, 12: 8, 25: 14, 30: 18, 40: 22, 45: 26 };

function bandOf(lv) {
  let b = BANDS[0];
  for (const k of BANDS) if (lv >= k) b = k;
  return b;
}

function armorDef(slot, lv) {
  const share = SLOT_SHARE[slot] || 0;
  return Math.round(ARMOR_BUDGET[bandOf(lv)] * share);
}

function accValue(lv) {
  return Math.round(ACC_BUDGET[bandOf(lv)] / ACC_SLOTS);
}

function offhandValue(lv) {
  return OFFHAND[bandOf(lv)];
}

// ---------------------------------------------------------------------------
// Những món giáp còn THIẾU để mỗi class có đủ 5 slot ở mỗi bậc.
//
// Đo được trước khi sửa: Cung Thủ không có giáp chân ở Lv.25/40/45 và không có
// giáp tay ở Lv.30/40/45; Pháp Sư không có giày ở Lv.25/30/40/45. Họ phải mặc
// đồ Lv.12, tức là mất 60-80% DEF của bậc — đây chính là lỗ hổng khiến "Cung
// Thủ hưởng 144 DEF ở Lv.40 trong khi Chiến Binh 259".
//
// Mô tả viết tiếng Việt: bộ test bắt mọi item phải có mô tả tiếng Việt.
// ---------------------------------------------------------------------------
const MISSING = [
  // ===== BẬC 25 =====
  { id: 'hunter_legguards', name: '🦵 Hunter Legguards', slot: 'legs', type: 'medium', lv: 25, tier: 'rare', desc: 'Quần da của thợ săn, nhẹ và không vướng khi chạy.' },
  { id: 'hunter_treads',    name: '🥾 Hunter Treads',    slot: 'feet', type: 'medium', lv: 25, tier: 'rare', desc: 'Giày bám tuyết, giữ ấm cả khi đứng chờ rất lâu.' },
  { id: 'conjurer_hood',    name: '🧙 Conjurer Hood',    slot: 'head', type: 'robe',   lv: 25, tier: 'rare', desc: 'Mũ trùm dệt từ tơ phép, che mắt kẻ khác nhưng không che tầm nhìn.' },
  { id: 'conjurer_leggings',name: '👖 Conjurer Leggings',slot: 'legs', type: 'robe',   lv: 25, tier: 'rare', desc: 'Quần vải dày của người luyện phép đường dài.' },
  { id: 'conjurer_slippers',name: '🥿 Conjurer Slippers',slot: 'feet', type: 'robe',   lv: 25, tier: 'rare', desc: 'Dép mềm, bước đi không phát ra tiếng.' },

  // ===== BẬC 30 =====
  { id: 'warplate_helm',    name: '⛑️ Warplate Helm',     slot: 'head', type: 'heavy',  lv: 30, tier: 'epic', desc: 'Mũ giáp dày, chịu được một cú búa thẳng vào đầu.' },
  { id: 'warplate_chest',   name: '🛡️ Warplate Cuirass',  slot: 'chest',type: 'heavy',  lv: 30, tier: 'epic', desc: 'Giáp ngực rèn liền khối, nặng nhưng không gò bó.' },
  { id: 'stalker_hood',     name: '🎭 Stalker Hood',      slot: 'head', type: 'medium', lv: 30, tier: 'epic', desc: 'Mũ trùm của kẻ theo dõi, che khuôn mặt khỏi ánh trăng.' },
  { id: 'stalker_vest',     name: '🦺 Stalker Vest',      slot: 'chest',type: 'medium', lv: 30, tier: 'epic', desc: 'Áo giáp nhẹ có lớp lót, đủ chặn móng vuốt.' },
  { id: 'stalker_legguards',name: '🦵 Stalker Legguards',  slot: 'legs', type: 'medium', lv: 30, tier: 'epic', desc: 'Quần bọc da quanh đùi, giữ được mạng khi bị phục kích.' },
  { id: 'stalker_grips',    name: '🧤 Stalker Grips',     slot: 'hands',type: 'medium', lv: 30, tier: 'epic', desc: 'Găng tay chắc, giữ dây cung không trượt khi máu chảy.' },
  { id: 'stormweave_hood',  name: '🧙 Stormweave Hood',   slot: 'head', type: 'robe',   lv: 30, tier: 'epic', desc: 'Mũ dệt từ sợi giông, tóc vẫn khô dù mưa lớn.' },
  { id: 'stormweave_robe',  name: '👘 Stormweave Robe',   slot: 'chest',type: 'robe',   lv: 30, tier: 'epic', desc: 'Áo choàng phép thuật, vải tự khép lại chỗ rách.' },
  { id: 'stormweave_boots', name: '🥾 Stormweave Boots',  slot: 'feet', type: 'robe',   lv: 30, tier: 'epic', desc: 'Giày vải lót lông, đi trên băng không buốt.' },

  // ===== BẬC 40 =====
  { id: 'drakeskin_hood',   name: '🐲 Drakeskin Hood',    slot: 'head', type: 'medium', lv: 40, tier: 'legendary', desc: 'Mũ làm từ da rồng non, ấm và không thấm nước.' },
  { id: 'drakeskin_legguards', name: '🦵 Drakeskin Legguards', slot: 'legs', type: 'medium', lv: 40, tier: 'legendary', desc: 'Quần da rồng, mềm hơn thép nhưng bền hơn.' },
  { id: 'drakeskin_treads',  name: '🥾 Drakeskin Treads',  slot: 'feet', type: 'medium', lv: 40, tier: 'legendary', desc: 'Giày da rồng, đế dày chịu được dung nham.' },
  { id: 'drakeskin_grips',   name: '🧤 Drakeskin Grips',   slot: 'hands',type: 'medium', lv: 40, tier: 'legendary', desc: 'Găng da rồng, cầm cung mà không run.' },
  { id: 'starweave_leggings',name: '👖 Starweave Leggings',slot: 'legs', type: 'robe',   lv: 40, tier: 'legendary', desc: 'Quần dệt từ ánh sao, nhẹ như không mặc gì.' },
  { id: 'starweave_slippers',name: '🥿 Starweave Slippers',slot: 'feet', type: 'robe',   lv: 40, tier: 'legendary', desc: 'Dép phép thuật, mỗi bước để lại một vệt sáng mờ.' },

  // ===== BẬC 45 =====
  { id: 'astral_helm',      name: '⛑️ Astral Helm',       slot: 'head', type: 'heavy',  lv: 45, tier: 'legendary', desc: 'Mũ giáp khắc tinh tú, đội vào nghe thấy tiếng vũ trụ.' },
  { id: 'astral_boots',     name: '🥾 Astral Boots',      slot: 'feet', type: 'heavy',  lv: 45, tier: 'legendary', desc: 'Giày sắt nặng, bước xuống đất là đá nứt.' },
  { id: 'astral_gauntlets', name: '🧤 Astral Gauntlets',  slot: 'hands',type: 'heavy',  lv: 45, tier: 'legendary', desc: 'Găng sắt khắc tinh tú, nắm được cả ánh sáng.' },
  { id: 'astral_hood',      name: '🎭 Astral Hood',       slot: 'head', type: 'medium', lv: 45, tier: 'legendary', desc: 'Mũ trùm tinh tú, mắt người khác không bắt được.' },
  { id: 'astral_legguards', name: '🦵 Astral Legguards',  slot: 'legs', type: 'medium', lv: 45, tier: 'legendary', desc: 'Quần tinh tú, nhẹ tới mức quên là đang mặc.' },
  { id: 'astral_treads',    name: '🥾 Astral Treads',     slot: 'feet', type: 'medium', lv: 45, tier: 'legendary', desc: 'Giày tinh tú, đặt chân lên bất cứ đâu cũng như mặt đất.' },
  { id: 'astral_grips',     name: '🧤 Astral Grips',      slot: 'hands',type: 'medium', lv: 45, tier: 'legendary', desc: 'Găng tinh tú, giữ dây cung trong cả cơn bão sao.' },
  { id: 'astralraiment_hood', name: '🧙 Astralraiment Hood', slot: 'head', type: 'robe', lv: 45, tier: 'legendary', desc: 'Mũ trùm của người đi xa hơn cả bầu trời.' },
  { id: 'astralraiment_robe', name: '👘 Astralraiment Robe', slot: 'chest',type: 'robe', lv: 45, tier: 'legendary', desc: 'Áo choàng ánh sao, mỗi sợi vải là một quỹ đạo.' },
  { id: 'astralraiment_leggings', name: '👖 Astralraiment Leggings', slot: 'legs', type: 'robe', lv: 45, tier: 'legendary', desc: 'Quần ánh sao, không nặng thêm dù ướt.' },
  { id: 'astralraiment_slippers', name: '🥿 Astralraiment Slippers', slot: 'feet', type: 'robe', lv: 45, tier: 'legendary', desc: 'Dép ánh sao, lướt đi như không chạm đất.' },
  { id: 'astralraiment_gloves',   name: '🧤 Astralraiment Gloves',   slot: 'hands',type: 'robe', lv: 45, tier: 'legendary', desc: 'Găng ánh sao, ngón tay vẫn cảm nhận được gió.' },
];

// Mô tả tiếng Việt cho các món giáp cũ đang là tiếng Anh thô.
// (Bộ test lore yêu cầu mô tả tiếng Việt; các món sinh bởi module này đều có.)

function migrate() {
  const db = require('../db/database');

  // THỨ TỰ MIGRATE — lỗi thật đã bỏ sót.
  //
  // classes.migrate() gán weapon_type/armor_type cho các món vũ khí cũ, nhưng
  // nó chạy TRƯỚC khi các món đó được seed vào DB. Trên một DB mới, câu UPDATE
  // không tìm thấy dòng nào, nên wood_sword giữ weapon_type = '' và Chiến Binh
  // KHÔNG mặc được vũ khí khởi đầu của mình.
  //
  // Đo được: trên DB mới, Lv.1 Chiến Binh có 24 ATK còn Pháp Sư/Cung Thủ 29 →
  // thắng 48% ở forest trong khi hai class kia 82%/66%. Trên DB cũ (đã chạy
  // migrate lần hai) lỗi này không lộ ra, nên rất dễ bỏ qua.
  //
  // Module này chạy SAU khi mọi item đã tồn tại, nên gọi lại ở đây là đúng chỗ.
  try { require('./classes').seedClassItems(); } catch { /* classes.js lỗi thì bỏ qua */ }

  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS shop (
    item_id TEXT PRIMARY KEY,
    price   INTEGER NOT NULL
  )`);

  // ---------- 1. Lấp giáp còn thiếu ----------
  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, heal, price, sell, desc,
     class_req, weapon_type, armor_type, accessory_type, armor_slot, min_level)
    VALUES (?,?,?,?,0,?,0,?,?,?,'','',?,'',?,?)`);
  let added = 0;
  for (const m of MISSING) {
    const def = armorDef(m.slot, m.lv);
    // Giá: dùng công thức kinh tế nếu có, không thì suy từ mốc level
    let price = 500;
    try {
      const eco = require('./economy_seed');
      price = eco.targetPrice({ type: 'armor', tier: m.tier, min_level: m.lv });
    } catch { price = Math.round(60 * Math.pow(m.lv, 1.6) / 50) * 50; }
    const sell = Math.round(price * 0.4);
    added += insItem.run(m.id, m.name, 'armor', m.tier, def, price, sell, m.desc,
      m.type, m.slot, m.lv).changes;
  }

  // ---------- 2. Giáp: một bảng chung, bỏ khoá class ----------
  //
  // class_req của giáp bị xoá vì mọi class dùng CÙNG bảng; khác biệt được áp
  // bằng armor_share. Giữ class_req lại sẽ khiến Pháp Sư phải mặc đồ vải cũ
  // Lv.1 và mất toàn bộ DEF của bậc — đúng lỗi đang sửa.
  const armorRows = db.prepare("SELECT id, armor_slot, min_level FROM items WHERE type='armor'").all();
  const updArmor = db.prepare(`UPDATE items SET def = ?, class_req = '' WHERE id = ?`);
  let armorChanged = 0;
  for (const a of armorRows) {
    const def = armorDef(a.armor_slot, a.min_level || 1);
    armorChanged += updArmor.run(def, a.id).changes;
  }

  // ---------- 3. Phụ kiện: +ATK = +DEF ở mọi món ----------
  const accRows = db.prepare("SELECT id, min_level FROM items WHERE type='accessory'").all();
  const updAcc = db.prepare('UPDATE items SET atk = ?, def = ?, class_req = ? WHERE id = ?');
  for (const a of accRows) {
    const v = accValue(a.min_level || 1);
    updAcc.run(v, v, '', a.id);
  }

  // ---------- 4. Tay phụ: +ATK = +DEF ----------
  const offRows = db.prepare("SELECT id, min_level FROM items WHERE type='offhand'").all();
  const updOff = db.prepare('UPDATE items SET atk = ?, def = ? WHERE id = ?');
  for (const o of offRows) {
    const v = offhandValue(o.min_level || 1);
    updOff.run(v, v, o.id);
  }

  // ---------- 5. Vũ khí: +DEF = 0 ----------
  //
  // Kiếm từng cộng 1–6 DEF, nên "vũ khí mạnh nhất" đồng thời là "giáp tốt
  // nhất" và chỉ Chiến Binh có. Nay vũ khí chỉ là sát thương.
  db.prepare(`UPDATE items SET def = 0 WHERE type='weapon'
    AND weapon_type IN ('sword','axe','mace','staff','wand','orb','bow','crossbow','gun')`).run();

  // ---------- 6. Bán trong shop để không món nào thành đồ chết ----------
  //
  // Test "trang bị thường đều kiếm được" bắt mọi món phải có nguồn. Đồ
  // legendary được phép là phần thưởng, nhưng ở đây bán luôn cho gọn: người
  // chơi cày vàng là có, không phải chờ sự kiện.
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  let shopAdded = 0;
  for (const m of MISSING) shopAdded += insShop.run(m.id).changes;

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run('gear_ladder_v1', String(Date.now()));

  if (added || armorChanged || shopAdded) {
    console.log(`🧰 Gear ladder: +${added} giáp còn thiếu, chuẩn hoá ${armorChanged} giáp / ${accRows.length} phụ kiện / ${offRows.length} tay phụ, +${shopAdded} vào shop`);
  }
  return { added, armorChanged, acc: accRows.length, off: offRows.length, shopAdded };
}

module.exports = {
  migrate, bandOf, armorDef, accValue, offhandValue,
  BANDS, ARMOR_BUDGET, SLOT_SHARE, ACC_BUDGET, OFFHAND, MISSING,
};
