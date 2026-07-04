// Redeem code commands
// Player: %redeem <code>
// Admin: %redeem create/delete/list/view/addreward/clearrewards
const { EmbedBuilder } = require('discord.js');
const redeem = require('../game/redeem');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

const REWARD_ICONS = {
  item: '📦', pet: '🐾', shard: '🧩',
  gold: '💰', xp: '✨', lootbox: '🎁',
};

function fmtReward(r) {
  const icon = REWARD_ICONS[r.reward_type] || '•';
  if (r.reward_type === 'gold') return `${icon} ${r.qty} vàng`;
  if (r.reward_type === 'xp') return `${icon} ${r.qty} XP`;
  return `${icon} ${r.qty}× \`${r.reward_id}\` (${r.reward_type})`;
}

module.exports = {
  name: 'redeem',
  aliases: ['rd', 'code'],
  description: 'Nhập code nhận thưởng (Player) hoặc quản lý code (Admin)',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    // === Admin subs ===
    const adminSubs = ['create', 'delete', 'del', 'list', 'view', 'addreward', 'add', 'clearrewards', 'clear'];
    if (adminSubs.includes(sub)) {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      return handleAdmin(msg, sub, args.slice(1), prefix);
    }

    // === Help ===
    if (!sub || sub === 'help') {
      const helpEmbed = new EmbedBuilder().setColor(0x00AE86).setTitle('🎁 Redeem Code')
        .setDescription([
          `**Player:** \`${prefix}redeem <CODE>\` — nhập code nhận thưởng`,
          `Ví dụ: \`${prefix}redeem SUMMER2026\``,
          '',
          isAdmin(msg) ? `**Admin (nếu bạn là admin):**\n\`${prefix}redeem list\` — list code\n\`${prefix}redeem create <CODE> [max_uses] [description...]\`\n\`${prefix}redeem addreward <CODE> <type> [id] <qty>\`\n\`${prefix}redeem view <CODE>\` — xem chi tiết\n\`${prefix}redeem delete <CODE>\`\n\`${prefix}redeem clearrewards <CODE>\`` : '',
        ].filter(Boolean).join('\n'));
      return msg.reply({ embeds: [helpEmbed] });
    }

    // === Player redeem ===
    const code = sub.toUpperCase();
    const result = redeem.redeem(msg.author.id, code);
    if (!result.ok) {
      return msg.reply(`❌ ${result.error}`);
    }
    const embed = new EmbedBuilder().setColor(0xFFD700)
      .setTitle(`🎉 Đã nhận thưởng từ code \`${code}\`!`)
      .setDescription(result.summary.join('\n') || '(trống)')
      .setFooter({ text: `Redeem thành công • ${result.codeRow.description || 'không mô tả'}` });
    return msg.reply({ embeds: [embed] });
  },
};

async function handleAdmin(msg, sub, args, prefix) {
  // === create ===
  if (sub === 'create') {
    const code = args[0];
    if (!code) return msg.reply(`❌ Cú pháp: \`${prefix}redeem create <CODE> [max_uses] [description...]\``);
    let maxUses = 0;
    let desc = '';
    if (args[1] && /^\d+$/.test(args[1])) {
      maxUses = parseInt(args[1]);
      desc = args.slice(2).join(' ');
    } else {
      desc = args.slice(1).join(' ');
    }
    try {
      const c = redeem.createCode(code, desc, maxUses, msg.author.id);
      return msg.reply(`✅ Đã tạo code \`${c}\` ${maxUses > 0 ? `(max ${maxUses} lượt)` : '(unlimited)'}.\n💡 Thêm reward: \`${prefix}redeem addreward ${c} <type> [id] <qty>\``);
    } catch (e) {
      return msg.reply(`❌ ${e.message}`);
    }
  }

  // === delete ===
  if (sub === 'delete' || sub === 'del') {
    const code = args[0];
    if (!code) return msg.reply(`❌ Cú pháp: \`${prefix}redeem delete <CODE>\``);
    const ok = redeem.deleteCode(code);
    return msg.reply(ok ? `✅ Đã xoá code \`${code.toUpperCase()}\`.` : `❌ Code không tồn tại.`);
  }

  // === list ===
  if (sub === 'list') {
    const codes = redeem.listCodes();
    if (codes.length === 0) return msg.reply('💡 Chưa có code nào. Tạo bằng `' + prefix + 'redeem create <CODE>`.');
    const lines = codes.map(c => {
      const uses = c.max_uses > 0 ? `${c.current_uses}/${c.max_uses}` : `${c.current_uses}/∞`;
      const rewardCount = redeem.getRewards(c.code).length;
      return `\`${c.code}\` — ${uses} lượt • ${rewardCount} rewards${c.description ? ` • ${c.description}` : ''}`;
    });
    const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`🎁 Redeem Codes (${codes.length})`)
      .setDescription(lines.join('\n').slice(0, 4000));
    return msg.reply({ embeds: [embed] });
  }

  // === view ===
  if (sub === 'view') {
    const code = args[0];
    if (!code) return msg.reply(`❌ Cú pháp: \`${prefix}redeem view <CODE>\``);
    const c = redeem.getCode(code);
    if (!c) return msg.reply(`❌ Code không tồn tại.`);
    const rewards = redeem.getRewards(code);
    const embed = new EmbedBuilder().setColor(0x00AE86).setTitle(`🎁 Code \`${c.code}\``)
      .setDescription(c.description || '(không mô tả)')
      .addFields(
        { name: 'Uses', value: c.max_uses > 0 ? `${c.current_uses} / ${c.max_uses}` : `${c.current_uses} / ∞`, inline: true },
        { name: 'Created', value: `<t:${c.created_at}:R>`, inline: true },
        { name: `Rewards (${rewards.length})`, value: rewards.length > 0 ? rewards.map(fmtReward).join('\n') : '(chưa có)' },
      );
    return msg.reply({ embeds: [embed] });
  }

  // === addreward ===
  if (sub === 'addreward' || sub === 'add') {
    // Cú pháp: addreward <CODE> <type> [id] <qty>
    //   Nếu type=gold/xp → không có id, chỉ có qty
    //   Nếu khác → có id + qty
    const code = args[0];
    const type = args[1];
    if (!code || !type) return msg.reply(`❌ Cú pháp:\n\`${prefix}redeem addreward <CODE> gold <qty>\`\n\`${prefix}redeem addreward <CODE> xp <qty>\`\n\`${prefix}redeem addreward <CODE> item <item_id> <qty>\`\n\`${prefix}redeem addreward <CODE> lootbox <box_id> <qty>\`\n\`${prefix}redeem addreward <CODE> pet <pet_id> <qty>\`\n\`${prefix}redeem addreward <CODE> shard <shard_id> <qty>\``);
    let rid = '', qty = 1;
    if (type === 'gold' || type === 'xp') {
      qty = parseInt(args[2]);
      if (!qty || qty < 1) return msg.reply(`❌ Qty phải > 0.`);
    } else {
      rid = args[2];
      qty = parseInt(args[3]);
      if (!rid || !qty || qty < 1) return msg.reply(`❌ Thiếu id hoặc qty (qty > 0).`);
    }
    try {
      redeem.addReward(code, type, rid, qty);
      return msg.reply(`✅ Đã thêm reward vào \`${code.toUpperCase()}\`: ${fmtReward({ reward_type: type, reward_id: rid, qty })}`);
    } catch (e) {
      return msg.reply(`❌ ${e.message}`);
    }
  }

  // === clearrewards ===
  if (sub === 'clearrewards' || sub === 'clear') {
    const code = args[0];
    if (!code) return msg.reply(`❌ Cú pháp: \`${prefix}redeem clearrewards <CODE>\``);
    if (!redeem.getCode(code)) return msg.reply(`❌ Code không tồn tại.`);
    redeem.clearRewards(code);
    return msg.reply(`✅ Đã xoá tất cả rewards của \`${code.toUpperCase()}\`.`);
  }

  return msg.reply(`❌ Sub không hợp lệ.`);
}
