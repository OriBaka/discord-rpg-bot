// Route slash interaction → execute via adapter
const { definitions } = require('./definitions');
const { wrap } = require('./adapter');
const autocomplete = require('./autocomplete');

// Build map name → definition
const defMap = {};
for (const d of definitions) {
  defMap[d.data.name] = d;
}

async function handleCommand(interaction, client) {
  const def = defMap[interaction.commandName];
  if (!def) {
    return interaction.reply({ content: '❌ Slash command không tìm thấy.', ephemeral: true });
  }

  try {
    // Defer trước (slash chỉ có 3s để reply lần đầu)
    await interaction.deferReply();
  } catch (err) {
    console.error('[slash deferReply]', err.message);
    return;
  }

  try {
    const handler = def.handler;
    const cmdName = handler.cmdName;
    const args = handler.extractArgs ? handler.extractArgs(interaction) : [];

    // Lookup prefix command
    const cmd = client.commands.get(cmdName);
    if (!cmd) {
      return interaction.editReply(`❌ Internal: command \`${cmdName}\` không tìm thấy.`);
    }

    // Wrap interaction as msg
    const msgLike = wrap(interaction, cmdName, args);

    // Convert args (vd userObject → '@id') để giống prefix format
    // args trong msgLike đã có cả raw object (cho mentions) và string
    // Truyền array string-only cho execute
    const argsStr = args.map(a => {
      if (a == null) return '';
      if (a && a.id && a.username) return a.id; // user → id (mentions.first() vẫn lấy được)
      if (a && a.id && a.type !== undefined) return a.id;
      return String(a);
    });

    await cmd.execute(msgLike, argsStr);
  } catch (err) {
    console.error('[slash handler]', interaction.commandName, err);
    try {
      await interaction.editReply(`⚠️ Lỗi: ${err.message || err}`);
    } catch {}
  }
}

async function handleAutocomplete(interaction) {
  const def = defMap[interaction.commandName];
  if (!def || !def.autocomplete) {
    return interaction.respond([]);
  }
  try {
    const choices = autocomplete.handle(interaction, def.autocomplete);
    await interaction.respond(choices || []);
  } catch (err) {
    console.error('[slash autocomplete]', err.message);
    try { await interaction.respond([]); } catch {}
  }
}

module.exports = { handleCommand, handleAutocomplete }; 
