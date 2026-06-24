// Trade system: 2 player thoả thuận, cả 2 ready mới execute
const db = require('./../db/database');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('./player');
const { getItem } = require('./items');

const TRADE_EXPIRE_MS = 5 * 60 * 1000; // 5 phút

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a      TEXT NOT NULL,
      user_b      TEXT NOT NULL,
      offer_a     TEXT NOT NULL DEFAULT '{"gold":0,"items":{}}',  -- JSON
      offer_b     TEXT NOT NULL DEFAULT '{"gold":0,"items":{}}',
      ready_a     INTEGER NOT NULL DEFAULT 0,
      ready_b     INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'open',  -- open | done | cancelled | expired
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      completed_at INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ===== Helpers =====
function parseOffer(s) {
  try {
    const o = JSON.parse(s || '{}');
    return { gold: o.gold || 0, items: o.items || {} };
  } catch {
    return { gold: 0, items: {} };
  }
}

function stringifyOffer(o) {
  return JSON.stringify({ gold: o.gold || 0, items: o.items || {} });
}

// Tìm trade active của user (open, chưa expired)
function getActiveTrade(userId) {
  const t = db.prepare(`SELECT * FROM trades
    WHERE (user_a = ? OR user_b = ?) AND status = 'open'
    AND (? - updated_at) < ?
    ORDER BY id DESC LIMIT 1`)
    .get(userId, userId, Date.now(), TRADE_EXPIRE_MS);
  return t || null;
}

function getTradeById(id) {
  return db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
}

function createTrade(userA, userB) {
  const r = db.prepare(`INSERT INTO trades (user_a, user_b, created_at, updated_at)
    VALUES (?,?,?,?)`).run(userA, userB, Date.now(), Date.now());
  return getTradeById(r.lastInsertRowid);
}

function updateOffer(tradeId, side, offer) {
  const col = side === 'a' ? 'offer_a' : 'offer_b';
  const readyCol = side === 'a' ? 'ready_a' : 'ready_b';
  // Reset ready của BOTH side khi offer thay đổi (tránh scam: B đổi offer sau khi A đã ready)
  db.prepare(`UPDATE trades SET ${col} = ?, ready_a = 0, ready_b = 0, updated_at = ? WHERE id = ?`)
    .run(stringifyOffer(offer), Date.now(), tradeId);
}

function setReady(tradeId, side, ready) {
  const col = side === 'a' ? 'ready_a' : 'ready_b';
  db.prepare(`UPDATE trades SET ${col} = ?, updated_at = ? WHERE id = ?`)
    .run(ready ? 1 : 0, Date.now(), tradeId);
}

function setStatus(tradeId, status) {
  db.prepare(`UPDATE trades SET status = ?, completed_at = ? WHERE id = ?`)
    .run(status, Date.now(), tradeId);
}

// ===== Validate inputs =====
// Trả về { ok, error? } — check user có đủ gold/item để trade
function validateOffer(userId, offer) {
  const p = getPlayer(userId);
  if (!p) return { ok: false, error: 'no_player' };
  if (offer.gold > p.gold) return { ok: false, error: `Không đủ vàng: cần ${offer.gold}, có ${p.gold}` };
  for (const [itemId, qty] of Object.entries(offer.items)) {
    if (!hasItem(userId, itemId, qty)) {
      const it = getItem(itemId);
      const haveRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
      const have = haveRow?.qty || 0;
      return { ok: false, error: `Không đủ ${it?.name || itemId}: cần ${qty}, có ${have}` };
    }
  }
  return { ok: true };
}

// ===== Execute trade (cả 2 đã ready) =====
function executeTrade(trade) {
  const offerA = parseOffer(trade.offer_a);
  const offerB = parseOffer(trade.offer_b);

  // Validate cả 2 còn đủ resource (có thể đã thay đổi sau khi ready)
  const vA = validateOffer(trade.user_a, offerA);
  if (!vA.ok) return { ok: false, error: `User A: ${vA.error}` };
  const vB = validateOffer(trade.user_b, offerB);
  if (!vB.ok) return { ok: false, error: `User B: ${vB.error}` };

  // Transaction-like (better-sqlite3 không có async; chạy tuần tự)
  // 1. Trừ gold/items của A, cộng cho B
  if (offerA.gold > 0) {
    const pA = getPlayer(trade.user_a);
    const pB = getPlayer(trade.user_b);
    updatePlayer(trade.user_a, { gold: pA.gold - offerA.gold });
    updatePlayer(trade.user_b, { gold: pB.gold + offerA.gold });
  }
  for (const [itemId, qty] of Object.entries(offerA.items)) {
    removeItem(trade.user_a, itemId, qty);
    addItem(trade.user_b, itemId, qty);
  }

  // 2. Trừ gold/items của B, cộng cho A
  if (offerB.gold > 0) {
    const pA = getPlayer(trade.user_a);
    const pB = getPlayer(trade.user_b);
    updatePlayer(trade.user_b, { gold: pB.gold - offerB.gold });
    updatePlayer(trade.user_a, { gold: pA.gold + offerB.gold });
  }
  for (const [itemId, qty] of Object.entries(offerB.items)) {
    removeItem(trade.user_b, itemId, qty);
    addItem(trade.user_a, itemId, qty);
  }

  setStatus(trade.id, 'done');
  return { ok: true };
}

// ===== Helper: lấy side của user trong trade =====
function getSide(trade, userId) {
  if (trade.user_a === userId) return 'a';
  if (trade.user_b === userId) return 'b';
  return null;
}

// Lấy offer của 1 side
function getOffer(trade, side) {
  return parseOffer(side === 'a' ? trade.offer_a : trade.offer_b);
}

module.exports = {
  TRADE_EXPIRE_MS,
  migrate,
  parseOffer, stringifyOffer,
  getActiveTrade, getTradeById, createTrade,
  updateOffer, setReady, setStatus,
  validateOffer, executeTrade,
  getSide, getOffer,
}; 
