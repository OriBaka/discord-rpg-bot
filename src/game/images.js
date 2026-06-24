// Image support: thêm cột image_url cho items/monsters/zones/pets/achievements
// Lazy require db để tránh circular dependency (database.js gọi migrate này)
function getDb() {
  return require('./../db/database');
}

function migrate() {
  const db = getDb();
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
  const db = getDb();
  const r = db.prepare(`UPDATE ${table} SET image_url = ? WHERE id = ?`).run(imageUrl || '', id);
  return r.changes > 0;
}

function getImage(table, id) {
  const allowed = ['items', 'monsters', 'zones', 'pets', 'achievements'];
  if (!allowed.includes(table)) return '';
  const db = getDb();
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

// Auto convert GitHub permalink/blob URL → raw URL
// VD: https://github.com/USER/REPO/blob/main/file.png
//   → https://raw.githubusercontent.com/USER/REPO/main/file.png
function normalizeUrl(url) {
  if (!url) return url;

  // GitHub blob URL → raw
  // https://github.com/USER/REPO/blob/BRANCH/PATH
  const ghBlob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (ghBlob) {
    const [, user, repo, branch, filePath] = ghBlob;
    return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
  }

  // GitHub raw refs URL (mới): https://github.com/USER/REPO/raw/refs/heads/BRANCH/PATH
  const ghRefs = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/refs\/heads\/([^/]+)\/(.+)$/);
  if (ghRefs) {
    const [, user, repo, branch, filePath] = ghRefs;
    return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
  }

  // GitHub raw URL (cũ): https://github.com/USER/REPO/raw/BRANCH/PATH
  const ghRaw = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/);
  if (ghRaw) {
    const [, user, repo, branch, filePath] = ghRaw;
    return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${filePath}`;
  }

  return url; // Không phải URL GitHub → giữ nguyên
}

module.exports = { migrate, setImage, getImage, isValidImageUrl, normalizeUrl };
