# Bảng số vòng 3, gói 3 (sinh bởi `docs/research/analysis/prereg-tests.mjs`; không sửa tay)

> Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Mọi số trong tệp này do script sinh; `--check` so lại với đầu ra script.

## 0. Nhận dạng phiên chạy

| Mục | Giá trị |
| --- | --- |
| Script | prereg-tests v1 (round 3) |
| Hash commit 1 (script + test + quy tắc loại, trước khi có tệp này) | (chưa ghi) |
| sha256 `prereg-tests.mjs` (xuống dòng LF) | `3020ca47307bc6553a3ad715952411194256936eed515b50dd4384b804fb6506` |
| Hash git (blob) `runs.jsonl` | `9131f7768ff1badc4f50264de37ac4cae1bc0d5c` |
| sha256 `runs.jsonl` | `0dcee84066a9d9ee2d62a9ff36e594492f1f1dd62a5cbc9e607f24aec2a2cffb` |
| Hạt, số mẫu bootstrap | 20261102, B = 4000 (hai tầng: lấy lại bài rồi lấy lại lượt trong ô; khớp `compare` của analyze.mjs) |
| CI / biên | B-01: CI 90 % phân vị, biên [0,85; 1,15]; H5: CI 95 % phân vị |
| Số dòng đọc | 448 |

Ghi chú giờ: tệp `runs.jsonl` được commit sau khi dữ liệu W1–B7a đã có; script và hash này được ghi sau khi dữ liệu đã có (xem §9 `preregistration.md`, do hạng mục S2 ghi). Không có ngày ghi lùi.

## 1. Loại lượt (§4.1, §4.3: Q, L, T, E1, E4)

Cờ tính tự động từ `status`, `leak`, `error`, `_FINAL.txt` (nếu có), `wallSec` so với hạn 20 phút (`--timeout 20`, mọi `config-*.json`). Không dùng `score`.

| Cửa sổ | Server | Dòng đọc | Theo RUNLOG | done | Bị loại | Dòng RUNLOG |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| W1 | main e0bd2f4 | 54 | 54 | 54 | 0 | RUNLOG.md:12 |
| W2a | main e0bd2f4 | 24 | 24 | 24 | 0 | RUNLOG.md:13 |
| W2b | nhánh 7fb18ba | 30 | 30 | 30 | 0 | RUNLOG.md:14 |
| W2c | main e0bd2f4 | 14 | 14 | 14 | 0 | RUNLOG.md:15 |
| B7a | nhánh 7fb18ba | 326 | 75 | 318 | 16 | RUNLOG.md:16 |

Số lượt bị loại: **16**. Giữ lại để phân tích: 432. Cờ giám sát: lượt `failed` giữ vì hết giờ không có chứng cứ hạ tầng (T-giữ) 0; `failed`/`error` giữ như kết quả (N1) 0; lượt `done` có wallSec ≥ 98 % hạn 0; lượt `done` có token có trọng số ≈ 0 0.

## 2. B-01 (§3.2): B7 (làn đơn) so với A0-sonnet trên t1–t5

Chỉ số đo bằng token có trọng số, không có độ nhạy USD (SR-02 chưa xong). Server nhánh `7fb18ba` cho cả hai arm. p bootstrap = (k + 1)/(B + 1), xấp xỉ, chỉ kèm theo; phán quyết theo CI (§2.4).

### Chính: A0 cùng cửa sổ B7a (r4–9) so với B7 r1–9

Cỡ ô A0 theo bài t1–t5: 6/6/6/6/6; B7: 9/9/9/9/9.

| Phép | R = B7/A0 (mũ của TB log-tỉ số) | CI 90 % | p bootstrap (xấp xỉ) | Kết luận |
| --- | ---: | --- | ---: | --- |
| (a) token có trọng số | 2,498 | [2,02; 3,18] | 1,0000 | bác bỏ |
| (b) thời gian thực | 2,566 | [2,09; 3,25] | 1,0000 | bác bỏ |
| (c) điểm (có trần §2.7) | n/a | [n/a; n/a] | n/a | không kết luận (trần: còn 0 bài không chạm trần (< 3)) |

(c): bài chạm trần (mọi lượt cả hai arm ≥ 0.99) bị bỏ: t1-duration, t2-orders, t3-api, t4-perf, t5-logq; bài còn lại: không có. Δ điểm tuyệt đối (B7 − A0, TB theo bài, mọi 5 bài, báo kèm theo §3.2): -0,04 pp.
**B-01 (IUT ba phép): bác bỏ.**

### Độ nhạy 1: A0 gộp W2b + B7a (r1–9)

Cỡ ô A0 theo bài t1–t5: 9/9/9/9/9; B7: 9/9/9/9/9.

| Phép | R = B7/A0 (mũ của TB log-tỉ số) | CI 90 % | p bootstrap (xấp xỉ) | Kết luận |
| --- | ---: | --- | ---: | --- |
| (a) token có trọng số | 2,511 | [2,05; 3,20] | 1,0000 | bác bỏ |
| (b) thời gian thực | 2,563 | [2,09; 3,27] | 1,0000 | bác bỏ |
| (c) điểm (có trần §2.7) | n/a | [n/a; n/a] | n/a | không kết luận (trần: còn 0 bài không chạm trần (< 3)) |

(c): bài chạm trần (mọi lượt cả hai arm ≥ 0.99) bị bỏ: t1-duration, t2-orders, t3-api, t4-perf, t5-logq; bài còn lại: không có. Δ điểm tuyệt đối (B7 − A0, TB theo bài, mọi 5 bài, báo kèm theo §3.2): -0,04 pp.
**B-01 (IUT ba phép): bác bỏ.**

### Độ nhạy 2: chỉ lượt r4–9 cho cả hai arm

Cỡ ô A0 theo bài t1–t5: 6/6/6/6/6; B7: 6/6/6/6/6.

| Phép | R = B7/A0 (mũ của TB log-tỉ số) | CI 90 % | p bootstrap (xấp xỉ) | Kết luận |
| --- | ---: | --- | ---: | --- |
| (a) token có trọng số | 2,534 | [2,04; 3,22] | 1,0000 | bác bỏ |
| (b) thời gian thực | 2,609 | [2,12; 3,31] | 1,0000 | bác bỏ |
| (c) điểm (có trần §2.7) | n/a | [n/a; n/a] | n/a | không kết luận (trần: còn 0 bài không chạm trần (< 3)) |

(c): bài chạm trần (mọi lượt cả hai arm ≥ 0.99) bị bỏ: t1-duration, t2-orders, t3-api, t4-perf, t5-logq; bài còn lại: không có. Δ điểm tuyệt đối (B7 − A0, TB theo bài, mọi 5 bài, báo kèm theo §3.2): 0,00 pp.
**B-01 (IUT ba phép): bác bỏ.**

So sánh trạng thái giữa bản chính và độ nhạy: bác bỏ / bác bỏ / bác bỏ (giống nhau).

Điểm theo bài, A0 ở hai cửa sổ (kiểm tính tương thích để gộp, mô tả):

| Bài | A0 W2b (r1–3) TB | A0 B7a (r4–9) TB | B7 (r1–9) TB |
| --- | ---: | ---: | ---: |
| t1-duration | 1,0000 | 0,9991 | 0,9982 |
| t2-orders | 1,0000 | 1,0000 | 1,0000 |
| t3-api | 1,0000 | 1,0000 | 1,0000 |
| t4-perf | 1,0000 | 1,0000 | 1,0000 |
| t5-logq | 1,0000 | 1,0000 | 1,0000 |

## 3. H5 (chi phí): cặp cùng cửa sổ

Tỉ số trung vị theo bài của token có trọng số và wallSec (treatment/baseline), CI 95 % hai tầng (B = 4000, hạt 20261102). "Đạt ngưỡng": bài có token ≥ 3× **và** thời gian ≥ 1,5×. Cột "analyze.mjs" lặp công thức nguyên văn (`:81-83`, lọc riêng từng chuỗi); cột "ghép theo bài" là bản đã sửa lệch chỉ số (SR-06). Ngưỡng 3×/1,5× là của H5 (B0/A0); với B6, B7 chỉ mô tả. **B0 chạy trên `main` e0bd2f4, B6/B7 trên nhánh `7fb18ba`: không so chéo hai server.**

| Cặp | Số bài | Token trung vị (CI 95 %) | Thời gian trung vị (CI 95 %) | Đạt ngưỡng (ghép theo bài) | Đạt ngưỡng (analyze.mjs) |
| --- | ---: | --- | --- | --- | --- |
| W1: B0/A0-sonnet | 9 | ×5,68 [5,05; 6,58] | ×9,60 [6,71; 12,80] | 9/9 = 100 % | 9/9 = 100 % |
| W2a: B0/A0-sonnet | 4 | ×9,54 [5,96; 13,96] | ×11,71 [4,70; 23,71] | 4/4 = 100 % | 4/4 = 100 % |
| W2c (s1 r4–10): B0/A0-sonnet | 1 | ×9,32 [8,70; 9,51] | ×11,05 [10,14; 12,55] | 1/1 = 100 % | 1/1 = 100 % |
| W2b: B6/A0-sonnet | 5 | ×3,78 [3,07; 4,91] | ×3,43 [2,80; 4,88] | 5/5 = 100 % | 5/5 = 100 % |
| B7a (chính: A0 r4–9): B7/A0-sonnet | 18 | ×2,12 [1,78; 3,41] | ×2,03 [1,85; 3,58] | 1/6 = 17 % | 1/6 = 17 % |
| Độ nhạy B7a: A0 gộp r1–9 (W2b + B7a) | 5 | ×1,96 [1,75; 3,81] | ×1,94 [1,78; 4,15] | 1/5 = 20 % | 1/5 = 20 % |

Tỉ số theo bài (token ; thời gian):

- W1 B0: c1-iis-ecs ×5,68 ; ×10,04 · c2-burst-alert ×7,36 ; ×16,13 · c3-shop-bugs ×5,33 ; ×9,06 · c4-audit-chain ×4,50 ; ×5,37 · c5-tickets-api ×4,42 ; ×6,71 · l3-reconcile ×6,68 ; ×9,60 · l4-startup-order ×6,33 ; ×18,46 · re1-lit-synthesis ×5,16 ; ×9,17 · s1-sec-review ×6,02 ; ×11,29
- W2a B0: a1-ambiguous-spec ×6,54 ; ×5,67 · l1-oncall ×13,97 ; ×23,71 · l2-knights ×12,55 ; ×17,75 · r1-elk-design ×5,96 ; ×4,46
- W2c (s1 r4–10) B0: s1-sec-review ×9,32 ; ×11,05
- W2b B6: t1-duration ×3,78 ; ×3,43 · t2-orders ×4,80 ; ×4,73 · t3-api ×3,45 ; ×3,42 · t4-perf ×4,65 ; ×4,64 · t5-logq ×3,07 ; ×2,73
- B7a (chính: A0 r4–9) B7: a1-ambiguous-spec ×2,43 ; ×2,12 · c1-iis-ecs ×n/a ; ×n/a · c2-burst-alert ×n/a ; ×n/a · c3-shop-bugs ×n/a ; ×n/a · c4-audit-chain ×n/a ; ×n/a · c5-tickets-api ×n/a ; ×n/a · l1-oncall ×n/a ; ×n/a · l2-knights ×n/a ; ×n/a · l3-reconcile ×n/a ; ×n/a · l4-startup-order ×n/a ; ×n/a · r1-elk-design ×n/a ; ×n/a · re1-lit-synthesis ×n/a ; ×n/a · s1-sec-review ×n/a ; ×n/a · t1-duration ×1,74 ; ×1,95 · t2-orders ×2,28 ; ×2,85 · t3-api ×1,93 ; ×1,88 · t4-perf ×4,04 ; ×4,79 · t5-logq ×1,96 ; ×1,90

Ghi chú: W2c chỉ có 1 bài (s1), nên CI chỉ phản ánh lấy lại lượt trong ô, không có biến thiên giữa bài. W1 gồm s1 r1–3 và W2c gồm s1 r4–10, tách theo cửa sổ.

## 4. Mô tả (không xác nhận)

### 4.1 Điểm theo bài và theo arm (TB ± sd; số lượt; nhỏ nhất)

| Cửa sổ | Arm | Bài | n | Điểm TB | sd | Nhỏ nhất | Token có trọng số (trung vị) | Thời gian s (trung vị) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| W1 | A0-sonnet | c1-iis-ecs | 3 | 1,0000 | 0,0000 | 1,0000 | 33.631 | 15 |
| W1 | A0-sonnet | c2-burst-alert | 3 | 1,0000 | 0,0000 | 1,0000 | 27.411 | 11 |
| W1 | A0-sonnet | c3-shop-bugs | 3 | 1,0000 | 0,0000 | 1,0000 | 38.153 | 19 |
| W1 | A0-sonnet | c4-audit-chain | 3 | 1,0000 | 0,0000 | 1,0000 | 55.867 | 41 |
| W1 | A0-sonnet | c5-tickets-api | 3 | 1,0000 | 0,0000 | 1,0000 | 60.774 | 36 |
| W1 | A0-sonnet | l3-reconcile | 3 | 1,0000 | 0,0000 | 1,0000 | 33.348 | 23 |
| W1 | A0-sonnet | l4-startup-order | 3 | 1,0000 | 0,0000 | 1,0000 | 25.435 | 8 |
| W1 | A0-sonnet | re1-lit-synthesis | 3 | 1,0000 | 0,0000 | 1,0000 | 44.023 | 22 |
| W1 | A0-sonnet | s1-sec-review | 3 | 1,0000 | 0,0000 | 1,0000 | 30.778 | 13 |
| W1 | B0 | c1-iis-ecs | 3 | 1,0000 | 0,0000 | 1,0000 | 191.108 | 150 |
| W1 | B0 | c2-burst-alert | 3 | 1,0000 | 0,0000 | 1,0000 | 201.856 | 170 |
| W1 | B0 | c3-shop-bugs | 3 | 1,0000 | 0,0000 | 1,0000 | 203.296 | 170 |
| W1 | B0 | c4-audit-chain | 3 | 1,0000 | 0,0000 | 1,0000 | 251.569 | 220 |
| W1 | B0 | c5-tickets-api | 3 | 1,0000 | 0,0000 | 1,0000 | 268.577 | 240 |
| W1 | B0 | l3-reconcile | 3 | 1,0000 | 0,0000 | 1,0000 | 222.686 | 220 |
| W1 | B0 | l4-startup-order | 3 | 1,0000 | 0,0000 | 1,0000 | 160.986 | 140 |
| W1 | B0 | re1-lit-synthesis | 3 | 1,0000 | 0,0000 | 1,0000 | 227.194 | 200 |
| W1 | B0 | s1-sec-review | 3 | 1,0000 | 0,0000 | 1,0000 | 185.381 | 150 |
| W2a | A0-sonnet | a1-ambiguous-spec | 3 | 1,0000 | 0,0000 | 1,0000 | 43.992 | 48 |
| W2a | A0-sonnet | l1-oncall | 3 | 0,8889 | 0,1925 | 0,6667 | 11.802 | 6 |
| W2a | A0-sonnet | l2-knights | 3 | 1,0000 | 0,0000 | 1,0000 | 11.515 | 7 |
| W2a | A0-sonnet | r1-elk-design | 3 | 0,8333 | 0,0722 | 0,7500 | 169.062 | 204 |
| W2a | B0 | a1-ambiguous-spec | 3 | 1,0000 | 0,0000 | 1,0000 | 287.509 | 270 |
| W2a | B0 | l1-oncall | 3 | 1,0000 | 0,0000 | 1,0000 | 164.852 | 140 |
| W2a | B0 | l2-knights | 3 | 1,0000 | 0,0000 | 1,0000 | 144.489 | 130 |
| W2a | B0 | r1-elk-design | 3 | 1,0000 | 0,0000 | 1,0000 | 1.007.298 | 911 |
| W2b | A0-sonnet | t1-duration | 3 | 1,0000 | 0,0000 | 1,0000 | 65.354 | 53 |
| W2b | A0-sonnet | t2-orders | 3 | 1,0000 | 0,0000 | 1,0000 | 48.787 | 34 |
| W2b | A0-sonnet | t3-api | 3 | 1,0000 | 0,0000 | 1,0000 | 113.527 | 79 |
| W2b | A0-sonnet | t4-perf | 3 | 1,0000 | 0,0000 | 1,0000 | 49.504 | 41 |
| W2b | A0-sonnet | t5-logq | 3 | 1,0000 | 0,0000 | 1,0000 | 146.500 | 117 |
| W2b | B6 | t1-duration | 3 | 1,0000 | 0,0000 | 1,0000 | 247.266 | 180 |
| W2b | B6 | t2-orders | 3 | 0,9944 | 0,0096 | 0,9833 | 234.281 | 160 |
| W2b | B6 | t3-api | 3 | 1,0000 | 0,0000 | 1,0000 | 392.066 | 270 |
| W2b | B6 | t4-perf | 3 | 1,0000 | 0,0000 | 1,0000 | 230.296 | 190 |
| W2b | B6 | t5-logq | 3 | 1,0000 | 0,0000 | 1,0000 | 449.622 | 320 |
| W2c | A0-sonnet | s1-sec-review | 7 | 1,0000 | 0,0000 | 1,0000 | 18.745 | 13 |
| W2c | B0 | s1-sec-review | 7 | 1,0000 | 0,0000 | 1,0000 | 174.612 | 140 |
| B7a | A0-sonnet | a1-ambiguous-spec | 8 | 0,9792 | 0,0589 | 0,8333 | 47.766 | 52 |
| B7a | A0-sonnet | t1-duration | 8 | 0,9991 | 0,0026 | 0,9925 | 65.258 | 51 |
| B7a | A0-sonnet | t2-orders | 8 | 1,0000 | 0,0000 | 1,0000 | 52.785 | 32 |
| B7a | A0-sonnet | t3-api | 8 | 1,0000 | 0,0000 | 1,0000 | 115.037 | 80 |
| B7a | A0-sonnet | t4-perf | 8 | 1,0000 | 0,0000 | 1,0000 | 49.165 | 35 |
| B7a | A0-sonnet | t5-logq | 8 | 1,0000 | 0,0000 | 1,0000 | 139.730 | 111 |
| B7a | B7 | a1-ambiguous-spec | 3 | 1,0000 | 0,0000 | 1,0000 | 116.236 | 110 |
| B7a | B7 | c1-iis-ecs | 3 | 1,0000 | 0,0000 | 1,0000 | 52.524 | 40 |
| B7a | B7 | c2-burst-alert | 3 | 1,0000 | 0,0000 | 1,0000 | 44.998 | 40 |
| B7a | B7 | c3-shop-bugs | 3 | 1,0000 | 0,0000 | 1,0000 | 131.691 | 90 |
| B7a | B7 | c4-audit-chain | 3 | 1,0000 | 0,0000 | 1,0000 | 100.746 | 90 |
| B7a | B7 | c5-tickets-api | 3 | 1,0000 | 0,0000 | 1,0000 | 98.154 | 80 |
| B7a | B7 | l1-oncall | 3 | 1,0000 | 0,0000 | 1,0000 | 90.006 | 90 |
| B7a | B7 | l2-knights | 3 | 1,0000 | 0,0000 | 1,0000 | 61.404 | 60 |
| B7a | B7 | l3-reconcile | 3 | 1,0000 | 0,0000 | 1,0000 | 106.464 | 100 |
| B7a | B7 | l4-startup-order | 3 | 1,0000 | 0,0000 | 1,0000 | 74.581 | 70 |
| B7a | B7 | r1-elk-design | 3 | 1,0000 | 0,0000 | 1,0000 | 338.496 | 430 |
| B7a | B7 | re1-lit-synthesis | 3 | 1,0000 | 0,0000 | 1,0000 | 106.822 | 80 |
| B7a | B7 | s1-sec-review | 3 | 1,0000 | 0,0000 | 1,0000 | 66.394 | 50 |
| B7a | B7 | t1-duration | 9 | 0,9982 | 0,0035 | 0,9918 | 113.745 | 100 |
| B7a | B7 | t2-orders | 9 | 1,0000 | 0,0000 | 1,0000 | 120.593 | 90 |
| B7a | B7 | t3-api | 9 | 1,0000 | 0,0000 | 1,0000 | 222.027 | 150 |
| B7a | B7 | t4-perf | 9 | 1,0000 | 0,0000 | 1,0000 | 198.661 | 170 |
| B7a | B7 | t5-logq | 9 | 1,0000 | 0,0000 | 1,0000 | 273.321 | 210 |

Điểm theo arm (mọi bài, mọi cửa sổ; không so chéo vì bài khác nhau):

| Arm | Lượt | Điểm TB | Token có trọng số TB | Thời gian s (trung vị) |
| --- | ---: | ---: | ---: | ---: |
| A0-sonnet | 109 | 0,9908 | 63.691 | 40 |
| B0 | 59 | 1,0000 | 296.846 | 200 |
| B6 | 79 | 0,9964 | 251.069 | 180 |
| B7 | 84 | 0,9998 | 161.388 | 100 |

### 4.2 Làn nhanh (B6), làn đơn (B7), B0 trên t1–t5

**B0 không chạy t1–t5; không có so sánh B0 với B6/B7 trên cùng bài. B0 ở server `main`, B6/B7 ở nhánh `7fb18ba`.** Tỉ số dưới đây là mô tả (TB theo bài của log-tỉ số, CI 90 % hai tầng, B = 4000): B6/A0 trong W2b (r1–3), B7/A0 trong B7a (A0 r4–9), và B7/B6 (khác cửa sổ, chung server).

| Cặp | Chỉ số | R | CI 90 % |
| --- | --- | ---: | --- |
| B6/A0 (W2b) | token | 3,89 | [3,42; 4,43] |
| B6/A0 (W2b) | thời gian | 3,76 | [3,17; 4,51] |
| B7/A0 (B7a) | token | 2,51 | [2,06; 3,16] |
| B7/A0 (B7a) | thời gian | 2,59 | [2,11; 3,27] |
| B7/B6 (khác cửa sổ) | token | 0,65 | [0,55; 0,77] |
| B7/B6 (khác cửa sổ) | thời gian | 0,68 | [0,58; 0,79] |

| Arm (t1–t5) | Điểm TB theo bài (t1…t5) | TB |
| --- | --- | ---: |
| A0-sonnet (W2b) | 1,0000 · 1,0000 · 1,0000 · 1,0000 · 1,0000 | 1,0000 |
| B6 (W2b) | 1,0000 · 0,9944 · 1,0000 · 1,0000 · 1,0000 | 0,9989 |
| A0-sonnet (B7a) | 0,9991 · 1,0000 · 1,0000 · 1,0000 · 1,0000 | 0,9998 |
| B7 (B7a) | 0,9982 · 1,0000 · 1,0000 · 1,0000 · 1,0000 | 0,9996 |

## 5. H3, H6, H7 và họ Holm (§2.5, §3.1)

| Giả thuyết | Cần (§3.1) | Hiện có | Trạng thái |
| --- | --- | --- | --- |
| H3 (review, s1) | r = 10 mỗi arm (A0-sonnet, B0) | s1: A0-sonnet 10, B0 10 | **Đủ N nhưng không tính p**: SR-26 chưa có; phương án lùi §2.5 hạ H3 xuống ước lượng kèm CI (không phán Holm) |
| H6 (A1/A2 ≈ B0) | A1 r = 3, A2 r = 2 trên l1-modules, l2-chain, t1–t5 | arm có mặt: B0, A0-sonnet, B6, B7, B5, A1, A2; không có A1, A2 | **chưa đủ N**, không tính p |
| H7 (SD B0/A0 ≤ 0,7) | r = 5 mỗi ô, ≥ 3 bài | bài có r ≥ 5 ở cả A0-sonnet và B0: a1-ambiguous-spec, s1-sec-review (2 bài) | **chưa đủ N**, không tính p |

**Họ Holm {H3, H6}: rỗng (K = 0).** SR-26 chưa có mã (H3, H6 hạ xuống ước lượng), H6 còn thiếu A1/A2 và t1–t5 không chạy ở các arm đó. Không giả thuyết nào được gọi "xác nhận" bằng Holm trong vòng này (§2.5).

Ước lượng mô tả cho H3 trên s1 (B0 − A0-sonnet; không có p; cả hai cửa sổ W1 r1–3 và W2c r4–10, cùng server `main`):

- recall: 0,0 pp [0,0; 0,0] (n 10/10)
- precision: 0,0 pp [0,0; 0,0] (n 10/10)

## 6. Giới hạn của bảng này

- Các arm chạy ở cửa sổ khác nhau, hai server khác phiên bản; không có ngẫu nhiên hóa chéo cửa sổ.
- A0-sonnet cùng cửa sổ B7a chỉ có 6 lượt mỗi ô (đăng ký 9); bản gộp có 9 lượt mỗi ô nhưng A0 r1–3 chạy ở W2b.
- p bootstrap là xấp xỉ; phán quyết dùng CI (§2.4). Trần (c) theo quy tắc mức lượt, áp trên dữ liệu xác nhận vì không có pilot cho t1–t5 (khác chữ §2.7: "chỉ bằng pilot"); đây là sai lệch cần S2 ghi ở §9.
- Cờ L chỉ loại theo `leak`, chưa kiểm tay (không có dòng nào).
