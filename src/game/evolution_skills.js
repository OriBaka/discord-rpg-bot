function create({hit,effect}) {
 const own=(s,branch)=>({...s,branch});
 return {
  shield_riposte:own(hit('shield_riposte','🛡️ Shield Riposte','melee',25,3,20,1.2,'120% ATK, giảm 35% sát thương trực tiếp trong 1 lượt.',()=>({applyBuff:effect('self','defend',1,0.35)})),'guardian'),
  frenzy_strike:own(hit('frenzy_strike','🩸 Frenzy Strike','melee',25,3,25,1.8,'180% ATK; dưới 50% HP tăng 25% sát thương.',a=>({mult:a.hp/a.max_hp<0.5?1.25:1})),'berserker'),
  elemental_weave:own(hit('elemental_weave','🌈 Elemental Weave','magic',25,3,25,1.5,'150% ATK; tiêu Burn tăng 30% sát thương.',(a,t)=>({mult:t.buffs?.burn?1.3:1,consumeTarget:['burn']})),'elementalist'),
  withering_hex:own(hit('withering_hex','🌑 Withering Hex','magic',25,3,25,1.1,'110% ATK, giảm 15% ATK địch trong 3 lượt.',()=>({applyBuff:effect('enemy','atk_down',3,0.15)})),'hexer'),
  precision_bolt:own(hit('precision_bolt','🎯 Precision Bolt','ranged',25,3,25,1.8,'180% ATK, bỏ 35% DEF.',()=>({pierce:0.35})),'sharpshooter'),
  snaring_shot:own(hit('snaring_shot','🪤 Snaring Shot','ranged',25,3,20,1.3,'130% ATK, Dấu săn 2 lượt và giảm 20% ATK địch 2 lượt.',()=>({applyBuffs:[effect('enemy','mark',2,1),effect('enemy','atk_down',2,0.2)]})),'hunter'),
 };
}
module.exports={create};
