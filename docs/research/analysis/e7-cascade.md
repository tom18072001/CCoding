# E7: kiểm lại phép tính cascade nghiệm thu — [Khám phá]

> **[Khám phá].** Phép tính này đặt ra **sau khi đã thấy** kết quả E7 (cascade không nằm trong giả thuyết đã đăng ký); không có giá trị xác nhận. Không gọi LLM. Sinh bởi `node docs/research/analysis/e7-cascade.mjs`; dữ liệu `bench/vs-claude/results/e7-cto/`.

## Cách tính

- **Mẫu:** 128 mục chốt (64 lỗi, 64 đúng); nhãn kiểm 3 lần khớp cả 128 mục (mục lỗi trượt 3/3, mục đúng đạt 3/3) (`label-trials.jsonl`).
- **Quan sát:** dòng cuối của mỗi cặp (mục, arm) nếu `done` (như `e7/analyze.mjs`); 16 lượt 403 của R1/R2 đã bị `reclassify.mjs` chuyển thành `infra` và dùng lượt chạy lại. Chạm trần lượt của R3 không liên quan (R3 không dùng ở đây).
- **Cascade:** R1 (Sonnet) chấm mọi mục; chỉ mục R1 chặn mới chuyển R2 (Opus); chặn khi cả hai chặn. **R2 đơn / R1 đơn:** một arm chấm mọi mục.
- **"Chặn"** = `verdict = block`; `pass` và `unparsed` (không đọc được kết luận) là không chặn, trừ bảng 2.
- **Chi phí:** `costUsd` của dòng được chọn. Cascade = R1 trên mọi mục + R2 chỉ trên mục R1 chặn. Số dòng được chọn thiếu `costUsd`: **0** → không phải ước tính từ `tokens`; mọi chi phí là `costUsd` ghi sẵn. Tổng đủ 128 mục: R1 11,84, R2 31,34 USD.
- **CI:** Clopper–Pearson 95 % hai phía bằng `cp` của `g-analyze.mjs` (hàm `e7/analyze.mjs` dùng; `harness/stats.mjs` không có CP).

## Kết quả

### Bảng 1 (chính): dòng cuối mỗi cặp, đã phân loại lại; "không đọc được" = không chặn

| Cách | Mục lỗi: recall k/n | CP 95 % | Mục đúng: chặn nhầm k/n | CP 95 % | Lượt chạy | USD (costUsd) |
|---|---|---|---|---|--:|--:|
| Cascade | 55/64 = 85,9 % | [75,0; 93,4] | 3/64 = 4,7 % | [1,0; 13,1] | 218 | 33,78 |
| R2 đơn | 55/64 = 85,9 % | [75,0; 93,4] | 4/64 = 6,3 % | [1,7; 15,2] | 128 | 31,34 |
| R1 đơn | 63/64 = 98,4 % | [91,6; 100,0] | 27/64 = 42,2 % | [29,9; 55,2] | 128 | 11,84 |

### Bảng 2 (độ nhạy i): coi "không đọc được kết luận" là chặn

| Cách | Mục lỗi: recall k/n | CP 95 % | Mục đúng: chặn nhầm k/n | CP 95 % | Lượt chạy | USD (costUsd) |
|---|---|---|---|---|--:|--:|
| Cascade | 60/64 = 93,8 % | [84,8; 98,3] | 5/64 = 7,8 % | [2,6; 17,3] | 218 | 33,78 |
| R2 đơn | 61/64 = 95,3 % | [86,9; 99,0] | 11/64 = 17,2 % | [8,9; 28,7] | 128 | 31,34 |
| R1 đơn | 63/64 = 98,4 % | [91,6; 100,0] | 27/64 = 42,2 % | [29,9; 55,2] | 128 | 11,84 |

### Bảng 3 (độ nhạy ii): bỏ các mục có cặp bị phân loại lại (9 mục)

| Cách | Mục lỗi: recall k/n | CP 95 % | Mục đúng: chặn nhầm k/n | CP 95 % | Lượt chạy | USD (costUsd) |
|---|---|---|---|---|--:|--:|
| Cascade | 54/62 = 87,1 % | [76,1; 94,3] | 3/57 = 5,3 % | [1,1; 14,6] | 204 | 31,70 |
| R2 đơn | 54/62 = 87,1 % | [76,1; 94,3] | 4/57 = 7,0 % | [1,9; 17,0] | 119 | 29,13 |
| R1 đơn | 61/62 = 98,4 % | [91,3; 100,0] | 24/57 = 42,1 % | [29,1; 55,9] | 119 | 10,97 |

Ghi chú đọc bảng:
- Cascade chặn khi cả R1 và R2 chặn, nên từng mục cascade chặn ⊆ R1 chặn ∩ R2 chặn; recall và chặn nhầm của cascade không vượt R1 và R2 đơn.
- Bảng 1 tính 13 lượt R2 "không đọc được" (6 lỗi, 7 đúng) là không chặn; bảng 2 đảo cách đọc đó. Mọi kết luận cần đứng ở cả ba bảng; không đứng được thì ghi "không kết luận".

## Đối chiếu tính nhanh

Nguồn: `docs/research/context/decomposition-literature-2026-11-14.md` §4 (không sửa tệp đó). Cột "Tính lại" lấy từ bảng 1.

| Số trong tính nhanh | Tính lại | Kết luận |
|---|---|---|
| Cascade recall mục lỗi 55/64 = 85,9 % ("như R2") | 55/64 = 85,9 % | đúng: R1 chỉ chặn 8, R2 chỉ chặn 0, cả hai chặn 55. |
| Cascade chặn nhầm 3/64 = 4,7 % | 3/64 = 4,7 % | đúng: R1 chặn 27, chỉ R1 chặn 24, nên cả hai chặn = 27 − 24 = 3. |
| R1 chặn 27 mục đúng | 27 | đúng |
| Chỉ R1 chặn 24 mục đúng, chỉ R2 chặn 1 | 24 và 1 | đúng |
| Chỉ R1 chặn 8 mục lỗi, chỉ R2 chặn 0 | 8 và 0 | đúng (khớp `report.md` dòng 29) |
| Opus chạy trên ~90/128 mục | 90/128 (số mục R1 chặn: 63 lỗi + 27 đúng) | đúng |
| Chi phí ≈ R1 + 0,7 × R2 | R1 11,84 + R2 trên ca R1 chặn 21,94 = **33,78** USD. Công thức 0,7 × R2 = 21,94; thực tế R2 trên ca R1 chặn = 0,70 × R2 đủ (21,94/31,34) | đúng về hệ số 0,7 (trùng với 90/128 = 0,70 tính theo số lượt; tỉ lệ chi phí là phép chia riêng, ra 0,700). |
| "Cascade không rẻ hơn Opus đơn" | cascade 33,78 so với R2 đơn 31,34 USD | đúng: cascade đắt hơn R2 đơn 2,44 USD |
| "Chỉ bớt 1 ca chặn nhầm" (R2 đơn → cascade) | R2 đơn 4/64, cascade 3/64 | đúng |
| "R2 có 13 lượt không đọc được" | 13 (6 lỗi, 7 đúng); trong đó R1 chặn 7 mục | đúng; tính nhanh không nói cách xử lý: bảng 2 cho thấy nếu coi là chặn thì kết quả đổi. |

**Kết luận đối chiếu:** mọi con số trong tính nhanh khớp khi tính lại từ dòng cuối mỗi cặp đã phân loại lại; bảng 1 không có số sai. Điều tính nhanh bỏ ngỏ: (1) cách xử lý 13 lượt R2 "không đọc được": coi là chặn (bảng 2) thì chặn nhầm của R2 đơn là 11/64 chứ không phải 4/64, cascade 5/64, recall cascade 60/64 chứ không phải 55/64; (2) chênh 1 ca chặn nhầm giữa R2 đơn (4/64) và cascade (3/64) nằm trong hai CI chồng lấn gần hoàn toàn, không phân biệt được; (3) chi phí cascade cao hơn R2 đơn ở cả ba bảng (2,44; 2,44; 2,57 USD). Paper chỉ dùng số của tệp này, kèm một câu ghi chú rằng bản tính nhanh trước đó đã được kiểm lại.

## Giới hạn

- Tất cả là [Khám phá]: cascade, hai bảng độ nhạy và đối chiếu đặt ra sau khi đã thấy kết quả E7; không có kiểm định, không suy rộng ra ngoài 128 mục của 8 bài.
- 64 mục lỗi + 64 mục đúng ghép cặp theo bài; các mục cùng bài không độc lập, nên CI Clopper–Pearson (coi mục độc lập) có thể hẹp hơn thực tế; bootstrap theo bài nằm ở `report.md`.
- Cascade là phép tái dựng từ dòng R1 và R2 đã chạy độc lập trên mọi mục; chưa chạy cascade thật (R2 chưa từng được gọi có điều kiện).
- R2 "không đọc được" 13 lượt (chạm trần lượt): recall và chặn nhầm của R2 đơn và cascade có thể khác khi nâng trần lượt.
