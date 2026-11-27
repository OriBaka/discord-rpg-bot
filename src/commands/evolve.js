const evo=require('../game/evolution');
const {getPrefix}=require('../game/prefix');
module.exports={name:'evolve',aliases:['tienhoa','chuyentinh'],description:'Tiến hóa class và chuyên tinh nghề vĩnh viễn',async execute(msg,args=[]){
 const p=getPrefix(),user=msg.author.id;
 const usage=`🌿 **Tiến hóa tầng I — lựa chọn VĨNH VIỄN**\n${p}evolve class melee|magic|ranged\n${p}evolve job mining|fishing|foraging|cooking|crafting\nĐiều kiện: Lv.25 đúng class/nghề và 20 hoạt động thành công được ghi kể từ khi tính năng ra mắt. Class: thắng hunt khi đang dùng class đó. Nghề: lượt mine/fish/gather có nguyên liệu, hoặc một lệnh craft/cook thành công (batch chỉ tính 1).\n${p}evolve trial <class|job> <gốc> <nhánh> — diễn tập chỉ số chuẩn, không thưởng/không tốn đồ\n${p}evolve choose <class|job> <gốc> <nhánh> — đọc cảnh báo và nhận mã xác nhận\n${p}evolve confirm <class|job> <gốc> <nhánh> <mã> — chốt vĩnh viễn trong 10 phút\nĐổi class gốc vẫn được; nhánh từng class lưu riêng. Reset kỹ năng/preset/nhân vật không xóa nhánh. Không có tẩy nhánh. Tầng II/III chưa mở.`;
 if(!args.length||['help','rules'].includes(args[0]))return msg.reply(usage);
 const action=args[0].toLowerCase();
 if(['class','job'].includes(action)){
  const root=args[1],s=evo.state(user,action,root);if(s.error)return msg.reply(s.error+'\n'+usage);
  return msg.reply(`🌿 **${s.tree.name} — tầng I** · Lv.${s.level}/25 · Hoạt động ${s.progress}/20\nĐã khóa: **${s.branch ? s.tree.branches[s.branch].name : 'chưa chọn'}**\n${Object.values(s.tree.branches).map(b=>`**${b.name}** · \`${b.id}\`\n${b.desc}`).join('\n\n')}\n${p}evolve trial ${action} ${root} <nhánh> để xem diễn tập. Kỹ năng chiến đấu phải tự equip vào bộ 1–4 chiêu, không tự thay chiêu. Tiến hóa chỉ thêm lựa chọn, không lấy mất kỹ năng gốc/bí kíp đã học.`);
 }
 if(!['trial','choose','confirm'].includes(action))return msg.reply(usage);
 if(args.length!==(action==='confirm'?5:4))return msg.reply(usage);
 const [domain,root,branch,token]=args.slice(1);
 try{
  const r=evo.act(user,action,domain,root,branch,token);
  if(r.error)return msg.reply('❌ '+r.error);
  if(action==='trial')return msg.reply(`🧪 **Diễn tập ${r.branch.name}** (mô phỏng chuẩn, không phải trận thật)\n${r.branch.desc}\n${r.demo}\nNhân vật mẫu: ATK100, HP400/1000; địch DEF100, không trạng thái. Không mất HP/đồ, không nhận thưởng.\nChốt lựa chọn: ${p}evolve choose ${domain} ${root} ${branch}`);
  if(action==='choose')return msg.reply(`⚠️ **XÁC NHẬN QUYẾT ĐỊNH VĨNH VIỄN**\n${r.branch.name}: ${r.branch.desc}\nSẽ khóa: ${r.locked.join(', ')}. Không đổi bằng vàng, vật phẩm, reset kỹ năng, đổi class hay reset nhân vật. Class/nghề khác vẫn chọn độc lập.\nNếu đã chắc chắn, trong 10 phút nhập:\n\`${p}evolve confirm ${domain} ${root} ${branch} ${r.token}\`\nKhông xác nhận thì không thay đổi gì.`);
  return msg.reply(`🌿 Đã tiến hóa thành **${r.branch.name}**! Lựa chọn ${domain}/${root} đã khóa vĩnh viễn.\n${r.branch.desc}${domain==='class'?`\nXem ${p}skills và dùng ${p}skills equip để đưa chiêu nhánh vào bộ.`:''}`);
 }catch(e){console.error('[evolve]',e);return msg.reply(`⚠️ Không ghi được lựa chọn. Dùng ${p}evolve ${domain} ${root} kiểm tra trước khi thử lại.`);}
}};
