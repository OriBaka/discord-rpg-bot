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

// ---------------------------------------------------------------------------
// SLASH COMMAND — chống hồi quy
//
// Bối cảnh: không có test nào kiểm tra slash, nên khi thêm `upgrade` tôi suýt
// thêm 5 slash TRÙNG TÊN (start, ach, class, duel, job) vì script khảo sát
// đọc `def.data.name` — trường này KHÔNG tồn tại, tên thật nằm sau
// `def.data.toJSON().name`. Trùng tên sẽ làm Discord từ chối cả payload deploy,
// tức là MẤT TẤT CẢ slash command, không chỉ cái bị trùng.
// ---------------------------------------------------------------------------
const slashDefs = () => {
  const { definitions } = require('../src/slash/definitions');
  const { definitions: adminDefs } = require('../src/slash/admin_definitions');
  return { defs: definitions, adminDefs };
};

test('slash: không có tên trùng lặp (Discord từ chối cả payload nếu trùng)', () => {
  const { defs, adminDefs } = slashDefs();
  const names = [...defs, ...adminDefs].map(d => d.data.toJSON().name);
  const seen = new Set();
  const dups = new Set();
  for (const n of names) {
    if (seen.has(n)) dups.add(n);
    seen.add(n);
  }
  assert.deepStrictEqual([...dups], [], `slash bị trùng tên: ${[...dups].join(', ')}`);
});

test('slash: mọi tên và mô tả hợp lệ theo luật Discord', () => {
  const { defs, adminDefs } = slashDefs();
  const bad = [];
  const NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;
  for (const d of [...defs, ...adminDefs]) {
    const j = d.data.toJSON();
    if (!NAME_RE.test(j.name)) bad.push(`tên không hợp lệ: "${j.name}"`);
    // Discord: mô tả 1..100 ký tự
    if (!j.description || j.description.length > 100) bad.push(`${j.name}: mô tả ${j.description?.length ?? 0} ký tự`);
    // Slash admin đi qua admin_handler.js (route theo tên command), không dùng
    // { cmdName } như slash người chơi — nên chỉ kiểm tra nhánh người chơi.
    if (defs.includes(d) && (!d.handler || !d.handler.cmdName)) {
      bad.push(`${j.name}: thiếu handler.cmdName`);
    }
  }
  assert.deepStrictEqual(bad, [], bad.join('; '));
});

test('slash: handler trỏ tới lệnh prefix có thật', () => {
  // Nếu trỏ sai, bấm slash sẽ ra "Internal: command không tìm thấy".
  const { defs } = slashDefs();
  const bad = [];
  for (const d of defs) {
    const name = d.data.toJSON().name;
    const target = d.handler.cmdName;
    if (!cmds.has(target)) bad.push(`${name} → ${target}`);
  }
  assert.deepStrictEqual(bad, [], `slash trỏ tới lệnh không tồn tại: ${bad.join(', ')}`);
});

test('slash: lệnh người chơi quan trọng đều có slash', () => {
  // Danh sách này là các lệnh người chơi dùng thường xuyên. Nếu ai thêm lệnh
  // mới mà quên slash, test này nhắc. (Các lệnh admin có file slash riêng.)
  const { defs } = slashDefs();
  const have = new Set(defs.map(d => d.data.toJSON().name));
  const must = [
    'start', 'me', 'inv', 'hunt', 'mine', 'fish', 'cook', 'craft',
    'equip', 'unequip', 'gear', 'compare', 'upgrade',
    'shop', 'buy', 'sell', 'use', 'heal',
    'job', 'class', 'ach', 'quest', 'pet', 'guild', 'duel', 'trade',
    'battle', 'top', 'daily', 'redeem', 'info', 'help',
  ];
  const missing = must.filter(n => !have.has(n));
  assert.deepStrictEqual(missing, [], `lệnh chưa có slash: ${missing.join(', ')}`);
});
