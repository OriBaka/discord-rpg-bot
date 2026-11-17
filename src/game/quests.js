// Quest system: daily / weekly / custom
const db = require('./../db/database');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL,           -- daily | weekly | custom
      name        TEXT NOT NULL,
      desc        TEXT NOT NULL DEFAULT '',
      objective   TEXT NOT NULL,           -- kill | gold | level | item | gather | craft | job_level | boss
      target_id   TEXT NOT NULL DEFAULT '', -- monster_id, item_id hoặc '' (bất kỳ)
      target_qty  INTEGER NOT NULL DEFAULT 1,
      reward_gold INTEGER NOT NULL DEFAULT 0,
      reward_xp   INTEGER NOT NULL DEFAULT 0,
      reward_item TEXT NOT NULL DEFAULT '',  -- format: "item_id:qty,item_id:qty"
      created_by  TEXT NOT NULL DEFAULT '',  -- 'system' | user_id của admin
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_quests (
      user_id      TEXT NOT NULL,
      quest_id     TEXT NOT NULL,
      progress     INTEGER NOT NULL DEFAULT 0,
      claimed      INTEGER NOT NULL DEFAULT 0,
      assigned_at  INTEGER NOT NULL,
      claimed_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, quest_id)
    );
  `);
}

// === Quest CRUD ===
function getQuest(id) {
  return db.prepare('SELECT * FROM quests WHERE id = ?').get(id);
}

function getQuestsByType(type) {
  return db.prepare('SELECT * FROM quests WHERE type = ? ORDER BY created_at').all(type);
}

function getAllQuests() {
  return db.prepare('SELECT * FROM quests ORDER BY type, created_at').all();
}

function createQuest(data) {
  const now = Date.now();
  db.prepare(`INSERT INTO quests
    (id, type, name, desc, objective, target_id, target_qty, reward_gold, reward_xp, reward_item, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      data.id, data.type, data.name, data.desc || '',
      data.objective, data.target_id || '', data.target_qty || 1,
      data.reward_gold || 0, data.reward_xp || 0, data.reward_item || '',
      data.created_by || 'system', now
    );
  return getQuest(data.id);
}

function deleteQuest(id) {
  db.prepare('DELETE FROM player_quests WHERE quest_id = ?').run(id);
  return db.prepare('DELETE FROM quests WHERE id = ?').run(id).changes > 0;
}

// === Player progress ===
function getPlayerQuests(userId) {
  return db.prepare(`SELECT pq.*, q.* FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ?
    ORDER BY pq.assigned_at DESC`).all(userId);
}

function getPlayerQuest(userId, questId) {
  return db.prepare('SELECT * FROM player_quests WHERE user_id=? AND quest_id=?').get(userId, questId);
}

function assignQuest(userId, questId) {
  const exist = getPlayerQuest(userId, questId);
  if (exist) return false;
  db.prepare('INSERT INTO player_quests (user_id, quest_id, assigned_at) VALUES (?, ?, ?)')
    .run(userId, questId, Date.now());
  return true;
}

function updateProgress(userId, questId, progress) {
  db.prepare('UPDATE player_quests SET progress = ? WHERE user_id=? AND quest_id=?')
    .run(progress, userId, questId);
}

function markClaimed(userId, questId) {
  db.prepare('UPDATE player_quests SET claimed = 1, claimed_at = ? WHERE user_id=? AND quest_id=?')
    .run(Date.now(), userId, questId);
}

function removeQuestFromPlayer(userId, questId) {
  db.prepare('DELETE FROM player_quests WHERE user_id=? AND quest_id=?').run(userId, questId);
}

// === Event hooks (auto-track progress) ===
// Khi player giết quái → cập nhật quest 'kill'
function onKillMonster(userId, monsterId) {
  require('./story').onEvent(userId, 'kill', monsterId);
  const quests = db.prepare(`SELECT pq.*, q.* FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.objective = 'kill' AND pq.claimed = 0`).all(userId);
  for (const pq of quests) {
    // Nếu target_id rỗng = bất kỳ quái nào, hoặc khớp monster_id
    if (pq.target_id && pq.target_id !== monsterId) continue;
    const newProgress = Math.min(pq.progress + 1, pq.target_qty);
    updateProgress(userId, pq.quest_id, newProgress);
  }
}

// Khi player kiếm vàng (từ hunt)
function onEarnGold(userId, amount) {
  const quests = db.prepare(`SELECT pq.*, q.* FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.objective = 'gold' AND pq.claimed = 0`).all(userId);
  for (const pq of quests) {
    const newProgress = Math.min(pq.progress + amount, pq.target_qty);
    updateProgress(userId, pq.quest_id, newProgress);
  }
}

// Khi player lên cấp
function onLevelUp(userId, newLevel) {
  const quests = db.prepare(`SELECT pq.*, q.* FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.objective = 'level' AND pq.claimed = 0`).all(userId);
  for (const pq of quests) {
    if (newLevel >= pq.target_qty) {
      updateProgress(userId, pq.quest_id, pq.target_qty);
    }
  }
}

// Check item collection (gọi sau khi addItem)
function onItemCollect(userId, itemId) {
  const quests = db.prepare(`SELECT pq.*, q.* FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.objective = 'item' AND pq.claimed = 0`).all(userId);
  for (const pq of quests) {
    if (pq.target_id !== itemId) continue;
    // Đếm hiện có trong inv
    const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
    const have = row?.qty || 0;
    const newProgress = Math.min(have, pq.target_qty);
    updateProgress(userId, pq.quest_id, newProgress);
  }
}

// === Objective mới: gather / craft / job_level / boss ===
//
// Trước đây quest chỉ có 4 loại (kill/gold/level/item), nên nội dung mới như
// nghề hái lượm, chế tác, boss không bao giờ được quest "dạy" cho người chơi:
// họ không có lý do nào để thử. Bốn loại dưới đây bám đúng vào các hành động
// đã có sẵn, target_id dùng lại quy ước cũ:
//   gather    : target_id = job (mining|fishing|foraging) hoặc '' = nghề nào cũng tính
//   craft     : target_id = recipe_id hoặc '' = món nào cũng tính
//   job_level : target_id = job (bắt buộc), target_qty = cấp nghề cần đạt
//   boss      : target_id = monster_id hoặc '' = elite/boss nào cũng tính
function bumpObjective(userId, objective, targetId, amount = 1) {
  const rows = db.prepare(`SELECT pq.progress, pq.quest_id, q.target_id, q.target_qty
    FROM player_quests pq JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.objective = ? AND pq.claimed = 0`).all(userId, objective);
  for (const r of rows) {
    if (r.target_id && r.target_id !== targetId) continue;
    const next = Math.min(r.progress + amount, r.target_qty);
    if (next !== r.progress) updateProgress(userId, r.quest_id, next);
  }
}

// Thu hoạch: mỗi nguyên liệu nhận được +1 (không phải mỗi lần bấm lệnh) — nhờ
// vậy người chơi mở zone cao (rơi nhiều) sẽ xong quest nhanh hơn, đúng ý nghĩa
// "thu hoạch nhiều nguyên liệu".
function onGather(userId, jobType, amount = 1) {
  if (amount > 0) {
    bumpObjective(userId, 'gather', jobType, amount);
    require('./story').onEvent(userId, 'gather', jobType, amount);
  }
}

// Chế/nấu thành công: tính theo số món tạo ra.
function onCraft(userId, recipeId, qty = 1) {
  if (qty > 0) {
    bumpObjective(userId, 'craft', recipeId, qty);
    require('./story').onEvent(userId, 'craft', recipeId, qty);
  }
}

// Hạ elite/boss (elite_tier >= 1). Quái thường KHÔNG tính — nếu không thì quest
// "hạ 1 boss" hoàn thành bằng cách đánh slime.
function onKillBoss(userId, monsterId, eliteTier = 0) {
  if (!eliteTier) return;
  bumpObjective(userId, 'boss', monsterId, 1);
  require('./story').onEvent(userId, 'boss', monsterId);
}

// Objective dạng TRẠNG THÁI (level / job_level / item) không cộng dồn được theo
// sự kiện: người chơi đã Lv.20 rồi mới nhận quest "đạt Lv.10" thì sự kiện
// onLevelUp đã trôi qua từ lâu, quest kẹt ở 0 vĩnh viễn. Tính lại từ dữ liệu
// hiện tại mỗi lần xem/nhận quest.
//
// Đọc thẳng bảng `players` thay vì require('./player'): player.js require
// quests.js ở top-level, require ngược lại sẽ tạo vòng lặp module.
function refreshStateQuests(userId) {
  const p = db.prepare('SELECT level FROM players WHERE user_id = ?').get(userId);
  const jobLevels = new Map(db.prepare('SELECT job_type, level FROM player_jobs WHERE user_id = ?')
    .all(userId).map(r => [r.job_type, r.level]));
  const rows = db.prepare(`SELECT pq.progress, pq.quest_id, q.objective, q.target_id, q.target_qty
    FROM player_quests pq JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND pq.claimed = 0`).all(userId);

  let changed = 0;
  for (const r of rows) {
    let value = null;
    if (r.objective === 'level') value = p ? p.level : 0;
    else if (r.objective === 'job_level') value = jobLevels.get(r.target_id) || 0;
    else if (r.objective === 'item') {
      const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, r.target_id);
      value = row ? row.qty : 0;
    }
    if (value === null) continue;
    const next = Math.min(value, r.target_qty);
    if (next !== r.progress) { updateProgress(userId, r.quest_id, next); changed++; }
  }
  return changed;
}

// === Daily quest generation ===
// Auto generate 3 quest random cho user (chạy khi user gõ #quest lần đầu/ngày mới)
function generateDailyQuests(userId, level) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dailyTag = `daily_${today.getTime()}_${userId}`;

  // Check đã có quest daily hôm nay chưa
  const existing = db.prepare(`SELECT COUNT(*) c FROM player_quests pq
    JOIN quests q ON q.id = pq.quest_id
    WHERE pq.user_id = ? AND q.type = 'daily' AND pq.assigned_at >= ?`)
    .get(userId, today.getTime()).c;
  if (existing >= 3) return [];

  // Xoá các daily quest cũ (đã expired) khỏi player_quests
  db.prepare(`DELETE FROM player_quests
    WHERE user_id = ? AND quest_id IN (
      SELECT id FROM quests WHERE type = 'daily' AND id LIKE 'auto_daily_%'
    ) AND assigned_at < ?`).run(userId, today.getTime());

  // Tạo 3 quest random
  const templates = [
    // Kill quests
    { type: 'kill', target_qty: 5,  rg: 100, rx: 50,  name: 'Săn quái cấp thấp', desc: 'Săn bất kỳ 5 quái' },
    { type: 'kill', target_qty: 10, rg: 200, rx: 100, name: 'Săn quái', desc: 'Săn bất kỳ 10 quái' },
    { type: 'kill', target_qty: 20, rg: 400, rx: 250, name: 'Thợ săn chuyên nghiệp', desc: 'Săn bất kỳ 20 quái' },
    // Gold quests
    { type: 'gold', target_qty: 200,  rg: 100, rx: 50, name: 'Kiếm tiền', desc: 'Kiếm 200 vàng' },
    { type: 'gold', target_qty: 500,  rg: 250, rx: 100, name: 'Phú nông', desc: 'Kiếm 500 vàng' },
    { type: 'gold', target_qty: 1000, rg: 500, rx: 200, name: 'Đại gia', desc: 'Kiếm 1000 vàng' },
    // Nghề & chế tác — dẫn người chơi tới nội dung mới
    { type: 'gather', target_qty: 20, rg: 150, rx: 80, name: 'Thu hoạch', desc: 'Đào/câu/hái 20 nguyên liệu' },
    { type: 'craft',  target_qty: 2,  rg: 180, rx: 90, name: 'Thợ thủ công', desc: 'Chế hoặc nấu 2 món' },
    // Boss — chỉ xuất hiện khi người chơi đủ cấp để đánh elite (elite Lv.1 mạnh
    // hơn quái thường gấp nhiều lần), tránh phát quest bất khả thi cho người mới.
    ...(level >= 15 ? [{ type: 'boss', target_qty: 1, rg: 700, rx: 450, name: 'Diệt boss', desc: 'Hạ 1 elite hoặc boss' }] : []),
    // Level quest (chỉ cho người chưa cao cấp)
    { type: 'level', target_qty: level + 1, rg: 300, rx: 500, name: 'Lên cấp', desc: `Đạt Lv.${level + 1}` },
  ];

  // Shuffle và pick 3 cái khác nhau
  const shuffled = [...templates].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);

  const assigned = [];
  for (let i = 0; i < picked.length; i++) {
    const t = picked[i];
    const questId = `auto_daily_${today.getTime()}_${userId}_${i}`;

    // Tạo quest nếu chưa có
    if (!getQuest(questId)) {
      createQuest({
        id: questId, type: 'daily',
        name: t.name, desc: t.desc,
        objective: t.type, target_id: '', target_qty: t.target_qty,
        reward_gold: t.rg, reward_xp: t.rx, reward_item: '',
        created_by: 'system',
      });
    }
    assignQuest(userId, questId);
    assigned.push(getQuest(questId));
  }
  return assigned;
}

// Check quest có hoàn thành chưa
function isQuestComplete(pq) {
  return pq.progress >= pq.target_qty;
}

module.exports = {
  migrate,
  getQuest, getAllQuests, getQuestsByType,
  createQuest, deleteQuest,
  getPlayerQuests, getPlayerQuest,
  assignQuest, updateProgress, markClaimed, removeQuestFromPlayer,
  onKillMonster, onEarnGold, onLevelUp, onItemCollect,
  onGather, onCraft, onKillBoss, refreshStateQuests, bumpObjective,
  generateDailyQuests,
  isQuestComplete,
}; 
