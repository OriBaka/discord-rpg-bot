// Source-backed skill acquisition. Learning and event quota consumption are atomic.
const db = () => require('../db/database');
const bookId = skill => `tome_${skill}`;
const catalog = () => Object.values(require('./skills').SKILLS).filter(s => s.book);
function fromBook(id) { return catalog().find(s => bookId(s.id) === id) || null; }
function knows(user, skill) { return !!db().prepare('SELECT 1 FROM learned_skills WHERE user_id=? AND skill_id=?').get(user, skill); }
function migrate(retry = true) {
  db().exec(`CREATE TABLE IF NOT EXISTS learned_skills (
    user_id TEXT NOT NULL, skill_id TEXT NOT NULL, learned_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,skill_id));
    CREATE TABLE IF NOT EXISTS skill_events (
    guild_id TEXT NOT NULL, id TEXT NOT NULL, skill_id TEXT NOT NULL, ends_at INTEGER NOT NULL,
    max_claims INTEGER NOT NULL, claims INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL, PRIMARY KEY(guild_id,id));
    CREATE TABLE IF NOT EXISTS skill_event_claims (
    guild_id TEXT NOT NULL, event_id TEXT NOT NULL, user_id TEXT NOT NULL, claimed_at INTEGER NOT NULL,
    PRIMARY KEY(guild_id,event_id,user_id));`);
  if (!db().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='quests'").get()) {
    if (retry) setTimeout(() => { if (db().open) migrate(false); }, 0);
    return;
  }
  db().transaction(() => {
    if (db().prepare('SELECT 1 FROM meta WHERE key=?').get('skill_tomes_v1')) return;
    for (const s of catalog()) {
      const id = bookId(s.id), src = s.source;
      const tier = s.level < 18 ? 'common' : s.level < 30 ? 'rare' : s.level < 40 ? 'epic' : 'legendary';
      db().prepare(`INSERT INTO items(id,name,type,tier,price,sell,desc,min_level,class_req,soulbound)
        VALUES (?,?,'consumable',?,?,0,?,?,?,?)`).run(id, `📜 Tome: ${s.name}`, tier, src.price || 0,
        `Bí kíp ${s.name}, học vĩnh viễn bằng use ${id}; cần ${s.class} Lv.${s.level}. Không phải bình máu.`, s.level, s.class, src.kind === 'event' ? 1 : 0);
      if (src.kind === 'shop') db().prepare('INSERT INTO shop(item_id,price) VALUES (?,?)').run(id, src.price);
      if (['hunt', 'boss'].includes(src.kind)) {
        if (!db().prepare('SELECT 1 FROM monsters WHERE id=?').get(src.mob)) throw new Error(`Missing tome source: ${src.mob}`);
        db().prepare('INSERT INTO monster_drops(monster_id,item_id,chance,qty) VALUES (?,?,?,1)').run(src.mob, id, src.chance);
      }
      if (src.kind === 'quest') db().prepare(`INSERT INTO quests
        (id,type,name,desc,objective,target_id,target_qty,reward_item,created_by,created_at)
        VALUES (?,'custom',?,?,'kill',?,?,?,'system',?)`).run(`study_${s.id}`, `Học thuật: ${s.name}`,
        `Nhận quest rồi thắng ${src.qty} ${src.mob}; nhận bí kíp cho ${s.class} Lv.${s.level}.`, src.mob, src.qty, `${id}:1`, Date.now());
    }
    db().prepare('INSERT INTO meta(key,value) VALUES (?,?)').run('skill_tomes_v1', '1');
  })();
}
function learn(user, item) {
  return db().transaction(() => {
    const s = fromBook(item), p = require('./player').getPlayer(user);
    if (!s || !p) return { error: 'Bí kíp hoặc nhân vật không tồn tại.' };
    if (p.primary_class !== s.class) return { error: `Bí kíp dành cho ${s.class}; không mất vật phẩm.` };
    if (p.level < s.level) return { error: `Cần Lv.${s.level}; hãy giữ bí kíp, chưa mất vật phẩm.` };
    if (knows(user, s.id)) return { error: 'Bạn đã học kỹ năng này; không mất bí kíp trùng.' };
    const player = require('./player');
    if (!player.removeItem(user, item, 1)) return { error: 'Bạn không sở hữu bí kíp này.' };
    db().prepare('INSERT INTO learned_skills(user_id,skill_id,learned_at) VALUES (?,?,?)').run(user, s.id, Date.now());
    return { skill: s };
  })();
}
function sourceText(s) {
  if (!s.book) return `Tự mở miễn phí ở Lv.${s.level || 1}.`;
  const src = s.source, id = bookId(s.id);
  if (src.kind === 'quest') return `quest accept study_${s.id} → thắng ${src.qty} ${src.mob} → quest claim study_${s.id}`;
  if (src.kind === 'shop') return `buy ${id} · ${src.price} vàng`;
  if (src.kind === 'hunt') return `hunt ${src.mob} · tỷ lệ gốc ${src.chance * 100}%`;
  if (src.kind === 'boss') return `battle ${src.mob} hoặc hunt ${src.mob} · tỷ lệ gốc ${src.chance * 100}%`;
  return 'Sự kiện giới hạn (limited) do admin mở · skills events. Chưa mở sự kiện thì chưa có nguồn thường trực.';
}
function createEvent(guild, id, skill, hours, max, admin, now = Date.now()) {
  const s = require('./skills').getSkill(skill);
  if (!guild || !/^[a-zA-Z0-9_-]{1,40}$/.test(id || '') || !s?.book || s.source.kind !== 'event' || !Number.isInteger(hours) || hours < 1 || hours > 720 || !Number.isInteger(max) || max < 1 || max > 100000) return { error: 'Sai sự kiện: ID 1–40 ký tự chữ/số/_/-, chiêu limited, 1–720 giờ, 1–100000 suất.' };
  if (db().prepare('SELECT 1 FROM skill_events WHERE guild_id=? AND id=?').get(guild, id)) return { error: 'ID sự kiện đã dùng; không thể tạo lại để reset lượt nhận.' };
  db().prepare('INSERT INTO skill_events(guild_id,id,skill_id,ends_at,max_claims,created_by) VALUES (?,?,?,?,?,?)').run(guild, id, skill, now + hours * 3600000, max, admin);
  return { ok: true };
}
function closeEvent(guild, id) { return db().prepare('UPDATE skill_events SET closed=1 WHERE guild_id=? AND id=?').run(guild, id).changes; }
function events(guild) { return db().prepare('SELECT id,skill_id,ends_at,max_claims,claims,closed FROM skill_events WHERE guild_id=? ORDER BY ends_at DESC LIMIT 12').all(guild); }
function claimEvent(guild, id, user, now = Date.now()) {
  return db().transaction(() => {
    const e = db().prepare('SELECT * FROM skill_events WHERE guild_id=? AND id=?').get(guild, id);
    const p = require('./player').getPlayer(user);
    if (!e || e.closed || now >= e.ends_at || e.claims >= e.max_claims) return { error: 'Sự kiện không có, đã đóng/hết hạn hoặc hết suất.' };
    const s = require('./skills').getSkill(e.skill_id);
    if (!p || p.primary_class !== s.class) return { error: `Cần class ${s.class} để nhận. Có thể giữ sách tới đủ cấp mới học.` };
    if (knows(user, s.id)) return { error: 'Bạn đã học chiêu này, không cần nhận thêm suất.' };
    const claim = db().prepare('INSERT OR IGNORE INTO skill_event_claims(guild_id,event_id,user_id,claimed_at) VALUES (?,?,?,?)').run(guild, id, user, now);
    if (!claim.changes) return { error: 'Bạn đã nhận sự kiện này.' };
    db().prepare('UPDATE skill_events SET claims=claims+1 WHERE guild_id=? AND id=?').run(guild, id);
    require('./player').addItem(user, bookId(s.id), 1);
    return { item: bookId(s.id) };
  })();
}
module.exports = { catalog, bookId, fromBook, knows, migrate, learn, sourceText, createEvent, closeEvent, events, claimEvent };
