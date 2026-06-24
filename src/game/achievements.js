// Achievement system: auto-track + grant
const db = require('./../db/database');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS achievements (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      desc        TEXT NOT NULL DEFAULT '',
      icon        TEXT NOT NULL DEFAULT '🏆',
      objective   TEXT NOT NULL,           -- kill_count | level_reach | gold_total | item_collect | quest_complete
      target_id   TEXT NOT NULL DEFAULT '', -- monster_id/item_id hoặc rỗng
      target_qty  INTEGER NOT NULL DEFAULT 1,
      points      INTEGER NOT NULL DEFAULT 10,
      reward_gold INTEGER NOT NULL DEFAULT 0,
      reward_xp   INTEGER NOT NULL DEFAULT 0,
      reward_item TEXT NOT NULL DEFAULT '',
      title       TEXT NOT NULL DEFAULT '',  -- Title nhận được khi unlock
      created_by  TEXT NOT NULL DEFAULT 'system',
      created_at  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS player_achievements (
      user_id        TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      unlocked_at    INTEGER NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );

    -- Bảng player_stats: track stat tổng (kill total, gold total, etc)
    CREATE TABLE IF NOT EXISTS player_stats (
      user_id        TEXT PRIMARY KEY,
      total_kills    INTEGER NOT NULL DEFAULT 0,
      total_gold     INTEGER NOT NULL DEFAULT 0,
      total_quests   INTEGER NOT NULL DEFAULT 0,
      ach_points     INTEGER NOT NULL DEFAULT 0,
      current_title  TEXT NOT NULL DEFAULT ''
    );
  `);

  // Seed achievements mặc định
  seedDefaults();
  seedNewAchievements();  // Seed bổ sung (chỉ insert các ID mới chưa có)
}

function seedDefaults() {
  const count = db.prepare('SELECT COUNT(*) c FROM achievements').get().c;
  if (count > 0) return;

  const list = [
    // [id, name, desc, icon, objective, target_id, target_qty, points, gold, xp, item, title]
    // === Kill milestones ===
    ['kill_10',    'First Blood',      'Kill 10 monsters',          '🩸', 'kill_count', '', 10,    10,  100,   50,  '', ''],
    ['kill_100',   'Veteran Hunter',   'Kill 100 monsters',         '⚔️', 'kill_count', '', 100,   25,  500,   250, '', 'Veteran'],
    ['kill_500',   'Monster Slayer',   'Kill 500 monsters',         '💀', 'kill_count', '', 500,   50,  2000,  1000,'', 'Slayer'],
    ['kill_1000',  'Death Incarnate',  'Kill 1,000 monsters',       '☠️', 'kill_count', '', 1000,  100, 5000,  3000,'', 'Death Incarnate'],

    // === Specific monsters ===
    ['kill_dragon_1',   'Dragonslayer',     'Defeat your first Ancient Dragon', '🐲', 'kill_monster', 'dragon', 1, 50, 1000, 500, 'dragon_scale:3', 'Dragonslayer'],
    ['kill_void_dragon','Void Conqueror',   'Defeat the Void Dragon',           '🌌', 'kill_monster', 'void_dragon', 1, 100, 5000, 2000, 'void_essence:5', 'Void Conqueror'],

    // === Level milestones ===
    ['level_5',    'Apprentice',       'Reach level 5',             '⭐', 'level_reach', '', 5,    10,  50,    0,    '', ''],
    ['level_10',   'Adept',            'Reach level 10',            '⭐', 'level_reach', '', 10,   20,  200,   0,    '', 'Adept'],
    ['level_20',   'Expert',           'Reach level 20',            '🌟', 'level_reach', '', 20,   40,  500,   0,    '', 'Expert'],
    ['level_30',   'Master',           'Reach level 30',            '💫', 'level_reach', '', 30,   75,  1500,  0,    '', 'Master'],
    ['level_50',   'Legend',           'Reach level 50',            '👑', 'level_reach', '', 50,   150, 5000,  0,    '', 'Legend'],

    // === Gold milestones ===
    ['gold_1k',    'Pocket Money',     'Earn 1,000 gold total',     '💰', 'gold_total', '', 1000,   10,  0, 0, '', ''],
    ['gold_10k',   'Wealthy',          'Earn 10,000 gold total',    '💰', 'gold_total', '', 10000,  30,  500, 0, '', 'Wealthy'],
    ['gold_100k',  'Tycoon',           'Earn 100,000 gold total',   '💎', 'gold_total', '', 100000, 100, 5000, 0, '', 'Tycoon'],

    // === Quest milestones ===
    ['quest_10',   'Adventurer',       'Complete 10 quests',        '📜', 'quest_complete', '', 10,  20,  500,  0, '', ''],
    ['quest_50',   'Quest Master',     'Complete 50 quests',        '📚', 'quest_complete', '', 50,  50,  3000, 0, '', 'Quest Master'],

    // === Collection ===
    ['collect_dragon_scale', 'Scale Collector', 'Collect 10 Dragon Scales', '🔶', 'item_collect', 'dragon_scale', 10, 30, 500, 0, '', ''],
    ['collect_elixir',       'Alchemist',       'Possess 5 Elixir of Life', '✨', 'item_collect', 'elixir', 5, 40, 1000, 0, '', 'Alchemist'],

  ];

  const ins = db.prepare(`INSERT INTO achievements
    (id, name, desc, icon, objective, target_id, target_qty, points, reward_gold, reward_xp, reward_item, title, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'system', ?)`);
  const now = Date.now();
  for (const a of list) ins.run(...a, now);
  console.log(`🌱 Seeded ${list.length} achievements`);
}

// Seed bổ sung — chỉ insert achievement có ID chưa tồn tại.
// Thêm achievement mới ở đây trong các phase tương lai để không phụ thuộc reset DB.
function seedNewAchievements() {
  const list = [
    // === Pet achievements (thêm ở Phase 3.2) ===
    ['pet_first',           'Pet Tamer',        'Obtain your first pet',       '🐾', 'pet_count',       '', 1,    15, 200,  0, '', ''],
    ['pet_collect_5',       'Pet Lover',        'Own 5 different pets',        '🐾', 'pet_count',       '', 5,    30, 800,  0, '', ''],
    ['pet_collect_10',      'Pet Master',       'Own 10 different pets',       '🐾', 'pet_count',       '', 10,   60, 2500, 0, '', 'Beast Master'],
    ['pet_legendary_first', 'Legendary Tamer',  'Own a legendary pet',         '🌟', 'pet_tier',        'legendary', 1, 100, 5000, 0, '', 'Legendary Tamer'],
    ['pet_legendary_3',     'Mythic Collector', 'Own 3 legendary pets',        '🌟', 'pet_tier',        'legendary', 3, 200, 15000, 0, '', 'Mythic Collector'],
    ['pet_own_dragonling',  'Dragon Friend',    'Own the Dragonling pet',      '🐉', 'pet_own',         'pet_dragonling', 1, 75, 2000, 0, '', 'Dragon Friend'],
    ['pet_own_void_cat',    'Void Whisperer',   'Own the Void Cat pet',        '🐈‍⬛', 'pet_own',        'pet_void_cat', 1, 150, 8000, 0, '', 'Void Whisperer'],
    ['pet_own_king_slime',  'Slime Lord',       'Combine the King Slime pet',  '👑', 'pet_own',         'pet_king_slime', 1, 80, 3000, 0, '', 'Slime Lord'],
  ];

  const checkStmt = db.prepare('SELECT 1 FROM achievements WHERE id = ?');
  const insStmt = db.prepare(`INSERT INTO achievements
    (id, name, desc, icon, objective, target_id, target_qty, points, reward_gold, reward_xp, reward_item, title, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'system', ?)`);

  let added = 0;
  const now = Date.now();
  for (const a of list) {
    if (!checkStmt.get(a[0])) {
      insStmt.run(...a, now);
      added++;
    }
  }
  if (added > 0) console.log(`🌱 Seeded ${added} new achievements`);
}

// === CRUD ===
function getAchievement(id) {
  return db.prepare('SELECT * FROM achievements WHERE id = ?').get(id);
}
function getAllAchievements() {
  return db.prepare('SELECT * FROM achievements ORDER BY objective, target_qty').all();
}
function createAchievement(data) {
  const now = Date.now();
  db.prepare(`INSERT INTO achievements
    (id, name, desc, icon, objective, target_id, target_qty, points, reward_gold, reward_xp, reward_item, title, created_by, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      data.id, data.name, data.desc || '', data.icon || '🏆',
      data.objective, data.target_id || '', data.target_qty || 1,
      data.points || 10, data.reward_gold || 0, data.reward_xp || 0,
      data.reward_item || '', data.title || '',
      data.created_by || 'system', now
    );
  return getAchievement(data.id);
}
function deleteAchievement(id) {
  db.prepare('DELETE FROM player_achievements WHERE achievement_id = ?').run(id);
  return db.prepare('DELETE FROM achievements WHERE id = ?').run(id).changes > 0;
}

// === Player tracking ===
function getPlayerStats(userId) {
  let row = db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare('INSERT INTO player_stats (user_id) VALUES (?)').run(userId);
    row = db.prepare('SELECT * FROM player_stats WHERE user_id = ?').get(userId);
  }
  return row;
}

function updatePlayerStats(userId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  // Ensure exists
  getPlayerStats(userId);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE player_stats SET ${setClause} WHERE user_id = ?`).run(...values, userId);
}

function getPlayerAchievements(userId) {
  return db.prepare(`SELECT pa.*, a.* FROM player_achievements pa
    JOIN achievements a ON a.id = pa.achievement_id
    WHERE pa.user_id = ?
    ORDER BY pa.unlocked_at DESC`).all(userId);
}

function hasUnlocked(userId, achId) {
  const row = db.prepare('SELECT * FROM player_achievements WHERE user_id=? AND achievement_id=?').get(userId, achId);
  return !!row;
}

function grantAchievement(userId, achId) {
  if (hasUnlocked(userId, achId)) return null;
  const ach = getAchievement(achId);
  if (!ach) return null;

  db.prepare('INSERT INTO player_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)')
    .run(userId, achId, Date.now());

  // Update stats
  const stats = getPlayerStats(userId);
  updatePlayerStats(userId, { ach_points: stats.ach_points + ach.points });

  return ach;
}

// === Auto-check (gọi sau khi có event) ===
// Trả về array các achievement vừa unlock (để notify)
// Optional context { client, guildId }: nếu truyền vào, sẽ tự apply reward + notify channel
function checkAndGrant(userId, context = null) {
  const stats = getPlayerStats(userId);
  const player = db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
  if (!player) return [];

  const unlocked = [];
  const allAchs = getAllAchievements();

  for (const ach of allAchs) {
    if (hasUnlocked(userId, ach.id)) continue;

    let pass = false;
    switch (ach.objective) {
      case 'kill_count':
        pass = stats.total_kills >= ach.target_qty;
        break;
      case 'kill_monster':
        // Hook riêng: checkKillMonster
        break;
      case 'gold_total':
        pass = stats.total_gold >= ach.target_qty;
        break;
      case 'level_reach':
        pass = player.level >= ach.target_qty;
        break;
      case 'quest_complete':
        pass = stats.total_quests >= ach.target_qty;
        break;
      case 'item_collect': {
        const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, ach.target_id);
        pass = row && row.qty >= ach.target_qty;
        break;
      }
      case 'pet_count': {
        // Đếm số pet khác nhau user sở hữu
        const c = db.prepare('SELECT COUNT(*) c FROM player_pets WHERE user_id = ?').get(userId).c;
        pass = c >= ach.target_qty;
        break;
      }
      case 'pet_tier': {
        // Đếm pet theo tier
        const c = db.prepare(`SELECT COUNT(*) c FROM player_pets pp
          JOIN pets p ON p.id = pp.pet_id
          WHERE pp.user_id = ? AND p.tier = ?`).get(userId, ach.target_id).c;
        pass = c >= ach.target_qty;
        break;
      }
      case 'pet_own': {
        // Sở hữu 1 pet cụ thể
        const r = db.prepare('SELECT qty FROM player_pets WHERE user_id=? AND pet_id=?').get(userId, ach.target_id);
        pass = r && r.qty >= ach.target_qty;
        break;
      }
    }
    if (pass) {
      const a = grantAchievement(userId, ach.id);
      if (a) unlocked.push(a);
    }
  }

  // Apply rewards + notify nếu có context
  if (context && unlocked.length > 0) {
    applyRewardsAndNotify(userId, unlocked, context);
  }

  return unlocked;
}

// Hook đặc biệt cho kill_monster theo target_id
function checkKillMonster(userId, monsterId, context = null) {
  const unlocked = [];
  const matching = db.prepare("SELECT * FROM achievements WHERE objective = 'kill_monster' AND target_id = ?").all(monsterId);
  for (const ach of matching) {
    if (hasUnlocked(userId, ach.id)) continue;
    if (ach.target_qty === 1) {
      const a = grantAchievement(userId, ach.id);
      if (a) unlocked.push(a);
    }
  }
  if (context && unlocked.length > 0) {
    applyRewardsAndNotify(userId, unlocked, context);
  }
  return unlocked;
}

// === Helper: apply reward + notify ===
// context = { client, guildId, userMention? }
function applyRewardsAndNotify(userId, achs, context) {
  try {
    const { getPlayer, updatePlayer, addItem, addXpAndLevel } = require('./player');
    const { getItem } = require('./items');
    const channels = require('./channels');
    const { EmbedBuilder } = require('discord.js');

    for (const a of achs) {
      // Apply reward
      if (a.reward_gold) {
        const p = getPlayer(userId);
        if (p) updatePlayer(userId, { gold: p.gold + a.reward_gold });
      }
      if (a.reward_xp) addXpAndLevel(userId, a.reward_xp);
      if (a.reward_item) {
        for (const part of a.reward_item.split(',')) {
          const [iid, q] = part.split(':');
          if (iid && getItem(iid)) addItem(userId, iid, parseInt(q) || 1);
        }
      }
      // Auto-set title nếu có
      if (a.title) {
        const stats = getPlayerStats(userId);
        if (!stats.current_title) {
          updatePlayerStats(userId, { current_title: a.title });
        }
      }

      // Notify channel
      if (context.client && context.guildId) {
        const rewardText = [];
        if (a.reward_gold) rewardText.push(`💰 ${a.reward_gold}`);
        if (a.reward_xp)   rewardText.push(`✨ ${a.reward_xp} XP`);
        if (a.title)       rewardText.push(`🎖️ Title: ${a.title}`);
        rewardText.push(`⭐ ${a.points} pt`);

        channels.notify(context.client, context.guildId, 'achievement', {
          embeds: [new EmbedBuilder().setColor(0xF1C40F)
            .setTitle(`${a.icon} Achievement Unlocked!`)
            .setDescription(
              `<@${userId}> đã đạt **${a.name}**!\n` +
              `*${a.desc}*\n\n` +
              `🎁 Reward: ${rewardText.join(' • ')}`
            )],
        });
      }
    }
  } catch (e) {
    console.error('[applyRewardsAndNotify]', e.message);
  }
}

module.exports = {
  migrate,
  getAchievement, getAllAchievements,
  createAchievement, deleteAchievement,
  getPlayerStats, updatePlayerStats,
  getPlayerAchievements, hasUnlocked, grantAchievement,
  checkAndGrant, checkKillMonster,
  applyRewardsAndNotify,
};
