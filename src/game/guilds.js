// Guild / bang hội: tạo bang, thành viên, kho chung, XP/buff khi hunt
const db = require('../db/database');
const { getPlayer, updatePlayer, addItem, removeItem } = require('./player');
const { getItem } = require('./items');

const CREATE_MIN_LEVEL = 5;
const CREATE_COST = 500;
const INVITE_EXPIRE_MS = 24 * 60 * 60 * 1000;
const MAX_LEVEL = 20;
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;
const ROLE_RANK = { member: 0, officer: 1, leader: 2 };

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      tag         TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      motd        TEXT NOT NULL DEFAULT '',
      leader_id   TEXT NOT NULL,
      level       INTEGER NOT NULL DEFAULT 1,
      xp          INTEGER NOT NULL DEFAULT 0,
      gold        INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_members (
      user_id      TEXT PRIMARY KEY,
      guild_id     INTEGER NOT NULL,
      role         TEXT NOT NULL DEFAULT 'member',
      contrib_xp   INTEGER NOT NULL DEFAULT 0,
      contrib_gold INTEGER NOT NULL DEFAULT 0,
      joined_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guild_invites (
      guild_id   INTEGER NOT NULL,
      user_id    TEXT NOT NULL,
      inviter_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS guild_vault (
      guild_id INTEGER NOT NULL,
      item_id  TEXT NOT NULL,
      qty      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, item_id)
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id)`);
  console.log('🏰 Guild system: migrated');
}

function xpToNext(level) {
  return Math.floor(200 * Math.pow(level, 1.5));
}

function maxMembers(level) {
  return 10 + Math.floor((level || 1) / 2);
}

function getBuffs(guild) {
  if (!guild) return { gold_pct: 0, xp_pct: 0, drop_pct: 0 };
  const lv = guild.level || 1;
  return {
    gold_pct: Math.min(10, lv),
    xp_pct: Math.min(10, Math.floor(lv / 2)),
    drop_pct: lv >= 10 ? 5 : (lv >= 5 ? 2 : 0),
  };
}

function getGuild(id) {
  return db.prepare('SELECT * FROM guilds WHERE id = ?').get(id) || null;
}

function findByTag(tag) {
  if (!tag) return null;
  return db.prepare('SELECT * FROM guilds WHERE LOWER(tag) = LOWER(?)').get(String(tag)) || null;
}

function findByName(name) {
  if (!name) return null;
  return db.prepare('SELECT * FROM guilds WHERE LOWER(name) = LOWER(?)').get(String(name)) || null;
}

function findGuild(query) {
  if (!query) return null;
  const q = String(query).trim();
  if (/^\d+$/.test(q)) {
    const byId = getGuild(parseInt(q, 10));
    if (byId) return byId;
  }
  return findByTag(q) || findByName(q);
}

function getMember(userId) {
  return db.prepare('SELECT * FROM guild_members WHERE user_id = ?').get(userId) || null;
}

function getPlayerGuild(userId) {
  const m = getMember(userId);
  if (!m) return null;
  const g = getGuild(m.guild_id);
  if (!g) return null;
  return { ...g, member: m };
}

function countMembers(guildId) {
  return db.prepare('SELECT COUNT(*) c FROM guild_members WHERE guild_id = ?').get(guildId).c;
}

function listMembers(guildId) {
  return db.prepare(`
    SELECT gm.*, p.name
    FROM guild_members gm
    LEFT JOIN players p ON p.user_id = gm.user_id
    WHERE gm.guild_id = ?
    ORDER BY CASE gm.role WHEN 'leader' THEN 0 WHEN 'officer' THEN 1 ELSE 2 END,
             gm.contrib_xp DESC, gm.joined_at ASC
  `).all(guildId);
}

function listTop(limit = 10) {
  return db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS members
    FROM guilds g
    ORDER BY g.level DESC, g.xp DESC
    LIMIT ?
  `).all(limit);
}

function searchGuilds(query, limit = 25) {
  const q = `%${(query || '').toLowerCase()}%`;
  return db.prepare(`
    SELECT g.*, (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS members
    FROM guilds g
    WHERE LOWER(g.tag) LIKE ? OR LOWER(g.name) LIKE ?
    ORDER BY g.level DESC
    LIMIT ?
  `).all(q, q, limit);
}

function isOfficerPlus(member) {
  return member && ROLE_RANK[member.role] >= ROLE_RANK.officer;
}

function isLeader(member) {
  return member && member.role === 'leader';
}

function createGuild(userId, tag, name) {
  const p = getPlayer(userId);
  if (!p) return { ok: false, error: 'Bạn chưa có nhân vật.' };
  if (p.level < CREATE_MIN_LEVEL) {
    return { ok: false, error: `Cần Lv.**${CREATE_MIN_LEVEL}** để lập bang (bạn Lv.${p.level}).` };
  }
  if (p.gold < CREATE_COST) {
    return { ok: false, error: `Cần **${CREATE_COST}** vàng để lập bang (bạn có ${p.gold}).` };
  }
  if (getMember(userId)) return { ok: false, error: 'Bạn đã ở trong một bang hội rồi. Rời bang cũ trước.' };

  tag = String(tag || '').trim().toUpperCase();
  name = String(name || '').trim();
  if (!TAG_RE.test(tag)) return { ok: false, error: 'Tag phải **2–5** ký tự chữ/số (vd: `ABC`).' };
  if (name.length < 3 || name.length > 24) return { ok: false, error: 'Tên bang **3–24** ký tự.' };
  if (/[<@#>`]/.test(name)) return { ok: false, error: 'Tên bang không được chứa ký tự đặc biệt Discord.' };
  if (findByTag(tag)) return { ok: false, error: `Tag \`${tag}\` đã được dùng.` };
  if (findByName(name)) return { ok: false, error: `Tên **${name}** đã được dùng.` };

  const run = db.transaction(() => {
    updatePlayer(userId, { gold: p.gold - CREATE_COST });
    const r = db.prepare(`
      INSERT INTO guilds (name, tag, leader_id, created_at) VALUES (?,?,?,?)
    `).run(name, tag, userId, Date.now());
    db.prepare(`
      INSERT INTO guild_members (user_id, guild_id, role, joined_at) VALUES (?,?,?,?)
    `).run(userId, r.lastInsertRowid, 'leader', Date.now());
    return getGuild(r.lastInsertRowid);
  });

  return { ok: true, guild: run() };
}

function createInvite(guildId, targetId, inviterId) {
  const guild = getGuild(guildId);
  if (!guild) return { ok: false, error: 'Bang không tồn tại.' };
  if (targetId === inviterId) return { ok: false, error: 'Không thể tự mời chính mình.' };
  if (!getPlayer(targetId)) return { ok: false, error: 'Người đó chưa có nhân vật.' };
  if (getMember(targetId)) return { ok: false, error: 'Người đó đã ở trong một bang hội.' };

  const n = countMembers(guildId);
  if (n >= maxMembers(guild.level)) {
    return { ok: false, error: `Bang đã đầy (${n}/${maxMembers(guild.level)}).` };
  }

  const existing = db.prepare('SELECT * FROM guild_invites WHERE guild_id=? AND user_id=?').get(guildId, targetId);
  if (existing && Date.now() - existing.created_at < INVITE_EXPIRE_MS) {
    return { ok: false, error: 'Đã có lời mời còn hạn cho người này.' };
  }

  db.prepare(`
    INSERT INTO guild_invites (guild_id, user_id, inviter_id, created_at)
    VALUES (?,?,?,?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET inviter_id=excluded.inviter_id, created_at=excluded.created_at
  `).run(guildId, targetId, inviterId, Date.now());

  return { ok: true, guild };
}

function getInvite(guildId, userId) {
  const row = db.prepare('SELECT * FROM guild_invites WHERE guild_id=? AND user_id=?').get(guildId, userId);
  if (!row) return null;
  if (Date.now() - row.created_at > INVITE_EXPIRE_MS) {
    db.prepare('DELETE FROM guild_invites WHERE guild_id=? AND user_id=?').run(guildId, userId);
    return null;
  }
  return row;
}

function listInvitesForUser(userId) {
  const rows = db.prepare(`
    SELECT gi.*, g.name, g.tag, g.level
    FROM guild_invites gi JOIN guilds g ON g.id = gi.guild_id
    WHERE gi.user_id = ?
    ORDER BY gi.created_at DESC
  `).all(userId);
  const now = Date.now();
  const valid = [];
  for (const r of rows) {
    if (now - r.created_at > INVITE_EXPIRE_MS) {
      db.prepare('DELETE FROM guild_invites WHERE guild_id=? AND user_id=?').run(r.guild_id, userId);
    } else {
      valid.push(r);
    }
  }
  return valid;
}

function deleteInvite(guildId, userId) {
  db.prepare('DELETE FROM guild_invites WHERE guild_id=? AND user_id=?').run(guildId, userId);
}

function acceptInvite(userId, guildId) {
  if (getMember(userId)) return { ok: false, error: 'Bạn đã ở trong một bang hội.' };
  const inv = getInvite(guildId, userId);
  if (!inv) return { ok: false, error: 'Không có lời mời còn hạn từ bang này.' };
  const guild = getGuild(guildId);
  if (!guild) {
    deleteInvite(guildId, userId);
    return { ok: false, error: 'Bang không còn tồn tại.' };
  }
  if (countMembers(guildId) >= maxMembers(guild.level)) {
    return { ok: false, error: 'Bang đã đầy thành viên.' };
  }

  const run = db.transaction(() => {
    db.prepare('DELETE FROM guild_invites WHERE user_id = ?').run(userId);
    db.prepare(`
      INSERT INTO guild_members (user_id, guild_id, role, joined_at) VALUES (?,?,?,?)
    `).run(userId, guildId, 'member', Date.now());
  });
  run();
  return { ok: true, guild: getGuild(guildId) };
}

function declineInvite(userId, guildId) {
  const inv = getInvite(guildId, userId);
  if (!inv) return { ok: false, error: 'Không có lời mời còn hạn từ bang này.' };
  deleteInvite(guildId, userId);
  return { ok: true, guild: getGuild(guildId) };
}

function leaveGuild(userId) {
  const m = getMember(userId);
  if (!m) return { ok: false, error: 'Bạn không ở trong bang hội nào.' };
  if (m.role === 'leader') {
    return { ok: false, error: 'Bang chủ phải `transfer` quyền hoặc `disband` trước khi rời.' };
  }
  db.prepare('DELETE FROM guild_members WHERE user_id = ?').run(userId);
  return { ok: true, guild: getGuild(m.guild_id) };
}

function kickMember(actorId, targetId) {
  const actor = getMember(actorId);
  if (!isOfficerPlus(actor)) return { ok: false, error: 'Chỉ officer/bang chủ mới kick được.' };
  if (actorId === targetId) return { ok: false, error: 'Dùng `leave` để tự rời bang.' };
  const target = getMember(targetId);
  if (!target || target.guild_id !== actor.guild_id) {
    return { ok: false, error: 'Người đó không ở trong bang của bạn.' };
  }
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
    return { ok: false, error: 'Không thể kick người có chức vụ ngang/cao hơn.' };
  }
  db.prepare('DELETE FROM guild_members WHERE user_id = ?').run(targetId);
  return { ok: true, guild: getGuild(actor.guild_id) };
}

function setRole(actorId, targetId, newRole) {
  const actor = getMember(actorId);
  if (!isLeader(actor)) return { ok: false, error: 'Chỉ bang chủ mới đổi chức vụ.' };
  if (actorId === targetId) return { ok: false, error: 'Không thể đổi chức vụ của chính mình.' };
  const target = getMember(targetId);
  if (!target || target.guild_id !== actor.guild_id) {
    return { ok: false, error: 'Người đó không ở trong bang của bạn.' };
  }
  if (!['member', 'officer'].includes(newRole)) {
    return { ok: false, error: 'Chức vụ không hợp lệ.' };
  }
  db.prepare('UPDATE guild_members SET role = ? WHERE user_id = ?').run(newRole, targetId);
  return { ok: true, guild: getGuild(actor.guild_id), role: newRole };
}

function transferLeader(actorId, targetId) {
  const actor = getMember(actorId);
  if (!isLeader(actor)) return { ok: false, error: 'Chỉ bang chủ mới chuyển quyền.' };
  if (actorId === targetId) return { ok: false, error: 'Đã là bang chủ rồi.' };
  const target = getMember(targetId);
  if (!target || target.guild_id !== actor.guild_id) {
    return { ok: false, error: 'Người đó không ở trong bang của bạn.' };
  }
  const run = db.transaction(() => {
    db.prepare('UPDATE guild_members SET role = ? WHERE user_id = ?').run('officer', actorId);
    db.prepare('UPDATE guild_members SET role = ? WHERE user_id = ?').run('leader', targetId);
    db.prepare('UPDATE guilds SET leader_id = ? WHERE id = ?').run(targetId, actor.guild_id);
  });
  run();
  return { ok: true, guild: getGuild(actor.guild_id) };
}

function disbandGuild(userId) {
  const m = getMember(userId);
  if (!isLeader(m)) return { ok: false, error: 'Chỉ bang chủ mới giải tán được.' };
  const guild = getGuild(m.guild_id);
  const run = db.transaction(() => {
    db.prepare('DELETE FROM guild_vault WHERE guild_id = ?').run(m.guild_id);
    db.prepare('DELETE FROM guild_invites WHERE guild_id = ?').run(m.guild_id);
    db.prepare('DELETE FROM guild_members WHERE guild_id = ?').run(m.guild_id);
    db.prepare('DELETE FROM guilds WHERE id = ?').run(m.guild_id);
  });
  run();
  return { ok: true, guild };
}

function setMotd(userId, text) {
  const m = getMember(userId);
  if (!isOfficerPlus(m)) return { ok: false, error: 'Chỉ officer/bang chủ mới sửa MOTD.' };
  text = String(text || '').trim().slice(0, 200);
  db.prepare('UPDATE guilds SET motd = ? WHERE id = ?').run(text, m.guild_id);
  return { ok: true, guild: getGuild(m.guild_id) };
}

function setDescription(userId, text) {
  const m = getMember(userId);
  if (!isLeader(m)) return { ok: false, error: 'Chỉ bang chủ mới sửa mô tả.' };
  text = String(text || '').trim().slice(0, 200);
  db.prepare('UPDATE guilds SET description = ? WHERE id = ?').run(text, m.guild_id);
  return { ok: true, guild: getGuild(m.guild_id) };
}

function addGuildXp(guildId, amount, userId = null) {
  amount = Math.floor(amount);
  if (amount <= 0) return { levelsGained: [], newLevel: getGuild(guildId)?.level || 1 };
  const g = getGuild(guildId);
  if (!g) return { levelsGained: [] };

  let xp = g.xp + amount;
  let level = g.level;
  const lvlUps = [];
  while (level < MAX_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    lvlUps.push(level);
  }
  if (level >= MAX_LEVEL) xp = Math.min(xp, xpToNext(MAX_LEVEL) - 1);

  db.prepare('UPDATE guilds SET xp = ?, level = ? WHERE id = ?').run(xp, level, guildId);
  if (userId) {
    db.prepare('UPDATE guild_members SET contrib_xp = contrib_xp + ? WHERE user_id = ?')
      .run(amount, userId);
  }
  return { newLevel: level, levelsGained: lvlUps, xp };
}

function getGuildBonus(userId) {
  const g = getPlayerGuild(userId);
  if (!g) return { gold_pct: 0, xp_pct: 0, drop_pct: 0, guild_id: null, tag: '', name: '' };
  const b = getBuffs(g);
  return { ...b, guild_id: g.id, tag: g.tag, name: g.name };
}

function depositGold(userId, amount) {
  amount = Math.floor(amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Số vàng không hợp lệ.' };
  const m = getMember(userId);
  if (!m) return { ok: false, error: 'Bạn không ở trong bang hội nào.' };
  const p = getPlayer(userId);
  if (!p || p.gold < amount) return { ok: false, error: `Không đủ vàng (có ${p?.gold || 0}).` };

  const run = db.transaction(() => {
    updatePlayer(userId, { gold: p.gold - amount });
    db.prepare('UPDATE guilds SET gold = gold + ? WHERE id = ?').run(amount, m.guild_id);
    db.prepare('UPDATE guild_members SET contrib_gold = contrib_gold + ? WHERE user_id = ?')
      .run(amount, userId);
  });
  run();
  return { ok: true, amount, guild: getGuild(m.guild_id) };
}

function withdrawGold(userId, amount) {
  amount = Math.floor(amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'Số vàng không hợp lệ.' };
  const m = getMember(userId);
  if (!isOfficerPlus(m)) return { ok: false, error: 'Chỉ officer/bang chủ mới rút kho.' };
  const g = getGuild(m.guild_id);
  if (!g || g.gold < amount) return { ok: false, error: `Kho chỉ còn ${g?.gold || 0} vàng.` };

  const p = getPlayer(userId);
  const run = db.transaction(() => {
    db.prepare('UPDATE guilds SET gold = gold - ? WHERE id = ?').run(amount, m.guild_id);
    updatePlayer(userId, { gold: p.gold + amount });
  });
  run();
  return { ok: true, amount, guild: getGuild(m.guild_id) };
}

function equippedCount(userId, itemId) {
  const rows = db.prepare('SELECT item_id FROM equipped WHERE user_id = ?').all(userId);
  return rows.filter(r => r.item_id === itemId).length;
}

function depositItem(userId, itemId, qty) {
  qty = Math.max(1, Math.floor(qty) || 1);
  const m = getMember(userId);
  if (!m) return { ok: false, error: 'Bạn không ở trong bang hội nào.' };
  const it = getItem(itemId);
  if (!it) return { ok: false, error: `Item \`${itemId}\` không tồn tại.` };
  if (it.soulbound) return { ok: false, error: `🔒 **${it.name}** là soulbound — không gửi kho được.` };

  const eq = equippedCount(userId, itemId);
  const haveRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  const have = haveRow?.qty || 0;
  const free = have - eq;
  if (free < qty) {
    return {
      ok: false,
      error: eq > 0
        ? `Bạn có ${have}× ${it.name} nhưng ${eq} đang mặc — chỉ gửi được ${Math.max(0, free)}.`
        : `Không đủ ${it.name} (có ${have}).`,
    };
  }

  const run = db.transaction(() => {
    removeItem(userId, itemId, qty);
    const row = db.prepare('SELECT qty FROM guild_vault WHERE guild_id=? AND item_id=?').get(m.guild_id, itemId);
    if (row) {
      db.prepare('UPDATE guild_vault SET qty = qty + ? WHERE guild_id=? AND item_id=?')
        .run(qty, m.guild_id, itemId);
    } else {
      db.prepare('INSERT INTO guild_vault (guild_id, item_id, qty) VALUES (?,?,?)')
        .run(m.guild_id, itemId, qty);
    }
  });
  run();
  return { ok: true, item: it, qty, guild: getGuild(m.guild_id) };
}

function withdrawItem(userId, itemId, qty) {
  qty = Math.max(1, Math.floor(qty) || 1);
  const m = getMember(userId);
  if (!isOfficerPlus(m)) return { ok: false, error: 'Chỉ officer/bang chủ mới rút kho.' };
  const it = getItem(itemId);
  if (!it) return { ok: false, error: `Item \`${itemId}\` không tồn tại.` };

  const row = db.prepare('SELECT qty FROM guild_vault WHERE guild_id=? AND item_id=?').get(m.guild_id, itemId);
  if (!row || row.qty < qty) return { ok: false, error: `Kho không đủ ${it.name} (có ${row?.qty || 0}).` };

  const run = db.transaction(() => {
    if (row.qty === qty) {
      db.prepare('DELETE FROM guild_vault WHERE guild_id=? AND item_id=?').run(m.guild_id, itemId);
    } else {
      db.prepare('UPDATE guild_vault SET qty = qty - ? WHERE guild_id=? AND item_id=?')
        .run(qty, m.guild_id, itemId);
    }
    addItem(userId, itemId, qty);
  });
  run();
  return { ok: true, item: it, qty, guild: getGuild(m.guild_id) };
}

function listVault(guildId) {
  return db.prepare(`
    SELECT v.item_id, v.qty, i.name, i.tier, i.type
    FROM guild_vault v
    LEFT JOIN items i ON i.id = v.item_id
    WHERE v.guild_id = ? AND v.qty > 0
    ORDER BY i.tier DESC, i.name
  `).all(guildId);
}

module.exports = {
  CREATE_MIN_LEVEL, CREATE_COST, INVITE_EXPIRE_MS, MAX_LEVEL, TAG_RE, ROLE_RANK,
  migrate,
  xpToNext, maxMembers, getBuffs,
  getGuild, findByTag, findByName, findGuild,
  getMember, getPlayerGuild, countMembers, listMembers,
  listTop, searchGuilds,
  isOfficerPlus, isLeader,
  createGuild, createInvite, getInvite, listInvitesForUser, deleteInvite,
  acceptInvite, declineInvite,
  leaveGuild, kickMember, setRole, transferLeader, disbandGuild,
  setMotd, setDescription,
  addGuildXp, getGuildBonus,
  depositGold, withdrawGold, depositItem, withdrawItem, listVault,
};
