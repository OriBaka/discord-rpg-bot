const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, loadCommands, fakeMessage } = require('./harness');
let db, player, sinks, guilds, cmds, seq = 0;
before(() => {
  quiet(); db = require('../src/db/database'); player = require('../src/game/player');
  sinks = require('../src/game/gold_sinks'); guilds = require('../src/game/guilds'); cmds = loadCommands(); loud();
});
function user(gold = 100000) {
  const id = `SINK_${++seq}`; player.createPlayer(id, id); player.updatePlayer(id, { gold, level: 5 }); return id;
}
const gold = id => player.getPlayer(id).gold;
function guild(id) { return guilds.createGuild(id, `S${seq}`, `Sink Guild ${seq}`).guild; }

test('cosmetics charge once, ownership required, equip/reset free, stats unchanged', () => {
  const id = user(); const before = player.getPlayer(id);
  assert.ok(sinks.equip(id, 'jade').error);
  assert.equal(sinks.purchase(id, 'jade').spent, 1500);
  assert.ok(sinks.purchase(id, 'jade').error);
  assert.equal(gold(id), before.gold - 1500);
  assert.deepEqual(sinks.equip(id, 'jade'), {});
  assert.equal(sinks.appearance(id).color.color, 0x1ABC9C);
  sinks.purchase(id, 'wanderer'); sinks.equip(id, 'wanderer');
  assert.equal(sinks.appearance(id).title.name, 'Người Lữ Hành');
  sinks.equip(id, 'default_color');
  assert.equal(sinks.appearance(id).color, undefined);
  assert.ok(sinks.appearance(id).title);
  assert.equal(player.getPlayer(id).atk, before.atk);
  assert.ok(sinks.purchase(id, '__proto__').error);
  assert.ok(sinks.purchase(user(0), 'gold').error);
});

test('building contribution caps current tier, excludes treasury and preserves buffs', () => {
  const id = user(); const g = guild(id); const before = gold(id); const buffs = guilds.getBuffs(g);
  const r = sinks.contribute(id, 'hall', 999999);
  assert.equal(r.spent, 5000); assert.equal(r.complete, true);
  assert.equal(gold(id), before - 5000);
  assert.equal(guilds.getGuild(g.id).gold, 0);
  assert.deepEqual(guilds.getBuffs(guilds.getGuild(g.id)), buffs);
  const hall = sinks.buildings(g.id).find(b => b.id === 'hall');
  assert.equal(hall.level, 1); assert.equal(hall.funded, 0);
  assert.equal(sinks.contribute(id, 'hall', 1000).complete, false);
  assert.equal(sinks.buildings(g.id).find(b => b.id === 'hall').funded, 1000);
});

test('contributions reject outsiders, unsafe values, invalid targets and insufficient funds', () => {
  const outsider = user(); assert.ok(sinks.contribute(outsider, 'hall', 1).error);
  const id = user(); guild(id);
  for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.ok(sinks.contribute(id, 'hall', amount).error);
  assert.ok(sinks.contribute(id, '__proto__', 1).error);
  player.updatePlayer(id, { gold: 0 }); assert.ok(sinks.contribute(id, 'hall', 1).error);
});

test('members share progress; max level stops charging; disband removes buildings', () => {
  const id = user(1000000); const g = guild(id); const member = user();
  db.prepare('INSERT INTO guild_members (user_id,guild_id,role,joined_at) VALUES (?,?,?,?)').run(member, g.id, 'member', Date.now());
  assert.equal(sinks.contribute(member, 'library', 100).spent, 100);
  assert.equal(sinks.contribute(id, 'library', 999999).spent, 4900);
  sinks.contribute(id, 'library', 999999); sinks.contribute(id, 'library', 999999);
  const before = gold(id); assert.ok(sinks.contribute(id, 'library', 1).error); assert.equal(gold(id), before);
  guilds.disbandGuild(id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM guild_buildings WHERE guild_id=?').get(g.id).n, 0);
});

test('failed ledger write rolls back purchase and contribution', () => {
  const id = user(); guild(id); const before = gold(id);
  db.exec("CREATE TRIGGER fail_sink BEFORE INSERT ON gold_sink_log BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  try {
    assert.throws(() => sinks.purchase(id, 'jade'), /test failure/);
    assert.throws(() => sinks.contribute(id, 'hall', 100), /test failure/);
  } finally { db.exec('DROP TRIGGER fail_sink'); }
  assert.equal(gold(id), before); assert.ok(sinks.equip(id, 'jade').error);
  assert.equal(sinks.buildings(guilds.getPlayerGuild(id).id)[0].funded, 0);
});

test('commands require confirmation and show purchased appearance on profile', async () => {
  const id = user(); const msg = fakeMessage(id); const before = gold(id);
  await cmds.get('me').execute(msg, ['buy', 'jade']); assert.equal(gold(id), before);
  await cmds.get('me').execute(msg, ['buy', 'jade', 'confirm']);
  await cmds.get('me').execute(msg, ['equip', 'jade']);
  let payload; msg.reply = async p => { payload = p; };
  await cmds.get('me').execute(msg, []); assert.equal(payload.embeds[0].data.color, 0x1ABC9C);
  guild(id); const after = gold(id);
  await cmds.get('guild').execute(msg, ['building', 'contribute', 'hall', '100']); assert.equal(gold(id), after);
});

test('market existing 5% tax is charged once and persisted; old rows remain unknown', () => {
  const market = require('../src/game/market'); const seller = user(); const buyer = user();
  player.addItem(seller, 'wolf_fang', 2);
  const listing = market.createListing(seller, 'wolf_fang', 101, 2).listing;
  const initial = gold(seller) + gold(buyer);
  const result = market.buy(buyer, listing.id, 1);
  assert.equal(result.tax, 6); assert.equal(result.payout, 95);
  assert.equal(gold(seller) + gold(buyer), initial - 6);
  const row = db.prepare('SELECT tax,payout FROM market_sales WHERE buyer_id=?').get(buyer);
  assert.deepEqual(row, { tax: 6, payout: 95 });
  assert.ok(market.buy(seller, listing.id, 1).error);
  const count = db.prepare('SELECT COUNT(*) n FROM market_sales WHERE buyer_id=?').get(buyer).n;
  assert.equal(count, 1);
});

test('slash options preserve purchase and contribution confirmation', () => {
  const defs = require('../src/slash/definitions').definitions;
  const me = defs.find(d => d.data.name === 'me');
  assert.deepEqual(me.handler.extractArgs({ options: {
    getString: k => ({ action: 'buy', id: 'jade' }[k]), getBoolean: () => true,
  } }), ['buy', 'jade', 'confirm']);
  const g = defs.find(d => d.data.name === 'guild');
  assert.deepEqual(g.handler.extractArgs({ options: {
    getSubcommand: () => 'building', getString: () => 'hall', getInteger: () => 100, getBoolean: () => false,
  } }), ['building', 'contribute', 'hall', '100', '']);
});

test('migration rerun preserves purchases, selections and partial building funding', () => {
  const id = user(); const g = guild(id);
  sinks.purchase(id, 'rose'); sinks.equip(id, 'rose'); sinks.contribute(id, 'hall', 123);
  const before = gold(id); sinks.migrate(); require('../src/game/market').migrate();
  assert.equal(gold(id), before); assert.equal(sinks.appearance(id).color.color, 0xE91E63);
  assert.equal(sinks.buildings(g.id)[0].funded, 123); assert.ok(sinks.purchase(id, 'rose').error);
});

test('market tiny sales round tax up; cancellation takes no tax', () => {
  const market = require('../src/game/market'); const seller = user(), buyer = user();
  player.addItem(seller, 'wolf_fang', 2);
  const listing = market.createListing(seller, 'wolf_fang', 1, 2).listing;
  const before = gold(seller);
  const r = market.buy(buyer, listing.id, 1);
  assert.equal(r.tax, 1); assert.equal(r.payout, 0);
  market.cancel(seller, listing.id);
  assert.equal(gold(seller), before);
  assert.equal(db.prepare('SELECT SUM(tax) n FROM market_sales WHERE seller_id=?').get(seller).n, 1);
});
