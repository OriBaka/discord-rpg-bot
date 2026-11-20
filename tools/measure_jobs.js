// ĐO gold/phút của từng nghề hái (mining / fishing / foraging) — dùng để kiểm
// tra công cụ bổ trợ có làm lệch nghề hay không, thay vì đoán.
//
// Chạy: node tools/measure_jobs.js [level]   (mặc định 50)
//
// Exact discrete quantity expectation for a neutral action (no streak/vein,
// treasure, aura, buff purchase/travel costs or XP valuation). These omissions
// can change relative rankings; this is NOT total player income per minute.
const db = require('../src/db/database');
const gz = require('../src/game/gather_zones');
const jobTools = require('../src/game/job_tools');
const jobBuffs = require('../src/game/job_buffs');
const { levelBonusMult } = require('../src/game/gather_zones');

const LEVEL = parseInt(process.argv[2] || '50', 10);
const JOBS = ['mining', 'fishing', 'foraging'];

function bestZone(job, level) {
  return gz.getZonesByJob(job)
    .filter(z => z.min_job_level <= level)
    .sort((a, b) => b.min_job_level - a.min_job_level)[0];
}

function bestToolRow(job, level) {
  const rows = db.prepare(`SELECT jt.*, i.min_level FROM job_tools jt
    JOIN items i ON i.id = jt.item_id
    WHERE jt.job = ? AND COALESCE(i.min_level,0) <= ?
    ORDER BY i.min_level DESC, i.price DESC LIMIT 1`).all(job, level);
  return rows[0] || null;
}

function goldPerAction(zone, level, stats) {
  const drops = gz.getDrops(zone.id);
  const dropMult = 1 + (stats?.drop_bonus || 0);
  // Foraging currently applies level bonus, not qtyMult (matches gather.js).
  const qtyMult = zone.job_type === 'foraging' ? 1 : 1 + (stats?.qty_bonus || 0);
  const extra = Math.min(jobBuffs.CAPS.extra, stats?.extra_chance || 0);
  const lvlMult = zone.job_type === 'foraging' ? levelBonusMult(level, zone.min_job_level) : 1;

  let gold = 0;
  for (const d of drops) {
    const it = db.prepare('SELECT sell FROM items WHERE id = ?').get(d.item_id);
    if (!it) continue;
    const chance = Math.min(1, d.chance * dropMult);
    let expectedQty = 0;
    for (let qty = d.qty_min; qty <= d.qty_max; qty++) {
      expectedQty += Math.max(1, Math.round(qty * qtyMult * lvlMult)) + extra;
    }
    expectedQty /= d.qty_max - d.qty_min + 1;
    gold += chance * expectedQty * (it.sell || 0);
  }
  return gold;
}

function perMinute(zone, gold) {
  return (gold * 60000) / (zone.cooldown_ms || 30000);
}

// Gói bonus tổng (tool + buff), đã áp trần giống job_buffs.bonus()
function combinedBonus(job, level, withBuff) {
  const tool = bestToolRow(job, level);
  const buffs = withBuff ? bestBuffRow(job, level) : null;
  const C = jobBuffs.CAPS;
  const drop = Math.min(C.drop, (tool?.drop_bonus || 0) + (buffs?.drop_bonus || 0));
  const qty = Math.min(C.qty, (tool?.qty_bonus || 0) + (buffs?.qty_bonus || 0));
  const extra = Math.min(C.extra, (tool?.extra_chance || 0) + (buffs?.extra_chance || 0));
  return { drop_bonus: drop, qty_bonus: qty, extra_chance: extra, tool, buff: buffs };
}

// Buff mạnh nhất NGƯỜI CHƠI ĐỦ CẤP dùng (min_level) — đo bằng buff Lv.10 khi
// đang Lv.1 là vô nghĩa và làm con số kinh tế sai.
function bestBuffRow(job, level = LEVEL) {
  return db.prepare(`SELECT jb.*, i.price FROM job_buff_items jb
    JOIN items i ON i.id = jb.item_id WHERE jb.job = ? AND COALESCE(i.min_level,1) <= ?
    ORDER BY i.price DESC LIMIT 1`).get(job, level);
}

const rows = [];
for (const job of JOBS) {
  const zone = bestZone(job, LEVEL);
  if (!zone) { console.log(`${job}: không có zone cho Lv.${LEVEL}`); continue; }
  const basePerAction = goldPerAction(zone, LEVEL, null);
  const toolPerAction = goldPerAction(zone, LEVEL, bestToolRow(job, LEVEL));
  const buffPerAction = goldPerAction(zone, LEVEL, combinedBonus(job, LEVEL, true));

  const buff = bestBuffRow(job, LEVEL);
  const costPerUse = buff ? buff.price / buff.charges : 0;
  const gainPerUse = buffPerAction - toolPerAction;

  rows.push({
    job, zone: zone.id,
    base: perMinute(zone, basePerAction),
    withTool: perMinute(zone, toolPerAction),
    withBuff: perMinute(zone, buffPerAction),
    gain: basePerAction ? (toolPerAction / basePerAction - 1) * 100 : 0,
    buffGain: toolPerAction ? (buffPerAction / toolPerAction - 1) * 100 : 0,
    tool: bestToolRow(job, LEVEL)?.item_id,
    buff: buff?.item_id, costPerUse, gainPerUse, net: gainPerUse - costPerUse,
  });
}

function main() {
console.log(`\n=== gold/phút ở Lv.${LEVEL} (chưa tính chuỗi/mạch/kho báu) ===`);
console.log('nghề      zone                 không công cụ   có công cụ   +buff (vàng/phút)');
for (const r of rows) {
  console.log(
    r.job.padEnd(9),
    r.zone.padEnd(20),
    r.base.toFixed(0).padStart(8),
    r.withTool.toFixed(0).padStart(12),
    r.withBuff.toFixed(0).padStart(10),
    `  (công cụ +${r.gain.toFixed(0)}%, buff +${r.buffGain.toFixed(0)}%)`
  );
}
console.log(`\n=== buff có đáng tiền không (tính theo VÀNG MỖI LƯỢT) ===`);
console.log('nghề      buff             giá/lượt   lời/lượt   lãi ròng');
for (const r of rows) {
  console.log(
    r.job.padEnd(9),
    String(r.buff).padEnd(16),
    r.costPerUse.toFixed(0).padStart(8),
    r.gainPerUse.toFixed(0).padStart(10),
    (r.net >= 0 ? '+' : '') + r.net.toFixed(0)
  );
}
const spread = Math.max(...rows.map(r => r.withTool)) / Math.min(...rows.map(r => r.withTool));
console.log(`\nChênh lệch cao nhất/thấp nhất sau khi có công cụ: ${spread.toFixed(2)}×`);
}

// Xuất công thức để test kiểm tra kinh tế buff (không phải đoán tay):
//   goldPerAction('mining', 10, {drop_bonus: .25}) → vàng kỳ vọng mỗi lượt
module.exports = { goldPerAction, bestZone, bestToolRow, bestBuffRow, combinedBonus, LEVEL };

if (require.main === module) main();
