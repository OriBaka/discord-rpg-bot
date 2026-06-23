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

| Tên biến | Giá trị |
|---|---|
| `DISCORD_TOKEN` | (dán token đã copy ở bước 1) |
| `PREFIX` | `!` |
| `DB_PATH` | `/data/rpg.db` |

4. Bấm **"Add"** sau mỗi biến

Railway sẽ tự deploy lại.

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
