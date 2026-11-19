// Acquired sidegrades: source rarity is not a hidden damage multiplier.
function create({ hit, effect }) {
  const book = (s, source) => ({ ...s, book: true, source });
  const quest = { kind: 'quest', mob: 'wolf', qty: 5 };
  const shop = { kind: 'shop', price: 1800 };
  const hunt = { kind: 'hunt', mob: 'frost_revenant', chance: 0.06 };
  const boss = { kind: 'boss', mob: 'boss_wyrm', chance: 0.08 };
  const event = { kind: 'event' };
  return {
    riposte_cut: book(hit('riposte_cut', '⚔️ Riposte Cut', 'melee', 8, 2, 10, 1.25, '125% ATK và giảm 25% sát thương trực tiếp trong 1 lượt.', () => ({ applyBuff: effect('self', 'defend', 1, 0.25) })), quest),
    battle_cry: book({ id: 'battle_cry', name: '📯 Battle Cry', class: 'melee', level: 18, cd: 3, cost: 15, desc: 'Tăng 15% ATK trong 2 lượt và lấy Đà.', resolve: () => ({ log: '📯 Battle Cry: lấy Đà và tăng công.', applyBuffs: [effect('self', 'atk_up', 2, 0.15), effect('self', 'momentum', 2, 1)] }) }, shop),
    blood_rend: book(hit('blood_rend', '🩸 Blood Rend', 'melee', 30, 3, 20, 1.3, '130% ATK; chảy máu 3 lượt, mỗi lượt 10% ATK.', a => ({ applyBuff: effect('enemy', 'bleed', 3, Math.max(1, Math.round(a.atk * 0.1))) })), hunt),
    sundering_arc: book(hit('sundering_arc', '🔨 Sundering Arc', 'melee', 40, 4, 35, 1.8, '180% ATK bỏ 40% DEF; giảm 15% DEF trong 3 lượt.', () => ({ pierce: 0.4, applyBuff: effect('enemy', 'def_down', 3, 0.15) })), boss),
    lantern_oath: book({ id: 'lantern_oath', name: '🏮 Lantern Oath', class: 'melee', level: 45, cd: 4, cost: 25, desc: 'Xóa Burn/Bleed/giảm ATK; giảm 35% sát thương trực tiếp trong 2 lượt.', resolve: () => ({ log: '🏮 Lantern Oath: thanh tẩy và bảo hộ.', cleanse: ['burn', 'bleed', 'atk_down'], applyBuff: effect('self', 'defend', 2, 0.35) }) }, event),
    ember_spark: book(hit('ember_spark', '🔥 Ember Spark', 'magic', 8, 0, 0, 1.1, '110% ATK; Burn 3 lượt ×10% ATK; +4 năng lượng.', a => ({ gain: 4, applyBuff: effect('enemy', 'burn', 3, Math.max(1, Math.round(a.atk * 0.1))) })), quest),
    purifying_light: book({ id: 'purifying_light', name: '✨ Purifying Light', class: 'magic', level: 18, cd: 3, cost: 15, desc: 'Hồi 15% HP, xóa Burn/Bleed/giảm ATK; rẻ hơn Heal nhưng hồi ít hơn.', resolve: a => ({ log: '✨ Purifying Light: hồi 15% HP và thanh tẩy.', heal: Math.floor(a.max_hp * 0.15), cleanse: ['burn', 'bleed', 'atk_down'] }) }, shop),
    frost_lance: book(hit('frost_lance', '🧊 Frost Lance', 'magic', 30, 3, 25, 1.7, '170% ATK bỏ 25% DEF; giảm 15% ATK địch trong 2 lượt.', () => ({ pierce: 0.25, applyBuff: effect('enemy', 'atk_down', 2, 0.15) })), hunt),
    void_pulse: book(hit('void_pulse', '🌌 Void Pulse', 'magic', 40, 4, 35, 2.1, '210% ATK bỏ 35% DEF; tiêu Burn để tăng 20% sát thương.', (a, t) => ({ pierce: 0.35, mult: t.buffs?.burn ? 1.2 : 1, combo: !!t.buffs?.burn, consumeTarget: ['burn'] })), boss),
    festival_flare: book(hit('festival_flare', '🎆 Festival Flare', 'magic', 45, 3, 25, 1.6, '160% ATK; Burn 3 lượt ×6% ATK và giảm 20% sát thương nhận trong 1 lượt.', a => ({ applyBuffs: [effect('enemy', 'burn', 3, Math.max(1, Math.round(a.atk * 0.06))), effect('self', 'defend', 1, 0.2)] })), event),
    tracking_arrow: book(hit('tracking_arrow', '🎯 Tracking Arrow', 'ranged', 8, 1, 5, 1.2, '120% ATK, tạo Dấu săn trong 3 lượt.', () => ({ applyBuff: effect('enemy', 'mark', 3, 1) })), quest),
    hunters_breath: book({ id: 'hunters_breath', name: '🌿 Hunter Breath', class: 'ranged', level: 18, cd: 3, cost: 0, desc: 'Hồi thêm 25 năng lượng và xóa giảm ATK; không gây sát thương.', resolve: () => ({ log: '🌿 Hunter Breath: +25 năng lượng và tập trung trở lại.', gain: 25, cleanse: ['atk_down'] }) }, shop),
    barbed_arrow: book(hit('barbed_arrow', '🩸 Barbed Arrow', 'ranged', 30, 3, 20, 1.4, '140% ATK; Bleed 3 lượt ×10% ATK và tạo Dấu săn 3 lượt.', a => ({ applyBuffs: [effect('enemy', 'bleed', 3, Math.max(1, Math.round(a.atk * 0.1))), effect('enemy', 'mark', 3, 1)] })), hunt),
    falcon_dive: book(hit('falcon_dive', '🦅 Falcon Dive', 'ranged', 40, 4, 35, 2.4, '240% ATK bỏ 25% DEF; tiêu Dấu săn để tăng 20% sát thương.', (a, t) => ({ pierce: 0.25, mult: t.buffs?.mark ? 1.2 : 1, combo: !!t.buffs?.mark, consumeTarget: ['mark'] })), boss),
    lantern_volley: book(hit('lantern_volley', '🏮 Lantern Volley', 'ranged', 45, 3, 20, 1.5, '150% ATK, giảm 15% DEF và tạo Dấu săn trong 3 lượt.', () => ({ applyBuffs: [effect('enemy', 'def_down', 3, 0.15), effect('enemy', 'mark', 3, 1)] })), event),
  };
}
module.exports = { create };
