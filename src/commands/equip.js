const { getPlayer, hasItem } = require('../game/player');
const { getItem } = require('../game/items');
const { canEquipItem, classInfo } = require('../game/classes');
const { SLOTS, getEquipped, setEquipped, findSlotForItem, isItemValidForSlot } = require('../game/slots');

module.exports = {
  name: 'equip',
  aliases: ['trangbi', 'mac'],
  description: 'Trang bị: !equip <id> [slot]. Vd: !equip silver_ring ring2',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0];
    const slotArg = args[1]?.toLowerCase();
    if (!id) return msg.reply(
      `❌ Cú pháp: \`${prefix}equip <id> [slot]\`\n` +
      `Vd: \`${prefix}equip dragon_sword\`, \`${prefix}equip silver_ring ring2\``
    );

    const it = getItem(id);
    if (!it) return msg.reply(`❌ Item \`${id}\` không tồn tại.`);
    if (!['weapon', 'offhand', 'armor', 'accessory'].includes(it.type)) {
      return msg.reply('❌ Vật phẩm này không thể trang bị (không phải vũ khí/giáp/phụ kiện).');
    }
    if (!hasItem(msg.author.id, id, 1)) return msg.reply('❌ Bạn không có vật phẩm này trong túi.');

    // Check class
    const check = canEquipItem(p, it);
    if (!check.ok) {
      if (check.reason === 'no_class') {
        return msg.reply(`🚫 Vật phẩm này yêu cầu class. Bạn chưa chọn class!\nDùng \`${prefix}class\` để xem.`);
      }
      if (check.reason === 'wrong_class') {
        const req = classInfo(check.required);
        return msg.reply(
          `🚫 **${it.name}** chỉ dành cho ${req?.name || check.required}.\n` +
          `Class hiện tại của bạn: ${classInfo(p.primary_class)?.name || 'Chưa chọn'}`
        );
      }
    }

    // Xác định slot
    const equipped = getEquipped(msg.author.id);
    let targetSlot = slotArg;
    if (targetSlot) {
      // User chỉ định slot — kiểm tra hợp lệ
      if (!SLOTS[targetSlot]) {
        return msg.reply(`❌ Slot không tồn tại. Các slot: ${Object.keys(SLOTS).join(', ')}`);
      }
      if (!isItemValidForSlot(it, targetSlot)) {
        const slot = SLOTS[targetSlot];
        const expected = slot.accessory_type
          ? `phụ kiện loại "${slot.accessory_type}"`
          : `loại "${slot.item_type}"`;
        return msg.reply(`❌ Slot **${slot.name}** chỉ nhận ${expected}.`);
      }
    } else {
      // Tự tìm slot
      targetSlot = findSlotForItem(it, equipped);
      if (!targetSlot) return msg.reply('❌ Không tìm thấy slot phù hợp cho item này.');
      if (targetSlot === 'pet') {
        return msg.reply('🐾 Pet sẽ được hỗ trợ ở Phase 3. Hiện chưa có gì.');
      }
    }

    const oldItemId = equipped[targetSlot];
    setEquipped(msg.author.id, targetSlot, id);

    const slot = SLOTS[targetSlot];
    let reply = `✅ Đã trang bị **${it.name}** vào ô **${slot.name}**!`;
    if (oldItemId && oldItemId !== id) {
      const oldIt = getItem(oldItemId);
      reply += `\n💼 Đã tháo **${oldIt?.name || oldItemId}** vào túi.`;
    }
    return msg.reply(reply);
  },
};
