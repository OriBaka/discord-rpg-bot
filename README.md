# 🗡️ Discord RPG Bot — Cày Cuốc

Bot Discord RPG đơn giản, chơi bằng text. Có level, trang bị, túi đồ, shop, đánh quái và bảng xếp hạng.

## ✨ Tính năng

- 📜 Tạo nhân vật, lên cấp, cộng chỉ số
- ⚔️ Hệ thống chiến đấu theo lượt (mô phỏng)
- 🎒 Túi đồ + trang bị vũ khí/giáp
- 🏪 Shop mua bán
- 🧪 Bình máu hồi HP
- 🏨 Quán trọ (heal bằng vàng)
- 🎁 Điểm danh daily
- 🏆 Bảng xếp hạng

## 📦 Cấu trúc

```
discord-rpg-bot/
├── src/
│   ├── index.js            # Entry point
│   ├── db/database.js      # SQLite + schema
│   ├── game/
│   │   ├── items.js        # Danh sách item
│   │   ├── monsters.js     # Danh sách quái
│   │   ├── player.js       # Logic người chơi
│   │   └── combat.js       # Logic chiến đấu
│   └── commands/           # Mỗi file = 1 lệnh
├── data/                   # SQLite db (tự tạo)
├── .env.example
└── package.json
```

## 🚀 Cài đặt

### 1. Tạo bot trên Discord
1. Vào https://discord.com/developers/applications → **New Application**
2. Tab **Bot** → **Add Bot** → copy **TOKEN**
3. Bật **MESSAGE CONTENT INTENT** (rất quan trọng!)
4. Tab **OAuth2 → URL Generator**: chọn scope `bot`, permissions `Send Messages` + `Embed Links` + `Read Message History` → mở link mời bot vào server của bạn

### 2. Chạy bot trên máy

```bash
cd discord-rpg-bot
cp .env.example .env
# sửa .env, dán DISCORD_TOKEN vào
npm install
npm start
```

Yêu cầu: **Node.js ≥ 18**.

### 3. Chạy trên điện thoại (Android)
Vì bạn dùng điện thoại, gợi ý dễ nhất:

- **Termux** (Android): cài `pkg install nodejs git`, clone code, `npm install`, `npm start`. Bot chạy khi Termux mở.
- **Cloud free**: deploy lên **Railway.app** (500h free/tháng) hoặc **Fly.io**. Push code lên GitHub rồi connect là xong, bot chạy 24/7.

## 🎮 Lệnh

| Lệnh | Mô tả |
|---|---|
| `!start` | Tạo nhân vật mới |
| `!me` | Xem hồ sơ |
| `!inv` | Xem túi đồ |
| `!hunt` | Đi săn quái (CD 30s) |
| `!heal` | Nghỉ quán trọ hồi HP |
| `!use <id>` | Dùng bình máu |
| `!equip <id>` | Trang bị vũ khí/giáp |
| `!shop` | Xem cửa hàng |
| `!buy <id> [qty]` | Mua đồ |
| `!sell <id> [qty]` | Bán đồ |
| `!daily` | Điểm danh nhận vàng |
| `!top` | Bảng xếp hạng |
| `!help` | Hướng dẫn |

## 🔧 Mở rộng

- **Thêm item**: chỉnh `src/game/items.js`
- **Thêm quái**: chỉnh `src/game/monsters.js`
- **Thêm lệnh mới**: tạo file `.js` trong `src/commands/` theo mẫu:
  ```js
  module.exports = {
    name: 'tenlenh',
    aliases: ['alias1'],
    description: 'mô tả',
    async execute(msg, args) { /* ... */ },
  };
  ```
  Bot tự load khi khởi động.

## 💡 Ý tưởng nâng cấp

- Hệ thống **class** (Chiến binh / Pháp sư / Cung thủ) với skill riêng
- **Dungeon** nhiều tầng, boss cuối
- **Quest** hằng ngày
- **PvP** giữa người chơi
- **Craft** đồ từ nguyên liệu
- Slash command (`/me`, `/hunt`...) thay cho prefix
