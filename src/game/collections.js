const db = () => require('../db/database');
const MILESTONES = [
  { kind: 'fish', id: 'collection_rare_fish', title: 'Người Đọc Sóng', points: 50 },
  { kind: 'gather', id: 'collection_rare_gather', title: 'Người Nghe Rừng', points: 50 },
  { kind: 'all', id: 'collection_rare_all', title: 'Kẻ Theo Dấu Thiên Nhiên', points: 100 },
];
function complete(user, kind) {
  if (!['fish', 'gather', 'all'].includes(kind)) return false;
  const items = (kind === 'all' ? [...catalog('fish'), ...catalog('gather')] : catalog(kind)).filter(i => i.rare);
  return items.length === (kind === 'all' ? 10 : 5) && items.every(i => has(user, i.id));
}
const JOBS = { fish: 'fishing', gather: 'foraging' };
function catalog(kind) {
  if (!Object.hasOwn(JOBS, kind)) return [];
  const job = JOBS[kind];
  const items = new Map();
  for (const row of db().prepare(`SELECT i.id,i.name,z.id zone,z.name zone_name FROM gather_drops d
    JOIN gather_zones z ON z.id=d.zone_id JOIN items i ON i.id=d.item_id WHERE z.job_type=? ORDER BY z.min_job_level,i.id`).all(job)) {
    if (!items.has(row.id)) items.set(row.id, { id: row.id, name: row.name, sources: [], rare: null });
    items.get(row.id).sources.push(row.zone_name);
  }
  for (const r of require('./weather_rares').RARES) {
    const zone = db().prepare('SELECT name,job_type FROM gather_zones WHERE id=?').get(r.zone);
    if (zone?.job_type === job) items.set(r.id, { id: r.id, name: r.name, sources: [zone.name], rare: r });
  }
  return [...items.values()];
}
function has(user, item) {
  return Boolean(db().prepare('SELECT 1 FROM player_collections WHERE user_id=? AND item_id=?').get(user, item));
}
function record(user, item, qty) {
  if (!Number.isSafeInteger(qty) || qty <= 0) return false;
  const rare = require('./weather_rares').RARES.some(r => r.id === item);
  if (!rare && !db().prepare("SELECT 1 FROM gather_drops d JOIN gather_zones z ON z.id=d.zone_id WHERE d.item_id=? AND z.job_type IN ('fishing','foraging') LIMIT 1").get(item)) return false;
  return Boolean(db().prepare('INSERT OR IGNORE INTO player_collections(user_id,item_id,discovered_at) VALUES (?,?,?)').run(user, item, Date.now()).changes);
}
function list(user, kind) {
  const found = new Map(db().prepare('SELECT item_id,discovered_at FROM player_collections WHERE user_id=?').all(user).map(r => [r.item_id, r.discovered_at]));
  return catalog(kind).map(i => ({ ...i, discovered_at: found.get(i.id) || null }));
}
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS player_collections (
    user_id TEXT NOT NULL, item_id TEXT NOT NULL, discovered_at INTEGER NOT NULL,
    PRIMARY KEY(user_id,item_id));`);
  const ach = db().prepare(`INSERT OR IGNORE INTO achievements
    (id,name,desc,icon,objective,target_id,target_qty,points) VALUES (?,?,?,'🏆','collection_discovery',?,1,15)`);
  for (const r of require('./weather_rares').RARES) ach.run(`first_${r.id}`, `Lần đầu: ${r.name}`, `Lần đầu nhận ${r.name} từ bất kỳ nguồn nào. Dấu sưu tập vẫn giữ sau khi bán hoặc dùng hết.`, r.id);
  const milestone = db().prepare(`INSERT OR IGNORE INTO achievements
    (id,name,desc,icon,objective,target_id,target_qty,points,title) VALUES (?,?,?,'🏅','collection_rare_complete',?,1,?,?)`);
  for (const m of MILESTONES) milestone.run(m.id, m.title, `Hoàn thành bộ ${m.kind === 'all' ? '10/10' : '5/5'} vật phẩm hiếm ${m.kind}. Chỉ vinh danh, không tăng chỉ số.`, m.kind, m.points, m.title);
  db().transaction(() => {
    if (db().prepare("SELECT 1 FROM meta WHERE key='collections_backfill_v1'").get()) return;
    const insert = db().prepare(`INSERT OR IGNORE INTO player_collections(user_id,item_id,discovered_at)
      SELECT inv.user_id,inv.item_id,? FROM inventory inv JOIN players p ON p.user_id=inv.user_id WHERE inv.item_id=? AND inv.qty>0`);
    for (const id of new Set(['fish', 'gather'].flatMap(k => catalog(k).map(i => i.id)))) insert.run(Date.now(), id);
    // Only grant these new, points-only achievements, not unrelated existing rewards.
    const achievements = require('./achievements');
    for (const r of require('./weather_rares').RARES) for (const row of db().prepare('SELECT user_id FROM player_collections WHERE item_id=?').all(r.id)) achievements.grantAchievement(row.user_id, `first_${r.id}`);
    db().prepare("INSERT INTO meta(key,value) VALUES ('collections_backfill_v1','1')").run();
  })();
  db().transaction(() => {
    if (db().prepare("SELECT 1 FROM meta WHERE key='collection_milestones_v1'").get()) return;
    for (const row of db().prepare('SELECT DISTINCT c.user_id FROM player_collections c JOIN players p ON p.user_id=c.user_id').all()) {
      for (const m of MILESTONES) if (complete(row.user_id, m.kind)) require('./achievements').grantAchievement(row.user_id, m.id);
    }
    db().prepare("INSERT INTO meta(key,value) VALUES ('collection_milestones_v1','1')").run();
  })();
}
function reset(user) {
  const stats = require('./achievements').getPlayerStats(user);
  if (MILESTONES.some(m => m.title === stats.current_title)) require('./achievements').updatePlayerStats(user, { current_title: '' });
  db().prepare('DELETE FROM player_collections WHERE user_id=?').run(user);
  const points = db().prepare(`SELECT COALESCE(SUM(a.points),0) n FROM player_achievements p JOIN achievements a ON a.id=p.achievement_id WHERE p.user_id=? AND a.objective IN ('collection_discovery','collection_rare_complete')`).get(user).n;
  db().prepare('UPDATE player_stats SET ach_points=MAX(0,ach_points-?) WHERE user_id=?').run(points, user);
  db().prepare("DELETE FROM player_achievements WHERE user_id=? AND achievement_id IN (SELECT id FROM achievements WHERE objective IN ('collection_discovery','collection_rare_complete'))").run(user);
}
module.exports = { MILESTONES, complete, JOBS, catalog, has, record, list, migrate, reset };
