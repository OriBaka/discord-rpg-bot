// Explicit, deterministic stances on GEAR stats only. No timers or hidden procs.
// Sum signed points before clamping so mixed gear cancels, never grants both buffs.
const CAP = 6;
const POINTS = Object.freeze({
  ring_berserker: 3, ring_warden: -3,
  trophy_cinder_ring: 2, trophy_obsidian_pendant: -2,
  trophy_abyss_pendant: -2, trophy_glacier_sigil: -2,
  trophy_void_pendant: 2, trophy_star_ring: 2,
});
function points(item) {
  if (!item || !['weapon', 'offhand', 'armor', 'accessory'].includes(item.type)) return 0;
  if (Object.hasOwn(POINTS, item.id)) return POINTS[item.id];
  const pieces = require('./adventurer_gear').PIECES;
  for (const [prefix, sign] of [['runeforged', 1], ['rimeforged', -1], ['starforged', 1], ['emberguard', -1]]) {
    if (pieces.some(([suffix]) => item.id === `${prefix}_${suffix}`)) return sign;
  }
  return 0;
}
function score(items) {
  return Math.max(-CAP, Math.min(CAP, items.reduce((n, it) => n + points(it), 0)));
}
function apply(atk, def, items) {
  const stance = score(items);
  return { atk: Math.max(0, Math.round(atk * (1 + stance / 100))),
    def: Math.max(0, Math.round(def * (1 - stance * 2 / 100))) };
}
function describe(item) {
  const p = points(item);
  if (!p) return 'Cân bằng: không đổi hướng công/thủ.';
  return `${p > 0 ? 'Công phá' : 'Kiên thủ'}: ${p > 0 ? '+' : ''}${p} điểm hướng. Mỗi điểm: +1% ATK / −2% DEF trang bị; điểm âm đảo dấu. Cộng điểm rồi chặn −6…+6, không cộng riêng hai buff; làm tròn sau tổng, không tác động chỉ số gốc. Luôn hiệu lực khi mặc.`;
}
module.exports = { CAP, POINTS, points, score, apply, describe };
