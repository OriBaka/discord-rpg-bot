const { EmbedBuilder } = require('discord.js');
const { getPlayer, updatePlayer, addItem, removeItem, hasItem } = require('../game/player');
const { getItem } = require('../game/items');
const { tierInfo } = require('../game/tiers');
const db = require('../db/database');
const paginator = require('../game/paginator');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

function getShopList() {
  return db.prepare(`SELECT s.item_id, s.price, i.name, i.type, i.tier, i.class_req, i.weapon_type, i.armor_slot, i.min_level
    FROM shop s JOIN items i ON i.id = s.item_id
    ORDER BY i.type, s.price`).all();
}

// Filter cho shop — SINH TỪ DỮ LIỆU, không viết cứng.
//
// Bản cũ có đúng 4 filter (Potion/Weapon/Armor/Tool); mọi thứ khác
// (accessory, offhand, material, lootbox, item admin mới thêm) bị gom vào
// 'other' và CHỈ thấy khi bấm All — thêm loại hàng mới vào shop là nó vô hình
// với người dùng filter. Nay: đếm loại đang bán trong shop, loại nào có hàng
// thì có nút (tối đa 4 nút + All, giới hạn 5 nút/hàng của Discord).
const SHOP_CATEGORY_META = {
  consumable: { label: 'Potion', emoji: '🧪' },
  weapon:     { label: 'Weapon', emoji: '⚔️' },
  armor:      { label: 'Armor',  emoji: '🛡️' },
  tool:       { label: 'Tool',   emoji: '⛏️' },
  accessory:  { label: 'Acc',    emoji: '✨' },
  offhand:    { label: 'Offhand', emoji: '🛡️' },
  material:   { label: 'Mat',    emoji: '📦' },
  pet:        { label: 'Pet',    emoji: '🐾' },
  lootbox:    { label: 'Box',    emoji: '🎁' },
  other:      { label: 'Khác',   emoji: '📦' },
};

function classifyShopItem(row) {
  if (row.type === 'consumable') return 'consumable';
  if (row.type === 'armor') return 'armor';
  if (row.type === 'weapon') {
    const wt = row.weapon_type || '';
    if (wt === 'pickaxe' || wt === 'fishing_rod') return 'tool';
    return 'weapon';
  }
  // Trả về ĐÚNG type thay vì gom hết vào 'other' — nhờ vậy filter bên dưới
  // có thể tạo nút riêng cho từng loại đang bán.
  return row.type || 'other';
}

// Danh sách loại ĐANG BÁN (dùng để validate tham số & fallback), không giới hạn
// 4 nút: người chơi vẫn gõ được `%shop consumable` dù loại đó không có nút.
function shopCategories(all) {
  const set = new Set();
  for (const r of all) set.add(classifyShopItem(r));
  return set;
}

function shopFilters(all) {
  const counts = new Map();
  for (const r of all) {
    const k = classifyShopItem(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cats = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])            // loại nhiều hàng nhất lên trước
    .slice(0, 4)                            // tối đa 4 + All = 5 nút
    .map(([key]) => ({ key, ...(SHOP_CATEGORY_META[key] || { label: key, emoji: '📦' }) }));
  return [{ key: 'all', label: 'All', emoji: '🏪' }, ...cats];
}

function formatShopLine(row, playerLevel) {
  const emoji = tierInfo(row.tier).emoji;
  const classTag = row.class_req ? ` [${row.class_req}]` : '';
  const lv = row.min_level || 0;
  const lvTag = lv > 0 ? (playerLevel != null && playerLevel < lv ? ` 🔒LV${lv}` : ` 📗LV${lv}`) : '';
  return `${emoji} ${row.name}${classTag}${lvTag} — **${row.price}** 💰\n   \`${prefix()}buy ${row.item_id}\``;
}
function prefix() { return require('../game/prefix').getPrefix(); }

function renderShopPage({ msg, userId, filter, page, replyFn, playerGold, playerLevel }) {
  const all = getShopList();
  const filterOptions = shopFilters(all);
  // Chấp nhận MỌI loại đang bán, kể cả loại không có nút (chỉ 4 nút là hiện
  // được). Filter không còn hàng thì rơi về All.
  const active = (filter === 'all' || shopCategories(all).has(filter)) ? filter : 'all';
  const filtered = active === 'all' ? all : all.filter(r => classifyShopItem(r) === active);
  filtered.sort((a, b) => a.price - b.price);
  // Nhãn lấy từ BẢNG META, không phải từ danh sách nút: loại không có nút (vd
  // consumable khi shop có >4 loại) vẫn lọc được qua tham số, và tiêu đề phải
  // hiện đúng tên loại thay vì rơi về "All" gây hiểu nhầm.
  const filterLabel = active === 'all' ? 'All'
    : (SHOP_CATEGORY_META[active]?.label || active);
  const { embed, components } = paginator.build({
    domain: 'shop',
    userId,
    items: filtered,
    filter: active,
    filterOptions,
    page,
    title: `🏪 Cửa Hàng — ${filterLabel}`,
    color: 0xEB459E,
    formatItem: (r) => formatShopLine(r, playerLevel),
    footer: `Vàng: ${playerGold} 💰${playerLevel != null ? ` • LV ${playerLevel}` : ''}`,
  });
  return replyFn({ embeds: [embed], components });
}

module.exports = {
  name: 'shop',
  aliases: ['store', 'cuahang'],
  description: 'Cửa hàng. !shop, admin: !shop add/remove/setprice',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const sub = (args[0] || '').toLowerCase();
    const p = getPlayer(msg.author.id);

    // ===== Admin: !shop add <id> [price] =====
    if (sub === 'add') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin mới được thêm/sửa shop.');
      const id = args[1]; const customPrice = parseInt(args[2]);
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}shop add <item_id> [giá]\``);
      const it = getItem(id);
      if (!it) return msg.reply(`❌ Item \`${id}\` không tồn tại.`);
      const price = isNaN(customPrice) ? it.price : customPrice;
      if (price <= 0) return msg.reply('❌ Giá phải > 0.');
      db.prepare('INSERT OR REPLACE INTO shop (item_id, price) VALUES (?, ?)').run(id, price);
      return msg.reply(`✅ Đã thêm **${it.name}** vào shop với giá **${price}** 💰`);
    }

    // ===== Admin: !shop remove <id> =====
    if (sub === 'remove' || sub === 'rm' || sub === 'del') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      const id = args[1];
      if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}shop remove <item_id>\``);
      const r = db.prepare('DELETE FROM shop WHERE item_id = ?').run(id);
      if (r.changes === 0) return msg.reply('❌ Không có item này trong shop.');
      return msg.reply(`✅ Đã xoá \`${id}\` khỏi shop.`);
    }

    // ===== Admin: !shop setprice <id> <giá> =====
    if (sub === 'setprice' || sub === 'price') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      const id = args[1]; const price = parseInt(args[2]);
      if (!id || isNaN(price) || price <= 0) {
        return msg.reply(`❌ Cú pháp: \`${prefix}shop setprice <item_id> <giá>\``);
      }
      const r = db.prepare('UPDATE shop SET price = ? WHERE item_id = ?').run(price, id);
      if (r.changes === 0) return msg.reply('❌ Item chưa có trong shop. Dùng `shop add` trước.');
      return msg.reply(`✅ Đã đặt giá \`${id}\` = **${price}** 💰`);
    }

    // ===== !shop list (mặc định) — paginated =====
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước nhé!`);

    const rows = getShopList();
    if (rows.length === 0) {
      return msg.reply('🏪 Shop trống! Admin có thể thêm item bằng `shop add <id>`.');
    }

    // Filter arg: %shop weapon | %shop tool | ... (hợp lệ nếu shop đang bán loại đó)
    const filterArg = (args[0] || 'all').toLowerCase();
    const filter = (filterArg === 'all' || shopCategories(rows).has(filterArg)) ? filterArg : 'all';
    return renderShopPage({
      msg, userId: msg.author.id, filter, page: 0, playerGold: p.gold, playerLevel: p.level,
      replyFn: (opts) => msg.reply(opts),
    });
  },
};

// Export cho button handler
module.exports.renderShopPage = renderShopPage;

// ===== buy =====
module.exports.buy = {
  name: 'buy',
  aliases: ['mua'],
  description: 'Mua vật phẩm: !buy <id> [qty]',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}buy <id> [qty]\``);

    const shopRow = db.prepare('SELECT price FROM shop WHERE item_id = ?').get(id);
    if (!shopRow) return msg.reply('❌ Vật phẩm không có trong shop. Gõ `' + prefix + 'shop` để xem.');
    const it = getItem(id);
    if (!it) return msg.reply('❌ Item không tồn tại.');

    const total = shopRow.price * qty;
    if (p.gold < total) return msg.reply(`💸 Không đủ vàng! Cần **${total}**, bạn có **${p.gold}**.`);
    updatePlayer(msg.author.id, { gold: p.gold - total });
    addItem(msg.author.id, id, qty);
    return msg.reply(`✅ Đã mua **${qty}x ${it.name}** với giá **${total}** 💰`);
  },
};

// ===== sell =====
module.exports.sell = {
  name: 'sell',
  aliases: ['ban'],
  description: 'Bán vật phẩm: !sell <id> [qty]',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);
    const id = args[0]; const qty = Math.max(1, parseInt(args[1]) || 1);
    if (!id) return msg.reply(`❌ Cú pháp: \`${prefix}sell <id> [qty]\``);
    const it = getItem(id);
    if (!it) return msg.reply('❌ Sai ID vật phẩm.');

    // Không cho bán món đang mặc: equip KHÔNG lấy item ra khỏi túi,
    // nên nếu bán luôn thì vừa giữ buff vừa có vàng (lỗi dup trước đây).
    const equippedQty = require('../game/slots').getEquippedCount(msg.author.id, id);
    const ownedRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?')
      .get(msg.author.id, id);
    const owned = ownedRow?.qty || 0;
    const sellable = Math.max(0, owned - equippedQty);
    if (equippedQty > 0 && qty > sellable) {
      return msg.reply(
        `🔒 **${it.name}** đang được trang bị — không bán được.\n` +
        (sellable > 0
          ? `Bạn có **${owned}**× (đang mặc ${equippedQty}) → chỉ bán được tối đa **${sellable}**.\n`
          : `Bạn chỉ có ${owned}× và đang mặc hết.\n`) +
        `💡 Tháo ra trước: \`${prefix}unequip\` rồi bán.`
      );
    }
    if (!hasItem(msg.author.id, id, qty)) return msg.reply('❌ Không đủ vật phẩm để bán.');
    const gain = (it.sell || Math.floor((it.price || 0) / 3)) * qty;
    removeItem(msg.author.id, id, qty);
    updatePlayer(msg.author.id, { gold: p.gold + gain });
    return msg.reply(`✅ Đã bán **${qty}x ${it.name}** thu **${gain}** 💰`);
  },
};
