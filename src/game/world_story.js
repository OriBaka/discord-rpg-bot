// Foundation only: Chapter 4 cannot be scheduled until real content is published in code.
const CONTENT = Object.freeze({ chapter4: Object.freeze({ id: 'chapter4', title: 'Chương 4 — Lịch sử chung', ready: false }) });
const NOTICE_MS = 24 * 60 * 60 * 1000;
function migrate() {
  const db = require('../db/database');
  db.exec(`CREATE TABLE IF NOT EXISTS world_story_chapters (
    id TEXT PRIMARY KEY, definition TEXT NOT NULL, opens_at INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('scheduled','awaiting_choice','resolved','cancelled')),
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
    winner_id TEXT, winner_name TEXT, finished_at INTEGER, choice_id TEXT, resolved_at INTEGER);
    CREATE TABLE IF NOT EXISTS world_story_progress (
      chapter_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
      step INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(chapter_id,user_id));
    CREATE TABLE IF NOT EXISTS world_story_events (
      chapter_id TEXT NOT NULL, user_id TEXT NOT NULL, event_id TEXT NOT NULL,
      kind TEXT NOT NULL, target TEXT NOT NULL, amount INTEGER NOT NULL, happened_at INTEGER NOT NULL,
      PRIMARY KEY(chapter_id,user_id,event_id));
    CREATE TABLE IF NOT EXISTS world_history (
      chapter_id TEXT PRIMARY KEY, chapter_title TEXT NOT NULL,
      winner_id TEXT NOT NULL, winner_name TEXT NOT NULL, finished_at INTEGER NOT NULL,
      choice_id TEXT NOT NULL, choice_label TEXT NOT NULL, consequence TEXT NOT NULL,
      decided_at INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS world_history_no_update BEFORE UPDATE ON world_history BEGIN SELECT RAISE(ABORT,'World history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS world_history_no_delete BEFORE DELETE ON world_history BEGIN SELECT RAISE(ABORT,'World history is immutable'); END;`);
}
function validDefinition(d) {
  return d?.ready === true && /^[a-z0-9_]{1,40}$/.test(d.id) && typeof d.title === 'string' && d.title.length > 0 && d.title.length <= 100
    && Array.isArray(d.steps) && d.steps.length >= 1 && d.steps.length <= 20
    && d.steps.every(s => ['kill','boss','gather','craft'].includes(s.kind) && typeof s.target === 'string' && s.target.length > 0 && s.target.length <= 80 && Number.isSafeInteger(s.qty) && s.qty >= 1 && s.qty <= 1000)
    && Array.isArray(d.choices) && d.choices.length >= 2 && d.choices.length <= 4
    && new Set(d.choices.map(c => c.id)).size === d.choices.length
    && d.choices.every(c => /^[a-z0-9_]{1,40}$/.test(c.id) && typeof c.label === 'string' && c.label.length > 0 && c.label.length <= 100 && typeof c.consequence === 'string' && c.consequence.length > 0 && c.consequence.length <= 1200);
}
// Dependency injection keeps synthetic race content confined to tests. Production uses CONTENT only.
function createService(db, content = CONTENT, clock = Date.now) {
  const fail = error => ({ error });
  const atomic = fn => db.transaction(fn).immediate();
  const read = id => db.prepare('SELECT * FROM world_story_chapters WHERE id=?').get(id);
  function eligible(user) {
    return Boolean(db.prepare('SELECT 1 FROM players p JOIN player_story s ON s.user_id=p.user_id WHERE p.user_id=? AND s.step>=28').get(user));
  }
  function state(id = 'chapter4') {
    const row = read(id);
    if (!row) return { id, status: 'locked', title: content[id]?.title || id };
    return { ...row, definition: JSON.parse(row.definition), phase: row.status === 'scheduled' && clock() >= row.opens_at ? 'active' : row.status };
  }
  function schedule(id, opensAt, actor) {
    return atomic(() => {
      const d = content[id];
      if (!Object.hasOwn(content, id) || !validDefinition(d) || d.id !== id) return fail('Chương chưa được phát hành nội dung; không thể lên lịch hoặc mở đua.');
      if (!Number.isSafeInteger(opensAt) || opensAt < clock() + NOTICE_MS) return fail('Phải công bố lịch trước ít nhất 24 giờ (giờ thật).');
      if (!actor) return fail('Thiếu người lập lịch.');
      for (const step of d.steps) {
        const exists = step.kind === 'kill' || step.kind === 'boss'
          ? db.prepare('SELECT elite_tier FROM monsters WHERE id=?').get(step.target)
          : step.kind === 'craft' ? db.prepare('SELECT 1 FROM recipes WHERE id=?').get(step.target)
            : db.prepare('SELECT 1 FROM gather_zones WHERE job_type=?').get(step.target);
        if (!exists || step.kind === 'boss' && !exists.elite_tier) return fail('Mục tiêu chưa có nguồn hành động hợp lệ; cần kiểm tra nội dung trước khi lập lịch.');
      }
      if (read(id)) return fail('Chương đã có lịch/hồ sơ; không được ghi đè hoặc mở lại.');
      if (db.prepare("SELECT 1 FROM world_story_chapters WHERE status IN ('scheduled','awaiting_choice')").get()) return fail('Còn chương đang chờ mở, đang đua hoặc chờ quyết định.');
      db.prepare("INSERT INTO world_story_chapters(id,definition,opens_at,status,created_by,created_at) VALUES (?,?,?,'scheduled',?,?)").run(id, JSON.stringify(d), opensAt, actor, clock());
      return state(id);
    });
  }
  function join(user, id = 'chapter4') {
    return atomic(() => {
      const row = read(id), now = clock();
      if (!row || row.status !== 'scheduled' || now < row.opens_at) return fail('Cuộc đua chưa mở hoặc đã kết thúc.');
      if (!eligible(user)) return fail('Cần hoàn tất Chương 3 cá nhân để tham gia.');
      db.prepare('INSERT OR IGNORE INTO world_story_progress(chapter_id,user_id,joined_at) VALUES (?,?,?)').run(id, user, now);
      return db.prepare('SELECT * FROM world_story_progress WHERE chapter_id=? AND user_id=?').get(id, user);
    });
  }
  // Trusted server hook only. No Discord/admin command accepts progress, event IDs or completion proofs.
  // Future integration MUST use stable IDs from successfully settled actions, not timestamps/retries.
  function record(user, id, eventId, kind, target, amount, occurredAt) {
    return atomic(() => {
      if (!Number.isSafeInteger(occurredAt) || !/^[a-zA-Z0-9:_-]{1,100}$/.test(eventId || '') || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000 || typeof target !== 'string' || target.length > 80 || !['kill','boss','gather','craft'].includes(kind)) return fail('Sự kiện không hợp lệ.');
      const row = read(id), now = clock();
      if (!row || row.status !== 'scheduled' || now < row.opens_at) return fail('Cuộc đua chưa mở hoặc đã có người về đích.');
      if (!eligible(user)) return fail('Chưa đủ điều kiện tham gia.');
      const progress = db.prepare('SELECT * FROM world_story_progress WHERE chapter_id=? AND user_id=?').get(id, user);
      if (!progress) return fail('Chưa tham gia cuộc đua.');
      if (occurredAt < row.opens_at || occurredAt < progress.joined_at || occurredAt > now) return fail('Sự kiện xảy ra ngoài thời gian hợp lệ.');
      const insert = db.prepare('INSERT OR IGNORE INTO world_story_events(chapter_id,user_id,event_id,kind,target,amount,happened_at) VALUES (?,?,?,?,?,?,?)').run(id, user, eventId, kind, target, amount, occurredAt);
      if (!insert.changes) return { duplicate: true };
      const d = JSON.parse(row.definition), step = d.steps[progress.step];
      if (!step || step.kind !== kind || step.target !== target) return { matched: false };
      const count = Math.min(step.qty, progress.progress + amount), done = count === step.qty;
      db.prepare('UPDATE world_story_progress SET step=?,progress=? WHERE chapter_id=? AND user_id=?').run(progress.step + (done ? 1 : 0), done ? 0 : count, id, user);
      if (done && progress.step + 1 === d.steps.length) {
        const name = db.prepare('SELECT name FROM players WHERE user_id=?').get(user).name;
        const win = db.prepare("UPDATE world_story_chapters SET status='awaiting_choice',winner_id=?,winner_name=?,finished_at=? WHERE id=? AND status='scheduled' AND winner_id IS NULL").run(user, name, now, id);
        if (!win.changes) throw new Error('Winner conflict; roll back event');
        return { winner: user, awaitingChoice: true };
      }
      return { matched: true, advanced: done };
    });
  }
  function choose(user, id, choiceId) {
    return atomic(() => {
      const row = read(id);
      if (!row || row.status !== 'awaiting_choice' || row.winner_id !== user) return fail('Chỉ người về đích đầu tiên được chốt lựa chọn, đúng một lần.');
      const d = JSON.parse(row.definition), choice = d.choices.find(c => c.id === choiceId);
      if (!choice) return fail('Chọn một hướng đã được thiết kế sẵn; không nhận nội dung tùy ý.');
      const now = clock();
      db.prepare('INSERT INTO world_history(chapter_id,chapter_title,winner_id,winner_name,finished_at,choice_id,choice_label,consequence,decided_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, d.title, user, row.winner_name, row.finished_at, choice.id, choice.label, choice.consequence, now);
      db.prepare("UPDATE world_story_chapters SET status='resolved',choice_id=?,resolved_at=? WHERE id=? AND status='awaiting_choice'").run(choice.id, now, id);
      return { choice: choice.id, consequence: choice.consequence };
    });
  }
  function history(limit = 5, offset = 0) { return db.prepare('SELECT * FROM world_history ORDER BY decided_at DESC,chapter_id LIMIT ? OFFSET ?').all(limit, offset); }
  return { state, eligible, schedule, join, record, choose, history };
}
let service;
function getService() { return service ||= createService(require('../db/database')); }
module.exports = { CONTENT, NOTICE_MS, migrate, validDefinition, createService, getService };
