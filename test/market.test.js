// Test cho CHỢ NGƯỜI CHƠI (%market).
//
// Khoá các yêu cầu:
//   1. Đăng bán = ESCROW: item rời túi ngay, không vừa bán vừa dùng được
//      (đúng lớp lỗi dup của %sell ngày trước).
//   2. Chặn: soulbound, phần đang trang bị, giá vô lý, quá 10 tin/người.
//   3. Mua: vàng chuyển đúng, thuế 5% bị HUỶ (không vào ai), mua một phần
//      còn lại đúng số, không mua tin của mình.
//   4. Huỷ / hết hạn: item trả lại túi người bán, không mất.
//   5. Lịch sử giá (%market recent) ghi lại giao dịch thật.
//   6. Chợ hiển thị tin mới ngay (đọc DB), tìm được theo tên, người bán thấy
//      tin của mình.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, market, marketCmd, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  market = require(`${ROOT}/src/game/market`);
  marketCmd = require(`${ROOT}/src/commands/market`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (gold = 10000) => {
  const uid = `MK${++seq}`;
  player.createPlayer(uid, `m${seq}`);
  if (gold) player.updatePlayer(uid, { gold });
  return uid;
};
const goldOf = (uid) => db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
const qtyOf = (uid, item) => {
  const r = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, item);
  return r ? r.qty : 0;
};

// ─────────────────────────────────────────────────────────────
// 1. Đăng bán (escrow)
// ─────────────────────────────────────────────────────────────
test('đăng bán: item rời túi ngay (escrow), tin có đúng qty/giá', () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 5);
  const res = market.createListing(uid, 'iron_ore', 30, 3);
  assert.ok(res.ok, res.error);
  assert.strictEqual(res.listing.qty, 3);
  assert.strictEqual(res.listing.price, 30);
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 2, 'item không bị giữ lại (vẫn dùng được = dup)');
});

test('không đăng bán được soulbound', () => {
  // DB seed hiện không có món soulbound nào (cột tồn tại nhưng chưa dùng), nên
  // bật cờ trên 1 item rồi tắt lại — luật vẫn phải đúng khi admin bật cờ.
  const uid = newPlayer();
  player.addItem(uid, 'stone', 1);
  db.prepare('UPDATE items SET soulbound=1 WHERE id=?').run('stone');
  try {
    const res = market.createListing(uid, 'stone', 100, 1);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'soulbound');
    assert.strictEqual(qtyOf(uid, 'stone'), 1, 'item soulbound bị trừ dù không đăng được');
  } finally {
    db.prepare('UPDATE items SET soulbound=0 WHERE id=?').run('stone');
  }
});

test('đang trang bị: chỉ bán được phần rảnh', () => {
  const uid = newPlayer();
  const w = 'stone';
  player.addItem(uid, w, 2);
  // Giả lập 1 món đang mặc (equip không lấy item ra khỏi túi)
  db.prepare('INSERT OR REPLACE INTO equipped (user_id, slot, item_id) VALUES (?,?,?)').run(uid, 'weapon', w);

  const res = market.createListing(uid, w, 500, 2);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'not_enough');
  assert.strictEqual(res.free, 1);
  assert.strictEqual(qtyOf(uid, w), 2, 'bị trừ item dù đăng bán thất bại');

  const ok = market.createListing(uid, w, 500, 1);
  assert.ok(ok.ok, 'không đăng được phần rảnh');
  assert.strictEqual(qtyOf(uid, w), 1);
  db.prepare('DELETE FROM equipped WHERE user_id=?').run(uid);
});

test('giá: chặn < 1 và > 10 triệu', () => {
  const uid = newPlayer();
  player.addItem(uid, 'stone', 3);
  assert.strictEqual(market.createListing(uid, 'stone', 0, 1).error, 'price_low');
  assert.strictEqual(market.createListing(uid, 'stone', market.MAX_PRICE + 1, 1).error, 'price_high');
  assert.strictEqual(qtyOf(uid, 'stone'), 3);
});

test('tối đa 10 tin/người', () => {
  const uid = newPlayer();
  player.addItem(uid, 'stone', 20);
  for (let i = 0; i < market.MAX_LISTINGS_PER_USER; i++) {
    assert.ok(market.createListing(uid, 'stone', 10 + i, 1).ok, `tin ${i + 1} không đăng được`);
  }
  const res = market.createListing(uid, 'stone', 99, 1);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'too_many');
});

test('không đăng bán được item không tồn tại', () => {
  const uid = newPlayer();
  assert.strictEqual(market.createListing(uid, 'khong_co_item_nay', 10, 1).error, 'no_item');
});

// ─────────────────────────────────────────────────────────────
// 2. Mua
// ─────────────────────────────────────────────────────────────
test('mua: buyer mất vàng + nhận item, seller nhận 95%, thuế bị huỷ', () => {
  const seller = newPlayer(1000);
  const buyer = newPlayer(10000);
  player.addItem(seller, 'mithril_ore', 2);
  const listing = market.createListing(seller, 'mithril_ore', 500, 2).listing;

  const totalGoldBefore = goldOf(seller) + goldOf(buyer);
  const res = market.buy(buyer, listing.id, 2);
  assert.ok(res.ok, res.error);
  assert.strictEqual(res.total, 1000);
  assert.strictEqual(res.tax, 50, 'thuế phải là 5%');
  assert.strictEqual(res.payout, 950);

  assert.strictEqual(qtyOf(buyer, 'mithril_ore'), 2);
  assert.strictEqual(goldOf(buyer), 9000);
  assert.strictEqual(goldOf(seller), 1000 + 950);
  // Vàng thuế biến mất khỏi nền kinh tế
  assert.strictEqual(goldOf(seller) + goldOf(buyer), totalGoldBefore - res.tax);
  // Tin bán hết thì biến mất
  assert.strictEqual(market.getListing(listing.id), null);
});

test('mua một phần: tin còn lại đúng số, không mất item', () => {
  const seller = newPlayer();
  const buyer = newPlayer();
  player.addItem(seller, 'dragon_scale', 10);
  const listing = market.createListing(seller, 'dragon_scale', 200, 10).listing;

  const res = market.buy(buyer, listing.id, 4);
  assert.ok(res.ok, res.error);
  assert.strictEqual(res.remaining, 6);
  assert.strictEqual(market.getListing(listing.id).qty, 6);
  assert.strictEqual(qtyOf(buyer, 'dragon_scale'), 4);
});

test('không đủ vàng: không giao dịch, tin còn nguyên', () => {
  const seller = newPlayer();
  const buyer = newPlayer(50);
  player.addItem(seller, 'gem_ruby', 1);
  const listing = market.createListing(seller, 'gem_ruby', 999, 1).listing;

  const res = market.buy(buyer, listing.id, 1);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'no_gold');
  assert.strictEqual(goldOf(buyer), 50);
  assert.strictEqual(qtyOf(buyer, 'gem_ruby'), 0);
  assert.ok(market.getListing(listing.id), 'tin bị xoá dù giao dịch thất bại');
});

test('không mua được tin của chính mình', () => {
  const uid = newPlayer(10000);
  player.addItem(uid, 'coal', 1);
  const listing = market.createListing(uid, 'coal', 100, 1).listing;
  const res = market.buy(uid, listing.id, 1);
  assert.strictEqual(res.error, 'own_listing');
  assert.ok(market.getListing(listing.id));
});

test('mua quá số lượng trong tin bị chặn', () => {
  const seller = newPlayer();
  const buyer = newPlayer();
  player.addItem(seller, 'coal', 2);
  const listing = market.createListing(seller, 'coal', 10, 2).listing;
  const res = market.buy(buyer, listing.id, 3);
  assert.strictEqual(res.error, 'qty_exceeds');
  assert.strictEqual(market.getListing(listing.id).qty, 2);
});

// ─────────────────────────────────────────────────────────────
// 3. Huỷ / hết hạn
// ─────────────────────────────────────────────────────────────
test('huỷ tin: item trả lại túi người bán', () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ingot', 3);
  const listing = market.createListing(uid, 'iron_ingot', 120, 3).listing;
  assert.strictEqual(qtyOf(uid, 'iron_ingot'), 0);

  const res = market.cancel(uid, listing.id);
  assert.ok(res.ok, res.error);
  assert.strictEqual(qtyOf(uid, 'iron_ingot'), 3);
  assert.strictEqual(market.getListing(listing.id), null);
});

test('người khác không huỷ được tin của tôi', () => {
  const owner = newPlayer();
  const other = newPlayer();
  player.addItem(owner, 'copper_ingot', 1);
  const listing = market.createListing(owner, 'copper_ingot', 50, 1).listing;
  const res = market.cancel(other, listing.id);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'not_owner');
  assert.ok(market.getListing(listing.id), 'tin bị xoá bởi người không phải chủ');
});

test('tin quá 7 ngày: item được TRẢ LẠI, không biến mất', () => {
  const uid = newPlayer();
  player.addItem(uid, 'silver_ore', 4);
  const listing = market.createListing(uid, 'silver_ore', 80, 4).listing;
  // Đẩy created_at về quá hạn
  db.prepare('UPDATE market_listings SET created_at=? WHERE id=?')
    .run(Date.now() - market.LISTING_TTL_MS - 1000, listing.id);

  const removed = market.cleanupExpired();
  assert.strictEqual(removed, 1);
  assert.strictEqual(market.getListing(listing.id), null);
  assert.strictEqual(qtyOf(uid, 'silver_ore'), 4, 'item hết hạn bị mất');
});

// ─────────────────────────────────────────────────────────────
// 4. Lịch sử giá
// ─────────────────────────────────────────────────────────────
test('giao dịch được ghi vào lịch sử giá', () => {
  const seller = newPlayer();
  const buyer = newPlayer();
  player.addItem(seller, 'void_essence', 3);
  const listing = market.createListing(seller, 'void_essence', 900, 3).listing;
  market.buy(buyer, listing.id, 2);

  const history = market.recentSales('void_essence');
  assert.ok(history.length >= 1);
  assert.strictEqual(history[0].qty, 2);
  assert.strictEqual(history[0].price, 900);
});

// ─────────────────────────────────────────────────────────────
// 5. Lệnh %market
// ─────────────────────────────────────────────────────────────
test('%market sell đăng bán qua lệnh và báo mã tin', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'herb_common', 5);
  const m = fakeMessage(uid);
  await marketCmd.execute(m, ['sell', 'herb_common', '40', '2'], '%');
  const t = out(m);
  assert.match(t, /Đã đăng bán/, t);
  assert.match(t, /#\d+/);
  assert.strictEqual(qtyOf(uid, 'herb_common'), 3);
});

test('%market hiện tin mới ngay (đọc DB, không cache)', async () => {
  // Dọn tin của các test trước để trang 1 chỉ còn tin vừa tạo
  db.prepare('DELETE FROM market_listings').run();
  const uid = newPlayer();
  player.addItem(uid, 'gem_sapphire', 1);
  const listing = market.createListing(uid, 'gem_sapphire', 1234, 1).listing;

  const viewer = newPlayer();
  const m = fakeMessage(viewer);
  await marketCmd.execute(m, [], '%');
  const t = out(m);
  assert.match(t, new RegExp(`#${listing.id}`), `không thấy tin mới:\n${t}`);
  assert.match(t, /1234/);
});

test('%market mine chỉ hiện tin của mình', async () => {
  const a = newPlayer();
  const b = newPlayer();
  player.addItem(a, 'stone', 1);
  player.addItem(b, 'coal', 1);
  const la = market.createListing(a, 'stone', 11, 1).listing;
  const lb = market.createListing(b, 'coal', 22, 1).listing;

  const m = fakeMessage(a);
  await marketCmd.execute(m, ['mine'], '%');
  const t = out(m);
  assert.match(t, new RegExp(`#${la.id}`));
  assert.ok(!t.includes(`#${lb.id}`), 'thấy tin của người khác trong %market mine');
});

test('%market search tìm theo tên', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'dragon_bone', 2);
  const listing = market.createListing(uid, 'dragon_bone', 700, 1).listing;
  const m = fakeMessage(newPlayer());
  await marketCmd.execute(m, ['search', 'dragon'], '%');
  assert.match(out(m), new RegExp(`#${listing.id}`), out(m));
});

test('%market buy qua lệnh: trừ vàng, nhận item', async () => {
  const seller = newPlayer();
  const buyer = newPlayer(5000);
  player.addItem(seller, 'mithril_ingot', 1);
  const listing = market.createListing(seller, 'mithril_ingot', 300, 1).listing;

  const m = fakeMessage(buyer);
  await marketCmd.execute(m, ['buy', `#${listing.id}`], '%');
  assert.match(out(m), /Đã mua/, out(m));
  assert.strictEqual(qtyOf(buyer, 'mithril_ingot'), 1);
  assert.strictEqual(goldOf(buyer), 4700);
});

test('%market cancel qua lệnh trả lại item', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'mithril_ore', 2);
  const listing = market.createListing(uid, 'mithril_ore', 400, 2).listing;
  const m = fakeMessage(uid);
  await marketCmd.execute(m, ['cancel', `#${listing.id}`], '%');
  assert.match(out(m), /Đã huỷ/);
  assert.strictEqual(qtyOf(uid, 'mithril_ore'), 2);
});

test('%market recent hiện giao dịch', async () => {
  const seller = newPlayer();
  const buyer = newPlayer();
  player.addItem(seller, 'diamond', 1);
  const listing = market.createListing(seller, 'diamond', 5000, 1).listing;
  market.buy(buyer, listing.id, 1);

  const m = fakeMessage(newPlayer());
  await marketCmd.execute(m, ['recent'], '%');
  assert.match(out(m), /diamond|Diamond/i, out(m));
});

test('%market help liệt kê các lệnh con', async () => {
  const m = fakeMessage(newPlayer());
  await marketCmd.execute(m, ['help'], '%');
  const t = out(m);
  for (const sub of ['sell', 'buy', 'mine', 'cancel', 'recent']) {
    assert.match(t, new RegExp(sub), `help thiếu ${sub}:\n${t}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 6. Idempotent
// ─────────────────────────────────────────────────────────────
test('migrate chạy lại không mất tin đang bán', () => {
  const uid = newPlayer();
  player.addItem(uid, 'stone', 1);
  const before = market.createListing(uid, 'stone', 5, 1).listing;
  market.migrate();
  market.migrate();
  assert.ok(market.getListing(before.id), 'migrate làm mất tin đang bán');
});
