// Test cho vật phẩm bổ trợ dùng một lần (đuốc / mồi câu / bó thảo mộc /
// gia vị / dầu tôi).
//
// Khoá các yêu cầu:
//   1. Seed đủ 2 bậc/nghề, bán ở shop, KHÔNG phải bình máu (không có heal).
//   2. %use kích hoạt buff và TRỪ item; sai cấp thì không mất item.
//   3. Mỗi lần dùng lệnh nghề tốn đúng 1 lượt; hết lượt thì buff tự xoá.
//   4. Buff cộng dồn với công cụ nhưng có TRẦN (không phá drop rate).
//   5. Dùng cái mới thay cái cũ CÙNG nghề; khác nghge thì chạy song song.
//   6. Gia vị (cooking) / dầu tôi (crafting) có tác dụng thật trong lệnh.
//   7. Người chơi thấy: %job, %item, và dòng nhắc trong lệnh nghề.
//   8. Idempotent.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, gz, jobBuffs, useCmd, mineCmd, gatherCmd, craft, jobCmd, infoCmd, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  gz = require(`${ROOT}/src/game/gather_zones`);
  jobBuffs = require(`${ROOT}/src/game/job_buffs`);
  useCmd = require(`${ROOT}/src/commands/use`);
  mineCmd = require(`${ROOT}/src/commands/mine`);
  gatherCmd = require(`${ROOT}/src/commands/gather`);
  craft = require(`${ROOT}/src/commands/craft`);
  jobCmd = require(`${ROOT}/src/commands/job`);
  infoCmd = require(`${ROOT}/src/commands/info`);
  loud();
});

const out = (m) => m._text();
const newPlayer = (level = 50) => {
  const uid = `JB${++seq}`;
  player.createPlayer(uid, `b${seq}`);
  if (level) player.updatePlayer(uid, { level });
  return uid;
};
// %mine cần cooldown hết hạn giữa các lần
const clearCd = (uid, job = 'mining') => jobs0.setCooldown(uid, job) && jobs0.updateJob(uid, job, { last_action: 0 });
const jobs0 = require(`${ROOT}/src/game/jobs`);

// ─────────────────────────────────────────────────────────────
// 1. Seed
// ─────────────────────────────────────────────────────────────
test('mỗi nghề có 2 bậc vật phẩm bổ trợ, đều bán ở shop', () => {
  for (const job of ['mining', 'fishing', 'foraging', 'cooking', 'crafting']) {
    const list = jobBuffs.getBuffItemsByJob(job);
    assert.strictEqual(list.length, 2, `${job} có ${list.length} vật phẩm bổ trợ`);
    for (const b of list) {
      assert.ok(b.charges > 0, `${b.item_id} không có số lượt`);
      assert.ok(db.prepare('SELECT 1 FROM shop WHERE item_id=?').get(b.item_id), `${b.item_id} không bán ở shop`);
      assert.ok(b.desc && b.desc.length >= 25, `${b.item_id} mô tả quá ngắn`);
    }
    // Bậc sau phải mạnh hơn bậc trước
    const [t1, t2] = list;
    assert.ok(t2.charges >= t1.charges, `${job}: bậc 2 không nhiều lượt hơn`);
    const power = (b) => b.drop_bonus + b.qty_bonus + b.extra_chance + b.save_chance;
    assert.ok(power(t2) > power(t1), `${job}: bậc 2 không mạnh hơn bậc 1`);
  }
});

test('vật phẩm bổ trợ là consumable KHÔNG hồi máu (để %use không đi nhầm nhánh)', () => {
  const rows = db.prepare(`SELECT i.* FROM items i JOIN job_buff_items jb ON jb.item_id = i.id`).all();
  for (const r of rows) {
    assert.strictEqual(r.type, 'consumable', `${r.id} sai type`);
    assert.ok(!r.heal && !r.heal_pct, `${r.id} vừa buff vừa hồi máu`);
  }
});

// ─────────────────────────────────────────────────────────────
// 2. %use
// ─────────────────────────────────────────────────────────────
test('%use kích hoạt buff và trừ đúng 1 item', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'torch_pitch', 2);
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['torch_pitch'], '%');

  assert.match(out(m), /buff cho nghề \*\*mining\*\*/, out(m));
  const buff = jobBuffs.get(uid, 'mining');
  assert.ok(buff, 'không tạo buff');
  assert.strictEqual(buff.charges, 3);
  const left = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, 'torch_pitch').qty;
  assert.strictEqual(left, 1, 'không trừ item');
});

test('%use từ chối khi thiếu cấp và KHÔNG trừ item', async () => {
  const uid = newPlayer(5);
  player.addItem(uid, 'torch_oil', 1);   // bậc 2 mở ở Lv.25
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['torch_oil'], '%');
  assert.match(out(m), /cần Lv\.25/, out(m));
  assert.strictEqual(db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, 'torch_oil').qty, 1);
  assert.strictEqual(jobBuffs.get(uid, 'mining'), null);
});

test('%use không có item thì báo thiếu, không tạo buff', async () => {
  const uid = newPlayer();
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['bait_worm'], '%');
  assert.match(out(m), /không có đủ/);
  assert.strictEqual(jobBuffs.get(uid, 'fishing'), null);
});

test('%use bình máu vẫn hồi máu như cũ (không bị nhánh buff nuốt)', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'potion_s', 1);
  player.updatePlayer(uid, { hp: 1 });
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['potion_s'], '%');
  assert.match(out(m), /hồi/, out(m));
});

// ─────────────────────────────────────────────────────────────
// 3. Trừ lượt
// ─────────────────────────────────────────────────────────────
test('mỗi lần %mine tốn đúng 1 lượt, hết lượt thì buff biến mất', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'pick_wood', 1);
  player.addItem(uid, 'torch_pitch', 1);
  await useCmd.execute(fakeMessage(uid), ['torch_pitch'], '%');
  assert.strictEqual(jobBuffs.get(uid, 'mining').charges, 3);

  const real = Math.random;
  Math.random = () => 0;
  try {
    for (let i = 0; i < 3; i++) {
      const m = fakeMessage(uid);
      await mineCmd.execute(m, [], '%');
      assert.match(out(m), /còn \d+ lượt|vừa hết lượt/, `lần ${i + 1} không nhắc buff:\n${out(m)}`);
      jobs0.updateJob(uid, 'mining', { last_action: 0 });   // bỏ cooldown
    }
  } finally { Math.random = real; }

  assert.strictEqual(jobBuffs.get(uid, 'mining'), null, 'hết 3 lượt mà buff vẫn còn');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM job_buffs WHERE user_id=?').get(uid).c, 0);
});

test('lượt cuối cùng báo "vừa hết lượt"', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'pick_wood', 1);
  player.addItem(uid, 'torch_pitch', 1);
  await useCmd.execute(fakeMessage(uid), ['torch_pitch'], '%');
  // Ép còn 1 lượt
  db.prepare('UPDATE job_buffs SET charges=1 WHERE user_id=? AND job=?').run(uid, 'mining');

  const real = Math.random;
  Math.random = () => 0;
  try {
    const m = fakeMessage(uid);
    await mineCmd.execute(m, [], '%');
    assert.match(out(m), /vừa hết lượt/, `không báo hết lượt:\n${out(m)}`);
  } finally { Math.random = real; }
});

test('%gather cũng trừ lượt buff foraging', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'bundle_herb', 1);
  await useCmd.execute(fakeMessage(uid), ['bundle_herb'], '%');
  assert.strictEqual(jobBuffs.get(uid, 'foraging').charges, 3);

  const zone = gz.getZonesByJob('foraging')[0];
  const real = Math.random;
  Math.random = () => 0;
  try {
    await gatherCmd.execute(fakeMessage(uid), [zone.id], '%');
  } finally { Math.random = real; }
  assert.strictEqual(jobBuffs.get(uid, 'foraging').charges, 2);
});

// ─────────────────────────────────────────────────────────────
// 4. Cộng dồn + trần
// ─────────────────────────────────────────────────────────────
test('buff cộng dồn với công cụ và bị chặn ở trần 60%', () => {
  const uid = newPlayer();
  player.addItem(uid, 'pick_mithril', 1);          // +15% rơi, +30% số lượng
  player.addItem(uid, 'torch_oil', 1);             // +50% rơi
  jobBuffs.activate(uid, 'torch_oil', 50);

  const b = jobBuffs.bonus(uid, 'mining', 50);
  assert.ok(b.tool && b.buff, 'thiếu công cụ hoặc buff');
  assert.strictEqual(Math.round((b.dropMult - 1) * 100), 60, '15 + 50 phải bị chặn ở 60%');
  assert.strictEqual(Math.round((b.qtyMult - 1) * 100), 30);

  // Không có buff thì chỉ còn phần công cụ
  jobBuffs.clear(uid, 'mining');
  const b2 = jobBuffs.bonus(uid, 'mining', 50);
  assert.strictEqual(Math.round((b2.dropMult - 1) * 100), 15);
});

test('trần extra/save: công cụ + gia vị không vượt 40%', () => {
  const uid = newPlayer();
  player.addItem(uid, 'knife_master', 1);          // +18% ra thêm món
  player.addItem(uid, 'spice_saffron', 1);         // +20%
  jobBuffs.activate(uid, 'spice_saffron', 50);
  const b = jobBuffs.bonus(uid, 'cooking', 50);
  assert.ok(b.extraChance <= 0.40 + 1e-9, `extra ${b.extraChance} vượt trần`);
  assert.ok(Math.abs(b.extraChance - 0.38) < 1e-9, `18+20 phải là 38%, đang ${b.extraChance}`);
});

// ─────────────────────────────────────────────────────────────
// 5. Thay thế / song song
// ─────────────────────────────────────────────────────────────
test('dùng cái mới THAY cái cũ cùng nghề và báo rõ', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'torch_pitch', 1);
  player.addItem(uid, 'torch_oil', 1);
  await useCmd.execute(fakeMessage(uid), ['torch_pitch'], '%');
  const m = fakeMessage(uid);
  await useCmd.execute(m, ['torch_oil'], '%');

  assert.match(out(m), /Thay buff cũ/, out(m));
  const buff = jobBuffs.get(uid, 'mining');
  assert.strictEqual(buff.item_id, 'torch_oil');
  assert.strictEqual(buff.charges, 5, 'không lấy số lượt của cái mới');
});

test('buff hai nghề khác nhau chạy song song', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'torch_pitch', 1);
  player.addItem(uid, 'bait_worm', 1);
  await useCmd.execute(fakeMessage(uid), ['torch_pitch'], '%');
  await useCmd.execute(fakeMessage(uid), ['bait_worm'], '%');
  assert.ok(jobBuffs.get(uid, 'mining'));
  assert.ok(jobBuffs.get(uid, 'fishing'));
});

// ─────────────────────────────────────────────────────────────
// 6. Gia vị / dầu tôi có tác dụng thật
// ─────────────────────────────────────────────────────────────
test('dầu tôi: %craft không tiêu nguyên liệu khi buff trúng', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'oil_quench', 1);
  await useCmd.execute(fakeMessage(uid), ['oil_quench'], '%');

  const recipe = db.prepare("SELECT * FROM recipes WHERE type='craft' ORDER BY min_job_level LIMIT 1").get();
  const inputs = JSON.parse(recipe.inputs);
  for (const inp of inputs) player.addItem(uid, inp.item_id, inp.qty);
  const before = inputs.map(i => db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, i.item_id).qty);

  const real = Math.random;
  Math.random = () => 0;   // save_chance trúng
  try {
    const m = fakeMessage(uid);
    await craft.execute(m, [recipe.id], '%');
    assert.match(out(m), /không tiêu nguyên liệu/, out(m));
  } finally { Math.random = real; }

  const after = inputs.map(i => db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, i.item_id).qty);
  assert.deepStrictEqual(after, before, 'báo tiết kiệm mà vẫn trừ nguyên liệu');
  assert.strictEqual(jobBuffs.get(uid, 'crafting').charges, 2, 'không trừ lượt buff crafting');
});

test('gia vị: %cook ra thêm 1 món khi buff trúng', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'spice_salt', 1);
  await useCmd.execute(fakeMessage(uid), ['spice_salt'], '%');

  const recipe = db.prepare("SELECT * FROM recipes WHERE type='cook' ORDER BY min_job_level LIMIT 1").get();
  for (const inp of JSON.parse(recipe.inputs)) player.addItem(uid, inp.item_id, inp.qty);

  const real = Math.random;
  Math.random = () => 0;
  try {
    const m = fakeMessage(uid);
    await craft.cook.execute(m, [recipe.id], '%');
    assert.match(out(m), /\+1 món/, out(m));
  } finally { Math.random = real; }
  assert.strictEqual(jobBuffs.get(uid, 'cooking').charges, 2);
});

// ─────────────────────────────────────────────────────────────
// 7. Hiển thị
// ─────────────────────────────────────────────────────────────
test('%job hiện buff đang chạy', async () => {
  const uid = newPlayer();
  player.addItem(uid, 'bundle_bloom', 1);
  await useCmd.execute(fakeMessage(uid), ['bundle_bloom'], '%');
  const m = fakeMessage(uid);
  jobCmd.execute(m, [], '%');
  const t = out(m);
  assert.match(t, /Nightbloom Bundle/, `%job không hiện buff:\n${t}`);
  assert.match(t, /còn 5 lượt/);
});

test('%item hiện hiệu ứng của vật phẩm bổ trợ', () => {
  const m = fakeMessage(newPlayer());
  infoCmd.execute(m, ['item', 'torch_oil'], '%');
  const t = out(m);
  assert.match(t, /Dùng cho nghề/, `%info không hiện hiệu ứng:\n${t.slice(0, 300)}`);
  assert.match(t, /\+50% cơ hội rơi/);
  assert.match(t, /5 lượt/);
});

// ─────────────────────────────────────────────────────────────
// 8. Idempotent
// ─────────────────────────────────────────────────────────────
test('migrate chạy lại không nhân đôi vật phẩm/hiệu ứng', () => {
  const before = db.prepare('SELECT COUNT(*) c FROM job_buff_items').get().c;
  jobBuffs.migrate();
  jobBuffs.migrate();
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM job_buff_items').get().c, before);
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM items WHERE id IN (SELECT item_id FROM job_buff_items)").get().c, 10);
});

// ─────────────────────────────────────────────────────────────
// 9. Kinh tế: KHÔNG được là bẫy giá
// ─────────────────────────────────────────────────────────────
// Bản nháp đầu đặt 150/600 vàng, đo ra lỗ ròng -48…-111 vàng mỗi lượt ở
// Lv.1–35: người chơi mua xong còn nghèo hơn. Test này khoá lại: ở ĐÚNG cấp mở
// khoá, phần vàng buff tạo thêm phải ≥ giá mỗi lượt, cho cả 3 nghề hái.
test('giá buff không phải bẫy: ở cấp mở khoá, lời/lượt ≥ giá/lượt', () => {
  const measure = require(`${ROOT}/tools/measure_jobs`);
  const items = db.prepare(`SELECT jb.*, i.price, i.min_level FROM job_buff_items jb
    JOIN items i ON i.id = jb.item_id WHERE jb.job IN ('mining','fishing','foraging')`).all();

  for (const b of items) {
    const level = b.min_level;
    const zone = measure.bestZone(b.job, level);
    assert.ok(zone, `${b.job} không có zone ở Lv.${level}`);

    const toolStats = measure.bestToolRow(b.job, level);
    const before = measure.goldPerAction(zone, level, toolStats);
    const after = measure.goldPerAction(zone, level, measure.combinedBonus(b.job, level, true));
    const gainPerUse = after - before;
    const costPerUse = b.price / b.charges;

    assert.ok(gainPerUse >= costPerUse - 0.5,
      `${b.item_id} (mở Lv.${level}): lời ${gainPerUse.toFixed(1)}/lượt < giá ${costPerUse.toFixed(1)}/lượt`);
  }
});

test('buff dùng ở cấp mở khoá thì KHÔNG âm vàng (kiểm tra qua %mine thật)', async () => {
  // Bậc 1 mở ở Lv.10: mua 12 vàng, dùng 3 lượt
  const uid = newPlayer(10);
  player.addItem(uid, 'pick_wood', 1);
  player.addItem(uid, 'torch_pitch', 1);
  const m0 = fakeMessage(uid);
  await useCmd.execute(m0, ['torch_pitch'], '%');
  assert.ok(jobBuffs.get(uid, 'mining'), 'không kích hoạt được buff ở Lv.10');
  assert.match(out(m0), /còn 3 lượt|trong \*\*3 lượt\*\*/);
});
