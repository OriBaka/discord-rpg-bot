const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer, updatePlayer, addItem, addXpAndLevel } = require('../game/player');
const { getItem } = require('../game/items');
const quests = require('../game/quests');
const achievements = require('../game/achievements');
const channels = require('../game/channels');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

function progressBar(cur, max, len = 10) {
  const ratio = Math.min(1, cur / max);
  const filled = Math.round(ratio * len);
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

function formatObjective(q) {
  switch (q.objective) {
    case 'kill':
      return q.target_id ? `Săn ${q.target_qty} ${q.target_id}` : `Săn ${q.target_qty} quái bất kỳ`;
    case 'gold':  return `Kiếm ${q.target_qty} 💰`;
    case 'level': return `Đạt Lv.${q.target_qty}`;
    case 'item':  return `Sở hữu ${q.target_qty}x ${q.target_id}`;
    default:      return q.desc || 'Mục tiêu lạ';
  }
}

function formatReward(q) {
  const parts = [];
  if (q.reward_gold) parts.push(`💰 ${q.reward_gold}`);
  if (q.reward_xp)   parts.push(`✨ ${q.reward_xp} XP`);
  if (q.reward_item) {
    for (const part of q.reward_item.split(',')) {
      const [iid, qty] = part.split(':');
      const it = getItem(iid);
      if (it) parts.push(`📦 ${qty || 1}x ${it.name}`);
    }
  }
  return parts.join(' • ') || '—';
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

module.exports = {
  name: 'quest',
  aliases: ['quests', 'q', 'nv2'],
  description: 'Hệ thống nhiệm vụ. !quest, !quest claim <id>',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ====== Admin sub ======
    if (sub === 'admin') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      return handleAdmin(msg, args.slice(1), prefix);
    }

    // ====== claim ======
    if (sub === 'claim') {
      const qid = args[1];
      if (!qid) return msg.reply(`❌ Cú pháp: \`${prefix}quest claim <quest_id>\``);
      const pq = quests.getPlayerQuest(msg.author.id, qid);
      if (!pq) return msg.reply('❌ Bạn không có quest này.');
      if (pq.claimed) return msg.reply('💡 Bạn đã nhận thưởng quest này rồi.');
      const q = quests.getQuest(qid);
      if (!q) return msg.reply('❌ Quest không tồn tại.');
      if (pq.progress < q.target_qty) {
        return msg.reply(`⏳ Quest chưa hoàn thành: ${pq.progress}/${q.target_qty}`);
      }

      // Grant reward
      if (q.reward_gold) updatePlayer(msg.author.id, { gold: p.gold + q.reward_gold });
      if (q.reward_xp)   addXpAndLevel(msg.author.id, q.reward_xp);
      if (q.reward_item) {
        for (const part of q.reward_item.split(',')) {
          const [iid, qty] = part.split(':');
          if (iid && getItem(iid)) addItem(msg.author.id, iid, parseInt(qty) || 1);
        }
      }
      quests.markClaimed(msg.author.id, qid);

      // Update quest_complete stats
      const stats = achievements.getPlayerStats(msg.author.id);
      achievements.updatePlayerStats(msg.author.id, { total_quests: stats.total_quests + 1 });
      const newAchs = achievements.checkAndGrant(msg.author.id);

      let txt = `🎉 Đã nhận thưởng **${q.name}**!\n${formatReward(q)}`;
      if (newAchs.length > 0) {
        txt += `\n\n🏆 **Thành tựu mới**: ${newAchs.map(a => `${a.icon} ${a.name}`).join(', ')}`;
        try {
          for (const a of newAchs) {
            channels.notify(msg.client, msg.guild?.id, 'achievement', {
              embeds: [new EmbedBuilder().setColor(0xF1C40F)
                .setTitle(`${a.icon} Achievement Unlocked!`)
                .setDescription(`<@${msg.author.id}> đã đạt **${a.name}**!\n*${a.desc}*`)],
            });
          }
        } catch {}
      }
      return msg.reply(txt);
    }

    // ====== accept (cho custom quest) ======
    if (sub === 'accept' || sub === 'take') {
      const qid = args[1];
      if (!qid) return msg.reply(`❌ Cú pháp: \`${prefix}quest accept <quest_id>\``);
      const q = quests.getQuest(qid);
      if (!q) return msg.reply('❌ Quest không tồn tại.');
      if (q.type !== 'custom') return msg.reply('💡 Quest daily/weekly tự nhận, không cần accept.');
      const ok = quests.assignQuest(msg.author.id, qid);
      if (!ok) return msg.reply('💡 Bạn đã nhận quest này rồi.');
      return msg.reply(`✅ Đã nhận quest **${q.name}**.`);
    }

    // ====== list (xem custom quest available) ======
    if (sub === 'list' || sub === 'available') {
      const customQuests = quests.getQuestsByType('custom');
      if (customQuests.length === 0) return msg.reply('💡 Không có custom quest nào.');
      const lines = customQuests.map(q => {
        const pq = quests.getPlayerQuest(msg.author.id, q.id);
        const mark = pq ? (pq.claimed ? '✅' : '📋') : '⬜';
        return `${mark} **${q.name}** \`${q.id}\` — ${formatObjective(q)}\n   Reward: ${formatReward(q)}`;
      });
      const embed = new EmbedBuilder().setColor(0x5865F2)
        .setTitle('📜 Custom Quests')
        .setDescription(lines.join('\n\n'))
        .setFooter({ text: `Nhận: ${prefix}quest accept <id>` });
      return msg.reply({ embeds: [embed] });
    }

    // ====== Default: xem quest đang nhận ======
    // Tự generate daily nếu chưa có
    quests.generateDailyQuests(msg.author.id, p.level);

    const playerQuests = quests.getPlayerQuests(msg.author.id);
    if (playerQuests.length === 0) {
      return msg.reply('💡 Bạn chưa có quest nào. Gõ `' + prefix + 'quest list` để xem custom quest.');
    }

    // Group theo type
    const groups = { daily: [], weekly: [], custom: [] };
    for (const pq of playerQuests) {
      (groups[pq.type] || groups.custom).push(pq);
    }

    const embed = new EmbedBuilder().setColor(0x5865F2)
      .setTitle(`📜 Quest của ${p.name}`)
      .setFooter({ text: `Hoàn thành → ${prefix}quest claim <id>` });

    for (const [type, list] of Object.entries(groups)) {
      if (list.length === 0) continue;
      const lines = list.map(pq => {
        const bar = progressBar(pq.progress, pq.target_qty);
        const status = pq.claimed ? '✅ ĐÃ NHẬN' : (pq.progress >= pq.target_qty ? `✨ HOÀN THÀNH — \`${prefix}quest claim ${pq.quest_id}\`` : '');
        return `**${pq.name}** \`${pq.quest_id}\`\n` +
               `   ${formatObjective(pq)}\n` +
               `   ${bar} ${pq.progress}/${pq.target_qty}\n` +
               `   🎁 ${formatReward(pq)}` +
               (status ? `\n   ${status}` : '');
      });
      const title = type === 'daily' ? '☀️ Hằng ngày' : type === 'weekly' ? '📅 Hằng tuần' : '🎯 Custom';
      embed.addFields({ name: title, value: lines.join('\n\n').slice(0, 1024) });
    }

    return msg.reply({ embeds: [embed] });
  },
};

// ===== Admin sub-handler =====
async function handleAdmin(msg, args, prefix) {
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🛠️ Quest Admin')
      .setDescription([
        `\`${prefix}quest admin create <id> type=custom name="..." obj=kill target=slime qty=10 gold=500 xp=200 item=potion_s:3\``,
        `\`${prefix}quest admin delete <id>\``,
        `\`${prefix}quest admin reroll @user\` — random lại daily`,
        `\`${prefix}quest admin assign @user <quest_id>\` — giao quest cho user`,
        `\`${prefix}quest admin list\` — list tất cả quest`,
        '',
        'Field obj: `kill | gold | level | item`',
        'Field target: monster_id / item_id (rỗng = bất kỳ với kill)',
        'Field item reward: format `id:qty,id:qty`',
      ].join('\n'));
    return msg.reply({ embeds: [embed] });
  }

  if (sub === 'list') {
    const all = quests.getAllQuests();
    if (all.length === 0) return msg.reply('💡 Chưa có quest nào.');
    const grouped = { custom: [], daily: [], weekly: [] };
    for (const q of all) (grouped[q.type] || grouped.custom).push(q);
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle('📜 All Quests');
    for (const [t, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;
      const lines = list.slice(0, 20).map(q => `\`${q.id}\` ${q.name} — ${q.objective}/${q.target_qty}`);
      embed.addFields({ name: t, value: lines.join('\n').slice(0, 1024) });
    }
    return msg.reply({ embeds: [embed] });
  }

  if (sub === 'delete' || sub === 'del') {
    const id = args[1];
    if (!id) return msg.reply('❌ Thiếu quest id.');
    const ok = quests.deleteQuest(id);
    return msg.reply(ok ? `🗑️ Đã xoá quest \`${id}\`.` : '❌ Quest không tồn tại.');
  }

  if (sub === 'create' || sub === 'new') {
    // re-tokenize để parse string trong ngoặc kép
    const raw = msg.content.slice(prefix.length).trim();
    // Bỏ "quest admin create" (3 từ đầu)
    const rest = raw.replace(/^\S+\s+\S+\s+\S+\s*/, '');
    const tokens = rest.match(/[^\s"]+|"([^"]*)"/g)?.map(t =>
      t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t
    ) || [];
    const id = tokens[0];
    if (!id) return msg.reply('❌ Thiếu quest id.');
    if (quests.getQuest(id)) return msg.reply('❌ Quest id đã tồn tại.');
    const kv = parseKV(tokens.slice(1));
    if (!kv.name || !kv.obj) return msg.reply('❌ Cần `name="..."` và `obj=kill|gold|level|item`.');
    const allowedObj = ['kill','gold','level','item'];
    if (!allowedObj.includes(kv.obj)) return msg.reply(`❌ obj phải là: ${allowedObj.join('/')}`);
    const type = kv.type || 'custom';
    if (!['custom','daily','weekly'].includes(type)) return msg.reply('❌ type phải là custom/daily/weekly.');

    const q = quests.createQuest({
      id, type, name: kv.name, desc: kv.desc || '',
      objective: kv.obj, target_id: kv.target || '',
      target_qty: parseInt(kv.qty) || 1,
      reward_gold: parseInt(kv.gold) || 0,
      reward_xp:   parseInt(kv.xp) || 0,
      reward_item: kv.item || '',
      created_by: msg.author.id,
    });
    return msg.reply(`✅ Đã tạo quest **${q.name}** (\`${q.id}\`).`);
  }

  if (sub === 'reroll') {
    const target = msg.mentions.users.first() || msg.author;
    // Xoá daily cũ
    const today = new Date(); today.setHours(0,0,0,0);
    db.prepare(`DELETE FROM player_quests
      WHERE user_id = ? AND quest_id IN (SELECT id FROM quests WHERE type='daily')`).run(target.id);
    const p = getPlayer(target.id);
    if (!p) return msg.reply('❌ User chưa có nhân vật.');
    quests.generateDailyQuests(target.id, p.level);
    return msg.reply(`✅ Đã reroll daily quest cho **${target.username}**.`);
  }

  if (sub === 'assign') {
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Cần mention user.');
    const qid = args[2];
    if (!qid || !quests.getQuest(qid)) return msg.reply('❌ Quest id sai.');
    const ok = quests.assignQuest(target.id, qid);
    return msg.reply(ok ? `✅ Đã giao quest cho **${target.username}**.` : '💡 User đã có quest này.');
  }

  return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}quest admin help\``);
      }
