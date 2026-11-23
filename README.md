# 🗡️ Discord RPG Bot — Cày Cuốc

Bot Discord RPG chơi bằng text: nhân vật, class, trang bị nhiều slot, săn quái, nghề, pet, bang hội, PvP, trade, quest và thành tựu.

- **55 lệnh** prefix + **59 slash command** (40 người chơi + 15 admin)
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
| `%daily` / `%daily xem` | Điểm danh chu kỳ 30 ngày — mốc lớn 7/14/21/30 tặng vật phẩm (xem bảng không điểm danh bằng `xem`) |

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

`%story start` bắt đầu **chương mở đầu + chương 1–3**; `%story` đọc truyện/mục tiêu,
`%story claim` bàn giao/nhận thưởng và mở bước kế, `%story journal` xem các mốc.
Slash tương ứng: `/story action:…`. Alias prefix: `%cottruyen`.

- Mở đầu + Chương 1: 8 bước nối tiếp: trò chuyện → săn Slime → hái lượm → săn sói → giao nanh → chế/nấu → hạ Alpha Wolf → trở về.
- Chỉ bước đang mở nhận tiến độ; không cộng các lần săn/chế trước đó. Mục tiêu giao đồ kiểm tra túi hiện tại và tiêu hao đúng số lượng khi nhận thưởng.
- Người chơi cũ bắt đầu từ đầu chính tuyến, giữ nguyên level/trang bị và mọi zone. Không có thời hạn hay reset ngày.
- Thưởng mở đầu + Chương 1 một lần mỗi bước (tổng 1.120 vàng, 300 XP, 2 bình nhỏ, 2 bình vừa) và kỷ vật soulbound **Dấu Chỉ Người Canh Đèn**, không cộng chỉ số chiến đấu.
- Alpha Wolf là elite hiện có (`elite_wolf`); dùng `%battle elite_wolf` hoặc `%hunt elite_wolf`. Chuẩn bị trang bị/hồi máu, có thể quay lại sau nếu còn yếu.
- **Chương 2 — Những lá thư dưới tuyết**: 10 bước tại trạm Bạch Đăng, từ cứu người đưa thư, đọc thư tồn đọng đến kết thúc ca gác và mang tin về thị trấn. Hướng tới Lv.15–18; không khóa zone hay bắt nghề cấp cao.
- Săn `rime_hound`, hái lượm, giao 3 `coal`, chế/nấu và hạ elite `elite_whitepost_keeper` bằng `%battle` hoặc `%hunt`. Nguồn vật liệu tra bằng `%item coal`. Không yêu cầu vật phẩm rơi hiếm.
- Chương 2 thưởng một lần tổng **1.830 vàng, 650 XP, 2 potion_m**, Túi Thư Bạch Đăng (soulbound, bàn giao gần cuối chương) và kỷ vật **Còi Gọi Bình Minh** (soulbound, không tăng chỉ số).
- Người đã hết Chương 1 tự tiếp tục Chương 2 bằng `%story`, không cần reset hoặc nhận lại thưởng cũ. Cả tuyến cá nhân hiện có 28 bước.
- **Chương 3 — Kho Tro không giữ được tên người**: 10 bước, hướng tới Lv.23–25. Điều tra dấu vết bị xóa, gặp người giữ sổ còn sống, bảo vệ chứng cứ và khép tuyến **Những người đứng đợi**.
- Săn `ash_moth`, giao 3 `iron_ore`, chế/nấu và hạ boss `boss_ash_registrar` bằng `%battle` hoặc `%hunt`. Boss có Roar/Rage; không yêu cầu sách hiếm hay sách event. Tra nguyên liệu bằng `%item iron_ore`.
- Chương 3 thưởng một lần tổng **2.180 vàng, 820 XP, 2 potion_m**; Sổ Gốc Kho Tro để bàn giao và kỷ vật **Ấn Người Làm Chứng** đều soulbound, không tăng chỉ số.
- Người đã hết Chương 2 tự tiếp tục Chương 3 bằng `%story`; giữ nguyên tiến độ và kỷ vật cũ. Hoàn thành Chương 3 là việc cá nhân, mọi người đều làm được, không có quyền lợi về nhất.
- **Ranh giới Chương 4:** định hướng một lịch sử duy nhất cho toàn bộ người chơi bot, không tách theo server. Chưa phát hành nội dung, luật đua hay giờ mở; Chương 3 không mở đua, không giữ chỗ và không ghi nhận người quyết định lịch sử.
- Kiếm Thất Đại Tội vẫn chỉ là lore; không có nguồn nhận kiếm ở cả ba chương.

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

### 🔨 Trang bị chế tạo độc quyền & chiến lợi phẩm săn quái

Các dòng mới dưới đây không bán ở shop NPC. “Độc quyền nguồn” chỉ cách tạo món
đồ trong gameplay; người chơi vẫn có thể giao dịch theo cơ chế hiện có, admin vẫn
có công cụ quản trị. Không đổi nguồn của các món cũ, không thêm set bonus/buff ẩn.

**33 món chỉ chế tạo** (mỗi dòng 3 vũ khí theo class, 5 giáp light dùng chung,
shield/focus/quiver):

| Dòng | Cấp mặc | Crafting | Nguyên liệu mỗi món |
| --- | --- | --- | --- |
| Runeforged | 30 | 25 | 4 mithril_ingot + 2 gem_ruby |
| Rimeforged | 40 | 35 | 7 mithril_ingot + 3 dragon_scale |
| Starforged | 45 | 45 | 10 mithril_ingot + 4 dragon_bone |

Tra `%find runeforged_sword` (hoặc wand/bow/helm/coat/leggings/boots/gloves/shield/focus/quiver).
Ví dụ chế tạo: `%craft recipe_runeforged_sword`. Vũ khí ATK 34/48/62;
giáp và tay phụ dùng ngân sách chỉ số cùng bậc hiện tại.

**Dòng Trophy — chỉ rơi qua hunt**, không recipe, không shop NPC:

| ID | Slot / cấp mặc | Quái cần săn | Tỷ lệ mỗi trận thắng |
| --- | --- | --- | --- |
| trophy_cinder_ring | Nhẫn / 25 | ember_phoenix | 6% |
| trophy_obsidian_pendant | Dây chuyền / 25 | obsidian_golem | 5% |
| trophy_abyss_pendant | Dây chuyền / 30 | abyss_leviathan | 8% |
| trophy_glacier_sigil | Đặc biệt / 30 | glacier_wyrm | 5% |
| trophy_void_pendant | Dây chuyền / 40 | void_harbinger | 5% |
| trophy_star_ring | Nhẫn / 45 | star_devourer | 8% |

Ví dụ `%hunt ember_phoenix`, `%find trophy_cinder_ring`. Star Devourer là quái
mạnh trong Astral Ruins, không phải raid boss mới. Tỷ lệ trên là tỷ lệ gốc, không
bảo đảm rơi sau số lượt cố định; modifier drop hiện có vẫn áp dụng. Trang bị nhận
được vẫn cần đủ cấp để mặc. Không có bất kỳ nguồn nhận Kiếm Thất Đại Tội nào.

### ⚖️ Hướng trang bị & xem trước thay đồ

Không chỉ đổi tên: một số dòng/món nay có **đánh đổi công–thủ luôn hiệu lực khi mặc**.
Không có proc ngẫu nhiên, set bonus, buff theo số lượt hay hồi máu mới.

| Trang bị | Điểm hướng mỗi món |
| --- | ---: |
| Runeforged, Starforged | +1 |
| Rimeforged, Emberguard | −1 |
| Berserker Ring (đồ cũ) | +3 |
| Warden Ring (đồ cũ) | −3 |
| Cinder Trophy Ring, Void Trophy Pendant, Star Trophy Ring | +2 |
| Obsidian/Abyss Trophy Pendant, Glacier Trophy Sigil | −2 |
| Các món khác, kể cả Dawnwatch/Trailwarden | 0 (cân bằng) |

Cộng điểm **của từng ô đang mặc**, triệt tiêu điểm trái dấu rồi chặn ở **−6…+6**.
Mỗi điểm tăng 1% ATK và giảm 2% DEF **tổng trang bị**, điểm âm đảo dấu.
Ví dụ +6: +6% ATK/−12% DEF trang bị; −6: −6% ATK/+12% DEF trang bị.
Tính sau nâng cấp, trước hệ số giáp class và Aura; làm tròn một lần mỗi chỉ số,
DEF vẫn chịu trần cũ. Không đổi ATK/DEF gốc của nhân vật, HP, nguồn kiếm, số lượng
đồ sở hữu hoặc chỉ số lưu trong item. Nhẫn trùng tính theo số ô, vẫn chịu trần chung.
Đây là cơ chế mới thay cho việc các dòng cùng bậc hoàn toàn giống nhau; các mục
trước nói “không buff ẩn” vẫn đúng: hướng và công thức được hiện công khai.

- `%info item <id>` / `%inv`: xem hướng của món đồ; `%gear`: xem điểm hướng tổng.
- `%compare <id>`: mô phỏng thay vào ô mà `%equip` sẽ chọn, kể cả ô trống.
- `%compare <id> ring1` hoặc `ring2`: chọn chính xác ô nhẫn muốn thay.
- Hiện món đang mặc, chỉ số nhân vật trước → sau (đã tính nâng cấp/class/Aura),
  cảnh báo thiếu cấp/class/số bản sở hữu, nguồn kiếm, nguyên liệu có/cần/thiếu cho
  một lần chế tạo. Chỉ xem trước, không tự mua, chế tạo hoặc thay đồ.
- `%compare <item1> <item2>` vẫn so hai món theo chỉ số gốc; muốn xem tác động
  thực tế lên nhân vật thì dùng chế độ một món hoặc chỉ định slot.

Trang bị cũ được áp hướng khi tính chỉ số, không cần xóa/nhận lại hay migration
viết đè vật phẩm. Combat nhanh, battle theo lượt, duel và raid dùng chung chỉ số
hiệu lực; trận theo lượt đang diễn ra giữ snapshot như trước. Kiếm Thất Đại Tội
không có hướng mới và vẫn tuyệt đối chỉ ở lore.

### 🏯 Tháp Canh — 15 tầng thử trang bị

`%tower` xem hồ sơ hoặc mở lại trận; `%tower start [tầng]` vào tầng kế / luyện
lại tầng đã mở; `%tower leave` rời trận; `%tower top` xem BXH. Slash `/tower`
có action status/start/leave/top/help và lựa chọn floor 1–15.

- 15 tầng cố định, boss ở tầng 5/10/15; cấp khuyến nghị tăng từ 5 tới 45 (không
  khóa cấp cứng). Đánh theo lượt bằng Attack/Defend/Flee và kỹ năng class.
- Đây là thử thách **HP mô phỏng**: bắt đầu đầy HP, không ghi HP trận về nhân vật,
  không thu phí, không mất vàng khi thua hoặc thoát. Có thể luyện cả khi HP thật
  đang cạn. Class và chỉ số hiệu lực (trang bị/nâng cấp/Aura) chụp lúc bắt đầu;
  thay build chỉ có hiệu lực ở trận mới.
- Lưu tầng cao nhất qua restart; chỉ mở tầng kế tiếp, thua không tụt tầng.
- Mỗi tầng thưởng lần đầu **100 + 40 × tầng vàng**, nhận tự động và chỉ một lần
  trên mỗi tài khoản; đánh lại không thưởng. Không XP, drop, quest kill hay GXP.
- Mốc 5/10/15 có danh hiệu **Người nghe chuông / Người giữ lửa / Người giữ bình
  minh**, chỉ trưng bày trong hồ sơ tower, không buff. BXH ưu tiên tầng cao rồi
  thời gian chạm mốc sớm; không có thưởng BXH để farm.
- Một trận theo lượt tại một thời điểm; `%tower` mở lại bảng đang đánh và vô hiệu
  bảng cũ. Nút chỉ chủ trận dùng được, có kiểm tra vòng chống bấm lặp. Hết hạn sau
  30 phút không thao tác hoặc hòa sau 120 cặp lượt, không thưởng, thử lại miễn phí.
- Quái Tháp không có trong danh sách hunt/battle: không thể lách nguồn thưởng.
  Không thêm bất kỳ cách nhận Kiếm Thất Đại Tội nào. Chương truyện 2 chưa thay đổi.


### 📖 Kỹ năng chiến thuật v2

`%skills` (alias `%skill`) xem chiêu, cấp mở, chi phí và gợi ý combo;
`%skills info <id>` xem chi tiết; `%skills equip <1–4 id>` lưu bộ chiêu theo class;
`%skills reset` trả về mặc định. Có slash `/skills action:… ids:…`.
Mở chiêu tự động, miễn phí, không điểm kỹ năng, không phí đổi build.
Ba chiêu cũ mở từ Lv.1; ba chiêu mới ở Lv.12/25/40. Mặc định lấy tối đa bốn chiêu
đầu đã mở; có thể đổi để chọn các chiêu cấp cao. Loadout lưu riêng từng class.

- **Chiến Binh:** Slash lấy Đà → Whirlwind tiêu Đà; Charge ngắt nhịp;
  Guard Break (12) phá giáp, Iron Guard (25) thủ/lấy Đà, Execute (40) kết liễu.
- **Pháp Sư:** Fireball thiêu đốt theo ATK thay vì 10 sát thương cố định;
  Heal hồi/giải debuff, Freeze ngắt nhịp; Arcane Burst (12) tiêu Burn để tăng
  sát thương, Barrier (25) chống đòn, Meteor (40) tiêu Burn để xuyên giáp.
- **Cung Thủ:** Trap/Volley tạo Dấu săn → Aimed Shot tiêu dấu; Steady Aim (12)
  tăng công/đánh dấu, Evasive Step (25) phòng thủ/thanh tẩy, Piercing Arrow (40)
  xuyên giáp/tiêu dấu. Aimed Shot không còn mặc định 400% ATK.

**Luật lượt mới áp dụng cho battle/tower mới:**

- Đầu trận 60/100 năng lượng, +8 cuối mỗi lượt của mình. Attack/Defend hồi thêm
  18; Slash/Fireball thêm 8. Kỹ năng mạnh tiêu 10–40; không còn spam miễn phí.
- Attack/Defend/Flee luôn có, không chiếm ô loadout. Nút kỹ năng hiện chi phí/CD,
  vô hiệu khi thiếu năng lượng hoặc đang hồi; server vẫn kiểm tra nếu giả nút.
  `%battle resume` mở lại bảng trận đang có sau restart/mất tin nhắn, không reset
  HP, cooldown hay năng lượng.
- CD tính theo lượt của chính người dùng: CD3 nghĩa là phải đi ba lượt khác
  trước khi dùng lại. Mất lượt vì khống chế vẫn giảm CD và hồi 8 năng lượng.
- DoT gây sát thương đầu lượt người mang; chết do DoT không thể ra chiêu/hồi máu.
  Chỉ hiệu ứng của người vừa đi mới giảm thời lượng cuối lượt; không tick cả hai
  phía mỗi hành động nữa. Hiệu ứng mới được thêm sau bước tick.
- Defend tồn tại qua đòn địch, giảm sát thương trực tiếp; không chặn DoT.
  Hiệu ứng trùng tên làm mới, không cộng chồng nhiều bản. Tối đa giảm trực tiếp 60%.
- Hết Choáng/Đóng băng sẽ có một lượt bản thân miễn khống chế tiếp; không khóa
  đối thủ vô hạn bằng cách đổi loại CC. Không thể dùng Heal để bỏ qua lượt bị CC.
- Sát thương trực tiếp dùng chung giảm thương tỷ lệ; chiêu xuyên giáp ghi rõ phần
  DEF bị bỏ. Combo dùng trạng thái thật trong snapshot và tiêu dấu tương ứng.
- Class/loadout/chỉ số chụp lúc bắt đầu, đổi ngoài trận không thêm chiêu vào trận
  đang có. Nút battle mới có token vòng chống bấm lặp; boss hiện hành động dự kiến. Boss v2 Roar ở lượt riêng thứ 3 và Rage
  ở lượt riêng thứ 6, lặp chu kỳ (sửa lỗi nhịp cũ khiến Roar không bao giờ ra).
- Trận cũ lưu trước bản nâng cấp giữ rules v1 và ba chiêu cũ cho tới kết thúc;
  không bị reset hoặc chuyển luật giữa trận. Loadout và năng lượng sống qua restart.

Hunt nhanh, duel mô phỏng và raid tuần giữ cơ chế cũ, **không tự dùng bộ chiêu v2**;
không sửa quái/growth class, không thêm nguồn nhận Kiếm Thất Đại Tội. Chương 2
vẫn chưa triển khai. Xem `%skills info <id>` để lấy hệ số/chi phí chính xác hiện tại.

### 📜 Bí kíp theo cấp & nguồn kiếm kỹ năng

Thêm **15 kỹ năng bí kíp**, nâng tổng lên **33 chiêu (11/class)**. 18 chiêu nền
vẫn tự mở như trước; không thu lại hoặc khóa chiêu đã có. Bộ chiêu vẫn tối đa 4.
Bí kíp là consumable `tome_<skill_id>`, nhưng **không phải bình máu**: dùng một
cuốn để học vĩnh viễn, cần đúng class và đủ cấp. Thiếu cấp/sai class/đã học không
mất sách. Học không tự đổi loadout và chỉ áp dụng từ trận mới. Reset loadout không
xóa chiêu đã học. Sách thường giao dịch được; sách limited soulbound.

| Cấp học | Nguồn | Melee | Magic | Ranged |
| --- | --- | --- | --- | --- |
| 8 | Quest riêng: nhận rồi thắng 5 wolf | riposte_cut | ember_spark | tracking_arrow |
| 18 | Shop, 1800 vàng/cuốn | battle_cry | purifying_light | hunters_breath |
| 30 | Hunt frost_revenant, 6% mỗi sách | blood_rend | frost_lance | barbed_arrow |
| 40 | Ancient Wyrm (boss_wyrm), 8% mỗi sách | sundering_arc | void_pulse | falcon_dive |
| 45 | Sự kiện limited do admin mở | lantern_oath | festival_flare | lantern_volley |

Tỷ lệ là gốc mỗi lần thắng, từng sách roll riêng, không pity. Boss có thể đánh
bằng battle hoặc hunt theo cơ chế hiện có; nhận sách sớm vẫn phải đủ cấp mới học.
Nguồn trong bảng là nguồn hệ thống, admin vẫn có thể tự cấu hình quà/quest/code
bằng công cụ có sẵn. Không tự tạo code hay sự kiện đang mở khi cập nhật.

Ví dụ:
```
%quest accept study_riposte_cut
%hunt wolf
%quest claim study_riposte_cut
%use tome_riposte_cut
%skills equip slash whirlwind charge riposte_cut
%skills info frost_lance
%find tome_frost_lance
```
Quest là custom một lần/tài khoản theo cơ chế quest hiện có. Hãy thắng đủ 5 wolf
sau khi nhận quest. `%skills` hiện khóa do cấp/chưa học và nguồn của từng bí kíp;
`%find tome_<id>` hiện nguồn item và lệnh học.

**Admin limited, theo từng server:**
```
%skills event create denlong_melee lantern_oath 72 100
%skills event create denlong_magic festival_flare 72 100
%skills event create denlong_ranged lantern_volley 72 100
%skills event close denlong_melee
```
Chỉ admin/owner hoặc ADMIN_IDS mới quản lý; tạo ID mới (chữ/số/_/-, tối đa 40 ký
 tự), chọn một chiêu limited, 1–720 giờ, 1–100000 suất. Thời gian tính từ lúc tạo.
Không dùng lại ID đã đóng/hết hạn để reset log. Mỗi tài khoản nhận một lần mỗi sự
kiện, đúng class, có thể giữ sách tới đủ cấp. Đã học thì không chiếm thêm suất.
Không mở sự kiện cho chiêu nền, không lách nhận từ server khác. Không phí nhận.

Người chơi: `%skills events` xem thời hạn/số suất, `%skills claim <event_id>` nhận;
slash `/skills action:events` hoặc `action:claim ids:<event_id>` cũng dùng được.
Hết hạn chỉ chặn **nhận mới**, không thu hồi sách đã nhận hoặc chiêu đã học.
Limited là lựa chọn tình huống, không buff ẩn hay cộng chỉ số ngoài trận; không
cần chiêu limited để hoàn thành Tháp. Không thêm cách nhận Kiếm Thất Đại Tội.

### 🛠️ Cấp dùng đồ nghề

Công cụ và vật phẩm buff nghề nay dùng **cấp nghề tương ứng**, không dùng cấp
nhân vật: cuốc → Mining, cần câu → Fishing, giỏ → Foraging, dao/gia vị → Cooking,
búa/dầu tôi → Crafting. Ví dụ Copper Pickaxe cần **Mining Lv.6**, nhân vật Lv.1
vẫn dùng được nếu Mining đủ cấp; nhân vật Lv.99 nhưng Mining Lv.1 vẫn dùng cuốc
khởi đầu. Không cần equip, tự chọn công cụ đủ cấp tốt nhất trong túi.

Mốc yêu cầu, giá, chỉ số và đồ sở hữu giữ nguyên; không reset cấp/XP nghề.
`%job`, `%shop`, `%inv`, `%info item` và thông báo khóa công cụ hiển thị cấp nghề.
Trang bị chiến đấu/bí kíp kỹ năng vẫn dùng cấp nhân vật, không đổi theo nghề.
Buff đã bật theo luật cấp nhân vật cũ mà nghề chưa đủ cấp được tạm ngưng bonus,
không mất số lượt còn lại; tự hiệu lực lại khi nghề đủ cấp.

### Ảnh khu vực nghề thu thập

Kết quả `%mine`, `%fish`, `%gather` đính kèm ảnh pixel art đúng khu đang làm
(5 khu mặc định mỗi nghề, tổng 15 ảnh). Tự chọn khu và nút Again dùng cùng
luồng phản hồi, bao gồm ảnh. Ảnh PNG đóng gói trong `assets/mining`,
`assets/fishing`, `assets/foraging`, mỗi ảnh dưới 1 MiB, không cần URL ngoài.
Danh sách khu và thông báo lỗi/cooldown không gửi ảnh để tránh tải thừa.
Khu admin tự tạo chưa có ảnh vẫn trả kết quả bình thường; catalog ánh xạ
được khai báo trong `src/game/gather_art.js`, không suy đường dẫn từ input.

### 🌦️ Thời tiết toàn thế giới & vật sưu tầm hiếm

- `%weather` (alias `%thoitiet`) / `/weather args:...`: xem thời tiết và đồng hồ chung toàn bot, không theo server.
- Mặc định bốc đều một trong trời quang/mưa/giông/sương/tuyết mỗi **30 phút**, có thể trùng. Trạng thái/lần bốc tiếp lưu SQLite, restart không tự reroll. Nếu offline quá kỳ, bốc một lần khi trở lại, không phát lại hàng loạt bản tin cũ.
- Ngày **06:00–18:00** theo **UTC+7 Việt Nam**, còn lại là đêm. Đồng hồ vẫn chạy liên tục sau khi admin chỉnh, không phải ngày/đêm random.
- Admin bot trong `ADMIN_IDS`: `%weather interval 30` đổi chu kỳ (1–1440 phút); `%weather time 21:30` đặt giờ hiện tại bằng offset so với UTC+7; `%weather time reset` về giờ Việt Nam; `%weather dayhours 6 18` đổi khung ngày (giờ nguyên, đầu < cuối). Cấu hình này ảnh hưởng tất cả server; admin server không tự chỉnh được.
- Admin server có Manage Server/Administrator: `%weather channel #kenh` đăng ký kênh của server đó; `%weather channel off` tắt. Bot cần View Channel + Send Messages. Mỗi server một kênh nhận cùng điều kiện thế giới. Bản tin kiểm tra mỗi 30 giây, gửi lúc đăng ký, bốc thời tiết (kể cả lặp) hoặc đổi buổi; không ping mọi người. Kênh lỗi được retry ở lượt poll tiếp, không chặn các server khác.
- `%weather rares`: 10 cây/cá hiếm, mỗi zone gather/fish mặc định có một loại. Tỷ lệ **0,3–0,8%** mỗi lượt hợp lệ, chỉ khi đúng **zone + thời tiết + ngày/đêm**; ngoài điều kiện = **0%**. Tra `%item <id>` cũng hiện nguồn và điều kiện.
- Roll riêng sau drop thường, có thể trúng dù lượt thường không có đồ. Mỗi lần trúng **1 món**, không chịu tool, buff, aura, streak, vein hay extra-drop; không tiêu lượt roll khi lệnh bị khóa/cooldown. Không áp dụng mine.
- Đây là material sưu tầm epic, tradable, bán NPC 90–400 vàng, chưa có recipe hay bonus chiến đấu. Không đưa vào shop/drop thường/lootbox, không thay tỷ lệ vật liệu hiện có.
- Bản tin dùng delivery best-effort: lưu khóa sau khi Discord gửi thành công để tránh gửi lại khi restart; nếu process chết giữa gửi và ghi nhận có thể lặp một bản tin. Chỉ chạy một bot scheduler với cùng DB, không hỗ trợ nhiều replica gửi thông báo đồng thời.

### 📚 Bộ sưu tập Fish & Gather

- `%collection` / `%collection fish [trang]` / `%collection gather [trang]` (alias `%bosuutap`, slash `/collection kind:fish page:1`): xem danh mục thường và hiếm, dấu đã nhận/chưa nhận, khu nguồn, điều kiện hiếm và số loại đã sưu tập. Mỗi trang 8 món.
- Ghi nhận **đã từng nhận từ bất kỳ nguồn nào**, kể cả mua/chợ/trao đổi/quà, không phải chứng nhận tự câu/hái. Bán, giao dịch đi hoặc dùng hết vẫn giữ dấu. Không cộng số lượng hay ghi lại lần đầu khi nhận trùng.
- 10 thành tựu `first_<item_id>` cho 10 cây/cá hiếm theo thời tiết, mỗi cái **15 điểm thành tựu**, không thưởng vàng/XP/vật phẩm để tránh ảnh hưởng kinh tế. Hiện trong `%ach`; khi tự câu/hái lần đầu có dòng thông báo tại kết quả và dùng kênh achievement hiện có nếu cấu hình.
- Khi nâng cấp, backfill một lần từ inventory hiện còn của người chơi. Không thể suy ra những món đã bán/dùng hết trước khi có hệ thống này. Ngày backfill là ngày ghi nhận, không phải ngày thu thập thực tế.
- Reset nhân vật xóa dấu sưu tập và các thành tựu first-item mới. Chỉ track material thuộc nguồn Gather/Fish và các rare thời tiết, không đổi drop, thời tiết hay quy tắc nguồn trang bị/kiếm.

### 📅 Daily 30 ngày

- Giữ nguyên phần thưởng ngày 1–7. Ngày 8–29 lặp nhịp thưởng tuần cũ, riêng mốc 14/21 và ngày 30 tăng thưởng. Ngày 28 vẫn giữ quà trọn tuần.
- Mốc **14**: vàng bằng 8 lần vàng/kill tham chiếu, XP ×2, **2** vật phẩm hồi phục theo bậc level.
- Mốc **21**: vàng ×10, XP ×2,5, **3** vật phẩm hồi phục.
- Mốc **30**: vàng ×12, XP ×3, **5** vật phẩm hồi phục. Đây là toàn bộ thưởng của ngày mốc, không cộng thêm một lần thưởng ngày thường.
- Vật phẩm theo cấp lúc nhận: Lv.1–10 potion_m, Lv.11–25 potion_l, cao hơn food_seafood_platter; không tặng sách hiếm, hộp sự kiện hay trang bị độc quyền.
- Sau ngày 30, phần thưởng quay lại ngày 1 nhưng streak/total/best không reset. Mỗi chu kỳ đều có các mốc này. Ngày lẻ trong chu kỳ hồi đầy HP nếu đang thiếu.
- Vẫn chờ 24h/lượt; từ lần nhận gần nhất tới đủ 44h thì đứt chuỗi, lượt tới về ngày 1. `%daily xem` xem đủ 30 ngày, không tiêu lượt.
- Không reset dữ liệu khi nâng cấp: ngày tiếp theo tính từ streak hiện tại modulo 30. Không phát bù các mốc đã vượt trước cập nhật. Thưởng và tiến độ lưu trong cùng transaction.

### Bộ sưu tập & bộ chiêu nhanh

- `%collection fish [trang] [all/missing/owned/rare]` và `%collection gather ...`: nút trang trước/sau, lọc Tất cả / Chưa có / Đã có / Hiếm; chỉ chủ sổ điều khiển được. Khi bấm, đọc tiến độ mới nhất. `/collection` có thêm tùy chọn `filter`. Sổ trống vẫn chuyển bộ lọc được.
- Mốc **5/5 cá hiếm**: 50 điểm thành tựu + danh hiệu **Người Đọc Sóng**; **5/5 cây hiếm**: 50 điểm + **Người Nghe Rừng**; **10/10**: 100 điểm + **Kẻ Theo Dấu Thiên Nhiên**. Không thưởng vàng/XP/stats hay nguồn vật phẩm mới. Mỗi thành tựu một lần, tính theo dấu đã từng nhận, không đòi giữ trong túi. Backfill người đã đủ mốc một lần khi nâng cấp.
- Chọn danh hiệu đã mở bằng `%collection title fish`, `%collection title gather`, `%collection title all`. Hiện ở `%ach`, bảng điểm thành tựu và trường danh hiệu thành tựu trên `%me`; không thay danh hiệu ngoại hình đã mua.
- Bản tin thời tiết và `%weather` thêm **Đang có thể tìm**: tên cây/cá phù hợp với thời tiết + buổi hiện tại, tỷ lệ và lệnh đi tìm. Đây không phải bảo đảm nhận được; vẫn cần đủ cấp/dụng cụ. Nếu không có điều kiện phù hợp thì thông báo rõ.

Lưu bộ chiêu nhanh (tối đa **3 tên mỗi class**, không mất phí):
```text
%skills equip slash whirlwind charge guard_break
%skills save boss
%skills presets
%skills load boss
%skills delete boss
```
Tên 1–20 ký tự a-z/0-9/_/-. `save` lưu bộ đang trang bị, trùng tên thì ghi đè; `load` kiểm tra lại toàn bộ cấp/class/chiêu đã học, không tự bỏ chiêu chưa hợp lệ. Có thể đặt tên `boss`, `tower`, `combo` hoặc tên khác. Bộ lưu độc lập theo người và class, tồn tại qua restart. `/skills action:save/load/delete ids:boss` và `action:presets` tương ứng.

Trong trận theo lượt đang active (PvE/Tháp/PvP ở bất kỳ phía nào), chặn save/load/delete và equip/reset; cần kết thúc trận trước. Không viết lại snapshot trận đã bắt đầu. Chỉ hỗ trợ battle/tower như bộ kỹ năng hiện hành, không đổi cơ chế hunt nhanh/duel/raid tuần. Reset nhân vật xóa cả các preset/bộ trang bị kỹ năng đã lưu. Chưa mở nội dung Chương 4.

### 🌍 Nền móng Chương 4 — chưa mở đua

- `%worldstory` (alias `%lichsu`, `%worldlore`) / `/worldstory args:status`: trạng thái chung toàn bot và điều kiện đã hoàn tất Chương 3; không cấp quyền ưu tiên do hoàn thành sớm.
- `%worldstory rules`: khung luật; `%worldstory history [trang]`: bia lịch sử bất biến, mỗi trang một biến cố, snapshot tên/ID người thắng, giờ về đích, giờ quyết định, lựa chọn và hậu quả. Reset nhân vật không xóa lịch sử hoặc chuyển quyền.
- **Không có nội dung Chương 4 được phát hành**, không có lịch seed, nhiệm vụ, người thắng, drop hay kết cục mẫu trong DB thật. Catalog `ready:false` khóa cả API lẫn lệnh lập lịch. Không nối sự kiện hunt/gather/craft vào cuộc đua ở bản này.
- Khung kỹ thuật cho lần phát hành sau: admin bot trong `ADMIN_IDS` có thể lập lịch nội dung đã publish bằng `%worldstory schedule chapter4 YYYY-MM-DDTHH:mm:ssZ`, báo trước tối thiểu **24 giờ thật UTC**. Hiện lệnh này luôn từ chối chapter4 vì nội dung chưa ready. Giờ/thời tiết trong game không ảnh hưởng lịch.
- Khi có chương đã publish và đến giờ mở, `%worldstory join` dành cho người đã hết Chương 3. Chỉ server hook tin cậy mới ghi tiến độ theo thứ tự bước, dedup bằng ID hành động ổn định; không có lệnh nhập tiến độ hoặc chỉ định người thắng.
- Giao dịch cuối chốt đúng một người về đích trước khi họ chọn kết cục. `%worldstory choose <id>` chỉ người thắng được dùng; chọn một hướng thiết kế sẵn, lưu đúng một lần cùng bia lịch sử trong một transaction. Không có reset/override lựa chọn qua lệnh admin.
- SQLite `BEGIN IMMEDIATE` bảo vệ tranh quyền trên **cùng một DB**. Cần một backend chung; không thể tạo lịch sử toàn bot bằng các replica dùng DB rời. Nếu shard/mở rộng phải thiết kế hạ tầng DB chung trước.
- Chưa triển khai tự chuyển quyền nếu người thắng vắng mặt, thông báo cuộc đua đa server, nhiệm vụ hậu quả cho người đến sau hay nội dung/chính sách vận hành chính thức. Phải chốt và kiểm thử các phần này trước khi publish. Xem `docs/WORLD_STORY_DIRECTION.md`. Kiếm Thất Đại Tội vẫn chỉ lore, không mở nguồn sở hữu.

### Admin đặt cấp nghề

```text
%adm player setjoblevel @user mining 50
%admin setjoblevel @user fishing 25
/adm setjoblevel user:@user job:foraging level:35
```

Hỗ trợ `mining`, `fishing`, `foraging`, `cooking`, `crafting`, số nguyên **1–100**; có thể tăng hoặc hạ cấp. XP nghề đặt về **0**, giữ nguyên cooldown, các nghề khác và dữ liệu nhân vật (không dùng công thức setlevel chiến đấu). Quyền giống admin người chơi hiện có: ADMIN_IDS, chủ server hoặc Administrator. Có alias `%admin joblevel`.

Thành tựu được kiểm tra như khi lên cấp nghề bình thường, thưởng thành tựu chỉ cấp một lần (có thể có vàng/XP nhân vật theo cấu hình thành tựu). Hạ cấp không thu hồi thành tựu/thưởng đã nhận; điều kiện công cụ/buff/khu nghề tự áp dụng theo cấp mới, buff không đủ cấp được pause theo cơ chế hiện có. Chưa có cuộc đua Chương 4 được mở bởi thao tác này.

### 🎰 Casino — chip giải trí tách biệt RPG

`%casino help` (alias `%songbac`), slash `/casino args:...`. Không mua chip,
không chuyển chip trực tiếp, không đổi sang vàng/XP/vật phẩm/tiền thật.

- `%casino daily`: 1.000 chip miễn phí mỗi 24h, `%casino balance` xem ví.
- `%casino slot 10`: 3 ô, mỗi ô 6 biểu tượng đều xác suất. Bộ ba trả tổng 10×,
  đúng một đôi hoàn 1×, còn lại mất cược; RTP lý thuyết 69,44%.
- `%casino blackjack 20`: bộ bài riêng 52 lá; `%casino hit <id>` rút,
  `%casino stand <id>` dừng. A=1/11, J/Q/K=10, nhà cái dừng cả soft17.
  Blackjack tự nhiên trả tổng 2,5×, thắng thường 2×, hòa hoàn cược.
  Không split/double/insurance. Hết 5 phút cố định từ lúc chia: xử thua.
- `%casino dice @user 50` / `%casino rps @user 50`: giữ chip chủ kèo;
  đối thủ `%casino accept <id>` sẽ giữ cùng tiền cược. Dice tung ngay hai
  xúc xắc 1–6. RPS mỗi người **DM bot** `%casino pick <id> rock|paper|scissors`,
  chọn một lần không sửa; kết quả mới công khai hai lựa chọn. Không nhận pick
  tại server. Nếu DM bot bị chặn, không nhận kèo RPS cho đến khi mở được DM.
- `%casino status [id]`: xem lại ván của mình (bỏ ID lấy ván gần nhất, kể cả
  khi phản hồi Discord trước đó bị mất); pending có thể `%casino cancel <id>`
  bởi chủ kèo, hoặc `%casino decline <id>` bởi người được mời; cả hai hoàn chủ kèo.
- Kèo chờ hết 5 phút hoàn chip. RPS hết 5 phút sau nhận: chỉ một người chọn thì
  người đó thắng; cả hai chưa chọn hoàn cả hai. PvP không phí, thắng nhận cả quỹ
  2×, hòa hoàn từng người. Không thể hủy sau khi đối thủ nhận.

Cược nguyên 10–500 chip (blackjack số chẵn); một kèo/ván mở mỗi tài khoản toàn
bot, kể cả người mới được mời. RNG dùng node:crypto; tiền cược/hoàn/thanh toán
cùng giao dịch SQLite IMMEDIATE, status done chặn nhận thưởng hai lần. Mã
yêu cầu Discord được lưu receipt cùng transaction để delivery lặp không quay/trừ lại. Ví và
ván lưu DB, độc lập nhân vật và reset RPG để không farm lại trợ cấp hoặc mất
quỹ của đối thủ. Hết hạn được đối soát **khi có lệnh casino tiếp theo**, không
cần timer tồn tại qua restart. Không có broadcast chủ động: dùng status xem kết quả.
Nếu Discord gửi phản hồi thất bại sau commit, ván vẫn lưu, không thử nhận thưởng
lại. Chip PvP vẫn có thể bị chuyển gián tiếp bằng cố tình thua: không có giá trị
RPG, chưa có bảng xếp hạng hoặc phần thưởng để tránh khuyến khích farm alt.
