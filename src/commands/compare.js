// Compare 2 gear items (or 1 vs equipped)
const { EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const { getEquipped, SLOTS, isItemValidForSlot, findSlotForItem } = require('../game/slots');

function diff(a, b) {
  const d = (b || 0) - (a || 0);
  if (d === 0) return '`±0`';
  if (d > 0) return `\`+${d}\` 🟢`;
  return `\`${d}\` 🔴`;
}

function itemFieldValue(it) {
  if (!it) return '_(không có)_';
  const t = tierInfo(it.tier);
  const stats = [];
  if (it.atk) stats.push(`⚔️ ${it.atk}`);
  if (it.def) stats.push(`🛡️ ${it.def}`);
  if (it.heal) stats.push(`❤️ ${it.heal}`);
  if (it.min_level) stats.push(`🔒LV${it.min_level}`);
  if (it.class_req) stats.push(`[${it.class_req}]`);
  return `${t.emoji} **${it.name}**\n${stats.join(' • ') || '_(no stats)_'}\n💰 ${it.price || '?'} • sell ${it.sell || '?'}`;
}

function findEquippedComparable(userId, newItem) {
  const equipped = getEquipped(userId);
  // Find slot mà newItem có thể equip
  const slot = findSlotForItem(newItem);
  if (!slot) return null;
  const eqId = equipped[slot];
  if (!eqId) return null;
  return getItem(eqId);
}

module.exports = {
  name: 'compare',
  aliases: ['cmp', 'sosanh'],
  description: 'So sánh 2 gear: %compare <item1> [item2]. Nếu chỉ 1 arg → so với item đang equip cùng slot.',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` trước.`);

    const id1 = args[0];
    const id2 = args[1];
    if (!id1) {
      return msg.reply(
        `❌ Cú pháp:\n\`${prefix}compare <item1>\` — so với item đang equip\n\`${prefix}compare <item1> <item2>\` — so 2 item`
      );
    }

    const it1 = getItem(id1);
    if (!it1) return msg.reply(`❌ Item \`${id1}\` không tồn tại.`);
    if (!['weapon', 'offhand', 'armor', 'accessory'].includes(it1.type)) {
      return msg.reply(`❌ Chỉ so sánh được weapon/armor/accessory/offhand. Item \`${id1}\` là type=${it1.type}.`);
    }

    let it2 = null;
    let leftLabel = 'Item 1', rightLabel = 'Item 2';
    if (id2) {
      it2 = getItem(id2);
      if (!it2) return msg.reply(`❌ Item \`${id2}\` không tồn tại.`);
      leftLabel = `📥 ${id1}`;
      rightLabel = `📥 ${id2}`;
    } else {
      // So với item đang equip cùng slot
      it2 = findEquippedComparable(msg.author.id, it1);
      if (!it2) {
        return msg.reply(
          `💡 Bạn chưa equip gear cùng slot với **${it1.name}**.\n` +
          `Dùng \`${prefix}compare ${id1} <item2>\` để so 2 items thẳng.`
        );
      }
      leftLabel = `🆕 ${id1}`;
      rightLabel = `🟢 Đang equip: ${it2.id}`;
    }

    // Build embed 2 cột
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Compare Gear`)
      .addFields(
        { name: leftLabel, value: itemFieldValue(it1), inline: true },
        { name: rightLabel, value: itemFieldValue(it2), inline: true },
        { name: '📈 Diff (item1 → item2)', value:
          `⚔️ ATK: ${diff(it1.atk, it2.atk)}\n` +
          `🛡️ DEF: ${diff(it1.def, it2.def)}\n` +
          `❤️ Heal: ${diff(it1.heal, it2.heal)}\n` +
          `💰 Price: ${diff(it1.price, it2.price)}\n` +
          `🔒 Min LV: ${diff(it1.min_level, it2.min_level)}`
        },
      )
      .setFooter({ text: `Bạn LV${p.level} • ${prefix}equip <id> để mặc` });

    return msg.reply({ embeds: [embed] });
  },
};
 
