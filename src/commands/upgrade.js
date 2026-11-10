// Nâng cấp vũ khí +1..+5.
//
//   !upgrade            → xem vũ khí đang mặc, cấp hiện tại và cái cần để lên cấp
//   !upgrade <id>       → nâng món <id> (phải đang mặc ở slot vũ khí)
//   !upgrade list       → bảng chi phí đầy đủ +1..+5 theo phẩm chất
//
// Tên vũ khí KHÔNG đổi — chỉ thêm hậu tố "+N" khi hiển thị.
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer, hasItem, removeItem } = require('../game/player');
const { getItem } = require('../game/items');
const { getEquipped } = require('../game/slots');
const { tierInfo } = require('../game/tiers');
const upgrade = require('../game/upgrade');

const COLORS = { common: 0x95A5A6, rare: 0x3498DB, epic: 0x9B59B6, legendary: 0xE67E22 };

// Hiển thị tên kèm hậu tố — chỉ thêm "+N", không đổi tên gốc
function displayName(item, level) {
  return level > 0 ? `${item.name} **+${level}**` : item.name;
}

function fmt(n) { return Number(n).toLocaleString('en-US'); }

// Dòng mô tả 1 cấp chi phí
function costLine(item, cost, have = null) {
  const mat = cost.materials[0];
  const it = getItem(mat.item_id);
  const owned = have ? (have[mat.item_id] || 0) : null;
  const okMat = owned === null ? '' : (owned >= mat.qty ? ' ✅' : ` ❌ (có ${owned})`);
  return `**+${cost.next_level}** → ${fmt(cost.gold)} vàng + ${mat.qty}× ${it?.name || mat.item_id}${okMat}`;
}

function ownedMap(userId) {
  const rows = db.prepare('SELECT item_id, qty FROM inventory WHERE user_id=?').all(userId);
  const m = {};
  for (const r of rows) m[r.item_id] = r.qty;
  return m;
}

// ===== Xem trạng thái + chi phí cấp tiếp theo =====
function renderStatus(msg, p) {
  const equipped = getEquipped(p.user_id);
  const weaponId = equipped.weapon;
  const item = weaponId ? getItem(weaponId) : null;

  if (!item) {
    return msg.reply(
      '🗡️ Bạn chưa mặc vũ khí nào.\n' +
      'Dùng `!equip <id>` trước, rồi `!upgrade` để xem chi phí nâng cấp.'
    );
  }
  if (!upgrade.isValidUpgradeTarget(item)) {
    return msg.reply(`❌ **${item.name}** không nâng cấp được (chỉ áp dụng cho vũ khí chiến đấu).`);
  }

  const level = upgrade.getLevel(p.user_id, item.id);
  const t = tierInfo(item.tier);
  const bonus = upgrade.upgradeBonus(item, level);

  let desc = `${t.emoji} ${displayName(item, level)}\n`;
  if (bonus.atk) desc += `⚔️ ATK nâng cấp: **+${bonus.atk}**\n`;
  if (bonus.def) desc += `🛡️ DEF nâng cấp: **+${bonus.def}**\n`;
  desc += `\n**Cấp hiện tại: ${level}/${upgrade.MAX_LEVEL}**\n\n`;

  if (level >= upgrade.MAX_LEVEL) {
    desc += '🏆 Đã đạt cấp tối đa.';
  } else {
    const cost = upgrade.getUpgradeCost(item, level);
    const have = ownedMap(p.user_id);
    desc += '**Để lên cấp tiếp theo cần:**\n';
    desc += costLine(item, cost, have) + '\n';
    const mat = cost.materials[0];
    const okGold = p.gold >= cost.gold;
    const okMat = (have[mat.item_id] || 0) >= mat.qty;
    desc += `\n💰 Vàng: **${fmt(p.gold)}**/${fmt(cost.gold)} ${okGold ? '✅' : '❌'}`;
    desc += okGold && okMat
      ? `\n\n👉 \`!upgrade ${item.id}\` để nâng cấp.`
      : '\n\n*Chưa đủ nguyên liệu — xem nguồn ở `!upgrade list`.*';
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS[item.tier] || 0x95A5A6)
    .setTitle('⚒️ Nâng cấp vũ khí')
    .setDescription(desc);
  return msg.reply({ embeds: [embed] });
}

// ===== Bảng chi phí +1..+5 =====
// Chi phí phụ thuộc 2 thứ: phẩm chất (nhân số lượng) và cấp vũ khí (bậc
// nguyên liệu). Vì vậy bảng minh hoạ theo 4 mốc cấp độ đại diện, không liệt
// kê 30 vũ khí.
function renderList(msg) {
  let desc = 'Nguyên liệu tăng dần theo cấp **và** theo độ mạnh vũ khí.\n';
  desc += 'Số lượng nhân theo phẩm chất: ';
  desc += ['common', 'rare', 'epic', 'legendary']
    .map(t => `${tierInfo(t).emoji}×${upgrade.TIER_MULT[t]}`).join(' · ') + '\n\n';

  const samples = ['wood_sword', 'iron_sword', 'steel_sword', 'dragon_sword'];
  for (const id of samples) {
    const it = getItem(id);
    if (!it) continue;
    const t = tierInfo(it.tier);
    desc += `${t.emoji} **${it.name}** (Lv.${it.min_level}, ATK ${it.atk}) → +5 cho **+${upgrade.upgradeBonus(it, 5).atk} ATK**\n`;
    for (const c of upgrade.getUpgradePath(it)) {
      const m = c.materials[0];
      const mi = getItem(m.item_id);
      desc += `  +${c.next_level}: ${m.qty}× ${mi?.name || m.item_id} · ${fmt(c.gold)} vàng\n`;
    }
    desc += '\n';
  }

  desc += '**Nguồn nguyên liệu** (tất cả đều có trong game):\n';
  desc += '🪨 Stone / Copper Ore — mine `stone_quarry`; hunt Moss Golem, Cave Golem\n';
  desc += '⛓️ Iron Ore — mine `iron_mine`; hunt Stone Berserker (40%)\n';
  desc += '🟡 Gold Ore — mine `gold_vein`\n';
  desc += '💎 Ruby / Sapphire — mine `gold_vein`, `mithril_cave`; hunt Ember Phoenix (45%), Obsidian Golem (30%)\n';
  desc += '💠 Diamond — mine `dragon_mine`; hunt Star Devourer (70%), Astral Sentinel (30%)\n';
  desc += '🔶 Dragon Scale — hunt Young Dragon (50%), Ancient Dragon (85%), Void Dragon (100%)\n';
  desc += '\n*Bonus: +2% ATK của vũ khí mỗi cấp — tối đa +5. Nâng cấp không đổi tên vũ khí.*';

  const embed = new EmbedBuilder()
    .setColor(0xE67E22)
    .setTitle('⚒️ Bảng nâng cấp vũ khí (+1 → +5)')
    .setDescription(desc);
  return msg.reply({ embeds: [embed] });
}

module.exports = {
  name: 'upgrade',
  aliases: ['nangcap', 'up', 'cuonghoa'],
  description: 'Nâng cấp vũ khí +1..+5. !upgrade | !upgrade <id> | !upgrade list',
  async execute(msg, args) {
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply('❌ Gõ `!start` để tạo nhân vật trước.');

    const sub = (args[0] || '').toLowerCase();

    if (!sub) return renderStatus(msg, p);
    if (sub === 'list' || sub === 'bang' || sub === 'help') return renderList(msg);

    // ===== Nâng cấp =====
    const itemId = args[0];
    const item = getItem(itemId);
    if (!item) return msg.reply(`❌ Item \`${itemId}\` không tồn tại.`);

    const equipped = getEquipped(msg.author.id);
    if (equipped.weapon !== itemId) {
      return msg.reply(
        `❌ **${item.name}** không phải vũ khí bạn đang mặc.\n` +
        (equipped.weapon
          ? `Đang mặc: **${displayName(getItem(equipped.weapon), upgrade.getLevel(msg.author.id, equipped.weapon))}**`
          : 'Bạn chưa mặc vũ khí nào.') +
        `\nDùng \`!equip ${itemId}\` rồi thử lại.`
      );
    }
    if (!upgrade.isValidUpgradeTarget(item)) {
      return msg.reply(`❌ **${item.name}** không nâng cấp được (chỉ áp dụng cho vũ khí chiến đấu).`);
    }
    if (!hasItem(msg.author.id, itemId, 1)) {
      return msg.reply('❌ Bạn không còn món này trong túi.');
    }

    const level = upgrade.getLevel(msg.author.id, itemId);
    if (level >= upgrade.MAX_LEVEL) {
      return msg.reply(`🏆 **${item.name}** đã đạt cấp tối đa **+${upgrade.MAX_LEVEL}**.`);
    }

    const cost = upgrade.getUpgradeCost(item, level);
    const mat = cost.materials[0];
    const matItem = getItem(mat.item_id);

    // Kiểm tra đủ điều kiện TRƯỚC khi trừ bất cứ thứ gì
    if (p.gold < cost.gold) {
      return msg.reply(
        `💰 Không đủ vàng: cần **${fmt(cost.gold)}**, bạn có **${fmt(p.gold)}**.`
      );
    }
    if (!hasItem(msg.author.id, mat.item_id, mat.qty)) {
      const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?')
        .get(msg.author.id, mat.item_id);
      return msg.reply(
        `📦 Thiếu nguyên liệu: cần **${mat.qty}× ${matItem?.name || mat.item_id}**, ` +
        `bạn có **${row?.qty || 0}**.`
      );
    }

    // Trừ nguyên liệu + vàng
    removeItem(msg.author.id, mat.item_id, mat.qty);
    const { updatePlayer } = require('../game/player');
    updatePlayer(msg.author.id, { gold: p.gold - cost.gold });
    upgrade.setLevel(msg.author.id, item.id, level + 1);

    const newLevel = level + 1;
    const bonus = upgrade.upgradeBonus(item, newLevel);
    const t = tierInfo(item.tier);
    const bonusTxt = bonus.atk ? `+${bonus.atk} ATK` : (bonus.def ? `+${bonus.def} DEF` : '');
    const maxed = newLevel >= upgrade.MAX_LEVEL;

    const embed = new EmbedBuilder()
      .setColor(COLORS[item.tier] || 0x95A5A6)
      .setTitle('⚒️ Nâng cấp thành công!')
      .setDescription(
        `${t.emoji} ${displayName(item, newLevel)}${bonusTxt ? `\n🔥 Tổng bonus: **${bonusTxt}**` : ''}\n\n` +
        `- ${fmt(cost.gold)} vàng\n- ${mat.qty}× ${matItem?.name || mat.item_id}\n\n` +
        (maxed ? '🏆 **Đã đạt cấp tối đa +5!**' : `Cấp tiếp theo: \`!upgrade ${item.id}\``)
      );

    return msg.reply({ embeds: [embed] });
  },
};
