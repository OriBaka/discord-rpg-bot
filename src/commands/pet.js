const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer } = require('../game/player');
const pets = require('../game/pets');
const { tierInfo } = require('../game/tiers');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

module.exports = {
  name: 'pet',
  aliases: ['pets', 'thu'],
  description: 'Hệ thống pet. !pet, !pet active, !pet combine, !pet collection',
  async execute(msg, args) {
    const prefix = process.env.PREFIX || '!';
    const p = getPlayer(msg.author.id);
    if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

    const sub = (args[0] || '').toLowerCase();

    // ===== Admin =====
    if (sub === 'admin') {
      if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
      return handleAdmin(msg, args.slice(1), prefix);
    }

    // ===== active <pet_id> | none =====
    if (sub === 'active' || sub === 'use' || sub === 'equip') {
      const petId = args[1];
      if (!petId) {
        const cur = pets.getActivePet(msg.author.id);
        return msg.reply(cur ? `🐾 Pet active hiện tại: ${cur.icon} **${cur.name}**` : '💡 Chưa active pet nào.');
      }
      if (petId === 'none' || petId === 'off') {
        pets.setActivePet(msg.author.id, '');
        return msg.reply('✅ Đã bỏ pet active.');
      }
      const pet = pets.getPet(petId);
      if (!pet) return msg.reply(`❌ Pet \`${petId}\` không tồn tại.`);
      if (!pets.hasPet(msg.author.id, petId)) return msg.reply(`❌ Bạn chưa sở hữu pet này. Gõ \`${prefix}pet\` xem pet của mình.`);
      pets.setActivePet(msg.author.id, petId);
      return msg.reply(`✅ Đã active **${pet.icon} ${pet.name}**! Buff sẽ áp dụng khi hunt.`);
    }

    // ===== combine <pet_id> =====
    if (sub === 'combine' || sub === 'craft' || sub === 'ghep') {
      const petId = args[1];
      if (!petId) return msg.reply(`❌ Cú pháp: \`${prefix}pet combine <pet_id>\`. Xem shard: \`${prefix}pet shards\``);
      const pet = pets.getPet(petId);
      if (!pet) return msg.reply(`❌ Pet \`${petId}\` không tồn tại.`);
      const ctx = { client: msg.client, guildId: msg.guild?.id };
      const r = pets.combineShards(msg.author.id, petId, ctx);
      if (!r.ok) {
        const reasons = {
          pet_not_found: '❌ Pet không tồn tại.',
          no_shard_recipe: `❌ Pet này không thể ghép từ shard (chỉ drop trực tiếp).`,
          not_enough_shards: `❌ Cần **${r.need}** mảnh \`${r.shard_id}\`, bạn có **${r.have}**.`,
        };
        return msg.reply(reasons[r.reason] || `❌ ${r.reason}`);
      }
      return msg.reply(`🎉 Đã ghép thành công **${pet.icon} ${pet.name}**!\n💡 Active: \`${prefix}pet active ${pet.id}\``);
    }

    // ===== shards (xem shard đang có) =====
    if (sub === 'shards' || sub === 'shard' || sub === 'manh') {
      const shards = pets.getAllShards(msg.author.id);
      if (shards.length === 0) return msg.reply('📭 Bạn chưa có mảnh pet nào. Săn quái để nhặt nhé!');
      // Tìm pet nào cần shard này
      const lines = shards.map(s => {
        const targetPet = pets.getAllPets().find(p => p.shard_id === s.shard_id);
        if (targetPet) {
          const progress = `${s.qty}/${targetPet.shard_qty}`;
          const ready = s.qty >= targetPet.shard_qty ? ' ✨ **READY** — `' + prefix + 'pet combine ' + targetPet.id + '`' : '';
          return `\`${s.shard_id}\` × **${s.qty}** → ${targetPet.icon} ${targetPet.name} (${progress})${ready}`;
        }
        return `\`${s.shard_id}\` × **${s.qty}**`;
      });
      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle('🧩 Pet Shards')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Ghép: ${prefix}pet combine <pet_id>` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== collection (xem tất cả pet có trong game + đã sưu tầm chưa) =====
    if (sub === 'collection' || sub === 'col' || sub === 'sutam' || sub === 'list') {
      const all = pets.getAllPets();
      const ownedPets = pets.getPlayerPets(msg.author.id);
      const owned = new Set(ownedPets.map(p => p.id));

      // Ẩn pet "hidden" nếu chưa sở hữu
      const visible = all.filter(p => !p.hidden || owned.has(p.id));

      // Group theo nguồn gốc
      const groups = { direct: [], shard: [], special: [] };
      // Map: pet_id → mob_id drop trực tiếp
      const directDropMap = {};
      const dropRows = db.prepare('SELECT pet_id, monster_id, chance FROM pet_drops WHERE pet_id IS NOT NULL').all();
      for (const r of dropRows) directDropMap[r.pet_id] = { mob: r.monster_id, chance: r.chance };

      for (const p of visible) {
        if (p.shard_id && p.shard_qty > 0) groups.shard.push(p);
        else if (directDropMap[p.id])      groups.direct.push(p);
        else                                groups.special.push(p);
      }

      const buffOf = (p) => {
        const b = [];
        if (p.atk_bonus) b.push(`+${p.atk_bonus} ATK`);
        if (p.def_bonus) b.push(`+${p.def_bonus} DEF`);
        if (p.hp_bonus)  b.push(`+${p.hp_bonus} HP`);
        if (p.gold_bonus_pct) b.push(`+${p.gold_bonus_pct}% gold`);
        if (p.xp_bonus_pct)   b.push(`+${p.xp_bonus_pct}% XP`);
        if (p.drop_bonus_pct) b.push(`+${p.drop_bonus_pct}% drop`);
        return b.length ? b.join(', ') : 'cosmetic';
      };

      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(`🐾 Pet Collection — ${owned.size}/${visible.length} unlocked`);

      // Direct drops
      if (groups.direct.length > 0) {
        const lines = groups.direct.map(p => {
          const t = tierInfo(p.tier);
          const mark = owned.has(p.id) ? '✅' : '❌';
          const src = directDropMap[p.id];
          const mobName = src ? db.prepare('SELECT name FROM monsters WHERE id=?').get(src.mob)?.name || src.mob : '?';
          return `${mark} ${t.emoji} ${p.icon} **${p.name}** \`${p.id}\`\n    *${buffOf(p)}*\n    💀 Drop từ: ${mobName} (${(src.chance*100).toFixed(1)}%)`;
        });
        embed.addFields({ name: '🎯 Direct Drop (săn quái)', value: lines.join('\n\n').slice(0, 1024) });
      }

      // Shard craft
      if (groups.shard.length > 0) {
        const lines = groups.shard.map(p => {
          const t = tierInfo(p.tier);
          const mark = owned.has(p.id) ? '✅' : '❌';
          const haveShard = pets.getShard(msg.author.id, p.shard_id);
          const ready = haveShard >= p.shard_qty ? ' ✨ **ĐỦ NGUYÊN LIỆU!**' : '';
          // Tìm mob drop shard
          const shardSrc = db.prepare('SELECT monster_id, chance FROM pet_drops WHERE shard_id=?').get(p.shard_id);
          const mobName = shardSrc ? db.prepare('SELECT name FROM monsters WHERE id=?').get(shardSrc.monster_id)?.name : '?';
          return `${mark} ${t.emoji} ${p.icon} **${p.name}** \`${p.id}\`\n    *${buffOf(p)}*\n    🧩 Cần **${p.shard_qty}× ${p.shard_id}** (bạn có ${haveShard})${ready}\n    💀 Shard drop từ: ${mobName}`;
        });
        embed.addFields({ name: '🧩 Shard Craft (ghép mảnh)', value: lines.join('\n\n').slice(0, 1024) });
      }

      // Special (visible thì hiện — gồm reserve và hidden đã owned)
      if (groups.special.length > 0) {
        const lines = groups.special.map(p => {
          const t = tierInfo(p.tier);
          const mark = owned.has(p.id) ? '✅' : '❌';
          const tag = p.hidden ? ' 🕵️ *Hidden*' : ' 🎁 *Special/Event*';
          return `${mark} ${t.emoji} ${p.icon} **${p.name}** \`${p.id}\`${tag}\n    *${buffOf(p)}*`;
        });
        embed.addFields({ name: '✨ Special / Event', value: lines.join('\n\n').slice(0, 1024) });
      }

      const hiddenCount = all.filter(p => p.hidden && !owned.has(p.id)).length;
      const footer = `${prefix}pet combine <id> ghép • ${prefix}pet shards xem mảnh` +
                     (hiddenCount > 0 ? ` • 🕵️ ${hiddenCount} pet ẩn chưa tìm thấy` : '');
      embed.setFooter({ text: footer });
      return msg.reply({ embeds: [embed] });
    }

    // ===== Default: xem pet của mình =====
    const owned = pets.getPlayerPets(msg.author.id);
    const active = pets.getActivePet(msg.author.id);

    if (owned.length === 0) {
      return msg.reply(
        `🐾 Bạn chưa có pet nào!\n` +
        `💡 Săn quái có thể drop pet hoặc shard. Gõ \`${prefix}pet collection\` xem tất cả pet có thể có.`
      );
    }

    const lines = owned.map(p => {
      const t = tierInfo(p.tier);
      const mark = active && active.id === p.id ? '⭐' : '  ';
      const buffs = [];
      if (p.atk_bonus) buffs.push(`+${p.atk_bonus} ATK`);
      if (p.def_bonus) buffs.push(`+${p.def_bonus} DEF`);
      if (p.hp_bonus)  buffs.push(`+${p.hp_bonus} HP`);
      if (p.gold_bonus_pct) buffs.push(`+${p.gold_bonus_pct}% gold`);
      if (p.xp_bonus_pct)   buffs.push(`+${p.xp_bonus_pct}% XP`);
      if (p.drop_bonus_pct) buffs.push(`+${p.drop_bonus_pct}% drop`);
      const buffStr = buffs.length ? `*${buffs.join(', ')}*` : '*cosmetic*';
      const qty = p.qty > 1 ? ` ×${p.qty}` : '';
      return `${mark} ${t.emoji} ${p.icon} **${p.name}**${qty} \`${p.id}\`\n     ${buffStr}`;
    });

    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`🐾 Pet của ${p.name}`)
      .setDescription(
        (active ? `**Đang active:** ${active.icon} ${active.name}\n\n` : '*(Chưa active pet nào)*\n\n') +
        lines.join('\n\n')
      )
      .setFooter({ text: `${prefix}pet active <id> để active • ${prefix}pet collection xem tất cả` });
    // Hiện thumbnail của pet đang active (nếu có image_url)
    if (active?.image_url) embed.setThumbnail(active.image_url);
    return msg.reply({ embeds: [embed] });
  },
};

// ===== Admin =====
async function handleAdmin(msg, args, prefix) {
  const sub = (args[0] || '').toLowerCase();

  if (!sub || sub === 'help') {
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🛠️ Pet Admin')
      .setDescription([
        `\`${prefix}pet admin list\` — xem tất cả pet (id + buff)`,
        `\`${prefix}pet admin create <id> name="..." icon="🐾" tier=epic atk=10 def=5 hp=20 gold=10 xp=5 drop=5 shard=shard_xxx shard_qty=10 desc="..." hidden=true\``,
        `\`${prefix}pet admin delete <id>\``,
        `\`${prefix}pet admin give @user <pet_id> [qty]\` — tặng pet`,
        `\`${prefix}pet admin giveshard @user <shard_id> [qty]\` — tặng shard`,
        `\`${prefix}pet admin drops [mob_id]\` — xem toàn bộ drop table (hoặc 1 mob)`,
        `\`${prefix}pet admin drop <mob_id> pet=<pet_id> chance=0.05 [qty=1]\` — drop pet trực tiếp`,
        `\`${prefix}pet admin drop <mob_id> shard=<shard_id> chance=0.10 [qty=1]\` — drop shard`,
        `\`${prefix}pet admin undrop <mob_id> <pet_id|shard_id>\``,
        `\`${prefix}pet admin resetdrops\` — RESET toàn bộ drop về default (⚠️ xóa hết drop custom)`,
        '',
        '💡 Field gold/xp/drop là % (vd: gold=10 = +10% gold)',
      ].join('\n'))] });
  }

  if (sub === 'list') {
    const all = pets.getAllPets();
    const groups = {};
    for (const p of all) (groups[p.tier] = groups[p.tier] || []).push(p);
    const embed = new EmbedBuilder().setColor(0xED4245).setTitle(`🐾 All Pets (${all.length})`);
    for (const [tier, arr] of Object.entries(groups)) {
      const lines = arr.map(p => {
        const buffs = [];
        if (p.atk_bonus) buffs.push(`A${p.atk_bonus}`);
        if (p.def_bonus) buffs.push(`D${p.def_bonus}`);
        if (p.hp_bonus)  buffs.push(`H${p.hp_bonus}`);
        if (p.gold_bonus_pct) buffs.push(`G${p.gold_bonus_pct}%`);
        if (p.xp_bonus_pct)   buffs.push(`X${p.xp_bonus_pct}%`);
        if (p.drop_bonus_pct) buffs.push(`D${p.drop_bonus_pct}%`);
        const shard = p.shard_id ? ` shard:${p.shard_id}×${p.shard_qty}` : '';
        return `\`${p.id}\` ${p.icon} ${p.name} [${buffs.join(',') || 'cosmetic'}]${shard}`;
      });
      embed.addFields({ name: `📊 ${tier}`, value: lines.join('\n').slice(0, 1024) });
    }
    return msg.reply({ embeds: [embed] });
  }

  if (sub === 'delete' || sub === 'del') {
    const id = args[1];
    if (!id) return msg.reply('❌ Thiếu id.');
    const ok = pets.deletePet(id);
    return msg.reply(ok ? `🗑️ Đã xoá pet \`${id}\`` : '❌ Pet không tồn tại.');
  }

  if (sub === 'create' || sub === 'new') {
    const tokens = getRestTokens(msg, prefix, 3);
    const id = tokens[0];
    if (!id) return msg.reply('❌ Thiếu id.');
    if (pets.getPet(id)) return msg.reply('❌ Id đã tồn tại.');
    const kv = parseKV(tokens.slice(1));
    if (!kv.name) return msg.reply('❌ Cần `name="..."`');
    const intOr = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };
    const isHidden = kv.hidden === 'true' || kv.hidden === '1' || kv.hidden === 'yes';
    const pet = pets.createPet({
      id, name: kv.name, icon: kv.icon || '🐾', tier: kv.tier || 'common',
      desc: kv.desc || '',
      atk_bonus: intOr(kv.atk, 0),
      def_bonus: intOr(kv.def, 0),
      hp_bonus:  intOr(kv.hp, 0),
      gold_bonus_pct: intOr(kv.gold, 0),
      xp_bonus_pct:   intOr(kv.xp, 0),
      drop_bonus_pct: intOr(kv.drop, 0),
      shard_id: kv.shard || '', shard_qty: intOr(kv.shard_qty, 0),
      hidden: isHidden,
      created_by: msg.author.id,
    });
    const hiddenTag = isHidden ? ' 🕵️ **HIDDEN**' : '';
    return msg.reply(`✅ Đã tạo pet **${pet.icon} ${pet.name}** (\`${pet.id}\`)${hiddenTag}.`);
  }

  if (sub === 'give') {
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Cần mention user.');
    const petId = args[2]; const qty = parseInt(args[3]) || 1;
    if (!petId || !pets.getPet(petId)) return msg.reply('❌ Pet id sai.');
    const ctx = { client: msg.client, guildId: msg.guild?.id };
    pets.addPet(target.id, petId, qty, ctx);
    return msg.reply(`✅ Tặng ${qty} **${pets.getPet(petId).name}** cho ${target.username}.`);
  }

  if (sub === 'giveshard') {
    const target = msg.mentions.users.first();
    if (!target) return msg.reply('❌ Cần mention user.');
    const shardId = args[2]; const qty = parseInt(args[3]) || 1;
    if (!shardId) return msg.reply('❌ Thiếu shard_id.');
    pets.addShard(target.id, shardId, qty);
    return msg.reply(`✅ Tặng ${qty} mảnh \`${shardId}\` cho ${target.username}.`);
  }

  if (sub === 'drops' || sub === 'droplist') {
    const filterMob = args[1];
    const all = pets.getAllPetDrops();
    const filtered = filterMob ? all.filter(d => d.monster_id === filterMob) : all;
    if (filtered.length === 0) return msg.reply(filterMob ? `💡 Mob \`${filterMob}\` không có drop.` : '💡 Không có drop nào.');

    // Group theo mob
    const groups = {};
    for (const d of filtered) {
      (groups[d.monster_id] = groups[d.monster_id] || []).push(d);
    }
    const lines = [];
    for (const [mobId, list] of Object.entries(groups)) {
      const mobName = list[0].mob_name || mobId;
      lines.push(`**${mobName}** \`${mobId}\``);
      for (const d of list) {
        const what = d.pet_id ? `🐾 \`${d.pet_id}\`` : `🧩 \`${d.shard_id}\``;
        lines.push(`   ${what} × ${d.qty} @ ${(d.chance*100).toFixed(1)}%`);
      }
    }
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
      .setTitle(`🐾 Pet/Shard Drops (${filtered.length})`)
      .setDescription(lines.join('\n').slice(0, 4000))] });
  }

  if (sub === 'resetdrops') {
    if (args[1] !== 'confirm') {
      return msg.reply(
        `⚠️ **Reset drops** sẽ XÓA TOÀN BỘ drop hiện tại (kể cả custom) và set lại default.\n` +
        `Default gồm 10 direct + 2 shard cho mob tương ứng.\n\n` +
        `Để xác nhận: \`${prefix}pet admin resetdrops confirm\``
      );
    }
    const oldCount = pets.getAllPetDrops().length;
    const newCount = pets.resetDropsToDefault();
    return msg.reply(`✅ Đã reset drop table: ${oldCount} → ${newCount} entries (default).`);
  }

  if (sub === 'drop') {
    const mobId = args[1];
    if (!mobId) return msg.reply(`❌ Cú pháp: \`${prefix}pet admin drop <mob_id> pet=<id> chance=0.05\``);
    const tokens = getRestTokens(msg, prefix, 4); // bỏ "pet admin drop mob_id"
    const kv = parseKV(tokens);
    if (!kv.pet && !kv.shard) return msg.reply('❌ Cần `pet=<id>` hoặc `shard=<id>`.');
    const chance = parseFloat(kv.chance);
    if (isNaN(chance) || chance < 0 || chance > 1) return msg.reply('❌ `chance` phải 0-1 (vd 0.05).');
    const qty = parseInt(kv.qty) || 1;
    try {
      pets.addPetDrop(mobId, { pet_id: kv.pet || null, shard_id: kv.shard || null, chance, qty });
      const what = kv.pet ? `pet **${kv.pet}**` : `shard **${kv.shard}**`;
      return msg.reply(`✅ Đã set drop ${what} từ \`${mobId}\` (${Math.round(chance*100)}% × ${qty}).`);
    } catch (err) {
      return msg.reply(`❌ ${err.message}`);
    }
  }

  if (sub === 'undrop') {
    const mobId = args[1]; const id = args[2];
    if (!mobId || !id) return msg.reply(`❌ Cú pháp: \`${prefix}pet admin undrop <mob_id> <pet_id|shard_id>\``);
    // Thử cả pet và shard
    let ok = pets.removePetDrop(mobId, id, null);
    if (!ok) ok = pets.removePetDrop(mobId, null, id);
    return msg.reply(ok ? `🗑️ Đã xoá drop.` : '❌ Không có drop này.');
  }

  return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}pet admin help\``);
}
