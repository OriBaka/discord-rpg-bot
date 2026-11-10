# Cân bằng chiến đấu — những gì đã đo được

Tài liệu này ghi lại các kết luận ĐÃ ĐO, để lần sau không phải thử lại những
hướng đã chứng minh không hiệu quả. Mọi con số đều từ DB thật, 200–600 trận
mỗi ô, dùng `test/balance_sim.js` (khớp `src/game/combat.js`).

Chạy lại: `node tools/tune_balance.js [--detail] [--json]`

---

## Trạng thái hiện tại

| | Kết quả |
|---|---|
| Win-rate full đồ theo zone | TB **69,5%**, **9/9** zone trong 65–75% |
| Chênh lệch class (tối đa) | **22 điểm** (frozen_abyss) |
| Giáp giảm sát thương | **17–56%** tuỳ zone |
| Người mới (vũ khí khởi đầu) ở forest | **67 / 70 / 75%** |

Ba class vẫn khác nhau có chủ ý: Lv.40 độ bền (maxHP ÷ (1−giảm thương)) là
1529 / 1291 / 1182 cho Chiến Binh / Pháp Sư / Cung Thủ.

---

## Ba lỗi gốc đã sửa

**1. Giáp vô dụng.** `K=240` khiến def 26 chỉ giảm 9,8% sát thương; cả bộ
giáp da 750 vàng giảm 6,8%. Nguyên nhân sâu hơn nằm ở công cụ cân bằng: ATK
quái được đặt vừa đủ chạm trần 30% max HP → class trì nhất luôn mất đúng 30%
máu mỗi đòn BẤT KỂ DEF. Đã hạ `K` xuống 100 và bỏ cách neo ATK vào trần.

**2. Hai hệ chỉ số tách nhau.** `addXpAndLevel()` cộng cứng +15/+3/+2 cho mọi
class, bỏ qua `growth` trong `classes.js`. Trong khi `statsAtLevel()` — dùng
bởi mọi công cụ — lại tính theo growth:

    Lv.30 Pháp Sư:  statsAtLevel 457/133/90   ·   người chơi thật 515/104/61

Bảng quái vì thế được cân theo một nhân vật không tồn tại, và mọi tinh chỉnh
growth trước đây đều vô hiệu. Đã sửa; có test hồi quy khoá lại.

**3. Pháp Sư tụt hậu theo cấp.** Vì DEF nhân vào công thức giảm thương,
+3 DEF/cấp của Chiến Binh là lợi kép. Độ bền Pháp Sư so với Chiến Binh tụt
64% (Lv.1) → 36% (Lv.40). Đã cân lại growth.

---

## Điều KHÔNG hiệu quả — đừng thử lại

### Tăng ATK quái để cả 3 class cùng chạm trần — KHÔNG giúp

Giả thuyết nghe rất hợp lý: nếu mọi class đều chạm trần sát thương thì ai cũng
chết sau đúng `1/MAX_HIT_PCT` đòn, khoảng cách HP/DEF biến mất, win-rate phải
bằng nhau.

Đo thực tế (đặt ATK quái = mức cần cho class trì nhất chạm trần, rồi ×1, ×1.5,
×2.5):

| ATK × | forest | volcano | frozen_abyss | astral_ruins |
|---|---|---|---|---|
| ×1 | 80/94/97 | 55/80/66 | 63/71/82 | 63/51/67 |
| ×2.5 | 80/94/97 | 55/80/66 | 63/71/82 | 63/51/67 |

Không đổi một điểm. Kết luận: **chênh lệch độ bền KHÔNG phải thủ phạm.**

### Thủ phạm thật: chênh lệch SÁT THƯƠNG + làm tròn lên

Khi đã chạm trần, win-rate chỉ còn phụ thuộc SỐ ĐÒN ĐỂ GIẾT quái:

| zone | Chiến Binh | Pháp Sư | Cung Thủ |
|---|---|---|---|
| volcano | 4.50 đòn (66%) | **3.70 đòn (80%)** | 4.00 đòn (65%) |
| astral_ruins | 4.00 đòn (63%) | 4.57 đòn (51%) | 4.00 đòn (67%) |

Pháp Sư gây 216 sát thương/đòn so với Chiến Binh 186 — chỉ hơn 16%, nhưng vì
`Math.ceil(hp/dmg)` nên chênh lệch đó thành **cả một đòn** (3 thay vì 4), và
một đòn trên trận 3–4 đòn là 25–30 điểm win-rate.

### Tăng DEF cho Pháp Sư/Cung Thủ — KHÔNG giúp

Khi trận chỉ 3–4 đòn, `ceil` nuốt hết phần DEF cộng thêm. Đo: nâng DEF của
Pháp Sư/Cung Thủ lên 85% của Chiến Binh → chênh vẫn **20 điểm**.

### Hạ `MAX_HIT_PCT` để trận dài hơn — KHÔNG giúp

| MAX_HIT_PCT | số đòn để chết | chênh tối đa |
|---|---|---|
| 0.30 | 3.3 | 19 |
| 0.20 | 5.0 | 28 |
| 0.15 | 6.7 | 48 |
| 0.12 | 8.3 | 44 |

Lý do: hạ trần buộc ATK quái phải tăng để vẫn tạo áp lực, và ATK cao làm
class trì (Chiến Binh) chạm trần trong khi class yếu thì không → lệch tăng.

### Tăng HP quái để trận dài hơn — ĐÚNG hướng nhưng phá win-rate

Nhân đôi HP quái (giữ ATK) làm chênh lệch giảm từ 19 → **1 điểm**. Nhưng:

| HP × | TB win-rate |
|---|---|
| ×1.0 | 71% |
| ×1.2 | 33% |
| ×1.4 | 12% |
| ×2.0 | 0% |

Trận dài làm mượt phép làm tròn (đúng), nhưng người chơi phải sống thêm 2× số
đòn trong khi trần sát thương vẫn chặn ở 30% max HP → họ chết trước khi giết
xong. Cần tăng HP người chơi HOẶC tăng sát thương người chơi song song, tức
đổi toàn bộ thang chỉ số.

---

## Hướng đúng nếu muốn chênh lệch về 0

Cái cần cân bằng không phải độ bền mà là **số đòn để giết quái**, và phải cân
nó cho **từng con quái** chứ không phải trung bình zone. Cụ thể:

1. Chọn một `N` đòn mục tiêu cho mỗi tier (ví dụ safe 4, even 5, danger 6).
2. Với mỗi quái, đặt `hp = N × dmg_trung_bình_3_class`.
3. Khi đó class mạnh hơn giết nhanh hơn một chút — chênh lệch còn lại chỉ là
   ±1 đòn trên N đòn (N càng lớn càng nhỏ).
4. Bù lại độ khó bằng ATK/HP quái chứ không bằng HP.

Việc này làm được nhưng phải đổi cả thang HP quái và có thể cả HP người chơi;
nên làm thành một thay đổi riêng, có đo lại toàn bộ 9 zone và cập nhật
`test/balance.test.js` cùng lúc.

---

## Bất biến để kiểm tra nhanh

`dmg_per_hit × hits_survived` phải **bằng nhau** giữa 3 class thì win-rate mới
bằng nhau. Hiện tại (Lv mở zone, full đồ):

| zone | Chiến Binh | Pháp Sư | Cung Thủ | chênh |
|---|---|---|---|---|
| forest | 89 | 81 | 84 | 1.10 |
| volcano | 445 | 462 | 425 | 1.09 |
| astral_ruins | 541 | 537 | 549 | 1.02 |

Chênh ở đại lượng này chỉ 1.02–1.11, nhưng win-rate lệch tới 22 điểm — vì phép
`ceil` khuếch đại. Đừng dùng bất biến này một mình để kết luận "đã cân bằng".
