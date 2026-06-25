// petrestore.js — restore + fix 3 con lỗi còn lại
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');

const MISSING_PETS = [
  ['pet_baby_rat',        'Baby Rat',        '🐭', 'common',    'Cute little rat (+5 HP, +2% gold)',               0,  0,  5,  2,  0,  0, '',            0],
  ['pet_bear_cub',        'Bear Cub',        '🐻', 'rare',      'Sturdy bear cub (+10 DEF, +20 HP)',               0, 10, 20,  0,  0,  0, '',            0],
  ['pet_bat',             'Pet Bat',         '🦇', 'rare',      'Loyal bat (+5% drop rate, +2 ATK)',               2,  0,  0,  0,  0,  5, '',            0],
  ['pet_spider',          'Pet Spider',      '🕷️', 'rare',      'Tiny spider companion (+8 ATK, +3 DEF)',          8,  3,  0,  0,  0,  0, '',            0],
  ['pet_baby_scorpion',   'Baby Scorpion',   '🦂', 'rare',      'Small but venomous (+8 ATK, +2 DEF)',             8,  2,  0,  0,  0,  0, '',            0],
  ['pet_yeti_cub',        'Yeti Cub',        '🦍', 'epic',      'Fluffy yeti (+15 ATK, +10 DEF, +30 HP)',         15, 10, 30,  0,  0,  0, '',            0],
  ['pet_mini_dragon',     'Mini Dragon',     '🐲', 'legendary', 'Tiny ancient dragon (+30 ATK, +20 DEF, +50 HP)', 30, 20, 50,  0,  0,  0, '',            0],
  ['pet_mini_void_dragon','Mini Void Dragon','🌌', 'legendary', 'Tiny void dragon (+10% all, +20 ATK/DEF)',       20, 20,  0, 10, 10, 10, '',            0],
  ['pet_slime',           'Slime Pet',       '🟢', 'rare',      'A cute jellyball companion (+10 HP, +5% drop)',   0,  3, 10,  0,  0,  5, 'slime_shard', 8],
  ['pet_snowman',         'Snowman Pal',     '⛄', 'rare',      'Frosty companion (+8 DEF, +15 HP)',               0,  8, 15,  0,  0,  0, 'snow_ball',   8],
];

const MISSING_DROPS = [
  ['giant_rat',    'pet_baby_rat',          null,           0.020, 1],
  ['forest_bear',  'pet_bear_cub',          null,           0.012, 1],
  ['bat',          'pet_bat',               null,           0.015, 1],
  ['cave_spider',  'pet_spider',            null,           0.012, 1],
  ['scorpion',     'pet_baby_scorpion',     null,           0.015, 1],
  ['yeti',         'pet_yeti_cub',          null,           0.010, 1],
  ['dragon',       'pet_mini_dragon',       null,           0.020, 1],
  ['void_dragon',  'pet_mini_void_dragon',  null,           0.030, 1],
  ['slime',        null,                    'slime_shard',  0.400, 1],
  ['snowman',      null,                    'snow_ball',    0.350, 1],
];

const name = 'petrestore';
const aliases = [];
const description = 'Restore + fix pets bị lỗi (admin only)';

async function execute(msg, args) {
  if (!msg.member?.permissions?.has('ManageGuild')) {
    return msg.reply('❌ Cần quyền Manage Guild.');
  }

  const sub = args[0];

  // ── %petrestore fix3 ── xóa 2 con thừa, ẩn void_cat
  if (sub === 'fix3') {
    if (args[1] !== 'confirm') {
      return msg.reply(
        `⚠️ **Fix 3 con pet lỗi:**\n` +
        `• 🐺 **Wolf Cub** \`pet_wolf_cub\` — XÓA hoàn toàn\n` +
        `• 🐉 **Dragonling** \`pet_dragonling\` — XÓA hoàn toàn (đã có Mini Dragon)\n` +
        `• 🐈‍⬛ **Void Cat** \`pet_void_cat\` — ẩn (hidden=1, giữ cho event)\n\n` +
        `Gõ \`%petrestore fix3 confirm\` để xác nhận.`
      );
    }

    const fixes = [];

    // Xóa wolf_cub
    db.prepare(`UPDATE players SET active_pet='' WHERE active_pet='pet_wolf_cub'`).run();
    db.prepare(`DELETE FROM player_pets WHERE pet_id='pet_wolf_cub'`).run();
    db.prepare(`DELETE FROM pet_drops WHERE pet_id='pet_wolf_cub'`).run();
    db.prepare(`DELETE FROM pets WHERE id='pet_wolf_cub'`).run();
    fixes.push('🗑️ Đã xóa pet_wolf_cub');

    // Xóa dragonling
    db.prepare(`UPDATE players SET active_pet='' WHERE active_pet='pet_dragonling'`).run();
    db.prepare(`DELETE FROM player_pets WHERE pet_id='pet_dragonling'`).run();
    db.prepare(`DELETE FROM pet_drops WHERE pet_id='pet_dragonling'`).run();
    db.prepare(`DELETE FROM pets WHERE id='pet_dragonling'`).run();
    fixes.push('🗑️ Đã xóa pet_dragonling');

    // Ẩn void_cat
    db.prepare(`UPDATE pets SET hidden=1 WHERE id='pet_void_cat'`).run();
    fixes.push('👻 Đã ẩn pet_void_cat (hidden=1)');

    return msg.reply(`✅ Hoàn tất:\n${fixes.join('\n')}\n\nGõ \`%pet collection\` để kiểm tra.`);
  }

  // ── %petrestore (preview) ──
  const existingPetIds = new Set(db.prepare('SELECT id FROM pets').all().map(r => r.id));
  const toRestorePets = MISSING_PETS.filter(p => !existingPetIds.has(p[0]));

  if (sub !== 'confirm') {
    const lines = [];
    if (toRestorePets.length > 0) {
      lines.push(`🐾 Sẽ thêm lại **${toRestorePets.length}** pet bị thiếu:`);
      lines.push(...toRestorePets.map(p => `   • ${p[2]} **${p[1]}** \`${p[0]}\``));
      lines.push('', `Gõ \`%petrestore confirm\` để xác nhận.`);
    } else {
      lines.push('✅ Không có pet nào cần restore.');
    }
    lines.push('', '💡 Để sửa 3 con lỗi còn lại: `%petrestore fix3`');
    return msg.reply(lines.join('\n'));
  }

  // ── %petrestore confirm ──
  const petCols = db.prepare('PRAGMA table_info(pets)').all().map(c => c.name);
  const hasHidden = petCols.includes('hidden');

  const insPet = hasHidden
    ? db.prepare(`INSERT INTO pets (id,name,icon,tier,desc,atk_bonus,def_bonus,hp_bonus,gold_bonus_pct,xp_bonus_pct,drop_bonus_pct,shard_id,shard_qty,hidden,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`)
    : db.prepare(`INSERT INTO pets (id,name,icon,tier,desc,atk_bonus,def_bonus,hp_bonus,gold_bonus_pct,xp_bonus_pct,drop_bonus_pct,shard_id,shard_qty,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insDrop = db.prepare('INSERT OR IGNORE INTO pet_drops (monster_id,pet_id,shard_id,chance,qty) VALUES (?,?,?,?,?)');

  let restoredPets = 0, restoredDrops = 0;
  for (const p of toRestorePets) { insPet.run(...p, Date.now()); restoredPets++; }
  for (const d of MISSING_DROPS) { if (insDrop.run(...d).changes > 0) restoredDrops++; }

  const embed = new EmbedBuilder().setColor(0x2ECC71)
    .setTitle('✅ Pet Restore hoàn tất')
    .setDescription(
      `🐾 Đã thêm lại **${restoredPets}** pets\n` +
      `💀 Đã thêm lại **${restoredDrops}** drop entries\n\n` +
      `Tiếp theo gõ \`%petrestore fix3\` để xóa 2 con thừa + ẩn void cat.`
    );
  return msg.reply({ embeds: [embed] });
}

module.exports = { name, aliases, description, execute };
