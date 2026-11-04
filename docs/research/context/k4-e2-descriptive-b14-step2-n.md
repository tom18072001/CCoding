# K4 (số liệu): mô tả E2 và cỡ mẫu A/B bước 2 của B-14 (4/11/2026)

Phân loại dữ liệu: **Nội bộ** (dữ liệu benchmark đã có, bài tổng hợp, không DLCN). Không chạy benchmark, không gọi `claude -p`. Người làm: @data-scientist (S3a, `T-20261104-110942-567`).

## 1. E2 — phân tích mô tả (không p, không suy diễn recall)

Lệnh (từ gốc repo; cờ đúng §9 V4-3e-E2 mục 6: `--unit run`, `--negatives clean`, `--label gate`; độ nhạy `--label task` ở mục 1.4):

```
node docs/research/analysis/gates-pairs.mjs bench/vs-claude/results/gates-pilot/runs.jsonl --unit run --gate <b02|b10|cto> --negatives clean --label gate --out <gate>.csv
node docs/research/analysis/k4-e2-descriptive.mjs     # q̂, bất đồng, chi phí; hai bản; dùng jsonlToPairs của gates-pairs.mjs
node --test docs/research/analysis/gates-pairs.test.mjs   # 17/17 đạt
```

`k4-e2-descriptive.mjs` là script mới (chỉ đọc), đặt cạnh `gates-pairs.mjs`. CP = Clopper–Pearson 95 %.

### 1.1 Sáu lượt 'lỡ thấy điểm' (RUNLOG gates-pilot, "Sai lệch quy trình")

RUNLOG ghi "6 lượt đầu (`[1/24]`…`[6/24]`)" của lệnh 1. `runs.jsonl` ghi theo thứ tự hoàn thành (`at` tăng dần, runner tuần tự), nên đó là 6 dòng đầu:

| # | `key` |
|--:|---|
| 1 | g4-gb-unit__B7cabO__r1 |
| 2 | g4-gb-unit__B7cab__r1 |
| 3 | g1-slug-dedupe__B7cab__r1 |
| 4 | g1-slug-dedupe__B7cabO__r1 |
| 5 | g5-median-stats__B7cabO__r1 |
| 6 | g5-median-stats__B7cab__r1 |

Việc xác định này suy từ thứ tự dòng và mô tả trong RUNLOG, không có danh sách khóa ghi sẵn trong RUNLOG. Cả 6 lượt đều là lượt B7cab/B7cabO; B6 (lệnh 2) không bị ảnh hưởng.

### 1.2 Bản gộp (28 lượt)

| Arm | Cổng | Số cặp | Số cặp ref = 1 | q̂ = ref=1 / cặp [CP 95 %] | Số bất đồng | Tỉ lệ bất đồng | Số cặp chặn (pred = 1) |
|---|---|--:|--:|---|--:|--:|--:|
| B7cab | b02 | 4 | 0 | 0,00 [0,00; 0,60] | 0 | 0,00 | 0 |
| B7cabO | b02 | 4 | 0 | 0,00 [0,00; 0,60] | 0 | 0,00 | 0 |
| B6 | b10 | 4 | 4 | n/a (ref theo bài) | 4 | 1,00 | 0 |
| B7cab | b10 | 4 | 4 | n/a (ref theo bài) | 3 | 0,75 | 1 |
| B7cabO | b10 | 4 | 4 | n/a (ref theo bài) | 3 | 0,75 | 1 |
| B7cab | cto | 4 | 0 | 0,00 [0,00; 0,60] | 0 | 0,00 | 0 |
| B7cabO | cto | 4 | 0 | 0,00 [0,00; 0,60] | 0 | 0,00 | 0 |

### 1.3 Bản loại 6 lượt 'lỡ thấy điểm' (22 lượt)

| Arm | Cổng | Số cặp | Số cặp ref = 1 | q̂ [CP 95 %] | Số bất đồng | Tỉ lệ bất đồng | Số cặp chặn |
|---|---|--:|--:|---|--:|--:|--:|
| B7cab | b02 | 3 | 0 | 0,00 [0,00; 0,71] | 0 | 0,00 | 0 |
| B7cabO | b02 | 3 | 0 | 0,00 [0,00; 0,71] | 0 | 0,00 | 0 |
| B6 | b10 | 4 | 4 | n/a | 4 | 1,00 | 0 |
| B7cab | b10 | 3 | 3 | n/a | 2 | 0,67 | 1 |
| B7cabO | b10 | 3 | 3 | n/a | 2 | 0,67 | 1 |
| B7cab | cto | 3 | 0 | 0,00 [0,00; 0,71] | 0 | 0,00 | 0 |
| B7cabO | cto | 3 | 0 | 0,00 [0,00; 0,71] | 0 | 0,00 | 0 |

**Chi phí mỗi lượt** (token có trọng số `input + 1,25·cacheWrite + 0,1·cacheRead + 5·out`, trường `tokens.weighted`; USD không dùng vì `costUsd` của arm CCoding vẫn bằng 0, SR-02):

| Arm | Gộp: số lượt | Gộp: TB / lượt | Gộp: tổng (M) | Loại 6: số lượt | Loại 6: TB / lượt | Loại 6: tổng (M) | Test ẩn đạt (gộp / loại 6) |
|---|--:|--:|--:|--:|--:|--:|---|
| B7cab | 12 | 77.657 | 0,932 | 9 | 78.182 | 0,704 | 12/12 · 9/9 |
| B7cabO | 12 | 102.742 | 1,233 | 9 | 105.915 | 0,953 | 11/12 · 8/9 |
| B6 | 4 | 132.925 | 0,532 | 4 | 132.925 | 0,532 | 4/4 · 4/4 |

### 1.4 Đọc kết quả (chỉ mô tả)

- **b02 và cto:** q̂ = 0/8 mỗi cổng ở bản gộp (0/4 mỗi arm), tức không lượt nào còn lỗi cài đến cổng ở g1/g2 (b02, `checksRed = 0` cả 8 dòng) và g5/g6 (cto, `pass = true` cả 8 dòng). Cận trên CP 0,60 (n = 4) và 0,71 (n = 3) rất rộng. Không có dương thật nào, nên không có gì để nói về recall; **không suy diễn recall**. Bất đồng bằng 0 vì ref = pred = 0 ở mọi cặp.
- **b10:** nhãn `ref` theo bài (g3/g4 đều là bài cài lỗi b10), nên q̂ không xác định và "bất đồng" ở đây chỉ là "cổng không chặn". Chặn 2/8 cặp B7 (cùng g3-qty-rename lượt 2, một mỗi arm), 0/4 ở B6.
- **Cổng null:** b10 null 14 dòng (bản gộp), đều ở bài g1, g2, g5, g6 (không có cổng b10 ở các lượt đó trong `runs.jsonl`; không điều tra nguyên nhân). Số bài sạch bằng 0 nên `--negatives clean` bỏ mọi bài cài lỗi loại khác (b02: 20, cto: 20, b10: 2 dòng). Hệ quả đã biết từ §9: E2 không có lượt sạch.
- **Chi phí:** B7cabO tốn nhiều hơn B7cab khoảng 32 % token có trọng số mỗi lượt (102.742 so với 77.657, gộp). RUNLOG đã ghi 2,78 so với 2,05 USD nhưng chưa tính phần Opus; hai arm khác model ở pha `accept` nên **không so trực tiếp** theo §9 mục (5).
- **N của E4:** giữ nguyên R = 16 (E4) và R_B6 = 32 theo §9 khối (a) bước 5, cố định trước dữ liệu. Không tính lại từ E2.
- **Độ nhạy `--label task` (đã chạy, cùng lệnh nhưng `--label task`):** b10 giống hệt bản `gate`. b02 và cto: cả 8 cặp mỗi cổng đều ref = 1, pred = 0 (4 cặp mỗi arm), tức bất đồng 8/8 và "recall" 0/8 theo nhãn bài. Con số này **không nên đọc là cổng bỏ sót**: lỗi cài đã được agent tự sửa trước cổng (nhãn tại thời điểm cổng cho ref = 0). Đúng là lý do §9 chọn `--label gate` làm nhãn chính.

## 2. Cỡ mẫu A/B B-14 bước 2 (`runtimes.claude-cli.stablePrefix`)

Lệnh: `node docs/research/analysis/k4-b14-step2-n.mjs` (chỉ đọc `study-cloud/runs.jsonl`, arm B7, `status = done`, sau `classifyRows`).

- **Công cụ:** `requiredRuns`/`zInv` trong `bench/vs-claude/harness/stats.mjs`, cùng công cụ mà `docs/research/self-improvement/holdout-sample-size.mjs` dùng cho trường hợp τ² = 0. Công thức `n = ⌈2(z_{1−α/2}+z_{1−β})²σ²/Δ²⌉` mỗi nhánh, bài là khối, `r = ⌈n/T⌉` lượt mỗi bài mỗi nhánh.
- **Thước đo chính:** ln(token có trọng số) mỗi lượt (B-14 trường 6). Δ trên thang log: `Δ = ln(1/(1−x))` với x = mức tiết kiệm giả định.
- **α = 0,05; power = 0,8; hai phía** (mặc định của `requiredRuns`). Cột một phía (α = 0,05, cùng công thức với z_{1−α}) chỉ để tham khảo; nó **không** do `requiredRuns` tính mà do script tính tay cùng công thức. Một phía chỉ hợp lý nếu đăng ký trước là "tiết kiệm", và test ẩn không kém hơn phải kiểm riêng (B-14 trường 6).
- **Giả định hiệu ứng: x là giả định, không phải số đo.** E1 chỉ cho biết **cơ chế** (đổi bộ công cụ: h = 0,00, CW 41.464 và CR 0; đổi `cwd`: h = 0,98), n = 1 mỗi cặp, và `RUNLOG` E1 ghi rõ E1 không ước lượng mức tiết kiệm. Cận trên cứng: 1,25·cacheWrite chiếm khoảng 35 % token có trọng số của B7 (bảng dưới: 0,30–0,40 theo bài), mà lượt đầu luôn phải ghi. Đề xuất lấy **x = 10 %** làm mức kế hoạch (khoảng 29 % của phần cacheWrite). Đây là lựa chọn của người phân tích, cần methodologist/research-lead chốt khi đăng ký §9.
- **σ:** trong-bài, trong-nhánh, từ B7 trên t1–t5 (9 lượt mỗi bài). Chỉ thay σ của A0/B7 khi có σ của nhánh có `stablePrefix`; ở đây giả định hai nhánh cùng σ.

| Bài | n (B7) | TB token có trọng số | σ_w (ln) | 1,25·cacheWrite / có trọng số | Số lần gọi TB |
|---|--:|--:|--:|--:|--:|
| t1-duration | 9 | 140.202 | 0,381 | 0,347 | 2,3 |
| t2-orders | 9 | 123.344 | 0,076 | 0,356 | 2,0 |
| t3-api | 9 | 230.890 | 0,252 | 0,302 | 2,3 |
| t4-perf | 9 | 208.606 | 0,175 | 0,403 | 4,3 |
| t5-logq | 9 | 336.709 | 0,338 | 0,306 | 3,3 |

Số lượt (hai phía, α = 0,05, power = 0,8):

| x | Δ | Cả 5 bài (σ = 0,268): n/nhánh · r/bài · tổng | Đề xuất t2, t3, t4 (σ = 0,182): n/nhánh · r/bài · tổng | Một phía, 3 bài đề xuất: n/nhánh |
|--:|--:|---|---|--:|
| 5 % | 0,051 | 428 · 86 · 860 | 198 · 66 · 396 | 156 |
| **10 %** | 0,105 | 102 · 21 · 210 | **47 · 16 · 96** | 37 |
| 15 % | 0,163 | 43 · 9 · 90 | 20 · 7 · 42 | 16 |
| 20 % | 0,223 | 23 · 5 · 50 | 11 · 4 · 24 | 9 |

(Bản ba bài t1–t3 và đầy đủ các cột: xem đầu ra của lệnh.)

**Đề xuất: 16 lượt mỗi bài mỗi nhánh × 3 bài × 2 nhánh = 96 lượt (x = 10 %).** Mức 5 % cần 396 lượt, không thực tế; mức 15 % chỉ cần 42 nhưng lạc quan.

### 2.1 Bài cố định (đề xuất): t2-orders, t3-api, t4-perf

- **E1 không dùng bài của bench**: `cache-diagnostic.mjs` dùng lời nhắc giả (`taskId: 'cache-diag'`), nên không có "bài E1" để chọn. Lý do chọn dưới đây lấy từ dữ liệu B7 của study-cloud, không từ E1.
- **t4-perf:** nhiều lần gọi nhất (4,3), tỉ lệ cacheWrite cao nhất (0,403). Nhiều pha đổi bộ công cụ thì cơ chế E1 (b) có nhiều cơ hội tác động nhất.
- **t2-orders:** σ nhỏ nhất (0,076), giảm σ gộp. Chỉ 2,0 lần gọi, nên cũng là ca "ít pha" để thấy hiệu ứng không lan sang bài ngắn.
- **t3-api:** ở giữa (σ 0,252; 2,3 lần gọi), token lớn.
- **Bỏ t1** (σ 0,381) và **t5** (σ 0,338): phương sai cao kéo n lên gấp khoảng 2,2 lần (102 so với 47 mỗi nhánh).
- **Cẩn trọng:** chọn bài theo σ và cacheWrite quan sát được trên B7 là chọn trên dữ liệu đã có (không phải trên nhánh mới), và sẽ làm kết quả khó khái quát sang cả t1–t5; bài báo phải nói rõ. Nếu methodologist muốn khái quát, dùng 5 bài với x = 10 % (210 lượt).
- Test ẩn không kém hơn (B-14 trường 6) cần cỡ mẫu riêng; không tính ở đây.
- **Bảo mật:** bước 2 chuyển việc chặn theo pha sang hook (B-14 trường 7(c)); cần bộ test lệnh ác ý trước khi chạy. Ngoài phạm vi K4.

## 3. Định nghĩa arm (lấy từ `bench/vs-claude/arms.json` và RUNLOG gates-pilot, cho S5)

| Mã arm | Định nghĩa (nguyên văn nhãn `arms.json`) | Ghi chú |
|---|---|---|
| B7cab | "CCoding làn đơn, B-11(a)+(b)+(c) nghiệm thu brief + mẫu gọn + promptDiet" | `lane: single`; `slim: { accept: "brief", compactTemplate: true, promptDiet: true }`. Cách gọi trong bài báo: **làn đơn có cổng chất lượng** (theo yêu cầu kế hoạch chung) |
| B7cabO | "CCoding làn đơn, B7cab + CTO nghiệm thu bằng Opus (B-16, phaseModels.accept)" | Như B7cab, thêm `phaseModels: { accept: "opus" }`. Chỉ khác đúng một biến. Gọi là biến thể của B7cab (CTO nghiệm thu bằng Opus) |
| B6 | Trong RUNLOG gates-pilot chỉ dùng "để có quyết định b10 vì cổng này chỉ có ở làn có pha plan"; không vào cặp B-16 | Nhãn `arms.json`: "CCoding làn nhanh" (cũng là tên bài báo 'làn nhanh') |

Lưu ý với S5: RUNLOG gates-pilot **không** có định nghĩa riêng cho B7cab/B7cabO (chỉ có tên và lệnh); nguồn định nghĩa là `arms.json`. Tên 'làn đơn có cổng chất lượng' là tên theo kế hoạch chung, còn `arms.json` đặt nhãn kỹ thuật như trên. Nếu bài báo đưa tên này, nên chú thích hai thành phần `slim` để khớp mã.

## 4. Tái lập và giới hạn

- Môi trường: Node ≥ 22, không gói ngoài; dữ liệu `gates-pilot/runs.jsonl` (28 dòng) và `study-cloud/runs.jsonl`.
- Giới hạn: n = 3–4 cặp mỗi ô, CI rất rộng; không có lượt sạch; q̂ = 0 ở mọi ô nên ρ̂ (tương quan nội cụm) không ước lượng được và không báo; xác định 6 lượt 'lỡ thấy điểm' dựa vào thứ tự dòng; Δ của B-14 là giả định.
