// Turn-based battle engine — PvE (mob) and PvP (duel)
// State stored in DB, updated per action
const skills = require('./skills');

function getDb() { return require('./../db/database'); }

function migrate() {
  const db = getDb();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,                       -- 'pve' | 'pvp'
      channel_id TEXT NOT NULL,
      message_id TEXT DEFAULT '',
      user_a TEXT NOT NULL,                     -- player 1 (attacker)
      user_b TEXT DEFAULT '',                   -- player 2 (nếu pvp)
      monster_id TEXT DEFAULT '',               -- mob id (nếu pve)
      is_elite INTEGER DEFAULT 0,               -- 0=normal, 1=elite (x3 hp), 2=boss (x10 hp + AI)
      hp_a INTEGER NOT NULL,
      hp_b INTEGER NOT NULL,
      max_hp_a INTEGER NOT NULL,
      max_hp_b INTEGER NOT NULL,
      atk_a INTEGER NOT NULL,
      atk_b INTEGER NOT NULL,
      def_a INTEGER NOT NULL,
      def_b INTEGER NOT NULL,
      turn TEXT DEFAULT 'a',                    -- 'a' or 'b'
      round INTEGER DEFAULT 1,
      cooldowns_a TEXT DEFAULT '{}',
      cooldowns_b TEXT DEFAULT '{}',
      buffs_a TEXT DEFAULT '{}',
      buffs_b TEXT DEFAULT '{}',
      status TEXT DEFAULT 'active',             -- active | ended | timeout
      winner TEXT DEFAULT '',                   -- 'a' | 'b' | 'draw'
      last_log TEXT DEFAULT '',                 -- combat log của round vừa rồi
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `).run();

  // Elite monsters — thêm cột elite_tier vào monsters
  try {
    db.prepare('SELECT elite_tier FROM monsters LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE monsters ADD COLUMN elite_tier INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 Đã thêm cột elite_tier vào monsters (0=normal, 1=elite, 2=boss)');
  }

  console.log('⚔️ Battle system: migrated');
}

// === CRUD ===
function createBattle(data) {
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO battles (mode, channel_id, user_a, user_b, monster_id, is_elite,
      hp_a, hp_b, max_hp_a, max_hp_b, atk_a, atk_b, def_a, def_b, turn)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.mode, data.channel_id, data.user_a, data.user_b || '',
    data.monster_id || '', data.is_elite || 0,
    data.hp_a, data.hp_b, data.max_hp_a, data.max_hp_b,
    data.atk_a, data.atk_b, data.def_a, data.def_b,
    data.turn || 'a'
  );
  return info.lastInsertRowid;
}

function getBattle(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM battles WHERE id=?').get(id);
}

function updateBattle(id, fields) {
  const db = getDb();
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sql = `UPDATE battles SET ${keys.map(k => k + '=?').join(', ')}, updated_at=strftime('%s','now') WHERE id=?`;
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}

function setMessageId(id, messageId) {
  updateBattle(id, { message_id: messageId });
}

// === Turn processing ===
// action: skill id ('slash', 'attack', 'defend', 'flee', ...)
// actor: 'a' or 'b'
// Returns: { newBattleState, log, ended }
function processAction(battle, actor, actionId) {
  const skill = skills.getSkill(actionId);
  if (!skill) return { error: `Skill '${actionId}' không tồn tại` };

  const other = actor === 'a' ? 'b' : 'a';
  const attackerBuffs = JSON.parse(battle['buffs_' + actor] || '{}');
  const targetBuffs = JSON.parse(battle['buffs_' + other] || '{}');
  const cooldowns = JSON.parse(battle['cooldowns_' + actor] || '{}');

  // Check cooldown
  if (skill.cd > 0 && cooldowns[skill.id] > 0) {
    return { error: `${skill.name} còn CD ${cooldowns[skill.id]} turn.` };
  }

  // Check if actor can act
  const actCheck = skills.canAct(attackerBuffs);
  if (!actCheck.ok) {
    // Auto skip turn
    const log = [actCheck.reason];
    // Tick buffs on actor
    const tickSelf = skills.tickBuffs(attackerBuffs, actor);
    if (tickSelf.appliedDmg > 0) {
      const newHp = Math.max(0, battle['hp_' + actor] - tickSelf.appliedDmg);
      log.push(`🔥 ${actor === 'a' ? 'Bạn' : 'Địch'} bị burn ${tickSelf.appliedDmg} dmg`);
      updateBattle(battle.id, {
        ['hp_' + actor]: newHp,
        ['buffs_' + actor]: JSON.stringify(attackerBuffs),
        turn: other,
        round: battle.round + 1,
        last_log: log.join('\n'),
      });
      if (newHp <= 0) return endBattle(battle.id, other, log);
    } else {
      updateBattle(battle.id, {
        ['buffs_' + actor]: JSON.stringify(attackerBuffs),
        turn: other,
        round: battle.round + 1,
        last_log: log.join('\n'),
      });
    }
    return { log, skipped: true };
  }

  // Build stat objects (áp dụng buff atk_up/atk_down/def_down)
  const attacker = {
    atk: skills.effectiveAtk(battle['atk_' + actor], attackerBuffs),
    def: skills.effectiveDef(battle['def_' + actor], attackerBuffs),
    hp: battle['hp_' + actor],
    max_hp: battle['max_hp_' + actor],
  };
  const target = {
    atk: skills.effectiveAtk(battle['atk_' + other], targetBuffs),
    def: skills.effectiveDef(battle['def_' + other], targetBuffs),
    hp: battle['hp_' + other],
    max_hp: battle['max_hp_' + other],
  };

  // Resolve skill
  const result = skill.resolve(attacker, target);
  const log = [result.log];

  // Handle special (flee)
  if (result.special === 'flee') {
    if (Math.random() < 0.6) {
      log.push(`✅ Chạy thoát!`);
      return endBattle(battle.id, 'flee_' + actor, log);
    } else {
      log.push(`❌ Chạy thất bại.`);
    }
  }

  // Apply damage to target (reduce by defend buff)
  let newTargetHp = target.hp;
  if (result.dmg > 0) {
    const finalDmg = skills.reduceDmg(result.dmg, targetBuffs);
    if (finalDmg < result.dmg) log.push(`🛡️ Defend reduce to **${finalDmg}**`);
    newTargetHp = Math.max(0, target.hp - finalDmg);
  }

  // Apply heal to attacker
  let newAttackerHp = attacker.hp;
  if (result.heal) {
    newAttackerHp = Math.min(attacker.max_hp, attacker.hp + result.heal);
  }

  // Clear own debuffs (for heal) — trước khi tick
  if (result.clearOwnDebuffs) {
    for (const k of ['burn', 'freeze', 'stun', 'def_down']) delete attackerBuffs[k];
    log.push('✨ Xóa hết debuff');
  }

  // Tick buffs của CẢ HAI — TRƯỚC khi apply buff mới
  // Tick attacker (defend/atk_up expire, burn tick nếu attacker bị burn)
  const tickAttacker = skills.tickBuffs(attackerBuffs, actor);
  if (tickAttacker.appliedDmg > 0) {
    newAttackerHp = Math.max(0, newAttackerHp - tickAttacker.appliedDmg);
    log.push(`🔥 ${actor === 'a' ? 'Bạn' : 'Địch'} bị burn ${tickAttacker.appliedDmg} dmg`);
  }
  // Tick target (burn on target)
  const tickTarget = skills.tickBuffs(targetBuffs, other);
  if (tickTarget.appliedDmg > 0) {
    newTargetHp = Math.max(0, newTargetHp - tickTarget.appliedDmg);
    log.push(`🔥 ${other === 'a' ? 'Bạn' : 'Địch'} bị burn ${tickTarget.appliedDmg} dmg`);
  }

  // Apply buff (SAU tick để buff mới có full turns)
  if (result.applyBuff) {
    const buffTarget = result.applyBuff.target === 'self' ? attackerBuffs : targetBuffs;
    buffTarget[result.applyBuff.key] = { turns: result.applyBuff.turns, value: result.applyBuff.value };
  }

  // Set cooldown for skill
  if (skill.cd > 0) {
    cooldowns[skill.id] = skill.cd;
  }

  // Tick cooldowns (giảm 1 turn cho mọi skill đang CD, trừ skill vừa dùng)
  for (const k of Object.keys(cooldowns)) {
    if (k === skill.id) continue; // skip skill vừa cast
    cooldowns[k] = Math.max(0, cooldowns[k] - 1);
    if (cooldowns[k] === 0) delete cooldowns[k];
  }

  // Save state
  const updates = {
    ['hp_' + actor]: newAttackerHp,
    ['hp_' + other]: newTargetHp,
    ['buffs_' + actor]: JSON.stringify(attackerBuffs),
    ['buffs_' + other]: JSON.stringify(targetBuffs),
    ['cooldowns_' + actor]: JSON.stringify(cooldowns),
    turn: other,
    round: battle.round + 1,
    last_log: log.join('\n'),
  };
  updateBattle(battle.id, updates);

  // Check end condition
  if (newTargetHp <= 0) return endBattle(battle.id, actor, log);
  if (newAttackerHp <= 0) return endBattle(battle.id, other, log);

  return { log, ended: false };
}

function endBattle(id, winner, log) {
  updateBattle(id, { status: 'ended', winner });
  const battle = getBattle(id);
  return { log, ended: true, winner, battle };
}

// AI đơn giản cho mob PvE: chọn action ngẫu nhiên nhưng ưu tiên attack
function pickMobAction(battle) {
  // Boss có AI đơn giản: turn 3 dùng roar (giảm atk player), turn 6 dùng rage
  if (battle.is_elite === 2) {
    if (battle.round % 6 === 0) {
      return 'rage';
    }
    if (battle.round % 3 === 0) {
      return 'roar';
    }
  }
  return 'attack';
}

module.exports = {
  migrate,
  createBattle, getBattle, updateBattle, setMessageId,
  processAction, pickMobAction, endBattle,
};
 
