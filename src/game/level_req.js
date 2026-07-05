// Level requirement system: cần LV nhân vật để equip/dùng gear
// Migrate cột min_level vào items table + backfill dựa trên id patterns

function getDb() { return require('./../db/database'); }

// Map id pattern → min_level (backfill cho items cũ)
// Ưu tiên khớp cụ thể trước, wildcard sau
function inferMinLevel(item) {
  const id = (item.id || '').toLowerCase();
  const type = item.type || '';

  // Consumable, material, lootbox, pet → no requirement
  if (type === 'consumable' || type === 'material' || type === 'lootbox' || type === 'pet') return 0;

  // === Tools ===
  if (id === 'pick_wood' || id === 'rod_wood') return 1;
  if (id === 'pick_copper' || id === 'rod_bamboo') return 10;
  if (id === 'pick_iron' || id === 'rod_iron') return 20;
  if (id === 'pick_silver' || id === 'rod_silver') return 30;
  if (id === 'pick_gold' || id === 'rod_gold') return 40;
  if (id === 'pick_mithril' || id === 'rod_mithril') return 50;
  if (id === 'pick_diamond' || id === 'rod_diamond') return 60;
  if (id === 'pick_dragon' || id === 'rod_dragon') return 70;
  if (id === 'pick_apocalypse' || id === 'rod_apocalypse') return 85;
  if (id === 'pick_void' || id === 'rod_void') return 100;

  // === Weapons (shop tier) ===
  if (/^(sword|staff|bow)_wood$/.test(id)) return 1;
  if (/^(sword|staff|bow)_(iron|apprentice|short)$/.test(id)) return 10;
  if (/^(sword|staff|bow)_(steel|mage|long)$/.test(id)) return 20;
  if (/^(sword|staff|bow)_(silver|wizard|composite)$/.test(id)) return 30;
  if (/^(sword|staff|bow)_(gold|arcane|elven)$/.test(id)) return 40;
  if (/^(sword|staff|bow)_mithril$/.test(id)) return 50;

  // === Weapons crafted T60+ ===
  if (/_mithril_forged$/.test(id)) return 60;
  if (/^(sword|staff|bow|armor|pick|rod)_diamond$/.test(id)) return 60;  // craft T60/70
  if (/_dragon_forged$/.test(id) || /^armor_dragon$/.test(id)) return 80;
  if (/_apocalypse$/.test(id)) return 90;
  if (/_void$/.test(id) && id !== 'void_essence' && id !== 'void_ingot') return 100;

  // === Armor shop ===
  if (id === 'armor_cloth') return 1;
  if (id === 'armor_leather') return 10;
  if (id === 'armor_chain') return 20;
  if (id === 'armor_iron') return 30;
  if (id === 'armor_steel') return 40;
  if (id === 'armor_mithril') return 50;

  // === Legacy items (best-effort theo tier) ===
  const tier = item.tier || 'common';
  if (tier === 'legendary') return 40;
  if (tier === 'epic') return 25;
  if (tier === 'rare') return 12;
  return 1; // common default
}

function migrate() {
  const db = getDb();
  // 1. Add column nếu chưa có
  try {
    db.prepare('SELECT min_level FROM items LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE items ADD COLUMN min_level INTEGER NOT NULL DEFAULT 0");
    console.log('🔧 Đã thêm cột min_level vào bảng items');
    // Backfill all items
    const all = db.prepare('SELECT id, type, tier FROM items').all();
    const upd = db.prepare('UPDATE items SET min_level = ? WHERE id = ?');
    let n = 0;
    for (const it of all) {
      const lv = inferMinLevel(it);
      upd.run(lv, it.id);
      if (lv > 0) n++;
    }
    console.log(`🔧 Backfill min_level cho ${n} items`);
  }

  // 2. Bổ sung backfill mỗi lần bot khởi động cho items có min_level=0 nhưng nên có
  // (safe: chỉ update nếu inferMinLevel > 0 và hiện tại = 0)
  try {
    const zeros = db.prepare('SELECT id, type, tier FROM items WHERE min_level = 0').all();
    const upd = db.prepare('UPDATE items SET min_level = ? WHERE id = ? AND min_level = 0');
    let n = 0;
    for (const it of zeros) {
      const lv = inferMinLevel(it);
      if (lv > 0) { upd.run(lv, it.id); n++; }
    }
    if (n > 0) console.log(`🔧 Backfill thêm ${n} items có min_level`);
  } catch (e) {
    console.error('[level_req migrate]', e.message);
  }
}

// Runtime check helpers
function canUse(player, item) {
  if (!item) return { ok: true };
  const req = item.min_level || 0;
  if (req <= 0) return { ok: true };
  if (player.level < req) {
    return { ok: false, req, current: player.level };
  }
  return { ok: true };
}

module.exports = { migrate, inferMinLevel, canUse };
 
