const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addXpAndLevel, addItem } = require('../game/player');
const {
  getMonster, getAllZones, getZone,
  pickMonsterInZone, pickMonsterForLevel,
} = require('../game/monsters');
const { simulateBattle, rollLoot } = require('../game/combat');
const { getItem } = require('../game/items');
const quests = require('../game/quests');
const achievements = require('../game/achievements');
const channels = require('../game/channels');
const pets = require('../game/pets');

const COOLDOWN_MS = 30 * 1000;

module.exports = {
  name: 'hunt',
  aliases: ['san', 'fight', 'atk'],
  description: 'Đi săn quái vật. !hunt = auto, !hunt <zone>, !hunt <monster_id>, !hunt list',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const sub = (args[0] || '').toLowerCase();

    // ===== !hunt list — xem danh sách zone =====
    if (sub === 'list' || sub === 'zones' || sub === 'zone') {
      const zones = getAllZones();
      const lines = zones.map(z => {
        const locked = p.level < z.min_level ? ' 🔒' : '';
        return `**${z.name}** \`${z.id}\` — Yêu cầu Lv.${z.min_level}${locked}\n› *${z.desc}*`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x57F287).setTitle('🗺️ Các khu vực săn quái')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Dùng: ${prefix}hunt <zone_id>  hoặc  ${prefix}hunt (tự chọn)` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== Check HP & cooldown =====
    if (p.hp <= 0) {
      return msg.reply(`💀 Bạn đang gục! Dùng \`${prefix}heal\` hoặc \`${prefix}daily\` để hồi.`);
    }
    const now = Date.now();
    const remain = COOLDOWN_MS - (now - p.last_hunt);
    if (remain > 0) {
      return msg.reply(`⏳ Còn **${Math.ceil(remain/1000)}s** nữa mới được đi săn tiếp.`);
    }

    // ===== Xác định quái =====
    let monster = null;
    let zoneNote = '';

    if (sub) {
      // Có arg → thử coi là zone_id trước, rồi đến monster_id
      const zone = getZone(sub);
      if (zone) {
        if (p.level < zone.min_level) {
          return msg.reply(`🔒 Khu vực **${zone.name}** yêu cầu Lv.${zone.min_level} (bạn Lv.${p.level}).`);
        }
        monster = pickMonsterInZone(zone.id);
        zoneNote = `📍 ${zone.name}`;
        if (!monster) return msg.reply('❌ Khu vực này chưa có quái nào!');
      } else {
        const m = getMonster(sub);
        if (m) {
          monster = m;
          zoneNote = `🎯 Tự chọn quái`;
        } else {
          return msg.reply(`❌ Không tìm thấy zone hoặc quái \`${sub}\`. Gõ \`${prefix}hunt list\` để xem zone.`);
        }
      }
    } else {
      // Auto theo level
      monster = pickMonsterForLevel(p.level);
      if (!monster) return msg.reply('❌ Không tìm thấy quái phù hợp!');
      zoneNote = `🎲 Auto theo Lv.${p.level}`;
    }

    // ===== Combat =====
    const result = simulateBattle(p, monster);
    updatePlayer(msg.author.id, { hp: result.playerHpAfter, last_hunt: now });

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Đụng độ ${monster.name}!`)
      .setDescription(`${zoneNote}\n\n` + result.log.slice(-6).join('\n'));

    if (result.win) {
      // === Apply pet bonus ===
      const petBonus = pets.getPetBonus(msg.author.id);
      const rawLoot = rollLoot(monster);
      const goldGain = Math.floor(rawLoot.gold * (1 + petBonus.gold_pct / 100));
      const xpGain   = Math.floor(monster.xp  * (1 + petBonus.xp_pct / 100));

      const lvl = addXpAndLevel(msg.author.id, xpGain);
      const cur = getPlayer(msg.author.id);
      updatePlayer(msg.author.id, { gold: cur.gold + goldGain });

      // Context cho notify + reward
      const ctx = { client: msg.client, guildId: msg.guild?.id };

      // === Hooks: quest + stats ===
      quests.onKillMonster(msg.author.id, monster.id);
      quests.onEarnGold(msg.author.id, goldGain);
      const stats = achievements.getPlayerStats(msg.author.id);
      achievements.updatePlayerStats(msg.author.id, {
        total_kills: stats.total_kills + 1,
        total_gold:  stats.total_gold  + goldGain,
      });

      // Pet drop bonus áp dụng vào item drop
      const loot = { gold: goldGain, items: rawLoot.items };
      // Re-roll items với drop bonus (đơn giản: roll lại 1 lần với bonus)
      // Hoặc bonus áp ở đây khi rollLoot — để đơn giản giữ rawLoot, chỉ áp dụng cho pet drop

      let lootText = `💰 +${loot.gold} vàng\n✨ +${xpGain} XP`;
      if (petBonus.gold_pct || petBonus.xp_pct) {
        const tags = [];
        if (petBonus.gold_pct) tags.push(`+${petBonus.gold_pct}% gold`);
        if (petBonus.xp_pct)   tags.push(`+${petBonus.xp_pct}% XP`);
        lootText += `  *(pet: ${tags.join(', ')})*`;
      }
      for (const it of loot.items) {
        addItem(msg.author.id, it.item_id, it.qty, ctx);
        const itm = getItem(it.item_id);
        lootText += `\n📦 +${it.qty}x ${itm?.name || it.item_id}`;
      }

      // === Pet/shard drops ===
      const petDrops = pets.rollPetDrops(monster.id, petBonus.drop_pct);
      for (const d of petDrops) {
        if (d.pet_id) {
          pets.addPet(msg.author.id, d.pet_id, d.qty, ctx);
          const pet = pets.getPet(d.pet_id);
          lootText += `\n🐾 **PET DROP!** ${pet.icon} ${pet.name} ×${d.qty}`;
        } else if (d.shard_id) {
          pets.addShard(msg.author.id, d.shard_id, d.qty);
          lootText += `\n🧩 +${d.qty}x \`${d.shard_id}\` (mảnh pet)`;
        }
      }
      if (lvl.levelsGained.length > 0) {
        lootText += `\n\n🎉 **LÊN CẤP!** Bạn đạt Lv.${lvl.newLevel} (HP đầy)`;
        try {
          channels.notify(msg.client, msg.guild?.id, 'levelup', {
            embeds: [new EmbedBuilder().setColor(0xFEE75C)
              .setTitle('🎉 Level Up!')
              .setDescription(`<@${msg.author.id}> vừa đạt **Lv.${lvl.newLevel}**!`)],
          });
        } catch {}
      }

      // Check achievements (auto apply reward + notify nhờ ctx)
      const newAchs = [
        ...achievements.checkAndGrant(msg.author.id, ctx),
        ...achievements.checkKillMonster(msg.author.id, monster.id, ctx),
      ];
      if (newAchs.length > 0) {
        lootText += `\n\n🏆 **Đạt thành tựu mới:** ${newAchs.map(a => `${a.icon} ${a.name}`).join(', ')}`;
      }

      embed.setColor(0x57F287).addFields({ name: '🏆 Chiến thắng!', value: lootText });
    } else {
      embed.setColor(0xED4245).addFields({
        name: '💀 Thất bại!',
        value: `Bạn đã gục trước ${monster.name}. Dùng \`${prefix}heal\` để hồi máu.`,
      });
    }

    return msg.reply({ embeds: [embed] });
  },
};
