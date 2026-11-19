// Tactical skill catalog. All direct hits share the same proportional mitigation.
const { mitigation } = require('./mitigation');
const mitigated = (atk, def) => Math.max(1, Math.round(Math.max(1, atk) * (1 - mitigation(def))));
const effect = (target, key, turns, value) => ({ target, key, turns, value });
function hit(id, name, cls, level, cd, cost, multiplier, desc, extra = () => ({})) {
  return { id, name, class: cls, level, cd, cost, desc, resolve: (a, t) => {
    const details = extra(a, t);
    const dmg = mitigated(a.atk * multiplier * (details.mult || 1), t.def * (1 - (details.pierce || 0)));
    return { ...details, dmg, log: `${name}: ${dmg} sát thương${details.combo ? ' · COMBO!' : ''}` };
  } };
}
const SKILLS = {
  slash: hit('slash', '⚔️ Slash', 'melee', 1, 0, 0, 1.5, '150% ATK; tạo Đà 2 lượt, +8 năng lượng.', () => ({ gain: 8, applyBuff: effect('self', 'momentum', 2, 1) })),
  whirlwind: hit('whirlwind', '🌪️ Whirlwind', 'melee', 1, 3, 25, 2, '200% ATK, bỏ 50% DEF; tiêu Đà để tăng 25% sát thương.', a => ({ pierce: 0.5, mult: a.buffs?.momentum ? 1.25 : 1, combo: !!a.buffs?.momentum, consumeOwn: ['momentum'] })),
  charge: hit('charge', '🐂 Charge', 'melee', 1, 4, 30, 1.6, '160% ATK, choáng 1 lượt; sau khống chế có miễn khống chế 1 lượt.', () => ({ applyBuff: effect('enemy', 'stun', 1, 1) })),
  guard_break: hit('guard_break', '🔨 Guard Break', 'melee', 12, 2, 20, 1.3, '130% ATK, giảm 25% DEF trong 3 lượt.', () => ({ applyBuff: effect('enemy', 'def_down', 3, 0.25) })),
  iron_guard: { id: 'iron_guard', name: '🛡️ Iron Guard', class: 'melee', level: 25, cd: 3, cost: 15,
    desc: 'Giảm 40% sát thương trực tiếp nhận trong 2 lượt, tạo Đà.', resolve: () => ({ dmg: 0, log: '🛡️ Iron Guard: thủ thế và lấy Đà.', applyBuffs: [effect('self', 'defend', 2, 0.4), effect('self', 'momentum', 2, 1)] }) },
  execute: hit('execute', '🪓 Execute', 'melee', 40, 4, 35, 1.8, '180% ATK; mục tiêu dưới 35% HP: ×1.6 sát thương.', (a, t) => ({ mult: t.hp / t.max_hp < 0.35 ? 1.6 : 1, combo: t.hp / t.max_hp < 0.35 })),
  fireball: hit('fireball', '🔥 Fireball', 'magic', 1, 0, 0, 1.3, '130% ATK; thiêu đốt 3 lượt, mỗi lượt 8% ATK; +8 năng lượng.', a => ({ gain: 8, applyBuff: effect('enemy', 'burn', 3, Math.max(1, Math.round(a.atk * 0.08))) })),
  heal: { id: 'heal', name: '❤️ Heal', class: 'magic', level: 1, cd: 3, cost: 25, desc: 'Hồi 25% HP tối đa và xóa debuff (không xóa khống chế để tự thoát lượt).', resolve: a => ({ heal: Math.floor(a.max_hp * 0.25), clearOwnDebuffs: true, log: '❤️ Heal: hồi 25% HP và thanh tẩy.' }) },
  freeze: hit('freeze', '❄️ Freeze', 'magic', 1, 4, 25, 1, '100% ATK, đóng băng 1 lượt; sau khống chế có miễn khống chế 1 lượt.', () => ({ applyBuff: effect('enemy', 'freeze', 1, 1) })),
  arcane_burst: hit('arcane_burst', '🔮 Arcane Burst', 'magic', 12, 2, 25, 1.7, '170% ATK; tiêu thiêu đốt của địch để tăng 35% sát thương.', (a, t) => ({ mult: t.buffs?.burn ? 1.35 : 1, combo: !!t.buffs?.burn, consumeTarget: ['burn'] })),
  barrier: { id: 'barrier', name: '🔷 Barrier', class: 'magic', level: 25, cd: 3, cost: 15, desc: 'Giảm 45% sát thương trực tiếp trong 2 lượt; không chặn DoT.', resolve: () => ({ log: '🔷 Barrier: bảo hộ 2 lượt.', applyBuff: effect('self', 'defend', 2, 0.45) }) },
  meteor: hit('meteor', '☄️ Meteor', 'magic', 40, 4, 40, 2.6, '260% ATK; tiêu thiêu đốt để bỏ thêm 50% DEF.', (a, t) => ({ pierce: t.buffs?.burn ? 0.5 : 0, combo: !!t.buffs?.burn, consumeTarget: ['burn'] })),
  aimed_shot: hit('aimed_shot', '🎯 Aimed Shot', 'ranged', 1, 2, 25, 3.2, '320% ATK; tiêu Dấu săn để tăng 25% sát thương.', (a, t) => ({ mult: t.buffs?.mark ? 1.25 : 1, combo: !!t.buffs?.mark, consumeTarget: ['mark'] })),
  volley: hit('volley', '🏹 Volley', 'ranged', 1, 2, 15, 1.8, 'Loạt tên tổng 180% ATK; tạo Dấu săn 3 lượt.', () => ({ applyBuff: effect('enemy', 'mark', 3, 1) })),
  trap: hit('trap', '🪤 Trap', 'ranged', 1, 3, 10, 1, '100% ATK; giảm 35% DEF trong 3 lượt và tạo Dấu săn.', () => ({ applyBuffs: [effect('enemy', 'def_down', 3, 0.35), effect('enemy', 'mark', 3, 1)] })),
  steady_aim: { id: 'steady_aim', name: '👁️ Steady Aim', class: 'ranged', level: 12, cd: 3, cost: 10, desc: 'Tăng 20% ATK trong 2 lượt; tạo Dấu săn cho mục tiêu.', resolve: () => ({ log: '👁️ Steady Aim: tập trung và đánh dấu.', applyBuffs: [effect('self', 'atk_up', 2, 0.2), effect('enemy', 'mark', 3, 1)] }) },
  evasive_step: { id: 'evasive_step', name: '💨 Evasive Step', class: 'ranged', level: 25, cd: 3, cost: 10, desc: 'Giảm 50% sát thương trực tiếp trong 1 lượt, xóa giảm DEF/ATK.', resolve: () => ({ log: '💨 Evasive Step: rút về vị trí an toàn.', cleanse: ['def_down', 'atk_down'], applyBuff: effect('self', 'defend', 1, 0.5) }) },
  piercing_arrow: hit('piercing_arrow', '🏹 Piercing Arrow', 'ranged', 40, 3, 30, 2, '200% ATK bỏ 60% DEF; tiêu Dấu săn để tăng 20% sát thương.', (a, t) => ({ pierce: 0.6, mult: t.buffs?.mark ? 1.2 : 1, combo: !!t.buffs?.mark, consumeTarget: ['mark'] })),
};
const BASIC_ACTIONS = {
  attack: { id: 'attack', name: '⚔️ Attack', cost: 0, cd: 0, desc: '100% ATK, +18 năng lượng.', resolve: (a, t) => ({ dmg: mitigated(a.atk, t.def), gain: 18, log: '⚔️ Đánh thường (+18 năng lượng).' }) },
  defend: { id: 'defend', name: '🛡️ Defend', cost: 0, cd: 0, desc: 'Giảm 50% sát thương trực tiếp lượt địch kế, +18 năng lượng.', resolve: () => ({ gain: 18, log: '🛡️ Phòng thủ (+18 năng lượng).', applyBuff: effect('self', 'defend', 1, 0.5) }) },
  flee: { id: 'flee', name: '🏃 Flee', cost: 0, cd: 0, desc: '60% cơ hội thoát; thất bại mất lượt.', resolve: () => ({ dmg: 0, special: 'flee', log: '🏃 Tìm đường thoát.' }) },
  roar: { id: 'roar', name: '🦁 Roar', cost: 0, cd: 0, bossOnly: true, desc: 'Giảm 30% ATK địch 3 lượt.', resolve: () => ({ log: '🦁 Roar: giảm 30% ATK.', applyBuff: effect('enemy', 'atk_down', 3, 0.3) }) },
  rage: { id: 'rage', name: '💢 Rage', cost: 0, cd: 0, bossOnly: true, desc: 'Tăng 50% ATK trong 3 lượt.', resolve: () => ({ log: '💢 Rage: boss tăng 50% ATK.', applyBuff: effect('self', 'atk_up', 3, 0.5) }) },
};
const getSkillsForClass = cls => Object.values(SKILLS).filter(s => s.class === cls);
const getSkill = id => Object.hasOwn(SKILLS, id) ? SKILLS[id] : Object.hasOwn(BASIC_ACTIONS, id) ? BASIC_ACTIONS[id] : null;
// Tick only at the END of the affected owner's turn. The engine applies DoT at
// START of that turn; DOT ticks are never also applied to the other actor.
function tickBuffs(buffs) {
  const removed = []; let appliedDmg = 0;
  for (const [key, b] of Object.entries(buffs)) {
    if (['burn', 'bleed'].includes(key)) appliedDmg += Math.max(0, b.value || 0);
    if (--b.turns <= 0) { removed.push(key); delete buffs[key]; }
  }
  return { removed, appliedDmg };
}
function canAct(buffs) {
  return buffs.freeze ? { ok: false, reason: '❄️ Đóng băng — mất lượt' } : buffs.stun ? { ok: false, reason: '💫 Choáng — mất lượt' } : { ok: true };
}
const effectiveDef = (base, buffs) => Math.max(0, Math.floor(base * (1 - (buffs.def_down?.value || 0))));
const effectiveAtk = (base, buffs) => Math.max(1, Math.floor(base * (1 + (buffs.atk_up?.value || 0)) * (1 - (buffs.atk_down?.value || 0))));
const reduceDmg = (dmg, buffs) => Math.max(0, Math.floor(dmg * (1 - Math.min(0.6, buffs.defend?.value || 0))));
module.exports = { SKILLS, BASIC_ACTIONS, getSkill, getSkillsForClass, getAllActions: cls => ({ basic: BASIC_ACTIONS, skills: getSkillsForClass(cls) }), mitigated, tickBuffs, canAct, effectiveDef, effectiveAtk, reduceDmg };
