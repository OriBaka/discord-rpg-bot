// Independent conditional rolls: one item, no tool/aura/streak/extra multipliers.
const RARES = [
  ['dew_clover', '🍀 Cỏ Ba Lá Ngậm Sương', 'sunlit_meadow', 'fog', 'day', 0.008, 90, 'Cỏ chỉ đọng hạt sương bạc khi đồng cỏ chìm trong sương ban ngày.'],
  ['rain_orchid', '🌺 Lan Vũ Thủy', 'whisper_woods', 'rain', 'day', 0.006, 130, 'Cánh lan mở trong mưa ban ngày, khép lại khi nắng xuyên tán rừng.'],
  ['ghost_morel', '🍄 Nấm Đèn Ma', 'mossy_marsh', 'fog', 'night', 0.005, 180, 'Nấm lân tinh hiếm chỉ lộ dưới sương đêm đầm rêu.'],
  ['snow_moonflower', '❄️ Nguyệt Hoa Tuyết', 'ancient_grove', 'snow', 'night', 0.004, 260, 'Nụ hoa trắng nở giữa tuyết đêm bên rễ cổ thụ.'],
  ['storm_star_seed', '🌱 Hạt Sao Giông', 'world_tree_roots', 'storm', 'night', 0.003, 400, 'Hạt cây giữ một tia sáng nhỏ, chỉ rời rễ khi giông nổi về đêm.'],
  ['mist_pearl_carp', '🐟 Cá Chép Ngọc Sương', 'village_pond', 'fog', 'day', 0.008, 90, 'Cá chép vảy ngọc chỉ nổi lên ao làng giữa sương ban ngày.'],
  ['rainbow_rain_trout', '🐠 Cá Hồi Vũ Sắc', 'river', 'rain', 'day', 0.006, 130, 'Vảy ánh bảy sắc dưới dòng sông khi mưa ban ngày.'],
  ['moon_glass_eel', '🐍 Cá Chình Kính Nguyệt', 'lake', 'clear', 'night', 0.005, 180, 'Thân trong như kính, xuất hiện trên hồ sâu vào đêm trời quang.'],
  ['thunder_sailfish', '🐟 Cá Buồm Lôi Vân', 'ocean', 'storm', 'day', 0.004, 260, 'Vây như cánh buồm hứng điện, chỉ lên gần mặt biển trong giông ban ngày.'],
  ['void_snow_ray', '🌌 Cá Đuối Tuyết Hư Không', 'void_pool', 'snow', 'night', 0.003, 400, 'Bóng cá đuối trắng bạc trôi dưới hồ hư không khi tuyết rơi trong đêm.'],
].map(([id, name, zone, weather, period, chance, sell, desc]) => Object.freeze({ id, name, zone, weather, period, chance, sell, desc }));
function migrate() {
  const db = require('../db/database');
  const insert = db.prepare("INSERT OR IGNORE INTO items(id,name,type,tier,sell,desc) VALUES (?,?,'material','epic',?,?)");
  for (const r of RARES) insert.run(r.id, r.name, r.sell, `${r.desc} Vật sưu tầm thời tiết, không tăng chỉ số. Tỷ lệ riêng không chịu bonus công cụ/buff.`);
}
function roll(zone, state, rng = Math.random) {
  return RARES.filter(r => r.zone === zone && r.weather === state.weather && r.period === state.period && rng() < r.chance);
}
function sources(id) {
  const weather = require('./world_weather');
  return RARES.filter(r => r.id === id).map(r => `${r.zone} · ${weather.WEATHER[r.weather]} · ${r.period === 'day' ? 'ban ngày' : 'ban đêm'}: ${(r.chance * 100).toFixed(1)}% ×1 mỗi lượt hợp lệ; không bonus, ngoài điều kiện = 0%. Xem weather rares.`);
}
function availableText(state) {
  const prefix = require('./prefix').getPrefix();
  const available = RARES.filter(r => r.weather === state.weather && r.period === state.period);
  return '🔎 Đang có thể tìm (vẫn cần đủ cấp/dụng cụ và roll hiếm):\n' + (available.map(r =>
    `${r.name} · ${(r.chance * 100).toFixed(1)}% · ${prefix}${r.zone === 'sunlit_meadow' || r.zone === 'whisper_woods' || r.zone === 'mossy_marsh' || r.zone === 'ancient_grove' || r.zone === 'world_tree_roots' ? 'gather' : 'fish'} ${r.zone}`
  ).join('\n') || 'Chưa có cây/cá hiếm theo thời tiết phù hợp lúc này.');
}
module.exports = { availableText, RARES, migrate, roll, sources };
