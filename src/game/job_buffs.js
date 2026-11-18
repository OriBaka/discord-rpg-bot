// VẬT PHẨM BỔ TRỢ DÙNG MỘT LẦN (job buffs)
//
// Khác với job_tools (công cụ vĩnh viễn trong túi), đây là consumable: dùng 1
// cái → buff có hiệu lực trong N LƯỢT hành động của nghề đó, rồi hết.
//
// Vì sao cần: công cụ chỉ có 1 trục tiến bộ (mua đắt hơn = mạnh hơn), nên sau
// khi đã có công cụ tốt nhất thì không còn gì để tiêu vàng cho nghề, và người
// chơi không có cách nào "dồn lực" cho một mục tiêu cụ thể (vd cần mithril ore
// để chế đồ). Buff ngắn hạn giải quyết cả hai: tạo chỗ tiêu vàng lặp lại và cho
// người chơi quyền chọn thời điểm bung sức.
//
// CỘNG DỒN với công cụ (cộng %, không nhân), nhưng có TRẦN để không phá drop:
//   drop  ≤ +60%   qty ≤ +60%   extra (cook) ≤ +40%   save (craft) ≤ +40%
// (công cụ tối đa +15% rơi / +30% số lượng, buff tối đa +50% rơi / +20% extra)
//
// GIÁ: tính từ số đo gold/lượt ở đúng cấp mở khoá, không đoán tay —
//   bậc 1 (3 lượt, mở ở Lv.10): 12 vàng = 4/lượt,  gain đo được 4–7/lượt
//   bậc 2 (5 lượt, mở ở Lv.25): 80 vàng = 16/lượt, gain đo được 22–41/lượt
// Lấy mốc THẤP NHẤT (fishing) để nghề nào cũng có lãi dương ở cấp mở khoá.
// Bản nháp đầu để 150/600 vàng: đo ra lỗ ròng -48…-111 vàng mỗi lượt ở Lv.1–35,
// tức một cái bẫy giá cho người mới. test/job_buffs.test.js khoá điều này lại.

const db = require('../db/database');

const CAPS = { drop: 0.60, qty: 0.60, extra: 0.40, save: 0.40 };

const META_KEY = 'job_buffs_v1';

// [item_id, job, charges, drop_bonus, qty_bonus, extra_chance, save_chance]
const BUFF_ITEMS = [
  // === MINING — đuốc/đèn: thấy mạch quặng trong tối ===
  ['torch_pitch',  'mining',   3, 0.25, 0, 0, 0],
  ['torch_oil',    'mining',   5, 0.50, 0, 0, 0],

  // === FISHING — mồi ===
  ['bait_worm',    'fishing',  3, 0.25, 0, 0, 0],
  ['bait_glow',    'fishing',  5, 0.50, 0, 0, 0],

  // === FORAGING — bó thảo mộc dẫn hương ===
  ['bundle_herb',  'foraging', 3, 0.25, 0, 0, 0],
  ['bundle_bloom', 'foraging', 5, 0.50, 0, 0, 0],

  // === COOKING — gia vị: cơ hội ra thêm 1 phần ===
  ['spice_salt',   'cooking',  3, 0, 0, 0.10, 0],
  ['spice_saffron','cooking',  5, 0, 0, 0.20, 0],

  // === CRAFTING — dầu tôi: cơ hội không tiêu nguyên liệu ===
  ['oil_quench',   'crafting', 3, 0, 0, 0, 0.10],
  ['oil_master',   'crafting', 5, 0, 0, 0, 0.20],
];

const NEW_ITEMS = [
  { id: 'torch_pitch',   name: '🔥 Pitch Torch',        tier: 'common', price: 12,  min_level: 10,
    desc: 'Đuốc tẩm nhựa thông, cháy đủ ba lượt đào. Ánh lửa soi được vệt quặng ẩn trong đá — thứ mà mắt thường bỏ qua.' },
  { id: 'torch_oil',     name: '🔥 Oil Lantern',        tier: 'rare',   price: 80,  min_level: 25,
    desc: 'Đèn dầu chụp kín gió, cháy đều năm lượt. Thợ mỏ lâu năm không xuống hang sâu mà thiếu nó.' },

  { id: 'bait_worm',     name: '🪱 Worm Bait',          tier: 'common', price: 12,  min_level: 10,
    desc: 'Giun đất bọc vải ẩm, đủ cho ba lần quăng câu. Cá nhỏ không cưỡng được thứ này.' },
  { id: 'bait_glow',     name: '🪱 Glow Bait',          tier: 'rare',   price: 80,  min_level: 25,
    desc: 'Mồi tẩm bột phát sáng, dùng được năm lượt. Cá sâu vốn không nhìn thấy gì — cho tới khi có thứ này.' },

  { id: 'bundle_herb',   name: '🌿 Herb Bundle',        tier: 'common', price: 12,  min_level: 10,
    desc: 'Bó thảo mộc khô buộc dây gai, đốt ba lượt. Mùi của nó khiến ong dẫn đường tới chỗ có hoa quả.' },
  { id: 'bundle_bloom',  name: '🌿 Nightbloom Bundle',  tier: 'rare',   price: 80,  min_level: 25,
    desc: 'Hoa nở về đêm phơi khô, cháy năm lượt. Người hái lượm tin rằng khói của nó gọi cây ra chỗ mình.' },

  { id: 'spice_salt',    name: '🧂 Rock Salt',          tier: 'common', price: 12,  min_level: 10,
    desc: 'Muối đá giã thô, rắc được ba lần nấu. Món ăn đậm hơn nên chia được phần cho người khác.' },
  { id: 'spice_saffron', name: '🧂 Saffron Thread',     tier: 'rare',   price: 80,  min_level: 25,
    desc: 'Nhụy hoa nghệ tây, đắt tới mức chỉ dùng cho khách quý. Năm lần nấu, mỗi lần thêm một phần.' },

  { id: 'oil_quench',    name: '🛢️ Quenching Oil',      tier: 'common', price: 12,  min_level: 10,
    desc: 'Dầu tôi thép đựng trong bầu da, đủ ba lần rèn. Tôi đúng cách thì mối ghép không nứt, không phải làm lại.' },
  { id: 'oil_master',    name: '🛢️ Master Flux Oil',    tier: 'rare',   price: 80,  min_level: 25,
    desc: 'Dầu pha hàn the của thợ rèn già. Năm lần rèn, và vật liệu dường như trôi đúng chỗ mà không hao.' },
];

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS job_buff_items (
      item_id      TEXT PRIMARY KEY,
      job          TEXT NOT NULL,
      charges      INTEGER NOT NULL DEFAULT 1,
      drop_bonus   REAL NOT NULL DEFAULT 0,
      qty_bonus    REAL NOT NULL DEFAULT 0,
      extra_chance REAL NOT NULL DEFAULT 0,
      save_chance  REAL NOT NULL DEFAULT 0
    );

    -- 1 buff đang có hiệu lực cho mỗi nghề. PK theo (user, job): dùng cái mới
    -- THAY cái cũ cùng nghề (không stack vô hạn), khác nghề thì song song OK.
    CREATE TABLE IF NOT EXISTS job_buffs (
      user_id      TEXT NOT NULL,
      job          TEXT NOT NULL,
      item_id      TEXT NOT NULL,
      charges      INTEGER NOT NULL DEFAULT 0,
      drop_bonus   REAL NOT NULL DEFAULT 0,
      qty_bonus    REAL NOT NULL DEFAULT 0,
      extra_chance REAL NOT NULL DEFAULT 0,
      save_chance  REAL NOT NULL DEFAULT 0,
      started_at   INTEGER NOT NULL,
      PRIMARY KEY (user_id, job)
    );
  `);

  // 1) Tạo item (idempotent theo id — không dùng meta guard cho phần này)
  const insItem = db.prepare(`INSERT OR IGNORE INTO items
    (id, name, type, tier, atk, def, price, sell, desc, min_level)
    VALUES (?,?,?,?,0,0,?,?,?,?)`);
  let itemsAdded = 0;
  for (const t of NEW_ITEMS) {
    const sell = Math.round(t.price * 0.4);
    itemsAdded += insItem.run(t.id, t.name, 'consumable', t.tier, t.price, sell, t.desc, t.min_level).changes;
  }

  // 2) Bán ở shop (nếu không, lại là nội dung chết)
  const insShop = db.prepare('INSERT OR IGNORE INTO shop (item_id, price) SELECT id, price FROM items WHERE id = ?');
  let shopAdded = 0;
  for (const t of NEW_ITEMS) shopAdded += insShop.run(t.id).changes;

  // 3) Hiệu ứng
  const itemExists = db.prepare('SELECT 1 FROM items WHERE id = ?');
  const insBuff = db.prepare(`INSERT OR IGNORE INTO job_buff_items
    (item_id, job, charges, drop_bonus, qty_bonus, extra_chance, save_chance) VALUES (?,?,?,?,?,?,?)`);
  let statsAdded = 0;
  for (const s of BUFF_ITEMS) {
    if (!itemExists.get(s[0])) { console.warn(`⚠️  job_buffs: thiếu item ${s[0]}`); continue; }
    statsAdded += insBuff.run(...s).changes;
  }

  db.prepare('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
  if (!db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(META_KEY, String(Date.now()));
    if (itemsAdded) console.log(`🔥 Job buffs: +${itemsAdded} vật phẩm bổ trợ (dùng 1 lần)`);
    if (shopAdded) console.log(`🏪 Job buffs: +${shopAdded} vật phẩm vào shop`);
    if (statsAdded) console.log(`⚗️  Job buffs: +${statsAdded} hiệu ứng`);
  }
}

function getBuffItem(itemId) {
  return db.prepare('SELECT * FROM job_buff_items WHERE item_id = ?').get(itemId) || null;
}

function getBuffItemsByJob(job) {
  return db.prepare(`SELECT jb.*, i.name, i.price, i.min_level, i.desc
    FROM job_buff_items jb JOIN items i ON i.id = jb.item_id
    WHERE jb.job = ? ORDER BY i.min_level, i.price`).all(job);
}

// Buff đang có hiệu lực của user cho nghề này (null nếu không có/hết lượt)
function get(userId, job) {
  const row = db.prepare('SELECT * FROM job_buffs WHERE user_id = ? AND job = ?').get(userId, job);
  if (!row) return null;
  if (row.charges <= 0) {
    db.prepare('DELETE FROM job_buffs WHERE user_id = ? AND job = ?').run(userId, job);
    return null;
  }
  return row;
}

// Kích hoạt buff. Trả về { ok, buff, replaced, error }.
// KHÔNG tự trừ item — command %use làm việc đó (để không mất item khi lỗi).
function activate(userId, itemId, playerLevel = 999) {
  const stat = getBuffItem(itemId);
  if (!stat) return { ok: false, error: 'not_buff' };
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return { ok: false, error: 'no_item' };
  if ((item.min_level || 1) > playerLevel) return { ok: false, error: 'level', item };

  const old = db.prepare('SELECT * FROM job_buffs WHERE user_id = ? AND job = ?').get(userId, stat.job);
  db.prepare(`INSERT INTO job_buffs
    (user_id, job, item_id, charges, drop_bonus, qty_bonus, extra_chance, save_chance, started_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id, job) DO UPDATE SET
      item_id=excluded.item_id, charges=excluded.charges,
      drop_bonus=excluded.drop_bonus, qty_bonus=excluded.qty_bonus,
      extra_chance=excluded.extra_chance, save_chance=excluded.save_chance,
      started_at=excluded.started_at`)
    .run(userId, stat.job, itemId, stat.charges, stat.drop_bonus, stat.qty_bonus,
         stat.extra_chance, stat.save_chance, Date.now());

  return { ok: true, buff: get(userId, stat.job), item, replaced: old || null };
}

// Trừ 1 lượt sau mỗi lần hành động. Trả về số lượt còn lại (0 = vừa hết).
function consume(userId, job) {
  const row = get(userId, job);
  if (!row) return 0;
  const left = row.charges - 1;
  if (left <= 0) {
    db.prepare('DELETE FROM job_buffs WHERE user_id = ? AND job = ?').run(userId, job);
  } else {
    db.prepare('UPDATE job_buffs SET charges = ? WHERE user_id = ? AND job = ?').run(left, userId, job);
  }
  return Math.max(0, left);
}

function clear(userId, job) {
  db.prepare('DELETE FROM job_buffs WHERE user_id = ? AND job = ?').run(userId, job);
}

// Bonus TỔNG của một nghề = công cụ (vĩnh viễn) + buff (tạm thời), có trần.
// Đây là cửa duy nhất để lấy hệ số — tránh mỗi lệnh tự cộng khác nhau.
function bonus(userId, job, playerLevel = 999) {
  const jobTools = require('./job_tools');
  const tool = jobTools.bonus(userId, job, playerLevel);
  const buff = get(userId, job);
  const aura = require('./aura').jobBonus(userId, job);

  const drop = Math.min(CAPS.drop, (tool.dropMult - 1) + (buff ? buff.drop_bonus : 0) + aura.drop);
  const qty = Math.min(CAPS.qty, (tool.qtyMult - 1) + (buff ? buff.qty_bonus : 0));
  const extra = Math.min(CAPS.extra, tool.extraChance + (buff ? buff.extra_chance : 0) + aura.extra);
  const save = Math.min(CAPS.save, tool.saveChance + (buff ? buff.save_chance : 0) + aura.save);

  return {
    tool: tool.tool,
    buff,
    dropMult: 1 + drop,
    qtyMult: 1 + qty,
    extraChance: extra,
    saveChance: save,
  };
}

function describeItem(stat) {
  if (!stat) return '';
  const parts = [];
  if (stat.drop_bonus > 0) parts.push(`+${Math.round(stat.drop_bonus * 100)}% cơ hội rơi`);
  if (stat.qty_bonus > 0) parts.push(`+${Math.round(stat.qty_bonus * 100)}% số lượng`);
  if (stat.extra_chance > 0) parts.push(`+${Math.round(stat.extra_chance * 100)}% ra thêm 1 món`);
  if (stat.save_chance > 0) parts.push(`+${Math.round(stat.save_chance * 100)}% không tiêu nguyên liệu`);
  return `${parts.join(' • ')} trong ${stat.charges} lượt`;
}

// Dòng ngắn để in trong lệnh: "🔥 Pitch Torch: +25% rơi (còn 2 lượt)"
function describeActive(buff) {
  if (!buff) return '';
  const item = db.prepare('SELECT name FROM items WHERE id = ?').get(buff.item_id);
  const parts = [];
  if (buff.drop_bonus > 0) parts.push(`+${Math.round(buff.drop_bonus * 100)}% rơi`);
  if (buff.qty_bonus > 0) parts.push(`+${Math.round(buff.qty_bonus * 100)}% số lượng`);
  if (buff.extra_chance > 0) parts.push(`+${Math.round(buff.extra_chance * 100)}% thêm món`);
  if (buff.save_chance > 0) parts.push(`+${Math.round(buff.save_chance * 100)}% tiết kiệm NL`);
  return `${item ? item.name : buff.item_id}: ${parts.join(' • ')} (còn ${buff.charges} lượt)`;
}

module.exports = {
  migrate, getBuffItem, getBuffItemsByJob,
  get, activate, consume, clear, bonus, describeItem, describeActive,
  BUFF_ITEMS, NEW_ITEMS, CAPS,
};
