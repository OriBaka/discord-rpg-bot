const db = require('../db/database');
const { getPlayer, updatePlayer } = require('../game/player');

const HEAL_CD_MS = 10 * 60 * 1000; // 10 phút

// Đảm bảo cột last_heal tồn tại (migrate nhẹ)
try {
  db.prepare('SELECT last_heal FROM players LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE players ADD COLUMN last_heal INTEGER NOT NULL DEFAULT 0');
  console.log('🔧 Đã thêm cột last_heal vào bảng players');
}

function formatRemain(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.ceil((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

module.exports = {
  name: 'heal',
  aliases: ['rest', 'quantro'],
  description: 'Vào quán trọ hồi đầy HP (tốn vàng theo level + cooldown 10 phút)',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    if (p.hp >= p.max_hp) return msg.reply('💚 HP đã đầy rồi!');

    // Check cooldown
    const now = Date.now();
    const lastHeal = p.last_heal || 0;
    const remain = HEAL_CD_MS - (now - lastHeal);
    if (remain > 0) {
      return msg.reply(
        `⏳ Quán trọ đang đông khách! Còn **${formatRemain(remain)}** nữa mới được nghỉ tiếp.\n` +
        `💡 Trong lúc đợi, hãy dùng \`${prefix}use potion_s\` (hoặc các bình lớn hơn) để hồi máu.`
      );
    }

    // Tính chi phí: (HP thiếu × 0.5) + (level × 15)
    const missing = p.max_hp - p.hp;
    const hpCost = Math.ceil(missing * 0.5);
    const lvCost = p.level * 15;
    const cost = hpCost + lvCost;

    if (p.gold < cost) {
      return msg.reply(
        `💸 Cần **${cost}** 💰 để hồi đầy (HP: ${hpCost}, phí Lv.${p.level}: ${lvCost}).\n` +
        `Bạn có **${p.gold}** 💰. Thử dùng bình máu rẻ hơn: \`${prefix}use potion_s\`.`
      );
    }

    updatePlayer(msg.author.id, {
      hp: p.max_hp,
      gold: p.gold - cost,
      last_heal: now,
    });

    return msg.reply(
      `🏨 Bạn nghỉ tại quán trọ, hồi đầy **${missing}** HP.\n` +
      `💰 Trả **${cost}** vàng (HP: ${hpCost} + phí cao cấp: ${lvCost})\n` +
      `⏳ Lần heal tiếp theo: 10 phút nữa.`
    );
  },
};
