const { EmbedBuilder } = require('discord.js');
const { getPlayer, getEffectiveStats, xpToNext } = require('../game/player');
const { getItem } = require('../game/items');
const { classInfo, getClassData } = require('../game/classes');
const { SLOTS, SLOT_ORDER, getEquipped, getTotalBonus } = require('../game/slots');
const pets = require('../game/pets');

// Lấy emoji ngắn cho mỗi slot (chỉ icon, không có chữ)
const SLOT_EMOJI = {
  weapon: '🗡️', offhand: '🛡️',
  head: '⛑️', chest: '👕', legs: '👖', feet: '👢', hands: '🧤',
  ring1: '💍', ring2: '💍', necklace: '📿', special: '✨',
  pet: '🐾',
};

module.exports = {
  name: 'me',
  aliases: ['profile', 'tt', 'nv'],
  description: 'Xem thông tin nhân vật',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Bạn chưa có nhân vật. Gõ \`${prefix}start\` để tạo!`);

    const eff = getEffectiveStats(p);
    const bonus = getTotalBonus(msg.author.id);
    const equipped = getEquipped(msg.author.id);
    const need = xpToNext(p.level);
    const cls = p.primary_class ? classInfo(p.primary_class) : null;
    const data = getClassData(p);
    const unlockedClasses = Object.keys(data);
    const classLine = cls
      ? `${cls.name}${unlockedClasses.length > 1 ? ` *(+${unlockedClasses.length - 1} class khác)*` : ''}`
      : `❓ *Chưa chọn — dùng* \`${prefix}class pick\``;

    // ===== Active pet =====
    const activePet = pets.getActivePet(msg.author.id);

    // ===== Compact gear list =====
    const gearParts = [];
    let equippedCount = 0;
    for (const slotId of SLOT_ORDER) {
      const emoji = SLOT_EMOJI[slotId] || '◽';
      if (slotId === 'pet') {
        // Active pet hiện ở đây
        if (activePet) {
          gearParts.push(`${emoji} ${activePet.icon} ${activePet.name}`);
          equippedCount++;
        } else {
          gearParts.push(`${emoji} \`—\``);
        }
        continue;
      }
      const itemId = equipped[slotId];
      if (itemId) {
        const it = getItem(itemId);
        gearParts.push(`${emoji} ${it?.name?.replace(/^[^\s]+\s/, '') || itemId}`);
        equippedCount++;
      } else {
        gearParts.push(`${emoji} \`—\``);
      }
    }
    const totalSlots = SLOT_ORDER.length;
    const gearStr = gearParts.join(' • ');

    const embed = new EmbedBuilder()
      .setColor(cls?.color || 0x5865F2)
      .setTitle(`📜 ${p.name}`)
      .setDescription(
        `🎭 **${cls ? cls.name : 'Chưa chọn class'}** • Lv. **${p.level}** (${p.xp}/${need} XP)`
      )
      .addFields(
        { name: '❤️ HP',    value: `${p.hp}/${p.max_hp}`, inline: true },
        { name: '⚔️ ATK',   value: `**${eff.atk}** *(+${bonus.atk})*`, inline: true },
        { name: '🛡️ DEF',   value: `**${eff.def}** *(+${bonus.def})*`, inline: true },
        { name: '💰 Vàng',  value: `${p.gold}`, inline: true },
        { name: '🎯 Slot',  value: `${equippedCount}/${totalSlots}`, inline: true },
        { name: bonus.heal > 0 ? '❤️ Hồi/trận' : '\u200B', value: bonus.heal > 0 ? `+${bonus.heal}` : '\u200B', inline: true },
        { name: '💼 Trang bị', value: gearStr },
      )
      .setFooter({ text: `${prefix}gear xem chi tiết • ${prefix}inv xem túi đồ` });

    return msg.reply({ embeds: [embed] });
  },
};
