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
  const guildId = process.env.SLASH_GUILD_ID; // optional: set guild id để test nhanh

  try {
    if (guildId) {
      console.log(`🚀 [slash] Deploying ${cmds.length} commands to guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds });
      console.log(`✅ [slash] Deployed to guild!`);
    } else {
      console.log(`🚀 [slash] Deploying ${cmds.length} commands GLOBALLY (may take up to 1 hour)...`);
      await rest.put(Routes.applicationCommands(clientId), { body: cmds });
      console.log(`✅ [slash] Deployed globally!`);
    }
  } catch (err) {
    console.error('[slash deploy] Failed:', err.message);
  }
}

module.exports = { deploySlashCommands }; 
