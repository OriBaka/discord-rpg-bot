const { randomInt } = require('node:crypto');
const COST = 2500;
const COOLDOWN = 2000;
const TIERS = [
  { id: 'common', chance: 60, min: 1, max: 3 },
  { id: 'rare', chance: 28, min: 4, max: 6 },
  { id: 'epic', chance: 10, min: 7, max: 9 },
  { id: 'legendary', chance: 2, min: 10, max: 12 },
];
function db() { return require('../db/database'); }
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS player_aura (
    user_id TEXT PRIMARY KEY,
    active_stat TEXT, active_tier TEXT, active_percent INTEGER,
    pending_stat TEXT, pending_tier TEXT, pending_percent INTEGER,
    rolls INTEGER NOT NULL DEFAULT 0, gold_spent INTEGER NOT NULL DEFAULT 0,
    last_roll INTEGER NOT NULL DEFAULT 0
  )`);
}
function get(user) { return db().prepare('SELECT * FROM player_aura WHERE user_id=?').get(user) || null; }
function generate(rng = randomInt) {
  let ticket = rng(100);
  let tier;
  for (const t of TIERS) { if (ticket < t.chance) { tier = t; break; } ticket -= t.chance; }
  if (!tier) throw new Error('Invalid aura random result');
  return { stat: rng(2) === 0 ? 'atk' : 'def', tier: tier.id, percent: tier.min + rng(tier.max - tier.min + 1) };
}
function roll(user, now = Date.now(), rng = randomInt) {
  return db().transaction(() => {
    const player = db().prepare('SELECT gold FROM players WHERE user_id=?').get(user);
    if (!player) return { error: 'Bạn chưa có nhân vật.' };
    const state = get(user);
    if (state && now - state.last_roll < COOLDOWN) return { error: 'Đợi 2 giây giữa hai lượt roll.' };
    if (player.gold < COST) return { error: `Cần ${COST} vàng cho mỗi lượt.` };
    const candidate = generate(rng);
    db().prepare('UPDATE players SET gold=gold-? WHERE user_id=?').run(COST, user);
    db().prepare(`INSERT INTO player_aura (user_id,pending_stat,pending_tier,pending_percent,rolls,gold_spent,last_roll)
      VALUES (?,?,?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET
      pending_stat=excluded.pending_stat,pending_tier=excluded.pending_tier,pending_percent=excluded.pending_percent,
      rolls=rolls+1,gold_spent=gold_spent+excluded.gold_spent,last_roll=excluded.last_roll`)
      .run(user, candidate.stat, candidate.tier, candidate.percent, COST, now);
    db().prepare('INSERT INTO gold_sink_log (user_id,kind,target,amount,created_at) VALUES (?,?,?,?,?)')
      .run(user, 'aura', `${candidate.tier}:${candidate.stat}:${candidate.percent}`, COST, now);
    return { candidate };
  })();
}
function resolve(user, accept) {
  return db().transaction(() => {
    const state = get(user);
    if (!state?.pending_stat) return { error: 'Không có aura chờ. Roll trước.' };
    if (accept) db().prepare('UPDATE player_aura SET active_stat=pending_stat,active_tier=pending_tier,active_percent=pending_percent WHERE user_id=?').run(user);
    db().prepare('UPDATE player_aura SET pending_stat=NULL,pending_tier=NULL,pending_percent=NULL WHERE user_id=?').run(user);
    return {};
  })();
}
function bonus(user, atk, def) {
  const aura = get(user);
  if (!aura?.active_stat) return { atk: 0, def: 0 };
  return { atk: aura.active_stat === 'atk' ? Math.floor(atk * aura.active_percent / 100) : 0,
    def: aura.active_stat === 'def' ? Math.floor(def * aura.active_percent / 100) : 0 };
}
function top() {
  return db().prepare(`SELECT p.name,a.active_stat,a.active_tier,a.active_percent FROM player_aura a
    JOIN players p ON p.user_id=a.user_id WHERE a.active_stat IS NOT NULL
    ORDER BY a.active_percent DESC,a.user_id LIMIT 10`).all();
}
module.exports = { COST, COOLDOWN, TIERS, migrate, get, generate, roll, resolve, bonus, top };
