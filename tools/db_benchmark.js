// Synthetic in-memory data only. Never opens the production database.
const Database = require('better-sqlite3');
const { performance } = require('node:perf_hooks');
const { applyIndexes } = require('../src/db/optimize');
const db = new Database(':memory:');
try {
  db.exec(`CREATE TABLE players(user_id TEXT PRIMARY KEY,name TEXT,level INTEGER,xp INTEGER,gold INTEGER);
    CREATE TABLE market_sales(id INTEGER PRIMARY KEY,item_id TEXT,sold_at INTEGER);`);
  const insPlayer = db.prepare('INSERT INTO players VALUES (?,?,?,?,?)');
  const insSale = db.prepare('INSERT INTO market_sales VALUES (?,?,?)');
  db.transaction(() => {
    for (let i = 0; i < 30000; i++) {
      insPlayer.run(String(i), 'Player ' + i, i % 50, i % 700, i * 13);
      insSale.run(i, 'item_' + (i % 100), i * 1000);
    }
  })();
  const queries = {
    leaderboard: 'SELECT user_id,name,level,xp FROM players ORDER BY level DESC,xp DESC,user_id LIMIT 20',
    itemHistory: "SELECT * FROM market_sales WHERE item_id='item_42' ORDER BY sold_at DESC LIMIT 20",
  };
  function measure(sql) {
    const stmt = db.prepare(sql);
    for (let i = 0; i < 5; i++) stmt.all();
    const start = performance.now();
    for (let i = 0; i < 100; i++) stmt.all();
    return { millisecondsPerQuery: Number(((performance.now() - start) / 100).toFixed(4)),
      plan: db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail) };
  }
  const before = Object.fromEntries(Object.entries(queries).map(([k, sql]) => [k, measure(sql)]));
  applyIndexes(db);
  const after = Object.fromEntries(Object.entries(queries).map(([k, sql]) => [k, measure(sql)]));
  console.log(JSON.stringify({ rowsPerTable: 30000, iterations: 100, before, after }, null, 2));
} finally { db.close(); }
