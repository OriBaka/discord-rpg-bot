// Early-game crafting needs coal before Iron Mine (Mining Lv.10).
// One-shot migration updates existing servers without overwriting later admin tuning.
const KEY = 'coal_supply_v1';
const PRICE = 25;
const DROPS = [
  ['stone_quarry', 0.55, 1, 2],
  ['iron_mine', 0.75, 2, 3],
];
function migrate() {
  const db = require('../db/database');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM meta WHERE key=?').get(KEY)) return;
    // Do not mark as applied if a custom/circular initialization is incomplete.
    if (!db.prepare("SELECT 1 FROM items WHERE id='coal'").get()) return;
    const zone = db.prepare('SELECT 1 FROM gather_zones WHERE id=?');
    if (!DROPS.every(([id]) => zone.get(id))) return;
    for (const [id, chance, min, max] of DROPS) {
      db.prepare(`INSERT INTO gather_drops (zone_id,item_id,chance,qty_min,qty_max)
        VALUES (?,'coal',?,?,?) ON CONFLICT(zone_id,item_id) DO UPDATE SET
        chance=excluded.chance,qty_min=excluded.qty_min,qty_max=excluded.qty_max`).run(id, chance, min, max);
    }
    db.prepare("UPDATE items SET price=?,sell=8 WHERE id='coal'").run(PRICE);
    db.prepare("INSERT INTO shop (item_id,price) VALUES ('coal',?) ON CONFLICT(item_id) DO UPDATE SET price=excluded.price").run(PRICE);
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run(KEY, '1');
  })();
}
module.exports = { migrate, KEY, PRICE, DROPS };
