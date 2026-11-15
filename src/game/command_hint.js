// Gợi ý khi người chơi gõ một lệnh KHÔNG tồn tại.
//
// Bối cảnh thật: bot im lặng tuyệt đối với lệnh lạ (`if (!cmd) return`), nên khi
// một lệnh mới chưa được deploy — hoặc người chơi gõ sai một chữ — họ không có
// cách nào biết chuyện gì xảy ra. Người dùng thật đã báo "gõ trong Discord không
// ra lệnh" và tưởng bot hỏng, trong khi thực ra chỉ là code cũ chưa có lệnh đó.
//
// Nguyên tắc:
//   • Chỉ trả lời khi CÓ THỂ hữu ích → không spam mỗi tin nhắn chat bắt đầu bằng
//     dấu prefix.
//   • Rate-limit theo người dùng: gõ sai liên tục chỉ bị nhắc 1 lần / 30 giây.
//   • Nếu gõ gần đúng (1-2 ký tự lệch) thì gợi ý đúng lệnh, thay vì bắt tự mò.
const RATE_LIMIT_MS = 30_000;

// Tên lệnh chỉ gồm chữ/số/gạch — loại các chuỗi kiểu "%%%", "!!", emoji... để
// không nhắc người ta về những thứ hiển nhiên không phải lệnh.
function looksLikeCommand(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]{2,32}$/.test(name);
}

// Khoảng cách Levenshtein giới hạn: đủ để bắt lỗi gõ (gather ↔ gathe, hunt ↔
// hun), không cần tối ưu vì danh sách lệnh ~44 chuỗi ngắn.
function distance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Trả về tên lệnh gần nhất nếu đủ giống, ngược lại null.
// Ngưỡng: 1 ký tự lệch với tên ≤ 5 ký tự, 2 ký tự lệch với tên dài hơn —
// tránh kiểu gõ "info" bị gợi ý "mob".
function closestCommand(name, names) {
  const target = String(name || '').toLowerCase();
  if (!target) return null;
  let best = null;
  let bestD = Infinity;
  for (const candidate of names) {
    const d = distance(target, candidate);
    if (d < bestD) { bestD = d; best = candidate; }
  }
  const limit = target.length <= 5 ? 1 : 2;
  return bestD <= limit ? best : null;
}

// Nội dung trả lời (tách riêng để test được mà không cần Discord client).
function unknownCommandText(name, prefix, suggestion) {
  if (suggestion) {
    return `❌ Không có lệnh \`${prefix}${name}\`. Có phải bạn muốn \`${prefix}${suggestion}\`?\n` +
      `💡 Gõ \`${prefix}help\` để xem tất cả lệnh.`;
  }
  return `❌ Không có lệnh \`${prefix}${name}\`.\n` +
    `💡 Gõ \`${prefix}help\` để xem tất cả lệnh.`;
}

// Rate-limit theo user. Tách khỏi index.js để test được.
function createRateLimiter(now = () => Date.now()) {
  const last = new Map();
  return {
    // true = được phép trả lời
    allow(userId) {
      const t = now();
      const prev = last.get(userId) || 0;
      if (t - prev < RATE_LIMIT_MS) return false;
      last.set(userId, t);
      return true;
    },
    forget(userId) { last.delete(userId); },
  };
}

module.exports = {
  RATE_LIMIT_MS,
  looksLikeCommand,
  distance,
  closestCommand,
  unknownCommandText,
  createRateLimiter,
};
