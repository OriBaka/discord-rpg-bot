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

const JOB_CHOICES = [
  { name: 'Mining', value: 'mining' },
  { name: 'Fishing', value: 'fishing' },
  { name: 'Cooking', value: 'cooking' },
  { name: 'Crafting', value: 'crafting' },
];

const definitions = [
  // ====== Player profile ======
  {
    data: new SlashCommandBuilder().setName('start').setDescription('Tạo nhân vật mới'),
    handler: simpleHandler('start'),
  },
  {
    data: new SlashCommandBuilder().setName('me').setDescription('Xem thông tin nhân vật'),
    handler: simpleHandler('me'),
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
    data: new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng theo level'),
    handler: simpleHandler('top'),
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

  // ====== Help ======
  {
    data: new SlashCommandBuilder().setName('help').setDescription('Hướng dẫn các lệnh'),
    handler: simpleHandler('help'),
  },
];

module.exports = { definitions };
