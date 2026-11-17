const path = require('node:path');
const ZONES = ['forest', 'swamp', 'cave', 'desert', 'mountain', 'dragon_lair', 'volcano', 'frozen_abyss', 'astral_ruins'];
function migrate() {
  const db = require('../db/database');
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM meta WHERE key=?').get('zone_pixel_art_v1')) return;
    for (const id of ZONES) db.prepare('UPDATE zones SET image_url=? WHERE id=?').run(`attachment://zone-${id}.png`, id);
    db.prepare('INSERT INTO meta (key,value) VALUES (?,?)').run('zone_pixel_art_v1', '1');
  })();
}
function applyZoneArt(embed, zone) {
  if (!zone) return [];
  if (zone.image_url?.startsWith('https://')) { embed.setImage(zone.image_url); return []; }
  if (!ZONES.includes(zone.id)) return [];
  const name = `zone-${zone.id}.png`;
  embed.setImage(`attachment://${name}`);
  return [{ attachment: path.join(__dirname, '../../assets/zones', `${zone.id}.png`), name }];
}
module.exports = { ZONES, migrate, applyZoneArt };
