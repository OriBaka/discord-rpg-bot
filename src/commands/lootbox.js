// Admin quản lý lootbox (hộp quà) — viết lại cho dễ dùng.
//
// Vì sao viết lại: bản cũ bắt admin phải biết 2 lệnh khác nhau mới tạo được một
// hộp (tạo item type=lootbox bằng `%item create` rồi mới `%lootbox add`), và
// cú pháp `add` đổi nghĩa theo type — với gold/xp thì tham số bị "shift" một ô
// (`add box gold 100 500 30` = vàng 100-500, weight 30) trong khi item/pet lại
// là `add box item <id> 1 3 50`. Không ai nhớ nổi.
//
// Bản mới:
//   • `create` tạo luôn hộp quà (không cần `%item create`).
//   • Mọi type dùng chung một dạng: `add <box> <type> <value> [qty=..] [w=..] [g]`
//     — gold/xp dùng `100-500` làm value.
//   • Entry được ĐÁNH SỐ (#1, #2...) trong `show`, sửa/xoá bằng số đó.
//   • `sim` chạy 1000 lần và in tỉ lệ THẬT so với thiết kế.
//   • Cú pháp cũ vẫn chạy (ai quen tay thì không bị phá).
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const lootbox = require('../game/lootbox');
const { getItem } = require('../game/items');
const pets = require('../game/pets');
const { TIERS } = require('../game/tiers');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

const REWARD_TYPES = ['item', 'pet', 'shard', 'gold', 'xp'];
const TYPE_HINT = {
  item: 'item <item_id>',
  pet: 'pet <pet_id>',
  shard: 'shard <shard_id>',
  gold: 'gold <100|100-500>',
  xp: 'xp <50|50-100>',
};

// "1" → {min:1,max:1}; "1-3" → {min:1,max:3}. Sai định dạng → null.
function parseQtySpec(str) {
  if (str == null || str === '') return null;
  const m = String(str).trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m) return null;
  const a = parseInt(m[1], 10);
  const b = m[2] != null ? parseInt(m[2], 10) : a;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// Thứ tự hiển thị CỐ ĐỊNH: pool (weight cao → thấp) rồi tới guaranteed.
// `show` và `edit/rm #n` dùng chung hàm này nên số # luôn khớp nhau.
function displayEntries(boxId) {
  const rows = lootbox.getLootTable(boxId);
  const pool = rows.filter(e => e.guaranteed === 0)
    .sort((a, b) => b.weight - a.weight || a.reward_type.localeCompare(b.reward_type) || a.reward_id.localeCompare(b.reward_id));
  const guar = rows.filter(e => e.guaranteed === 1)
    .sort((a, b) => a.reward_type.localeCompare(b.reward_type) || a.reward_id.localeCompare(b.reward_id));
  return [...pool, ...guar].map((e, i) => ({ ...e, no: i + 1 }));
}

function labelOf(e) {
  if (e.reward_type === 'item') {
    const it = getItem(e.reward_id);
    return `${it?.name || e.reward_id} \`${e.reward_id}\``;
  }
  if (e.reward_type === 'pet') {
    const p = pets.getPet(e.reward_id);
    return `${p ? `${p.icon} ${p.name}` : e.reward_id} \`${e.reward_id}\``;
  }
  if (e.reward_type === 'shard') {
    return `${pets.shardName(e.reward_id)} \`${e.reward_id}\``;
  }
  if (e.reward_type === 'gold') return 'vàng';
  if (e.reward_type === 'xp') return 'XP';
  return `${e.reward_type} \`${e.reward_id}\``;
}

const EMOJI = { item: '📦', pet: '🐾', shard: '🧩', gold: '💰', xp: '✨' };

function qtyText(e) {
  if (e.reward_type === 'gold' || e.reward_type === 'xp') {
    return e.qty_min === e.qty_max ? `${e.qty_min}` : `${e.qty_min}-${e.qty_max}`;
  }
  return e.qty_min === e.qty_max ? `×${e.qty_min}` : `×${e.qty_min}-${e.qty_max}`;
}

// Chia danh sách dòng thành các field ≤1024 ký tự (Discord).
function chunk(lines, max = 1000) {
  const out = []; let cur = '';
  for (const ln of lines) {
    if (cur && cur.length + ln.length + 1 > max) { out.push(cur); cur = ln; }
    else cur = cur ? `${cur}\n${ln}` : ln;
  }
  if (cur) out.push(cur);
  return out;
}

function boxOrError(lbId) {
  const it = getItem(lbId);
  if (!it) return { error: `❌ Không có item \`${lbId}\`. Tạo hộp trước: \`lootbox create ${lbId} name="..."\`` };
  if (it.type !== 'lootbox') return { error: `❌ \`${lbId}\` là ${it.type}, không phải lootbox.` };
  return { item: it };
}

// ── Đọc tham số cho `add` ────────────────────────────────────────────────────
// Trả về entry hoàn chỉnh, hoặc { error: '...' }.
// Hỗ trợ cả dạng mới (key=value) và dạng cũ (tham số theo vị trí).
function parseAddArgs(type, valueToken, rest) {
  if (!REWARD_TYPES.includes(type)) {
    return { error: `❌ Type phải là: ${REWARD_TYPES.join(' | ')}\n   ${REWARD_TYPES.map(t => `\`${TYPE_HINT[t]}\``).join(' · ')}` };
  }
  if (!valueToken) {
    return { error: `❌ Thiếu giá trị. Ví dụ: \`lootbox add <box> ${TYPE_HINT[type]} w=10\`` };
  }

  const kvTokens = rest.filter(t => t.includes('='));
  const posTokens = rest.filter(t => !t.includes('='));
  const kv = parseKV(kvTokens);

  let rewardId = '';
  let qtyMin = 1;
  let qtyMax = 1;
  let weight = 10;
  let guaranteed = false;

  if (type === 'gold' || type === 'xp') {
    // value: "100" hoặc "100-500"
    const amt = parseQtySpec(valueToken);
    if (!amt) return { error: `❌ \`${type}\` cần số lượng: 100 hoặc 100-500` };
    qtyMin = amt.min; qtyMax = amt.max;
    // Cú pháp cũ: add <box> gold 100 500 30 [1]
    if (posTokens.length >= 2) {
      const legacyMin = parseInt(valueToken, 10);
      const legacyMax = parseInt(posTokens[0], 10);
      const legacyWeight = parseInt(posTokens[1], 10);
      if (!isNaN(legacyMin) && !isNaN(legacyMax)) {
        qtyMin = Math.min(legacyMin, legacyMax);
        qtyMax = Math.max(legacyMin, legacyMax);
        if (!isNaN(legacyWeight)) weight = legacyWeight;
        if (posTokens[2] === '1') guaranteed = true;
      }
    } else if (posTokens.length === 1) {
      const w = parseInt(posTokens[0], 10);
      if (!isNaN(w)) weight = w;
    }
  } else {
    rewardId = valueToken;
    // Cú pháp cũ: add <box> item <id> 1 3 50 [1]
    if (posTokens.length >= 1) {
      const spec = parseQtySpec(posTokens[0]);
      if (spec) { qtyMin = spec.min; qtyMax = spec.max; }
      if (posTokens.length >= 2) {
        const extra = parseQtySpec(posTokens[1]);
        if (extra) { qtyMin = qtyMin || extra.min; qtyMax = extra.max; }
      }
      if (posTokens.length >= 3) {
        const w = parseInt(posTokens[2], 10);
        if (!isNaN(w)) weight = w;
      }
      if (posTokens[3] === '1') guaranteed = true;
    }
  }

  // key=value ghi đè (dạng mới)
  const qtyKv = kv.qty || kv.sl || (kv.max != null ? `${kv.min != null ? kv.min : 1}-${kv.max}` : null);
  if (qtyKv != null) {
    const spec = parseQtySpec(qtyKv);
    if (!spec) return { error: '❌ `qty` phải là số hoặc khoảng: qty=1 | qty=1-3' };
    qtyMin = spec.min; qtyMax = spec.max;
  }
  if (kv.qty_min != null || kv.qty_max != null) {
    const a = parseInt(kv.qty_min, 10);
    const b = parseInt(kv.qty_max, 10);
    if (!isNaN(a)) qtyMin = a;
    if (!isNaN(b)) qtyMax = b;
  }
  const wKv = kv.w || kv.weight;
  if (wKv != null) {
    const w = parseInt(wKv, 10);
    if (isNaN(w)) return { error: '❌ `w` (weight) phải là số nguyên.' };
    weight = w;
  }
  if (kv.g != null || kv.guaranteed != null) {
    const g = String(kv.g != null ? kv.g : kv.guaranteed).toLowerCase();
    guaranteed = ['1', 'true', 'yes', 'g', 'co', 'có'].includes(g);
  }

  // ===== Kiểm tra =====
  if (qtyMin < 1 || qtyMax < 1) return { error: '❌ Số lượng phải ≥ 1.' };
  if (qtyMax < qtyMin) qtyMax = qtyMin;
  if (!guaranteed && weight < 1) return { error: '❌ `w` (weight) phải ≥ 1. Weight 0 = không bao giờ rơi, dùng `rm` để xoá entry.' };
  if (type === 'item' && !getItem(rewardId)) return { error: `❌ Item \`${rewardId}\` không tồn tại.` };
  if (type === 'pet' && !pets.getPet(rewardId)) return { error: `❌ Pet \`${rewardId}\` không tồn tại.` };
  if (type === 'shard' && !pets.SHARD_NAMES[rewardId] && !db.prepare('SELECT 1 FROM pet_drops WHERE shard_id=?').get(rewardId)) {
    // Không chặn: admin được phép tự đặt mảnh mới. Chỉ nhắc.
    return {
      warn: `⚠️ Mảnh \`${rewardId}\` chưa từng xuất hiện trong game (không có drop, không có trong danh sách mảnh). Vẫn thêm, nhưng người chơi sẽ không biết nó dùng để làm gì.`,
      entry: { reward_type: type, reward_id: rewardId, qty_min: qtyMin, qty_max: qtyMax, weight, guaranteed },
    };
  }
  return { entry: { reward_type: type, reward_id: rewardId, qty_min: qtyMin, qty_max: qtyMax, weight, guaranteed } };
}

// Tìm entry theo "#2" hoặc "<type> [value]".
function resolveEntry(entries, selector, value) {
  if (!selector) return { error: '❌ Cần chọn entry: `#2` (xem `show`) hoặc `<type> [id]`.' };
  if (selector.startsWith('#')) {
    const n = parseInt(selector.slice(1), 10);
    const e = entries.find(x => x.no === n);
    if (!e) return { error: `❌ Không có entry #${n} (hộp có ${entries.length} entry).` };
    return { entry: e };
  }
  const type = selector.toLowerCase();
  if (!REWARD_TYPES.includes(type)) return { error: `❌ Type phải là: ${REWARD_TYPES.join(' | ')}` };
  const id = type === 'gold' || type === 'xp' ? '' : (value || '');
  const e = entries.find(x => x.reward_type === type && x.reward_id === id);
  if (!e) return { error: `❌ Hộp không có entry ${type}${id ? ` \`${id}\`` : ''}.` };
  return { entry: e };
}

module.exports = {
  name: 'lootbox',
  aliases: ['lb', 'box'],
  description: 'Admin: tạo & quản lý hộp quà (lootbox)',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
    const prefix = require('../game/prefix').getPrefix();
    const sub = (args[0] || '').toLowerCase();

    // ================= help =================
    if (!sub || sub === 'help' || sub === '?') {
      const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🎁 Lootbox — quản lý hộp quà')
        .setDescription([
          '**3 bước tạo một hộp:**',
          `1. \`${prefix}lootbox create event_box name="Hộp Sự Kiện" tier=epic shop=1500 desc="Hộp quà giới hạn của sự kiện."\``,
          `2. \`${prefix}lootbox add event_box item potion_l qty=1-3 w=50\``,
          `3. \`${prefix}lootbox show event_box\` rồi \`${prefix}lootbox sim event_box\` để xem tỉ lệ thật`,
          '',
          '**Mỗi lần mở** = tất cả entry ⭐ guaranteed + **1 lần bốc ngẫu nhiên** theo `weight`.',
          '`weight` chỉ có nghĩa tương đối; `show` in ra % thật, nên đặt tổng = 100 cho dễ đọc.',
        ].join('\n'))
        .addFields(
          {
            name: '🛠️ Tạo & xem',
            value: [
              `\`${prefix}lootbox create <id> name="..." [tier=epic] [desc="..."] [shop=1500] [img=url]\``,
              `\`${prefix}lootbox list\` — mọi hộp + số entry + nguồn kiếm`,
              `\`${prefix}lootbox show <id>\` — nội dung, đánh số #1..#n, % thật`,
              `\`${prefix}lootbox delete <id> confirm\` — xoá hộp (cả item)`,
            ].join('\n'),
          },
          {
            name: '➕ Thêm phần thưởng',
            value: [
              `\`${prefix}lootbox add <box> item <item_id> [qty=1-3] [w=50] [g]\``,
              `\`${prefix}lootbox add <box> item a,b,c w=30\` — nhiều món một lần`,
              `\`${prefix}lootbox add <box> pet <pet_id> [qty=1] [w=5]\``,
              `\`${prefix}lootbox add <box> shard <shard_id> [qty=1-2] [w=10]\``,
              `\`${prefix}lootbox add <box> gold <100|100-500> [w=30]\``,
              `\`${prefix}lootbox add <box> xp <50|50-100> [w=30]\``,
              '`g` = guaranteed (luôn nhận, có thể đứng một mình), `w` = weight, `qty` nhận cả `2` và `1-3`.',
            ].join('\n'),
          },
          {
            name: '✏️ Sửa & kiểm tra',
            value: [
              `\`${prefix}lootbox edit <box> #2 w=80 qty=1-2 g=1\``,
              `\`${prefix}lootbox rm <box> #2\` — xoá theo số (hoặc \`rm <box> gold\`)`,
              `\`${prefix}lootbox copy <box_nguồn> <box_đích>\` — copy toàn bộ nội dung`,
              `\`${prefix}lootbox sim <box> [số_lần=1000]\` — tỉ lệ thật, không cấp đồ`,
              `\`${prefix}lootbox clear <box> confirm\` — xoá hết entry (giữ hộp)`,
            ].join('\n'),
          },
          {
            name: '📌 Lưu ý',
            value: [
              '• Hộp quà là **item** → phải cho người chơi lấy được (shop / drop / redeem / quest), ' +
                '`list` sẽ cảnh báo hộp không có nguồn.',
              '• Người chơi mở bằng `' + `${prefix}use <box_id> [số_lượng]\`` + '.',
              '• Cú pháp cũ (`add <box> item <id> 1 3 50`) vẫn chạy.',
            ].join('\n'),
          },
        );
      return msg.reply({ embeds: [embed] });
    }

    // ================= list =================
    if (sub === 'list' || sub === 'ls' || sub === 'all') {
      const boxes = lootbox.getAllLootboxes();
      if (boxes.length === 0) {
        return msg.reply(`📭 Chưa có hộp quà nào.\n💡 Tạo: \`${prefix}lootbox create event_box name="Hộp Sự Kiện"\``);
      }
      const lines = boxes.map(b => {
        const src = lootbox.itemSources(b.item.id);
        const state = b.entries.length === 0 ? '⚠️ **TRỐNG**' :
          `${b.pool_count} random + ${b.guaranteed_count} ⭐ · tổng weight ${b.total_weight}`;
        const where = src.length ? `nguồn: ${src.join(', ')}` : '⚠️ **không có nguồn** (người chơi không lấy được)';
        return `${b.item.type === 'lootbox' ? '🎁' : ''} **${b.item.name}** \`${b.item.id}\` [${b.item.tier}]\n   ${state}\n   ${where}`;
      });
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`📦 Hộp quà (${boxes.length})`);
      for (const [i, val] of chunk(lines).entries()) {
        embed.addFields({ name: i === 0 ? 'Danh sách' : `Danh sách (${i + 1})`, value: val });
      }
      embed.setFooter({ text: `${prefix}lootbox show <id> để xem nội dung` });
      return msg.reply({ embeds: [embed] });
    }

    // ================= create =================
    if (sub === 'create' || sub === 'new' || sub === 'addbox') {
      // getRestTokens: cần msg.content để bóc name="..." / desc="..."
      const tokens = getRestTokens(msg, prefix, 3); // bỏ "lootbox create <id>"
      const id = args[1];
      if (!id) {
        return msg.reply(`❌ Cú pháp: \`${prefix}lootbox create <id> name="Tên hộp" [tier=${Object.keys(TIERS).join('|')}] [desc="..."] [price=0] [img=url]\``);
      }
      if (!/^[a-z0-9_]+$/i.test(id)) return msg.reply('❌ `id` chỉ dùng chữ, số và dấu `_` (vd `event_box`).');
      const existing = getItem(id);
      if (existing) {
        return msg.reply(existing.type === 'lootbox'
          ? `💡 Hộp \`${id}\` đã có. Xem: \`${prefix}lootbox show ${id}\``
          : `❌ Item \`${id}\` đã tồn tại (type=${existing.type}). Chọn id khác.`);
      }
      const kv = parseKV(tokens);
      if (!kv.name) return msg.reply(`❌ Thiếu tên: \`${prefix}lootbox create ${id} name="Hộp Sự Kiện"\``);
      const tier = (kv.tier || 'rare').toLowerCase();
      if (!TIERS[tier]) return msg.reply(`❌ \`tier\` phải là: ${Object.keys(TIERS).join(' | ')}`);
      const desc = kv.desc || 'Hộp quà bí ẩn — mở ra để nhận phần thưởng ngẫu nhiên bên trong.';
      const price = parseInt(kv.price, 10) || 0;
      const sell = parseInt(kv.sell, 10) || 0;
      const minLevel = parseInt(kv.level || kv.min_level, 10) || 1;
      const img = kv.img || kv.image_url || '';
      // shop=<giá> → bán luôn trong shop (đỡ phải nhớ lệnh thứ hai)
      const shopPrice = kv.shop != null ? (parseInt(kv.shop, 10) || price) : null;

      db.prepare(`INSERT INTO items (id, name, type, tier, atk, def, heal, price, sell, desc, soulbound, min_level, image_url)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, kv.name, 'lootbox', tier, 0, 0, 0, price, sell, desc, 0, minLevel, img);
      if (shopPrice && shopPrice > 0) {
        db.prepare('INSERT OR REPLACE INTO shop (item_id, price) VALUES (?, ?)').run(id, shopPrice);
      }

      const embed = new EmbedBuilder().setColor(0x57F287).setTitle('✅ Đã tạo hộp quà')
        .setDescription(`🎁 **${kv.name}** \`${id}\` · ${tier}${price ? ` · giá ${price} vàng` : ''}`)
        .addFields({
          name: 'Bước tiếp theo',
          value: [
            `\`${prefix}lootbox add ${id} item potion_l qty=1-3 w=50\``,
            `\`${prefix}lootbox add ${id} gold 100-500 w=30\``,
            `\`${prefix}lootbox show ${id}\``,
            '',
            shopPrice && shopPrice > 0
              ? `✅ Đã bán trong shop với giá **${shopPrice} vàng** — người chơi mua được ngay.`
              : [
                '⚠️ Hộp này **chưa có nguồn kiếm** (người chơi không lấy được). Chọn 1:',
                `• Bán ở shop: \`${prefix}shop add ${id} ${price || 1500}\``,
                `• Rơi từ quái: \`${prefix}mob drop <mob_id> ${id} 0.05 1\``,
                `• Code sự kiện: \`${prefix}redeem addreward <CODE> lootbox ${id} 1\``,
                `\`${prefix}lootbox list\` sẽ nhắc tới khi hộp vẫn chưa có nguồn.`,
              ].join('\n'),
          ].join('\n'),
        });
      return msg.reply({ embeds: [embed] });
    }

    // ================= show =================
    if (sub === 'show' || sub === 'view' || sub === 'info') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox show <id>\``);
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const entries = displayEntries(lbId);
      if (entries.length === 0) {
        return msg.reply(`💡 Hộp **${item.name}** chưa có nội dung.\nThêm: \`${prefix}lootbox add ${lbId} item potion_l qty=1 w=50\``);
      }
      const pool = entries.filter(e => e.guaranteed === 0);
      const guar = entries.filter(e => e.guaranteed === 1);
      const totalWeight = pool.reduce((s, e) => s + e.weight, 0);

      const lines = [];
      if (pool.length > 0) {
        lines.push(`**Bốc ngẫu nhiên** (1 lần/hộp, tổng weight ${totalWeight})`);
        for (const e of pool) {
          const pct = totalWeight > 0 ? (e.weight / totalWeight * 100) : 0;
          lines.push(`\`#${e.no}\` ${EMOJI[e.reward_type]} ${labelOf(e)} ${qtyText(e)} — **${pct.toFixed(1)}%** (w${e.weight})`);
        }
      } else {
        lines.push('_(không có phần thưởng ngẫu nhiên — mở hộp chỉ nhận guaranteed)_');
      }
      if (guar.length > 0) {
        lines.push('');
        lines.push('**⭐ Guaranteed** (luôn nhận mỗi lần mở)');
        for (const e of guar) {
          lines.push(`\`#${e.no}\` ${EMOJI[e.reward_type]} ${labelOf(e)} ${qtyText(e)}`);
        }
      }
      const embed = new EmbedBuilder().setColor(0xF1C40F)
        .setTitle(`🎁 ${item.name} — ${entries.length} entry`);
      for (const [i, val] of chunk(lines).entries()) {
        embed.addFields({ name: i === 0 ? 'Nội dung' : `Nội dung (${i + 1})`, value: val });
      }
      const warns = [];
      if (pool.length > 0 && totalWeight !== 100) {
        warns.push(`tổng weight = ${totalWeight} (không phải 100) — % ở trên là tỉ lệ thật, không phải weight`);
      }
      if (pool.length === 0) warns.push('không có entry ngẫu nhiên → mỗi lần mở chỉ nhận guaranteed');
      if (pool.length > 0 && totalWeight === 0) warns.push('mọi weight đều = 0 → KHÔNG entry nào rơi được, hộp gần như vô dụng');
      if (guar.length === pool.length) warns.push('mọi entry đều guaranteed → hộp cấp y hệt nhau mỗi lần');
      const src = lootbox.itemSources(lbId);
      if (src.length === 0) warns.push('hộp này chưa có nguồn kiếm — người chơi không lấy được');
      if (warns.length) embed.addFields({ name: '⚠️ Lưu ý', value: warns.map(w => `• ${w}`).join('\n').slice(0, 1024) });
      embed.setFooter({ text: `${prefix}lootbox edit ${lbId} #n · sim ${lbId} 1000` });
      return msg.reply({ embeds: [embed] });
    }

    // ================= add =================
    if (sub === 'add') {
      const lbId = args[1];
      const type = (args[2] || '').toLowerCase();
      if (!lbId || !type) {
        return msg.reply([
          `❌ Cú pháp: \`${prefix}lootbox add <box> <type> <value> [qty=..] [w=..] [g]\``,
          `   ${REWARD_TYPES.map(t => `\`${TYPE_HINT[t]}\``).join(' · ')}`,
          `Ví dụ: \`${prefix}lootbox add ${lbId || 'event_box'} item potion_l qty=1-3 w=50\``,
        ].join('\n'));
      }
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);

      const valueToken = args[3];
      // `g` đứng một mình là flag (không có '=') — chuẩn hoá thành g=1 để
      // parseKV hiểu, nếu không nó bị coi là tham số vị trí.
      const rest = args.slice(4).map(t => (/^(g|guaranteed|⭐)$/i.test(t) ? 'g=1' : t));

      // Nhiều giá trị một lần: `add box item potion_s,potion_m,potion_l w=30`
      // (gold/xp không tách được vì dấu '-' đã có nghĩa "khoảng").
      const values = (type === 'gold' || type === 'xp')
        ? [valueToken]
        : String(valueToken || '').split(',').map(v => v.trim()).filter(Boolean);

      const added = [];
      const failed = [];
      let warn = null;
      for (const v of values) {
        const parsed = parseAddArgs(type, v, rest);
        if (parsed.error) { failed.push(parsed.error.replace(/^❌\s*/, '')); continue; }
        lootbox.addLootEntry(lbId, parsed.entry);
        added.push(parsed.entry);
        if (parsed.warn) warn = parsed.warn;
      }
      if (added.length === 0) {
        return msg.reply(failed.length ? failed.map(f => `❌ ${f}`).join('\n') : '❌ Không thêm được entry nào.');
      }

      const entries = displayEntries(lbId);
      const pool = entries.filter(x => x.guaranteed === 0);
      const totalWeight = pool.reduce((s, x) => s + x.weight, 0);
      const lines = added.map(e => {
        const row = entries.find(x => x.reward_type === e.reward_type && x.reward_id === e.reward_id);
        const pct = !e.guaranteed && totalWeight > 0 ? `${(e.weight / totalWeight * 100).toFixed(1)}%` : '⭐ guaranteed';
        return `✅ \`#${row ? row.no : '?'}\` ${EMOJI[e.reward_type]} ${labelOf(e)} ${qtyText(e)} — **${pct}**${e.guaranteed ? '' : ` (w${e.weight})`}`;
      });
      if (failed.length) lines.push(...failed.map(f => `❌ ${f}`));
      lines.push(`🎁 Hộp **${item.name}** giờ có ${entries.length} entry.`);
      if (warn) lines.push(warn);
      if (totalWeight > 0 && totalWeight !== 100 && added.some(e => !e.guaranteed)) {
        lines.push(`💡 Tổng weight đang ${totalWeight} — % của các entry khác vừa thay đổi, xem \`${prefix}lootbox show ${lbId}\`.`);
      }
      return msg.reply(lines.join('\n'));
    }

    // ================= edit =================
    if (sub === 'edit' || sub === 'set') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox edit <box> #2 w=80 qty=1-3 g=1\``);
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const entries = displayEntries(lbId);
      const resolved = resolveEntry(entries, args[2], args[3]);
      if (resolved.error) return msg.reply(resolved.error);
      const target = resolved.entry;

      const kvTokens = args.slice(2).map(t => (/^(g|guaranteed|⭐)$/i.test(t) ? 'g=1' : t)).filter(t => t.includes('='));
      const kv = parseKV(kvTokens);
      const fields = {};
      if (kv.qty != null || kv.sl != null) {
        const spec = parseQtySpec(kv.qty != null ? kv.qty : kv.sl);
        if (!spec) return msg.reply('❌ `qty` phải là số hoặc khoảng: qty=1 | qty=1-3');
        fields.qty_min = spec.min; fields.qty_max = spec.max;
      }
      if (kv.qty_min != null) fields.qty_min = parseInt(kv.qty_min, 10);
      if (kv.qty_max != null) fields.qty_max = parseInt(kv.qty_max, 10);
      const wKv = kv.w != null ? kv.w : kv.weight;
      if (wKv != null) {
        const w = parseInt(wKv, 10);
        if (isNaN(w) || w < 0) return msg.reply('❌ `w` phải là số ≥ 0.');
        fields.weight = w;
      }
      if (kv.g != null || kv.guaranteed != null) {
        const g = String(kv.g != null ? kv.g : kv.guaranteed).toLowerCase();
        fields.guaranteed = ['1', 'true', 'yes', 'g', 'co', 'có'].includes(g);
      }
      if (Object.keys(fields).length === 0) {
        return msg.reply(`❌ Chưa có gì để sửa. Dùng: \`w=50\`, \`qty=1-3\`, \`g=1|0\`.\nVí dụ: \`${prefix}lootbox edit ${lbId} #${target.no} w=80\``);
      }
      const updated = lootbox.updateLootEntry(lbId, target.reward_type, target.reward_id, fields);
      if (!updated) return msg.reply('❌ Không tìm thấy entry (hộp vừa bị sửa?).');
      const after = displayEntries(lbId).find(x => x.reward_type === updated.reward_type && x.reward_id === updated.reward_id);
      return msg.reply(
        `✅ \`#${after ? after.no : target.no}\` ${EMOJI[updated.reward_type]} ${labelOf(updated)} ${qtyText(updated)}` +
        `${updated.guaranteed ? ' — ⭐ guaranteed' : ` — w${updated.weight}`}\n` +
        `🎁 Hộp **${item.name}**.`
      );
    }

    // ================= rm =================
    if (sub === 'rm' || sub === 'remove' || sub === 'del') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox rm <box> #2\` hoặc \`rm <box> gold\``);
      const { error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const entries = displayEntries(lbId);
      const resolved = resolveEntry(entries, args[2], args[3]);
      if (resolved.error) return msg.reply(resolved.error);
      const target = resolved.entry;
      const ok = lootbox.removeLootEntry(lbId, target.reward_type, target.reward_id);
      return msg.reply(ok
        ? `🗑️ Đã xoá ${EMOJI[target.reward_type]} ${labelOf(target)} khỏi hộp \`${lbId}\`.`
        : '❌ Không xoá được entry này.');
    }

    // ================= copy =================
    if (sub === 'copy' || sub === 'clone') {
      const from = args[1]; const to = args[2];
      if (!from || !to) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox copy <box_nguồn> <box_đích>\``);
      const a = boxOrError(from); if (a.error) return msg.reply(a.error);
      const b = boxOrError(to); if (b.error) return msg.reply(b.error);
      const entries = lootbox.getLootTable(from);
      if (entries.length === 0) return msg.reply(`💡 Hộp nguồn \`${from}\` không có entry nào.`);
      for (const e of entries) {
        lootbox.addLootEntry(to, {
          reward_type: e.reward_type, reward_id: e.reward_id,
          qty_min: e.qty_min, qty_max: e.qty_max, weight: e.weight, guaranteed: e.guaranteed,
        });
      }
      return msg.reply(`✅ Đã copy ${entries.length} entry từ \`${from}\` sang \`${to}\`.`);
    }

    // ================= sim =================
    if (sub === 'sim' || sub === 'simulate' || sub === 'test') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox sim <box> [số_lần]\``);
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const entries = displayEntries(lbId);
      if (entries.length === 0) return msg.reply(`💡 Hộp **${item.name}** trống.`);
      let rolls = parseInt(args[2], 10);
      if (isNaN(rolls) || rolls < 1) rolls = 1000;
      rolls = Math.min(rolls, 10000);

      const count = new Map(); // key → số lần xuất hiện
      let gold = 0, xp = 0, items = 0;
      for (let i = 0; i < rolls; i++) {
        const { rewards } = lootbox.openLootbox(lbId, 1);
        for (const r of rewards) {
          const key = `${r.reward_type}:${r.reward_id}`;
          count.set(key, (count.get(key) || 0) + 1);
          if (r.reward_type === 'gold') gold += r.qty;
          else if (r.reward_type === 'xp') xp += r.qty;
          else if (r.reward_type === 'item') items += r.qty;
        }
      }
      const pool = entries.filter(e => e.guaranteed === 0);
      const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
      const lines = entries.map(e => {
        const got = count.get(`${e.reward_type}:${e.reward_id}`) || 0;
        const observed = got / rolls * 100;
        const designed = e.guaranteed ? 100 : (totalWeight > 0 ? e.weight / totalWeight * 100 : 0);
        const tag = e.guaranteed ? '⭐' : `${designed.toFixed(1)}%`;
        return `\`#${e.no}\` ${EMOJI[e.reward_type]} ${labelOf(e)} — **${observed.toFixed(1)}%** (thiết kế ${tag})`;
      });
      const embed = new EmbedBuilder().setColor(0x3498DB)
        .setTitle(`🎲 Sim ${rolls} lần mở · ${item.name}`);
      for (const [i, val] of chunk(lines).entries()) {
        embed.addFields({ name: i === 0 ? 'Tỉ lệ' : `Tỉ lệ (${i + 1})`, value: val });
      }
      embed.addFields({
        name: 'Trung bình mỗi hộp',
        value: `💰 ${(gold / rolls).toFixed(1)} vàng · ✨ ${(xp / rolls).toFixed(1)} XP · 📦 ${(items / rolls).toFixed(2)} item`,
      });
      embed.setFooter({ text: 'Chỉ mô phỏng — không cấp phần thưởng thật' });
      return msg.reply({ embeds: [embed] });
    }

    // ================= clear =================
    if (sub === 'clear') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox clear <box> confirm\``);
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const n = lootbox.getLootTable(lbId).length;
      if (n === 0) return msg.reply(`💡 Hộp **${item.name}** đã trống sẵn.`);
      if (args[2] !== 'confirm') {
        return msg.reply(`⚠️ Xoá **${n} entry** của **${item.name}** (giữ lại hộp).\nXác nhận: \`${prefix}lootbox clear ${lbId} confirm\``);
      }
      const removed = lootbox.clearLootTable(lbId);
      return msg.reply(`🗑️ Đã xoá ${removed} entry khỏi \`${lbId}\` (hộp vẫn còn).`);
    }

    // ================= delete =================
    if (sub === 'delete' || sub === 'destroy') {
      const lbId = args[1];
      if (!lbId) return msg.reply(`❌ Cú pháp: \`${prefix}lootbox delete <box> confirm\``);
      const { item, error } = boxOrError(lbId);
      if (error) return msg.reply(error);
      const holders = db.prepare('SELECT COALESCE(SUM(qty),0) s FROM inventory WHERE item_id=?').get(lbId).s || 0;
      const n = lootbox.getLootTable(lbId).length;
      if (args[2] !== 'confirm') {
        return msg.reply(
          `⚠️ **Xoá hẳn hộp** \`${lbId}\` — **${item.name}**\n` +
          `   • ${n} entry trong loot table\n` +
          `   • người chơi đang giữ **${holders}** hộp này (sẽ thành item mồ côi)\n` +
          `Xác nhận: \`${prefix}lootbox delete ${lbId} confirm\``
        );
      }
      lootbox.clearLootTable(lbId);
      db.prepare('DELETE FROM items WHERE id=?').run(lbId);
      return msg.reply(`🗑️ Đã xoá hộp \`${lbId}\` + ${n} entry.${holders ? `\n⚠️ Còn ${holders} hộp trong túi người chơi.` : ''}`);
    }

    return msg.reply(`❌ Không có lệnh con \`${sub}\`. Gõ \`${prefix}lootbox help\`.`);
  },
};
