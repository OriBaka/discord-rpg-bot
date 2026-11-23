const casino = require('../game/casino');
const { getPrefix } = require('../game/prefix');
module.exports = {
  name:'casino', aliases:['songbac'], description:'Mini-game chip miễn phí, không đổi ra tiền hay vật phẩm',
  async execute(msg,args) {
    const p=getPrefix(), action=(args[0]||'help').toLowerCase();
    if(action==='help' || action==='rules') return msg.reply(`🎰 **Sòng chip giải trí** — không mua/bán, đổi vàng/vật phẩm hoặc tiền thật.\n${p}casino daily: nhận 1.000 chip mỗi 24h; balance: xem ví.\n${p}casino slot <cược> | blackjack <cược>\n${p}casino dice @user <cược> | rps @user <cược>\n${p}casino accept/decline/cancel/status <mã-ván>\n${p}casino hit hoặc ${p}casino stand (tự chọn ván blackjack của bạn; không cần mã)\n**Chọn kín qua DM bot:** ${p}casino pick <mã-ván> rock|paper|scissors\nCược 10–500; blackjack số chẵn. Mỗi người một ván/kèo. Kèo chờ 5 phút: hoàn nếu chưa nhận. RPS 5 phút sau nhận: người chưa chọn thua; cả hai chưa chọn hoàn. Blackjack 5 phút cố định: hết giờ thua. Hết hạn được xử lý ở lần gọi casino tiếp theo, kể cả sau restart.\nSlot: 6 biểu tượng đều nhau; bộ ba trả tổng 10×, đúng một đôi hoàn 1×, còn lại 0 (RTP 69,44%). Blackjack bộ 52 lá, nhà cái dừng ở mọi 17; blackjack trả tổng 2,5×, thắng thường 2×, hòa hoàn cược; không split/double/insurance. PvP hai bên cược bằng nhau, thắng nhận toàn bộ 2×, hòa hoàn, không phí. Reset nhân vật không reset chip/ván.`);
    try {
      let params=args.slice(1);
      if(['dice','rps'].includes(action)) {
        const target=msg.mentions?.users?.first?.();
        const id=target?.id || String(args[1]||'').replace(/^<@!?|>$/g,'');
        if(!/^\d{15,22}$/.test(id) || target?.bot || id===msg.author.id) return msg.reply('❌ Mời một người chơi khác bằng @user hoặc Discord ID (không bot).');
        if(!target && msg.client?.users?.fetch) {
          const user=await msg.client.users.fetch(id).catch(()=>null);
          if(!user || user.bot) return msg.reply('❌ Người chơi không hợp lệ hoặc là bot.');
        }
        params=[args[2],id];
      }
      if(action==='pick' && msg.guild) return msg.reply(`🔒 Gửi lựa chọn trong DM bot: ${p}casino pick <mã-ván> rock|paper|scissors. Không nhập lựa chọn ở server.`);
      const r=casino.getService().run(msg.author.id,action,params,msg._interaction?.id || msg.id);
      if(r.chips!==undefined) return msg.reply(`🪙 ${r.claimed?'Đã nhận 1.000 chip. ':''}Số dư: **${r.chips} chip** (không đổi thưởng).`);
      const data=r.data;
      // Never publish sealed picks, shoe contents or dealer hole card before settlement.
      const detail=r.kind==='blackjack' ? `Bài bạn: ${(data.player||[]).join(', ')}; nhà cái: ${(data.dealer||[]).join(', ')}`
        :r.kind==='slot'?`Ô quay: ${data.reels.join(' · ')}`
        :r.kind==='dice'?`Xúc xắc: ${data.rolls?.join(' / ')||'chưa tung'}`
        :r.status==='done'?`Lựa chọn: ${data[r.a]||'chưa chọn'} / ${data[r.b]||'chưa chọn'}`:`Đã chọn kín: ${data.chosen||0}/2`;
      return msg.reply({content:`🎰 **${r.kind}** · cược mỗi bên ${r.stake} chip\nMã: \`${r.id}\`\nChủ kèo: <@${r.a}>${r.b?` · Đối thủ: <@${r.b}>`:''}\n${detail}\n${data.result||`Trạng thái: ${r.status}; hạn <t:${Math.floor(r.expires/1000)}:R>`}\n${r.status==='pending'?`Người nhận dùng ${p}casino accept ${r.id}`:r.status==='active'&&r.kind==='rps'?`Chọn trong DM: ${p}casino pick ${r.id} rock|paper|scissors`:r.status==='active'&&r.kind==='blackjack'?`${p}casino hit hoặc ${p}casino stand (không cần mã ván)`:''}`,allowedMentions:{parse:[]}});
    } catch(e) {
      if(e.code) { console.error('[casino]',e); return msg.reply('⚠️ Không xử lý được, dùng status kiểm tra ván trước khi thử lại.'); }
      return msg.reply(`❌ ${e.message}`);
    }
  },
};
