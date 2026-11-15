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
  description: 'Hệ thống pet. !pet, !pet active, !pet combine, !pet evolve, !pet collection',
  async execute(msg, args) {
    const prefix = require('../game/prefix').getPrefix();
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
      if (shards.length === 0) return msg.reply('📭 Bạn chưa có mảnh pet nào. Săn quái theo đúng khí hậu để nhặt nhé!');
      // Một shard có thể dùng cho NHIỀU công thức (ghép pet + nhiều bậc tiến hoá).
      // Trước đây chỉ lấy công thức ghép đầu tiên nên shard tiến hoá trông vô dụng.
      const lines = shards.map(s => {
        const recipes = pets.recipesUsingShard(s.shard_id);
        const head = `**${pets.shardName(s.shard_id)}** \`${s.shard_id}\` × **${s.qty}**`;
        if (recipes.length === 0) return head;
        const usable = recipes.map(r => {
          const ready = s.qty >= r.need;
          const tag = ready ? '✨ **READY**' : `${s.qty}/${r.need}`;
          const kind = r.kind === 'combine' ? 'ghép' : 'tiến hoá';
          const cmd = r.kind === 'combine'
            ? `${prefix}pet combine ${r.pet_id}`
            : `${prefix}pet evolve ${r.from_id} ${r.to_id}`;
          const extra = r.kind === 'evolve' ? ` • ${r.gold}💰 • Lv.${r.min_level}` : '';
          return `${kind}: ${r.icon} ${r.name} — ${tag}${extra} \`${cmd}\``;
        }).join('\n      ');
        return `${head}\n      ${usable}`;
      });
      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle('🧩 Pet Shards')
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setFooter({ text: `Ghép: ${prefix}pet combine <id> • Tiến hoá: ${prefix}pet evolve <id>` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== evolve (tiến hoá bằng mảnh) =====
    if (sub === 'evolve' || sub === 'tienhoa' || sub === 'evo') {
      const fromId = args[1];
      const toId = args[2];

      // Không có tham số → xem pet nào của mình tiến hoá được, và thiếu gì
      if (!fromId) {
        const owned = pets.getPlayerPets(msg.author.id);
        if (owned.length === 0) return msg.reply('📭 Bạn chưa có pet nào để tiến hoá.');
        const me = db.prepare('SELECT level, gold FROM players WHERE user_id=?').get(msg.author.id) || { level: 1, gold: 0 };
        const lines = [];
        for (const p of owned) {
          for (const r of pets.evolutionsFrom(p.id)) {
            const have = pets.getShard(msg.author.id, r.shard_id);
            const miss = [];
            if (have < r.shard_qty) miss.push(`thiếu ${r.shard_qty - have}× ${r.shard_id}`);
            if ((me.gold || 0) < (r.gold_cost || 0)) miss.push(`thiếu ${r.gold_cost - (me.gold || 0)} vàng`);
            if ((me.level || 1) < r.min_level) miss.push(`cần Lv.${r.min_level}`);
            const state = miss.length === 0 ? '✨ **SẴN SÀNG**' : `❌ ${miss.join(', ')}`;
            lines.push(`${r.from_icon || p.icon} ${p.name} → ${r.to_icon} **${r.to_name}**\n` +
              `    🧩 ${have}/${r.shard_qty} \`${r.shard_id}\` • 💰 ${r.gold_cost} • Lv.${r.min_level} — ${state}`);
          }
        }
        if (lines.length === 0) return msg.reply(`💡 Chưa có pet nào của bạn có công thức tiến hoá.\nXem \`${prefix}pet collection\` để biết pet nào tiến hoá được.`);
        const embed = new EmbedBuilder().setColor(0x57F287)
          .setTitle('🧬 Tiến hoá pet')
          .setDescription(lines.join('\n').slice(0, 4000))
          .setFooter({ text: `${prefix}pet evolve <pet_id> [pet_đích] — pet gốc bị tiêu hao` });
        return msg.reply({ embeds: [embed] });
      }

      const r = pets.evolve(msg.author.id, fromId, toId || null);
      if (!r.ok) {
        const reasons = {
          pet_not_found: `❌ Pet \`${fromId}\` không tồn tại.`,
          no_evolution: `❌ **${fromId}** không có công thức tiến hoá nào.`,
          no_recipe: `❌ Không có công thức ${fromId} → ${toId}. Xem \`${prefix}pet evolve\`.`,
          ambiguous: `❌ Pet này tiến hoá được nhiều hướng — chọn đích:\n` +
            (r.choices || []).map(c => `   • \`${prefix}pet evolve ${fromId} ${c.to_pet_id}\` → ${c.to_icon} ${c.to_name}`).join('\n'),
          no_base_pet: `❌ Bạn không sở hữu **${fromId}**.`,
          no_player: `❌ Gõ \`${prefix}start\` trước.`,
          level_too_low: `❌ Cần **Lv.${r.need}** (bạn Lv.${r.have}).`,
          not_enough_shards: `❌ Cần **${r.need}× \`${r.shard_id}\`**, bạn có **${r.have}**.`,
          not_enough_gold: `❌ Cần **${r.need} vàng**, bạn có **${r.have}**.`,
        };
        return msg.reply(reasons[r.reason] || `❌ Không tiến hoá được (${r.reason}).`);
      }
      return msg.reply(
        `🧬 **TIẾN HOÁ!** ${r.from.icon} ${r.from.name} → ${r.to.icon} **${r.to.name}**\n` +
        `💸 −${r.shards}× \`${r.shard_id}\`${r.gold ? ` • −${r.gold} vàng` : ''} • pet gốc đã tiêu hao\n` +
        `💡 Active: \`${prefix}pet active ${r.to.id}\``
      );
    }

    // ===== map (bản đồ khí hậu — pet sống ở đâu) =====
    if (sub === 'map' || sub === 'bando' || sub === 'habitat' || sub === 'khihau') {
      const byHab = pets.petsByHabitat();
      const owned = new Set(pets.getPlayerPets(msg.author.id).map(p => p.id));
      const lines = [];
      for (const [hab, list] of byHab) {
        if (!hab) continue;
        const info = pets.habitatInfo(hab);
        const zone = db.prepare('SELECT min_level FROM zones WHERE id=?').get(hab);
        const visible = list.filter(p => !p.hidden || owned.has(p.id));
        if (visible.length === 0) continue;
        const petsStr = visible.map(p => `${owned.has(p.id) ? '✅' : '·'} ${p.icon} ${p.name}`).join('  ');
        lines.push(`${info.emoji} **${info.label}**${zone ? ` (Lv.${zone.min_level}+)` : ''}\n    ${petsStr}`);
      }
      const embed = new EmbedBuilder().setColor(0x3498DB)
        .setTitle('🗺️ Pet sống theo khí hậu')
        .setDescription(lines.join('\n').slice(0, 4000))
        .setFooter({ text: `Pet chỉ rơi ở đúng vùng của nó • ${prefix}pet collection xem chi tiết` });
      return msg.reply({ embeds: [embed] });
    }

    // ===== collection (sưu tầm, nhóm theo KHÍ HẬU) =====
    if (sub === 'collection' || sub === 'col' || sub === 'sutam' || sub === 'list') {
      const all = pets.getAllPets();
      const ownedPets = pets.getPlayerPets(msg.author.id);
      const owned = new Set(ownedPets.map(p => p.id));
      const visible = all.filter(p => !p.hidden || owned.has(p.id));
      const me = db.prepare('SELECT level FROM players WHERE user_id=?').get(msg.author.id)?.level || 1;

      // Nguồn của từng pet: drop trực tiếp | ghép mảnh | tiến hoá | event
      const dropRows = db.prepare('SELECT pet_id, monster_id, chance FROM pet_drops WHERE pet_id IS NOT NULL').all();
      const directDrop = {};
      for (const r of dropRows) directDrop[r.pet_id] = r;
      const evoRows = pets.getAllEvolutions();
      const evoFrom = {}; // to_pet_id → [recipe]
      for (const r of evoRows) (evoFrom[r.to_pet_id] = evoFrom[r.to_pet_id] || []).push(r);

      const mobName = (id) => db.prepare('SELECT name FROM monsters WHERE id=?').get(id)?.name || id;
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
      const sourceOf = (p) => {
        const parts = [];
        const d = directDrop[p.id];
        if (d) parts.push(`💀 ${mobName(d.monster_id)} (${(d.chance * 100).toFixed(1)}%)`);
        if (p.shard_id && p.shard_qty > 0) {
          const have = pets.getShard(msg.author.id, p.shard_id);
          const src = db.prepare('SELECT monster_id FROM pet_drops WHERE shard_id=?').get(p.shard_id);
          parts.push(`🧩 ${p.shard_qty}× ${pets.shardName(p.shard_id)} \`${p.shard_id}\` (có ${have})${src ? ` từ ${mobName(src.monster_id)}` : ''}`);
        }
        for (const e of evoFrom[p.id] || []) {
          const have = pets.getShard(msg.author.id, e.shard_id);
          const shardSrc = db.prepare('SELECT monster_id FROM pet_drops WHERE shard_id=?').get(e.shard_id);
          const where = shardSrc ? ` từ ${mobName(shardSrc.monster_id)}` : '';
          parts.push(`🧬 từ ${e.from_icon || ''} ${e.from_name} — ${e.shard_qty}× ${pets.shardName(e.shard_id)}\`${e.shard_id}\`${where} (có ${have}), ${e.gold_cost}💰, Lv.${e.min_level}`);
        }
        if (p.hidden) parts.push('🕵️ hidden');
        return parts.length ? parts.join(' • ') : '🎁 event/admin';
      };

      // Chia field ≤1024 ký tự (Discord) mà không cắt giữa dòng.
      const chunk = (lines, max = 1000) => {
        const out = []; let cur = '';
        for (const ln of lines) {
          if (cur && cur.length + ln.length + 1 > max) { out.push(cur); cur = ln; }
          else cur = cur ? `${cur}\n${ln}` : ln;
        }
        if (cur) out.push(cur);
        return out;
      };

      const embed = new EmbedBuilder().setColor(0x9B59B6)
        .setTitle(`🐾 Pet Collection — ${owned.size}/${visible.length} unlocked`);
      const t = (tierKey) => tierInfo(tierKey);

      // Nhóm theo khí hậu — "nó sống ở đâu" là thông tin quyết định đi săn ở đâu.
      const byHab = new Map();
      for (const p of visible) {
        const key = p.habitat || '';
        if (!byHab.has(key)) byHab.set(key, []);
        byHab.get(key).push(p);
      }
      // Dựng field theo khí hậu. Embed của Discord có trần 6000 ký tự nên nếu
      // hiện lore của tất cả pet đang sở hữu mà vượt trần, dựng lại KHÔNG lore
      // (đo được 6971 ký tự khi sở hữu cả bộ 28 pet).
      const makeFields = (showLore) => {
        const fields = [];
        for (const [hab, list] of byHab) {
          const info = hab ? pets.habitatInfo(hab) : { emoji: '❔', label: 'Không rõ vùng' };
          const lines = list.map(p => {
            const mark = owned.has(p.id) ? '✅' : '❌';
            const evoOut = pets.evolutionsFrom(p.id).map(r =>
              ` → ${r.to_icon} ${r.to_name}${me < r.min_level ? ` (Lv.${r.min_level})` : ''}`).join(',');
            const lore = showLore && owned.has(p.id) ? `\n    📖 *${p.desc || ''}*` : '';
            return `${mark} ${t(p.tier).emoji} ${p.icon} **${p.name}** \`${p.id}\`\n    *${buffOf(p)}*${evoOut ? `\n    🧬${evoOut}` : ''}\n    ${sourceOf(p)}${lore}`;
          });
          for (const [i, val] of chunk(lines).entries()) {
            fields.push({ name: `${info.emoji} ${info.label}${i > 0 ? ` (${i + 1})` : ''}`, value: val });
          }
        }
        return fields;
      };
      const embedSize = (fields) => (embed.data.title || '').length +
        fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
      let fields = makeFields(true);
      if (embedSize(fields) > 5900) fields = makeFields(false);
      embed.addFields(...fields);

      const hiddenCount = all.filter(p => p.hidden && !owned.has(p.id)).length;
      embed.setFooter({
        text: `${prefix}pet combine <id> ghép • ${prefix}pet evolve tiến hoá • ${prefix}pet map` +
          (hiddenCount > 0 ? ` • 🕵️ ${hiddenCount} pet ẩn` : '') + ' • 📖 lore hiện khi bạn sở hữu',
      });
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
      const hab = p.habitat ? ` ${pets.habitatInfo(p.habitat).emoji}` : '';
      // Lore của pet mình đang giữ — hiện khi danh sách còn ngắn, tránh vượt
      // giới hạn 6000 ký tự của embed.
      const lore = owned.length <= 12 && p.desc ? `\n     📖 *${p.desc}*` : '';
      return `${mark} ${t.emoji} ${p.icon} **${p.name}**${qty} \`${p.id}\`${hab}\n     ${buffStr}${lore}`;
    });

    const embed = new EmbedBuilder().setColor(0x9B59B6)
      .setTitle(`🐾 Pet của ${p.name}`)
      .setDescription(
        (active ? `**Đang active:** ${active.icon} ${active.name}\n\n` : '*(Chưa active pet nào)*\n\n') +
        lines.join('\n\n')
      )
      .setFooter({ text: `${prefix}pet active <id> để active • ${prefix}pet evolve tiến hoá • ${prefix}pet collection xem tất cả` });
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
        `\`${prefix}pet admin habitat <pet_id> <zone|none>\` — đổi khí hậu (zone pet sống)`,
        `\`${prefix}pet admin evolve <from> <to> shard=<id> qty=6 gold=200 level=10\` — tạo/sửa công thức tiến hoá`,
        `\`${prefix}pet admin evolves [pet_id]\` — xem công thức tiến hoá`,
        `\`${prefix}pet admin unevolve <from> <to>\` — xoá công thức`,
        `\`${prefix}pet admin undrop <mob_id> <pet_id|shard_id>\``,
        `\`${prefix}pet admin resetdrops\` — RESET toàn bộ drop về default (⚠️ xóa hết drop custom)`,
        `\`${prefix}pet admin cleanup\` — xóa pet thừa không có trong code seed mới (⚠️ kèm xóa player_pets)`,
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
      habitat: kv.habitat || '',
      hidden: isHidden,
      created_by: msg.author.id,
    });
    const hiddenTag = isHidden ? ' 🕵️ **HIDDEN**' : '';
    const habTag = pet.habitat && pets.HABITATS[pet.habitat]
      ? ` • ${pets.habitatInfo(pet.habitat).emoji} ${pets.habitatInfo(pet.habitat).label}` : '';
    return msg.reply(`✅ Đã tạo pet **${pet.icon} ${pet.name}** (\`${pet.id}\`)${hiddenTag}${habTag}.`);
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
        `Default gồm ${pets.SEED_DROPS.length} dòng (pet trực tiếp + mảnh ghép + mảnh tiến hoá).\n\n` +
        `Để xác nhận: \`${prefix}pet admin resetdrops confirm\``
      );
    }
    const oldCount = pets.getAllPetDrops().length;
    const newCount = pets.resetDropsToDefault();
    return msg.reply(`✅ Đã reset drop table: ${oldCount} → ${newCount} entries (default).`);
  }

  if (sub === 'cleanup') {
    // Preview trước — auto-detect pet không có nguồn hợp lệ
    const allPets = pets.getAllPets();
    const petsWithDrop = new Set(
      db.prepare('SELECT DISTINCT pet_id FROM pet_drops WHERE pet_id IS NOT NULL').all().map(r => r.pet_id)
    );
    const toDelete = allPets.filter(p => {
      const hasDirectDrop = petsWithDrop.has(p.id);
      const hasShardRecipe = p.shard_id && p.shard_qty > 0;
      return !hasDirectDrop && !hasShardRecipe;
    });

    if (toDelete.length === 0) {
      return msg.reply('✅ Đã sạch — không có pet thừa nào (mọi pet đều có mob drop hoặc shard recipe).');
    }

    if (args[1] !== 'confirm') {
      return msg.reply(
        `⚠️ **Cleanup pets** sẽ XÓA ${toDelete.length} pet không có mob drop VÀ không có shard recipe:\n` +
        toDelete.map(p => `   • ${p.icon} ${p.name} \`${p.id}\``).join('\n') +
        `\n\n⚠️ User đang sở hữu pet này sẽ mất vĩnh viễn!\n` +
        `Để xác nhận: \`${prefix}pet admin cleanup confirm\``
      );
    }

    const result = pets.cleanupExtraPets();
    return msg.reply(
      `🗑️ Đã cleanup ${result.deleted} pets, giữ lại ${result.kept}.\n` +
      `Pet bị xóa: ${result.deletedIds.join(', ')}`
    );
  }

  if (sub === 'habitat') {
    const petId = args[1]; const hab = (args[2] || '').toLowerCase();
    if (!petId || !hab) {
      return msg.reply(`❌ Cú pháp: \`${prefix}pet admin habitat <pet_id> <zone|none>\`\n` +
        `Zone hợp lệ: ${Object.keys(pets.HABITATS).join(', ')}`);
    }
    const r = pets.setHabitat(petId, hab === 'none' ? '' : hab);
    if (!r.ok) {
      return msg.reply(r.reason === 'unknown_habitat'
        ? `❌ Khí hậu \`${hab}\` không có. Hợp lệ: ${Object.keys(pets.HABITATS).join(', ')}`
        : `❌ Pet \`${petId}\` không tồn tại.`);
    }
    const info = r.pet.habitat ? pets.habitatInfo(r.pet.habitat) : null;
    return msg.reply(info
      ? `✅ **${r.pet.name}** sống ở ${info.emoji} ${info.label}.`
      : `✅ Đã bỏ khí hậu của **${r.pet.name}** (rơi ở mọi zone).`);
  }

  if (sub === 'evolve') {
    const fromId = args[1]; const toId = args[2];
    if (!fromId || !toId) {
      return msg.reply(`❌ Cú pháp: \`${prefix}pet admin evolve <from> <to> shard=<id> qty=6 gold=200 level=10\``);
    }
    const tokens = getRestTokens(msg, prefix, 4); // bỏ "pet admin evolve from to"
    const kv = parseKV(tokens);
    if (!kv.shard) return msg.reply('❌ Cần `shard=<shard_id>` (mảnh tiêu hao khi tiến hoá).');
    const intOr = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };
    const r = pets.createEvolution({
      from_pet_id: fromId, to_pet_id: toId,
      shard_id: kv.shard,
      shard_qty: intOr(kv.qty, 1),
      gold_cost: intOr(kv.gold, 0),
      min_level: intOr(kv.level, 1),
      created_by: msg.author.id,
    });
    if (!r.ok) {
      const why = {
        from_not_found: `❌ Pet gốc \`${fromId}\` không tồn tại.`,
        to_not_found: `❌ Pet đích \`${toId}\` không tồn tại.`,
        same_pet: '❌ Pet gốc và pet đích phải khác nhau.',
        no_shard: '❌ Thiếu shard.',
        bad_qty: '❌ `qty` phải ≥ 1.',
        bad_gold: '❌ `gold` phải ≥ 0.',
        bad_level: '❌ `level` phải ≥ 1.',
        habitat_mismatch: `❌ Sai khí hậu: \`${r.from_habitat}\` → \`${r.to_habitat}\`. Pet chỉ tiến hoá trong cùng vùng.`,
        cycle: '❌ Tạo vòng lặp tiến hoá (A→B mà B đã đi ngược về A).',
      };
      return msg.reply(why[r.reason] || `❌ ${r.reason}`);
    }
    const rc = r.recipe;
    return msg.reply(`✅ Công thức: **${fromId}** → **${toId}** • ${rc.shard_qty}× \`${rc.shard_id}\` • ${rc.gold_cost} vàng • Lv.${rc.min_level}.`);
  }

  if (sub === 'evolves') {
    const filter = args[1];
    const all = pets.getAllEvolutions().filter(e => !filter || e.from_pet_id === filter || e.to_pet_id === filter);
    if (all.length === 0) return msg.reply('💡 Không có công thức tiến hoá nào khớp.');
    const groups = {};
    for (const e of all) (groups[e.from_pet_id] = groups[e.from_pet_id] || []).push(e);
    const lines = [];
    for (const [from, list] of Object.entries(groups)) {
      const f = list[0];
      lines.push(`${f.from_icon || ''} **${f.from_name || from}** \`${from}\``);
      for (const e of list) {
        lines.push(`   → ${e.to_icon} ${e.to_name || e.to_pet_id} \`${e.to_pet_id}\` — ${e.shard_qty}× \`${e.shard_id}\`, ${e.gold_cost}💰, Lv.${e.min_level}`);
      }
    }
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
      .setTitle(`🧬 Công thức tiến hoá (${all.length})`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: `${prefix}pet admin evolve ... để thêm • ${prefix}pet admin unevolve <from> <to> để xoá` })] });
  }

  if (sub === 'unevolve') {
    const fromId = args[1]; const toId = args[2];
    if (!fromId || !toId) return msg.reply(`❌ Cú pháp: \`${prefix}pet admin unevolve <from> <to>\``);
    const ok = pets.deleteEvolution(fromId, toId);
    return msg.reply(ok ? `🗑️ Đã xoá công thức ${fromId} → ${toId}.` : '❌ Không có công thức này.');
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
