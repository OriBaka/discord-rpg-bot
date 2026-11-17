const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { quiet, loud, TMP_DIR, ROOT } = require('./harness');
const { INDEXES, applyIndexes, optimize } = require('../src/db/optimize');
let db;
before(() => { quiet(); db = require('../src/db/database'); loud(); });
const plan = sql => db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail).join('\n');

test('all planned indexes exist and applying twice preserves data and settings', () => {
  const before = db.prepare('SELECT * FROM items ORDER BY id').all();
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  const synchronous = db.pragma('synchronous', { simple: true });
  const limit = db.pragma('analysis_limit', { simple: true });
  applyIndexes(db); applyIndexes(db); optimize(db);
  for (const [, name] of INDEXES) assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name=?").get(name), name);
  assert.deepEqual(db.prepare('SELECT * FROM items ORDER BY id').all(), before);
  assert.equal(db.pragma('foreign_keys', { simple: true }), foreignKeys);
  assert.equal(db.pragma('synchronous', { simple: true }), synchronous);
  assert.equal(db.pragma('analysis_limit', { simple: true }), limit);
  assert.equal(db.pragma('quick_check', { simple: true }), 'ok');
});
test('leaderboard and market history no longer require temporary sorting', () => {
  for (const sql of [
    'SELECT user_id,name,level,xp FROM players ORDER BY level DESC,xp DESC,user_id LIMIT 20',
    "SELECT * FROM market_sales WHERE item_id='wolf_fang' ORDER BY sold_at DESC LIMIT 10",
    'SELECT * FROM market_listings WHERE created_at < 1000 ORDER BY created_at DESC',
  ]) {
    const details = plan(sql);
    assert.match(details, /USING INDEX|USING COVERING INDEX/);
    assert.doesNotMatch(details, /USE TEMP B-TREE/);
  }
});
test('guild case-insensitive lookups use expression indexes', () => {
  assert.match(plan("SELECT * FROM guilds WHERE LOWER(tag)=LOWER('abc')"), /idx_guilds_tag_lower/);
  assert.match(plan("SELECT * FROM guilds WHERE LOWER(name)=LOWER('abc')"), /idx_guilds_name_lower/);
});
test('existing compound primary keys cover inventory and drop lookup without redundant indexes', () => {
  assert.match(plan("SELECT * FROM inventory WHERE user_id='a' AND item_id='b'"), /sqlite_autoindex_inventory/);
  assert.match(plan("SELECT * FROM monster_drops WHERE monster_id='slime'"), /sqlite_autoindex_monster_drops/);
});
test('read-only check command does not seed or create a missing database', () => {
  const file = path.join(TMP_DIR, 'does-not-exist.db');
  assert.throws(() => execFileSync(process.execPath, ['tools/db_check.js'], {
    cwd: ROOT, env: { ...process.env, DB_PATH: file }, stdio: 'pipe',
  }));
  assert.equal(fs.existsSync(file), false);
});
test('deferred circular migration receives indexes after tables are ready', () => {
  const script = `
    console.log=()=>{};
    require('./src/game/guilds');
    const db=require('./src/db/database');
    setTimeout(()=>{
      const found=db.prepare("SELECT name FROM sqlite_master WHERE name='idx_guilds_level_xp'").get();
      if(!found) process.exitCode=1;
      db.close();
    },20);
  `;
  execFileSync(process.execPath, ['-e', script], { cwd: ROOT, env: { ...process.env, DB_PATH: path.join(TMP_DIR, 'deferred.db') }, stdio: 'pipe' });
});
