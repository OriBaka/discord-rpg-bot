// %adm — CỬA VÀO DUY NHẤT CHO MỌI LỆNH ADMIN.
//
// ---------------------------------------------------------------------------
// VÌ SAO CÓ FILE NÀY
// ---------------------------------------------------------------------------
// Trước đây lệnh admin nằm rải rác ở 12 lệnh gốc, mỗi lệnh tự có nhánh
// `admin` riêng:
//     %admin help      %item help      %mob help      %gz
//     %quest admin     %ach admin      %pet admin     %craft admin
//     %upgrade admin   %lootbox        %setimage      %slashadmin
//     %shop add/remove %redeem admin   %petrestore    %achdebug
//
// Bất tiện thật:
//   • Admin phải nhớ 12 lệnh gốc nào có nhánh admin, và cú pháp mỗi nhánh
//     lại khác nhau (`admin` vs `help` vs không có sub).
//   • `%craft admin` và `%craft` trông giống nhau nhưng một cái là thao tác
//     phá dữ liệu. Gõ thiếu chữ `admin` là tự tạo recipe rác.
//   • Người chơi gõ `%admin` thấy danh sách trộn lẫn, không biết mục nào
//     nguy hiểm.
//
// Nay: mọi thứ vào qua `%adm <nhóm> <sub>`, và `/adm` tương ứng.
// Các lệnh gốc VẪN hoạt động (không phá ai đang quen) — `%adm` chỉ là cửa vào
// gom nhóm, gọi lại chính handler cũ nên không có logic trùng lặp.
//
// QUY ƯỚC CHO TÍNH NĂNG SAU NÀY: lệnh admin mới ⇒ thêm một nhóm vào
// GROUPS bên dưới + một subcommand vào slash /adm. Không tạo lệnh admin
// rời rạc nữa.

const { EmbedBuilder } = require('discord.js');
const { getPrefix } = require('../game/prefix');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

// ---------------------------------------------------------------------------
// NHÓM LỆNH — mỗi nhóm trỏ tới lệnh gốc và cách chuyển args
//
// `to`  : tên lệnh gốc sẽ gọi (qua client.commands)
// `args`: hàm nhận (sub, rest) → mảng args của lệnh gốc
// `desc`: mô tả ngắn cho help
// `danger`: thao tác phá dữ liệu — help sẽ đánh dấu
// ---------------------------------------------------------------------------
const GROUPS = {
  // %adm player <gold|xp|item|take|hp|level|heal|reset|look|class> ...
  player: {
    desc: 'Sửa dữ liệu người chơi (vàng, XP, item, HP, level, class)',
    to: 'admin',
    args: (sub, rest) => [sub, ...rest],
    subs: ['gold', 'xp', 'item', 'takeitem', 'sethp', 'setlevel', 'heal', 'reset', 'look',
           'giveclass', 'takeclass', 'setclass'],
    danger: ['reset'],
  },
  // %adm item <create|edit|delete|list> ...
  item: {
    desc: 'Tạo/sửa/xoá vật phẩm',
    to: 'item',
    args: (sub, rest) => [sub, ...rest],
    danger: ['delete'],
  },
  // %adm mob ...
  mob: {
    desc: 'Tạo/sửa quái và zone',
    to: 'mob',
    args: (sub, rest) => [sub, ...rest],
    danger: ['delete'],
  },
  // %adm zone ...  → gatherzone
  zone: {
    desc: 'Quản lý zone mining/fishing và drop của chúng',
    to: 'gatherzone',
    args: (sub, rest) => [sub, ...rest],
    danger: ['delete', 'del'],
  },
  // %adm recipe <list|create|delete> ...  → craft admin / cook admin
  recipe: {
    desc: 'Tạo/sửa recipe chế tạo và nấu ăn',
    to: 'craft',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    subs: ['list', 'create', 'delete'],
    danger: ['delete'],
  },
  // %adm cookrecipe ...  → cook admin
  cookrecipe: {
    desc: 'Tạo/sửa recipe nấu ăn',
    to: 'cook',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    subs: ['list', 'create', 'delete'],
    danger: ['delete'],
  },
  // %adm upgrade <xem|set|tier|gold|reset>
  upgrade: {
    desc: 'Chỉnh nguyên liệu/vàng nâng cấp vũ khí',
    to: 'upgrade',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    danger: ['reset'],
  },
  // %adm quest admin ...
  quest: {
    desc: 'Tạo/sửa nhiệm vụ',
    to: 'quest',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // %adm ach admin ...
  ach: {
    desc: 'Tạo/sửa thành tựu',
    to: 'ach',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // %adm pet admin ...
  pet: {
    desc: 'Tạo/sửa pet và drop',
    to: 'pet',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // %adm shop <add|remove|setprice|list>
  shop: {
    desc: 'Chỉnh cửa hàng',
    to: 'shop',
    args: (sub, rest) => [sub, ...rest],
    danger: ['remove'],
  },
  // %adm class <lock|unlock|give|take|set>
  class: {
    desc: 'Khoá/mở class, gán class cho người chơi',
    to: 'admin',
    args: (sub, rest) => {
      const MAP = { lock: 'classlock', unlock: 'classunlock',
                    give: 'giveclass', take: 'takeclass', set: 'setclass' };
      return [MAP[sub] || sub, ...rest];
    },
    danger: [],
  },
  // %adm channel <set|unset|list>
  channel: {
    desc: 'Cấu hình kênh thông báo',
    to: 'admin',
    args: (sub, rest) => ['channel', ...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // %adm image <type> <id> <url>
  image: {
    desc: 'Gán ảnh cho item/monster/zone/pet/achievement',
    to: 'setimage',
    args: (sub, rest) => [...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // %adm redeem <create|list|delete>
  redeem: {
    desc: 'Tạo/quản lý code sự kiện',
    to: 'redeem',
    args: (sub, rest) => ['admin', ...(sub ? [sub] : []), ...rest],
    danger: ['delete'],
  },
  // %adm lootbox ...
  lootbox: {
    desc: 'Quản lý hộp quà sự kiện',
    to: 'lootbox',
    args: (sub, rest) => [...(sub ? [sub] : []), ...rest],
    danger: [],
  },
  // Các lệnh admin một lần / debug
  stats: { desc: 'Thống kê server', to: 'admin', args: () => ['stats'], danger: [] },
  announce: { desc: 'Gửi thông báo tới kênh', to: 'admin', args: (s, r) => ['announce', ...r], danger: [] },
  seed: { desc: 'Seed dữ liệu (battle mobs, high tier, shop)', to: 'admin', args: (s, r) => [s === 'seed' ? 'hightierseed' : s, ...r], danger: [] },
  slash: { desc: 'Quản lý slash commands', to: 'slashadmin', args: (s, r) => [...(s && s !== 'slash' ? [s] : []), ...r], danger: [] },
  petfix: { desc: 'Khôi phục pet bị thiếu (1 lần)', to: 'petrestore', args: () => [], danger: [] },
  achdebug: { desc: 'Debug tiến độ thành tựu', to: 'achdebug', args: (s, r) => [...(s && s !== 'achdebug' ? [s] : []), ...r], danger: [] },
};

// Căn lề mô tả cho dễ đọc
function pad(s, n) { return String(s).padEnd(n, ' '); }

function renderHelp(prefix, msg) {
  const lines = [];
  lines.push(`Gõ \`${prefix}adm <nhóm> <lệnh con>\` — hoặc dùng slash \`/adm\``);
  lines.push('');

  lines.push('**👤 Người chơi**');
  lines.push(`\`${prefix}adm player gold @user 10000\` — cộng/trừ vàng`);
  lines.push(`\`${prefix}adm player xp @user 5000\` — cộng XP`);
  lines.push(`\`${prefix}adm player item @user <id> [qty]\` — tặng item`);
  lines.push(`\`${prefix}adm player takeitem @user <id> [qty]\` — lấy lại item`);
  lines.push(`\`${prefix}adm player setlevel @user <lv>\` — đặt cấp`);
  lines.push(`\`${prefix}adm player sethp @user <hp>\` — đặt HP`);
  lines.push(`\`${prefix}adm player heal @user\` — hồi đầy HP`);
  lines.push(`\`${prefix}adm player look @user\` — xem chi tiết`);
  lines.push(`\`${prefix}adm player reset @user\` — ⚠️ xoá nhân vật`);
  lines.push(`\`${prefix}adm class give @user <class>\` — mở class`);
  lines.push(`\`${prefix}adm class set @user <class>\` — đổi class`);
  lines.push('');

  lines.push('**🎒 Nội dung**');
  lines.push(`\`${prefix}adm item help\` — tạo/sửa vật phẩm`);
  lines.push(`\`${prefix}adm mob help\` — tạo/sửa quái, zone`);
  lines.push(`\`${prefix}adm zone\` — zone mining/fishing`);
  lines.push(`\`${prefix}adm recipe <list|create|delete>\` — recipe chế tạo`);
  lines.push(`\`${prefix}adm cookrecipe <list|create|delete>\` — recipe nấu ăn`);
  lines.push(`\`${prefix}adm upgrade\` — nguyên liệu nâng cấp vũ khí`);
  lines.push(`\`${prefix}adm shop <add|remove|setprice|list>\` — cửa hàng`);
  lines.push(`\`${prefix}adm quest admin\` — nhiệm vụ`);
  lines.push(`\`${prefix}adm ach admin\` — thành tựu`);
  lines.push(`\`${prefix}adm pet admin\` — pet`);
  lines.push(`\`${prefix}adm lootbox\` — hộp quà sự kiện`);
  lines.push(`\`${prefix}adm redeem\` — code sự kiện`);
  lines.push('');

  lines.push('**⚙️ Hệ thống**');
  lines.push(`\`${prefix}adm stats\` — thống kê server`);
  lines.push(`\`${prefix}adm announce <text>\` — thông báo`);
  lines.push(`\`${prefix}adm channel <set|unset|list>\` — kênh notify`);
  lines.push(`\`${prefix}adm image <type> <id> <url>\` — gán ảnh`);
  lines.push(`\`${prefix}adm slash\` — quản lý slash command`);
  lines.push(`\`${prefix}adm petfix\` — khôi phục pet thiếu`);
  lines.push(`\`${prefix}adm achdebug\` — debug thành tựu`);
  lines.push('');
  lines.push('*Các lệnh gốc (`%admin`, `%item`, `%mob`...) vẫn dùng được.*');

  return new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('🛠️ %adm — Quản trị')
    .setDescription(lines.join('\n'));
}

module.exports = {
  name: 'adm',
  aliases: ['admins'],
  description: 'Cửa vào duy nhất cho lệnh admin: %adm <nhóm> <lệnh con>',
  async execute(msg, args) {
    const prefix = getPrefix();
    if (!isAdmin(msg)) return msg.reply('🚫 Bạn không có quyền dùng lệnh admin.');

    const group = (args[0] || '').toLowerCase();

    // ===== help =====
    if (!group || group === 'help' || group === 'h') {
      return msg.reply({ embeds: [renderHelp(prefix, msg)] });
    }

    const def = GROUPS[group];
    if (!def) {
      // Gợi ý nhóm gần đúng — gõ sai 1 chữ không nên bắt đọc lại cả help
      const near = Object.keys(GROUPS).filter(g =>
        g.startsWith(group.slice(0, 3)) || group.startsWith(g.slice(0, 3)));
      return msg.reply(
        `❌ Không có nhóm \`${group}\`.` +
        (near.length ? `\nCó phải bạn muốn: ${near.map(n => `\`${prefix}adm ${n}\``).join(', ')}?` : '') +
        `\nXem tất cả: \`${prefix}adm help\``
      );
    }

    const sub = (args[1] || '').toLowerCase();
    const rest = args.slice(2);

    // ===== cảnh báo cho thao tác phá dữ liệu =====
    // Không bắt xác nhận (sẽ phiền khi dùng thật) nhưng phải nói rõ đang làm gì.
    if (def.danger.includes(sub)) {
      console.log(`[adm] ${msg.author.id} chạy nhóm phá dữ liệu: ${group} ${sub} ${rest.join(' ')}`);
    }

    // ===== gọi lệnh gốc =====
    const cmd = msg.client?.commands?.get(def.to);
    if (!cmd) {
      return msg.reply(
        `❌ Lệnh gốc \`${def.to}\` không tải được. Dùng trực tiếp \`${prefix}${def.to}\` thay thế.`
      );
    }
    const callArgs = def.args(sub, rest);
    return cmd.execute(msg, callArgs);
  },

  // Xuất để lệnh khác (vd slash handler) và test dùng lại
  GROUPS,
  renderHelp,
};
