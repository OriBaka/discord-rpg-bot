# 🗡️ Discord RPG Bot — Cày Cuốc

Bot Discord RPG chơi bằng text: nhân vật, class, trang bị nhiều slot, săn quái, nghề, pet, bang hội, PvP, trade, quest và thành tựu.

- **40 lệnh** prefix + **44 slash command** (29 người chơi + 15 admin)
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
| 🛠️ Nghề & chế tạo | Mining, fishing, cooking, crafting + 21 recipe |
| 🐾 Pet | 13 pet, drop trực tiếp hoặc ghép từ mảnh, cộng chỉ số khi đi theo |
| 🏰 Bang hội | Tạo bang, mời thành viên, kho chung, buff vàng/XP/drop, BXH bang |
| ⚔️ PvP & Trade | Duel có cược vàng + rating; trade item/vàng 2 chiều có bước xác nhận |
| 📜 Quest & Thành tựu | Quest daily tự sinh, quest custom (admin), 25 thành tựu có điểm và title |
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
│   ├── game/                 # 30 module logic dùng chung
│   │   ├── player.js         # Player, XP, inventory
│   │   ├── combat.js         # Mô phỏng trận nhanh (hunt)
│   │   ├── battle.js         # Turn-based engine (battle)
│   │   ├── classes.js        # Class + skill
│   │   ├── slots.js          # 11 slot trang bị
│   │   ├── items.js / monsters.js / tiers.js
│   │   ├── pets.js / guilds.js / quests.js / achievements.js
│   │   ├── pvp.js / trade.js / jobs.js / recipes.js
│   │   └── gather_zones.js / lootbox.js / redeem.js / settings.js / images.js
│   ├── commands/             # 37 file → 40 lệnh (nhiều lệnh/file)
│   └── slash/
│       ├── definitions.js    # 29 slash command người chơi
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
npm test        # 70 test: hồi quy + smoke toàn bộ lệnh + circular require
```

### 3. Deploy 24/7

Xem **[DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)** — hướng dẫn từng bước, làm được trên điện thoại.
Trên Railway nhớ set `DB_PATH=/data/rpg.db` **và mount volume** `/data`, nếu không sẽ mất dữ liệu mỗi lần deploy.

---

## 🎮 Lệnh

Prefix mặc định `!`. Mọi lệnh đều có slash tương ứng (trừ vài lệnh admin chỉ có prefix).

### Nhân vật & trang bị

| Lệnh | Mô tả |
|---|---|
| `!start` | Tạo nhân vật mới |
| `!me [@user]` | Xem hồ sơ: level, HP, chỉ số, vàng |
| `!inv [filter]` | Xem túi đồ, lọc theo loại (vd `!inv weapon`, `!inv ring`) |
| `!gear [@user]` | Xem trang bị đang mặc + tổng bonus |
| `!equip <id> [slot]` | Mặc đồ (tự chọn slot, hoặc chỉ định ring2, offhand…) |
| `!unequip <slot\|all>` | Tháo trang bị |
| `!compare <id1> [id2]` | So sánh 2 món, hoặc so với món đang mặc cùng slot |
| `!class` | Xem class hiện tại, `!class pick/switch/unlock <id>` |
| `!top` | BXH level, `!top guild` BXH bang |

### Chiến đấu

| Lệnh | Mô tả |
|---|---|
| `!hunt` | Săn tự động theo level (alias: `!san`, `!fight`, `!atk`) |
| `!hunt list` | Xem các khu vực |
| `!hunt <zone>` | Săn ở khu vực cụ thể |
| `!hunt <mob_id>` | Săn quái chỉ định |
| `!battle list` | Danh sách elite/boss (alias: `!bt`, `!turnbattle`) |
| `!battle <mob_id>` | Vào trận turn-based có nút bấm + skill |
| `!heal` | Nghỉ quán trọ hồi đầy HP (tốn vàng, cooldown 10 phút) |
| `!use <id> [qty]` | Dùng bình máu / mở lootbox |
| `!daily` | Điểm danh nhận vàng + hồi máu |

### Kinh tế & chế tạo

| Lệnh | Mô tả |
|---|---|
| `!shop` | Xem cửa hàng |
| `!buy <id> [qty]` / `!sell <id> [qty]` | Mua / bán (không bán được món đang mặc) |
| `!mine [zone]` | Đào mỏ (alias: `!dao`) |
| `!fish [zone]` | Câu cá (alias: `!cau`) |
| `!craft list` / `!craft <id>` | Chế tạo |
| `!cook list` / `!cook <id>` | Nấu ăn |
| `!job [@user]` | Xem level các nghề, `!job top <type>` |

### Xã hội

| Lệnh | Mô tả |
|---|---|
| `!guild` | Bang hội: `create`, `invite`, `vault`, `deposit`, `withdraw`, `buff`, `top` |
| `!duel @user [gold]` | PvP có cược, `!duel accept/decline/top` |
| `!trade @user` | Mở phiên trade, `!trade add/remove/ready/confirm` |
| `!pet` | Pet: `active`, `shards`, `combine`, `collection` |
| `!redeem <code>` | Nhập code nhận thưởng |

### Tra cứu & tiến trình

| Lệnh | Mô tả |
|---|---|
| `!info item/mob/zone <id>` | Chi tiết item / quái / khu vực |
| `!quest` | Quest hằng ngày, `!quest claim <id>` nhận thưởng |
| `!ach [@user]` | Thành tựu, `!ach list`, `!ach top` |
| `!help` | Danh sách lệnh |

### Admin

Lệnh admin yêu cầu user ID nằm trong `ADMIN_IDS`, hoặc là chủ server, hoặc có quyền Administrator.

| Lệnh | Mô tả |
|---|---|
| `!admin help` | Cộng/trừ vàng, XP, set level, xem thống kê server |
| `!item help` | Tạo/sửa/xoá item, gán ảnh |
| `!mob help` | Tạo/sửa quái & zone, thêm drop |
| `!shop add/remove/setprice` | Chỉnh cửa hàng |
| `!quest admin` / `!ach admin` / `!pet admin` | Tạo/sửa quest, thành tựu, pet & drop |
| `!craft admin` / `!cook admin` | Tạo/sửa recipe |
| `!gatherzone` (`!gz`) | Quản lý zone mining/fishing |
| `!lootbox` | Quản lý nội dung lootbox |
| `!redeem` | Tạo/quản lý code |
| `!setimage <type> <id> <url>` | Gán ảnh cho item/quái/zone/pet/thành tựu |
| `!slashadmin` (`!sla`) | Deploy/clear slash command |
| `!petrestore` | Khôi phục pet bị thiếu (dùng một lần khi nâng cấp) |
| `!achdebug <ach_id> [@user]` | Debug: xem/gán tiến độ một thành tựu |

---

## 🔧 Mở rộng

- **Thêm item**: `!item create ...` (admin) — không cần sửa code
- **Thêm quái/zone**: `!mob create ...`, `!mob zone create ...`
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

Ba bộ test, tất cả chạy offline (không cần token, dùng SQLite tạm):

| File | Nội dung |
|---|---|
| `test/regressions.test.js` | 13 test khoá các bug đã sửa: hồi HP, chống dup khi bán/trade, alias |
| `test/smoke.test.js` | 47 test chạy mọi lệnh để bắt lỗi dây chuyền |
| `test/circular.test.js` | 10 test chống circular require + kiểm tra migrate không bị bỏ qua |

---

## 💡 Ý tưởng nâng cấp

- Cân bằng lại end-game: Ancient/Void Dragon hiện gần như bất khả thi
- Dungeon nhiều tầng có checkpoint
- Chợ người chơi với nhau (auction house)
- Season/leaderboard reset định kỳ
