const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('../game/player');
const { ITEMS } = require('../game/items');
const lootbox = require('../game/lootbox');
const jobBuffs = require('../game/job_buffs');

module.exports = {
  name: 'use',
  aliases: ['dung', 'open'],
  description: 'Dùng vật phẩm tiêu hao hoặc mở hộp quà: !use <id> [qty]',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0];
    const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id || !ITEMS[id]) return msg.reply(`❌ Sai ID. Xem \`${prefix}inv\`.`);
    const it = ITEMS[id];
    if (!['consumable', 'lootbox'].includes(it.type)) {
      return msg.reply('❌ Vật phẩm này không dùng được.');
    }
    if (!hasItem(msg.author.id, id, qty)) return msg.reply(`❌ Bạn không có đủ ${qty}× vật phẩm này.`);

    // Skill tomes are not healing consumables. Validate atomically before consuming.
    const tomes = require('../game/skill_tomes');
    if (tomes.fromBook(id)) {
      if (qty !== 1) return msg.reply('Mỗi lần chỉ học một bí kíp; không tiêu sách trùng.');
      const result = tomes.learn(msg.author.id, id);
      return msg.reply(result.error || `📖 Đã học vĩnh viễn ${result.skill.name}. Dùng ${prefix}skills equip <1–4 id>, thêm ${result.skill.id} vào bộ chiêu. Áp dụng trận mới.`);
    }

    // ===== LOOTBOX =====
    if (it.type === 'lootbox') {
      const table = lootbox.getLootTable(id);
      if (table.length === 0) {
        return msg.reply(`❌ Lootbox **${it.name}** chưa có nội dung. Báo admin set bằng \`${prefix}lootbox add\`.`);
      }

      // Mở qty lần
      const allSummary = [];
      const ctx = { client: msg.client, guildId: msg.guild?.id };
      for (let i = 0; i < qty; i++) {
        removeItem(msg.author.id, id, 1);
        const { rewards } = lootbox.openLootbox(id, 1);
        const summary = lootbox.applyRewards(msg.author.id, rewards, ctx);
        allSummary.push(...summary);
      }

      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`🎁 Mở ${qty}× ${it.name}`)
        .setDescription(allSummary.length > 0 ? allSummary.join('\n') : '*(Không nhận được gì? Báo admin check loot_table)*');
      if (it.image_url) embed.setThumbnail(it.image_url);
      const { buildAgainRow } = require('../game/again_button');
      return msg.reply({ embeds: [embed], components: [buildAgainRow('use', msg.author.id, [id, String(qty)])] });
    }

    // ===== BUFF NGHỀ (đuốc / mồi câu / gia vị / dầu tôi) =====
    // Kiểm tra TRƯỚC khi trừ item: sai cấp hay sai loại thì không được mất đồ.
    const buffStat = jobBuffs.getBuffItem(id);
    if (buffStat) {
      if (qty > 1) return msg.reply('💡 Vật phẩm bổ trợ chỉ dùng 1 cái mỗi lần.');
      const res = jobBuffs.activate(msg.author.id, id);
      if (!res.ok) {
        if (res.error === 'level') {
          return msg.reply(`🔒 **${res.item.name}** cần ${res.job} Lv.${res.item.min_level} (nghề hiện tại Lv.${res.current}).`);
        }
        return msg.reply('❌ Không dùng được vật phẩm này.');
      }
      removeItem(msg.author.id, id, 1);
      const b = res.buff;
      const lines = [
        `✅ Dùng **${it.name}** — buff cho nghề **${buffStat.job}** trong **${b.charges} lượt**.`,
        `Hiệu lực: ${jobBuffs.describeItem(buffStat)}`,
      ];
      if (res.replaced) {
        const oldItem = ITEMS[res.replaced.item_id];
        lines.push(`♻️ Thay buff cũ (${oldItem?.name || res.replaced.item_id}, còn ${res.replaced.charges} lượt cùng nghề).`);
      }
      lines.push(`💡 Mỗi lần dùng lệnh nghề tốn 1 lượt; khác nghề thì buff chạy song song được.`);
      const { buildAgainRow } = require('../game/again_button');
      return msg.reply({ content: lines.join('\n'), components: [buildAgainRow('use', msg.author.id, [id])] });
    }

    // ===== CONSUMABLE thường =====
    if (qty > 1) return msg.reply('💡 Bình máu/consumable chỉ dùng 1 cái mỗi lần.');
    removeItem(msg.author.id, id, 1);
    const { buildAgainRow } = require('../game/again_button');
    const againRow = buildAgainRow('use', msg.author.id, [id]);
    // Bình hồi theo % max HP (potion_percent / potion_full): đọc heal_pct.
    // Kiểm tra TRƯỚC khi trừ bình để không mất bình khi HP đã đầy.
    const healPct = Number(it.heal_pct) || 0;
    const healAmount = it.heal || (healPct ? Math.round(p.max_hp * healPct / 100) : 0);
    if (healAmount > 0) {
      if (p.hp >= p.max_hp) {
        addItem(msg.author.id, id, 1);   // trả lại bình, không mất
        return msg.reply('💚 HP đã đầy rồi, để dành bình cho lần sau nhé!');
      }
      const newHp = Math.min(p.max_hp, p.hp + healAmount);
      const healed = newHp - p.hp;
      updatePlayer(msg.author.id, { hp: newHp });
      return msg.reply({ content: `🧪 Dùng **${it.name}**, hồi **${healed}** HP. (HP: ${newHp}/${p.max_hp})`, components: [againRow] });
    }
    return msg.reply({ content: `✅ Đã dùng **${it.name}**.`, components: [againRow] });
  },
};
