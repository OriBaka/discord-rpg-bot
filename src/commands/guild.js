const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer } = require('../game/player');
const guilds = require('../game/guilds');
const achievements = require('../game/achievements');

function resolveTarget(msg, arg) {
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  if (!arg) return null;
  const id = String(arg).replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || null;
}

function buildInfoEmbed(g, extra = {}) {
  const members = extra.members || guilds.listMembers(g.id);
  const n = members.length;
  const cap = guilds.maxMembers(g.level);
  const need = guilds.xpToNext(g.level);
  const leader = members.find(m => m.role === 'leader');
  const b = guilds.getBuffs(g);

  const embed = new EmbedBuilder()
    .setColor(0x1ABC9C)
    .setTitle(`🏰 [${g.tag}] ${g.name}`)
    .setDescription(g.description || '*Chưa có mô tả.*')
    .addFields(
      { name: '📊 Cấp', value: `Lv.**${g.level}** (${g.xp}/${need} XP)`, inline: true },
      { name: '👥 Thành viên', value: `${n}/${cap}`, inline: true },
      { name: '💰 Kho vàng', value: `${g.gold}`, inline: true },
      { name: '👑 Bang chủ', value: leader ? `**${leader.name || leader.user_id}**` : '—', inline: true },
      {
        name: '✨ Buff hunt',
        value: `+${b.gold_pct}% vàng • +${b.xp_pct}% XP • +${b.drop_pct}% drop pet`,
        inline: true,
      },
    );
  if (g.motd) embed.addFields({ name: '📢 MOTD', value: g.motd.slice(0, 1024) });
  return embed;
}

function helpEmbed(prefix) {
  return new EmbedBuilder()
    .setColor(0x1ABC9C)
    .setTitle('🏰 Bang hội')
    .setDescription(
      `Lập bang từ Lv.${guilds.CREATE_MIN_LEVEL}, phí **${guilds.CREATE_COST}** vàng.\n` +
      `Buff hunt tăng theo cấp bang (tối đa +10% vàng / +10% XP).`
    )
    .addFields(
      {
        name: 'Cơ bản',
        value: [
          `\`${prefix}guild\` / \`${prefix}guild info [tag]\` — xem bang`,
          `\`${prefix}guild create <tag> <tên>\` — lập bang`,
          `\`${prefix}guild members\` — danh sách thành viên`,
          `\`${prefix}guild top\` — BXH bang`,
          `\`${prefix}guild buff\` — buff hiện tại`,
        ].join('\n'),
      },
      {
        name: 'Thành viên',
        value: [
          `\`${prefix}guild invite @user\` — mời (officer+)`,
          `\`${prefix}guild accept [tag]\` / \`${prefix}guild decline [tag]\``,
          `\`${prefix}guild leave\` — rời bang`,
          `\`${prefix}guild kick @user\``,
        ].join('\n'),
      },
      {
        name: 'Kho chung',
        value: [
          `\`${prefix}guild vault\` — xem kho`,
          `\`${prefix}guild deposit gold <số>\` / \`${prefix}guild deposit <item> [qty]\``,
          `\`${prefix}guild withdraw gold <số>\` / \`${prefix}guild withdraw <item> [qty]\` (officer+)`,
        ].join('\n'),
      },
      {
        name: 'Quản trị',
        value: [
          `\`${prefix}guild motd <text>\` • \`${prefix}guild desc <text>\``,
          `\`${prefix}guild promote @user\` / \`${prefix}guild demote @user\``,
          `\`${prefix}guild transfer @user\` — nhường bang chủ`,
          `\`${prefix}guild disband confirm\` — giải tán`,
        ].join('\n'),
      },
    );
}

function maybeGrant(userId, ctx) {
  try { achievements.checkAndGrant(userId, ctx); } catch {}
}

module.exports = {
  name: 'guild',
  aliases: ['g', 'bang', 'clan'],
  description: 'Hệ thống bang hội',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();
    const ctx = { client: msg.client, guildId: msg.guild?.id };

    // ====== help ======
    if (sub === 'help') return msg.reply({ embeds: [helpEmbed(prefix)] });

    // ====== top ======
    if (sub === 'top' || sub === 'bxh' || sub === 'leaderboard') {
      const rows = guilds.listTop(10);
      if (rows.length === 0) return msg.reply('💡 Chưa có bang hội nào. Dùng `' + prefix + 'guild create` để lập bang đầu tiên!');
      const lines = rows.map((g, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
        return `${medal} \`[${g.tag}]\` **${g.name}** — Lv.${g.level} • ${g.members} tv • ${g.gold}💰`;
      });
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('🏰 BXH Bang hội').setDescription(lines.join('\n'))],
      });
    }

    // ====== create ======
    if (sub === 'create' || sub === 'new' || sub === 'lap') {
      const tag = args[1];
      const name = args.slice(2).join(' ').trim();
      if (!tag || !name) {
        return msg.reply(`❌ Cú pháp: \`${prefix}guild create <tag> <tên>\`\nVD: \`${prefix}guild create ABC Hiệp Sĩ Rồng\`\nYêu cầu: Lv.${guilds.CREATE_MIN_LEVEL}+, ${guilds.CREATE_COST} vàng.`);
      }
      const res = guilds.createGuild(msg.author.id, tag, name);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      maybeGrant(msg.author.id, ctx);
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x57F287)
          .setTitle('🏰 Đã lập bang hội!')
          .setDescription(
            `**[${res.guild.tag}] ${res.guild.name}**\n` +
            `Phí: ${guilds.CREATE_COST} vàng.\n` +
            `Mời người: \`${prefix}guild invite @user\``
          )],
      });
    }

    // ====== invite ======
    if (sub === 'invite' || sub === 'inv' || sub === 'moi') {
      const mine = guilds.getPlayerGuild(msg.author.id);
      if (!mine) return msg.reply('❌ Bạn chưa ở bang nào.');
      if (!guilds.isOfficerPlus(mine.member)) return msg.reply('❌ Chỉ officer/bang chủ mới mời được.');
      const target = resolveTarget(msg, args[1]);
      if (!target) return msg.reply(`❌ Cú pháp: \`${prefix}guild invite @user\``);
      if (target.bot) return msg.reply('❌ Không mời bot.');
      const res = guilds.createInvite(mine.id, target.id, msg.author.id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`guild:accept:${mine.id}:${target.id}`).setLabel('✅ Vào bang').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`guild:decline:${mine.id}:${target.id}`).setLabel('❌ Từ chối').setStyle(ButtonStyle.Danger),
      );
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x1ABC9C)
          .setTitle('📨 Lời mời bang hội')
          .setDescription(
            `<@${target.id}>, **${p.name}** mời bạn vào \`[${mine.tag}]\` **${mine.name}** (Lv.${mine.level}).\n` +
            `⏳ Hết hạn sau 24h — bấm nút hoặc \`${prefix}guild accept ${mine.tag}\``
          )],
        components: [row],
      });
    }

    // ====== accept / decline ======
    if (sub === 'accept' || sub === 'join' || sub === 'yes') {
      const invites = guilds.listInvitesForUser(msg.author.id);
      if (invites.length === 0) return msg.reply('❌ Bạn không có lời mời bang nào.');
      let inv = invites[0];
      const q = args[1];
      if (q) {
        const g = guilds.findGuild(q);
        inv = invites.find(i => i.guild_id === g?.id || i.tag.toLowerCase() === q.toLowerCase());
        if (!inv) return msg.reply(`❌ Không có lời mời từ \`${q}\`.`);
      } else if (invites.length > 1) {
        const lines = invites.map(i => `\`[${i.tag}]\` **${i.name}** — \`${prefix}guild accept ${i.tag}\``);
        return msg.reply('Bạn có nhiều lời mời:\n' + lines.join('\n'));
      }
      const res = guilds.acceptInvite(msg.author.id, inv.guild_id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      maybeGrant(msg.author.id, ctx);
      return msg.reply(`✅ Bạn đã gia nhập \`[${res.guild.tag}]\` **${res.guild.name}**!`);
    }

    if (sub === 'decline' || sub === 'deny' || sub === 'no') {
      const invites = guilds.listInvitesForUser(msg.author.id);
      if (invites.length === 0) return msg.reply('❌ Bạn không có lời mời bang nào.');
      let inv = invites[0];
      const q = args[1];
      if (q) {
        const g = guilds.findGuild(q);
        inv = invites.find(i => i.guild_id === g?.id || i.tag.toLowerCase() === q.toLowerCase());
        if (!inv) return msg.reply(`❌ Không có lời mời từ \`${q}\`.`);
      }
      const res = guilds.declineInvite(msg.author.id, inv.guild_id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ Đã từ chối lời mời \`[${res.guild?.tag || '?'}]\`.`);
    }

    // ====== leave ======
    if (sub === 'leave' || sub === 'quit' || sub === 'roi') {
      const res = guilds.leaveGuild(msg.author.id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ Bạn đã rời \`[${res.guild.tag}]\` **${res.guild.name}**.`);
    }

    // ====== kick ======
    if (sub === 'kick' || sub === 'kickmem') {
      const target = resolveTarget(msg, args[1]);
      if (!target) return msg.reply(`❌ Cú pháp: \`${prefix}guild kick @user\``);
      const res = guilds.kickMember(msg.author.id, target.id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ Đã kick **${target.username}** khỏi bang.`);
    }

    // ====== promote / demote ======
    if (sub === 'promote') {
      const target = resolveTarget(msg, args[1]);
      if (!target) return msg.reply(`❌ Cú pháp: \`${prefix}guild promote @user\``);
      const res = guilds.setRole(msg.author.id, target.id, 'officer');
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ **${target.username}** đã thành ⭐ Officer.`);
    }
    if (sub === 'demote') {
      const target = resolveTarget(msg, args[1]);
      if (!target) return msg.reply(`❌ Cú pháp: \`${prefix}guild demote @user\``);
      const res = guilds.setRole(msg.author.id, target.id, 'member');
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ **${target.username}** đã thành 👤 Thành viên.`);
    }

    // ====== transfer ======
    if (sub === 'transfer' || sub === 'nhuong') {
      const target = resolveTarget(msg, args[1]);
      if (!target) return msg.reply(`❌ Cú pháp: \`${prefix}guild transfer @user\``);
      const res = guilds.transferLeader(msg.author.id, target.id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`👑 Đã nhường bang chủ cho **${target.username}**. Bạn thành Officer.`);
    }

    // ====== disband ======
    if (sub === 'disband' || sub === 'giai') {
      if ((args[1] || '').toLowerCase() !== 'confirm') {
        return msg.reply(`⚠️ Giải tán bang sẽ **xóa kho + thành viên**. Gõ \`${prefix}guild disband confirm\` để xác nhận.`);
      }
      const res = guilds.disbandGuild(msg.author.id);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`💥 Bang \`[${res.guild.tag}]\` **${res.guild.name}** đã giải tán.`);
    }

    // ====== motd / desc ======
    if (sub === 'motd') {
      const text = args.slice(1).join(' ').trim();
      if (!text) return msg.reply(`❌ Cú pháp: \`${prefix}guild motd <nội dung>\``);
      const res = guilds.setMotd(msg.author.id, text);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply('✅ Đã cập nhật MOTD.');
    }
    if (sub === 'desc' || sub === 'description') {
      const text = args.slice(1).join(' ').trim();
      if (!text) return msg.reply(`❌ Cú pháp: \`${prefix}guild desc <mô tả>\``);
      const res = guilds.setDescription(msg.author.id, text);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply('✅ Đã cập nhật mô tả bang.');
    }

    // ====== members ======
    if (sub === 'members' || sub === 'mem' || sub === 'tv') {
      const mine = guilds.getPlayerGuild(msg.author.id);
      const q = args[1];
      const g = q ? guilds.findGuild(q) : mine;
      if (!g) return msg.reply(q ? `❌ Không tìm thấy bang \`${q}\`.` : '❌ Bạn chưa ở bang nào.');
      const members = guilds.listMembers(g.id);
      const lines = members.map((m, i) => {
        const icon = { leader: '👑', officer: '⭐', member: '•' }[m.role] || '•';
        return `${icon} **${m.name || m.user_id}** — ${m.contrib_xp} GXP / ${m.contrib_gold}💰`;
      });
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x1ABC9C)
          .setTitle(`👥 [${g.tag}] ${g.name} — ${members.length}/${guilds.maxMembers(g.level)}`)
          .setDescription(lines.join('\n').slice(0, 4000) || '*Trống*')],
      });
    }

    // ====== vault ======
    if (sub === 'vault' || sub === 'kho' || sub === 'bank') {
      const mine = guilds.getPlayerGuild(msg.author.id);
      if (!mine) return msg.reply('❌ Bạn chưa ở bang nào.');
      const items = guilds.listVault(mine.id);
      const lines = items.map(it => `📦 ${it.name || it.item_id} ×${it.qty} \`${it.item_id}\``);
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x1ABC9C)
          .setTitle(`🏦 Kho [${mine.tag}] ${mine.name}`)
          .setDescription(`💰 **${mine.gold}** vàng\n\n` + (lines.join('\n') || '*Chưa có item.*'))
          .setFooter({ text: `${prefix}guild deposit / withdraw` })],
      });
    }

    // ====== deposit ======
    if (sub === 'deposit' || sub === 'dep' || sub === 'gui') {
      const what = (args[1] || '').toLowerCase();
      if (!what) return msg.reply(`❌ \`${prefix}guild deposit gold <số>\` hoặc \`${prefix}guild deposit <item_id> [qty]\``);
      if (what === 'gold' || what === 'vang') {
        const amount = parseInt(args[2], 10);
        const res = guilds.depositGold(msg.author.id, amount);
        if (!res.ok) return msg.reply(`❌ ${res.error}`);
        return msg.reply(`✅ Đã gửi **${res.amount}** vàng vào kho (tổng ${res.guild.gold}💰).`);
      }
      const qty = Math.max(1, parseInt(args[2], 10) || 1);
      const res = guilds.depositItem(msg.author.id, args[1], qty);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ Đã gửi **${res.qty}× ${res.item.name}** vào kho bang.`);
    }

    // ====== withdraw ======
    if (sub === 'withdraw' || sub === 'wd' || sub === 'rut') {
      const what = (args[1] || '').toLowerCase();
      if (!what) return msg.reply(`❌ \`${prefix}guild withdraw gold <số>\` hoặc \`${prefix}guild withdraw <item_id> [qty]\``);
      if (what === 'gold' || what === 'vang') {
        const amount = parseInt(args[2], 10);
        const res = guilds.withdrawGold(msg.author.id, amount);
        if (!res.ok) return msg.reply(`❌ ${res.error}`);
        return msg.reply(`✅ Đã rút **${res.amount}** vàng từ kho (còn ${res.guild.gold}💰).`);
      }
      const qty = Math.max(1, parseInt(args[2], 10) || 1);
      const res = guilds.withdrawItem(msg.author.id, args[1], qty);
      if (!res.ok) return msg.reply(`❌ ${res.error}`);
      return msg.reply(`✅ Đã rút **${res.qty}× ${res.item.name}** từ kho bang.`);
    }

    // ====== buff ======
    if (sub === 'buff' || sub === 'bonus') {
      const mine = guilds.getPlayerGuild(msg.author.id);
      if (!mine) return msg.reply('❌ Bạn chưa ở bang nào.');
      const b = guilds.getBuffs(mine);
      const nextLv = Math.min(guilds.MAX_LEVEL, mine.level + 1);
      const next = guilds.getBuffs({ level: nextLv });
      return msg.reply({
        embeds: [new EmbedBuilder().setColor(0x1ABC9C)
          .setTitle(`✨ Buff [${mine.tag}] Lv.${mine.level}`)
          .setDescription(
            `Hiện tại: **+${b.gold_pct}% vàng** • **+${b.xp_pct}% XP** • **+${b.drop_pct}% drop pet**\n` +
            (mine.level < guilds.MAX_LEVEL
              ? `Lv.${nextLv}: +${next.gold_pct}% vàng • +${next.xp_pct}% XP • +${next.drop_pct}% drop pet`
              : 'Đã đạt cấp tối đa.')
          )
          .setFooter({ text: 'Buff áp dụng khi !hunt / thắng battle PvE. 10% XP hunt đóng góp GXP.' })],
      });
    }

    // ====== info (default) ======
    if (!sub || sub === 'info' || sub === 'view' || sub === 'show') {
      const q = sub && sub !== 'info' && sub !== 'view' && sub !== 'show' ? sub : args[1];
      // !guild  → own; !guild info TAG → lookup; !guild TAG also via fallthrough below
      if (!args[0] || sub === 'info' || sub === 'view' || sub === 'show') {
        const mine = guilds.getPlayerGuild(msg.author.id);
        const g = args[1] ? guilds.findGuild(args[1]) : mine;
        if (!g) {
          if (!args[1]) return msg.reply({ embeds: [helpEmbed(prefix)] });
          return msg.reply(`❌ Không tìm thấy bang \`${args[1]}\`.`);
        }
        return msg.reply({ embeds: [buildInfoEmbed(g)] });
      }
    }

    // Fallback: treat first arg as tag/name lookup, or help
    if (args[0]) {
      const g = guilds.findGuild(args[0]);
      if (g) return msg.reply({ embeds: [buildInfoEmbed(g)] });
    }
    return msg.reply({ embeds: [helpEmbed(prefix)] });
  },

  buildInfoEmbed,
  helpEmbed,
};
