const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const PAGE_SIZE = 20;

function createDashboard({ db, logger = console }) {
  // Strictly selected public columns; no gameplay helpers (some clean up/write).
  const playerColumns = 'user_id, name, level, xp, primary_class';
  const assets = new Map([...STATIC].map(([url, [file, type]]) => [url, { type, body: fs.readFileSync(path.join(__dirname, 'public', file)) }]));
  let tokens = 240;
  let lastRefill = Date.now();
  const server = http.createServer((req, res) => {
    const headers = {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
    function send(status, data, type = 'application/json; charset=utf-8') {
      res.writeHead(status, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : type.startsWith('application/json') ? JSON.stringify(data) : data);
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return send(405, { error: 'Chỉ hỗ trợ đọc dữ liệu.' }); }
    if ((req.url || '').length > 2048) return send(414, { error: 'URL quá dài.' });
    let url;
    try { url = new URL(req.url, 'http://dashboard'); } catch { return send(400, { error: 'URL không hợp lệ.' }); }
    const asset = assets.get(url.pathname);
    if (asset) return send(200, asset.body, asset.type);
    if (url.pathname === '/healthz') return send(db.open ? 200 : 503, { ok: db.open });
    if (!url.pathname.startsWith('/api/')) return send(404, { error: 'Không tìm thấy.' });
    // Global bounded token bucket. Do not trust arbitrary X-Forwarded-For.
    const now = Date.now();
    tokens = Math.min(240, tokens + (now - lastRefill) * 4 / 1000);
    lastRefill = now;
    if (tokens < 1) { res.setHeader('Retry-After', '1'); return send(429, { error: 'Đang có nhiều lượt xem. Thử lại sau ít giây.' }); }
    tokens--;
    const rawPage = url.searchParams.get('page') || '1';
    if (!/^\d{1,5}$/.test(rawPage) || Number(rawPage) < 1) return send(400, { error: 'Trang không hợp lệ.' });
    const page = Number(rawPage), offset = (page - 1) * PAGE_SIZE;
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length > 80) return send(400, { error: 'Từ khóa tối đa 80 ký tự.' });
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    function paged(query, count, args = []) {
      return { items: db.prepare(query + ' LIMIT ? OFFSET ?').all(...args, PAGE_SIZE, offset),
        total: db.prepare(count).get(...args).n, page, pageSize: PAGE_SIZE };
    }
    try {
      if (url.pathname === '/api/items') {
        const where = " FROM items WHERE id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\'";
        return send(200, paged('SELECT id,name,type,tier' + where + ' ORDER BY id', 'SELECT COUNT(*) n' + where, [like, like]));
      }
      const itemMatch = url.pathname.match(/^\/api\/items\/([A-Za-z0-9_-]{1,100})$/);
      if (itemMatch) {
        const result = require('../game/handbook').lookup(db, itemMatch[1]);
        return send(result ? 200 : 404, result || { error: 'Không tìm thấy vật phẩm.' });
      }
      if (url.pathname === '/api/overview') {
        return send(200, {
          players: db.prepare('SELECT COUNT(*) n FROM players').get().n,
          guilds: db.prepare('SELECT COUNT(*) n FROM guilds').get().n,
          listings: db.prepare('SELECT COUNT(*) n FROM market_listings WHERE created_at>?').get(now - 7 * 86400000).n,
          taxBurned: db.prepare('SELECT COALESCE(SUM(tax),0) n FROM market_sales WHERE tax IS NOT NULL').get().n,
          leaders: db.prepare(`SELECT ${playerColumns} FROM players ORDER BY level DESC, xp DESC, user_id LIMIT 5`).all(),
          updatedAt: now,
        });
      }
      if (url.pathname === '/api/players') {
        const where = " FROM players WHERE name LIKE ? ESCAPE '\\' OR user_id=?";
        return send(200, paged(`SELECT ${playerColumns}` + where + ' ORDER BY level DESC,xp DESC,user_id', 'SELECT COUNT(*) n' + where, [like, q]));
      }
      const match = url.pathname.match(/^\/api\/players\/([A-Za-z0-9_-]{1,64})$/);
      if (match) {
        const id = match[1];
        const p = db.prepare(`SELECT ${playerColumns} FROM players WHERE user_id=?`).get(id);
        if (!p) return send(404, { error: 'Không tìm thấy nhà thám hiểm.' });
        const equipment = db.prepare(`SELECT e.slot, i.name, i.tier FROM equipped e JOIN items i ON i.id=e.item_id WHERE e.user_id=? ORDER BY e.slot`).all(id);
        const guild = db.prepare('SELECT g.id,g.name,g.tag FROM guilds g JOIN guild_members m ON m.guild_id=g.id WHERE m.user_id=?').get(id) || null;
        const looks = db.prepare('SELECT type,cosmetic_id FROM cosmetic_equipped WHERE user_id=?').all(id);
        const catalog = require('../game/gold_sinks').COSMETICS;
        const appearance = looks.filter(l => Object.hasOwn(catalog, l.cosmetic_id)).map(l => ({ type: l.type, name: catalog[l.cosmetic_id].name }));
        const activeAura = db.prepare('SELECT active_stat,active_tier,active_percent FROM player_aura WHERE user_id=? AND active_stat IS NOT NULL').get(id);
        const aura = activeAura ? { effect: require('../game/aura').effectName(activeAura.active_stat), tier: activeAura.active_tier, percent: activeAura.active_percent } : null;
        return send(200, { ...p, equipment, guild, appearance, aura });
      }
      if (url.pathname === '/api/market') {
        const where = " FROM market_listings l JOIN items i ON i.id=l.item_id JOIN players p ON p.user_id=l.seller_id WHERE l.created_at>? AND (i.name LIKE ? ESCAPE '\\' OR i.id LIKE ? ESCAPE '\\')";
        return send(200, paged('SELECT l.id,l.qty,l.price,l.created_at,i.name,i.tier,p.name seller' + where + ' ORDER BY l.created_at DESC,l.id DESC', 'SELECT COUNT(*) n' + where, [now - 7 * 86400000, like, like]));
      }
      if (url.pathname === '/api/guilds') {
        const where = " FROM guilds g WHERE g.name LIKE ? ESCAPE '\\' OR g.tag LIKE ? ESCAPE '\\'";
        const result = paged('SELECT g.id,g.name,g.tag,g.level,g.xp,(SELECT COUNT(*) FROM guild_members m WHERE m.guild_id=g.id) members' + where + ' ORDER BY g.level DESC,g.xp DESC,g.id', 'SELECT COUNT(*) n' + where, [like, like]);
        const catalog = require('../game/gold_sinks').BUILDINGS;
        for (const g of result.items) {
          g.buildings = db.prepare('SELECT building_id,level FROM guild_buildings WHERE guild_id=? ORDER BY building_id').all(g.id)
            .filter(b => Object.hasOwn(catalog, b.building_id)).map(b => ({ name: catalog[b.building_id].name, level: b.level }));
        }
        return send(200, result);
      }
      return send(404, { error: 'Không có API này.' });
    } catch (err) {
      logger.error('[dashboard]', err);
      return send(500, { error: 'Không thể tải dữ liệu lúc này.' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}

function startDashboard(db) {
  if (process.env.WEB_ENABLED === 'false') return null;
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ');
  const server = createDashboard({ db });
  server.on('error', err => { console.error('[dashboard] Không thể mở cổng:', err); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log(`🌐 Dashboard listening on ${port}`));
  return server;
}
module.exports = { createDashboard, startDashboard };
