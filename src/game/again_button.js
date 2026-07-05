// Helper build "Again" button + handle click
// customId format: again:<cmd>:<userId>:<argsEncoded>
// argsEncoded: args nối bằng '|' (thay ' ' vì có thể xung đột), URL-encoded
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function encodeArgs(args) {
  // Join with '|', escape '|' in each arg (rare)
  return (args || []).map(a => String(a).replace(/\|/g, '_pipe_')).join('|');
}

function decodeArgs(encoded) {
  if (!encoded) return [];
  return encoded.split('|').map(a => a.replace(/_pipe_/g, '|'));
}

// Build 1 row với button Again (+ optional extra buttons)
function buildAgainRow(cmd, userId, args = [], extraLabel = null) {
  const encoded = encodeArgs(args);
  const customId = `again:${cmd}:${userId}:${encoded}`.slice(0, 100); // Discord max customId 100 chars
  const label = extraLabel || `🔄 ${cmd} again`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary)
  );
}

// Parse customId → { cmd, userId, args }
function decodeCustomId(customId) {
  const parts = customId.split(':');
  if (parts[0] !== 'again') return null;
  return {
    cmd: parts[1],
    userId: parts[2],
    args: decodeArgs(parts.slice(3).join(':')),
  };
}

module.exports = { buildAgainRow, decodeCustomId, encodeArgs, decodeArgs };
 
