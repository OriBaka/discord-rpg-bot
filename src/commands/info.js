const { EmbedBuilder } = require('discord.js');
const { getItem, getAllItems, getItemsByType } = require('../game/items');
const { getMonster, getAllMonsters, getAllZones, getZone, getMonstersInZone } = require('../game/monsters');
const { tierInfo, tierBadge } = require('../game/tiers');
const { classInfo } = require('../game/classes');
const db = require('../db/database');

// ===== Helper: hiển thị 1 item =====
function itemEmbed(it, prefix) {
  const t = tierInfo(it.tier);
  const fields = [
    { name: '📦 Loại', value: typeLabel(it.type), inline: true },
    { name: '✨ Độ hiếm', value: tierBadge(it.tier), inline: true },
    { name: '🆔 ID', value: `\`${it.id}\``, inline: true },
  ];

  // Embed builder + thumbnail nếu có
  const embedBase = new EmbedBuilder()
    .setColor(t.color)
    .setTitle(it.name)
    .setDescription(it.desc || '*(Không có mô tả)*');
  if (it.image_url) embedBase.setThumbnail(it.image_url);
  if (it.class_req) {
    const c = classInfo(it.class_req);
    fields.push({ name: '🎭 Yêu cầu class', value: c?.name || it.class_req, inline: true });
  }
  if (it.weapon_type)    fields.push({ name: '🗡️ Loại vũ khí', value: it.weapon_type, inline: true });
  if (it.armor_slot)     fields.push({ name: '🎽 Slot giáp',   value: it.armor_slot,  inline: true });
  if (it.armor_type)     fields.push({ name: '🦺 Loại giáp',   value: it.armor_type,  inline: true });
  if (it.accessory_type) fields.push({ name: '✨ Loại phụ kiện',value: it.accessory_type, inline: true });
  if (it.atk)   fields.push({ name: '⚔️ ATK', value: `+${it.atk}`, inline: true });
  if (it.def)   fields.push({ name: '🛡️ DEF', value: `+${it.def}`, inline: true });
  if (it.heal)  fields.push({ name: '❤️ Hồi HP', value: `+${it.heal}`, inline: true });
  if (it.price) fields.push({ name: '💰 Giá mua', value: `${it.price}`, inline: true });
  if (it.sell)  fields.push({ name: '💸 Giá bán', value: `${it.sell}`, inline: true });
  if (it.soulbound) fields.push({ name: '🔒 Soulbound', value: 'Không thể trade', inline: true });

  embedBase.addFields(fields);

  if (it.type === 'weapon' || it.type === 'armor') {
    embedBase.setFooter({ text: `Trang bị: ${prefix}equip ${it.id}` });
  } else if (it.type === 'consumable') {
    embedBase.setFooter({ text: `Sử dụng: ${prefix}use ${it.id}` });
  }
  return embedBase;
}

// ===== Helper: hiển thị 1 monster =====
function monsterEmbed(m, prefix) {
  const drops = db.prepare(`SELECT md.*, i.name FROM monster_drops md
    LEFT JOIN items i ON i.id = md.item_id WHERE md.monster_id = ?`).all(m.id);
  const dropText = drops.length === 0 ? '—' : drops.map(d =>
    `${d.name || d.item_id} x${d.qty} (${Math.round(d.chance*100)}%)`
  ).join('\n');

  const zone = getZone(m.zone_id);

  const embed = new EmbedBuilder()
    .setColor(0xED4245).setTitle(`👹 ${m.name}`)
    .addFields(
      { name: '🆔 ID', value: `\`${m.id}\``, inline: true },
      { name: '📍 Khu vực', value: zone?.name || m.zone_id, inline: true },
      { name: '⚖️ Tỉ trọng spawn', value: `${m.weight}`, inline: true },
      { name: '❤️ HP', value: `${m.hp}`, inline: true },
      { name: '⚔️ ATK', value: `${m.atk}`, inline: true },
      { name: '🛡️ DEF', value: `${m.def}`, inline: true },
      { name: '✨ XP thưởng', value: `${m.xp}`, inline: true },
      { name: '💰 Vàng', value: `${m.gold[0]}-${m.gold[1]}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '📦 Drop', value: dropText },
    )
    .setFooter({ text: `Săn: ${prefix}hunt ${m.id}` });
  if (m.image_url) embed.setThumbnail(m.image_url);
  return embed;
}

function typeLabel(type) {
  return {
    weapon: '🗡️ Vũ khí', offhand: '🛡️ Tay phụ', armor: '🦺 Giáp',
    accessory: '✨ Phụ kiện',
    consumable: '🧪 Tiêu hao', material: '📦 Nguyên liệu',
    pet: '🐾 Pet',
  }[type] || type;
}

// ===== Command =====
module.exports = {
  name: 'info',
  aliases: ['xem', 'i'],
  description: 'Xem thông tin item/quái/zone: !info item <id>, !info mob <id>, !info zone <id>',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    // Help
    if (!sub || sub === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2).setTitle('📖 Lệnh Info')
        .setDescription([
          `\`${prefix}info item <id>\` — Xem chi tiết 1 item`,
          `\`${prefix}info mob <id>\` — Xem chi tiết 1 quái`,
          `\`${prefix}info zone <id>\` — Xem chi tiết 1 khu vực`,
          `\`${prefix}info items [loại]\` — Danh sách item (weapon/armor/consumable/material)`,
          `\`${prefix}info mobs [zone]\` — Danh sách quái (lọc theo zone)`,
          `\`${prefix}info zones\` — Danh sách khu vực`,
          '',
          `Vd: \`${prefix}info item dragon_sword\`, \`${prefix}info mob dragon\`, \`${prefix}info items weapon\``,
        ].join('\n'));
      return msg.reply({ embeds: [embed] });
    }

    // ===== info item <id> =====
    if (sub === 'item') {
      const id = args[1];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}info item <id>\``);
      const it = getItem(id);
      if (!it) return msg.reply(`❌ Không tìm thấy item \`${id}\`.`);
      return msg.reply({ embeds: [itemEmbed(it, prefix)] });
    }

    // ===== info mob <id> =====
    if (sub === 'mob' || sub === 'monster') {
      const id = args[1];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}info mob <id>\``);
      const m = getMonster(id);
      if (!m) return msg.reply(`❌ Không tìm thấy quái \`${id}\`.`);
      return msg.reply({ embeds: [monsterEmbed(m, prefix)] });
    }

    // ===== info zone <id> =====
    if (sub === 'zone') {
      const id = args[1];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}info zone <id>\``);
      const z = getZone(id);
      if (!z) return msg.reply(`❌ Không tìm thấy zone \`${id}\`.`);
      const mobs = getMonstersInZone(id);
      const mobList = mobs.length === 0 ? '—' : mobs.map(m =>
        `${m.name} \`${m.id}\` (HP:${m.hp}, ATK:${m.atk})`
      ).join('\n');
      const embed = new EmbedBuilder()
        .setColor(0x57F287).setTitle(`🗺️ ${z.name}`)
        .setDescription(z.desc || '*(Không có mô tả)*')
        .addFields(
          { name: '🆔 ID', value: `\`${z.id}\``, inline: true },
          { name: '🎚️ Lv yêu cầu', value: `${z.min_level}`, inline: true },
          { name: '👹 Quái trong zone', value: mobList },
        );
      if (z.image_url) embed.setImage(z.image_url); // zone dùng image to (background)
      return msg.reply({ embeds: [embed] });
    }

    // ===== info items [type] =====
    if (sub === 'items') {
      const type = args[1];
      const items = type ? getItemsByType(type) : getAllItems();
      if (items.length === 0) return msg.reply('❌ Không có item nào.');
      // Group: armor tách theo armor_slot, accessory tách theo accessory_type
      const groups = {};
      for (const it of items) {
        let k;
        if (it.type === 'armor') k = `armor:${it.armor_slot || 'chest'}`;
        else if (it.type === 'accessory') k = `accessory:${it.accessory_type || 'special'}`;
        else k = it.type;
        (groups[k] = groups[k] || []).push(it);
      }
      const labelMap = {
        weapon: '🗡️ Vũ khí', offhand: '🛡️ Tay phụ',
        'armor:head': '⛑️ Đầu', 'armor:chest': '👕 Thân', 'armor:legs': '👖 Quần',
        'armor:feet': '👢 Giày', 'armor:hands': '🧤 Găng',
        'accessory:ring': '💍 Nhẫn', 'accessory:necklace': '📿 Dây chuyền', 'accessory:special': '✨ Đặc biệt',
        consumable: '🧪 Tiêu hao', material: '📦 Nguyên liệu', pet: '🐾 Pet',
      };
      const embed = new EmbedBuilder().setColor(0xFEE75C)
        .setTitle(`📚 Danh sách item${type ? ` (${type})` : ''}`)
        .setFooter({ text: `Xem chi tiết: ${prefix}info item <id>` });
      // Order
      const groupOrder = [
        'weapon', 'offhand',
        'armor:head', 'armor:chest', 'armor:legs', 'armor:feet', 'armor:hands',
        'accessory:ring', 'accessory:necklace', 'accessory:special',
        'consumable', 'material', 'pet',
      ];
      for (const k of groupOrder) {
        if (!groups[k]) continue;
        groups[k].sort((a, b) => tierInfo(b.tier).order - tierInfo(a.tier).order);
        const lines = groups[k].map(it => `${tierInfo(it.tier).emoji} ${it.name} \`${it.id}\``);
        embed.addFields({ name: labelMap[k] || k, value: lines.join('\n').slice(0, 1024) });
      }
      return msg.reply({ embeds: [embed] });
    }

    // ===== info mobs [zone] =====
    if (sub === 'mobs' || sub === 'monsters') {
      const zone = args[1];
      const mobs = zone ? getMonstersInZone(zone) : getAllMonsters();
      if (mobs.length === 0) return msg.reply('❌ Không có quái nào.');
      const groups = {};
      for (const m of mobs) {
        const k = m.zone_id;
        (groups[k] = groups[k] || []).push(m);
      }
      const embed = new EmbedBuilder().setColor(0xED4245).setTitle('👹 Danh sách quái');
      for (const k of Object.keys(groups)) {
        const z = getZone(k);
        const lines = groups[k].map(m => `${m.name} \`${m.id}\` HP:${m.hp}`);
        embed.addFields({ name: `📍 ${z?.name || k}`, value: lines.join('\n').slice(0, 1024) });
      }
      embed.setFooter({ text: `Xem chi tiết: ${prefix}info mob <id>` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== info zones =====
    if (sub === 'zones') {
      const zones = getAllZones();
      const lines = zones.map(z =>
        `**${z.name}** \`${z.id}\` — Lv.${z.min_level}+\n› *${z.desc}*`
      );
      const embed = new EmbedBuilder()
        .setColor(0x57F287).setTitle('🗺️ Các khu vực')
        .setDescription(lines.join('\n\n'));
      return msg.reply({ embeds: [embed] });
    }

    return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}info help\``);
  },
};
