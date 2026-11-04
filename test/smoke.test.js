// Smoke test: mọi lệnh phải chạy được (không throw) với dữ liệu hợp lệ.
// Mục đích: bắt lỗi dây chuyền khi sửa logic dùng chung (player/slots/trade).
const { test, before } = require('node:test');
const assert = require('node:assert');
const { ROOT, loadCommands, fakeMessage, quiet, loud } = require('./harness');

let db, player, slots, classes, cmds;
const USER = 'SMOKE';
const OTHER = 'SMOKE2';

before(() => {
  quiet();
  db = require(`${ROOT}/src/db/database`);
  player = require(`${ROOT}/src/game/player`);
  slots = require(`${ROOT}/src/game/slots`);
  classes = require(`${ROOT}/src/game/classes`);
  cmds = loadCommands();

  for (const uid of [USER, OTHER]) {
    player.createPlayer(uid, uid.toLowerCase());
    classes.unlockClass(uid, 'melee');
    classes.setPrimaryClass(uid, 'melee');
    player.updatePlayer(uid, { gold: 100000, level: 20 });
  }
  player.addItem(USER, 'wood_sword', 3);
  player.addItem(USER, 'potion_s', 5);
  player.addItem(USER, 'slime_gel', 5);
  loud();
});

// [tên lệnh, args]
const CASES = [
  ['help', []], ['me', []], ['inv', []], ['inv', ['weapon']], ['gear', []],
  ['top', []], ['top', ['guild']], ['shop', []], ['info', ['help']],
  ['info', ['item', 'wood_sword']], ['info', ['mob', 'slime']], ['info', ['zone', 'forest']],
  ['quest', []], ['ach', []], ['ach', ['top']], ['pet', []], ['pet', ['collection']],
  ['job', []], ['class', []], ['class', ['list']], ['guild', []],
  ['craft', ['list']], ['cook', ['list']], ['compare', ['wood_sword', 'rusty_dagger']],
  ['item', ['help']], ['mob', ['help']], ['admin', ['help']], ['redeem', ['help']],
  ['lootbox', ['help']], ['setimage', ['help']], ['mine', ['list']], ['fish', ['list']],
  ['gatherzone', ['list']], ['daily', []], ['use', ['potion_s']], ['equip', ['wood_sword']],
  ['unequip', ['weapon']], ['buy', ['potion_s', '2']], ['sell', ['slime_gel', '1']],
  ['duel', ['top']], ['trade', ['help']], ['battle', ['list']], ['slashadmin', ['help']],
  ['petrestore', []], ['achdebug', []], ['hunt', ['list']],
];

for (const [name, args] of CASES) {
  test(`lệnh !${name} ${args.join(' ')} chạy không lỗi`, async () => {
    const cmd = cmds.get(name);
    assert.ok(cmd, `không tìm thấy lệnh ${name}`);
    const msg = fakeMessage(USER, { admin: true, mention: { id: OTHER, username: 'other' } });
    await assert.doesNotReject(
      () => cmd.execute(msg, args),
      `!${name} ${args.join(' ')} bị throw`
    );
  });
}

test('bán món đang mặc / equip bình thường không phá dữ liệu người chơi', async () => {
  const uid = 'CONSIST';
  player.createPlayer(uid, 'consist');
  classes.unlockClass(uid, 'melee');
  classes.setPrimaryClass(uid, 'melee');
  player.addItem(uid, 'wood_sword', 1);
  await cmds.get('equip').execute(fakeMessage(uid), ['wood_sword']);
  const p = player.getPlayer(uid);
  assert.strictEqual(slots.getEquipped(uid).weapon, 'wood_sword');
  assert.ok(p.hp >= 0 && p.hp <= p.max_hp, 'HP phải nằm trong [0, max_hp]');
});
