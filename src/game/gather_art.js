const path = require('node:path');
// Fixed catalog, not a path derived from an admin/user-supplied zone ID.
const ART = Object.freeze({
  mining: Object.freeze(['stone_quarry', 'iron_mine', 'gold_vein', 'mithril_cave', 'dragon_mine']),
  fishing: Object.freeze(['village_pond', 'river', 'lake', 'ocean', 'void_pool']),
  foraging: Object.freeze(['sunlit_meadow', 'whisper_woods', 'mossy_marsh', 'ancient_grove', 'world_tree_roots']),
});
const DIRECTORIES = { mining: 'mining', fishing: 'fishing', foraging: 'foraging' };
function applyGatherArt(embed, zone) {
  if (!zone || !Object.hasOwn(ART, zone.job_type) || !ART[zone.job_type].includes(zone.id)) return [];
  const name = `gather-${zone.id}.png`;
  embed.setImage(`attachment://${name}`);
  return [{ attachment: path.join(__dirname, '../../assets', DIRECTORIES[zone.job_type], `${zone.id}.png`), name }];
}
module.exports = { ART, applyGatherArt };
