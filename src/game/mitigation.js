// Giảm sát thương theo DEF — NGUỒN DUY NHẤT.
//
// Trước đây hằng số này bị chép ở 3 nơi (combat.js, skills.js, và bản sao
// trong test/balance_sim.js). Sửa một chỗ là PvE và PvP lệch nhau, và bộ
// test cân bằng đo một công thức khác với game đang chạy — đúng kiểu lỗi
// khiến "test báo 70% còn người chơi thật thắng 1%".
//
// Công thức: giảm = min(CAP, def / (def + K));  sát thương = atk * (1 - giảm)
//
// ---------------------------------------------------------------------------
// VÌ SAO K ĐỔI TỪ 240 XUỐNG 100
//
// Với K=240, một điểm DEF gần như không có nghĩa ở nửa đầu game:
//   def   8 → giảm  3.2%      def 26 → giảm  9.8%
//   def  33 → giảm 12.1%      def 50 → giảm 17.2%
// Hệ quả đo được: mặc CẢ BỘ giáp da (5 món, 750 vàng) chỉ giảm 6.8% sát
// thương nhận vào. Người chơi mua giáp, không thấy khác gì, và kết luận
// "giáp vô dụng" — đúng. Toàn bộ nhánh trang bị phòng thủ của game thành
// trang trí.
//
// Với K=100:
//   def   8 → giảm  7.4%      def 26 → giảm 20.6%
//   def  33 → giảm 24.8%      def 50 → giảm 33.3%
// Mỗi món giáp giờ đều cảm nhận được, và trần 75% vẫn đạt được ở def 300 —
// vẫn không ai miễn nhiễm.
//
// ĐÁNH ĐỔI: hạ K làm người chơi sống lâu hơn ở MỌI zone, nên toàn bộ bảng
// quái phải tăng ATK để bù (xem balance_seed.js). Đây là thay đổi có hệ
// thống, không phải nerf lẻ.
// ---------------------------------------------------------------------------
const MITIGATION_K = 100;
const MITIGATION_CAP = 0.75;

// ===== Trần sát thương nhận mỗi đòn =====
//
// Không ai bị hạ trong 1-2 đòn. Nhưng nó còn là CƠ CHẾ CÂN BẰNG CLASS: khi cả
// 3 class đều chạm trần, mỗi class chết sau đúng 1/PCT đòn BẤT KỂ HP/DEF, nên
// khoảng cách độ bền giữa Chiến Binh (HP 642) và Pháp Sư (HP 457) biến mất và
// một bảng quái chung cân được cho cả 3.
//
// Đo được (tỉ lệ số đòn sống được giữa class trâu nhất/yếu nhất ở Lv.30; phải
// NHỎ HƠN tỉ lệ sát thương ~1.4 thì mới cân được cả 3):
//   30% → 1.77   → chênh tối đa 20 điểm sau khi sửa các lỗi bên dưới
//   15% → 1.28   → không tốt hơn (quái phải mạnh gấp nhiều lần, win-rate
//                   thành bậc thang: hoặc 0% hoặc 100%)
// Giữ 30%: trận 3-5 đòn, vẫn có biến thiên, và không cần ATK quái phi lý.
const MAX_HIT_PCT = 0.30;

/** Tỉ lệ giảm sát thương (0..MITIGATION_CAP) ứng với một mức DEF. */
function mitigation(def) {
  return Math.min(MITIGATION_CAP, Math.max(0, def) / (Math.max(0, def) + MITIGATION_K));
}

module.exports = { MITIGATION_K, MITIGATION_CAP, MAX_HIT_PCT, mitigation };
