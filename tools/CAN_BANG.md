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

---

# Giai đoạn 2 — đã tìm ra cách cân bằng class về 0, nhưng có đánh đổi

## Phát hiện: ATK quyết định gần như toàn bộ

Ép ATK cuối cùng của 3 class bằng nhau (lấy trung bình) rồi đo:

| zone | trước (m/m/r) | sau khi ép ATK bằng |
|---|---|---|
| cave | 71/61/67 (9) | 69/69/69 (**0**) |
| swamp | 71/61/66 (10) | 68/68/68 (**0**) |
| dragon_lair | 71/79/71 (8) | 77/77/77 (**0**) |
| frozen_abyss | 63/71/82 (20) | 73/73/73 (**0**) |
| astral_ruins | 63/51/67 (16) | 68/68/68 (**0**) |

**6/9 zone về chênh lệch 0 điểm chỉ bằng cách cân ATK.** Đây là biến chính,
không phải độ bền như tôi từng kết luận.

## Nhưng 3 zone còn lại cần thêm một bước — và bước đó phá giáp

mountain / volcano / forest vẫn lệch 4–16 điểm vì Chiến Binh có DEF cao hơn.
Quét `(ATK chung, DEF tối đa)` cho từng zone:

| zone | ATK chung | DEF tối đa | kết quả | chênh |
|---|---|---|---|---|
| forest | 22 | 0.30× | 74/74/74 | **0** |
| volcano | 200 | 0.30× | 65/65/65 | **0** |
| mountain | 116 | 0.30× | 66/66/66 | **0** |

Cả 9/9 zone về **chênh lệch chính xác 0 điểm**, TB 70,9%.

**Nhưng `DEF tối đa = 0.30×` nghĩa là DEF gần như bị xoá.** Kiểm tra giáp:

| | Giáp giảm sát thương |
|---|---|
| DEF tối đa 0.30× | **0%** ở cả 9 zone — giáp hoàn toàn vô dụng |
| DEF giữ nguyên | 0–16% |
| Hiện tại (DEF giữ + ATK quái neo đúng) | **17–56%** |

Lý do: ATK quái đã vừa đủ chạm trần 30% max HP. Khi đã chạm trần, DEF **không
thể** giảm thêm sát thương — nên mọi mức DEF đều cho cùng kết quả. Chỉ có hai
lựa chọn:

- **Hạ ATK quái** để DEF còn tác dụng → nhưng khi đó class DEF thấp (Pháp Sư,
  Cung Thủ) chết nhanh hơn → chênh lệch class quay lại.
- **Giữ ATK quái** để cân class → giáp vô dụng.

Trần sát thương tạo ra quan hệ *đánh đổi trực tiếp* giữa "giáp có tác dụng" và
"3 class cân nhau". Không thể có cả hai miễn là còn trần 30%.

## Kết luận

Đã chọn **giữ giáp có tác dụng (17–56%)** và chấp nhận chênh lệch ≤ 22 điểm,
vì:
1. Giáp là hệ thống người chơi tương tác hằng ngày (mua, mặc, nâng cấp).
   Làm nó vô dụng là hồi quy đúng lỗi vừa sửa.
2. Chênh 6–20 điểm vẫn cho mọi class chơi được (thấp nhất 51%, không class
   nào dưới 50).
3. Muốn có cả hai thì phải **bỏ trần sát thương hoàn toàn** và làm lại thang
   HP/ATK của cả người chơi lẫn 45 quái — thay đổi lớn hơn nhiều, và đã đo
   thấy bỏ trần ở Lv30 cho Chiến Binh 70% / Pháp Sư 45% (lệch 25), không tốt
   hơn hiện tại.

---

# Giai đoạn 3 — điều kiện CHÍNH XÁC để cân bằng tuyệt đối

Người dùng yêu cầu bỏ trần sát thương và làm lại thang chỉ số. Đã đo và tìm
ra điều kiện cần, nhưng nó đòi hỏi một đánh đổi thiết kế lớn.

## Bỏ trần + giữ quái cũ: Pháp Sư sụp còn 7–17%

| zone | melee | magic | ranged | chênh |
|---|---|---|---|---|
| cave | 69 | **11** | 14 | 59 |
| swamp | 71 | **10** | 12 | 61 |
| astral_ruins | 61 | **7** | 10 | 55 |

Trần đang *che* lệch class. Bỏ nó ra là lộ ngay.

## Vì sao: ngưỡng thắng/thua là một điểm gãy, không phải độ dốc

Đo ở cave Lv.5, quái ATK = 0.5 × ATK người chơi, quét HP quái:

| HP quái | melee | magic | ranged | đòn để chết (m/m/r) |
|---|---|---|---|---|
| 200 | 100 | 100 | 100 | 12.3 / 8.3 / 9.4 |
| 300 | 100 | **68** | 95 | 12.3 / 8.3 / 9.4 |
| 400 | 92 | **2** | 18 | 12.3 / 8.3 / 9.4 |
| 600 | 1 | 0 | 0 | 12.3 / 8.3 / 9.4 |

Không có HP quái nào cho cả 3 class quanh 70%: giữa HP 300 và 400, Chiến Binh
còn 92% còn Pháp Sư rơi từ 68% xuống 2%. Ngưỡng nằm đúng chỗ "sống 12.3 đòn"
so với "sống 8.3 đòn".

## Điều kiện cần (đã kiểm chứng)

Thử: bỏ trần + ép **ATK bằng nhau** + ép **độ bền bằng nhau**
(HP điều chỉnh theo DEF để `maxHP / (1 − giảm thương)` như nhau):

| zone | melee | magic | ranged | chênh |
|---|---|---|---|---|
| forest | 0 | 1 | 2 | **2** |
| cave | 0 | 0 | 0 | **0** |
| volcano | 1 | 2 | 0 | **2** |
| frozen_abyss | 2 | 0 | 0 | **2** |

**Chênh lệch tối đa 2 điểm ở cả 9 zone**, và giáp vẫn giảm **48%** sát thương.

(Win-rate tuyệt đối trong thí nghiệm là 1% vì bước bisect HP quái chưa hội tụ
— khi bỏ trần, win-rate là hàm bậc thang rất gắt nên bisect cần độ phân giải
cao hơn nhiều. Phần *chênh lệch class* mới là kết quả cần đọc.)

## Nghĩa là gì

Để có cả ba thứ — **3 class cân bằng, giáp có tác dụng, không trần sát thương**
— thì:

1. Cả 3 class phải có **ATK bằng nhau** ở mọi cấp.
2. Cả 3 class phải có **độ bền thực bằng nhau**: `maxHP / (1 − def/(def+K))`.

Khác biệt class chỉ còn ở **cách đạt độ bền**: Chiến Binh HP thấp + DEF cao
("trâu bằng giáp"), Pháp Sư HP cao + DEF thấp ("trâu bằng máu"). Cả hai cùng
sống được số đòn như nhau.

Đây là thay đổi lớn, đụng tới:
- `src/game/classes.js` — base/growth HP + ATK của cả 3 class
- `src/game/combat.js` + `test/balance_sim.js` — bỏ trần
- 45 quái — sinh lại toàn bộ theo thang mới (sát thương lớn hơn nhiều)
- **heal / potion / PvP / raid** — mọi thứ neo theo "sát thương so với max HP"
- `test/balance.test.js` — nhiều test giả định có trần

Rủi ro: hồi máu và bình máu hiện tính theo % hoặc số tuyệt định; khi sát thương
tăng vọt (không còn trần 30%), chúng có thể thành vô dụng hoặc quá mạnh. Cần đo
lại cả hệ kinh tế, không chỉ win-rate.

**Chưa làm** vì cần một lượt riêng đo được toàn bộ các hệ liên quan, không chỉ
bảng quái. Làm nửa vời sẽ để game ở trạng thái tệ hơn hiện tại.
