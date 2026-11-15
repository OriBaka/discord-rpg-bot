// Test cho router tin nhắn + gợi ý "không có lệnh này".
//
// Vì sao có file này: người dùng gõ `%gather` trong Discord và KHÔNG NHẬN ĐƯỢC
// GÌ. Nguyên nhân là bot đang chạy code cũ (chưa có lệnh), nhưng bản thân bot
// cũng có lỗi UX: lệnh không tồn tại bị bỏ qua im lặng, không phân biệt được
// "bot hỏng" với "sai tên lệnh" hay "chưa deploy". Test này khoá lại:
//   1. gõ sai → có phản hồi, kèm gợi ý đúng lệnh nếu gần giống;
//   2. không spam: 1 lần / 30 giây / người;
//   3. không nhắc với chuỗi không phải lệnh (emoji, "%%%", ...);
//   4. lệnh hợp lệ vẫn chạy bình thường, lệnh throw vẫn báo lỗi thân thiện.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let hint, router;

before(() => {
  quiet();
  hint = require(`${ROOT}/src/game/command_hint`);
  router = require(`${ROOT}/src/game/message_router`);
  loud();
});

const PREFIX = '%';
const cmds = () => new Map([
  ['gather', { name: 'gather', execute: async (m) => m.reply('GATHER_OK') }],
  ['hunt', { name: 'hunt', execute: async (m) => m.reply('HUNT_OK') }],
  ['boom', { name: 'boom', execute: async () => { throw new Error('nổ'); } }],
]);
const out = (m) => m._text();

// ─────────────────────────────────────────────────────────────
// 1. Lệnh không tồn tại KHÔNG được im lặng
// ─────────────────────────────────────────────────────────────
test('gõ lệnh không tồn tại → bot phải trả lời (trước đây im lặng)', async () => {
  const m = fakeMessage('U1');
  m.content = '%khongcolenh';
  await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.ok(out(m).length > 0, 'bot im lặng với lệnh không tồn tại');
  assert.match(out(m), /help/, 'phải chỉ người chơi xem %help');
});

test('gõ gần đúng → gợi ý đúng lệnh', async () => {
  const m = fakeMessage('U2');
  m.content = '%gathe';
  await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.match(out(m), /%gather/, `không gợi ý lệnh gần đúng:\n${out(m)}`);
});

test('gõ sai hoàn toàn → không gợi ý bừa', async () => {
  const m = fakeMessage('U3');
  m.content = '%zzzzzzzz';
  await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.ok(out(m).length > 0);
  assert.ok(!/Có phải bạn muốn/.test(out(m)), `gợi ý lệnh vô nghĩa:\n${out(m)}`);
});

test('rate-limit: sai liên tục chỉ nhắc 1 lần / 30s / người', async () => {
  let t = 1_000_000;
  const limiter = hint.createRateLimiter(() => t);
  const map = cmds();
  const m1 = fakeMessage('U4');
  m1.content = '%saolenh';
  await router.handleMessage(m1, { commands: map, prefix: PREFIX, limiter });
  assert.ok(out(m1).length > 0, 'lần đầu không nhắc');

  const m2 = fakeMessage('U4');
  m2.content = '%saolenh2';
  await router.handleMessage(m2, { commands: map, prefix: PREFIX, limiter });
  assert.strictEqual(out(m2), '', 'vẫn nhắc trong 30s → spam');

  t += hint.RATE_LIMIT_MS + 1;
  const m3 = fakeMessage('U4');
  m3.content = '%saolenh3';
  await router.handleMessage(m3, { commands: map, prefix: PREFIX, limiter });
  assert.ok(out(m3).length > 0, 'sau 30s phải nhắc lại');

  // người khác không bị ảnh hưởng
  const m4 = fakeMessage('U5');
  m4.content = '%saolenh';
  await router.handleMessage(m4, { commands: map, prefix: PREFIX, limiter });
  assert.ok(out(m4).length > 0, 'rate-limit không được áp cho người khác');
});

test('không nhắc với chuỗi không phải tên lệnh (emoji, dấu câu)', async () => {
  for (const bad of ['🙂', '%%%', 'a', '-']) {
    const m = fakeMessage('U6');
    m.content = `%${bad}`;
    await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
    assert.strictEqual(out(m), '', `không nên nhắc với "${bad}"`);
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Hành vi cũ không được hỏng
// ─────────────────────────────────────────────────────────────
test('lệnh hợp lệ vẫn chạy, tin nhắn không prefix bị bỏ qua', async () => {
  const m = fakeMessage('U7');
  m.content = '%gather sunlit_meadow';
  await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.match(out(m), /GATHER_OK/);

  const chat = fakeMessage('U7');
  chat.content = 'hello cả nhà';
  await router.handleMessage(chat, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.strictEqual(out(chat), '', 'bot không được trả lời tin nhắn thường');

  const bot = fakeMessage('BOT');
  bot.author.bot = true;
  bot.content = '%gather';
  await router.handleMessage(bot, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  assert.strictEqual(out(bot), '', 'bot không trả lời tin nhắn của bot khác');
});

test('lệnh throw → báo lỗi thân thiện, không crash router', async () => {
  const m = fakeMessage('U8');
  m.content = '%boom';
  const orig = console.error;
  console.error = () => {};
  try {
    await router.handleMessage(m, { commands: cmds(), prefix: PREFIX, limiter: hint.createRateLimiter() });
  } finally {
    console.error = orig;
  }
  assert.match(out(m), /Có lỗi xảy ra/);
});

// ─────────────────────────────────────────────────────────────
// 3. Helper thuần
// ─────────────────────────────────────────────────────────────
test('closestCommand: bắt lỗi gõ nhưng không gợi ý lệnh khác nghĩa', () => {
  const names = ['gather', 'hunt', 'info', 'shop', 'inv'];
  assert.strictEqual(hint.closestCommand('gathe', names), 'gather');
  assert.strictEqual(hint.closestCommand('hut', names), 'hunt');
  assert.strictEqual(hint.closestCommand('xyzzy', names), null);
  assert.strictEqual(hint.closestCommand('aaa', names), null, 'tên ngắn khác xa không được gợi ý');
});

test('looksLikeCommand: chỉ nhận tên lệnh hợp lý', () => {
  assert.ok(hint.looksLikeCommand('gather'));
  assert.ok(hint.looksLikeCommand('g2'));
  assert.ok(!hint.looksLikeCommand('a'));
  assert.ok(!hint.looksLikeCommand('%%%'));
  assert.ok(!hint.looksLikeCommand('🙂'));
  assert.ok(!hint.looksLikeCommand('a'.repeat(40)));
});
