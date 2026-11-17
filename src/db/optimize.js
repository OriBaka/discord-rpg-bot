// Additive, non-unique indexes only. Do not duplicate left-prefix PK indexes
// (inventory(user_id,item_id), monster_drops(monster_id,item_id), etc.).
const INDEXES = [
  ['players', 'idx_players_level_xp', 'level DESC, xp DESC, user_id'],
  ['players', 'idx_players_gold', 'gold DESC'],
  ['monsters', 'idx_monsters_zone', 'zone_id'],
  ['guilds', 'idx_guilds_level_xp', 'level DESC, xp DESC, id'],
  ['guilds', 'idx_guilds_tag_lower', 'LOWER(tag)'],
  ['guilds', 'idx_guilds_name_lower', 'LOWER(name)'],
  ['guild_invites', 'idx_guild_invites_user_created', 'user_id, created_at DESC'],
  ['player_quests', 'idx_player_quests_unclaimed', 'user_id, claimed, quest_id'],
  ['market_listings', 'idx_market_created', 'created_at DESC'],
  ['market_sales', 'idx_market_sales_item_time', 'item_id, sold_at DESC'],
  ['market_sales', 'idx_market_sales_time', 'sold_at DESC'],
  ['raid_bosses', 'idx_raid_bosses_ends', 'ends_at DESC'],
];
function applyIndexes(db) {
  if (!db.open) return;
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?");
  db.transaction(() => {
    for (const [table, name, columns] of INDEXES) {
      // Circular module loading can defer a feature's CREATE TABLE until the
      // next tick. The caller runs this again after deferred migrations finish.
      if (exists.get(table)) db.exec(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns})`);
    }
  })();
}
function optimize(db) {
  if (!db.open) return;
  // Bounded statistics maintenance; never VACUUM or change durability/FKs.
  const previousLimit = db.pragma('analysis_limit', { simple: true });
  try {
    db.pragma('analysis_limit = 400');
    db.pragma('optimize = 0x10002');
  } finally { db.pragma(`analysis_limit = ${previousLimit}`); }
}
module.exports = { INDEXES, applyIndexes, optimize };
