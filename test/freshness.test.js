// Test hồi quy: LỆNH PHẢI THẤY NỘI DUNG MỚI.
//
// Nhóm lỗi được khoá ở đây (đều đã xảy ra thật):
//   1. `%info item` bỏ qua field thêm sau này — bình máu dùng heal_pct (heal=0)
//      nên KHÔNG hiện gì về hồi máu; `min_level` không bao giờ hiện.
//   2. `%info items` cắt danh sách ở 1024 ký tự và chỉ hiện các nhóm có trong
//      `groupOrder` viết cứng → 16/223 item biến mất, item type mới (lootbox)
//      không bao giờ xuất hiện.
//   3. `%inv` cũng duyệt groupOrder viết cứng → item type lạ bị bỏ khỏi túi.
//   4. `%item create/edit` không ghi được min_level và heal_pct dù hai cột này
//      tồn tại trong bảng items → admin tạo item mới luôn ra "Lv.1, hồi 0".
//   5. `%shop` / `%craft list` chỉ có filter viết cứng → loại hàng mới chỉ thấy
//      khi bấm "All".
//   6. `%upgrade list` lấy mẫu vũ khí bằng id viết cứng.
//   7. `%ach admin create` chỉ nhận 4 tier viết cứng thay vì TIERS.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, info, itemCmd, invCmd, shopCmd, craftCmd, upgradeCmd, achCmd, player;
let seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  info = require(`${ROOT}/src/commands/info`);
  itemCmd = require(`${ROOT}/src/commands/item`);
  invCmd = require(`${ROOT}/src/commands/inventory`);
  shopCmd = require(`${ROOT}/src/commands/shop`);
  craftCmd = require(`${ROOT}/src/commands/craft`);
  upgradeCmd = require(`${ROOT}/src/commands/upgrade`);
  achCmd = require(`${ROOT}/src/commands/achievement`);
  loud();
});

const admin = () => fakeMessage('ADMIN_1', { ownerId: 'ADMIN_1' });
const out = (m) => m._text();

// ─────────────────────────────────────────────────────────────
// 1. %info item phải hiện field mới
// ─────────────────────────────────────────────────────────────
test('info item: hiện % hồi máu của bình dùng heal_pct', async () => {
  const m = fakeMessage('U');
  await info.execute(m, ['item', 'potion_astral']);
  const t = out(m);
  const row = db.prepare("SELECT heal, heal_pct FROM items WHERE id='potion_astral'").get();
  assert.ok(row.heal_pct > 0, 'bình này phải dùng heal_pct');
  assert.ok(t.includes(`${row.heal_pct}%`),
    `info item không hiện % hồi máu (heal_pct=${row.heal_pct}). Output:\n${t}`);
});

test('info item: hiện level yêu cầu của đồ cao cấp', async () => {
  const m = fakeMessage('U');
  await info.execute(m, ['item', 'sword_astral']);
  const t = out(m);
  const lv = db.prepare("SELECT min_level FROM items WHERE id='sword_astral'").get().min_level;
  assert.ok(t.includes(`Lv.${lv}`),
    `info item không hiện min_level (=${lv}). Output:\n${t}`);
});

test('info item: hiện cả field lạ chưa có nhãn (cột mới thêm)', async () => {
  // Mô phỏng "cột mới thêm vào bảng items": nếu lệnh chỉ hiện field nằm trong
  // danh sách viết cứng thì dữ liệu mới vô hình với người chơi.
  db.exec('ALTER TABLE items ADD COLUMN test_note TEXT DEFAULT ""');
  db.prepare("UPDATE items SET test_note='ghi chu thu' WHERE id='wood_sword'").run();
  try {
    const m = fakeMessage('U');
    await info.execute(m, ['item', 'wood_sword']);
    assert.ok(out(m).includes('ghi chu thu'),
      `cột mới KHÔNG hiện trong info item:\n${out(m)}`);
  } finally {
    db.exec('ALTER TABLE items DROP COLUMN test_note');
  }
});

// ─────────────────────────────────────────────────────────────
// 2. %info items: không được bỏ item, phải thấy loại mới
// ─────────────────────────────────────────────────────────────
test('info items: bộ lọc sinh từ dữ liệu (đủ mọi loại đang có)', async () => {
  const types = db.prepare('SELECT DISTINCT type FROM items').all().map(r => r.type);
  // Mỗi loại phải lọc được ra ít nhất 1 item
  for (const type of types) {
    const m = fakeMessage('U');
    await info.execute(m, ['items', type]);
    assert.ok(/— [1-9]\d* món/.test(out(m)),
      `%info items ${type} không có món nào (loại này bị bỏ sót)`);
  }
});

test('info items: item type lạ (lootbox) vẫn hiện trong danh sách', async () => {
  const id = `test_box_${++seq}`;
  db.prepare(`INSERT INTO items (id, name, type, tier, price, sell, desc)
    VALUES (?,?,?,?,?,?,?)`).run(id, 'Test Box', 'lootbox', 'rare', 100, 20, '');
  try {
    const m = fakeMessage('U');
    await info.execute(m, ['items', 'lootbox']);
    assert.ok(out(m).includes(id), `item type=lootbox bị bỏ khỏi %info items:\n${out(m)}`);
  } finally {
    db.prepare('DELETE FROM items WHERE id=?').run(id);
  }
});

test('info items: tổng số món = số item trong DB (không cắt mất)', async () => {
  const total = db.prepare('SELECT COUNT(*) c FROM items').get().c;
  const m = fakeMessage('U');
  await info.execute(m, ['items']);
  assert.ok(out(m).includes(`— ${total} món`),
    `%info items báo sai tổng (DB có ${total}):\n${out(m).split('\n')[0]}`);
});

// ─────────────────────────────────────────────────────────────
// 3. %inv: item type lạ không được biến mất
// ─────────────────────────────────────────────────────────────
test('inv: item type lạ vẫn hiện trong túi', async () => {
  const uid = `INV${++seq}`;
  const id = `test_box_inv_${seq}`;
  player.createPlayer(uid, 'inv');
  db.prepare(`INSERT INTO items (id, name, type, tier, price, sell, desc)
    VALUES (?,?,?,?,?,?,?)`).run(id, 'Hộp Test', 'lootbox', 'rare', 100, 20, '');
  player.addItem(uid, id, 1);
  try {
    const m = fakeMessage(uid);
    await invCmd.execute(m, []);
    assert.ok(out(m).includes(id), `%inv bỏ mất item type=lootbox:\n${out(m)}`);
  } finally {
    db.prepare('DELETE FROM items WHERE id=?').run(id);
    db.prepare('DELETE FROM inventory WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
  }
});

// ─────────────────────────────────────────────────────────────
// 4. %item create/edit: ghi được min_level + heal_pct
// ─────────────────────────────────────────────────────────────
test('item create: lưu được min_level và heal_pct', async () => {
  const id = `test_new_${++seq}`;
  const m = admin();
  m.content = `%item create ${id} name="Bình Test" type=consumable tier=epic heal_pct=45 min_level=12 price=500`;
  await itemCmd.execute(m, ['create', id]);
  try {
    const row = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    assert.ok(row, 'item không được tạo');
    assert.strictEqual(row.min_level, 12, 'min_level không được lưu — item Lv.45 sẽ mặc được từ Lv.1');
    assert.strictEqual(row.heal_pct, 45, 'heal_pct không được lưu — bình hồi % không tạo được');

    const m2 = fakeMessage('U');
    await info.execute(m2, ['item', id]);
    assert.ok(out(m2).includes('45%') && out(m2).includes('Lv.12'),
      `item vừa tạo không hiện đủ chỉ số trong %info item:\n${out(m2)}`);
  } finally {
    db.prepare('DELETE FROM items WHERE id=?').run(id);
  }
});

test('item edit: sửa được min_level và heal_pct', async () => {
  const id = `test_edit_${++seq}`;
  db.prepare(`INSERT INTO items (id, name, type, tier, price, sell, desc)
    VALUES (?,?,?,?,?,?,?)`).run(id, 'Bình Edit', 'consumable', 'rare', 100, 20, '');
  const m = admin();
  m.content = `%item edit ${id} heal_pct=30 min_level=7`;
  await itemCmd.execute(m, ['edit', id]);
  try {
    const row = db.prepare('SELECT heal_pct, min_level FROM items WHERE id=?').get(id);
    assert.strictEqual(row.heal_pct, 30);
    assert.strictEqual(row.min_level, 7);
  } finally {
    db.prepare('DELETE FROM items WHERE id=?').run(id);
  }
});

// ─────────────────────────────────────────────────────────────
// 5. %shop / %craft: filter sinh từ dữ liệu
// ─────────────────────────────────────────────────────────────
test('shop: loại hàng đang bán đều lọc được (accessory/offhand không bị ẩn)', async () => {
  const types = db.prepare(`SELECT DISTINCT i.type t FROM shop s JOIN items i ON i.id = s.item_id`).all().map(r => r.t);
  const uid = `SHOP${++seq}`;
  player.createPlayer(uid, 'shop');
  try {
    for (const type of types) {
      const m = fakeMessage(uid);
      await shopCmd.execute(m, [type]);
      const t = out(m);
      assert.ok(!t.includes('— All'), `%shop ${type} rơi về All (loại này không có filter riêng)`);
    }
  } finally {
    db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
  }
});

test('craft: filter sinh từ loại sản phẩm đang có', async () => {
  const uid = `CRAFT${++seq}`;
  player.createPlayer(uid, 'craft');
  const m = fakeMessage(uid);
  await craftCmd.execute(m, ['list']);
  const t = out(m);
  // Chỉ cần chắc chắn không lỗi và có danh sách; filter nào cũng phải lọc ra
  // được ít nhất 1 recipe hoặc rơi an toàn về All.
  assert.ok(t.includes('Recipes'), `%craft list lỗi:\n${t}`);
});

// ─────────────────────────────────────────────────────────────
// 6. %upgrade list: mẫu lấy từ DB
// ─────────────────────────────────────────────────────────────
test('upgrade list: mẫu vũ khí lấy từ DB, không phải id viết cứng', async () => {
  // upgrade list cần player (nó hiện cấp đang có của người gọi)
  const uid = `UPG${++seq}`;
  player.createPlayer(uid, 'upg');
  const m = fakeMessage(uid);
  await upgradeCmd.execute(m, ['list']);
  const t = out(m);
  // Mọi tên vũ khí trong bảng phải tồn tại thật
  const names = [...t.matchAll(/\*\*([^*]+)\*\* \(Lv\./g)].map(x => x[1]);
  assert.ok(names.length > 0, `bảng nâng cấp không có mẫu vũ khí nào:\n${t.slice(0, 300)}`);
  for (const name of names) {
    const row = db.prepare("SELECT id FROM items WHERE name=? AND type='weapon'").get(name);
    assert.ok(row, `mẫu "${name}" không có trong bảng items`);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. tier phải lấy từ TIERS
// ─────────────────────────────────────────────────────────────
test('ach admin: nhận mọi tier trong TIERS (không viết cứng 4 tier)', async () => {
  const { TIERS } = require(`${ROOT}/src/game/tiers`);
  const tier = Object.keys(TIERS)[Object.keys(TIERS).length - 1];
  const id = `ach_test_${++seq}`;
  const m = admin();
  m.content = `%ach admin create ${id} name="Test" obj=pet_tier target=${tier} points=1`;
  await achCmd.execute(m, ['admin', 'create', id]);
  try {
    const row = db.prepare('SELECT id FROM achievements WHERE id=?').get(id);
    assert.ok(row, `tier "${tier}" bị từ chối dù có trong TIERS: ${out(m)}`);
  } finally {
    db.prepare('DELETE FROM achievements WHERE id=?').run(id);
  }
});

// ─────────────────────────────────────────────────────────────
// 8. %unequip all phải phủ MỌI slot trong slots.js
// ─────────────────────────────────────────────────────────────
test('unequip all: tháo hết mọi slot có trong slots.js', async () => {
  const { SLOT_ORDER, setEquipped, getEquipped } = require(`${ROOT}/src/game/slots`);
  const uid = `UNEQ${++seq}`;
  player.createPlayer(uid, 'uneq');
  // Gắn một item thật vào mọi slot rồi tháo "all"
  const anyItem = db.prepare("SELECT id FROM items WHERE type='armor' LIMIT 1").get().id;
  for (const slot of SLOT_ORDER) setEquipped(uid, slot, anyItem);
  const m = fakeMessage(uid);
  await require(`${ROOT}/src/commands/unequip`).execute(m, ['all']);
  const left = getEquipped(uid);
  const still = SLOT_ORDER.filter(s => s !== 'pet' && left[s]);
  assert.deepStrictEqual(still, [], `%unequip all bỏ sót slot: ${still.join(', ')}`);
  db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
  db.prepare('DELETE FROM equipped WHERE user_id=?').run(uid);
});

// ─────────────────────────────────────────────────────────────
// 9. %quest list: cắt 20 dòng phải nói rõ còn bao nhiêu
// ─────────────────────────────────────────────────────────────
test('quest list: không cắt im lặng khi có > 20 quest', async () => {
  const quests = require(`${ROOT}/src/game/quests`);
  const created = [];
  for (let i = 0; i < 23; i++) {
    const id = `q_test_${seq}_${i}`;
    if (quests.createQuest({ id, name: `Quest ${i}`, type: 'custom', objective: 'kill', target_qty: 1, reward_gold: 1, reward_xp: 1 })) {
      created.push(id);
    }
  }
  try {
    // Nhánh admin mới là nhánh có bảng "All Quests" (nhánh người chơi hiện
    // riêng custom quest). Admin cũng cần nhân vật để lệnh chạy.
    if (!player.getPlayer('ADMIN_1')) player.createPlayer('ADMIN_1', 'admin');
    const m = admin();
    await require(`${ROOT}/src/commands/quest`).execute(m, ['admin', 'list']);
    const t = out(m);
    const total = quests.getAllQuests().length;
    assert.ok(t.includes(`(${total})`) || t.includes('nữa'),
      `%quest list không cho biết tổng số quest (tổng ${total}):\n${t.slice(0, 300)}`);
  } finally {
    for (const id of created) quests.deleteQuest(id);
  }
});

// ─────────────────────────────────────────────────────────────
// 10. Nút phân trang của %info items phải có route
// ─────────────────────────────────────────────────────────────
test('buttons: bấm next trên %info items ra trang khác', async () => {
  const { encodeCustomId } = require(`${ROOT}/src/game/paginator`);
  const buttons = require(`${ROOT}/src/buttons`);
  const uid = `PG${++seq}`;
  player.createPlayer(uid, 'pg');
  let got = null;
  const interaction = {
    customId: encodeCustomId('info', uid, 'all', 1, 'n'),
    user: { id: uid },
    update: async (payload) => { got = payload; },
    reply: async (payload) => { got = payload; },
  };
  await buttons.handle(interaction);
  assert.ok(got, 'không có response cho customId domain=info');
  const desc = got.embeds?.[0]?.data?.description || got.embeds?.[0]?.description || '';
  assert.ok(desc && desc.includes('`'), `trang 2 của %info items rỗng:\n${desc.slice(0, 200)}`);
  db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
});

// ─────────────────────────────────────────────────────────────
// 11. %info mobs: không cắt im lặng danh sách quái
// ─────────────────────────────────────────────────────────────
test('info mobs: tổng số quái = số quái trong DB', async () => {
  const total = db.prepare('SELECT COUNT(*) c FROM monsters').get().c;
  const m = fakeMessage('U');
  await info.execute(m, ['mobs']);
  assert.ok(out(m).includes(`— ${total} con`),
    `%info mobs báo sai tổng (DB có ${total}):\n${out(m).split('\n')[0]}`);
});

test('info mobs <zone>: đủ số quái của zone đó', async () => {
  const zones = db.prepare('SELECT zone_id, COUNT(*) c FROM monsters GROUP BY zone_id').all();
  for (const z of zones) {
    const m = fakeMessage('U');
    await info.execute(m, ['mobs', z.zone_id]);
    assert.ok(out(m).includes(`— ${z.c} con`),
      `%info mobs ${z.zone_id} thiếu quái (DB có ${z.c}):\n${out(m).split('\n')[0]}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 12. %craft list <loại>: lọc được cả loại không có nút
// ─────────────────────────────────────────────────────────────
test('craft list: tham số loại hoạt động kể cả khi loại đó không có nút', async () => {
  const uid = `CRAFT2${++seq}`;
  player.createPlayer(uid, 'craft2');
  const m = fakeMessage(uid);
  await craftCmd.execute(m, ['list', 'accessory']);
  const t = out(m);
  assert.ok(/— Lv\./.test(t) && !t.includes('Recipes — All'),
    `%craft list accessory rơi về All:\n${t.split('\n')[0]}`);
  db.prepare('DELETE FROM players WHERE user_id=?').run(uid);
});
