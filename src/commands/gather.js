// %gather — nghề hái lượm (foraging)
//
// Vì sao là lệnh riêng chứ không nhồi vào %mine/%fish: mỗi nghề có bảng drop,
// cooldown và XP riêng trong `gather_zones`; %mine và %fish đang là bản sao gần
// như y hệt nhau (chỉ khác JOB + tool). Thêm nghề thứ 3 bằng cách copy thêm lần
// nữa sẽ thành 3 bản sao lệch nhau — nhưng gộp cả 3 vào 1 file là việc refactor
// lớn hơn phạm vi lần này. Ở đây giữ đúng cấu trúc để người chơi thấy quen, và
// phần logic khác biệt thật (không cần dụng cụ, thưởng theo cấp nghề) được viết
// rõ ràng thay vì giả lập một cái pickaxe không tồn tại.
const { EmbedBuilder } = require('discord.js');
const { getPlayer, addItem } = require('../game/player');
const { getItem } = require('../game/items');
const jobs = require('../game/jobs');
const gz = require('../game/gather_zones');
const { tierInfo } = require('../game/tiers');
const settings = require('../game/settings');
const farmEvents = require('../game/farm_events');

const JOB = 'foraging';

// Cooldown: override cd_foraging_<zone> > cd_foraging > zone.cooldown_ms
function resolveCd(zone) {
  const override = settings.getCdOverride(JOB, zone.id) ?? settings.getCdOverride(JOB);
  return override ?? zone.cooldown_ms;
}

// Thưởng "hái khéo": không có dụng cụ để so tier (khác %mine có pickaxe), nên
// phần thưởng gắn với VIỆC CHƠI LÂU: mỗi 10 cấp nghề vượt mốc của zone +5% số
// lượng, tối đa +25%. Nhờ vậy zone cũ vẫn có ý nghĩa khi đã lên cấp, giống cách
// pickaxe xịn làm cho mỏ cũ đỡ vô dụng.
function levelBonusMult(jobLevel, zoneMinLevel) {
  const steps = Math.floor(Math.max(0, jobLevel - zoneMinLevel) / 10);
  return 1 + Math.min(0.25, steps * 0.05);
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

module.exports = {
  name: 'gather',
  aliases: ['forage', 'hai', 'hailuom'],
  description: 'Hái lượm. !gather, !gather list, !gather <zone>',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();
    const job = jobs.getJob(msg.author.id, JOB);

    // ===== list zones =====
    if (sub === 'list' || sub === 'zones' || sub === 'l') {
      const zones = gz.getZonesByJob(JOB);
      if (zones.length === 0) {
        return msg.reply(`💡 Chưa có khu hái lượm nào. Admin tạo bằng \`${prefix}gz create <id> job=foraging name="..."\`.`);
      }
      const lines = zones.map(z => {
        const locked = job.level < z.min_job_level ? ' 🔒' : '';
        const drops = gz.getDrops(z.id);
        const dropList = drops.map(d => {
          const it = getItem(d.item_id);
          return `${it?.name || d.item_id} (${Math.round(d.chance * 100)}%)`;
        }).slice(0, 4).join(', ');
        return `${z.icon} **${z.name}** \`${z.id}\` — Lv.${z.min_job_level}+${locked}\n   *${z.desc}*\n   📦 ${dropList}${drops.length > 4 ? '...' : ''}`;
      });
      const embed = new EmbedBuilder().setColor(0x57F287)
        .setTitle(`🌿 Foraging Zones (Lv.${job.level})`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `${prefix}gather <zone_id> để hái • XP: ${job.xp}/${jobs.xpToNext(job.level)}` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== gather (action) =====
    let zoneId = sub;
    if (!zoneId) {
      const zones = gz.getZonesByJob(JOB).filter(z => job.level >= z.min_job_level);
      if (zones.length === 0) {
        return msg.reply(`❌ Chưa có khu hái lượm nào phù hợp với Lv.${job.level}.`);
      }
      zoneId = zones[zones.length - 1].id; // zone cao nhất đã mở
    }

    const zone = gz.getZone(zoneId);
    if (!zone || zone.job_type !== JOB) {
      return msg.reply(`❌ Zone \`${zoneId}\` không tồn tại. Gõ \`${prefix}gather list\` để xem danh sách.`);
    }
    if (job.level < zone.min_job_level) {
      return msg.reply(`🔒 Khu vực **${zone.name}** yêu cầu Foraging Lv.${zone.min_job_level} (bạn Lv.${job.level}).`);
    }

    const cdMs = resolveCd(zone);
    const remain = jobs.getCooldownRemaining(msg.author.id, JOB, cdMs);
    if (remain > 0) {
      return msg.reply(`⏳ Còn **${formatTime(remain)}** nữa mới hái tiếp được.`);
    }

    jobs.setCooldown(msg.author.id, JOB);
    const drops = gz.rollDrops(zoneId);

    // Chuỗi may mắn: chỉ tăng khi trúng, đứt khi trượt (giống mine/fish)
    const hit = drops.length > 0;
    const streakRes = hit
      ? farmEvents.bumpStreak(msg.author.id, JOB)
      : farmEvents.resetStreak(msg.author.id, JOB);
    const streak = streakRes.streak;
    const sMult = farmEvents.streakMult(streak);
    const vein = farmEvents.rollVein();
    const treasure = farmEvents.rollTreasure(zoneId);

    const lvlMult = levelBonusMult(job.level, zone.min_job_level);
    const effMult = lvlMult * sMult * (vein ? 2 : 1);
    for (const d of drops) d.qty = Math.max(1, Math.round(d.qty * effMult));

    let bonusText = '';
    if (vein && hit) bonusText += '\n🌿 **Luống mọc dày!** Số lượng ×2';
    if (lvlMult > 1) bonusText += `\n🎯 Hái khéo: ×${lvlMult.toFixed(2)} số lượng`;
    if (!hit) {
      if (streakRes.streak === 0 && streakRes.best > 0) {
        bonusText += `\n💔 Trượt — chuỗi đứt (kỷ lục: **${streakRes.best}**)`;
      }
    } else {
      const sLabel = farmEvents.streakLabel(streak);
      if (sLabel) bonusText += `\n${sLabel} — chuỗi **${streak}** (×${sMult} số lượng)`;
      else if (streak >= 2) bonusText += `\n🔥 Chuỗi **${streak}**`;
    }

    let dropText = '';
    if (drops.length === 0 && !treasure) {
      dropText = '*Không hái được gì...*';
    } else {
      for (const d of drops) {
        addItem(msg.author.id, d.item_id, d.qty);
        const it = getItem(d.item_id);
        const t = tierInfo(it?.tier || 'common');
        dropText += `${t.emoji} +${d.qty}× ${it?.name || d.item_id}\n`;
      }
      if (treasure) {
        addItem(msg.author.id, treasure.item_id, treasure.qty);
        const tit = getItem(treasure.item_id);
        const tt = tierInfo(tit?.tier || 'common');
        dropText += `\n${tt.emoji} ✨ **KHO BÁU!** +${treasure.qty}× ${tit?.name || treasure.item_id}`;
      }
    }
    dropText += bonusText;

    const xpResult = jobs.addJobXp(msg.author.id, JOB, zone.base_xp);
    let lvlText = '';
    if (xpResult.levelsGained.length > 0) {
      lvlText = `\n\n🎉 **Foraging Lv.UP!** Đạt Lv.${xpResult.level}`;
    }

    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle(`🌿 Hái lượm tại ${zone.icon} ${zone.name}`)
      .setDescription(dropText + lvlText)
      .setFooter({ text: `+${zone.base_xp} Foraging XP • Total Lv.${xpResult.level} (${xpResult.xp}/${xpResult.xpToNext})` });
    const { buildAgainRow } = require('../game/again_button');
    return msg.reply({ embeds: [embed], components: [buildAgainRow('gather', msg.author.id, args)] });
  },
};
