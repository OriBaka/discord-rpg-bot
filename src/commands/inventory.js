const { EmbedBuilder } = require('discord.js');
const { getPlayer, getInventory } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const { getEquipped } = require('../game/slots');
const display = require('../game/item_display');
const paginator = require('../game/paginator');

// Map các filter alias
// Trả về { types: [...], armorSlots: [...], accessoryTypes: [...], label: string }
function parseFilter(arg) {
  if (!arg) return { key: 'all', types: null, armorSlots: null, accessoryTypes: null, label: 'Tất cả' };
  const a = arg.toLowerCase();
  const filters = {
    // Type chính
    weapon:     { key: 'weapon', types: ['weapon'],   label: '🗡️ Vũ khí' },
    wp:         { key: 'weapon', types: ['weapon'],   label: '🗡️ Vũ khí' },
    vk:         { key: 'weapon', types: ['weapon'],   label: '🗡️ Vũ khí' },
    offhand:    { key: 'offhand', types: ['offhand'],  label: '🛡️ Tay phụ' },
    oh:         { key: 'offhand', types: ['offhand'],  label: '🛡️ Tay phụ' },
    'tay phụ':  { key: 'offhand', types: ['offhand'],  label: '🛡️ Tay phụ' },
    shield:     { key: 'offhand', types: ['offhand'],  label: '🛡️ Tay phụ' },
    armor:      { key: 'armor', types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    ar:         { key: 'armor', types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    giap:       { key: 'armor', types: ['armor'],    label: '🦺 Giáp (tất cả)' },
    'giáp':     { key: 'armor', types: ['armor'],    label: '🦺 Giáp (tất cả)' },

    // Theo armor_slot cụ thể
    head:       { key: 'armor', types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    mu:         { key: 'armor', types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    'mũ':       { key: 'armor', types: ['armor'], armorSlots: ['head'],  label: '⛑️ Đồ đầu' },
    chest:      { key: 'armor', types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    than:       { key: 'armor', types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    'thân':     { key: 'armor', types: ['armor'], armorSlots: ['chest'], label: '👕 Đồ thân' },
    legs:       { key: 'armor', types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    quan:       { key: 'armor', types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    'quần':     { key: 'armor', types: ['armor'], armorSlots: ['legs'],  label: '👖 Quần' },
    feet:       { key: 'armor', types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    boot:       { key: 'armor', types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    giay:       { key: 'armor', types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    'giày':     { key: 'armor', types: ['armor'], armorSlots: ['feet'],  label: '👢 Giày' },
    hands:      { key: 'armor', types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    glove:      { key: 'armor', types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    gang:       { key: 'armor', types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },
    'găng':     { key: 'armor', types: ['armor'], armorSlots: ['hands'], label: '🧤 Găng tay' },

    // Accessory
    accessory:  { key: 'accessory', types: ['accessory'], label: '✨ Phụ kiện' },
    acc:        { key: 'accessory', types: ['accessory'], label: '✨ Phụ kiện' },
    'phụ kiện': { key: 'accessory', types: ['accessory'], label: '✨ Phụ kiện' },
    ring:       { key: 'accessory', types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    nhan:       { key: 'accessory', types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    'nhẫn':     { key: 'accessory', types: ['accessory'], accessoryTypes: ['ring'],     label: '💍 Nhẫn' },
    necklace:   { key: 'accessory', types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    dc:         { key: 'accessory', types: ['accessory'], accessoryTypes: ['necklace'], label: '📿 Dây chuyền' },
    special:    { key: 'accessory', types: ['accessory'], accessoryTypes: ['special'],  label: '✨ Đặc biệt' },
    sp:         { key: 'accessory', types: ['accessory'], accessoryTypes: ['special'],  label: '✨ Đặc biệt' },

    // Khác
    consumable: { key: 'consumable', types: ['consumable'], label: '🧪 Tiêu hao' },
    potion:     { key: 'consumable', types: ['consumable'], label: '🧪 Tiêu hao' },
    binh:       { key: 'consumable', types: ['consumable'], label: '🧪 Tiêu hao' },
    'bình':     { key: 'consumable', types: ['consumable'], label: '🧪 Tiêu hao' },
    material:   { key: 'material', types: ['material'],   label: '📦 Nguyên liệu' },
    mat:        { key: 'material', types: ['material'],   label: '📦 Nguyên liệu' },
    nl:         { key: 'material', types: ['material'],   label: '📦 Nguyên liệu' },
    pet:        { key: 'pet', types: ['pet'],        label: '🐾 Pet' },
    all:        { key: 'all', types: null,           label: 'Tất cả' },
    het:        { key: 'all', types: null,           label: 'Tất cả' },
  };
  // Công cụ nghề / hộp quà: trước đây không có alias nên `%inv tool` rơi vào
  // nhánh "Filter: tool" và trả về TẤT CẢ item (không lọc gì).
  if (a === 'tool' || a === 'congcu' || a === 'công cụ') {
    return { key: 'tool', types: ['tool'], label: '🧰 Công cụ' };
  }
  if (a === 'lootbox' || a === 'box' || a === 'hopqua') {
    return { key: 'lootbox', types: ['lootbox'], label: '🎁 Hộp quà' };
  }
  return filters[a] || { key: 'custom', types: null, label: `❓ ${arg}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER TÚI ĐỒ (phân trang)
//
// Vì sao phải phân trang: đo trên DB thật, `%inv` cũ dài 5,130 ký tự với 120 loại
// item, 5,971 với 140 loại, và 6,840 với 160 loại — Discord chặn embed > 6,000
// ký tự, nên người chơi tích đồ (game có 257 loại) KHÔNG mở được túi nữa.
// ─────────────────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 12;

// Giá bán cho NPC — cùng công thức với %sell, để footer "bán hết được bao nhiêu"
// không nói dối.
function sellPriceOf(it) {
  return it.sell || Math.floor((it.price || 0) / 3) || 0;
}

function enrichInventory(userId) {
  const equipped = getEquipped(userId);
  const equippedIds = new Set(Object.values(equipped).filter(Boolean));
  const rows = getInventory(userId);
  const out = [];
  for (const row of rows) {
    const it = getItem(row.item_id);
    if (!it) continue;
    const equippedQty = equippedIds.has(it.id) ? 1 : 0;
    out.push({
      ...it,
      qty: row.qty,
      equipped: equippedQty > 0,
      free: Math.max(0, row.qty - equippedQty),
      sellPrice: sellPriceOf(it),
    });
  }
  return out;
}

function matchesFilter(it, filter) {
  if (filter.types && !filter.types.includes(it.type)) return false;
  if (filter.armorSlots && !filter.armorSlots.includes(it.armor_slot)) return false;
  if (filter.accessoryTypes && !filter.accessoryTypes.includes(it.accessory_type)) return false;
  return true;
}

// Sắp xếp: mặc định theo nhóm → tier → tên (giống bản cũ); 'value' theo tổng giá
// trị bán được; 'qty' theo số lượng.
function sortItems(items, sortBy) {
  if (sortBy === 'value') {
    return items.sort((a, b) => (b.free * b.sellPrice) - (a.free * a.sellPrice) || b.qty - a.qty || a.name.localeCompare(b.name));
  }
  if (sortBy === 'qty') {
    return items.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  }
  return items.sort((a, b) => {
    const ga = display.groupOf(a).key, gb = display.groupOf(b).key;
    const ka = display.sortGroupKeys([ga, gb]);
    if (ka[0] !== ka[1]) return ka[0] === ga ? -1 : 1;
    const ta = tierInfo(a.tier).order, tb = tierInfo(b.tier).order;
    if (tb !== ta) return tb - ta;
    return a.name.localeCompare(b.name);
  });
}

const FILTER_BUTTON_PRIORITY = [
  { key: 'mat', label: 'Nguyên liệu', emoji: '📦', test: (it) => it.type === 'material' },
  { key: 'potion', label: 'Tiêu hao', emoji: '🧪', test: (it) => it.type === 'consumable' },
  { key: 'weapon', label: 'Vũ khí', emoji: '🗡️', test: (it) => it.type === 'weapon' },
  { key: 'armor', label: 'Giáp', emoji: '🦺', test: (it) => it.type === 'armor' },
  { key: 'acc', label: 'Phụ kiện', emoji: '✨', test: (it) => it.type === 'accessory' },
  { key: 'offhand', label: 'Tay phụ', emoji: '🛡️', test: (it) => it.type === 'offhand' },
  { key: 'tool', label: 'Công cụ', emoji: '🧰', test: (it) => it.type === 'tool' },
  { key: 'lootbox', label: 'Hộp quà', emoji: '🎁', test: (it) => it.type === 'lootbox' },
];

function renderInventoryPage({ userId, filter, sort = 'default', page = 0, playerLevel = 1, replyFn }) {
  const prefix = require('../game/prefix').getPrefix();
  const all = enrichInventory(userId);
  const filterDef = parseFilter(filter);
  const filtered = sortItems(all.filter(it => matchesFilter(it, filterDef)), sort);

  // Nút lọc: chỉ hiện loại đang CÓ trong túi (tối đa 4 + All = 5 nút/row).
  const present = FILTER_BUTTON_PRIORITY.filter(f => all.some(f.test)).slice(0, 4)
    .map(f => ({ key: f.key, label: f.label, emoji: f.emoji }));
  const filterOptions = [{ key: 'all', label: 'Tất cả', emoji: '🎒' }, ...present];

  const totalValue = all.reduce((n, it) => n + (it.soulbound ? 0 : it.free * it.sellPrice), 0);
  const totalTypes = all.length;

  const { embed, components } = paginator.build({
    domain: 'inv',
    userId,
    items: filtered,
    filter: filterDef.key,
    filterOptions,
    page,
    sort,
    perPage: ITEMS_PER_PAGE,
    title: `🎒 Túi đồ — ${filterDef.label}${sort === 'value' ? ' (đắt trước)' : sort === 'qty' ? ' (nhiều trước)' : ''}`,
    color: 0xFEE75C,
    formatItem: (it, idx) => {
      // Chèn tiêu đề nhóm ở món đầu tiên của nhóm (khi sắp theo nhóm) để vẫn
      // đọc được như bản cũ, mà không cần mỗi nhóm một field.
      const g = display.groupOf(it);
      const prev = idx > 0 ? display.groupOf(filtered[idx - 1]) : null;
      const header = (sort === 'default' && (!prev || prev.key !== g.key)) ? `**${g.label}**\n` : '';
      const t = tierInfo(it.tier);
      const eq = it.equipped ? ' 🟢' : '';
      const sb = it.soulbound ? ' 🔗' : '';
      const lvReq = it.min_level || 0;
      const lvLock = (lvReq > 0 && playerLevel < lvReq) ? ` 🔒LV${lvReq}` : '';
      const val = sort === 'value' ? ` — ${it.free * it.sellPrice}💰` : '';
      return `${header}${t.emoji} ${it.name} ×${it.qty} \`${it.id}\`${eq}${sb}${lvLock}${val}`;
    },
    footer: `💰 Bán hết được ${totalValue} vàng • ${prefix}sell all để bán • ${prefix}inv value (đắt trước)`,
  });

  // Filter lạ (vd `%inv vukhi`) trước đây lặng lẽ trả về CẢ túi — nay nói rõ.
  if (filterDef.key === 'custom') {
    embed.setDescription(
      `❓ Không hiểu filter \`${filter}\`.\n` +
      `Dùng: ${['all', 'mat', 'potion', 'weapon', 'armor', 'acc', 'offhand', 'tool', 'lootbox'].map(k => `\`${prefix}inv ${k}\``).join(', ')}\n` +
      `Sắp xếp: \`${prefix}inv value\` (đắt trước), \`${prefix}inv qty\` (nhiều trước)`
    );
    return replyFn({ embeds: [embed], components });
  }

  if (filtered.length === 0) {
    embed.setDescription(
      totalTypes === 0
        ? `*Túi trống.* Đi \`${prefix}hunt\` để nhặt loot.`
        : `*Không có món nào khớp **${filterDef.label}**.*\n💡 Bỏ lọc: \`${prefix}inv\``
    );
  }
  return replyFn({ embeds: [embed], components });
}

module.exports = {
  name: 'inv',
  aliases: ['bag', 'inventory', 'tui', 'tuido'],
  description: 'Xem túi đồ (phân trang). Filter: !inv weapon | armor | mat ... • sort: !inv all value | qty',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const a0 = (args[0] || '').toLowerCase();
    // `%inv value` / `%inv qty` (không kèm filter) cũng hiểu là sắp xếp.
    let filter = args[0];
    let sort = 'default';
    if (a0 === 'value' || a0 === 'gia' || a0 === 'giatri') { filter = undefined; sort = 'value'; }
    else if (a0 === 'qty' || a0 === 'sl' || a0 === 'soluong') { filter = undefined; sort = 'qty'; }
    else {
      const a1 = (args[1] || '').toLowerCase();
      if (['value', 'gia', 'giatri'].includes(a1)) sort = 'value';
      else if (['qty', 'sl', 'soluong'].includes(a1)) sort = 'qty';
    }

    if (getInventory(msg.author.id).length === 0) {
      return msg.reply(`🎒 Túi đồ trống trơn! Đi \`${prefix}hunt\` để nhặt loot nào.`);
    }
    return renderInventoryPage({
      userId: msg.author.id,
      filter, sort, page: 0, playerLevel: p.level,
      replyFn: (opts) => msg.reply(opts),
    });
  },
  // Dùng bởi buttons.js (phân trang) và shop.js (%sell dùng lại bộ lọc)
  renderInventoryPage,
  parseFilter,
};
