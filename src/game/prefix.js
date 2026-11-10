// PREFIX — một nguồn sự thật duy nhất.
//
// Trước đây 45 chỗ trong code viết `require('../game/prefix').getPrefix()`. Hệ quả:
//   • Server thật dùng `%` nhưng không set env → MỌI lệnh trong help đều
//     hướng dẫn sai (`!hunt` thay vì `%hunt`), người chơi copy-paste là lỗi.
//   • Muốn đổi prefix phải sửa 45 file.
//
// Nay mặc định là `%` (giá trị server đang chạy) và chỉ đọc ở đây.
// `.env` vẫn override được như cũ.

const DEFAULT_PREFIX = '%';

function getPrefix() {
  const p = process.env.PREFIX;
  return (typeof p === 'string' && p.trim().length > 0) ? p.trim() : DEFAULT_PREFIX;
}

module.exports = { getPrefix, DEFAULT_PREFIX };
