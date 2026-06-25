// Admin lệnh quản lý lootbox content (loot_table)
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const lootbox = require('../game/lootbox');
const { getItem } = require('../game/items');
const pets = require('../game/pets');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

const ALLOWED_TYPES = ['item', 'pet', 'shard', 'gold', 'xp'];

module.exports = {
  name: 'lootbox',
  aliases: ['lb', 'box'],
  description: 'Admin: quản lý nội dung lootbox',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');

    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🎁 Lootbox Admin')
        .setDescription([
          `**Tạo lootbox** = tạo item type=lootbox trước:`,
          `\`${prefix}item create event_box name="Event Box" type=lootbox tier=epic desc="..."\``,
          '',
          `**Quản lý loot table**:`,
          `\`${prefix}lootbox view <lootbox_id>\` — xem nội dung`,
          `\`${prefix}lootbox add <lootbox_id> <type> <id> <qty_min> <qty_max> <weight> [guaranteed]\``,
          `\`${prefix}lootbox remove <lootbox_id> <type> <id>\``,
          `\`${prefix}lootbox clear <lootbox_id>\` — xóa hết nội dung`,
          `\`${prefix}lootbox simulate <lootbox_id> [rolls]\` — mô phỏng mở (không tốn item)`,
          '',
          `**Type**: \`item\` | \`pet\` | \`shard\` | \`gold\` | \`xp\``,
          `**Guaranteed = 1**: luôn cấp (ngoài rolls random)`,
          '',
          `**Ví dụ**:`,
          `\`${prefix}lootbox add event_box item potion_l 1 3 50\` (50% weight, qty 1-3)`,
          `\`${prefix}lootbox add event_box pet pet_void_cat 1 1 5\` (rare reward)`,
          `\`${prefix}lootbox add event_box gold 100 500 30\` (random gold 100-500)`,
          `\`${prefix}lootbox add event_box xp 50 100 30 1\` (guaranteed +50-100 XP)`,
        ].join('\n'))] });
    }

    // === view ===
    if (sub === 'view' || sub === 'show') {
      const lbId = args[1];
      if (!lbId) return msg.reply('❌ Thiếu lootbox_id.');
      const it = getItem(lbId);
      if (!it) return msg.reply(`❌ Item \`${lbId}\` không tồn tại.`);
      const table = lootbox.getLootTable(lbId);
      if (table.length === 0) return msg.reply(`💡 Lootbox \`${lbId}\` chưa có nội dung.`);

      const totalWeight = table.filter(e => !e.guaranteed).reduce((s, e) => s + e.weight, 0);
      const lines = table.map(e => {
        const tag = e.guaranteed ? '⭐ GUARANTEED' : `${e.weight}/${totalWeight} (${(e.weight/totalWeight*100).toFixed(1)}%)`;
        const id = e.reward_id ? ` \`${e.reward_id}\`` : '';
        const qty = e.qty_min === e.qty_max ? `${e.qty_min}` : `${e.qty_min}-${e.qty_max}`;
        return `${tag} | ${e.reward_type}${id} × ${qty}`;
      });
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`🎁 ${it.name} — Loot Table`)
        .setDescription(lines.join('\n'))] });
    }

    // === add ===
    if (sub === 'add') {
      const [_, lbId, rewardType, rewardId, qmin, qmax, weight, guaranteed] = args;
      if (!lbId || !rewardType) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox add <id> <type> <reward_id> <qmin> <qmax> <weight> [guaranteed]\``);
      const it = getItem(lbId);
      if (!it) return msg.reply(`❌ Lootbox item \`${lbId}\` không tồn tại.`);
      if (it.type !== 'lootbox') return msg.reply(`❌ Item \`${lbId}\` không phải type=lootbox.`);
      if (!ALLOWED_TYPES.includes(rewardType)) return msg.reply(`❌ Type phải là: ${ALLOWED_TYPES.join('/')}`);

      // Validate reward_id (cho item/pet/shard)
      if (rewardType === 'item' && !getItem(rewardId)) return msg.reply(`❌ Item \`${rewardId}\` không tồn tại.`);
      if (rewardType === 'pet' && !pets.getPet(rewardId)) return msg.reply(`❌ Pet \`${rewardId}\` không tồn tại.`);

      // Với gold/xp, reward_id không cần (đặt rỗng), arg shift
      let realRewardId = rewardId;
      let realQmin = parseInt(qmin);
      let realQmax = parseInt(qmax);
      let realWeight = parseInt(weight);
      let realGuaranteed = parseInt(guaranteed);
      if (rewardType === 'gold' || rewardType === 'xp') {
        // Format: <type> <qmin> <qmax> <weight> [guaranteed]
        realRewardId = '';
        realQmin = parseInt(rewardId);
        realQmax = parseInt(qmin);
        realWeight = parseInt(qmax);
        realGuaranteed = parseInt(weight);
      }

      if (isNaN(realQmin) || isNaN(realQmax) || isNaN(realWeight)) {
        return msg.reply('❌ qty_min, qty_max, weight phải là số.');
      }

      lootbox.addLootEntry(lbId, {
        reward_type: rewardType,
        reward_id: realRewardId,
        qty_min: realQmin,
        qty_max: realQmax,
        weight: realWeight,
        guaranteed: realGuaranteed === 1,
      });
      return msg.reply(`✅ Đã thêm entry vào \`${lbId}\`.`);
    }

    // === remove ===
    if (sub === 'remove' || sub === 'rm') {
      const [_, lbId, rewardType, rewardId] = args;
      if (!lbId || !rewardType) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox remove <id> <type> [reward_id]\``);
      const ok = lootbox.removeLootEntry(lbId, rewardType, rewardId || '');
      return msg.reply(ok ? '🗑️ Đã xóa entry.' : '❌ Không tìm thấy entry.');
    }

    // === clear ===
    if (sub === 'clear') {
      const lbId = args[1];
      if (!lbId) return msg.reply('❌ Thiếu lootbox_id.');
      if (args[2] !== 'confirm') return msg.reply(`⚠️ Xác nhận: \`${prefix}lootbox clear ${lbId} confirm\``);
      const n = lootbox.clearLootTable(lbId);
      return msg.reply(`🗑️ Đã clear ${n} entries.`);
    }

    // === simulate ===
    if (sub === 'simulate' || sub === 'sim' || sub === 'test') {
      const lbId = args[1];
      const rolls = parseInt(args[2]) || 1;
      if (!lbId) return msg.reply('❌ Thiếu lootbox_id.');
      const { rewards } = lootbox.openLootbox(lbId, rolls);
      if (rewards.length === 0) return msg.reply('💡 Lootbox trống.');
      const lines = rewards.map(r => {
        const id = r.reward_id ? ` (${r.reward_id})` : '';
        return `• ${r.reward_type}${id} × ${r.qty}${r.guaranteed ? ' ⭐' : ''}`;
      });
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`🎲 Simulate mở ${lbId} (${rolls} rolls)`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Chỉ mô phỏng, không cấp reward thật' })] });
    }

    return msg.reply(`❌ Sub không hợp lệ. Gõ \`${prefix}lootbox help\``);
  },
}; 
