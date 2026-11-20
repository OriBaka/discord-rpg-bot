# Kiểm toán build — 2026-11-16

## Cách chạy và phạm vi

```sh
node tools/build_audit.js           # mốc 8/18/30/40/45, ba class, ba bộ gear
node tools/build_audit.js --sweep   # thêm mọi tổ hợp 4/11 chiêu tại Lv.45
node --test test/build_audit.test.js
# Với estimator nghề, dùng DB tạm, không dùng DB người chơi:
DB_PATH=/tmp/rpg-job-audit.db node tools/measure_jobs.js 30
```

CLI combat luôn ghi đè DB_PATH bằng SQLite tạm, seed mới, xóa sau khi chạy;
kết quả chi tiết ở `.cache/build-audit/results.json` (không commit dữ liệu sinh).
Lần chạy đầy đủ: **13.806 trận**, không RNG trong các action được khảo sát.
Test parity so từng snapshot và từng lượt với `tower.start/act` có persistence,
cả ba class tại tầng boss 15; kiểm tra riêng ánh xạ `monsters.elite_tier` cho boss AI.

- Dùng `tactical_turn.evaluate` và `battle.pickMobAction` thật, không viết lại damage.
- Gear có nguồn shop/drop/recipe, đủ cấp và đúng class; giả định sở hữu ngay,
  không enchant, aura, consumable, bonus guild hay tính thời gian farm.
- Mỗi slot ưu tiên điểm hướng: zero cho Cân bằng, dương lớn nhất cho Công phá,
  âm nhỏ nhất cho Kiên thủ; sau đó chọn ATK (weapon), DEF (armor), ATK+DEF
  (offhand/accessory), cuối cùng ID. Hai ring có hai bản inventory.
  **Đây là ba bộ gear khác nhau, không phải thử nghiệm chỉ thay ±6 điểm trên cùng stats.**
  Gear hướng cũ có thể kém gear trung tính mới; không suy ra stance trung tính luôn tối ưu.
- Học đủ sách đủ cấp trong fixture, kể cả sách event ở kịch bản limited;
  **không tạo event, không mở nguồn nhận mới**, không thay dữ liệu sản xuất.
- `base`: tối đa bốn chiêu cơ bản đầu catalog; `earned`: hai chiêu đầu + tối đa
  hai chiêu thường học gần nhất; `limited`: hai chiêu đầu + chiêu boss + event.
  Đây chỉ là mẫu build, không đại diện tối ưu của từng nguồn.
- `baseline-sweep`: mọi bộ bốn chiêu cơ bản đủ cấp (có chiêu Lv.25/40).
  `sweep`: 330 tổ hợp 4/11 mỗi class/gear tại Lv.45, bao gồm event.
- Policy `basic` chỉ Attack; `greedy` tối đa damage ngay lượt hiện tại;
  `tactical` heuristic nhìn một lượt đáp trả, HP/energy/DoT/buff. Không phải solver
  tối ưu; việc một chiêu không được chọn **không chứng minh chiêu vô dụng**.
- HP báo là % HP ảo còn lại; lượt = một lượt người chơi và đáp trả nếu còn sống.
  Win count của sweep là số bộ chiêu thắng, **không phải xác suất thắng thực tế**.
- Đích mỗi mốc: tầng cao nhất không vượt recommended level, cùng một elite/boss
  cố định. Chỉ kiểm toán combat theo lượt/Tháp; không suy rộng sang quickhunt,
  duel hay weekly raid. Không kiểm tra Railway trong công việc này.

## Mốc tiến triển, gear Cân bằng, bộ base

Ô = thắng/thua · lượt · HP%. Bảng này giữ nguyên bộ chiêu mẫu để thấy tác động
của cách đánh; sweep dưới đây mới bao gồm các chiêu cơ bản cấp cao.

| Class | Lv | Đích | Attack | Greedy | Tactical |
|---|---:|---|---|---|---|
| melee | 8 | tower_2 | Thắng · 4 · 68.2 | Thắng · 2 · 89.4 | Thắng · 2 · 89.4 |
| melee | 8 | elite_wolf | Thắng · 3 · 74.8 | Thắng · 2 · 87.4 | Thắng · 2 · 87.4 |
| melee | 18 | tower_6 | Thắng · 6 · 43.1 | Thắng · 4 · 77.2 | Thắng · 4 · 77.2 |
| melee | 18 | elite_lich | Thắng · 5 · 28.8 | Thắng · 3 · 82.2 | Thắng · 3 · 82.2 |
| melee | 30 | tower_11 | Thua · 8 · 0 | Thắng · 7 · 37.1 | Thắng · 7 · 37.1 |
| melee | 30 | boss_demon_king | Thua · 10 · 0 | Thắng · 8 · 59.5 | Thắng · 8 · 59.5 |
| melee | 40 | tower_14 | Thua · 9 · 0 | Thắng · 9 · 27 | Thắng · 9 · 27 |
| melee | 40 | boss_wyrm | Thắng · 13 · 12.5 | Thắng · 8 · 70.9 | Thắng · 8 · 70.9 |
| melee | 45 | tower_15 | Thua · 11 · 0 | Thắng · 13 · 24.8 | Thắng · 13 · 24.8 |
| melee | 45 | boss_void_lord | Thua · 13 · 0 | Thắng · 10 · 51.6 | Thắng · 10 · 51.6 |
| magic | 8 | tower_2 | Thắng · 4 · 67.9 | Thắng · 3 · 78.6 | Thắng · 3 · 78.6 |
| magic | 8 | elite_wolf | Thắng · 3 · 75 | Thắng · 2 · 87.5 | Thắng · 2 · 87.5 |
| magic | 18 | tower_6 | Thắng · 6 · 42.9 | Thắng · 4 · 65.7 | Thắng · 4 · 65.7 |
| magic | 18 | elite_lich | Thắng · 5 · 29.6 | Thắng · 4 · 47.2 | Thắng · 4 · 47.2 |
| magic | 30 | tower_11 | Thua · 8 · 0 | Thắng · 8 · 11.7 | Thắng · 8 · 11.7 |
| magic | 30 | boss_demon_king | Thua · 10 · 0 | Thắng · 8 · 25.6 | Thắng · 8 · 25.6 |
| magic | 40 | tower_14 | Thua · 9 · 0 | Thua · 9 · 0 | Thắng · 10 · 13.9 |
| magic | 40 | boss_wyrm | Thắng · 13 · 11.4 | Thắng · 8 · 45.8 | Thắng · 8 · 45.8 |
| magic | 45 | tower_15 | Thua · 11 · 0 | Thua · 11 · 0 | Thắng · 16 · 5.2 |
| magic | 45 | boss_void_lord | Thua · 13 · 0 | Thắng · 11 · 13.4 | Thắng · 11 · 13.4 |
| ranged | 8 | tower_2 | Thắng · 4 · 67.9 | Thắng · 2 · 89.3 | Thắng · 2 · 89.3 |
| ranged | 8 | elite_wolf | Thắng · 3 · 74.8 | Thắng · 1 · 100 | Thắng · 1 · 100 |
| ranged | 18 | tower_6 | Thắng · 6 · 42.4 | Thắng · 3 · 77 | Thắng · 3 · 77 |
| ranged | 18 | elite_lich | Thắng · 5 · 28.9 | Thắng · 2 · 82.2 | Thắng · 2 · 82.2 |
| ranged | 30 | tower_11 | Thua · 8 · 0 | Thắng · 6 · 37 | Thắng · 6 · 37 |
| ranged | 30 | boss_demon_king | Thua · 10 · 0 | Thắng · 7 · 45.5 | Thắng · 7 · 45.5 |
| ranged | 40 | tower_14 | Thua · 9 · 0 | Thắng · 7 · 26.5 | Thắng · 7 · 26.5 |
| ranged | 40 | boss_wyrm | Thắng · 13 · 11.8 | Thắng · 7 · 60.8 | Thắng · 7 · 60.8 |
| ranged | 45 | tower_15 | Thua · 11 · 0 | Thắng · 10 · 18.4 | Thắng · 11 · 6.7 |
| ranged | 45 | boss_void_lord | Thua · 13 · 0 | Thắng · 8 · 40.8 | Thắng · 8 · 40.8 |

## Tầng 15 tại Lv.45: sweep với tactical

Ô = số bộ thắng / số bộ thử; sau dấu chấm phẩy là bộ thắng nhanh nhất:
lượt / HP%. Tie-break: HP cao hơn. Nếu không có bộ thắng thì ghi —.

| Class | Gear | Stance | ATK / DEF / HP | Baseline sweep | Toàn bộ sách |
|---|---|---:|---|---|---|
| melee | neutral | 0 | 415 / 388 / 632 | 13/15; 12 / 7.4% | 135/330; 11 / 7.4% |
| melee | attack | 6 | 405 / 335 / 632 | 7/15; 13 / 16.8% | 49/330; 13 / 16.8% |
| melee | guard | -6 | 353 / 348 / 632 | 2/15; 14 / 6.3% | 16/330; 14 / 6.3% |
| magic | neutral | 0 | 415 / 239 / 842 | 12/15; 12 / 0.8% | 215/330; 12 / 20% |
| magic | attack | 6 | 405 / 213 / 842 | 10/15; 13 / 37.8% | 128/330; 13 / 37.8% |
| magic | guard | -6 | 353 / 219 / 842 | 7/15; 15 / 2.4% | 85/330; 14 / 21.3% |
| ranged | neutral | 0 | 415 / 305 / 735 | 12/15; 10 / 18.4% | 181/330; 10 / 18.4% |
| ranged | attack | 6 | 405 / 267 / 735 | 7/15; 10 / 11.6% | 63/330; 10 / 11.6% |
| ranged | guard | -6 | 353 / 276 / 735 | 0/15; — | 6/330; 11 / 1.1% |

## Kết luận combat và quyết định

1. Attack thuần không đủ ở các mốc cao trong fixture; combo, khống chế, hồi HP,
   hồi energy có ý nghĩa. Tất cả class có bộ baseline thắng tầng 15 với gear trung
   tính, không bắt buộc sách event. Không tăng boss chỉ vì bộ gear farm sẵn thắng.
2. Ranged có burst đầu trận nổi bật, nhất là đích ít HP; đây là dấu hiệu cần theo
   dõi khi thiết kế nội dung, chưa đủ để nerf cả class. Magic có thể đổi một lượt
   damage lấy hồi HP; heuristic tham damage không đánh giá đúng giá trị đó.
3. Không thay gear/stance dựa trên bảng này: gear trung tính mới có stats gốc cao
   hơn nhiều bộ craft hướng cũ. Muốn cân bằng từng dòng cần đối chiếu chi phí
   recipe/drop, không chỉ tỷ lệ thắng của ba bộ khác nhau.
4. Falcon Dive yếu hơn Aimed Shot ở một hit: ATK100, có Mark, DEF0/100/200/400/600
   cho Aimed = 400/267/200/133/100; Falcon = 288/209/165/115/89.
   Tuy nhiên hai chiêu có cooldown độc lập, Falcon vẫn xuất hiện trong build
   thắng; không gọi đây là strict domination hoặc buff vội chiêu boss.
5. Sách event không là điều kiện qua Tháp. Không chiêu nào bị xóa hay tự động
   equip. Chưa đủ bằng chứng để chỉnh damage/cost/CD: **giữ nguyên balance live**.

## Nghề sau chuyển điều kiện sang cấp nghề

Sửa lỗi **công cụ đo**: lấy kỳ vọng trên từng số lượng nguyên rồi `Math.round`,
thêm `extra_chance` sau làm tròn, cap extra khi cộng tool+buff. Foraging dùng
level multiplier và không dùng qtyMult như `gather.js` hiện tại; không tự ý đổi
runtime trong audit. Mining/Fishing dùng qtyMult. Điều kiện chọn tool/buff vẫn
là cấp nghề tương ứng, không phải cấp nhân vật.

Bảng: gold/phút bán nguyên liệu, tool tốt nhất đủ cấp / tool+buff tốt nhất đủ cấp,
zone cao nhất đủ cấp; cooldown seed. Chưa trừ giá buff trong cột thu nhập.

| Cấp nghề | Mining | Fishing | Foraging |
|---:|---:|---:|---:|
| 8 | 29 / 29 | 11 / 11 | 18 / 18 |
| 18 | 71 / 87 | 33 / 41 | 57 / 69 |
| 30 | 137 / 195 | 72 / 103 | 112 / 155 |
| 40 | 193 / 269 | 121 / 168 | 199 / 277 |
| 45 | 193 / 269 | 121 / 168 | 199 / 277 |

- Bỏ qua streak/vein/treasure/aura, cấu hình override cooldown, công cụ mua vào,
  XP và giá trị nguyên liệu craft/cooking. Các yếu tố này có thể thay đổi thứ hạng;
  bảng không chứng minh Fishing cần buff để thu nhập ngang Mining.
- Tại Lv.30, lợi ích buff trừ giá shop/charge xấp xỉ +23/+5/+12 gold mỗi action
  (Mining/Fishing/Foraging). Không lỗ trong giả định này, nhưng không cam kết
  lợi nhuận cho từng lượt random.
- Cooking/Crafting là nghề chuyển hóa nguyên liệu, không phải nguồn drop;
  không gán gold/phút giả tạo. Chưa mô phỏng đường XP/thời gian lên cấp hay
  thị trường người chơi. Test nghề hiện có tiếp tục kiểm tra eligibility cả năm
  nghề; audit này chỉ thêm số đo kinh tế ba nghề thu thập.
- Không thay giá, drop, XP hay ngưỡng cấp nghề chỉ dựa trên estimator này.

## Kiểm chứng

`npm test`: **635/635 passed** (gồm 4 test mới: fixture legality, Tower parity +
purity, elite-tier mapping, estimator rounding/extra). Chưa xác minh runtime
Railway; đây là kết quả local và CI sau khi mở PR.
