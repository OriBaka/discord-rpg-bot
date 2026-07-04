// Slash command definitions cho admin commands
// Ẩn khỏi non-admin bằng cách set defaultMemberPermissions = Administrator
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// === Choices reuse ===
const CLASS_CHOICES = [
  { name: '⚔️ Melee (Chiến Binh)', value: 'melee' },
  { name: '🔮 Magic (Pháp Sư)', value: 'magic' },
  { name: '🏹 Ranged (Cung Thủ)', value: 'ranged' },
];

const CHANNEL_TYPE_CHOICES = [
  { name: 'Quest', value: 'quest' },
  { name: 'Achievement', value: 'achievement' },
  { name: 'Level up', value: 'levelup' },
  { name: 'Announce', value: 'announce' },
];

const ITEM_TYPE_CHOICES = [
  { name: 'Weapon', value: 'weapon' },
  { name: 'Offhand', value: 'offhand' },
  { name: 'Armor', value: 'armor' },
  { name: 'Accessory', value: 'accessory' },
  { name: 'Consumable', value: 'consumable' },
  { name: 'Material', value: 'material' },
  { name: 'Lootbox', value: 'lootbox' },
  { name: 'Pet', value: 'pet' },
];

const TIER_CHOICES = [
  { name: 'Common', value: 'common' },
  { name: 'Rare', value: 'rare' },
  { name: 'Epic', value: 'epic' },
  { name: 'Legendary', value: 'legendary' },
];

const ARMOR_SLOT_CHOICES = [
  { name: 'Head', value: 'head' },
  { name: 'Chest', value: 'chest' },
  { name: 'Legs', value: 'legs' },
  { name: 'Feet', value: 'feet' },
  { name: 'Hands', value: 'hands' },
];

const ACCESSORY_TYPE_CHOICES = [
  { name: 'Ring', value: 'ring' },
  { name: 'Necklace', value: 'necklace' },
  { name: 'Special', value: 'special' },
];

const IMAGE_TYPE_CHOICES = [
  { name: 'Item', value: 'item' },
  { name: 'Monster/Mob', value: 'mob' },
  { name: 'Zone', value: 'zone' },
  { name: 'Pet', value: 'pet' },
  { name: 'Achievement', value: 'ach' },
];

const REWARD_TYPE_CHOICES = [
  { name: 'Item', value: 'item' },
  { name: 'Pet', value: 'pet' },
  { name: 'Shard', value: 'shard' },
  { name: 'Gold', value: 'gold' },
  { name: 'XP', value: 'xp' },
];

const OBJECTIVE_CHOICES = [
  { name: 'Kill Count (tổng)', value: 'kill_count' },
  { name: 'Kill Monster (loại cụ thể)', value: 'kill_monster' },
  { name: 'Level Reach', value: 'level_reach' },
  { name: 'Gold Total', value: 'gold_total' },
  { name: 'Item Collect', value: 'item_collect' },
  { name: 'Quest Complete', value: 'quest_complete' },
  { name: 'Pet Count', value: 'pet_count' },
  { name: 'Pet Tier', value: 'pet_tier' },
  { name: 'Pet Own', value: 'pet_own' },
];

const QUEST_OBJ_CHOICES = [
  { name: 'Kill (giết quái)', value: 'kill' },
  { name: 'Gold (kiếm vàng)', value: 'gold' },
  { name: 'Level (đạt level)', value: 'level' },
  { name: 'Item (sở hữu item)', value: 'item' },
];

const QUEST_TYPE_CHOICES = [
  { name: 'Custom', value: 'custom' },
  { name: 'Daily', value: 'daily' },
  { name: 'Weekly', value: 'weekly' },
];

const JOB_CHOICES = [
  { name: 'Mining', value: 'mining' },
  { name: 'Fishing', value: 'fishing' },
];

// Helper: ẩn khỏi non-admin
const ADMIN_ONLY = PermissionFlagsBits.Administrator;

const definitions = [
  // ============================================================
  // /adm — Player admin actions
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('adm')
      .setDescription('Admin: quản lý player / class / channel / shop / announce')
      // === Player actions ===
      .addSubcommand(s => s.setName('gold').setDescription('Cộng/trừ vàng của player')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Số vàng (âm để trừ)').setRequired(true)))
      .addSubcommand(s => s.setName('xp').setDescription('Cộng XP')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('XP').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('item').setDescription('Tặng item')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('takeitem').setDescription('Lấy lại item')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('sethp').setDescription('Set HP')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('hp').setDescription('HP').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('heal').setDescription('Hồi đầy HP')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('setlevel').setDescription('Set level')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('Level 1-100').setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName('reset').setDescription('Xóa nhân vật của user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('look').setDescription('Xem chi tiết nhân vật')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('stats').setDescription('Thống kê server'))
      .addSubcommand(s => s.setName('announce').setDescription('Gửi thông báo (vào kênh notify hoặc kênh hiện tại)')
        .addStringOption(o => o.setName('text').setDescription('Nội dung').setRequired(true)))
      .addSubcommand(s => s.setName('cdlist').setDescription('Xem cooldown overrides'))
      .addSubcommand(s => s.setName('cdset').setDescription('Set cooldown override (ms)')
        .addStringOption(o => o.setName('action').setDescription('hunt/heal/mining/fishing/mining_<zone>/...').setRequired(true))
        .addIntegerOption(o => o.setName('ms').setDescription('Milliseconds').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('cdreset').setDescription('Reset 1 cooldown về default')
        .addStringOption(o => o.setName('action').setDescription('action key').setRequired(true)))
      .addSubcommand(s => s.setName('cdresetall').setDescription('Reset toàn bộ cooldown overrides'))
      .addSubcommand(s => s.setName('shopreset').setDescription('⚠️ WIPE shop & reseed với gear/tool mốc 1-50')
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận').setRequired(true))),
    handler: 'adm',
  },

  // ============================================================
  // /admclass — Class management (tách khỏi /adm vì Discord không cho mix sub + group)
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('admclass')
      .setDescription('Admin: quản lý class (lock/unlock/give/take/set)')
      .addSubcommand(s => s.setName('lock').setDescription('Khoá class toàn server')
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES))
        .addStringOption(o => o.setName('reason').setDescription('Lý do').setRequired(false)))
      .addSubcommand(s => s.setName('unlock').setDescription('Mở khoá class')
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES)))
      .addSubcommand(s => s.setName('give').setDescription('Unlock class cho user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES)))
      .addSubcommand(s => s.setName('take').setDescription('Lock class của user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES)))
      .addSubcommand(s => s.setName('set').setDescription('Đổi class chính của user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('class').setDescription('Class').setRequired(true).addChoices(...CLASS_CHOICES))),
    handler: 'admclass',
  },

  // ============================================================
  // /admchannel — Channel notify (tách khỏi /adm)
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('admchannel')
      .setDescription('Admin: quản lý channel notify')
      .addSubcommand(s => s.setName('set').setDescription('Set channel notify')
        .addStringOption(o => o.setName('type').setDescription('Loại notify').setRequired(true).addChoices(...CHANNEL_TYPE_CHOICES))
        .addChannelOption(o => o.setName('channel').setDescription('Kênh (mặc định = channel hiện tại)').setRequired(false)))
      .addSubcommand(s => s.setName('unset').setDescription('Bỏ channel notify')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(...CHANNEL_TYPE_CHOICES)))
      .addSubcommand(s => s.setName('list').setDescription('Xem các channel đã set')),
    handler: 'admchannel',
  },

  // ============================================================
  // /shopadm — Shop management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('shopadm')
      .setDescription('Admin: quản lý shop')
      .addSubcommand(s => s.setName('add').setDescription('Thêm item vào shop')
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('price').setDescription('Giá (mặc định = giá item)').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('remove').setDescription('Xoá item khỏi shop')
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('setprice').setDescription('Đổi giá item trong shop')
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('price').setDescription('Giá mới').setRequired(true).setMinValue(1))),
    handler: 'shopadm',
  },

  // ============================================================
  // /itemadm — Item CRUD
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('itemadm')
      .setDescription('Admin: tạo/sửa item')
      .addSubcommand(s => s.setName('create').setDescription('Tạo item mới')
        .addStringOption(o => o.setName('id').setDescription('ID duy nhất').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên hiển thị').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(...ITEM_TYPE_CHOICES))
        .addStringOption(o => o.setName('tier').setDescription('Độ hiếm').setRequired(false).addChoices(...TIER_CHOICES))
        .addIntegerOption(o => o.setName('atk').setDescription('ATK bonus').setRequired(false))
        .addIntegerOption(o => o.setName('def').setDescription('DEF bonus').setRequired(false))
        .addIntegerOption(o => o.setName('heal').setDescription('Heal (cho consumable)').setRequired(false))
        .addIntegerOption(o => o.setName('price').setDescription('Giá mua').setRequired(false).setMinValue(0))
        .addIntegerOption(o => o.setName('sell').setDescription('Giá bán').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false))
        .addStringOption(o => o.setName('class_req').setDescription('Class yêu cầu').setRequired(false).addChoices(...CLASS_CHOICES))
        .addStringOption(o => o.setName('armor_slot').setDescription('Slot armor (bắt buộc nếu type=armor)').setRequired(false).addChoices(...ARMOR_SLOT_CHOICES))
        .addStringOption(o => o.setName('accessory_type').setDescription('Loại accessory (bắt buộc nếu type=accessory)').setRequired(false).addChoices(...ACCESSORY_TYPE_CHOICES))
        .addStringOption(o => o.setName('weapon_type').setDescription('Loại vũ khí (sword/bow/staff...)').setRequired(false))
        .addBooleanOption(o => o.setName('soulbound').setDescription('Cấm trade').setRequired(false))
        .addStringOption(o => o.setName('image_url').setDescription('URL ảnh').setRequired(false)))
      .addSubcommand(s => s.setName('edit').setDescription('Sửa item')
        .addStringOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('name').setDescription('Tên mới').setRequired(false))
        .addIntegerOption(o => o.setName('atk').setDescription('ATK').setRequired(false))
        .addIntegerOption(o => o.setName('def').setDescription('DEF').setRequired(false))
        .addIntegerOption(o => o.setName('heal').setDescription('Heal').setRequired(false))
        .addIntegerOption(o => o.setName('price').setDescription('Giá mua').setRequired(false).setMinValue(0))
        .addIntegerOption(o => o.setName('sell').setDescription('Giá bán').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('tier').setDescription('Tier').setRequired(false).addChoices(...TIER_CHOICES))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false))
        .addBooleanOption(o => o.setName('soulbound').setDescription('Cấm trade').setRequired(false))
        .addStringOption(o => o.setName('image_url').setDescription('URL ảnh').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá item')
        .addStringOption(o => o.setName('id').setDescription('Item ID').setRequired(true).setAutocomplete(true))),
    handler: 'itemadm',
  },

  // ============================================================
  // /mobadm — Monster CRUD
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('mobadm')
      .setDescription('Admin: quản lý quái vật & zone')
      .addSubcommand(s => s.setName('create').setDescription('Tạo quái')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addStringOption(o => o.setName('zone').setDescription('Zone ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('hp').setDescription('HP').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('atk').setDescription('ATK').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('def').setDescription('DEF').setRequired(false))
        .addIntegerOption(o => o.setName('xp').setDescription('XP thưởng').setRequired(false))
        .addStringOption(o => o.setName('gold').setDescription('Gold range "min-max" (vd: 20-50)').setRequired(false))
        .addIntegerOption(o => o.setName('weight').setDescription('Weight spawn').setRequired(false)))
      .addSubcommand(s => s.setName('edit').setDescription('Sửa quái')
        .addStringOption(o => o.setName('id').setDescription('Monster ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(false))
        .addIntegerOption(o => o.setName('hp').setDescription('HP').setRequired(false))
        .addIntegerOption(o => o.setName('atk').setDescription('ATK').setRequired(false))
        .addIntegerOption(o => o.setName('def').setDescription('DEF').setRequired(false))
        .addIntegerOption(o => o.setName('xp').setDescription('XP').setRequired(false))
        .addStringOption(o => o.setName('gold').setDescription('Gold range').setRequired(false))
        .addIntegerOption(o => o.setName('weight').setDescription('Weight').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá quái')
        .addStringOption(o => o.setName('id').setDescription('Monster ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('drop').setDescription('Thêm drop cho quái')
        .addStringOption(o => o.setName('mob').setDescription('Monster ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addNumberOption(o => o.setName('chance').setDescription('Tỷ lệ 0-1').setRequired(true).setMinValue(0).setMaxValue(1))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('undrop').setDescription('Xoá drop')
        .addStringOption(o => o.setName('mob').setDescription('Monster ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))),
    handler: 'mobadm',
  },

  // ============================================================
  // /mobzone — Zone management (tách khỏi /mobadm)
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('mobzone')
      .setDescription('Admin: quản lý zone quái')
      .addSubcommand(s => s.setName('create').setDescription('Tạo zone mới')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addIntegerOption(o => o.setName('minlv').setDescription('Level yêu cầu').setRequired(false).setMinValue(1))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false)))
      .addSubcommand(s => s.setName('edit').setDescription('Sửa zone')
        .addStringOption(o => o.setName('id').setDescription('Zone ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(false))
        .addIntegerOption(o => o.setName('minlv').setDescription('Level').setRequired(false).setMinValue(1))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá zone')
        .addStringOption(o => o.setName('id').setDescription('Zone ID').setRequired(true).setAutocomplete(true))),
    handler: 'mobzone',
  },

  // ============================================================
  // /questadm — Quest management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('questadm')
      .setDescription('Admin: quản lý quest')
      .addSubcommand(s => s.setName('create').setDescription('Tạo quest')
        .addStringOption(o => o.setName('id').setDescription('Quest ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addStringOption(o => o.setName('obj').setDescription('Objective').setRequired(true).addChoices(...QUEST_OBJ_CHOICES))
        .addIntegerOption(o => o.setName('qty').setDescription('Target quantity').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(false).addChoices(...QUEST_TYPE_CHOICES))
        .addStringOption(o => o.setName('target').setDescription('Target ID (item/mob) — để trống = bất kỳ').setRequired(false))
        .addIntegerOption(o => o.setName('gold').setDescription('Reward gold').setRequired(false).setMinValue(0))
        .addIntegerOption(o => o.setName('xp').setDescription('Reward XP').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('item').setDescription('Reward items "id:qty,id:qty"').setRequired(false))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá quest')
        .addStringOption(o => o.setName('id').setDescription('Quest ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('reroll').setDescription('Random lại daily quest của user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(s => s.setName('assign').setDescription('Giao quest cho user')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Quest ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('List tất cả quest')),
    handler: 'questadm',
  },

  // ============================================================
  // /achadm — Achievement management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('achadm')
      .setDescription('Admin: quản lý achievement')
      .addSubcommand(s => s.setName('create').setDescription('Tạo achievement')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addStringOption(o => o.setName('obj').setDescription('Objective').setRequired(true).addChoices(...OBJECTIVE_CHOICES))
        .addIntegerOption(o => o.setName('qty').setDescription('Target quantity').setRequired(true).setMinValue(1))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false))
        .addStringOption(o => o.setName('icon').setDescription('Icon emoji').setRequired(false))
        .addStringOption(o => o.setName('target').setDescription('Target ID (item/mob/pet)').setRequired(false))
        .addIntegerOption(o => o.setName('points').setDescription('Điểm').setRequired(false).setMinValue(0))
        .addIntegerOption(o => o.setName('gold').setDescription('Reward gold').setRequired(false).setMinValue(0))
        .addIntegerOption(o => o.setName('xp').setDescription('Reward XP').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('item').setDescription('Reward items "id:qty,..."').setRequired(false))
        .addStringOption(o => o.setName('title').setDescription('Title thưởng').setRequired(false))
        .addBooleanOption(o => o.setName('hidden').setDescription('Ẩn khỏi list').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá achievement')
        .addStringOption(o => o.setName('id').setDescription('Ach ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('grant').setDescription('Grant thủ công')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Ach ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('List tất cả achievements'))
      .addSubcommand(s => s.setName('debug').setDescription('Debug 1 achievement')
        .addStringOption(o => o.setName('id').setDescription('Ach ID').setRequired(true).setAutocomplete(true))
        .addUserOption(o => o.setName('user').setDescription('User (mặc định = mình)').setRequired(false))),
    handler: 'achadm',
  },

  // ============================================================
  // /petadm — Pet management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('petadm')
      .setDescription('Admin: quản lý pet')
      .addSubcommand(s => s.setName('create').setDescription('Tạo pet')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addStringOption(o => o.setName('tier').setDescription('Tier').setRequired(false).addChoices(...TIER_CHOICES))
        .addStringOption(o => o.setName('icon').setDescription('Emoji').setRequired(false))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false))
        .addIntegerOption(o => o.setName('atk').setDescription('ATK bonus').setRequired(false))
        .addIntegerOption(o => o.setName('def').setDescription('DEF bonus').setRequired(false))
        .addIntegerOption(o => o.setName('hp').setDescription('HP bonus').setRequired(false))
        .addIntegerOption(o => o.setName('gold').setDescription('Gold % bonus').setRequired(false))
        .addIntegerOption(o => o.setName('xp').setDescription('XP % bonus').setRequired(false))
        .addIntegerOption(o => o.setName('drop').setDescription('Drop % bonus').setRequired(false))
        .addStringOption(o => o.setName('shard').setDescription('Shard ID để ghép').setRequired(false))
        .addIntegerOption(o => o.setName('shard_qty').setDescription('Số shard cần').setRequired(false).setMinValue(1))
        .addBooleanOption(o => o.setName('hidden').setDescription('Ẩn khỏi collection').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá pet')
        .addStringOption(o => o.setName('id').setDescription('Pet ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('give').setDescription('Tặng pet')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Pet ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('giveshard').setDescription('Tặng shard')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption(o => o.setName('id').setDescription('Shard ID').setRequired(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('drop').setDescription('Thêm drop pet/shard cho quái')
        .addStringOption(o => o.setName('mob').setDescription('Monster ID').setRequired(true).setAutocomplete(true))
        .addNumberOption(o => o.setName('chance').setDescription('Tỷ lệ 0-1').setRequired(true).setMinValue(0).setMaxValue(1))
        .addStringOption(o => o.setName('pet').setDescription('Pet ID (nếu drop pet trực tiếp)').setRequired(false).setAutocomplete(true))
        .addStringOption(o => o.setName('shard').setDescription('Shard ID (nếu drop shard)').setRequired(false))
        .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('undrop').setDescription('Xoá drop')
        .addStringOption(o => o.setName('mob').setDescription('Monster ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('id').setDescription('Pet/Shard ID').setRequired(true)))
      .addSubcommand(s => s.setName('drops').setDescription('Xem toàn bộ drop table')
        .addStringOption(o => o.setName('mob').setDescription('Lọc theo mob').setRequired(false).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('List all pets'))
      .addSubcommand(s => s.setName('resetdrops').setDescription('⚠️ Reset drop table về default')
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận').setRequired(true)))
      .addSubcommand(s => s.setName('cleanup').setDescription('⚠️ Xoá pet thừa khỏi DB')
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận').setRequired(true)))
      .addSubcommand(s => s.setName('nuke').setDescription('💣 NUKE reseed từ đầu')
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận').setRequired(true))),
    handler: 'petadm',
  },

  // ============================================================
  // /gzadm — Gather zone management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('gzadm')
      .setDescription('Admin: quản lý mining/fishing zones')
      .addSubcommand(s => s.setName('create').setDescription('Tạo zone')
        .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
        .addStringOption(o => o.setName('job').setDescription('Job').setRequired(true).addChoices(...JOB_CHOICES))
        .addStringOption(o => o.setName('icon').setDescription('Emoji').setRequired(false))
        .addIntegerOption(o => o.setName('minlv').setDescription('Job level yêu cầu').setRequired(false).setMinValue(1))
        .addIntegerOption(o => o.setName('cd').setDescription('Cooldown (ms)').setRequired(false).setMinValue(1000))
        .addIntegerOption(o => o.setName('xp').setDescription('Base XP').setRequired(false).setMinValue(1))
        .addStringOption(o => o.setName('desc').setDescription('Mô tả').setRequired(false)))
      .addSubcommand(s => s.setName('delete').setDescription('Xoá zone')
        .addStringOption(o => o.setName('id').setDescription('Zone ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('drop').setDescription('Thêm drop cho zone')
        .addStringOption(o => o.setName('zone').setDescription('Zone ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true))
        .addNumberOption(o => o.setName('chance').setDescription('Tỷ lệ 0-1').setRequired(true).setMinValue(0).setMaxValue(1))
        .addIntegerOption(o => o.setName('qmin').setDescription('Qty min').setRequired(false).setMinValue(1))
        .addIntegerOption(o => o.setName('qmax').setDescription('Qty max').setRequired(false).setMinValue(1)))
      .addSubcommand(s => s.setName('undrop').setDescription('Xoá drop')
        .addStringOption(o => o.setName('zone').setDescription('Zone ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('item').setDescription('Item ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('List zones')
        .addStringOption(o => o.setName('job').setDescription('Lọc theo job').setRequired(false).addChoices(...JOB_CHOICES))),
    handler: 'gzadm',
  },

  // ============================================================
  // /recipeadm — Recipe (craft & cook)
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('recipeadm')
      .setDescription('Admin: quản lý recipe craft & cook')
      .addSubcommandGroup(g => g.setName('craft').setDescription('Craft recipes')
        .addSubcommand(s => s.setName('create').setDescription('Tạo craft recipe')
          .addStringOption(o => o.setName('id').setDescription('Recipe ID').setRequired(true))
          .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
          .addStringOption(o => o.setName('output').setDescription('Output item ID').setRequired(true).setAutocomplete(true))
          .addStringOption(o => o.setName('inputs').setDescription('Format: "id:qty,id:qty"').setRequired(true))
          .addIntegerOption(o => o.setName('minlv').setDescription('Crafting level yêu cầu').setRequired(false).setMinValue(1))
          .addIntegerOption(o => o.setName('qty').setDescription('Output qty').setRequired(false).setMinValue(1))
          .addIntegerOption(o => o.setName('xp').setDescription('XP thưởng').setRequired(false).setMinValue(0)))
        .addSubcommand(s => s.setName('delete').setDescription('Xoá craft recipe')
          .addStringOption(o => o.setName('id').setDescription('Recipe ID').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all craft recipes')))
      .addSubcommandGroup(g => g.setName('cook').setDescription('Cook recipes')
        .addSubcommand(s => s.setName('create').setDescription('Tạo cook recipe')
          .addStringOption(o => o.setName('id').setDescription('Recipe ID').setRequired(true))
          .addStringOption(o => o.setName('name').setDescription('Tên').setRequired(true))
          .addStringOption(o => o.setName('output').setDescription('Output item ID').setRequired(true).setAutocomplete(true))
          .addStringOption(o => o.setName('inputs').setDescription('Format: "id:qty,id:qty"').setRequired(true))
          .addIntegerOption(o => o.setName('minlv').setDescription('Cooking level yêu cầu').setRequired(false).setMinValue(1))
          .addIntegerOption(o => o.setName('qty').setDescription('Output qty').setRequired(false).setMinValue(1))
          .addIntegerOption(o => o.setName('xp').setDescription('XP thưởng').setRequired(false).setMinValue(0)))
        .addSubcommand(s => s.setName('delete').setDescription('Xoá cook recipe')
          .addStringOption(o => o.setName('id').setDescription('Recipe ID').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('list').setDescription('List all cook recipes'))),
    handler: 'recipeadm',
  },

  // ============================================================
  // /lbadm — Lootbox management
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('lbadm')
      .setDescription('Admin: quản lý lootbox nội dung')
      .addSubcommand(s => s.setName('view').setDescription('Xem nội dung lootbox')
        .addStringOption(o => o.setName('id').setDescription('Lootbox ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('add').setDescription('Thêm reward vào lootbox')
        .addStringOption(o => o.setName('id').setDescription('Lootbox ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('type').setDescription('Reward type').setRequired(true).addChoices(...REWARD_TYPE_CHOICES))
        .addIntegerOption(o => o.setName('qmin').setDescription('Qty min').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('qmax').setDescription('Qty max').setRequired(true).setMinValue(1))
        .addIntegerOption(o => o.setName('weight').setDescription('Weight (bỏ qua nếu guaranteed)').setRequired(false).setMinValue(0))
        .addStringOption(o => o.setName('reward_id').setDescription('Reward ID (cho item/pet/shard)').setRequired(false).setAutocomplete(true))
        .addBooleanOption(o => o.setName('guaranteed').setDescription('Luôn cấp').setRequired(false)))
      .addSubcommand(s => s.setName('remove').setDescription('Xoá reward')
        .addStringOption(o => o.setName('id').setDescription('Lootbox ID').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true).addChoices(...REWARD_TYPE_CHOICES))
        .addStringOption(o => o.setName('reward_id').setDescription('Reward ID').setRequired(false)))
      .addSubcommand(s => s.setName('clear').setDescription('Clear all rewards')
        .addStringOption(o => o.setName('id').setDescription('Lootbox ID').setRequired(true).setAutocomplete(true))
        .addBooleanOption(o => o.setName('confirm').setDescription('Xác nhận').setRequired(true)))
      .addSubcommand(s => s.setName('simulate').setDescription('Mô phỏng mở lootbox')
        .addStringOption(o => o.setName('id').setDescription('Lootbox ID').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('rolls').setDescription('Số lần').setRequired(false).setMinValue(1).setMaxValue(50))),
    handler: 'lbadm',
  },

  // ============================================================
  // /setimageadm — Set image
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('setimageadm')
      .setDescription('Admin: gán ảnh cho entity')
      .addSubcommand(s => s.setName('set').setDescription('Set ảnh')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(...IMAGE_TYPE_CHOICES))
        .addStringOption(o => o.setName('id').setDescription('Entity ID').setRequired(true))
        .addStringOption(o => o.setName('url').setDescription('URL ảnh (permalink GitHub cũng OK)').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Xoá ảnh')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(...IMAGE_TYPE_CHOICES))
        .addStringOption(o => o.setName('id').setDescription('Entity ID').setRequired(true)))
      .addSubcommand(s => s.setName('check').setDescription('Preview ảnh hiện tại')
        .addStringOption(o => o.setName('type').setDescription('Loại').setRequired(true).addChoices(...IMAGE_TYPE_CHOICES))
        .addStringOption(o => o.setName('id').setDescription('Entity ID').setRequired(true))),
    handler: 'setimageadm',
  },

  // ============================================================
  // /slashadm — Slash command deployment
  // ============================================================
  {
    data: new SlashCommandBuilder()
      .setName('slashadm')
      .setDescription('Admin: quản lý slash command deployment')
      .addSubcommand(s => s.setName('list').setDescription('List slash commands đã deploy'))
      .addSubcommand(s => s.setName('redeploy').setDescription('Deploy lại slash commands'))
      .addSubcommand(s => s.setName('clearglobal').setDescription('Xoá toàn bộ slash global (fix duplicate)'))
      .addSubcommand(s => s.setName('clearguild').setDescription('Xoá slash của server này')),
    handler: 'slashadm',
  },
];

module.exports = { definitions };
