// Test khoá tài liệu lore "Thất Đại Tội".
// Chạy: npm test
//
// Vì sao cần test cho một file markdown: lore này cố ý neo vào các thực thể
// ĐANG CÓ trong game (zone, quái, item). Nếu ai đó đổi tên hoặc xoá một con
// quái, câu chuyện sẽ trỏ vào chỗ trống mà không ai biết. Test này bắt điều đó.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let db, doc;

const DOC_PATH = path.join(__dirname, '..', 'docs', 'LORE_that_dai_toi.md');

before(() => {
  db = require('../src/db/database');
  doc = fs.readFileSync(DOC_PATH, 'utf8');
});

// Bảy cây kiếm và thực thể game mà mỗi cây neo vào
const SWORD_ANCHORS = [
  ['Kiêu Ngạo', 'void_harbinger', 'astral_ruins'],
  ['Đố Kỵ', 'star_devourer', 'astral_ruins'],
  ['Lười Biếng', 'astral_sentinel', 'astral_ruins'],
  ['Tham Lam', 'abyss_leviathan', 'frozen_abyss'],
  ['Phàm Ăn', 'drake_whelp', 'dragon_lair'],
  ['Dục Vọng', 'ember_phoenix', 'volcano'],
];

// Đọc bảng tra trong tài liệu: | Tên cây kiếm | Nơi xuất hiện | Thực thể |
// Test "gán sai zone" ở bản đầu KHÔNG bắt được lỗi vì bảng tra không có dòng
// nào để so. Nay đọc thẳng từ tài liệu rồi đối chiếu với DB.
function swordTable() {
  const rows = [];
  for (const line of doc.split('\n')) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
    if (!m) continue;
    const [, name, place, entity] = m;
    if (name === 'Cây kiếm' || name.startsWith('---')) continue;
    // chỉ lấy các dòng thuộc bảng bảy cây kiếm (có cột thứ 3 chứa id/backtick)
    if (!/`/.test(entity) && !/tro|mithril/i.test(entity)) continue;
    rows.push({ name, place, entity });
  }
  return rows;
}

test('tài liệu lore tồn tại và có đủ 7 cây kiếm', () => {
  assert.ok(doc.length > 5000, 'tài liệu lore quá ngắn — có thể bị ghi đè nhầm');
  const sins = ['Kiêu Ngạo', 'Đố Kỵ', 'Phẫn Nộ', 'Lười Biếng', 'Tham Lam', 'Phàm Ăn', 'Dục Vọng'];
  for (const s of sins) {
    assert.ok(doc.includes(s), `thiếu đại tội: ${s}`);
  }
});

test('mọi thực thể được lore neo vào đều tồn tại trong DB', () => {
  for (const [sin, mobId, zoneId] of SWORD_ANCHORS) {
    const mob = db.prepare('SELECT id, zone_id FROM monsters WHERE id=?').get(mobId);
    assert.ok(mob, `lore "${sin}" neo vào quái ${mobId} nhưng quái này không tồn tại`);
    assert.strictEqual(mob.zone_id, zoneId,
      `lore nói "${sin}" ở ${zoneId} nhưng ${mobId} thực tế ở ${mob.zone_id}`);
    assert.ok(doc.includes(mobId), `lore phải nhắc tới ${mobId} (neo của "${sin}")`);
  }
});

test('lore dùng đúng dữ kiện của game, không bịa cơ chế', () => {
  // mithril_ingot: lore nói "không ai rèn ra, chỉ cướp được" → phải KHÔNG bán ở shop
  const inShop = db.prepare("SELECT 1 FROM shop WHERE item_id='mithril_ingot'").get();
  assert.ok(!inShop, 'lore nói mithril_ingot không mua được, nhưng nó đang bán ở shop');

  // ...và phải drop từ đúng 2 con mà lore nêu tên
  const droppers = db.prepare(`SELECT DISTINCT monster_id FROM monster_drops
    WHERE item_id='mithril_ingot' ORDER BY monster_id`).all().map(r => r.monster_id);
  assert.deepStrictEqual(droppers, ['char_giant', 'glacier_wyrm'],
    `lore nêu char_giant + glacier_wyrm, thực tế: ${droppers.join(', ')}`);

  // void_essence: lore nói rỉ ra từ vết thương rồng → chỉ có ở 2 zone đó
  const voidZones = db.prepare(`SELECT DISTINCT m.zone_id z FROM monster_drops d
    JOIN monsters m ON m.id=d.monster_id WHERE d.item_id='void_essence' ORDER BY z`).all().map(r => r.z);
  assert.deepStrictEqual(voidZones, ['astral_ruins', 'dragon_lair'],
    `void_essence phải ở astral_ruins + dragon_lair, thực tế: ${voidZones.join(', ')}`);
});

test('bảng tra ghi đúng zone của từng cây kiếm', () => {
  const TABLE = swordTable();
  assert.ok(TABLE.length >= 7, `bảng tra chỉ có ${TABLE.length} dòng, phải >= 7`);
  const ZONE_NAMES = {
    'Astral Ruins': 'astral_ruins',
    "Dragon's Lair": 'dragon_lair',
    'Frozen Abyss': 'frozen_abyss',
    'Ember Peak': 'volcano',
  };
  for (const [sin, mobId, zoneId] of SWORD_ANCHORS) {
    const row = TABLE.find(r => r.name === sin);
    assert.ok(row, `bảng tra thiếu cây kiếm: ${sin}`);
    assert.ok(row.entity.includes(mobId),
      `bảng tra của "${sin}" phải nêu ${mobId}, đang là "${row.entity}"`);
    const expectedZone = ZONE_NAMES[row.place];
    assert.strictEqual(expectedZone, zoneId,
      `bảng tra ghi "${sin}" ở ${row.place} (=${expectedZone}) nhưng neo thật là ${zoneId}`);
  }
});

test('số cây kiếm được nuốt khớp với số chỗ còn lại', () => {
  // Lore: 7 rèn ở Astral, 3 ở lại Astral, 4 bị rồng nuốt.
  // Đây là chỗ tôi từng viết sai ("nuốt cả bảy" trong khi 3 cây vẫn ở Astral).
  assert.ok(doc.includes('nuốt bốn cây'), 'phải nói rõ rồng nuốt BỐN cây');
  assert.ok(!/nuốt cả bảy/.test(doc), 'không được nói rồng nuốt cả bảy — 3 cây vẫn ở Astral');

  const astralSwords = SWORD_ANCHORS.filter(([, , zone]) => zone === 'astral_ruins');
  assert.strictEqual(astralSwords.length, 3, 'phải có đúng 3 cây kiếm neo ở Astral Ruins');
  assert.strictEqual(SWORD_ANCHORS.length, 6, 'phải có 6 neo quái (cây thứ 7 là Ember Peak, không có người cầm)');
});

test('bảng tra trong lore không nhắc thực thể không tồn tại', () => {
  // Mọi `id_dang_snake_case` xuất hiện trong tài liệu phải là thứ có thật
  const known = new Set([
    ...db.prepare('SELECT id FROM monsters').all().map(r => r.id),
    ...db.prepare('SELECT id FROM zones').all().map(r => r.id),
    ...db.prepare('SELECT id FROM items').all().map(r => r.id),
    ...db.prepare('SELECT id FROM gather_zones').all().map(r => r.id),
  ]);
  const mentioned = new Set(doc.match(/`[a-z][a-z0-9_]{3,}`/g) || []);
  const bogus = [...mentioned]
    .map(m => m.replace(/`/g, ''))
    .filter(id => !known.has(id));
  assert.deepStrictEqual(bogus, [],
    `lore nhắc tới id không tồn tại trong game: ${bogus.join(', ')}`);
});
