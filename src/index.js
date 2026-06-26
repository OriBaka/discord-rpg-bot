// Bắt mọi lỗi để không bị chết âm thầm
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err);
});

process.stdout.write('🚀 [BOOT] index.js bắt đầu chạy...\n');

require('dotenv').config();
const fs = require('fs');
const path = require('path');

process.stdout.write('🚀 [BOOT] Đã load dotenv + fs + path\n');

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
process.stdout.write('🚀 [BOOT] Đã require discord.js\n');

const TOKEN  = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';

if (!TOKEN) {
  console.error('❌ Thiếu DISCORD_TOKEN trong env!');
  process.exit(1);
}
process.stdout.write(`🚀 [BOOT] TOKEN có (length=${TOKEN.length}), PREFIX="${PREFIX}"\n`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});
process.stdout.write('🚀 [BOOT] Đã tạo Client\n');

client.commands = new Collection();
const cmdDir = path.join(__dirname, 'commands');

function registerCommand(cmd) {
  if (!cmd?.name || typeof cmd.execute !== 'function') return;
  client.commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) client.commands.set(alias, cmd);
}

process.stdout.write(`🚀 [BOOT] Bắt đầu load commands từ ${cmdDir}\n`);
const cmdFiles = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));

for (const file of cmdFiles) {
  try {
    process.stdout.write(`   → load ${file}...\n`);
    const mod = require(path.join(cmdDir, file));
    registerCommand(mod);
    for (const key of Object.keys(mod)) {
      if (['name','aliases','description','execute'].includes(key)) continue;
      if (typeof mod[key] === 'object') registerCommand(mod[key]);
    }
  } catch (err) {
    console.error(`❌ Lỗi khi load ${file}:`, err);
    throw err;
  }
}

console.log(`✅ Đã load ${new Set(client.commands.values()).size} lệnh.`);

client.once('ready', async () => {
  console.log(`🤖 Bot online với tên ${client.user.tag}`);
  client.user.setActivity(`${PREFIX}help | /me | RPG cày cuốc`);
  try {
    const { deploySlashCommands } = require('./slash/deploy');
    await deploySlashCommands(client);
  } catch (err) {
    console.error('[slash deploy on ready]', err);
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith(PREFIX)) return;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const name = (args.shift() || '').toLowerCase();
  const cmd = client.commands.get(name);
  if (!cmd) return;
  try {
    await cmd.execute(msg, args);
  } catch (err) {
    console.error(err);
    msg.reply('⚠️ Có lỗi xảy ra, kiểm tra log nhé.').catch(()=>{});
  }
});

const buttonHandler = require('./buttons');
const menuHandler = require('./menus');
const slashHandler = require('./slash/handler');

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    try { await buttonHandler.handle(interaction); } catch (err) { console.error('[button]', err); }
    return;
  }
  if (interaction.isStringSelectMenu()) {
    try { await menuHandler.handle(interaction); } catch (err) { console.error('[menu]', err); }
    return;
  }
  if (interaction.isChatInputCommand()) {
    try { await slashHandler.handleCommand(interaction, client); } catch (err) { console.error('[slash]', err); }
    return;
  }
  if (interaction.isAutocomplete()) {
    try { await slashHandler.handleAutocomplete(interaction); } catch (err) { console.error('[auto]', err); }
    return;
  }
});

process.stdout.write('🚀 [BOOT] Đang gọi client.login()...\n');
client.login(TOKEN).catch(err => console.error('❌ LOGIN FAIL:', err));
