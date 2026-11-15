// Craft & Cook commands (cùng module — chia sub theo type)
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer, addItem, removeItem, hasItem } = require('../game/player');
const { getItem } = require('../game/items');
const recipes = require('../game/recipes');
const jobs = require('../game/jobs');
const { tierInfo } = require('../game/tiers');
const { getRestTokens, parseKV } = require('../game/argparse');
const paginator = require('../game/paginator');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

// Classify recipe theo loại output → filter category
function classifyRecipe(recipe) {
  const out = getItem(recipe.output_id);
  if (!out) return 'other';
  if (out.type === 'consumable') return 'consumable';
  if (out.type === 'material') return 'material';
  if (out.type === 'weapon') {
    const wt = out.weapon_type || '';
    if (wt === 'pickaxe' || wt === 'fishing_rod') return 'tool';
    return 'weapon';
  }
  if (out.type === 'armor') return 'armor';
  if (out.type === 'accessory') return 'accessory';
  return 'other';
}

// Filter options cho craft (loại đa dạng)
// Filter sinh TỪ DỮ LIỆU (xem blog lý do ở shop.js): bản cũ có 4 filter cố
// định nên recipe ra 'accessory' hoặc 'other' chỉ hiện khi bấm All — thêm loại
// sản phẩm mới là nó vô hình sau filter.
const CRAFT_CATEGORY_META = {
  material:   { label: 'Ingot',    emoji: '📦' },
  weapon:     { label: 'Weapon',   emoji: '⚔️' },
  armor:      { label: 'Armor',    emoji: '🛡️' },
  accessory:  { label: 'Acc',      emoji: '✨' },
  tool:       { label: 'Tool',     emoji: '⛏️' },
  consumable: { label: 'Food',     emoji: '🍲' },
  other:      { label: 'Khác',     emoji: '📦' },
};

function buildCraftFilters(all) {
  const counts = new Map();
  for (const r of all) {
    const k = classifyRecipe(r);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const cats = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => ({ key, ...(CRAFT_CATEGORY_META[key] || { label: key, emoji: '📦' }) }));
  return [{ key: 'all', label: 'All', emoji: '📜' }, ...cats];
}

// Mọi loại sản phẩm ĐANG CÓ (không giới hạn 4 nút) — dùng để validate tham số,
// nhờ vậy `%craft list accessory` vẫn lọc được dù 'accessory' hiếm nên không
// có nút riêng.
function craftCategories(all) {
  const set = new Set();
  for (const r of all) set.add(classifyRecipe(r));
  return set;
}

// Cook: mọi recipe đều ra consumable → chỉ cần All
const COOK_FILTERS = [
  { key: 'all', label: 'All', emoji: '🍽️' },
];

function formatRecipeLine(msg, r, jobLevel) {
  const out = getItem(r.output_id);
  const inputs = recipes.parseInputs(r);
  const inputStr = inputs.map(i => {
    const it = getItem(i.item_id);
    return `${i.qty}× ${it?.name || i.item_id}`;
  }).join(', ');
  const locked = jobLevel < r.min_job_level ? ' 🔒' : '';
  const have = inputs.every(i => hasItem(msg.author.id, i.item_id, i.qty)) ? ' ✨' : '';
  const t = tierInfo(out?.tier || 'common');
  return `\`${r.id}\` **${r.name}** (Lv.${r.min_job_level}+)${locked}${have}\n   📋 ${inputStr}\n   → ${t.emoji} ${out?.name || r.output_id} ×${r.output_qty} (+${r.xp_gain} XP)`;
}

// Build & send page (dùng cho lần đầu + button click)
function renderRecipesPage({ msg, userId, type, filter, page, jobLevel, replyFn }) {
  const jobType = type === 'craft' ? 'crafting' : 'cooking';
  const icon = type === 'craft' ? '⚒️' : '👨‍🍳';
  const color = type === 'craft' ? 0xE67E22 : 0xF1C40F;
  const all = recipes.getRecipesByType(type);
  const filterOpts = type === 'craft' ? buildCraftFilters(all) : COOK_FILTERS;
  const valid = (f) => f === 'all' || craftCategories(all).has(f);
  const active = valid(filter) ? filter : 'all';
  const filtered = active === 'all' ? all : all.filter(r => classifyRecipe(r) === active);
  // Sort by min_job_level asc
  filtered.sort((a, b) => a.min_job_level - b.min_job_level || a.id.localeCompare(b.id));

  const prefix = require('../game/prefix').getPrefix();
  const filterLabel = active === 'all' ? 'All' : (CRAFT_CATEGORY_META[active]?.label || active);
  const { embed, components } = paginator.build({
    domain: type, // 'craft' or 'cook'
    userId,
    items: filtered,
    filter: active,
    filterOptions: filterOpts,
    page,
    title: `${icon} ${type === 'craft' ? 'Crafting' : 'Cooking'} Recipes — ${filterLabel} — Lv.${jobLevel}`,
    color,
    formatItem: (r) => formatRecipeLine(msg, r, jobLevel),
    footer: `${prefix}${type} <recipe_id> để làm • ✨ đủ NL, 🔒 thiếu lv`,
  });

  return replyFn({ embeds: [embed], components });
}

// Handler chính, type = 'craft' | 'cook'
async function handleCommand(msg, args, type) {
  const prefix = require('../game/prefix').getPrefix();
  const jobType = type === 'craft' ? 'crafting' : 'cooking';
  const verbThe = type === 'craft' ? 'Crafted' : 'Cooked';
  const verbDo  = type === 'craft' ? 'Chế tạo' : 'Nấu';
  const icon    = type === 'craft' ? '⚒️' : '👨‍🍳';
  const color   = type === 'craft' ? 0xE67E22 : 0xF1C40F;

  const p = getPlayer(msg.author.id);
  if (!p) return msg.reply(`❌ Gõ \`${prefix}start\` để tạo nhân vật trước.`);

  const sub = (args[0] || '').toLowerCase();
  const job = jobs.getJob(msg.author.id, jobType);

  // ===== admin =====
  if (sub === 'admin') {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');
    return handleAdmin(msg, args.slice(1), prefix, type);
  }

  // ===== list / recipes (paginated) =====
  if (sub === 'list' || sub === 'recipes' || !sub) {
    // Có thể pass filter qua arg: %craft list weapon
    const filterArg = (args[1] || 'all').toLowerCase();
    const allRecipes = recipes.getRecipesByType(type);
    const filter = (filterArg === 'all' || craftCategories(allRecipes).has(filterArg)) ? filterArg : 'all';
    return renderRecipesPage({
      msg, userId: msg.author.id, type, filter, page: 0, jobLevel: job.level,
      replyFn: (opts) => msg.reply(opts),
    });
  }

  // ===== execute recipe =====
  const recipeId = sub;
  const recipe = recipes.getRecipe(recipeId);
  if (!recipe) return msg.reply(`❌ Recipe \`${recipeId}\` không tồn tại. Gõ \`${prefix}${type} list\``);
  if (recipe.type !== type) return msg.reply(`❌ Recipe này dành cho \`${recipe.type}\`, không phải \`${type}\`.`);

  // Check level
  if (job.level < recipe.min_job_level) {
    return msg.reply(`🔒 Recipe **${recipe.name}** yêu cầu ${jobType} Lv.${recipe.min_job_level} (bạn Lv.${job.level}).`);
  }

  // Check inputs
  const inputs = recipes.parseInputs(recipe);
  for (const inp of inputs) {
    if (!hasItem(msg.author.id, inp.item_id, inp.qty)) {
      const it = getItem(inp.item_id);
      const haveRow = db.prepare('SELECT qty FROM inventory WHERE user_id=? AND item_id=?').get(msg.author.id, inp.item_id);
      const have = haveRow?.qty || 0;
      return msg.reply(
        `❌ Thiếu nguyên liệu: cần **${inp.qty}× ${it?.name || inp.item_id}**, bạn có ${have}.`
      );
    }
  }

  // Consume inputs
  for (const inp of inputs) {
    removeItem(msg.author.id, inp.item_id, inp.qty);
  }

  // Produce output
  addItem(msg.author.id, recipe.output_id, recipe.output_qty);
  const xpRes = jobs.addJobXp(msg.author.id, jobType, recipe.xp_gain);

  const out = getItem(recipe.output_id);
  const t = tierInfo(out?.tier || 'common');
  let text = `${verbThe} **${recipe.output_qty}× ${t.emoji} ${out?.name || recipe.output_id}**!\n+${recipe.xp_gain} ${jobType} XP`;
  if (xpRes.levelsGained.length > 0) {
    text += `\n\n🎉 **${jobType} Lv.UP!** Đạt Lv.${xpRes.level}`;
  }

  const embed = new EmbedBuilder().setColor(color)
    .setTitle(`${icon} ${verbDo}: ${recipe.name}`)
    .setDescription(text)
    .setFooter({ text: `Lv.${xpRes.level} (${xpRes.xp}/${xpRes.xpToNext} XP)` });
  const { buildAgainRow } = require('../game/again_button');
  return msg.reply({ embeds: [embed], components: [buildAgainRow(type, msg.author.id, [recipeId])] });
}

// ===== Admin =====
async function handleAdmin(msg, args, prefix, type) {
  const sub = (args[0] || '').toLowerCase();
  const jobType = type === 'craft' ? 'crafting' : 'cooking';

  if (!sub || sub === 'help') {
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`🛠️ ${type} Admin`)
      .setDescription([
        `\`${prefix}${type} admin list\` — list tất cả recipe ${type}`,
        `\`${prefix}${type} admin create <id> name="..." minlv=10 inputs="item1:2,item2:1" output=<id> qty=1 xp=20\``,
        `\`${prefix}${type} admin delete <id>\``,
        '',
        '`inputs` format: `item_id:qty,item_id:qty,...`',
      ].join('\n'))] });
  }

  if (sub === 'list') {
    const all = recipes.getRecipesByType(type);
    const lines = all.map(r => {
      const inputs = recipes.parseInputs(r);
      const inputStr = inputs.map(i => `${i.qty}×${i.item_id}`).join(',');
      return `\`${r.id}\` ${r.name} (lv${r.min_job_level}) [${inputStr}] → ${r.output_qty}×${r.output_id} +${r.xp_gain}xp`;
    });
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245)
      .setTitle(`🛠️ All ${type} recipes (${all.length})`)
      .setDescription(lines.join('\n').slice(0, 4000) || '(empty)')] });
  }

  if (sub === 'delete' || sub === 'del') {
    const id = args[1];
    if (!id) return msg.reply('❌ Thiếu id.');
    const ok = recipes.deleteRecipe(id);
    return msg.reply(ok ? `🗑️ Đã xoá recipe \`${id}\`` : '❌ Recipe không tồn tại.');
  }

  if (sub === 'create' || sub === 'new') {
    // tokens bỏ "<type> admin create" = 3 từ
    const tokens = getRestTokens(msg, prefix, 3);
    const id = tokens[0];
    if (!id) return msg.reply('❌ Thiếu id.');
    if (recipes.getRecipe(id)) return msg.reply('❌ Id đã tồn tại.');
    const kv = parseKV(tokens.slice(1));
    if (!kv.name || !kv.output || !kv.inputs) {
      return msg.reply('❌ Cần `name="..."`, `output=<id>`, `inputs="id:qty,id:qty"`.');
    }
    // Parse inputs
    const parsedInputs = [];
    for (const part of kv.inputs.split(',')) {
      const [iid, qty] = part.split(':');
      if (!iid) continue;
      parsedInputs.push({ item_id: iid.trim(), qty: parseInt(qty) || 1 });
    }
    // Validate items exist
    const outItem = getItem(kv.output);
    if (!outItem) return msg.reply(`❌ Output item \`${kv.output}\` không tồn tại.`);
    for (const inp of parsedInputs) {
      if (!getItem(inp.item_id)) return msg.reply(`❌ Input item \`${inp.item_id}\` không tồn tại.`);
    }

    const intOr = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };
    const r = recipes.createRecipe({
      id, name: kv.name, type, job_type: jobType,
      min_job_level: intOr(kv.minlv, 1),
      inputs: parsedInputs,
      output_id: kv.output, output_qty: intOr(kv.qty, 1),
      xp_gain: intOr(kv.xp, 10),
      desc: kv.desc || '',
      created_by: msg.author.id,
    });
    return msg.reply(`✅ Đã tạo recipe **${r.name}** (\`${r.id}\`).`);
  }

  return msg.reply(`❌ Lệnh con không hợp lệ. Gõ \`${prefix}${type} admin help\``);
}

// Export 2 lệnh: craft + cook
module.exports = {
  name: 'craft',
  aliases: ['cr', 'chetao'],
  description: 'Chế tạo từ recipe. !craft list, !craft <id>',
  async execute(msg, args) { return handleCommand(msg, args, 'craft'); },
};

module.exports.cook = {
  name: 'cook',
  aliases: ['nau'],
  description: 'Nấu ăn từ recipe. !cook list, !cook <id>',
  async execute(msg, args) { return handleCommand(msg, args, 'cook'); },
};

// Export helper cho button handler (page navigation)
module.exports.renderRecipesPage = renderRecipesPage;
