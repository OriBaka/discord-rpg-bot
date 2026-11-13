// CÁCH HIỂN THỊ ITEM — NGUỒN DUY NHẤT cho info / inv / compare / gear.
//
// Vì sao phải gom về một chỗ: mỗi lệnh tự viết bảng nhãn riêng, nên khi bảng
// `items` có thêm cột mới (heal_pct, min_level, image_url...) thì chỉ lệnh được
// sửa mới biết — các lệnh còn lại lặng lẽ bỏ qua field đó. Đúng lỗi người dùng
// báo: "%info item elixir" không hiện gì về hồi máu, vì bình máu bây giờ dùng
// heal_pct (heal = 0) còn info chỉ kiểm tra `if (it.heal)`.
//
// Nguyên tắc: KHÔNG bỏ qua dữ liệu. Field nào có trong row mà chưa có nhãn thì
// vẫn hiện với nhãn suy ra từ tên cột (xem statPairs), để thêm cột mới là tự
// động thấy ngay, không phải sửa lệnh.

const TYPE_LABELS = {
  weapon: '🗡️ Vũ khí',
  offhand: '🛡️ Tay phụ',
  armor: '🦺 Giáp',
  accessory: '✨ Phụ kiện',
  consumable: '🧪 Tiêu hao',
  material: '📦 Nguyên liệu',
  pet: '🐾 Pet',
  lootbox: '🎁 Hộp quà',
};

const ARMOR_SLOT_LABELS = {
  head: '⛑️ Đầu', chest: '👕 Thân', legs: '👖 Quần', feet: '👢 Giày', hands: '🧤 Găng',
};

const ACCESSORY_LABELS = {
  ring: '💍 Nhẫn', necklace: '📿 Dây chuyền', special: '✨ Đặc biệt',
};

// Thứ tự nhóm quen thuộc. Nhóm KHÔNG có trong danh sách này vẫn được hiển thị
// (xếp sau, theo alphabet) — trước đây chúng bị bỏ luôn khỏi danh sách, nên
// item mới (vd type=lootbox do admin tạo) không bao giờ xuất hiện.
const GROUP_ORDER = [
  'weapon', 'offhand',
  'armor:head', 'armor:chest', 'armor:legs', 'armor:feet', 'armor:hands',
  'accessory:ring', 'accessory:necklace', 'accessory:special',
  'consumable', 'material', 'pet', 'lootbox',
];

function typeLabel(type) {
  return TYPE_LABELS[type] || `📦 ${type || '?'}`;
}

/** Nhóm hiển thị của 1 item: {key, label}. Dùng chung cho info + inv. */
function groupOf(it) {
  if (it.type === 'armor') {
    const slot = it.armor_slot || '';
    return {
      key: 'armor:' + (slot || 'other'),
      label: (slot && ARMOR_SLOT_LABELS[slot]) || `🦺 Giáp${slot ? ' (' + slot + ')' : ' (khác)'}`,
    };
  }
  if (it.type === 'accessory') {
    const acc = it.accessory_type || '';
    return {
      key: 'accessory:' + (acc || 'other'),
      label: (acc && ACCESSORY_LABELS[acc]) || `✨ Phụ kiện${acc ? ' (' + acc + ')' : ' (khác)'}`,
    };
  }
  return { key: it.type || 'other', label: typeLabel(it.type) };
}

/** Sắp khóa nhóm: nhóm quen thuộc trước, nhóm lạ sau (alphabet). */
function sortGroupKeys(keys) {
  const known = k => {
    const i = GROUP_ORDER.indexOf(k);
    return i < 0 ? GROUP_ORDER.length : i;
  };
  return [...keys].sort((a, b) => (known(a) - known(b)) || a.localeCompare(b));
}

/** Mô tả hồi máu: bình % (heal_pct) hoặc bình số cố định (heal cũ). */
function healText(it) {
  const pct = Number(it.heal_pct) || 0;
  if (pct > 0) return `+${pct}% max HP`;
  if (it.heal) return `+${it.heal} HP`;
  return null;
}

// Field hiển thị: [khóa trong row, nhãn, hàm format]. Thứ tự = thứ tự hiện.
const KNOWN_FIELDS = [
  ['atk', '⚔️ ATK', v => `+${v}`],
  ['def', '🛡️ DEF', v => `+${v}`],
  ['heal', '❤️ Hồi HP', (v, it) => `+${v} HP${Number(it.heal_pct) ? ' (không dùng)' : ''}`],
  ['heal_pct', '❤️ Hồi HP', v => `${v}% max HP`],
  ['min_level', '🔒 Level yêu cầu', v => `Lv.${v}`],
  ['class_req', '🎭 Yêu cầu class', v => v],
  ['weapon_type', '🗡️ Loại vũ khí', v => v],
  ['armor_slot', '🎽 Slot giáp', v => v],
  ['armor_type', '🦺 Loại giáp', v => v],
  ['accessory_type', '✨ Loại phụ kiện', v => v],
  ['soulbound', '🔒 Soulbound', () => 'Không trade được'],
  ['price', '💰 Giá mua', v => `${v}`],
  ['sell', '💸 Giá bán', v => `${v}`],
];

// Cột không hiện dạng dòng (đã hiện ở tiêu đề/mô tả, hoặc không phải chỉ số)
const HIDDEN_FIELDS = new Set(['id', 'name', 'type', 'tier', 'desc', 'image_url']);

/**
 * Danh sách dòng chỉ số của 1 item: [{name, value}].
 * Field lạ (cột mới chưa có nhãn) vẫn được hiện với nhãn suy từ tên cột.
 */
function statPairs(it) {
  const out = [];
  const used = new Set();

  for (const [key, label, fmt] of KNOWN_FIELDS) {
    const v = it[key];
    used.add(key);
    if (v === null || v === undefined || v === '' || v === 0) continue;
    // heal và heal_pct cùng mô tả "hồi máu" — chỉ hiện cái đang có tác dụng
    if (key === 'heal' && Number(it.heal_pct) > 0) continue;
    if (key === 'min_level' && Number(v) <= 1) continue;   // Lv.1 là mặc định, khỏi rườm
    out.push({ name: label, value: fmt(v, it) });
  }
  if (it.image_url) out.push({ name: '🖼️ Ảnh', value: 'đã gắn' });

  // Field lạ → vẫn hiện
  for (const [key, v] of Object.entries(it)) {
    if (used.has(key) || HIDDEN_FIELDS.has(key)) continue;
    if (v === null || v === undefined || v === '' || v === 0) continue;
    out.push({ name: `• ${key}`, value: String(v) });
  }
  return out;
}

/** 1 dòng gọn cho danh sách: "🟠 Tên `id` — ⚔️ 62 · 🔒 Lv.45". */
function oneLine(it, { tierInfo, equipped = false, levelLock = 0 } = {}) {
  const t = tierInfo ? tierInfo(it.tier) : { emoji: '' };
  const bits = [];
  if (it.atk) bits.push(`⚔️${it.atk}`);
  if (it.def) bits.push(`🛡️${it.def}`);
  const h = healText(it);
  if (h) bits.push(`❤️${h.replace('+', '')}`);
  if (it.min_level > 1) bits.push(`Lv.${it.min_level}`);
  if (levelLock) bits.push(`🔒LV${levelLock}`);
  if (equipped) bits.push('🟢');
  if (it.soulbound) bits.push('🔗');
  return `${t.emoji} ${it.name} \`${it.id}\`${bits.length ? ' — ' + bits.join(' · ') : ''}`;
}

module.exports = {
  TYPE_LABELS, GROUP_ORDER,
  typeLabel, groupOf, sortGroupKeys, healText, statPairs, oneLine,
};
