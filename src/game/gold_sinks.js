function db() { return require('../db/database'); }
const COSMETICS = {
  jade: { name: 'Ngọc bích', type: 'color', color: 0x1ABC9C, price: 1500 },
  rose: { name: 'Hồng ánh nguyệt', type: 'color', color: 0xE91E63, price: 1500 },
  gold: { name: 'Hoàng kim', type: 'color', color: 0xF1C40F, price: 5000 },
  wanderer: { name: 'Người Lữ Hành', type: 'title', price: 2000 },
  patron: { name: 'Người Bảo Trợ', type: 'title', price: 10000 },
  lantern: { name: 'Ánh Đèn Không Tắt', type: 'title', price: 25000 },
};
const BUILDINGS = {
  hall: { name: 'Đại sảnh', icon: '🏛️', costs: [5000, 15000, 40000], desc: 'Nơi hội họp, tiếp đón lữ khách của bang.' },
  library: { name: 'Thư viện', icon: '📚', costs: [5000, 15000, 40000], desc: 'Lưu giữ ký ức về những người đứng đợi.' },
  monument: { name: 'Tượng đài', icon: '🗿', costs: [10000, 30000, 80000], desc: 'Vinh danh những người góp sức xây dựng bang.' },
};
function migrate() {
  db().exec(`CREATE TABLE IF NOT EXISTS cosmetic_owned (user_id TEXT NOT NULL, cosmetic_id TEXT NOT NULL, PRIMARY KEY(user_id, cosmetic_id));
    CREATE TABLE IF NOT EXISTS cosmetic_equipped (user_id TEXT NOT NULL, type TEXT NOT NULL, cosmetic_id TEXT NOT NULL, PRIMARY KEY(user_id, type));
    CREATE TABLE IF NOT EXISTS guild_buildings (guild_id INTEGER NOT NULL, building_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 0, funded INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id, building_id));
    CREATE TABLE IF NOT EXISTS gold_sink_log (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
}
function log(user, kind, target, amount) {
  db().prepare('INSERT INTO gold_sink_log (user_id,kind,target,amount,created_at) VALUES (?,?,?,?,?)').run(user, kind, target, amount, Date.now());
}
function appearance(user) {
  const rows = db().prepare('SELECT * FROM cosmetic_equipped WHERE user_id=?').all(user);
  const result = {};
  for (const r of rows) if (COSMETICS[r.cosmetic_id]?.type === r.type) result[r.type] = COSMETICS[r.cosmetic_id];
  return result;
}
function purchase(user, id) {
  const c = Object.hasOwn(COSMETICS, id) ? COSMETICS[id] : null;
  if (!c) return { error: 'Không có ngoại hình này.' };
  return db().transaction(() => {
    if (db().prepare('SELECT 1 FROM cosmetic_owned WHERE user_id=? AND cosmetic_id=?').get(user, id)) return { error: 'Bạn đã sở hữu; không trừ vàng lần nữa.' };
    if (!db().prepare('UPDATE players SET gold=gold-? WHERE user_id=? AND gold>=?').run(c.price, user, c.price).changes) return { error: 'Không đủ vàng.' };
    db().prepare('INSERT INTO cosmetic_owned VALUES (?,?)').run(user, id);
    log(user, 'cosmetic', id, c.price);
    return { spent: c.price };
  })();
}
function equip(user, id) {
  if (['default_color', 'default_title'].includes(id)) {
    db().prepare('DELETE FROM cosmetic_equipped WHERE user_id=? AND type=?').run(user, id.slice(8));
    return {};
  }
  const c = Object.hasOwn(COSMETICS, id) ? COSMETICS[id] : null;
  if (!c || !db().prepare('SELECT 1 FROM cosmetic_owned WHERE user_id=? AND cosmetic_id=?').get(user, id)) return { error: 'Bạn chưa sở hữu ngoại hình này.' };
  db().prepare('INSERT OR REPLACE INTO cosmetic_equipped VALUES (?,?,?)').run(user, c.type, id);
  return {};
}
function buildings(guild) {
  return Object.entries(BUILDINGS).map(([id, b]) => ({ id, ...b,
    level: 0, funded: 0,
    ...db().prepare('SELECT level,funded FROM guild_buildings WHERE guild_id=? AND building_id=?').get(guild, id),
  }));
}
function contribute(user, id, amount) {
  if (!Object.hasOwn(BUILDINGS, id)) return { error: 'Công trình không tồn tại.' };
  if (!Number.isSafeInteger(amount) || amount <= 0) return { error: 'Số vàng phải là số nguyên dương hợp lệ.' };
  return db().transaction(() => {
    const member = require('./guilds').getMember(user);
    if (!member) return { error: 'Bạn chưa vào bang.' };
    const b = buildings(member.guild_id).find(b => b.id === id);
    if (b.level >= b.costs.length) return { error: 'Công trình đã đạt cấp tối đa.' };
    // Never charge more than the current level needs; no accidental overflow.
    const spent = Math.min(amount, b.costs[b.level] - b.funded);
    if (!db().prepare('UPDATE players SET gold=gold-? WHERE user_id=? AND gold>=?').run(spent, user, spent).changes) return { error: 'Không đủ vàng.' };
    const complete = b.funded + spent === b.costs[b.level];
    db().prepare('INSERT OR REPLACE INTO guild_buildings VALUES (?,?,?,?)').run(member.guild_id, id, b.level + Number(complete), complete ? 0 : b.funded + spent);
    log(user, 'building', `${member.guild_id}:${id}`, spent);
    return { spent, complete };
  })();
}
module.exports = { migrate, COSMETICS, BUILDINGS, appearance, purchase, equip, buildings, contribute };
