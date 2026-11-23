// Help: danh sách đầy đủ + tra cứu theo từ khoá (`%help market`).
//
// Vì sao phải có tra cứu: embed đầy đủ dài ~3,580 ký tự / 12 mục, người chơi
// phải tự dò mắt giữa 45 lệnh để tìm đúng một lệnh. `%help <từ khoá>` lọc
// xuống chỉ những dòng liên quan.
//
// Nội dung help được khai báo thành MẢNG dữ liệu (không phải addFields inline)
// để tra cứu được theo từng dòng mà vẫn giữ nguyên bản đầy đủ.
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const paginator = require('../game/paginator');

// Bỏ dấu tiếng Việt để người chơi gõ không dấu vẫn tìm được ("cho" → "chợ").
function fold(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

// Khớp theo TỪ, không phải substring: trước khi sửa, `%help cho` kéo theo mục
// "Trang bị" chỉ vì "auto chọn slot" chứa "cho". Từ khoá nhiều từ thì khớp cụm.
function matchText(hay, q) {
  const h = fold(hay);
  const needle = fold(q).trim();
  if (!needle) return false;
  if (/\s/.test(needle)) return h.includes(needle);
  // "trangbi" phải khớp mục "Trang bị" (khác khoảng trắng) nhưng KHÔNG được
  // khớp "chọn" chỉ vì nó chứa "cho" → chỉ so bằng khi đã bỏ hết khoảng trắng.
  const compact = (x) => x.replace(/[\s_-]+/g, '');
  if (compact(h) === compact(needle)) return true;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(h);
}

// prefix được truyền vào vì mỗi server có thể đổi prefix.
function buildSections(prefix) {
  return [
    {
      name: '👤 Nhân vật', terms: ['nhan vat', 'character', 'profile', 'toi'],
      lines: [
        `\`${prefix}start\` tạo nhân vật • \`${prefix}card\` xuất profile card PNG`,
        `\`${prefix}me\` xem hồ sơ • \`${prefix}me cosmetics\` mua màu/danh hiệu`,
        `\`${prefix}inv [filter]\` xem túi đồ (vd \`${prefix}inv weapon\`, \`${prefix}inv ring\`)`,
        `\`${prefix}gear [@user]\` xem trang bị đang mặc`,
        `\`${prefix}top\` bảng xếp hạng`,
        `\`${prefix}class\` xem/đổi class`,
        `\`${prefix}aura\` roll buff chiến đấu/nghề bằng vàng • \`${prefix}aura top\` BXH`,
      ],
    },
    {
      name: '⚔️ Chiến đấu', terms: ['chien dau', 'combat', 'danh', 'san'],
      lines: [
        `\`${prefix}hunt\` đi săn auto theo lv`,
        `\`${prefix}hunt list\` xem các khu vực`,
        `\`${prefix}hunt <zone>\` săn ở khu vực cụ thể`,
        `\`${prefix}hunt <mob_id>\` săn quái chỉ định`,
        `\`${prefix}contract help\` — hợp đồng tổ đội 2–4 người, công trạng & huy hiệu`,
        `\`${prefix}casino help\` — slot, blackjack, RPS/xúc xắc PvP (chip riêng miễn phí)`,
        `\`${prefix}worldstory\` trạng thái lịch sử chung (Chương 4 chưa mở) • worldstory rules/history`,
        `\`${prefix}skills\` xem kỹ năng/bí kíp • skills equip <1–4 id> • skills presets/save/load/delete <tên> • skills events/claim cho sự kiện`,
        `\`${prefix}tower\` Tháp Canh 15 tầng • start / leave / top`,
        `\`${prefix}battle list\` xem elite/boss`,
        `\`${prefix}battle <mob_id>\` trận turn-based có skill`,
        `\`${prefix}heal\` nghỉ quán trọ (cooldown 10 phút)`,
        `\`${prefix}use <id>\` dùng bình máu / mở lootbox`,
      ],
    },
    {
      name: '💼 Trang bị', terms: ['trang bi', 'gear', 'equip', 'mac do'],
      lines: [
        `\`${prefix}equip <id> [slot]\` mặc đồ (auto chọn slot)`,
        `\`${prefix}unequip <slot|all>\` tháo trang bị`,
        `\`${prefix}compare <id1> [id2]\` so sánh 2 món`,
        `\`${prefix}upgrade\` xem cấp nâng cấp vũ khí (+1..+5)`,
        `\`${prefix}upgrade <id>\` nâng cấp vũ khí đang mặc`,
        `\`${prefix}upgrade list\` bảng chi phí nâng cấp`,
        'Slots: weapon, offhand, head, chest, legs, feet, hands, ring1, ring2, necklace, special',
      ],
    },
    {
      name: '🏪 Chợ', terms: ['cho', 'market', 'shop', 'ban', 'mua', 'sell', 'buy', 'gia'],
      lines: [
        `\`${prefix}shop\` xem cửa hàng NPC`,
        `\`${prefix}buy <id> [qty]\` mua ở shop`,
        `\`${prefix}sell <id> [qty]\` bán cho NPC • \`${prefix}sell all [filter]\` • \`${prefix}sell junk\` (tier common)`,
        `*Bán từ 1,000 vàng trở lên phải gõ thêm \`confirm\` — chống mất đồ do gõ nhầm*`,
        `\`${prefix}market\` chợ NGƯỜI CHƠI — bán nguyên liệu/đồ hiếm cho người khác (bấm nút 🛒 để mua)`,
        `\`${prefix}market sell\` xem món bán được + giá gợi ý • \`${prefix}market sell <id> <giá> [qty]\` đăng bán`,
        `\`${prefix}market mine\` tin của bạn • \`${prefix}market recent\` giá gần đây`,
      ],
    },
    {
      name: '📚 Tra cứu', terms: ['tra cuu', 'info', 'xem thong tin'],
      lines: [
        `\`${prefix}find <id hoặc tên>\` tra nguồn kiếm & công dụng vật phẩm`,
        `\`${prefix}info help\` xem các lệnh tra cứu`,
        `\`${prefix}info item <id>\` chi tiết item`,
        `\`${prefix}info mob <id>\` chi tiết quái`,
        `\`${prefix}info zone <id>\` chi tiết khu vực`,
      ],
    },
    {
      name: '📜 Nhiệm vụ & Thành tựu', terms: ['nhiem vu', 'quest', 'thanh tuu', 'achievement'],
      lines: [
        `\`${prefix}story\` chính tuyến • \`${prefix}story start\` bắt đầu • \`${prefix}story claim\` tiếp tục • \`${prefix}story journal\` sổ hành trình`,
        `\`${prefix}quest\` xem quest hằng ngày`,
        `\`${prefix}quest claim <id>\` nhận thưởng • \`${prefix}quest claim all\` nhận hết quest đã xong`,
        `\`${prefix}quest list\` xem custom quest`,
        `\`${prefix}ach [@user]\` xem thành tựu`,
        `\`${prefix}ach top\` BXH thành tựu`,
      ],
    },
    {
      name: '🐾 Pet', terms: ['pet', 'thu nuoi', 'linh thu'],
      lines: [
        `\`${prefix}pet\` xem pet của mình`,
        `\`${prefix}pet active <id>\` chọn pet đi theo`,
        `\`${prefix}pet shards\` xem mảnh pet`,
        `\`${prefix}pet combine <id>\` ghép mảnh thành pet`,
        `\`${prefix}pet evolve [<id>]\` tiến hoá pet bằng mảnh`,
        `\`${prefix}pet map\` pet sống theo vùng khí hậu nào`,
        `\`${prefix}pet collection\` xem tất cả pet có thể có`,
      ],
    },
    {
      name: '🛠️ Nghề', terms: ['nghe', 'job', 'craft', 'che tao', 'nau an', 'dao mo', 'cau ca'],
      lines: [
        `\`${prefix}job [@user]\` xem level các nghề`,
        `\`${prefix}mine [zone]\` đào mỏ (mining)`,
        `\`${prefix}fish [zone]\` câu cá (fishing)`,
        `\`${prefix}gather [zone]\` hái lượm gỗ/thảo dược (foraging)`,
        `\`${prefix}weather\` thời tiết/giờ thế giới; \`${prefix}weather rares\` cây và cá hiếm theo điều kiện`,
        `\`${prefix}collection fish/gather [trang]\` nút lật trang, lọc all/missing/owned/rare • collection title fish/gather/all`,
        `\`${prefix}craft list\` / \`${prefix}craft <recipe> [xN]\` chế tạo (vd \`${prefix}craft iron_ingot x10\`)`,
        `\`${prefix}cook list\` / \`${prefix}cook <recipe>\` nấu ăn`,
      ],
    },
    {
      name: '🏰 Bang hội', terms: ['bang hoi', 'guild', 'clan'],
      lines: [
        `\`${prefix}guild\` xem bang / hướng dẫn`,
        `\`${prefix}guild create <tag> <tên>\` lập bang (Lv.5, 500 vàng)`,
        `\`${prefix}guild invite @user\` mời thành viên`,
        `\`${prefix}guild vault\` kho chung • \`${prefix}guild building\` xây công trình`,
        `\`${prefix}guild top\` BXH bang • buff vàng/XP khi hunt`,
        '*Thành viên đánh boss tuần sẽ cộng XP cho bang → bang lên cấp nhanh hơn*',
      ],
    },
    {
      name: '🐲 Boss tuần (raid)', terms: ['boss tuan', 'raid', 'boss'],
      lines: [
        `\`${prefix}raid\` xem máu boss tuần + lượt đánh còn lại`,
        `\`${prefix}raid danh\` đánh boss (5 lượt/tuần, chia sát thương)`,
        `\`${prefix}raid top\` BXH sát thương cá nhân`,
        `\`${prefix}raid bang\` BXH sát thương theo bang hội`,
        `\`${prefix}raid thuong\` nhận thưởng tuần trước`,
        '*Cả server đánh chung một thanh máu — hạ boss mới có thưởng đầy đủ*',
      ],
    },
    {
      name: '⚔️ PvP & Trade', terms: ['pvp', 'duel', 'trade', 'trao doi', 'thach dau'],
      lines: [
        `\`${prefix}duel @user [gold]\` thách đấu`,
        `\`${prefix}duel accept/decline\` phản hồi`,
        `\`${prefix}duel top\` BXH PvP`,
        `\`${prefix}trade @user\` mở phiên trao đổi`,
        `\`${prefix}trade help\` xem hướng dẫn chi tiết`,
      ],
    },
    {
      name: '🎁 Khác', terms: ['khac', 'daily', 'diem danh', 'code', 'redeem'],
      lines: [
        `\`${prefix}daily\` điểm danh — chu kỳ 30 ngày, mốc quà 7/14/21/30`,
        `\`${prefix}daily xem\` xem bảng 30 ngày + đang ở đâu`,
        `\`${prefix}redeem <code>\` nhập code nhận thưởng`,
      ],
    },
  ];
}

function adminSection(prefix) {
  return {
    name: '🛠️ Admin (chỉ bạn thấy)', terms: ['admin', 'quan tri'],
    lines: [
      `\`${prefix}adm help\` **cửa vào chính** — tất cả lệnh admin`,
      `\`${prefix}admin help\` (cũ) quản trị + class + channel notify`,
      `\`${prefix}item help\` tạo/sửa item`,
      `\`${prefix}mob help\` tạo/sửa quái & zone`,
      `\`${prefix}quest admin\` tạo/sửa quest`,
      `\`${prefix}ach admin\` tạo/sửa achievement`,
      `\`${prefix}pet admin\` tạo/sửa pet + drop`,
      `\`${prefix}gatherzone\` (hoặc \`${prefix}gz\`) quản lý zone mining/fishing/foraging`,
      `\`${prefix}craft admin\` / \`${prefix}cook admin\` tạo/sửa recipe`,
      `\`${prefix}upgrade admin\` chỉnh nguyên liệu nâng cấp theo mốc`,
      `\`${prefix}shop add/remove/setprice\` chỉnh shop`,
      `\`${prefix}setimage <type> <id> <url>\` gán ảnh`,
      `\`${prefix}lootbox\` tạo & quản lý hộp quà (help có hướng dẫn)`,
      `\`${prefix}redeem admin\` tạo/quản lý code`,
      `\`${prefix}slashadmin\` (hoặc \`${prefix}sla\`) quản lý slash commands`,
      `\`${prefix}petrestore\` khôi phục pet bị thiếu (dùng 1 lần)`,
      `\`${prefix}achdebug\` debug tiến độ thành tựu`,
    ],
  };
}

// Danh sách lệnh thật: lấy từ client.commands khi có (bot đang chạy), không thì
// đọc thư mục commands. Nhờ vậy `%help <tên lệnh>` không cần bảng cứng phải
// cập nhật tay mỗi lần thêm lệnh.
function commandList(msg) {
  const out = new Map();
  const add = (m) => {
    if (!m || !m.name || typeof m.execute !== 'function') return;
    if (!out.has(m.name)) out.set(m.name, { name: m.name, aliases: m.aliases || [], description: m.description || '' });
  };
  const fromClient = msg?.client?.commands;
  if (fromClient && typeof fromClient.values === 'function') {
    for (const m of fromClient.values()) add(m);
    if (out.size > 0) return [...out.values()];
  }
  try {
    const dir = path.join(__dirname);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.js') || f === 'help.js') continue;
      try {
        const mod = require(path.join(dir, f));
        for (const candidate of [mod, ...Object.values(mod)]) add(candidate);
      } catch { /* 1 file lỗi không được làm chết %help */ }
    }
  } catch { /* bỏ qua */ }
  return [...out.values()];
}

/**
 * Tra cứu help theo từ khoá.
 * Trả về { embed } — luôn trả embed, kể cả khi không khớp (kèm gợi ý).
 */
function searchHelp(msg, term, opts = {}) {
  const prefix = require('../game/prefix').getPrefix();
  const q = fold(term).trim();
  const sections = buildSections(prefix);
  if (opts.admin) sections.push(adminSection(prefix));

  // 1) Lệnh khớp tên/alias (ưu tiên cao nhất — người chơi gõ `%help sell`)
  const cmds = commandList(msg);
  const cmdHits = cmds.filter(c =>
    // Không gợi ý lệnh admin cho người chơi thường
    (opts.admin || !/admin only|chỉ admin/i.test(c.description || '')) &&
    (fold(c.name) === q ||
      c.aliases.some(a => fold(a) === q) ||
      (q.length >= 2 && (fold(c.name).startsWith(q) || c.aliases.some(a => fold(a).startsWith(q)))))
  ).slice(0, 5);

  // 2) Dòng/mục khớp từ khoá
  const sectionHits = [];
  for (const s of sections) {
    const nameHit = matchText(s.name, q) || s.terms.some(t => t.length >= 2 && (matchText(t, q) || matchText(q, t)));
    const lines = s.lines.filter(l => matchText(l, q));
    if (nameHit) sectionHits.push({ section: s, lines: s.lines, nameHit: true });
    else if (lines.length) sectionHits.push({ section: s, lines, nameHit: false });
  }

  if (cmdHits.length === 0 && sectionHits.length === 0) {
    const topics = sections.map(s => s.name.replace(/^\S+\s/, '')).join(' • ');
    return {
      embed: new EmbedBuilder().setColor(0xED4245)
        .setTitle(`🔍 Không tìm thấy "${term}"`)
        .setDescription(
          `Không có lệnh/mục nào khớp **${term}**.\n\n` +
          `**Mục có sẵn**: ${topics}\n\n` +
          `💡 Gõ \`${prefix}help\` để xem tất cả, hoặc thử từ khoá ngắn hơn (vd \`${prefix}help pet\`, \`${prefix}help cho\`).`
        ),
    };
  }

  const embed = new EmbedBuilder().setColor(0x5865F2)
    .setTitle(`📖 help: "${term}"`);

  if (cmdHits.length > 0) {
    embed.addFields({
      name: '📄 Lệnh',
      value: cmdHits.map(c =>
        `\`${prefix}${c.name}\` — ${c.description || '(không có mô tả)'}` +
        (c.aliases.length ? `\n   ↳ còn gọi: ${c.aliases.slice(0, 6).map(a => `\`${prefix}${a}\``).join(', ')}` : '')
      ).join('\n').slice(0, 1024),
    });
  }

  for (const hit of sectionHits.slice(0, 5 - Math.min(cmdHits.length ? 1 : 0, 1))) {
    // Mục khớp tên → in cả mục; khớp dòng → chỉ in các dòng liên quan (tối đa 10)
    const lines = hit.nameHit ? hit.lines : hit.lines.slice(0, 10);
    let value = lines.join('\n');
    if (!hit.nameHit && hit.lines.length > 10) value += `\n… và ${hit.lines.length - 10} dòng khác (gõ \`${prefix}help\`)`;
    embed.addFields({ name: hit.section.name, value: value.slice(0, 1024) });
  }

  const total = cmdHits.length + sectionHits.length;
  embed.setFooter({ text: `${total} kết quả • ${prefix}help để xem tất cả • ${prefix}help <từ khoá> để tra cứu` });
  return { embed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trần an toàn: help đầy đủ đã 3,920 ký tự, và test tài liệu BUỘC mỗi lệnh mới
// phải được nhắc trong help → nó chỉ dài thêm. Vượt ngưỡng thì chia trang thay
// vì để Discord từ chối cả tin nhắn.
// ─────────────────────────────────────────────────────────────────────────────
const HELP_SAFE_CHARS = 5500;
const HELP_PER_PAGE = 4;

function helpEmbedSize(sections, title = '📖 Hướng dẫn lệnh', description = '') {
  return title.length + description.length +
    sections.reduce((n, s) => n + s.name.length + s.lines.join('\n').length, 0);
}

function renderHelpPage({ userId, page = 0, replyFn, admin = false }) {
  const prefix = require('../game/prefix').getPrefix();
  const sections = buildSections(prefix);
  if (admin) sections.push(adminSection(prefix));
  const { embed, components } = paginator.build({
    domain: 'help',
    userId,
    items: sections,
    filter: 'all',
    page,
    perPage: HELP_PER_PAGE,
    title: '📖 Hướng dẫn lệnh',
    color: 0x5865F2,
    formatItem: (s) => `**${s.name}**\n${s.lines.join('\n')}`,
    footer: `${prefix}help <từ khoá> để tra cứu nhanh (vd ${prefix}help market)`,
  });
  return replyFn({ embeds: [embed], components });
}

module.exports = {
  name: 'help',
  aliases: ['h', 'giup'],
  description: 'Danh sách lệnh. Tra cứu nhanh: !help <từ khoá>',
  searchHelp,
  renderHelpPage,
  helpEmbedSize,
  HELP_SAFE_CHARS,
  // Dùng bởi test + lệnh khác (giữ khả năng tái sử dụng phần tra cứu)
  fold,
  async execute(msg, args = []) {
    const prefix = require('../game/prefix').getPrefix();
    const isOwner   = msg.guild && msg.guild.ownerId === msg.author.id;
    const hasAdmin  = msg.member && msg.member.permissions?.has('Administrator');
    const adminIds  = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
    const showAdmin = isOwner || hasAdmin || adminIds.includes(msg.author.id);

    // ===== tra cứu theo từ khoá =====
    const term = (args || []).join(' ').trim();
    if (term) {
      const { embed } = searchHelp(msg, term, { admin: showAdmin });
      return msg.reply({ embeds: [embed] });
    }

    // ===== danh sách đầy đủ =====
    const sections = buildSections(prefix);
    if (showAdmin) sections.push(adminSection(prefix));

    // Quá dài → chia trang (giữ nguyên nội dung, chỉ đổi cách trình bày)
    if (helpEmbedSize(sections) > HELP_SAFE_CHARS) {
      return renderHelpPage({ userId: msg.author.id, page: 0, admin: showAdmin, replyFn: (opts) => msg.reply(opts) });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📖 Hướng dẫn lệnh')
      .setDescription(`Prefix hiện tại: \`${prefix}\` • Tra cứu nhanh: \`${prefix}help <từ khoá>\` (vd \`${prefix}help market\`)`)
      .addFields(...sections.map(s => ({ name: s.name, value: s.lines.join('\n') })));

    embed.setFooter({ text: 'Chúc bạn cày vui!' });
    return msg.reply({ embeds: [embed] });
  },
};
