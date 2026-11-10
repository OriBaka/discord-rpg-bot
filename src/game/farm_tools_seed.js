// CÔNG CỤ FARM — pickaxe & cần câu.
//
// LỖI CHẶN đã đo được trước khi viết module này:
//   !mine  → "⛏️ Bạn cần Pickaxe để đào! Mua ở shop"
//   !fish  → "🎣 Bạn cần Fishing Rod để câu! Mua ở shop"
//   Nhưng DB có 0 item weapon_type='pickaxe' và 0 item 'fishing_rod'.
//   Công cụ chỉ tồn tại trong seeder admin-gated (shop_reseed, high_tier_seed)
//   nên chưa bao giờ được tạo trên DB mặc định.
//
// Hệ quả: hai kỹ năng farm hoàn toàn không dùng được với bất kỳ ai.
// Bot chỉ người chơi tới shop, shop không bán gì, tính năng chết.
//
// Cùng một nguyên nhân với lỗi 76 trang bị mồ côi trước đó: nội dung nằm trong
// seeder admin, không nằm trong chuỗi migrate mặc định.
//
// Vì sao công cụ để type='weapon' (theo quy ước cũ của game):
//   hasTool() tìm công cụ trong INVENTORY, không đòi equip → không chiếm slot
//   vũ khí chiến đấu. weapon_type riêng ('pickaxe' / 'fishing_rod') nên
//   bestGear() của mô hình cân bằng bỏ qua chúng hoàn toàn.
//
// Idempotent, có guard meta.

const db = require('../db/database');

const META_KEY = 'farm_tools_v1';

// Giá neo theo mốc level, cùng thang với economy_seed (số kill để mua).
// Công cụ rẻ hơn vũ khí cùng mốc vì nó không dùng để chiến đấu —
// nhưng vẫn đủ đắt để là khoản đầu tư, không phải đồ bỏ đi.
const TOOLS = [
  // === PICKAXE ===
  { id: 'pick_wood',    name: '⛏️ Wooden Pickaxe',   tier: 'common',    atk: 1,  price: 120,   min_level: 1,  weapon_type: 'pickaxe',
    desc: 'Cán gỗ buộc một mảnh đá nhọn. Đào được đất mềm và đồng — đúng mức một người mới cần, không hơn.' },
  { id: 'pick_copper',  name: '⛏️ Copper Pickaxe',   tier: 'common',    atk: 2,  price: 450,   min_level: 6,  weapon_type: 'pickaxe',
    desc: 'Đầu đồng đúc, mềm nên mòn nhanh nhưng đào đá tốt hơn hẳn cán gỗ. Cái mốc mà mọi thợ mỏ thị trấn đều nhớ.' },
  { id: 'pick_iron',    name: '⛏️ Iron Pickaxe',     tier: 'rare',      atk: 3,  price: 2000,  min_level: 12, weapon_type: 'pickaxe',
    desc: 'Sắt rèn, có mũi thép ở đầu. Lần đầu tiên bạn đào xuyên được lớp đá ong mà không phải bỏ cuốc.' },
  { id: 'pick_silver',  name: '⛏️ Silver Pickaxe',   tier: 'rare',      atk: 4,  price: 4200,  min_level: 18, weapon_type: 'pickaxe',
    desc: 'Đầu bạc dẫn khoáng — khi gần mạch quặng, chuôi nó lạnh đi. Thợ mỏ già tin vào cảm giác đó hơn là mắt.' },
  { id: 'pick_gold',    name: '⛏️ Gold Pickaxe',     tier: 'epic',      atk: 6,  price: 12250, min_level: 25, weapon_type: 'pickaxe',
    desc: 'Vàng mềm hơn sắt, nên mũi đinh phải làm bằng thép mithril hàn vào. Món duy nhất trong game mà vàng là phụ kiện.' },
  { id: 'pick_mithril', name: '⛏️ Mithril Pickaxe',  tier: 'epic',      atk: 8,  price: 26000, min_level: 35, weapon_type: 'pickaxe',
    desc: 'Mithril nhẹ tới mức bạn đào cả ngày không mỏi vai. Cái giá phải trả là thứ nó đào được: chỉ đá cứng mới làm nó sáng lên.' },

  // === CẦN CÂU ===
  { id: 'rod_wood',     name: '🎣 Wooden Rod',       tier: 'common',    atk: 1,  price: 120,   min_level: 1,  weapon_type: 'fishing_rod',
    desc: 'Cần tre buộc dây gân, lưỡi câu uốn bằng tay. Câu được cá nhỏ ở ao làng — đủ để không phải nhịn đói trên đường.' },
  { id: 'rod_bamboo',   name: '🎣 Bamboo Rod',       tier: 'common',    atk: 2,  price: 450,   min_level: 6,  weapon_type: 'fishing_rod',
    desc: 'Tre dẻo, dài hơn cần gỗ nên quăng xa hơn. Cần câu tốt không bắt được nhiều cá hơn — nó chỉ với tới chỗ có cá.' },
  { id: 'rod_iron',     name: '🎣 Iron Rod',         tier: 'rare',      atk: 3,  price: 2000,  min_level: 12, weapon_type: 'fishing_rod',
    desc: 'Cần sắt có khoen dẫn dây, không bị xoắn khi cá lớn giật. Dùng được ở sông chảy xiết, nơi cần tre gãy.' },
  { id: 'rod_silver',   name: '🎣 Silver Rod',       tier: 'rare',      atk: 4,  price: 4200,  min_level: 18, weapon_type: 'fishing_rod',
    desc: 'Bạc ở khoen dẫn sáng lên khi có cá lớn lại gần. Người câu cá lâu năm không cần nhìn phao nữa.' },
  { id: 'rod_gold',     name: '🎣 Gold Rod',         tier: 'epic',      atk: 6,  price: 12250, min_level: 25, weapon_type: 'fishing_rod',
    desc: 'Cần câu của người câu cá chuyên nghiệp, dây bện nhiều lớp. Kéo được cá ngừ nặng hơn cả người cầm nó.' },
  { id: 'rod_mithril',  name: '🎣 Mithril Rod',      tier: 'epic',      atk: 8,  price: 26000, min_level: 35, weapon_type: 'fishing_rod',
    desc: 'Cần mithril, nhẹ tới mức không cảm thấy trọng lượng. Ở biển sâu, nó không cong dù cá kéo tới đâu.' },
];

// Công cụ Lv.1 phải mua được bằng vàng khởi đầu + vài kill đầu.
// Người mới có 50 vàng; 1 kill ở forest ≈ 55 vàng → 120 vàng = ~2 kill. Hợp lý.
const STARTER_CAP = 150;

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  const cols = db.prepare('PRAGMA table_info(items)').all().map(c => c.name);
  const hasMinLevel = cols.includes('min_level');

  const insItem = hasMinLevel
    ? db.prepare(`INSERT OR IGNORE INTO items
        (id, name, type, tier, atk, def, price, sell, desc, weapon_type, min_level)
        VALUES (?,?,?,?,?,0,?,?,?,?,?)`)
    : db.prepare(`INSERT OR IGNORE INTO items
        (id, name, type, tier, atk, def, price, sell, desc, weapon_type)
        VALUES (?,?,?,?,?,0,?,?,?,?)`);

  let itemsAdded = 0;
  for (const t of TOOLS) {
    const price = t.min_level <= 1 ? Math.min(t.price, STARTER_CAP) : t.price;
    const sell = Math.round(price * 0.4);
    const args = hasMinLevel
      ? [t.id, t.name, 'weapon', t.tier, t.atk, price, sell, t.desc, t.weapon_type, t.min_level]
      : [t.id, t.name, 'weapon', t.tier, t.atk, price, sell, t.desc, t.weapon_type];
    itemsAdded += insItem.run(...args).changes;
  }

  // Bán trong shop để !mine / !fish có đường kiếm công cụ
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  let shopAdded = 0;
  for (const t of TOOLS) shopAdded += insShop.run(t.id).changes;

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));

  if (itemsAdded > 0) console.log(`⛏️ Farm tools: +${itemsAdded} công cụ (pickaxe + cần câu)`);
  if (shopAdded > 0) console.log(`🏪 Farm tools: +${shopAdded} công cụ vào shop`);
}

module.exports = { migrate, TOOLS };
