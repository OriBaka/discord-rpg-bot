// Router cho tin nhắn prefix (`%gather ...`), tách khỏi src/index.js để TEST được.
//
// Trước đây logic này nằm inline trong `client.on('messageCreate')`, nên không
// có test nào chạm tới được — và đúng chỗ đó có lỗi: lệnh không tồn tại bị
// `return` im lặng, khiến người chơi gõ lệnh chưa deploy tưởng bot hỏng.
const hint = require('./command_hint');

async function handleMessage(msg, { commands, prefix, limiter }) {
  if (!msg || !msg.content || msg.author?.bot) return;
  if (!msg.content.startsWith(prefix)) return;

  const args = msg.content.slice(prefix.length).trim().split(/\s+/);
  const name = (args.shift() || '').toLowerCase();
  const cmd = commands.get(name);

  if (!cmd) {
    // Chỉ nhắc khi tên trông giống lệnh + chưa nhắc người này trong 30s qua →
    // không biến kênh chat thành nơi bot càu nhàu mỗi tin nhắn bắt đầu bằng %.
    if (limiter && hint.looksLikeCommand(name) && limiter.allow(msg.author.id)) {
      const suggestion = hint.closestCommand(name, commands.keys());
      Promise.resolve(msg.reply(hint.unknownCommandText(name, prefix, suggestion))).catch(() => {});
    }
    return;
  }

  try {
    return await cmd.execute(msg, args);
  } catch (err) {
    console.error(err);
    Promise.resolve(msg.reply('⚠️ Có lỗi xảy ra, kiểm tra log nhé.')).catch(() => {});
  }
}

module.exports = { handleMessage };
