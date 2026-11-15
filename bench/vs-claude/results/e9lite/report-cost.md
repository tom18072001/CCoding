# E9-lite — bảng độ phủ tuyệt đối và chi phí bằng tiền [Khám phá, sau khi thấy dữ liệu]

Phân tích khám phá, sau khi thấy dữ liệu, không thuộc đăng ký, chỉ mô tả (khối §9 "Phân tích khám phá bổ sung sau phản biện E9-lite"). Không p-value. Dữ liệu: Nội bộ.

- Lệnh: `node docs/research/analysis/e9lite-cost.mjs --runs bench/vs-claude/results/e9lite/run1/runs.jsonl --gold bench/vs-claude/results/e9lite/gold.json --labels bench/vs-claude/results/e9lite/labels.json --out <tệp đầu ra>`
- sha256 (tính trên LF) `bench/vs-claude/results/e9lite/run1/runs.jsonl`: `bb004f1fda6247524db7015fe2d0a282905d28304eefc69c08e4c01001b436fc`
- sha256 (tính trên LF) `bench/vs-claude/results/e9lite/gold.json`: `ee49fc5da243b1b656c3e2f8fcc9d395c39c3f5a30f325b0f8e1ea7406ed312f`
- sha256 (tính trên LF) `bench/vs-claude/results/e9lite/labels.json`: `4059699277ab7df1b6b55dec5876b81feaea6352b59350a1b2807ef543694025`
- Nguồn giá: `bench/vs-claude/lib/pricing.mjs`, PRICING_VERSION = `2026-11-04`; cache ghi 1 giờ (mặc định của `costOf`). Giá niêm yết theo phiên bản này, không phải hóa đơn thực.
- Bootstrap theo bài: B = 4000, seed 20261115, percentile 2,5/97,5 (khoảng 95 %), như §9 (6).
- Khóa: 117; lượt tính (done cuối): 117; khóa không có done: 0; số bài: 13. Mỗi bài = trung bình các lần lặp done được chọn.
- Chi phí tính trên `usage.tokens` của cả phiên planOnly (route + plan), không gồm phần thực thi; token pha `plan` = `usage.byPhase.plan`.

## 1. Bảng giá trị tuyệt đối theo arm

Mỗi ô: trung bình theo bài · trung vị · min–max · (hai cột độ phủ) số bài đạt 1,0.

| Đại lượng | S (Sonnet) | O (Opus) | H (Haiku) |
|---|---|---|---|
| Độ phủ tệp (raw.covFile) | 0,951 · 1,000 · 0,500–1,000 · 11/13 | 0,989 · 1,000 · 0,857–1,000 · 12/13 | 0,956 · 1,000 · 0,667–1,000 · 10/13 |
| Độ phủ module (raw.covMod) | 1,000 · 1,000 · 1,000–1,000 · 13/13 | 1,000 · 1,000 · 1,000–1,000 · 13/13 | 0,974 · 1,000 · 0,667–1,000 · 12/13 |
| Số hạng mục (raw.items) | 2,64 · 2,00 · 1,33–5,00 | 2,77 · 2,33 · 2,00–5,00 | 2,95 · 2,00 · 1,67–5,33 |
| Token có trọng số pha plan | 32 806 · 31 002 · 22 498–53 138 | 45 422 · 42 107 · 28 362–88 545 | 52 421 · 42 031 · 33 649–89 364 |

**Độ phủ có bão hòa (ở trần) không?** Số bài đạt 1,0 — module: S 13/13, O 13/13, H 12/13; tệp: S 11/13, O 12/13, H 10/13. Module: chưa bão hòa hoàn toàn (không phải cả ba arm đạt 1,0 ở mọi bài). Tệp: chưa bão hòa hoàn toàn.

Số bài có hiệu độ phủ bằng 0 (hiệu theo bài, mỗi bài là trung bình các lần lặp):

| Cặp | Thước | n bài | hiệu > 0 | hiệu = 0 | hiệu < 0 |
|---|---|---|---|---|---|
| O − S | covMod | 13 | 0 | 13 | 0 |
| O − S | covFile | 13 | 1 | 12 | 0 |
| H − S | covMod | 13 | 0 | 12 | 1 |
| H − S | covFile | 13 | 1 | 10 | 2 |

## 2. Chi phí bằng USD theo arm

Giá theo model của từng dòng. Haiku báo hai bậc: cận dưới (`costUsdLow`, bậc ≤ 100K prompt) và cận trên (`costUsd`, bậc > 100K). Sonnet/Opus không có bậc nên hai cận bằng nhau. Mỗi ô: trung bình theo bài · trung vị · min–max (USD).

| Đại lượng | S (Sonnet) | O (Opus) | H (Haiku) |
|---|---|---|---|
| USD/bài, cận dưới | 0,1145 · 0,1108 · 0,0900–0,1705 | 0,2813 · 0,2666 · 0,2035–0,4882 | 0,0081 · 0,0068 · 0,0058–0,0122 |
| USD/bài, cận trên | 0,1145 · 0,1108 · 0,0900–0,1705 | 0,2813 · 0,2666 · 0,2035–0,4882 | 0,0406 · 0,0341 · 0,0291–0,0609 |

Hiệu theo bài (USD), khoảng bootstrap 95 %. Chỉ ghi "rẻ hơn"/"đắt hơn" khi khoảng tách 0 ở cả hai bậc giá.

| Cặp | Bậc giá | n | Hiệu TB | KTC 95 % | > 0 / = 0 / < 0 | Kết luận |
|---|---|---|---|---|---|---|
| O − S | cận dưới | 13 | 0,1668 | [0,1333; 0,2101] | 13 / 0 / 0 | đắt hơn |
| O − S | cận trên | 13 | 0,1668 | [0,1333; 0,2101] | 13 / 0 / 0 | đắt hơn |
| O − S | **cả hai bậc** | | | | | **đắt hơn** |
| H − S | cận dưới | 13 | -0,1064 | [-0,1178; -0,0973] | 0 / 0 / 13 | rẻ hơn |
| H − S | cận trên | 13 | -0,0740 | [-0,0828; -0,0668] | 0 / 0 / 13 | rẻ hơn |
| H − S | **cả hai bậc** | | | | | **rẻ hơn** |

## 3. Dòng không phải `done` (failed), báo riêng, không vào phép so

Tổng: 4 dòng; dòng thiếu `usage`: 0; tổng token có trọng số (`weighted()` trên `usage.tokens`): 415 205; USD: cận dưới 1,5659, cận trên 1,6203.

| Arm | Số dòng | Dòng thiếu usage | Token có trọng số | USD cận dưới | USD cận trên |
|---|---|---|---|---|---|
| O | 3 | 0 | 309 654 | 1,5523 | 1,5523 |
| H | 1 | 0 | 105 551 | 0,0136 | 0,0681 |

