const { EmbedBuilder } = require('discord.js');
const handbook = require('../game/handbook');
function lines(values) {
  let out = '';
  for (const s of values) { if (out.length + s.length > 850) return out + '\n… Xem toàn bộ trên dashboard.'; out += (out ? '\n' : '') + '• ' + s; }
  return out || 'Chưa ghi nhận trong các nguồn được tra cứu.';
}
module.exports = {
  name: 'find', aliases: ['handbook'], description: 'Tra nguồn kiếm và công dụng vật phẩm: find coal',
  async execute(msg, args = []) {
    const query = args.join(' ').trim();
    if (!query || query.length > 80) return msg.reply('Dùng find <ID hoặc tên vật phẩm>, tối đa 80 ký tự. Ví dụ: find coal');
    const db = require('../db/database');
    let result = handbook.lookup(db, query);
    if (!result) {
      const matches = handbook.search(db, query);
      if (matches.length === 1) result = handbook.lookup(db, matches[0].id);
      else return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('📚 Sổ tay · Tìm vật phẩm')
        .setDescription(matches.length ? matches.map(i => `${i.name} · \`find ${i.id}\``).join('\n').slice(0, 3800) + '\nTối đa 20 kết quả; dùng ID để xem chi tiết.' : 'Không tìm thấy vật phẩm.')] });
    }
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle(`📚 ${result.item.name}`.slice(0, 256))
      .setDescription(`ID: \`${result.item.id}\` · ${result.item.tier}`)
      .addFields({ name: 'Nguồn kiếm', value: lines(result.sources) }, { name: 'Dùng để chế / nấu', value: lines(result.uses) })
      .setFooter({ text: result.note })] });
  },
};
