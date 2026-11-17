// Read-only diagnostics: deliberately do not require database.js (it migrates).
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const file = process.env.DB_PATH || path.join(__dirname, '../data/rpg.db');
let db;
try {
  db = new Database(file, { readonly: true, fileMustExist: true });
  const check = db.pragma('quick_check').map(r => Object.values(r)[0]);
  const pageSize = db.pragma('page_size', { simple: true });
  const freePages = db.pragma('freelist_count', { simple: true });
  console.log(JSON.stringify({
    file, quickCheck: check, journalMode: db.pragma('journal_mode', { simple: true }),
    pages: db.pragma('page_count', { simple: true }), freePages,
    reusableBytes: freePages * pageSize,
    dbBytes: fs.statSync(file).size,
    walBytes: fs.existsSync(file + '-wal') ? fs.statSync(file + '-wal').size : 0,
    indexes: db.prepare("SELECT name,tbl_name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY tbl_name,name").all(),
  }, null, 2));
  if (check.length !== 1 || check[0] !== 'ok') process.exitCode = 1;
} catch (err) {
  console.error('[db:check]', err.message);
  process.exitCode = 1;
} finally { if (db?.open) db.close(); }
