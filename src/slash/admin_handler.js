// Handler cho admin slash commands
// Dùng adapter pattern giống player slash, nhưng xử lý riêng vì tương tác admin phức tạp hơn
const { wrap } = require('./adapter');

// Format các option thành args cho prefix command handler
// Return { cmdName, args } tương ứng để pass vào client.commands.get(cmdName).execute()

function boolFlag(v) { return v === true ? 'true' : (v === false ? 'false' : null); }

// Build KV string cho các command dùng key=value syntax
function kvString(obj) {
  return Object.entries(obj)
    .filter(([_, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      // Nếu value có space → wrap trong quote
      const s = String(v);
      if (/\s/.test(s)) return `${k}="${s}"`;
      return `${k}=${s}`;
    })
    .join(' ');
}

// ============================================================
// Routers per slash command
// ============================================================

// /adm — Player admin actions (dùng lệnh %admin ...)
function routeAdm(interaction) {
  const sub = interaction.options.getSubcommand();

  // === Player actions (no group) ===
  const u = interaction.options.getUser('user');
  const uArg = u ? u : null;

  switch (sub) {
    case 'gold':
      return { cmdName: 'admin', args: ['gold', uArg, interaction.options.getInteger('amount')], _users: [u] };
    case 'xp':
      return { cmdName: 'admin', args: ['xp', uArg, interaction.options.getInteger('amount')], _users: [u] };
    case 'item': {
      const qty = interaction.options.getInteger('qty');
      const args = ['item', uArg, interaction.options.getString('id')];
      if (qty) args.push(qty);
      return { cmdName: 'admin', args, _users: [u] };
    }
    case 'takeitem': {
      const qty = interaction.options.getInteger('qty');
      const args = ['takeitem', uArg, interaction.options.getString('id')];
      if (qty) args.push(qty);
      return { cmdName: 'admin', args, _users: [u] };
    }
    case 'sethp':
      return { cmdName: 'admin', args: ['sethp', uArg, interaction.options.getInteger('hp')], _users: [u] };
    case 'heal':
      return { cmdName: 'admin', args: ['heal', uArg], _users: [u] };
    case 'setlevel':
      return { cmdName: 'admin', args: ['setlevel', uArg, interaction.options.getInteger('level')], _users: [u] };
    case 'reset':
      return { cmdName: 'admin', args: ['reset', uArg], _users: [u] };
    case 'look':
      return { cmdName: 'admin', args: ['look', uArg], _users: [u] };
    case 'stats':
      return { cmdName: 'admin', args: ['stats'] };
    case 'announce': {
      const text = interaction.options.getString('text');
      return { cmdName: 'admin', args: ['announce', ...text.split(' ')] };
    }
    case 'cdlist':
      return { cmdName: 'admin', args: ['cd', 'list'] };
    case 'cdset': {
      const action = interaction.options.getString('action');
      const ms = interaction.options.getInteger('ms');
      return { cmdName: 'admin', args: ['cd', 'set', action, String(ms)] };
    }
    case 'cdreset': {
      const action = interaction.options.getString('action');
      return { cmdName: 'admin', args: ['cd', 'reset', action] };
    }
    case 'cdresetall':
      return { cmdName: 'admin', args: ['cd', 'resetall'] };
    case 'shopreset': {
      const confirm = interaction.options.getBoolean('confirm');
      return { cmdName: 'admin', args: ['shopreset', confirm ? 'confirm' : ''] };
    }
  }
}

// /admclass — Class management (dùng %admin classlock/classunlock/giveclass/takeclass/setclass)
function routeAdmclass(interaction) {
  const sub = interaction.options.getSubcommand();
  const cls = interaction.options.getString('class');

  if (sub === 'lock') {
    const reason = interaction.options.getString('reason') || '';
    return { cmdName: 'admin', args: ['classlock', cls, ...reason.split(' ').filter(Boolean)] };
  }
  if (sub === 'unlock') {
    return { cmdName: 'admin', args: ['classunlock', cls] };
  }
  if (sub === 'give') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'admin', args: ['giveclass', u, cls], _users: [u] };
  }
  if (sub === 'take') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'admin', args: ['takeclass', u, cls], _users: [u] };
  }
  if (sub === 'set') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'admin', args: ['setclass', u, cls], _users: [u] };
  }
}

// /admchannel — Channel notify (dùng %admin channel set/unset/list)
function routeAdmchannel(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') return { cmdName: 'admin', args: ['channel', 'list'] };
  const type = interaction.options.getString('type');
  if (sub === 'set') {
    const ch = interaction.options.getChannel('channel');
    return {
      cmdName: 'admin',
      args: ['channel', 'set', type, ch ? `<#${ch.id}>` : ''],
      _channels: ch ? [ch] : [],
    };
  }
  if (sub === 'unset') {
    return { cmdName: 'admin', args: ['channel', 'unset', type] };
  }
}

// /shopadm — Shop management (dùng %shop add/remove/setprice)
function routeShopadm(interaction) {
  const sub = interaction.options.getSubcommand();
  const item = interaction.options.getString('item');
  const price = interaction.options.getInteger('price');

  if (sub === 'add') {
    const args = ['add', item];
    if (price != null) args.push(price);
    return { cmdName: 'shop', args };
  }
  if (sub === 'remove') return { cmdName: 'shop', args: ['remove', item] };
  if (sub === 'setprice') return { cmdName: 'shop', args: ['setprice', item, price] };
}

// /itemadm — Item CRUD (dùng %item create/edit/delete)
function routeItemadm(interaction) {
  const sub = interaction.options.getSubcommand();
  const id = interaction.options.getString('id');

  if (sub === 'delete') return { cmdName: 'item', args: ['delete', id] };

  // create / edit: build KV string
  const kv = {
    name: interaction.options.getString('name'),
    type: interaction.options.getString('type'),
    tier: interaction.options.getString('tier'),
    atk: interaction.options.getInteger('atk'),
    def: interaction.options.getInteger('def'),
    heal: interaction.options.getInteger('heal'),
    price: interaction.options.getInteger('price'),
    sell: interaction.options.getInteger('sell'),
    desc: interaction.options.getString('desc'),
    class_req: interaction.options.getString('class_req'),
    armor_slot: interaction.options.getString('armor_slot'),
    accessory_type: interaction.options.getString('accessory_type'),
    weapon_type: interaction.options.getString('weapon_type'),
    soulbound: boolFlag(interaction.options.getBoolean('soulbound')),
    image_url: interaction.options.getString('image_url'),
  };
  const kvStr = kvString(kv);
  return { cmdName: 'item', args: [sub, id, ...kvStr.split(/\s+/).filter(Boolean)], _rawContent: `%item ${sub} ${id} ${kvStr}` };
}

// /mobadm — Monster & Zone CRUD
function routeMobadm(interaction) {
  const sub = interaction.options.getSubcommand();

  // Monster
  if (sub === 'delete') return { cmdName: 'mob', args: ['delete', interaction.options.getString('id')] };

  if (sub === 'drop') {
    const mob = interaction.options.getString('mob');
    const item = interaction.options.getString('item');
    const chance = interaction.options.getNumber('chance');
    const qty = interaction.options.getInteger('qty') || 1;
    return { cmdName: 'mob', args: ['drop', mob, item, String(chance), String(qty)] };
  }

  if (sub === 'undrop') {
    return { cmdName: 'mob', args: ['undrop', interaction.options.getString('mob'), interaction.options.getString('item')] };
  }

  // create / edit
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    zone: interaction.options.getString('zone'),
    hp: interaction.options.getInteger('hp'),
    atk: interaction.options.getInteger('atk'),
    def: interaction.options.getInteger('def'),
    xp: interaction.options.getInteger('xp'),
    gold: interaction.options.getString('gold'),
    weight: interaction.options.getInteger('weight'),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'mob',
    args: [sub, id],
    _rawContent: `%mob ${sub} ${id} ${kvStr}`,
  };
}

// /mobzone — Zone management (tách khỏi /mobadm vì Discord không cho mix sub + group)
function routeMobzone(interaction) {
  const sub = interaction.options.getSubcommand();
  const id = interaction.options.getString('id');
  if (sub === 'delete') return { cmdName: 'mob', args: ['zone', 'delete', id] };
  const kv = {
    name: interaction.options.getString('name'),
    minlv: interaction.options.getInteger('minlv'),
    desc: interaction.options.getString('desc'),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'mob',
    args: ['zone', sub, id],
    _rawContent: `%mob zone ${sub} ${id} ${kvStr}`,
  };
}

// /questadm
function routeQuestadm(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'delete') return { cmdName: 'quest', args: ['admin', 'delete', interaction.options.getString('id')] };
  if (sub === 'list') return { cmdName: 'quest', args: ['admin', 'list'] };
  if (sub === 'reroll') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'quest', args: ['admin', 'reroll', u], _users: [u] };
  }
  if (sub === 'assign') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'quest', args: ['admin', 'assign', u, interaction.options.getString('id')], _users: [u] };
  }

  // create
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    obj: interaction.options.getString('obj'),
    qty: interaction.options.getInteger('qty'),
    type: interaction.options.getString('type'),
    target: interaction.options.getString('target'),
    gold: interaction.options.getInteger('gold'),
    xp: interaction.options.getInteger('xp'),
    item: interaction.options.getString('item'),
    desc: interaction.options.getString('desc'),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'quest',
    args: ['admin', 'create', id],
    _rawContent: `%quest admin create ${id} ${kvStr}`,
  };
}

// /achadm
function routeAchadm(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'delete') return { cmdName: 'ach', args: ['admin', 'delete', interaction.options.getString('id')] };
  if (sub === 'list') return { cmdName: 'ach', args: ['admin', 'list'] };
  if (sub === 'grant') {
    const u = interaction.options.getUser('user');
    return { cmdName: 'ach', args: ['admin', 'grant', u, interaction.options.getString('id')], _users: [u] };
  }
  if (sub === 'debug') {
    const u = interaction.options.getUser('user');
    const args = ['achdebug', interaction.options.getString('id')];
    if (u) args.push(u);
    return { cmdName: 'achdebug', args: [interaction.options.getString('id'), ...(u ? [u] : [])], _users: u ? [u] : [] };
  }

  // create
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    obj: interaction.options.getString('obj'),
    qty: interaction.options.getInteger('qty'),
    desc: interaction.options.getString('desc'),
    icon: interaction.options.getString('icon'),
    target: interaction.options.getString('target'),
    points: interaction.options.getInteger('points'),
    gold: interaction.options.getInteger('gold'),
    xp: interaction.options.getInteger('xp'),
    item: interaction.options.getString('item'),
    title: interaction.options.getString('title'),
    hidden: boolFlag(interaction.options.getBoolean('hidden')),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'ach',
    args: ['admin', 'create', id],
    _rawContent: `%ach admin create ${id} ${kvStr}`,
  };
}

// /petadm
function routePetadm(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') return { cmdName: 'pet', args: ['admin', 'list'] };
  if (sub === 'delete') return { cmdName: 'pet', args: ['admin', 'delete', interaction.options.getString('id')] };
  if (sub === 'drops') {
    const mob = interaction.options.getString('mob');
    return { cmdName: 'pet', args: mob ? ['admin', 'drops', mob] : ['admin', 'drops'] };
  }
  if (sub === 'give') {
    const u = interaction.options.getUser('user');
    const qty = interaction.options.getInteger('qty') || 1;
    return { cmdName: 'pet', args: ['admin', 'give', u, interaction.options.getString('id'), qty], _users: [u] };
  }
  if (sub === 'giveshard') {
    const u = interaction.options.getUser('user');
    const qty = interaction.options.getInteger('qty') || 1;
    return { cmdName: 'pet', args: ['admin', 'giveshard', u, interaction.options.getString('id'), qty], _users: [u] };
  }
  if (sub === 'drop') {
    const mob = interaction.options.getString('mob');
    const chance = interaction.options.getNumber('chance');
    const pet = interaction.options.getString('pet');
    const shard = interaction.options.getString('shard');
    const qty = interaction.options.getInteger('qty') || 1;
    const kvParts = [];
    if (pet) kvParts.push(`pet=${pet}`);
    if (shard) kvParts.push(`shard=${shard}`);
    kvParts.push(`chance=${chance}`);
    kvParts.push(`qty=${qty}`);
    return {
      cmdName: 'pet',
      args: ['admin', 'drop', mob],
      _rawContent: `%pet admin drop ${mob} ${kvParts.join(' ')}`,
    };
  }
  if (sub === 'undrop') {
    return { cmdName: 'pet', args: ['admin', 'undrop', interaction.options.getString('mob'), interaction.options.getString('id')] };
  }
  if (sub === 'resetdrops') {
    if (!interaction.options.getBoolean('confirm')) {
      return { _directReply: '❌ Cần tick `confirm=True` để reset drops.' };
    }
    return { cmdName: 'pet', args: ['admin', 'resetdrops', 'confirm'] };
  }
  if (sub === 'cleanup') {
    if (!interaction.options.getBoolean('confirm')) {
      return { _directReply: '❌ Cần tick `confirm=True` để cleanup.' };
    }
    return { cmdName: 'pet', args: ['admin', 'cleanup', 'confirm'] };
  }
  if (sub === 'nuke') {
    if (!interaction.options.getBoolean('confirm')) {
      return { _directReply: '❌ Cần tick `confirm=True` để nuke.' };
    }
    return { cmdName: 'pet', args: ['admin', 'nuke', 'confirm'] };
  }

  // create
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    tier: interaction.options.getString('tier'),
    icon: interaction.options.getString('icon'),
    desc: interaction.options.getString('desc'),
    atk: interaction.options.getInteger('atk'),
    def: interaction.options.getInteger('def'),
    hp: interaction.options.getInteger('hp'),
    gold: interaction.options.getInteger('gold'),
    xp: interaction.options.getInteger('xp'),
    drop: interaction.options.getInteger('drop'),
    shard: interaction.options.getString('shard'),
    shard_qty: interaction.options.getInteger('shard_qty'),
    hidden: boolFlag(interaction.options.getBoolean('hidden')),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'pet',
    args: ['admin', 'create', id],
    _rawContent: `%pet admin create ${id} ${kvStr}`,
  };
}

// /gzadm
function routeGzadm(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'delete') return { cmdName: 'gatherzone', args: ['delete', interaction.options.getString('id')] };
  if (sub === 'list') {
    const job = interaction.options.getString('job');
    return { cmdName: 'gatherzone', args: job ? ['list', job] : ['list'] };
  }
  if (sub === 'drop') {
    const zone = interaction.options.getString('zone');
    const item = interaction.options.getString('item');
    const chance = interaction.options.getNumber('chance');
    const qmin = interaction.options.getInteger('qmin');
    const qmax = interaction.options.getInteger('qmax');
    const parts = [`chance=${chance}`];
    if (qmin != null) parts.push(`qmin=${qmin}`);
    if (qmax != null) parts.push(`qmax=${qmax}`);
    return {
      cmdName: 'gatherzone',
      args: ['drop', zone, item],
      _rawContent: `%gz drop ${zone} ${item} ${parts.join(' ')}`,
    };
  }
  if (sub === 'undrop') {
    return { cmdName: 'gatherzone', args: ['undrop', interaction.options.getString('zone'), interaction.options.getString('item')] };
  }

  // create
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    job: interaction.options.getString('job'),
    icon: interaction.options.getString('icon'),
    minlv: interaction.options.getInteger('minlv'),
    cd: interaction.options.getInteger('cd'),
    xp: interaction.options.getInteger('xp'),
    desc: interaction.options.getString('desc'),
  };
  const kvStr = kvString(kv);
  return {
    cmdName: 'gatherzone',
    args: ['create', id],
    _rawContent: `%gz create ${id} ${kvStr}`,
  };
}

// /recipeadm
function routeRecipeadm(interaction) {
  const group = interaction.options.getSubcommandGroup();
  const sub = interaction.options.getSubcommand();
  const cmdName = group; // 'craft' hoặc 'cook'

  if (sub === 'delete') {
    return { cmdName, args: ['admin', 'delete', interaction.options.getString('id')] };
  }
  if (sub === 'list') {
    return { cmdName, args: ['admin', 'list'] };
  }

  // create
  const id = interaction.options.getString('id');
  const kv = {
    name: interaction.options.getString('name'),
    output: interaction.options.getString('output'),
    inputs: interaction.options.getString('inputs'),
    minlv: interaction.options.getInteger('minlv'),
    qty: interaction.options.getInteger('qty'),
    xp: interaction.options.getInteger('xp'),
  };
  const kvStr = kvString(kv);
  return {
    cmdName,
    args: ['admin', 'create', id],
    _rawContent: `%${cmdName} admin create ${id} ${kvStr}`,
  };
}

// /lbadm
function routeLbadm(interaction) {
  const sub = interaction.options.getSubcommand();
  const id = interaction.options.getString('id');

  if (sub === 'view') return { cmdName: 'lootbox', args: ['view', id] };
  if (sub === 'simulate') {
    const rolls = interaction.options.getInteger('rolls') || 1;
    return { cmdName: 'lootbox', args: ['simulate', id, String(rolls)] };
  }
  if (sub === 'clear') {
    if (!interaction.options.getBoolean('confirm')) {
      return { _directReply: '❌ Cần tick `confirm=True` để clear.' };
    }
    return { cmdName: 'lootbox', args: ['clear', id, 'confirm'] };
  }
  if (sub === 'remove') {
    const type = interaction.options.getString('type');
    const rid = interaction.options.getString('reward_id') || '';
    return { cmdName: 'lootbox', args: ['remove', id, type, rid] };
  }
  if (sub === 'add') {
    const type = interaction.options.getString('type');
    const qmin = interaction.options.getInteger('qmin');
    const qmax = interaction.options.getInteger('qmax');
    const weight = interaction.options.getInteger('weight') || 10;
    const rid = interaction.options.getString('reward_id') || '';
    const guaranteed = interaction.options.getBoolean('guaranteed') ? 1 : 0;

    // Format khác cho gold/xp: %lootbox add <id> <type> <qmin> <qmax> <weight> [g]
    // Cho item/pet/shard: %lootbox add <id> <type> <reward_id> <qmin> <qmax> <weight> [g]
    if (type === 'gold' || type === 'xp') {
      return { cmdName: 'lootbox', args: ['add', id, type, String(qmin), String(qmax), String(weight), String(guaranteed)] };
    } else {
      if (!rid) return { _directReply: '❌ Cần chọn `reward_id` cho type item/pet/shard.' };
      return { cmdName: 'lootbox', args: ['add', id, type, rid, String(qmin), String(qmax), String(weight), String(guaranteed)] };
    }
  }
}

// /setimageadm
function routeSetimageadm(interaction) {
  const sub = interaction.options.getSubcommand();
  const type = interaction.options.getString('type');
  const id = interaction.options.getString('id');

  if (sub === 'set') {
    return { cmdName: 'setimage', args: [type, id, interaction.options.getString('url')] };
  }
  if (sub === 'remove') {
    return { cmdName: 'setimage', args: [type, id, 'none'] };
  }
  if (sub === 'check') {
    return { cmdName: 'setimage', args: ['check', type, id] };
  }
}

// /slashadm — dùng %sla
function routeSlashadm(interaction) {
  const sub = interaction.options.getSubcommand();
  return { cmdName: 'slashadmin', args: [sub] };
}

// ============================================================
// Main handler
// ============================================================
const ROUTES = {
  adm: routeAdm,
  admclass: routeAdmclass,
  admchannel: routeAdmchannel,
  shopadm: routeShopadm,
  itemadm: routeItemadm,
  mobadm: routeMobadm,
  mobzone: routeMobzone,
  questadm: routeQuestadm,
  achadm: routeAchadm,
  petadm: routePetadm,
  gzadm: routeGzadm,
  recipeadm: routeRecipeadm,
  lbadm: routeLbadm,
  setimageadm: routeSetimageadm,
  slashadm: routeSlashadm,
};

// Check admin: dùng env ADMIN_IDS + owner + Administrator permission
function isAdminInteraction(interaction) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (adminIds.includes(interaction.user.id)) return true;
  if (interaction.guild && interaction.guild.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has?.('Administrator')) return true;
  return false;
}

async function handle(interaction, client) {
  console.log(`[admin slash] IN: /${interaction.commandName} by ${interaction.user?.username} (${interaction.user?.id})`);
  const router = ROUTES[interaction.commandName];
  if (!router) {
    console.log(`[admin slash] NO ROUTER for /${interaction.commandName}`);
    return null;
  }

  const isAdm = isAdminInteraction(interaction);
  console.log(`[admin slash] isAdmin=${isAdm} | ADMIN_IDS=${process.env.ADMIN_IDS} | ownerId=${interaction.guild?.ownerId} | userId=${interaction.user?.id}`);
  if (!isAdm) {
    return interaction.reply({ content: '🚫 Bạn không có quyền dùng lệnh admin.', ephemeral: true });
  }

  // Defer
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }
  } catch (err) {
    console.error('[admin slash defer]', err.message);
    return;
  }

  try {
    const route = router(interaction);
    if (!route) {
      return interaction.editReply('❌ Không route được sub command.');
    }

    // Direct reply (VD: chưa confirm)
    if (route._directReply) {
      return interaction.editReply(route._directReply);
    }

    // Lookup prefix command
    const cmd = client.commands.get(route.cmdName);
    if (!cmd) {
      return interaction.editReply(`❌ Internal: command \`${route.cmdName}\` không tìm thấy.`);
    }

    // Wrap interaction as msg. Nếu có _rawContent → set msg.content thẳng để command parse quote đúng.
    const msgLike = wrap(interaction, route.cmdName, route.args);
    if (route._rawContent) {
      msgLike.content = route._rawContent;
    }
    // Attach mentioned users/channels
    if (route._users && route._users.length > 0) {
      const map = new Map(route._users.filter(u => u).map(u => [u.id, u]));
      msgLike.mentions.users.first = () => map.values().next().value || null;
    }
    if (route._channels && route._channels.length > 0) {
      const map = new Map(route._channels.filter(c => c).map(c => [c.id, c]));
      msgLike.mentions.channels.first = () => map.values().next().value || null;
    }

    // Convert args to string-only cho execute
    const argsStr = route.args.map(a => {
      if (a == null) return '';
      if (a && a.id && a.username) return a.id;
      if (a && a.id && a.type !== undefined) return a.id;
      return String(a);
    });

    await cmd.execute(msgLike, argsStr);
  } catch (err) {
    console.error('[admin slash]', interaction.commandName, err);
    try {
      await interaction.editReply(`⚠️ Lỗi: ${err.message || err}`);
    } catch {}
  }
}

module.exports = { handle };
