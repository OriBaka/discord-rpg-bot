const { EmbedBuilder } = require('discord.js');
const catalog = require('../game/skills');
const builds = require('../game/skill_builds');
const tomes = require('../game/skill_tomes');
function isAdmin(msg) {
  return (process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).includes(msg.author.id)
    || msg.guild?.ownerId === msg.author.id || !!msg.member?.permissions?.has('Administrator');
}
const COMBOS = {
  melee: 'Slash / Iron Guard lấy Đà → Whirlwind; Guard Break phá giáp → Execute khi địch dưới 35% HP.',
  magic: 'Fireball đặt Burn → Arcane Burst/Meteor tiêu Burn; Heal để duy trì, Freeze để ngắt nhịp, Barrier giảm áp lực.',
  ranged: 'Trap/Volley/Steady Aim đánh dấu → Aimed Shot hoặc Piercing Arrow tiêu dấu; Evasive Step để phòng thủ.',
};
module.exports = {
  name: 'skills', aliases: ['skill', 'kynang'],
  description: 'Kỹ năng: skills | skills info <id> | skills equip <1–4 id> | skills reset | skills presets/save/load/delete',
  async execute(msg, args = []) {
    const p = require('../game/player').getPlayer(msg.author.id);
    if (!p?.primary_class) return msg.reply('Hãy tạo nhân vật và chọn class trước.');
    const prefix = require('../game/prefix').getPrefix();
    const action = args[0] || '';
    const guild = msg.guild?.id;
    if (action === 'events') {
      if (!guild) return msg.reply('Xem sự kiện trong server mở sự kiện.');
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xD4AF37).setTitle('🏮 Sự kiện bí kíp · server này')
        .setDescription(tomes.events(guild).map(e => `**${e.id}** · ${e.skill_id} · ${e.claims}/${e.max_claims} suất · ${e.closed || Date.now() >= e.ends_at ? 'ĐÃ ĐÓNG/HẾT HẠN' : 'ĐANG MỞ'}\nHết hạn: ${new Date(e.ends_at).toISOString()} · ${prefix}skills claim ${e.id}`).join('\n') || 'Chưa có sự kiện do admin mở.')
        .setFooter({ text: 'Mỗi người một lần mỗi sự kiện; sách limited không giao dịch. Hết hạn nhận không xóa chiêu đã học/sách đã nhận.' })] });
    }
    if (action === 'claim') {
      if (!guild) return msg.reply('Nhận tại server mở sự kiện.');
      const result = tomes.claimEvent(guild, args[1], p.user_id);
      return msg.reply(result.error || `Đã nhận ${result.item}. Học bằng ${prefix}use ${result.item} khi đủ cấp.`);
    }
    if (action === 'event') {
      if (!isAdmin(msg) || !guild) return msg.reply('Chỉ admin server được quản lý sự kiện bí kíp.');
      if (args[1] === 'create') {
        const result = tomes.createEvent(guild, args[2], args[3], Number(args[4]), Number(args[5]), msg.author.id);
        return msg.reply(result.error || `Đã mở ${args[2]} cho ${args[3]} trong ${args[4]} giờ, ${args[5]} suất. Người chơi: ${prefix}skills claim ${args[2]}.`);
      }
      if (args[1] === 'close') return msg.reply(tomes.closeEvent(guild, args[2]) ? 'Đã đóng sự kiện, không xóa chiêu/sách đã nhận.' : 'Không có sự kiện này trong server.');
      return msg.reply(`Admin: ${prefix}skills event create <id> <limited_skill> <giờ> <suất> | ${prefix}skills event close <id>. Tối đa 720 giờ; không tạo lại ID cũ.`);
    }
    if (action === 'presets') {
      const rows = builds.presets(p.user_id, p.primary_class);
      return msg.reply(`📚 Bộ chiêu đã lưu · ${p.primary_class} (${rows.length}/3)\n` + (rows.map(r => `**${r.name}**: ${r.skills}`).join('\n') || 'Chưa lưu bộ nào.') + `\n${prefix}skills save boss · load boss · delete boss. Đặt bộ hiện tại bằng skills equip rồi save; chỉ đổi ngoài trận.`);
    }
    if (['save', 'load', 'delete'].includes(action)) {
      const result = builds.preset(p.user_id, action, args[1]);
      return msg.reply(result.error || `✅ ${action === 'save' ? 'Đã lưu' : action === 'load' ? 'Đã áp dụng' : 'Đã xóa'} bộ ${result.name} · ${p.primary_class}${result.skills ? ': ' + result.skills.join(', ') : ''}. Không đổi trận đã bắt đầu.`);
    }
    if (['equip', 'reset'].includes(action) && builds.inBattle(p.user_id)) return msg.reply('Hãy kết thúc trận đang hoạt động trước khi đổi bộ chiêu.');
    if (action === 'equip') {
      const ids = args.slice(1).flatMap(s => s.split(',')).filter(Boolean);
      const result = builds.set(p.user_id, p.primary_class, p.level, ids);
      return msg.reply(result.error || `Đã lưu bộ chiêu ${p.primary_class}: ${ids.join(', ')}. Miễn phí; chỉ áp dụng khi bắt đầu trận mới.`);
    }
    if (action === 'reset') { builds.reset(p.user_id, p.primary_class); return msg.reply('Đã trở về bộ chiêu mặc định, không mất vàng; áp dụng trận mới.'); }
    if (action === 'info') {
      const s = catalog.getSkill(args[1]);
      if (!s || s.bossOnly) return msg.reply('Không tìm thấy kỹ năng người chơi.');
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(s.name)
        .setDescription(`${s.desc}\nID: ${s.id} · ${s.class || 'Chung'} · Lv.${s.level || 1}\nChi phí: ${s.cost || 0} NL · CD: ${s.cd || 0} lượt chủ sở hữu.\n${s.branch ? `Nhánh yêu cầu: ${s.branch} (evolve class ${s.class})\n` : ''}${s.book ? `Bí kíp: ${tomes.bookId(s.id)} · ${tomes.knows(p.user_id, s.id) ? 'ĐÃ HỌC' : 'CHƯA HỌC'}\nNguồn: ${tomes.sourceText(s)}\nHọc: ${prefix}use ${tomes.bookId(s.id)} (đủ cấp và đúng class).\n` : ''}Năng lượng +8 cuối mỗi lượt, tối đa 100; đầu trận 60.\nChiêu khống chế không thể bỏ qua bằng Heal; mất lượt vẫn giảm CD và hồi năng lượng.`)] });
    }
    if (action && !['help', 'list'].includes(action)) return msg.reply(`Dùng ${prefix}skills help để xem hướng dẫn.`);
    const equipped = builds.get(p.user_id, p.primary_class, p.level);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📖 Kỹ năng · ${p.primary_class} · Lv.${p.level}`)
      .setDescription(`Mang tối đa 4 kỹ năng, không cần trang bị Attack/Defend/Flee. 18 chiêu nền mở miễn phí theo cấp; chiêu bí kíp cần kiếm sách và học. Không phí đổi bộ chiêu.\nBộ hiện tại: ${equipped.join(', ')}\n\n${COMBOS[p.primary_class] || ''}`)
      .addFields(catalog.getSkillsForClass(p.primary_class).map(s => ({ name: `${p.level < s.level || (s.branch && require('../game/evolution').choice(p.user_id, 'class', p.primary_class) !== s.branch) || (s.book && !tomes.knows(p.user_id, s.id)) ? '🔒' : equipped.includes(s.id) ? '✅' : '▫️'} ${s.name} · Lv.${s.level}`, value: `\`${s.id}\` · ${s.cost} NL · CD ${s.cd}\n${s.desc}${s.branch ? `\n🌿 Nhánh vĩnh viễn: ${s.branch} · xem ${prefix}evolve class ${s.class}` : ''}${s.book ? `\n📜 ${tomes.knows(p.user_id, s.id) ? 'Đã học' : 'Chưa học'} · ${tomes.sourceText(s)}` : ''}` })))
      .setFooter({ text: `${prefix}skills equip id1 id2 id3 id4 • skills info <id> • skills events / claim <id>. skills presets/save/load/delete <tên> • Chỉ battle/tower; hunt nhanh, duel và raid tuần chưa dùng bộ chiêu.` })] });
  },
};
