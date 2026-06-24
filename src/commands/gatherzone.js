// Admin command để quản lý gather zones (mining/fishing)
const { EmbedBuilder } = require('discord.js');
const { getItem } = require('../game/items');
const gz = require('../game/gather_zones');
const { getRestTokens, parseKV } = require('../game/argparse');

function isAdmin(msg) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim());
  return adminIds.includes(msg.author.id)
      || (msg.guild && msg.guild.ownerId === msg.author.id)
      || (msg.member && msg.member.permissions?.has('Administrator'));
}

module.exports = {
  name: 'gatherzone',
  aliases: ['gz', 'mzone'],
  description: 'Admin: quản lý mining/fishing zones',
  async execute(msg, args) {
    if (!isAdmin(msg)) return msg.reply('🚫 Chỉ admin.');

    const prefix = process.env.PREFIX || '!';
    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'help') {
      return msg.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🛠️ Gather Zone Admin')
        .setDescription([
          `\`${prefix}gz list [mining|fishing]\` — list zones`,
          `\`${prefix}gz create <id> job=mining name="..." icon="🪨" minlv=10 cd=30000 xp=20 desc="..."\``,
          `\`${prefix}gz delete <id>\``,
          `\`${prefix}gz drop <zone_id> <item_id> chance=0.5 qmin=1 qmax=3\``,
          `\`${prefix}gz undrop <zone_id> <item_id>\``,
          '',
          '`cd` = cooldown milliseconds (mặc định 30000 = 30s)',
        ].join('\n'))] });
    }

    if (sub === 'list') {
      const filter = args[1]?.toLowerCase();
      const jobs = filter ? [filter] : ['mining', 'fishing'];
      const embed = new EmbedBuilder().setColor(0xED4245).setTitle('🗺️ Gather Zones');
      for (const jt of jobs) {
        const zones = gz.getZonesByJob(jt);
        if (zones.length === 0) continue;
        const lines = zones.map(z => `\`${z.id}\` ${z.icon} ${z.name} (lv${z.min_job_level}+, cd${z.cooldown_ms/1000}s, +${z.base_xp}xp)`);
        embed.addFields({ name: jt, value: lines.join('\n').slice(0, 1024) });
      }
      return msg.reply({ embeds: [embed] });
    }

    if (sub === 'create' || sub === 'new') {
      const tokens = getRestTokens(msg, prefix, 2);
      const id = tokens[0];
      if (!id) return msg.reply('❌ Thiếu id.');
      if (gz.getZone(id)) return msg.reply('❌ Id đã tồn tại.');
      const kv = parseKV(tokens.slice(1));
      if (!kv.name || !kv.job) return msg.reply('❌ Cần `name="..."` và `job=mining|fishing`.');
      if (!['mining', 'fishing'].includes(kv.job)) return msg.reply('❌ `job` phải là `mining` hoặc `fishing`.');
      const intOr = (v, d) => { const n = parseInt(v); return isNaN(n) ? d : n; };
      const z = gz.createZone({
        id, job_type: kv.job, name: kv.name, icon: kv.icon || '',
        desc: kv.desc || '',
        min_job_level: intOr(kv.minlv, 1),
        cooldown_ms: intOr(kv.cd, 30000),
        base_xp: intOr(kv.xp, 10),
      });
      return msg.reply(`✅ Đã tạo zone **${z.icon} ${z.name}** (\`${z.id}\`).`);
    }

    if (sub === 'delete' || sub === 'del') {
      const id = args[1];
      if (!id) return msg.reply('❌ Thiếu id.');
      const ok = gz.deleteZone(id);
      return msg.reply(ok ? `🗑️ Đã xoá zone \`${id}\`` : '❌ Zone không tồn tại.');
    }

    if (sub === 'drop') {
      const zoneId = args[1];
      const itemId = args[2];
      if (!zoneId || !itemId) return msg.reply(`❌ Cú pháp: \`${prefix}gz drop <zone_id> <item_id> chance=0.5 qmin=1 qmax=3\``);
      if (!gz.getZone(zoneId)) return msg.reply('❌ Zone không tồn tại.');
      if (!getItem(itemId)) return msg.reply('❌ Item không tồn tại.');
      const tokens = getRestTokens(msg, prefix, 4); // bỏ gz drop zone_id item_id
      const kv = parseKV(tokens);
      const chance = parseFloat(kv.chance);
      if (isNaN(chance) || chance < 0 || chance > 1) return msg.reply('❌ `chance` phải 0-1.');
      const qmin = parseInt(kv.qmin) || 1;
      const qmax = parseInt(kv.qmax) || qmin;
      gz.addDrop(zoneId, itemId, chance, qmin, qmax);
      return msg.reply(`✅ Đã set drop \`${itemId}\` ở \`${zoneId}\` (${Math.round(chance*100)}%, ${qmin}-${qmax}).`);
    }

    if (sub === 'undrop') {
      const zoneId = args[1]; const itemId = args[2];
      if (!zoneId || !itemId) return msg.reply(`❌ Cú pháp: \`${prefix}gz undrop <zone_id> <item_id>\``);
      const ok = gz.removeDrop(zoneId, itemId);
      return msg.reply(ok ? '🗑️ Đã xoá drop.' : '❌ Không có drop này.');
    }

    return msg.reply(`❌ Lệnh con không hợp lệ.`);
  },
}; 
