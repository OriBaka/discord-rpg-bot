const { EmbedBuilder } = require('discord.js');
const catalog = require('../game/skills');
const builds = require('../game/skill_builds');
const COMBOS = {
  melee: 'Slash / Iron Guard lấy Đà → Whirlwind; Guard Break phá giáp → Execute khi địch dưới 35% HP.',
  magic: 'Fireball đặt Burn → Arcane Burst/Meteor tiêu Burn; Heal để duy trì, Freeze để ngắt nhịp, Barrier giảm áp lực.',
  ranged: 'Trap/Volley/Steady Aim đánh dấu → Aimed Shot hoặc Piercing Arrow tiêu dấu; Evasive Step để phòng thủ.',
};
module.exports = {
  name: 'skills', aliases: ['skill', 'kynang'],
  description: 'Kỹ năng: skills | skills info <id> | skills equip <1–4 id> | skills reset',
  async execute(msg, args = []) {
    const p = require('../game/player').getPlayer(msg.author.id);
    if (!p?.primary_class) return msg.reply('Hãy tạo nhân vật và chọn class trước.');
    const prefix = require('../game/prefix').getPrefix();
    const action = args[0] || '';
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
        .setDescription(`${s.desc}\nID: ${s.id} · ${s.class || 'Chung'} · Lv.${s.level || 1}\nChi phí: ${s.cost || 0} NL · CD: ${s.cd || 0} lượt chủ sở hữu.\nNăng lượng +8 cuối mỗi lượt, tối đa 100; đầu trận 60.\nChiêu khống chế không thể bỏ qua bằng Heal; mất lượt vẫn giảm CD và hồi năng lượng.`)] });
    }
    if (action && !['help', 'list'].includes(action)) return msg.reply(`Dùng ${prefix}skills help để xem hướng dẫn.`);
    const equipped = builds.get(p.user_id, p.primary_class, p.level);
    return msg.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📖 Kỹ năng · ${p.primary_class} · Lv.${p.level}`)
      .setDescription(`Mang tối đa 4 kỹ năng, không cần trang bị Attack/Defend/Flee. Mở miễn phí theo cấp, không tốn điểm hay vàng.\nBộ hiện tại: ${equipped.join(', ')}\n\n${COMBOS[p.primary_class] || ''}`)
      .addFields(catalog.getSkillsForClass(p.primary_class).map(s => ({ name: `${p.level < s.level ? '🔒' : equipped.includes(s.id) ? '✅' : '▫️'} ${s.name} · Lv.${s.level}`, value: `\`${s.id}\` · ${s.cost} NL · CD ${s.cd}\n${s.desc}` })))
      .setFooter({ text: `${prefix}skills equip id1 id2 id3 id4 • skills info <id> • skills reset. Chỉ battle/tower; hunt nhanh, duel và raid tuần chưa dùng bộ chiêu.` })] });
  },
};
