// Per-class loadouts; unlocks are automatic and free. No skill currency/respec tax.
const MAX_SLOTS = 4;
function db() { return require('../db/database'); }
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS skill_loadouts (
    user_id TEXT NOT NULL, class_id TEXT NOT NULL, skills TEXT NOT NULL,
    PRIMARY KEY(user_id,class_id));
    CREATE TABLE IF NOT EXISTS skill_presets (
      user_id TEXT NOT NULL, class_id TEXT NOT NULL, name TEXT NOT NULL, skills TEXT NOT NULL,
      PRIMARY KEY(user_id,class_id,name));`);
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
function inBattle(user) { return Boolean(db().prepare("SELECT 1 FROM battles WHERE status='active' AND (user_a=? OR user_b=?)").get(user, user)); }
function presets(user, cls) { return db().prepare('SELECT name,skills FROM skill_presets WHERE user_id=? AND class_id=? ORDER BY name').all(user, cls); }
function preset(user, action, name) {
  return db().transaction(() => {
    const p = require('./player').getPlayer(user);
    if (!p?.primary_class) return { error: 'Hãy chọn class trước.' };
    if (inBattle(user)) return { error: 'Hãy kết thúc trận đang hoạt động trước khi sửa/đổi bộ chiêu.' };
    name = String(name || '').toLowerCase();
    if (!/^[a-z0-9_-]{1,20}$/.test(name)) return { error: 'Tên bộ chiêu 1–20 ký tự a-z, 0-9, _ hoặc - (ví dụ boss, tower, combo).' };
    const rows = presets(user, p.primary_class), row = rows.find(r => r.name === name);
    if (action === 'save') {
      if (!row && rows.length >= 3) return { error: 'Mỗi class lưu tối đa 3 bộ; xóa một bộ hoặc lưu đè tên cũ.' };
      const ids = get(user, p.primary_class, p.level);
      db().prepare('INSERT INTO skill_presets(user_id,class_id,name,skills) VALUES (?,?,?,?) ON CONFLICT(user_id,class_id,name) DO UPDATE SET skills=excluded.skills').run(user, p.primary_class, name, JSON.stringify(ids));
      return { skills: ids, name };
    }
    if (!row) return { error: 'Không có bộ chiêu này ở class hiện tại.' };
    if (action === 'delete') { db().prepare('DELETE FROM skill_presets WHERE user_id=? AND class_id=? AND name=?').run(user, p.primary_class, name); return { name }; }
    if (action !== 'load') return { error: 'Hành động không hợp lệ.' };
    let ids; try { ids = JSON.parse(row.skills); } catch { return { error: 'Bộ đã lưu không hợp lệ; hãy lưu lại.' }; }
    if (!Array.isArray(ids)) return { error: 'Bộ đã lưu không hợp lệ; hãy lưu lại.' };
    const result = set(user, p.primary_class, p.level, ids);
    return result.error ? result : { ...result, name };
  })();
}
module.exports = { MAX_SLOTS, inBattle, presets, preset, migrate, unlocked, get, set, reset };
