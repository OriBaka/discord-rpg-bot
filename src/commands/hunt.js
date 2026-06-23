const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addXpAndLevel, addItem } = require('../game/player');
const { pickMonsterForLevel } = require('../game/monsters');
const { simulateBattle, rollLoot } = require('../game/combat');
const { ITEMS } = require('../game/items');

const COOLDOWN_MS = 30 * 1000; // 30s giữa các lượt săn

module.exports = {
  name: 'hunt',
  aliases: ['san', 'fight', 'atk'],
  description: 'Đi săn quái vật (cooldown 30s)',
  async execute(msg) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    if (p.hp <= 0) {
      return msg.reply(`💀 Bạn đang gục! Dùng \`${prefix}heal\` hoặc \`${prefix}daily\` để hồi.`);
    }

    const now = Date.now();
    const remain = COOLDOWN_MS - (now - p.last_hunt);
    if (remain > 0) {
      return msg.reply(`⏳ Còn **${Math.ceil(remain/1000)}s** nữa mới được đi săn tiếp.`);
    }

    const monster = pickMonsterForLevel(p.level);
    const result = simulateBattle(p, monster);

    updatePlayer(msg.author.id, { hp: result.playerHpAfter, last_hunt: now });

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Đụng độ ${monster.name}!`)
      .setDescription(result.log.slice(-6).join('\n')); // chỉ in 6 dòng cuối cho gọn

    if (result.win) {
      const loot = rollLoot(monster);
      const lvl = addXpAndLevel(msg.author.id, monster.xp);
      const cur = getPlayer(msg.author.id);
      updatePlayer(msg.author.id, { gold: cur.gold + loot.gold });

      let lootText = `💰 +${loot.gold} vàng\n✨ +${monster.xp} XP`;
      for (const it of loot.items) {
        addItem(msg.author.id, it.item_id, it.qty);
        lootText += `\n📦 +${it.qty}x ${ITEMS[it.item_id]?.name || it.item_id}`;
      }
      if (lvl.levelsGained.length > 0) {
        lootText += `\n\n🎉 **LÊN CẤP!** Bạn đạt Lv.${lvl.newLevel} (HP đầy)`;
      }
      embed.setColor(0x57F287).addFields({ name: '🏆 Chiến thắng!', value: lootText });
    } else {
      embed.setColor(0xED4245).addFields({
        name: '💀 Thất bại!',
        value: `Bạn đã gục trước ${monster.name}. Dùng \`${prefix}heal\` để hồi máu.`,
      });
    }

    return msg.reply({ embeds: [embed] });
  },
};
