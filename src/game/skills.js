// Skills system — 3 skills per class + basic actions
// Sync data only, không cần migrate DB (định nghĩa cứng trong code)

const SKILLS = {
  // ========== MELEE ==========
  slash: {
    id: 'slash', name: '⚔️ Slash', class: 'melee', cd: 0,
    desc: '150% ATK damage. Không cooldown.',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, Math.floor(attacker.atk * 1.5) - target.def);
      return { dmg, log: `⚔️ Slash gây **${dmg}** dmg` };
    },
  },
  whirlwind: {
    id: 'whirlwind', name: '🌪️ Whirlwind', class: 'melee', cd: 3,
    desc: '200% ATK bỏ qua DEF (armor pierce).',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, Math.floor(attacker.atk * 2.0));
      return { dmg, log: `🌪️ Whirlwind xuyên giáp **${dmg}** dmg` };
    },
  },
  charge: {
    id: 'charge', name: '🐂 Charge', class: 'melee', cd: 4,
    desc: '250% ATK + stun địch 1 turn.',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, Math.floor(attacker.atk * 2.5) - target.def);
      return { dmg, log: `🐂 Charge **${dmg}** dmg + STUN!`, applyBuff: { target: 'enemy', key: 'stun', turns: 1 } };
    },
  },

  // ========== MAGIC ==========
  fireball: {
    id: 'fireball', name: '🔥 Fireball', class: 'magic', cd: 0,
    desc: '130% ATK + burn 3 turn (10 dmg/turn).',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, Math.floor(attacker.atk * 1.3) - target.def);
      return { dmg, log: `🔥 Fireball **${dmg}** dmg + BURN`, applyBuff: { target: 'enemy', key: 'burn', turns: 3, value: 10 } };
    },
  },
  heal: {
    id: 'heal', name: '❤️ Heal', class: 'magic', cd: 3,
    desc: 'Hồi 30% max HP, xóa tất cả debuff của bản thân.',
    resolve: (attacker, target) => {
      const healAmt = Math.floor(attacker.max_hp * 0.3);
      return { dmg: 0, heal: healAmt, log: `❤️ Heal **+${healAmt}** HP`, clearOwnDebuffs: true };
    },
  },
  freeze: {
    id: 'freeze', name: '❄️ Freeze', class: 'magic', cd: 4,
    desc: '100% ATK + đóng băng địch 1 turn (không đánh được).',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, attacker.atk - target.def);
      return { dmg, log: `❄️ Freeze **${dmg}** dmg + FROZEN`, applyBuff: { target: 'enemy', key: 'freeze', turns: 1 } };
    },
  },

  // ========== RANGED ==========
  aimed_shot: {
    id: 'aimed_shot', name: '🎯 Aimed Shot', class: 'ranged', cd: 2,
    desc: '200% ATK, crit 100% (dmg x2 sau khi tính def).',
    resolve: (attacker, target) => {
      const base = Math.max(1, Math.floor(attacker.atk * 2.0) - target.def);
      const dmg = base * 2; // guaranteed crit
      return { dmg, log: `🎯 Aimed Shot CRIT **${dmg}** dmg` };
    },
  },
  volley: {
    id: 'volley', name: '🏹 Volley', class: 'ranged', cd: 2,
    desc: '3 hit × 60% ATK (tổng ~180%).',
    resolve: (attacker, target) => {
      let total = 0;
      const hits = [];
      for (let i = 0; i < 3; i++) {
        const d = Math.max(1, Math.floor(attacker.atk * 0.6) - Math.floor(target.def / 2));
        total += d;
        hits.push(d);
      }
      return { dmg: total, log: `🏹 Volley 3 hit (${hits.join('+')}) = **${total}** dmg` };
    },
  },
  trap: {
    id: 'trap', name: '🪤 Trap', class: 'ranged', cd: 3,
    desc: '100% ATK + giảm DEF địch 50% trong 3 turn.',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, attacker.atk - target.def);
      return { dmg, log: `🪤 Trap **${dmg}** dmg + DEF -50%`, applyBuff: { target: 'enemy', key: 'def_down', turns: 3, value: 0.5 } };
    },
  },
};

// Basic actions (không phụ thuộc class)
const BASIC_ACTIONS = {
  attack: {
    id: 'attack', name: '⚔️ Attack', desc: '100% ATK basic.',
    resolve: (attacker, target) => {
      const dmg = Math.max(1, attacker.atk - target.def);
      return { dmg, log: `⚔️ Attack **${dmg}** dmg` };
    },
  },
  defend: {
    id: 'defend', name: '🛡️ Defend', desc: 'Giảm 50% dmg nhận turn kế tiếp.',
    resolve: (attacker, target) => {
      return { dmg: 0, log: `🛡️ Defend — dmg -50% next turn`, applyBuff: { target: 'self', key: 'defend', turns: 1, value: 0.5 } };
    },
  },
  flee: {
    id: 'flee', name: '🏃 Flee', desc: 'Bỏ chạy (60% success, mất trận).',
    resolve: () => ({ dmg: 0, log: `🏃 Attempting to flee...`, special: 'flee' }),
  },

  // Boss-only actions (AI dùng, player không click được)
  roar: {
    id: 'roar', name: '🦁 Roar', desc: 'Giảm ATK địch 30% trong 3 turn.',
    resolve: (attacker, target) => {
      return { dmg: 0, log: `🦁 Roar — địch bị suy yếu (ATK -30% x3 turn)`, applyBuff: { target: 'enemy', key: 'atk_down', turns: 3, value: 0.3 } };
    },
  },
  rage: {
    id: 'rage', name: '💢 Rage', desc: 'Tự tăng ATK 50% trong 3 turn.',
    resolve: (attacker, target) => {
      return { dmg: 0, log: `💢 Rage — ATK của boss +50% (x3 turn)`, applyBuff: { target: 'self', key: 'atk_up', turns: 3, value: 0.5 } };
    },
  },
};

function getSkillsForClass(cls) {
  return Object.values(SKILLS).filter(s => s.class === cls);
}

function getAllActions(cls) {
  return {
    basic: BASIC_ACTIONS,
    skills: getSkillsForClass(cls),
  };
}

function getSkill(id) {
  return SKILLS[id] || BASIC_ACTIONS[id] || null;
}

// Apply buff effects turn-based
// buffs = { burn: {turns, value}, freeze: {turns}, ... }
// Returns { removed: [], appliedDmg, appliedHeal }
function tickBuffs(buffs, target) {
  let appliedDmg = 0;
  const removed = [];
  for (const key of Object.keys(buffs)) {
    const b = buffs[key];
    if (key === 'burn') {
      appliedDmg += b.value || 10;
    }
    b.turns--;
    if (b.turns <= 0) removed.push(key);
  }
  for (const k of removed) delete buffs[k];
  return { appliedDmg, removed };
}

// Check if actor can act (frozen/stunned skips turn)
function canAct(buffs) {
  if (buffs.freeze) return { ok: false, reason: '❄️ Frozen — skip turn' };
  if (buffs.stun) return { ok: false, reason: '💫 Stunned — skip turn' };
  return { ok: true };
}

// Apply defense modifier from buffs
function effectiveDef(baseDef, buffs) {
  let def = baseDef;
  if (buffs.def_down) def = Math.floor(def * (1 - buffs.def_down.value));
  return Math.max(0, def);
}

// Apply attack modifier from buffs
function effectiveAtk(baseAtk, buffs) {
  let atk = baseAtk;
  if (buffs.atk_up) atk = Math.floor(atk * (1 + buffs.atk_up.value));
  if (buffs.atk_down) atk = Math.floor(atk * (1 - buffs.atk_down.value));
  return Math.max(1, atk);
}

// Apply damage reduction from defend buff
function reduceDmg(dmg, buffs) {
  if (buffs.defend) return Math.floor(dmg * (1 - buffs.defend.value));
  return dmg;
}

module.exports = {
  SKILLS, BASIC_ACTIONS,
  getSkillsForClass, getAllActions, getSkill,
  tickBuffs, canAct, effectiveDef, effectiveAtk, reduceDmg,
};
 
