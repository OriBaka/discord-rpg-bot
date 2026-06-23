// Wrapper đọc items từ DB (thay cho hardcode trước đây)
const db = require('../db/database');

function getItem(id) {
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) || null;
}

function getAllItems() {
  return db.prepare('SELECT * FROM items ORDER BY type, tier, name').all();
}

function getItemsByType(type) {
  return db.prepare('SELECT * FROM items WHERE type = ? ORDER BY tier, name').all(type);
}

function createItem({ id, name, type, tier = 'common', atk = 0, def = 0, heal = 0, price = 0, sell = 0, desc = '' }) {
  db.prepare(`INSERT INTO items (id, name, type, tier, atk, def, heal, price, sell, desc)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, type, tier, atk, def, heal, price, sell, desc);
  return getItem(id);
}

function updateItem(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE items SET ${setClause} WHERE id = ?`).run(...values, id);
  return getItem(id);
}

function deleteItem(id) {
  return db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0;
}

// ===== Compatibility layer: object ITEMS truy cập như cũ =====
// Code cũ dùng `ITEMS[id]` → bọc Proxy cho tương thích
const ITEMS = new Proxy({}, {
  get(_, id) {
    if (typeof id !== 'string') return undefined;
    return getItem(id) || undefined;
  },
  has(_, id) { return !!getItem(id); },
  ownKeys() {
    return db.prepare('SELECT id FROM items').all().map(r => r.id);
  },
  getOwnPropertyDescriptor(_, id) {
    const it = getItem(id);
    return it ? { enumerable: true, configurable: true, value: it } : undefined;
  },
});

module.exports = {
  ITEMS,
  getItem, getAllItems, getItemsByType,
  createItem, updateItem, deleteItem,
};
