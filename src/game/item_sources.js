// Cấp NGUỒN KIẾM cho mọi trang bị.
//
// Vấn đề đo được: 76/124 trang bị trong DB không có nguồn nào — không bán ở
// shop, không drop, không recipe, không lootbox. Nặng nhất là vũ khí:
//   Lv30 sword_warblade / staff_storm / bow_stormfeather
//   Lv35 sword_emberforge / staff_soulfire / bow_emberwind
//   Lv40 void_blade / staff_voidsong / bow_dragonbone
//   Lv45 sword_astral / staff_astral / bow_astral
// → Pháp Sư và Cung Thủ kẹt ở atk 26 từ Lv.25 đến Lv.45 vì không có vũ khí
//   nào kiếm được, trong khi Chiến Binh lấy được dragon_sword atk 48.
//   Đây là lỗi chặn tiến trình: người chơi không thể mạnh lên dù lên cấp.
//
// Cách cấp nguồn (theo mốc level, KHÔNG dựa vào nghề chế tạo vì nghề cần
// ~59.000 XP để đạt Lv.25 — không ai chơi tới đó bằng đường craft thường):
//   • Trang bị Lv.12–28 (cấp trung)  → bán trong shop, giá ~18–30 kill
//   • Trang bị Lv.30–45 (cấp cao)    → drop từ 3 quái mạnh nhất đầu zone
//                                       tương ứng, chance 4–10%
//
// Idempotent: dùng INSERT OR IGNORE, chạy trong chuỗi migrate.

const db = require('../db/database');

// ---------------------------------------------------------------------------
// 1) BÁN TRONG SHOP — trang bị cấp trung (Lv.12–28)
// Giá tính theo "số kill để mua được" ở zone tương ứng (xem tools/audit_sources.js):
//   iron_*    (Lv12, def 7–12)   →  5–7 kill
//   mage_*/hunter_* (Lv12)       →  4–6 kill
//   knight_*/archmage_*/ranger_* (Lv25) → 10–14 kill
// ---------------------------------------------------------------------------
const SHOP_GEAR = [
  // Lv.12 — bộ giáp theo class (trước đây chỉ có chest là kiếm được)
  ['iron_helm', 8], ['iron_greaves', 10], ['iron_boots', 9], ['iron_gauntlets', 9],
  ['chain_mail', 12], ['hunter_quiver', 14],
  ['mage_hood', 9], ['mage_robe', 11], ['mage_pants', 9], ['mage_slippers', 8], ['mage_gloves', 8],
  ['hunter_hood', 9], ['hunter_vest', 12], ['hunter_pants', 10], ['hunter_boots', 9], ['hunter_gloves', 9],

  // Lv.25 — bộ giáp cao cấp theo class
  ['knight_armor', 24], ['knight_helm', 20], ['knight_plate', 30], ['knight_greaves', 24],
  ['knight_boots', 20], ['knight_gauntlets', 22], ['knight_shield', 30],
  ['archmage_robe', 28], ['archmage_gloves', 18], ['flame_orb', 26],
  ['ranger_hat', 20], ['ranger_garb', 26], ['ranger_gloves', 18], ['ranger_quiver', 24],

  // Lv.25–28 — phụ kiện
  ['flame_ring', 26], ['guardian_ring', 26], ['phoenix_amulet', 28],
  ['hunter_mark', 32], ['scholar_tome', 32], ['ring_arcanist', 30],
];

// ---------------------------------------------------------------------------
// 2) DROP TỪ QUÁI — trang bị cấp cao (Lv.30–45)
// Mỗi zone: 3 quái mạnh nhất (hp cao nhất) drop bộ trang bị của mốc level đó.
// chance 4–10% → người chơi cày vài chục kill là có, không phải chờ may mắn.
// ---------------------------------------------------------------------------
const ZONE_DROPS = {
  // Lv.30 — vào Frozen Abyss
  frozen_abyss: {
    mobs: ['abyss_leviathan', 'glacier_wyrm', 'frost_revenant'],
    items: ['sword_warblade', 'staff_storm', 'bow_stormfeather',
            'legs_warplate', 'legs_stormweave', 'feet_warspirit', 'feet_swiftshadow',
            'hands_warfist', 'hands_runeweave', 'neck_soulbind', 'special_slayer'],
  },
  // Lv.35 — vẫn cày Frozen Abyss (không có zone riêng cho mốc này)
  //   → gắn vào cùng quái nhưng chance thấp hơn
  // Lv.40 — vào Astral Ruins
  astral_ruins: {
    mobs: ['star_devourer', 'astral_sentinel', 'void_harbinger'],
    items: ['void_blade', 'staff_voidsong', 'bow_dragonbone',
            'dragon_armor', 'void_robe', 'void_amulet', 'void_compass',
            'dragon_helm', 'archmage_hood', 'void_robe_chest',
            'dragon_greaves', 'dragon_boots', 'dragon_claws',
            'dragon_shield', 'void_orb', 'void_quiver'],
  },
  // Lv.45 — vẫn cày Astral Ruins
};

// Bộ Lv.35 và Lv.45 dùng chung quái của zone tương ứng với chance thấp hơn
const HIGH_TIER_EXTRA = [
  // [zone, item]
  ['frozen_abyss', 'sword_emberforge'],
  ['frozen_abyss', 'staff_soulfire'],
  ['frozen_abyss', 'bow_emberwind'],
  ['astral_ruins', 'sword_astral'],
  ['astral_ruins', 'staff_astral'],
  ['astral_ruins', 'bow_astral'],
  ['astral_ruins', 'legs_astral'],
  ['astral_ruins', 'feet_astral'],
  ['astral_ruins', 'hands_astral'],
  ['astral_ruins', 'head_astral'],
  ['astral_ruins', 'chest_astral'],
  ['astral_ruins', 'neck_astral'],
  ['astral_ruins', 'special_astral'],
];

// Quái mạnh nhất mỗi zone cho bộ Lv.35 / Lv.45
const EXTRA_DROP_MOBS = {
  frozen_abyss: ['abyss_leviathan', 'glacier_wyrm'],
  astral_ruins: ['star_devourer', 'astral_sentinel'],
};

// Tỉ lệ drop: cấp càng cao càng hiếm
const CHANCE = {
  main: 0.08,    // bộ chính của zone (Lv.30 / Lv.40)
  extra: 0.05,   // bộ phụ (Lv.35 / Lv.45)
};

function migrate() {
  const itemExists = db.prepare('SELECT 1 FROM items WHERE id = ?');
  const mobExists = db.prepare('SELECT 1 FROM monsters WHERE id = ?');

  // --- 1) Shop ---
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  const setPrice = db.prepare('UPDATE items SET price = ? WHERE id = ? AND type != ?');
  let shopAdded = 0;
  for (const [id, price] of SHOP_GEAR) {
    if (!itemExists.get(id)) continue;
    setPrice.run(price, id, 'material');       // chỉ áp cho trang bị
    shopAdded += insShop.run(id).changes;
  }

  // --- 2) Drop từ quái ---
  const insDrop = db.prepare('INSERT OR IGNORE INTO monster_drops (monster_id, item_id, chance, qty) VALUES (?,?,?,?)');
  let dropsAdded = 0;

  for (const [zoneId, cfg] of Object.entries(ZONE_DROPS)) {
    const mobs = cfg.mobs.filter(m => mobExists.get(m));
    if (mobs.length === 0) continue;
    cfg.items.forEach((itemId, idx) => {
      if (!itemExists.get(itemId)) return;
      // rải item lần lượt qua các quái để mỗi con có bộ drop khác nhau
      const mob = mobs[idx % mobs.length];
      dropsAdded += insDrop.run(mob, itemId, CHANCE.main, 1).changes;
    });
  }

  for (const [zoneId, itemId] of HIGH_TIER_EXTRA) {
    if (!itemExists.get(itemId)) continue;
    const mobs = (EXTRA_DROP_MOBS[zoneId] || []).filter(m => mobExists.get(m));
    if (mobs.length === 0) continue;
    // gắn vào con mạnh nhất của zone
    dropsAdded += insDrop.run(mobs[0], itemId, CHANCE.extra, 1).changes;
  }

  if (shopAdded > 0) console.log(`🛒 Item sources: +${shopAdded} trang bị vào shop`);
  if (dropsAdded > 0) console.log(`🎁 Item sources: +${dropsAdded} drop trang bị từ quái`);
}

module.exports = { migrate, SHOP_GEAR, ZONE_DROPS, HIGH_TIER_EXTRA };
