// Admin command: gán image_url cho item/monster/zone/pet/achievement
const { EmbedBuilder } = require('discord.js');
const images = require('../game/images');
const db = require('../db/database');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

const TYPE_MAP = {
  item: 'items', items: 'items', i: 'items',
  mob: 'monsters', monster: 'monsters', mobs: 'monsters', m: 'monsters',
  zone: 'zones', zones: 'zones', z: 'zones',
  pet: 'pets', pets: 'pets', p: 'pets',
  ach: 'achievements', achievement: 'achievements', a: 'achievements',
};

module.exports = {
  name: 'setimage',
  aliases: ['setimg', 'img'],
  description: 'Admin: gán ảnh cho entity. !setimage <type> <id> <url>',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');

    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🖼️ Set Image Admin')
        .setDescription([
          `**Cú pháp**: \`${prefix}setimage <type> <id> <url>\``,
          '',
          '**Type**: `item` | `mob` | `zone` | `pet` | `ach`',
          '',
          `\`${prefix}setimage item dragon_sword https://raw.githubusercontent.com/USER/REPO/main/items/dragon_sword.png\``,
          `\`${prefix}setimage mob dragon https://...\``,
          `\`${prefix}setimage zone forest https://...\``,
          `\`${prefix}setimage pet pet_dragonling https://...\``,
          `\`${prefix}setimage ach pet_first https://...\``,
          '',
          '**Để xóa ảnh**: dùng `none` thay URL',
          `\`${prefix}setimage item dragon_sword none\``,
          '',
          '⚠️ URL phải kết thúc bằng .png/.jpg/.jpeg/.gif/.webp và bắt đầu bằng https://',
          '',
          `**Xem trước**: \`${prefix}setimage check <type> <id>\``,
        ].join('\n'))] });
    }

    // Subcommand check (preview)
    if (sub === 'check') {
      const type = (args[1] || '').toLowerCase();
      const id = args[2];
      const table = TYPE_MAP[type];
      if (!table) return msg.reply(`❌ Type không hợp lệ. Dùng: item/mob/zone/pet/ach`);
      if (!id) return msg.reply(`❌ Thiếu id.`);
      const url = images.getImage(table, id);
      if (!url) return msg.reply(`💡 ${type} \`${id}\` chưa có ảnh.`);
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2)
        .setTitle(`🖼️ ${type} \`${id}\``)
        .setDescription(url)
        .setImage(url)] });
    }

    // Default: set
    const type = sub;
    const id = args[1];
    const url = args[2];

    const table = TYPE_MAP[type];
    if (!table) return msg.reply(`❌ Type không hợp lệ. Dùng: item/mob/zone/pet/ach\nGõ \`${prefix}setimage help\` xem.`);
    if (!id || !url) return msg.reply(`❌ Cú pháp: \`${prefix}setimage <type> <id> <url|none>\``);

    // Check entity exists
    const exists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
    if (!exists) return msg.reply(`❌ ${type} \`${id}\` không tồn tại.`);

    // Handle "none" = xóa
    if (url.toLowerCase() === 'none' || url === '""') {
      images.setImage(table, id, '');
      return msg.reply(`🗑️ Đã xóa ảnh của ${type} \`${id}\`.`);
    }

    // Validate URL
    if (!images.isValidImageUrl(url)) {
      return msg.reply(`❌ URL không hợp lệ. Phải:\n• Bắt đầu bằng \`https://\`\n• Kết thúc bằng .png/.jpg/.jpeg/.gif/.webp\n\n💡 GitHub raw format: \`https://raw.githubusercontent.com/USER/REPO/main/folder/file.png\``);
    }

    images.setImage(table, id, url);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x57F287)
      .setTitle(`✅ Đã set ảnh cho ${type} \`${id}\``)
      .setDescription(`[URL](${url})`)
      .setImage(url)] });
  },
}; 
