// Slash command definitions: schema cho Discord registration
// Mỗi command có { data (slash json), handler (function or commandName) }
const { SlashCommandBuilder } = require('discord.js');

// Helper: tạo simple slash → call prefix command với args
const simpleHandler = (cmdName, optionExtractor) => ({
  cmdName,
  extractArgs: optionExtractor || (() => []),
});

const SLOTS_CHOICES = [
  { name: 'Vũ khí', value: 'weapon' },
  { name: 'Tay phụ', value: 'offhand' },
  { name: 'Đầu', value: 'head' },
  { name: 'Thân', value: 'chest' },
  { name: 'Quần', value: 'legs' },
  { name: 'Giày', value: 'feet' },
  { name: 'Găng tay', value: 'hands' },
  { name: 'Nhẫn 1', value: 'ring1' },
  { name: 'Nhẫn 2', value: 'ring2' },
  { name: 'Dây chuyền', value: 'necklace' },
  { name: 'Phụ kiện đặc biệt', value: 'special' },
  { name: 'Tất cả', value: 'all' },
];

const INV_FILTER_CHOICES = [
  { name: 'Tất cả', value: 'all' },
  { name: 'Vũ khí', value: 'weapon' },
  { name: 'Tay phụ', value: 'offhand' },
  { name: 'Đầu', value: 'head' },
  { name: 'Thân', value: 'chest' },
  { name: 'Quần', value: 'legs' },
  { name: 'Giày', value: 'feet' },
  { name: 'Găng tay', value: 'hands' },
  { name: 'Nhẫn', value: 'ring' },
  { name: 'Dây chuyền', value: 'necklace' },
  { name: 'Phụ kiện đặc biệt', value: 'special' },
  { name: 'Tiêu hao', value: 'consumable' },
  { name: 'Nguyên liệu', value: 'material' },
];

const CLASS_CHOICES = [
  { name: '⚔️ Chiến Binh (Melee)', value: 'melee' },
  { name: '🔮 Pháp Sư (Magic)', value: 'magic' },
  { name: '🏹 Cung Thủ (Ranged)', value: 'ranged' },
];

// Sinh từ jobs.JOB_TYPES + JOB_INFO: thêm nghề mới không phải sửa file này
// (trước đây 4 choice viết cứng nên nghề mới không chọn được trên slash).
const jobChoicesModule = require('../game/jobs');
const JOB_CHOICES = jobChoicesModule.JOB_TYPES.map(t => ({
  name: `${jobChoicesModule.JOB_INFO[t]?.icon || ''} ${jobChoicesModule.JOB_INFO[t]?.name || t}`.trim(),
  value: t,
}));

const definitions = [
  { data: new SlashCommandBuilder().setName('collection').setDescription('Bộ sưu tập cá và cây cỏ đã từng nhận')
      .addStringOption(o => o.setName('kind').setDescription('Sổ sưu tập').addChoices({ name: 'Fish', value: 'fish' }, { name: 'Gather', value: 'gather' }))
      .addIntegerOption(o => o.setName('page').setDescription('Trang').setMinValue(1))
      .addStringOption(o => o.setName('filter').setDescription('Lọc bộ sưu tập').addChoices(...['all','missing','owned','rare'].map(value => ({ name: value, value })))),
    handler: simpleHandler('collection', i => { const kind = i.options.getString('kind'); const filter = i.options.getString('filter'); return kind ? [kind, String(i.options.getInteger('page') || 1), ...(filter && ['all','missing','owned','rare'].includes(filter) ? [filter] : [])] : []; }) },
  { data: new SlashCommandBuilder().setName('weather').setDescription('Thời tiết, giờ thế giới và vật sưu tầm hiếm')
      .addStringOption(o => o.setName('args').setDescription('rares / channel ID / interval phút / time HH:MM / dayhours 6 18')),
    handler: simpleHandler('weather', i => (i.options.getString('args') || '').trim().split(/\s+/).filter(Boolean)) },
  // ====== Player profile ======
  {
    data: new SlashCommandBuilder().setName('start').setDescription('Tạo nhân vật mới'),
    handler: simpleHandler('start'),
  },
  {
    data: new SlashCommandBuilder().setName('me').setDescription('Hồ sơ và ngoại hình')
      .addStringOption(o => o.setName('action').setDescription('Hành động').addChoices({ name: 'Cửa hàng ngoại hình', value: 'cosmetics' }, { name: 'Mua', value: 'buy' }, { name: 'Áp dụng / mặc định', value: 'equip' }))
      .addStringOption(o => o.setName('id').setDescription('ID ngoại hình hoặc default_color / default_title'))
      .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận mua không hoàn vàng')),
    handler: simpleHandler('me', i => {
      const a = i.options.getString('action');
      return a ? [a, i.options.getString('id') || '', i.options.getBoolean('confirm') ? 'confirm' : ''] : [];
    }),
  },
  {
    data: new SlashCommandBuilder().setName('gear').setDescription('Xem trang bị đang mặc')
      .addUserOption(o => o.setName('user').setDescription('Xem của user khác').setRequired(false)),
    handler: { cmdName: 'gear', extractArgs: (i) => {
      const u = i.options.getUser('user');
      return u ? [u] : [];
    }},
  },
  {
    data: new SlashCommandBuilder().setName('inv').setDescription('Xem túi đồ')
      .addStringOption(o => o.setName('filter').setDescription('Lọc theo loại').setRequired(false).addChoices(...INV_FILTER_CHOICES)),
    handler: { cmdName: 'inv', extractArgs: (i) => {
      const f = i.options.getString('filter');
      return f ? [f] : [];
    }},
  },
  {
    data: new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng')
      .addStringOption(o => o.setName('type').setDescription('Loại BXH').setRequired(false)
        .addChoices({ name: 'Level', value: 'level' }, { name: 'Bang hội', value: 'guild' })),
    handler: { cmdName: 'top', extractArgs: (i) => {
      const t = i.options.getString('type');
      return t && t !== 'level' ? [t] : [];
    }},
  },

  // ====== Combat ======
  {
    data: new SlashCommandBuilder().setName('hunt').setDescription('Đi săn quái vật')
      .addStringOption(o => o.setName('target').setDescription('Zone ID hoặc Monster ID (để trống = auto)').setRequired(false).setAutocomplete(true)),
    handler: { cmdName: 'hunt', extractArgs: (i) => {
      const t = i.options.getString('target');
      return t ? [t] : [];
    }},
    autocomplete: 'hunt_target',
  },
  {
    data: new SlashCommandBuilder().setName('heal').setDescription('Vào quán trọ hồi đầy HP'),
    handler: simpleHandler('heal'),
  },
  {
    data: new SlashCommandBuilder().setName('use').setDescription('Dùng vật phẩm tiêu hao')
      .addStringOption(o => o.setName('item').setDescription('ID item').setRequired(true).setAutocomplete(true)),
    handler: { cmdName: 'use', extractArgs: (i) => [i.options.getString('item')] },
    autocomplete: 'item_consumable',
  },

  // ====== Equipment ======
  {
    data: new SlashCommandBuilder().setName('equip').setDescription('Trang bị item')
      .addStringOption(o => o.setName('item').setDescription('ID item').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('slot').setDescription('Slot cụ thể (mặc định auto)').setRequired(false)
        .addChoices(...SLOTS_CHOICES.filter(s => s.value !== 'all'))),
    handler: { cmdName: 'equip', extractArgs: (i) => {
      const item = i.options.getString('item');
      const slot = i.options.getString('slot');
      return slot ? [item, slot] : [item];
    }},
    autocomplete: 'item_equippable',
  },
  {
    data: new SlashCommandBuilder().setName('unequip').setDescription('Tháo trang bị')
      .addStringOption(o => o.setName('slot').setDescription('Slot cần tháo').setRequired(false).addChoices(...SLOTS_CHOICES)),
    handler: { cmdName: 'unequip', extractArgs: (i) => {
      const s = i.options.getString('slot') || 'all';
      return [s];
    }},
  },

  // ====== Class ======
  {
    data: new SlashCommandBuilder().setName('class').setDescription('Hệ thống class')
      .addSubcommand(s => s.setName('info').setDescription('Xem class hiện tại'))
      .addSubcommand(s => s.setName('list').setDescription('Danh sách các class'))
      .addSubcommand(s => s.setName('pick').setDescription('Chọn class đầu tiên')
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES)))
      .addSubcommand(s => s.setName('switch').setDescription('Đổi sang class đã unlock')
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES)))
      .addSubcommand(s => s.setName('unlock').setDescription('Học class mới (cần token + level)')
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES))),
    handler: { cmdName: 'class', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'info') return [];
      const cls = i.options.getString('class');
      return [sub, cls];
    }},
  },

  // ====== Shop ======
  {
    data: new SlashCommandBuilder().setName('shop').setDescription('Xem cửa hàng'),
    handler: simpleHandler('shop'),
  },
  {
    data: new SlashCommandBuilder().setName('buy').setDescription('Mua vật phẩm từ shop')
      .addStringOption(o => o.setName('item').setDescription('ID item').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)),
    handler: { cmdName: 'buy', extractArgs: (i) => {
      const item = i.options.getString('item');
      const qty = i.options.getInteger('qty');
      return qty ? [item, qty] : [item];
    }},
    autocomplete: 'item_shop',
  },
  {
    data: new SlashCommandBuilder().setName('sell').setDescription('Bán vật phẩm')
      .addStringOption(o => o.setName('item').setDescription('ID item').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)),
    handler: { cmdName: 'sell', extractArgs: (i) => {
      const item = i.options.getString('item');
      const qty = i.options.getInteger('qty');
      return qty ? [item, qty] : [item];
    }},
    autocomplete: 'item_owned',
  },

  // ====== Daily ======
  {
    data: new SlashCommandBuilder().setName('daily').setDescription('Điểm danh hằng ngày'),
    handler: simpleHandler('daily'),
  },

  // ====== Info ======
  {
    data: new SlashCommandBuilder().setName('info').setDescription('Tra cứu thông tin')
      .addSubcommand(s => s.setName('item').setDescription('Chi tiết 1 item')
        .addStringOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('mob').setDescription('Chi tiết 1 quái')
        .addStringOption(o => o.setName('id').setDescription('Monster ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('zone').setDescription('Chi tiết 1 khu vực')
        .addStringOption(o => o.setName('id').setDescription('Zone ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('items').setDescription('Danh sách item')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(false)))
      .addSubcommand(s => s.setName('mobs').setDescription('Danh sách quái'))
      .addSubcommand(s => s.setName('zones').setDescription('Danh sách khu vực')),
    handler: { cmdName: 'info', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      const id = i.options.getString('id') || i.options.getString('type');
      return id ? [sub, id] : [sub];
    }},
    // Multi-autocomplete dùng option name để discriminate
    autocomplete: 'info_dynamic',
  },

  // ====== Quest ======
  {
    data: new SlashCommandBuilder().setName('quest').setDescription('Nhiệm vụ')
      .addSubcommand(s => s.setName('view').setDescription('Xem quest đang nhận'))
      .addSubcommand(s => s.setName('claim').setDescription('Nhận thưởng quest')
        .addStringOption(o => o.setName('id').setDescription('Quest ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('accept').setDescription('Nhận custom quest')
        .addStringOption(o => o.setName('id').setDescription('Quest ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('Xem custom quest có sẵn')),
    handler: { cmdName: 'quest', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'view') return [];
      if (sub === 'list') return ['list'];
      const id = i.options.getString('id');
      return [sub, id];
    }},
    autocomplete: 'quest_dynamic',
  },

  // ====== Achievement ======
  {
    data: new SlashCommandBuilder().setName('ach').setDescription('Thành tựu')
      .addSubcommand(s => s.setName('view').setDescription('Xem thành tựu của mình hoặc user khác')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)))
      .addSubcommand(s => s.setName('list').setDescription('Tất cả thành tựu có sẵn'))
      .addSubcommand(s => s.setName('top').setDescription('BXH thành tựu')),
    handler: { cmdName: 'ach', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'list') return ['list'];
      if (sub === 'top') return ['top'];
      const u = i.options.getUser('user');
      return u ? [u] : [];
    }},
  },

  // ====== Pet ======
  {
    data: new SlashCommandBuilder().setName('pet').setDescription('Pet system')
      .addSubcommand(s => s.setName('view').setDescription('Xem pet của mình'))
      .addSubcommand(s => s.setName('active').setDescription('Active pet (hoặc tắt)')
        .addStringOption(o => o.setName('pet').setDescription('Pet ID (none = tắt)').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('combine').setDescription('Ghép mảnh thành pet')
        .addStringOption(o => o.setName('pet').setDescription('Pet ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('shards').setDescription('Xem mảnh pet đang có'))
      .addSubcommand(s => s.setName('collection').setDescription('Xem tất cả pet có thể có')),
    handler: { cmdName: 'pet', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'view') return [];
      if (sub === 'shards' || sub === 'collection') return [sub];
      const pet = i.options.getString('pet');
      return [sub, pet];
    }},
    autocomplete: 'pet_dynamic',
  },

  // ====== Job ======
  {
    data: new SlashCommandBuilder().setName('job').setDescription('Nghề')
      .addSubcommand(s => s.setName('view').setDescription('Xem level các nghề')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)))
      .addSubcommand(s => s.setName('top').setDescription('BXH theo nghề')
        .addStringOption(o => o.setName('type').setDescription('Nghề').setRequired(true).addChoices(...JOB_CHOICES))),
    handler: { cmdName: 'job', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'top') return ['top', i.options.getString('type')];
      const u = i.options.getUser('user');
      return u ? [u] : [];
    }},
  },
  {
    data: new SlashCommandBuilder().setName('mine').setDescription('Đào mỏ')
      .addStringOption(o => o.setName('zone').setDescription('Zone (mặc định = cao nhất unlock)').setRequired(false).setAutocomplete(true)),
    handler: { cmdName: 'mine', extractArgs: (i) => {
      const z = i.options.getString('zone');
      return z ? [z] : [];
    }},
    autocomplete: 'zone_mining',
  },
  {
    data: new SlashCommandBuilder().setName('fish').setDescription('Câu cá')
      .addStringOption(o => o.setName('zone').setDescription('Zone').setRequired(false).setAutocomplete(true)),
    handler: { cmdName: 'fish', extractArgs: (i) => {
      const z = i.options.getString('zone');
      return z ? [z] : [];
    }},
    autocomplete: 'zone_fishing',
  },
  {
    data: new SlashCommandBuilder().setName('gather').setDescription('Hái lượm (foraging)')
      .addStringOption(o => o.setName('zone').setDescription('Zone (mặc định = cao nhất unlock)').setRequired(false).setAutocomplete(true)),
    handler: { cmdName: 'gather', extractArgs: (i) => {
      const z = i.options.getString('zone');
      return z ? [z] : [];
    }},
    autocomplete: 'zone_foraging',
  },
  {
    data: new SlashCommandBuilder().setName('craft').setDescription('Chế tạo')
      .addSubcommand(s => s.setName('list').setDescription('Xem recipe'))
      .addSubcommand(s => s.setName('make').setDescription('Chế tạo từ recipe')
        .addStringOption(o => o.setName('recipe').setDescription('Recipe ID').setRequired(true).setAutocomplete(true))),
    handler: { cmdName: 'craft', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'list') return ['list'];
      return [i.options.getString('recipe')];
    }},
    autocomplete: 'recipe_craft',
  },
  {
    data: new SlashCommandBuilder().setName('cook').setDescription('Nấu ăn')
      .addSubcommand(s => s.setName('list').setDescription('Xem recipe'))
      .addSubcommand(s => s.setName('make').setDescription('Nấu từ recipe')
        .addStringOption(o => o.setName('recipe').setDescription('Recipe ID').setRequired(true).setAutocomplete(true))),
    handler: { cmdName: 'cook', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'list') return ['list'];
      return [i.options.getString('recipe')];
    }},
    autocomplete: 'recipe_cook',
  },

  // ====== PvP ======
  {
    data: new SlashCommandBuilder().setName('duel').setDescription('PvP đấu với người chơi')
      .addSubcommand(s => s.setName('challenge').setDescription('Thách đấu')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('gold').setDescription('Vàng cược').setRequired(false).setMinValue(0)))
      .addSubcommand(s => s.setName('stats').setDescription('Xem PvP stats')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(false)))
      .addSubcommand(s => s.setName('top').setDescription('BXH PvP'))
      .addSubcommand(s => s.setName('status').setDescription('Xem duel đang chờ')),
    handler: { cmdName: 'duel', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'challenge') {
        const u = i.options.getUser('user');
        const g = i.options.getInteger('gold');
        return g != null ? [u, g] : [u];
      }
      if (sub === 'stats') {
        const u = i.options.getUser('user');
        return u ? [sub, u] : [sub];
      }
      return [sub];
    }},
  },

  // ====== Trade ======
  {
    data: new SlashCommandBuilder().setName('trade').setDescription('Trao đổi item/gold')
      .addSubcommand(s => s.setName('open').setDescription('Mở phiên trade với user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('Xem trade hiện tại'))
      .addSubcommand(s => s.setName('addgold').setDescription('Thêm vàng vào offer')
        .addIntegerOption(o => o.setName('amount').setDescription('Số vàng (set, không cộng dồn)').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('additem').setDescription('Thêm item vào offer')
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('removeitem').setDescription('Bỏ item khỏi offer')
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true)))
      .addSubcommand(s => s.setName('clear').setDescription('Clear toàn bộ offer'))
      .addSubcommand(s => s.setName('ready').setDescription('Đánh dấu sẵn sàng'))
      .addSubcommand(s => s.setName('unready').setDescription('Bỏ ready'))
      .addSubcommand(s => s.setName('cancel').setDescription('Huỷ trade')),
    handler: { cmdName: 'trade', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'open')      return [i.options.getUser('user')];
      if (sub === 'view')      return ['view'];
      if (sub === 'addgold')   return ['add', 'gold', i.options.getInteger('amount')];
      if (sub === 'additem') {
        const qty = i.options.getInteger('qty');
        return qty ? ['add', 'item', i.options.getString('item'), qty] : ['add', 'item', i.options.getString('item')];
      }
      if (sub === 'removeitem') return ['remove', 'item', i.options.getString('item')];
      if (sub === 'clear')     return ['remove', 'all'];
      if (sub === 'ready')     return ['ready'];
      if (sub === 'unready')   return ['unready'];
      if (sub === 'cancel')    return ['cancel'];
      return [];
    }},
    autocomplete: 'item_owned_tradeable',
  },

  // ====== Guild ======
  {
    data: new SlashCommandBuilder().setName('guild').setDescription('Bang hội')
      .addSubcommand(s => s.setName('info').setDescription('Xem bang của mình hoặc bang khác')
        .addStringOption(o => o.setName('query').setDescription('Tag hoặc tên bang').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('create').setDescription('Lập bang (Lv.5, 500 vàng)')
        .addStringOption(o => o.setName('tag').setDescription('Tag 2-5 ký tự').setRequired(true).setMinLength(2).setMaxLength(5))
        .addStringOption(o => o.setName('name').setDescription('Tên bang').setRequired(true).setMinLength(3).setMaxLength(24)))
      .addSubcommand(s => s.setName('invite').setDescription('Mời người chơi vào bang')
        .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
      .addSubcommand(s => s.setName('accept').setDescription('Nhận lời mời')
        .addStringOption(o => o.setName('tag').setDescription('Tag bang').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('decline').setDescription('Từ chối lời mời')
        .addStringOption(o => o.setName('tag').setDescription('Tag bang').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('leave').setDescription('Rời bang'))
      .addSubcommand(s => s.setName('kick').setDescription('Kick thành viên')
        .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true)))
      .addSubcommand(s => s.setName('promote').setDescription('Thăng officer')
        .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true)))
      .addSubcommand(s => s.setName('demote').setDescription('Giáng member')
        .addUserOption(o => o.setName('user').setDescription('Officer').setRequired(true)))
      .addSubcommand(s => s.setName('transfer').setDescription('Nhường bang chủ')
        .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true)))
      .addSubcommand(s => s.setName('disband').setDescription('Giải tán bang (cần xác nhận)')
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận giải tán').setRequired(true)))
      .addSubcommand(s => s.setName('members').setDescription('Danh sách thành viên'))
      .addSubcommand(s => s.setName('top').setDescription('BXH bang hội'))
      .addSubcommand(s => s.setName('motd').setDescription('Đặt thông báo bang')
        .addStringOption(o => o.setName('text').setDescription('Nội dung').setRequired(true)))
      .addSubcommand(s => s.setName('desc').setDescription('Đặt mô tả bang')
        .addStringOption(o => o.setName('text').setDescription('Mô tả').setRequired(true)))
      .addSubcommand(s => s.setName('vault').setDescription('Xem kho chung'))
      .addSubcommand(s => s.setName('buff').setDescription('Xem buff hunt của bang'))
      .addSubcommand(s => s.setName('deposit').setDescription('Gửi vàng/item vào kho')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true)
          .addChoices({ name: 'Vàng', value: 'gold' }, { name: 'Item', value: 'item' }))
        .addIntegerOption(o => o.setName('amount').setDescription('Số vàng hoặc số lượng').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('item').setDescription('Item ID (nếu gửi item)').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('withdraw').setDescription('Rút vàng/item khỏi kho (officer+)')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true)
          .addChoices({ name: 'Vàng', value: 'gold' }, { name: 'Item', value: 'item' }))
        .addIntegerOption(o => o.setName('amount').setDescription('Số vàng hoặc số lượng').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('item').setDescription('Item ID (nếu rút item)').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('building').setDescription('Công trình bang hội')
        .addStringOption(o => o.setName('id').setDescription('hall / library / monument'))
        .addIntegerOption(o => o.setName('amount').setDescription('Vàng cá nhân đóng góp').setMinValue(1))
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận góp không hoàn lại')))
      .addSubcommand(s => s.setName('help').setDescription('Hướng dẫn bang hội')),
    handler: { cmdName: 'guild', extractArgs: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'info') {
        const q = i.options.getString('query');
        return q ? ['info', q] : [];
      }
      if (sub === 'building') {
        const id = i.options.getString('id');
        return id ? ['building', 'contribute', id, String(i.options.getInteger('amount') || ''), i.options.getBoolean('confirm') ? 'confirm' : ''] : ['building'];
      }
      if (sub === 'create') return ['create', i.options.getString('tag'), i.options.getString('name')];
      if (sub === 'invite') return ['invite', i.options.getUser('user')];
      if (sub === 'accept' || sub === 'decline') {
        const tag = i.options.getString('tag');
        return tag ? [sub, tag] : [sub];
      }
      if (sub === 'kick' || sub === 'promote' || sub === 'demote' || sub === 'transfer') {
        return [sub, i.options.getUser('user')];
      }
      if (sub === 'disband') return i.options.getBoolean('confirm') ? ['disband', 'confirm'] : ['disband'];
      if (sub === 'motd' || sub === 'desc') return [sub, i.options.getString('text')];
      if (sub === 'deposit' || sub === 'withdraw') {
        const type = i.options.getString('type');
        const amount = i.options.getInteger('amount');
        const item = i.options.getString('item');
        if (type === 'gold') return [sub, 'gold', amount];
        return [sub, item || 'item', amount];
      }
      return [sub];
    }},
    autocomplete: 'guild_dynamic',
  },

  // ====== Redeem code ======
  {
    data: new SlashCommandBuilder().setName('redeem').setDescription('Nhập code nhận thưởng sự kiện')
      .addStringOption(o => o.setName('code').setDescription('Mã code').setRequired(true)),
    handler: { cmdName: 'redeem', extractArgs: (i) => [i.options.getString('code')] },
  },

  // ====== Nâng cấp vũ khí (+1..+5) ======
  {
    data: new SlashCommandBuilder().setName('upgrade').setDescription('Nâng cấp vũ khí +1..+5')
      .addSubcommand(sc => sc.setName('xem').setDescription('Vũ khí đang mặc, cấp hiện tại, cần gì để lên cấp'))
      .addSubcommand(sc => sc.setName('nangcap').setDescription('Nâng cấp vũ khí đang mặc lên 1 cấp')
        .addStringOption(o => o.setName('item').setDescription('Id vũ khí (mặc định = đang mặc)').setRequired(false)))
      .addSubcommand(sc => sc.setName('bang').setDescription('Bảng chi phí +1..+5 và nguồn nguyên liệu')),
    handler: {
      // Map sang tên subcommand riêng, KHÔNG dùng 'view'/'upgrade': prefix
      // command sẽ hiểu chuỗi 'upgrade' là item id và báo "item không tồn tại".
      cmdName: 'upgrade',
      extractArgs: (i) => {
        const sub = i.options.getSubcommand(false);
        if (sub === 'nangcap') {
          const item = i.options.getString('item');
          if (item) return [item];
          // Bỏ trống item: nâng vũ khí ĐANG MẶC. Phải trả 'nangcap' làm token
          // đầu, nếu trả [] thì lệnh chỉ hiện trạng thái và người dùng tưởng
          // nút hỏng (đã gặp thật khi test).
          return ['nangcap'];
        }
        if (sub === 'bang') return ['list'];
        return ['view'];
      },
    },
  },

  // ====== So sánh 2 món đồ ======
  {
    data: new SlashCommandBuilder().setName('compare')
      .setDescription('So sánh 2 món đồ (bỏ trống món 2 = món đang mặc cùng slot)')
      .addStringOption(o => o.setName('item1').setDescription('Món thứ nhất').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('item2').setDescription('Món thứ hai').setRequired(false).setAutocomplete(true)),
    handler: {
      cmdName: 'compare',
      extractArgs: (i) => {
        const a = i.options.getString('item1');
        const b = i.options.getString('item2');
        return b ? [a, b] : [a];
      },
    },
    autocomplete: 'item_owned',
  },

  // ====== Battle (elite/boss) ======
  {
    data: new SlashCommandBuilder().setName('battle').setDescription('Đánh elite/boss (turn-based, có skill)')
      .addSubcommand(sc => sc.setName('danh_sach').setDescription('Danh sách elite & boss'))
      .addSubcommand(sc => sc.setName('danh').setDescription('Bắt đầu trận với một elite/boss')
        .addStringOption(o => o.setName('mob').setDescription('Id elite/boss').setRequired(true).setAutocomplete(true))),
    handler: {
      cmdName: 'battle',
      extractArgs: (i) => {
        const sub = i.options.getSubcommand(false);
        if (sub === 'danh_sach') return ['list'];
        return [i.options.getString('mob')];
      },
    },
    autocomplete: 'battle_mob',
  },

  // ====== Raid (boss tuần, đánh chung) ======
  {
    data: new SlashCommandBuilder().setName('raid').setDescription('Boss tuần đánh chung cả server')
      .addSubcommand(sc => sc.setName('xem').setDescription('Xem máu boss và lượt đánh còn lại'))
      .addSubcommand(sc => sc.setName('danh').setDescription('Đánh boss (dùng 1 lượt trong 5 lượt/tuần)'))
      .addSubcommand(sc => sc.setName('top').setDescription('BXH sát thương cá nhân'))
      .addSubcommand(sc => sc.setName('bang').setDescription('BXH sát thương theo bang hội'))
      .addSubcommand(sc => sc.setName('thuong').setDescription('Nhận thưởng tuần trước')),
    handler: {
      cmdName: 'raid',
      extractArgs: (i) => {
        const sub = i.options.getSubcommand(true);
        const MAP = { xem: [], danh: ['danh'], top: ['top'], bang: ['bang'], thuong: ['thuong'] };
        return MAP[sub] || [];
      },
    },
  },

  {
    data: new SlashCommandBuilder().setName('story').setDescription('Chính tuyến: chương mở đầu và chương 1')
      .addStringOption(o => o.setName('action').setDescription('Hành động').addChoices(
        { name: 'Xem', value: 'view' }, { name: 'Bắt đầu', value: 'start' },
        { name: 'Nhận thưởng / tiếp tục', value: 'claim' }, { name: 'Sổ hành trình', value: 'journal' })),
    handler: simpleHandler('story', i => {
      const action = i.options.getString('action');
      return !action || action === 'view' ? [] : [action];
    }),
  },
  {
    data: new SlashCommandBuilder().setName('aura').setDescription('Roll aura chiến đấu/nghề bằng vàng')
      .addStringOption(o => o.setName('action').setDescription('Hành động').addChoices(
        ...['help', 'roll', 'accept', 'discard', 'top'].map(value => ({ name: value, value }))))
      .addStringOption(o => o.setName('effect').setDescription('Lọc BXH theo hiệu ứng').addChoices(...Object.keys(require('../game/aura').EFFECTS).map(value => ({ name: value, value }))))
      .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận tiêu 2500 vàng khi roll')),
    handler: simpleHandler('aura', i => {
      const a = i.options.getString('action');
      if (a === 'top') return [a, i.options.getString('effect') || ''];
      return a ? [a, i.options.getBoolean('confirm') ? 'confirm' : ''] : [];
    }),
  },
  {
    data: new SlashCommandBuilder().setName('find').setDescription('Tra nguồn kiếm và công dụng vật phẩm')
      .addStringOption(o => o.setName('query').setDescription('ID hoặc tên vật phẩm').setRequired(true).setMaxLength(80)),
    handler: simpleHandler('find', i => [i.options.getString('query')]),
  },
  {
    data: new SlashCommandBuilder().setName('card').setDescription('Xuất profile card PNG của bạn'),
    handler: simpleHandler('card'),
  },
  {
    data: new SlashCommandBuilder().setName('tower').setDescription('Tháp Canh 15 tầng, thưởng lần đầu, không mất HP/vàng')
      .addStringOption(o => o.setName('action').setDescription('Hành động').addChoices(...['status', 'start', 'leave', 'top', 'help'].map(value => ({ name: value, value }))))
      .addIntegerOption(o => o.setName('floor').setDescription('Tầng muốn luyện lại hoặc tầng kế tiếp').setMinValue(1).setMaxValue(15)),
    handler: simpleHandler('tower', i => {
      const action = i.options.getString('action') || 'status';
      const floor = i.options.getInteger('floor');
      return action === 'start' && floor !== null ? [action, String(floor)] : [action];
    }),
  },
  {
    data: new SlashCommandBuilder().setName('skills').setDescription('Kỹ năng, combo và bộ chiêu theo class')
      .addStringOption(o => o.setName('action').setDescription('Hành động').addChoices(...['list', 'info', 'equip', 'reset', 'events', 'claim', 'presets', 'save', 'load', 'delete'].map(value => ({ name: value, value }))))
      .addStringOption(o => o.setName('ids').setDescription('ID chiêu khi equip; tên bộ khi save/load/delete').setMaxLength(180)),
    handler: simpleHandler('skills', i => [i.options.getString('action') || 'list', ...(i.options.getString('ids') || '').trim().split(/\s+/).filter(Boolean)]),
  },
  // ====== Help ======
  {
    data: new SlashCommandBuilder().setName('help').setDescription('Hướng dẫn các lệnh'),
    handler: simpleHandler('help'),
  },
];

module.exports = { definitions };
