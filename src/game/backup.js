// SQLite Online Backup API includes committed WAL data; never copy a live .db.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const DAY = 24 * 60 * 60 * 1000;
const NAME = /^rpg-backup-\d{4}-\d{2}-\d{2}T[\d-]+Z-[\da-f-]+\.db$/;

function createBackupService({ db, directory, keep = 7, channelId = '', client, logger = console }) {
  if (!Number.isInteger(keep) || keep < 1 || keep > 100) throw new Error('BACKUP_KEEP phải từ 1 đến 100');
  let active = null;
  let timer = null;
  let stopped = false;

  async function list() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const files = await fs.readdir(directory);
    const entries = await Promise.all(files.filter(n => NAME.test(n)).map(async name => ({
      name, path: path.join(directory, name), ...(await fs.stat(path.join(directory, name))),
    })));
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  }

  async function perform() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const name = `rpg-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.db`;
    const destination = path.join(directory, name);
    const partial = destination + '.partial';
    try {
      await db.backup(partial);
      await fs.chmod(partial, 0o600);
      const Database = require('better-sqlite3');
      const check = new Database(partial, { fileMustExist: true });
      try {
        // A standalone snapshot must not depend on WAL sidecars. Changing only
        // the snapshot's journal mode also removes temporary -wal/-shm files.
        check.pragma('journal_mode = DELETE');
        if (check.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Snapshot không vượt qua quick_check');
      } finally { check.close(); }
      await fs.rename(partial, destination);
    } catch (err) {
      await Promise.all([partial, partial + '-wal', partial + '-shm', partial + '-journal']
        .map(file => fs.rm(file, { force: true }).catch(() => {})));
      throw err;
    }
    // Only prune completed snapshots after a new valid snapshot exists.
    const entries = await list();
    for (const old of entries.filter(entry => entry.name !== name).slice(keep - 1)) await fs.unlink(old.path);
    const result = { name, path: destination, uploaded: false, uploadError: null };
    if (channelId) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('Kênh backup không gửi được file');
        const size = (await fs.stat(destination)).size;
        const limit = channel.guild?.maximumFileSize || 10 * 1024 * 1024;
        if (size > limit) throw new Error('File vượt giới hạn đính kèm Discord; hãy tải bản local và lưu ngoài Railway');
        await channel.send({ content: `💾 RPG backup: ${name}`, files: [destination], allowedMentions: { parse: [] } });
        result.uploaded = true;
      } catch (err) {
        result.uploadError = err.message;
        logger.error('[backup upload] Bản local vẫn được giữ:', err);
      }
    }
    logger.log(`[backup] ${name}; Discord: ${result.uploaded ? 'OK' : 'chưa gửi'}`);
    return result;
  }

  function run() {
    if (stopped) return Promise.reject(new Error('Bot đang tắt'));
    // Serialize manual + scheduled requests, including upload/pruning.
    if (!active) active = perform().finally(() => { active = null; });
    return active;
  }

  async function tick() {
    try {
      if (stopped) return;
      const entries = await list();
      if (!entries.length || Date.now() - entries[0].mtimeMs >= DAY) await run();
    } catch (err) { logger.error('[backup]', err); }
  }

  function start() {
    if (timer || stopped) return;
    if (!channelId) logger.warn('[backup] Chỉ backup local. Set BACKUP_CHANNEL_ID để có bản ngoài Railway volume.');
    void tick();
    timer = setInterval(() => { void tick(); }, 60 * 60 * 1000);
    timer.unref();
  }

  async function stop() {
    stopped = true;
    clearInterval(timer);
    await active;
  }

  return { run, list, start, stop, tick };
}

let service;
function getService(client) {
  if (!service) {
    const db = require('../db/database');
    service = createBackupService({
      db, client,
      directory: process.env.BACKUP_DIR || path.join(path.dirname(db.name), 'backups'),
      keep: Number(process.env.BACKUP_KEEP || 7),
      channelId: process.env.BACKUP_CHANNEL_ID || '',
    });
  }
  return service;
}

async function execute(msg, args = []) {
  // DB is global, not guild-scoped: guild administrators must NOT export it.
  const owners = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!owners.includes(msg.author.id)) return msg.reply('🚫 Backup toàn bot chỉ dành cho người trong ADMIN_IDS.');
  if (args.length && args[0] !== 'now') return msg.reply('💾 Dùng %adm backup để tạo backup ngay. File chỉ gửi vào BACKUP_CHANNEL_ID, không gửi tại đây.');
  try {
    const result = await getService(msg.client).run();
    return msg.reply(`✅ Đã tạo backup local: ${result.name}\n` + (result.uploaded
      ? 'Đã gửi thêm vào kênh backup riêng.'
      : result.uploadError ? '⚠️ Gửi Discord thất bại; xem log Railway. Bản local vẫn còn.' : '⚠️ Chưa set BACKUP_CHANNEL_ID; hiện chỉ có bản trên volume.'));
  } catch (err) {
    console.error('[backup manual]', err);
    return msg.reply('❌ Backup thất bại. Xem log Railway để kiểm tra.');
  }
}

module.exports = { createBackupService, getService, execute };
