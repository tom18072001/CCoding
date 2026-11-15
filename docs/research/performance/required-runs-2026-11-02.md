# Đầu ra nguyên văn của bước (1), gói R3-1 (2/11/2026)

Sinh từ HEAD `baf89e8` (cây làm việc gồm các sửa của R2), seed 20261102 (mặc định của `stats.mjs`), Node ≥ 22. Đầu ra dán nguyên văn từ lệnh, không chỉnh. C8 chỉ có `t2-orders.ccoding-fastlane` × 3, **không có Sonnet đơn**, nên C8 không có cặp so sánh; phần Sonnet của mục 1 chỉ đến từ C7.

Tệp này là nguồn tham chiếu của `preregistration.md` §2.2. Không sinh lại tự động; chạy lại bằng các lệnh bên dưới.

## 1. So sánh C7+C8 (H1, H2 mô tả)

`node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --rounds C7,C8 --format md`

```text
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=C7,C8 tasks=* exclude=- · 18/75 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 1 / 2 | 43,5 | [40,0; 47,0] | 1,664 | [1,580; 1,758] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 4 / 2 | 73,3 | [41,8; 108,5] | 2,765 | [2,006; 3,614] | 0,1333 | exact (15 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 1 / 2 | 84,5 | [77,0; 92,0] | 1,786 | [1,670; 1,920] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 1 / 2 | 71,0 | [67,0; 75,0] | 2,449 | [2,264; 2,667] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 1 / 2 | -38,5 | [-45,0; -32,0] | 0,767 | [0,738; 0,799] | 0,3333 | exact (3 tổ hợp) | -1,00 | CC < đối chứng |
| GỘP (TB các bài) | 8 / 10 | 46,8 | [39,7; 54,5] | 1,545 | [1,452; 1,647] | 0,0132 | exact (1215 tổ hợp) | 0,75 | CC > đối chứng |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 1 / 2 | 0,199 | [0,177; 0,220] | 1,994 | [1,800; 2,236] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 4 / 2 | 0,537 | [0,294; 0,895] | 4,435 | [2,877; 6,720] | 0,2000 | exact (15 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 1 / 2 | 0,785 | [0,770; 0,801] | 3,304 | [3,163; 3,457] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 1 / 2 | 0,384 | [0,372; 0,395] | 3,564 | [3,317; 3,851] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 1 / 2 | 0,599 | [0,586; 0,612] | 2,364 | [2,295; 2,437] | 0,3333 | exact (3 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 8 / 10 | 0,501 | [0,451; 0,572] | 2,947 | [2,727; 3,235] | 0,0008 | exact (1215 tổ hợp) | 1,00 | CC > đối chứng |
```

## 2. Số lượt cần mỗi ô, Δ thời gian 30 s, Δ chi phí 0,1 USD

`node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=30,cost=0.1`

```text
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=* exclude=- · 51/75 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 150,3 | [92,2; 208,3] | 3,294 | [2,395; 4,235] | 0,0364 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 78,9 | [60,6; 95,8] | 2,901 | [2,455; 3,310] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 206,8 | [115,4; 315,5] | 2,923 | [2,057; 4,005] | 0,0889 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 191,3 | [83,0; 335,7] | 4,905 | [2,679; 7,915] | 0,2143 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 79,1 | [6,9; 159,8] | 1,478 | [1,042; 1,977] | 0,4222 | exact (45 tổ hợp) | 0,38 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 141,3 | [104,7; 181,0] | 2,647 | [2,214; 3,120] | 0,0020 | monte-carlo (205821000 tổ hợp) | 0,88 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 88,6 | 30,0 | 137 | >60 |
| t2-orders | 28,1 | 30,0 | 14 | 9 |
| t3-api | 143,9 | 30,0 | 362 | >60 |
| t4-perf | 162,7 | 30,0 | 462 | >60 |
| t5-logq | 110,7 | 30,0 | 214 | >60 |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 0,514 | [0,338; 0,729] | 3,575 | [2,607; 4,862] | 0,0909 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 0,555 | [0,428; 0,702] | 4,550 | [3,735; 5,489] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 0,988 | [0,784; 1,257] | 3,897 | [3,264; 4,734] | 0,0222 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 0,634 | [0,403; 0,933] | 5,234 | [3,637; 7,283] | 0,0714 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 0,928 | [0,659; 1,253] | 3,113 | [2,495; 3,877] | 0,0444 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 0,724 | [0,622; 0,835] | 3,814 | [3,401; 4,274] | 0,0001 | monte-carlo (205821000 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 0,297 | 0,100 | 139 | >60 |
| t2-orders | 0,220 | 0,100 | 76 | 35 |
| t3-api | 0,344 | 0,100 | 186 | >60 |
| t4-perf | 0,340 | 0,100 | 182 | >60 |
| t5-logq | 0,434 | 0,100 | 296 | >60 |
```

## 3. Số lượt cần mỗi ô theo Δ quan sát được (H2)

`node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim`

```text
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=* exclude=- · 51/75 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 150,3 | [92,2; 208,3] | 3,294 | [2,395; 4,235] | 0,0364 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 78,9 | [60,6; 95,8] | 2,901 | [2,455; 3,310] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 206,8 | [115,4; 315,5] | 2,923 | [2,057; 4,005] | 0,0889 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 191,3 | [83,0; 335,7] | 4,905 | [2,679; 7,915] | 0,2143 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 79,1 | [6,9; 159,8] | 1,478 | [1,042; 1,977] | 0,4222 | exact (45 tổ hợp) | 0,38 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 141,3 | [104,7; 181,0] | 2,647 | [2,214; 3,120] | 0,0020 | monte-carlo (205821000 tổ hợp) | 0,88 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 88,6 | 150,3 | 6 | 3 |
| t2-orders | 28,1 | 78,9 | 2 | 2 |
| t3-api | 143,9 | 206,8 | 8 | 3 |
| t4-perf | 162,7 | 191,3 | 12 | 4 |
| t5-logq | 110,7 | 79,1 | 31 | 14 |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 0,514 | [0,338; 0,729] | 3,575 | [2,607; 4,862] | 0,0909 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 0,555 | [0,428; 0,702] | 4,550 | [3,735; 5,489] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 0,988 | [0,784; 1,257] | 3,897 | [3,264; 4,734] | 0,0222 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 0,634 | [0,403; 0,933] | 5,234 | [3,637; 7,283] | 0,0714 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 0,928 | [0,659; 1,253] | 3,113 | [2,495; 3,877] | 0,0444 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 0,724 | [0,622; 0,835] | 3,814 | [3,401; 4,274] | 0,0001 | monte-carlo (205821000 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 0,297 | 0,514 | 6 | 2 |
| t2-orders | 0,220 | 0,555 | 3 | 2 |
| t3-api | 0,344 | 0,988 | 2 | 2 |
| t4-perf | 0,340 | 0,634 | 5 | 2 |
| t5-logq | 0,434 | 0,928 | 4 | 2 |
```

## 4. Biên Δ của H1 (D10: stats.mjs không có cờ tỉ số; Δ = 0,3 × thời gian TB Sonnet đơn C7 theo bài)

Mỗi bài: `node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --delta wall=<Δ> --tasks <bài>`, với Δ = 19.7, 12.5, 32.3, 14.7, 49.7 cho t1…t5.

```text
### t1-duration wall=19.7
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=t1-duration exclude=- · 11/75 lượt
bài dùng được: t1-duration

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 150,3 | [92,2; 208,3] | 3,294 | [2,395; 4,235] | 0,0364 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 9 / 2 | 150,3 | [92,2; 208,3] | 3,294 | [2,395; 4,235] | 0,0364 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 88,6 | 19,7 | 318 | – |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 0,514 | [0,338; 0,729] | 3,575 | [2,607; 4,862] | 0,0909 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 9 / 2 | 0,514 | [0,338; 0,729] | 3,575 | [2,607; 4,862] | 0,0909 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 0,297 | 0,514 | 6 | – |
### t2-orders wall=12.5
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=t2-orders exclude=- · 12/75 lượt
bài dùng được: t2-orders

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t2-orders | 10 / 2 | 78,9 | [60,6; 95,8] | 2,901 | [2,455; 3,310] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 10 / 2 | 78,9 | [60,6; 95,8] | 2,901 | [2,455; 3,310] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t2-orders | 28,1 | 12,5 | 80 | – |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t2-orders | 10 / 2 | 0,555 | [0,428; 0,702] | 4,550 | [3,735; 5,489] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 10 / 2 | 0,555 | [0,428; 0,702] | 4,550 | [3,735; 5,489] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t2-orders | 0,220 | 0,555 | 3 | – |
### t3-api wall=32.3
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=t3-api exclude=- · 10/75 lượt
bài dùng được: t3-api

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t3-api | 8 / 2 | 206,8 | [115,4; 315,5] | 2,923 | [2,057; 4,005] | 0,0889 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 8 / 2 | 206,8 | [115,4; 315,5] | 2,923 | [2,057; 4,005] | 0,0889 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t3-api | 143,9 | 32,3 | 312 | – |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t3-api | 8 / 2 | 0,988 | [0,784; 1,257] | 3,897 | [3,264; 4,734] | 0,0222 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 8 / 2 | 0,988 | [0,784; 1,257] | 3,897 | [3,264; 4,734] | 0,0222 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t3-api | 0,344 | 0,988 | 2 | – |
### t4-perf wall=14.7
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=t4-perf exclude=- · 8/75 lượt
bài dùng được: t4-perf

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t4-perf | 6 / 2 | 191,3 | [83,0; 335,7] | 4,905 | [2,679; 7,915] | 0,2143 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 6 / 2 | 191,3 | [83,0; 335,7] | 4,905 | [2,679; 7,915] | 0,2143 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t4-perf | 162,7 | 14,7 | 1924 | – |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t4-perf | 6 / 2 | 0,634 | [0,403; 0,933] | 5,234 | [3,637; 7,283] | 0,0714 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 6 / 2 | 0,634 | [0,403; 0,933] | 5,234 | [3,637; 7,283] | 0,0714 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t4-perf | 0,340 | 0,634 | 5 | – |
### t5-logq wall=49.7
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=t5-logq exclude=- · 10/75 lượt
bài dùng được: t5-logq

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t5-logq | 8 / 2 | 79,1 | [6,9; 159,8] | 1,478 | [1,042; 1,977] | 0,4222 | exact (45 tổ hợp) | 0,38 | CC > đối chứng |
| GỘP (TB các bài) | 8 / 2 | 79,1 | [6,9; 159,8] | 1,478 | [1,042; 1,977] | 0,4222 | exact (45 tổ hợp) | 0,38 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t5-logq | 110,7 | 49,7 | 78 | – |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t5-logq | 8 / 2 | 0,928 | [0,659; 1,253] | 3,113 | [2,495; 3,877] | 0,0444 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 8 / 2 | 0,928 | [0,659; 1,253] | 3,113 | [2,495; 3,877] | 0,0444 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t5-logq | 0,434 | 0,928 | 4 | – |
```

## 5. H1 gộp 5 bài, Δ = 25,7 s (0,3 × 85,8)

`node bench/vs-claude/harness/stats.mjs --baseline claude-sonnet --required-runs --sim --delta wall=25.7,cost=0.1`

```text
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding* · đối chứng = claude-sonnet
bộ lọc: rounds=* tasks=* exclude=- · 51/75 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 150,3 | [92,2; 208,3] | 3,294 | [2,395; 4,235] | 0,0364 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 78,9 | [60,6; 95,8] | 2,901 | [2,455; 3,310] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 206,8 | [115,4; 315,5] | 2,923 | [2,057; 4,005] | 0,0889 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 191,3 | [83,0; 335,7] | 4,905 | [2,679; 7,915] | 0,2143 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 79,1 | [6,9; 159,8] | 1,478 | [1,042; 1,977] | 0,4222 | exact (45 tổ hợp) | 0,38 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 141,3 | [104,7; 181,0] | 2,647 | [2,214; 3,120] | 0,0020 | monte-carlo (205821000 tổ hợp) | 0,88 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 88,6 | 25,7 | 187 | >60 |
| t2-orders | 28,1 | 25,7 | 19 | 11 |
| t3-api | 143,9 | 25,7 | 493 | >60 |
| t4-perf | 162,7 | 25,7 | 630 | >60 |
| t5-logq | 110,7 | 25,7 | 292 | >60 |

### Chi phí (USD)

| Phạm vi | n CC / n claude-sonnet | Chênh lệch CC − claude-sonnet | CI 95% | Tỉ lệ CC/claude-sonnet | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 9 / 2 | 0,514 | [0,338; 0,729] | 3,575 | [2,607; 4,862] | 0,0909 | exact (55 tổ hợp) | 1,00 | CC > đối chứng |
| t2-orders | 10 / 2 | 0,555 | [0,428; 0,702] | 4,550 | [3,735; 5,489] | 0,0152 | exact (66 tổ hợp) | 1,00 | CC > đối chứng |
| t3-api | 8 / 2 | 0,988 | [0,784; 1,257] | 3,897 | [3,264; 4,734] | 0,0222 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| t4-perf | 6 / 2 | 0,634 | [0,403; 0,933] | 5,234 | [3,637; 7,283] | 0,0714 | exact (28 tổ hợp) | 1,00 | CC > đối chứng |
| t5-logq | 8 / 2 | 0,928 | [0,659; 1,253] | 3,113 | [2,495; 3,877] | 0,0444 | exact (45 tổ hợp) | 1,00 | CC > đối chứng |
| GỘP (TB các bài) | 41 / 10 | 0,724 | [0,622; 0,835] | 3,814 | [3,401; 4,274] | 0,0001 | monte-carlo (205821000 tổ hợp) | 1,00 | CC > đối chứng |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 0,297 | 0,100 | 139 | >60 |
| t2-orders | 0,220 | 0,100 | 76 | 35 |
| t3-api | 0,344 | 0,100 | 186 | >60 |
| t4-perf | 0,340 | 0,100 | 182 | >60 |
| t5-logq | 0,434 | 0,100 | 296 | >60 |
```

## 6. H3 (test ẩn đạt, biên 2 điểm %)

`stats.mjs` không có cờ cho biến này; công thức n theo phương sai suy biến vì sd = 0 ở mọi ô có n ≥ 2 (D9). Dùng quy tắc ba, xem `preregistration.md` H3. Bảng phương sai dưới đây cho thấy sd bằng 0.

## 7. Phương sai theo bài × hệ (C7, C8)

`node docs/research/performance/scripts/variance-by-cell.mjs C7,C8`

```text
| Bài | Hệ | Vòng | n | Thời gian TB (s) | sd | Chi phí TB (USD) | sd | Test ẩn đạt TB (%) | sd (điểm %) | Σ test ẩn lỗi / Σ test ẩn |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| t1-duration | ccoding-fastlane | C7 | 1 | 109,0 | – | 0,398 | – | 100,00 | – | 0 / 149 |
| t1-duration | claude-sonnet | C7 | 2 | 65,5 | 4,9 | 0,200 | 0,030 | 100,00 | 0,00 | 0 / 298 |
| t2-orders | ccoding-fastlane | C7 | 1 | 71,0 | – | 0,396 | – | 86,67 | – | 8 / 60 |
| t2-orders | ccoding-fastlane | C8 | 3 | 129,3 | 33,0 | 0,793 | 0,370 | 100,00 | 0,00 | 0 / 180 |
| t2-orders | claude-sonnet | C7 | 2 | 41,5 | 0,7 | 0,156 | 0,001 | 100,00 | 0,00 | 0 / 120 |
| t3-api | ccoding-fastlane | C7 | 1 | 192,0 | – | 1,126 | – | 100,00 | – | 0 / 87 |
| t3-api | claude-sonnet | C7 | 2 | 107,5 | 10,6 | 0,341 | 0,021 | 100,00 | 0,00 | 0 / 174 |
| t4-perf | ccoding-fastlane | C7 | 1 | 120,0 | – | 0,533 | – | 100,00 | – | 0 / 19 |
| t4-perf | claude-sonnet | C7 | 2 | 49,0 | 5,7 | 0,150 | 0,016 | 100,00 | 0,00 | 0 / 38 |
| t5-logq | ccoding-fastlane | C7 | 1 | 127,0 | – | 1,038 | – | 100,00 | – | 0 / 146 |
| t5-logq | claude-sonnet | C7 | 2 | 165,5 | 9,2 | 0,439 | 0,019 | 100,00 | 0,00 | 0 / 292 |
```
