const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { getPlayer, getInventory } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const { getEquipped } = require('../game/slots');

function parseFilter(arg) {
  if (!arg) return { types: null, armorSlots: null, accessoryTypes: null, label: 'Tất cả' };
  const a = arg.toLowerCase();
  const filters = {
    weapon: { types: ['weapon'], label: '🗡️ Vũ khí' },
    wp: { types: ['weapon'], label: '🗡️ Vũ khí' },
    vk: { types: ['weapon'], label: '🗡️ Vũ khí' },
    offhand: { types: ['offhand'], label: '🛡️ Tay phụ' },
    oh: { types: ['offhand'], label: '🛡️ Tay phụ' },
    'tay phụ': { types: ['offhand'], label: '🛡️ Tay phụ' },
    shield: { types: ['offhand'], label: '🛡️ Tay phụ' },
    armor: { types: ['armor'], label: '🦺 Giáp (tất cả)' },
    ar: { types: ['armor'], label: '🦺 Giáp (tất cả)' },
    giap: { types: ['armor'], label: '🦺 Giáp (tất cả)' },
    'giáp': { types: ['armor'], label: '🦺 Giáp (tất cả)' },
    head: { types: ['armor'], armorSlots: ['head'], label: '⛑️ Đồ đầu' },
    mu: { types: ['armor'], armorSlots: ['head'], label: '⛑️ Đồ đầu' },
    'mũ': { types: ['armor'], armorSlots: ['head'], label: '⛑️ Đồ đầu' },
    chest: { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    than: { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    'thân': { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    legs: { types: ['armor'], armorSlots: ['legs'], label: '👖 Quần' },
    quan: { types: ['armor'], armorSlots: ['legs'], label: '👖 Quần' },
    'quần': { types: ['armor'], armorSlots: ['legs'], label: '👖 Quần' },
    feet: { types: ['armor'], armorSlots: ['feet'], label: '👢 Giày' },
    boot: { types: ['armor'], armorSlots: ['feet'], label: '👢 Giày' },
    giay: { types: ['armor'], armorSlots: ['feet'], label: '👢 Giày' },
    'giày': { types: ['armor'], armorSlots: ['feet'], label: '👢 Giày' },
    hands: { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    glove: { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    gang: { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    'găng': { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    accessory: { types: ['accessory'], label: '✨ Phụ kiện' },
    acc: { types: ['accessory'], label: '✨ Phụ kiện' },
    'phụ kiện': { types: ['accessory'], label: '✨ Phụ kiện' },
    ring: { types: ['accessory'], accessoryTypes: ['ring'], label: '💍 Nhẫn' },
    nhan: { types: ['accessory'], accessoryTypes: ['ring'], label: '💍 Nhẫn' },
    'nhẫn': { types: ['accessory'], accessoryTypes: ['ring'], label: '💍 Nhẫn' },
    necklace: { types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    dc: { types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    special: { types: ['accessory'], accessoryTypes: ['special'], label: '✨ Đặc biệt' },
    sp: { types: ['accessory'], accessoryTypes: ['special'], label: '✨ Đặc biệt' },
    consumable: { types: ['consumable'], label: '🧪 Tiêu hao' },
    potion: { types: ['consumable'], label: '🧪 Tiêu hao' },
    binh: { types: ['consumable'], label: '🧪 Tiêu hao' },
    'bình': { types: ['consumable'], label: '🧪 Tiêu hao' },
    material: { types: ['material'], label: '📦 Nguyên liệu' },
    mat: { types: ['material'], label: '📦 Nguyên liệu' },
    nl: { types: ['material'], label: '📦 Nguyên liệu' },
    pet: { types: ['pet'], label: '🐾 Pet' },
    all: { types: null, label: 'Tất cả' },
    het: { types: null, label: 'Tất cả' },
  };
  return filters[a] || { types: null, label: `Filter: ${arg}` };
}

module.exports = {
  name: 'inv',
  aliases: ['bag', 'inventory', 'tui', 'tuido'],
  description: 'Xem túi đồ.',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const filter = parseFilter(args[0]);
    const equipped = getEquipped(msg.author.id);
    const equippedIds = new Set(Object.values(equipped));

    let items = getInventory(msg.author.id);
    if (items.length === 0) return msg.reply(`🎒 Túi đồ trống trơn! Đi \`${prefix}hunt\` để nhặt loot nào.`);

    const enriched = [];
    for (const row of items) {
      const it = getItem(row.item_id);
      if (!it) continue;
      if (filter.types && !filter.types.includes(it.type)) continue;
      if (filter.armorSlots && !filter.armorSlots.includes(it.armor_slot)) continue;
      if (filter.accessoryTypes && !filter.accessoryTypes.includes(it.accessory_type)) continue;
      enriched.push({ ...it, qty: row.qty });
    }

    if (enriched.length === 0) return msg.reply(`📭 Không có item nào khớp filter.`);

    const groups = {};
    const groupOrder = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet', 'hands', 'ring', 'necklace', 'special', 'consumable', 'material', 'pet'];
    const groupLabel = { weapon: '🗡️ Vũ khí', offhand: '🛡️ Tay phụ', head: '⛑️ Đầu', chest: '👕 Thân', legs: '👖 Quần', feet: '👢 Giày', hands: '🧤 Găng', ring: '💍 Nhẫn', necklace: '📿 Dây chuyền', special: '✨ Đặc biệt', consumable: '🧪 Tiêu hao', material: '📦 Nguyên liệu', pet: '🐾 Pet' };

    for (const it of enriched) {
      let k;
      if (it.type === 'armor') k = it.armor_slot || 'chest';
      else if (it.type === 'accessory') k = it.accessory_type || 'special';
      else k = it.type;
      (groups[k] = groups[k] || []).push(it);
    }

    const embed = new EmbedBuilder().setColor(0xFEE75C).setTitle(`🎒 Túi đồ — ${filter.label}`).setFooter({ text: `${prefix}equip  để mặc • ${prefix}use  dùng • ${prefix}sell  bán` });
    
    for (const k of groupOrder) {
      if (!groups[k]) continue;
      groups[k].sort((a, b) => tierInfo(b.tier).order - tierInfo(a.tier).order || a.name.localeCompare(b.name));
      const lines = groups[k].map(it => {
        const t = tierInfo(it.tier);
        const eq = equippedIds.has(it.id) ? ' 🟢' : '';
        const sb = it.soulbound ? ' 🔒' : '';
        return `${t.emoji} ${it.name} ×${it.qty} \`${it.id}\`${eq}${sb}`;
      });
      const text = lines.join('\n');
      if (text.length <= 1024) embed.addFields({ name: groupLabel[k] || k, value: text });
      else {
        let chunk = '', idx = 1;
        for (const ln of lines) {
          if (chunk.length + ln.length + 1 > 1024) {
            embed.addFields({ name: `${groupLabel[k] || k} (phần ${idx})`, value: chunk });
            chunk = ''; idx++;
          }
          chunk += (chunk ? '\n' : '') + ln;
        }
        if (chunk) embed.addFields({ name: `${groupLabel[k] || k} (phần ${idx})`, value: chunk });
      }
    }

    const menuOptions = enriched.sort((a, b) => tierInfo(b.tier).order - tierInfo(a.tier).order).slice(0, 25).map(it => ({
        label: `${it.name} ×${it.qty}`,
        value: `inv:${it.id}`,
        description: `ID: ${it.id} | Tier: ${it.tier}`,
    }));

    if (menuOptions.length > 0) {
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('inv:select').setPlaceholder('Chọn vật phẩm để quản lý...').addOptions(menuOptions));
      return msg.reply({ embeds: [embed], components: [row] });
    }
    return msg.reply({ embeds: [embed] });
  },
};
