// Redeem code system: admin tạo code với rewards, player %redeem <code> để nhận
// Reuse applyRewards() từ lootbox
function getDb() { return require('./../db/database'); }

function migrate() {
  const db = getDb();
  // Bảng codes: mỗi code có 0..N rewards
  db.prepare(`
    CREATE TABLE IF NOT EXISTS redeem_codes (
      code TEXT PRIMARY KEY,
      description TEXT DEFAULT '',
      max_uses INTEGER DEFAULT 0,         -- 0 = unlimited
      current_uses INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      created_by TEXT DEFAULT ''
    )
  `).run();

  // Rewards của mỗi code (dùng chung schema với loot_table nhưng đơn giản hơn — không có weight)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS redeem_rewards (
      code TEXT NOT NULL,
      reward_type TEXT NOT NULL,          -- item / pet / shard / gold / xp / lootbox
      reward_id TEXT DEFAULT '',          -- '' cho gold/xp
      qty INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(code) REFERENCES redeem_codes(code) ON DELETE CASCADE
    )
  `).run();

  // Log ai đã dùng code nào (chống dùng lại)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS redeem_uses (
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      used_at INTEGER DEFAULT (strftime('%s','now')),
      PRIMARY KEY(code, user_id),
      FOREIGN KEY(code) REFERENCES redeem_codes(code) ON DELETE CASCADE
    )
  `).run();

  console.log('🎁 Redeem code system: migrated');
}

// === CRUD ===
function createCode(code, description = '', maxUses = 0, createdBy = '') {
  const db = getDb();
  const c = code.trim().toUpperCase();
  if (!c) throw new Error('Code không được rỗng');
  const existing = db.prepare('SELECT code FROM redeem_codes WHERE code=?').get(c);
  if (existing) throw new Error(`Code \`${c}\` đã tồn tại`);
  db.prepare('INSERT INTO redeem_codes (code, description, max_uses, created_by) VALUES (?, ?, ?, ?)')
    .run(c, description, maxUses, createdBy);
  return c;
}

function deleteCode(code) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  const info = db.prepare('DELETE FROM redeem_codes WHERE code=?').run(c);
  // ON DELETE CASCADE tự xoá rewards + uses
  return info.changes > 0;
}

function getCode(code) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  return db.prepare('SELECT * FROM redeem_codes WHERE code=?').get(c);
}

function listCodes() {
  const db = getDb();
  return db.prepare('SELECT * FROM redeem_codes ORDER BY created_at DESC').all();
}

function addReward(code, rewardType, rewardId, qty) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  if (!getCode(c)) throw new Error(`Code \`${c}\` không tồn tại`);
  const validTypes = ['item', 'pet', 'shard', 'gold', 'xp', 'lootbox'];
  if (!validTypes.includes(rewardType)) {
    throw new Error(`Reward type phải là: ${validTypes.join(', ')}`);
  }
  // gold/xp không cần reward_id
  const rid = (rewardType === 'gold' || rewardType === 'xp') ? '' : (rewardId || '').trim();
  if (rewardType !== 'gold' && rewardType !== 'xp' && !rid) {
    throw new Error('Cần reward_id cho type=' + rewardType);
  }
  db.prepare('INSERT INTO redeem_rewards (code, reward_type, reward_id, qty) VALUES (?, ?, ?, ?)')
    .run(c, rewardType, rid, qty);
}

function clearRewards(code) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  db.prepare('DELETE FROM redeem_rewards WHERE code=?').run(c);
}

function getRewards(code) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  return db.prepare('SELECT * FROM redeem_rewards WHERE code=? ORDER BY rowid').all(c);
}

function hasUsedCode(code, userId) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  return !!db.prepare('SELECT 1 FROM redeem_uses WHERE code=? AND user_id=?').get(c, userId);
}

function markUsed(code, userId) {
  const db = getDb();
  const c = code.trim().toUpperCase();
  db.prepare('INSERT OR IGNORE INTO redeem_uses (code, user_id) VALUES (?, ?)').run(c, userId);
  db.prepare('UPDATE redeem_codes SET current_uses = current_uses + 1 WHERE code=?').run(c);
}

// === Redeem flow ===
// Return: { ok, error?, summary?, codeRow? }
function redeem(userId, codeInput) {
  const c = (codeInput || '').trim().toUpperCase();
  if (!c) return { ok: false, error: 'Code trống.' };

  const codeRow = getCode(c);
  if (!codeRow) return { ok: false, error: `Code \`${c}\` không tồn tại hoặc đã bị xoá.` };

  if (hasUsedCode(c, userId)) {
    return { ok: false, error: `Bạn đã dùng code \`${c}\` rồi.` };
  }

  if (codeRow.max_uses > 0 && codeRow.current_uses >= codeRow.max_uses) {
    return { ok: false, error: `Code \`${c}\` đã hết lượt (${codeRow.current_uses}/${codeRow.max_uses}).` };
  }

  const rewards = getRewards(c);
  if (rewards.length === 0) {
    return { ok: false, error: `Code \`${c}\` chưa có reward nào. Báo admin.` };
  }

  // Apply rewards — reuse applyRewards() của lootbox
  // Note: type=lootbox → convert thành type=item (lootbox thực chất là item type=lootbox)
  const rewardsForApply = rewards.map(r => ({
    reward_type: r.reward_type === 'lootbox' ? 'item' : r.reward_type,
    reward_id: r.reward_id,
    qty: r.qty,
  }));
  const lootbox = require('./lootbox');
  const summary = lootbox.applyRewards(userId, rewardsForApply, 'redeem:' + c);

  // Mark used
  markUsed(c, userId);

  return { ok: true, summary, codeRow };
}

module.exports = {
  migrate,
  createCode, deleteCode, getCode, listCodes,
  addReward, clearRewards, getRewards,
  hasUsedCode, markUsed,
  redeem,
};
 
