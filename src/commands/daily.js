// %daily — điểm danh hàng ngày, chuỗi 7 ngày.
//
//   %daily        điểm danh (hoặc xem còn chờ bao lâu)
//   %daily xem    xem bảng 7 ngày + đang ở đâu (không điểm danh)
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

// Bảng 7 ngày — dùng để hiện cho người chơi biết mình đang ở đâu
function buildTable(player) {
  const rate = daily.zoneRate(player.level);
  const lines = [];
  for (const r of daily.REWARDS) {
    const gold = Math.round(rate.gold * r.goldKill);
    const xp = Math.round(rate.xp * r.xpKill);
    let reward = `${fmt(gold)} 💰 · ${fmt(xp)} XP`;
    // Ngày lẻ hồi đầy HP (khi đang mất máu) — nhịp nghỉ giữa các ngày
    if (r.day % 2 === 1) reward += ' · hồi đầy HP';
    if (r.item) reward += ` · 1× ${getItem(daily.day7Item(player.level))?.name || 'vật phẩm'}`;
    lines.push({ day: r.day, label: r.label, reward });
  }
  return lines;
}

function renderTable(player, status, { justClaimed = false } = {}) {
  const rows = buildTable(player);

  // Thanh tiến trình chuỗi: ✅ ngày đã nhận, ⏳ hôm nay, ⬜ chưa tới
  // Số ngày đã nhận trong CHU KỲ 7 ngày hiện tại (streak có thể > 7)
  const doneCount = status.streak > 0 ? ((status.streak - 1) % 7) + 1 : 0;
  const bar = rows.map(r => {
    if (r.day <= doneCount) return '✅';
    if (r.day === status.nextDay) return '⏳';
    return '⬜';
  }).join('');

  // `streak` là SỐ NGÀY LIÊN TIẾP (có thể >7), còn chu kỳ phần thưởng là 7.
  // Hiển thị cả hai để không ai tưởng streak=8 là lỗi.
  const inCycle = status.streak > 0 ? ((status.streak - 1) % 7) + 1 : 0;
  const desc = [
    `**Đã nhận ${inCycle}/7 ngày của chu kỳ này** · chuỗi liên tiếp: **${status.streak}** ngày · tổng: **${player.daily_total || 0}** · kỷ lục: **${player.daily_best || 0}**`,
    bar,
    '',
    ...rows.map(r => {
      const mark = r.day === status.nextDay ? '👉' : (r.day <= doneCount ? '✓' : '  ');
      return `${mark} **Ngày ${r.day}** · ${r.label} — ${r.reward}`;
    }),
  ];

  return desc.join('\n');
}

module.exports = {
  name: 'daily',
  aliases: ['diemdanh', 'dd'],
  description: 'Điểm danh hàng ngày (chuỗi 7 ngày). %daily | %daily xem',
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
        .setTitle('📅 Điểm danh 7 ngày')
        .setDescription(renderTable(p, status))
        .setFooter({
          text: status.canClaim
            ? `Có thể điểm danh ngay — gõ ${prefix}daily`
            : `Điểm danh tiếp theo sau ${timeLeft(status.remainMs)}`,
        });
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
      lines.push(`\nXem bảng 7 ngày: \`${prefix}daily xem\``);
      return msg.reply(lines.join('\n'));
    }

    // ===== Điểm danh =====
    const wasBroken = status.broken && (p.daily_streak || 0) > 0;
    const day = status.nextDay;
    const newStreak = status.streak + 1;
    const total = (p.daily_total || 0) + 1;
    const best = Math.max(p.daily_best || 0, newStreak);

    const granted = daily.grantReward(msg.author.id, p, day);

    updatePlayer(msg.author.id, {
      last_daily: now,
      daily_streak: newStreak,
      daily_total: total,
      daily_best: best,
    });

    const fresh = getPlayer(msg.author.id);
    const newStatus = daily.getStatus(fresh, Date.now());

    // Dựng mô tả kết quả
    const parts = [`**Ngày ${day}/7** · ${daily.REWARDS[day - 1].label}`];
    if (wasBroken) parts.unshift('💔 Chuỗi cũ đã đứt — bắt đầu lại từ ngày 1.');
    parts.push('');
    parts.push(`+${fmt(granted.gold)} 💰 vàng`);
    if (granted.xp) parts.push(`+${fmt(granted.xp)} XP`);
    if (granted.healed) parts.push('❤️ Hồi đầy HP');
    if (granted.item) {
      const it = getItem(granted.item);
      parts.push(`🎁 1× ${it?.name || granted.item}`);
    }
    if (granted.levelUp) parts.push(`\n🎉 **LÊN CẤP!** Đạt Lv.${granted.levelUp}`);

    // Mốc đặc biệt
    if (day === 7) parts.push('\n🏆 **Trọn chuỗi 7 ngày!** Ngày mai chu kỳ mới bắt đầu lại từ ngày 1 (chuỗi liên tiếp vẫn được tính).');
    else if (day === 6) parts.push('\n🔥 Ngày mai là mốc **ngày 7** — đừng bỏ lỡ.');

    // Cảnh báo nếu đang cận hạn (người chơi hay quên)
    if (newStreak >= 3) parts.push(`\nChuỗi hiện tại: **${newStreak}**${best === newStreak && newStreak > 1 ? ' (kỷ lục mới!)' : ''}`);

    const embed = new EmbedBuilder()
      .setColor(day === 7 ? 0xF1C40F : 0x57F287)
      .setTitle(day === 7 ? '🏆 Điểm danh — Trọn tuần!' : '🎁 Điểm danh thành công')
      .setDescription(parts.join('\n'));

    // Cho xem bảng khi gần mốc hoặc mới đứt chuỗi, để biết mất gì / sắp được gì
    if (day === 7 || day === 6 || wasBroken) {
      embed.addFields({ name: '📅 Chuỗi 7 ngày', value: buildTable(fresh).map(r => {
        const mark = r.day <= newStreak ? '✅' : '⬜';
        return `${mark} Ngày ${r.day}: ${r.reward}`;
      }).join('\n').slice(0, 1024) });
    }

    embed.setFooter({ text: `Điểm danh tiếp theo sau 24h · xem bảng: ${prefix}daily xem` });
    return msg.reply({ embeds: [embed] });
  },
};
