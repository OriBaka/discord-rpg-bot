// Chống hồi quy circular require: player ↔ guilds/trade.
//
// Bối cảnh: player.js require database.js; database.js gọi migrate() của guilds
// và trade; hai file đó require('./player') ở top-level → khi player.js còn đang
// nạp dở, Node trả về module rỗng và in warning
//   "Accessing non-existent property 'getPlayer' of module exports inside
//    circular dependency"
//
// Test này khởi động process con với nhiều entry point khác nhau (mỗi entry cho
// một thứ tự nạp module khác nhau) và bắt buộc không được có warning nào.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT } = require('./harness');

// Entry point → thứ tự nạp module khác nhau. Trước khi fix, 'player',
// 'commands/hunt' và 'commands/guild' đều in 8 warning.
const ENTRIES = [
  'src/game/player.js',
  'src/game/guilds.js',
  'src/game/trade.js',
  'src/game/slots.js',
  'src/commands/hunt.js',
  'src/commands/guild.js',
  'src/commands/trade.js',
  'src/index.js',
];

for (const entry of ENTRIES) {
  test(`không có circular dependency warning khi nạp ${entry}`, () => {
    const target = path.join(ROOT, entry);
    // index.js cần token giả + DB tạm; nó sẽ fail ở client.login (không có mạng)
    // nhưng phần nạp module đã chạy xong trước đó — đúng thứ ta cần kiểm tra.
    const snippet = `
      process.env.DB_PATH = require('path').join(
        require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'circ-')), 'c.db');
      process.env.DISCORD_TOKEN = 'fake.token.value';
      const logs = [];
      process.emitWarning = (w) => { logs.push(String(w)); };
      let loadError = null;
      try {
        require(${JSON.stringify(target)});
      } catch (e) {
        // Bỏ qua lỗi mạng lúc login (index.js), nhưng TypeError do circular
        // require thì phải fail test — đó chính là crash thật đã gặp:
        // "TypeError: migrateGuilds is not a function".
        if (!/ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|socket|TokenInvalid/i.test(e.message)) {
          loadError = e.message;
        }
      }
      const hits = logs.filter(l => /circular dependency/i.test(l));
      process.stdout.write('@@RESULT@@' + JSON.stringify({
        circular: hits, sample: hits[0] || '', loadError,
      }) + '@@END@@');
    `;
    // index.js gọi process.exit(1) khi login thất bại (không có mạng trong test),
    // nên execFileSync sẽ throw — ta vẫn đọc được stdout để lấy kết quả.
    let raw = '';
    try {
      raw = execFileSync(process.execPath, ['-e', snippet], {
        cwd: ROOT, encoding: 'utf8', timeout: 60_000,
      });
    } catch (e) {
      raw = `${e.stdout || ''}${e.stderr || ''}`;
    }
    // Marker có thể nằm chung dòng với log khác (process.exit/console.error của
    // index.js không thêm newline) → lấy từ marker tới hết và tách object JSON.
    const at = raw.indexOf('@@RESULT@@');
    assert.ok(at >= 0, `${entry}: không chạy được probe. Output: ${raw.slice(-400)}`);
    const start = at + '@@RESULT@@'.length;
    const end = raw.indexOf('@@END@@', start);
    assert.ok(end > start, `${entry}: marker kết thúc không thấy. Output: ${raw.slice(-400)}`);
    const res = JSON.parse(raw.slice(start, end));

    assert.strictEqual(res.loadError, null, `${entry}: nạp module bị lỗi: ${res.loadError}`);
    assert.deepStrictEqual(
      res.circular, [],
      `${entry}: vẫn còn ${res.circular.length} warning circular — vd: ${res.sample}`
    );
  });
}

test('guilds/trade gọi được player API sau khi lazy-require', () => {
  // Đảm bảo wrapper lazy thật sự uỷ quyền đúng, không phải nuốt lỗi
  const player = require(path.join(ROOT, 'src/game/player'));
  const guilds = require(path.join(ROOT, 'src/game/guilds'));
  const trade = require(path.join(ROOT, 'src/game/trade'));

  const uid = 'CIRCTEST';
  const existing = player.getPlayer(uid);
  if (existing) {
    require(path.join(ROOT, 'src/db/database')).prepare('DELETE FROM players WHERE user_id=?').run(uid);
  }
  player.createPlayer(uid, 'circtest');
  player.updatePlayer(uid, { gold: 1000, level: 10 });

  // depositGold đi qua wrapper getPlayer/updatePlayer của guilds
  player.addItem(uid, 'potion_s', 3);
  const g = guilds.createGuild(uid, 'CIRC', 'Circular Test');
  assert.ok(g.ok, `createGuild phải chạy được: ${g.error || ''}`);

  // validateOffer đi qua wrapper getPlayer của trade
  const other = 'CIRCTEST2';
  if (!player.getPlayer(other)) player.createPlayer(other, 'circtest2');
  const t = trade.createTrade(uid, other);
  trade.updateOffer(t.id, 'a', { gold: 500, items: { potion_s: 1 } });
  const res = trade.executeTrade(trade.getTradeById(t.id));
  assert.strictEqual(res.ok, true, `trade phải chạy được: ${res.error || ''}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Migrate không được bị bỏ qua khi entry point là một module game
// ─────────────────────────────────────────────────────────────────────────────
test('entry point là module game vẫn tạo đủ bảng (migrate chạy lại sau vòng require)', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circ-tables-'));
  const dbPath = path.join(dir, 't.db');

  const snippet = `
    process.env.DB_PATH = ${JSON.stringify(dbPath)};
    require(${JSON.stringify(path.join(ROOT, 'src/game/guilds.js'))});
    const db = require(${JSON.stringify(path.join(ROOT, 'src/db/database.js'))});
    setTimeout(() => {
      const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
      process.stdout.write('@@T@@' + JSON.stringify(t) + '@@END@@');
    }, 50);
  `;
  let raw = '';
  try {
    raw = execFileSync(process.execPath, ['-e', snippet], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  } catch (e) {
    raw = `${e.stdout || ''}${e.stderr || ''}`;
  }
  const start = raw.indexOf('@@T@@');
  const end = raw.indexOf('@@END@@', start);
  assert.ok(start >= 0 && end > start, `probe lỗi: ${raw.slice(-300)}`);
  const tables = JSON.parse(raw.slice(start + 5, end));

  // Bảng của chính module entry (guilds) — trước đây bị bỏ qua hoàn toàn
  assert.ok(tables.includes('guilds'), `thiếu bảng guilds. Có: ${tables.join(',')}`);
  assert.ok(tables.includes('guild_members'), 'thiếu bảng guild_members');
  // Và các feature khác vẫn nguyên vẹn
  for (const t of ['players', 'items', 'monsters', 'pets', 'battles', 'trades']) {
    assert.ok(tables.includes(t), `thiếu bảng ${t}`);
  }
});
