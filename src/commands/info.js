const { EmbedBuilder } = require('discord.js');
const { getItem, getAllItems } = require('../game/items');
const { getMonster, getAllMonsters, getAllZones, getZone, getMonstersInZone } = require('../game/monsters');
const { tierInfo, tierBadge } = require('../game/tiers');
const paginator = require('../game/paginator');
const display = require('../game/item_display');
const { classInfo } = require('../game/classes');
const db = require('../db/database');

// ===== Helper: hiển thị 1 item =====
//
// Dùng item_display.statPairs(): mọi field CÓ DỮ LIỆU đều được hiện, kể cả
// field thêm sau này. Bản cũ kiểm tra từng field bằng `if (it.x)` nên:
//   • bình máu dùng heal_pct (heal = 0) không hiện gì về hồi máu;
//   • `min_level` không bao giờ hiện — người chơi không biết món đồ cần Lv bao nhiêu;
//   • cột mới thêm vào bảng items (vd heal_pct) hoàn toàn vô hình ở lệnh info.
function itemEmbed(it, prefix) {
  const t = tierInfo(it.tier);
  const fields = [
    { name: '📦 Loại', value: display.typeLabel(it.type), inline: true },
    { name: '✨ Độ hiếm', value: tierBadge(it.tier), inline: true },
    { name: '🆔 ID', value: `\`${it.id}\``, inline: true },
  ];
  for (const f of display.statPairs(it)) {
    // class_req hiện TÊN class (⚔️ Chiến Binh), không phải id thô 'melee'
    if (f.name === '🎭 Yêu cầu class') {
      const c = classInfo(it.class_req);
      fields.push({ name: f.name, value: c?.name || it.class_req, inline: true });
    } else {
      fields.push({ ...f, inline: true });
    }
  }

  const embedBase = new EmbedBuilder()
    .setColor(t.color)
    .setTitle(it.name)
    .setDescription(it.desc || '*(Không có mô tả)*');
  if (it.image_url) embedBase.setThumbnail(it.image_url);

  embedBase.addFields(fields);

  if (it.type === 'weapon' || it.type === 'armor' || it.type === 'offhand' || it.type === 'accessory') {
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
    .setDescription(m.desc ? `› *${m.desc}*` : '*(Chưa có mô tả)*')
    .addFields(
      { name: '🆔 ID', value: `\`${m.id}\``, inline: true },
      { name: '📍 Khu vực', value: zone?.name || m.zone_id, inline: true },
      { name: '⚖️ Tỉ trọng spawn', value: `${m.weight}`, inline: true },
      { name: '❤️ HP', value: `${m.hp}`, inline: true },
      { name: '⚔️ ATK', value: `${m.atk}`, inline: true },
      { name: '🛡️ DEF', value: `${m.def}`, inline: true },
      { name: '✨ XP thưởng', value: `${m.xp}`, inline: true },
      { name: '💰 Vàng', value: `${m.gold[0]}-${m.gold[1]}`, inline: true },
      // elite_tier là cột thêm sau này (battle elite/boss). Bản cũ không hiện
      // nên `%info mob raid_ember_wyrm` trông y như quái thường.
      ...(m.elite_tier ? [{ name: '👑 Elite/Boss', value: m.elite_tier === 2 ? 'Boss cấp 2' : 'Elite cấp 1', inline: true }]
        : [{ name: '\u200B', value: '\u200B', inline: true }]),
      { name: '📦 Drop', value: dropText },
    )
    .setFooter({ text: `Săn: ${prefix}hunt ${m.id}` });
  if (m.image_url) embed.setThumbnail(m.image_url);
  return embed;
}

// ===== info items: DANH SÁCH PHÂN TRANG =====
//
// Bản cũ nhồi TẤT CẢ item vào 1 embed rồi cắt mỗi field ở 1024 ký tự. Với 223
// item trong DB, kết quả là 16 item biến mất khỏi danh sách mà không ai biết —
// và nhóm nào không có trong `groupOrder` viết cứng (vd type=lootbox do admin
// tạo) thì không bao giờ xuất hiện. Nay:
//   • danh sách phân trang theo loại (nút bấm), đọc thẳng từ bảng items;
//   • bộ lọc sinh từ DỮ LIỆU (loại/slot đang có trong DB), không viết cứng;
//   • hiện đủ số lượng + chỉ số từng món.
const INFO_FILTER_LABELS = {
  all: { label: 'Tất cả', emoji: '📚' },
  weapon: { label: 'Vũ khí', emoji: '🗡️' },
  armor: { label: 'Giáp', emoji: '🦺' },
  accessory: { label: 'Phụ kiện', emoji: '✨' },
  offhand: { label: 'Tay phụ', emoji: '🛡️' },
  consumable: { label: 'Tiêu hao', emoji: '🧪' },
  material: { label: 'Nguyên liệu', emoji: '📦' },
  pet: { label: 'Pet', emoji: '🐾' },
  lootbox: { label: 'Hộp quà', emoji: '🎁' },
};

function itemFilters() {
  // Lấy từ DB: loại nào đang có thì hiện nút, loại mới tự xuất hiện.
  const rows = db.prepare('SELECT type, COUNT(*) c FROM items GROUP BY type ORDER BY c DESC').all();
  const opts = [{ key: 'all', label: 'Tất cả', emoji: '📚' }];
  for (const r of rows) {
    const known = INFO_FILTER_LABELS[r.type];
    opts.push(known
      ? { key: r.type, ...known }
      : { key: r.type, label: r.type, emoji: '📦' });
  }
  return opts;
}

function renderItemsPage({ userId, filter, page, replyFn }) {
  const prefix = require('../game/prefix').getPrefix();
  const all = getAllItems();
  const opts = itemFilters();
  const valid = new Set(opts.map(o => o.key));
  const cur = valid.has(filter) ? filter : 'all';
  const items = cur === 'all' ? all : all.filter(it => it.type === cur);
  // Xếp theo nhóm quen thuộc (vũ khí → tay phụ → giáp → phụ kiện → ...), trong
  // nhóm thì độ hiếm cao trước. Trước đây thứ tự là `ORDER BY type` của SQL
  // nên danh sách mở đầu bằng phụ kiện — người chơi phải lật nhiều trang mới
  // thấy vũ khí.
  items.sort((a, b) => {
    const ga = display.groupOf(a).key, gb = display.groupOf(b).key;
    const byGroup = display.sortGroupKeys([ga, gb])[0] === ga ? -1 : 1;
    if (ga !== gb) return byGroup;
    const t = tierInfo(b.tier).order - tierInfo(a.tier).order;
    return t !== 0 ? t : a.name.localeCompare(b.name);
  });

  const { embed, components } = paginator.build({
    domain: 'info',
    userId,
    items,
    filter: cur,
    filterOptions: opts,
    page,
    title: `📚 Danh sách item${cur === 'all' ? '' : ` (${cur})`} — ${items.length} món`,
    color: 0xFEE75C,
    formatItem: (it) => display.oneLine(it, { tierInfo }),
    footer: `Xem chi tiết: ${prefix}info item <id>`,
    perPage: 10,
  });
  return replyFn({ embeds: [embed], components });
}

// ===== info mobs: DANH SÁCH PHÂN TRANG =====
//
// Bản cũ gom quái theo zone rồi cắt mỗi field ở 1024 ký tự. Một zone có
// ~20+ quái (hoặc admin thêm quái mới bằng `%mob create`) là phần đuôi danh
// sách biến mất, không dấu vết. Nay dùng paginator: bộ lọc zone sinh từ DB,
// đếm đủ số con, mỗi con 1 dòng.
function mobFilters(all) {
  const counts = new Map();
  for (const m of all) counts.set(m.zone_id, (counts.get(m.zone_id) || 0) + 1);
  const opts = [{ key: 'all', label: 'Tất cả', emoji: '🌍' }];
  for (const [zoneId, c] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    const z = getZone(zoneId);
    // Nhãn nút tối đa 80 ký tự; cắt cho gọn nhưng vẫn nhận ra zone
    const name = (z?.name || zoneId).replace(/^[^\w\p{L}]+/u, '').slice(0, 24) || zoneId;
    opts.push({ key: zoneId, label: name, emoji: '📍' });
  }
  return opts;
}

function renderMobsPage({ userId, filter, page, replyFn }) {
  const prefix = require('../game/prefix').getPrefix();
  const all = getAllMonsters();
  const opts = mobFilters(all);
  const zones = new Set(all.map(m => m.zone_id));
  const cur = (filter === 'all' || zones.has(filter)) ? filter : 'all';
  const mobs = (cur === 'all' ? all : all.filter(m => m.zone_id === cur)).slice();
  // Xếp theo zone (level tăng dần) rồi tới HP — đọc từ đầu tới cuối là thấy
  // tiến trình độ khó, không phải thứ tự ngẫu nhiên của SQL.
  const zoneLevel = (id) => getZone(id)?.min_level ?? 999;
  mobs.sort((a, b) => (zoneLevel(a.zone_id) - zoneLevel(b.zone_id))
    || (a.hp - b.hp) || a.name.localeCompare(b.name));

  const { embed, components } = paginator.build({
    domain: 'mobs',
    userId,
    items: mobs,
    filter: cur,
    filterOptions: opts,
    page,
    title: `👹 Danh sách quái${cur === 'all' ? '' : ` — ${getZone(cur)?.name || cur}`} — ${mobs.length} con`,
    color: 0xED4245,
    formatItem: (m) => {
      const z = getZone(m.zone_id);
      return `${m.name} \`${m.id}\` · HP ${m.hp} · ATK ${m.atk}${m.elite_tier ? ' 👑' : ''}\n› 📍 ${z?.name || m.zone_id}`;
    },
    footer: `Xem chi tiết: ${prefix}info mob <id>`,
    perPage: 10,
  });
  return replyFn({ embeds: [embed], components });
}

// ===== Command =====
module.exports = {
  renderItemsPage,
  renderMobsPage,
  name: 'info',
  aliases: ['xem', 'i'],
  description: 'Xem thông tin item/quái/zone: !info item <id>, !info mob <id>, !info zone <id>',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
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
      return renderItemsPage({
        userId: msg.author.id,
        filter: (args[1] || 'all').toLowerCase(),
        page: 0,
        replyFn: (opts) => msg.reply(opts),
      });
    }

    // ===== info mobs [zone] =====
    if (sub === 'mobs' || sub === 'monsters') {
      return renderMobsPage({
        userId: msg.author.id,
        filter: (args[1] || 'all').toLowerCase(),
        page: 0,
        replyFn: (opts) => msg.reply(opts),
      });
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
