const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, fakeMessage, loadCommands } = require('./harness');
let db, book, player, commands;
before(() => { quiet(); db = require('../src/db/database'); player = require('../src/game/player'); book = require('../src/game/handbook'); commands = loadCommands(); loud(); });
test('handbook shows current coal rates, shop and recipe uses without mutating DB', () => {
  const before = db.prepare('SELECT total_changes() n').get().n;
  const r = book.lookup(db, 'coal');
  assert.ok(r.sources.some(s => s.includes('25 vàng')));
  assert.ok(r.sources.some(s => s.includes('55.0%') && s.includes('stone_quarry')));
  assert.ok(r.uses.some(s => s.includes('recipe_copper_ingot')));
  db.prepare("UPDATE shop SET price=29 WHERE item_id='coal'").run();
  assert.ok(book.lookup(db, 'coal').sources.some(s => s.includes('29 vàng')));
  db.prepare("UPDATE shop SET price=25 WHERE item_id='coal'").run();
  assert.equal(db.prepare('SELECT total_changes() n').get().n, before + 2);
});
test('search escapes wildcards/SQL and missing IDs do not invent sources', () => {
  assert.equal(book.lookup(db, 'NO_ITEM'), null);
  assert.equal(book.search(db, "' OR 1=1 --").length, 0);
  assert.equal(book.search(db, '%').length, 0);
  assert.ok(book.search(db, 'coal').some(i => i.id === 'coal'));
  assert.ok(book.lookup(db, 'story_watchers_mark').sources.some(s => s.includes('Chính tuyến')));
});
test('find handles usage, exact ID, ambiguous and missing results within embed limits', async () => {
  const msg = fakeMessage('FINDER');
  await commands.get('find').execute(msg, []); assert.match(msg._text(), /coal/);
  let payload; msg.reply = async p => { payload = p; };
  await commands.get('find').execute(msg, ['coal']);
  assert.match(payload.embeds[0].data.title, /Coal/);
  for (const field of payload.embeds[0].data.fields) assert.ok(field.value.length <= 1024);
  await commands.get('find').execute(msg, ['sword']); assert.match(payload.embeds[0].data.title, /Tìm vật phẩm/);
  await commands.get('find').execute(msg, ['NO_ITEM']); assert.match(payload.embeds[0].data.description, /Không tìm thấy/);
});
test('card renders real data to PNG with Vietnamese font, long names and custom appearance', async () => {
  const id = 'CARD_TEST'; player.createPlayer(id, 'Người Giữ Đèn ' + 'ấ'.repeat(100));
  player.updatePlayer(id, { gold: 30000, primary_class: 'magic' });
  const sinks = require('../src/game/gold_sinks'); sinks.purchase(id, 'jade'); sinks.equip(id, 'jade');
  const aura = require('../src/game/aura'); aura.roll(id); aura.resolve(id, true);
  const before = player.getPlayer(id);
  const { renderCard } = require('../src/game/profile_card');
  assert.equal(await renderCard('NO_PLAYER'), null);
  const png = await renderCard(id);
  assert.equal(png.subarray(1,4).toString(), 'PNG');
  const image = await require('@napi-rs/canvas').loadImage(png);
  assert.equal(image.width, 1000); assert.equal(image.height, 600);
  assert.deepEqual(player.getPlayer(id), before);
  let payload; const msg = fakeMessage(id); msg.reply = async p => { payload = p; };
  await commands.get('card').execute(msg); assert.equal(payload.files[0].name, 'profile-card.png');
  assert.ok(Buffer.isBuffer(payload.files[0].attachment));
});
test('slash commands reuse prefix handlers', () => {
  const defs = require('../src/slash/definitions').definitions;
  const find = defs.find(d => d.data.name === 'find');
  assert.equal(find.handler.cmdName, 'find');
  assert.deepEqual(find.handler.extractArgs({ options: { getString: () => 'coal' } }), ['coal']);
  assert.equal(defs.find(d => d.data.name === 'card').handler.cmdName, 'card');
});
