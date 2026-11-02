# CHANGELOG v1 → v2 (T-20261102-121636-dd9)

> Cơ sở so sánh: v1 = commit `d363534`. v2 = nhánh nhiệm vụ đến S5 (`23350b9`) cộng sửa nhất quán của S6.
> Nguồn dữ liệu C1–C7: `perf/vs-claude-loop` commit `7fa6305` (hash ghi ở đầu `performance/token-analysis.md`).
> Mã R1 = `dev-review.md` §7. BRIEF-2 = `BRIEF-2.md`. T-x = bảng trong `performance/token-analysis.md`.
> Toàn bộ kết quả RQ3 là **minh họa**: n nhỏ, C7 chỉ 1 lượt làn nhanh và 2 lượt Sonnet mỗi bài, 8 phép kiểm định không hiệu chỉnh bội.

## Gói 2c (T-20261102-190653-75b, 2/11/2026)

- **S1 (@methodologist):** `preregistration.md` v2.1 và `suite-review.md`: sửa major H6 chạm trần (tập bài khai báo l1-modules, l2-chain, t1–t5; loại bài mà mọi lượt cả hai arm của cặp đều ≥ 0,99 (sửa ở vòng review 2 từ 1,00; một cặp NA ⇒ p(H6) = NA; p = NA vẫn phán quyết theo CI), giữ bài chạm trần một phía; Δ\* suy biến ⇒ p = NA, "Không kết luận (trần/suy biến)"; < 3 bài ⇒ ước lượng kèm CI 90 %, họ Holm còn H3), H3 chuyển sang hoán vị hai mẫu chính xác C(20, 10) = 184 756 (p_min 1/184 756), cột "Phép kiểm" H3/H6 ghi họ Holm K = 2 nếu SR-26 xong, SR-25 test 9 bỏ câu so sánh T\* − margin; §9 mục 6.
- **S2 (@data-scientist):** `performance/token-analysis.md` và `scripts/token-analysis.mjs`: nhãn "C7" viết cứng đổi thành hằng `SONNET_RD` (= `CONFIG.sonnetRound`), SR-27 mới trong `suite-review.md`; sinh lại T-d (3), T-h, T-i; viết lại §1, "Đọc T-h", "Đọc T-i" và kết luận §6–§7 theo bản có C9. `run-plan.md`: sửa dòng "`pilot*` không tồn tại" (`results/pilot1/` có, chỉ chứa `config.json`), thêm bước kiểm "rep chạy lại ≠ rep đã loại" vào checklist cho tới khi SR-01(d) được gộp.

## 0. Kết luận RQ3: v1 → v2

- **v1:** làn nhanh "không nhanh hơn rõ rệt" so với Claude Code (Opus); C6 ghi "chưa có".
- **v2:** cùng mô hình Sonnet và cùng thời điểm (C7), một agent nhanh hơn làn nhanh 1,6–2,9× ở 4/5 bài; làn nhanh chỉ hòa ở t5. Chênh +38,0 s (+44,3 %), p hoán vị 0,0329. Chi phí làn nhanh 2,5–3,8× Sonnet đơn, p 0,0041. Lợi thế so với Opus chủ yếu do mô hình (Sonnet đơn nhanh hơn Opus 90,8 s, làn nhanh chỉ 28–35 s). Chi phí cố định điều phối (T-d (3)) = 55,8 % thời gian Sonnet đơn ở C7 (72,8 % với C5–C7 gộp). Điều kiện có lợi (song song hóa được, bài đủ dài) chỉ là giả thuyết, cần bài > 15 phút.
- **Lệch so với BRIEF-2 (đã ghi ở mọi tệp):** lượt C7 t2 52/60 **không** phải "review không bắt". Reviewer ghi `approved: false` và nêu đúng lỗi #3 (mua X tặng Y) và #4 (hạn mã theo UTC). Hạng mục sở hữu `src/promotions.js` không chạy và không có vòng sửa (`reviewRound` = 0). Vì vậy v2 coi đây là điểm yếu điều phối, 1 lượt, và không dùng làm bằng chứng "verifier bỏ sót" hay đối chiếu TeamBench theo hướng đó (nguồn: bàn giao S1, `result.json`, `grade-hidden.tap`). Lý do hạng mục thứ ba không chạy: chưa xác định (không có `events.jsonl`).

## 1. Thay đổi theo tệp

### 1.1 Dữ liệu và mã phân tích (S1, @data-scientist)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `performance/token-analysis.md` | đầu tệp | Thêm hash nguồn `7fa6305`; C1–C7 | BRIEF-2 §3 |
| | T-0 | In đối chiếu `c6-extract/` với `results/` C6: 8/24/25/56 dòng trùng từng ký tự, bỏ `c6-extract` | BRIEF-2 §3 |
| | T-h (mới) | Bảng ba hệ Opus / Sonnet / làn nhanh theo bài; tỉ lệ 1,64–2,90 (gộp), 0,77–2,45 (chỉ C7); chi phí 2,47–3,79× | BRIEF-2 §2.1 |
| | T-i (mới) | Bootstrap và hoán vị: làn nhanh − Sonnet +38,0 s (p 0,0329), +0,441 USD (p 0,0041); làn nhanh − Opus C5–C6 và C5–C7; Sonnet − Opus −90,8 s | BRIEF-2 §2.1 |
| | T-d (3) | Thêm chi phí cố định điều phối: 55,8 % (239,5/429,0 s) C7; 72,8 % gộp; t2 94,9 %, t4 113,1 % | BRIEF-2 §2.2 |
| | T-f | Thêm cột p hoán vị; C6: 0,0556 (36 hoán vị, p nhỏ nhất 2/36) và 0,3889 | R1-02 |
| | Đọc T-e | O1 5,1 % → 4,6 %; tỷ trọng ra/ghi/đọc cache → 38,4/49,6/9,7 % | bảng hiện hành |
| `performance/scripts/token-analysis.mjs` | toàn bộ | Thêm C7, hệ `claude-sonnet`, T-h, T-i, mở rộng T-d; không đọc `c6-extract/`; `--check` khớp 12 bảng | BRIEF-2 §3 |
| `bench/vs-claude/harness/stats.mjs`, `stats.test.mjs` | tùy chọn | Thêm `--baseline <hệ>`, `--delta`, bỏ dòng trùng; +4 test (12/12 qua) | BRIEF-2 §3 |
| `bench/vs-claude/README.md`, `harness/run.mjs`, `harness/export.py`, `docs/PROCESS-REVIEW.md` | | Đồng bộ mô tả/công cụ C7 theo cùng commit S1 (`7eda63b`) | S1 |
| `BRIEF-2.md` (mới), `references-v2.md` (mới) | | Chép đề bài (S1); danh mục APA 7 đã tra (S2) | kế hoạch |

### 1.2 Lệch kỹ thuật R1 (S3)

| Tệp | Mục | Cũ → mới | Mã |
|---|---|---|---|
| `paper/paper.md` | §6 Bảng 3 | "C6 chưa có CI" → hai dòng C6: −72,8 s (p 0,0556), +0,136 USD (p 0,3889) | R1-02 |
| | Bảng 4, Bảng 5 | Thêm hàng C6 từ T-d (4 lượt) và T-b (3,37×) | R1-03, R1-04 |
| | §6 | 7/12 ô; 38,4/49,6/9,7 % (T-e); O1 0,037 USD, 4,6 % | R1-05, R1-06, R1-16 |
| | Bảng 3b | Nguồn T-a, T-b, T-f, T-g | R1-07 |
| | Bảng 1 | Thêm cột "Áp cho runtime"; trần vòng công cụ, ngân sách đầu vào công cụ, nhắc 35/65 %, `idleTimeoutMs`, `maxContinuations` không áp cho `claude-cli` | R1-10 |
| | §4.1, §8 | Mặc định phân loại dữ liệu (Công khai/Nội bộ mọi runtime; Bảo mật/Hạn chế chỉ `local`); "450–700 từ" không đơn vị; `git apply --unidiff-zero --ignore-whitespace` | R1-09, R1-13, R1-19 |
| `challenges.md` | K34, K46, C-05; K23, K10, K19, K28, K13, K40; L2, L3, L5, L6, L8, L9, L12, L15 | Sửa theo cột runtime, phạm vi reviewer, hằng số 60k/120k/200k/300k là ước lượng, hạng mục chỉ đọc | R1-08, R1-11 |
| `self-improvement/design.md` | nhật ký sự cố, chèn bản vá, chạy A/B, §9 | `capHits` = 0 với `claude-cli`; `ISSUE_RE` chưa export; dùng lại `TaskOptions.variant` + `COMMON_KEYS`; cờ `git apply` | R1-18, R1-19 |

### 1.3 Viết lại RQ3 trong bài (S4)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `paper/paper.md` (v0.2 → v0.3) | Tóm tắt VI/EN | Kết luận "không nhanh hơn rõ rệt" → câu RQ3 chuẩn kèm n nhỏ, p hoán vị | BRIEF-2 §1 |
| | §6.3 (mới), §6.4–6.6 | Thêm C7, Bảng 3c/3d/3e (T-h, T-i, T-d); phân tích t2 52/60 là lỗi điều phối | BRIEF-2 §2 |
| | §7, §8, §9 | Viết lại: tách hiệu ứng mô hình, giả thuyết điều kiện có lợi (> 15 phút), bỏ "đưa vào script S2" | BRIEF-2 §2 |
| | §3, §7.3, K.3 | CAID, Cognition 2026, *Don't Break the Cache* theo bản đã đọc | S2 |
| | Danh mục | Theo `references-v2.md`, đủ tác giả, DOI; năm trích đổi: EvoMAC/TextGrad/ADAS → 2025; AutoGen/DSPy → 2024; Kapoor → 2025 | BRIEF-2 §4 |
| | cuối tệp | Xóa ghi chú tạm của S3 | S3 |

### 1.4 Kế hoạch công bố, trình bày, thách thức (S5)

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `publication-plan.md` | tiêu đề, §0 | Thêm kết luận RQ3 v2 | R1-14 |
| | §1 N1, N3, E7 | Cập nhật theo C7; số T-e sửa theo bảng hiện hành | BRIEF-2 §2 |
| | §3 "Phương án dự phòng" (mới) | MSR 2027 Industry (18/12/2026) kênh chính đề xuất, **chờ Tom chốt**; AGENT'27 (13/11/2026) chỉ nếu có bản rút gọn không cần thí nghiệm thêm; SANER 2027 Agentic AI4SE hết hạn 23/10/2026 | BRIEF-2 §5 |
| | §4, §5, §6 | D1–D5, D8 hiện trạng; đe dọa tính hợp lệ (n nhỏ, đồng thời, 8 phép kiểm không hiệu chỉnh, bài ngắn); lộ trình, mốc 1/12/2026 | BRIEF-2 §2 |
| | §8, §9, tham khảo | Bỏ câu casrai.org (không có nguồn chính thức); §9 viết lại; tham khảo theo `references-v2.md` | S2 |
| `presentation-notes.md` | thông điệp chính, slide 3, 6, 7, 9, 12, 13, 17, hỏi đáp | Thay số và kết luận; thêm slide 10 "Tách hiệu ứng mô hình (C7)" (tổng 17 slide) | R1-15 |
| `challenges.md` | ghi chú đầu tệp, C-12, L11, P-07 | "C6 chưa có dữ liệu" → số C6, C7 (T-a, T-f, T-h, T-i, T-d) | R1-12 |

### 1.5 Sửa nhất quán của S6

| Tệp | Mục | Cũ → mới | Lý do |
|---|---|---|---|
| `related-work.md` | đầu "Kết luận điểm mới" | "C6 chưa có dữ liệu" → "C1–C7 đã có (T-h, T-i, T-d)" | R1-17 còn sót |
| | K.2 N1 | "Phải có số thật từ S2; C6 chưa có" → "Số thật từ token-analysis.md (C1–C7)" | R1-17 |
| | K.2 N4 | "C6 chưa có" → nêu rõ C6 chỉ kiểm bản sửa `maxParallel`, không phải vòng tự cải thiện | R1-17; tránh nói quá |
| | K.1 E4–E6 | Năm trích: Khattab 2023→2024; Yuksekgonul 2024→2025; Hu (ADAS, EvoMAC) 2024→2025; Kapoor 2024→2025 | `references-v2.md` |
| `CHANGELOG.md` | | Tệp này | S6 |

## 2. Phủ git diff

`git diff --name-status d363534 HEAD` có 16 tệp; tất cả có mục ở §1: bench (README, export.py, run.mjs, stats.mjs, stats.test.mjs) và `docs/PROCESS-REVIEW.md` ở §1.1; `BRIEF-2.md`, `references-v2.md` ở §1.1; `challenges.md`, `design.md` ở §1.2/§1.4; `paper.md` ở §1.2/§1.3; `token-analysis.*` ở §1.1; `presentation-notes.md`, `publication-plan.md` ở §1.4; `related-work.md` ở §1.5 (cộng thay đổi của S2 trước đó: thêm CAID/Cognition/Don't Break the Cache ở K.1–K.3, theo `references-v2.md`). Đổi sau HEAD: `related-work.md` và `CHANGELOG.md` (S6).
Giới hạn: bảng §1 dựa trên `--name-status`, bàn giao S1–S5 và các lần đọc trực tiếp của S6; tôi chưa đọc diff từng dòng của `paper.md` và `related-work.md`, nên số dòng nêu trong §3.2 là số dòng hiện tại của tệp, cần kiểm lại nếu tệp còn đổi.

## 3. Kiểm cho phản biện

### 3.1 Số (≥ 5)

| # | Số | Vị trí | Đối chiếu |
|---|---|---|---|
| 1 | Thời gian TB Opus/Sonnet/làn nhanh: t1 126/66/108 · t2 91/42/94 · t3 205/108/199 · t4 203/49/142 · t5 259/166/165 | `paper.md` Bảng 3c; `presentation-notes.md` slide 6; `publication-plan.md` §0 | T-h; `results/runs.csv` |
| 2 | Tỉ lệ làn nhanh/Sonnet 1,64 · 2,27 · 1,85 · 2,90 · 1,00 (nhanh hơn 1,6–2,9× ở 4/5 bài); chỉ C7: 1,66/1,71/1,79/2,45/0,77 | `paper.md` Tóm tắt, §6.3; `challenges.md` L11 | T-h |
| 3 | Chi phí làn nhanh/Sonnet 2,47–3,79× (ghi 2,5–3,8×); p hoán vị 0,0041; +0,441 USD | `paper.md` §6.3; `publication-plan.md` §0; `presentation-notes.md` slide 10 | T-i hàng 1 |
| 4 | +38,0 s (+44,3 %), p hoán vị 0,0329 (243 hoán vị; p nhỏ nhất 1/243); CI [35,0; 41,0] hẹp giả tạo, không trích | `paper.md` Bảng 3d; `presentation-notes.md` | T-i hàng 1; `stats.mjs --rounds C7 --baseline claude-sonnet` |
| 5 | C6 làn nhanh − Opus: −72,8 s [−105,3; −40,3], **p 0,0556** (p nhỏ nhất 2/36); chi phí +0,136 [−0,016; 0,287], p 0,3889 | `paper.md` Bảng 3 (dòng C6); `challenges.md` ghi chú đầu tệp, P-07 | T-f; `dev-review/stats-report.md` |
| 6 | Chi phí cố định điều phối 55,8 % (239,5/429,0 s) C7; 72,8 % C5–C7; t2 94,9 %, t4 113,1 % | `paper.md` §6.5; `publication-plan.md` §0; `challenges.md` P-07 | T-d (3) |
| 7 | Sonnet − Opus −90,8 s (−51,4 %); làn nhanh − Opus −28,2 s (C5–C6) và −34,9 s (C5–C7, p chi phí **0,0944**) | `paper.md` Bảng 3d | T-i hàng 2–4 |
| 8 | Test ẩn đạt trọn: Sonnet 10/10, Opus 13/14, làn nhanh 17/18; C7 t2 52/60 (8 test hỏng: 6 của #3, 2 của #4) | `paper.md` §6.3, §7 | T-h; `result.json`, `grade-hidden.tap` của C7 t2 |

Cột `failed_hidden` trong `runs.csv` chỉ liệt kê 5 mục (toàn #3); danh sách đủ ở `result.json`. Phản biện không nên trích cột đó.

### 3.2 Trích dẫn đã sửa (≥ 5)

| # | Trích dẫn | Sửa | Vị trí | Đối chiếu |
|---|---|---|---|---|
| 1 | TextGrad (Yuksekgonul và cộng sự) | arXiv 2024 → *Nature* 639(8055):609–616 (2025), doi 10.1038/s41586-025-08661-4, tên "Optimizing generative AI by backpropagating language model feedback", thêm tác giả Pan Lu (8 tác giả). Chưa tự mở trang Nature [V-BRIEF] | `paper.md` danh mục (dòng 438); `related-work.md` K.1 E4 | `references-v2.md`; BRIEF-2 §4 |
| 2 | Optima (Chen và cộng sự) | Findings of ACL 2025, pp. 11534–11557, doi 10.18653/v1/2025.findings-acl.601 | `paper.md` dòng 396 | `references-v2.md` [V-chính] |
| 3 | Agentless (Xia và cộng sự) | Bản FSE 2025, *PACMSE* 2(FSE), doi 10.1145/3715754, tên "Demystifying LLM-based software engineering agents". DOI chưa mở được [V-BRIEF] | `paper.md` dòng 428 | `references-v2.md`; arXiv:2407.01489 |
| 4 | AgentDojo (Debenedetti và cộng sự) | Điền đủ 6 tác giả, NeurIPS 2024 (trước để trống) | `paper.md` dòng 392 | `references-v2.md` dòng 70 |
| 5 | AgentCoder (Huang và cộng sự) | Điền đủ 6 tác giả, ghi phiên bản arXiv:2312.13010v3, Preprint | `paper.md` dòng 406 | `references-v2.md` |
| 6 | MAST (Cemri và cộng sự) | arXiv → NeurIPS 2025 (vol. 38), 13 tác giả [V-thứ cấp] | `paper.md` dòng 394 | `references-v2.md` |
| 7 | AI Agents That Matter (Kapoor và cộng sự) | 2024 → TMLR 2025 [V-thứ cấp] | `paper.md` dòng 408 | `references-v2.md` dòng 31 |
| 8 | AutoGen (Wu và cộng sự) | 2023 → COLM 2024; 14 tác giả theo arXiv (Microsoft Research ghi 13) | `paper.md` dòng 426 | `references-v2.md` |
| 9 | DSPy (Khattab và cộng sự) | 2023 → ICLR 2024; tên "…into self-improving pipelines" | `paper.md` dòng 410 | `references-v2.md`; BRIEF-2 §4 |

Còn nhãn [V-thứ cấp] và [V-BRIEF] (MAST, Kapoor, AutoGen, TextGrad, Agentless): cần mở trang chính trước khi nộp. Magentic-One 19 tác giả, BRIEF-2 ghi 20; đã giải thích ở `references-v2.md`.

## 4. Kiểm chéo số liệu liên tệp

Phương pháp: tìm từng số bằng Grep trên `paper.md`, `publication-plan.md`, `presentation-notes.md`, `challenges.md` (kể cả dạng viết sai: `0,056`, `0.0556`, dấu chấm thập phân ở bản VI).

| Số | paper.md | publication-plan.md | presentation-notes.md | challenges.md | Kết quả |
|---|---|---|---|---|---|
| p hoán vị C6 0,0556 | ✔ | ✔ | ✔ | ✔ | khớp |
| Nhanh hơn 1,6–2,9× | ✔ | ✔ | ✔ | ✔ | khớp |
| +38,0 s, p 0,0329 | ✔ | ✔ | ✔ | ✔ | khớp |
| Chi phí 2,5–3,8× | ✔ | ✔ | ✔ | — | khớp (challenges không nêu) |
| p chi phí 0,0041 | ✔ | ✔ | ✔ | — | khớp |
| Thời gian t5 259 / 165 s | ✔ | ✔ | ✔ | 165 có, 259 không | khớp (không mâu thuẫn) |
| T-d 55,8 % | ✔ | ✔ | ✔ | ✔ | khớp |
| T-d 72,8 % | ✔ | ✔ | — | — | khớp (không mâu thuẫn) |
| T-d t2 94,9 %, t4 113,1 % | ✔ | ✔ | ✔ | — | khớp |
| Sonnet nhanh hơn Opus 90,8 s | ✔ | ✔ | ✔ | — | khớp |

`—` = tệp không nêu số đó; không có bản nào nêu số khác.

Không phát hiện số lệch. Chỉ khác về cách viết: bản EN trong Tóm tắt dùng dấu chấm thập phân ("38.0 s", "55.8%"), bản VI dùng dấu phẩy; đó là chủ ý.

## 5. Kết quả tìm `chưa có dữ liệu|C[67][^\n]{0,40}chưa có|et al\.` trong `docs/research/*.md`

Lệnh tương đương: `grep -rnE 'chưa có dữ liệu|C[67].{0,40}chưa có|et al\.' --include=*.md docs/research` (chạy bằng công cụ Grep, không có quyền chạy grep shell có ghi tệp).

| Nhóm | Trước sửa | Sau sửa | Ghi chú |
|---|---|---|---|
| "C6/C7 … chưa có" trong tệp sản phẩm | `related-work.md` 3 dòng (337, 358, 361) | **0** | Đã sửa ở §1.5 |
| Cụm này trong `BRIEF-2.md`, `dev-review.md`, `dev-review/verification.md` | có | có | Nhật ký lịch sử/đề bài, không sửa |
| "chưa có số đo" (nằm ngoài regex) | `paper.md`, `publication-plan.md`, `presentation-notes.md`, `design.md` | không đổi | Nói về cơ chế/N4 chưa đo hiệu quả, đúng thực tế; không phải C6/C7 |
| `et al.` | `paper.md` ~14 dòng, `related-work.md` ~36, `references-v2.md` 16, `BRIEF.md`, `BRIEF-2.md`, `dev-review*` | không đổi | Xem dưới |

**Còn lại không bằng 0 và lý do:**
- `paper.md`: "X et al. (năm)" trong thân bài và ở §3/§7. Đây là cách trích trong văn bản APA 7 hợp lệ cho ≥ 3 tác giả; danh mục cuối bài có **0** "et al." (đủ tác giả). `publication-plan.md` dùng "và cộng sự" (S5 đổi). Hai cách viết khác nhau giữa hai tệp, không sai về số liệu; nếu Tom muốn thống nhất thì đổi hàng loạt `et al.` → `và cộng sự` ở `paper.md`, `related-work.md`.
- `related-work.md`: các mục APA v1 (§2 và Nhóm B) vẫn ghi "Tác giả đầu, et al." Ghi chú dòng 396 của tệp nói bản dùng để trích là `references-v2.md`. Tôi không viết lại 30 mục ở đây vì trùng với `references-v2.md`.
- `references-v2.md`: mô tả cột "v1 → v2" ("et al." → đủ tác giả).

→ Tiêu chí "bằng 0 ngoài nhật ký lịch sử" đạt cho `chưa có dữ liệu` và `C6/C7 … chưa có`; **chưa đạt** cho `et al.` ở `paper.md` thân bài và `related-work.md` (lý do ở trên, chờ Tom chọn).

## 6. Data Protection

Dữ liệu là log benchmark tổng hợp (nhãn nội bộ), không có dữ liệu cá nhân (DLCN). Dự án A tiếp tục ẩn danh. Không thêm tập dữ liệu mới. Không cần đánh giá bảo vệ dữ liệu mới; `docs/data-protection-assessment.md` không đổi. Truy vấn tìm kiếm của S2 không chứa chi tiết nội bộ.

## 7. Việc còn lại và lệnh cần chạy (S6 không có quyền chạy)

- `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` (S1 đã báo exit 0).
- `node --test bench/vs-claude/harness/stats.test.mjs` (S1 báo 12/12).
- `npm run typecheck && npm test` (S1 báo qua; docs không ảnh hưởng).
- `git grep -nE "chưa có dữ liệu|C[67].{0,40}chưa có" -- docs/research ':!docs/research/dev-review*' ':!docs/research/BRIEF-2.md'` kỳ vọng 0.
- Chờ Tom: chốt kênh công bố (MSR 2027 Industry 18/12/2026; AGENT'27 13/11/2026 chỉ khi có bản rút gọn); chọn `et al.` hay "và cộng sự".
- Mở trang chính cho nguồn gắn [V-thứ cấp]/[V-BRIEF] trước khi nộp.

## 2/11/2026 — gói R3-1

Nhiệm vụ T-20261102-134405-b2c, hạng mục S1 (R2, @data-scientist). Nguyên nhân chung: **thêm C8** vào bảng (3 lượt làn nhanh trên t2, không có Sonnet đơn) và **sửa `token-analysis.mjs`** (tự phát hiện vòng; chỉ ảnh hưởng nội dung bảng ở T-0 qua danh sách vòng). Số cũ → mới:

| Bảng | Số cũ → mới | Nguyên nhân |
|---|---|---|
| T-0 | 38/38 → 41/41 lượt CCoding khớp; 72 → 75 lượt chạy; 217 → 235 dòng calls.csv; 209 → 226 dòng phases.csv; vòng C1–C7 → C1–C8; nguồn `7fa6305` → `bb7b477` | thêm C8; sửa `sourceCommit` |
| T-a | thêm dòng C8 t2-orders (n = 3, 180/180, 129 s, 0,793 USD) | thêm C8 |
| T-d | thêm C8: 4 dòng pha (plan/execute/review/revise) và dòng theo lượt chạy (129 s, tiết kiệm 38,0 %); mục (3) không đổi | thêm C8 |
| T-e0 | sonnet: 175 → 193 lượt gọi, giá đầu ra 9,80 → 9,81, giá ghi cache 4,06 → 4,05 | thêm C8 (18 lượt gọi) |
| T-e1 | 217 → 235 lượt gọi; F 2 350 → **3 607** token; a 1,55 → 1,45; b 1,13 → 1,10; R² 0,755 → 0,680 | thêm C8 |
| T-e | O1: 0,037 → 0,057 USD, 4,6 → **7,1 %** (do F); ghi cache nền C5 49,6 → 49,5 %; O2–O6 không đổi | F đổi ở T-e1; làm tròn |
| T-f | thêm dòng C8 (không có đối chứng Opus cùng vòng) | thêm C8 |
| T-b, T-c, T-g, T-h, T-i | không đổi | C8 không có cặp Claude cùng vòng, không thuộc `fastRounds` |

- **Con số 55,8 % (T-d (3), C7) còn nguyên**: C8 không có Sonnet đơn nên không vào mẫu số; C7 vẫn là vòng làm nền. Gộp C5–C7 (72,8 %) cũng không đổi.
- **Mã:** `CONFIG.rounds`, `opusRounds`, `sonnetRound`, `fastRounds`, `phaseTableRounds` tự phát hiện từ `results/C<n>/<bài>.<hệ>.<lượt>`; `fastRounds` = vòng có làn nhanh và có Claude cùng vòng (nên không gồm C4, C8). `hung`, `pooledRounds`, `costBasisRound` vẫn khai báo tường minh. `--check` thoát mã 1 kèm thông báo "Bảng cũ: results/ có vòng … chưa có trong T-0" khi `results/` có vòng chưa ghi ở bảng; thêm cờ `--results <thư mục>`.
- **Cảnh báo độ ổn định của F (T-e1):** F tăng 2 350 → 3 607 token (+53 %) chỉ vì thêm 18 lượt gọi, R² giảm 0,755 → 0,680. Ước lượng F và O1 (4,6 → 7,1 %) chưa ổn định, chưa có CI. Không dùng O1 làm căn cứ định lượng cho quyết định cho đến khi có thêm vòng và CI bootstrap.
- **Đầu ra nguyên văn bước (1):** `performance/required-runs-2026-11-02.md`.
- **Mới:** `performance/scripts/variance-by-cell.mjs` (sd thời gian, chi phí, tỉ lệ test ẩn theo bài × hệ) làm đầu vào cho đăng ký trước.

## 2/11/2026 — gói R3-2

- **R8 (T-20261102-175854-65c, S3, @research-lead) — `improvement-backlog.md` sửa tại chỗ:** thêm **B-10** cổng phủ kế hoạch (§5; quy tắc A: tệp/module nêu trong đề bài hoặc tóm tắt kế hoạch mà không hạng mục nào nhận ⇒ chặn trước thực thi; quy tắc B: kế hoạch đọc dở ⇒ không chạy; nơi đo H8 `analyze.mjs:96-100`, kèm giới hạn: phán quyết H8 chỉ dựa `formatMiss` mà `gradeCode` không đặt, nên chưa bắt ca coding kiểu t5); sửa B-02 §4.1 bước 2 (đỏ kéo dài mà đề bài yêu cầu lệnh xanh ⇒ bắt buộc vòng sửa, reviewer LLM không quyết duyệt; bằng chứng `results/C9/t5-logq.ccoding-fastlane.2/ccoding-task.json:4, 83, 85-86, 174-201`); §0 thêm B-10 hạng 3, các mục B-03…B-09 lùi một hạng; §6 viết lại theo hệ chính H1–H10 của bộ đo giám đốc, giả thuyết bản 1 đổi H_i → P_i (ghi ĐK-P_i trong backlog vì trùng mã bản vá prompt P1–P4). Đính chính `context/c9-partial-2026-11-02.md` §2: 51 test ẩn hỏng của t5 = 37 nhóm "tổng hợp" + 14 nhóm "CLI" (`result.json:44-94`), không phải toàn bộ "tổng hợp".
- **R6 (T-20261102-175854-65c, S4, @methodologist) — `preregistration.md` v1.0 → v2.0 (khóa có điều kiện), sửa tại chỗ:** hệ chính đổi sang **H1–H10 của bộ đo giám đốc** (`analyze.mjs`, giữ nguyên mã; mỗi H có phép kiểm, ngưỡng, dòng mã, N tối thiểu và trạng thái đạt/không đạt trước 5/11 từ `run-plan.md` §4; họ Holm K = 4 {H1, H2, H3, H6}; H8, H9, H10 chỉ mô tả/thăm dò); **9 giả thuyết bản 1 (không phải 8 như brief) đổi mã H_i → P_i (P1–P9)**, bảng ánh xạ P↔H đủ 9 dòng (trùng ý/bổ sung/chỉ bộ cũ), P9 ánh xạ sang B-01 mới; thêm giả thuyết **B-01** (làn đơn `SL` so với A0-sonnet, TOST ±15 % ba đại lượng: token có trọng số, thời gian, điểm; USD chỉ là độ nhạy; bootstrap 90 % CI; t1–t5; 45/arm) và **B-02** (B02-M cơ chế phát lại ca t5 dùng §4.1 bước 2 và B-10; B02-G, B02-Q, B02-H8b chỉ mô tả vì không đạt thống kê); §4.3 ba tiêu chí loại lượt Q (hạn mức), L (`leak`), T (timeout) cho bộ mới, kèm cách nhận diện qua trường của `runs.jsonl`; §6 đe dọa hiệu lực từ `suite-review.md`; §8 chừa chỗ cho hash commit merge Phòng Dev; §9 danh sách SR-01…SR-07 và SR-08a (P0; mục giám khảo cặp sau đó tách thành SR-08a/SR-08b ở v2.1) đang chờ. Bản 2 khóa có điều kiện: H nào chờ SR-xx ghi ở cột "Khóa"; nếu SR P0 đổi phép kiểm hay ngưỡng thì ghi v2.1.
