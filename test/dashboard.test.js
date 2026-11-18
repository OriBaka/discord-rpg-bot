const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const { quiet, loud, ROOT } = require('./harness');
const { createDashboard } = require('../src/web/server');
let db, server, base, uid, seller;
before(async () => {
  quiet(); db = require('../src/db/database'); const p = require('../src/game/player');
  uid = 'WEB_USER'; seller = 'WEB_SELLER';
  p.createPlayer(uid, '<script>alert(1)</script>'); p.createPlayer(seller, 'Seller');
  p.updatePlayer(uid, { gold: 12345, level: 10 });
  p.addItem(seller, 'wolf_fang', 3);
  require('../src/game/market').createListing(seller, 'wolf_fang', 100, 1);
  db.prepare('INSERT INTO market_listings (seller_id,item_id,qty,price,created_at) VALUES (?,?,?,?,?)').run(seller, 'wolf_fang', 1, 99, 1);
  require('../src/game/guilds').createGuild(uid, 'WEB', 'Web Guild');
  loud(); server = createDashboard({ db }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const get = async path => { const r = await fetch(base + path); return { status: r.status, data: await r.json(), headers: r.headers }; };

test('overview uses actual data and counts only active listings', async () => {
  const r = await get('/api/overview'); assert.equal(r.status, 200);
  assert.equal(r.data.players, 2); assert.equal(r.data.guilds, 1); assert.equal(r.data.listings, 1);
  assert.equal(r.data.leaders[0].user_id, uid);
  assert.equal('gold' in r.data.leaders[0], false);
});
test('public profile allowlist excludes private data', async () => {
  const r = await get('/api/players/' + uid); assert.equal(r.status, 200);
  assert.equal(r.data.guild.tag, 'WEB'); assert.ok(Array.isArray(r.data.equipment));
  for (const field of ['gold', 'inventory', 'class_data', 'created_at', 'last_hunt', 'story', 'settings']) assert.equal(field in r.data, false);
  assert.equal((await get('/api/players/NOT_HERE')).status, 404);
});
test('search/pagination validate inputs and treat wildcards/SQL as literal text', async () => {
  assert.equal((await get('/api/players?q=Seller')).data.items.length, 1);
  assert.equal((await get('/api/players?q=%25')).data.items.length, 0);
  assert.equal((await get('/api/players?q=' + encodeURIComponent("' OR 1=1 --"))).data.items.length, 0);
  assert.equal((await get('/api/players?page=-1')).status, 400);
  assert.equal((await get('/api/players?page=abc')).status, 400);
  assert.equal((await get('/api/players?page=0')).status, 400);
  assert.equal((await get('/api/players?q=' + 'x'.repeat(81))).status, 400);
  const r = await get('/api/players?page=2'); assert.equal(r.data.items.length, 0); assert.equal(r.data.pageSize, 20);
});
test('market GET does not clean expired listings or change player inventory', async () => {
  const before = db.prepare('SELECT * FROM inventory ORDER BY user_id,item_id').all();
  const r = await get('/api/market'); assert.equal(r.data.items.length, 1); assert.equal(r.data.items[0].price, 100);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM market_listings').get().n, 2);
  assert.deepEqual(db.prepare('SELECT * FROM inventory ORDER BY user_id,item_id').all(), before);
});
test('guild data is public metadata only', async () => {
  const r = await get('/api/guilds'); assert.equal(r.data.items[0].members, 1);
  assert.equal('gold' in r.data.items[0], false); assert.equal('leader_id' in r.data.items[0], false);
});
test('blocks writes and file traversal; API errors do not expose internals', async () => {
  for (const path of ['/api/admin', '/.env', '/data/rpg.db', '/backups/test.db', '/src/index.js', '/%2e%2e/.env']) assert.equal((await fetch(base + path)).status, 404);
  assert.equal((await fetch(base + '/api/players', { method: 'POST', body: '{}' })).status, 405);
  assert.equal((await get('/healthz')).data.ok, true);
});
test('serves local assets with security headers and supports HEAD', async () => {
  for (const path of ['/', '/app.js', '/style.css']) {
    const r = await fetch(base + path); assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  }
  const head = await fetch(base + '/', { method: 'HEAD' }); assert.equal(await head.text(), '');
  const js = fs.readFileSync(ROOT + '/src/web/public/app.js', 'utf8');
  assert.doesNotMatch(js, /innerHTML|document\.write/);
  assert.doesNotMatch(js, /https?:\/\//);
});
test('caps API rate without trusting forwarded IP headers', async () => {
  const limited = createDashboard({ db }); limited.listen(0, '127.0.0.1'); await once(limited, 'listening');
  try {
    let status;
    for (let i = 0; i < 250; i++) {
      const r = await fetch(`http://127.0.0.1:${limited.address().port}/api/overview`, { headers: { 'X-Forwarded-For': `fake-${i}` } });
      status = r.status; await r.text(); if (status === 429) break;
    }
    assert.equal(status, 429);
  } finally { limited.closeAllConnections(); await new Promise(resolve => limited.close(resolve)); }
});

test('handbook API supports paginated search and live item source detail', async () => {
  const before = db.prepare('SELECT total_changes() n').get().n;
  const list = await get('/api/items?q=coal'); assert.equal(list.status, 200);
  assert.ok(list.data.items.some(i => i.id === 'coal'));
  const detail = await get('/api/items/coal'); assert.equal(detail.status, 200);
  assert.ok(detail.data.sources.some(s => s.includes('25 vàng')));
  assert.ok(detail.data.uses.length > 0);
  assert.equal((await get('/api/items/NO_ITEM')).status, 404);
  assert.equal((await get('/api/items?q=%25')).data.items.length, 0);
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before);
});
