const { getPlayer, updatePlayer } = require('../game/player');
const { getItem } = require('../game/items');

module.exports = {
  name: 'unequip',
  aliases: ['unequipall', 'thaodb', 'thao'],
  description: 'Tháo trang bị: !unequip weapon | armor | all',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const slot = (args[0] || 'all').toLowerCase();

    // Map các alias slot
    const slotMap = {
      weapon: 'weapon', wp: 'weapon', vk: 'weapon', 'vũ khí': 'weapon',
      armor: 'armor', ar: 'armor', giap: 'armor', 'giáp': 'armor',
      all: 'all', '*': 'all', het: 'all', 'hết': 'all',
    };
    const target = slotMap[slot];
    if (!target) {
      return msg.reply(
        `❌ Cú pháp: \`${prefix}unequip <weapon|armor|all>\`\n` +
        `Vd: \`${prefix}unequip weapon\`, \`${prefix}unequip all\``
      );
    }

    const removed = [];
    const fields = {};

    if ((target === 'weapon' || target === 'all') && p.weapon_id) {
      const it = getItem(p.weapon_id);
      removed.push(`🗡️ ${it?.name || p.weapon_id}`);
      fields.weapon_id = null;
    }
    if ((target === 'armor' || target === 'all') && p.armor_id) {
      const it = getItem(p.armor_id);
      removed.push(`🦺 ${it?.name || p.armor_id}`);
      fields.armor_id = null;
    }

    if (removed.length === 0) {
      const what = target === 'weapon' ? 'vũ khí' : target === 'armor' ? 'giáp' : 'trang bị';
      return msg.reply(`💡 Bạn chưa mang ${what} nào để tháo.`);
    }

    updatePlayer(msg.author.id, fields);
    return msg.reply(
      `✅ Đã tháo ${removed.length} trang bị:\n` +
      removed.map(r => `   • ${r}`).join('\n') + '\n\n' +
      `💡 Vật phẩm vẫn ở trong túi, dùng \`${prefix}equip <id>\` để mặc lại.`
    );
  },
}; 
