// Test hồi quy cho các bug P0/P1. Chạy: npm test
// Dùng node:test (Node >= 18), không cần thư viện ngoài.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, loadCommands, fakeMessage, quiet, loud } = require('./harness');

let db, player, slots, classes, cmds, userSeq = 0;

function freshPlayer(overrides = {}) {
  const uid = `U${++userSeq}`;
  player.createPlayer(uid, `p${userSeq}`);
  if (Object.keys(overrides).length) player.updatePlayer(uid, overrides);
  return uid;
}

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  slots = require(`${ROOT}/src/game/slots`);
  classes = require(`${ROOT}/src/game/classes`);
  cmds = loadCommands();
  loud();
});

// ─────────────────────────────────────────────────────────────
// P0-1: thắng trận KHÔNG được hồi đầy HP
// ─────────────────────────────────────────────────────────────
test('P0-1 addXpAndLevel không hồi đầy HP khi chưa lên cấp', () => {
  const uid = freshPlayer();
  player.updatePlayer(uid, { hp: 30 });
  const res = player.addXpAndLevel(uid, 1); // 1 XP, chắc chắn chưa lên cấp ở Lv.1 (cần 50)
  assert.deepStrictEqual(res.levelsGained, [], 'không được lên cấp');
  assert.strictEqual(player.getPlayer(uid).hp, 30, 'HP phải giữ nguyên sau khi thắng trận');
});

test('P0-1 addXpAndLevel vẫn hồi đầy HP khi lên cấp', () => {
  const uid = freshPlayer();
  player.updatePlayer(uid, { hp: 10 });
  const res = player.addXpAndLevel(uid, 10_000); // thừa sức lên cấp
  assert.ok(res.levelsGained.length > 0, 'phải lên cấp');
  const p = player.getPlayer(uid);
  assert.strictEqual(p.hp, p.max_hp, 'lên cấp thì hồi đầy như thiết kế');
  assert.strictEqual(p.level, res.newLevel);
});

test('P0-1 kết quả trả về có newLevel (buttons.js dùng field này)', () => {
  const uid = freshPlayer();
  const res = player.addXpAndLevel(uid, 5);
  assert.strictEqual(typeof res.newLevel, 'number');
  assert.strictEqual(res.level, undefined, 'không tồn tại field "level" — tránh dùng nhầm lại');
});

// ─────────────────────────────────────────────────────────────
// P0-2: không bán được món đang mặc
// ─────────────────────────────────────────────────────────────
test('P0-2 sell chặn bán món đang trang bị', async () => {
  const uid = freshPlayer({ gold: 1000 });
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.addItem(uid, 'wood_sword', 1);

  const equip = cmds.get('equip');
  const msgEq = fakeMessage(uid);
  await equip.execute(msgEq, ['wood_sword']);
  assert.match(msgEq._text(), /Đã trang bị/, 'phải equip được');

  const goldBefore = player.getPlayer(uid).gold;
  const sell = cmds.get('sell');
  const msgSell = fakeMessage(uid);
  await sell.execute(msgSell, ['wood_sword', '1']);

  assert.match(msgSell._text(), /đang được trang bị/, 'phải bị chặn');
  assert.strictEqual(player.getPlayer(uid).gold, goldBefore, 'không được nhận vàng');
  assert.ok(player.hasItem(uid, 'wood_sword', 1), 'vẫn còn item trong túi');
  assert.strictEqual(slots.getEquippedCount(uid, 'wood_sword'), 1, 'vẫn đang mặc');
});

test('P0-2 sell vẫn bán được món KHÔNG mặc (kể cả item cùng loại)', async () => {
  const uid = freshPlayer({ gold: 0 });
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.addItem(uid, 'wood_sword', 2); // 1 để mặc, 1 để bán

  const equip = cmds.get('equip');
  await equip.execute(fakeMessage(uid), ['wood_sword']);
  assert.strictEqual(slots.getEquippedCount(uid, 'wood_sword'), 1);

  const sell = cmds.get('sell');
  const msg = fakeMessage(uid);
  await sell.execute(msg, ['wood_sword', '1']);
  assert.match(msg._text(), /Đã bán/, 'cái thứ 2 (không mặc) phải bán được');
  assert.ok(player.hasItem(uid, 'wood_sword', 1), 'còn lại đúng 1 cái đang mặc');
  assert.strictEqual(slots.getEquippedCount(uid, 'wood_sword'), 1);
});

test('P0-2 sell không vượt quá số lượng trống (không âm kho)', async () => {
  const uid = freshPlayer({ gold: 0 });
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.addItem(uid, 'wood_sword', 2);
  await cmds.get('equip').execute(fakeMessage(uid), ['wood_sword']);

  const sell = cmds.get('sell');
  const msg = fakeMessage(uid);
  await sell.execute(msg, ['wood_sword', '2']); // chỉ bán được 1
  assert.match(msg._text(), /đang được trang bị/);
  assert.ok(player.hasItem(uid, 'wood_sword', 2), 'không bán được gì');
});

// ─────────────────────────────────────────────────────────────
// P0-3: không "trade đi" món đang mặc (đồ ảo)
// ─────────────────────────────────────────────────────────────
test('P0-3 trade bị chặn khi gửi món đang trang bị', () => {
  const trade = require(`${ROOT}/src/game/trade`);
  const a = freshPlayer();
  const b = freshPlayer();
  classes.unlockClass(a, 'melee');
  classes.setPrimaryClass(a, 'melee');
  player.addItem(a, 'iron_sword', 1);
  slots.setEquipped(a, 'weapon', 'iron_sword');

  const t = trade.createTrade(a, b);
  trade.updateOffer(t.id, 'a', { gold: 0, items: { iron_sword: 1 } });
  const res = trade.executeTrade(trade.getTradeById(t.id));

  assert.strictEqual(res.ok, false, 'trade phải bị từ chối');
  assert.match(res.error, /đang trang bị/);
  assert.ok(player.hasItem(a, 'iron_sword', 1), 'A không được mất item');
  assert.ok(!player.hasItem(b, 'iron_sword', 1), 'B không được nhận item');
  assert.strictEqual(slots.getEquipped(a).weapon, 'iron_sword', 'A vẫn mặc');
});

test('P0-3 trade vẫn OK với món không mặc (kể cả cùng id, có 2 cái)', () => {
  const trade = require(`${ROOT}/src/game/trade`);
  const a = freshPlayer();
  const b = freshPlayer();
  classes.unlockClass(a, 'melee');
  classes.setPrimaryClass(a, 'melee');
  player.addItem(a, 'wood_sword', 2);
  slots.setEquipped(a, 'weapon', 'wood_sword'); // 1 mặc, 1 rảnh

  const t = trade.createTrade(a, b);
  trade.updateOffer(t.id, 'a', { gold: 0, items: { wood_sword: 1 } });
  const res = trade.executeTrade(trade.getTradeById(t.id));

  assert.strictEqual(res.ok, true, `phải trade được: ${res.error || ''}`);
  assert.ok(player.hasItem(b, 'wood_sword', 1), 'B nhận được 1');
  assert.strictEqual(slots.getEquipped(a).weapon, 'wood_sword', 'A vẫn mặc cái còn lại');
});

test('P0-3 guild depositItem vẫn chặn món đang mặc (sau khi uỷ quyền slots)', () => {
  const guilds = require(`${ROOT}/src/game/guilds`);
  const uid = freshPlayer();
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.updatePlayer(uid, { gold: 5000, level: 10 });
  player.addItem(uid, 'wood_sword', 1);
  slots.setEquipped(uid, 'weapon', 'wood_sword');

  const r = guilds.createGuild(uid, `TG${userSeq}`, `Guild ${userSeq}`);
  assert.ok(r.ok, `tạo bang phải OK: ${r.error || ''}`);
  assert.strictEqual(guilds.depositItem(uid, 'wood_sword', 1).ok, false,
    'không được gửi món đang mặc vào kho');
});

test('equip: mặc lại / chuyển slot hợp lệ không bị chặn nhầm', async () => {
  const uid = freshPlayer();
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.addItem(uid, 'wood_sword', 1);

  const equip = cmds.get('equip');
  const first = fakeMessage(uid);
  await equip.execute(first, ['wood_sword']);
  assert.match(first._text(), /Đã trang bị/);

  // Mặc lại đúng món đang mặc → không được báo lỗi
  const again = fakeMessage(uid);
  await equip.execute(again, ['wood_sword', 'weapon']);
  assert.doesNotMatch(again._text(), /không có vật phẩm/);
  assert.match(again._text(), /Đã trang bị/);
  assert.strictEqual(slots.getEquippedCount(uid, 'wood_sword'), 1);

  // Thay bằng món khác trong cùng slot → chỉ đổi, không nhân bản
  player.addItem(uid, 'rusty_dagger', 1);
  const swap = fakeMessage(uid);
  await equip.execute(swap, ['rusty_dagger', 'weapon']);
  assert.match(swap._text(), /Đã thay ra/);
  assert.doesNotMatch(swap._text(), /vào túi/);
  assert.strictEqual(slots.getEquipped(uid).weapon, 'rusty_dagger');
  assert.strictEqual(slots.getTotalBonus(uid).atk, 5, 'chỉ còn buff của dao găm (+5)');
});

// ─────────────────────────────────────────────────────────────
// P1-6: petrestore dùng đúng prefix
// ─────────────────────────────────────────────────────────────
test('P1-6 petrestore dùng prefix từ env, không hardcode', async () => {
  const cmd = cmds.get('petrestore');
  assert.ok(cmd, 'petrestore phải được load như index.js');
  const { getPrefix } = require(`${ROOT}/src/game/prefix`);
  const msg = fakeMessage(`PR${++userSeq}`);
  await cmd.execute(msg, []);
  const text = msg._text();
  // Trước đây test này khẳng định hướng dẫn phải là `!petrestore` — chính là
  // khoá cứng bug: server thật dùng `%` nên mọi hướng dẫn đều sai.
  // Nay kiểm tra theo prefix thật (helper, không hardcode).
  assert.ok(text.includes(`${getPrefix()}petrestore`),
    `phải dùng prefix thật (${getPrefix()}): ${text}`);
});

// ─────────────────────────────────────────────────────────────
// P1-7: alias 'fight' chỉ thuộc về hunt
// ─────────────────────────────────────────────────────────────
test("P1-7 alias 'fight' trỏ về hunt, không phải battle", () => {
  assert.strictEqual(cmds.get('fight').name, 'hunt');
  assert.notStrictEqual(cmds.get('battle').name, 'hunt');
  assert.ok(!(cmds.get('battle').aliases || []).includes('fight'));
  assert.ok(cmds.get('turnbattle'), 'alias mới của battle phải hoạt động');
});

test('P1-7 không còn alias nào bị 2 lệnh tranh nhau', () => {
  const fs = require('fs');
  const dir = `${ROOT}/src/commands`;
  const owner = new Map();
  const dupes = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const mod = require(`${dir}/${f}`);
    for (const m of [mod, ...Object.values(mod)]) {
      if (!m || typeof m !== 'object' || !m.name) continue;
      for (const key of [m.name, ...(m.aliases || [])]) {
        if (owner.has(key) && owner.get(key) !== m.name) dupes.push(`${key}: ${owner.get(key)} vs ${m.name}`);
        else owner.set(key, m.name);
      }
    }
  }
  assert.deepStrictEqual(dupes, [], `alias trùng: ${dupes.join(', ')}`);
});
