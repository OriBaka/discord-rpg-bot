// CHỢ NGƯỜI CHƠI (player market)
//
// VẤN ĐỀ: trước đây chỉ có `%sell` — bán cho NPC với giá `items.sell` CỐ ĐỊNH
// (≈40% giá shop). Nguyên liệu hiếm (mithril_ore, void_essence, dragon_scale…)
// không có giá thị trường: người có 20 mithril ore và người cần đúng 2 cái để
// chế đồ không gặp nhau được. Đây cũng chính là lý do bùa "săn nguyên liệu
// hiếm" (job_buffs) chưa có phần thưởng kinh tế thật.
//
// CÁCH LÀM: chợ do người chơi tự niêm yết. Người bán đưa item vào ESCROW (trừ
// khỏi túi ngay khi đăng bán) nên không thể vừa bán vừa dùng — đúng lớp lỗi
// dup của %sell ngày trước (equip không lấy item ra khỏi túi).
//
// LUẬT:
//   - Soulbound: không đăng bán (giống %trade).
//   - Đang trang bị: chỉ bán được phần RẢNH (owned − equipped).
//   - Tối đa 10 tin đang bán / người, để chợ không bị một người chiếm hết.
//   - Giá 1..10.000.000 vàng / 1 món (giá theo ĐƠN VỊ, không phải tổng).
//   - Thuế 5% trên tiền bán, VÀNG THUẾ BỊ HUỶ (gold sink). Người bán nhận 95%.
//   - Tin tự hết hạn sau 7 ngày; dọn lazy mỗi lần đọc chợ (không cần cron),
//     và item trong tin hết hạn được TRẢ LẠI túi người bán.
//   - Không mua được tin của chính mình.

const db = require('../db/database');

const MAX_LISTINGS_PER_USER = 10;
const LISTING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TAX_PCT = 0.05;
const MIN_PRICE = 1;
const MAX_PRICE = 10_000_000;

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_listings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id  TEXT NOT NULL,
      item_id    TEXT NOT NULL,
      qty        INTEGER NOT NULL,
      price      INTEGER NOT NULL,          -- giá cho 1 món
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_market_seller ON market_listings(seller_id);
    CREATE INDEX IF NOT EXISTS idx_market_item   ON market_listings(item_id);

    -- Lịch sử bán: để người chơi xem giá thị trường thay vì đoán
    CREATE TABLE IF NOT EXISTS market_sales (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id   TEXT NOT NULL,
      qty       INTEGER NOT NULL,
      price     INTEGER NOT NULL,           -- giá / 1 món lúc bán
      seller_id TEXT NOT NULL,
      buyer_id  TEXT NOT NULL,
      sold_at   INTEGER NOT NULL
    );
  `);
  const columns = new Set(db.prepare('PRAGMA table_info(market_sales)').all().map(c => c.name));
  if (!columns.has('tax')) db.exec('ALTER TABLE market_sales ADD COLUMN tax INTEGER');
  if (!columns.has('payout')) db.exec('ALTER TABLE market_sales ADD COLUMN payout INTEGER');
}

const now = () => Date.now();

// Dọn tin hết hạn + TRẢ LẠI item cho người bán.
// Trả về số tin đã dọn (để command có thể báo nếu cần).
function cleanupExpired() {
  const cutoff = now() - LISTING_TTL_MS;
  const expired = db.prepare('SELECT * FROM market_listings WHERE created_at < ?').all(cutoff);
  if (expired.length === 0) return 0;

  const player = require('./player');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      // addItem của player.js: cộng lại vào túi + hook quest/achievement
      player.addItem(r.seller_id, r.item_id, r.qty);
      db.prepare('DELETE FROM market_listings WHERE id = ?').run(r.id);
    }
  });
  tx(expired);
  return expired.length;
}

function getListing(id) {
  return db.prepare(`SELECT ml.*, i.name, i.tier, i.type, i.price item_price, i.soulbound
    FROM market_listings ml JOIN items i ON i.id = ml.item_id
    WHERE ml.id = ?`).get(id) || null;
}

function allListings() {
  return db.prepare(`SELECT ml.*, i.name, i.tier, i.type, i.type item_type
    FROM market_listings ml JOIN items i ON i.id = ml.item_id
    ORDER BY ml.created_at DESC`).all();
}

function listingsBySeller(sellerId) {
  return db.prepare(`SELECT ml.*, i.name, i.tier, i.type
    FROM market_listings ml JOIN items i ON i.id = ml.item_id
    WHERE ml.seller_id = ? ORDER BY ml.created_at DESC`).all(sellerId);
}

function countBySeller(sellerId) {
  return db.prepare('SELECT COUNT(*) c FROM market_listings WHERE seller_id = ?').get(sellerId).c;
}

function search(term) {
  const q = `%${String(term).toLowerCase()}%`;
  return db.prepare(`SELECT ml.*, i.name, i.tier, i.type
    FROM market_listings ml JOIN items i ON i.id = ml.item_id
    WHERE LOWER(i.name) LIKE ? OR LOWER(ml.item_id) LIKE ?
    ORDER BY ml.price ASC`).all(q, q);
}

function recentSales(itemId = null, limit = 10) {
  if (itemId) {
    return db.prepare(`SELECT ms.*, i.name FROM market_sales ms JOIN items i ON i.id = ms.item_id
      WHERE ms.item_id = ? ORDER BY ms.sold_at DESC LIMIT ?`).all(itemId, limit);
  }
  return db.prepare(`SELECT ms.*, i.name FROM market_sales ms JOIN items i ON i.id = ms.item_id
    ORDER BY ms.sold_at DESC LIMIT ?`).all(limit);
}

// Đăng bán. Item bị trừ khỏi túi NGAY (escrow).
// Trả về { ok, listing } hoặc { ok:false, error }
function createListing(sellerId, itemId, price, qty = 1) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return { ok: false, error: 'no_item' };
  if (item.soulbound) return { ok: false, error: 'soulbound', item };

  price = Math.floor(Number(price));
  qty = Math.floor(Number(qty));
  if (!Number.isFinite(price) || price < MIN_PRICE) return { ok: false, error: 'price_low', item };
  if (price > MAX_PRICE) return { ok: false, error: 'price_high', item };
  if (!Number.isFinite(qty) || qty < 1) return { ok: false, error: 'qty', item };

  if (countBySeller(sellerId) >= MAX_LISTINGS_PER_USER) {
    return { ok: false, error: 'too_many', item };
  }

  const player = require('./player');
  const slots = require('./slots');
  const ownedRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(sellerId, itemId);
  const owned = ownedRow?.qty || 0;
  const equipped = slots.getEquippedCount(sellerId, itemId);
  const free = Math.max(0, owned - equipped);
  if (qty > free) return { ok: false, error: 'not_enough', item, owned, equipped, free };

  const id = db.transaction(() => {
    player.removeItem(sellerId, itemId, qty);
    const info = db.prepare(`INSERT INTO market_listings (seller_id, item_id, qty, price, created_at)
      VALUES (?,?,?,?,?)`).run(sellerId, itemId, qty, price, now());
    return info.lastInsertRowid;
  })();

  return { ok: true, listing: getListing(id), item };
}

// Mua `qty` món từ tin. Trả về { ok, ... } hoặc { ok:false, error }
function buy(buyerId, listingId, qty = 1) {
  cleanupExpired();
  const listing = getListing(listingId);
  if (!listing) return { ok: false, error: 'no_listing' };
  if (listing.seller_id === buyerId) return { ok: false, error: 'own_listing', listing };

  qty = Math.floor(Number(qty) || 0);
  if (qty < 1) return { ok: false, error: 'qty', listing };
  if (qty > listing.qty) return { ok: false, error: 'qty_exceeds', listing };

  const player = require('./player');
  const buyer = player.getPlayer(buyerId);
  if (!buyer) return { ok: false, error: 'no_player' };

  const total = listing.price * qty;
  if (buyer.gold < total) return { ok: false, error: 'no_gold', listing, total, gold: buyer.gold };

  const payout = total - Math.ceil(total * (TAX_PCT * 100) / 100);
  const tax = total - payout;

  db.transaction(() => {
    player.updatePlayer(buyerId, { gold: buyer.gold - total });
    player.addItem(buyerId, listing.item_id, qty);
    player.updatePlayer(listing.seller_id, { gold: sellerGold(listing.seller_id) + payout });
    if (qty === listing.qty) {
      db.prepare('DELETE FROM market_listings WHERE id = ?').run(listingId);
    } else {
      db.prepare('UPDATE market_listings SET qty = qty - ? WHERE id = ?').run(qty, listingId);
    }
    db.prepare(`INSERT INTO market_sales (item_id, qty, price, seller_id, buyer_id, sold_at, tax, payout)
      VALUES (?,?,?,?,?,?,?,?)`).run(listing.item_id, qty, listing.price, listing.seller_id, buyerId, now(), tax, payout);
  })();

  return {
    ok: true, listing, qty, total, payout, tax,
    remaining: listing.qty - qty,
  };
}

function sellerGold(sellerId) {
  const row = db.prepare('SELECT gold FROM players WHERE user_id = ?').get(sellerId);
  return row ? row.gold : 0;
}

// Huỷ tin — trả item về túi. Chỉ chủ tin mới huỷ được.
function cancel(sellerId, listingId) {
  const listing = getListing(listingId);
  if (!listing) return { ok: false, error: 'no_listing' };
  if (listing.seller_id !== sellerId) return { ok: false, error: 'not_owner', listing };

  const player = require('./player');
  db.transaction(() => {
    player.addItem(sellerId, listing.item_id, listing.qty);
    db.prepare('DELETE FROM market_listings WHERE id = ?').run(listingId);
  })();
  return { ok: true, listing };
}

module.exports = {
  migrate, cleanupExpired,
  getListing, allListings, listingsBySeller, countBySeller, search, recentSales,
  createListing, buy, cancel,
  MAX_LISTINGS_PER_USER, LISTING_TTL_MS, TAX_PCT, MIN_PRICE, MAX_PRICE,
};
