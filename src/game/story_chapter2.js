// Append-only mainline content. No Seven Sins weapon or acquisition source.
const CHAPTER = 'Chương 2 — Những lá thư dưới tuyết';
const STEPS = [
  { id: 'chapter2_departure', title: 'Người nhận không có tên', kind: 'talk', qty: 1,
    text: 'Bà An đặt lên bàn chiếc áo khoác cũ của người giữ đèn trước bà. Trong lớp lót là một phong thư không ghi tên người nhận, chỉ vẽ cửa sổ có ba ngọn đèn. “Mẹ ta bảo: nếu có người hỏi đường về trạm Bạch Đăng, đừng để họ đi một mình.” Lâm nhận ra địa danh: một trạm hộ tống ở chân dãy núi tuyết, trước khe băng phía bắc. Trên bản đồ mới, nơi ấy chỉ còn một khoảng trắng.',
    goal: 'Nhận lời mang tin về trạm Bạch Đăng: {p}story claim. Chương này hướng tới nhân vật khoảng Lv.15–18; cứ chuẩn bị, không có giới hạn thời gian.', gold: 100, xp: 40 },
  { id: 'chapter2_echoes', title: 'Tiếng chân đi ngược gió', kind: 'kill', target: 'rime_hound', qty: 3,
    text: 'Con đường cũ không mất. Nó nằm dưới những dấu chân chỉ đi về một phía. Ba con thú phủ sương băng chạy vòng quanh bạn; mỗi lần chúng há miệng, tiếng chuông xe lại vọng ra thay vì tiếng sủa. Lâm đã dặn: đừng đáp lời thứ gọi mình bằng giọng của người quen. Hãy phá lớp băng đang giữ tiếng vọng ấy.',
    goal: 'Thắng 3 Rime Hound sau khi mở bước này: {p}hunt rime_hound. Hồi máu và nâng trang bị nếu cần.', gold: 200, xp: 70 },
  { id: 'chapter2_shelter', title: 'Lửa không hỏi tên người', kind: 'gather', target: 'foraging', qty: 5,
    text: 'Bạn tìm thấy trạm Bạch Đăng bên một cây cầu đã gãy. Dưới mái hiên, người đưa thư tên Tịnh vẫn còn sống, hai bàn tay tím vì lạnh. Ông dùng những phong thư làm đệm để không phải đốt chúng. “Giấy có thể kiếm lại,” bạn nói. Ông lắc đầu: “Chữ của người đã mất thì không.” Bạn quay về vùng hái lượm quen thuộc tìm nguyên liệu giữ ấm trước khi đọc bất cứ lời trăn trối nào.',
    goal: 'Thu hoạch 5 nguyên liệu foraging sau khi mở bước này: {p}gather (xem khu rồi hái). Bất kỳ khu đủ cấp nghề đều tính; không cần nghề cấp cao.', gold: 180, xp: 60 },
  { id: 'chapter2_coals', title: 'Một đêm mượn được', kind: 'item', target: 'coal', qty: 3,
    text: 'Củi ẩm chỉ đủ hong áo. Bếp trạm cần ba hòn than để giữ lửa qua đêm. Trong ánh sáng vừa nhóm, bạn thấy Tịnh không già như giọng nói của ông: người đưa thư cuối cùng đã trao túi thư cho ông mới mùa đông trước. Công việc chờ đợi ở đây được truyền từ người này sang người khác, lâu đến mức thị trấn tưởng tất cả đã chết.',
    goal: 'Giao 3 coal bằng {p}story claim (tiêu hao). Xem nguồn bằng {p}item coal; có thể đào ở stone_quarry bằng nghề Mining và công cụ đủ cấp.', gold: 180, xp: 60 },
  { id: 'chapter2_letters', title: 'Bốn mươi bảy lời hẹn', kind: 'talk', qty: 1,
    text: 'Túi thư có bốn mươi bảy lá, không lá nào cầu viện. Có người dặn con đừng bỏ học, có người xin lỗi vì quên sinh nhật vợ. Lá cuối do đội trưởng Yên viết: “Chúng tôi đã đưa đoàn dân qua cầu. Nếu đèn còn sáng, xin đừng để họ quay lại tìm chúng tôi.” Một mệnh lệnh ghi bên ngoài túi: CHƯA GIAO KHI ĐƯỜNG CHƯA AN TOÀN. Các đời đưa thư đã giữ đúng mệnh lệnh ấy. Chính sự tận tụy đã biến lời từ biệt thành một cuộc chờ không có hồi kết.',
    goal: 'Cùng Tịnh đọc sổ giao nhận: {p}story claim. Nhận Túi Thư Bạch Đăng, vật phẩm cốt truyện không giao dịch.', gold: 120, xp: 50, item: 'story_whitepost_letters', itemQty: 1 },
  { id: 'chapter2_provisions', title: 'Bữa ăn cho người sẽ trở về', kind: 'craft', qty: 1,
    text: 'Tịnh muốn ở lại: người gác cầu vẫn tuần tra ngoài kia, và ông không thể bỏ trạm khi đường chưa an toàn. Bạn mở cuốn sổ, viết một việc nhỏ hơn lời thề: đưa một người sống trở về trước bình minh. Hãy chuẩn bị một món chế tạo hoặc một phần ăn cho đường về. Không cần vật báu; cần một thứ do chính tay mình làm ra.',
    goal: 'Chế hoặc nấu thành công 1 món sau khi mở bước này: {p}craft list hoặc {p}cook list. Công thức cơ bản cũng tính.', gold: 180, xp: 60, item: 'potion_m', itemQty: 2 },
  { id: 'chapter2_guardian', title: 'Người gác không được đổi ca', kind: 'boss', target: 'elite_whitepost_keeper', qty: 1,
    text: 'Giữa cầu, một bộ giáp trống giơ chiếc đèn đã tắt. Trong ngực giáp có tấm lệnh bảo vệ đoàn dân; hơi lạnh lặp mãi một đêm sơ tán, khiến nó coi mọi bước chân trên đường về là bước chân của kẻ truy đuổi. Bạn gọi tên Yên. Mũ giáp nghiêng lại trong khoảnh khắc, rồi lưỡi giáo hạ xuống. Muốn kết thúc ca gác, trước hết phải phá lớp băng đang cầm tù người lính ấy — không phải cướp một món binh khí.',
    goal: 'Hạ Whitepost Keeper: {p}battle elite_whitepost_keeper (hoặc {p}hunt elite_whitepost_keeper). Elite mới dành cho khoảng Lv.18; chuẩn bị gear, chiêu và HP trước.', gold: 300, xp: 100 },
  { id: 'chapter2_release', title: 'Lệnh cuối cùng', kind: 'talk', qty: 1,
    text: 'Băng vỡ. Trong giáp không có hài cốt, chỉ một chiếc còi gỗ và danh sách những người đã sang cầu. Bạn đọc từng tên. Khi đến tên cuối, chiếc đèn tắt tự xoay về phía thị trấn. Tịnh tháo tấm biển “Chưa an toàn” khỏi trạm. “Đường đã mở,” ông nói, như báo cáo với người đã đợi câu ấy quá lâu. Dưới chân cầu, bảy vạch khắc bao quanh một dấu niêm phong. Không có thanh kiếm nào ở đây. Có người đã dùng dấu của bảy thanh kiếm để đánh dấu những nơi phải được giữ kín.',
    goal: 'Kết thúc ca gác và đưa Tịnh về: {p}story claim.', gold: 120, xp: 50 },
  { id: 'chapter2_delivery', title: 'Cửa sổ có ba ngọn đèn', kind: 'item', target: 'story_whitepost_letters', qty: 1,
    text: 'Bà An nhận ra cửa sổ trên phong thư: đó là nhà bà, trước khi căn bếp bị dỡ để nới chỗ trú cho khách lỡ đường. Thư là của bà ngoại bà. “Nếu con lớn lên mà vẫn chưa biết cha mình có trở về không, hãy sống như thể con đã được yêu thương trọn vẹn. Vì đúng là như vậy.” Bạn đặt túi thư lên bàn. Không ai nhờ bạn đi lấy thêm chứng cứ. Đêm nay, có những điều đã đủ chắc chắn.',
    goal: 'Trao Túi Thư Bạch Đăng cho bà An: {p}story claim (tiêu hao túi thư cốt truyện, không tiêu kỷ vật chương 1).', gold: 200, xp: 70 },
  { id: 'chapter2_dawn', title: 'Đèn cho người đi tới', kind: 'talk', qty: 1,
    text: 'Sáng hôm sau, thị trấn không dập đèn. Họ chỉ xoay chúng ra phía con đường còn người qua lại. Tịnh dựng một hộp thư cạnh cổng; lần đầu tiên, trên đó có giờ nhận và giờ giao. Bà An trao bạn chiếc còi gỗ đã sửa, không để gọi người chết mà để người sống tìm thấy nhau trong sương. Lâm trải tấm niêm phong sao lại từ chân cầu. Ở góc giấy hiện một tên kho bị cạo dở: Kho Tro. Bên dưới là nét mực còn mới: “Đừng hỏi ai đã giữ cửa. Hãy hỏi ai ra lệnh đóng nó.” Có người đang xóa dấu đoàn hộ tống — và người ấy vẫn còn sống.',
    goal: 'Khép Chương 2: {p}story claim. Nhận kỷ vật Còi Gọi Bình Minh; manh mối Kho Tro dành cho chương sau.', gold: 250, xp: 90, item: 'story_dawn_whistle', itemQty: 1 },
].map(step => ({ ...step, chapter: CHAPTER }));

function seed(db) {
  const item = db.prepare(`INSERT OR IGNORE INTO items (id,name,type,tier,sell,soulbound,desc) VALUES (?,?,'material','rare',0,1,?)`);
  item.run('story_whitepost_letters', '✉️ Túi Thư Bạch Đăng', 'Bốn mươi bảy lá thư được gửi từ trạm Bạch Đăng. Vật phẩm chính tuyến Chương 2, chỉ bàn giao trong story; không mang sức mạnh chiến đấu.');
  item.run('story_dawn_whistle', '🪈 Còi Gọi Bình Minh', 'Kỷ vật hoàn thành Chương 2. Tiếng còi để người sống tìm thấy nhau trong sương; không triệu hồi, không tăng chỉ số.');
  const mob = db.prepare(`INSERT OR IGNORE INTO monsters (id,name,zone_id,hp,atk,def,xp,gold_min,gold_max,weight,elite_tier,desc) VALUES (?,?,'mountain',?,?,?,?,?,?,?,?,?)`);
  mob.run('rime_hound', '🐕 Rime Hound', 280, 38, 15, 100, 55, 90, 8, 0,
    'Thú hoang bị sương băng quanh trạm Bạch Đăng giữ lại. Tiếng chuông xe mắc trong hơi thở của chúng, lặp mãi một chuyến hộ tống chưa được báo là đã đến nơi.');
  mob.run('elite_whitepost_keeper', '🏮 Whitepost Keeper', 650, 65, 24, 450, 180, 300, 3, 1,
    'Bộ giáp gác cầu Bạch Đăng không còn người mặc. Lệnh bảo vệ đoàn sơ tán bị đóng băng trong lồng ngực; nó vẫn chắn người trở về như thể đêm truy đuổi chưa kết thúc.');
  // Ordinary, already obtainable materials only; no source-exclusive gear/tome.
  const drop = db.prepare('INSERT OR IGNORE INTO monster_drops (monster_id,item_id,chance,qty) VALUES (?,?,?,?)');
  drop.run('rime_hound', 'stone', 0.7, 2);
  drop.run('elite_whitepost_keeper', 'coal', 0.6, 2);
}
module.exports = { CHAPTER, STEPS, seed };
