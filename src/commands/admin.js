const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const {
  getPlayer, createPlayer, updatePlayer,
  addItem, removeItem, addXpAndLevel, getInventory,
} = require('../game/player');
const { ITEMS } = require('../game/items');

// ===== Danh sách Admin ID =====
// Thêm Discord User ID của bạn vào đây (chuột phải vào tên bạn trong Discord → Copy User ID)
// Cần bật Developer Mode: User Settings → Advanced → Developer Mode
// Hoặc dùng env ADMIN_IDS="123,456,789"
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

function isAdmin(userId) {
  // Nếu chưa setup ADMIN_IDS thì cho owner của guild làm admin (check ở execute)
  return ADMIN_IDS.includes(userId);
}

// Lấy user được mention hoặc theo ID
function resolveTarget(msg, arg) {
  if (!arg) return null;
  const mention = msg.mentions.users.first();
  if (mention) return mention;
  const id = arg.replace(/[<@!>]/g, '');
  return msg.client.users.cache.get(id) || null;
}

async function ensurePlayer(userId, username) {
  let p = getPlayer(userId);
  if (!p) p = createPlayer(userId, username);
  return p;
}

module.exports = {
  name: 'admin',
  aliases: ['a', 'qt'],
  description: 'Lệnh quản trị (chỉ admin)',
  async execute(msg, args) {
    // Check quyền: admin trong env HOẶC owner guild HOẶC có quyền Administrator
    const isOwner   = msg.guild && msg.guild.ownerId === msg.author.id;
    const hasAdmin  = msg.member && msg.member.permissions?.has('Administrator');
    if (!isAdmin(msg.author.id) && !isOwner && !hasAdmin) {
      return msg.reply('🚫 Bạn không có quyền dùng lệnh admin.');
    }

    const sub = (args[0] || '').toLowerCase();
    const prefix = process.env.PREFIX || '!';

    // ===== Help =====
    if (!sub || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0xED4245).setTitle('🛠️ Lệnh Admin')
        .setDescription([
          `\`${prefix}admin gold @user <số>\` — cộng/trừ vàng (số âm để trừ)`,
          `\`${prefix}admin xp @user <số>\` — cộng XP (tự lên cấp)`,
          `\`${prefix}admin item @user <id> [qty]\` — tặng item`,
          `\`${prefix}admin takeitem @user <id> [qty]\` — lấy lại item`,
          `\`${prefix}admin sethp @user <hp>\` — set HP`,
          `\`${prefix}admin setlevel @user <lv>\` — set level`,
          `\`${prefix}admin heal @user\` — hồi đầy HP`,
          `\`${prefix}admin reset @user\` — xoá nhân vật`,
          `\`${prefix}admin look @user\` — xem chi tiết nhân vật`,
          `\`${prefix}admin stats\` — thống kê server`,
          `\`${prefix}admin announce <text>\` — gửi thông báo`,
          '',
          '💡 Có thể thay `@user` bằng User ID.',
        ].join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    // ===== stats server =====
    if (sub === 'stats') {
      const total = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
      const totalGold = db.prepare('SELECT SUM(gold) AS s FROM players').get().s || 0;
      const maxLv = db.prepare('SELECT MAX(level) AS m FROM players').get().m || 0;
      const top = db.prepare('SELECT name, level FROM players ORDER BY level DESC, xp DESC LIMIT 1').get();
      const embed = new EmbedBuilder()
        .setColor(0x5865F2).setTitle('📊 Thống kê server')
        .addFields(
          { name: '👥 Tổng người chơi', value: `${total}`, inline: true },
          { name: '💰 Tổng vàng',       value: `${totalGold}`, inline: true },
          { name: '🏆 Cấp cao nhất',    value: `Lv.${maxLv} (${top?.name || '—'})` },
        );
      return msg.reply({ embeds: [embed] });
    }

    // ===== announce =====
    if (sub === 'announce' || sub === 'ann') {
      const text = args.slice(1).join(' ');
      if (!text) return msg.reply('❌ Cú pháp: `admin announce <nội dung>`');
      const embed = new EmbedBuilder()
        .setColor(0xFEE75C).setTitle('📢 Thông báo từ Admin')
        .setDescription(text)
        .setFooter({ text: `Bởi ${msg.author.username}` })
        .setTimestamp();
      return msg.channel.send({ embeds: [embed] });
    }

    // ===== Các lệnh cần target =====
    const target = resolveTarget(msg, args[1]);
    if (!target) {
      return msg.reply('❌ Cần mention user hoặc User ID. Vd: `admin gold @abc 1000`');
    }

    const p = await ensurePlayer(target.id, target.username);

    // ===== gold =====
    if (sub === 'gold') {
      const amount = parseInt(args[2]);
      if (isNaN(amount)) return msg.reply('❌ Số vàng không hợp lệ.');
      const newGold = Math.max(0, p.gold + amount);
      updatePlayer(target.id, { gold: newGold });
      return msg.reply(`✅ ${amount >= 0 ? 'Cộng' : 'Trừ'} **${Math.abs(amount)}** 💰 cho **${p.name}**. Tổng: ${newGold}`);
    }

    // ===== xp =====
    if (sub === 'xp') {
      const amount = parseInt(args[2]);
      if (isNaN(amount) || amount <= 0) return msg.reply('❌ XP phải > 0.');
      const r = addXpAndLevel(target.id, amount);
      let txt = `✅ Cộng **${amount}** XP cho **${p.name}**.`;
      if (r.levelsGained.length > 0) txt += `\n🎉 Lên cấp **${r.newLevel}**!`;
      return msg.reply(txt);
    }

    // ===== item =====
    if (sub === 'item' || sub === 'give') {
      const itemId = args[2];
      const qty = Math.max(1, parseInt(args[3]) || 1);
      if (!itemId || !ITEMS[itemId]) {
        const list = Object.keys(ITEMS).join(', ');
        return msg.reply(`❌ Item ID không hợp lệ.\nDanh sách: \`${list}\``);
      }
      addItem(target.id, itemId, qty);
      return msg.reply(`✅ Tặng **${qty}x ${ITEMS[itemId].name}** cho **${p.name}**.`);
    }

    // ===== takeitem =====
    if (sub === 'takeitem' || sub === 'take') {
      const itemId = args[2];
      const qty = Math.max(1, parseInt(args[3]) || 1);
      if (!itemId || !ITEMS[itemId]) return msg.reply('❌ Item ID không hợp lệ.');
      const ok = removeItem(target.id, itemId, qty);
      if (!ok) return msg.reply('❌ User không đủ item để lấy.');
      return msg.reply(`✅ Lấy **${qty}x ${ITEMS[itemId].name}** từ **${p.name}**.`);
    }

    // ===== sethp =====
    if (sub === 'sethp') {
      const hp = parseInt(args[2]);
      if (isNaN(hp) || hp < 0) return msg.reply('❌ HP không hợp lệ.');
      const newHp = Math.min(hp, p.max_hp);
      updatePlayer(target.id, { hp: newHp });
      return msg.reply(`✅ Set HP **${p.name}** = ${newHp}/${p.max_hp}`);
    }

    // ===== heal =====
    if (sub === 'heal') {
      updatePlayer(target.id, { hp: p.max_hp });
      return msg.reply(`✅ Đã hồi đầy HP cho **${p.name}** (${p.max_hp}/${p.max_hp})`);
    }

    // ===== setlevel =====
    if (sub === 'setlevel' || sub === 'lv') {
      const lv = parseInt(args[2]);
      if (isNaN(lv) || lv < 1 || lv > 100) return msg.reply('❌ Level phải 1-100.');
      // Reset stats theo công thức level up
      const max_hp = 100 + (lv - 1) * 15;
      const atk    = 10  + (lv - 1) * 3;
      const def    = 5   + (lv - 1) * 2;
      updatePlayer(target.id, { level: lv, xp: 0, max_hp, atk, def, hp: max_hp });
      return msg.reply(`✅ Set **${p.name}** lên Lv.**${lv}** (HP ${max_hp}, ATK ${atk}, DEF ${def}).`);
    }

    // ===== reset =====
    if (sub === 'reset' || sub === 'del') {
      db.prepare('DELETE FROM players WHERE user_id=?').run(target.id);
      db.prepare('DELETE FROM inventory WHERE user_id=?').run(target.id);
      return msg.reply(`✅ Đã xoá nhân vật của **${target.username}**.`);
    }

    // ===== look =====
    if (sub === 'look' || sub === 'check') {
      const inv = getInventory(target.id);
      const invText = inv.length === 0 ? '—' : inv.map(r =>
        `${ITEMS[r.item_id]?.name || r.item_id} x${r.qty}`
      ).join('\n').slice(0, 1000);
      const embed = new EmbedBuilder()
        .setColor(0xEB459E).setTitle(`🔍 Chi tiết: ${p.name}`)
        .addFields(
          { name: 'Level', value: `${p.level} (XP ${p.xp})`, inline: true },
          { name: 'HP',    value: `${p.hp}/${p.max_hp}`,     inline: true },
          { name: 'Gold',  value: `${p.gold}`,               inline: true },
          { name: 'ATK',   value: `${p.atk}`,                inline: true },
          { name: 'DEF',   value: `${p.def}`,                inline: true },
          { name: 'Weapon', value: p.weapon_id || '—',       inline: true },
          { name: 'Armor', value: p.armor_id || '—',         inline: true },
          { name: 'Inventory', value: invText },
        )
        .setFooter({ text: `User ID: ${target.id}` });
      return msg.reply({ embeds: [embed] });
    }

    return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}admin help\` để xem.`);
  },
}; 
