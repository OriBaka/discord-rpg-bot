const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer } = require('../game/player');
const achievements = require('../game/achievements');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

function parseKV(args) {
  const out = {};
  for (const a of args) {
    const i = a.indexOf('=');
    if (i < 0) continue;
    out[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
  }
  return out;
}

function resolveTarget(msg, arg) {
  if (!arg) return msg.author;
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || msg.author;
}

module.exports = {
  name: 'ach',
  aliases: ['achievement', 'achievements', 'tt2'],
  description: 'Xem thành tựu: !ach, !ach list, !ach top, !ach @user',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    // ====== Admin ======
    if (sub === 'admin') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      return handleAdmin(msg, args.slice(1), prefix);
    }

    // ====== list (all achievements available) ======
    if (sub === 'list' || sub === 'all') {
      const all = achievements.getAllAchievements();
      const userAch = new Set(achievements.getPlayerAchievements(msg.author.id).map(a => a.id));
      const lines = all.map(a => {
        const mark = userAch.has(a.id) ? '✅' : '⬜';
        return `${mark} ${a.icon} **${a.name}** (${a.points}pt) — *${a.desc}*`;
      });
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`🏆 Achievements (${userAch.size}/${all.length} unlocked)`)
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: `Tổng: ${all.length} thành tựu` });
      return msg.reply({ embeds: [embed] });
    }

    // ====== top — bảng xếp hạng ach_points ======
    if (sub === 'top' || sub === 'leaderboard' || sub === 'bxh') {
      const top = db.prepare(`SELECT ps.user_id, ps.ach_points, ps.current_title, p.name
        FROM player_stats ps
        JOIN players p ON p.user_id = ps.user_id
        WHERE ps.ach_points > 0
        ORDER BY ps.ach_points DESC LIMIT 10`).all();
      if (top.length === 0) return msg.reply('💡 Chưa ai có điểm thành tựu.');
      const lines = top.map((r, i) => {
        const medal = ['🥇','🥈','🥉'][i] || `**${i+1}.**`;
        const title = r.current_title ? ` *${r.current_title}*` : '';
        return `${medal} **${r.name}**${title} — ${r.ach_points} pt`;
      });
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle('🏆 Bảng xếp hạng Achievement')
        .setDescription(lines.join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    // ====== Default: xem ach của mình hoặc user khác ======
    const target = resolveTarget(msg, args[0]);
    const p = getPlayer(target.id);
    if (!p) return msg.reply(`❌ ${target.username} chưa có nhân vật.`);

    const userAchs = achievements.getPlayerAchievements(target.id);
    const stats = achievements.getPlayerStats(target.id);
    const allAchs = achievements.getAllAchievements();

    const embed = new EmbedBuilder().setColor(0xF1C40F)
      .setTitle(`🏆 Achievement của ${p.name}`)
      .addFields(
        { name: '⭐ Điểm', value: `${stats.ach_points}`, inline: true },
        { name: '📊 Tiến độ', value: `${userAchs.length}/${allAchs.length}`, inline: true },
        { name: '🎖️ Title', value: stats.current_title || '*Chưa có*', inline: true },
        { name: '📈 Stats', value:
          `🗡️ Total kills: **${stats.total_kills}**\n` +
          `💰 Total gold earned: **${stats.total_gold}**\n` +
          `📜 Quests completed: **${stats.total_quests}**` },
      );

    if (userAchs.length > 0) {
      const recent = userAchs.slice(0, 10).map(a => `${a.icon} **${a.name}** *(${a.points}pt)*`);
      embed.addFields({ name: '🎖️ Đã unlock (mới nhất)', value: recent.join('\n').slice(0, 1024) });
    } else {
      embed.addFields({ name: '🎖️ Đã unlock', value: '*Chưa có thành tựu nào*' });
    }

    return msg.reply({ embeds: [embed] });
  },
};

// ===== Admin sub =====
async function handleAdmin(msg, args, prefix) {
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🛠️ Achievement Admin')
      .setDescription([
        `\`${prefix}ach admin create <id> name="..." desc="..." icon="🏆" obj=kill_count qty=100 points=25 gold=500 xp=200 item=potion_l:2 title="Hunter"\``,
        `\`${prefix}ach admin delete <id>\``,
        `\`${prefix}ach admin grant @user <id>\` — grant thủ công`,
        '',
        'obj values: `kill_count` | `kill_monster` (cần target=mob_id) | `level_reach` | `gold_total` | `item_collect` (cần target=item_id) | `quest_complete`',
        '',
        '⚠️ Reward sẽ được tự cấp khi user unlock achievement (qua hunt/quest).',
      ].join('\n'));
    return msg.reply({ embeds: [embed] });
  }

  if (sub === 'delete' || sub === 'del') {
    const id = args[1];
    if (!id) return msg.reply('❌ Thiếu id.');
    const ok = achievements.deleteAchievement(id);
    return msg.reply(ok ? `🗑️ Đã xoá \`${id}\`` : '❌ Achievement không tồn tại.');
  }

  if (sub === 'grant') {
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Cần mention user.');
    const id = args[2];
    if (!id) return msg.reply('❌ Thiếu id.');
    if (!achievements.getAchievement(id)) return msg.reply('❌ Achievement không tồn tại.');
    const ach = achievements.grantAchievement(target.id, id);
    return msg.reply(ach ? `✅ Đã grant **${ach.name}** cho **${target.username}**.` : '💡 User đã có rồi.');
  }

  if (sub === 'create' || sub === 'new') {
    const raw = msg.content.slice(prefix.length).trim();
    const rest = raw.replace(/^\S+\s+\S+\s+\S+\s*/, '');
    const tokens = rest.match(/[^\s"]+|"([^"]*)"/g)?.map(t =>
      t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
    ) || [];
    const id = tokens[0];
    if (!id) return msg.reply('❌ Thiếu id.');
    if (achievements.getAchievement(id)) return msg.reply('❌ Id đã tồn tại.');
    const kv = parseKV(tokens.slice(1));
    if (!kv.name || !kv.obj) return msg.reply('❌ Cần `name="..."` và `obj=...`.');
    const allowedObj = ['kill_count','kill_monster','level_reach','gold_total','item_collect','quest_complete'];
    if (!allowedObj.includes(kv.obj)) return msg.reply(`❌ obj phải là: ${allowedObj.join('/')}`);

    const a = achievements.createAchievement({
      id, name: kv.name, desc: kv.desc || '', icon: kv.icon || '🏆',
      objective: kv.obj, target_id: kv.target || '',
      target_qty: parseInt(kv.qty) || 1,
      points: parseInt(kv.points) || 10,
      reward_gold: parseInt(kv.gold) || 0,
      reward_xp: parseInt(kv.xp) || 0,
      reward_item: kv.item || '',
      title: kv.title || '',
      created_by: msg.author.id,
    });
    return msg.reply(`✅ Đã tạo achievement **${a.name}** (\`${a.id}\`).`);
  }

  return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}ach admin help\``);
} 
