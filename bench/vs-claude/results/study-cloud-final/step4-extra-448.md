# Bước 4 RUNBOOK: phân tích bổ sung trên 276 lượt (sinh bởi `step4-extra.mjs`; không sửa tay)

Dòng đọc: 448; giữ sau quy tắc loại của `prereg-tests.mjs` (`classifyRows`): 432. Hạt 20261102, B = 4000, biên [0.85; 1.15].

## 1. B-01 cho làn nhanh B6 (FL) trên t1–t5 (`run-plan.md` §4: "B-01 TOST (FL, 45 lượt/arm)")

B6 r1–3 chạy ở W2b, r4–9 ở B6b; A0-sonnet r1–3 ở W2b, r4–9 ở B7a. Cùng server nhánh `7fb18ba`, khác cửa sổ trong một arm. Bản cùng cửa sổ chỉ có W2b (r1–3).

### Chính: A0-sonnet r1–9 so với B6 r1–9 (45/45 lượt)

Cỡ ô A0-sonnet: 9/9/9/9/9; B6: 9/9/9/9/9.

| Phép | R = B6/A0-sonnet | CI 90 % | Kết luận |
| --- | ---: | --- | --- |
| (a) token có trọng số | 3,921 | [3,49; 4,43] | bác bỏ |
| (b) thời gian thực | 4,047 | [3,45; 4,76] | bác bỏ |
| (c) điểm (trần §2.7) | 0,987 | [0,98; 0,99] | không kết luận (trần: còn 1 bài không chạm trần (< 3)) |

**IUT ba phép: bác bỏ.**

### Độ nhạy: chỉ cùng cửa sổ W2b (r1–3 cả hai arm)

Cỡ ô A0-sonnet: 3/3/3/3/3; B6: 3/3/3/3/3.

| Phép | R = B6/A0-sonnet | CI 90 % | Kết luận |
| --- | ---: | --- | --- |
| (a) token có trọng số | 3,886 | [3,42; 4,43] | bác bỏ |
| (b) thời gian thực | 3,756 | [3,17; 4,51] | bác bỏ |
| (c) điểm (trần §2.7) | 0,994 | [0,99; 1,00] | không kết luận (trần: còn 1 bài không chạm trần (< 3)) |

**IUT ba phép: bác bỏ.**

### Độ nhạy: A0-sonnet r1–11 (có 2 lượt neo) so với B6 r1–9

Cỡ ô A0-sonnet: 11/11/11/11/11; B6: 9/9/9/9/9.

| Phép | R = B6/A0-sonnet | CI 90 % | Kết luận |
| --- | ---: | --- | --- |
| (a) token có trọng số | 3,934 | [3,51; 4,39] | bác bỏ |
| (b) thời gian thực | 4,074 | [3,47; 4,75] | bác bỏ |
| (c) điểm (trần §2.7) | 0,987 | [0,98; 0,99] | không kết luận (trần: còn 1 bài không chạm trần (< 3)) |

**IUT ba phép: bác bỏ.**

## 2. B-01 (B7) với 2 lượt neo A0-sonnet r10–11

### Độ nhạy: A0-sonnet r1–11 so với B7 r1–9

Cỡ ô A0-sonnet: 11/11/11/11/11; B7: 9/9/9/9/9.

| Phép | R = B7/A0-sonnet | CI 90 % | Kết luận |
| --- | ---: | --- | --- |
| (a) token có trọng số | 2,519 | [2,05; 3,13] | bác bỏ |
| (b) thời gian thực | 2,580 | [2,10; 3,25] | bác bỏ |
| (c) điểm (trần §2.7) | n/a | [n/a; n/a] | không kết luận (trần: còn 0 bài không chạm trần (< 3)) |

**IUT ba phép: bác bỏ.**

## 3. B7 trên 13 bài ngoài t1–t5 (B7b), mô tả

**Khác cửa sổ và khác server:** B7 chạy ở B7b (nhánh `7fb18ba`), A0-sonnet r1–3 ở W1/W2a (runner trước/sau `7fb18ba`), B0 ở W1/W2a (`main` `e0bd2f4`). Tỉ số dưới đây chỉ là mô tả, không phải phép xác nhận.

- B7/A0-sonnet (13 bài, r1–3): token ×2,607 [2,13; 3,23], thời gian ×3,965 [3,11; 5,23] (CI 90 %)
- B7/B0 (13 bài, r1–3): token ×0,396 [0,35; 0,45], thời gian ×0,406 [0,36; 0,46] (CI 90 %)

Theo bài (TB token có trọng số ; TB thời gian, r1–3), B7 so A0-sonnet:

| Bài | A0-sonnet token | B7 token | × | A0-sonnet s | B7 s | × |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| a1-ambiguous-spec | 44362 | 116185 | 2,62 | 48 | 113 | 2,38 |
| c1-iis-ecs | 34036 | 55616 | 1,63 | 15 | 47 | 3,18 |
| c2-burst-alert | 27887 | 45522 | 1,63 | 14 | 40 | 2,95 |
| c3-shop-bugs | 38000 | 131068 | 3,45 | 20 | 90 | 4,58 |
| c4-audit-chain | 59000 | 96811 | 1,64 | 38 | 87 | 2,28 |
| c5-tickets-api | 57538 | 101648 | 1,77 | 36 | 83 | 2,35 |
| l1-oncall | 11779 | 89333 | 7,58 | 6 | 87 | 14,83 |
| l2-knights | 11719 | 63101 | 5,38 | 7 | 60 | 8,27 |
| l3-reconcile | 33938 | 110724 | 3,26 | 21 | 107 | 5,12 |
| l4-startup-order | 30781 | 73687 | 2,39 | 9 | 67 | 7,17 |
| r1-elk-design | 170038 | 336986 | 1,98 | 205 | 427 | 2,08 |
| re1-lit-synthesis | 41458 | 111676 | 2,69 | 24 | 87 | 3,65 |
| s1-sec-review | 31103 | 67245 | 2,16 | 17 | 53 | 3,20 |

## 4. Điểm mô tả trên 13 bài (TB theo arm, r1–3; không phán)

| Bài | A0-sonnet | B0 | B7 |
| --- | ---: | ---: | ---: |
| a1-ambiguous-spec | 1,000 | 1,000 | 1,000 |
| c1-iis-ecs | 1,000 | 1,000 | 1,000 |
| c2-burst-alert | 1,000 | 1,000 | 1,000 |
| c3-shop-bugs | 1,000 | 1,000 | 1,000 |
| c4-audit-chain | 1,000 | 1,000 | 1,000 |
| c5-tickets-api | 1,000 | 1,000 | 1,000 |
| l1-oncall | 0,889 | 1,000 | 1,000 |
| l2-knights | 1,000 | 1,000 | 1,000 |
| l3-reconcile | 1,000 | 1,000 | 1,000 |
| l4-startup-order | 1,000 | 1,000 | 1,000 |
| r1-elk-design | 0,833 | 1,000 | 1,000 |
| re1-lit-synthesis | 1,000 | 1,000 | 1,000 |
| s1-sec-review | 1,000 | 1,000 | 1,000 |

Lưu ý: a1, r1 ở W2a có `--judge` (A0-sonnet, B0), B7b không có `--judge`: điểm hai bài này không so được (SR-07, V3-08).
