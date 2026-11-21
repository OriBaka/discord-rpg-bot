// Last personal chapter. Append-only cursors; no global race is opened here.
const CHAPTER = 'Chương 3 — Kho Tro không giữ được tên người';
const STEPS = [
  { id: 'chapter3_summons', title: 'Mực chưa kịp khô', kind: 'talk', qty: 1,
    text: 'Tịnh trở về với một phong thư không dán kín. Người gửi biết bạn đã đọc dấu niêm phong ở Bạch Đăng: “Nếu muốn biết ai đóng cửa, đến Kho Tro trước khi người ta đốt sổ.” Lâm nhận ra loại mực dùng để kiểm kê hàng cứu tế. Nó vẫn được bán trong thị trấn. Bà An gấp thư lại: “Lần này đừng mang về một lời hẹn nữa. Hãy mang về điều chúng ta có thể biết chắc.” Kho Tro nằm trong đường hầm cũ dưới chân núi, không phải phía bên kia niêm phong.',
    goal: 'Nhận chuyến điều tra Kho Tro: {p}story claim. Chương cá nhân cuối cùng, hướng tới khoảng Lv.23–25; không có thời hạn, không tính đua về nhất.', gold: 150, xp: 60 },
  { id: 'chapter3_soot', title: 'Những con bướm ăn chữ', kind: 'kill', target: 'ash_moth', qty: 3,
    text: 'Trong đường hầm, tro bay ngược chiều gió. Những con bướm xám đậu lên bảng tên rồi để lại mặt gỗ trắng trơn. Chúng không ăn giấy; chúng liếm thứ nhựa đen người ta quét lên chữ để xóa dấu. Bạn tìm thấy các bảng vừa bị cạo sáng nay. Kẻ gửi thư đã đúng: có người đang dọn sạch chứng cứ, và lũ bướm đang làm nốt công việc ấy.',
    goal: 'Thắng 3 Ash Moth sau khi mở bước này: {p}hunt ash_moth. Hãy hồi HP và chuẩn bị gear trước khi đi tiếp.', gold: 220, xp: 80 },
  { id: 'chapter3_braces', title: 'Giữ một lối ra', kind: 'item', target: 'iron_ore', qty: 3,
    text: 'Một thanh chống mục gãy ngay sau lưng bạn. Lâm xem vết cắt: mới, nhưng không nhằm giết người; nó hướng đống đất về cửa phòng lưu trữ. Ai đó muốn giữ sổ sách bên trong mà không phải đối mặt với người tìm đến. Ông cần quặng sắt để gia cố chốt chống tạm. Bạn đánh dấu một lối rút lui cho cả nhóm. Không ai sẽ phải ở lại giữ cửa một mình như đội trưởng Yên nữa.',
    goal: 'Giao 3 iron_ore bằng {p}story claim (tiêu hao). Tra {p}item iron_ore để tìm nguồn; không bắt buộc tự đào hay đạt cấp nghề mới.', gold: 200, xp: 70 },
  { id: 'chapter3_lantern', title: 'Một thứ có thể sửa được', kind: 'craft', qty: 1,
    text: 'Giữa hai vách hầm là một bàn sửa đèn còn ấm. Người ở đây đã thay tim đèn, vá áo người gác và mài dụng cụ suốt nhiều năm, nhưng không sửa nổi một mệnh lệnh. Lâm đặt túi đồ xuống: “Trước khi hỏi ông ta đã làm gì, hãy chắc ta có thể đưa người bị thương ra.” Bạn chuẩn bị một món đồ hoặc phần ăn. Những việc nhỏ có điểm kết thúc rõ ràng giúp bàn tay thôi run.',
    goal: 'Chế hoặc nấu thành công 1 món sau khi mở bước này: {p}craft list hoặc {p}cook list. Công thức cơ bản cũng tính.', gold: 200, xp: 70, item: 'potion_m', itemQty: 2 },
  { id: 'chapter3_witness', title: 'Người ký thay người chết', kind: 'talk', qty: 1,
    text: 'Người chờ bạn tên Sử, người quản sổ cứu tế mà bà An vẫn gặp mỗi mùa đông. Ông không sống qua nhiều thế kỷ; chức giữ sổ và bí mật đi cùng nó đã truyền qua gia đình ông. Tổ tiên ông ký lệnh đóng đường sau khi đoàn dân vượt cầu, để chặn thứ đang đuổi theo họ. Nhưng cũng chính bàn tay ấy đã xếp bốn mươi bảy người hộ tống vào mục “đã về”. “Nếu gia đình họ biết còn người ở lại, họ sẽ quay lại tìm,” Sử nói. Ông trao bạn sổ gốc. “Ta không ký lời nói dối đầu tiên. Ta chỉ đã chép lại nó, từng năm một.”',
    goal: 'Nhận bản gốc sổ hộ tống: {p}story claim. Sổ Gốc Kho Tro là vật phẩm cốt truyện soulbound; giữ để bàn giao, không cần tìm drop hiếm.', gold: 160, xp: 70, item: 'story_ash_ledger', itemQty: 1 },
  { id: 'chapter3_warden', title: 'Lệnh hủy không có người nhận', kind: 'boss', target: 'boss_ash_registrar', qty: 1,
    text: 'Khi sổ rời giá, dây đồng trong vách căng lên. Người Giữ Sổ — một cỗ máy kiểm kê bọc giáp — kéo những ngăn hồ sơ về phía lò. Nó nhận lệnh hủy tài liệu từ cha Sử, người đã chết trước khi kịp thu hồi lệnh. Sử thú nhận chính ông cạo dấu ở Bạch Đăng và cắt thanh chống để bạn bỏ cuộc: ông sợ sự thật sẽ khiến người ta phá cửa niêm phong. Nhưng lá thư cũng do ông gửi. Ông đã muốn được ngăn lại. Giờ ông giữ tay quay cho nhóm có đường thoát, còn bạn phải chặn cỗ máy trước khi cả kho thành tro.',
    goal: 'Hạ Ash Registrar: {p}battle boss_ash_registrar (hoặc {p}hunt boss_ash_registrar). Boss khoảng Lv.25, có Roar/Rage; chuẩn bị chiêu, trang bị và hồi HP. Thất bại có thể thử lại.', gold: 400, xp: 150 },
  { id: 'chapter3_confession', title: 'Không còn ai ký thay', kind: 'talk', qty: 1,
    text: 'Cỗ máy dừng. Tịnh kéo Sử khỏi tay quay cháy đỏ; ông còn sống và sẽ tự nói phần của mình. Phía sau giá hồ sơ, một cửa đá khắc bảy vạch vẫn nguyên niêm phong. Sử đặt lên bàn bản vẽ cũ: những vạch ấy là dấu chứng thực mượn hình của bảy thanh kiếm, không phải chỗ cất kiếm. Sau cửa là phần lưu trữ bị cách ly cùng một hiểm họa chưa được xác định, không phải lời hứa cứu người chỉ cần đủ can đảm để mở. Bạn không chạm vào cơ cấu. “Đưa tên họ về trước,” Tịnh nói. “Chuyện cánh cửa phải được nói giữa ban ngày.”',
    goal: 'Đưa Sử cùng chứng cứ rời Kho Tro: {p}story claim. Không mở niêm phong, không đưa ra lựa chọn lịch sử toàn thế giới ở bước này.', gold: 160, xp: 70 },
  { id: 'chapter3_record', title: 'Trang sổ đặt giữa quảng trường', kind: 'item', target: 'story_ash_ledger', qty: 1,
    text: 'Bạn giao sổ gốc cho bàn lưu trữ công khai trước nhà bà An. Bốn mươi bảy cái tên được chép lại, lần này không nằm trong cột “đã về” mà dưới dòng “đã ở lại để người khác trở về”. Sử kể việc mình đã làm, không xin tổ tiên nhận lỗi thay. Có người nổi giận. Có người đứng dậy bỏ về. Bà An không tha thứ thay cho họ; bà chỉ yêu cầu không được đốt thêm một trang nào để làm mọi chuyện dễ chịu hơn.',
    goal: 'Bàn giao 1 Sổ Gốc Kho Tro bằng {p}story claim (tiêu hao). Không tiêu Dấu Chỉ Người Canh Đèn hay Còi Gọi Bình Minh.', gold: 240, xp: 90 },
  { id: 'chapter3_assembly', title: 'Một lời chờ có điểm kết thúc', kind: 'talk', qty: 1,
    text: 'Tối đó, bà An đọc lá thư của đội trưởng Yên trước những nhà còn sáng đèn. Lần đầu tiên, không ai hứa ngày mai người mất sẽ trở về. Tịnh đặt lịch chuyến thư mới bên danh sách người hộ tống. Lâm treo chiếc đèn sửa từ Kho Tro ở cổng, để người đi đường nhìn thấy lối về chứ không phải một lời mắc nợ. Bạn khép cuốn sổ trắng bà An từng trao. Nó đã đầy chữ. Hành trình đi tìm những người đứng đợi kết thúc ở đây: không phải vì mọi vết thương đã lành, mà vì họ không còn phải chờ trong một lời nói dối.',
    goal: 'Khép tuyến Những người đứng đợi: {p}story claim. Nhận kỷ vật Ấn Người Làm Chứng — soulbound, không tăng chỉ số, không trao ưu thế cuộc đua tương lai.', gold: 300, xp: 100, item: 'story_witness_seal', itemQty: 1 },
  { id: 'chapter3_threshold', title: 'Lịch sử chưa có người viết', kind: 'talk', qty: 1,
    text: 'Trên bàn hội đồng là bản sao cánh cửa dưới Kho Tro. Có người muốn phá nó để tìm sự thật, có người muốn gia cố để giữ bình yên. Lần này, không ai được ký thay cả thị trấn trong bóng tối. Bà An đặt một trang giấy chưa viết cạnh bản vẽ: “Chuyện của con đã đưa chúng ta tới đây. Điều xảy ra tiếp theo sẽ không chỉ thuộc về một người.” Bạn để trang ấy trống. Cánh cửa vẫn đóng. Chưa có lời hiệu triệu, chưa có người thắng cuộc, chưa có quyết định nào được ghi vào lịch sử chung.',
    goal: 'Hoàn tất Chương 3 cá nhân: {p}story claim. Từ Chương 4, dự kiến một lịch sử chung cho toàn bộ người chơi bot; nội dung, luật đua và giờ mở chưa phát hành. Hoàn thành sớm bước này không giữ chỗ hay quyền quyết định lịch sử.', gold: 150, xp: 60 },
].map(step => ({ ...step, chapter: CHAPTER }));

function seed(db) {
  const item = db.prepare(`INSERT OR IGNORE INTO items (id,name,type,tier,sell,soulbound,desc) VALUES (?,?,'material','rare',0,1,?)`);
  item.run('story_ash_ledger', '📒 Sổ Gốc Kho Tro', 'Bản gốc danh sách đoàn hộ tống. Vật phẩm chính tuyến Chương 3 để bàn giao; không giao dịch, không mang sức mạnh chiến đấu.');
  item.run('story_witness_seal', '🕯️ Ấn Người Làm Chứng', 'Kỷ vật khép tuyến Những người đứng đợi sau Chương 3. Không tăng chỉ số, không trao quyền quyết định lịch sử hoặc ưu thế đua về nhất.');
  const mob = db.prepare(`INSERT OR IGNORE INTO monsters (id,name,zone_id,hp,atk,def,xp,gold_min,gold_max,weight,elite_tier,desc) VALUES (?,?,'mountain',?,?,?,?,?,?,?,?,?)`);
  mob.run('ash_moth', '🦋 Ash Moth', 420, 52, 20, 170, 80, 130, 4, 0,
    'Bướm tro từ đường hầm Kho Tro ăn lớp nhựa xóa chữ trên bảng tên. Bụi cánh chúng làm dấu chân mới trông như đã bị bỏ quên nhiều năm.');
  mob.run('boss_ash_registrar', '📚 Ash Registrar', 1400, 96, 36, 1100, 400, 650, 1, 2,
    'Cỗ máy kiểm kê bọc giáp dưới Kho Tro, vẫn thi hành lệnh hủy hồ sơ của người đã chết. Tiếng bánh răng át lời thu hồi lệnh; không có linh hồn hay thanh kiếm nào để chiếm đoạt bên trong.');
  const drop = db.prepare('INSERT OR IGNORE INTO monster_drops (monster_id,item_id,chance,qty) VALUES (?,?,?,?)');
  drop.run('ash_moth', 'coal', 0.6, 1);
  drop.run('boss_ash_registrar', 'iron_ore', 0.8, 2);
}
module.exports = { CHAPTER, STEPS, seed };
