const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const h = require('./harness');
const { ART, applyGatherArt } = require('../src/game/gather_art');
let db, player, jobs, commands, seq = 0;
const commandFor = { mining: 'mine', fishing: 'fish', foraging: 'gather' };
before(() => {
  h.quiet(); db = require('../src/db/database'); player = require('../src/game/player');
  jobs = require('../src/game/jobs'); commands = h.loadCommands(); h.loud();
});
function user(job) {
  const id = `GATHER_ART_${++seq}`; player.createPlayer(id, id);
  jobs.getJob(id, job); jobs.updateJob(id, job, { level: 50 });
  const tool = require('../src/game/job_tools').getToolsByJob(job)[0];
  if (tool) player.addItem(id, tool.item_id);
  return id;
}
function check(payload, zone) {
  assert.equal(payload.files.length, 1);
  assert.equal(payload.files[0].name, `gather-${zone}.png`);
  assert.equal(payload.embeds[0].data.image.url, `attachment://gather-${zone}.png`);
  assert.ok(fs.existsSync(payload.files[0].attachment));
  assert.ok(payload.components.length);
}
test('all 15 bundled profession images are compact valid landscape PNGs and map to real zones', () => {
  assert.equal(Object.values(ART).flat().length, 15);
  for (const [job, ids] of Object.entries(ART)) for (const id of ids) {
    const zone = db.prepare('SELECT * FROM gather_zones WHERE id=?').get(id);
    assert.equal(zone.job_type, job);
    const embed = { setImage(url) { this.url = url; } };
    const [file] = applyGatherArt(embed, zone);
    const bytes = fs.readFileSync(file.attachment);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.length < 1024 * 1024);
    assert.ok(bytes.readUInt32BE(16) > bytes.readUInt32BE(20));
    assert.equal(embed.url, `attachment://${file.name}`);
  }
});
test('unknown/custom/path-like IDs and mismatched jobs do not set images or produce file paths', () => {
  const embed = { setImage() { assert.fail('must not set an image'); } };
  for (const zone of [null, {}, { id: '../../.env', job_type: 'mining' },
    { id: 'stone_quarry', job_type: 'fishing' }, { id: 'custom', job_type: 'foraging' },
    { id: 'stone_quarry', job_type: '__proto__' }]) assert.deepEqual(applyGatherArt(embed, zone), []);
});
test('each explicit profession action attaches its own zone image without changing Again buttons', async () => {
  for (const [job, ids] of Object.entries(ART)) for (const id of ids) {
    const uid = user(job), msg = h.fakeMessage(uid); let payload;
    msg.reply = async p => { payload = p; return { id: 'REPLY' }; };
    await commands.get(commandFor[job]).execute(msg, [id]);
    check(payload, id);
    const decoded = require('../src/game/again_button').decodeCustomId(payload.components[0].components[0].data.custom_id);
    assert.deepEqual(decoded, { cmd: commandFor[job], userId: uid, args: [id] });
  }
});
test('automatic selection and actual Again handler send the correct image for all three professions', async () => {
  for (const job of Object.keys(ART)) {
    const uid = user(job), msg = h.fakeMessage(uid); let payload;
    msg.reply = async p => { payload = p; return { id: 'REPLY' }; };
    await commands.get(commandFor[job]).execute(msg, []);
    check(payload, ART[job].at(-1));
    jobs.updateJob(uid, job, { last_action: 0 });
    let repeated, edited = false;
    await require('../src/buttons').handle({
      customId: payload.components[0].components[0].data.custom_id,
      user: msg.author, member: msg.member, guild: msg.guild,
      client: { commands }, channel: { id: 'CHAN1', send: async p => { repeated = p; return { id: 'NEW' }; } },
      deferUpdate: async () => {}, message: { edit: async () => { edited = true; } },
    });
    check(repeated, ART[job].at(-1)); assert.ok(edited);
  }
});
test('lists and rejected actions stay lightweight, custom zones still give normal result embeds', async () => {
  for (const job of Object.keys(ART)) {
    const uid = user(job), cmd = commands.get(commandFor[job]), msg = h.fakeMessage(uid); let payload;
    msg.reply = async p => { payload = p; return { id: 'REPLY' }; };
    await cmd.execute(msg, ['list']); assert.equal(payload.files, undefined);
    assert.equal(payload.embeds[0].data.image, undefined);
    await cmd.execute(msg, ['does_not_exist']); assert.equal(typeof payload, 'string');
    const custom = `art_custom_${job}`;
    db.prepare('INSERT INTO gather_zones(id,job_type,name,icon,desc,min_job_level,cooldown_ms,base_xp) VALUES (?,?,?,\'🌱\',\'test\',1,30000,10)').run(custom, job, custom);
    await cmd.execute(msg, [custom]);
    assert.deepEqual(payload.files, []); assert.equal(payload.embeds[0].data.image, undefined);
    assert.ok(payload.components.length);
  }
});
