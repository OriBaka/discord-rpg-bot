// Test cho QoL #3 (chợ: nút mua, bán từ túi, gợi ý giá) và #4 (%help <từ khoá>).
//
// Vì sao khoá bằng test:
//   • Nút mua gọi THẲNG market.buy() — sai route là mất vàng hoặc mua hộ người khác.
//   • Gợi ý giá phải dựa trên giao dịch THẬT, nếu không người chơi bị dẫn dắt
//     bởi con số bịa.
//   • %help <từ khoá> thay cho việc dò 12 mục / 45 lệnh bằng mắt.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, loadCommands, quiet, loud } = require('./harness');

let db, player, market, marketCmd, helpCmd, buttons, cmds, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  market = require(`${ROOT}/src/game/market`);
  marketCmd = require(`${ROOT}/src/commands/market`);
  helpCmd = require(`${ROOT}/src/commands/help`);
  buttons = require(`${ROOT}/src/buttons`);
  cmds = loadCommands();
  loud();
});

const out = (m) => m._text();
const goldOf = (uid) => db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
const qtyOf = (uid, item) => {
  const r = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, item);
  return r ? r.qty : 0;
};
const newPlayer = (gold = 5000) => {
  const uid = `M3${++seq}`;
  player.createPlayer(uid, `m3${seq}`);
  player.updatePlayer(uid, { gold });
  return uid;
};
const fakeInteraction = (uid, customId, capture = {}) => ({
  customId,
  user: { id: uid },
  client: { users: { fetch: async () => null }, commands: cmds },
  message: { edit: async (p) => { capture.edited = p; } },
  update: async (p) => { capture.updated = p; },
  deferUpdate: async () => {},
  reply: async (p) => { capture.reply = p; },
  followUp: async (p) => { capture.followUp = p; },
});

// ─────────────────────────────────────────────────────────────
// #3a. Nút mua trên trang chợ
// ─────────────────────────────────────────────────────────────
test('chợ: mỗi tin trên trang có nút mua, tối đa 5 nút/row', async () => {
  const seller = newPlayer();
  const buyer = newPlayer();
  player.addItem(seller, 'iron_ore', 60);
  const ids = [];
  for (let i = 0; i < 7; i++) {
    const r = market.createListing(seller, 'iron_ore', 20 + i, 1);
    assert.ok(r.ok, r.error);
    ids.push(r.listing.id);
  }

  let payload = null;
  await marketCmd.renderMarketPage({ userId: buyer, filter: 'all', page: 0, replyFn: async (p) => { payload = p; } });
  const rows = payload.components.map(r => r.components.map(b => b.data));
  const buyRow = rows.find(r => r.some(b => b.custom_id.startsWith('mkbuy:')));
  assert.ok(buyRow, 'trang chợ không có nút mua');
  assert.ok(buyRow.length <= 5, `row có ${buyRow.length} nút (>5 Discord sẽ từ chối)`);
  assert.strictEqual(buyRow.length, marketCmd.MARKET_PER_PAGE,
    'số nút phải bằng số tin mỗi trang, nếu không có tin nhìn thấy mà không bấm được');
  assert.ok(rows.length <= 5, `${rows.length} row > 5 (Discord giới hạn 5)`);
});

test('chợ: bấm nút mua — trừ vàng, cộng item, tồn kho giảm, có update message', async () => {
  const seller = newPlayer();
  const buyer = newPlayer(1000);
  player.addItem(seller, 'oak_log', 10);
  const r = market.createListing(seller, 'oak_log', 40, 3);
  assert.ok(r.ok, r.error);

  const cap = {};
  await buttons.handle(fakeInteraction(buyer, `mkbuy:${r.listing.id}:${buyer}:all:0`, cap));

  assert.match(cap.reply?.content || '', /Đã mua/, `không mua được: ${JSON.stringify(cap.reply)}`);
  assert.strictEqual(goldOf(buyer), 960, 'vàng trừ sai');
  assert.strictEqual(qtyOf(buyer, 'oak_log'), 1, 'không nhận được item');
  assert.strictEqual(market.getListing(r.listing.id).qty, 2, 'tin chưa giảm số lượng');
  assert.ok(cap.edited, 'không cập nhật lại message chợ sau khi mua');
  assert.match(cap.reply.content, /còn \*\*2\*\* món/);
});

test('chợ: bấm nút mua tin của chính mình → chặn', async () => {
  const seller = newPlayer();
  player.addItem(seller, 'iron_ore', 5);
  const r = market.createListing(seller, 'iron_ore', 25, 1);
  const cap = {};
  await buttons.handle(fakeInteraction(seller, `mkbuy:${r.listing.id}:${seller}:all:0`, cap));
  assert.strictEqual(cap.reply?.ephemeral, true);
  assert.match(cap.reply?.content || '', /tin của chính bạn/);
  assert.strictEqual(qtyOf(seller, 'iron_ore'), 4, '1 món phải còn nằm ở chợ (escrow)');
});

test('chợ: bấm nút mua không đủ vàng → báo rõ, không trừ gì', async () => {
  const seller = newPlayer();
  const buyer = newPlayer(5);
  player.addItem(seller, 'iron_ore', 5);
  const r = market.createListing(seller, 'iron_ore', 500, 1);
  const cap = {};
  await buttons.handle(fakeInteraction(buyer, `mkbuy:${r.listing.id}:${buyer}:all:0`, cap));
  assert.match(cap.reply?.content || '', /Không đủ vàng/);
  assert.strictEqual(goldOf(buyer), 5);
  assert.strictEqual(qtyOf(buyer, 'iron_ore'), 0);
});

test('chợ: nút của trang người khác không bấm hộ được', async () => {
  const seller = newPlayer();
  const buyer = newPlayer(1000);
  const intruder = newPlayer(1000);
  player.addItem(seller, 'iron_ore', 5);
  const r = market.createListing(seller, 'iron_ore', 10, 1);
  const cap = {};
  await buttons.handle(fakeInteraction(intruder, `mkbuy:${r.listing.id}:${buyer}:all:0`, cap));
  assert.match(cap.reply?.content || '', /người khác/);
  assert.strictEqual(goldOf(intruder), 1000);
  assert.strictEqual(qtyOf(intruder, 'iron_ore'), 0);
});

test('chợ: tin của mình hiện nút bị disable', async () => {
  const seller = newPlayer();
  player.addItem(seller, 'iron_ore', 5);
  market.createListing(seller, 'iron_ore', 10, 1);
  let payload = null;
  await marketCmd.renderMarketPage({ userId: seller, filter: 'all', page: 0, replyFn: async (p) => { payload = p; } });
  const all = payload.components.flatMap(r => r.components.map(b => b.data));
  const own = all.find(b => b.custom_id.startsWith('mkbuy:'));
  assert.ok(own, 'thiếu nút mua');
  assert.strictEqual(own.disabled, true, 'nút tin của mình phải bị disable');
  assert.match(own.label, /của bạn/);
});

// ─────────────────────────────────────────────────────────────
// #3b. Bán từ túi + gợi ý giá
// ─────────────────────────────────────────────────────────────
test('%market sell (không tham số) liệt kê món bán được kèm gợi ý giá', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 4);
  player.addItem(uid, 'oak_log', 2);

  const m = fakeMessage(uid);
  await marketCmd.execute(m, ['sell'], '%');
  const t = out(m);
  assert.match(t, /Chọn món để bán/);
  assert.match(t, /iron_ore/);
  assert.match(t, /gợi ý/i);
  assert.match(t, /market sell iron_ore \d+/, 'thiếu câu lệnh mẫu để copy');
  // Không lộ món không bán được
  assert.doesNotMatch(t, /soulbound/);
});

test('%market sell (không tham số) ẩn món đang trang bị và soulbound', async () => {
  const uid = newPlayer();
  const weapon = db.prepare("SELECT id FROM items WHERE type='weapon' AND soulbound=0 AND min_level<=1 LIMIT 1").get();
  const sb = db.prepare("SELECT id FROM items WHERE type='material' AND soulbound=1 LIMIT 1").get();
  player.addItem(uid, weapon.id, 1);
  const slots = require(`${ROOT}/src/game/slots`);
  slots.setEquipped(uid, slots.findSlotForItem(
    require(`${ROOT}/src/game/items`).getItem(weapon.id), slots.getEquipped(uid)
  ), weapon.id);

  if (sb) player.addItem(uid, sb.id, 3);
  player.addItem(uid, 'iron_ore', 1);

  const rows = marketCmd.sellableRows ? marketCmd.sellableRows(uid) : null;
  let payload = null;
  await marketCmd.renderSellablePage({ userId: uid, filter: 'all', page: 0, replyFn: async (p) => { payload = p; } });
  const desc = payload.embeds[0].data.description;
  assert.match(desc, /iron_ore/, 'món bán được phải hiện');
  assert.doesNotMatch(desc, new RegExp(`\`${weapon.id}\``), 'món đang mặc không được hiện');
  if (sb) assert.doesNotMatch(desc, new RegExp(`\`${sb.id}\``), 'món soulbound không được hiện');
});

test('%market sell <id> (thiếu giá) → gợi ý giá thay vì báo lỗi cú pháp', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 3);
  const m = fakeMessage(uid);
  await marketCmd.execute(m, ['sell', 'iron_ore'], '%');
  const t = out(m);
  assert.match(t, /Gợi ý giá/);
  assert.match(t, /market sell iron_ore \d+ 3/, 'phải gợi ý lệnh đăng bán kèm đúng số lượng đang có');
  assert.doesNotMatch(t, /Cú pháp/);
});

test('gợi ý giá: chưa có giao dịch → 2× giá NPC; có giao dịch → theo giá chợ thật', async () => {
  const seller = newPlayer();
  const buyer = newPlayer(100000);
  const item = db.prepare("SELECT id, sell FROM items WHERE id='oak_log'").get();

  // Chưa có giao dịch nào cho món này
  db.prepare('DELETE FROM market_sales WHERE item_id=?').run(item.id);
  const before = marketCmd.priceHint(item.id);
  assert.strictEqual(before.source, 'npc');
  assert.strictEqual(before.suggested, Math.max(item.sell * 2, market.MIN_PRICE));

  // Bán thật 3 lần ở 2 mức giá khác nhau
  player.addItem(seller, item.id, 30);
  for (const price of [100, 100, 300]) {
    const r = market.createListing(seller, item.id, price, 1);
    assert.ok(r.ok, r.error);
    const res = market.buy(buyer, r.listing.id, 1);
    assert.ok(res.ok, res.error);
  }

  const after = marketCmd.priceHint(item.id);
  assert.strictEqual(after.source, 'market', 'phải dùng giá chợ thật khi đã có giao dịch');
  assert.strictEqual(after.suggested, 100, `gợi ý phải là trung vị (100), nhận ${after.suggested}`);
  assert.strictEqual(after.min, 100);
  assert.strictEqual(after.max, 300);
  assert.strictEqual(after.sales, 3);
});

test('gợi ý giá không vượt giới hạn giá của chợ', () => {
  const uid = newPlayer();
  player.addItem(uid, 'worldwood', 1); // item đắt nhất
  const hint = marketCmd.priceHint('worldwood');
  assert.ok(hint.suggested >= market.MIN_PRICE);
  assert.ok(hint.suggested <= market.MAX_PRICE);
});

test('trang món bán được: phân trang bấm được (route mksell)', async () => {
  const uid = newPlayer();
  const items = db.prepare("SELECT id FROM items WHERE soulbound=0 AND type='material' LIMIT 20").all();
  for (const it of items) player.addItem(uid, it.id, 2);

  let payload = null;
  await marketCmd.renderSellablePage({ userId: uid, filter: 'all', page: 0, replyFn: async (p) => { payload = p; } });
  const navIds = payload.components.flatMap(r => r.components.map(b => b.data.custom_id)).filter(id => id.startsWith('page:n:mksell:'));
  assert.ok(navIds.length > 0, 'danh sách dài phải có nút chuyển trang');

  const cap = {};
  await buttons.handle(fakeInteraction(uid, `page:n:mksell:${uid}:all:1`, cap));
  assert.ok(cap.updated, 'bấm ▶ không có phản hồi (domain mksell chưa route)');
  assert.match(cap.updated.embeds[0].data.footer.text, /Trang 2\//);
});

// ─────────────────────────────────────────────────────────────
// #4. %help <từ khoá>
// ─────────────────────────────────────────────────────────────
test('%help <từ khoá> chỉ trả về mục liên quan, ngắn hơn help đầy đủ', async () => {
  const full = fakeMessage('H1');
  await helpCmd.execute(full, []);
  const fullLen = out(full).length;

  const m = fakeMessage('H1');
  await helpCmd.execute(m, ['market']);
  const t = out(m);
  assert.match(t, /help: "market"/);
  assert.match(t, /market sell/, 'phải nêu lệnh liên quan');
  assert.ok(t.length < fullLen, `help theo từ khoá (${t.length}) phải ngắn hơn help đầy đủ (${fullLen})`);
  assert.doesNotMatch(t, /Boss tuần/, 'không được lôi cả mục không liên quan');
});

test('%help tìm được tên lệnh + alias, hiện mô tả thật của lệnh', async () => {
  const m = fakeMessage('H2');
  await helpCmd.execute(m, ['raid']);
  const t = out(m);
  assert.match(t, /📄 Lệnh/);
  assert.match(t, /Boss tuần/, 'phải lấy description từ module lệnh');
  assert.match(t, /%boss/, 'phải liệt kê alias');
});

test('%help gõ không dấu vẫn tìm được (cho → chợ)', async () => {
  const m = fakeMessage('H3');
  await helpCmd.execute(m, ['cho']);
  const t = out(m);
  assert.match(t, /help: "cho"/);
  assert.match(t, /🏪 Chợ|market/, `tìm "cho" không ra mục chợ:\n${t.slice(0, 300)}`);
});

test('%help từ khoá rác → gợi ý các mục có sẵn, không crash', async () => {
  const m = fakeMessage('H4');
  await helpCmd.execute(m, ['zzzzkhongco']);
  const t = out(m);
  assert.match(t, /Không tìm thấy/);
  assert.match(t, /Mục có sẵn/);
  assert.match(t, /%help/);
});

test('%help <từ khoá> không lộ lệnh admin cho người chơi thường', async () => {
  const m = fakeMessage('H5', { admin: false });
  await helpCmd.execute(m, ['pet']);
  const t = out(m);
  assert.doesNotMatch(t, /petrestore/, 'người chơi thường không nên thấy lệnh admin');
  const m2 = fakeMessage('H5', { admin: true });
  await helpCmd.execute(m2, ['pet']);
  assert.match(out(m2), /petrestore/, 'admin vẫn phải thấy');
});

test('%help đầy đủ vẫn còn đủ 12 mục như trước', async () => {
  const m = fakeMessage('H6');
  await helpCmd.execute(m, []);
  const t = out(m);
  for (const name of ['Nhân vật', 'Chiến đấu', 'Trang bị', 'Chợ', 'Tra cứu', 'Nhiệm vụ', 'Pet', 'Nghề', 'Bang hội', 'Boss tuần', 'PvP', 'Khác']) {
    assert.ok(t.includes(name), `help đầy đủ thiếu mục ${name}`);
  }
});

test('%help khớp theo TỪ, không dính "chọn" khi tìm "cho"', async () => {
  const m = fakeMessage('H7');
  await helpCmd.execute(m, ['cho']);
  const t = out(m);
  assert.doesNotMatch(t, /Trang bị/, 'từ khoá "cho" không được kéo theo mục Trang bị');
});

test('%help "trangbi" (không dấu, không khoảng trắng) vẫn ra mục Trang bị', async () => {
  const m = fakeMessage('H8');
  await helpCmd.execute(m, ['trangbi']);
  assert.match(out(m), /Trang bị/);
});

test('%market sell <id sai> → gợi ý danh sách món bán được thay vì lỗi cụt', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 2);
  const m = fakeMessage(uid);
  await marketCmd.execute(m, ['sell', 'khong_co_item_nay'], '%');
  const t = out(m);
  assert.match(t, /Không có item/);
  assert.match(t, /Chọn món để bán/);
  assert.match(t, /iron_ore/);
});
