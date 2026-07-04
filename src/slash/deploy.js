// Auto-deploy slash commands tới Discord khi bot ready
const { REST, Routes } = require('discord.js');
const { definitions } = require('./definitions');
const { definitions: adminDefs } = require('./admin_definitions');

async function deploySlashCommands(client) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = client.user?.id;
  if (!token || !clientId) {
    console.error('[slash deploy] Missing token or clientId');
    return;
  }

  // Merge player + admin definitions
  const allDefs = [...definitions, ...adminDefs];
  const cmds = allDefs.map(d => d.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  // GUILD_ID mode (deploy nhanh, chỉ 1 server) hoặc GLOBAL (~1h sync)
  const guildId = process.env.SLASH_GUILD_ID;

  // Helper log lỗi chi tiết (Discord API trả về rawError với field cụ thể bị fail)
  function logDeployError(err, phase) {
    console.error(`[slash deploy] ❌ ${phase} FAILED: ${err.message}`);
    if (err.code) console.error(`  code: ${err.code}`);
    if (err.status) console.error(`  http status: ${err.status}`);
    if (err.rawError) {
      console.error(`  rawError:`, JSON.stringify(err.rawError, null, 2).slice(0, 3000));
    }
    if (err.requestBody) {
      console.error(`  requestBody hint: (first 500 chars)`, JSON.stringify(err.requestBody).slice(0, 500));
    }
  }

  try {
    if (guildId) {
      // Mode GUILD: CLEAR guild trước để xoá command rác từ deploy cũ, sau đó deploy fresh
      console.log(`🧹 [slash] Clearing guild ${guildId} trước khi deploy (xoá rác cũ)...`);
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log(`✅ [slash] Cleared guild.`);
      } catch (err) {
        logDeployError(err, 'Clear guild');
      }

      console.log(`🚀 [slash] Deploying ${cmds.length} commands to guild ${guildId}...`);
      try {
        const result = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds });
        console.log(`✅ [slash] Deployed to guild! Received ${Array.isArray(result) ? result.length : '?'} commands back from Discord.`);
      } catch (err) {
        logDeployError(err, 'Deploy guild');
        // Retry từng command một để tìm command lỗi
        console.log(`🔎 [slash] Retry từng command để tìm command lỗi...`);
        for (const c of cmds) {
          try {
            await rest.post(Routes.applicationGuildCommands(clientId, guildId), { body: c });
            console.log(`  ✓ /${c.name}`);
          } catch (e2) {
            console.error(`  ✗ /${c.name}: ${e2.message}`);
            if (e2.rawError) console.error(`    rawError:`, JSON.stringify(e2.rawError).slice(0, 500));
          }
        }
      }

      // Check + xóa global nếu có (lần đầu chuyển từ global → guild)
      try {
        const globalCmds = await rest.get(Routes.applicationCommands(clientId));
        if (Array.isArray(globalCmds) && globalCmds.length > 0) {
          console.log(`🧹 [slash] Phát hiện ${globalCmds.length} global commands cũ → đang xoá để tránh duplicate...`);
          await rest.put(Routes.applicationCommands(clientId), { body: [] });
          console.log(`✅ [slash] Đã xoá global commands. (Discord có thể mất 1h để cập nhật toàn bộ user)`);
        }
      } catch (err) {
        logDeployError(err, 'Clear global');
      }
    } else {
      // Mode GLOBAL: deploy global (Discord tự xoá command cũ không có trong body)
      console.log(`🚀 [slash] Deploying ${cmds.length} commands GLOBALLY (may take up to 1 hour)...`);
      try {
        await rest.put(Routes.applicationCommands(clientId), { body: cmds });
        console.log(`✅ [slash] Deployed globally!`);
      } catch (err) {
        logDeployError(err, 'Deploy global');
      }
    }
  } catch (err) {
    logDeployError(err, 'Outer');
  }
}

// === Manual cleanup helpers (gọi qua admin command) ===
async function clearGlobalCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
}

async function clearGuildCommands(client, guildId) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: [] });
}

async function listDeployedCommands(client, guildId = null) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = guildId
    ? Routes.applicationGuildCommands(client.user.id, guildId)
    : Routes.applicationCommands(client.user.id);
  return await rest.get(route);
}

module.exports = {
  deploySlashCommands,
  clearGlobalCommands,
  clearGuildCommands,
  listDeployedCommands,
};
