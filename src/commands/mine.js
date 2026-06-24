const { EmbedBuilder } = require('discord.js');
const { getPlayer, addItem } = require('../game/player');
const { getItem } = require('../game/items');
const jobs = require('../game/jobs');
const gz = require('../game/gather_zones');
const { tierInfo } = require('../game/tiers');

const JOB = 'mining';

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

module.exports = {
  name: 'mine',
  aliases: ['mining', 'dao'],
  description: 'Đào mỏ. !mine, !mine list, !mine <zone>',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();
    const job = jobs.getJob(msg.author.id, JOB);

    // ===== list zones =====
    if (sub === 'list' || sub === 'zones' || sub === 'l') {
      const zones = gz.getZonesByJob(JOB);
      const lines = zones.map(z => {
        const locked = job.level < z.min_job_level ? ' 🔒' : '';
        const drops = gz.getDrops(z.id);
        const dropList = drops.map(d => {
          const it = getItem(d.item_id);
          return `${it?.name || d.item_id} (${Math.round(d.chance*100)}%)`;
        }).slice(0, 4).join(', ');
        return `${z.icon} **${z.name}** \`${z.id}\` — Lv.${z.min_job_level}+${locked}\n   *${z.desc}*\n   📦 ${dropList}${drops.length > 4 ? '...' : ''}`;
      });
      const embed = new EmbedBuilder().setColor(0x95A5A6)
        .setTitle(`⛏️ Mining Zones (Lv.${job.level})`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `${prefix}mine <zone_id> để đào • XP: ${job.xp}/${jobs.xpToNext(job.level)}` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== mine (action) =====
    // Default zone = lowest available
    let zoneId = sub;
    if (!zoneId) {
      const zones = gz.getZonesByJob(JOB).filter(z => job.level >= z.min_job_level);
      if (zones.length === 0) {
        return msg.reply(`❌ Không có mỏ nào phù hợp với Lv.${job.level}.`);
      }
      // Pick highest available zone
      zoneId = zones[zones.length - 1].id;
    }

    const zone = gz.getZone(zoneId);
    if (!zone || zone.job_type !== JOB) return msg.reply(`❌ Zone \`${zoneId}\` không tồn tại.`);
    if (job.level < zone.min_job_level) {
      return msg.reply(`🔒 Khu vực **${zone.name}** yêu cầu Mining Lv.${zone.min_job_level} (bạn Lv.${job.level}).`);
    }

    // Check cooldown
    const remain = jobs.getCooldownRemaining(msg.author.id, JOB, zone.cooldown_ms);
    if (remain > 0) {
      return msg.reply(`⏳ Còn **${formatTime(remain)}** nữa mới đào tiếp được.`);
    }

    // Set cooldown & roll drops
    jobs.setCooldown(msg.author.id, JOB);
    const drops = gz.rollDrops(zoneId);

    // Apply drops
    let dropText = '';
    if (drops.length === 0) {
      dropText = '*Không tìm thấy gì...*';
    } else {
      for (const d of drops) {
        addItem(msg.author.id, d.item_id, d.qty);
        const it = getItem(d.item_id);
        const t = tierInfo(it?.tier || 'common');
        dropText += `${t.emoji} +${d.qty}× ${it?.name || d.item_id}\n`;
      }
    }

    // Add XP
    const xpResult = jobs.addJobXp(msg.author.id, JOB, zone.base_xp);
    let lvlText = '';
    if (xpResult.levelsGained.length > 0) {
      lvlText = `\n\n🎉 **Mining Lv.UP!** Đạt Lv.${xpResult.level}`;
    }

    const embed = new EmbedBuilder().setColor(0x95A5A6)
      .setTitle(`⛏️ Đào tại ${zone.icon} ${zone.name}`)
      .setDescription(dropText + lvlText)
      .setFooter({ text: `+${zone.base_xp} Mining XP • Total Lv.${xpResult.level} (${xpResult.xp}/${xpResult.xpToNext})` });
    return msg.reply({ embeds: [embed] });
  },
}; 
