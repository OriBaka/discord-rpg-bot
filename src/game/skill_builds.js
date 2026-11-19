// Per-class loadouts; unlocks are automatic and free. No skill currency/respec tax.
const MAX_SLOTS = 4;
function db() { return require('../db/database'); }
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS skill_loadouts (
    user_id TEXT NOT NULL, class_id TEXT NOT NULL, skills TEXT NOT NULL,
    PRIMARY KEY(user_id,class_id));`);
}
function unlocked(cls, level, user = null) { return require('./skills').getSkillsForClass(cls).filter(s => level >= s.level && (!s.book || (user && require('./skill_tomes').knows(user, s.id)))); }
function get(user, cls, level) {
  const allowed = unlocked(cls, level, user).map(s => s.id);
  const row = db().prepare('SELECT skills FROM skill_loadouts WHERE user_id=? AND class_id=?').get(user, cls);
  let ids;
  try { ids = row ? JSON.parse(row.skills) : allowed.slice(0, MAX_SLOTS); } catch { ids = []; }
  const filtered = [...new Set(Array.isArray(ids) ? ids : [])].filter(id => allowed.includes(id)).slice(0, MAX_SLOTS);
  return filtered.length ? filtered : allowed.slice(0, MAX_SLOTS);
}
function set(user, cls, level, ids) {
  const allowed = unlocked(cls, level, user).map(s => s.id);
  if (!ids.length || ids.length > MAX_SLOTS || new Set(ids).size !== ids.length || ids.some(id => !allowed.includes(id))) return { error: 'Chọn 1–4 kỹ năng khác nhau đã mở của class hiện tại.' };
  db().prepare(`INSERT INTO skill_loadouts(user_id,class_id,skills) VALUES (?,?,?)
    ON CONFLICT(user_id,class_id) DO UPDATE SET skills=excluded.skills`).run(user, cls, JSON.stringify(ids));
  return { skills: ids };
}
function reset(user, cls) { db().prepare('DELETE FROM skill_loadouts WHERE user_id=? AND class_id=?').run(user, cls); }
module.exports = { MAX_SLOTS, migrate, unlocked, get, set, reset };
