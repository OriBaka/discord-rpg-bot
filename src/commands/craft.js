// Craft & Cook commands (cùng module — chia sub theo type)
const { EmbedBuilder } = require('discord.js');
const db = require('../db/database');
const { getPlayer, addItem, removeItem, hasItem } = require('../game/player');
const { getItem } = require('../game/items');
const recipes = require('../game/recipes');
const jobs = require('../game/jobs');
const { tierInfo } = require('../game/tiers');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

// Handler chính, type = 'craft' | 'cook'
async function handleCommand(msg, args, type) {
  const prefix = process.env.PREFIX || '!';
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

  // ===== list / recipes =====
  if (sub === 'list' || sub === 'recipes' || !sub) {
    const all = recipes.getRecipesByType(type);
    if (all.length === 0) return msg.reply(`💡 Chưa có recipe ${type} nào.`);

    const lines = all.map(r => {
      const out = getItem(r.output_id);
      const inputs = recipes.parseInputs(r);
      const inputStr = inputs.map(i => {
        const it = getItem(i.item_id);
        return `${i.qty}× ${it?.name || i.item_id}`;
      }).join(', ');
      const locked = job.level < r.min_job_level ? ' 🔒' : '';
      const have = inputs.every(i => hasItem(msg.author.id, i.item_id, i.qty)) ? ' ✨' : '';
      return `\`${r.id}\` **${r.name}** (Lv.${r.min_job_level}+)${locked}${have}\n   📋 ${inputStr}\n   → ${out?.name || r.output_id} ×${r.output_qty} (+${r.xp_gain} XP)`;
    });
    const text = lines.join('\n\n');

    const embed = new EmbedBuilder().setColor(color)
      .setTitle(`${icon} ${type === 'craft' ? 'Crafting' : 'Cooking'} Recipes — Lv.${job.level}`)
      .setDescription(text.slice(0, 4000))
      .setFooter({ text: `${prefix}${type} <recipe_id> để ${verbDo.toLowerCase()} • ✨ = đủ nguyên liệu` });
    return msg.reply({ embeds: [embed] });
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
  return msg.reply({ embeds: [embed] });
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
