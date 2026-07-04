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

  const rest = new REST({
    version: '10',
    timeout: 30_000,      // 30s per request (default 15s có thể ngắn quá khi rate limited)
    retries: 1,           // Chỉ retry 1 lần (default 3 có thể làm log im lặng lâu)
  }).setToken(token);
  const guildId = process.env.SLASH_GUILD_ID;

  function logDeployError(err, phase) {
    elog(`[slash deploy] ❌ ${phase} FAILED: ${err.message}`);
    if (err.code) elog(`  code: ${err.code}`);
    if (err.status) elog(`  http status: ${err.status}`);
    if (err.rawError) {
      elog(`  rawError: ${JSON.stringify(err.rawError).slice(0, 3000)}`);
    }
  }

  // Wrap Promise với timeout để không hang vô hạn
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)),
    ]);
  }

  if (guildId) {
    // === SKIP clear guild — tránh rate limit ===
    // (Deploy PUT sẽ tự thay thế list cũ bằng list mới, không cần clear trước)
    log(`🚀 [slash] Deploying ${cmds.length} commands to guild ${guildId} (batch PUT, timeout 45s)...`);
    try {
      const result = await withTimeout(
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds }),
        45_000,
        'PUT guild commands'
      );
      const count = Array.isArray(result) ? result.length : '?';
      log(`✅ [slash] BATCH DEPLOYED! Discord returned ${count} commands.`);
      if (Array.isArray(result) && result.length > 0) {
        log(`   First 5 names: ${result.slice(0, 5).map(c => '/' + c.name).join(', ')}`);
      }
    } catch (err) {
      logDeployError(err, 'Batch deploy');

      log(`🔎 [slash] Batch fail → Retry từng command (timeout 10s each)...`);
      let ok = 0, fail = 0;
      for (const c of cmds) {
        try {
          await withTimeout(
            rest.post(Routes.applicationGuildCommands(clientId, guildId), { body: c }),
            10_000,
            `POST /${c.name}`
          );
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

    // Clear global (nếu có rác)
    try {
      const globalCmds = await withTimeout(
        rest.get(Routes.applicationCommands(clientId)),
        15_000,
        'GET global commands'
      );
      if (Array.isArray(globalCmds) && globalCmds.length > 0) {
        log(`🧹 [slash] Phát hiện ${globalCmds.length} global commands cũ → xoá...`);
        await withTimeout(
          rest.put(Routes.applicationCommands(clientId), { body: [] }),
          15_000,
          'PUT clear global'
        );
        log(`✅ [slash] Đã xoá global commands.`);
      }
    } catch (err) {
      logDeployError(err, 'Clear global');
    }
  } else {
    log(`🚀 [slash] Deploying ${cmds.length} commands GLOBALLY (may take up to 1 hour)...`);
    try {
      await withTimeout(
        rest.put(Routes.applicationCommands(clientId), { body: cmds }),
        45_000,
        'PUT global commands'
      );
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
