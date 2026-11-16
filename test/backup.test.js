const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createBackupService, execute } = require('../src/game/backup');
const logger = { log() {}, warn() {}, error() {} };

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
  const db = new Database(path.join(root, 'source.db'));
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE data (value TEXT); INSERT INTO data VALUES (\'committed in WAL\')');
  const directory = path.join(root, 'backups');
  const service = createBackupService({ db, directory, logger, ...options });
  t.after(async () => {
    await service.stop();
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { db, directory, service };
}

test('snapshot includes committed WAL data and restores as standalone SQLite', async t => {
  const { service, db } = await fixture(t);
  const result = await service.run();
  db.exec("INSERT INTO data VALUES ('after backup')");
  const restored = new Database(result.path, { readonly: true });
  try {
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(restored.prepare('SELECT * FROM data').all(), [{ value: 'committed in WAL' }]);
    assert.equal((await fs.stat(result.path)).mode & 0o777, 0o600);
  } finally { restored.close(); }
});

test('retention keeps only completed owned snapshots and does not touch unrelated files', async t => {
  const { service, directory } = await fixture(t, { keep: 2 });
  const first = await service.run();
  await fs.writeFile(path.join(directory, 'important.db'), 'leave me');
  await fs.writeFile(path.join(directory, 'unfinished.db.partial'), 'leave me');
  // Explicitly age the first snapshot to avoid filesystem timestamp ties.
  await fs.utimes(first.path, new Date(0), new Date(0));
  await service.run();
  await service.run();
  assert.equal((await service.list()).length, 2);
  await assert.rejects(fs.stat(first.path), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(directory, 'important.db'), 'utf8'), 'leave me');
  assert.ok(await fs.stat(path.join(directory, 'unfinished.db.partial')));
});

test('concurrent calls share one backup including Discord upload', async t => {
  const sent = [];
  const { service } = await fixture(t, { channelId: 'PRIVATE', client: {
    channels: { fetch: async id => {
      assert.equal(id, 'PRIVATE');
      return { isTextBased: () => true, send: async payload => sent.push(payload) };
    } },
  } });
  const one = service.run();
  const two = service.run();
  assert.equal(one, two);
  const result = await one;
  assert.equal(result.uploaded, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].files, [result.path]);
});

test('Discord failure retains usable local snapshot and reports partial success', async t => {
  const { service } = await fixture(t, { channelId: 'MISSING', client: {
    channels: { fetch: async () => { throw new Error('no permission'); } },
  } });
  const result = await service.run();
  assert.equal(result.uploaded, false);
  assert.match(result.uploadError, /no permission/);
  assert.ok(await fs.stat(result.path));
});

test('failed backup cleans partial file and does not prune existing backups', async t => {
  const { service, db, directory } = await fixture(t, { keep: 1 });
  const first = await service.run();
  db.backup = async partial => {
    await fs.writeFile(partial, 'incomplete');
    throw new Error('disk failure');
  };
  await assert.rejects(service.run(), /disk failure/);
  assert.deepEqual(await fs.readdir(directory), [first.name]);
});

test('scheduler skips fresh snapshots across restarts; backs up when older than 24h', async t => {
  const { service } = await fixture(t);
  await service.tick();
  const [first] = await service.list();
  await service.tick();
  assert.equal((await service.list()).length, 1);
  await fs.utimes(first.path, new Date(0), new Date(0));
  await service.tick();
  assert.equal((await service.list()).length, 2);
  await service.stop();
  await assert.rejects(service.run(), /đang tắt/);
});

test('guild admin cannot export global DB unless explicitly in ADMIN_IDS', async () => {
  const saved = process.env.ADMIN_IDS;
  process.env.ADMIN_IDS = 'BOT_OWNER';
  try {
    const replies = [];
    await execute({ author: { id: 'GUILD_ADMIN' }, reply: async p => replies.push(p) });
    assert.match(replies[0], /ADMIN_IDS/);
  } finally {
    if (saved === undefined) delete process.env.ADMIN_IDS;
    else process.env.ADMIN_IDS = saved;
  }
});

test('retention rejects invalid configuration', () => {
  assert.throws(() => createBackupService({ keep: 0 }), /BACKUP_KEEP/);
  assert.throws(() => createBackupService({ keep: NaN }), /BACKUP_KEEP/);
});
