const { getPlayer } = require('../game/player');
const { getItem } = require('../game/items');
const { SLOTS, SLOT_ORDER, getEquipped, setEquipped } = require('../game/slots');

// Danh sách slot lấy từ slots.js (nguồn duy nhất), không chép tay.
//
// Bản cũ viết cứng 11 slot: thêm slot mới vào slots.js (vd 'cape') thì
// `%unequip all` lặng lẽ BỎ QUA slot đó — người chơi tháo "tất cả" mà vẫn còn
// đồ trên người, không hiểu vì sao. Pet để riêng: nó không phải trang bị
// thường và `%unequip pet` có alias riêng.
const ALL_ACTIVE_SLOTS = SLOT_ORDER.filter(s => s !== 'pet');
const ALL_ARMOR_SLOTS = SLOT_ORDER.filter(s => ['head', 'chest', 'legs', 'feet', 'hands'].includes(s));
const ALL_ACCESSORY_SLOTS = SLOT_ORDER.filter(s => ['ring1', 'ring2', 'necklace', 'special'].includes(s));

// Map alias → slot id(s)
const SLOT_ALIASES = {
  // Vũ khí & tay phụ
  weapon: ['weapon'], wp: ['weapon'], vk: ['weapon'], 'vũ khí': ['weapon'],
  offhand: ['offhand'], oh: ['offhand'], shield: ['offhand'], 'tay phụ': ['offhand'],

  // Armor parts
  head: ['head'], mu: ['head'], 'mũ': ['head'],
  chest: ['chest'], than: ['chest'], 'thân': ['chest'], ao: ['chest'], 'áo': ['chest'],
  legs: ['legs'], quan: ['legs'], 'quần': ['legs'],
  feet: ['feet'], boot: ['feet'], giay: ['feet'], 'giày': ['feet'],
  hands: ['hands'], glove: ['hands'], gang: ['hands'], 'găng': ['hands'],
  armor: ALL_ARMOR_SLOTS, giap: ALL_ARMOR_SLOTS, 'giáp': ALL_ARMOR_SLOTS,

  // Accessory
  ring: ['ring1', 'ring2'], rings: ['ring1', 'ring2'], nhan: ['ring1', 'ring2'], 'nhẫn': ['ring1', 'ring2'],
  ring1: ['ring1'], ring2: ['ring2'],
  necklace: ['necklace'], neck: ['necklace'], 'dây chuyền': ['necklace'], dc: ['necklace'],
  special: ['special'], sp: ['special'], 'đặc biệt': ['special'],
  accessory: ALL_ACCESSORY_SLOTS, acc: ALL_ACCESSORY_SLOTS, 'phụ kiện': ALL_ACCESSORY_SLOTS,

  // Pet
  pet: ['pet'],

  // Tất cả
  all: ALL_ACTIVE_SLOTS, '*': ALL_ACTIVE_SLOTS, het: ALL_ACTIVE_SLOTS, 'hết': ALL_ACTIVE_SLOTS,
};

module.exports = {
  name: 'unequip',
  aliases: ['unequipall', 'thao', 'thaodb'],
  description: 'Tháo trang bị: !unequip <slot|all>',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const slotArg = (args[0] || 'all').toLowerCase();
    const targetSlots = SLOT_ALIASES[slotArg];
    if (!targetSlots) {
      return msg.reply(
        `❌ Slot không hợp lệ. Các lựa chọn:\n` +
        // Sinh từ slots.js: thêm slot mới là tự hiện trong gợi ý.
        `**Slot cụ thể**: ${SLOT_ORDER.map(s => `\`${s}\``).join(' ')}\n` +
        `**Nhóm**: \`armor\` (5 slot giáp), \`accessory\` (4 phụ kiện), \`ring\` (cả 2 nhẫn), \`all\` (tất cả)`
      );
    }

    const equipped = getEquipped(msg.author.id);
    const removed = [];
    for (const slot of targetSlots) {
      if (!equipped[slot]) continue;
      const it = getItem(equipped[slot]);
      const slotInfo = SLOTS[slot];
      removed.push(`${slotInfo?.name || slot}: ${it?.name || equipped[slot]}`);
      setEquipped(msg.author.id, slot, null);
    }

    if (removed.length === 0) {
      return msg.reply(`💡 Không có gì để tháo trong các slot đã chọn.`);
    }

    return msg.reply(
      `✅ Đã tháo ${removed.length} trang bị:\n` +
      removed.map(r => `   • ${r}`).join('\n') + '\n\n' +
      `💡 Vật phẩm vẫn ở trong túi, dùng \`${prefix}equip <id>\` để mặc lại.`
    );
  },
};
