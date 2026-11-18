# 🗡️ Discord RPG Bot — Cày Cuốc

Bot Discord RPG chơi bằng text: nhân vật, class, trang bị nhiều slot, săn quái, nghề, pet, bang hội, PvP, trade, quest và thành tựu.

- **49 lệnh** prefix + **53 slash command** (38 người chơi + 15 admin)
- Dữ liệu SQLite, không cần server database riêng
- Node.js ≥ 18 (khuyến nghị 20)

---

## ✨ Tính năng

| Nhóm | Nội dung |
|---|---|
| 👤 Nhân vật | Level/XP, HP, cộng chỉ số theo level, hồi máu bằng bình hoặc quán trọ |
| 🎭 Class | Chiến binh (melee) / Pháp sư (magic) / Cung thủ (ranged), skill riêng, unlock bằng huy hiệu |
| 🗡️ Trang bị | 11 slot (vũ khí, tay phụ, đầu, thân, quần, giày, găng, 2 nhẫn, dây chuyền, phụ kiện), yêu cầu level + class |
| ⚔️ Chiến đấu | `hunt` (mô phỏng nhanh) và `battle` (turn-based có nút bấm, elite/boss) |
| 🗺️ Khu vực | 5 zone mở theo level, 18 quái, 38 loại nguyên liệu |
| 🧪 Vật phẩm | 133 item: 4 độ hiếm (common/rare/epic/legendary), shop mua bán |
| 🛠️ Nghề & chế tạo | 5 nghề: mining, fishing, foraging, cooking, crafting + 27 recipe + 21 công cụ vĩnh viễn + 10 vật phẩm bổ trợ dùng một lần (buff theo lượt) + 14 thành tựu nghề |
| 🐾 Pet | 28 pet sống theo 9 vùng khí hậu, rơi trực tiếp / ghép mảnh / tiến hoá, cộng chỉ số khi đi theo |
| 🏰 Bang hội | Tạo bang, mời thành viên, kho chung, buff vàng/XP/drop, BXH bang |
| 🐲 Boss tuần (raid) | Cả server đánh chung một thanh máu, 5 lượt/tuần/người, chia thưởng theo hạng sát thương |
| ⚔️ PvP & Trade | Duel có cược vàng + rating; trade item/vàng 2 chiều có bước xác nhận |
| 📜 Quest & Thành tựu | Quest daily tự sinh (săn quái / vàng / cấp / thu hoạch / chế tác / cấp nghề / boss), quest custom (admin), 39 thành tựu có điểm và title (gồm mốc cấp cho cả 5 nghề) |
| 🎁 Khác | Daily, lootbox, redeem code, ảnh cho item/quái/zone/pet |

---

## 📦 Cấu trúc

```
discord-rpg-bot/
├── src/
│   ├── index.js              # Entry point: load lệnh, đăng ký event
│   ├── buttons.js            # Xử lý button (battle, duel, trade, paginator, "again")
│   ├── db/
│   │   ├── database.js       # SQLite + schema + chạy toàn bộ migrate
│   │   ├── seed.js           # Seed item/zone/quái lần đầu
│   │   └── rename_items.js   # One-shot đổi tên VN → EN
│   ├── game/                 # 44 module logic dùng chung (raid.js = boss tuần)
│   │   ├── player.js         # Player, XP, inventory
│   │   ├── combat.js         # Mô phỏng trận nhanh (hunt)
│   │   ├── battle.js         # Turn-based engine (battle)
│   │   ├── classes.js        # Class + skill
│   │   ├── slots.js          # 11 slot trang bị
│   │   ├── items.js / monsters.js / tiers.js
│   │   ├── pets.js / guilds.js / quests.js / achievements.js
│   │   ├── pvp.js / trade.js / jobs.js / recipes.js
│   │   └── gather_zones.js / lootbox.js / redeem.js / settings.js / images.js
│   ├── commands/             # 40 file → 43 lệnh (nhiều lệnh/file)
│   └── slash/
│       ├── definitions.js    # 32 slash command người chơi
│       ├── admin_definitions.js  # 15 slash command admin
│       ├── adapter.js        # Chuyển interaction → gọi lệnh prefix
│       └── deploy.js         # Đăng ký slash với Discord
├── test/                     # npm test (node:test, không cần token)
├── data/                     # SQLite db (tự tạo)
└── .env.example
```

**Kiến trúc:** mỗi file trong `src/commands/` export một hoặc nhiều lệnh dạng
`{ name, aliases, description, execute(msg, args) }`; `index.js` tự load hết.
Slash command không viết lại logic — `slash/adapter.js` giả lập một message rồi
gọi đúng lệnh prefix, nên chỉ có một nguồn logic duy nhất.

---

## 🚀 Cài đặt

### 1. Tạo bot trên Discord

1. Vào https://discord.com/developers/applications → **New Application**
2. Tab **Bot** → **Add Bot** → copy **TOKEN**
3. Bật **MESSAGE CONTENT INTENT** (bắt buộc — không bật bot sẽ không đọc được lệnh)
4. Tab **OAuth2 → URL Generator**: scope `bot`, permissions `Send Messages` + `Embed Links` + `Read Message History` + `Use External Emojis` → mở link mời bot

### 2. Chạy trên máy

```bash
cp .env.example .env
# mở .env, dán DISCORD_TOKEN (và nên set ADMIN_IDS)
npm install
npm start
```

Kiểm tra nhanh logic mà không cần token:

```bash
npm test        # 314 test: cân bằng, hồi quy, smoke mọi lệnh, chống nội dung chết
```

### 3. Deploy 24/7

Xem **[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)** — hướng dẫn từng bước, làm được trên điện thoại.
Trên Railway nhớ set `DB_PATH=/data/rpg.db` **và mount volume** `/data`, nếu không sẽ mất dữ liệu mỗi lần deploy.

---

## 🎮 Lệnh

Prefix mặc định `%`. Mọi lệnh đều có slash tương ứng (trừ vài lệnh admin chỉ có prefix).

### Nhân vật & trang bị

| Lệnh | Mô tả |
|---|---|
| `%start` | Tạo nhân vật mới |
| `%me [@user]` | Xem hồ sơ: level, HP, chỉ số, vàng |
| `%inv [filter] [sort]` | Xem túi đồ — phân trang, nút lọc, tổng giá trị. vd `%inv weapon`, `%inv value` (đắt trước), `%inv qty` |
| `%gear [@user]` | Xem trang bị đang mặc + tổng bonus |
| `%equip <id> [slot]` | Mặc đồ (tự chọn slot, hoặc chỉ định ring2, offhand…) |
| `%unequip <slot\|all>` | Tháo trang bị |
| `%upgrade` / `%upgrade <id>` / `%upgrade list` | Nâng cấp vũ khí +1..+5 (nguyên liệu tăng dần theo cấp và phẩm chất) |
| `%compare <id1> [id2]` | So sánh 2 món, hoặc so với món đang mặc cùng slot |
| `%class` | Xem class hiện tại, `%class pick/switch/unlock <id>` — mở class thứ 2 cần 1 Huy Hiệu (rơi 15% từ 3 boss cuối) |
| `%top` | BXH level, `%top guild` BXH bang |

### Chiến đấu

| Lệnh | Mô tả |
|---|---|
| `%hunt` | Săn tự động theo level (alias: `%san`, `%fight`, `%atk`) |
| `%hunt list` | Xem các khu vực |
| `%hunt <zone>` | Săn ở khu vực cụ thể |
| `%hunt <mob_id>` | Săn quái chỉ định |
| `%battle list` | Danh sách elite/boss (alias: `%bt`, `%turnbattle`) |
| `%battle <mob_id>` | Vào trận turn-based có nút bấm + skill |
| `%heal` | Nghỉ quán trọ hồi đầy HP (tốn vàng, cooldown 10 phút) |
| `%use <id> [qty]` | Dùng bình máu / mở lootbox |
| `%daily` / `%daily xem` | Điểm danh chuỗi 7 ngày — thưởng leo thang, ngày 7 tặng vật phẩm (xem bảng không điểm danh bằng `xem`) |

### Kinh tế & chế tạo

| Lệnh | Mô tả |
|---|---|
| `%shop` | Xem cửa hàng |
| `%buy <id> [qty]` / `%sell <id> [qty]` | Mua / bán cho NPC (không bán được món đang mặc). Hàng loạt: `%sell all [filter]`, `%sell junk`; bán ≥1,000 vàng phải thêm `confirm` |
| `%market` / `%market sell [id] [giá] [qty]` / `%market buy <#id>` | Chợ NGƯỜI CHƠI: bấm nút 🛒 để mua, `%market sell` xem món bán được + giá gợi ý, `%market sell <id>` gợi ý giá (`mine`, `cancel`, `search`, `recent`) |
| `%mine [zone]` | Đào mỏ (alias: `%dao`) |
| `%fish [zone]` | Câu cá (alias: `%cau`) |
| `%gather [zone]` | Hái lượm gỗ/thảo dược (foraging, alias: `%forage`, `%hai`) |
| `%craft list` / `%craft <id> [xN]` | Chế tạo, lặp N lần vd `%craft iron_ingot x10` (dừng khi hết nguyên liệu) |
| `%cook list` / `%cook <id>` | Nấu ăn |
| `%job [@user]` | Xem level các nghề, `%job top <type>` |

### Xã hội

| Lệnh | Mô tả |
|---|---|
| `%guild` | Bang hội: `create`, `invite`, `vault`, `deposit`, `withdraw`, `buff`, `top` |
| `%duel @user [gold]` | PvP có cược, `%duel accept/decline/top` |
| `%trade @user` | Mở phiên trade, `%trade add/remove/ready/confirm` |
| `%pet` | Pet: `active`, `shards`, `combine`, `evolve`, `map`, `collection` |
| `%raid` | Boss tuần: `danh` (đánh), `top` (BXH sát thương), `bang` (BXH bang), `thuong` (nhận thưởng) |
| `%redeem <code>` | Nhập code nhận thưởng |

### Tra cứu & tiến trình

| Lệnh | Mô tả |
|---|---|
| `%info item/mob/zone <id>` | Chi tiết item / quái / khu vực |
| `%quest` | Quest hằng ngày, `%quest claim <id>` nhận thưởng |
| `%ach [@user]` | Thành tựu, `%ach list`, `%ach top` |
| `%help` / `%help <từ khoá>` | Danh sách lệnh / tra cứu nhanh (vd `%help market`, `%help pet`; gõ không dấu vẫn được) |

### Admin

Lệnh admin yêu cầu user ID nằm trong `ADMIN_IDS`, hoặc là chủ server, hoặc có quyền Administrator.

**Cửa vào chính: `%adm`** (slash `/adm`). Mọi nhóm admin đều gọi được qua đây — không cần nhớ lệnh gốc nào có nhánh `admin`:

| Nhóm | Mô tả |
|---|---|
| `%adm help` | Danh sách toàn bộ nhóm lệnh admin |
| `%adm player <gold\|xp\|item\|takeitem\|setlevel\|sethp\|heal\|look\|reset>` | Sửa dữ liệu người chơi |
| `%adm class <give\|take\|set\|lock\|unlock>` | Gán/khoá class |
| `%adm item` / `%adm mob` / `%adm zone` | Nội dung: vật phẩm, quái, zone gather |
| `%adm recipe` / `%adm cookrecipe` / `%adm upgrade` | Recipe và cấu hình nâng cấp |
| `%adm shop` / `%adm quest` / `%adm ach` / `%adm pet` | Cửa hàng, quest, thành tựu, pet |
| `%adm lootbox` / `%adm redeem` / `%adm image` | Lootbox, code sự kiện, ảnh |
| `%adm stats` / `%adm announce` / `%adm channel` | Thống kê, thông báo, kênh notify |
| `%adm slash` / `%adm petfix` / `%adm achdebug` | Slash command, khôi phục pet, debug thành tựu |

Các lệnh gốc bên dưới **vẫn dùng được** như trước — `%adm` là cửa vào gom nhóm, không thay thế:

| Lệnh | Mô tả |
|---|---|
| `%admin help` | Cộng/trừ vàng, XP, set level, xem thống kê server |
| `%item help` | Tạo/sửa/xoá item, gán ảnh |
| `%mob help` | Tạo/sửa quái & zone, thêm drop |
| `%shop add/remove/setprice` | Chỉnh cửa hàng |
| `%quest admin` / `%ach admin` / `%pet admin` | Tạo/sửa quest, thành tựu, pet, khí hậu, drop & công thức tiến hoá |
| `%craft admin` / `%cook admin` | Tạo/sửa recipe |
| `%upgrade admin` | Chỉnh nguyên liệu/vàng nâng cấp theo mốc (`set`/`tier`/`gold`/`reset`) |
| `%gatherzone` (`%gz`) | Quản lý zone mining/fishing/foraging |
| `%lootbox` | Quản lý nội dung lootbox |
| `%redeem` | Tạo/quản lý code |
| `%setimage <type> <id> <url>` | Gán ảnh cho item/quái/zone/pet/thành tựu |
| `%slashadmin` (`%sla`) | Deploy/clear slash command |
| `%petrestore` | Khôi phục pet bị thiếu (dùng một lần khi nâng cấp) |
| `%achdebug <ach_id> [@user]` | Debug: xem/gán tiến độ một thành tựu |

---

## 🔧 Mở rộng

- **Thêm item**: `%item create ...` (admin) — không cần sửa code
  ```
  %item create <id> name="Tên" type=weapon tier=rare atk=10 min_level=12 price=500
  %item edit <id> heal_pct=45 min_level=20
  ```
  Field đầy đủ: `atk` `def` `heal` `heal_pct` (% max HP) `price` `sell` `min_level`
  `class_req` `weapon_type` `armor_type` `armor_slot` `accessory_type` `soulbound`
  `image_url`. Item tạo xong hiện ngay trong `%info item <id>` và `%info items`
  (cả field/cột mới thêm — lệnh đọc thẳng bảng `items`).
- **Thêm quái/zone**: `%mob create ...`, `%mob zone create ...`
- **Thêm lệnh mới**: tạo file `.js` trong `src/commands/`:
  ```js
  module.exports = {
    name: 'tenlenh',
    aliases: ['alias1'],
    description: 'mô tả',
    async execute(msg, args) { /* ... */ },
  };
  ```
  Bot tự load khi khởi động, đếm trong log `✅ Đã load N lệnh.`
- **Thêm slash command**: thêm định nghĩa vào `src/slash/definitions.js` với
  `handler: simpleHandler('tenlenh', (interaction) => [...args])`

---

## 🧪 Test

```bash
npm test
```

Toàn bộ chạy offline (không cần token, tự tạo SQLite tạm), và chạy tự động trên
mỗi push/PR qua GitHub Actions (`.github/workflows/test.yml`):

| File | Test | Nội dung |
|---|---|---|
| `test/balance.test.js` | 40 | Cân bằng quái/trang bị/bình máu — chặn hồi quy chỉ số |
| `test/lootbox.test.js` | 31 | Hộp quà: admin tạo/sửa, tỉ lệ rơi, mở nhiều hộp |
| `test/market.test.js` | 24 | Chợ người chơi: escrow, thuế, huỷ/hết hạn, lịch sử giá |
| `test/bulk_ops.test.js` | 20 | Phân trang `%inv` (giới hạn 6,000 ký tự) + bán/chế/nhận thưởng hàng loạt |
| `test/market_help.test.js` | 18 | Nút mua ở chợ, bán từ túi + gợi ý giá, `%help <từ khoá>` |
| `test/qol_safety.test.js` | 20 | Xác nhận bán ≥1,000 vàng; phân trang `%pet collection` / `%ach list` / `%help` / kho bang |
| `test/smoke.test.js` | 47 | Chạy mọi lệnh để bắt lỗi dây chuyền |
| `test/gather.test.js` | 23 | Nghề hái lượm: zone, drop, cooldown, chế tác từ nguyên liệu |
| `test/job_tools.test.js` | 23 | Công cụ nghề: thông số riêng từng món, trần bonus, dao bếp / búa thợ |
| `test/job_buffs.test.js` | 20 | Vật phẩm bổ trợ dùng một lần: số lượt, cộng dồn với công cụ, thay thế / song song |
| `test/raid.test.js` | 23 | Boss tuần: chia lượt, sát thương, thưởng theo hạng |
| `test/quests.test.js` | 21 | 4 objective quest mới (gather/craft/job_level/boss) + hook |
| `test/freshness.test.js` | 19 | Nội dung thêm sau phải hiện ngay trong lệnh tra cứu |
| `test/daily.test.js` | 18 | Điểm danh, chuỗi ngày, thưởng |
| `test/docs.test.js` | 18 | README / `.env.example` / `%help` khớp với code thật |
| `test/achievements_jobs.test.js` | 17 | Thành tựu nghề: mốc cấp, mọi nghề, số món đã chế |
| `test/regressions.test.js` | 13 | Khoá bug đã sửa: hồi HP, chống dup khi bán/trade, alias |
| `test/circular.test.js` | 10 | Chống circular require + migrate không bị bỏ qua |
| `test/command_hint.test.js` | 9 | Gợi ý khi gõ sai lệnh |
| `test/dead_content.test.js` | 6 | Mọi item phải có nguồn — chặn "nội dung chết" |
| `test/lore.test.js` | 6 | Mô tả tiếng Việt cho quái/item/zone |

---

## 💡 Ý tưởng nâng cấp

- Cân bằng lại end-game: Ancient/Void Dragon hiện gần như bất khả thi
- Dungeon nhiều tầng có checkpoint
- Season/leaderboard reset định kỳ

### 💾 Backup dữ liệu

- `%adm backup` hoặc `/adm backup`: tạo snapshot ngay, chỉ người trong `ADMIN_IDS` được dùng.
- Tự backup khi khởi động nếu chưa có bản trong 24 giờ, sau đó kiểm tra mỗi giờ.
- Mặc định giữ **7 bản** trong thư mục `backups` cạnh file DB; dùng SQLite Online Backup API để lấy cả dữ liệu đã commit trong WAL khi bot đang chạy.
- Set `BACKUP_CHANNEL_ID` thành ID **kênh riêng** để gửi thêm bản ra Discord. File không bao giờ được trả về kênh đang gõ lệnh.
- Bản local trên cùng volume **không bảo vệ được khi mất/xóa volume**. Kiểm tra file đã tới Discord và tải một bản về nơi an toàn.
- Xem cấu hình, giới hạn gửi file và hướng dẫn khôi phục tại [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md#backup-và-khôi-phục).


### 📖 Chính tuyến — Những người đứng đợi

`%story start` bắt đầu **chương mở đầu + chương 1**; `%story` đọc truyện/mục tiêu,
`%story claim` bàn giao/nhận thưởng và mở bước kế, `%story journal` xem các mốc.
Slash tương ứng: `/story action:…`. Alias prefix: `%cottruyen`.

- 8 bước nối tiếp: trò chuyện → săn Slime → hái lượm → săn sói → giao nanh → chế/nấu → hạ Alpha Wolf → trở về.
- Chỉ bước đang mở nhận tiến độ; không cộng các lần săn/chế trước đó. Mục tiêu giao đồ kiểm tra túi hiện tại và tiêu hao đúng số lượng khi nhận thưởng.
- Người chơi cũ bắt đầu từ đầu chính tuyến, giữ nguyên level/trang bị và mọi zone. Không có thời hạn hay reset ngày.
- Thưởng một lần mỗi bước (tổng 1.120 vàng, 300 XP, 2 bình nhỏ, 2 bình vừa) và kỷ vật soulbound **Dấu Chỉ Người Canh Đèn**, không cộng chỉ số chiến đấu.
- Alpha Wolf là elite hiện có (`elite_wolf`); dùng `%battle elite_wolf` hoặc `%hunt elite_wolf`. Chuẩn bị trang bị/hồi máu, có thể quay lại sau nếu còn yếu.
- Không trao kiếm Thất Đại Tội ngay chương đầu. Chương 2 chưa phát hành; hoàn thành không tự mở nội dung chưa có.

### 🎨 Ngoại hình hồ sơ & công trình bang hội

- `%me cosmetics`: xem 3 màu hồ sơ (1.500–5.000 vàng) và 3 danh hiệu (2.000–25.000 vàng).
- `%me buy <id> confirm`: mua vĩnh viễn, không hoàn vàng; mua trùng không trừ lại.
- `%me equip <id>`: áp dụng miễn phí. Dùng `default_color` / `default_title` để trở về mặc định.
- Slash: `/me action:buy id:jade confirm:True`, `/me action:equip id:jade`. Không chọn action vẫn xem hồ sơ như trước.
- Màu và danh hiệu hiển thị trên `%me`, không phải role Discord, không thay đổi chỉ số.

`%guild building` xem **Đại sảnh**, **Thư viện**, **Tượng đài** (mỗi công trình tối đa 3 cấp).
Mọi thành viên có thể dùng `%guild building contribute <id> <vàng> confirm`,
hoặc `/guild building id:hall amount:1000 confirm:True`.

- Đại sảnh/Thư viện: mỗi cấp lần lượt cần 5.000 / 15.000 / 40.000 vàng. Tượng đài: 10.000 / 30.000 / 80.000.
- Chỉ tiêu vàng cá nhân tự nguyện, tối đa phần còn thiếu của **cấp hiện tại**. Vàng bị hủy, không chuyển vào kho bang để rút lại.
- Công trình hiển thị trên thông tin bang; có nội dung mô tả và cấp diện mạo, **không cộng buff sức mạnh hay thu nhập**. Không có cơ chế sở hữu Kiếm Thất Đại Tội.
- Không hoàn tiền khi rời/giải tán bang. Rời bang không mất ngoại hình đã mua; admin reset nhân vật sẽ xóa ngoại hình cá nhân.

**Thuế chợ đã có sẵn và vẫn là 5%**, chỉ thu khi bán thành công, không đánh thuế lần hai.
Người mua trả đúng giá niêm yết; người bán nhận tổng giá trừ thuế làm tròn lên tới vàng nguyên
(ví dụ bán 1 vàng nhận 0; bán 101 nhận 95). Mua lẻ nhiều lần có thể tốn thuế làm tròn nhiều hơn mua gộp.
`%market tax` xem tổng vàng thuế bị hủy từ khi bật sổ thuế; giao dịch cũ không truy thu.
Mua ngoại hình, góp công trình và ghi thuế được cập nhật trong transaction; giữ lịch sử chi để kiểm tra khi cần.

### 🌐 Dashboard công khai (chỉ đọc)

Web chạy chung service/process với bot bằng `npm start`, bind `0.0.0.0:$PORT`
(mặc định local 3000). `WEB_ENABLED=false` để tắt. Trên Railway, tạo public domain
ở **Settings → Networking → Generate Domain**, target port theo `PORT` Railway cấp.
Không tạo service thứ hai hoặc chia sẻ volume SQLite.

- Tổng quan: số người chơi/bang, tin chợ còn hạn, tổng thuế đã ghi nhận.
- BXH cấp độ, tìm theo tên/Discord ID, hồ sơ công khai với class, trang bị đang mặc, bang và danh hiệu/màu đã chọn (dạng tên).
- Chợ đang mở: tìm theo tên/mã vật phẩm, xem giá/số lượng/người bán. Mua bán vẫn ở Discord.
- Danh sách bang, cấp độ, số thành viên và công trình. Mỗi danh sách phân trang 20 kết quả.
- **Dữ liệu toàn bot**, không phân vùng server. Chỉ bật public domain nếu chấp nhận công khai tên nhân vật, Discord user ID liên kết hồ sơ, class/cấp, trang bị đang mặc, danh sách bang và tin chợ.
- Không công khai túi đồ, vàng cá nhân/kho bang, tiến độ truyện, settings/admin IDs, file DB hay backup. Không có thao tác ghi hoặc đăng nhập/quản trị.
- Dữ liệu cập nhật khi mở trang/chuyển trang/tìm kiếm/bấm Làm mới; không tự polling. Thông tin chợ có thể thay đổi sau khi tải.
- `GET /healthz` kiểm tra HTTP/DB đang mở, **không** xác nhận Discord đang online.
- Có giới hạn API tổng 240 lượt burst, hồi 4 lượt/giây cho cả service; không tin header IP do client tự gửi. Quy mô lớn nên thêm CDN/reverse-proxy rate limit. Trang tĩnh không dùng tài nguyên bên ngoài.

Phát triển local: `npm install`, `npm run web` (không cần token Discord; vẫn mở/seed/migrate DB theo `DB_PATH`, nên dùng DB thử riêng).
Trong production chỉ dùng `npm start`; không chạy thêm `npm run web` song song với bot.

### 💾 Tối ưu & kiểm tra SQLite

Tự bổ sung index phục vụ BXH, tra cứu bang/zone, quest và chợ; cập nhật thống kê
SQLite nhẹ sau migrations. Không tự VACUUM, không xóa lịch sử hay thay đổi cân bằng.
`npm run db:check` kiểm tra DB hiện tại ở chế độ read-only; `npm run db:benchmark`
đo bằng dữ liệu giả lập trong RAM, không đụng DB thật.
Xem [chi tiết tối ưu DB](docs/DB_OPTIMIZATION.md) và lưu ý vận hành trước khi bảo trì.


### ✨ Aura — reroll buff chiến đấu / nghề bằng vàng

`%aura` xem aura và tỷ lệ; `%aura roll confirm` tiêu **2.500 vàng** mỗi lượt.
`%aura accept` thay aura đang dùng bằng ô chờ; `%aura discard` bỏ ô chờ.
`%aura top [effect_id]` xếp hạng % aura đang dùng, lọc ví dụ `%aura top mining_xp`; không phải sức mạnh tổng thể.
Slash: `/aura action:roll confirm:True`, `/aura action:accept`.

- Common 60% (+1–3%), Rare 28% (+4–6%), Epic 10% (+7–9%), Legendary 2% (+10–12%).
- Mỗi lượt chọn đều một trong 16 hiệu ứng (6,25%/loại); 3 giá trị trong mỗi tier chia đều.
- Chỉ một buff, không cộng dồn; tối đa +12%. Không pity/bảo đảm nâng cấp, không hoàn vàng.
- Roll chỉ thay ô chờ. Aura đang dùng giữ nguyên cho tới khi accept; accept sẽ mất aura cũ, kể cả khi kết quả mới yếu hơn.
- Bonus làm tròn xuống trên ATK/DEF cơ bản + trang bị (không sửa chỉ số gốc). Áp dụng hunt, trận PvE/PvP mới và tính sát thương raid; trận đang chạy giữ snapshot cũ.
- 2 giây giữa các lượt roll, không batch roll. Tiến độ lưu qua restart; admin reset nhân vật xóa aura. Vàng chi được ghi cùng transaction vào gold_sink_log.
- Không liên quan tới thần khí hoặc cơ chế sở hữu Kiếm Thất Đại Tội.

### ⛏️ Coal cho đầu game

- `%mine stone_quarry` (Mining Lv.1): **55% rơi 1–2 coal** mỗi lượt, trước bonus công cụ/buff.
- `%mine iron_mine` (Mining Lv.10): **75% rơi 2–3 coal**, thay cho 50% rơi 1–2.
- `%buy coal 10`: mua 10 coal với **25 vàng/món**; bán NPC vẫn **8 vàng/món**.
- Tỷ lệ là mỗi lượt thử, không bảo đảm lượt nào cũng có. Các nguyên liệu khác và nguồn coal từ quái không đổi.
- Migration áp dụng cho DB cũ một lần; giữ các chỉnh sửa admin sau đó.


### 📚 Sổ tay nguồn kiếm & profile card

- `%find coal` / `/find query:coal`: tìm bằng ID hoặc một phần tên (tối đa 80 ký tự).
  Tra shop, quái, khai thác, công thức, hộp quà, quest, thành tựu công khai và thưởng story;
  xem cả công thức dùng vật phẩm làm nguyên liệu. Alias `%handbook`.
- Nguồn đọc trực tiếp DB, không hardcode tỷ lệ cũ. Tỷ lệ trước bonus, không bảo đảm mỗi lượt rơi.
  Đây không phải danh sách mọi cơ chế admin/sự kiện: không công khai redeem code hoặc phần thưởng thành tựu ẩn.
  Kết quả dài trong Discord được rút gọn; xem đầy đủ trong **Sổ tay** trên dashboard.
- `%card` / `/card`: tạo PNG 1000×600 cho chính nhân vật của bạn. Có nền pixel theo class,
  tên, màu/danh hiệu đã mua, level/XP, HP/ATK/DEF, bang hội, pet, Aura đang dùng.
  Chỉ số giống hàm effective stats (chưa cộng bonus pet riêng của PvP), không công khai vàng/túi đồ.
- Ảnh ghép cục bộ bằng `@napi-rs/canvas`, font DejaVu Sans có license trong `assets/fonts`.
  Không gọi AI, tải avatar hoặc cần API key lúc chạy. Cần cho bot quyền Attach Files.
  Tối đa hai lượt dựng ảnh đồng thời mỗi process; gửi lại card để cập nhật dữ liệu.
- Giữ `%me` dạng embed như trước. Card hiển thị hiệu ứng Aura hiện tại; không thêm cơ chế thần khí.

Ảnh minh họa profile card: [xem PNG mẫu](docs/previews/profile-card.png) — dữ liệu nhân vật minh họa, không phải dữ liệu production.


#### Aura mở rộng — 16 hướng build

Mỗi hiệu ứng có tên English riêng, giữ nguyên tỷ lệ tier 60/28/10/2 và giá 2.500 vàng.
Aura cũ ATK/DEF giữ nguyên; không reset active hoặc ô chờ. Vẫn chỉ một hiệu ứng có hiệu lực.

- **Ember Soul**: ATK; **Iron Will**: DEF; **Heartwood**: Max HP.
- **Deep Delver / Tide Scholar / Grove Sage / Forge Scholar / Hearth Scholar**:
  XP lần lượt mining / fishing / foraging / crafting / cooking.
- **Earth Whisper / Ocean Call / Wild Bloom**: nhân tỷ lệ rơi nguyên liệu tương ứng
  mining / fishing / foraging. Ví dụ +12% biến tỷ lệ 50% thành 56%, không phải 62%.
- Bản **Bounty** của ba tên trên: thêm cơ hội nhận +1 nguyên liệu cho mỗi dòng drop đã trúng;
  không tạo nguyên liệu khi trượt, không nhân kho báu, không nhân thêm qua streak/vein.
- **Masterwork**: thêm cơ hội chế tạo không mất nguyên liệu.
- **Golden Feast**: thêm cơ hội nấu ra +1 món.

Extra/save cộng **điểm phần trăm**, chịu trần tổng của công cụ + vật phẩm + Aura:
drop +60%, extra/save 40%. Không có Aura sản lượng nhân trực tiếp.
XP nghề giữ phần lẻ theo từng nghề trong DB, nên +1% vẫn tích lũy được ở đầu game;
chỉ phần bonus đã đủ 1 XP mới được cộng. Không buff XP nhân vật hoặc vàng.

HP được tính từ Max HP gốc theo tỷ lệ, giữ tỷ lệ máu còn lại; DB vẫn lưu HP gốc.
Hunt và trận PvE mới dùng HP hiệu dụng, kết quả quy đổi về HP gốc; trận đang chạy
lưu snapshot Max HP gốc để đổi Aura giữa trận không đổi kết quả. PvP dùng Max HP
hiệu dụng; raid không nhận sát thương nên Aura HP không tăng sát thương raid.
Thuốc/quán trọ vẫn hồi trên HP gốc, tương ứng cùng tỷ lệ HP hiệu dụng. `%me` và card
hiển thị HP hiệu dụng; đổi/nhận Aura không hồi máu gốc.
Tên hiệu ứng xuất hiện trên `%aura`, `%me`, card và hồ sơ web; chưa thêm animation
hay thông báo Legendary tự động để tránh spam. BXH % không so trực tiếp độ mạnh
của các hướng build. Kiếm Thất Đại Tội vẫn chỉ thuộc lore.

#### Aura — nút thao tác & so sánh

`%aura` / `/aura` mở bảng có nút **Roll**, **Accept**, **Discard**, **Làm mới**.
Roll yêu cầu xác nhận trả 2.500 vàng; Accept xác nhận thay Aura đang dùng;
Discard xác nhận bỏ ô chờ. Các xác nhận là tin nhắn riêng (ephemeral), không spam kênh.
Bảng so sánh nêu mức tăng/giảm nếu cùng hiệu ứng; khác hiệu ứng chỉ ghi khác hướng build,
không gán nhãn mạnh hơn chỉ vì % cao hơn. `aura help` vẫn liệt kê đầy đủ hiệu ứng/tier.

Chỉ chủ hồ sơ dùng được nút. Mỗi thay đổi có token trạng thái lưu DB: nút/xác nhận
cũ sau roll/accept/discard sẽ bị từ chối, không trừ vàng hoặc nhận nhầm ô chờ mới.
Làm mới mở lại trạng thái hiện tại. Các lệnh text/slash cũ vẫn dùng được; nhận
trực tiếp bằng `%aura accept` vẫn là một thao tác có chủ ý, không thêm bước bắt buộc.
Không đổi chi phí, tỷ lệ, buff hoặc giới hạn Aura.

### 🛡️ Các dòng trang bị & hỗ trợ đầu game

- **Dawnwatch Lv.1 / Trailwarden Lv.12 / Emberguard Lv.25**: 33 món mới trong các loại
  hiện có (sword/wand/bow, 5 slot giáp, shield/focus/quiver).
  Đây là các dòng song song theo ngân sách chỉ số hiện tại, không phải tier mới,
  không có set bonus hoặc chỉ số ẩn, không thay thế/xóa đồ người chơi đang dùng.
- Dawnwatch có bán shop và chế tạo; Trailwarden/Emberguard chế tạo. Mỗi món có
  recipe/nguồn thực, tra `%find dawnwatch`, `%find trailwarden`, `%find emberguard`.
  Giáp đều là light dùng được cho ba class; vũ khí/tay phụ theo class tương ứng.
- **5 món giáp Dawnwatch tổng 300 vàng**: `dawnwatch_helm` 55, `dawnwatch_coat` 80,
  `dawnwatch_leggings` 55, `dawnwatch_boots` 55, `dawnwatch_gloves` 55.
  Mua bằng `%buy <id>`, rồi `%equip <id>`; không tự động lấy vàng hoặc ghi đè trang bị.
- Chọn class vẫn nhận vũ khí miễn phí và mặc sẵn nếu slot trống. Không thêm buff quái
  hay sửa HP/growth class; trần sức mạnh cùng bậc giữ nguyên.
- Lv.1–5 nhận **3 potion_s một lần** khi start/chọn class. Người chơi cũ Lv.1–5 gõ
  `%start` để nhận nếu chưa nhận. Đổi class/gõ lại không nhân quà; marker không xóa
  khi admin reset nhân vật. Không tặng thêm vàng hoặc đồ cấp cao.
- `%heal` Lv.1–5: 25% giá thường, làm tròn lên và chặn 5–20 vàng; cooldown mặc định
  60 giây. Từ Lv.6 dùng giá/cooldown cũ (10 phút). Admin override cooldown vẫn ưu tiên.
- Chỉ khuyến khích khởi đầu bằng `%hunt slime`, `%story start`, dùng bình máu khi cần;
  `%hunt` auto vẫn giữ nguyên chọn quái để không âm thầm thay đổi trải nghiệm cũ.
