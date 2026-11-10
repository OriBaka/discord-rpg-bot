const { EmbedBuilder } = require('discord.js');
const { getPlayer, addItem } = require('../game/player');
const { getItem } = require('../game/items');
const jobs = require('../game/jobs');
const gz = require('../game/gather_zones');
const { tierInfo } = require('../game/tiers');
const settings = require('../game/settings');
const farmEvents = require('../game/farm_events');

const JOB = 'fishing';

function resolveFishCd(zone) {
  const override = settings.getCdOverride('fishing', zone.id) ?? settings.getCdOverride('fishing');
  return override ?? zone.cooldown_ms;
}

function hasTool(userId, weaponType) {
  const db = require('../db/database');
  return db.prepare(`
    SELECT i.id, i.name, i.tier, i.min_level FROM inventory inv
    JOIN items i ON i.id = inv.item_id
    WHERE inv.user_id=? AND i.weapon_type=? AND inv.qty > 0
  `).all(userId, weaponType);
}

function tierBonusMult(tier) {
  return { common: 1.0, rare: 1.15, epic: 1.3, legendary: 1.5 }[tier] || 1.0;
}

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

module.exports = {
  name: 'fish',
  aliases: ['fishing', 'cau'],
  description: 'Câu cá. !fish, !fish list, !fish <zone>',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();
    const job = jobs.getJob(msg.author.id, JOB);

    if (sub === 'list' || sub === 'zones' || sub === 'l') {
      const zones = gz.getZonesByJob(JOB);
      const lines = zones.map(z => {
        const locked = job.level < z.min_job_level ? ' 🔒' : '';
        const drops = gz.getDrops(z.id);
        const dropList = drops.map(d => {
          const it = getItem(d.item_id);
          return `${it?.name || d.item_id} (${Math.round(d.chance*100)}%)`;
        }).slice(0, 4).join(', ');
        return `${z.icon} **${z.name}** \`${z.id}\` — Lv.${z.min_job_level}+${locked}\n   *${z.desc}*\n   🎣 ${dropList}${drops.length > 4 ? '...' : ''}`;
      });
      const embed = new EmbedBuilder().setColor(0x3498DB)
        .setTitle(`🎣 Fishing Zones (Lv.${job.level})`)
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `${prefix}fish <zone_id> để câu • XP: ${job.xp}/${jobs.xpToNext(job.level)}` });
      return msg.reply({ embeds: [embed] });
    }

    let zoneId = sub;
    if (!zoneId) {
      const zones = gz.getZonesByJob(JOB).filter(z => job.level >= z.min_job_level);
      if (zones.length === 0) return msg.reply(`❌ Không có hồ câu nào phù hợp với Lv.${job.level}.`);
      zoneId = zones[zones.length - 1].id;
    }

    const zone = gz.getZone(zoneId);
    if (!zone || zone.job_type !== JOB) return msg.reply(`❌ Zone \`${zoneId}\` không tồn tại.`);
    if (job.level < zone.min_job_level) {
      return msg.reply(`🔒 **${zone.name}** yêu cầu Fishing Lv.${zone.min_job_level} (bạn Lv.${job.level}).`);
    }

    // Check tool: cần fishing rod
    const rods = hasTool(msg.author.id, 'fishing_rod');
    if (rods.length === 0) {
      return msg.reply(`🎣 Bạn cần **Fishing Rod** để câu! Mua ở shop (\`${require('../game/prefix').getPrefix()}shop\`).`);
    }
    const usable = rods.filter(rd => (rd.min_level || 0) <= p.level);
    if (usable.length === 0) {
      const lowest = rods.sort((a, b) => (a.min_level || 0) - (b.min_level || 0))[0];
      return msg.reply(`🔒 Fishing Rod của bạn (**${lowest.name}**) cần LV **${lowest.min_level}** để dùng (bạn LV ${p.level}). Mua rod thấp hơn ở shop.`);
    }
    const bestRod = usable.sort((a, b) => {
      const order = { legendary: 4, epic: 3, rare: 2, common: 1 };
      return (order[b.tier] || 0) - (order[a.tier] || 0);
    })[0];
    const mult = tierBonusMult(bestRod.tier);

    const cdMs = resolveFishCd(zone);
    const remain = jobs.getCooldownRemaining(msg.author.id, JOB, cdMs);
    if (remain > 0) return msg.reply(`⏳ Còn **${formatTime(remain)}** nữa mới câu tiếp được.`);

    jobs.setCooldown(msg.author.id, JOB);
    const drops = gz.rollDrops(zoneId);
    // --- Cơ chế vui (chuỗi / luồng cá / kho báu) ---
    // Chuỗi chỉ tăng khi TRÚNG, đứt khi TRƯỢT — nếu không nó là buff vĩnh viễn.
    const hit = drops.length > 0;
    const streakRes = hit
      ? farmEvents.bumpStreak(msg.author.id, JOB)
      : farmEvents.resetStreak(msg.author.id, JOB);
    const streak = streakRes.streak;
    // Chạm mốc là ăn ngay lần đó — phản hồi tức thì, không phải chờ lần sau.
    const sMult = farmEvents.streakMult(streak);
    const vein = farmEvents.rollVein();
    const treasure = farmEvents.rollTreasure(zoneId);

    let bonusText = '';
    const effMult = mult * sMult * (vein ? 2 : 1);
    for (const d of drops) {
      d.qty = Math.max(1, Math.round(d.qty * effMult));
    }

    if (vein && hit) bonusText += '\n🐟 **Luồng cá!** Số lượng ×2';
    if (!hit) {
      bonusText += streakRes.streak === 0 && streakRes.best > 0
        ? `\n💔 Trượt — chuỗi đứt (kỷ lục: **${streakRes.best}**)`
        : '';
    } else {
      const sLabel = farmEvents.streakLabel(streak);
      if (sLabel) bonusText += `\n${sLabel} — chuỗi **${streak}** (×${sMult} số lượng)`;
      else if (streak >= 2) bonusText += `\n🔥 Chuỗi **${streak}**`;
    }

    let dropText = '';
    if (drops.length === 0 && !treasure) {
      dropText = '🎣 *Không cắn câu... thử lại lần sau!*';
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
      lvlText = `\n\n🎉 **Fishing Lv.UP!** Đạt Lv.${xpResult.level}`;
    }

    const embed = new EmbedBuilder().setColor(0x3498DB)
      .setTitle(`🎣 Câu tại ${zone.icon} ${zone.name}`)
      .setDescription(dropText + lvlText)
      .setFooter({ text: `+${zone.base_xp} Fishing XP • Lv.${xpResult.level} (${xpResult.xp}/${xpResult.xpToNext})` });
    const { buildAgainRow } = require('../game/again_button');
    return msg.reply({ embeds: [embed], components: [buildAgainRow('fish', msg.author.id, args)] });
  },
};
