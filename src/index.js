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
const PREFIX = require('./game/prefix').getPrefix();

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

// Dashboard shares the bot service/volume; API routes are strictly read-only.
const dashboard = require('./web/server').startDashboard(require('./db/database'));

// ===== Events =====
client.once('ready', async () => {
  console.log(`🤖 Bot online với tên ${client.user.tag}`);
  client.user.setActivity(`${PREFIX}help | /me | RPG cày cuốc`);

  // Local daily snapshots + optional off-volume Discord copy.
  require('./game/backup').getService(client).start();
  require('./game/world_weather').start(client);

  // Deploy slash commands
  try {
    const { deploySlashCommands } = require('./slash/deploy');
    await deploySlashCommands(client);
  } catch (err) {
    console.error('[slash deploy on ready]', err);
  }

  // ===== Raid boss tuần: tự chốt thưởng =====
  //
  // Không thể chờ ai đó gõ lệnh mới trao thưởng: nếu cả server nghỉ vài ngày
  // thì tuần cũ sẽ treo mãi ở trạng thái "chưa settle" và người chơi không
  // nhận được gì. Vì vậy chạy nền mỗi giờ.
  //
  // An toàn khi chạy nhiều lần: settleRewards có PRIMARY KEY (raid_id,
  // user_id) nên không nhân đôi thưởng, và `settled` flag chặn cả tuần.
  const settleRaid = () => {
    try {
      const raid = require('./game/raid');
      const results = raid.settleExpired();
      if (results.length) {
        console.log(`🐲 Raid: chốt thưởng ${results.length} tuần đã kết thúc`);
        for (const r of results) {
          if (r.ok) console.log(`   ${r.week}: ${r.granted.length} người được thưởng (hạ boss: ${r.defeated})`);
        }
      }
    } catch (err) {
      console.error('[raid settle]', err.message);
    }
  };
  settleRaid();                        // chạy ngay khi khởi động
  setInterval(settleRaid, 60 * 60 * 1000);   // rồi mỗi giờ
});

// Rate-limit cho phản hồi "không có lệnh này" (1 lần / 30s / người)
const unknownCmdLimiter = require('./game/command_hint').createRateLimiter();

client.on('messageCreate', (msg) => {
  const { handleMessage } = require('./game/message_router');
  return handleMessage(msg, { commands: client.commands, prefix: PREFIX, limiter: unknownCmdLimiter });
});

// ===== Interactions: Buttons + Slash + Autocomplete =====
const buttonHandler = require('./buttons');
const slashHandler = require('./slash/handler');

client.on('interactionCreate', async (interaction) => {
  // Buttons
  if (interaction.isButton()) {
    try {
      await buttonHandler.handle(interaction);
    } catch (err) {
      console.error('[button handler]', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Lỗi xử lý nút.', ephemeral: true }).catch(()=>{});
      }
    }
    return;
  }

  // Slash commands
  if (interaction.isChatInputCommand()) {
    try {
      await slashHandler.handleCommand(interaction, client);
    } catch (err) {
      console.error('[slash command]', err);
    }
    return;
  }

  // Autocomplete
  if (interaction.isAutocomplete()) {
    try {
      await slashHandler.handleAutocomplete(interaction);
    } catch (err) {
      console.error('[autocomplete]', err);
    }
    return;
  }
});

process.stdout.write('🚀 [BOOT] Đang gọi client.login()...\n');
client.login(TOKEN)
  .then(() => process.stdout.write('🚀 [BOOT] client.login() resolved!\n'))
  .catch(err => {
    console.error('❌ LOGIN FAIL:', err);
    process.exit(1);
  });

// Railway sends SIGTERM before redeploy. Drain backup, then checkpoint/close.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}`);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    client.removeAllListeners('messageCreate');
    client.removeAllListeners('interactionCreate');
    if (dashboard) {
      await new Promise(resolve => { dashboard.close(resolve); dashboard.closeIdleConnections(); });
    }
    await require('./game/world_weather').stop();
    await require('./game/backup').getService(client).stop();
    client.destroy();
    const db = require('./db/database');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    clearTimeout(deadline);
    process.exit(0);
  } catch (err) {
    console.error('[shutdown]', err);
    process.exit(1);
  }
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });
