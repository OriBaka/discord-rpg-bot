// Adapter: chuyển slash interaction thành object giống Message (msg)
// để reuse logic của prefix commands.
//
// Slash interaction limit:
//   - Phải reply trong 3s (hoặc deferReply rồi editReply)
//   - Chỉ reply 1 lần (subsequent calls dùng followUp)
//
// Wrapper handle tự động:
//   - msg.reply(payload) → interaction.editReply(payload) hoặc followUp nếu đã editReply

function buildContent(interaction, prefix, commandName, args) {
  // Tạo content giống prefix message để code cũ vẫn parse được
  const parts = [prefix + commandName];
  for (const a of args) {
    if (a == null) continue;
    parts.push(String(a));
  }
  return parts.join(' ');
}

/**
 * Wrap interaction thành msg-like object.
 *
 * @param {ChatInputCommandInteraction} interaction
 * @param {string} commandName - tên command sẽ gọi (vd 'hunt')
 * @param {Array} args - args array tương đương args của prefix command
 * @returns {Object} msgLike
 */
function wrap(interaction, commandName, args = []) {
  const prefix = process.env.PREFIX || '!';
  let hasReplied = false;

  // Build mentions map
  const mentionedUsers = new Map();
  const mentionedChannels = new Map();
  for (const a of args) {
    // Nếu là user object (từ option)
    if (a && a.id && a.username) {
      mentionedUsers.set(a.id, a);
    }
    // Nếu là channel object
    if (a && a.id && a.type !== undefined) {
      mentionedChannels.set(a.id, a);
    }
  }

  // Convert args to string-able (user → "@id" format)
  const argStrings = args.map(a => {
    if (a == null) return '';
    if (a && a.id && a.username) return `<@${a.id}>`; // user mention
    if (a && a.id && a.type !== undefined) return `<#${a.id}>`; // channel
    return String(a);
  });

  const content = buildContent(interaction, prefix, commandName, argStrings);

  const send = async (payload) => {
    // Discord cho phép 1 initial reply + nhiều followUp
    // editReply chỉ chạy nếu đã defer hoặc reply rồi
    try {
      if (!interaction.deferred && !interaction.replied) {
        return await interaction.reply(payload);
      }
      if (!hasReplied) {
        hasReplied = true;
        return await interaction.editReply(payload);
      }
      return await interaction.followUp(payload);
    } catch (err) {
      console.error('[slash adapter reply]', err.message);
    }
  };

  // Member object (cho check Administrator)
  const member = interaction.member || null;

  return {
    // Identity
    author: interaction.user,
    member,
    guild: interaction.guild,
    channel: interaction.channel,
    client: interaction.client,

    // Content (đã reconstruct)
    content,

    // Mentions
    mentions: {
      users: { first: () => mentionedUsers.values().next().value || null },
      channels: { first: () => mentionedChannels.values().next().value || null },
    },

    // Reply method
    reply: send,

    // Mark as slash (để command có thể check nếu cần)
    _isSlash: true,
    _interaction: interaction,
  };
}

module.exports = { wrap }; 
