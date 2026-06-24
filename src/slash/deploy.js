// Auto-deploy slash commands tới Discord khi bot ready
const { REST, Routes } = require('discord.js');
const { definitions } = require('./definitions');

async function deploySlashCommands(client) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = client.user?.id;
  if (!token || !clientId) {
    console.error('[slash deploy] Missing token or clientId');
    return;
  }

  const cmds = definitions.map(d => d.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);

  // GUILD_ID mode (deploy nhanh, chỉ 1 server) hoặc GLOBAL (~1h sync)
  const guildId = process.env.SLASH_GUILD_ID;

  try {
    if (guildId) {
      // Mode GUILD: deploy tới guild + XÓA global (tránh duplicate)
      console.log(`🚀 [slash] Deploying ${cmds.length} commands to guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds });
      console.log(`✅ [slash] Deployed to guild!`);

      // Check + xóa global nếu có (lần đầu chuyển từ global → guild)
      try {
        const globalCmds = await rest.get(Routes.applicationCommands(clientId));
        if (Array.isArray(globalCmds) && globalCmds.length > 0) {
          console.log(`🧹 [slash] Phát hiện ${globalCmds.length} global commands cũ → đang xoá để tránh duplicate...`);
          await rest.put(Routes.applicationCommands(clientId), { body: [] });
          console.log(`✅ [slash] Đã xoá global commands. (Discord có thể mất 1h để cập nhật toàn bộ user)`);
        }
      } catch (err) {
        console.error('[slash deploy] Failed to clear global:', err.message);
      }
    } else {
      // Mode GLOBAL: deploy global
      console.log(`🚀 [slash] Deploying ${cmds.length} commands GLOBALLY (may take up to 1 hour)...`);
      await rest.put(Routes.applicationCommands(clientId), { body: cmds });
      console.log(`✅ [slash] Deployed globally!`);
    }
  } catch (err) {
    console.error('[slash deploy] Failed:', err.message);
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
