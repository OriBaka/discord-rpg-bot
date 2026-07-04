// Auto-deploy slash commands tới Discord khi bot ready
const { REST, Routes } = require('discord.js');
const { definitions } = require('./definitions');
const { definitions: adminDefs } = require('./admin_definitions');

// Flush stdout ngay lập tức (tránh Railway buffer log)
function log(msg) {
  process.stdout.write(msg + '\n');
}
function elog(msg) {
  process.stderr.write(msg + '\n');
}

async function deploySlashCommands(client) {
  log('🔵 [slash deploy] START');
  const token = process.env.DISCORD_TOKEN;
  const clientId = client.user?.id;
  if (!token || !clientId) {
    elog('[slash deploy] Missing token or clientId');
    return;
  }
  log(`🔵 [slash deploy] clientId=${clientId}, guildId=${process.env.SLASH_GUILD_ID || '(none)'}`);

  // Build cmds với error catching per command
  const allDefs = [...definitions, ...adminDefs];
  log(`🔵 [slash deploy] Building JSON cho ${allDefs.length} commands...`);
  const cmds = [];
  for (const d of allDefs) {
    try {
      cmds.push(d.data.toJSON());
    } catch (e) {
      elog(`[slash deploy] ❌ Build fail /${d.data?.name || '?'}: ${e.message}`);
    }
  }
  log(`🔵 [slash deploy] Built ${cmds.length}/${allDefs.length} commands OK`);

  const totalSize = JSON.stringify(cmds).length;
  log(`🔵 [slash deploy] Total payload size: ${totalSize} bytes (${(totalSize/1024).toFixed(1)} KB)`);

  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.SLASH_GUILD_ID;

  function logDeployError(err, phase) {
    elog(`[slash deploy] ❌ ${phase} FAILED: ${err.message}`);
    if (err.code) elog(`  code: ${err.code}`);
    if (err.status) elog(`  http status: ${err.status}`);
    if (err.rawError) {
      elog(`  rawError: ${JSON.stringify(err.rawError).slice(0, 3000)}`);
    }
  }

  if (guildId) {
    // === Clear guild trước ===
    log(`🧹 [slash] Clearing guild ${guildId}...`);
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      log(`✅ [slash] Cleared guild.`);
    } catch (err) {
      logDeployError(err, 'Clear guild');
    }

    // === Deploy batch ===
    log(`🚀 [slash] Deploying ${cmds.length} commands to guild ${guildId} (batch PUT)...`);
    try {
      const result = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds });
      const count = Array.isArray(result) ? result.length : '?';
      log(`✅ [slash] BATCH DEPLOYED! Discord returned ${count} commands.`);
    } catch (err) {
      logDeployError(err, 'Batch deploy');

      // === Retry từng command ===
      log(`🔎 [slash] Batch fail → Retry từng command để tìm lỗi...`);
      let ok = 0, fail = 0;
      for (const c of cmds) {
        try {
          await rest.post(Routes.applicationGuildCommands(clientId, guildId), { body: c });
          log(`  ✓ /${c.name}`);
          ok++;
        } catch (e2) {
          fail++;
          elog(`  ✗ /${c.name}: ${e2.message}`);
          if (e2.rawError) elog(`    rawError: ${JSON.stringify(e2.rawError).slice(0, 800)}`);
        }
      }
      log(`🔎 [slash] Retry done: ${ok} OK, ${fail} FAIL`);
    }

    // === Clear global (nếu có rác) ===
    try {
      const globalCmds = await rest.get(Routes.applicationCommands(clientId));
      if (Array.isArray(globalCmds) && globalCmds.length > 0) {
        log(`🧹 [slash] Phát hiện ${globalCmds.length} global commands cũ → xoá...`);
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        log(`✅ [slash] Đã xoá global commands.`);
      }
    } catch (err) {
      logDeployError(err, 'Clear global');
    }
  } else {
    log(`🚀 [slash] Deploying ${cmds.length} commands GLOBALLY (may take up to 1 hour)...`);
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: cmds });
      log(`✅ [slash] Deployed globally!`);
    } catch (err) {
      logDeployError(err, 'Deploy global');
    }
  }

  log(`🔵 [slash deploy] DONE`);
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

// === Manual cleanup helpers (gọi qua admin command) ===
