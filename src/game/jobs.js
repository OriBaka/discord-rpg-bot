// Job system: mining / fishing / cooking / crafting
// Mỗi nghề có level + XP riêng
const db = require('./../db/database');

const JOB_TYPES = ['mining', 'fishing', 'cooking', 'crafting'];

const JOB_INFO = {
  mining:   { name: 'Mining',   icon: '⛏️', desc: 'Đào mỏ lấy ore' },
  fishing:  { name: 'Fishing',  icon: '🎣', desc: 'Câu cá' },
  cooking:  { name: 'Cooking',  icon: '👨‍🍳', desc: 'Nấu món ăn buff' },
  crafting: { name: 'Crafting', icon: '⚒️', desc: 'Chế tạo vũ khí/giáp' },
};

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_jobs (
      user_id   TEXT NOT NULL,
      job_type  TEXT NOT NULL,
      level     INTEGER NOT NULL DEFAULT 1,
      xp        INTEGER NOT NULL DEFAULT 0,
      last_action INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, job_type)
    );
  `);
}

function xpToNext(level) {
  return Math.floor(50 * Math.pow(level, 1.5));
}

function getJob(userId, jobType) {
  let row = db.prepare('SELECT * FROM player_jobs WHERE user_id=? AND job_type=?').get(userId, jobType);
  if (!row) {
    db.prepare('INSERT INTO player_jobs (user_id, job_type) VALUES (?, ?)').run(userId, jobType);
    row = db.prepare('SELECT * FROM player_jobs WHERE user_id=? AND job_type=?').get(userId, jobType);
  }
  return row;
}

function getAllJobs(userId) {
  const result = {};
  for (const jt of JOB_TYPES) result[jt] = getJob(userId, jt);
  return result;
}

function updateJob(userId, jobType, fields) {
  getJob(userId, jobType); // ensure exists
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE player_jobs SET ${setClause} WHERE user_id = ? AND job_type = ?`)
    .run(...values, userId, jobType);
}

// Cộng XP cho job, trả về { level, levelsGained, xp, xpToNext }
function addJobXp(userId, jobType, xpGain) {
  const job = getJob(userId, jobType);
  let xp = job.xp + xpGain;
  let level = job.level;
  const lvlUps = [];

  while (xp >= xpToNext(level) && level < 100) {
    xp -= xpToNext(level);
    level += 1;
    lvlUps.push(level);
  }

  updateJob(userId, jobType, { xp, level });
  return { level, levelsGained: lvlUps, xp, xpToNext: xpToNext(level) };
}

function setCooldown(userId, jobType) {
  updateJob(userId, jobType, { last_action: Date.now() });
}

function getCooldownRemaining(userId, jobType, cooldownMs) {
  const job = getJob(userId, jobType);
  const elapsed = Date.now() - (job.last_action || 0);
  return Math.max(0, cooldownMs - elapsed);
}

// === BXH theo nghề ===
function getJobLeaderboard(jobType, limit = 10) {
  return db.prepare(`SELECT pj.user_id, pj.level, pj.xp, p.name
    FROM player_jobs pj
    JOIN players p ON p.user_id = pj.user_id
    WHERE pj.job_type = ?
    ORDER BY pj.level DESC, pj.xp DESC LIMIT ?`).all(jobType, limit);
}

module.exports = {
  JOB_TYPES, JOB_INFO,
  migrate, xpToNext,
  getJob, getAllJobs, updateJob,
  addJobXp, setCooldown, getCooldownRemaining,
  getJobLeaderboard,
}; 
