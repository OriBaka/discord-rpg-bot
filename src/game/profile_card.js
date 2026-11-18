const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
GlobalFonts.registerFromPath(path.join(__dirname, '../../assets/fonts/DejaVuSans.ttf'), 'CardSans');
const backgrounds = new Map();
const CLASS = { melee: ['WARRIOR', 'volcano'], magic: ['MAGE', 'astral_ruins'], ranged: ['RANGER', 'forest'] };
const plain = value => String(value || '').replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '').trim();
async function renderCard(userId) {
  const player = require('./player'); const p = player.getPlayer(userId);
  if (!p) return null;
  const stats = player.getEffectiveStats(p);
  const guild = require('./guilds').getPlayerGuild(userId);
  const pet = require('./pets').getActivePet(userId);
  const look = require('./gold_sinks').appearance(userId);
  const aura = require('./aura').get(userId);
  const [cls, zone] = CLASS[p.primary_class] || ['NOVICE', 'cave'];
  if (!backgrounds.has(zone)) backgrounds.set(zone, loadImage(path.join(__dirname, '../../assets/zones', zone + '.png')).catch(err => { backgrounds.delete(zone); throw err; }));
  const background = await backgrounds.get(zone);
  const c = createCanvas(1000, 600); const ctx = c.getContext('2d');
  const accent = '#' + (look.color?.color || 0xd9b375).toString(16).padStart(6, '0');
  ctx.imageSmoothingEnabled = false; ctx.drawImage(background, 0, 0, 1000, 600);
  ctx.fillStyle = '#0c100de8'; ctx.fillRect(30, 30, 940, 540);
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(40, 40, 920, 520);
  function text(value, x, y, size, color = '#e9eadd', width = 850) {
    ctx.font = `${size}px CardSans`; ctx.fillStyle = color;
    let s = plain(value); while (ctx.measureText(s).width > width && s.length) s = Array.from(s).slice(0, -1).join('');
    ctx.fillText(s, x, y);
  }
  text('HỘI QUÁN / ADVENTURER RECORD', 72, 84, 13, accent);
  text(p.name, 72, 145, 36, '#f5eedf', 680);
  text(look.title?.name || 'Nhà thám hiểm', 74, 177, 17, accent, 680);
  text(cls, 72, 222, 15, '#a7b498'); text('Lv. ' + p.level, 784, 143, 28, accent, 150);
  const need = player.xpToNext(p.level); const ratio = Math.max(0, Math.min(1, p.xp / need));
  ctx.fillStyle = '#303b2d'; ctx.fillRect(72, 244, 856, 12); ctx.fillStyle = accent; ctx.fillRect(72, 244, Math.round(856 * ratio), 12);
  text(`XP  ${p.xp} / ${need}`, 72, 284, 13, '#aeb7a6');
  for (const [i, [label, value]] of [['HP', `${p.hp} / ${p.max_hp}`], ['ATK', stats.atk], ['DEF', stats.def]].entries()) {
    const x = 72 + i * 290; ctx.fillStyle = '#242e23'; ctx.fillRect(x, 308, 274, 79);
    text(label, x + 18, 335, 12, '#aeb7a6', 240); text(value, x + 18, 369, 25, '#f0e7d6', 240);
  }
  text('BANG HỘI', 72, 425, 11, accent); text(guild ? `[${guild.tag}] ${guild.name}` : 'Độc hành', 72, 454, 17, '#e9eadd', 410);
  text('PET ĐỒNG HÀNH', 520, 425, 11, accent); text(pet?.name || 'Chưa chọn pet', 520, 454, 17, '#e9eadd', 405);
  text(aura?.active_stat ? `AURA / ${aura.active_tier.toUpperCase()} / ${aura.active_stat.toUpperCase()} +${aura.active_percent}%` : 'AURA / Chưa kích hoạt', 72, 510, 16, accent, 850);
  text('Chỉ số hiện tại · Bao gồm trang bị và Aura · Không bao gồm bonus pet riêng của PvP', 72, 541, 10, '#a1ab98');
  return c.encode('png');
}
module.exports = { renderCard };
