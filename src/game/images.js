// Image support: thêm cột image_url cho items/monsters/zones/pets/achievements
const db = require('./../db/database');

function migrate() {
  const tables = ['items', 'monsters', 'zones', 'pets', 'achievements'];
  for (const t of tables) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
      if (!cols.includes('image_url')) {
        db.exec(`ALTER TABLE ${t} ADD COLUMN image_url TEXT NOT NULL DEFAULT ''`);
        console.log(`🔧 Migrated ${t}: thêm image_url`);
      }
    } catch (err) {
      // Bảng chưa tồn tại — bỏ qua (sẽ tạo ở migrate khác)
      console.warn(`[image migrate] skip ${t}: ${err.message}`);
    }
  }
}

// === CRUD helpers (set image_url cho entity bất kỳ) ===
function setImage(table, id, imageUrl) {
  const allowed = ['items', 'monsters', 'zones', 'pets', 'achievements'];
  if (!allowed.includes(table)) throw new Error('Invalid table');
  const r = db.prepare(`UPDATE ${table} SET image_url = ? WHERE id = ?`).run(imageUrl || '', id);
  return r.changes > 0;
}

function getImage(table, id) {
  const allowed = ['items', 'monsters', 'zones', 'pets', 'achievements'];
  if (!allowed.includes(table)) return '';
  const r = db.prepare(`SELECT image_url FROM ${table} WHERE id = ?`).get(id);
  return r?.image_url || '';
}

// Validate URL: chỉ accept https://, hoặc rỗng (để xóa)
function isValidImageUrl(url) {
  if (!url || url === '') return true; // rỗng OK (= xóa image)
  if (!/^https:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url)) {
    return false;
  }
  return true;
}

module.exports = { migrate, setImage, getImage, isValidImageUrl }; 
