# R11 — Tách chi phí và thời gian làn đơn B7 so với A0 (vòng 4, gói 1, S1)

> Phân loại dữ liệu: **Nội bộ** (số đo benchmark, không có DLCN). Mọi bảng `### T-n` bên dưới do `docs/research/analysis/b7-cost-decomposition.mjs` sinh; `--check` so lại từng ký tự. Phần chữ ngoài bảng do người viết, mọi con số trong đó trích từ bảng.

## Tóm tắt

- Tính lại trên t1–t5, trung vị gộp khớp bảng đề bài trong ±2,2 % (T-1). Ước lượng điểm kiểu prereg (TB hình học tỷ số theo bài, mọi lượt done) tái lập ×2,51 token và ×2,56 thời gian, gần ×2,50 và ×2,57 của vòng 3 (T-7).
- Phần chênh weighted (B7 − A0) trên t1–t5: **pha accept 47,7 %** (đo trực tiếp qua `byPhase`; A0 không có pha này), phần còn lại 52,3 % là execute/plan vượt A0. Theo thành phần token (đại số, không phụ thuộc pha): **out 50,4 %, cacheWrite 36,8 %, cacheRead 12,8 %, input 0 %** (T-4). Trên B7b: accept 46,8 %, ngoài accept 53,2 %; out 56,1 %, cacheWrite 38,0 %, cacheRead 5,9 %.
- Chỉ **accept** là tách được theo pha. `byPhase` không có out/cacheWrite/giây theo pha ⇒ KHÔNG tách được "out của execute", "mẫu đầu ra vs báo cáo bàn giao", và **thời gian không tách được theo pha nào** (T-6). Các phần (ii)–(iv) của T-5 là cận, không phải phân rã nhân quả.
- Với S3: bỏ hẳn accept chỉ đưa tỷ số từ ≈×2,5 xuống ≈×1,8 (thô, xem §Hàm ý); muốn ≤ ×1,3 phải cắt cả phần out và cacheWrite của execute.

## Tệp đã lưu

- `docs/research/analysis/b7-cost-decomposition.mjs` (script, Node ≥ 22, không gói ngoài; import `median`, `sha256`, `gitBlob`, `bootstrapRatio` từ `prereg-tests.mjs` và `weighted` từ `bench/vs-claude/lib/claude.mjs`).
- `docs/research/analysis/b7-cost-decomposition.md` (tệp này).
- Không sửa tệp dùng chung, `src/`, `bench/`. Không cần đăng ký thêm vào chỉ mục dùng chung (xem đầu ra consistency-check cuối tệp).

## Dữ liệu

Nguồn: `bench/vs-claude/results/study-cloud/runs.jsonl` (chỉ đọc), hash ở T-0. Lấy lượt `status = done` của `A0-sonnet` và `B7`. Bộ **t1–t5**: 5 bài, B7 r1–9 (cửa sổ B7a) và A0 r1–9 (r1–3 từ W2b, r4–9 từ B7a; cùng server nhánh 7425). Bộ **B7b**: 13 bài còn lại, B7 r1–2 (s1-sec-review và c2-burst-alert chỉ r1), A0 lấy từ các cửa sổ trước (W1, W2a, W2c; server main 7424, 11:41–16:40 UTC 2/11), **không cùng cửa sổ/server với B7** (B7b chạy khoảng 19:00 UTC theo trường `at`). Schema: dòng B7 có `tokens{input,output,cacheRead,cacheWrite,total,weighted}`, `wallSec`, `calls`, `byPhase{execute,accept,plan,review: weighted}`; dòng A0 có `turns` thay `calls` và không có `byPhase`. `tokens.weighted` khớp `weighted(tokens)` ở mọi lượt, và tổng `byPhase` = weighted lượt (T-0, T-2). Không dùng dữ liệu cá nhân.

**Ghi chú vòng 4, gói 1b (S2):** `runs.jsonl` đã có thêm dòng (B7b r3, B6b) sau lần phân tích đầu nên `--check` lệch. Script nay **ghim `PIN_LINES = 221`** dòng đầu (phần dữ liệu đã phân tích; hash ở T-0 không đổi: sha256 `c0169eba…7dda`). Kiểm lại: mọi bảng T-0…T-7 trùng đầu ra, nên **các số 47,7 %, 46,8 %, ×2,51 giữ nguyên**. Dữ liệu B7b mới (r3) không nằm trong tệp này.

### T-0. Nhận dạng dữ liệu và schema

| Mục | Giá trị |
| --- | --- |
| Script | b7-cost-decomposition v1 (round 4, S1) |
| Hash git (blob) `runs.jsonl` | `831bbd8c3824506c32638205043c8370e7524b6f` |
| sha256 `runs.jsonl` (LF) | `c0169ebaf2b46a8d7031f0fd41a6a7c0d1825bc6256f48d4c83c6596b6bc7dda` |
| Số dòng; done A0-sonnet / B7 | 221; 91 / 69 |
| Bài t1–t5 / B7b | 5 / 13 |
| Lượt B7 trên t1–t5 / B7b | 45 / 24 |
| Lượt A0 trên t1–t5 / B7b | 45 / 46 |
| tokens.weighted ≠ weighted(tokens) (sai số >1) | 0 lượt |
| Trường của dòng B7 | agentsUsed, arm, at, byPhase, calls, category, costUsd, details, formatMiss, key, leak, pass, rep, score, size, status, task, tokens, turns, wallSec |
| Pha trong byPhase | execute, accept, plan, review |

## Giao thức đánh giá

Ghi trước khi xem phân rã:
1. Trung vị gộp (T-1) kiểm tra số đề bài; chênh lệch ghi nguyên.
2. So sánh ghép theo bài: trung vị các lượt của bài (mỗi hạng), rồi trung vị qua bài (T-3). Phân rã (T-4, T-5) cộng qua bài từ trung vị của bài; số tuyệt đối là k token weighted trung bình mỗi bài.
3. Thứ tự quy phần cố định, ghi trong đầu script: accept → out vượt A0 → cacheWrite vượt A0 → pha khác + dư, mỗi bước cắt ở phần còn lại để tổng đúng 100 %. Độ nhạy: thứ tự ngược.
4. Trường không có trong dữ liệu ghi "không đo được"; không ước đoán, không chia bình quân.
5. Các thống kê này là mô tả, không có kiểm định giả thuyết; số bài nhỏ (5 và 13), khoảng B7/A0 qua bài ghi ở T-3.

## Kết quả

### T-1. Tái lập trung vị t1–t5 (gộp mọi lượt done) so với số trong đề bài

Lượt done: A0-sonnet 45, B7 45. weighted = input + 1,25·cacheWrite + 0,1·cacheRead + 5·out (`bench/vs-claude/lib/claude.mjs`). Cột "lệch" = tính lại ÷ đề bài − 1.

| Thành phần | A0 tính lại | A0 đề bài | lệch A0 | B7 tính lại | B7 đề bài | lệch B7 | B7/A0 (trung vị gộp) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| out | 8,0k | 8,0k | -0,2 % | 20,2k | 20,2k | -0,1 % | ×2,53 |
| cacheRead | 124,4k | 124,0k | 0,3 % | 219,1k | 219,0k | 0,1 % | ×1,76 |
| cacheWrite | 14,7k | 15,0k | -2,2 % | 51,3k | 51,0k | 0,5 % | ×3,49 |
| input | 12 | — | đề bài không có | 28 | — | đề bài không có | ×2,33 |
| weighted | 65,7k | 66,0k | -0,5 % | 198,7k | 199,0k | -0,2 % | ×3,03 |
| wall (s) | 52,4 | 52,0 | 0,8 % | 140,2 | 140,0 | 0,1 % | ×2,67 |

Lệch lớn nhất là cacheWrite A0 (−2,2 %), do bảng đề bài làm tròn; không có lệch nào thay đổi kết luận.

Ba cách tính tỷ số B7/A0 weighted trên t1–t5 cho ba con số khác nhau: ×3,03 (trung vị gộp mọi lượt, T-1), ×2,51 (TB hình học tỷ số trung bình theo bài, T-7; cách của vòng 3) và ×1,96 (trung vị tỷ số theo bài, T-3). Chúng trả lời câu hỏi khác nhau; chỉ ước lượng thứ hai là con số B-01.

### T-2. B7 theo pha (byPhase) và theo số lượt gọi

`byPhase` chỉ chứa **weighted theo pha** (tổng pha = weighted lượt, lệch >5 ở 0 lượt). Không có out/cacheRead/cacheWrite/input/giây theo pha. "Trung vị" tính trên các lượt có pha đó; "tỷ trọng" = tổng weighted của pha ÷ tổng weighted B7.

| Bộ | Pha | Số lượt có pha | Trung vị weighted | Tỷ trọng |
| --- | ---: | ---: | ---: | ---: |
| t1–t5 | execute | 45/45 | 138,5k | 73,0 % |
| t1–t5 | accept | 45/45 | 46,6k | 23,1 % |
| t1–t5 | plan | 14/45 | 26,0k | 3,9 % |
| t1–t5 | review | 0/45 | không đo được | 0,0 % |
| t1–t5 | **tổng B7 (weighted)** | 45/45 | 198,7k | 100,0 % |
| t1–t5 | (A0 cùng bài, không có byPhase) | 45 | 65,7k | không đo được |
| B7b (13 bài) | execute | 24/24 | 51,3k | 57,8 % |
| B7b (13 bài) | accept | 24/24 | 28,9k | 27,2 % |
| B7b (13 bài) | plan | 2/24 | 31,2k | 2,4 % |
| B7b (13 bài) | review | 15/24 | 19,8k | 12,6 % |
| B7b (13 bài) | **tổng B7 (weighted)** | 24/24 | 99,5k | 100,0 % |
| B7b (13 bài) | (A0 cùng bài, không có byPhase) | 46 | 33,0k | không đo được |

Theo số lượt gọi (`calls`) và tập pha:

| Bộ | calls: pha | Số lượt | weighted (trung vị) | out (trung vị) | wall s (trung vị) |
| --- | ---: | ---: | ---: | ---: | ---: |
| t1–t5 | 2 lượt: execute+accept | 31 | 133,1k | 14,4k | 100 |
| t1–t5 | 4 lượt: execute+plan+accept | 6 | 184,5k | 17,2k | 155 |
| t1–t5 | 5 lượt: execute+plan+accept | 5 | 265,9k | 26,1k | 240 |
| t1–t5 | 6 lượt: execute+plan+accept | 3 | 518,0k | 53,8k | 370 |
| B7b (13 bài) | 2 lượt: execute+accept | 7 | 87,4k | 10,4k | 80 |
| B7b (13 bài) | 3 lượt: execute+review+accept | 15 | 102,9k | 9,5k | 80 |
| B7b (13 bài) | 4 lượt: execute+plan+accept | 1 | 134,4k | 11,3k | 90 |
| B7b (13 bài) | 5 lượt: execute+plan+accept | 1 | 131,7k | 9,9k | 90 |

### T-3. Từng thành phần B7 so với A0 cùng bài (ghép cặp theo bài, rồi trung vị qua bài)

Mỗi bài: trung vị các lượt done của B7 và của A0; sau đó lấy trung vị qua bài. A0 không ghi `calls` (chỉ `turns` của CLI, khác nghĩa) nên cột số lượt gọi nằm ở T-2.

| Bộ | Thành phần | Số bài | A0 (trung vị bài) | B7 (trung vị bài) | B7/A0 (trung vị cặp) | khoảng B7/A0 qua bài | B7 − A0 (trung vị cặp) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| t1–t5 | out | 5 | 8,0k | 20,2k | ×1,80 | ×1,53 … ×3,68 | 9,8k |
| t1–t5 | cacheRead | 5 | 122,8k | 233,5k | ×1,79 | ×1,22 … ×3,33 | 160,6k |
| t1–t5 | cacheWrite | 5 | 14,3k | 49,8k | ×2,31 | ×2,02 … ×5,09 | 25,1k |
| t1–t5 | input | 5 | 12 | 30 | ×2,00 | ×1,80 … ×4,25 | 14 |
| t1–t5 | weighted | 5 | 65,7k | 198,7k | ×1,96 | ×1,73 … ×4,01 | 108,5k |
| t1–t5 | wall (s) | 5 | 52,0 | 150,2 | ×1,93 | ×1,83 … ×4,15 | 71,2 |
| B7b (13 bài) | out | 13 | 1,9k | 9,5k | ×3,57 | ×1,71 … ×11,79 | 6,5k |
| B7b (13 bài) | cacheRead | 13 | 64,5k | 97,2k | ×1,47 | ×0,77 … ×3,18 | 29,9k |
| B7b (13 bài) | cacheWrite | 13 | 13,1k | 25,9k | ×2,48 | ×1,22 … ×7,31 | 19,4k |
| B7b (13 bài) | input | 13 | 6 | 18 | ×2,88 | ×1,63 … ×4,50 | 12 |
| B7b (13 bài) | weighted | 13 | 33,6k | 94,1k | ×2,64 | ×1,58 … ×7,54 | 52,4k |
| B7b (13 bài) | wall (s) | 13 | 18,8 | 85,1 | ×3,80 | ×2,07 … ×14,39 | 57,5 |

### T-4. Chênh weighted (B7 − A0) theo thành phần token — phân rã đại số, độc lập với pha

Mỗi bài: Δ thành phần = hệ số × (trung vị B7 − trung vị A0). Trình bày trung bình trên bài (k token weighted/bài) và % của tổng. Vì trung vị từng thành phần không cộng đúng bằng trung vị weighted nên dòng "cộng" có thể lệch Δ đôi chút.

| Bộ | Thành phần | Δ weighted mỗi bài | % chênh |
| --- | ---: | ---: | ---: |
| t1–t5 | out (×5) | 50,2k | 50,4 % |
| t1–t5 | cacheWrite (×1,25) | 36,7k | 36,8 % |
| t1–t5 | cacheRead (×0,1) | 12,7k | 12,8 % |
| t1–t5 | input (×1) | 0,0k | 0,0 % |
| t1–t5 | **cộng** (khớp Δ weighted ± làm tròn trung vị) | 99,6k | Δ = 101,5k/bài |
| t1–t5 | cacheWrite mỗi lượt gọi B7 (trung vị) / cacheWrite mỗi lượt A0 | 17,8k / 14,7k | mô tả, không phải nhân quả |
| B7b (13 bài) | out (×5) | 34,9k | 56,1 % |
| B7b (13 bài) | cacheWrite (×1,25) | 23,6k | 38,0 % |
| B7b (13 bài) | cacheRead (×0,1) | 3,7k | 5,9 % |
| B7b (13 bài) | input (×1) | 0,0k | 0,0 % |
| B7b (13 bài) | **cộng** (khớp Δ weighted ± làm tròn trung vị) | 62,2k | Δ = 61,9k/bài |
| B7b (13 bài) | cacheWrite mỗi lượt gọi B7 (trung vị) / cacheWrite mỗi lượt A0 | 10,8k / 13,2k | mô tả, không phải nhân quả |

### T-5. Phân rã Δ weighted (B7 − A0) cộng đúng 100 %, theo thứ tự quy phần cố định

Thứ tự: accept → out vượt A0 → cacheWrite vượt A0 → các pha khác và phần dư (xem đầu script). Mỗi bài tính từ trung vị của bài, rồi cộng qua bài; số tuyệt đối là k token weighted trung bình mỗi bài.

| Bộ | Phần | Tuyệt đối mỗi bài | % của Δ |
| --- | ---: | ---: | ---: |
| t1–t5 | (i) pha accept | 48,4k | 47,7 % |
| t1–t5 | (ii) out vượt A0 (cả lượt; không tách theo pha) | 44,3k | 43,6 % |
| t1–t5 | (iii) cacheWrite vượt A0 (mỗi lượt gọi là phiên mới) | 8,9k | 8,7 % |
| t1–t5 | (iv) các pha khác + phần dư (plan, review, cacheRead, input, execute còn lại) | 0,0k | 0,0 % |
| t1–t5 | **Tổng = Δ weighted (B7 − A0)** | 101,5k | 100,0 % |
| B7b (13 bài) | (i) pha accept | 29,0k | 46,8 % |
| B7b (13 bài) | (ii) out vượt A0 (cả lượt; không tách theo pha) | 28,1k | 45,4 % |
| B7b (13 bài) | (iii) cacheWrite vượt A0 (mỗi lượt gọi là phiên mới) | 4,9k | 7,8 % |
| B7b (13 bài) | (iv) các pha khác + phần dư (plan, review, cacheRead, input, execute còn lại) | 0,0k | 0,0 % |
| B7b (13 bài) | **Tổng = Δ weighted (B7 − A0)** | 61,9k | 100,0 % |

Độ nhạy với thứ tự (ngược: out → cacheWrite → accept → khác). Phần accept (i) là weighted đo trực tiếp; out và cacheWrite dùng số cả lượt nên TRÙNG một phần với chính token của accept (byPhase không tách thành phần). Thứ tự ngược cho biết phần accept không trùng với out/cacheWrite vượt A0 (cận dưới của phần accept "độc lập"); thứ tự chính cho accept đầy đủ:

| Bộ | Phần | Thứ tự chính | Thứ tự ngược |
| --- | ---: | ---: | ---: |
| t1–t5 | accept | 47,7 % | 14,5 % |
| t1–t5 | out | 43,6 % | 49,4 % |
| t1–t5 | cacheWrite | 8,7 % | 36,1 % |
| t1–t5 | khác + dư | 0,0 % | 0,0 % |
| B7b (13 bài) | accept | 46,8 % | 6,0 % |
| B7b (13 bài) | out | 45,4 % | 56,3 % |
| B7b (13 bài) | cacheWrite | 7,8 % | 37,7 % |
| B7b (13 bài) | khác + dư | 0,0 % | 0,0 % |

### T-6. Tách thời gian (×2,57 trên t1–t5)

Chỉ `wallSec` toàn lượt được ghi. Theo mã harness (`bench/vs-claude/lib/ccoding.mjs`): đồng hồ chạy từ lúc tạo dự án (POST /api/projects) tới khi task kết thúc, `isolation: 'none'` (không tạo worktree), `checkCommands: ['npm test']` nếu workspace có `package.json`. Đó là suy ra từ mã, không phải số đo. Không chia bình quân hay phân bổ theo tỷ lệ token để lấp chỗ trống.

| Bộ | Mục | Giá trị | Ghi chú |
| --- | ---: | ---: | ---: |
| t1–t5 | wall tổng (trung vị lượt): A0 → B7 | 52,4 s → 140,2 s | ×2,67 gộp; ×1,93 cặp-theo-bài; Δ 71,2 s |
| t1–t5 | execute (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| t1–t5 | accept (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| t1–t5 | lệnh kiểm tra baseline/sau (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| t1–t5 | tạo worktree (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| t1–t5 | lượt định tuyến LLM (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| t1–t5 | phần không quy được | 87,7 s (toàn bộ Δ) | vì không có pha nào đo được |
| t1–t5 | mô tả: B7 2 lượt (execute+accept) | 31 lượt; wall 100,1 s; weighted 133,1k |  |
| t1–t5 | mô tả: B7 ≥4 lượt (có plan) | 14 lượt; wall 200,2 s; weighted 247,4k |  |
| t1–t5 | Spearman wall~out / wall~calls / wall~weighted (B7, theo lượt) | 0,97 / 0,61 / 0,96 | tương quan, không phải phân rã |
| t1–t5 | Spearman wall~out (A0, theo lượt) | 0,98 | tương quan, không phải phân rã |
| B7b (13 bài) | wall tổng (trung vị lượt): A0 → B7 | 15,0 s → 80,1 s | ×5,35 gộp; ×3,80 cặp-theo-bài; Δ 57,5 s |
| B7b (13 bài) | execute (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| B7b (13 bài) | accept (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| B7b (13 bài) | lệnh kiểm tra baseline/sau (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| B7b (13 bài) | tạo worktree (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| B7b (13 bài) | lượt định tuyến LLM (giây) | không đo được | runs.jsonl không có byPhase.wallMs/sec hay thời gian lệnh |
| B7b (13 bài) | phần không quy được | 65,1 s (toàn bộ Δ) | vì không có pha nào đo được |
| B7b (13 bài) | mô tả: B7 2 lượt (execute+accept) | 7 lượt; wall 80,1 s; weighted 87,4k |  |
| B7b (13 bài) | mô tả: B7 3 lượt (review) | 15 lượt; wall 80,1 s; weighted 102,9k |  |
| B7b (13 bài) | mô tả: B7 ≥4 lượt (có plan) | 2 lượt; wall 90,1 s; weighted 133,0k |  |
| B7b (13 bài) | Spearman wall~out / wall~calls / wall~weighted (B7, theo lượt) | 0,90 / 0,37 / 0,89 | tương quan, không phải phân rã |
| B7b (13 bài) | Spearman wall~out (A0, theo lượt) | 0,92 | tương quan, không phải phân rã |

### T-7. Trả lời bằng số cho R11.3

Mọi số lấy từ T-4/T-5 (chính). "Đầu ra dài hơn" = toàn bộ out vượt A0; byPhase không có out theo pha nên không tách được mẫu đầu ra khỏi báo cáo bàn giao, cũng không tách được out của accept khỏi out của execute.

| Bộ | Câu hỏi | Số |
| --- | ---: | ---: |
| t1–t5 | Neo: ước lượng điểm kiểu prereg (TB hình học của tỷ số trung bình theo bài), weighted / wall, mọi lượt done | ×2,51 / ×2,56 |
| t1–t5 | Tỷ lệ B7/A0 weighted (trung vị cặp) | ×1,96 |
| t1–t5 | Phần Δ đến từ pha accept | 47,7 % (48,4k/bài); nếu quy accept sau cùng: 14,5 % |
| t1–t5 | Phần Δ KHÔNG đến từ accept (execute + plan + review vượt A0; accept đo trực tiếp) | 52,3 % |
| t1–t5 | Phần Δ đến từ đầu ra dài hơn (out vượt A0; không tách mẫu đầu ra / báo cáo bàn giao) | 43,6 % (44,3k/bài); nếu quy out trước: 49,4 % |
| t1–t5 | Phần Δ đến từ cacheWrite vượt A0 | 8,7 % (8,9k/bài); nếu quy cacheWrite trước: 36,1 % |
| t1–t5 | Phần Δ từ các pha khác + phần dư | 0,0 % (0,0k/bài) |
| t1–t5 | Pha plan + review (tỷ trọng trong tổng weighted B7) | 3,9 % weighted B7 (không phải % của Δ) |
| B7b (13 bài) | Neo: ước lượng điểm kiểu prereg (TB hình học của tỷ số trung bình theo bài), weighted / wall, mọi lượt done | ×2,64 / ×3,97 |
| B7b (13 bài) | Tỷ lệ B7/A0 weighted (trung vị cặp) | ×2,64 |
| B7b (13 bài) | Phần Δ đến từ pha accept | 46,8 % (29,0k/bài); nếu quy accept sau cùng: 6,0 % |
| B7b (13 bài) | Phần Δ KHÔNG đến từ accept (execute + plan + review vượt A0; accept đo trực tiếp) | 53,2 % |
| B7b (13 bài) | Phần Δ đến từ đầu ra dài hơn (out vượt A0; không tách mẫu đầu ra / báo cáo bàn giao) | 45,4 % (28,1k/bài); nếu quy out trước: 56,3 % |
| B7b (13 bài) | Phần Δ đến từ cacheWrite vượt A0 | 7,8 % (4,9k/bài); nếu quy cacheWrite trước: 37,7 % |
| B7b (13 bài) | Phần Δ từ các pha khác + phần dư | 0,0 % (0,0k/bài) |
| B7b (13 bài) | Pha plan + review (tỷ trọng trong tổng weighted B7) | 15,0 % weighted B7 (không phải % của Δ) |

## Trả lời R11.3 bằng số (t1–t5; B7b trong ngoặc)

1. **Phần chênh ×2,5 đến từ accept:** **47,7 %** (46,8 %), tức 48,4k (29,0k) token weighted mỗi bài. Đây là số đo trực tiếp, vững nhất. Nếu trừ phần trùng với out/cacheWrite vượt A0 thì còn 14,5 % (6,0 %): hai con số là hai đầu của khoảng, vì `byPhase` không cho biết accept gồm bao nhiêu out hay cacheWrite.
2. **Đầu ra dài hơn:** out vượt A0 giải thích **50,4 %** (56,1 %) chênh weighted theo đại số thành phần (T-4); theo thứ tự quy phần, sau accept còn **43,6 %** (45,4 %). Không tách được mẫu đầu ra khỏi báo cáo bàn giao, cũng không tách được out của execute khỏi out của accept: không có out theo pha.
3. **Ghi cache (mỗi lượt gọi một phiên mới):** cacheWrite vượt A0 giải thích **36,8 %** (38,0 %) theo thành phần; sau accept và out còn **8,7 %** (7,8 %). Dữ liệu cho thấy lượng cacheWrite, không chứng minh nguyên nhân "phiên mới": cacheWrite mỗi lượt gọi B7 trung vị 17,8k (10,8k) so với 14,7k (13,2k) mỗi lượt A0 (T-4). Trên t1–t5 một lượt gọi B7 ghi cache gần bằng cả một lượt A0, nên 2 lượt gọi nhân gần đôi cacheWrite; trên B7b mỗi lượt gọi ghi ít hơn một lượt A0 nên giả thuyết đó yếu hơn.
4. **Các pha khác:** plan chiếm 3,9 % weighted B7 trên t1–t5 (14/45 lượt), plan + review 15,0 % trên B7b; không có review trên t1–t5. Theo thứ tự quy phần, chúng cùng cacheRead/input vượt A0 nhận **0,0 %** phần dư, vì accept + out vượt A0 đã vượt Δ (phần trùng). Theo thành phần, cacheRead vượt A0 là 12,8 % (5,9 %).
5. **Thời gian (×2,57 / ×2,56 tái lập):** **không tách được** theo execute, accept, lệnh kiểm tra, worktree hay định tuyến, vì `runs.jsonl` chỉ có `wallSec` toàn lượt (T-6). Dữ kiện mô tả: wall tương quan rất mạnh với out (Spearman 0,97 ở B7, 0,98 ở A0), nên thời gian chủ yếu đi theo lượng token sinh ra; B7 hai lượt (execute + accept, không plan) mất 100 s so với 52 s của A0, B7 có plan 200 s. Trên B7b nền cố định rõ hơn: A0 trung vị 15 s, B7 hai lượt 80 s. Một phần cố định đáng kể có thể có, nhưng chưa đo được.

## Hàm ý cho S3 (B-11), kèm giả định

- Bỏ hẳn accept (giả định cổng B-02 xanh cho phép): giữ 52,3 % (53,2 %) của Δ. Áp thô vào ước lượng ×2,51: 1 + 0,523 × 1,51 ≈ **×1,79**. Đây là phép nhân tỷ lệ phần chênh vào tỷ số, chưa kiểm bằng dữ liệu. Chưa đủ cho mục tiêu ×1,3.
- Nếu thêm vào đó cắt toàn bộ out vượt A0 (cận trên tuyệt đối, không khả thi vì ngoài mẫu đầu ra còn mã thật): phần còn lại 8,7 % ⇒ 1 + 0,087 × 1,51 ≈ ×1,13. Đích ×1,3 nằm giữa hai cận; cần số tiết kiệm out có thật từ phép đo B7′.
- Phần accept chứa trong nó out và cacheWrite chưa tách; S3 không được cộng tiết kiệm của accept với tiết kiệm của out hay cacheWrite (độ nhạy ở T-5 cho thấy trùng).
- Chỉ tiêu nên xét bằng cùng ước lượng điểm kiểu prereg (T-7), không dùng trung vị gộp.

## Phân tích lỗi

- Trên t1–t5 phần dư (iv) = 0 là hệ quả của việc out và accept trùng nhau, không phải bằng chứng các pha khác không tốn. Với B7b, plan + review là 15,0 % weighted B7 nhưng cũng nhận 0 % Δ vì cùng lý do.
- Các lượt nhiều lượt gọi kéo đuôi: 3 lượt 6 lượt gọi trên t1–t5 trung vị 518k weighted, 370 s (T-2). Trung vị qua bài ít chịu ảnh hưởng này; trung bình thì có.
- B7b: A0 và B7 khác cửa sổ và server, nên khác biệt B7b mang thêm sai lệch cửa sổ chưa định lượng được. Có 24 lượt B7 trên 13 bài (1–2 lượt mỗi bài), nên khoảng B7/A0 qua bài rất rộng (T-3).

## Tái lập

```
node docs/research/analysis/b7-cost-decomposition.mjs
node docs/research/analysis/b7-cost-decomposition.mjs --check docs/research/analysis/b7-cost-decomposition.md
```

Node ≥ 22, không gói ngoài; không dùng hạt ngẫu nhiên (T-7 gọi `bootstrapRatio` với `reps: 1` chỉ để lấy ước lượng điểm, không lấy CI).

## Giới hạn

### Giới hạn dữ liệu

- Server cloud không để lại `calls.jsonl` của từng task; `runs.jsonl` chỉ có tổng theo lượt và `byPhase` là weighted theo pha. Không có: out/cacheRead/cacheWrite/input theo pha; giây theo pha; thời gian lệnh kiểm tra baseline/sau; thời gian tạo worktree; độ dài prompt hệ thống và bản đồ repo; cờ có/không lượt định tuyến LLM; số lượt gọi của A0 (chỉ `turns`).
- `wallSec` của B7 tính từ lúc tạo dự án tới khi task xong, gồm cả `npm test` (nếu có `package.json`) và polling; `wallSec` của A0 là phiên CLI. Suy ra từ mã harness, chưa đo, nên Δ thời gian có thể gồm chi phí của chính harness.
- Các phần (ii)–(iv) của T-5 phụ thuộc thứ tự quy phần; chỉ (i) accept là số đo trực tiếp.
- Thống kê chỉ mô tả, không kiểm định. Kết quả âm tính: không tách được thời gian và out theo pha.

### Đề xuất SR mới (trường cần ghi)

| Trường | Ở đâu | Dùng để |
| --- | --- | --- |
| `byPhase[phase].{output,cacheRead,cacheWrite,input}` | `calls.jsonl` → `runs.jsonl` | tách out/cacheWrite của execute và accept (R11.3 câu 2, 3) |
| `byPhase[phase].{wallMs,calls}` | như trên | tách thời gian và số lượt gọi theo pha |
| `timing.baselineCheckMs`, `timing.afterCheckMs` | server | thời gian lệnh kiểm tra trước/sau |
| `timing.worktreeMs`, `timing.projectSetupMs` | server/harness | thời gian tạo worktree và dựng dự án |
| `prompt.systemChars`, `prompt.repoMapChars`, `prompt.docsChars` mỗi lượt gọi | server | đo biện pháp (c) giảm prompt |
| `routing.llm` (true/false) và `routing.lane` | server | đo biện pháp (d); phân biệt dự án ép làn |
| `outputChars` theo mục của mẫu đầu ra (tiêu đề → số ký tự) | harness | tách mẫu đầu ra khỏi báo cáo bàn giao (biện pháp b) |
| giữ nguyên `calls.jsonl` của mỗi lượt cloud dưới `results/…/artifacts/` | harness | để phân tích lại offline |
| `window`, `serverPort`, `commit` trên từng dòng `runs.jsonl` | harness | A0 và B7 cùng cửa sổ/server, tránh sai lệch B7b |

## Đầu ra consistency-check

```
$ node docs/research/scripts/consistency-check.mjs
Đạt: 32 tệp, không lệch số liệu.
exit 0
```

Và `node docs/research/analysis/b7-cost-decomposition.mjs --check docs/research/analysis/b7-cost-decomposition.md` → `OK: 8 bảng ... trùng đầu ra script.` (exit 0).
