// LORE cho quái, zone và trang bị.
//
// Bối cảnh project: UI lệnh bằng tiếng Việt, nhưng tên item/quái/zone đã được
// rename sang English (src/db/rename_items.js). Người chơi đọc "🌌 Void Blade"
// và cần biết nó là gì → toàn bộ MÔ TẢ viết bằng tiếng Việt.
//
// Vì sao cần module này (3 lỗ hổng thật đo được trước khi viết):
//   1. Bảng `monsters` KHÔNG có cột mô tả nào → 45 con quái chỉ có dòng chỉ số.
//       Người chơi vào !hunt gặp abyss_leviathan mà không biết nó là cái gì.
//   2. 62/176 mô tả item còn sót tiếng Việt thô từ đời đầu ("Vảy rồng cổ",
//      "Xích sắt đan tay") trong khi tên đã English → nửa Anh nửa Việt.
//   3. Mô tả zone chỉ là một câu quảng cáo ("A peaceful forest near town"),
//      không nối thành thế giới.
//
// Nguyên tắc viết lore ở đây: mọi chi tiết đều NEO vào cơ chế đang có thật,
// không bịa thứ game không có.
//   • Wildwood ⇄ Dark Cave ⇄ Murky Swamp: 3 cửa ngõ quanh thị trấn.
//   • Crimson Desert / Snow Mountain: hai con đường, một nóng một lạnh, cùng
//     dẫn tới Dragon's Lair.
//   • Ember Peak / Frozen Abyss: thế giới sau khi rồng chết — lửa và băng.
//   • Astral Ruins: thiên không thành vỡ — nơi DUY NHẤT có void_essence và
//     diamond, tức nguyên liệu chế đồ legendary. Lore giải thích vì sao.
//   • Dragon's Lair có void_dragon: nối tuyến rồng ↔ hư không.
//
// Idempotent, có guard meta.

const db = require('../db/database');

const META_KEY = 'lore_v1';

// ---------------------------------------------------------------------------
// ZONE — mỗi zone 2–3 câu, nối thành một tuyến truyện có lý do đi tiếp.
// ---------------------------------------------------------------------------
const ZONES = {
  forest: {
    desc: 'Rìa phía đông thị trấn, nơi những cây sồi già chưa từng bị đốn. ' +
      'Dân làng gọi đây là cửa ngõ của người mới: quái vật yếu, nhưng đủ để dạy ' +
      'một kẻ vừa cầm gươm biết máu mình màu gì.',
  },
  cave: {
    desc: 'Hang đá ẩm nằm ngay dưới chân Wildwood. Ánh sáng chết dần sau vài chục bước, ' +
      'và thứ duy nhất phản chiếu trong đó là mắt lũ dơi. Goblins đã đào hang này ' +
      'thành đường hầm của chúng từ lâu trước khi con người đặt tên cho nó.',
  },
  swamp: {
    desc: 'Đầm lầy chắn giữa rừng và đồng bằng. Nước đặc quánh, mùi bùn thối, ' +
      'và mọi vết thương nhỏ ở đây đều có nguy cơ nhiễm độc. ' +
      'Đây là con đường duy nhất ra khỏi Wildwood — không ai đi đường vòng.',
  },
  desert: {
    desc: 'Vùng đất đỏ nung dưới nắng, nơi nước là thứ đắt hơn vàng. ' +
      'Những kẻ săn mồi ở đây không cần rượt đuổi: chúng chỉ cần đợi, ' +
      'vì cái nóng sẽ làm hộ chúng.',
  },
  mountain: {
    desc: 'Dãy núi tuyết vĩnh cửu, đối diện Crimson Desert qua một hẻm núi. ' +
      "Hai con đường, một nóng một lạnh, cùng dẫn về phía bắc — về phía Dragon's Lair. " +
      'Người đi trước khắc lên vách đá: "Rồng không sống ở đây. Nó CHẾT ở đây."',
  },
  dragon_lair: {
    desc: 'Hang ổ của Ancient Dragon, và là mộ của nó. Rồng đã chết từ rất lâu, ' +
      'nhưng cái chết của nó không hề sạch sẽ: hư không rỉ ra từ vết thương ấy, ' +
      'và thứ gì chui qua lỗ hổng đó đều không còn là chính nó nữa.',
  },
  volcano: {
    desc: 'Ember Peak — nơi tro của Ancient Dragon rơi xuống và vẫn còn cháy. ' +
      'Không khí ở đây đốt cháy phổi; giáp sắt nóng tới mức dính vào da. ' +
      'Nhưng mithril chỉ nóng chảy được ở đây, nên muốn rèn đồ tốt hơn, phải bước vào.',
  },
  frozen_abyss: {
    desc: 'Khe nứt băng bị phong ấn suốt nhiều thiên niên kỷ, mở ra khi long mạch ' +
      'dưới Ember Peak vỡ. Bên trong không tối — nó chỉ lạnh tới mức ánh sáng cũng chậm lại. ' +
      'Thứ gì bị phong ấn ở đây thì lẽ ra phải nằm yên.',
  },
  astral_ruins: {
    desc: 'Mảnh vỡ của một thiên không thành trôi dạt ở rìa thực tại — ' +
      'nơi hư không từ vết thương của Ancient Dragon rò ra ngoài. ' +
      'Không có đất dưới chân, không có trời trên đầu, chỉ có những bậc thang ' +
      'dẫn tới chỗ không nên tới. Và ở đây, kim cương mọc như đá.',
  },
};

// ---------------------------------------------------------------------------
// QUÁI — 45 con. Mỗi con 1 câu, gắn với zone và với cơ chế của nó.
// Con nào có tên riêng trong lore (witch, chief, guardian) thì cho nó vai trò.
// ---------------------------------------------------------------------------
const MONSTERS = {
  // === Wildwood Forest (Lv1) ===
  slime: 'Sinh vật nhầy trong suốt, óng ánh như thạch. Vô hại với người lớn, nhưng đủ để một tân binh không có vũ khí phải bỏ chạy.',
  giant_rat: 'To bằng con chó, bộ lông bết máu khô. Chúng theo mùi thịt từ bếp thị trấn ra tận rìa rừng.',
  wolf: 'Sói xám đi theo bầy, nhưng chỉ một con tấn công trước. Con đầu tiên chết sẽ quyết định cả bầy ở lại hay bỏ đi.',
  forest_wisp: 'Đốm sáng lập lòe giữa rừng, dụ người lạc đường đi sâu hơn. Không phải ma — chỉ là thứ ánh sáng sống, và nó thích thế.',
  forest_bear: 'Gấu nâu già, nặng gấp ba người. Nó không săn mồi, chỉ bảo vệ lãnh thổ — và lãnh thổ của nó là cả khu rừng.',
  moss_golem: 'Đá và rêu kết lại thành hình người. Rêu phủ kín tới mức tưởng như một gò đất, cho tới khi nó đứng dậy.',

  // === Dark Cave (Lv5) ===
  bat: 'Dơi hút máu treo kín trần hang. Chúng không tấn công đơn lẻ — tiếng vỗ cánh dồn dập là dấu hiệu đã quá muộn.',
  cave_spider: 'Nhện hang mù, săn bằng rung động. Tơ của nó dai tới mức dệt được thành giáp — ai bán được loại tơ này đều kiếm khá.',
  goblin: 'Lũ đào hang, sống theo bầy, hèn với kẻ mạnh và tàn nhẫn với kẻ yếu. Tai của chúng là chiến lợi phẩm có giá ở thị trấn.',
  blind_stalker: 'Sinh vật không mắt, da trắng bệch. Nó không nhìn thấy bạn — nó nghe thấy nhịp tim bạn đổi khi bạn nhận ra nó.',
  goblin_chief: 'Con goblin to nhất bầy, đội mũ làm từ xương kẻ thù. Giết nó không làm bầy tan rã, chỉ khiến con tiếp theo đội chiếc mũ đó.',
  cave_golem: 'Đá vôi sống dưới lòng hang, đứng im tới mức bị nhầm là vách đá. Nó chỉ thức dậy khi có kẻ chạm vào mạch khoáng của nó.',

  // === Murky Swamp (Lv8) ===
  bog_toad: 'Cóc đầm to bằng cái thúng, da tiết ra chất độc tê liệt. Nó không cắn — chỉ ngồi im và để kẻ đến gần tự ngã.',
  mire_witch: 'Người đàn bà sống một mình trong đầm từ trước khi thị trấn có tên. Không ai biết bà ta là người hay đã thành thứ khác.',
  leech_swarm: 'Bầy đỉa đỏ bu thành đám mây. Chúng không giết ngay — chúng chỉ khiến bạn mất máu đủ lâu để cái đầm làm nốt phần còn lại.',
  swamp_lurker: 'Cá sấu cổ dài, chỉ hở hai mắt trên mặt nước. Thứ duy nhất cho biết nó ở đó là bùn đột nhiên ngừng sủi bọt.',
  bog_colossus: 'Thằn lằn khổng lồ phủ bùn cứng như đá. Cả đầm lầy coi nó là vật thiêng — đơn giản vì không ai giết được nó.',

  // === Crimson Desert (Lv10) ===
  scorpion: 'Bọ cạp cát, nọc đủ để một người trưởng thành không đi nổi trong một giờ. Đuôi nó bán được giá như một món vũ khí.',
  dust_raider: 'Kẻ cướp mặc giáp vải rách, mặt che kín. Chúng không cướp của — chúng cướp nước, thứ đắt hơn vàng ở đây.',
  mummy: 'Xác ướp của người đi trước, bị cát sấy khô tới mức không phân hủy được. Nó vẫn đi, vì nó vẫn đang tìm đường ra.',
  sun_wraith: 'Cái bóng của một người từng chết vì nắng, giờ sống bằng cách hút hơi ẩm từ kẻ khác. Buổi trưa nó mạnh nhất.',
  sand_worm: 'Giun cát dài bằng cả một toa xe, di chuyển dưới mặt đất. Mặt cát lún thành rãnh là dấu hiệu duy nhất, và thường là quá muộn.',
  cactus_horror: 'Xương rồng mọc quanh xác người lạc đường, tới mức nó học được cách giả làm bóng mát để dụ kẻ khát nước.',

  // === Snow Mountain (Lv15) ===
  snowman: 'Người tuyết của lũ trẻ làng dưới chân núi — nhưng trời lạnh mãi không tan, và thứ gì đứng đủ lâu trên núi này đều thức dậy.',
  frost_wolf: 'Sói tuyết, bộ lông trắng tới mức biến mất trong bão. Chúng săn theo bầy và không bao giờ đuổi theo con mồi đã xuống dốc.',
  orc: 'Chiến binh orc dựng trại trên sườn núi, coi đỉnh là lãnh thổ của mình. Ngà của chúng là chiến lợi phẩm quý của mọi thợ săn.',
  yeti: 'Sinh vật lông trắng cao gần ba mét, đi lại không để lại dấu. Truyền thuyết nói nó là thứ duy nhất trên núi này chưa từng bị giết.',
  ice_elemental: 'Hơi lạnh tụ lại thành hình người, không có lõi, không có mặt. Đập nát nó chỉ khiến hơi lạnh tản ra rồi tụ lại chỗ khác.',
  stone_berserker: 'Tượng đá do chính quân đội cổ dựng để canh hẻm núi, giờ đã mất kẻ chỉ huy. Nó vẫn thi hành mệnh lệnh cũ: không cho ai qua.',
  troll: 'Khổng lồ đá sống dưới chân núi, da cứng tới mức gươm thường gãy trước. Sừng của nó là thứ duy nhất đủ cứng để rèn mithril.',

  // === Dragon's Lair (Lv20) ===
  drake_whelp: 'Rồng con nở sau khi Ancient Dragon chết, tự bò ra khỏi trứng trong một cái hang đầy xương. Nó chưa biết thứ nó đang giữ.',
  young_dragon: 'Rồng non lớn chưa đủ vảy cứng. Nó đốt mọi thứ vì sợ, chứ không vì đói — và nỗi sợ của rồng thì rất tốn kém.',
  dragon: 'Ancient Dragon — con rồng đã chết, nhưng xác nó vẫn phản ứng với kẻ xâm nhập. Không rõ đây là xác sống hay là thứ gì đang mượn xác nó.',
  lair_guardian: 'Bộ giáp rỗng đứng gác cửa hang, do chính Ancient Dragon tạo ra trước khi chết. Nó không có mặt để biết ai được phép vào.',
  void_dragon: 'Con rồng duy nhất chui qua vết thương hư không và trở ra còn nguyên hình dạng. Thứ này không còn là rồng nữa, nhưng vẫn nhớ cách bay.',

  // === Ember Peak (Lv25) ===
  magma_hound: 'Chó hoang sống trong dòng dung nham đông cứng. Chúng không có lông — da chúng là đá nguội, và bên trong thì vẫn cháy.',
  ember_phoenix: 'Chim lửa sinh ra từ tro của Ancient Dragon. Mỗi lần bị đánh bại, nó cháy thành tro rồi mọc lại — nhưng chậm hơn mỗi lần.',
  obsidian_golem: 'Đá obsidian kết lại quanh một lõi than cháy. Sắc như thủy tinh, nặng gấp đôi đá thường, và nóng tới mức không cầm được.',
  char_giant: 'Người khổng lồ bị dung nham bao kín tới mức chỉ còn cái bóng đen. Nó không còn đau, không còn nói, chỉ còn đi về phía có tiếng động.',

  // === Frozen Abyss (Lv30) ===
  frost_revenant: 'Xác của kẻ đã chết trong khe nứt khi phong ấn còn nguyên. Băng giữ họ nguyên vẹn — và giữ luôn cả ý chí quay về.',
  glacier_wyrm: 'Rắn băng dài hàng chục mét, bò trong lòng sông băng. Nó không cắn — nó quấn, và hơi lạnh của nó làm máu ngừng chảy trước khi nó siết.',
  abyss_leviathan: 'Thứ đã bị phong ấn ở đáy khe nứt từ trước khi có thị trấn. Không ai mô tả được nó, vì chưa ai nhìn thấy trọn vẹn nó rồi còn sống.',

  // === Astral Ruins (Lv40) ===
  void_harbinger: 'Kẻ báo trước hư không, mặc áo choàng không có đường may. Nó không tấn công trước — nó chỉ đứng đó cho tới khi bạn hiểu ra mình đã quá muộn.',
  astral_sentinel: 'Máy canh gác của thiên không thành cũ, vẫn chạy đúng lệnh sau khi thành đã vỡ. Nó không phân biệt được công dân với kẻ xâm nhập nữa.',
  star_devourer: 'Sinh vật ăn những mảnh sao trôi dạt ở rìa thực tại. Càng ăn, nó càng ít giống thứ có thể gọi tên. Kim cương trong nó là phần chưa tiêu hóa được.',
};

// ---------------------------------------------------------------------------
// TRANG BỊ — 176 món. Viết theo nhóm để mỗi món có lý do tồn tại trong thế giới,
// không chỉ lặp lại chỉ số.
// ---------------------------------------------------------------------------
const ITEMS = {
  // ===== VŨ KHÍ: melee =====
  wood_sword: 'Khúc gỗ gọt vội, còn nguyên vỏ cây. Vũ khí đầu tiên của gần như mọi người ở thị trấn — và cũng là thứ đầu tiên họ muốn thay.',
  rusty_dagger: 'Lưỡi dao han gỉ nhặt được trong đống sắt vụn. Nhẹ, ngắn, và đủ sắc để mở một vết thương rồi để nó nhiễm trùng.',
  sword_bronze: 'Đồng đúc theo lối cũ, nặng ở chuôi nên chém xuống thì mạnh, đỡ đòn thì vụng. Bản sao rẻ nhất của một thanh gươm thật.',
  iron_sword: 'Sắt rèn thẳng, sống gươm dày. Khoản đầu tư nghiêm túc đầu tiên của một người đi săn — dùng được tới tận hang rồng.',
  sword_broad: 'Lưỡi rộng bản, chém được cả người lẫn giáp. Thợ rèn ở thị trấn nói nó sinh ra để chặt củi, nhưng chưa ai dùng nó để chặt củi.',
  steel_sword: 'Thép gấp nhiều lớp, cân bằng tới mức khó tin khi cầm. Chế được nó nghĩa là đã học được nghề, không chỉ mua được đồ.',
  sword_warblade: 'Lưỡi gươm cong lấy từ vũ khí của Lair Guardian. Bộ giáp rỗng đó đã không còn chủ, nên thanh gươm cũng không còn lý do nằm lại.',
  sword_emberforge: 'Rèn trong dung nham Ember Peak, tôi nước lạnh ngay trong mạch đá. Lưỡi gươm nóng ran tới mức tuyết tan trước khi chạm vào nó.',
  dragon_sword: 'Rèn từ nanh Ancient Dragon. Thứ duy nhất trong hang đó không bị hư không ăn mòn — vì nanh rồng không phải thứ hư không tiêu hóa được.',
  void_blade: 'Lưỡi gươm làm từ hư không đông đặc. Nó không phản chiếu ánh sáng, chỉ phản chiếu thứ đang đứng trước nó — và luôn trả về một hình ảnh hơi khác.',
  sword_astral: 'Răng nanh của Astral — thứ không phải thép, cũng không phải đá. Chém vào nó nghe như tiếng chuông lệch nhịp, và vết chém không bao giờ liền lại.',

  // ===== VŨ KHÍ: magic =====
  apprentice_wand: 'Gậy gỗ ngắn buộc một mảnh pha lê vỡ. Chưa dẫn được phép gì ra hồn, nhưng đủ để một người mới tập không tự đốt tay mình.',
  staff_oak: 'Gậy sồi nguyên khúc, khắc vài đường dẫn linh. Chắc, bền, không đẹp — đúng kiểu đồ mà một pháp sư học việc nên có.',
  staff_ash: 'Gỗ tần bì lấy từ cây mọc trên mộ cổ. Lửa bám vào nó dễ hơn mọi loại gỗ khác, và không chịu tắt hẳn.',
  staff_crystal: 'Đầu gậy gắn pha lê tự nhiên, dẫn phép nhanh hơn gỗ tới mức có thể thấy được. Pha lê nứt thì phải thay cả cây.',
  flame_staff: 'Gậy tro tẩm dầu hỏa, bắt lửa từ một mảnh than của Ember Peak. Nó vẫn còn ấm sau nhiều năm, và không bao giờ nguội hẳn.',
  staff_storm: 'Thân gậy quấn dây đồng, tích điện từ những cơn bão trên đỉnh núi. Tóc người cầm dựng đứng lên trước khi nó phóng ra tia đầu tiên.',
  staff_soulfire: 'Lửa trong đầu gậy không cần nhiên liệu. Truyền thuyết nói nó cháy bằng phần linh hồn mà người cầm đã đánh đổi để rèn ra nó.',
  staff_voidsong: 'Gậy rỗng ruột, gió lùa qua phát ra âm thanh mà tai người không nghe trọn. Hư không trong đó cộng hưởng với nó, và mỗi lần cộng hưởng là một lần nó mạnh hơn.',
  staff_astral: 'Quyền trượng của thiên không thành, vẫn còn nguyên vẹn sau khi thành vỡ. Nó không bắn phép — nó chỉ ra chỗ thực tại mỏng nhất, và để phép tự chảy ra.',

  // ===== VŨ KHÍ: ranged =====
  short_bow: 'Cung gỗ ngắn tầm bắn chỉ vài chục bước. Dùng để bắn thú nhỏ trong rừng, không phải để đối đầu với thứ biết trả đòn.',
  bow_hunting: 'Cung săn tiêu chuẩn của thị trấn, dây gân thú. Đủ mạnh để hạ một con hươu ở khoảng cách an toàn — đó là toàn bộ mục đích của nó.',
  silver_bow: 'Cung bạc, nhẹ và cân tới mức bắn liên tục không mỏi tay. Bạc ở đây không phải để trang trí: nó dẫn linh khí tốt hơn sắt.',
  bow_recurve: 'Cung cong ngược, dây căng hơn và mũi tên đi xa hơn hẳn cung thẳng. Thợ làm cung phải uốn gỗ trong nhiều tháng mới thành.',
  bow_windcut: 'Cung làm từ gỗ mọc trên vách núi gió lộng. Mũi tên bắn ra gần như không nghe tiếng — người trúng đòn chỉ biết mình trúng khi đã ngã.',
  bow_stormfeather: 'Dây cung bện bằng lông chim bão. Lông không bao giờ chạm đất, nên mũi tên bay ra cũng không chịu rơi xuống giữa đường.',
  bow_emberwind: 'Cung tẩm tro nóng, mũi tên tự bắt lửa khi rời dây. Nó cháy chậm và đều, đủ để vết thương không bao giờ đông máu.',
  bow_dragonbone: 'Làm từ xương sườn Ancient Dragon. Dây cung căng bằng gân của chính con rồng đó — bắn nó giống như đang kéo một phần cái chết của nó về phía kẻ thù.',
  bow_astral: 'Cung dài của thiên không thành, dây làm từ tia sáng đông lại. Mũi tên nó bắn ra không bay theo đường thẳng mà theo đường thực tại cho phép.',

  // ===== GIÁP: vải/da Lv1 =====
  cloth_armor: 'Áo vải dày nhiều lớp, may thô. Không chặn được lưỡi dao, nhưng chặn được móng vuốt — và với người mới thì thế là đủ.',
  cloth_hat: 'Mũ vải mềm, che nắng và che bụi. Đeo vào để không chết vì những thứ nhỏ nhặt trước khi gặp thứ lớn.',
  cloth_robe: 'Áo choàng vải dài tới gót, may rộng để mặc lên mọi thứ khác. Học viện phát loại này cho học viên năm đầu, hàng trăm cái giống nhau.',
  cloth_pants: 'Quần vải ống rộng, dễ vá. Ở thị trấn, ai mặc quần vá nhiều chỗ thường là người đi săn lâu năm — không phải người nghèo.',
  cloth_shoes: 'Giày vải đế mềm, đi êm nhưng trượt trên đá ướt. Lựa chọn của người chưa biết mình sẽ đi đâu.',
  cloth_gloves: 'Găng vải mỏng, chống trầy tay khi leo và khi nhặt xác thú. Không có tác dụng gì trong một trận đánh thật.',
  leather_armor: 'Áo da thuộc dày, gia cố bằng đinh đồng ở vai. Nhẹ hơn vải nhiều lớp mà chịu được lực tốt hơn hẳn.',
  leather_cap: 'Mũ da cứng, có vành che gáy. Thợ săn đội để tên lạc không cắt vào cổ — họ học điều đó sau lần đầu tiên.',
  leather_vest: 'Áo gi lê da dày, may ôm sát người. Loại giáp phổ biến nhất của thợ săn và người đi rừng, vì nó không cản trở việc giương cung.',
  leather_pants: 'Quần da ống hẹp, bó ở cổ chân. Bùn không bám được vào nó — chi tiết nhỏ nhưng quyết định khi phải chạy qua đầm lầy.',
  leather_boots: 'Bốt da cao cổ, đế dày. Đi được cả trên đá lở và trong nước đầm mà không mất cảm giác dưới chân.',
  leather_gloves: 'Găng da có đệm ở lòng bàn tay. Vừa giữ ấm, vừa đủ dày để nắm được chuôi gươm mà không trượt.',

  // ===== GIÁP: sắt Lv12 =====
  chain_armor: 'Áo xích sắt đan tay, hàng nghìn mắt xích nhỏ. Nặng, ồn, nhưng đây là loại giáp đầu tiên thật sự chặn được một nhát chém.',
  chain_mail: 'Xích sắt đan dày hơn, phủ thêm một lớp vải bên trong để không cọ vào da. Thợ rèn ở thị trấn mất gần một tháng để làm xong một cái.',
  iron_armor: 'Giáp tấm sắt nguyên khối, đúc theo hình người. Nó không uốn theo cơ thể bạn — bạn phải học cách cử động bên trong nó.',
  iron_plate: 'Tấm giáp sắt dày gấp đôi bản thường, đeo bằng dây da qua vai. Nặng tới mức phải có người phụ mặc, nhưng đứng vững trước mọi thứ dưới Lv.20.',
  iron_helm: 'Mũ sắt kín, chỉ hở khe mắt. Nó làm bạn mất một nửa tầm nhìn và toàn bộ khả năng nghe — đánh đổi mà mọi chiến binh đều chấp nhận.',
  iron_greaves: 'Ống chân sắt bọc tới đầu gối. Thứ này cứu được xương chân khi phải đối đầu với thứ to gấp ba lần mình.',
  iron_boots: 'Bốt sắt đế đinh, bám đá tốt hơn cả chân trần. Nhưng đi trên đá trơn thì nguy hiểm hơn là không đi.',
  iron_gauntlets: 'Găng tay sắt có gai ở mu bàn tay. Không chỉ để đỡ đòn — một cú đấm có gai ở khoảng cách này cũng là một đòn tấn công.',
  knight_armor: 'Giáp hiệp sĩ của đội cận vệ cũ, khắc huy hiệu đã mờ. Không còn ai nhớ huy hiệu đó của gia tộc nào, nhưng giáp vẫn còn tốt.',
  knight_helm: 'Mũ giáp có chỏm và thị giác rộng hơn mũ sắt thường. Đội nó vào, người khác nhìn thấy một hiệp sĩ; bạn thì vẫn cảm thấy mình như trước.',
  knight_plate: 'Tấm giáp ngực dát mỏng bạc, nặng nhưng phân bố lực hoàn hảo. Món đồ đắt nhất mà một thợ rèn ở thị trấn có thể làm ra.',
  knight_greaves: 'Ống chân bọc thép có khớp gối linh động, cho phép quỳ và đứng dậy trong giáp nặng. Chi tiết nhỏ, nhưng thiếu nó thì không chiến đấu nổi.',
  knight_boots: 'Bốt giáp nặng, có gót gia cố. Đứng yên thì vững như tượng; muốn chạy thì phải học lại cách chạy.',
  knight_gauntlets: 'Găng giáp khớp từng ngón, cho phép cầm gươm mà không mất cảm giác. Bàn tay duy nhất trong bộ giáp vẫn còn linh hoạt.',

  // ===== GIÁP: pháp sư =====
  mage_hood: 'Mũ trùm đầu bằng vải dày, che tới mắt. Nó không bảo vệ gì nhiều — mục đích là để người khác không đọc được bạn đang niệm gì.',
  mage_robe: 'Áo choàng pháp sư thêu chỉ bạc ở cổ tay, nơi phép thoát ra. Sợi chỉ dẫn linh khí tốt hơn vải thường rất nhiều.',
  mage_pants: 'Quần vải nhẹ, không có khớp nối để không cản việc ngồi thiền lâu. Pháp sư không chạy nhiều; họ đứng yên và đọc.',
  mage_slippers: 'Dép mềm đế mỏng, gần như không nghe tiếng bước. Pháp sư cần im lặng để tập trung hơn là cần bảo vệ bàn chân.',
  mage_gloves: 'Găng vải mỏng thêu vòng bảo vệ ở lòng bàn tay. Thiếu nó, phép tự đốt cháy tay người niệm — lỗi phổ biến của học viên năm nhất.',
  archmage_robe: 'Áo choàng của người đã ra khỏi hàng ngũ học viên, thêu kín bằng những vòng dẫn phép lặp lại. Mặc nó là tuyên bố mình không còn là người học việc.',
  archmage_gloves: 'Găng tay khâu nhiều lớp vải tẩm khoáng, dẫn phép nhanh gấp đôi găng thường. Chỉ đại pháp sư mới đủ khả năng giữ nó không bốc cháy.',
  archmage_hood: 'Mũ trùm thêu chỉ vàng, có khung cứng giữ cho nó không bao giờ xẹp xuống. Nó khiến người đội trông cao hơn — đó là mục đích thật của nó.',

  // ===== GIÁP: thợ săn =====
  hunter_hood: 'Mũ trùm da nhẹ, có lỗ để lộ tai. Thợ săn cần nghe tiếng con mồi hơn là cần che đầu.',
  hunter_vest: 'Gi lê da nhiều túi, phân bố đều quanh người. Mỗi túi đựng một thứ khác nhau, và thợ săn nhớ vị trí từng túi tới mức không cần nhìn.',
  hunter_pants: 'Quần da ống hẹp có đệm ở đầu gối, cho phép quỳ lâu trong tư thế bắn. Bùn và máu khô không thấm vào được.',
  hunter_boots: 'Bốt da mềm đế mỏng, đi không nghe tiếng. Chúng không bảo vệ chân tốt — nhưng thợ săn chết vì bị phát hiện nhiều hơn chết vì đá sắc.',
  hunter_gloves: 'Găng da hở ngón, giữ được cảm giác trên dây cung. Ngón tay trần là thứ duy nhất truyền được độ căng chính xác.',
  ranger_hat: 'Mũ vành rộng cắm lông chim, che nắng và che mắt người khác. Kiểm lâm mặc nó để dân làng biết ai đang đi trong rừng của họ.',
  ranger_garb: 'Bộ đồ kiểm lâm nhiều lớp, nhẹ nhưng chịu được mưa nhiều ngày liền. Ai mặc nó thì được phép đi bất cứ đâu trong rừng — và có nghĩa vụ bảo vệ rừng.',
  ranger_gloves: 'Găng da gia cố ở ngón trỏ, nơi dây cung cứa vào hàng nghìn lần. Chi tiết nhỏ này quyết định bắn được mười năm hay mười ngày.',

  // ===== GIÁP Lv30 =====
  legs_warplate: 'Ống chân thép dày của đội tiên phong. Không có khớp linh động — món này được thiết kế để đứng vững, không để chạy.',
  legs_stormweave: 'Quần dệt từ sợi tẩm điện, nhẹ tới mức gần như không cảm thấy. Nó dẫn phép xuống chân, giúp người mặc dịch chuyển nhanh hơn phản xạ của kẻ thù.',
  feet_warspirit: 'Bốt chiến có đinh bám đá, từng bước đều tạo tiếng vang. Chúng được làm để kẻ thù nghe thấy và biết mình sắp bị đánh.',
  feet_swiftshadow: 'Bốt da tối màu, đế làm từ vật liệu không phản âm. Đi trên đá cũng không phát ra tiếng — thứ duy nhất nghe được là hơi thở của chính bạn.',
  hands_warfist: 'Găng thép nguyên khối, không có ngón riêng. Cầm được vũ khí, nhưng thứ nó giỏi nhất là đấm.',
  hands_runeweave: 'Găng dệt từ sợi khắc phù văn, mỗi ngón một vòng dẫn phép riêng. Nó cho phép niệm phép chỉ bằng cử động tay.',

  // ===== GIÁP Lv40–45: rồng / hư không / astral =====
  dragon_armor: 'Giáp ghép từ vảy Ancient Dragon, khớp theo đúng cách vảy mọc trên lưng nó. Không có mũi khâu nào — vảy tự khít vào nhau.',
  dragon_plate: 'Tấm giáp ngực từ vảy rồng dày nhất, lớp ngoài cùng của bộ giáp. Nó ấm lên khi có thứ gì đó đang đến gần.',
  dragon_helm: 'Mũ giáp từ hộp sọ của một con rồng nhỏ, để nguyên răng ở vành. Đội nó là đội lên mặt một con thú khác.',
  dragon_greaves: 'Ống chân từ xương rồng, nhẹ hơn thép mà cứng hơn gấp nhiều lần. Xương rồng không mục, kể cả sau nhiều thế kỷ.',
  dragon_boots: 'Bốt từ vảy chân rồng — phần vảy duy nhất đủ dày để chịu được trọng lượng của chính con rồng.',
  dragon_claws: 'Găng từ móng vuốt rồng, gắn thẳng vào mu bàn tay. Chúng không phải vũ khí phụ; chúng là thứ duy nhất bạn cần khi đã quá gần.',
  dragon_shield: 'Khiên từ xương bả vai của Ancient Dragon. Nó không phải để đỡ — nó để hứng, và tới giờ vẫn chưa có thứ gì làm nó nứt.',
  void_robe: 'Áo choàng dệt từ hư không đông lại, không có đường may và không có mặt trong. Mặc nó, người khác nhìn thấy cái bóng của bạn trước khi thấy bạn.',
  void_robe_chest: 'Áo giáp hư không có lõi là một mảnh void_essence kết tinh. Nó hấp thụ một phần sát thương và biến phần đó thành thứ khác — không ai biết là thứ gì.',
  void_amulet: 'Dây chuyền giữ một giọt hư không nguyên chất. Nó làm chậm mọi vết thương, kể cả vết thương không bao giờ lành.',
  void_compass: 'La bàn không chỉ hướng bắc — nó chỉ chỗ thực tại mỏng nhất. Ở gần Astral Ruins, kim của nó quay tròn liên tục.',
  void_orb: 'Quả cầu hư không, bề mặt hút ánh sáng. Phép bắn ra từ nó đi qua khoảng cách như thể khoảng cách không tồn tại.',
  void_quiver: 'Ống đựng tên làm từ da hư không, bên trong rộng hơn bên ngoài. Mũi tên rút ra từ đó luôn đã sẵn sàng, không bao giờ phải lắp lại.',
  dragon_ring: 'Nhẫn khắc hình rồng cuộn, làm từ xương đuôi rồng. Nó ấm lên khi có kẻ thù trong tầm đánh.',
  legs_astral: 'Ống chân từ kim loại của thiên không thành, không rỉ và không trầy. Đi trong đó, mỗi bước chân đều có tiếng vang nhẹ như đang bước trên thứ gì rỗng.',
  feet_astral: 'Bốt bước trên khoảng không, đế không chạm đất mà vẫn bám được. Ở Astral Ruins, chúng là thứ duy nhất giữ bạn khỏi rơi ra ngoài thực tại.',
  hands_astral: 'Găng tay dẫn phép của thiên không thành, mút ngón ôm khít tới mức khó cởi ra. Chúng được làm cho bàn tay không cần phải run.',
  head_astral: 'Vương miện của thiên không thành, vẫn còn nguyên dù thành đã vỡ. Nó không ban quyền gì cả — nó chỉ khiến mọi thứ xung quanh im lặng khi bạn đội nó.',
  chest_astral: 'Giáp ngực từ vật liệu của thiên không thành, nhẹ tới mức tưởng như không mặc gì. Nhưng thứ nó chặn được thì không món giáp nào khác chặn nổi.',

  // ===== TAY PHỤ =====
  wood_shield: 'Tấm gỗ ghép, viền da thô. Chặn được một nhát chém của goblin — và đó chính xác là mức độ bảo vệ nó được làm ra để cung cấp.',
  small_buckler: 'Khiên tròn nhỏ cỡ cái đĩa, cầm ở tay trái. Không che được nhiều, nhưng đủ để đỡ rồi phản đòn ngay lập tức.',
  leather_quiver: 'Ống đựng tên bằng da mềm, đeo chéo lưng. Đơn giản, nhưng thiếu nó thì mũi tên thứ hai không bao giờ tới kịp.',
  iron_shield: 'Khiên sắt tròn có gờ gia cố, nặng tới mức phải đeo bằng hai quai. Đứng sau nó thì an toàn, nhưng bạn cũng không thấy gì để đánh.',
  crystal_orb: 'Quả cầu pha lê giữ một lượng linh khí nhỏ. Nó không làm phép mạnh hơn — nó làm phép ra nhanh hơn, và trong một trận đánh thì đó là tất cả.',
  hunter_quiver: 'Ống tên da có ngăn chia, giữ mũi tên không va vào nhau. Thợ săn giỏi không bao giờ để tên mình kêu.',
  traveler_pouch: 'Túi vải dày đeo hông, đựng được đủ thứ lặt vặt cho một chuyến đi dài. Không có tác dụng chiến đấu, nhưng ai đi xa cũng có một cái.',
  knight_shield: 'Khiên hiệp sĩ có huy hiệu khắc nổi, nặng và cân đối. Nó được làm để đứng thành hàng cùng những người khác, không phải để chiến đấu một mình.',
  flame_orb: 'Quả cầu giữ một ngọn lửa không cần nhiên liệu, lấy từ Ember Peak. Nó tỏa sáng và hơi nóng — thứ duy nhất trong hang rồng không bao giờ tắt.',
  ranger_quiver: 'Ống tên của kiểm lâm trưởng, có ngăn riêng cho ba loại mũi tên. Cách bạn sắp xếp nó cho người khác biết bạn đã bắn bao lâu.',

  // ===== PHỤ KIỆN =====
  copper_ring: 'Nhẫn đồng rẻ tiền, xỉn màu sau vài ngày. Món trang sức đầu tiên của gần như mọi người ở thị trấn, mua bằng tiền lương một ngày.',
  silver_ring: 'Nhẫn bạc trơn, không khắc gì. Bạc dẫn linh khí tốt nên nó cũng là món phụ kiện đầu tiên thật sự có tác dụng.',
  gold_ring: 'Nhẫn vàng của gia đình buôn giàu có, đeo để người khác biết bạn không cần bán nó. Vàng mềm nên nó mòn dần theo năm tháng.',
  leather_necklace: 'Dây da đeo một hạt gỗ nhỏ. Không có gì đặc biệt — trừ việc nó từng thuộc về người không trở về.',
  pearl_necklace: 'Chuỗi ngọc trai vớt từ đầm lầy, mỗi hạt một màu khác nhau. Người ta nói ngọc trai ở đây hút được độc tố trong nước.',
  lucky_charm: 'Một mảnh xương buộc dây đỏ, không rõ của con gì. Chủ nhân cũ nói nó mang may mắn; ông ta chết vì một mũi tên lạc.',
  flame_ring: 'Nhẫn đá lửa, cháy âm ỉ bên trong mà không nóng ra ngoài. Pháp sư đeo nó để phép lửa ra nhanh hơn một nhịp.',
  guardian_ring: 'Nhẫn thép có khắc vòng bảo vệ. Nó không làm bạn khỏe hơn — nó làm đòn đánh vào bạn chậm lại một chút, và đôi khi thế là đủ.',
  phoenix_amulet: 'Dây chuyền giữ một sợi lông phượng hoàng còn ấm. Mỗi khi bạn bị thương nặng, nó hồi lại một phần — nó không cứu bạn, chỉ cho bạn thêm thời gian.',
  hunter_mark: 'Mảnh xương khắc hình mũi tên, đeo ở cổ tay. Thợ săn khắc nó sau lần đầu hạ được con mồi to hơn mình.',
  scholar_tome: 'Cuốn sổ tay bọc da, ghi chú chi chít bằng thứ chữ khó đọc. Đọc nó không làm bạn thông minh hơn, nhưng giúp bạn không lặp lại lỗi của người viết.',
  ring_berserker: 'Nhẫn sắt có vết lõm ở mặt trong, do chính chủ nhân cắn vào. Càng bị thương, nó càng làm đòn đánh mạnh hơn.',
  ring_warden: 'Nhẫn của người canh gác cổ, khắc kín những vòng tròn lặp lại. Nó dành cho kẻ phải đứng lại lâu hơn kẻ thù chịu đựng.',
  ring_arcanist: 'Nhẫn pha lê giữ một câu thần chú chưa niệm xong. Chừng nào nó còn trên tay bạn, câu chú đó vẫn đang quay vòng và chờ.',
  neck_soulbind: 'Dây chuyền trói một phần linh hồn vào vật chứa. Nó làm bạn khó chết hơn, với điều kiện bạn chấp nhận rằng một phần mình không còn ở trong mình.',
  special_slayer: 'Ấn của hội chuyên săn những thứ không phải người. Ai đeo nó thì được hội công nhận — và bị mọi thứ khác trong hội để ý.',
  neck_astral: 'Chuỗi hạt từ thiên không thành, mỗi hạt là một mảnh ký ức đông cứng. Đeo nó, bạn nhớ những chuyện chưa từng xảy ra với mình.',
  special_astral: 'Ấn của thiên không thành, khắc hình một vì sao đã tắt. Nó đánh dấu người mang là công dân của một nơi không còn tồn tại.',

  // ===== TIÊU HAO =====
  potion_s: 'Bình thuốc đỏ nhỏ, vị đắng và hơi kim loại. Hồi được một ít máu — đủ để đi tiếp, không đủ để liều.',
  potion_m: 'Bình thuốc cỡ vừa, đóng nút sáp ong. Loại phổ biến nhất mà thợ săn mang theo, vì nó cân bằng giữa giá và tác dụng.',
  potion_l: 'Bình thuốc lớn, thủy tinh dày để không vỡ khi ngã. Hồi được nhiều máu, nhưng nặng — ai mang hai bình thường phải bỏ lại thứ khác.',
  potion_percent: 'Bình thủy tinh xanh, thuốc hồi theo phần trăm sinh lực. Càng khỏe thì uống càng lời, và đó là lý do nó đắt.',
  potion_full: 'Bình lớn chứa thuốc hồi gần như toàn bộ sinh lực. Chỉ những người đã từng suýt chết mới chịu bỏ tiền mua nó.',
  potion_ancient: 'Bình gốm cổ còn nguyên niêm phong, thuốc bên trong vẫn chảy. Không ai biết công thức gốc — chỉ biết nó vẫn còn tác dụng sau nhiều thế kỷ.',
  potion_astral: 'Chất lỏng ánh bạc từ thiên không thành, uống vào thấy lạnh ở cổ rồi ấm khắp người. Nó hồi lại nhiều hơn máu — nó hồi lại cả phần đã mất.',
  elixir: 'Bình nhỏ đựng thứ không màu, không mùi, không vị. Truyền thuyết nói nó cứu được người đã chết; thực tế thì nó chỉ khiến bạn không chết lần này.',
  food_grilled_fish: 'Cá nướng trên than, còn nguyên vảy cháy. Món ăn đường của mọi chuyến đi săn — nóng, mặn, và không cần bát đĩa.',
  food_fish_soup: 'Canh cá nấu với rau rừng, nêm mặn hơn mức cần thiết. Người đi đường thích vì nó vừa hồi máu vừa làm ấm người.',
  food_salmon_sushi: 'Cơm cuộn cá hồi, gói trong lá. Món ăn của người có thời gian — vừa nhẹ, vừa hồi được nhiều.',
  food_tuna_steak: 'Miếng cá ngừ dày nướng tái, chỉ rắc muối. Thứ duy nhất trong túi đồ của thợ săn mà họ thật sự mong được ăn.',
  food_seafood_platter: 'Mâm hải sản bày trên đá nóng, đủ loại. Không ai mang nó đi săn — người ta ăn nó trước khi đi, để nhớ vì sao mình muốn quay về.',
  food_kraken_dish: 'Món từ thịt kraken, nấu nhiều giờ mới mềm. Nó hồi lại gần như toàn bộ sức lực, và cũng là bữa ăn mà người ta kể lại lâu nhất.',

  // ===== NGUYÊN LIỆU: cơ bản =====
  slime_gel: 'Khối nhầy trong suốt lấy từ slime, còn ấm. Dùng được cho thuốc và cho cả keo dính — loại nguyên liệu rẻ nhất nhưng không bao giờ thiếu.',
  rat_tail: 'Đuôi chuột khô, bán theo bó. Nghe tầm thường nhưng thầy thuốc ở thị trấn mua đều đặn, và đó là lý do người mới sống được qua tuần đầu.',
  wolf_fang: 'Nanh sói còn dính máu khô. Thợ săn đeo nó ở cổ; thợ rèn mài nó thành mũi dùi.',
  bat_wing: 'Cánh dơi mỏng như giấy, gân còn rõ. Dùng để lọc thuốc và để dẫn linh khí trong những món đồ nhỏ.',
  stone: 'Đá cuội nhặt dưới chân, loại nào cũng được. Nguyên liệu nền của mọi thứ nặng và rẻ.',
  copper_ore: 'Quặng đồng lẫn đá, ánh lên màu cam khi ướt. Nấu ra đồng thau — thứ kim loại đầu tiên ai cũng học cách rèn.',
  iron_ore: 'Quặng sắt nặng và xỉn, có vệt rỉ đỏ. Rẻ, phổ biến, và là nền tảng của toàn bộ vũ khí dưới Lv.25.',
  copper_ingot: 'Thỏi đồng đúc khuôn, còn gờ ở mép. Mềm, dễ uốn, và đổi màu xanh sau vài tháng để ngoài trời.',
  iron_ingot: 'Thỏi sắt rèn sạch xỉ, gõ vào kêu tiếng đục. Thứ mà mọi thợ rèn ở thị trấn đều cần và không ai có đủ.',
  coal: 'Than đá đen bóng, cháy lâu và nóng hơn củi. Không thể rèn sắt mà không có nó — đó là lý do mỏ than bị tranh nhau.',
  gold_ore: 'Quặng vàng lẫn trong đá thạch anh. Nhìn thì đẹp, nhưng cầm nặng và mềm — vàng làm đồ trang sức, không làm vũ khí.',
  silver_ore: 'Quặng bạc có ánh xám lạnh. Dẫn linh khí tốt nhất trong các kim loại thường, nên pháp sư tranh mua trước cả thợ kim hoàn.',
  gold_ingot: 'Thỏi vàng đúc, mặt trên còn dấu búa. Tiền tệ thật của giới buôn — vàng ở đây không để làm đồ, mà để giữ.',
  silver_ingot: 'Thỏi bạc tinh luyện, sáng tới mức soi được mặt. Dùng cho phụ kiện dẫn phép và cho những thứ cần không bị ăn mòn.',
  mithril_ore: 'Quặng mithril ánh bạc xanh, chỉ có trong mạch đá nóng chảy. Nhẹ như bạc, cứng hơn thép — và chỉ nóng chảy được ở Ember Peak.',
  mithril_ingot: 'Thỏi mithril đã tôi, không rỉ và gần như không mài mòn. Một thỏi đủ để nâng cấp cả bộ giáp, và giá của nó giải thích vì sao ít người có.',
  gem_ruby: 'Viên ruby đỏ sẫm, bên trong có vệt sáng chuyển động. Đặt gần lửa thì nó nóng lên; đặt gần phép thì nó sáng lên.',
  gem_sapphire: 'Viên sapphire xanh thẫm, cầm vào thấy lạnh. Người ta dùng nó để giữ phép không tan ra ngoài trong lúc niệm.',
  diamond: 'Kim cương mọc trong đá của Astral Ruins, sắc tới mức cắt được cả thép. Chỉ ở nơi thực tại mỏng như thế mới hình thành được thứ này.',
  dragon_scale: 'Vảy rồng còn nguyên lớp men ngoài, ấm khi chạm vào. Không mũi giáo nào xuyên được nó khi còn trên lưng rồng — và cũng không khi đã thành giáp.',
  dragon_bone: 'Xương rồng nặng hơn đá cùng kích thước, nhưng không mục. Thứ duy nhất trong hang Ancient Dragon còn nguyên vẹn sau từng ấy năm.',
  void_essence: 'Giọt hư không đông đặc, hút ánh sáng quanh nó. Rỉ ra từ vết thương của Ancient Dragon — nguyên liệu duy nhất chế được đồ Lv.40 trở lên.',
  orc_tusk: 'Ngà orc dày và xỉn, có vết nứt ngang. Không đẹp, nhưng cứng tới mức làm được chuôi vũ khí mà không gãy.',
  troll_horn: 'Sừng troll đá, rỗng ruột và vang như chuông khi gõ. Đây là vật liệu duy nhất đủ cứng để gia cố dụng cụ rèn mithril.',
  goblin_ear: 'Tai goblin khô, bán theo cặp. Thị trấn treo thưởng cho nó để giữ số goblin trong hang ở mức chấp nhận được.',
  spider_silk: 'Cuộn tơ nhện hang, dai hơn da thuộc và nhẹ hơn vải. Dệt được thành giáp — nghề này chỉ vài người ở thị trấn làm được.',
  scorpion_tail: 'Đuôi bọ cạp còn nguyên nọc, phải cầm ở đầu kia. Bán được giá cao vì nọc của nó là thành phần của loại thuốc độc đắt nhất.',
  class_token_melee: 'Huy hiệu của Chiến Binh, trao khi hoàn thành khóa huấn luyện. Mặt sau khắc tên người huấn luyện đã chết trong cuộc chiến cuối.',
  class_token_magic: 'Huy hiệu của Pháp Sư, làm bằng bạc mỏng. Nó nóng lên khi chủ nhân niệm phép — và đó là cách người khác biết bạn đang chuẩn bị gì.',
  class_token_ranged: 'Huy hiệu của Cung Thủ, khắc hình mũi tên đang bay. Cung Thủ đeo nó ở tay trái, để tay phải luôn rảnh.',

  // ===== CÁ =====
  fish_small: 'Cá nhỏ cỡ ngón tay, vảy sáng. Câu được ở mọi nơi có nước — món ăn của người không có gì khác.',
  fish_carp: 'Cá chép nặng tay, vảy vàng ánh. Người ta nói câu được nó thì cả ngày đi săn sẽ suôn sẻ, dù chưa ai kiểm chứng.',
  fish_trout: 'Cá hồi nước ngọt, thịt chắc và thơm. Loại cá phổ biến nhất ở sông quanh thị trấn và là món chính của mọi bữa ăn dọc đường.',
  fish_salmon: 'Cá hồi đỏ, bơi ngược dòng vào tận thượng nguồn. Thịt nó giàu năng lượng tới mức ăn một miếng là đủ để đi tiếp.',
  fish_tuna: 'Cá ngừ nặng tới mức phải hai người kéo. Thịt dày, ít xương, và là thứ mà đầu bếp ở thị trấn trả giá cao nhất.',
  fish_swordfish: 'Cá kiếm có mũi dài như lưỡi gươm, sắc tới mức đâm thủng thuyền gỗ. Câu được nó là một câu chuyện để kể nhiều năm.',
  fish_golden: 'Cá vàng óng, vảy phát sáng cả trong bóng tối. Người ta tin nó mang may mắn; thực tế là nó chỉ chậm và dễ bắt.',
  fish_kraken: 'Xúc tu kraken, còn cử động sau khi bị chặt. Món ăn này cần nấu rất lâu — và cần một cái nồi rất lớn.',
  fish_void: 'Cá sống trong nước ở rìa thực tại, thân gần như trong suốt. Nhìn nó quá lâu sẽ thấy nó không ở đúng chỗ bạn đang nhìn.',

  // ===== THÚ NUÔI (dùng chung bảng items nếu có) =====
};

// Ghi lore vào DB
function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  if (db.prepare('SELECT 1 FROM meta WHERE key = ?').get(META_KEY)) return;

  // 1) Thêm cột desc cho monsters nếu chưa có.
  //    Bảng này trước đây KHÔNG có cột mô tả nào → 45 con quái chỉ có chỉ số.
  const mcols = db.prepare('PRAGMA table_info(monsters)').all().map(c => c.name);
  if (!mcols.includes('desc')) {
    db.exec('ALTER TABLE monsters ADD COLUMN desc TEXT');
    console.log('🔧 Lore: thêm cột monsters.desc');
  }

  let zoneN = 0, mobN = 0, itemN = 0;

  const updZone = db.prepare('UPDATE zones SET desc = ? WHERE id = ?');
  for (const [id, z] of Object.entries(ZONES)) zoneN += updZone.run(z.desc, id).changes;

  const updMob = db.prepare('UPDATE monsters SET desc = ? WHERE id = ?');
  for (const [id, d] of Object.entries(MONSTERS)) mobN += updMob.run(d, id).changes;

  const updItem = db.prepare('UPDATE items SET desc = ? WHERE id = ?');
  for (const [id, d] of Object.entries(ITEMS)) itemN += updItem.run(d, id).changes;

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(META_KEY, String(Date.now()));

  console.log(`📖 Lore: ${zoneN} zone, ${mobN} quái, ${itemN} trang bị`);
}

module.exports = { migrate, ZONES, MONSTERS, ITEMS };
