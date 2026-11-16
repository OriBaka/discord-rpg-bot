// Test cho nhóm QoL #1 + #2:
//   #1 %inv — phân trang (không bao giờ vượt 6,000 ký tự), filter, sort, tổng giá trị
//   #2 lệnh hàng loạt — %sell all / %sell junk, %craft <recipe> xN, %quest claim all
//
// Vì sao phải khoá bằng test: `%inv` cũ nhồi mọi item vào field, đo trên DB thật
// 257 loại item → embed 10,003 ký tự và Discord từ chối (giới hạn 6,000).
// Người chơi tích đồ đủ lâu là mất luôn chức năng xem túi.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, invCmd, shopCmd, craftCmd, questCmd, quests, jobBuffs, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  invCmd = require(`${ROOT}/src/commands/inventory`);
  shopCmd = require(`${ROOT}/src/commands/shop`);
  craftCmd = require(`${ROOT}/src/commands/craft`);
  questCmd = require(`${ROOT}/src/commands/quest`);
  quests = require(`${ROOT}/src/game/quests`);
  jobBuffs = require(`${ROOT}/src/game/job_buffs`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (gold = 5000) => {
  const uid = `BQ${++seq}`;
  player.createPlayer(uid, `b${seq}`);
  player.updatePlayer(uid, { gold }); // kể cả 0 — test tính vàng tuyệt đối
  return uid;
};
const qtyOf = (uid, item) => {
  const r = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, item);
  return r ? r.qty : 0;
};
const goldOf = (uid) => db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;

// Gọi thẳng renderInventoryPage để lấy embed thật (không phụ thuộc msg.reply)
async function page(opts) {
  let payload = null;
  await invCmd.renderInventoryPage({
    userId: opts.userId,
    filter: opts.filter,
    sort: opts.sort || 'default',
    page: opts.page || 0,
    playerLevel: opts.playerLevel || 50,
    replyFn: async (p) => { payload = p; },
  });
  return payload;
}

// ─────────────────────────────────────────────────────────────
// #1a. %inv không bao giờ vượt giới hạn Discord
// ─────────────────────────────────────────────────────────────
test('%inv: 257 loại item vẫn dưới 6,000 ký tự (mọi trang)', async () => {
  const uid = newPlayer();
  const items = db.prepare('SELECT id FROM items').all();
  assert.ok(items.length >= 200, `DB chỉ có ${items.length} item — test vô nghĩa`);
  for (const it of items) player.addItem(uid, it.id, 99);

  const first = await page({ userId: uid });
  const footer = first.embeds[0].data.footer.text;
  const totalPages = parseInt(footer.match(/Trang 1\/(\d+)/)[1]);
  assert.ok(totalPages >= 10, `chỉ ${totalPages} trang cho ${items.length} loại — nghi perPage quá lớn`);

  let maxJson = 0;
  for (let p = 0; p < totalPages; p++) {
    const payload = await page({ userId: uid, page: p });
    const json = JSON.stringify(payload.embeds[0].data);
    maxJson = Math.max(maxJson, json.length);
    const desc = payload.embeds[0].data.description || '';
    assert.ok(desc.length <= 4096, `trang ${p + 1}: description ${desc.length} ký tự`);
  }
  assert.ok(maxJson < 6000, `embed lớn nhất ${maxJson} ký tự — Discord sẽ từ chối`);

  // Mọi item phải xuất hiện đâu đó trên các trang (không được cắt mất)
  const seen = new Set();
  for (let p = 0; p < totalPages; p++) {
    const payload = await page({ userId: uid, page: p });
    const desc = payload.embeds[0].data.description || '';
    for (const m of desc.matchAll(/`([a-z0-9_]+)`/g)) seen.add(m[1]);
  }
  const ids = new Set(items.map(i => i.id));
  const missing = [...ids].filter(id => !seen.has(id));
  assert.deepStrictEqual(missing, [], `item không hiện ở trang nào: ${missing.slice(0, 5).join(', ')}`);
});

test('%inv: filter theo loại + alias tool/lootbox hoạt động thật', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 3);
  const tool = db.prepare("SELECT id FROM items WHERE type='tool' LIMIT 1").get();
  const box = db.prepare("SELECT id FROM items WHERE type='lootbox' LIMIT 1").get();
  if (tool) player.addItem(uid, tool.id, 1);
  if (box) player.addItem(uid, box.id, 1);

  const matPage = await page({ userId: uid, filter: 'mat' });
  const matDesc = matPage.embeds[0].data.description;
  assert.match(matDesc, /Iron Ore/);
  assert.doesNotMatch(matDesc, /`iron_ore`[\s\S]*lootbox/);

  if (tool) {
    const toolPage = await page({ userId: uid, filter: 'tool' });
    assert.match(toolPage.embeds[0].data.description, new RegExp(`\`${tool.id}\``),
      '%inv tool phải lọc đúng công cụ (lỗi cũ: trả về cả túi)');
  }
  if (box) {
    const boxPage = await page({ userId: uid, filter: 'box' });
    assert.match(boxPage.embeds[0].data.description, new RegExp(`\`${box.id}\``));
  }
});

test('%inv: filter lạ báo rõ thay vì lặng lẽ trả cả túi', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 1);
  const payload = await page({ userId: uid, filter: 'vukhi' });
  const desc = payload.embeds[0].data.description;
  assert.match(desc, /Không hiểu filter/);
  assert.doesNotMatch(desc, /Iron Ore/, 'filter sai không được hiện item');
});

test('%inv: sort value đưa món đắt lên trước + footer có tổng giá trị', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'iron_ore', 10); // rẻ
  // Món đắt nhất tính bằng ĐÚNG công thức của %sell (sell, fallback price/3)
  const all = db.prepare("SELECT id, sell, price FROM items WHERE type != 'material' AND soulbound=0").all()
    .map(it => ({ ...it, unit: it.sell || Math.floor((it.price || 0) / 3) || 0 }))
    .filter(it => it.unit > 0)
    .sort((a, b) => b.unit - a.unit);
  const expensive = all[0];
  player.addItem(uid, expensive.id, 2);
  const oreRow = db.prepare("SELECT id, sell, price FROM items WHERE id='iron_ore'").get();
  const oreUnit = oreRow.sell || Math.floor((oreRow.price || 0) / 3) || 0;

  const payload = await page({ userId: uid, sort: 'value' });
  const desc = payload.embeds[0].data.description;
  assert.ok(desc.indexOf(expensive.id) < desc.indexOf('iron_ore'),
    'sort value phải đưa món giá trị cao lên trước');

  const value = expensive.unit * 2 + oreUnit * 10;
  assert.ok(payload.embeds[0].data.footer.text.includes(String(value)),
    `footer thiếu tổng giá trị ${value}: ${payload.embeds[0].data.footer.text}`);
});

test('%inv: nút phân trang + nút filter tạo customId đúng domain inv', async () => {
  const uid = newPlayer();
  const items = db.prepare('SELECT id FROM items LIMIT 60').all();
  for (const it of items) player.addItem(uid, it.id, 1);

  const payload = await page({ userId: uid });
  const rows = payload.components.map(r => r.components.map(b => b.data));
  const ids = rows.flat().map(b => b.custom_id);
  assert.ok(ids.some(id => id.startsWith('page:f:inv:')), `thiếu nút filter inv: ${ids.join(', ')}`);
  assert.ok(ids.some(id => id.startsWith('page:n:inv:')), `thiếu nút điều hướng inv: ${ids.join(', ')}`);
  assert.ok(ids.some(id => id === `page:n:inv:${uid}:all:1`), 'nút ▶ phải trỏ trang 2');

  // sort phải được mang theo trong customId, nếu không bấm ▶ là mất sắp xếp
  const sorted = await page({ userId: uid, sort: 'value' });
  const sortedIds = sorted.components.flatMap(r => r.components.map(b => b.data.custom_id));
  assert.ok(sortedIds.some(id => id.endsWith(':value')), `customId mất sort: ${sortedIds.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────
// #2a. %sell all / %sell junk
// ─────────────────────────────────────────────────────────────
test('%sell all: bán hết, cộng vàng đúng, không đụng món đang mặc', async () => {
  const uid = newPlayer(0);
  player.addItem(uid, 'iron_ore', 10);
  player.addItem(uid, 'oak_log', 4);
  const weapon = db.prepare("SELECT id, sell, price FROM items WHERE type='weapon' AND soulbound=0 AND min_level<=1 LIMIT 1").get();
  player.addItem(uid, weapon.id, 2);
  // Trang bị 1 cây — equip KHÔNG lấy item ra khỏi túi (nếu không guard sẽ dup)
  const slots = require(`${ROOT}/src/game/slots`);
  const wItem = require(`${ROOT}/src/game/items`).getItem(weapon.id);
  slots.setEquipped(uid, slots.findSlotForItem(wItem, slots.getEquipped(uid)), weapon.id);

  const unitOf = (id) => {
    const it = db.prepare('SELECT sell, price FROM items WHERE id=?').get(id);
    return it.sell || Math.floor((it.price || 0) / 3) || 0;
  };
  const expectedSell = unitOf('iron_ore') * 10 + unitOf('oak_log') * 4;

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all'], '%');
  const txt = out(m);
  assert.match(txt, /Đã bán/, txt);
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 0, 'còn sót iron_ore');
  assert.strictEqual(qtyOf(uid, 'wood'), 0, 'còn sót wood');
  // 2 cây, 1 đang mặc → bán được 1, còn lại đúng cây đang mặc
  assert.strictEqual(qtyOf(uid, weapon.id), 1, 'món đang mặc bị bán mất');

  const unit = weapon.sell || Math.floor(weapon.price / 3);
  const expectedGold = expectedSell + unit * 1; // 2 cây, 1 đang mặc → bán 1
  assert.strictEqual(goldOf(uid), expectedGold,
    `vàng sai: có ${goldOf(uid)}, cần ${expectedGold}`);
  assert.match(txt, /giữ lại 1 món đang mặc/, `không báo giữ lại món đang mặc:\n${txt}`);
});

test('%sell junk: chỉ bán tier common, giữ đồ hiếm', async () => {
  const uid = newPlayer(0);
  const common = db.prepare("SELECT id FROM items WHERE type='material' AND tier='common' AND soulbound=0 LIMIT 1").get();
  const rare = db.prepare("SELECT id FROM items WHERE type='material' AND tier != 'common' AND soulbound=0 LIMIT 1").get();
  player.addItem(uid, common.id, 7);
  if (rare) player.addItem(uid, rare.id, 3);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['junk'], '%');
  assert.strictEqual(qtyOf(uid, common.id), 0, 'rác tier common phải bán hết');
  if (rare) assert.strictEqual(qtyOf(uid, rare.id), 3, 'đồ hiếm KHÔNG được bán bởi junk');
  assert.ok(goldOf(uid) > 0);
});

test('%sell all <filter>: chỉ bán đúng nhóm được chọn', async () => {
  const uid = newPlayer(0);
  player.addItem(uid, 'iron_ore', 5);
  const weapon = db.prepare("SELECT id FROM items WHERE type='weapon' AND soulbound=0 AND min_level<=1 LIMIT 1").get();
  player.addItem(uid, weapon.id, 1);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all', 'weapon'], '%');
  assert.strictEqual(qtyOf(uid, weapon.id), 0, 'weapon phải bán');
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 5, 'material không được bán khi filter weapon');
});

test('%sell all: túi trống / toàn soulbound → báo rõ, không lỗi', async () => {
  const uid = newPlayer(0);
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all'], '%');
  assert.match(out(m), /Không có món nào bán được/);
  assert.strictEqual(goldOf(uid), 0);
});

test('%sell lẻ vẫn hoạt động như cũ sau khi thêm nhánh bulk', async () => {
  const uid = newPlayer(0);
  player.addItem(uid, 'iron_ore', 5);
  const row = db.prepare("SELECT sell, price FROM items WHERE id='iron_ore'").get();
  const unit = row.sell || Math.floor((row.price || 0) / 3) || 0;
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['iron_ore', '2'], '%');
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 3);
  assert.strictEqual(goldOf(uid), unit * 2);
});

// ─────────────────────────────────────────────────────────────
// #2b. %craft <recipe> xN
// ─────────────────────────────────────────────────────────────
function firstCraftRecipe() {
  return db.prepare("SELECT * FROM recipes WHERE type='craft' ORDER BY min_job_level, id LIMIT 1").get();
}

test('%craft xN: làm N lần, trừ nguyên liệu đúng, ra đúng số món', async () => {
  const uid = newPlayer();
  const recipe = firstCraftRecipe();
  const inputs = JSON.parse(recipe.inputs);
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty * 5);

  const m = fakeMessage(uid);
  await craftCmd.execute(m, [recipe.id, 'x5'], '%');
  const txt = out(m);

  assert.strictEqual(qtyOf(uid, recipe.output_id), recipe.output_qty * 5, `sai số món ra:\n${txt}`);
  for (const inp of inputs) {
    assert.strictEqual(qtyOf(uid, inp.item_id), 0, `không trừ hết ${inp.item_id}`);
  }
  assert.match(txt, /5 lần/);
  assert.match(txt, new RegExp(`\\+${recipe.xp_gain * 5} crafting XP`));
});

test('%craft xN: hết nguyên liệu giữa chừng → dừng, báo rõ, không âm kho', async () => {
  const uid = newPlayer();
  const recipe = firstCraftRecipe();
  const inputs = JSON.parse(recipe.inputs);
  const enough = 2;
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty * enough);

  const m = fakeMessage(uid);
  await craftCmd.execute(m, [recipe.id, 'x5'], '%');
  const txt = out(m);

  assert.strictEqual(qtyOf(uid, recipe.output_id), recipe.output_qty * enough, `sai số món:\n${txt}`);
  for (const inp of inputs) {
    assert.ok(qtyOf(uid, inp.item_id) >= 0, `kho âm ${inp.item_id}`);
    assert.strictEqual(qtyOf(uid, inp.item_id), 0);
  }
  assert.match(txt, /hết nguyên liệu/i, `không báo dừng vì hết NL:\n${txt}`);
});

test('%craft xN: thiếu NL ngay từ đầu → báo thiếu, không tạo gì', async () => {
  const uid = newPlayer();
  const recipe = firstCraftRecipe();
  const m = fakeMessage(uid);
  await craftCmd.execute(m, [recipe.id, 'x3'], '%');
  assert.match(out(m), /Thiếu nguyên liệu/);
  assert.strictEqual(qtyOf(uid, recipe.output_id), 0);
});

test('%craft xN: buff có lượt chỉ áp cho đúng số lần còn lượt', async () => {
  const uid = newPlayer();
  const recipe = firstCraftRecipe();
  const inputs = JSON.parse(recipe.inputs);
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty * 10);
  // Dùng API thật: kiếm 1 vật phẩm bổ trợ crafting trong DB rồi activate
  const buffItems = jobBuffs.getBuffItemsByJob('crafting');
  assert.ok(buffItems.length > 0, 'DB không có vật phẩm bổ trợ crafting');
  const buffRow = buffItems.find(b => (b.charges || 0) > 0) || buffItems[0];
  const act = jobBuffs.activate(uid, buffRow.item_id);
  assert.ok(act.ok, `activate lỗi: ${act.error}`);

  const real = Math.random;
  Math.random = () => 0; // mọi roll đều trúng
  try {
    const m = fakeMessage(uid);
    await craftCmd.execute(m, [recipe.id, 'x5'], '%');
    // Buff có N lượt → đúng N lần không tiêu NL, phần còn lại vẫn trừ bình thường
    const charges = buffRow.charges;
    assert.match(out(m), new RegExp(`không tiêu NL \\*\\*${charges}\\*\\* lần`), out(m));
  } finally { Math.random = real; }
  assert.strictEqual(jobBuffs.get(uid, 'crafting'), null, 'buff phải bị trừ hết');
  assert.strictEqual(qtyOf(uid, recipe.output_id), recipe.output_qty * 5);
});

// ─────────────────────────────────────────────────────────────
// #2c. %quest claim all
// ─────────────────────────────────────────────────────────────
function completeQuest(uid, q) {
  db.prepare('UPDATE player_quests SET progress=? WHERE user_id=? AND quest_id=?')
    .run(q.target_qty, uid, q.id);
}

// Quest thật trong DB được sinh theo ngày (generateDailyQuests) — dùng đúng
// luồng đó thay vì tự chèn row, để test bám sát hành vi thật.
function dailyQuests(uid, level = 10) {
  quests.generateDailyQuests(uid, level);
  return quests.getPlayerQuests(uid)
    .map(pq => quests.getQuest(pq.quest_id))
    .filter(Boolean);
}

// Quest dạng TRẠNG THÁI (level/job_level/item) bị refreshStateQuests tính lại
// khi claim → set progress tay sẽ bị ghi đè. Test chỉ dùng quest đếm được.
const STATE_OBJECTIVES = new Set(['level', 'job_level', 'item']);
const countableQuests = (qs) => qs.filter(q => !STATE_OBJECTIVES.has(q.objective));

test('%quest claim all: nhận hết quest đủ điều kiện, cộng dồn thưởng', async () => {
  const uid = newPlayer(100);
  const qs = countableQuests(dailyQuests(uid));
  assert.ok(qs.length >= 1, 'không sinh được daily quest đếm được');

  // Thêm 1 custom quest có thưởng item để kiểm tra cộng dồn item
  const cq = quests.createQuest({
    id: `t_bulk_${Date.now()}`, type: 'custom', name: 'Bulk Item Quest',
    desc: 'test', objective: 'kill', target_qty: 1,
    reward_gold: 55, reward_xp: 10, reward_item: 'iron_ore:7',
  });
  quests.assignQuest(uid, cq.id);

  const chosen = qs.slice(0, 3).map(q => q);
  for (const q of chosen) completeQuest(uid, q);
  completeQuest(uid, cq);

  const expectedGold = 100 + chosen.reduce((n, q) => n + (q.reward_gold || 0), 0) + 55;

  const m = fakeMessage(uid);
  await questCmd.execute(m, ['claim', 'all'], '%');
  const txt = out(m);

  assert.match(txt, new RegExp(`Nhận thưởng \\*\\*${chosen.length + 1} quest\\*\\*`), txt);
  for (const q of [...chosen, cq]) {
    assert.strictEqual(quests.getPlayerQuest(uid, q.id).claimed, 1, `${q.id} chưa được claim`);
    assert.ok(txt.includes(q.name), `thiếu ${q.name} trong báo cáo`);
  }
  assert.strictEqual(goldOf(uid), expectedGold, `vàng sai: ${goldOf(uid)} vs ${expectedGold}`);
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 7, 'thưởng item không được cộng dồn');
});

test('%quest claim all: chưa xong thì không nhận, không cộng vàng', async () => {
  const uid = newPlayer(100);
  const qs = countableQuests(dailyQuests(uid));
  assert.ok(qs.length > 0);
  for (const q of qs) {
    db.prepare('UPDATE player_quests SET progress=0 WHERE user_id=? AND quest_id=?').run(uid, q.id);
  }

  const m = fakeMessage(uid);
  await questCmd.execute(m, ['claim', 'all'], '%');
  assert.match(out(m), /Chưa có quest nào đủ điều kiện/);
  assert.strictEqual(goldOf(uid), 100);
  assert.strictEqual(quests.getPlayerQuest(uid, qs[0].id).claimed, 0);
});

test('%quest claim all: gọi lần 2 không nhận lại (không dup thưởng)', async () => {
  const uid = newPlayer(0);
  const qs = countableQuests(dailyQuests(uid));
  assert.ok(qs.length > 0);
  const q = qs[0];
  completeQuest(uid, q);

  await questCmd.execute(fakeMessage(uid), ['claim', 'all'], '%');
  const goldAfterFirst = goldOf(uid);
  assert.ok(goldAfterFirst >= (q.reward_gold || 0));

  const m2 = fakeMessage(uid);
  await questCmd.execute(m2, ['claim', 'all'], '%');
  assert.strictEqual(goldOf(uid), goldAfterFirst, 'claim all lần 2 cộng vàng lần nữa → dup');
  assert.match(out(m2), /Không có quest nào để nhận|Chưa có quest nào đủ điều kiện/);
});

test('%quest claim <id> vẫn hoạt động sau refactor', async () => {
  const uid = newPlayer(50);
  const qs = countableQuests(dailyQuests(uid));
  const q = qs.find(x => (x.reward_gold || 0) > 0);
  assert.ok(q, 'không có daily quest nào thưởng vàng');
  completeQuest(uid, q);

  const m = fakeMessage(uid);
  await questCmd.execute(m, ['claim', q.id], '%');
  assert.match(out(m), /Đã nhận thưởng/);
  assert.strictEqual(goldOf(uid), 50 + q.reward_gold);
  assert.strictEqual(quests.getPlayerQuest(uid, q.id).claimed, 1);
});

// ─────────────────────────────────────────────────────────────
// #1b. Nút bấm thật của %inv (route trong buttons.js)
// ─────────────────────────────────────────────────────────────
test('buttons: bấm ▶ và nút filter của %inv trả về đúng trang', async () => {
  const { encodeCustomId } = require(`${ROOT}/src/game/paginator`);
  const buttons = require(`${ROOT}/src/buttons`);
  const uid = newPlayer();
  const items = db.prepare('SELECT id FROM items LIMIT 40').all();
  for (const it of items) player.addItem(uid, it.id, 1);

  const click = async (customId) => {
    let got = null;
    await buttons.handle({
      customId,
      user: { id: uid },
      update: async (payload) => { got = payload; },
      reply: async (payload) => { got = payload; },
    });
    return got;
  };

  const next = await click(encodeCustomId('inv', uid, 'all', 1, 'n'));
  assert.ok(next, 'bấm ▶ không có response (domain inv chưa route?)');
  const desc = next.embeds[0].data.description;
  assert.match(next.embeds[0].data.footer.text, /Trang 2\//, 'nút ▶ không sang trang 2');

  const filtered = await click(encodeCustomId('inv', uid, 'mat', 0, 'f'));
  assert.ok(filtered, 'bấm nút filter không có response');
  assert.match(filtered.embeds[0].data.title, /Nguyên liệu/);

  // Người khác bấm không được điều khiển
  const intruder = await click(encodeCustomId('inv', 'SOMEONE_ELSE', 'all', 1, 'n'));
  assert.ok(intruder && /Chỉ người gọi lệnh/.test(intruder.content || ''), 'thiếu chặn người lạ bấm nút');
});

test('%sell all: bỏ qua món soulbound (không bán được)', async () => {
  const uid = newPlayer(0);
  const sbItem = db.prepare("SELECT id FROM items WHERE type='material' AND soulbound=0 LIMIT 1").get();
  const normal = db.prepare("SELECT id FROM items WHERE type='material' AND soulbound=0 AND id != ? LIMIT 1").get(sbItem.id);
  db.prepare('UPDATE items SET soulbound=1 WHERE id=?').run(sbItem.id);
  try {
    player.addItem(uid, sbItem.id, 2);
    player.addItem(uid, normal.id, 2);
    const m = fakeMessage(uid);
    await shopCmd.sell.execute(m, ['all'], '%');
    assert.strictEqual(qtyOf(uid, sbItem.id), 2, 'món soulbound bị bán mất');
    assert.strictEqual(qtyOf(uid, normal.id), 0, 'món thường không được bán');
    assert.match(out(m), /soulbound/);
  } finally {
    db.prepare('UPDATE items SET soulbound=0 WHERE id=?').run(sbItem.id);
  }
});
