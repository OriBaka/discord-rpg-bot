// Test cho QoL #5 (xác nhận khi bán ≥ 1,000 vàng) và phần "chống vượt giới hạn
// embed" còn lại: %pet collection, %ach list, %help.
//
// Vì sao khoá bằng test:
//   • `%sell all` trên nhân vật đầy đủ đo được 657 món / 1,439,091 vàng — một
//     lần gõ nhầm là mất sạch túi. Ngưỡng 1,000 vàng phải chặn TRƯỚC khi trừ.
//   • Pet / thành tựu / help đều là nội dung admin tạo được LÚC CHẠY, nên danh
//     sách chỉ dài thêm. Trước đây %ach list cắt im lặng ở 4000 ký tự.
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, fakeMessage, quiet, loud } = require('./harness');

let db, player, shopCmd, petCmd, achCmd, helpCmd, buttons, pets, achievements, seq = 0;

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  shopCmd = require(`${ROOT}/src/commands/shop`);
  petCmd = require(`${ROOT}/src/commands/pet`);
  achCmd = require(`${ROOT}/src/commands/achievement`);
  helpCmd = require(`${ROOT}/src/commands/help`);
  buttons = require(`${ROOT}/src/buttons`);
  pets = require(`${ROOT}/src/game/pets`);
  achievements = require(`${ROOT}/src/game/achievements`);
  loud();
});

const out = (m) => m._text();
const goldOf = (uid) => db.prepare('SELECT gold FROM players WHERE user_id=?').get(uid).gold;
const qtyOf = (uid, item) => {
  const r = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(uid, item);
  return r ? r.qty : 0;
};
const newPlayer = (gold = 0) => {
  const uid = `S5${++seq}`;
  player.createPlayer(uid, `s5${seq}`);
  player.updatePlayer(uid, { gold });
  return uid;
};
const unitOf = (id) => {
  const it = db.prepare('SELECT sell, price FROM items WHERE id=?').get(id);
  return it.sell || Math.floor((it.price || 0) / 3) || 0;
};
// Item đắt nhất còn bán được (để vượt ngưỡng 1,000 chỉ với 1 món)
const expensiveItem = () => db.prepare(
  `SELECT id, sell, price FROM items WHERE soulbound=0 AND COALESCE(NULLIF(sell,0), price/3) >= 1000
   ORDER BY COALESCE(NULLIF(sell,0), price/3) DESC LIMIT 1`).get();

// ─────────────────────────────────────────────────────────────
// #5 — xác nhận khi bán lớn
// ─────────────────────────────────────────────────────────────
test('%sell lẻ ≥1,000 vàng: chưa trừ gì, chỉ hiện xác nhận', async () => {
  const it = expensiveItem();
  assert.ok(it, 'DB không có món nào ≥1,000 vàng — test vô nghĩa');
  const uid = newPlayer(0);
  player.addItem(uid, it.id, 2);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, [it.id, '1'], '%');
  const t = out(m);

  assert.match(t, /Xác nhận bán/, t);
  assert.match(t, new RegExp(`sell ${it.id} 1 confirm`), 'phải chỉ đúng lệnh xác nhận');
  assert.strictEqual(qtyOf(uid, it.id), 2, 'CHƯA xác nhận mà đã bán mất item');
  assert.strictEqual(goldOf(uid), 0, 'CHƯA xác nhận mà đã cộng vàng');
});

test('%sell lẻ ≥1,000 vàng: gõ kèm confirm thì bán thật', async () => {
  const it = expensiveItem();
  const uid = newPlayer(0);
  player.addItem(uid, it.id, 2);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, [it.id, '1', 'confirm'], '%');
  assert.match(out(m), /Đã bán/);
  assert.strictEqual(qtyOf(uid, it.id), 1);
  assert.strictEqual(goldOf(uid), unitOf(it.id));
});

test('%sell lẻ nhỏ (<1,000 vàng) vẫn bán ngay, không hỏi', async () => {
  const uid = newPlayer(0);
  player.addItem(uid, 'iron_ore', 3); // 12 vàng/món
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['iron_ore', '2'], '%');
  assert.match(out(m), /Đã bán/);
  assert.doesNotMatch(out(m), /Xác nhận/);
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 1);
  assert.strictEqual(goldOf(uid), unitOf('iron_ore') * 2);
});

test('%sell all ≥1,000 vàng: chưa bán gì, hiện preview + số món/tổng tiền', async () => {
  const it = expensiveItem();
  const uid = newPlayer(0);
  player.addItem(uid, it.id, 3);
  player.addItem(uid, 'iron_ore', 5);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all'], '%');
  const t = out(m);

  assert.match(t, /Xác nhận bán/, t);
  assert.match(t, /sell all confirm/, 'phải chỉ đúng cú pháp xác nhận');
  assert.strictEqual(qtyOf(uid, it.id), 3, 'đã bán mất đồ khi chưa xác nhận');
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 5);
  assert.strictEqual(goldOf(uid), 0);
});

test('%sell all confirm: bán thật đúng tổng tiền', async () => {
  const it = expensiveItem();
  const uid = newPlayer(0);
  player.addItem(uid, it.id, 2);
  player.addItem(uid, 'iron_ore', 4);

  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all', 'confirm'], '%');
  assert.match(out(m), /Đã bán/);
  assert.strictEqual(qtyOf(uid, it.id), 0);
  assert.strictEqual(qtyOf(uid, 'iron_ore'), 0);
  assert.strictEqual(goldOf(uid), unitOf(it.id) * 2 + unitOf('iron_ore') * 4);
});

test('%sell all confirm: "confirm" không bị hiểu thành filter', async () => {
  const it = expensiveItem();
  const uid = newPlayer(0);
  player.addItem(uid, it.id, 1);
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all', 'confirm'], '%');
  assert.doesNotMatch(out(m), /Không hiểu filter/);
  assert.strictEqual(qtyOf(uid, it.id), 0);
});

test('%sell all <filter> ≥1,000: xác nhận giữ đúng filter khi gõ lại', async () => {
  const weapon = db.prepare(
    `SELECT id FROM items WHERE type='weapon' AND soulbound=0 AND min_level<=1
       AND COALESCE(NULLIF(sell,0), price/3) >= 1000 LIMIT 1`).get();
  const uid = newPlayer(0);
  if (!weapon) {
    // Không có vũ khí đắt sẵn → dùng món đắt bất kỳ, filter theo loại của nó
    const it = expensiveItem();
    player.addItem(uid, it.id, 1);
    const type = db.prepare('SELECT type FROM items WHERE id=?').get(it.id).type;
    const filterArg = { material: 'mat', consumable: 'potion', accessory: 'acc' }[type] || type;
    const m = fakeMessage(uid);
    await shopCmd.sell.execute(m, ['all', filterArg], '%');
    const t = out(m);
    assert.match(t, new RegExp(`sell all ${filterArg} confirm`), t);
    assert.strictEqual(qtyOf(uid, it.id), 1, 'chưa xác nhận đã bán');
    await shopCmd.sell.execute(m, ['all', filterArg, 'confirm'], '%');
    assert.strictEqual(qtyOf(uid, it.id), 0, 'xác nhận rồi vẫn chưa bán');
    return;
  }
  player.addItem(uid, weapon.id, 2);
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['all', 'weapon'], '%');
  assert.match(out(m), /sell all weapon confirm/, out(m));
  assert.strictEqual(qtyOf(uid, weapon.id), 2);
});

test('%sell junk nhỏ không cần xác nhận; junk lớn thì có', async () => {
  const uid = newPlayer(0);
  player.addItem(uid, 'iron_ore', 2);
  const m = fakeMessage(uid);
  await shopCmd.sell.execute(m, ['junk'], '%');
  assert.match(out(m), /Đã bán/);
  assert.doesNotMatch(out(m), /Xác nhận/);

  const uid2 = newPlayer(0);
  player.addItem(uid2, 'iron_ore', 200); // 200×12 = 2,400 vàng
  const m2 = fakeMessage(uid2);
  await shopCmd.sell.execute(m2, ['junk'], '%');
  assert.match(out(m2), /Xác nhận bán/);
  assert.strictEqual(qtyOf(uid2, 'iron_ore'), 200);
  await shopCmd.sell.execute(m2, ['junk', 'confirm'], '%');
  assert.strictEqual(qtyOf(uid2, 'iron_ore'), 0);
  assert.strictEqual(goldOf(uid2), 2400);
});

// ─────────────────────────────────────────────────────────────
// %pet collection — tự phân trang khi admin thêm pet
// ─────────────────────────────────────────────────────────────
test('%pet collection: 28 pet thật vẫn 1 trang (không đổi trải nghiệm)', async () => {
  const uid = newPlayer();
  player.updatePlayer(uid, { level: 50 });
  let payload = null;
  await petCmd.renderCollection({ userId: uid, page: 0, replyFn: (p) => { payload = p; } });
  const e = payload.embeds[0].data;
  assert.ok((e.fields || []).length > 0, 'mất nhóm theo khí hậu');
  assert.ok(!payload.components || payload.components.length === 0, 'danh sách ngắn không nên có nút');
  const size = JSON.stringify(e).length;
  assert.ok(size < 5900, `embed ${size} ký tự`);
});

test('%pet collection: admin thêm nhiều pet → tự phân trang, không mất pet nào', async () => {
  const uid = newPlayer();
  player.updatePlayer(uid, { level: 50 });
  const ins = db.prepare(`INSERT INTO pets (id,name,icon,tier,desc,atk_bonus,def_bonus,hp_bonus,habitat,created_by,created_at,hidden)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ids = [];
  for (let i = 0; i < 120; i++) {
    const id = `t5_pet_${seq}_${i}`;
    ids.push(id);
    ins.run(id, `Test Pet ${i}`, '🐺', 'rare', 'Pet do admin tạo lúc chạy để đo giới hạn', i, i, i, 'forest', 'test', Date.now(), 0);
  }

  let first = null;
  await petCmd.renderCollection({ userId: uid, page: 0, replyFn: (p) => { first = p; } });
  const footer = first.embeds[0].data.footer.text;
  const totalPages = parseInt(footer.match(/Trang 1\/(\d+)/)[1]);
  assert.ok(totalPages >= 5, `chỉ ${totalPages} trang cho 148 pet`);
  assert.ok(first.components.length >= 1, 'thiếu nút lọc/điều hướng');

  const seen = new Set();
  for (let page = 0; page < totalPages; page++) {
    let payload = null;
    await petCmd.renderCollection({ userId: uid, page, replyFn: (p) => { payload = p; } });
    const e = payload.embeds[0].data;
    const size = JSON.stringify(e).length;
    assert.ok(size < 6000, `trang ${page + 1}: ${size} ký tự`);
    assert.ok((e.description || '').length <= 4096);
    for (const m of (e.description || '').matchAll(/`(t5_pet_\d+_\d+)`/g)) seen.add(m[1]);
  }
  assert.strictEqual(seen.size, ids.length, `chỉ thấy ${seen.size}/${ids.length} pet admin tạo`);

  // Nút bấm thật sự chuyển trang
  let got = null;
  await buttons.handle({
    customId: `page:n:petcol:${uid}:all:1`,
    user: { id: uid },
    update: async (p) => { got = p; },
    reply: async (p) => { got = p; },
    deferUpdate: async () => {},
  });
  assert.ok(got, 'bấm ▶ không có phản hồi (domain petcol chưa route)');
  assert.match(got.embeds[0].data.footer.text, /Trang 2\//);

  for (const id of ids) db.prepare('DELETE FROM pets WHERE id=?').run(id);
});

// ─────────────────────────────────────────────────────────────
// %ach list — không còn cắt im lặng ở 4000 ký tự
// ─────────────────────────────────────────────────────────────
test('%ach list: phân trang, mọi thành tựu đều xem được', async () => {
  const uid = newPlayer();
  const all = achievements.getAllAchievements();
  const userAch = new Set();
  let first = null;
  achCmd.renderAchList({ userId: uid, page: 0, all, userAch, hiddenCount: 0, replyFn: (p) => { first = p; } });
  const totalPages = parseInt(first.embeds[0].data.footer.text.match(/Trang 1\/(\d+)/)[1]);

  const seenIds = new Set();
  for (let page = 0; page < totalPages; page++) {
    let payload = null;
    achCmd.renderAchList({ userId: uid, page, all, userAch, hiddenCount: 0, replyFn: (p) => { payload = p; } });
    const d = payload.embeds[0].data;
    assert.ok(JSON.stringify(d).length < 6000, `trang ${page + 1} quá dài`);
    for (const m of (d.description || '').matchAll(/`([a-z0-9_]+)`/g)) seenIds.add(m[1]);
  }
  const visibleIds = all.filter(a => !a.hidden).map(a => a.id);
  const missing = visibleIds.filter(id => !seenIds.has(id));
  assert.deepStrictEqual(missing, [], `thành tựu không hiện ở trang nào: ${missing.slice(0, 3)}`);
});

test('%ach list: nút chuyển trang hoạt động (domain ach)', async () => {
  const uid = newPlayer();
  let got = null;
  await buttons.handle({
    customId: `page:n:ach:${uid}:all:1`,
    user: { id: uid },
    update: async (p) => { got = p; },
    reply: async (p) => { got = p; },
    deferUpdate: async () => {},
  });
  assert.ok(got, 'bấm ▶ ở %ach list không có phản hồi');
  assert.match(got.embeds[0].data.footer.text, /Trang 2\//);
});

// ─────────────────────────────────────────────────────────────
// %help — tách trang khi nội dung vượt ngưỡng
// ─────────────────────────────────────────────────────────────
test('%help hiện tại vẫn 1 trang (không đổi trải nghiệm)', async () => {
  const m = fakeMessage('HZ1');
  await helpCmd.execute(m, []);
  const t = out(m);
  assert.match(t, /Hướng dẫn lệnh/);
  assert.ok(t.length < helpCmd.HELP_SAFE_CHARS, `help đã dài ${t.length} — cần kiểm tra lại ngưỡng`);
});

test('%help: nội dung phình to thì renderHelpPage chia trang, không mất mục nào', async () => {
  const uid = 'HZ2';
  // Mô phỏng help tương lai: 40 mục
  const fake = Array.from({ length: 40 }, (_, i) => ({
    name: `📦 Mục ${i}`,
    lines: [
      `\`%cmd${i}\` mô tả lệnh số ${i} với phần giải thích dài để mô phỏng help phình to theo thời gian`,
      `\`%cmd${i} extra\` thêm tuỳ chọn và ví dụ sử dụng chi tiết cho người chơi mới`,
      `\`%cmd${i} more\` dòng thứ ba cũng dài tương tự để tổng vượt ngưỡng an toàn`,
    ],
  }));
  assert.ok(helpCmd.helpEmbedSize(fake) > helpCmd.HELP_SAFE_CHARS,
    'helpEmbedSize phải phát hiện nội dung vượt ngưỡng');

  // Trang render thật (18 mục hiện tại) vẫn hợp lệ ở mọi trang
  const seen = new Set();
  for (let page = 0; page < 10; page++) {
    let payload = null;
    await helpCmd.renderHelpPage({ userId: uid, page, replyFn: (p) => { payload = p; } });
    const d = payload.embeds[0].data;
    assert.ok(JSON.stringify(d).length < 6000, `trang ${page + 1} quá dài`);
    for (const m of (d.description || '').matchAll(/\*\*(.+?)\*\*/g)) seen.add(m[1]);
    const fm = /Trang (\d+)\/(\d+)/.exec(d.footer.text);
    if (Number(fm[1]) >= Number(fm[2])) break;
  }
  for (const name of ['👤 Nhân vật', '⚔️ Chiến đấu', '🐾 Pet', '🎁 Khác']) {
    assert.ok(seen.has(name), `thiếu mục ${name} khi phân trang help`);
  }
});

test('%help nút chuyển trang hoạt động (domain help)', async () => {
  const uid = 'HZ3';
  let got = null;
  await buttons.handle({
    customId: `page:n:help:${uid}:all:1`,
    user: { id: uid },
    member: { permissions: { has: () => false } },
    update: async (p) => { got = p; },
    reply: async (p) => { got = p; },
    deferUpdate: async () => {},
  });
  assert.ok(got, 'bấm ▶ ở %help không có phản hồi');
  assert.match(got.embeds[0].data.footer.text, /Trang 2\//);
});

// ─────────────────────────────────────────────────────────────
// Chống hồi quy chung: không embed nào vượt trần Discord
// ─────────────────────────────────────────────────────────────
test('các embed "danh sách" mới đều dưới trần Discord khi dữ liệu lớn', async () => {
  const uid = newPlayer(1000);
  player.updatePlayer(uid, { level: 60 });
  for (const it of db.prepare('SELECT id FROM items LIMIT 200').all()) player.addItem(uid, it.id, 99);

  const checks = [
    ['inv', require(`${ROOT}/src/commands/inventory`)],
    ['market', require(`${ROOT}/src/commands/market`)],
  ];
  for (const [name, cmd] of checks) {
    if (name === 'inv') {
      for (let page = 0; page < 30; page++) {
        let payload = null;
        await cmd.renderInventoryPage({ userId: uid, page, playerLevel: 60, replyFn: (p) => { payload = p; } });
        const d = payload.embeds[0].data;
        assert.ok(JSON.stringify(d).length < 6000, `%inv trang ${page + 1} quá dài`);
        const fm = /Trang (\d+)\/(\d+)/.exec(d.footer.text);
        if (Number(fm[1]) >= Number(fm[2])) break;
      }
    }
  }
});

// ─────────────────────────────────────────────────────────────
// Kho bang — danh sách KHÔNG giới hạn (trước đây làm cả lệnh throw)
// ─────────────────────────────────────────────────────────────
test('kho bang 250 loại item: phân trang, mọi món xem được, không throw', async () => {
  const guilds = require(`${ROOT}/src/game/guilds`);
  const guildCmd = require(`${ROOT}/src/commands/guild`);
  const uid = newPlayer(100000);
  player.updatePlayer(uid, { level: 20 });
  const created = guilds.createGuild(uid, 'VT9', 'Vault Test');
  assert.ok(created.ok, JSON.stringify(created));
  const gid = created.guild.id;

  const items = db.prepare('SELECT id FROM items LIMIT 250').all();
  const insVault = db.prepare('INSERT OR REPLACE INTO guild_vault (guild_id,item_id,qty) VALUES (?,?,?)');
  for (const it of items) insVault.run(gid, it.id, 5);

  const m = fakeMessage(uid);
  await guildCmd.execute(m, ['vault'], '%'); // trước đây throw ở setDescription
  const t = out(m);
  assert.match(t, /Kho \[VT9\]/);

  const guild = guilds.getPlayerGuild(uid);
  let totalPages = 1;
  const seen = new Set();
  for (let page = 0; page < 40; page++) {
    let payload = null;
    guildCmd.renderVaultPage({ userId: uid, guild, page, replyFn: (p) => { payload = p; } });
    const d = payload.embeds[0].data;
    assert.ok(JSON.stringify(d).length < 6000, `trang ${page + 1} quá dài`);
    for (const m2 of (d.description || '').matchAll(/`([a-z0-9_]+)`/g)) seen.add(m2[1]);
    const fm = /Trang (\d+)\/(\d+)/.exec(d.footer.text);
    totalPages = Number(fm[2]);
    if (Number(fm[1]) >= totalPages) break;
  }
  assert.ok(totalPages >= 10, `chỉ ${totalPages} trang cho 250 loại`);
  const missing = items.map(i => i.id).filter(id => !seen.has(id));
  assert.deepStrictEqual(missing, [], `món không hiện ở trang nào: ${missing.slice(0, 3)}`);

  let got = null;
  await buttons.handle({
    customId: `page:n:vault:${uid}:all:1`,
    user: { id: uid },
    update: async (p) => { got = p; },
    reply: async (p) => { got = p; },
    deferUpdate: async () => {},
  });
  assert.ok(got, 'bấm ▶ ở kho bang không có phản hồi');
  assert.match(got.embeds[0].data.footer.text, /Trang 2\//);
});

test('clipLines: không cắt giữa dòng và luôn báo số dòng còn lại', async () => {
  const { clipLines } = require(`${ROOT}/src/game/list_text`);
  const lines = Array.from({ length: 300 }, (_, i) => `dòng số ${i} — nội dung mô tả dài vừa phải`);
  const text = clipLines(lines, 1000);
  assert.ok(text.length <= 1000, `clipLines trả ${text.length} > 1000`);
  assert.match(text, /… còn \*\*\d+\*\* dòng nữa/);
  const kept = text.split('\n');
  // Mọi dòng giữ lại phải nguyên vẹn (không cụt giữa dòng)
  for (const l of kept.slice(0, -1)) {
    assert.match(l, /^dòng số \d+ — nội dung mô tả dài vừa phải$/, `dòng bị cắt cụt: "${l}"`);
  }
  // Số dòng bị bỏ phải khớp thông báo
  const reported = Number(text.match(/… còn \*\*(\d+)\*\* dòng nữa/)[1]);
  assert.strictEqual(reported, lines.length - (kept.length - 1));
});

test('clipLines: danh sách ngắn giữ nguyên, không thêm chú thích', async () => {
  const { clipLines } = require(`${ROOT}/src/game/list_text`);
  assert.strictEqual(clipLines(['a', 'b'], 100), 'a\nb');
  assert.strictEqual(clipLines([], 100), '');
});

test('admin list %craft admin list không cắt im lặng khi nhiều recipe', async () => {
  const craftCmd = require(`${ROOT}/src/commands/craft`);
  const uid = newPlayer();
  player.updatePlayer(uid, { level: 1 });
  const m = fakeMessage(uid, { admin: true });
  await craftCmd.execute(m, ['admin', 'list'], '%');
  const t = out(m);
  assert.ok(t.length > 0);
  // Nếu bị cắt thì phải có thông báo, không được cụt giữa dòng
  if (t.includes('…')) assert.match(t, /… còn \*\*\d+\*\* dòng nữa|…/);
  assert.doesNotMatch(t, /\.\.\.$/, 'kết thúc bằng "..." nghĩa là cắt im lặng');
});
