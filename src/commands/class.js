const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer, updatePlayer, removeItem } = require('../game/player');
const {
  CLASSES, classInfo, getAllClasses,
  isClassDisabled, getDisabledReason,
  getClassData, initClassFor, saveClassData,
  setPrimaryClass, syncPrimaryClassData,
  unlockClass: doUnlockClass,
  checkUnlockRequirements, UNLOCK_REQUIREMENTS,
} = require('../game/classes');

function classListEmbed(prefix) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎭 Hệ thống Class')
    .setDescription([
      'Mỗi class có chỉ số gốc & growth riêng. Item legendary thường yêu cầu class cụ thể.',
      '',
      `**Chọn class lần đầu:** \`${prefix}class pick <melee|magic|ranged>\``,
      `**Xem class hiện tại:** \`${prefix}class\``,
      `**Đổi class đã unlock:** \`${prefix}class switch <id>\``,
      `**Unlock class mới:** \`${prefix}class unlock <id>\` (cần Lv.${UNLOCK_REQUIREMENTS.min_primary_level}+ và Huy Hiệu tương ứng)`,
    ].join('\n'));

  for (const c of getAllClasses()) {
    const disabled = isClassDisabled(c.id);
    const reason = disabled ? `\n🚫 *Khoá bởi admin: ${getDisabledReason(c.id) || 'không rõ'}*` : '';
    embed.addFields({
      name: `${c.name} \`${c.id}\``,
      value: `${c.desc}\n📊 Base: HP **${c.base.hp}** ATK **${c.base.atk}** DEF **${c.base.def}**\n📈 /lv: +${c.growth.hp} HP, +${c.growth.atk} ATK, +${c.growth.def} DEF${reason}`,
      inline: false,
    });
  }
  return embed;
}

module.exports = {
  name: 'class',
  aliases: ['cls', 'lop'],
  description: 'Hệ thống class. !class, !class pick, !class switch, !class unlock',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ====== Xem class hiện tại ======
    if (!sub || sub === 'info' || sub === 'me') {
      // Nếu chưa chọn class
      if (!p.primary_class) {
        const embed = classListEmbed(prefix);
        embed.setFooter({ text: `Bạn chưa chọn class. Dùng ${prefix}class pick <id>` });
        return msg.reply({ embeds: [embed] });
      }

      const cur = classInfo(p.primary_class);
      const data = getClassData(p);
      const unlockedList = Object.keys(data);
      const unlockedText = unlockedList.map(cid => {
        const c = classInfo(cid);
        const d = data[cid];
        const mark = cid === p.primary_class ? '✅ ' : '⬜ ';
        return `${mark}${c?.name || cid} — Lv.${d.level} (HP ${d.max_hp}, ATK ${d.atk}, DEF ${d.def})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(cur?.color || 0x5865F2)
        .setTitle(`🎭 Class của ${p.name}`)
        .setDescription(`Class hiện tại: **${cur?.name || p.primary_class}**\n*${cur?.desc || ''}*`)
        .addFields(
          { name: '📜 Các class đã unlock', value: unlockedText || '—' },
          { name: '💡 Lệnh', value:
            `\`${prefix}class switch <id>\` — đổi sang class khác đã unlock\n` +
            `\`${prefix}class unlock <id>\` — học class mới\n` +
            `\`${prefix}class list\` — xem mô tả các class` },
        );
      return msg.reply({ embeds: [embed] });
    }

    // ====== Danh sách class ======
    if (sub === 'list' || sub === 'all') {
      return msg.reply({ embeds: [classListEmbed(prefix)] });
    }

    // ====== Pick class lần đầu ======
    if (sub === 'pick' || sub === 'choose') {
      if (p.primary_class) {
        return msg.reply(
          `❌ Bạn đã chọn class **${classInfo(p.primary_class)?.name}** rồi!\n` +
          `Dùng \`${prefix}class switch\` hoặc \`${prefix}class unlock\`.`
        );
      }
      const id = (args[1] || '').toLowerCase();
      if (!CLASSES[id]) {
        return msg.reply(`❌ Class không hợp lệ. Chọn: ${Object.keys(CLASSES).join(' / ')}`);
      }
      if (isClassDisabled(id)) {
        return msg.reply(`🚫 Class **${CLASSES[id].name}** đang bị khoá. Lý do: ${getDisabledReason(id) || 'không rõ'}`);
      }

      // Init class data
      const data = getClassData(p);
      data[id] = initClassFor(id);
      saveClassData(msg.author.id, data);

      // Set primary + đồng bộ chỉ số từ class
      const cd = data[id];
      db.prepare(`UPDATE players SET
        primary_class = ?, level = 1, xp = 0,
        hp = ?, max_hp = ?, atk = ?, def = ?
        WHERE user_id = ?`)
        .run(id, cd.hp, cd.max_hp, cd.atk, cd.def, msg.author.id);

      const c = classInfo(id);
      const embed = new EmbedBuilder()
        .setColor(c.color)
        .setTitle(`🎉 Đã chọn class: ${c.name}`)
        .setDescription(c.desc)
        .addFields(
          { name: '❤️ HP',  value: `${c.base.hp}`, inline: true },
          { name: '⚔️ ATK', value: `${c.base.atk}`, inline: true },
          { name: '🛡️ DEF', value: `${c.base.def}`, inline: true },
          { name: '💡 Tip', value: `Mỗi class có item riêng. Vào \`${prefix}shop\` xem đồ phù hợp.` },
        );
      return msg.reply({ embeds: [embed] });
    }

    // ====== Switch class đã unlock ======
    if (sub === 'switch' || sub === 'use' || sub === 'set') {
      const id = (args[1] || '').toLowerCase();
      if (!CLASSES[id]) return msg.reply(`❌ Class không hợp lệ.`);
      if (isClassDisabled(id)) {
        return msg.reply(`🚫 Class này đang bị khoá: ${getDisabledReason(id)}`);
      }
      if (id === p.primary_class) {
        return msg.reply(`💡 Bạn đang dùng class này rồi.`);
      }

      // Lưu chỉ số class hiện tại
      syncPrimaryClassData(msg.author.id);

      // Switch
      const ok = setPrimaryClass(msg.author.id, id);
      if (!ok) {
        return msg.reply(`❌ Bạn chưa unlock class này. Dùng \`${prefix}class unlock ${id}\`.`);
      }

      // Bỏ trang bị vũ khí/giáp/phụ kiện class-locked (giữ accessory chung)
      const { clearEquipped, getEquipped } = require('../game/slots');
      const { getItem } = require('../game/items');
      const { canEquipItem } = require('../game/classes');
      const newPlayer = getPlayer(msg.author.id);
      const equipped = getEquipped(msg.author.id);
      let removedCount = 0;
      for (const slot of Object.keys(equipped)) {
        const it = getItem(equipped[slot]);
        if (!it) continue;
        const ck = canEquipItem(newPlayer, it);
        if (!ck.ok) {
          clearEquipped(msg.author.id, slot);
          removedCount++;
        }
      }

      const c = classInfo(id);
      const removeNote = removedCount > 0
        ? `\n⚠️ Đã tháo **${removedCount}** trang bị không tương thích. Dùng \`${prefix}gear\` xem lại, \`${prefix}equip\` lại nếu cần.`
        : '';
      return msg.reply(
        `🔄 Đã chuyển sang **${c.name}**!\n` +
        `📊 Chỉ số đã đồng bộ với class này.${removeNote}`
      );
    }

    // ====== Unlock class mới ======
    if (sub === 'unlock' || sub === 'learn') {
      const id = (args[1] || '').toLowerCase();
      if (!CLASSES[id]) return msg.reply(`❌ Class không hợp lệ.`);

      const check = checkUnlockRequirements(p, id);
      if (!check.ok) {
        const reasons = {
          already_unlocked: `✅ Bạn đã unlock class này rồi! Dùng \`${prefix}class switch ${id}\`.`,
          class_disabled:   `🚫 Class này đang bị admin khoá: ${getDisabledReason(id)}`,
          no_primary:       `❌ Bạn phải chọn class đầu tiên trước. Dùng \`${prefix}class pick\`.`,
          low_level:        `❌ Bạn cần đạt Lv.${check.required} ở class chính trước (hiện ${p.level}).`,
          no_token:         `❌ Bạn cần có **🎖️ Huy Hiệu** của class này (\`${check.token}\`). Săn boss hoặc nhận từ admin.`,
        };
        return msg.reply(reasons[check.reason] || `❌ Không thể unlock: ${check.reason}`);
      }

      // Trừ token
      removeItem(msg.author.id, check.token, 1);
      // Unlock
      doUnlockClass(msg.author.id, id);

      const c = classInfo(id);
      return msg.reply(
        `🎉 Đã unlock class **${c.name}**! (đã tốn 1 Huy Hiệu)\n` +
        `📊 Lv.1 mới — chỉ số: HP ${c.base.hp}, ATK ${c.base.atk}, DEF ${c.base.def}\n` +
        `🔄 Dùng \`${prefix}class switch ${id}\` để chuyển sang class này.`
      );
    }

    return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}class\` để xem hướng dẫn.`);
  },
};
