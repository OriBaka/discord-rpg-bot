const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ZONES, applyZoneArt } = require('../src/game/zone_art');
test('all nine bundled zone illustrations are valid compact PNG files', () => {
  assert.equal(ZONES.length, 9);
  for (const id of ZONES) {
    const embed = { setImage(url) { this.url = url; } };
    const files = applyZoneArt(embed, { id });
    assert.equal(embed.url, `attachment://zone-${id}.png`);
    assert.equal(files[0].name, `zone-${id}.png`);
    const data = fs.readFileSync(files[0].attachment);
    assert.equal(data.subarray(1,4).toString(), 'PNG');
    assert.ok(data.length < 1024 * 1024);
  }
});
test('unknown IDs cannot become paths; HTTPS admin overrides remain supported', () => {
  const embed = { setImage(url) { this.url = url; } };
  assert.deepEqual(applyZoneArt(embed, { id: '../../.env' }), []);
  assert.deepEqual(applyZoneArt(embed, { id: 'forest', image_url: 'https://example.com/custom.png' }), []);
  assert.equal(embed.url, 'https://example.com/custom.png');
});
test('zone replacement migration is one-time and info command attaches bundled art', async () => {
  const { quiet, loud, fakeMessage } = require('./harness');
  quiet(); const db = require('../src/db/database'); loud();
  const art = require('../src/game/zone_art');
  for (const id of ZONES) assert.equal(db.prepare('SELECT image_url FROM zones WHERE id=?').get(id).image_url, `attachment://zone-${id}.png`);
  db.prepare('UPDATE zones SET image_url=? WHERE id=?').run('https://example.com/custom.png', 'forest');
  art.migrate();
  assert.equal(db.prepare('SELECT image_url FROM zones WHERE id=?').get('forest').image_url, 'https://example.com/custom.png');
  const msg = fakeMessage('ZONE_VIEWER'); let payload;
  msg.reply = async p => { payload = p; };
  await require('../src/commands/info').execute(msg, ['zone', 'cave']);
  assert.equal(payload.files[0].name, 'zone-cave.png');
  assert.equal(payload.embeds[0].data.image.url, 'attachment://zone-cave.png');
});
