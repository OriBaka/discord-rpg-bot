# 🚂 Hướng Dẫn Deploy Bot Lên Railway (từ điện thoại)

Toàn bộ quá trình **làm trên điện thoại được**, mất khoảng **15-20 phút**.

> 💳 **Lưu ý chi phí**: Railway cho **$5 free trial** (xài 1 lần, đủ chạy bot ~1-2 tháng). Sau đó cần plan Hobby $5/tháng. Nếu muốn 100% free vĩnh viễn, dùng Fly.io hoặc Render thay thế — mình có thể hướng dẫn riêng.

---

## 📋 Tổng quan các bước

1. ✅ Tạo bot Discord & lấy TOKEN
2. ✅ Đưa code lên GitHub
3. ✅ Tạo project Railway từ GitHub
4. ✅ Thêm biến môi trường DISCORD_TOKEN
5. ✅ Mount Volume để giữ data SQLite
6. ✅ Mời bot vào server và chơi!

---

## BƯỚC 1️⃣ — Tạo Bot Discord & lấy TOKEN

1. Mở trình duyệt → vào https://discord.com/developers/applications
2. Đăng nhập Discord → bấm **"New Application"** (góc trên phải)
3. Đặt tên bot (vd: `RPG Cay Cuoc`) → **Create**
4. Menu trái → tab **"Bot"**
5. Kéo xuống mục **"Privileged Gateway Intents"** → **BẬT cả 3 nút** (đặc biệt là `MESSAGE CONTENT INTENT`)
6. Kéo lên đầu trang → bấm **"Reset Token"** → **"Yes, do it!"** → **Copy** token (chuỗi dài dạng `MTI...`)

⚠️ **Lưu token vào Notes của điện thoại**, đừng để lộ cho ai. Nếu lộ thì Reset Token lại.

### Lấy link mời bot

1. Tab **"OAuth2"** → kéo xuống **"OAuth2 URL Generator"**
2. **Scopes**: tick `bot`
3. **Bot Permissions**: tick:
   - `Send Messages`
   - `Embed Links`
   - `Read Message History`
   - `Use External Emojis`
4. Copy link ở cuối trang → **lưu vào Notes** (chưa mời ngay, để cuối cùng)

---

## BƯỚC 2️⃣ — Đưa code lên GitHub

Cách dễ nhất trên điện thoại: dùng **GitHub web** + upload file zip.

### Cách A: Dùng app GitHub Mobile (khuyến nghị)

1. Tải app **GitHub** trên CH Play / App Store
2. Đăng nhập → tab **"Repositories"** → bấm **"+"** → **"New repository"**
3. Tên: `discord-rpg-bot`, để **Private** cũng được → **Create**

### Cách B: Dùng web github.com

1. Vào https://github.com → đăng nhập (hoặc tạo tk mới, free)
2. Bấm **"+"** góc phải → **"New repository"**
3. Tên: `discord-rpg-bot` → **Create repository**

### Upload code lên repo

Tải toàn bộ thư mục `discord-rpg-bot/` về máy:
- **Không upload thư mục `node_modules/`** (rất nặng, Railway tự cài)
- **Không upload file `.env`** (chứa token!)
- File `.gitignore` đã có sẵn để loại trừ 2 thứ trên

Trên web GitHub, vào repo vừa tạo:
1. Bấm **"uploading an existing file"** (link xanh)
2. Chọn **TẤT CẢ** file/folder trong `discord-rpg-bot/` (trừ `node_modules` và `.env`)
3. Cuộn xuống → **"Commit changes"**

✅ Code đã lên GitHub.

---

## BƯỚC 3️⃣ — Tạo project trên Railway

1. Vào https://railway.com (hoặc railway.app) trên điện thoại
2. **"Login"** → chọn **"Login with GitHub"** → cho phép Railway truy cập
3. Bấm **"New Project"** (nút tím lớn)
4. Chọn **"Deploy from GitHub repo"**
5. Lần đầu sẽ phải bấm **"Configure GitHub App"** → chọn repo `discord-rpg-bot` → **Save**
6. Quay lại Railway → chọn repo `discord-rpg-bot` → **"Deploy Now"**

Railway sẽ tự:
- Detect Node.js
- Chạy `npm install`
- Chạy `npm start`

⚠️ Lần đầu deploy sẽ **FAIL** vì chưa có TOKEN. Bình thường, qua bước 4.

---

## BƯỚC 4️⃣ — Thêm biến môi trường

1. Trong project Railway → bấm vào **service** vừa tạo (ô vuông có icon GitHub)
2. Tab **"Variables"** → **"+ New Variable"**
3. Thêm các biến sau:

| Tên biến | Giá trị | Bắt buộc |
|---|---|---|
| `DISCORD_TOKEN` | (dán token đã copy ở bước 1) | ✅ |
| `ADMIN_IDS` | User ID của bạn, vd `123456789012345678` | ⚠️ nên set |
| `DB_PATH` | `/data/rpg.db` | ✅ nếu có volume |
| `PREFIX` | `!` | không (mặc định `!`) |
| `SLASH_GUILD_ID` | ID server của bạn | không |

4. Bấm **"Add"** sau mỗi biến

**Về `ADMIN_IDS`** — đây là chỗ nhiều người bị kẹt:

- Nếu **bỏ trống**: chỉ **chủ server** và người có quyền **Administrator** mới dùng
  được lệnh admin. Nếu bạn tạo server thì vẫn OK.
- Nhưng nếu bạn là admin thường (không có quyền Administrator), hoặc muốn test
  trên server của người khác, thì **phải** điền user ID của mình.
- Cách lấy: Discord → Settings → **Advanced** → bật **Developer Mode** →
  chuột phải tên bạn → **Copy User ID**.
- Nhiều người: ngăn cách bằng dấu phẩy → `111111111111111111,222222222222222222`

**Về `SLASH_GUILD_ID`** — không set thì slash command deploy global, Discord có thể
cache tới ~1 giờ mới hiện. Set ID server để thấy lệnh mới gần như ngay.

Railway sẽ tự deploy lại sau khi thêm biến.

---

## BƯỚC 5️⃣ — Mount Volume (cực kỳ quan trọng!)

Nếu bỏ qua bước này, **mỗi lần bot redeploy là MẤT HẾT người chơi**!

1. Vào service → tab **"Settings"** (hoặc icon ⚙️)
2. Kéo xuống mục **"Volumes"** → **"+ New Volume"**
3. **Mount Path**: gõ `/data`
4. **Create**

Railway sẽ deploy lại lần nữa với volume gắn vào. Từ giờ file SQLite sẽ được lưu vĩnh viễn ở `/data/rpg.db`.

---

## BƯỚC 6️⃣ — Kiểm tra & mời bot

1. Trong service → tab **"Deployments"** → bấm deployment mới nhất → **"View Logs"**
2. Nếu thấy:
   ```
   ✅ Đã load 12 lệnh.
   💾 SQLite DB: /data/rpg.db
   🤖 Bot online với tên RPG Cay Cuoc#1234
   ```
   → 🎉 **Thành công!**

3. Mở link mời bot đã lưu ở bước 1 → chọn server của bạn → **Authorize**

4. Vào server, gõ thử:
   ```
   !start
   !hunt
   !me
   ```

---

## 🛠️ Cập nhật code sau này

Mỗi khi bạn sửa code:
1. Upload file mới lên GitHub repo (hoặc dùng app GitHub edit trực tiếp)
2. Railway **tự động deploy lại** trong ~1-2 phút

---

## 🐛 Khắc phục sự cố

### Gõ lệnh admin báo "Chỉ admin"
→ Chưa set `ADMIN_IDS`. Xem bước 4️⃣ ở trên. (Chủ server / người có quyền
Administrator thì vẫn dùng được dù không set.)

### Slash command không xuất hiện
→ Deploy global cần Discord cache lại (có thể tới 1 giờ). Set `SLASH_GUILD_ID`
để deploy theo server cho nhanh. Kiểm tra bằng `!slashadmin list`.

### Bot online nhưng không trả lời tin nhắn
→ Chưa bật **MESSAGE CONTENT INTENT** ở Discord Developer Portal (bước 1.5)

### Log báo "Used disallowed intents"
→ Như trên. Vào lại portal, bật cả 3 intents, lưu lại.

### Deploy fail "Cannot find module"
→ Quên upload file `package.json`. Upload lại.

### Mỗi lần deploy mất sạch nhân vật
→ Quên mount Volume (bước 5) hoặc quên set `DB_PATH=/data/rpg.db`

### Hết $5 free trial
→ Option 1: nâng cấp Hobby plan $5/tháng
→ Option 2: chuyển sang **Fly.io** (3 VM free) hoặc **Render** (free tier) — mình có thể hướng dẫn

### Bot tự tắt sau vài giờ
→ Có thể đang ở Trial mode bị giới hạn. Check tab **"Usage"** trên Railway dashboard.

---

## 💡 Mẹo

- **Xem log realtime**: tab Deployments → View Logs → để màn hình mở
- **Restart bot**: tab Deployments → ⋮ → Restart
- **Đổi tên bot**: vào Discord Developer Portal → tab General Information → đổi tên
- **Đổi avatar bot**: cùng tab General Information → upload ảnh

---

Chúc bạn deploy thành công! Có lỗi gì cứ gửi log cho mình xem nhé. 🚀

## Backup và khôi phục

### Cấu hình

1. Đảm bảo `DB_PATH=/data/rpg.db` và volume mount `/data` như trước.
2. Điền Discord user ID của chủ bot vào `ADMIN_IDS` (nhiều ID cách nhau dấu phẩy).
3. Tạo một **kênh backup riêng**, chỉ chủ bot/người thực sự tin cậy được xem; bản DB chứa dữ liệu của **mọi server** dùng bot, không chỉ server hiện tại.
4. Cấp bot `View Channel`, `Send Messages`, `Attach Files`, rồi đặt `BACKUP_CHANNEL_ID=<ID kênh>` trong Railway Variables.
5. Tuỳ chọn: `BACKUP_KEEP=7` (1–100), `BACKUP_DIR=/data/backups` (mặc định cạnh DB). Luôn đặt thư mục trên volume.
6. Sau deploy, chạy `%adm backup` hoặc `/adm backup`. Kiểm tra tin nhắn có file `.db` trong kênh backup và tải một bản về máy.

Bot tạo snapshot SQLite nhất quán mà không cần dừng game, bao gồm dữ liệu đã commit trong WAL; kiểm tra `quick_check` trước khi công nhận bản hoàn tất. Khi startup, nếu không có snapshot mới trong 24 giờ thì tạo ngay, sau đó kiểm tra mỗi giờ. Giữ tối đa `BACKUP_KEEP` bản **local**, không tự xoá các tin nhắn backup trên Discord. Các lần gọi trùng nhau dùng chung một lượt backup.

Nếu không cấu hình kênh, backup vẫn chạy local nhưng **không chống mất volume**. Nếu gửi Discord lỗi (quyền, mất mạng, file quá lớn), bot giữ bản local và ghi lỗi vào log; không tự retry upload cho tới lần backup kế tiếp. Dùng lệnh manual để thử lại sau khi sửa. Có kiểm tra giới hạn đính kèm theo server (mặc định 10 MiB nếu không biết); nếu DB vượt giới hạn, hãy lưu backup ra kho ngoài như S3/R2 bằng quy trình riêng. Tính năng này chưa tích hợp S3/R2.

Khi nhận SIGTERM/SIGINT, bot chờ lượt backup đang chạy, checkpoint WAL và đóng DB (tối đa 10 giây). WAL vốn hỗ trợ phục hồi khi process bị kill; shutdown sạch không thay thế backup.

### Khôi phục an toàn (thủ công)

Không có lệnh restore trong Discord để tránh ghi đè nhầm toàn bộ game.

1. Tải file `.db` từ kênh riêng hoặc lấy từ `/data/backups`. Nên kiểm tra thử bằng SQLite: `PRAGMA integrity_check;` phải trả `ok`.
2. **Dừng service bot**, tạm tắt tự redeploy/restart. Không thay DB khi process vẫn đang chạy.
3. Qua công cụ quản lý volume/shell đáng tin cậy có mount volume, sao lưu bộ DB hiện tại (`rpg.db` cùng `rpg.db-wal`, `rpg.db-shm` nếu có) ra chỗ khác để có thể quay lại.
4. Thay `/data/rpg.db` bằng snapshot đã chọn. Sau khi đã giữ bản cũ, loại bỏ các sidecar `rpg.db-wal` và `rpg.db-shm` cũ; tuyệt đối không ghép WAL cũ với snapshot mới. Đảm bảo process bot có quyền đọc/ghi file.
5. Khởi động bot, kiểm tra người chơi, inventory, vàng và log. Toàn bộ thay đổi sau thời điểm snapshot sẽ mất.

Nên diễn tập khôi phục với bản sao DB trong môi trường riêng trước khi có sự cố; không chạy bot thử cùng token production.

## Dashboard web cùng service bot

1. Giữ nguyên volume, `DB_PATH`, token và start command `npm start`.
2. Web bật mặc định (`WEB_ENABLED=true`), dùng `PORT` Railway tự cấp và bind `0.0.0.0`.
3. Trong **Settings → Networking**, chọn **Generate Domain** cho service bot. Nếu được hỏi target port, dùng đúng `PORT` của service. Không cần service/volume thứ hai.
4. Mở domain để xem tổng quan, BXH, hồ sơ, chợ và bang hội. Không có đăng nhập hay mua bán trên web.
5. Có thể dùng `/healthz` làm HTTP healthcheck; đây chỉ là trạng thái HTTP/DB, không phải trạng thái kết nối Discord.

**Lưu ý quyền riêng tư:** dashboard hiển thị dữ liệu toàn bot, bao gồm tên nhân vật,
Discord ID để liên kết hồ sơ, cấp/class, trang bị đang mặc, tin chợ và thông tin bang.
Không bật public domain nếu không muốn dữ liệu đó công khai. `WEB_ENABLED=false` tắt web.
API chỉ SELECT những trường công khai; không dùng helper chợ có tác dụng dọn tin/hoàn item.
Không có endpoint tải file, sửa DB, đọc env, hay tải backup. Thay đổi trên Discord sẽ xuất hiện khi tải lại web.
