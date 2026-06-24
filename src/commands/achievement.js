const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer } = require('../game/player');
const achievements = require('../game/achievements');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
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
      // Ẩn hidden ach chưa unlock
      const visible = all.filter(a => !a.hidden || userAch.has(a.id));
      const hiddenCount = all.filter(a => a.hidden && !userAch.has(a.id)).length;

      const lines = visible.map(a => {
        const mark = userAch.has(a.id) ? '✅' : '⬜';
        const tag = a.hidden ? ' 🕵️' : '';
        return `${mark} ${a.icon} **${a.name}** \`${a.id}\` *(${a.points}pt)*${tag}\n   *${a.desc}*`;
      });
      const text = lines.join('\n');
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`🏆 Achievements (${userAch.size}/${visible.length} unlocked)`)
        .setDescription(text.slice(0, 4000))
        .setFooter({ text: `Tổng hiển thị: ${visible.length}` + (hiddenCount > 0 ? ` • 🕵️ ${hiddenCount} thành tựu ẩn chưa khám phá` : '') });
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
        `\`${prefix}ach admin list [obj]\` — list tất cả ach (xem ID + thông số)`,
        `\`${prefix}ach admin create <id> name="..." desc="..." icon="🏆" obj=kill_count qty=100 points=25 gold=500 xp=200 item=potion_l:2 title="Hunter" hidden=true\``,
        `\`${prefix}ach admin delete <id>\``,
        `\`${prefix}ach admin grant @user <id>\` — grant thủ công`,
        `\`${prefix}achdebug <id> [@user]\` — debug 1 ach (vì sao không trigger)`,
        '',
        'obj values:',
        '`kill_count` `kill_monster`(target=mob_id) `level_reach` `gold_total` `quest_complete`',
        '`item_collect`(target=item_id) `pet_count` `pet_tier`(target=tier) `pet_own`(target=pet_id)',
        '',
        '⚠️ Reward + title sẽ tự cấp khi user unlock achievement (qua hunt/quest/addItem).',
      ].join('\n'));
    return msg.reply({ embeds: [embed] });
  }

  if (sub === 'list' || sub === 'ls') {
    const all = achievements.getAllAchievements();
    if (all.length === 0) return msg.reply('💡 Chưa có achievement nào.');

    // Filter optional: %ach admin list <objective>
    const filter = args[1]?.toLowerCase();
    const list = filter ? all.filter(a => a.objective === filter) : all;
    if (list.length === 0) return msg.reply(`💡 Không có ach nào với objective \`${filter}\`.`);

    // Group theo objective
    const groups = {};
    for (const a of list) (groups[a.objective] = groups[a.objective] || []).push(a);

    const embed = new EmbedBuilder().setColor(0xED4245)
      .setTitle(`🛠️ All Achievements (${list.length}/${all.length})`)
      .setFooter({ text: `Chi tiết 1 ach: ${prefix}achdebug <id>` });

    for (const [obj, arr] of Object.entries(groups)) {
      const lines = arr.map(a => {
        const target = a.target_id ? ` target=\`${a.target_id}\`` : '';
        const reward = [];
        if (a.reward_gold) reward.push(`💰${a.reward_gold}`);
        if (a.reward_xp)   reward.push(`✨${a.reward_xp}`);
        if (a.reward_item) reward.push(`📦${a.reward_item}`);
        if (a.title)       reward.push(`🎖️"${a.title}"`);
        const r = reward.length ? ` → ${reward.join(' ')}` : '';
        return `\`${a.id}\` ${a.icon} ${a.name} (qty:${a.target_qty} pt:${a.points})${target}${r}`;
      });
      const text = lines.join('\n');
      // Chunk 1024
      if (text.length <= 1024) {
        embed.addFields({ name: `📊 ${obj} (${arr.length})`, value: text });
      } else {
        let chunk = '', idx = 1;
        for (const ln of lines) {
          if (chunk.length + ln.length + 1 > 1024) {
            embed.addFields({ name: `📊 ${obj} #${idx} (${arr.length})`, value: chunk });
            chunk = ''; idx++;
          }
          chunk += (chunk ? '\n' : '') + ln;
        }
        if (chunk) embed.addFields({ name: `📊 ${obj} #${idx}`, value: chunk });
      }
    }
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
    // Tokenize bỏ "ach admin create" (3 từ đầu). Hỗ trợ smart quotes.
    const tokens = getRestTokens(msg, prefix, 3);
    const id = tokens[0];
    if (!id) return msg.reply('❌ Thiếu id.');
    if (achievements.getAchievement(id)) return msg.reply('❌ Id đã tồn tại.');
    const kv = parseKV(tokens.slice(1));
    if (!kv.name || !kv.obj) return msg.reply('❌ Cần `name="..."` và `obj=...`.');
    const allowedObj = ['kill_count','kill_monster','level_reach','gold_total','item_collect','quest_complete','pet_count','pet_tier','pet_own'];
    if (!allowedObj.includes(kv.obj)) return msg.reply(`❌ obj phải là: ${allowedObj.join('/')}`);

    // === Validate target tồn tại ===
    const db = require('../db/database');
    let warning = '';
    if (kv.target) {
      if (kv.obj === 'item_collect') {
        const it = db.prepare('SELECT id FROM items WHERE id = ?').get(kv.target);
        if (!it) return msg.reply(`❌ Item \`${kv.target}\` không tồn tại!\n💡 Gõ \`${prefix}info items\` để xem.`);
      }
      if (kv.obj === 'kill_monster') {
        const m = db.prepare('SELECT id FROM monsters WHERE id = ?').get(kv.target);
        if (!m) return msg.reply(`❌ Quái \`${kv.target}\` không tồn tại!\n💡 Gõ \`${prefix}info mobs\` để xem.`);
      }
      if (kv.obj === 'pet_own') {
        const p = db.prepare('SELECT id FROM pets WHERE id = ?').get(kv.target);
        if (!p) return msg.reply(`❌ Pet \`${kv.target}\` không tồn tại!\n💡 Gõ \`${prefix}pet collection\` để xem.`);
      }
      if (kv.obj === 'pet_tier') {
        const valid = ['common','rare','epic','legendary'];
        if (!valid.includes(kv.target)) return msg.reply(`❌ tier phải là: ${valid.join('/')}`);
      }
    } else if (['item_collect','kill_monster','pet_own','pet_tier'].includes(kv.obj)) {
      return msg.reply(`❌ obj=${kv.obj} cần có \`target=<id>\`.`);
    }

    // Handle alias 'tittle' (user thường gõ sai)
    const title = kv.title || kv.tittle || '';
    if (kv.tittle && !kv.title) warning = '\n⚠️ Bạn gõ `tittle` — đúng là `title` (1 chữ t). Đã tự xử lý.';

    // Helper: parse int cho phép 0 (khác với ||)
    const intOr = (v, d) => {
      const n = parseInt(v);
      return isNaN(n) ? d : n;
    };
    const isHidden = kv.hidden === 'true' || kv.hidden === '1' || kv.hidden === 'yes';
    const a = achievements.createAchievement({
      id, name: kv.name, desc: kv.desc || '', icon: kv.icon || '🏆',
      objective: kv.obj, target_id: kv.target || '',
      target_qty: intOr(kv.qty, 1),
      points: intOr(kv.points, 10),
      reward_gold: intOr(kv.gold, 0),
      reward_xp: intOr(kv.xp, 0),
      reward_item: kv.item || '',
      title,
      hidden: isHidden,
      created_by: msg.author.id,
    });
    const hiddenTag = isHidden ? ' 🕵️ **HIDDEN**' : '';
    return msg.reply(`✅ Đã tạo achievement **${a.name}** (\`${a.id}\`)${hiddenTag}.${warning}`);
  }

  return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}ach admin help\``);
}
