// One-time restore command: !petrestore confirm
// Thêm lại các pet bị mất sau cleanup, không xóa pet đã có
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');

const MISSING_PETS = [
  // [id, name, icon, tier, desc, atk, def, hp, gold_pct, xp_pct, drop_pct, shard_id, shard_qty]
  ['pet_baby_rat',       'Baby Rat',       '🐭', 'common',    'Cute little rat (+5 HP, +2% gold)',              0,  0,  5,  2,  0, 0, '',           0],
  ['pet_bear_cub',       'Bear Cub',       '🐻', 'rare',      'Sturdy bear cub (+10 DEF, +20 HP)',              0, 10, 20,  0,  0, 0, '',           0],
  ['pet_bat',            'Pet Bat',        '🦇', 'rare',      'Loyal bat (+5% drop rate, +2 ATK)',              2,  0,  0,  0,  0, 5, '',           0],
  ['pet_spider',         'Pet Spider',     '🕷️', 'rare',      'Tiny spider companion (+8 ATK, +3 DEF)',         8,  3,  0,  0,  0, 0, '',           0],
  ['pet_baby_scorpion',  'Baby Scorpion',  '🦂', 'rare',      'Small but venomous (+8 ATK, +2 DEF)',            8,  2,  0,  0,  0, 0, '',           0],
  ['pet_yeti_cub',       'Yeti Cub',       '🦍', 'epic',      'Fluffy yeti (+15 ATK, +10 DEF, +30 HP)',        15, 10, 30,  0,  0, 0, '',           0],
  ['pet_mini_dragon',    'Mini Dragon',    '🐲', 'legendary', 'Tiny ancient dragon (+30 ATK, +20 DEF, +50 HP)',30, 20, 50,  0,  0, 0, '',           0],
  ['pet_mini_void_dragon','Mini Void Dragon','🌌','legendary', 'Tiny void dragon (+10% all, +20 ATK/DEF)',      20, 20,  0, 10, 10,10, '',           0],
  ['pet_slime',          'Slime Pet',      '🟢', 'rare',      'A cute jellyball companion (+10 HP, +5% drop)',  0,  3, 10,  0,  0, 5, 'slime_shard', 8],
  ['pet_snowman',        'Snowman Pal',    '⛄', 'rare',      'Frosty companion (+8 DEF, +15 HP)',              0,  8, 15,  0,  0, 0, 'snow_ball',   8],
];

const MISSING_DROPS = [
  ['giant_rat',    'pet_baby_rat',         null,           0.020, 1],
  ['forest_bear',  'pet_bear_cub',         null,           0.012, 1],
  ['bat',          'pet_bat',              null,           0.015, 1],
  ['cave_spider',  'pet_spider',           null,           0.012, 1],
  ['scorpion',     'pet_baby_scorpion',    null,           0.015, 1],
  ['yeti',         'pet_yeti_cub',         null,           0.010, 1],
  ['dragon',       'pet_mini_dragon',      null,           0.020, 1],
  ['void_dragon',  'pet_mini_void_dragon', null,           0.030, 1],
  ['slime',        null,                  'slime_shard',   0.400, 1],
  ['snowman',      null,                  'snow_ball',     0.350, 1],
];

const name = 'petrestore';
const aliases = [];
const description = 'Restore pets bị mất sau cleanup (admin only)';

async function execute(msg, args) {
  // Chỉ admin (MANAGE_GUILD)
  if (!msg.member?.permissions?.has('ManageGuild')) {
    return msg.reply('❌ Cần quyền Manage Guild.');
  }

  if (args[0] !== 'confirm') {
    const existing = new Set(db.prepare('SELECT id FROM pets').all().map(r => r.id));
    const toRestore = MISSING_PETS.filter(p => !existing.has(p[0]));
    if (toRestore.length === 0) {
      return msg.reply('✅ Không có pet nào cần restore — tất cả đã có trong DB.');
    }
    return msg.reply(
      `🔧 **Pet Restore** sẽ thêm lại ${toRestore.length} pet bị thiếu:\n` +
      toRestore.map(p => `   • ${p[2]} **${p[1]}** \`${p[0]}\``).join('\n') +
      `\n\nGõ \`!petrestore confirm\` để xác nhận.`
    );
  }

  // Thực hiện restore
  const existing = new Set(db.prepare('SELECT id FROM pets').all().map(r => r.id));
  const existingDrops = new Set(
    db.prepare('SELECT monster_id || "|" || COALESCE(pet_id,"") || "|" || COALESCE(shard_id,"") as key FROM pet_drops').all().map(r => r.key)
  );

  const insPet = db.prepare(`INSERT INTO pets
    (id, name, icon, tier, desc, atk_bonus, def_bonus, hp_bonus, gold_bonus_pct, xp_bonus_pct, drop_bonus_pct, shard_id, shard_qty, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insDrop = db.prepare('INSERT INTO pet_drops (monster_id, pet_id, shard_id, chance, qty) VALUES (?,?,?,?,?)');

  let restoredPets = 0, restoredDrops = 0;

  for (const p of MISSING_PETS) {
    if (!existing.has(p[0])) {
      insPet.run(...p, Date.now());
      restoredPets++;
    }
  }

  for (const d of MISSING_DROPS) {
    const key = `${d[0]}|${d[1] || ''}|${d[2] || ''}`;
    if (!existingDrops.has(key)) {
      insDrop.run(...d);
      restoredDrops++;
    }
  }

  const embed = new EmbedBuilder().setColor(0x2ECC71)
    .setTitle('✅ Pet Restore hoàn tất')
    .setDescription(
      `🐾 Đã thêm lại **${restoredPets}** pets\n` +
      `💀 Đã thêm lại **${restoredDrops}** drop entries\n\n` +
      `Gõ \`!pet collection\` để kiểm tra.`
    );
  return msg.reply({ embeds: [embed] });
}

module.exports = { name, aliases, description, execute };
 
