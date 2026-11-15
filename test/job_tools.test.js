// Test cho công cụ bổ trợ nghề (job_tools).
//
// Khoá các yêu cầu:
//   1. Mỗi công cụ có thông số RIÊNG — nâng cấp trong cùng tier phải khác nhau
//      (lỗi cũ: pick_iron 2000g và pick_silver 4200g đều ×1.15).
//   2. Không nerf ai: qty_bonus của pickaxe/cần câu phải bằng đúng mức tier cũ
//      (common 1.00, rare 1.15, epic 1.30).
//   3. Công cụ mới (foraging/cooking/crafting) có thật, bán ở shop, dùng được.
//   4. bonus() chọn công cụ tốt nhất người chơi ĐANG CÓ và ĐỦ CẤP.
//   5. Cơ hội rơi thật sự tăng (rollDrops) và chặn ở 100%.
//   6. Dao bếp ra thêm món / búa thợ không tiêu nguyên liệu chạy trong lệnh thật.
//   7. Người chơi THẤY thông số: %item, %job, footer %mine/%gather.
//   8. Trần bonus được khoá lại để lần sau không lạm phát âm thầm.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, gz, jobTools, mineCmd, gatherCmd, craft, jobCmd, infoCmd, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  gz = require(`${ROOT}/src/game/gather_zones`);
  jobTools = require(`${ROOT}/src/game/job_tools`);
  mineCmd = require(`${ROOT}/src/commands/mine`);
  gatherCmd = require(`${ROOT}/src/commands/gather`);
  craft = require(`${ROOT}/src/commands/craft`);
  jobCmd = require(`${ROOT}/src/commands/job`);
  infoCmd = require(`${ROOT}/src/commands/info`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (level = 50) => {
  const uid = `JT${++seq}`;
  player.createPlayer(uid, `j${seq}`);
  if (level) player.updatePlayer(uid, { level });
  return uid;
};

// ─────────────────────────────────────────────────────────────
// 1. Seed & dữ liệu
// ─────────────────────────────────────────────────────────────
test('mọi dòng job_tools trỏ tới item có thật', () => {
  const rows = db.prepare('SELECT jt.*, i.id iid FROM job_tools jt LEFT JOIN items i ON i.id = jt.item_id').all();
  assert.ok(rows.length >= 21, `chỉ có ${rows.length} dòng job_tools`);
  const dangling = rows.filter(r => !r.iid).map(r => r.item_id);
  assert.deepStrictEqual(dangling, [], 'job_tools trỏ tới item không tồn tại');
});

test('mỗi nghề đều có công cụ (foraging/cooking/crafting trước đây không có)', () => {
  for (const job of ['mining', 'fishing', 'foraging', 'cooking', 'crafting']) {
    const n = db.prepare('SELECT COUNT(*) c FROM job_tools WHERE job=?').get(job).c;
    assert.ok(n >= 3, `nghề ${job} chỉ có ${n} công cụ`);
  }
});

test('công cụ mới bán ở shop và đúng type tool (không lọt vào bảng vũ khí)', () => {
  for (const t of jobTools.NEW_ITEMS) {
    const it = db.prepare('SELECT * FROM items WHERE id=?').get(t.id);
    assert.ok(it, `thiếu item ${t.id}`);
    assert.strictEqual(it.type, 'tool', `${t.id} phải là type tool`);
    assert.ok(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(t.id), `${t.id} không bán ở shop`);
    assert.ok(it.desc.length >= 25, `${t.id} mô tả quá ngắn`);
  }
});

test('giá và cấp yêu cầu tăng dần trong từng nghề (không có món vô lý)', () => {
  for (const job of ['mining', 'fishing', 'foraging', 'cooking', 'crafting']) {
    const list = jobTools.getToolsByJob(job);
    assert.ok(list.length >= 3);
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].min_level >= list[i - 1].min_level, `${job}: cấp yêu cầu không tăng dần`);
      if (list[i].min_level === list[i - 1].min_level) {
        assert.ok(list[i].price >= list[i - 1].price, `${job}: cùng cấp mà món sau rẻ hơn`);
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 2. Không nerf + nâng cấp trong tier phải khác nhau
// ─────────────────────────────────────────────────────────────
test('qty_bonus của pickaxe/cần câu đúng bằng mức tier cũ (không nerf)', () => {
  const OLD_TIER_MULT = { common: 1.0, rare: 1.15, epic: 1.3 };
  const rows = db.prepare(`SELECT jt.*, i.tier FROM job_tools jt JOIN items i ON i.id = jt.item_id
    WHERE jt.job IN ('mining','fishing')`).all();
  for (const r of rows) {
    const expected = OLD_TIER_MULT[r.tier] - 1;
    assert.ok(Math.abs(r.qty_bonus - expected) < 1e-9,
      `${r.item_id} (${r.tier}): qty_bonus ${r.qty_bonus}, mức cũ ${expected}`);
  }
});

test('nâng cấp trong cùng tier GIỜ có tác dụng (lỗi cũ: 4200 vàng = 0% cải thiện)', () => {
  const iron = jobTools.getTool('pick_iron');
  const silver = jobTools.getTool('pick_silver');
  assert.strictEqual(iron.qty_bonus, silver.qty_bonus, 'cùng tier thì qty như nhau (đúng thiết kế)');
  assert.ok(silver.drop_bonus > iron.drop_bonus,
    'pick_silver đắt gấp đôi mà cơ hội rơi không hơn pick_iron');

  const gold = jobTools.getTool('pick_gold');
  const mithril = jobTools.getTool('pick_mithril');
  assert.ok(mithril.drop_bonus > gold.drop_bonus);
});

test('trần bonus bị khoá: drop ≤ +15%, qty ≤ +30%', () => {
  const rows = db.prepare('SELECT * FROM job_tools').all();
  for (const r of rows) {
    assert.ok(r.drop_bonus <= 0.15 + 1e-9, `${r.item_id} drop_bonus ${r.drop_bonus} vượt trần 15%`);
    assert.ok(r.qty_bonus <= 0.30 + 1e-9, `${r.item_id} qty_bonus ${r.qty_bonus} vượt trần 30%`);
    assert.ok(r.extra_chance <= 0.20 + 1e-9, `${r.item_id} extra_chance quá cao`);
    assert.ok(r.save_chance <= 0.20 + 1e-9, `${r.item_id} save_chance quá cao`);
  }
});

test('foraging cố tình KHÔNG có qty_bonus (nghề yield cao nhất, xem measure_jobs)', () => {
  const rows = db.prepare("SELECT * FROM job_tools WHERE job='foraging'").all();
  for (const r of rows) {
    assert.strictEqual(r.qty_bonus, 0, `${r.item_id} thêm qty_bonus sẽ nới rộng khoảng cách nghề`);
    assert.ok(r.drop_bonus > 0, `${r.item_id} không có tác dụng gì`);
  }
});

// ─────────────────────────────────────────────────────────────
// 3. bonus() — chọn đúng công cụ
// ─────────────────────────────────────────────────────────────
test('bonus() trả về null khi không có công cụ', () => {
  const uid = newPlayer();
  const b = jobTools.bonus(uid, 'foraging', 50);
  assert.strictEqual(b.tool, null);
  assert.strictEqual(b.dropMult, 1);
  assert.strictEqual(b.qtyMult, 1);
});

test('bonus() chọn công cụ tốt nhất ĐANG CÓ, tôn trọng cấp người chơi', () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'pick_wood', 1);
  player.addItem(uid, 'pick_gold', 1);
  let b = jobTools.bonus(uid, 'mining', 50);
  assert.strictEqual(b.tool.item_id, 'pick_gold', 'không chọn công cụ tốt nhất trong túi');

  // Cấp 5: pick_gold yêu cầu Lv.25 → phải rơi về pick_wood
  b = jobTools.bonus(uid, 'mining', 5);
  assert.strictEqual(b.tool.item_id, 'pick_wood', 'dùng công cụ vượt cấp');

  // Không có trong túi thì không tính, dù item tồn tại trong DB
  const uid2 = newPlayer(50);
  assert.strictEqual(jobTools.bonus(uid2, 'mining', 50).tool, null);
});

test('bonus() chỉ tính công cụ của ĐÚNG nghề đó', () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'pick_mithril', 1);
  assert.strictEqual(jobTools.bonus(uid, 'foraging', 50).tool, null, 'cầm pickaxe mà hái lượm được bonus');
  assert.ok(jobTools.bonus(uid, 'mining', 50).tool);
});

// ─────────────────────────────────────────────────────────────
// 4. Cơ hội rơi thật
// ─────────────────────────────────────────────────────────────
test('rollDrops: chanceMult làm drop khó rơi trở nên chắc hơn', () => {
  const zone = gz.getZonesByJob('mining')[0];
  const real = Math.random;
  try {
    // Ép roll = 0.55; mọi drop có chance < 0.55 sẽ trượt
    Math.random = () => 0.55;
    const base = gz.rollDrops(zone.id);
    const boosted = gz.rollDrops(zone.id, { chanceMult: 1.5 });
    assert.ok(boosted.length >= base.length, 'chanceMult không làm tăng số drop');
    // drop bị chặn ở 100%: mult rất lớn cũng không lỗi
    const extreme = gz.rollDrops(zone.id, { chanceMult: 100 });
    assert.ok(extreme.length >= boosted.length);
  } finally { Math.random = real; }
});

test('rollDrops: cơ hội bị CHẶN ở 100% (mult lớn cũng không vượt)', () => {
  // Zone tạm: đúng 1 drop, chance 50%
  gz.createZone({ id: 'jt_cap_zone', job_type: 'mining', name: 'Cap Test', min_job_level: 1, cooldown_ms: 1000, base_xp: 1 });
  db.prepare('INSERT OR REPLACE INTO gather_drops (zone_id, item_id, chance, qty_min, qty_max) VALUES (?,?,?,?,?)')
    .run('jt_cap_zone', 'stone', 0.5, 1, 1);

  const real = Math.random;
  try {
    Math.random = () => 0.6;
    assert.strictEqual(gz.rollDrops('jt_cap_zone').length, 0, 'chance 50% mà roll 0.6 lại trúng');

    // 0.5 × 1.4 = 70% → roll 0.6 phải trúng
    assert.strictEqual(gz.rollDrops('jt_cap_zone', { chanceMult: 1.4 }).length, 1);

    // Chặn ở 1.0: chance 100% thì roll sát 1 vẫn trúng, và không có giá trị >1
    Math.random = () => 0.999;
    assert.strictEqual(gz.rollDrops('jt_cap_zone', { chanceMult: 1000 }).length, 1,
      'cơ hội phải được đẩy lên đúng 100%, không hơn');
  } finally {
    Math.random = real;
    db.prepare('DELETE FROM gather_drops WHERE zone_id=?').run('jt_cap_zone');
    db.prepare('DELETE FROM gather_zones WHERE id=?').run('jt_cap_zone');
  }
});

// ─────────────────────────────────────────────────────────────
// 5. %mine / %gather chạy thật với công cụ
// ─────────────────────────────────────────────────────────────
test('%mine dùng công cụ trong túi và hiện thông số', async () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'pick_mithril', 1);
  const real = Math.random;
  Math.random = () => 0;               // mọi drop đều trúng
  try {
    const m = fakeMessage(uid);
    await mineCmd.execute(m, [], '%');
    const t = out(m);
    assert.match(t, /Mithril Pickaxe/, `không hiện pickaxe:\n${t}`);
    assert.match(t, /\+30% số lượng/, 'không hiện bonus số lượng');
    assert.match(t, /\+15% cơ hội rơi/, 'không hiện bonus cơ hội rơi');
  } finally { Math.random = real; }
});

test('%mine vẫn chặn khi không có pickaxe (hành vi cũ không đổi)', async () => {
  const uid = newPlayer(50);
  const m = fakeMessage(uid);
  await mineCmd.execute(m, [], '%');
  assert.match(out(m), /cần \*\*Pickaxe\*\*/);
});

test('%gather KHÔNG bắt buộc giỏ, nhưng có giỏ thì hiện bonus', async () => {
  const zone = gz.getZonesByJob('foraging')[0];
  const uid = newPlayer(50);
  const real = Math.random;
  Math.random = () => 0;
  try {
    const m1 = fakeMessage(uid);
    await gatherCmd.execute(m1, [zone.id], '%');
    assert.match(out(m1), /Chưa có giỏ hái/, `không gợi ý mua giỏ:\n${out(m1)}`);

    const uid2 = newPlayer(50);
    player.addItem(uid2, 'basket_bamboo', 1);
    const m2 = fakeMessage(uid2);
    await gatherCmd.execute(m2, [zone.id], '%');
    assert.match(out(m2), /Bamboo Basket/, 'không hiện giỏ đang dùng');
    assert.match(out(m2), /\+10% cơ hội rơi/);
  } finally { Math.random = real; }
});

// ─────────────────────────────────────────────────────────────
// 6. Dao bếp / búa thợ
// ─────────────────────────────────────────────────────────────
test('dao bếp: ra thêm 1 món khi roll trúng', async () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'knife_kitchen', 1);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='cook' ORDER BY min_job_level LIMIT 1").get();
  for (const inp of JSON.parse(recipe.inputs)) player.addItem(uid, inp.item_id, inp.qty);

  const real = Math.random;
  Math.random = () => 0;               // luôn trúng extra_chance
  try {
    const m = fakeMessage(uid);
    await craft.cook.execute(m, [recipe.id], '%');
    assert.match(out(m), /\+1 món/, `không ra thêm món:\n${out(m)}`);
  } finally { Math.random = real; }

  const have = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, recipe.output_id);
  assert.strictEqual(have.qty, recipe.output_qty + 1);
});

test('dao bếp: không có dao thì không bao giờ ra thêm món', async () => {
  const uid = newPlayer(50);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='cook' ORDER BY min_job_level LIMIT 1").get();
  for (const inp of JSON.parse(recipe.inputs)) player.addItem(uid, inp.item_id, inp.qty);

  const real = Math.random;
  Math.random = () => 0;
  try {
    const m = fakeMessage(uid);
    await craft.cook.execute(m, [recipe.id], '%');
    assert.ok(!/\+1 món/.test(out(m)));
  } finally { Math.random = real; }
  const have = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, recipe.output_id);
  assert.strictEqual(have.qty, recipe.output_qty);
});

test('búa thợ: roll trúng thì KHÔNG tiêu nguyên liệu', async () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'hammer_tinker', 1);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='craft' ORDER BY min_job_level LIMIT 1").get();
  assert.ok(recipe, 'không có recipe craft');
  const inputs = JSON.parse(recipe.inputs);
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty);

  const beforeQtys = inputs.map(i => db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, i.item_id).qty);

  const real = Math.random;
  Math.random = () => 0;               // luôn trúng save_chance
  try {
    const m = fakeMessage(uid);
    await craft.execute(m, [recipe.id], '%');
    assert.match(out(m), /không tiêu nguyên liệu/, `không báo tiết kiệm:\n${out(m)}`);
  } finally { Math.random = real; }

  const afterQtys = inputs.map(i => db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, i.item_id).qty);
  assert.deepStrictEqual(afterQtys, beforeQtys, 'báo tiết kiệm nhưng vẫn trừ nguyên liệu');
});

test('không có búa thì nguyên liệu vẫn bị trừ như cũ', async () => {
  const uid = newPlayer(50);
  const recipe = db.prepare("SELECT * FROM recipes WHERE type='craft' ORDER BY min_job_level LIMIT 1").get();
  const inputs = JSON.parse(recipe.inputs);
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty + 1);

  const real = Math.random;
  Math.random = () => 0;
  try { await craft.execute(fakeMessage(uid), [recipe.id], '%'); } finally { Math.random = real; }
  for (const inp of inputs) {
    const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, inp.item_id);
    assert.strictEqual(row.qty, 1, `${inp.item_id} không bị trừ`);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Hiển thị
// ─────────────────────────────────────────────────────────────
test('%item hiện công dụng nghề (đọc từ DB, không viết cứng)', () => {
  const m = fakeMessage(newPlayer());
  infoCmd.execute(m, ['item', 'pick_iron'], '%');
  const t = out(m);
  assert.match(t, /Công dụng nghề/, `%info không hiện công dụng:\n${t.slice(0, 300)}`);
  assert.match(t, /\+6% cơ hội rơi/);
});

test('%job hiện công cụ đang dùng cho cả 5 nghề', () => {
  const uid = newPlayer(50);
  player.addItem(uid, 'basket_bamboo', 1);
  const m = fakeMessage(uid);
  jobCmd.execute(m, [], '%');
  const t = out(m);
  assert.match(t, /Công cụ bổ trợ/, 'không có mục công cụ trong %job');
  assert.match(t, /Bamboo Basket/, 'không hiện giỏ đang dùng');
  assert.match(t, /chưa có/, 'không nhắc nghề nào còn thiếu công cụ');
});

// ─────────────────────────────────────────────────────────────
// 8. Idempotent
// ─────────────────────────────────────────────────────────────
test('migrate chạy lại không nhân đôi công cụ/thông số', () => {
  const beforeItems = db.prepare("SELECT COUNT(*) c FROM items WHERE type='tool'").get().c;
  const beforeStats = db.prepare('SELECT COUNT(*) c FROM job_tools').get().c;
  jobTools.migrate();
  jobTools.migrate();
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM items WHERE type='tool'").get().c, beforeItems);
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM job_tools').get().c, beforeStats);
});
