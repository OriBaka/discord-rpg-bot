// %daily — điểm danh hàng ngày, chuỗi 30 ngày.
//
//   %daily        điểm danh (hoặc xem còn chờ bao lâu)
//   %daily xem    xem bảng 30 ngày + đang ở đâu (không điểm danh)
//
// Logic thưởng nằm ở ../game/daily.js — xem chú thích đầu file đó để biết lý
// do thiết kế (hệ thống cũ không tạo lý do quay lại, phần thưởng không theo
// kịp cấp người chơi).
const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer } = require('../game/player');
const { getItem } = require('../game/items');
const daily = require('../game/daily');
const { getPrefix } = require('../game/prefix');

function fmt(n) { return Number(n).toLocaleString('en-US'); }

function timeLeft(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Bảng 30 ngày — dùng để hiện cho người chơi biết mình đang ở đâu
function buildTable(player) {
  const rate = daily.zoneRate(player.level);
  const lines = [];
  for (const r of daily.REWARDS) {
    const gold = Math.round(rate.gold * r.goldKill);
    const xp = Math.round(rate.xp * r.xpKill);
    let reward = `${fmt(gold)} 💰 · ${fmt(xp)} XP`;
    // Ngày lẻ hồi đầy HP (khi đang mất máu) — nhịp nghỉ giữa các ngày
    if (r.day % 2 === 1) reward += ' · hồi đầy HP';
    if (r.item) reward += ` · ${r.itemQty}× ${getItem(daily.day7Item(player.level))?.name || 'vật phẩm'}`;
    lines.push({ day: r.day, label: r.label, reward });
  }
  return lines;
}

function renderTable(player, status) {
  const rows = buildTable(player);

  // Thanh tiến trình chuỗi: ✅ ngày đã nhận, ⏳ hôm nay, ⬜ chưa tới
  // Số ngày đã nhận trong CHU KỲ 30 ngày hiện tại (streak có thể > 30)
  const doneCount = status.streak > 0 ? ((status.streak - 1) % daily.CYCLE_DAYS) + 1 : 0;
  const bar = rows.map(r => {
    if (r.day <= doneCount) return '✅';
    if (r.day === status.nextDay) return '⏳';
    return '⬜';
  }).join('');

  // Streak liên tiếp không reset khi bảng thưởng quay vòng sau 30 ngày.
  // Hiển thị cả chu kỳ và streak để phân biệt hai bộ đếm.
  const inCycle = status.streak > 0 ? ((status.streak - 1) % daily.CYCLE_DAYS) + 1 : 0;
  const desc = [
    `**Đã nhận ${inCycle}/30 ngày của chu kỳ này** · chuỗi liên tiếp: **${status.streak}** ngày · tổng: **${player.daily_total || 0}** · kỷ lục: **${player.daily_best || 0}**`,
    bar,
    '',

  ];

  return desc.join('\n');
}

module.exports = {
  name: 'daily',
  aliases: ['diemdanh', 'dd'],
  description: 'Điểm danh hàng ngày (chuỗi 30 ngày). %daily | %daily xem',
  async execute(msg, args) {
    const prefix = getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args?.[0] || '').toLowerCase();
    const now = Date.now();
    const status = daily.getStatus(p, now);

    // ===== Xem bảng (không điểm danh) =====
    if (sub === 'xem' || sub === 'view' || sub === 'bang' || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 Điểm danh 30 ngày')
        .setDescription(renderTable(p, status))
        .setFooter({
          text: status.canClaim
            ? `Có thể điểm danh ngay — gõ ${prefix}daily`
            : `Điểm danh tiếp theo sau ${timeLeft(status.remainMs)}`,
        });
      const rows = buildTable(p);
      const done = status.streak > 0 ? ((status.streak - 1) % daily.CYCLE_DAYS) + 1 : 0;
      for (let start = 0; start < rows.length; start += 7) {
        const chunk = rows.slice(start, start + 7);
        embed.addFields({ name: `Ngày ${chunk[0].day}–${chunk.at(-1).day}`, value: chunk.map(r =>
          `${r.day <= done ? '✅' : r.day === status.nextDay ? '👉' : '⬜'} **Ngày ${r.day}** · ${r.reward}`
        ).join('\n') });
      }
      return msg.reply({ embeds: [embed] });
    }

    // ===== Đang trong thời gian chờ =====
    if (!status.canClaim) {
      const lines = [
        `⏳ Bạn đã điểm danh hôm nay. Quay lại sau **${timeLeft(status.remainMs)}**.`,
      ];
      // Cảnh báo mất chuỗi nếu bỏ quá hạn — đây là thông tin người chơi cần
      if (!status.broken && status.streak > 0) {
        lines.push(
          `🔥 Chuỗi **${status.streak}** đang giữ. Nếu không điểm danh trong **${timeLeft(status.keepStreakUntilMs)}** nữa, chuỗi sẽ về 0.`
        );
      } else if (status.broken) {
        lines.push('💔 Chuỗi đã đứt. Điểm danh lại để bắt đầu từ ngày 1.');
      }
      lines.push(`\nXem bảng 30 ngày: \`${prefix}daily xem\``);
      return msg.reply(lines.join('\n'));
    }

    // ===== Điểm danh =====
    const wasBroken = status.broken && (p.daily_streak || 0) > 0;
    const day = status.nextDay;
    const newStreak = status.streak + 1;
    const total = (p.daily_total || 0) + 1;
    const best = Math.max(p.daily_best || 0, newStreak);

    const granted = require('../db/database').transaction(() => {
      const reward = daily.grantReward(msg.author.id, p, day);
      updatePlayer(msg.author.id, {
        last_daily: now, daily_streak: newStreak, daily_total: total, daily_best: best,
      });
      return reward;
    })();

    const fresh = getPlayer(msg.author.id);

    // Dựng mô tả kết quả
    const parts = [`**Ngày ${day}/30** · ${daily.REWARDS[day - 1].label}`];
    if (wasBroken) parts.unshift('💔 Chuỗi cũ đã đứt — bắt đầu lại từ ngày 1.');
    parts.push('');
    parts.push(`+${fmt(granted.gold)} 💰 vàng`);
    if (granted.xp) parts.push(`+${fmt(granted.xp)} XP`);
    if (granted.healed) parts.push('❤️ Hồi đầy HP');
    if (granted.item) {
      const it = getItem(granted.item);
      parts.push(`🎁 ${granted.itemQty}× ${it?.name || granted.item}`);
    }
    if (granted.levelUp) parts.push(`\n🎉 **LÊN CẤP!** Đạt Lv.${granted.levelUp}`);

    // Milestones do not reset the uninterrupted streak.
    if (day === daily.CYCLE_DAYS) parts.push('\n🏆 **Trọn chu kỳ 30 ngày!** Lần tới nhận ngày 1; chuỗi liên tiếp và kỷ lục vẫn giữ.');
    else if (daily.MILESTONES.includes(day)) parts.push(`\n🏆 **Đạt mốc ngày ${day}!** Tiếp tục hướng tới mốc tiếp theo.`);
    else if (daily.MILESTONES.includes(day + 1)) parts.push(`\n🔥 Ngày mai là mốc **ngày ${day + 1}** — đừng bỏ lỡ.`);

    // Cảnh báo nếu đang cận hạn (người chơi hay quên)
    if (newStreak >= 3) parts.push(`\nChuỗi hiện tại: **${newStreak}**${best === newStreak && newStreak > 1 ? ' (kỷ lục mới!)' : ''}`);

    const embed = new EmbedBuilder()
      .setColor(daily.MILESTONES.includes(day) ? 0xF1C40F : 0x57F287)
      .setTitle(daily.MILESTONES.includes(day) ? `🏆 Điểm danh — Mốc ${day} ngày!` : '🎁 Điểm danh thành công')
      .setDescription(parts.join('\n'));

    if (daily.MILESTONES.includes(day) || daily.MILESTONES.includes(day + 1) || wasBroken) {
      embed.addFields({ name: '📅 Các mốc chu kỳ 30 ngày', value: buildTable(fresh)
        .filter(r => daily.MILESTONES.includes(r.day))
        .map(r => `${r.day <= day ? '✅' : '⬜'} Ngày ${r.day}: ${r.reward}`).join('\n') });
    }

    embed.setFooter({ text: `Điểm danh tiếp theo sau 24h · xem bảng: ${prefix}daily xem` });
    return msg.reply({ embeds: [embed] });
  },
};
