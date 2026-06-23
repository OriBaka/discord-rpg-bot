const { getEffectiveStats } = require('./player');

// Mô phỏng 1 trận đánh nhanh, trả về log + kết quả
function simulateBattle(player, monster) {
  const stats = getEffectiveStats(player);
  let pHp = player.hp;
  let mHp = monster.hp;
  const log = [];
  let round = 0;

  while (pHp > 0 && mHp > 0 && round < 20) {
    round++;
    // Người chơi đánh trước
    const pDmg = Math.max(1, stats.atk - monster.def + rand(-2, 3));
    mHp -= pDmg;
    log.push(`⚔️ Bạn gây **${pDmg}** sát thương → ${monster.name} còn **${Math.max(0,mHp)} HP**`);
    if (mHp <= 0) break;

    // Quái phản đòn
    const mDmg = Math.max(1, monster.atk - stats.def + rand(-2, 3));
    pHp -= mDmg;
    log.push(`💥 ${monster.name} đánh trả **${mDmg}** → Bạn còn **${Math.max(0,pHp)} HP**`);
  }

  return {
    win: mHp <= 0,
    playerHpAfter: Math.max(0, pHp),
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

module.exports = { simulateBattle, rollLoot, rand };
