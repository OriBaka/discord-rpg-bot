// PvP duel system
const db = require('./../db/database');

const DUEL_EXPIRE_MS = 60 * 1000;          // Lời mời expire sau 60s
const DUEL_COOLDOWN_MS = 5 * 60 * 1000;    // 5 phút giữa các duel

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS duels (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger   TEXT NOT NULL,
      defender     TEXT NOT NULL,
      gold_stake   INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined | done | expired
      winner       TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL,
      completed_at INTEGER NOT NULL DEFAULT 0
    );

    -- Stats PvP cho player
    CREATE TABLE IF NOT EXISTS pvp_stats (
      user_id   TEXT PRIMARY KEY,
      wins      INTEGER NOT NULL DEFAULT 0,
      losses    INTEGER NOT NULL DEFAULT 0,
      rating    INTEGER NOT NULL DEFAULT 1000,
      last_duel INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ===== CRUD =====
function getActiveDuel(userId) {
  // Tìm duel pending mà user là challenger hoặc defender
  return db.prepare(`SELECT * FROM duels
    WHERE (challenger = ? OR defender = ?) AND status = 'pending'
    AND (? - created_at) < ?
    ORDER BY id DESC LIMIT 1`)
    .get(userId, userId, Date.now(), DUEL_EXPIRE_MS);
}

function getDuelById(id) {
  return db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
}

function createDuel(challenger, defender, goldStake) {
  const r = db.prepare(`INSERT INTO duels (challenger, defender, gold_stake, created_at)
    VALUES (?,?,?,?)`).run(challenger, defender, goldStake, Date.now());
  return getDuelById(r.lastInsertRowid);
}

function setDuelStatus(id, status, winner = '') {
  db.prepare('UPDATE duels SET status = ?, winner = ?, completed_at = ? WHERE id = ?')
    .run(status, winner, Date.now(), id);
}

// ===== Stats =====
function getStats(userId) {
  let row = db.prepare('SELECT * FROM pvp_stats WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO pvp_stats (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM pvp_stats WHERE user_id = ?').get(userId);
  }
  return row;
}

// Elo-like rating update
function updateRating(winnerId, loserId) {
  const w = getStats(winnerId);
  const l = getStats(loserId);

  // Expected score (Elo formula)
  const expW = 1 / (1 + Math.pow(10, (l.rating - w.rating) / 400));
  const K = 32; // K-factor

  const newW = Math.round(w.rating + K * (1 - expW));
  const newL = Math.round(l.rating + K * (0 - (1 - expW)));

  db.prepare('UPDATE pvp_stats SET wins = wins + 1, rating = ?, last_duel = ? WHERE user_id = ?')
    .run(newW, Date.now(), winnerId);
  db.prepare('UPDATE pvp_stats SET losses = losses + 1, rating = ?, last_duel = ? WHERE user_id = ?')
    .run(Math.max(0, newL), Date.now(), loserId);

  return { winnerNewRating: newW, loserNewRating: Math.max(0, newL), change: newW - w.rating };
}

function getCooldownRemaining(userId) {
  const s = getStats(userId);
  return Math.max(0, DUEL_COOLDOWN_MS - (Date.now() - s.last_duel));
}

function getTopRated(limit = 10) {
  return db.prepare(`SELECT ps.*, p.name FROM pvp_stats ps
    JOIN players p ON p.user_id = ps.user_id
    WHERE ps.wins + ps.losses > 0
    ORDER BY ps.rating DESC LIMIT ?`).all(limit);
}

// ===== Combat simulator cho PvP =====
// Khác với hunt: cả 2 player có HP riêng, ATK/DEF dùng effective stats
function simulateDuel(p1, p2, stats1, stats2) {
  // p1, p2: player objects (có level, max_hp...)
  // stats1, stats2: { atk, def } effective (đã cộng trang bị + pet)
  let hp1 = p1.max_hp;
  let hp2 = p2.max_hp;
  const log = [];
  let round = 0;

  // Người có level cao hơn đánh trước; bằng nhau thì challenger trước
  let p1First = (p1.level >= p2.level);

  while (hp1 > 0 && hp2 > 0 && round < 30) {
    round++;
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    if (p1First) {
      const dmg = Math.max(1, stats1.atk - stats2.def + rand(-3, 4));
      hp2 -= dmg;
      log.push(`⚔️ ${p1.name} → ${p2.name}: **${dmg}** dmg (HP ${Math.max(0, hp2)})`);
      if (hp2 <= 0) break;
      const dmg2 = Math.max(1, stats2.atk - stats1.def + rand(-3, 4));
      hp1 -= dmg2;
      log.push(`💥 ${p2.name} → ${p1.name}: **${dmg2}** dmg (HP ${Math.max(0, hp1)})`);
    } else {
      const dmg = Math.max(1, stats2.atk - stats1.def + rand(-3, 4));
      hp1 -= dmg;
      log.push(`⚔️ ${p2.name} → ${p1.name}: **${dmg}** dmg (HP ${Math.max(0, hp1)})`);
      if (hp1 <= 0) break;
      const dmg2 = Math.max(1, stats1.atk - stats2.def + rand(-3, 4));
      hp2 -= dmg2;
      log.push(`💥 ${p1.name} → ${p2.name}: **${dmg2}** dmg (HP ${Math.max(0, hp2)})`);
    }
  }

  let winnerId;
  if (hp1 > hp2) winnerId = p1.user_id;
  else if (hp2 > hp1) winnerId = p2.user_id;
  else winnerId = p1.user_id; // hòa → challenger thắng nhẹ

  return { winnerId, hp1: Math.max(0, hp1), hp2: Math.max(0, hp2), rounds: round, log };
}

module.exports = {
  DUEL_EXPIRE_MS, DUEL_COOLDOWN_MS,
  migrate,
  getActiveDuel, getDuelById, createDuel, setDuelStatus,
  getStats, updateRating, getCooldownRemaining, getTopRated,
  simulateDuel,
}; 
