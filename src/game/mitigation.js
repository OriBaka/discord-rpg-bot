// Giảm sát thương theo DEF — NGUỒN DUY NHẤT.
//
// Trước đây hằng số này bị chép ở 3 nơi (combat.js, skills.js, và bản sao
// trong test/balance_sim.js). Sửa một chỗ là PvE và PvP lệch nhau, và bộ
// test cân bằng đo một công thức khác với game đang chạy — đúng kiểu lỗi
// khiến "test báo 70% còn người chơi thật thắng 1%".
//
// Công thức: giảm = min(CAP, def / (def + K));  sát thương = atk * (1 - giảm)
//
// ===========================================================================
// TRẦN SÁT THƯƠNG ĐÃ BỊ BỎ (MAX_HIT_PCT = 1)
//
// Trần "mỗi đòn không quá 30% max HP" từng là cơ chế DUY NHẤT khiến một bảng
// quái chung cân được cả 3 class: khi mọi class đều chạm trần, ai cũng chết
// sau đúng 1/0.30 = 3.3 đòn bất kể HP/DEF, nên chênh lệch độ bền biến mất.
//
// Nhưng nó trả giá bằng chính thứ người chơi tương tác hằng ngày:
//   • quái được neo ATK vừa đủ chạm trần → mặc thêm giáp KHÔNG giảm được một
//     điểm sát thương nào (đo được với K=240: cả bộ giáp da 750 vàng chỉ giảm
//     6.8%; có thời điểm là 0%);
//   • số đòn sống được luôn là 3–4 → trận đánh không có chỗ cho biến thiên;
//   • mọi thay đổi HP/DEF của class đều vô nghĩa.
//
// Nay bỏ hẳn trần. Bù lại, ba class được xếp để ĐỘ BỀN THỰC bằng nhau:
//
//     độ bền thực = maxHP / (1 − giảm thương theo DEF)
//
// Nhờ vậy một bảng quái chung vẫn cân được cả ba (xem classes.js), mà giáp
// vẫn giảm 25–45% sát thương nhận vào. Đây là điều kiện toán học: khi không
// còn trần, tỉ lệ thắng của hai nhân vật chỉ bằng nhau nếu ATK × độ bền thực
// của họ bằng nhau. Trần cũ "giả" điều kiện đó bằng cách chặn sát thương.
//
// MAX_HIT_PCT vẫn được export = 1 để mọi nơi đọc nó không phải sửa, và để
// nếu cần bật lại thì chỉ sửa một số. Giá trị 1 nghĩa là "không chặn".
// ===========================================================================
//
// ---------------------------------------------------------------------------
// VÌ SAO K = 200
//
// K là mức DEF mà tại đó giảm đúng 50%. Nó quyết định giáp "đáng giá" bao
// nhiêu và độ bền 3 class có bằng nhau được hay không.
//
//   def  20 → giảm  9.1%      def  60 → giảm 23.1%
//   def  40 → giảm 16.7%      def 120 → giảm 37.5%
//   def  80 → giảm 28.6%      def 200 → giảm 50.0%
//
// Với K=100 (bản trước), giáp quá mạnh ở nửa sau game: DEF 400 cho giảm 80%,
// và để 3 class cùng độ bền thì HP phải chênh tới 2.5 lần — HP tuyến tính
// không biểu diễn nổi, buộc phải dùng bảng tra phi tuyến. K=200 giữ được mức
// giảm 25–45% (giáp vẫn cảm nhận rõ) mà vẫn cho phép HP tuyến tính như cũ.
//
// Số liệu đo (tools/tune_balance.js + test/balance_sim.js): với K=200 và thang
// chỉ số trong classes.js, độ bền thực của 3 class lệch < 6% ở mọi cấp 1–45,
// trong khi giáp giảm 18% (Lv.1) → 51% (Lv.45) sát thương nhận vào.
// ---------------------------------------------------------------------------
const MITIGATION_K = 200;
const MITIGATION_CAP = 0.75;

/** Trần sát thương mỗi đòn, tính theo % max HP của bên nhận. 1 = không chặn. */
const MAX_HIT_PCT = 1;

/** Tỉ lệ giảm sát thương (0..MITIGATION_CAP) ứng với một mức DEF. */
function mitigation(def) {
  return Math.min(MITIGATION_CAP, Math.max(0, def) / (Math.max(0, def) + MITIGATION_K));
}

module.exports = { MITIGATION_K, MITIGATION_CAP, MAX_HIT_PCT, mitigation };
