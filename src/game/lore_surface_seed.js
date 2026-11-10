// LORE BỀ MẶT: thành tựu, khu khai thác, và thú nuôi.
//
// Sau khi zone/quái/item đã có lore tiếng Việt, còn 48 mục người chơi vẫn đọc
// bằng tiếng Anh — hoặc tệ hơn, là chữ chết:
//
//   1. 25 thành tựu: "Kill 10 monsters", "Reach level 5" — tiếng Anh, và chỉ
//      lặp lại đúng con số đã in ngay bên cạnh. Không có gì để đọc.
//   2. 10 khu khai thác: "Stone & copper for beginners" — tiếng Anh, hiện ở
//      !mine list và !fish list.
//   3. 13 thú nuôi: "Cute little rat (+5 HP, +2% gold)" — tiếng Anh, VÀ phần
//      chỉ số là thừa: !pet đã tự sinh buff từ các cột atk_bonus/hp_bonus...
//      bằng hàm buffOf(), nên mô tả cũ chỉ đang lặp lại thông tin đó.
//
// Nguyên tắc giữ nguyên giọng của zone/quái/item: ngắn, gợi, không giải thích
// hết. Mỗi mô tả phải nói một điều mà TÊN và CHỈ SỐ không nói được.
//
// Với thành tựu, mô tả KHÔNG được thay thế luật chơi — người chơi vẫn cần biết
// mốc là gì. Vì vậy mỗi mô tả giữ nguyên con số mốc, rồi thêm một câu ý nghĩa.
//
// Idempotent, có guard meta.

const db = require('../db/database');

const META_KEY = 'lore_surface_v1';

// ---------------------------------------------------------------------------
// THÀNH TỰU — 25 mục. Giữ nguyên mốc (10, 100, Lv.5...) vì đó là luật chơi.
// ---------------------------------------------------------------------------
const ACHIEVEMENTS = {
  // Mốc hạ gục
  kill_10: 'Hạ 10 con quái đầu tiên. Không ai nhớ trận thứ mười, nhưng ai cũng nhớ trận đầu tiên.',
  kill_100: 'Hạ 100 con quái. Đủ để dân thị trấn bắt đầu gọi bạn bằng tên thay vì "anh kia".',
  kill_500: 'Hạ 500 con quái. Thợ rèn không còn hỏi bạn mài gươm để làm gì nữa.',
  kill_1000: 'Hạ 1.000 con quái. Ở thị trấn, người ta kể về bạn như kể về một con quái khác — con duy nhất đi lại được ban ngày.',

  // Quái cụ thể
  kill_dragon_1: 'Hạ Ancient Dragon lần đầu. Con rồng đó đã chết từ lâu rồi; việc bạn làm chỉ là xác nhận lại điều đó.',
  kill_void_dragon: 'Hạ Void Dragon — thứ duy nhất từng chui qua vết thương hư không rồi trở ra còn nguyên hình dạng.',

  // Mốc cấp độ
  level_5: 'Đạt Lv.5. Vừa đủ để đi hết Wildwood một mình mà không cần ai đi kèm.',
  level_10: 'Đạt Lv.10. Lần đầu xuống được hết Dark Cave mà không phải quay về giữa đường.',
  level_20: 'Đạt Lv.20. Đã đi qua cả ba cửa ngõ quanh thị trấn và còn sống.',
  level_30: 'Đạt Lv.30. Đã thấy cái lạnh của Frozen Abyss — và chọn quay lại lần nữa.',
  level_50: 'Đạt Lv.50. Không còn khu vực nào trên bản đồ dạy được bạn điều mới.',

  // Mốc vàng
  gold_1k: 'Kiếm được tổng cộng 1.000 vàng. Đủ một cây gươm sắt và một bình thuốc.',
  gold_10k: 'Kiếm được tổng cộng 10.000 vàng. Đủ để loại vàng ra khỏi danh sách những thứ khiến bạn chết.',
  gold_100k: 'Kiếm được tổng cộng 100.000 vàng. Ở thị trấn, đây là con số người ta chỉ nói ra khi đã uống vài chén.',

  // Mốc nhiệm vụ
  quest_10: 'Hoàn thành 10 nhiệm vụ. Bắt đầu có người tự tìm đến bạn, thay vì bạn phải đi hỏi.',
  quest_50: 'Hoàn thành 50 nhiệm vụ. Mọi việc ở thị trấn đều qua tay bạn trước khi qua tay ai khác.',

  // Sưu tầm
  collect_dragon_scale: 'Giữ trong người 10 Dragon Scale. Vảy rồng không mục — nó chỉ chờ được rèn thành thứ khác.',
  collect_elixir: 'Giữ trong người 5 Elixir of Life. Không ai giữ nhiều thế trừ khi đã từng suýt cần tới chúng.',

  // Thú nuôi
  pet_first: 'Có con thú đồng hành đầu tiên. Từ đây, không còn lần nào đi vào rừng một mình.',
  pet_collect_5: 'Sở hữu 5 loài thú khác nhau. Chúng không sống chung hoà thuận, nhưng đều chọn ở lại.',
  pet_collect_10: 'Sở hữu 10 loài thú khác nhau. Nhà bạn giờ đông hơn cả một trại huấn luyện của thị trấn.',
  pet_legendary_first: 'Sở hữu một thú huyền thoại. Những con này không phải bắt được — chúng tự quyết định đi theo.',
  pet_legendary_3: 'Sở hữu 3 thú huyền thoại. Mỗi con trong số đó lẽ ra phải ở một nơi khác.',
  pet_own_dragonling: 'Sở hữu Dragonling. Nó nở từ trứng trong Dragon\'s Lair — và chưa biết mình là giống gì.',
  pet_own_void_cat: 'Sở hữu Void Cat. Con mèo bước ra từ chỗ không có cửa; nó không giải thích, bạn cũng không hỏi.',
};

// ---------------------------------------------------------------------------
// KHU KHAI THÁC — 10 mục, hiện ở !mine list và !fish list.
// Mỗi mô tả nói vì sao người ta đi tới đó, không chỉ liệt kê khoáng sản.
// ---------------------------------------------------------------------------
const GATHER_ZONES = {
  // Khai mỏ
  stone_quarry: 'Mỏ đá ngay sát thị trấn, nơi mọi thợ mỏ học cách cầm búa. Đá và đồng ở đây rẻ tới mức không ai buồn tranh nhau.',
  iron_mine: 'Hầm sắt dưới chân Snow Mountain. Không khí đặc tới mức đèn dầu cháy yếu, nhưng sắt ở đây là thứ giữ cho cả thị trấn có vũ khí.',
  gold_vein: 'Mạch vàng lộ ra trên sườn Crimson Desert. Người ta đào cả ngày để lấy một ít, rồi tiêu hết vào nước uống trên đường về.',
  mithril_cave: 'Hang mithril, nơi không khí nóng tới mức chỉ vào được ban đêm. Quặng ở đây nhẹ như bạc và cứng hơn thép.',
  dragon_mine: 'Mỏ xương rồng nằm dưới Dragon\'s Lair. Đây không phải mỏ khoáng — đây là chỗ chôn xác Ancient Dragon, và xương nó không mục.',

  // Câu cá
  village_pond: 'Ao làng sau nhà, cá nhỏ tới mức bắt bằng tay cũng được. Nơi mọi người học câu, trước khi dám ra sông.',
  river: 'Sông nước trong, chảy từ trên núi xuống. Cá hồi bơi ngược dòng mỗi mùa, và cả thị trấn đều biết mùa đó.',
  lake: 'Hồ sâu không thấy đáy, nước lạnh quanh năm. Cá lớn sống dưới đó, và cần một sợi dây đủ tốt để kéo chúng lên.',
  ocean: 'Biển mở, nơi thuyền nhỏ không dám đi xa bờ. Cá kiếm và cá ngừ ở đây đủ lớn để đổi thành vàng thật.',
  void_pool: 'Vũng nước ở rìa thực tại, mặt nước phản chiếu những thứ không có ở đây. Cá trong đó không bơi theo hướng bạn đang nhìn.',
};

// ---------------------------------------------------------------------------
// THÚ NUÔI — 13 mục. Chỉ viết lore; PHẦN CHỈ SỐ KHÔNG đưa vào đây nữa vì
// !pet đã tự sinh ra từ cột atk_bonus/def_bonus/hp_bonus... bằng buffOf().
// ---------------------------------------------------------------------------
const PETS = {
  pet_baby_rat: 'Con chuột nhặt từ cống thị trấn. Nó chẳng giúp được gì nhiều, nhưng là con vật đầu tiên không bỏ chạy khi bạn quay lại.',
  pet_wolf_cub: 'Sói con mất bầy, đi theo bạn vì bạn là thứ duy nhất còn đứng về phía nó.',
  pet_bear_cub: 'Gấu con bị bỏ lại sau một trận săn. Nó lớn nhanh hơn bạn tưởng, và vẫn coi bạn là con đầu đàn.',
  pet_bat: 'Con dơi rơi khỏi trần hang khi còn quá nhỏ để bay. Giờ nó bay trước mặt bạn và thấy những thứ bạn chưa kịp thấy.',
  pet_spider: 'Nhện hang thuần hoá từ trứng, không có nọc. Nó giăng tơ quanh chỗ bạn ngủ — dấu hiệu nó coi đó là tổ.',
  pet_baby_scorpion: 'Bọ cạp con, nọc chưa đủ để giết người. Nó ngồi trên vai bạn và không bao giờ rời đi.',
  pet_yeti_cub: 'Yeti con lạc khỏi đàn trên Snow Mountain. Bộ lông nó ấm tới mức ngủ cạnh nó thì không cần lửa.',
  pet_dragonling: 'Rồng con nở từ một quả trứng trong Dragon\'s Lair. Nó chưa biết mình là giống gì, và có lẽ đó là điều tốt.',
  pet_mini_dragon: 'Một Ancient Dragon thu nhỏ, không rõ vì sao. Nó nhớ những thứ nó chưa từng sống qua.',
  pet_mini_void_dragon: 'Rồng nhỏ đã chui qua vết thương hư không rồi thu lại kích thước. Nó không phản chiếu ánh sáng, chỉ phản chiếu bạn.',
  pet_slime: 'Khối nhầy ghép lại từ những mảnh slime, giờ đã đủ để giữ hình. Nó theo bạn vì bạn là thứ ấm nhất quanh nó.',
  pet_snowman: 'Người tuyết do một đứa trẻ trong làng dựng, giờ đi theo bạn. Nó không tan, vì bạn không để nó ở lại chỗ cũ.',
  pet_void_cat: 'Con mèo bước ra từ chỗ không có cửa. Không ai gọi nó tới, và nó cũng không giải thích.',
};

function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  let achN = 0, gatherN = 0, petN = 0;

  const updAch = db.prepare('UPDATE achievements SET desc = ? WHERE id = ?');
  for (const [id, d] of Object.entries(ACHIEVEMENTS)) achN += updAch.run(d, id).changes;

  const updGather = db.prepare('UPDATE gather_zones SET desc = ? WHERE id = ?');
  for (const [id, d] of Object.entries(GATHER_ZONES)) gatherN += updGather.run(d, id).changes;

  const updPet = db.prepare('UPDATE pets SET desc = ? WHERE id = ?');
  for (const [id, d] of Object.entries(PETS)) petN += updPet.run(d, id).changes;

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));

  if (achN + gatherN + petN > 0) {
    console.log(`📖 Lore bề mặt: ${achN} thành tựu, ${gatherN} khu khai thác, ${petN} thú nuôi`);
  }
}

module.exports = { migrate, ACHIEVEMENTS, GATHER_ZONES, PETS };
