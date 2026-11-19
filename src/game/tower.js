// Watchtower is an isolated training challenge. Floors are NOT huntable monsters.
// Turns, settlement, progress and first-clear gold commit in one transaction.
const LIMIT = 15;
const EXPIRE_MS = 30 * 60 * 1000;
const LEVELS = [5, 7, 9, 12, 15, 18, 20, 23, 25, 28, 30, 33, 36, 40, 45];
const STATS = [
  [150, 18, 6], [220, 22, 10], [300, 27, 13], [400, 34, 16], [700, 42, 21],
  [800, 52, 24], [1000, 64, 29], [1250, 76, 34], [1500, 88, 38], [2400, 104, 48],
  [2600, 120, 56], [3000, 140, 64], [3500, 164, 76], [4200, 188, 88], [5200, 216, 108],
];
const NAMES = ['Bóng tuần đêm', 'Giáp gỗ chuyển động', 'Kẻ gõ cửa', 'Lính gác mù sương', 'Người giữ chuông',
  'Bóng hộ tống', 'Thợ săn trong gương', 'Kỵ binh tro', 'Kẻ mang đèn tắt', 'Người giữ lửa',
  'Giáp băng rạn', 'Bóng người phương bắc', 'Vệ binh sao tàn', 'Kẻ canh bình minh', 'Người giữ ngọn đèn cuối'];
const BADGES = { 5: 'Người nghe chuông', 10: 'Người giữ lửa', 15: 'Người giữ bình minh' };
const db = () => require('../db/database');
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS tower_progress (
    user_id TEXT PRIMARY KEY, highest INTEGER NOT NULL DEFAULT 0, reached_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS tower_runs (
    battle_id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, floor INTEGER NOT NULL,
    class_id TEXT NOT NULL, settled INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS tower_rewards (
    user_id TEXT NOT NULL, floor INTEGER NOT NULL, gold INTEGER NOT NULL, claimed_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,floor));
    CREATE INDEX IF NOT EXISTS idx_tower_runs_user ON tower_runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_tower_top ON tower_progress(highest DESC,reached_at,user_id);`);
}
function floorInfo(floor) {
  if (!Number.isInteger(floor) || floor < 1 || floor > LIMIT) return null;
  const [hp, atk, def] = STATS[floor - 1];
  return { floor, hp, atk, def, name: NAMES[floor - 1], boss: floor % 5 === 0,
    level: LEVELS[floor - 1], gold: 100 + floor * 40, badge: BADGES[floor] || '' };
}
function progress(user) {
  return db().prepare('SELECT * FROM tower_progress WHERE user_id=?').get(user) || { user_id: user, highest: 0, reached_at: 0 };
}
function active(user, now = Date.now()) {
  const row = db().prepare(`SELECT b.* FROM battles b JOIN tower_runs t ON t.battle_id=b.id
    WHERE t.user_id=? AND b.status='active' ORDER BY b.id DESC LIMIT 1`).get(user);
  if (row && now - row.updated_at * 1000 >= EXPIRE_MS) {
    db().transaction(() => {
      require('./battle').updateBattle(row.id, { status: 'timeout', winner: 'draw' });
      db().prepare('UPDATE tower_runs SET settled=1 WHERE battle_id=?').run(row.id);
    })();
    return null;
  }
  return row || null;
}
function start(user, requested, channel, now = Date.now()) {
  return db().transaction(() => {
    const p = require('./player').getPlayer(user);
    if (!p || !p.primary_class) return { error: 'Hãy tạo nhân vật và chọn class trước.' };
    const current = active(user, now);
    if (current) return { battle: current, resumed: true };
    const high = progress(user).highest;
    const floor = requested ?? Math.min(LIMIT, high + 1);
    const info = floorInfo(floor);
    if (!info || floor > high + 1) return { error: 'Tầng chưa mở hoặc không hợp lệ. Phải vượt lần lượt từ tầng 1.' };
    // Includes both sides of a PvP battle. No simultaneous turn-based sessions.
    if (db().prepare("SELECT 1 FROM battles WHERE (user_a=? OR user_b=?) AND status='active'").get(user, user)) return { error: 'Hãy kết thúc trận theo lượt đang có trước.' };
    const s = require('./player').getEffectiveStats(p);
    const id = require('./battle').createBattle({ mode: 'tower', channel_id: channel, user_a: user,
      is_elite: info.boss ? 2 : 0, hp_a: s.max_hp, max_hp_a: s.max_hp, base_max_hp_a: p.max_hp,
      atk_a: s.atk, def_a: s.def, hp_b: info.hp, max_hp_b: info.hp, atk_b: info.atk, def_b: info.def });
    db().prepare('INSERT INTO tower_runs(battle_id,user_id,floor,class_id) VALUES (?,?,?,?)').run(id, user, floor, p.primary_class);
    return { battle: require('./battle').getBattle(id) };
  })();
}
function run(id) { return db().prepare('SELECT * FROM tower_runs WHERE battle_id=?').get(id); }
function settle(id) {
  return db().transaction(() => {
    const r = run(id), b = require('./battle').getBattle(id);
    if (!r || !b || b.status === 'active' || r.settled) return { gold: 0 };
    db().prepare('UPDATE tower_runs SET settled=1 WHERE battle_id=? AND settled=0').run(id);
    if (b.status !== 'ended' || b.winner !== 'a') return { gold: 0 };
    const f = floorInfo(r.floor), now = Date.now();
    db().prepare(`INSERT INTO tower_progress(user_id,highest,reached_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET highest=excluded.highest,reached_at=excluded.reached_at
      WHERE excluded.highest>tower_progress.highest`).run(r.user_id, r.floor, now);
    const claim = db().prepare('INSERT OR IGNORE INTO tower_rewards(user_id,floor,gold,claimed_at) VALUES (?,?,?,?)').run(r.user_id, r.floor, f.gold, now);
    if (!claim.changes) return { gold: 0 };
    db().prepare('UPDATE players SET gold=gold+? WHERE user_id=?').run(f.gold, r.user_id);
    return { gold: f.gold, badge: f.badge };
  })();
}
function act(user, id, round, skillId, messageId, channelId) {
  return db().transaction(() => {
    const engine = require('./battle'), r = run(id), b = engine.getBattle(id);
    if (!r || !b || r.user_id !== user) return { error: 'Không phải trận Tháp của bạn.' };
    if (b.message_id !== messageId || b.channel_id !== channelId) return { error: 'Bảng cũ; dùng tower để mở lại trận hiện tại.' };
    if (b.status !== 'active' || b.round !== round || b.turn !== 'a') return { error: 'Lượt đã thay đổi hoặc trận đã kết thúc. Dùng tower để xem lại.' };
    if (!active(user)) return { error: 'Trận hết hạn sau 30 phút không thao tác; có thể thử lại miễn phí.' };
    const skill = require('./skills').getSkill(skillId);
    if (!skill || ['rage', 'roar'].includes(skillId) || (skill.class && skill.class !== r.class_id)) return { error: 'Kỹ năng không hợp lệ cho class lúc vào Tháp.' };
    const result = engine.processAction(b, 'a', skillId);
    if (result.error) return result;
    let updated = engine.getBattle(id);
    const log = [...result.log];
    if (updated.status === 'active') {
      const reply = engine.processAction(updated, 'b', engine.pickMobAction(updated));
      log.push(...(reply.log || []));
      updated = engine.getBattle(id);
    }
    if (updated.status === 'active' && updated.round >= 240) {
      engine.endBattle(id, 'draw', log);
      updated = engine.getBattle(id);
    }
    const reward = updated.status === 'active' ? { gold: 0 } : settle(id);
    // Never writes real HP, XP, drops, kill quests, guild XP, or death penalties.
    return { battle: updated, log, reward };
  })();
}
function top() {
  return db().prepare(`SELECT t.*,p.name FROM tower_progress t JOIN players p ON p.user_id=t.user_id
    WHERE highest>0 ORDER BY highest DESC,reached_at,user_id LIMIT 10`).all();
}
module.exports = { LIMIT, EXPIRE_MS, BADGES, migrate, floorInfo, progress, active, start, run, settle, act, top };
