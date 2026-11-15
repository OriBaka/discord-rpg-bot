const { getEffectiveStats } = require('./player');
const { MITIGATION_K, MITIGATION_CAP, MAX_HIT_PCT, mitigation } = require('./mitigation');

// ===== Giới hạn vòng =====
// Trước đây hard-code 20 vòng: trận nào chưa xong sau 20 vòng bị tính là THUA,
// dù quái còn rất ít HP và người chơi gần như không mất máu. Đó là lý do
// Ancient/Void Dragon "bất khả thi": Lv.40 full gear gây 109 dmg/lượt, cần 37
// lượt để giết Void Dragon (4000 HP) nhưng bị cắt ở lượt 20.
//
// Nay: cho trận chạy tới khi phân thắng bại, nhưng vẫn có trần an toàn để
// không bao giờ treo vòng lặp (2 bên đều bất tử là bất khả thi vì sát thương
// tối thiểu luôn >= 1, nên trận luôn kết thúc; trần này chỉ là chốt chặn).
const MAX_ROUNDS = 100;

// ===== Giảm sát thương theo DEF =====
// Công thức cũ: dmg = atk - def (tuyến tính). Nó có 2 chế độ chết:
//   - DEF thấp hơn ATK quái → nhận sát thương gần như đầy đủ, chết trong 2-3 đòn
//   - DEF cao hơn ATK quái → miễn nhiễm vĩnh viễn
// Vì 3 class có DEF chênh nhau tới 40%, một bảng quái chung không thể cân cho
// cả Chiến Binh (DEF cao) lẫn Pháp Sư (HP thấp): sửa cho lớp này thì lớp kia
// thành bất tử. Đây chính là lý do endgame lệch hoàn toàn (0% hoặc 100%).
//
// Công thức mới (giảm thương theo tỉ lệ, chuẩn thể loại RPG):
//     giảm thương = def / (def + K)
//     sát thương  = atk * (1 - giảm thương)
// DEF vẫn quý (mỗi điểm DEF đều có tác dụng) nhưng KHÔNG BAO GIỜ miễn nhiễm,
// và khoảng cách giữa 3 class thu hẹp lại → cùng một bảng quái cân được cho cả ba.
// Trần 75% để DEF khủng không thành bất tử.
// Hằng số nằm ở mitigation.js (nguồn duy nhất, dùng chung với skills.js và
// test/balance_sim.js). def = K → giảm 50%; giảm tối đa 75% (def >= 3K).

// ===== Chí mạng =====
// Trước đây sát thương hoàn toàn tất định (chỉ lệch ±2), nên một trận hoặc
// thắng 100% hoặc thua 100%. Crit tạo biến thiên thật cho cả hai bên → trận
// đấu có kịch tính và tỉ lệ thắng trở thành một phổ liên tục để cân bằng.
const CRIT_CHANCE = 0.15;
const CRIT_MULT = 1.6;

// Trần sát thương nhận mỗi đòn — đọc từ mitigation.js. Đây là cơ chế cân
// bằng class, không chỉ là chống one-shot; xem chú thích chi tiết ở đó.

// Sát thương sau khi giảm theo DEF (và trần theo % max HP của bên nhận)
function damageAfterDef(atk, def, receiverMaxHp = Infinity) {
  const reduction = mitigation(def);
  const raw = atk * (1 - reduction) + rand(-2, 3);
  const capped = Number.isFinite(receiverMaxHp)
    ? Math.min(raw, Math.max(1, receiverMaxHp * MAX_HIT_PCT))
    : raw;
  return Math.max(1, Math.round(capped));
}

// Nhân crit (dùng chung cho 2 bên)
function rollCrit() {
  return Math.random() < CRIT_CHANCE;
}

// Mô phỏng 1 trận đánh nhanh, trả về log + kết quả
function simulateBattle(player, monster) {
  const stats = getEffectiveStats(player);
  let pHp = player.hp;
  let mHp = monster.hp;
  const log = [];
  let round = 0;

  while (pHp > 0 && mHp > 0 && round < MAX_ROUNDS) {
    round++;
    // Người chơi đánh trước
    const pCrit = rollCrit();
    let pDmg = damageAfterDef(stats.atk, monster.def);
    if (pCrit) pDmg = Math.round(pDmg * CRIT_MULT);
    mHp -= pDmg;
    log.push(`⚔️ Bạn gây **${pDmg}** sát thương${pCrit ? ' 💢CHÍ MẠNG' : ''} → ${monster.name} còn **${Math.max(0,mHp)} HP**`);
    if (mHp <= 0) break;

    // Quái phản đòn
    const mCrit = rollCrit();
    let mDmg = damageAfterDef(monster.atk, stats.def, player.max_hp);
    if (mCrit) mDmg = Math.round(mDmg * CRIT_MULT);
    pHp -= mDmg;
    log.push(`💥 ${monster.name} đánh trả **${mDmg}**${mCrit ? ' 💢CHÍ MẠNG' : ''} → Bạn còn **${Math.max(0,pHp)} HP**`);
  }

  const win = mHp <= 0;
  // Hết trần vòng mà chưa ai chết → hoà, KHÔNG tính là thua.
  const timedOut = !win && pHp > 0 && round >= MAX_ROUNDS;

  return {
    win,
    timedOut,                       // true = chạm trần vòng (không phải thua)
    playerHpAfter: Math.max(0, pHp),
    monsterHpLeft: Math.max(0, mHp),
    rounds: round,
    log,
  };
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollLoot(monster) {
  const dropped = [];
  for (const d of monster.drops || []) {
    if (Math.random() < d.chance) dropped.push({ item_id: d.item_id, qty: d.qty });
  }
  const [gMin, gMax] = monster.gold;
  const gold = rand(gMin, gMax);
  return { gold, items: dropped };
}

module.exports = {
  simulateBattle, rollLoot, rand, damageAfterDef, rollCrit,
  MAX_ROUNDS, MITIGATION_K, MITIGATION_CAP, CRIT_CHANCE, CRIT_MULT, MAX_HIT_PCT,
};
