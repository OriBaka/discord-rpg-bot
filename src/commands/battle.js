// %battle <mob_id> — turn-based combat với elite/boss
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, updatePlayer, getEffectiveStats, addItem, addXpAndLevel } = require('../game/player');
const battle = require('../game/battle');
const skills = require('../game/skills');
const db = require('../db/database');
const { classInfo } = require('../game/classes');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
    || (msg.guild && msg.guild.ownerId === msg.author.id)
    || (msg.member && msg.member.permissions?.has('Administrator'));
}

function hpBar(current, max, width = 12) {
  const pct = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmtBuffs(buffsJson) {
  const b = JSON.parse(buffsJson || '{}');
  const keys = Object.keys(b);
  if (keys.length === 0) return '';
  return keys.map(k => {
    const emoji = { burn: '🔥', freeze: '❄️', stun: '💫', defend: '🛡️', def_down: '📉', atk_down: '⬇️', atk_up: '⬆️' }[k] || '❔';
    return `${emoji}${b[k].turns}`;
  }).join(' ');
}

function fmtCooldowns(cdJson) {
  const cd = JSON.parse(cdJson || '{}');
  const keys = Object.keys(cd);
  if (keys.length === 0) return '';
  return keys.map(k => {
    const sk = skills.getSkill(k);
    return `${sk?.name || k}(CD${cd[k]})`;
  }).join(' ');
}

function buildBattleEmbed(battleRow, playerName, mobName) {
  const pctA = Math.round((battleRow.hp_a / battleRow.max_hp_a) * 100);
  const pctB = Math.round((battleRow.hp_b / battleRow.max_hp_b) * 100);
  const buffsA = fmtBuffs(battleRow.buffs_a);
  const buffsB = fmtBuffs(battleRow.buffs_b);
  const cdA = fmtCooldowns(battleRow.cooldowns_a);

  let title = `⚔️ Battle: ${playerName} vs ${mobName}`;
  if (battleRow.is_elite === 2) title = `👑 BOSS BATTLE: ${playerName} vs ${mobName}`;
  else if (battleRow.is_elite === 1) title = `⭐ ELITE: ${playerName} vs ${mobName}`;

  const embed = new EmbedBuilder()
    .setColor(battleRow.is_elite === 2 ? 0xE91E63 : (battleRow.is_elite === 1 ? 0xF39C12 : 0x5865F2))
    .setTitle(title)
    .addFields(
      {
        name: `🟢 ${playerName} ${buffsA}`,
        value: `HP: ${hpBar(battleRow.hp_a, battleRow.max_hp_a)} **${battleRow.hp_a}**/${battleRow.max_hp_a} (${pctA}%)`,
        inline: false,
      },
      {
        name: `🔴 ${mobName} ${buffsB}`,
        value: `HP: ${hpBar(battleRow.hp_b, battleRow.max_hp_b)} **${battleRow.hp_b}**/${battleRow.max_hp_b} (${pctB}%)`,
        inline: false,
      },
      {
        name: `📜 Round ${battleRow.round} — ${battleRow.turn === 'a' ? '👤 Your turn' : '🤖 Mob turn'}`,
        value: (battleRow.last_log || '_(battle started)_').slice(0, 1000),
        inline: false,
      },
    );
  if (cdA) embed.setFooter({ text: `Cooldowns: ${cdA}` });
  return embed;
}

function buildActionButtons(battleId, playerClass) {
  const classSkills = skills.getSkillsForClass(playerClass);
  const rows = [];

  // Row 1: basic actions
  const basicRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bt:act:${battleId}:attack`).setLabel('Attack').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bt:act:${battleId}:defend`).setLabel('Defend').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`bt:act:${battleId}:flee`).setLabel('Flee').setEmoji('🏃').setStyle(ButtonStyle.Secondary),
  );
  rows.push(basicRow);

  // Row 2: class skills
  if (classSkills.length > 0) {
    const skillRow = new ActionRowBuilder();
    for (const s of classSkills.slice(0, 5)) {
      skillRow.addComponents(
        new ButtonBuilder().setCustomId(`bt:act:${battleId}:${s.id}`).setLabel(s.name.replace(/^[^\w]+\s/, '')).setStyle(ButtonStyle.Primary),
      );
    }
    rows.push(skillRow);
  }

  return rows;
}

module.exports = {
  name: 'battle',
  aliases: ['bt', 'fight'],
  description: 'Turn-based combat: %battle <mob_id> hoặc %battle list',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` trước.`);

    const sub = (args[0] || '').toLowerCase();

    // === List elite/boss ===
    if (!sub || sub === 'list') {
      const mobs = db.prepare(`SELECT id, name, hp, atk, def, xp, elite_tier FROM monsters WHERE elite_tier >= 1 ORDER BY elite_tier, hp`).all();
      if (mobs.length === 0) {
        return msg.reply(
          `💡 Chưa có elite/boss mob nào.\n` +
          (isAdmin(msg) ? `Admin: gõ \`${prefix}admin battleseed confirm\` để seed 6 elite + 3 boss.` : '')
        );
      }
      const lines = mobs.map(m => {
        const tag = m.elite_tier === 2 ? '👑' : '⭐';
        return `${tag} \`${m.id}\` **${m.name}** — ${m.hp} HP / ${m.atk} ATK / ${m.def} DEF / +${m.xp} XP`;
      });
      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('⚔️ Elite & Boss List')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${prefix}battle <mob_id> để bắt đầu • ⭐ elite / 👑 boss` });
      return msg.reply({ embeds: [embed] });
    }

    // === Admin seed ===
    if (sub === 'seed') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      const { seedBattleMobs } = require('../game/battle_mobs_seed');
      const r = seedBattleMobs();
      return msg.reply(`✅ Seed battle mobs: +${r.mobsAdded} mobs, +${r.dropsAdded} drops.`);
    }

    // === Start battle ===
    if (p.hp <= 0) return msg.reply(`💀 Bạn đang gục! Dùng \`${prefix}heal\` để hồi.`);
    const mobId = sub;
    const mob = db.prepare('SELECT * FROM monsters WHERE id=?').get(mobId);
    if (!mob) return msg.reply(`❌ Mob \`${mobId}\` không tồn tại. Gõ \`${prefix}battle list\` để xem.`);
    if (!mob.elite_tier || mob.elite_tier < 1) return msg.reply(`❌ \`${mobId}\` không phải elite/boss. Dùng \`${prefix}hunt\` cho mob thường.`);

    // Check trận đang diễn ra
    const active = db.prepare(`SELECT id FROM battles WHERE user_a=? AND status='active' LIMIT 1`).get(msg.author.id);
    if (active) return msg.reply(`⚔️ Bạn đang trong trận (id=${active.id}). Xử lý xong đã.`);

    const stats = getEffectiveStats(p);
    const battleId = battle.createBattle({
      mode: 'pve',
      channel_id: msg.channel.id,
      user_a: msg.author.id,
      monster_id: mobId,
      is_elite: mob.elite_tier,
      hp_a: p.hp,           max_hp_a: p.max_hp,
      atk_a: stats.atk,     def_a: stats.def,
      hp_b: mob.hp,         max_hp_b: mob.hp,
      atk_b: mob.atk,       def_b: mob.def,
      turn: 'a',
    });

    const battleRow = battle.getBattle(battleId);
    const embed = buildBattleEmbed(battleRow, p.name, mob.name);
    const rows = buildActionButtons(battleId, p.primary_class || 'melee');

    const sent = await msg.reply({ embeds: [embed], components: rows });
    battle.setMessageId(battleId, sent.id);
  },

  // Exports cho button handler
  buildBattleEmbed,
  buildActionButtons,
  hpBar,
};
 
