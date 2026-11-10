// %raid — boss tuần đánh chung cả server.
//
//   %raid            xem boss tuần này (máu, thời gian còn lại, lượt đánh)
//   %raid danh       đánh boss (dùng 1 lượt)
//   %raid top        bảng xếp hạng sát thương cá nhân
//   %raid bang       bảng xếp hạng sát thương theo bang
//   %raid thuong     nhận thưởng tuần trước (nếu đủ điều kiện)
//
// Logic nằm ở ../game/raid.js — đọc chú thích đầu file đó trước khi sửa.
const { EmbedBuilder } = require('discord.js');
const { getPlayer } = require('../game/player');
const { getPrefix } = require('../game/prefix');
const raid = require('../game/raid');

function fmt(n) { return Number(n).toLocaleString('en-US'); }

function timeLeft(ms) {
  if (ms <= 0) return 'đã hết';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d} ngày ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Thanh máu boss — dùng block cho dễ nhìn trong chat
function hpBar(pct, width = 20) {
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

const TIER_LABEL = {
  mvp: '🏆 MVP',
  top3: '🥈 Top 3',
  top10: '🥉 Top 10',
  participant: '🎖️ Tham gia',
};

module.exports = {
  name: 'raid',
  aliases: ['boss', 'bossraid'],
  description: 'Boss tuần đánh chung: %raid | %raid danh | %raid top | %raid bang',
  async execute(msg, args) {
    const prefix = getPrefix();
    const sub = (args?.[0] || '').toLowerCase();

    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const current = raid.getCurrentRaid();
    const now = Date.now();

    // ===== TOP sát thương cá nhân =====
    if (sub === 'top' || sub === 'bxh' || sub === 'leaderboard') {
      const rows = raid.leaderboard(current.id, 10);
      if (!rows.length) {
        return msg.reply(`📭 Tuần này chưa ai đánh **${current.boss.name}**.\nDùng \`${prefix}raid danh\` để mở màn!`);
      }
      const lines = rows.map((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
        const pct = current.hp_total ? (r.dmg / current.hp_total * 100).toFixed(1) : '0';
        return `${medal} **${r.name || r.user_id}** (Lv.${r.level || '?'}) — ${fmt(r.dmg)} sát thương · ${pct}% · ${r.hits} lượt`;
      });
      return msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle(`⚔️ BXH sát thương — ${current.boss.name}`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: `Tuần ${current.week} · còn ${timeLeft(current.ends_at - now)}` })],
      });
    }

    // ===== TOP theo BANG =====
    if (sub === 'bang' || sub === 'guild' || sub === 'guilds') {
      const rows = raid.guildLeaderboard(current.id, 10);
      if (!rows.length) {
        return msg.reply(
          `📭 Tuần này chưa bang nào đánh boss.\n` +
          `Sát thương của thành viên được cộng vào bang — xem \`${prefix}guild\`.`
        );
      }
      const lines = rows.map((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
        return `${medal} **[${r.tag}]** ${r.name} (Lv.${r.level}) — ${fmt(r.dmg)} · ${r.members} người`;
      });
      return msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xEB459E)
          .setTitle(`🏰 BXH bang — ${current.boss.name}`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: 'Bang mạnh = boss chết nhanh hơn = mọi người có thưởng sớm' })],
      });
    }

    // ===== NHẬN THƯỞNG =====
    if (sub === 'thuong' || sub === 'reward' || sub === 'nhan') {
      const prev = raid.getPreviousRaid(now);
      if (!prev) return msg.reply('📭 Chưa có tuần nào kết thúc để nhận thưởng.');

      const already = raid.getReward(prev.id, msg.author.id);
      if (already) {
        // `items` lưu dạng JSON trong DB — phải parse rồi đổi sang tên hiển thị.
        // Từng in thẳng JSON thô (`[["potion_m",2]]`) vì quên parse.
        const { getItem } = require('../game/items');
        let itemText = '';
        try {
          const arr = JSON.parse(already.items || '[]');
          if (arr.length) {
            itemText = '\n• 🎁 ' + arr
              .map(([id, q]) => `${getItem(id)?.name || id} ×${q}`)
              .join(', ');
          }
        } catch { /* dữ liệu hỏng thì bỏ qua, không chặn thông báo */ }
        return msg.reply(
          `✅ Bạn đã nhận thưởng tuần **${prev.week}** rồi.\n` +
          `• 💰 ${fmt(already.gold)} vàng\n• ✨ ${fmt(already.xp)} XP` + itemText
        );
      }

      // Trao thưởng cho cả tuần (idempotent — người khác gọi cũng không sao)
      const res = raid.settleRewards(prev.id);
      const mine = raid.getReward(prev.id, msg.author.id);
      if (!mine) {
        return msg.reply(
          `😔 Bạn không tham gia đánh **${prev.boss.name}** tuần **${prev.week}** nên không có thưởng.\n` +
          `Tuần này còn ${timeLeft(current.ends_at - now)} — dùng \`${prefix}raid danh\` để góp sát thương.`
        );
      }

      const lines = [
        `**${TIER_LABEL[mine.tier] || mine.tier}** — tuần ${prev.week}`,
        `Boss: ${prev.boss.name} ${prev.defeated ? '(đã hạ ✅)' : '(không hạ được ❌)'}`,
        '',
        `💰 **${fmt(mine.gold)}** vàng`,
        `✨ **${fmt(mine.xp)}** XP`,
      ];
      const items = JSON.parse(mine.items || '[]');
      if (items.length) {
        const { getItem } = require('../game/items');
        lines.push(`🎁 ${items.map(([id, q]) => `${getItem(id)?.name || id} ×${q}`).join(', ')}`);
      }
      return msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(mine.tier === 'mvp' ? 0xF1C40F : 0x57F287)
          .setTitle('🎁 Thưởng raid')
          .setDescription(lines.join('\n'))],
      });
    }

    // ===== ĐÁNH BOSS =====
    if (sub === 'danh' || sub === 'attack' || sub === 'fight' || sub === 'hit') {
      if (p.level < current.boss.minLevel) {
        return msg.reply(
          `🔒 **${current.boss.name}** yêu cầu Lv.${current.boss.minLevel} — bạn đang Lv.${p.level}.\n` +
          `Tuần này bạn vẫn xem được bảng: \`${prefix}raid top\`.`
        );
      }
      if (p.hp <= 0) {
        return msg.reply(`💀 Bạn đang gục! Dùng \`${prefix}heal\` rồi quay lại.`);
      }

      const guild = (() => { try { return require('../game/guilds').getPlayerGuild(p.user_id); } catch { return null; } })();
      const res = raid.attack(current, p, { guildId: guild?.id || null, now });

      if (!res.ok) {
        if (res.reason === 'defeated') {
          return msg.reply(
            `🎉 Boss tuần này đã bị hạ rồi!\n` +
            `Xem ai góp nhiều nhất: \`${prefix}raid top\`\n` +
            `Nhận thưởng tuần trước: \`${prefix}raid thuong\``
          );
        }
        if (res.reason === 'no_attacks') {
          return msg.reply(
            `⏳ Bạn đã dùng hết **${raid.ATTACKS_PER_WEEK} lượt** đánh tuần này.\n` +
            `Tuần mới bắt đầu sau ${timeLeft(current.ends_at - now)}.\n` +
            `Xem đóng góp: \`${prefix}raid top\``
          );
        }
        if (res.reason === 'cooldown') {
          return msg.reply(`⏳ Chờ **${timeLeft(res.cooldownMs)}** nữa mới đánh tiếp (giãn cách 10 phút).`);
        }
        return msg.reply('❌ Không đánh được.');
      }

      // Cập nhật lại trạng thái sau khi đánh
      const after = raid.getCurrentRaid();
      const st = raid.getPlayerStatus(after, p.user_id, now);
      const pctDealt = current.hp_total ? (res.damage / current.hp_total * 100) : 0;

      const lines = [
        `Bạn gây **${fmt(res.damage)}** sát thương${res.crits ? ` (${res.crits} chí mạng 💢)` : ''}`,
        `≈ **${pctDealt.toFixed(2)}%** thanh máu boss`,
        '',
        `${hpBar(after.hp_pct)} ${(after.hp_pct * 100).toFixed(1)}%`,
        `Còn **${fmt(after.hp_left)}** / ${fmt(after.hp_total)} HP`,
      ];
      if (guild) {
        const gx = res.guildXp ? ` (+${fmt(res.guildXp)} XP bang)` : '';
        lines.push(`\n🏰 Cộng vào bang **[${guild.tag}]** ${guild.name}${gx}`);
      }
      lines.push(`\n🎯 Lượt còn lại tuần này: **${st.left}/${raid.ATTACKS_PER_WEEK}**`);

      if (res.killed) {
        lines.push('\n🎉 **BOSS ĐÃ BỊ HẠ!**');
        lines.push(`Nhận thưởng: \`${prefix}raid thuong\` (mở đầu tuần sau)`);
        // Chốt thưởng ngay khi boss chết để mọi người nhận được luôn
        raid.settleRewards(after.id);
      } else if (after.hp_pct < 0.1) {
        lines.push('\n🔥 **Boss sắp gục!** Rủ thêm người vào đánh.');
      }

      return msg.reply({
        embeds: [new EmbedBuilder()
          .setColor(res.killed ? 0xF1C40F : 0xED4245)
          .setTitle(res.killed ? `🎉 Hạ gục ${current.boss.name}!` : `⚔️ Đánh ${current.boss.name}`)
          .setDescription(lines.join('\n'))],
      });
    }

    // ===== MẶC ĐỊNH: xem trạng thái boss =====
    const st = raid.getPlayerStatus(current, msg.author.id, now);
    const ranking = raid.leaderboard(current.id, 3);

    const lines = [
      `*${current.boss.desc}*`,
      '',
      hpBar(current.hp_pct),
      `**${(current.hp_pct * 100).toFixed(1)}%** còn lại · ${fmt(current.hp_left)} / ${fmt(current.hp_total)} HP`,
      `⏰ Còn ${timeLeft(current.ends_at - now)}`,
      '',
      `🎯 Lượt của bạn: **${st.left}/${raid.ATTACKS_PER_WEEK}**`,
    ];

    if (current.defeated) {
      lines.push('\n🎉 **Tuần này đã hạ boss!** Nhận thưởng: `' + prefix + 'raid thuong`');
    } else if (st.canAttack) {
      lines.push(`\nDùng \`${prefix}raid danh\` để đánh.`);
    } else if (st.left <= 0) {
      lines.push(`\n⏳ Hết lượt — tuần mới sau ${timeLeft(current.ends_at - now)}.`);
    } else {
      lines.push(`\n⏳ Chờ ${timeLeft(st.cooldownMs)} để đánh tiếp.`);
    }

    if (ranking.length) {
      lines.push('');
      lines.push('**Top sát thương:**');
      ranking.forEach((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i];
        lines.push(`${medal} ${r.name || r.user_id} — ${fmt(r.dmg)}`);
      });
    } else {
      lines.push('\n📭 Chưa ai đánh tuần này — người đầu tiên sẽ lên top!');
    }

    lines.push('');
    lines.push(`\`${prefix}raid top\` · \`${prefix}raid bang\` · \`${prefix}raid thuong\``);

    return msg.reply({
      embeds: [new EmbedBuilder()
        .setColor(current.defeated ? 0x57F287 : 0xED4245)
        .setTitle(`🐲 ${current.boss.name} — tuần ${current.week}`)
        .setDescription(lines.join('\n'))
        .setFooter({
          text: current.defeated
            ? 'Đã hạ — chờ tuần mới'
            : `Yêu cầu Lv.${current.boss.minLevel} · ${ROUNDS_TEXT}`,
        })],
    });
  },
};

const ROUNDS_TEXT = `${raid.ROUNDS_PER_ATTACK} hiệp/lượt · không mất HP khi đánh raid`;
