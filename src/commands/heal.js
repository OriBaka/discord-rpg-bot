const { getPlayer, updatePlayer } = require('../game/player');

// Hồi máu ở "quán trọ" — tốn vàng = (max_hp - hp) * 0.5 (làm tròn lên)
module.exports = {
  name: 'heal',
  aliases: ['rest', 'quantro'],
  description: 'Vào quán trọ hồi đầy HP (tốn vàng)',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    if (p.hp >= p.max_hp) return msg.reply('💚 HP đã đầy rồi!');
    const missing = p.max_hp - p.hp;
    const cost = Math.ceil(missing * 0.5);
    if (p.gold < cost) return msg.reply(`💸 Cần **${cost}** vàng để hồi đầy. Bạn có **${p.gold}**.`);
    updatePlayer(msg.author.id, { hp: p.max_hp, gold: p.gold - cost });
    return msg.reply(`🏨 Bạn nghỉ tại quán trọ, hồi đầy HP (**${missing}**). Trả **${cost}** 💰`);
  },
};
