const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { quiet, loud, fakeMessage } = require('./harness');
let db, aura, ui, player, n=0;
before(()=>{quiet();db=require('../src/db/database');player=require('../src/game/player');aura=require('../src/game/aura');ui=require('../src/game/aura_ui');loud();});
function user(){const id='AURA_UI_'+ ++n;player.createPlayer(id,id);player.updatePlayer(id,{gold:10000});return id;}
function interaction(id,action,rev=aura.token(aura.get(id)),actor=id){
  const i={customId:`aura:${action}:${id}:${rev}`,user:{id:actor},reply:async p=>{i.response=p;i.method='reply';},update:async p=>{i.response=p;i.method='update';}};return i;
}
test('view renders owner-scoped controls, disables empty candidate and respects Discord limits',()=>{
  const id=user();const view=ui.render(id,'',true);const buttons=view.components[0].components.map(b=>b.data);
  assert.equal(buttons.length,4);assert.equal(buttons[1].disabled,true);assert.equal(buttons[2].disabled,true);
  for(const b of buttons){assert.ok(b.custom_id.length<=100);assert.ok(b.custom_id.includes(id));}
  for(const f of view.embeds[0].data.fields)assert.ok(f.value.length<=1024);
});
test('roll needs confirmation, charges once and invalidates old confirmation',async()=>{
  const id=user();const start=aura.token(aura.get(id));
  const prompt=interaction(id,'roll',start);await ui.handle(prompt);assert.equal(prompt.response.ephemeral,true);
  assert.equal(player.getPlayer(id).gold,10000);
  const pay=interaction(id,'pay',start);await ui.handle(pay);assert.equal(pay.method,'update');assert.equal(player.getPlayer(id).gold,7500);
  const duplicate=interaction(id,'pay',start);await ui.handle(duplicate);assert.match(duplicate.response.content,/thay đổi/);assert.equal(player.getPlayer(id).gold,7500);
});
test('non-owner cannot spend or accept and stale command-updated menus cannot apply',async()=>{
  const id=user();const rev=aura.token(aura.get(id));const intruder=interaction(id,'pay',rev,'SOMEONE_ELSE');
  await ui.handle(intruder);assert.match(intruder.response.content,/chủ hồ sơ/);assert.equal(player.getPlayer(id).gold,10000);
  aura.roll(id);const stale=interaction(id,'apply',rev);await ui.handle(stale);assert.match(stale.response.content,/thay đổi/);assert.equal(aura.get(id).active_stat,null);
});
test('accept and discard use guarded confirmations; refresh only redraws current state',async()=>{
  const id=user();aura.roll(id);let rev=aura.token(aura.get(id));
  const ask=interaction(id,'accept',rev);await ui.handle(ask);assert.match(ask.response.content,/Xác nhận/);assert.equal(aura.get(id).active_stat,null);
  const apply=interaction(id,'apply',rev);await ui.handle(apply);assert.ok(aura.get(id).active_stat);assert.equal(aura.get(id).pending_stat,null);
  aura.roll(id,Date.now()+3000);rev=aura.token(aura.get(id));const active=aura.get(id).active_stat;
  await ui.handle(interaction(id,'drop',rev));assert.equal(aura.get(id).active_stat,active);assert.equal(aura.get(id).pending_stat,null);
  const refresh=interaction(id,'refresh','old');await ui.handle(refresh);assert.equal(refresh.method,'update');
});
test('same-effect downgrade and different builds are not mislabeled as upgrades',()=>{
  assert.match(ui.comparison({active_stat:'atk',active_percent:12,pending_stat:'atk',pending_percent:1}),/GIẢM 11/);
  assert.match(ui.comparison({active_stat:'atk',active_percent:12,pending_stat:'hp',pending_percent:12}),/Khác hướng build/);
});
test('button handler routes Aura controls; token survives migrations and state resets do not reuse it',async()=>{
  const id=user();aura.roll(id);const rev=aura.token(aura.get(id));aura.migrate();assert.equal(aura.token(aura.get(id)),rev);
  const refresh=interaction(id,'refresh');await require('../src/buttons').handle(refresh);assert.equal(refresh.method,'update');
  db.prepare('DELETE FROM player_aura WHERE user_id=?').run(id);aura.roll(id);
  assert.notEqual(aura.token(aura.get(id)),rev);
});
test('prefix command still renders menu and direct commands remain supported',async()=>{
  const id=user();const msg=fakeMessage(id);let payload;msg.reply=async p=>{payload=p;};
  await require('../src/commands/aura').execute(msg,[]);assert.equal(payload.components.length,1);
  await require('../src/commands/aura').execute(msg,['roll','confirm']);assert.ok(aura.get(id).pending_stat);
  await require('../src/commands/aura').execute(msg,['accept']);assert.ok(aura.get(id).active_stat);
});
