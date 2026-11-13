const { EmbedBuilder } = require('discord.js');
const { getPlayer, getInventory } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const { getEquipped } = require('../game/slots');
const display = require('../game/item_display');

// Map các filter alias
// Trả về { types: [...], armorSlots: [...], accessoryTypes: [...], label: string }
function parseFilter(arg) {
  if (!arg) return { types: null, armorSlots: null, accessoryTypes: null, label: 'Tất cả' };
  const a = arg.toLowerCase();
  const filters = {
    // Type chính
    weapon:     { types: ['weapon'],   label: '🗡️ Vũ khí' },
    wp:         { types: ['weapon'],   label: '🗡️ Vũ khí' },
    vk:         { types: ['weapon'],   label: '🗡️ Vũ khí' },
    offhand:    { types: ['offhand'],  label: '🛡️ Tay phụ' },
    oh:         { types: ['offhand'],  label: '🛡️ Tay phụ' },
    'tay phụ':  { types: ['offhand'],  label: '🛡️ Tay phụ' },
    shield:     { types: ['offhand'],  label: '🛡️ Tay phụ' },
    armor:      { types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    ar:         { types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    giap:       { types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    'giáp':     { types: ['armor'],    label: '🦺 Giáp (tất cả)' },

    // Theo armor_slot cụ thể
    head:       { types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    mu:         { types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    'mũ':       { types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    chest:      { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    than:       { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    'thân':     { types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    legs:       { types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    quan:       { types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    'quần':     { types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    feet:       { types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    boot:       { types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    giay:       { types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    'giày':     { types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    hands:      { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    glove:      { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    gang:       { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    'găng':     { types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },

    // Accessory
    accessory:  { types: ['accessory'], label: '✨ Phụ kiện' },
    acc:        { types: ['accessory'], label: '✨ Phụ kiện' },
    'phụ kiện': { types: ['accessory'], label: '✨ Phụ kiện' },
    ring:       { types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    nhan:       { types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    'nhẫn':     { types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    necklace:   { types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    dc:         { types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    special:    { types: ['accessory'], accessoryTypes: ['special'],  label: '✨ Đặc biệt' },
    sp:         { types: ['accessory'], accessoryTypes: ['special'],  label: '✨ Đặc biệt' },

    // Khác
    consumable: { types: ['consumable'], label: '🧪 Tiêu hao' },
    potion:     { types: ['consumable'], label: '🧪 Tiêu hao' },
    binh:       { types: ['consumable'], label: '🧪 Tiêu hao' },
    'bình':     { types: ['consumable'], label: '🧪 Tiêu hao' },
    material:   { types: ['material'],   label: '📦 Nguyên liệu' },
    mat:        { types: ['material'],   label: '📦 Nguyên liệu' },
    nl:         { types: ['material'],   label: '📦 Nguyên liệu' },
    pet:        { types: ['pet'],        label: '🐾 Pet' },
    all:        { types: null,           label: 'Tất cả' },
    het:        { types: null,           label: 'Tất cả' },
  };
  return filters[a] || { types: null, label: `Filter: ${arg}` };
}

module.exports = {
  name: 'inv',
  aliases: ['bag', 'inventory', 'tui', 'tuido'],
  description: 'Xem túi đồ. Có filter: !inv weapon | armor | head | ring | mat ...',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const filter = parseFilter(args[0]);
    const equipped = getEquipped(msg.author.id);
    const equippedIds = new Set(Object.values(equipped));

    let items = getInventory(msg.author.id);
    if (items.length === 0) {
      return msg.reply(`🎒 Túi đồ trống trơn! Đi \`${prefix}hunt\` để nhặt loot nào.`);
    }

    // Enrich + filter
    const enriched = [];
    for (const row of items) {
      const it = getItem(row.item_id);
      if (!it) continue;
      if (filter.types && !filter.types.includes(it.type)) continue;
      if (filter.armorSlots && !filter.armorSlots.includes(it.armor_slot)) continue;
      if (filter.accessoryTypes && !filter.accessoryTypes.includes(it.accessory_type)) continue;
      enriched.push({ ...it, qty: row.qty });
    }

    if (enriched.length === 0) {
      return msg.reply(`📭 Không có item nào trong túi khớp filter **${filter.label}**.`);
    }

    // Group: armor tách theo armor_slot, accessory tách theo accessory_type.
    //
    // Bản cũ duyệt `groupOrder` viết cứng rồi `if (!groups[k]) continue` — nghĩa
    // là nhóm nào KHÔNG có trong danh sách đó thì bị bỏ khỏi túi đồ, không báo
    // gì. Item type lạ (vd lootbox do admin tạo) vì thế "biến mất" khỏi %inv
    // dù vẫn nằm trong DB. Nay nhãn/thứ tự lấy từ item_display và nhóm lạ được
    // xếp cuối, KHÔNG bị bỏ.
    const groups = {};
    const groupLabel = {};
    for (const it of enriched) {
      const g = display.groupOf(it);
      groupLabel[g.key] = g.label;
      (groups[g.key] = groups[g.key] || []).push(it);
    }
    const orderedKeys = display.sortGroupKeys(Object.keys(groups));

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle(`🎒 Túi đồ — ${filter.label}`)
      .setFooter({ text: `${prefix}equip <id> để mặc • ${prefix}use <id> dùng • ${prefix}sell <id> bán` });

    for (const k of orderedKeys) {
      if (!groups[k]) continue;
      groups[k].sort((a, b) => {
        const ta = tierInfo(a.tier).order, tb = tierInfo(b.tier).order;
        if (tb !== ta) return tb - ta;
        return a.name.localeCompare(b.name);
      });
      const lines = groups[k].map(it => {
        const t = tierInfo(it.tier);
        const eq = equippedIds.has(it.id) ? ' 🟢' : '';
        const sb = it.soulbound ? ' 🔗' : '';
        const lvReq = it.min_level || 0;
        const lvLock = (lvReq > 0 && p.level < lvReq) ? ` 🔒LV${lvReq}` : '';
        return `${t.emoji} ${it.name} ×${it.qty} \`${it.id}\`${eq}${sb}${lvLock}`;
      });
      const text = lines.join('\n');
      if (text.length <= 1024) {
        embed.addFields({ name: groupLabel[k] || k, value: text });
      } else {
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

    return msg.reply({ embeds: [embed] });
  },
};
