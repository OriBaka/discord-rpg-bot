// Chống hồi quy tài liệu: README / .env.example / !help phải khớp với code thật.
//
// Bối cảnh: README từng chỉ liệt kê 14 lệnh trong khi bot có 40, .env.example
// thiếu ADMIN_IDS (khiến người deploy mới không dùng được lệnh admin nào), và
// !help thiếu 7 lệnh. Test này khoá lại để tài liệu không lệch nữa.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadCommands, quiet, loud } = require('./harness');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let cmds;

before(() => {
  quiet();
  cmds = loadCommands();
  loud();
});

// ── !help trong bot ──────────────────────────────────────────────────────────
test('!help nhắc tới mọi lệnh người chơi (trừ lệnh admin)', async () => {
  const ADMIN_ONLY = new Set([
    'admin', 'item', 'mob', 'gatherzone', 'craft', 'lootbox', 'setimage',
    'slashadmin', 'petrestore', 'achdebug', 'redeem',
  ]);
  const helpSrc = read('src/commands/help.js');

  // Chỉ kiểm tra phần embed công khai (trước khối showAdmin)
  const publicPart = helpSrc.split('if (showAdmin)')[0];

  const missing = [];
  const seen = new Set();
  for (const [, cmd] of cmds) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    if (ADMIN_ONLY.has(cmd.name)) continue;
    if (!new RegExp(`\\b${cmd.name}\\b`).test(publicPart)) missing.push(cmd.name);
  }
  assert.deepStrictEqual(missing, [], `!help chưa nhắc: ${missing.join(', ')}`);
});

// ── README ───────────────────────────────────────────────────────────────────
test('README liệt kê mọi lệnh người chơi', () => {
  const readme = read('README.md');
  const ADMIN_ONLY = new Set([
    'admin', 'item', 'mob', 'gatherzone', 'lootbox', 'setimage',
    'slashadmin', 'petrestore', 'achdebug',
  ]);
  const missing = [];
  const seen = new Set();
  for (const [, cmd] of cmds) {
    if (seen.has(cmd.name)) continue;
    seen.add(cmd.name);
    if (ADMIN_ONLY.has(cmd.name)) continue;
    if (!new RegExp(`\\b${cmd.name}\\b`).test(readme)) missing.push(cmd.name);
  }
  assert.deepStrictEqual(missing, [], `README chưa nhắc: ${missing.join(', ')}`);
});

test('README không còn số liệu lệnh sai', () => {
  const readme = read('README.md');
  const names = new Set([...cmds.values()].map(c => c.name));
  // Số lệnh thật (không tính alias)
  const total = names.size;
  assert.ok(
    readme.includes(`**${total} lệnh**`) || readme.includes(`${total} lệnh`),
    `README phải nêu đúng số lệnh (${total})`
  );
});

// ── .env.example ─────────────────────────────────────────────────────────────
test('.env.example có đủ mọi biến mà code đọc', () => {
  const envSample = read('.env.example');
  const srcFiles = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (f.name.endsWith('.js')) srcFiles.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));

  const used = new Set();
  for (const f of srcFiles) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) used.add(m[1]);
  }

  const missing = [...used].filter(k => !new RegExp(`^${k}=`, 'm').test(envSample));
  assert.deepStrictEqual(missing, [], `.env.example thiếu: ${missing.join(', ')}`);
});

test('.env.example giải thích ADMIN_IDS (nguyên nhân phổ biến không dùng được lệnh admin)', () => {
  const envSample = read('.env.example');
  assert.match(envSample, /ADMIN_IDS=/);
  assert.match(envSample, /Administrator/, 'phải nói rõ nếu bỏ trống thì chỉ chủ server/quyền Administrator dùng được');
});

// ── DEPLOY_RAILWAY.md ────────────────────────────────────────────────────────
test('hướng dẫn deploy có ADMIN_IDS và DB_PATH', () => {
  const guide = read('DEPLOY_RAILWAY.md');
  assert.match(guide, /ADMIN_IDS/);
  assert.match(guide, /DB_PATH/);
});
