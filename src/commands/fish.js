const { EmbedBuilder } = require('discord.js');
const { getPlayer, addItem } = require('../game/player');
const { getItem } = require('../game/items');
const jobs = require('../game/jobs');
const gz = require('../game/gather_zones');
const { tierInfo } = require('../game/tiers');
const settings = require('../game/settings');
const farmEvents = require('../game/farm_events');
const jobTools = require('../game/job_tools');
const jobBuffs = require('../game/job_buffs');

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
    const usable = rods.filter(rd => (rd.min_level || 0) <= job.level);
    if (usable.length === 0) {
      const lowest = rods.sort((a, b) => (a.min_level || 0) - (b.min_level || 0))[0];
      return msg.reply(`🔒 Fishing Rod của bạn (**${lowest.name}**) cần Fishing Lv.**${lowest.min_level}** để dùng (nghề Lv.${job.level}). Mua rod thấp hơn ở shop.`);
    }
    // Display the exact tool used by the shared bonus calculation. Tier alone
    // cannot distinguish wooden/copper, iron/silver, or gold/mithril tools.
    const tb = jobBuffs.bonus(msg.author.id, JOB, job.level);
    const bestRod = tb.tool || usable[0];
    const toolStat = tb.tool || { drop_bonus: 0, qty_bonus: 0 };
    const lockedTool = rods.filter(t => (t.min_level || 0) > job.level)
      .sort((a, b) => a.min_level - b.min_level)[0];
    const lockedText = lockedTool ? `\n🔒 ${lockedTool.name} cần cấp nghề Fishing ${lockedTool.min_level} (bạn Lv.${job.level}), chưa dùng được.` : '';
    const mult = tb.qtyMult;
    const dropMult = tb.dropMult;

    const cdMs = resolveFishCd(zone);
    const remain = jobs.getCooldownRemaining(msg.author.id, JOB, cdMs);
    if (remain > 0) return msg.reply(`⏳ Còn **${formatTime(remain)}** nữa mới câu tiếp được.`);

    jobs.setCooldown(msg.author.id, JOB);
    const drops = gz.rollDrops(zoneId, { chanceMult: dropMult });
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

    // Đếm tổng nguyên liệu nhận được để cộng tiến độ quest 'gather'
    let gatherQty = 0;
    let dropText = '';
    if (drops.length === 0 && !treasure) {
      dropText = '🎣 *Không cắn câu... thử lại lần sau!*';
    } else {
      for (const d of drops) {
        if (tb.extraChance > 0 && Math.random() < tb.extraChance) d.qty++;
        addItem(msg.author.id, d.item_id, d.qty);
        gatherQty += d.qty;
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

    // Quest 'gather': tính theo SỐ NGUYÊN LIỆU, không phải số lần bấm lệnh
    require('../game/quests').onGather(msg.author.id, JOB, gatherQty);

    const xpResult = jobs.addJobXp(msg.author.id, JOB, zone.base_xp,
      { client: msg.client, guildId: msg.guild?.id });
    let lvlText = '';
    if (xpResult.levelsGained.length > 0) {
      lvlText = `\n\n🎉 **Fishing Lv.UP!** Đạt Lv.${xpResult.level}`;
    }
    // Thành tựu nghề mở đúng lúc lên cấp — hiện ngay trong phản hồi, không im lặng
    if (xpResult.achievements && xpResult.achievements.length > 0) {
      lvlText += `\n\n🏆 **Thành tựu mới**: ${xpResult.achievements.map(a => `${a.icon} ${a.name}`).join(', ')}`;
    }

    let buffText = '';
    if (tb.buff) {
      const left = jobBuffs.consume(msg.author.id, JOB);
      buffText = `\n${jobBuffs.describeActive(tb.buff)}` + (left === 0 ? ' — **vừa hết lượt**' : '');
    }

    const embed = new EmbedBuilder().setColor(0x3498DB)
      .setTitle(`🎣 Câu tại ${zone.icon} ${zone.name}`)
      .setDescription(dropText + lvlText + `\n\n🧰 **${bestRod.name}** — ${jobTools.describe(toolStat)}${lockedText}` + buffText)
      .setFooter({ text: `+${xpResult.xpGained} Fishing XP • Lv.${xpResult.level} (${xpResult.xp}/${xpResult.xpToNext})` });
    const { buildAgainRow } = require('../game/again_button');
    const files = require('../game/gather_art').applyGatherArt(embed, zone);
    return msg.reply({ embeds: [embed], files, components: [buildAgainRow('fish', msg.author.id, args)] });
  },
};
