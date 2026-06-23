// Bắt mọi lỗi để không bị chết âm thầm
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err);
});

// Ép console không buffer (Railway hay buffer log nodejs)
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

// ===== Load commands =====
client.commands = new Collection();
const cmdDir = path.join(__dirname, 'commands');

function registerCommand(cmd) {
  if (!cmd?.name || typeof cmd.execute !== 'function') return;
  client.commands.set(cmd.name, cmd);
  for (const alias of cmd.aliases || []) client.commands.set(alias, cmd);
}

process.stdout.write(`🚀 [BOOT] Bắt đầu load commands từ ${cmdDir}\n`);
const cmdFiles = fs.readdirSync(cmdDir).filter(f => f.endsWith('.js'));
process.stdout.write(`🚀 [BOOT] Tìm thấy ${cmdFiles.length} file command\n`);

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

// ===== Events =====
client.once('ready', () => {
  console.log(`🤖 Bot online với tên ${client.user.tag}`);
  client.user.setActivity(`${PREFIX}help | RPG cày cuốc`);
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

process.stdout.write('🚀 [BOOT] Đang gọi client.login()...\n');
client.login(TOKEN)
  .then(() => process.stdout.write('🚀 [BOOT] client.login() resolved!\n'))
  .catch(err => {
    console.error('❌ LOGIN FAIL:', err);
    process.exit(1);
  });
