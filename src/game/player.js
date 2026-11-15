const db = require('../db/database');
const { ITEMS } = require('./items');

// ===== Helpers =====
function xpToNext(level) {
  return Math.floor(50 * Math.pow(level, 1.5));
}

function getPlayer(userId) {
  return db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
}

// Vàng khởi đầu.
//
// Từng là 50 — nhưng món đồ rẻ nhất trong shop giá 150, nên người mới KHÔNG
// MUA ĐƯỢC GÌ. Đo được: người mới + class + vũ khí khởi đầu thắng 1-4% ở
// forest, mỗi trận chết sau 4 hiệp, và không có vàng để hồi máu hay mua đồ
// → bế tắc hoàn toàn, không có đường tiến.
//
// Nay 400: đủ mua vũ khí khởi đầu (150) + 1 món giáp (150), còn 100 dự phòng
// cho 1 lần hồi máu. Không đủ mua cả bộ — vẫn phải cày, nhưng không bế tắc.
const STARTING_GOLD = 400;

function createPlayer(userId, name) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO players (user_id, name, created_at, gold)
    VALUES (?, ?, ?, ?)
  `).run(userId, name, now, STARTING_GOLD);
  return getPlayer(userId);
}

function updatePlayer(userId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE players SET ${setClause} WHERE user_id = ?`).run(...values, userId);
}

// ===== Stats có cộng trang bị (tổng hợp tất cả slot) =====
function getEffectiveStats(p) {
  // Dùng require trong hàm để tránh circular dependency
  const { getTotalBonus } = require('./slots');
  // Truyền player để slots áp hệ số DEF theo class (armor_share).
  // Không truyền thì mọi class hưởng 100% giáp và Pháp Sư mất phần bù HP.
  const bonus = getTotalBonus(p.user_id, p);
  return {
    atk: p.atk + bonus.atk,
    def: p.def + bonus.def,
    bonus_heal: bonus.heal, // hồi máu tự động/trận (necklace bonus)
  };
}

// ===== Inventory =====
function getInventory(userId) {
  return db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
}

// context optional: { client, guildId } để notify channel khi unlock achievement
function addItem(userId, itemId, qty = 1, context = null) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  if (row) {
    db.prepare('UPDATE inventory SET qty = qty + ? WHERE user_id=? AND item_id=?')
      .run(qty, userId, itemId);
  } else {
    db.prepare('INSERT INTO inventory (user_id, item_id, qty) VALUES (?, ?, ?)')
      .run(userId, itemId, qty);
  }
  // Hook: quest item collection
  try {
    const quests = require('./quests');
    quests.onItemCollect(userId, itemId);
  } catch (e) {
    console.error('[addItem hook quests]', e.message);
  }
  // Hook: achievement item_collect (auto check + notify)
  try {
    const achievements = require('./achievements');
    const granted = achievements.checkAndGrant(userId, context);
    if (granted.length > 0) {
      console.log(`[addItem] User ${userId} +${qty} ${itemId} → unlocked: ${granted.map(a => a.id).join(', ')}`);
    }
  } catch (e) {
    console.error('[addItem hook achievements]', e.message);
  }
}

function removeItem(userId, itemId, qty = 1) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  if (!row || row.qty < qty) return false;
  if (row.qty === qty) {
    db.prepare('DELETE FROM inventory WHERE user_id=? AND item_id=?').run(userId, itemId);
  } else {
    db.prepare('UPDATE inventory SET qty = qty - ? WHERE user_id=? AND item_id=?')
      .run(qty, userId, itemId);
  }
  return true;
}

function hasItem(userId, itemId, qty = 1) {
  const row = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(userId, itemId);
  return row && row.qty >= qty;
}

// ===== Level up =====
function addXpAndLevel(userId, xpGain) {
  const p = getPlayer(userId);
  let xp = p.xp + xpGain;
  let level = p.level;
  let max_hp = p.max_hp, atk = p.atk, def = p.def;
  const lvlUps = [];

  // TỐC ĐỘ TĂNG CẤP PHẢI THEO CLASS.
  //
  // Trước đây hàm này cộng cứng +15 HP / +3 ATK / +2 DEF cho MỌI class, hoàn
  // toàn bỏ qua `growth` trong classes.js. Hệ quả: `statsAtLevel()` (dùng bởi
  // %class, mô hình cân bằng và công cụ tune) và chỉ số THẬT của người chơi
  // khác nhau ngay từ Lv.2 — và khác càng lúc càng xa. Mọi lần tinh chỉnh
  // growth trước đây đều không có tác dụng gì vì lý do này.
  //
  // Nay đọc growth của class đang dùng; không có class thì giữ mức chung cũ.
  let g = { hp: 15, atk: 3, def: 2 };
  let classesMod = null, classDrift = null;
  if (p.primary_class) {
    try {
      classesMod = require('./classes');
      const cls = classesMod.CLASSES[p.primary_class];
      if (cls && cls.growth) g = cls.growth;
      // Độ lệch giữa chỉ số HIỆN TẠI và công thức của class.
      //
      // Thường là 0. Nhưng admin có thể đã chỉnh tay (!admin), hoặc người chơi
      // đổi class, nên không được ghi đè mất phần đó — chỉ cộng thêm phần lớn
      // lên theo cấp. Nhờ vậy công thức ở đây và statsAtLevel() luôn khớp nhau
      // tuyệt đối, thay vì trôi dần vì làm tròn.
      const cur = classesMod.statsAtLevel(p.primary_class, p.level);
      classDrift = { hp: p.max_hp - cur.max_hp, atk: p.atk - cur.atk, def: p.def - cur.def };
    } catch { classesMod = null; classDrift = null; }
  }

  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    lvlUps.push(level);
  }

  if (classDrift && lvlUps.length > 0) {
    // Tính lại từ công thức thay vì cộng dồn: growth là tuyến tính nên kết quả
    // bằng nhau, nhưng cách này không bao giờ trôi và tự áp hệ số bậc giáp
    // (hp_band_mult) đúng một lần.
    const now = classesMod.statsAtLevel(p.primary_class, level);
    max_hp = now.max_hp + classDrift.hp;
    atk    = now.atk    + classDrift.atk;
    def    = now.def    + classDrift.def;
  } else if (lvlUps.length > 0) {
    max_hp += g.hp * lvlUps.length;
    atk    += g.atk * lvlUps.length;
    def    += g.def * lvlUps.length;
  }

  // CHỈ hồi đầy HP khi thực sự lên cấp.
  // Trước đây hàm này luôn set hp = max_hp → mỗi trận thắng đều full máu,
  // khiến bình máu / quán trọ / cooldown heal thành vô nghĩa.
  const fields = { xp, level, max_hp, atk, def };
  let hp = p.hp;
  if (lvlUps.length > 0) {
    hp = max_hp;                 // lên cấp → hồi đầy
    fields.hp = hp;
  } else if (hp > max_hp) {
    hp = max_hp;                 // clamp nếu max_hp bị giảm (đổi class, admin chỉnh...)
    fields.hp = hp;
  }

  updatePlayer(userId, fields);

  // Auto-sync class_data nếu có primary_class
  if (p.primary_class && lvlUps.length > 0) {
    try {
      const { syncPrimaryClassData } = require('./classes');
      syncPrimaryClassData(userId);
    } catch {}
  }

  // Hook: quest tracking
  if (lvlUps.length > 0) {
    try {
      const quests = require('./quests');
      quests.onLevelUp(userId, level);
    } catch {}
  }

  return { newLevel: level, levelsGained: lvlUps, xpToNext: xpToNext(level), xp };
}

module.exports = {
  STARTING_GOLD,
  xpToNext,
  getPlayer,
  createPlayer,
  updatePlayer,
  getEffectiveStats,
  getInventory,
  addItem,
  removeItem,
  hasItem,
  addXpAndLevel,
};
