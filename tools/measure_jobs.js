// ĐO gold/phút của từng nghề hái (mining / fishing / foraging) — dùng để kiểm
// tra công cụ bổ trợ có làm lệch nghề hay không, thay vì đoán.
//
// Chạy: node tools/measure_jobs.js [level]   (mặc định 50)
//
// Mô hình (khớp code thật):
//   gold mỗi lượt = Σ  chance_eff × E[số lượng] × giá bán
//   chance_eff    = min(1, chance × (1 + drop_bonus))
//   E[số lượng]   = trung bình(qty_min..qty_max) × (1 + qty_bonus) × levelBonusMult
//   gold/phút     = gold mỗi lượt × 60000 / cooldown_ms
// Bỏ qua chuỗi may mắn / mạch giàu / kho báu: chúng nhân như nhau cho mọi nghề
// nên không đổi thứ hạng tương đối (đã ghi rõ để không ai đọc số này như tuyệt đối).
const path = require('path');
const db = require('../src/db/database');
const gz = require('../src/game/gather_zones');
const jobTools = require('../src/game/job_tools');
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
  const qtyMult = 1 + (stats?.qty_bonus || 0);
  const lvlMult = zone.job_type === 'foraging' ? levelBonusMult(level, zone.min_job_level) : 1;

  let gold = 0;
  for (const d of drops) {
    const it = db.prepare('SELECT sell FROM items WHERE id = ?').get(d.item_id);
    if (!it) continue;
    const chance = Math.min(1, d.chance * dropMult);
    const avgQty = (d.qty_min + d.qty_max) / 2;
    gold += chance * avgQty * qtyMult * lvlMult * (it.sell || 0);
  }
  return gold;
}

function perMinute(zone, gold) {
  return (gold * 60000) / (zone.cooldown_ms || 30000);
}

const rows = [];
for (const job of JOBS) {
  const zone = bestZone(job, LEVEL);
  if (!zone) { console.log(`${job}: không có zone cho Lv.${LEVEL}`); continue; }
  const tool = bestToolRow(job, LEVEL);
  const base = perMinute(zone, goldPerAction(zone, LEVEL, null));
  const withTool = perMinute(zone, goldPerAction(zone, LEVEL, tool));
  rows.push({ job, zone: zone.id, base, withTool, gain: base ? (withTool / base - 1) * 100 : 0, tool: tool?.item_id });
}

console.log(`\n=== gold/phút ở Lv.${LEVEL} (chưa tính chuỗi/mạch/kho báu) ===`);
console.log('nghề      zone                 không công cụ   có công cụ tốt   tăng   công cụ');
for (const r of rows) {
  console.log(
    r.job.padEnd(9),
    r.zone.padEnd(20),
    r.base.toFixed(0).padStart(8),
    r.withTool.toFixed(0).padStart(15),
    `${r.gain.toFixed(0)}%`.padStart(7),
    '  ' + (r.tool || '—')
  );
}
const spread = Math.max(...rows.map(r => r.withTool)) / Math.min(...rows.map(r => r.withTool));
console.log(`\nChênh lệch cao nhất/thấp nhất sau khi có công cụ: ${spread.toFixed(2)}×`);
