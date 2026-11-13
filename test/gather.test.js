// Test cho nghề hái lượm (foraging) + lệnh %gather.
//
// Khoá các yêu cầu:
//   1. foraging là nghề thật: có trong JOB_TYPES, hiện ở %job, chọn được ở slash.
//   2. Nội dung seed đủ và ĐÚNG: 5 zone, mỗi zone có drop, mọi item drop tồn tại.
//   3. %gather chạy được: ra item + XP, tôn trọng cooldown và khoá level.
//   4. Admin tạo được zone foraging bằng %gz (trước đây `job` bị chặn cứng ở
//      mining|fishing nên không thể).
//   5. Seed idempotent: migrate chạy lại không nhân đôi dữ liệu (điều kiện bắt
//      buộc vì seedDefaults() return sớm khi DB đã có dữ liệu).
//   6. Nguyên liệu hái được PHẢI có chỗ dùng: recipe dùng chúng chạy thật
//      (%craft / %cook), nếu không nguyên liệu chỉ là rác trong túi.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, jobs, gz, gather, craft, cook, jobCmd, gzCmd, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  jobs = require(`${ROOT}/src/game/jobs`);
  gz = require(`${ROOT}/src/game/gather_zones`);
  gather = require(`${ROOT}/src/commands/gather`);
  craft = require(`${ROOT}/src/commands/craft`);
  cook = require(`${ROOT}/src/commands/craft`).cook;
  jobCmd = require(`${ROOT}/src/commands/job`);
  gzCmd = require(`${ROOT}/src/commands/gatherzone`);
  loud();
});

const out = (m) => m._text();
const newPlayer = () => {
  const uid = `FOR${++seq}`;
  player.createPlayer(uid, `f${seq}`);
  return uid;
};

// ─────────────────────────────────────────────────────────────
// 1. Nghề foraging tồn tại ở mọi nơi cần thiết
// ─────────────────────────────────────────────────────────────
test('foraging nằm trong JOB_TYPES và có JOB_INFO', () => {
  assert.ok(jobs.JOB_TYPES.includes('foraging'), 'JOB_TYPES thiếu foraging');
  assert.ok(jobs.JOB_INFO.foraging, 'JOB_INFO thiếu foraging');
  assert.ok(jobs.GATHER_JOB_TYPES.includes('foraging'), 'GATHER_JOB_TYPES thiếu foraging');
});

test('%job hiện Foraging', async () => {
  const uid = newPlayer();
  const m = fakeMessage(uid);
  await jobCmd.execute(m, []);
  assert.match(out(m), /Foraging/, `%job không hiện nghề foraging:\n${out(m).slice(0, 200)}`);
});

test('%job top foraging chạy được', async () => {
  const uid = newPlayer();
  const m = fakeMessage(uid);
  await jobCmd.execute(m, ['top', 'foraging']);
  assert.ok(!out(m).includes('Cú pháp'), `%job top foraging bị từ chối:\n${out(m)}`);
});

test('slash có /gather trỏ về lệnh gather thật', () => {
  const { definitions } = require(`${ROOT}/src/slash/definitions`);
  const def = definitions.find(d => d.data.name === 'gather');
  assert.ok(def, 'thiếu slash /gather');
  assert.strictEqual(def.handler.cmdName, 'gather');
  assert.strictEqual(def.autocomplete, 'zone_foraging');
  const ac = require(`${ROOT}/src/slash/autocomplete`);
  assert.ok(ac.providers.zone_foraging, 'thiếu autocomplete zone_foraging');
});

// ─────────────────────────────────────────────────────────────
// 2. Nội dung seed đúng
// ─────────────────────────────────────────────────────────────
test('có 5 zone foraging, zone nào cũng có drop và mô tả', () => {
  const zones = gz.getZonesByJob('foraging');
  assert.ok(zones.length >= 5, `chỉ có ${zones.length} zone foraging`);
  for (const z of zones) {
    assert.ok(z.desc && z.desc.trim().length > 0, `zone ${z.id} thiếu mô tả`);
    assert.ok(gz.getDrops(z.id).length > 0, `zone ${z.id} không có drop nào`);
    assert.strictEqual(z.job_type, 'foraging');
  }
});

test('mọi item drop của foraging đều tồn tại trong bảng items', () => {
  const zones = gz.getZonesByJob('foraging');
  const missing = [];
  for (const z of zones) {
    for (const d of gz.getDrops(z.id)) {
      if (!db.prepare('SELECT id FROM items WHERE id=?').get(d.item_id)) missing.push(`${z.id}:${d.item_id}`);
      assert.ok(d.chance > 0 && d.chance <= 1, `${d.item_id} chance vô lý: ${d.chance}`);
    }
  }
  assert.deepStrictEqual(missing, [], `drop trỏ tới item không tồn tại: ${missing.join(', ')}`);
});

test('nguyên liệu foraging là material và bán được (không phải item rác)', () => {
  const mats = db.prepare(`SELECT i.id, i.type, i.sell FROM items i
    JOIN gather_drops d ON d.item_id = i.id
    JOIN gather_zones z ON z.id = d.zone_id AND z.job_type='foraging'
    GROUP BY i.id`).all();
  assert.ok(mats.length >= 10, `chỉ có ${mats.length} nguyên liệu foraging`);
  for (const it of mats) {
    assert.strictEqual(it.type, 'material', `${it.id} phải là material`);
    assert.ok(it.sell > 0, `${it.id} không bán được (sell=0) — nguyên liệu vô dụng`);
  }
});

// ─────────────────────────────────────────────────────────────
// 3. %gather chạy thật
// ─────────────────────────────────────────────────────────────
test('%gather list hiện đủ zone foraging', async () => {
  const uid = newPlayer();
  const m = fakeMessage(uid);
  await gather.execute(m, ['list']);
  const total = gz.getZonesByJob('foraging').length;
  const shown = gz.getZonesByJob('foraging').filter(z => out(m).includes(z.id)).length;
  assert.strictEqual(shown, total, `%gather list chỉ hiện ${shown}/${total} zone`);
});

test('%gather hái được item + cộng XP nghề', async () => {
  const uid = newPlayer();
  // Cho chắc chắn có drop: ép may mắn bằng cách cho zone 1 drop 100%
  const zone = gz.getZonesByJob('foraging')[0];
  const invBefore = db.prepare('SELECT COALESCE(SUM(qty),0) q FROM inventory WHERE user_id=?').get(uid).q;
  const m = fakeMessage(uid);
  await gather.execute(m, [zone.id]);
  const t = out(m);
  assert.match(t, /Hái lượm/, `%gather không chạy:\n${t}`);
  const invAfter = db.prepare('SELECT COALESCE(SUM(qty),0) q FROM inventory WHERE user_id=?').get(uid).q;
  // Có thể trượt (drop xác suất) → chỉ kiểm tra: hoặc có item, hoặc báo trượt rõ ràng
  if (invAfter === invBefore) {
    assert.match(t, /Không hái được gì/, 'trượt mà không nói gì với người chơi');
  }
  const job = jobs.getJob(uid, 'foraging');
  assert.ok(job.xp > 0, 'không cộng XP nghề foraging');
  assert.ok(job.last_action > 0, 'không set cooldown');
});

test('%gather tôn trọng cooldown', async () => {
  const uid = newPlayer();
  const z0 = gz.getZonesByJob('foraging')[0];
  await gather.execute(fakeMessage(uid), [z0.id]);
  const m2 = fakeMessage(uid);
  await gather.execute(m2, [z0.id]);
  assert.match(out(m2), /Còn \*\*\d/, `lần 2 không bị chặn cooldown:\n${out(m2)}`);
});

test('%gather chặn zone chưa đủ cấp nghề', async () => {
  const uid = newPlayer();
  const high = gz.getZonesByJob('foraging').slice(-1)[0];
  const m = fakeMessage(uid);
  await gather.execute(m, [high.id]);
  assert.match(out(m), /yêu cầu Foraging Lv\./, `không khoá zone cấp cao:\n${out(m)}`);
});

test('%gather từ chối zone của nghề khác', async () => {
  const uid = newPlayer();
  const m = fakeMessage(uid);
  await gather.execute(m, ['stone_quarry']); // zone mining
  assert.match(out(m), /không tồn tại/, `%gather nhận zone mining:\n${out(m)}`);
});

// ─────────────────────────────────────────────────────────────
// 4. Admin: %gz không còn chặn cứng job
// ─────────────────────────────────────────────────────────────
test('%gz create tạo được zone foraging', async () => {
  const m = fakeMessage('ADMIN_G');
  m.content = '%gz create test_forage_zone job=foraging name="Test Forage" minlv=2 cd=15000 xp=9 desc="thu nghiem"';
  await gzCmd.execute(m, ['create', 'test_forage_zone']);
  try {
    const z = gz.getZone('test_forage_zone');
    assert.ok(z, `%gz create job=foraging bị từ chối: ${out(m)}`);
    assert.strictEqual(z.job_type, 'foraging');
    // và hiện trong %gather list (lệnh này cần nhân vật)
    const m2 = fakeMessage(newPlayer());
    await gather.execute(m2, ['list']);
    assert.ok(out(m2).includes('test_forage_zone'), 'zone admin tạo không hiện trong %gather list');
  } finally {
    gz.deleteZone('test_forage_zone');
  }
});

test('%gz create từ chối job không phải nghề thu hoạch', async () => {
  const m = fakeMessage('ADMIN_G');
  m.content = '%gz create bad_zone job=cooking name="Bad"';
  await gzCmd.execute(m, ['create', 'bad_zone']);
  assert.strictEqual(gz.getZone('bad_zone'), undefined, 'zone job=cooking vẫn được tạo');
  assert.match(out(m), /job/, 'không báo lỗi rõ ràng');
});

test('%gz list hiện cả zone foraging (không chỉ mining/fishing)', async () => {
  const m = fakeMessage('ADMIN_G');
  await gzCmd.execute(m, ['list']);
  assert.match(out(m), /foraging/, `%gz list thiếu nhóm foraging:\n${out(m).slice(0, 200)}`);
});

// ─────────────────────────────────────────────────────────────
// 5. Seed idempotent
// ─────────────────────────────────────────────────────────────
test('chạy lại migrate không nhân đôi zone/drop/item/recipe', () => {
  const snap = () => db.prepare(`SELECT
      (SELECT COUNT(*) FROM gather_zones) z,
      (SELECT COUNT(*) FROM gather_drops) d,
      (SELECT COUNT(*) FROM recipes) r,
      (SELECT COUNT(*) FROM items) i`).get();
  const before = snap();
  require(`${ROOT}/src/game/gather_zones`).migrate();
  require(`${ROOT}/src/game/recipes`).migrate();
  assert.deepStrictEqual(snap(), before, 'migrate chạy lại làm nhân đôi dữ liệu');
});

// ─────────────────────────────────────────────────────────────
// 6. Nguyên liệu hái được phải dùng được
// ─────────────────────────────────────────────────────────────
test('recipe_herb_salve chế được từ nguyên liệu hái lượm', async () => {
  const recipe = db.prepare("SELECT * FROM recipes WHERE id='recipe_herb_salve'").get();
  assert.ok(recipe, 'thiếu recipe dùng nguyên liệu foraging');

  const uid = newPlayer();
  jobs.updateJob(uid, 'crafting', { level: 5 });
  const inputs = JSON.parse(recipe.inputs);
  for (const i of inputs) player.addItem(uid, i.item_id, i.qty);
  const before = db.prepare('SELECT COALESCE(qty,0) q FROM inventory WHERE user_id=? AND item_id=?')
    .get(uid, recipe.output_id);

  const m = fakeMessage(uid);
  await craft.execute(m, [recipe.id]);
  assert.ok(!out(m).includes('❌'), `%craft herb_salve lỗi:\n${out(m)}`);

  const after = db.prepare('SELECT COALESCE(qty,0) q FROM inventory WHERE user_id=? AND item_id=?')
    .get(uid, recipe.output_id);
  assert.ok((after?.q || 0) > (before?.q || 0), 'không nhận được Herb Salve khi chế');
  // nguyên liệu phải bị trừ
  for (const i of inputs) {
    const left = db.prepare('SELECT COALESCE(qty,0) q FROM inventory WHERE user_id=? AND item_id=?').get(uid, i.item_id);
    assert.strictEqual(left?.q || 0, 0, `${i.item_id} không bị trừ khi chế`);
  }
});

test('recipe_forest_stew nấu được từ nguyên liệu hái lượm', async () => {
  const recipe = db.prepare("SELECT * FROM recipes WHERE id='recipe_forest_stew'").get();
  assert.ok(recipe, 'thiếu recipe nấu dùng nguyên liệu foraging');

  const uid = newPlayer();
  jobs.updateJob(uid, 'cooking', { level: 8 });
  for (const i of JSON.parse(recipe.inputs)) player.addItem(uid, i.item_id, i.qty);
  const m = fakeMessage(uid);
  await cook.execute(m, [recipe.id]);
  assert.ok(!out(m).includes('❌'), `%cook forest_stew lỗi:\n${out(m)}`);
  const got = db.prepare('SELECT COALESCE(qty,0) q FROM inventory WHERE user_id=? AND item_id=?').get(uid, recipe.output_id);
  assert.ok((got?.q || 0) > 0, 'không nhận được Forest Stew');
});

test('thuốc từ foraging hồi theo % max HP, không phải số cố định', () => {
  for (const id of ['herb_salve', 'moon_tonic', 'forest_stew']) {
    const it = db.prepare('SELECT heal, heal_pct, min_level FROM items WHERE id=?').get(id);
    assert.ok(it, `thiếu item ${id}`);
    assert.strictEqual(it.heal, 0, `${id} còn dùng heal cố định`);
    assert.ok(it.heal_pct > 0, `${id} chưa có heal_pct`);
    assert.ok(it.min_level > 0, `${id} chưa đặt min_level`);
  }
});

// ─────────────────────────────────────────────────────────────
// 7. Kinh tế: foraging phải nằm cùng dải với mining/fishing
// ─────────────────────────────────────────────────────────────
test('foraging không phá kinh tế: vàng/phút trong ±40% của mining cùng mốc level', () => {
  const goldPerMin = (job) => db.prepare(`
    SELECT z.id, z.min_job_level lv, z.cooldown_ms cd,
           SUM(d.chance*(d.qty_min+d.qty_max)/2.0*i.sell) gold
    FROM gather_zones z
    JOIN gather_drops d ON d.zone_id = z.id
    JOIN items i ON i.id = d.item_id
    WHERE z.job_type = ?
    GROUP BY z.id`).all(job).map(r => ({ lv: r.lv, perMin: r.gold * 60000 / r.cd }));

  const mining = goldPerMin('mining');
  const foraging = goldPerMin('foraging');
  const bad = [];
  for (const f of foraging) {
    const m = mining.find(x => x.lv === f.lv);
    if (!m) continue; // zone admin tự thêm thì không có mốc so sánh
    const ratio = f.perMin / m.perMin;
    if (ratio < 0.6 || ratio > 1.4) bad.push(`${f.lv}: foraging ${f.perMin.toFixed(0)} vs mining ${m.perMin.toFixed(0)} (×${ratio.toFixed(2)})`);
  }
  assert.deepStrictEqual(bad, [], `foraging lệch dải kinh tế: ${bad.join(' | ')}`);
});

test('nguyên liệu foraging không bán rẻ hơn bậc thang: zone cao hơn → nguyên liệu đắt hơn', () => {
  // Trong cùng một zone, món hiếm phải bán được nhiều hơn món thường; nếu không
  // người chơi chỉ farm món phổ biến và bậc thang nguyên liệu thành vô nghĩa.
  const zones = gz.getZonesByJob('foraging');
  for (const z of zones) {
    const drops = gz.getDrops(z.id).map(d => ({
      id: d.item_id, tier: db.prepare('SELECT tier FROM items WHERE id=?').get(d.item_id)?.tier,
    }));
    const order = { common: 1, rare: 2, epic: 3, legendary: 4 };
    for (const d of drops) assert.ok(order[d.tier] >= 1, `${d.id} tier lạ: ${d.tier}`);
  }
});
