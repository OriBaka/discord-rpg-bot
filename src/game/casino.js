// Play chips only: no bridge to RPG currency, items or real money.
const { randomInt, randomUUID } = require('node:crypto');
const DAY = 86400000, TTL = 300000, MAX = 500;
function migrate() {
  require('../db/database').exec(`CREATE TABLE IF NOT EXISTS casino_wallets(user_id TEXT PRIMARY KEY, chips INTEGER NOT NULL DEFAULT 0 CHECK(chips>=0), claimed_at INTEGER);
    CREATE TABLE IF NOT EXISTS casino_games(id TEXT PRIMARY KEY, kind TEXT NOT NULL, a TEXT NOT NULL, b TEXT, stake INTEGER NOT NULL, status TEXT NOT NULL, expires INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS casino_receipts(user_id TEXT NOT NULL, request_id TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(user_id,request_id));
    CREATE INDEX IF NOT EXISTS casino_open ON casino_games(status,expires);`);
}
function score(cards) { let n = cards.reduce((s,c) => s + Math.min(c,10),0), aces = cards.filter(c=>c===1).length; while (aces-- && n+10<=21) { n+=10; break; } return n; }
function createService(db, clock = Date.now, rng = randomInt) {
  const atomic = fn => db.transaction(fn).immediate();
  const fail = text => { throw new Error(text); };
  function wallet(u) { db.prepare('INSERT OR IGNORE INTO casino_wallets(user_id) VALUES(?)').run(u); return db.prepare('SELECT * FROM casino_wallets WHERE user_id=?').get(u); }
  function pay(u,n) { wallet(u); db.prepare('UPDATE casino_wallets SET chips=chips+? WHERE user_id=?').run(n,u); }
  function debit(u,n) { if(wallet(u).chips<n) fail('Không đủ chip.'); pay(u,-n); }
  function save(g) { db.prepare('UPDATE casino_games SET status=?,expires=?,data=? WHERE id=?').run(g.status,g.expires,JSON.stringify(g.data),g.id); }
  function settle(g, winner, note) {
    if(g.status==='done') fail('Ván đã chốt.');
    if(g.b && g.status==='active') {
      if(winner==='draw') { pay(g.a,g.stake); pay(g.b,g.stake); } else pay(winner,2*g.stake);
    } else if (winner==='draw') pay(g.a,g.stake);
    else if(winner===g.a) pay(g.a, g.kind==='blackjack' && g.data.natural ? g.stake*2.5 : g.stake*2);
    g.status='done'; g.data.result=note; save(g); return g;
  }
  function expire() {
    for(const row of db.prepare("SELECT * FROM casino_games WHERE status!='done' AND expires<=?").all(clock())) {
      const g={...row,data:JSON.parse(row.data)};
      if(g.status==='pending') settle(g,'draw','Kèo hết hạn, hoàn cược chủ kèo.');
      else if(g.kind==='rps') {
        const a=g.data[g.a], b=g.data[g.b];
        settle(g, a&&!b ? g.a : b&&!a ? g.b : 'draw', a||b ? 'Hết giờ: người chưa chọn xử thua.' : 'Cả hai chưa chọn: hòa, hoàn cược.');
      } else settle(g,null,'Blackjack hết giờ: xử thua.');
    }
  }
  function busy(u) { return db.prepare("SELECT 1 FROM casino_games WHERE status!='done' AND (a=? OR b=?)").get(u,u); }
  function insert(kind,a,b,stake,status,data) {
    const g={id:randomUUID(),kind,a,b,stake,status,expires:clock()+TTL,data};
    db.prepare('INSERT INTO casino_games VALUES(?,?,?,?,?,?,?,?)').run(g.id,kind,a,b,stake,status,g.expires,JSON.stringify(data)); return g;
  }
  function view(g) {
    const v={...g,data:{...g.data}};
    if(g.status!=='done' && g.kind==='rps') v.data={ chosen: [g.a,g.b].filter(u=>g.data[u]).length };
    if(g.status!=='done' && g.kind==='blackjack') v.data={player:g.data.player,dealer:[g.data.dealer[0],'?']};
    delete v.data.deck;
    return v;
  }
  function act(u, action, args=[]) {
    // Expiry commits separately, even if the requested action is invalid.
    return atomic(()=> {
      if(action==='balance') return {chips:wallet(u).chips};
      if(action==='daily') { const w=wallet(u); if(w.claimed_at!==null && clock()-w.claimed_at<DAY) fail('Chip miễn phí mỗi 24 giờ một lần.'); pay(u,1000); db.prepare('UPDATE casino_wallets SET claimed_at=? WHERE user_id=?').run(clock(),u); return {chips:wallet(u).chips, claimed:1000}; }
      if(['slot','blackjack','dice','rps'].includes(action)) {
        const stake=Number(args[0]);
        if(!/^\d+$/.test(String(args[0])) || !Number.isSafeInteger(stake) || stake<10 || stake>MAX || (action==='blackjack' && stake%2)) fail('Cược 10–500 chip nguyên; blackjack cần số chẵn.');
        if(busy(u)) fail('Bạn còn một ván/kèo chưa kết thúc.');
        const b=['dice','rps'].includes(action) ? args[1] : null;
        if(b && (b===u || busy(b))) fail('Không thể tự đấu hoặc mời người đang có ván.');
        if(['dice','rps'].includes(action) && !b) fail('Cần người nhận kèo.');
        debit(u,stake);
        if(b) return view(insert(action,u,b,stake,'pending',{}));
        if(action==='slot') {
          const reels=[rng(0,6),rng(0,6),rng(0,6)], count=new Set(reels).size;
          const multiplier=count===1?10:count===2?1:0;
          const g=insert(action,u,null,stake,'active',{reels,multiplier});
          pay(u,stake*multiplier); g.status='done'; g.data.result=`Slot trả tổng ${stake*multiplier} chip.`; save(g); return view(g);
        }
        const deck=[]; for(let s=0;s<4;s++) for(let c=1;c<=13;c++) deck.push(c);
        for(let i=deck.length-1;i>0;i--) { const j=rng(0,i+1); [deck[i],deck[j]]=[deck[j],deck[i]]; }
        const player=[deck.pop(),deck.pop()], dealer=[deck.pop(),deck.pop()];
        const g=insert(action,u,null,stake,'active',{deck,player,dealer,natural:score(player)===21});
        if(score(player)===21 || score(dealer)===21) settle(g,score(player)===score(dealer)?'draw':score(player)===21?u:null,'Blackjack tự chốt bài tự nhiên.');
        return view(g);
      }
      const autoBlackjack=['hit','stand'].includes(action) && !args[0];
      const row=autoBlackjack
        ? db.prepare("SELECT * FROM casino_games WHERE a=? AND kind='blackjack' AND status='active' ORDER BY rowid DESC LIMIT 1").get(u)
        : action==='status' && !args[0]
        ? db.prepare('SELECT * FROM casino_games WHERE a=? OR b=? ORDER BY rowid DESC LIMIT 1').get(u,u)
        : db.prepare('SELECT * FROM casino_games WHERE id=?').get(args[0]);
      if(autoBlackjack && !row) fail('Bạn không có ván blackjack đang chơi. Dùng casino blackjack <cược> để mở ván.');
      if(!row || ![row.a,row.b].includes(u)) fail('Không tìm thấy ván của bạn.');
      const g={...row,data:JSON.parse(row.data)};
      if(action==='status') return view(g);
      if(g.status==='done') fail('Ván đã kết thúc.');
      if(action==='cancel' && g.status==='pending' && u===g.a || action==='decline' && g.status==='pending' && u===g.b) return view(settle(g,'draw','Kèo hủy/từ chối: hoàn cược.'));
      if(action==='accept' && g.status==='pending' && u===g.b) {
        debit(u,g.stake); g.status='active'; g.expires=clock()+TTL; save(g);
        if(g.kind==='dice') { const a=rng(1,7), b=rng(1,7); g.data.rolls=[a,b]; settle(g,a===b?'draw':a>b?g.a:g.b,'Xúc xắc: '+(a===b?'hòa':a>b?'chủ kèo thắng':'người nhận thắng')); }
        return view(g);
      }
      if(g.status!=='active') fail('Kèo chưa được nhận.');
      if(action==='pick' && g.kind==='rps') {
        const choice=args[1]; if(!['rock','paper','scissors'].includes(choice) || g.data[u]) fail('Chọn rock/paper/scissors một lần duy nhất.');
        g.data[u]=choice;
        if(g.data[g.a] && g.data[g.b]) {
          const a=g.data[g.a],b=g.data[g.b]; const win={rock:'scissors',paper:'rock',scissors:'paper'};
          settle(g,a===b?'draw':win[a]===b?g.a:g.b,'Oẳn tù tì: '+(a===b?'hòa':win[a]===b?'chủ kèo thắng':'người nhận thắng'));
        } else save(g);
        return view(g);
      }
      if(g.kind==='blackjack' && ['hit','stand'].includes(action)) {
        if(action==='hit') { g.data.player.push(g.data.deck.pop()); if(score(g.data.player)>21) settle(g,null,'Quá 21: thua.'); else if(score(g.data.player)<21) { save(g); return view(g); } }
        if(g.status!=='done') {
          while(score(g.data.dealer)<17) g.data.dealer.push(g.data.deck.pop());
          const p=score(g.data.player),d=score(g.data.dealer);
          settle(g,p===d?'draw':d>21||p>d?u:null,`Bạn ${p} / Nhà cái ${d}: ${p===d?'hòa':d>21||p>d?'thắng':'thua'}.`);
        }
        return view(g);
      }
      fail('Thao tác không hợp lệ cho ván này.');
    });
  }
  function run(u, action, args=[], requestId=null) {
    atomic(expire);
    return atomic(()=> {
      if(requestId) {
        const receipt=db.prepare('SELECT result FROM casino_receipts WHERE user_id=? AND request_id=?').get(u,requestId);
        if(receipt) return JSON.parse(receipt.result);
      }
      const result=act(u,action,args);
      if(requestId) db.prepare('INSERT INTO casino_receipts VALUES(?,?,?)').run(u,requestId,JSON.stringify(result));
      return result;
    });
  }
  return {run};
}
let service;
module.exports={migrate,createService,score,getService:()=>service ||= createService(require('../db/database'))};
