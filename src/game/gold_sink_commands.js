const sinks = require('./gold_sinks');
const { getPrefix } = require('./prefix');
async function cosmetics(msg, args) {
  const p = getPrefix();
  const [action, id] = args;
  if (action === 'buy') {
    if (args[2] !== 'confirm') return msg.reply(`Mua vĩnh viễn, không hoàn vàng. Dùng \`${p}me buy <id> confirm\`. Giá: ${sinks.COSMETICS[id]?.price ?? '?'} vàng.`);
    const r = sinks.purchase(msg.author.id, id);
    return msg.reply(r.error || `✅ Đã mua, tiêu ${r.spent} vàng. Dùng \`${p}me equip ${id}\` để áp dụng.`);
  }
  if (action === 'equip') {
    const r = sinks.equip(msg.author.id, id);
    return msg.reply(r.error || '✅ Đã đổi ngoại hình miễn phí.');
  }
  const owned = new Set(require('../db/database').prepare('SELECT cosmetic_id FROM cosmetic_owned WHERE user_id=?').all(msg.author.id).map(r => r.cosmetic_id));
  return msg.reply('🎨 **Ngoại hình hồ sơ — chỉ trang trí, không cộng chỉ số**\n' + Object.entries(sinks.COSMETICS).map(([id, c]) => `\`${id}\` · ${c.name} · ${c.type} · ${c.price} vàng${owned.has(id) ? ' · ✅ Đã sở hữu' : ''}`).join('\n') +
    `\n${p}me buy <id> confirm — mua vĩnh viễn\n${p}me equip <id> — dùng món đã mua\n${p}me equip default_color / default_title — về mặc định miễn phí`);
}
async function buildings(msg, args) {
  const p = getPrefix();
  const guild = require('./guilds').getPlayerGuild(msg.author.id);
  if (!guild) return msg.reply('Bạn chưa vào bang.');
  if (args[0] === 'contribute') {
    if (args[3] !== 'confirm') return msg.reply(`Đóng góp không hoàn lại, không vào kho rút được. Dùng \`${p}guild building contribute <id> <vàng> confirm\`.`);
    const raw = args[2] || '';
    const amount = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const r = sinks.contribute(msg.author.id, args[1], amount);
    return msg.reply(r.error || `✅ Đã tiêu ${r.spent} vàng cho công trình.${r.complete ? ' Công trình lên cấp!' : ''} Không hoàn lại.`);
  }
  return msg.reply('🏗️ **Công trình bang hội — trang trí, không buff chiến đấu/thu nhập**\n' + sinks.buildings(guild.id).map(b =>
    `${b.icon} **${b.name}** \`${b.id}\` Lv.${b.level}/3 · ${b.level === 3 ? 'Hoàn tất' : `${b.funded}/${b.costs[b.level]} vàng cho cấp tiếp`}\n${b.desc}`
  ).join('\n\n') + `\nMọi thành viên có thể góp vàng cá nhân: \`${p}guild building contribute <id> <vàng> confirm\`. Chỉ trừ tối đa phần còn thiếu của cấp hiện tại. Không hoàn lại khi rời/giải tán bang.`);
}
module.exports = { cosmetics, buildings };
