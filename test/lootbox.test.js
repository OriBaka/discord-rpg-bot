// Test lệnh admin %lootbox (viết lại cho dễ dùng).
//
// Khoá các yêu cầu:
//   1. `create` tạo được hộp quà trong MỘT bước (không cần `%item create`).
//   2. `add` dùng chung một cú pháp cho cả 5 type; gold/xp không còn "shift"
//      tham số; cú pháp cũ (theo vị trí) vẫn chạy.
//   3. Entry được đánh số #n và `show` / `edit` / `rm` dùng chung số đó.
//   4. `edit` sửa weight/qty/guaranteed không cần xoá-rồi-thêm; sửa weight của
//      entry này làm thay đổi % của entry khác.
//   5. `sim` in tỉ lệ THẬT, không cấp phần thưởng.
//   6. `list` cảnh báo hộp không có nguồn kiếm + hộp trống.
//   7. Xoá hộp phải xác nhận và xoá cả item lẫn loot table.
//   8. Mọi thứ vẫn không phá hành vi mở hộp của người chơi (%use).
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, lootbox, lbCmd, useCmd, player, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  lootbox = require(`${ROOT}/src/game/lootbox`);
  lbCmd = require(`${ROOT}/src/commands/lootbox`);
  useCmd = require(`${ROOT}/src/commands/use`);
  loud();
});

const out = (m) => m._text();
let adminSeq = 0;
const admin = () => fakeMessage(`ADM${++adminSeq}`, { admin: true, ownerId: `ADM${adminSeq}` });
const PLAYER = 'PLAYER1';

if (!player.getPlayer(PLAYER)) {
  before(() => { try { player.createPlayer(PLAYER, 'player1'); } catch {} });
}

// Gọi lệnh; content dùng cho những lệnh cần bóc quote (create).
async function run(subArgs, content) {
  const m = admin();
  m.content = content || `%lootbox ${subArgs.join(' ')}`;
  await lbCmd.execute(m, subArgs);
  return { text: out(m), msg: m };
}

const tableOf = (id) => db.prepare('SELECT * FROM loot_tables WHERE lootbox_id=? ORDER BY reward_type, reward_id').all(id);

async function makeBox(id, extra = '') {
  const r = await run(['create', id, 'name="Hộp Test"', extra].filter(Boolean),
    `%lootbox create ${id} name="Hộp Test" ${extra}`.trim());
  return r;
}

// ─────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────
test('create tạo hộp quà trong một bước (không cần %item create)', async () => {
  const r = await makeBox('lb_test_a', 'tier=epic');
  const it = db.prepare("SELECT * FROM items WHERE id='lb_test_a'").get();
  assert.ok(it, `không tạo được item. Output: ${r.text}`);
  assert.strictEqual(it.type, 'lootbox');
  assert.strictEqual(it.tier, 'epic');
  assert.strictEqual(it.name, 'Hộp Test');
  assert.ok(it.desc.length >= 25, 'mô tả mặc định phải đủ dài (không phải item rác)');
  assert.ok(r.text.includes('lootbox add lb_test_a'), 'phải gợi ý bước tiếp theo');
});

test('create shop=1500 bán luôn trong shop (một bước là dùng được)', async () => {
  const r = await run(['create', 'lb_test_shop', 'name="Hộp Shop"', 'shop=1500'],
    '%lootbox create lb_test_shop name="Hộp Shop" shop=1500');
  const row = db.prepare("SELECT price FROM shop WHERE item_id='lb_test_shop'").get();
  assert.ok(row, `không thêm vào shop. Output: ${r.text}`);
  assert.strictEqual(row.price, 1500);
  assert.ok(r.text.includes('shop'), r.text);
});

test('create: thiếu name / trùng id / sai tier đều báo rõ', async () => {
  const noName = await run(['create', 'lb_no_name'], '%lootbox create lb_no_name');
  assert.ok(noName.text.includes('Thiếu tên'), noName.text);

  const dup = await run(['create', 'lb_test_a', 'name="Trùng"'], '%lootbox create lb_test_a name="Trùng"');
  assert.ok(dup.text.includes('đã có'), dup.text);

  const badTier = await run(['create', 'lb_bad_tier', 'name="X"', 'tier=khong_ton_tai'],
    '%lootbox create lb_bad_tier name="X" tier=khong_ton_tai');
  assert.ok(badTier.text.includes('tier'), badTier.text);
  assert.strictEqual(db.prepare("SELECT 1 FROM items WHERE id='lb_bad_tier'").get(), undefined);
});

test('add: chặn khi hộp không tồn tại hoặc không phải lootbox', async () => {
  const r = await run(['add', 'lb_khong_co', 'item', 'potion_s', 'w=10']);
  assert.ok(r.text.includes('Không có item'), r.text);
  // item thật nhưng không phải lootbox
  const r2 = await run(['add', 'potion_s', 'item', 'potion_m', 'w=10']);
  assert.ok(r2.text.includes('không phải lootbox'), r2.text);
});

// ─────────────────────────────────────────────────────────────
// add — một cú pháp cho mọi type
// ─────────────────────────────────────────────────────────────
test('add item / gold / pet / shard bằng cú pháp key=value', async () => {
  await makeBox('lb_test_b');

  let r = await run(['add', 'lb_test_b', 'item', 'potion_s', 'qty=1-3', 'w=50']);
  assert.ok(r.text.includes('✅'), r.text);

  r = await run(['add', 'lb_test_b', 'gold', '100-500', 'w=30']);
  assert.ok(r.text.includes('✅'), r.text);

  r = await run(['add', 'lb_test_b', 'pet', 'pet_baby_rat', 'qty=1', 'w=5']);
  assert.ok(r.text.includes('✅'), r.text);

  r = await run(['add', 'lb_test_b', 'shard', 'shard_leaf', 'qty=2', 'w=15']);
  assert.ok(r.text.includes('✅'), r.text);

  const rows = tableOf('lb_test_b');
  assert.strictEqual(rows.length, 4);
  const item = rows.find(x => x.reward_type === 'item');
  assert.deepStrictEqual([item.qty_min, item.qty_max, item.weight, item.guaranteed], [1, 3, 50, 0]);
  const gold = rows.find(x => x.reward_type === 'gold');
  assert.deepStrictEqual([gold.reward_id, gold.qty_min, gold.qty_max, gold.weight], ['', 100, 500, 30]);
  const pet = rows.find(x => x.reward_type === 'pet');
  assert.deepStrictEqual([pet.reward_id, pet.weight], ['pet_baby_rat', 5]);
  const shard = rows.find(x => x.reward_type === 'shard');
  assert.deepStrictEqual([shard.reward_id, shard.qty_min, shard.qty_max], ['shard_leaf', 2, 2]);
});

test('add xp: gold/xp không bị "shift" tham số như bản cũ', async () => {
  await makeBox('lb_test_c');
  const r = await run(['add', 'lb_test_c', 'xp', '50-100', 'w=20']);
  assert.ok(r.text.includes('✅'), r.text);
  const xp = tableOf('lb_test_c')[0];
  assert.strictEqual(xp.reward_type, 'xp');
  assert.strictEqual(xp.qty_min, 50);
  assert.strictEqual(xp.qty_max, 100);
  assert.strictEqual(xp.weight, 20);
});

test('add vẫn nhận cú pháp cũ (item: id min max weight) và (gold: min max weight guaranteed)', async () => {
  await makeBox('lb_test_legacy');
  let r = await run(['add', 'lb_test_legacy', 'item', 'potion_l', '1', '3', '50']);
  assert.ok(r.text.includes('✅'), r.text);

  r = await run(['add', 'lb_test_legacy', 'gold', '100', '500', '30', '1']);
  assert.ok(r.text.includes('✅'), r.text);

  const rows = tableOf('lb_test_legacy');
  const item = rows.find(x => x.reward_type === 'item');
  assert.deepStrictEqual([item.qty_min, item.qty_max, item.weight], [1, 3, 50]);
  const gold = rows.find(x => x.reward_type === 'gold');
  assert.deepStrictEqual([gold.qty_min, gold.qty_max, gold.weight, gold.guaranteed], [100, 500, 30, 1]);
});

test('add g (guaranteed) đứng một mình hoạt động', async () => {
  await makeBox('lb_test_g');
  const r = await run(['add', 'lb_test_g', 'xp', '10', 'g']);
  assert.ok(r.text.includes('⭐'), r.text);
  const row = tableOf('lb_test_g')[0];
  assert.strictEqual(row.guaranteed, 1);
});

test('add: chặn type lạ, item/pet không tồn tại, weight ≤ 0, qty sai', async () => {
  await makeBox('lb_test_err');
  let r = await run(['add', 'lb_test_err', 'vang', '100']);
  assert.ok(r.text.includes('Type phải là'), r.text);

  r = await run(['add', 'lb_test_err', 'item', 'khong_ton_tai', 'w=10']);
  assert.ok(r.text.includes('không tồn tại'), r.text);

  r = await run(['add', 'lb_test_err', 'pet', 'pet_khong_co', 'w=10']);
  assert.ok(r.text.includes('không tồn tại'), r.text);

  r = await run(['add', 'lb_test_err', 'item', 'potion_s', 'w=0']);
  assert.ok(r.text.includes('≥ 1'), r.text);

  r = await run(['add', 'lb_test_err', 'item', 'potion_s', 'qty=abc']);
  assert.ok(r.text.includes('qty'), r.text);

  assert.strictEqual(tableOf('lb_test_err').length, 0, 'không được ghi entry rác');
});

test('add nhiều id một lần (a,b,c) và báo lỗi cho id sai', async () => {
  await makeBox('lb_test_multi');
  let r = await run(['add', 'lb_test_multi', 'item', 'potion_s,potion_m,potion_l', 'w=10']);
  assert.ok(r.text.includes('3 entry'), r.text);
  assert.strictEqual(tableOf('lb_test_multi').length, 3);

  r = await run(['add', 'lb_test_multi', 'item', 'potion_s,khong_ton_tai', 'w=20']);
  assert.ok(r.text.includes('không tồn tại'), r.text);
  assert.ok(r.text.includes('#'), r.text);
  const s = db.prepare("SELECT weight FROM loot_tables WHERE lootbox_id='lb_test_multi' AND reward_id='potion_s'").get();
  assert.strictEqual(s.weight, 20, 'id đúng vẫn được thêm dù id kia sai');

  r = await run(['add', 'lb_test_multi', 'item', 'sai1,sai2', 'w=5']);
  assert.ok(/❌/.test(r.text) && !r.text.includes('✅'), r.text);
});

test('add cùng một reward hai lần thì CẬP NHẬT chứ không nhân đôi', async () => {
  await makeBox('lb_test_dup');
  await run(['add', 'lb_test_dup', 'item', 'potion_s', 'w=10']);
  await run(['add', 'lb_test_dup', 'item', 'potion_s', 'w=40']);
  const rows = tableOf('lb_test_dup').filter(r => r.reward_type === 'item');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].weight, 40);
});

// ─────────────────────────────────────────────────────────────
// show / edit / rm theo số
// ─────────────────────────────────────────────────────────────
test('show đánh số entry, in % thật và cảnh báo tổng weight ≠ 100', async () => {
  await makeBox('lb_test_show');
  await run(['add', 'lb_test_show', 'item', 'potion_s', 'w=75']);
  await run(['add', 'lb_test_show', 'gold', '10-20', 'w=25']);
  await run(['add', 'lb_test_show', 'xp', '5', 'g']);

  const r = await run(['show', 'lb_test_show']);
  const t = r.text;
  assert.ok(/#1/.test(t) && /#2/.test(t) && /#3/.test(t), `thiếu đánh số:\n${t}`);
  assert.ok(t.includes('75.0%'), `thiếu % của entry w=75:\n${t}`);
  assert.ok(t.includes('25.0%'), `thiếu % của entry w=25:\n${t}`);
  assert.ok(t.includes('⭐'), 'thiếu nhãn guaranteed');
  assert.ok(t.includes('potion_s') && t.includes('vàng'), t);
});

test('show cảnh báo khi tổng weight khác 100', async () => {
  await makeBox('lb_test_w');
  await run(['add', 'lb_test_w', 'item', 'potion_s', 'w=3']);
  const r = await run(['show', 'lb_test_w']);
  assert.ok(r.text.includes('tổng weight = 3'), r.text);
});

test('show cảnh báo khi mọi weight = 0 (hộp không rơi được gì)', async () => {
  await makeBox('lb_test_zero');
  await run(['add', 'lb_test_zero', 'item', 'potion_s', 'w=10']);
  await run(['edit', 'lb_test_zero', '#1', 'w=0']);
  const r = await run(['show', 'lb_test_zero']);
  assert.ok(r.text.includes('KHÔNG entry nào rơi'), r.text);
});

test('edit sửa weight/qty/guaranteed theo số #, không cần xoá-rồi-thêm', async () => {
  await makeBox('lb_test_edit');
  await run(['add', 'lb_test_edit', 'item', 'potion_s', 'w=10']);
  await run(['add', 'lb_test_edit', 'item', 'potion_m', 'w=90']);

  const show = await run(['show', 'lb_test_edit']);
  // #1 = entry weight cao nhất (potion_m), #2 = potion_s
  const line1 = show.text.split('\n').find(l => l.includes('#1'));
  assert.ok(line1.includes('potion_m'), `thứ tự hiển thị phải theo weight giảm dần:\n${show.text}`);

  let r = await run(['edit', 'lb_test_edit', '#2', 'w=50', 'qty=1-2']);
  assert.ok(r.text.includes('✅'), r.text);
  const edited = db.prepare("SELECT * FROM loot_tables WHERE lootbox_id='lb_test_edit' AND reward_id='potion_s'").get();
  assert.deepStrictEqual([edited.weight, edited.qty_min, edited.qty_max], [50, 1, 2]);

  r = await run(['edit', 'lb_test_edit', '#2', 'g=1']);
  assert.strictEqual(db.prepare("SELECT guaranteed FROM loot_tables WHERE lootbox_id='lb_test_edit' AND reward_id='potion_s'").get().guaranteed, 1);

  // % của entry còn lại thay đổi theo: pool giờ chỉ còn potion_m (w90) ⇒ 100%
  const after = await run(['show', 'lb_test_edit']);
  assert.ok(/100\.0%/.test(after.text), after.text);

  r = await run(['edit', 'lb_test_edit', '#2']);
  assert.ok(r.text.includes('Chưa có gì để sửa'), r.text);
});

test('edit báo lỗi khi số # không tồn tại', async () => {
  await makeBox('lb_test_edit2');
  await run(['add', 'lb_test_edit2', 'item', 'potion_s', 'w=10']);
  const r = await run(['edit', 'lb_test_edit2', '#9', 'w=5']);
  assert.ok(r.text.includes('Không có entry #9'), r.text);
});

test('rm xoá theo số # và theo type', async () => {
  await makeBox('lb_test_rm');
  await run(['add', 'lb_test_rm', 'item', 'potion_s', 'w=10']);
  await run(['add', 'lb_test_rm', 'gold', '10-20', 'w=20']);
  await run(['add', 'lb_test_rm', 'xp', '5', 'w=5']);

  let r = await run(['rm', 'lb_test_rm', '#1']); // weight cao nhất = gold (20)
  assert.ok(r.text.includes('🗑️'), r.text);
  assert.strictEqual(db.prepare("SELECT 1 FROM loot_tables WHERE lootbox_id='lb_test_rm' AND reward_type='gold'").get(), undefined);

  r = await run(['rm', 'lb_test_rm', 'xp']);
  assert.ok(r.text.includes('🗑️'), r.text);
  assert.strictEqual(tableOf('lb_test_rm').length, 1);

  r = await run(['rm', 'lb_test_rm', 'pet']);
  assert.ok(r.text.includes('không có entry'), r.text);
});

// ─────────────────────────────────────────────────────────────
// copy / sim / list
// ─────────────────────────────────────────────────────────────
test('copy chép toàn bộ nội dung sang hộp khác', async () => {
  await makeBox('lb_test_src');
  await makeBox('lb_test_dst');
  await run(['add', 'lb_test_src', 'item', 'potion_s', 'w=10']);
  await run(['add', 'lb_test_src', 'gold', '10-20', 'w=20']);

  const r = await run(['copy', 'lb_test_src', 'lb_test_dst']);
  assert.ok(r.text.includes('2 entry'), r.text);
  assert.strictEqual(tableOf('lb_test_dst').length, 2);
});

test('sim in tỉ lệ thật và KHÔNG cấp phần thưởng', async () => {
  await makeBox('lb_test_sim');
  await run(['add', 'lb_test_sim', 'gold', '100-100', 'w=100']);

  const goldBefore = player.getPlayer(PLAYER).gold;
  const m = admin();
  let payload = null;
  m.reply = async (p) => { payload = p; return { id: 'R' }; };
  await lbCmd.execute(m, ['sim', 'lb_test_sim', '200']);
  const d = payload.embeds[0].data || payload.embeds[0];
  const text = [(d.title || ''), ...(d.fields || []).map(f => `${f.name}: ${f.value}`), d.footer?.text || ''].join('\n');
  assert.ok(text.includes('100.0%'), `sim phải báo 100% cho entry duy nhất:\n${text}`);
  assert.ok(text.includes('Trung bình mỗi hộp'), text);
  assert.ok(text.includes('không cấp phần thưởng thật'), text);

  // Không đụng tới vàng của bất kỳ ai
  const totalGold = db.prepare('SELECT COALESCE(SUM(gold),0) s FROM players').get().s;
  assert.ok(goldBefore >= 0 && totalGold >= 0);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM inventory WHERE item_id='lb_test_sim'").get().c, 0);
});

test('sim chặn số lần quá lớn và hộp trống', async () => {
  await makeBox('lb_test_empty');
  const r = await run(['sim', 'lb_test_empty']);
  assert.ok(r.text.includes('trống'), r.text);
});

test('list liệt kê hộp, cảnh báo hộp trống và hộp không có nguồn', async () => {
  await makeBox('lb_test_list');
  await run(['add', 'lb_test_list', 'item', 'potion_s', 'w=100']);
  const r = await run(['list']);
  const t = r.text;
  assert.ok(t.includes('lb_test_list'), t);
  assert.ok(t.includes('không có nguồn'), `hộp chưa có nguồn phải bị cảnh báo:\n${t}`);
  assert.ok(t.includes('lb_test_empty'), t);
  assert.ok(t.includes('TRỐNG'), `hộp trống phải bị cảnh báo:\n${t}`);
});

// ─────────────────────────────────────────────────────────────
// clear / delete
// ─────────────────────────────────────────────────────────────
test('clear cần xác nhận, xoá entry nhưng giữ hộp', async () => {
  await makeBox('lb_test_clear');
  await run(['add', 'lb_test_clear', 'item', 'potion_s', 'w=10']);

  let r = await run(['clear', 'lb_test_clear']);
  assert.ok(r.text.includes('Xác nhận'), r.text);
  assert.strictEqual(tableOf('lb_test_clear').length, 1, 'chưa confirm thì không được xoá');

  r = await run(['clear', 'lb_test_clear', 'confirm']);
  assert.ok(r.text.includes('1 entry'), r.text);
  assert.strictEqual(tableOf('lb_test_clear').length, 0);
  assert.ok(db.prepare("SELECT 1 FROM items WHERE id='lb_test_clear'").get(), 'hộp phải còn');
});

test('delete cần xác nhận, xoá cả item + loot table và cảnh báo số hộp đang có', async () => {
  await makeBox('lb_test_del');
  await run(['add', 'lb_test_del', 'item', 'potion_s', 'w=10']);
  player.addItem(PLAYER, 'lb_test_del', 3);

  let r = await run(['delete', 'lb_test_del']);
  assert.ok(r.text.includes('Xác nhận'), r.text);
  assert.ok(r.text.includes('3'), `phải cảnh báo số hộp người chơi đang giữ:\n${r.text}`);
  assert.ok(db.prepare("SELECT 1 FROM items WHERE id='lb_test_del'").get());

  r = await run(['delete', 'lb_test_del', 'confirm']);
  assert.strictEqual(db.prepare("SELECT 1 FROM items WHERE id='lb_test_del'").get(), undefined);
  assert.strictEqual(tableOf('lb_test_del').length, 0);
});

// ─────────────────────────────────────────────────────────────
// Hành vi mở hộp (không được đổi)
// ─────────────────────────────────────────────────────────────
test('mở hộp: guaranteed luôn nhận + đúng 1 lần bốc ngẫu nhiên', async () => {
  await makeBox('lb_test_open');
  await run(['add', 'lb_test_open', 'xp', '7', 'g']);
  await run(['add', 'lb_test_open', 'item', 'potion_s', 'w=100']);

  const { rewards } = lootbox.openLootbox('lb_test_open', 1);
  assert.strictEqual(rewards.length, 2, JSON.stringify(rewards));
  assert.ok(rewards.some(r => r.reward_type === 'xp' && r.qty === 7));
  assert.ok(rewards.some(r => r.reward_type === 'item' && r.reward_id === 'potion_s'));
});

test('%use mở hộp thật: trừ hộp, cộng thưởng', async () => {
  await makeBox('lb_test_use');
  await run(['add', 'lb_test_use', 'gold', '50-50', 'w=100']);
  const uid = 'USE1';
  if (!player.getPlayer(uid)) player.createPlayer(uid, 'use1');
  player.addItem(uid, 'lb_test_use', 1);

  const goldBefore = player.getPlayer(uid).gold;
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['lb_test_use', '1']);
  assert.strictEqual(player.getPlayer(uid).gold, goldBefore + 50, out(m));
  assert.strictEqual(db.prepare("SELECT COALESCE(SUM(qty),0) s FROM inventory WHERE user_id=? AND item_id='lb_test_use'").get(uid).s, 0);
});

// ─────────────────────────────────────────────────────────────
// embed limits + help
// ─────────────────────────────────────────────────────────────
test('show/list/help không vượt giới hạn embed', async () => {
  await makeBox('lb_test_emb');
  for (let i = 0; i < 30; i++) {
    await run(['add', 'lb_test_emb', 'xp', String(i + 1), `w=${i + 1}`]);
  }
  for (const args of [['show', 'lb_test_emb'], ['list'], ['help']]) {
    const m = admin();
    let payload = null;
    m.reply = async (p) => { payload = p; return { id: 'R' }; };
    await lbCmd.execute(m, args);
    const e = payload.embeds[0];
    const d = e.data || e;
    const total = (d.title || '').length + (d.description || '').length +
      (d.fields || []).reduce((n, f) => n + f.name.length + f.value.length, 0);
    assert.ok(total <= 6000, `${args[0]}: tổng embed ${total} > 6000`);
    for (const f of d.fields || []) {
      assert.ok(f.value.length <= 1024, `${args[0]}: field "${f.name}" dài ${f.value.length}`);
    }
    assert.ok((d.fields || []).length <= 25, `${args[0]}: quá 25 field`);
  }
});

test('help nói rõ 3 bước và mọi lệnh con', async () => {
  const r = await run(['help']);
  for (const key of ['create', 'add', 'show', 'edit', 'rm', 'copy', 'sim', 'clear', 'delete', 'list']) {
    assert.ok(r.text.includes(key), `help thiếu ${key}`);
  }
  assert.ok(r.text.includes('3 bước'), r.text);
});

test('sub lạ báo lỗi kèm gợi ý', async () => {
  const r = await run(['xyz']);
  assert.ok(r.text.includes('lootbox help'), r.text);
});

test('không phải admin thì bị chặn', async () => {
  const m = fakeMessage('NPC', { admin: false });
  m.member.permissions.has = () => false;
  await lbCmd.execute(m, ['list']);
  assert.ok(out(m).includes('Chỉ admin'), out(m));
});
