# Báo cáo S1 — Công cụ thống kê `stats.mjs` và kết quả trên dữ liệu thật

- Nhánh: `ccoding/t-20261102-112755-181--s1`; Node v24.14.0.
- Dữ liệu: `bench/vs-claude/results/runs.csv` (C1–C5) + `docs/research/performance/c6-extract/C6-runs.csv` (C6, theo chỉ dẫn 2 của giám đốc, không fetch `5866cda`). Cả hai là mặc định của script.
- Lượt C5 `t3-api` làn nhanh treo stdin 579 s có `task_id` = `T-20261102-105231-9e5`, loại bằng `--exclude-run T-20261102-105231-9e5`.
- Mặc định: seed = 20261102, 10 000 resample bootstrap, 10 000 hoán vị Monte Carlo khi số tổ hợp > 200 000 (còn lại liệt kê chính xác), CI percentile 2,5/97,5. PRNG mulberry32, cùng bản và cùng thứ tự rút mẫu với `token-analysis.mjs` T-f.
- Thống kê gộp = TB các bài của (TB lượt CC − TB lượt Claude), phân tầng theo bài; tỉ lệ = TB CC / TB Claude. Kiểm định hoán vị hoán nhãn hệ trong từng bài. Cliff δ gộp mọi cặp (CC, Claude) trong cùng bài.

## Lệnh kiểm tra

```
$ node --test bench/vs-claude/harness/stats.test.mjs
→ exit code 0 — 8 test pass, 0 fail (bootstrap tái lập theo seed; hoán vị chính xác p = 2/6; hoán vị MC tái lập; Cliff δ; bộ lọc; CSV có ngoặc kép; requiredRuns σ=Δ=1 → 16; mô phỏng)
```

## Đầu ra đầy đủ của `stats.mjs` trên dữ liệu thật

Mỗi lệnh chạy từ thư mục `bench/vs-claude/harness`; tiền tố `$` ghi đường dẫn từ gốc repo.

```
$ node bench/vs-claude/harness/stats.mjs --rounds C6
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding*
bộ lọc: rounds=C6 tasks=* exclude=- · 8/57 lượt
bài dùng được: t3-api, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t3-api | 2 / 2 | -60,0 | [-85,0; -35,0] | 0,762 | [0,671; 0,858] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 2 / 2 | -85,5 | [-149,0; -22,0] | 0,671 | [0,473; 0,907] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| GỘP (TB các bài) | 4 / 4 | -72,8 | [-105,3; -40,3] | 0,716 | [0,600; 0,841] | 0,0556 | exact (36 tổ hợp) | -1,00 | CC < Claude |

### Chi phí (USD)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t3-api | 2 / 2 | 0,059 | [-0,158; 0,275] | 1,056 | [0,857; 1,279] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t5-logq | 2 / 2 | 0,213 | [-0,015; 0,442] | 1,211 | [0,986; 1,479] | 0,6667 | exact (6 tổ hợp) | 0,50 | CI chứa 0 |
| GỘP (TB các bài) | 4 / 4 | 0,136 | [-0,016; 0,287] | 1,132 | [0,986; 1,302] | 0,3889 | exact (36 tổ hợp) | 0,25 | CI chứa 0 |
[exit code: 0]

$ node bench/vs-claude/harness/stats.mjs --rounds C5
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding*
bộ lọc: rounds=C5 tasks=* exclude=- · 20/57 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | -18,5 | [-36,0; -1,0] | 0,853 | [0,731; 0,991] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t2-orders | 2 / 2 | 15,0 | [-15,0; 45,0] | 1,165 | [0,839; 1,506] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t3-api | 2 / 2 | 242,5 | [61,0; 424,0] | 2,540 | [1,381; 3,735] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t4-perf | 2 / 2 | -49,5 | [-85,0; -14,0] | 0,756 | [0,612; 0,925] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 2 / 2 | -84,0 | [-109,0; -59,0] | 0,675 | [0,596; 0,761] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| GỘP (TB các bài) | 10 / 10 | 21,1 | [-22,6; 64,9] | 1,126 | [0,866; 1,395] | 0,8971 | exact (7776 tổ hợp) | -0,40 | CI chứa 0 |

### Chi phí (USD)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | 0,029 | [-0,162; 0,221] | 1,057 | [0,708; 1,470] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t2-orders | 2 / 2 | 0,254 | [0,093; 0,416] | 1,584 | [1,200; 2,021] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t3-api | 2 / 2 | 0,426 | [0,359; 0,493] | 1,598 | [1,502; 1,696] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t4-perf | 2 / 2 | -0,053 | [-0,091; -0,015] | 0,916 | [0,861; 0,976] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 2 / 2 | 0,061 | [-0,077; 0,200] | 1,061 | [0,927; 1,206] | 0,6667 | exact (6 tổ hợp) | 0,50 | CI chứa 0 |
| GỘP (TB các bài) | 10 / 10 | 0,144 | [0,077; 0,210] | 1,218 | [1,115; 1,321] | 0,0430 | exact (7776 tổ hợp) | 0,30 | CC > Claude |
[exit code: 0]

$ node bench/vs-claude/harness/stats.mjs --rounds C5,C6 --exclude-run T-20261102-105231-9e5
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding*
bộ lọc: rounds=C5,C6 tasks=* exclude=T-20261102-105231-9e5 · 27/57 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | -18,5 | [-36,0; -1,0] | 0,853 | [0,731; 0,991] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t2-orders | 2 / 2 | 15,0 | [-15,0; 45,0] | 1,165 | [0,839; 1,506] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t3-api | 3 / 4 | -3,1 | [-53,3; 47,5] | 0,985 | [0,787; 1,302] | 0,9714 | exact (35 tổ hợp) | 0,00 | CI chứa 0 |
| t4-perf | 2 / 2 | -49,5 | [-85,0; -14,0] | 0,756 | [0,612; 0,925] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | -84,8 | [-120,0; -51,3] | 0,673 | [0,551; 0,794] | 0,0286 | exact (70 tổ hợp) | -1,00 | CC < Claude |
| GỘP (TB các bài) | 13 / 14 | -28,2 | [-44,4; -11,4] | 0,840 | [0,758; 0,932] | 0,0326 | monte-carlo (529200 tổ hợp) | -0,60 | CC < Claude |

### Chi phí (USD)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | 0,029 | [-0,162; 0,221] | 1,057 | [0,708; 1,470] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t2-orders | 2 / 2 | 0,254 | [0,093; 0,416] | 1,584 | [1,200; 2,021] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t3-api | 3 / 4 | 0,257 | [0,036; 0,463] | 1,293 | [1,036; 1,621] | 0,1429 | exact (35 tổ hợp) | 0,67 | CC > Claude |
| t4-perf | 2 / 2 | -0,053 | [-0,091; -0,015] | 0,916 | [0,861; 0,976] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | 0,137 | [-0,012; 0,292] | 1,136 | [0,989; 1,297] | 0,1714 | exact (70 tổ hợp) | 0,63 | CI chứa 0 |
| GỘP (TB các bài) | 13 / 14 | 0,125 | [0,047; 0,204] | 1,181 | [1,065; 1,304] | 0,0306 | monte-carlo (529200 tổ hợp) | 0,45 | CC > Claude |
[exit code: 0]

$ node bench/vs-claude/harness/stats.mjs --rounds C5,C6
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding*
bộ lọc: rounds=C5,C6 tasks=* exclude=- · 28/57 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | -18,5 | [-36,0; -1,0] | 0,853 | [0,731; 0,991] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t2-orders | 2 / 2 | 15,0 | [-15,0; 45,0] | 1,165 | [0,839; 1,506] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t3-api | 4 / 4 | 91,3 | [-39,0; 283,5] | 1,446 | [0,833; 2,483] | 0,5714 | exact (70 tổ hợp) | 0,25 | CI chứa 0 |
| t4-perf | 2 / 2 | -49,5 | [-85,0; -14,0] | 0,756 | [0,612; 0,925] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | -84,8 | [-120,0; -51,3] | 0,673 | [0,551; 0,794] | 0,0286 | exact (70 tổ hợp) | -1,00 | CC < Claude |
| GỘP (TB các bài) | 14 / 14 | -9,3 | [-40,2; 30,2] | 0,947 | [0,778; 1,174] | 0,7774 | monte-carlo (1058400 tổ hợp) | -0,45 | CI chứa 0 |

### Chi phí (USD)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | 0,029 | [-0,162; 0,221] | 1,057 | [0,708; 1,470] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t2-orders | 2 / 2 | 0,254 | [0,093; 0,416] | 1,584 | [1,200; 2,021] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t3-api | 4 / 4 | 0,242 | [0,034; 0,443] | 1,276 | [1,035; 1,609] | 0,1429 | exact (70 tổ hợp) | 0,63 | CC > Claude |
| t4-perf | 2 / 2 | -0,053 | [-0,091; -0,015] | 0,916 | [0,861; 0,976] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | 0,137 | [-0,012; 0,292] | 1,136 | [0,989; 1,297] | 0,1714 | exact (70 tổ hợp) | 0,63 | CI chứa 0 |
| GỘP (TB các bài) | 14 / 14 | 0,122 | [0,046; 0,199] | 1,176 | [1,064; 1,296] | 0,0280 | monte-carlo (1058400 tổ hợp) | 0,45 | CC > Claude |
[exit code: 0]

$ node bench/vs-claude/harness/stats.mjs --rounds C5,C6 --exclude-run T-20261102-105231-9e5 --required-runs --sim
seed = 20261102 · resample/hoán vị MC = 10000 · CI percentile 95% · hệ CC = ccoding*
bộ lọc: rounds=C5,C6 tasks=* exclude=T-20261102-105231-9e5 · 27/57 lượt
bài dùng được: t1-duration, t2-orders, t3-api, t4-perf, t5-logq

### Thời gian (s)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | -18,5 | [-36,0; -1,0] | 0,853 | [0,731; 0,991] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t2-orders | 2 / 2 | 15,0 | [-15,0; 45,0] | 1,165 | [0,839; 1,506] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t3-api | 3 / 4 | -3,1 | [-53,3; 47,5] | 0,985 | [0,787; 1,302] | 0,9714 | exact (35 tổ hợp) | 0,00 | CI chứa 0 |
| t4-perf | 2 / 2 | -49,5 | [-85,0; -14,0] | 0,756 | [0,612; 0,925] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | -84,8 | [-120,0; -51,3] | 0,673 | [0,551; 0,794] | 0,0286 | exact (70 tổ hợp) | -1,00 | CC < Claude |
| GỘP (TB các bài) | 13 / 14 | -28,2 | [-44,4; -11,4] | 0,840 | [0,758; 0,932] | 0,0326 | monte-carlo (529200 tổ hợp) | -0,60 | CC < Claude |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Thời gian (s); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 12,4 | 18,5 | 8 | 4 |
| t2-orders | 28,1 | 15,0 | 55 | 28 |
| t3-api | 45,4 | 3,1 | 3401 | >60 |
| t4-perf | 25,2 | 49,5 | 5 | 3 |
| t5-logq | 28,7 | 84,8 | 2 | 2 |

### Chi phí (USD)

| Phạm vi | n CC / n Claude | Chênh lệch CC − Claude | CI 95% | Tỉ lệ CC/Claude | CI 95% tỉ lệ | p hoán vị (2 phía) | Cách tính p | Cliff δ | Nhận xét |
|---|---:|---:|---:|---:|---:|---:|---|---:|---|
| t1-duration | 2 / 2 | 0,029 | [-0,162; 0,221] | 1,057 | [0,708; 1,470] | 1,0000 | exact (6 tổ hợp) | 0,00 | CI chứa 0 |
| t2-orders | 2 / 2 | 0,254 | [0,093; 0,416] | 1,584 | [1,200; 2,021] | 0,3333 | exact (6 tổ hợp) | 1,00 | CC > Claude |
| t3-api | 3 / 4 | 0,257 | [0,036; 0,463] | 1,293 | [1,036; 1,621] | 0,1429 | exact (35 tổ hợp) | 0,67 | CC > Claude |
| t4-perf | 2 / 2 | -0,053 | [-0,091; -0,015] | 0,916 | [0,861; 0,976] | 0,3333 | exact (6 tổ hợp) | -1,00 | CC < Claude |
| t5-logq | 4 / 4 | 0,137 | [-0,012; 0,292] | 1,136 | [0,989; 1,297] | 0,1714 | exact (70 tổ hợp) | 0,63 | CI chứa 0 |
| GỘP (TB các bài) | 13 / 14 | 0,125 | [0,047; 0,204] | 1,181 | [1,065; 1,304] | 0,0306 | monte-carlo (529200 tổ hợp) | 0,45 | CC > Claude |

Số lượt cần mỗi nhánh để phát hiện chênh lệch quan sát được (Chi phí (USD); công thức xấp xỉ chuẩn, α và power theo tham số):

| Bài | σ chung | Δ | n (công thức) | n (mô phỏng) |
|---|---:|---:|---:|---:|
| t1-duration | 0,154 | 0,029 | 440 | >60 |
| t2-orders | 0,136 | 0,254 | 5 | 3 |
| t3-api | 0,186 | 0,257 | 9 | 7 |
| t4-perf | 0,028 | 0,053 | 5 | 3 |
| t5-logq | 0,129 | 0,137 | 14 | 11 |
[exit code: 0]

```

## Đối chiếu với `token-analysis.md` (T-f)

| Tập | Chỉ số | token-analysis.md | stats.mjs | Lệch? |
|---|---|---|---|---|
| C6 | Thời gian, hiệu CC − Claude | −72,8 s | −72,8 s | Không |
| C6 | Thời gian, CI 95% | [−105,3; −40,3] | [−105,3; −40,3] | Không |
| C6 | Chi phí, hiệu | +0,136 USD | +0,136 USD | Không |
| C6 | Chi phí, CI 95% | [−0,016; 0,287] (chứa 0) | [−0,016; 0,287] (chứa 0) | Không |
| C5 | Thời gian / Chi phí | 21,1 [−22,6; 64,9] / 0,144 [0,077; 0,210] | cùng số | Không |
| C5+C6 bỏ lượt treo | Thời gian / Chi phí | −28,2 [−44,4; −11,4] / 0,125 [0,047; 0,204] | cùng số | Không |
| C5+C6 giữ lượt treo | Thời gian / Chi phí | −9,3 [−40,2; 30,2] / 0,122 [0,046; 0,199] | cùng số | Không |
| C5+C6 bỏ lượt treo | Thời gian tương đối | −16,0% [−24,2; −6,8] | tỉ lệ 0,840 [0,758; 0,932] (= 1 − 0,160) | Không (cùng đại lượng, khác cách ghi) |

Không có chỗ lệch ở các số được đối chiếu. Lý do khớp: cùng seed 20261102, cùng B = 10 000, cùng PRNG và thứ tự rút mẫu (CC rồi Claude, bài theo thứ tự chữ cái), cùng tập lượt chạy, cùng quy ước "CC" = mọi hệ `ccoding*` gộp chung (không ghép cặp lượt Claude/CC). Đổi seed hoặc B thì cận CI dịch nhẹ. Tôi chỉ đối chiếu các dòng liệt kê ở trên, không đối chiếu toàn bộ T-f (C1–C4).

## Điều cần lưu ý khi đọc

1. **Kiểm định hoán vị thiếu lực ở n = 2 mỗi ô.** Một bài 2 vs 2 chỉ có 6 tổ hợp nên p nhỏ nhất là 1/3. C6 gộp hai bài có 36 tổ hợp, p nhỏ nhất là 2/36 = 0,0556; thời gian C6 đạt đúng giá trị này (tách hoàn toàn, Cliff δ = −1) và **không đạt 0,05** theo kiểm định chính xác, dù CI bootstrap không chứa 0. Bootstrap với 2 lượt/ô thường quá hẹp; nên báo cả hai và coi C6 là minh họa.
2. C5+C6 bỏ lượt treo: p = 0,0326 (Monte Carlo, 529 200 tổ hợp); tập này được chọn sau khi thấy dữ liệu; giữ lượt treo thì p = 0,777.
3. Chi phí: C5 p = 0,043, C5+C6 p ≈ 0,03 (CC đắt hơn nhất quán); C6 riêng p = 0,389. Chưa hiệu chỉnh so sánh bội (nhiều bài × 2 chỉ số).
4. **`requiredRuns` ở CLI dùng Δ quan sát được** (post-hoc) nên không ổn định khi Δ nhỏ (t3 thời gian: Δ = 3,1 s → 3 401 lượt; t1 chi phí: 440). Hàm nhận `delta` tùy ý; S4/S5 nên dùng Δ mục tiêu có ý nghĩa thực tế. Kiểm tra: σ = Δ = 1, α = 0,05, power = 0,8 → 16 (có trong test). Cột "n (mô phỏng)" là bootstrap trên mẫu thí điểm với kiểm định z hai mẫu (tối đa 60), chỉ tham khảo; σ ước từ 4–8 lượt rất nhiễu.
5. Giới hạn: hai hệ khác mô hình (Opus/Sonnet), lượt không ghép cặp, Cliff δ ở n nhỏ chỉ nhận vài giá trị rời rạc.
6. Không chạy `run.mjs`; không dùng `export.py`/`report.py`.
