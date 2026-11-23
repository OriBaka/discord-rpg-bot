# Ranh giới story cá nhân và lịch sử thế giới

## Đã triển khai

- Mở đầu + Chương 1: cursor 0–7, giữ nguyên thứ tự cũ.
- Chương 2: cursor 8–17, giữ nguyên thứ tự cũ.
- Chương 3: cursor 18–27, khép tuyến **Những người đứng đợi**.
- Cursor 28 nghĩa là hết nội dung cá nhân hiện có. Không phải thắng cuộc đua.
- Mỗi người chơi độc lập hoàn thành và nhận thưởng một lần. Tiến độ dùng
  Discord user ID, như hệ thống story hiện hành; không phát sinh lịch sử theo guild.
- Ba chương không mở niêm phong Kho Tro, không trao kiếm Thất Đại Tội,
  không mở nguồn nhận gear/tome độc quyền và không cấp quyền quyết định world lore.
- UI hoàn thành nói rõ Chương 4 chưa phát hành. Story cá nhân không tự tạo lịch,
  người thắng hay lựa chọn lịch sử. Khung world story riêng bên dưới mặc định khóa.

## Chương 3 (có spoiler)

Sử là người quản sổ đương nhiệm, kế thừa bí mật chứ không phải người bất tử.
Ông vừa xóa dấu vết để ngăn người ta phá niêm phong, vừa gửi thư để có người
ngăn mình tiếp tục che giấu. Sổ gốc chứng minh đoàn hộ tống đã ở lại dù hồ sơ
cứu tế ghi họ đã về. Người chơi chặn cỗ máy hủy hồ sơ, đưa Sử sống sót về
đối diện cộng đồng, công khai tên người mất và khép cuộc chờ đợi trong dối trá.
Không bắt cộng đồng tha thứ thay nhau; không xử tử NPC bằng một lựa chọn cá nhân.

Cánh cửa niêm phong còn nguyên. Dấu bảy thanh kiếm là ký hiệu chứng thực,
không phải địa điểm cất kiếm. Mối nguy sau cửa chưa được xác định. Đây là
điểm nối để một quyết định tương lai có hậu quả, không phải quyết định đã xảy ra.

## Hướng đã thống nhất cho Chương 4 trở đi — chưa phát hành nội dung

**Một lịch sử duy nhất cho toàn bộ người chơi bot, không tách server Discord.**
Người đầu tiên hoàn thành mục tiêu tranh lịch sử sẽ quyết định hướng đi
chương sau, thay cho tuyến cá nhân mà ai cũng chọn lại kết cục.

Trước khi phát hành cần thiết kế luật, giờ mở, điều kiện tham gia, xử lý người
đến sau, phạm vi lựa chọn và cách ghi nhận một người thắng nguyên tử trên
kho dữ liệu chung. Không suy ra quyền ưu tiên từ thời điểm hoàn thành Chương 3.
Không tự mở Chương 4 qua migration hay thao tác `story claim`.

Cấm mở nguồn sở hữu kiếm Thất Đại Tội cho đến khi có chỉ thị mới của chủ dự án.

## Nền móng kỹ thuật đã có (chưa mở cuộc đua)

- `src/game/world_story.js`: catalog production chỉ có `chapter4` với `ready:false`,
  không mục tiêu/lựa chọn mẫu, không seed lịch, tiến độ, người thắng hoặc lịch sử.
  `validDefinition` phải nhận nội dung publish đầy đủ trước khi lập lịch được.
- `%worldstory` / `%worldstory rules` / `%worldstory history [trang]`
  (slash `/worldstory`, alias `%lichsu`, `%worldlore`) đọc chung một DB cho mọi guild.
- Lịch chỉ admin bot trong ADMIN_IDS được tạo, tối thiểu 24h **giờ thật** trước
  giờ mở. Dùng UTC ISO `YYYY-MM-DDTHH:mm:ssZ`, không dựa đồng hồ weather/time.
  Không cho ghi đè, mở lại cùng ID hoặc xếp chương khác khi còn cuộc đua chưa chốt.
- `join`: chỉ sau giờ mở, cần nhân vật có cursor story >=28. Hoàn thành Chương 3
  không tự join, không được tích trước tiến độ hay giữ ưu tiên.
- `record(user, chapter, stableEventId, kind, target, amount, occurredAt)` là API
  **server nội bộ**, chưa gắn vào bất kỳ lệnh chơi nào. Không có lệnh nhập progress,
  finish hoặc gán người thắng (kể cả admin Discord). Hook tương lai phải gọi cùng
  transaction settlement thành công, truyền timestamp gốc tin cậy và ID ổn định
  như `battle:<id>:settled`, không dùng timestamp mới mỗi lần retry.
- Chỉ action sau giờ mở và sau thời điểm join mới hợp lệ. Dedupe mọi event
  đã nhận, kể cả event không đúng bước, để không phát lại khi bước sau được mở.
  Tiến độ capped theo từng bước, không chuyển lượng dư sang bước kế tiếp.
- Giao dịch `BEGIN IMMEDIATE` vừa ghi event, vừa tăng tiến độ, vừa chốt người
  đầu tiên đạt bước cuối. Cuộc đua chuyển `awaiting_choice` ngay; người thứ hai
  không thể vượt lên vì người đầu tiên chưa chọn. Thứ hạng là thứ tự giao dịch
  DB thành công, không phải timestamp do Discord client đưa lên.
- Người thắng chọn một ID kết cục có sẵn bằng `choose`, ghi lịch sử và resolved
  cùng một transaction. Lựa chọn sai, người khác chọn, chọn lại đều bị từ chối.
  Trigger SQLite chặn UPDATE/DELETE `world_history`. Lưu snapshot tên + user ID
  + giờ về đích/chốt + label/hậu quả; đổi tên/reset nhân vật không xóa lịch sử.
- Không phát tiền, XP, kiếm, trang bị hay vật phẩm nào từ nền móng này. Không
  thêm quest/drop/recipe/shop/event nhận kiếm Thất Đại Tội.
- Kiểm thử dùng catalog giả tiêm riêng vào service trong **SQLite test tạm**.
  Có bài hai process tranh về đích trên một DB, chỉ một winner; dữ liệu đó không
  được tạo trên DB production qua migration.

## Cổng kiểm duyệt trước khi publish Chương 4

Chưa được đổi `ready:true` chỉ để thử bot thật. Cần hoàn tất:

1. Nội dung, độ khó, nguồn event và lựa chọn có hậu quả thực sự; không bắt buộc
   RNG hiếm/cooldown nghề. Test mọi đường thắng và phần hậu quả cho người đến sau.
2. Luật công bằng: xử lý lợi thế level/gear, quyền admin server đang có thể cấp
   tài nguyên, nhiều tài khoản, exploit, disconnect và thời gian bảo trì. Nên
   cân nhắc thử thách chuẩn hóa thay vì mặc định người nhiều tài nguyên thắng.
3. Công bố lịch đa server có thể kiểm chứng; hệ thống hiện chưa tự gửi bản tin
   cuộc đua hay hủy/dời lịch. Cần chính sách tạm dừng/hủy do sự cố trước khi chạy.
4. Người thắng không chọn thì race giữ awaiting_choice, **chưa có timeout hay
   chuyển quyền tự động**. Chốt luật xử lý trước khi mở; không sửa winner âm thầm.
5. Nhiều shard/process phải dùng **cùng một DB có giao dịch**. SQLite local ở
   nhiều replica độc lập KHÔNG tạo lịch sử chung. Kiểm tra backup/restore và
   transaction khi triển khai; test hiện chỉ chứng minh tranh quyền trên cùng DB.
6. Chưa có reset/cancel/override lịch sử qua command. Tình huống phục hồi dữ liệu
   phải có quy trình audit riêng, không coi admin reset nhân vật là reset thế giới.

Các bảng world progress gắn Discord user ID, không foreign-key cascade theo
nhân vật. Reset không tạo lượt đua mới hoặc xóa quyền người đã thắng; người
chưa về đích phải hoàn tất lại điều kiện Chương 3 trước khi tiếp tục.
