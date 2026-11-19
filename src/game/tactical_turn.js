// Rules v2: pure turn evaluation. Caller owns transaction and stale-state guard.
const skills = require('./skills');
const ENERGY_MAX = 100, ENERGY_START = 60, ENERGY_REGEN = 8;
const DEBUFFS = ['burn', 'bleed', 'def_down', 'atk_down', 'mark'];
function evaluate(b, actor, actionId) {
  const other = actor === 'a' ? 'b' : 'a';
  const skill = skills.getSkill(actionId);
  if (!skill) return { error: 'Kỹ năng không tồn tại.' };
  const isNpc = actor === 'b' && ['pve', 'tower'].includes(b.mode);
  const loadout = JSON.parse(b['skills_' + actor] || '[]');
  if (skill.bossOnly && (!isNpc || b.is_elite !== 2)) return { error: 'Kỹ năng chỉ dành cho boss.' };
  if (skill.class && (isNpc || !loadout.includes(skill.id) || skill.class !== b['class_' + actor])) return { error: 'Kỹ năng không nằm trong bộ chiêu chụp lúc vào trận.' };
  const own = JSON.parse(b['buffs_' + actor] || '{}'), enemy = JSON.parse(b['buffs_' + other] || '{}');
  const cd = JSON.parse(b['cooldowns_' + actor] || '{}');
  const can = skills.canAct(own);
  let energy = b['energy_' + actor] ?? ENERGY_START;
  if (can.ok && (cd[actionId] || 0) > 0) return { error: `Kỹ năng còn hồi ${cd[actionId]} lượt của bạn.` };
  if (can.ok && energy < (skill.cost || 0)) return { error: `Cần ${skill.cost} năng lượng; đang có ${energy}. Dùng Attack/Defend để hồi.` };
  const log = [];
  // DoT resolves before action: a dead actor cannot heal or kill after dying.
  let hp = b['hp_' + actor], targetHp = b['hp_' + other];
  const dot = ['burn', 'bleed'].reduce((n, key) => n + Math.max(0, own[key]?.value || 0), 0);
  if (dot) { hp = Math.max(0, hp - dot); log.push(`🔥 ${actor.toUpperCase()} chịu ${dot} sát thương theo lượt.`); }
  const updates = {};
  if (hp <= 0) return { updates: { ['hp_' + actor]: 0 }, log, winner: other };
  let result = {};
  if (!can.ok) log.push(can.reason);
  else {
    const attacker = { atk: skills.effectiveAtk(b['atk_' + actor], own), def: skills.effectiveDef(b['def_' + actor], own), hp, max_hp: b['max_hp_' + actor], buffs: own };
    const target = { atk: skills.effectiveAtk(b['atk_' + other], enemy), def: skills.effectiveDef(b['def_' + other], enemy), hp: targetHp, max_hp: b['max_hp_' + other], buffs: enemy };
    result = skill.resolve(attacker, target);
    log.push(result.log);
    energy -= skill.cost || 0;
    if (result.special === 'flee' && Math.random() < 0.6) return { updates: { ['hp_' + actor]: hp }, log: [...log, 'Đã chạy thoát.'], winner: 'flee_' + actor };
    const direct = skills.reduceDmg(result.dmg || 0, enemy);
    targetHp = Math.max(0, targetHp - direct);
    if (result.dmg) log.push(`💥 Thực nhận: ${direct}${direct < result.dmg ? ' (đã giảm bởi phòng thủ)' : ''}.`);
    if (result.heal) {
      const restored = Math.min(b['max_hp_' + actor] - hp, result.heal);
      hp += restored; log.push(`❤️ Hồi thực tế: ${restored} HP.`);
    }
    if (result.clearOwnDebuffs) for (const key of DEBUFFS) delete own[key];
    for (const key of result.cleanse || []) delete own[key];
    for (const key of result.consumeOwn || []) delete own[key];
    for (const key of result.consumeTarget || []) delete enemy[key];
    energy += result.gain || 0;
  }
  // Tick only existing effects belonging to the actor, not the opponent's.
  const wasControlled = !!(own.stun || own.freeze);
  skills.tickBuffs(own); // DoT already applied above, ignore returned damage.
  if (wasControlled && !own.stun && !own.freeze) own.control_guard = { turns: 1, value: 1 };
  for (const key of Object.keys(cd)) { if (--cd[key] <= 0) delete cd[key]; }
  if (can.ok && skill.cd) cd[skill.id] = skill.cd;
  for (const buff of [...(result.applyBuffs || []), ...(result.applyBuff ? [result.applyBuff] : [])]) {
    const recipient = buff.target === 'self' ? own : enemy;
    if (['stun', 'freeze'].includes(buff.key) && (recipient.control_guard || recipient.stun || recipient.freeze)) { log.push('🛡️ Mục tiêu kháng khống chế liên tiếp.'); continue; }
    // Same key refreshes; buffs never stack multiple instances.
    recipient[buff.key] = { turns: buff.turns, value: buff.value };
  }
  energy = Math.min(ENERGY_MAX, Math.max(0, energy + ENERGY_REGEN));
  log.push(`⚡ ${actor.toUpperCase()}: ${energy}/100 năng lượng.`);
  Object.assign(updates, { ['hp_' + actor]: hp, ['hp_' + other]: targetHp,
    ['buffs_' + actor]: JSON.stringify(own), ['buffs_' + other]: JSON.stringify(enemy),
    ['cooldowns_' + actor]: JSON.stringify(cd), ['energy_' + actor]: energy,
    turn: other, round: b.round + 1, last_log: log.join('\n') });
  return { updates, log, winner: targetHp <= 0 ? actor : undefined };
}
module.exports = { ENERGY_MAX, ENERGY_START, ENERGY_REGEN, evaluate };
