# E7b: CTO nghiệm thu, đo lại trên bản mã hiện tại

Mục chốt: 128 (lỗi 64, đúng 64 sau khi loại 0 mục không dựng lại được, QH23). Một tiến trình xen kẽ theo bảng Latin (QH3). R1b: Sonnet, trần accept 6. R2b: Opus, trần accept 16 (khác nhau ở cả model lẫn trần; không tách được).

## Cặp thiếu (QH7, QH21, QH22, QH30)

| Arm | cặp thiếu | trong đó hết giờ (cặp): ĐK1 `quá hạn chờ` / ĐK2 `Hết thời gian (` / ĐK3 `timeout:` | dòng infra của các cặp hết giờ: ĐK1 / ĐK2 / ĐK3 |
|---|--:|---|---|
| R1b | 0 | 0: 0 / 0 / 0 | 0 / 0 / 0 |
| R2b | 0 | 0: 0 / 0 / 0 | 0 / 0 / 0 |

Thứ tự xét điều kiện hết giờ (Phụ lục (2) (d), QH30): ĐK1, rồi ĐK2, rồi ĐK3; dòng khớp nhiều điều kiện tính vào điều kiện đứng trước (ví dụ `timeout: Hết thời gian (…)` tính ĐK2). Dòng infra có `error` rỗng không tính hết giờ. Cột "cặp" xếp mỗi cặp theo điều kiện của dòng infra cuối; cột "dòng" đếm riêng từng dòng infra theo điều kiện.

Ngưỡng: một arm > 3 cặp thiếu hoặc chênh ≥ 3 ⇒ nhánh F. Chưa kích hoạt. Cặp thiếu chọn "hết giờ" khi mọi dòng infra của cặp thỏa một điều kiện QH30.

## Thước đo chính (unread = không chặn; QH8, QH9, QH10)

| Arm | Recall | CP 95 % | Chặn nhầm | CP 95 % | Youden J (mô tả) | unread | capped | USD | USD/mục | wtok TB |
|---|---|---|---|---|---|---|---|---|---|---|
| R1b | 61/64 = 95,3 % | [86,9; 99,0] | 13/64 = 20,3 % | [11,3; 32,2] | 75,0 | 0 | 0 (ghi) | 12,07 | 0,09 | 38.905 |
| R2b | 60/64 = 93,8 % | [84,8; 98,3] | 4/64 = 6,3 % | [1,7; 15,2] | 87,5 | 1 | 0 (ghi) | 33,08 | 0,26 | 55.635 |

Tỉ số USD R2b/R1b: 2,74. Mô tả, không là tiêu chí.

## Mô tả lượt accept (QH29; không vào phép kiểm hay nhánh)

| Arm | acceptTurns: n / thiếu / trung vị / max | acceptToolCalls: n / thiếu / trung vị / max |
|---|---|---|
| R1b | 128 / 0 / 4 / 10 | 128 / 0 / 3 / 9 |
| R2b | 128 / 0 / 5,5 / 17 | 128 / 0 / 4,5 / 16 |

## Phép kiểm (McNemar chính xác hai phía, R2b so với R1b; Holm hai phép; bootstrap theo bài B = 4000; QH17, QH18)

| Cách tính | Phép | n | chỉ R1b chặn | chỉ R2b chặn | p thô | p Holm | hiệu R2b − R1b (điểm %) [CI bootstrap] | nhãn |
|---|---|--:|--:|--:|--:|--:|---|---|
| chính | P1 recall | 64 | 3 | 2 | 1,0000 | 1,0000 | -1,6 [-10,1; 8,5] | chưa phân biệt được |
| chính | P2 chặn nhầm | 64 | 10 | 1 | 0,0117 | 0,0234 | -14,1 [-34,8; 2,9] | chưa kết luận |
| S1 | P1 recall | 64 | 2 | 2 | 1,0000 | 1,0000 | 0,0 [-8,2; 9,2] | chưa phân biệt được |
| S1 | P2 chặn nhầm | 64 | 10 | 1 | 0,0117 | 0,0234 | -14,1 [-34,8; 2,9] | chưa kết luận |
| S2 | P1 recall | 63 | 2 | 2 | 1,0000 | 1,0000 | 0,0 [-8,3; 9,5] | chưa phân biệt được |
| S2 | P2 chặn nhầm | 64 | 10 | 1 | 0,0117 | 0,0234 | -14,1 [-34,8; 2,9] | chưa kết luận |
| S3a | P1 recall | 64 | 3 | 2 | 1,0000 | 1,0000 | -1,6 [-10,1; 8,5] | chưa phân biệt được |
| S3a | P2 chặn nhầm | 64 | 10 | 1 | 0,0117 | 0,0234 | -14,1 [-34,8; 2,9] | chưa kết luận |
| S3b | P1 recall | 64 | 2 | 2 | 1,0000 | 1,0000 | 0,0 [-8,2; 9,2] | chưa phân biệt được |
| S3b | P2 chặn nhầm | 64 | 10 | 1 | 0,0117 | 0,0234 | -14,1 [-34,8; 2,9] | chưa kết luận |

Nhãn P1: **chưa phân biệt được**; nhãn P2: **chưa kết luận**. Số cặp bất đồng < 10 thì p chỉ mô tả (QH20).
Cách tính: chính (unread = không chặn), S1 (unread = chặn), S2 (bỏ cặp có unread ở bất kỳ arm nào), S3a (cặp thiếu do hết giờ giữ lại như unread, không chặn), S3b (như S3a nhưng unread, kể cả hết giờ, tính là chặn như S1). Không có cặp hết giờ thì S3a trùng chính và S3b trùng S1 (QH15).

## Nhánh diễn giải (§9 (h); QH24–QH28)

- chính: F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4)) (ngưỡng quy theo n: chặn nhầm ≤ 6, recall ≥ 58, R1b − R2b ≤ 6)
- S1: F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4)) (ngưỡng quy theo n: chặn nhầm ≤ 6, recall ≥ 58, R1b − R2b ≤ 6)
- S2: F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4)) (ngưỡng quy theo n: chặn nhầm ≤ 6, recall ≥ 57, R1b − R2b ≤ 6)
- S3a: F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4)) (ngưỡng quy theo n: chặn nhầm ≤ 6, recall ≥ 58, R1b − R2b ≤ 6)
- S3b: F. Chưa kết luận (thỏa (1), (2) nhưng không thỏa (3) hoặc (4)) (ngưỡng quy theo n: chặn nhầm ≤ 6, recall ≥ 58, R1b − R2b ≤ 6)

**Kết luận nhánh: F.** Chỉ đứng được khi cả năm cách tính cùng nhánh (QH16).

## Theo bài

| Bài | R1b lỗi bị chặn | R2b lỗi bị chặn | R1b đúng bị chặn | R2b đúng bị chặn | unread R1b / R2b |
|---|--:|--:|--:|--:|--:|
| c1-iis-ecs | 1/1 | 1/1 | 0/1 | 0/1 | 0 / 0 |
| c2-burst-alert | 10/10 | 10/10 | 2/10 | 0/10 | 0 / 0 |
| c3-shop-bugs | 10/10 | 9/10 | 0/10 | 0/10 | 0 / 1 |
| c5-tickets-api | 9/10 | 10/10 | 0/10 | 0/10 | 0 / 0 |
| t1-duration | 3/4 | 4/4 | 2/4 | 3/4 | 0 / 0 |
| t2-orders | 10/10 | 9/10 | 1/10 | 0/10 | 0 / 0 |
| t3-api | 9/10 | 8/10 | 2/10 | 1/10 | 0 / 0 |
| t5-logq | 9/9 | 9/9 | 6/9 | 0/9 | 0 / 0 |

## So với E7 (chỉ mô tả, KHÁC BẢN MÃ, không gộp, không p/CI giữa hai đợt; QH29)

| | E7 (bản mã trước D15–D23, 13/11/2026) | E7b (bản ghim hiện tại) |
|---|---|---|
| Sonnet, trần 6 (R1 / R1b): chặn nhầm; recall | 42,2 %; 98,4 % | 20,3 %; 95,3 % |
| Opus (R2: trần 6 / R2b: trần 16): chặn nhầm; recall | 6,3 %; 85,9 % | 6,3 %; 93,8 % |

Chênh lệch có thể đến từ mã, trần, trôi mô hình hoặc nhiễu; không tách được (§9 E7b (i), (k)).

## Đối chiếu với calls.jsonl (nguồn phụ; lệch thì ghi, không chọn nguồn theo kết quả)

Không lệch.
