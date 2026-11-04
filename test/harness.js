// Harness tối giản: giả lập Discord message + DB tạm để test command.
// Không cần token, không kết nối Discord.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-test-'));
process.env.DB_PATH = path.join(TMP_DIR, 'test.db');
process.env.PREFIX = '!';

// Im lặng hoá log migrate/seed để output test dễ đọc
const REAL_LOG = console.log;
const QUIET = process.env.TEST_VERBOSE !== '1';
function quiet() {
  if (QUIET) console.log = () => {};
}
function loud() {
  console.log = REAL_LOG;
}

// Load toàn bộ command như index.js (kèm thứ tự readdirSync)
function loadCommands() {
  const dir = path.join(ROOT, 'src', 'commands');
  const map = new Map();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(dir, file));
    const candidates = [mod, ...Object.values(mod)];
    for (const m of candidates) {
      if (m && typeof m === 'object' && m.name && typeof m.execute === 'function') {
        if (!map.has(m.name)) map.set(m.name, m);
        for (const a of m.aliases || []) if (!map.has(a)) map.set(a, m);
      }
    }
  }
  return map;
}

// Tạo fake message; reply() ghi lại nội dung để assert
function fakeMessage(userId, opts = {}) {
  const out = [];
  const msg = {
    _out: out,
    _text: () => out.join('\n'),
    author: { id: userId, username: opts.username || 'tester', bot: false },
    member: { permissions: { has: () => opts.admin !== false } },
    guild: { id: 'GUILD1', ownerId: opts.ownerId || 'OWNER', name: 'Test Guild' },
    guildId: 'GUILD1',
    channel: { id: 'CHAN1', send: async () => ({ id: 'MSG0' }) },
    client: {},
    id: 'MSG1',
    content: '',
    mentions: {
      users: { first: () => opts.mention || null },
      channels: { first: () => null },
    },
    reply: async (payload) => {
      if (typeof payload === 'string') out.push(payload);
      else if (payload && payload.content) out.push(payload.content);
      else if (payload && payload.embeds && payload.embeds[0]) {
        const d = payload.embeds[0].data || payload.embeds[0];
        const fields = (d.fields || []).map(f => `${f.name}: ${f.value}`).join('\n');
        out.push([d.title, d.description, fields].filter(Boolean).join('\n'));
      }
      return { id: 'REPLY1' };
    },
  };
  return msg;
}

module.exports = { ROOT, TMP_DIR, loadCommands, fakeMessage, quiet, loud, REAL_LOG };
