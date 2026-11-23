const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./harness');
let db, p, c, a, commands, n = 0;
before(() => { h.quiet(); db = require('../src/db/database'); p = require('../src/game/player'); c = require('../src/game/collections'); a = require('../src/game/achievements'); commands = h.loadCommands(); h.loud(); });
function user() { const id = `COL_QOL_${++n}`; p.createPlayer(id, id); return id; }
function fill(id, kind) { for (const item of c.catalog(kind).filter(i => i.rare)) p.addItem(id, item.id); }
test('5/5 fish, 5/5 gather and 10/10 grant points and collectible titles once, with no combat/currency bonuses', async () => {
  const id = user(), before = p.getPlayer(id);
  fill(id, 'fish');
  assert.ok(a.hasUnlocked(id, 'collection_rare_fish'));
  assert.ok(!a.hasUnlocked(id, 'collection_rare_all'));
  fill(id, 'gather');
  assert.ok(c.MILESTONES.every(m => a.hasUnlocked(id, m.id)));
  assert.equal(a.getPlayerStats(id).ach_points, 350);
  fill(id, 'fish'); assert.equal(a.getPlayerStats(id).ach_points, 350);
  assert.deepEqual(p.getPlayer(id), before);
  const msg = h.fakeMessage(id); await commands.get('collection').execute(msg, ['title', 'all']);
  assert.equal(a.getPlayerStats(id).current_title, 'Kẻ Theo Dấu Thiên Nhiên');
  c.reset(id); assert.equal(a.getPlayerStats(id).ach_points, 0); assert.equal(a.getPlayerStats(id).current_title, '');
  const other = h.fakeMessage(user()); await commands.get('collection').execute(other, ['title', 'fish']); assert.match(other._text(), /Chưa mở/);
});
test('new milestone migration backfills lifetime discoveries only once', () => {
  const id = user(); fill(id, 'fish');
  db.prepare("DELETE FROM player_achievements WHERE user_id=? AND achievement_id='collection_rare_fish'").run(id);
  a.updatePlayerStats(id, { ach_points: 75 });
  db.prepare("DELETE FROM meta WHERE key='collection_milestones_v1'").run();
  c.migrate(); assert.ok(a.hasUnlocked(id, 'collection_rare_fish')); assert.equal(a.getPlayerStats(id).ach_points, 125);
  c.migrate(); assert.equal(a.getPlayerStats(id).ach_points, 125);
});
test('all collection filters and buttons render fresh state and reject other users', async () => {
  const id = user(); p.addItem(id, 'fish_carp');
  const cmd = commands.get('collection'), payloads = [], msg = h.fakeMessage(id);
  msg.reply = async x => { payloads.push(x); };
  await cmd.execute(msg, ['fish', 'owned']);
  let data = payloads.at(-1).embeds[0].data;
  assert.match(data.description, /fish_carp/); assert.doesNotMatch(data.description, /⬜/);
  await cmd.execute(msg, ['fish', 'missing']); assert.doesNotMatch(payloads.at(-1).embeds[0].data.description, /fish_carp/);
  await cmd.execute(msg, ['fish', 'rare']); assert.match(payloads.at(-1).embeds[0].data.description, /Hiếm/);
  await cmd.execute(msg, ['fish']);
  const payload = payloads.at(-1), next = payload.components.at(-1).components.at(-1).data.custom_id;
  const buttons = require('../src/buttons'); let updated, denied;
  await buttons.handle({ customId: next, user: { id: 'OTHER' }, reply: async x => { denied = x; } });
  assert.ok(denied.ephemeral);
  await buttons.handle({ customId: next, user: { id }, update: async x => { updated = x; } });
  assert.match(updated.embeds[0].data.footer.text, /Trang 2/);
  const owned = payload.components[0].components.find(b => b.data.label === 'Đã có').data.custom_id;
  p.addItem(id, 'fish_small');
  await buttons.handle({ customId: owned, user: { id }, update: async x => { updated = x; } });
  assert.match(updated.embeds[0].data.description, /fish_small/);
  assert.match(updated.embeds[0].data.footer.text, /Trang 1/);
});
test('weather availability names exactly eligible rares, gives commands and explains empty conditions', () => {
  const rares = require('../src/game/weather_rares');
  for (const weather of Object.keys(require('../src/game/world_weather').WEATHER)) for (const period of ['day', 'night']) {
    const text = rares.availableText({ weather, period });
    assert.ok(text.length < 1800);
    for (const r of rares.RARES) assert.equal(text.includes(r.name), r.weather === weather && r.period === period);
    if (!rares.RARES.some(r => r.weather === weather && r.period === period)) assert.match(text, /Chưa có/);
  }
});
