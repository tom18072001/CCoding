# Đánh giá kỹ thuật của Phòng Phát triển (D1) — T-20261102-112755-181

> Phòng Phát triển · @solution-architect (S5, gộp S1–S4) · 2/11/2026 · Phân loại: **Nội bộ**.
> **Trạng thái đối chiếu:** HEAD `e886c04f…` (nhánh `ccoding/t-20261102-112755-181--s5`), worktree sạch. S2 và S3 kiểm trên HEAD `8b52644f…`; `git diff --stat 8b52644 HEAD -- paper.md challenges.md publication-plan.md presentation-notes.md src/` **rỗng**, nên mọi số dòng `tệp:dòng` của S2/S3 dùng nguyên được ở HEAD hiện tại.
> **Quy ước:** mọi con số trong tệp này trích nguyên văn từ S1 (`dev-review/stats-report.md`), S2 (`dev-review/verification.md`), S3 (`dev-review/technical-check.md`), S4 (`dev-review/experiment-plan.md`) hoặc bảng T-x của `performance/token-analysis.md`. S5 không tự tính số mới, trừ phép đối chiếu công thức ở §5.2 (ghi rõ là tính tay, chờ kiểm bằng lệnh).
> **Vai trò S5 không có quyền chạy lệnh** (hook chỉ cho git/đọc tệp). Mục "đã chạy" dưới đây là exit code do S1/S2/S4 ghi lại; S5 không chạy lại.

## 0. Tóm tắt cho người đọc nhanh

1. **Số liệu hiệu năng trong bản thảo phần lớn đúng.** Script `token-analysis.mjs` chạy lại được và `--check` khớp 10 bảng (S2). `stats.mjs` độc lập của S1 cho đúng các khoảng tin cậy của T-f: C6 thời gian **−72,8 s [−105,3; −40,3]**, chi phí **+0,136 USD [−0,016; 0,287]**. Trong 20 số S2 đối chiếu có **3 chỗ lệch** (`paper.md:248`, `paper.md:222`, `publication-plan.md:30/:159`).
2. **Ý nghĩa thống kê của C6 yếu hơn cách bài đang viết.** CI bootstrap của C6 không chứa 0, nhưng kiểm định hoán vị chính xác cho **p = 0,0556** (36 tổ hợp, p nhỏ nhất có thể đạt là 2/36). Gộp C5+C6 bỏ lượt treo: p = 0,0326; giữ lượt treo: p = 0,777 (S1). Bài chỉ được gọi C6 là **minh họa**.
3. **Mô tả kỹ thuật: 34 đúng · 16 đúng một phần · 2 sai · 1 chưa kiểm** trên 53 khẳng định (S3). Phát hiện nặng nhất: `toolTurns`, `toolInputBudget`, nhắc 35/65 %, `idleTimeoutMs` và `maxContinuations` **không có hiệu lực với `claude-cli`**, tức runtime của toàn bộ benchtest. Hai chỗ sai: K34 (hằng số ước lượng bị gọi là ngân sách) và K46 (danh sách runtime của nhãn Nội bộ).
4. **Bản vá P1–P4 không qua `git apply --check` trần** (exit 1 ×4), chỉ qua khi thêm `--unidiff-zero --ignore-whitespace` (exit 0 ×4). Nguyên nhân là CRLF/LF và hunk không có ngữ cảnh, không phải mã đã đổi (S2).
5. **Kế hoạch thí nghiệm:** MVP 184 lượt, ≈ 14,8 giờ thực, ≈ 448 USD (giả định); mở rộng thêm 404 lượt, ≈ 19,8 giờ, ≈ 521 USD (S4). Đối chiếu số lượt cần giữa S1 và S4: **không lệch quá 1 lượt/ô** (§5.2).
6. **Ưu tiên cải thiện hàng đầu** (§6): (1) R1 đồng bộ tài liệu; (2) P4 nhật ký sự cố khi sửa; (3) trần lượt cho `claude-cli`; (4) harness H1/H2/H5/H6 trước gói A; (5) bật cờ "cần xem" khi review không kiểm chứng. Có 3 bản vá `src/` mới dưới `dev-review/patches/` (**chưa kiểm `--check`**).

## 1. Kiểm tra kỹ thuật: mô tả trong bài so với mã (từ S3)

Chi tiết 53 khẳng định: `dev-review/technical-check.md` §1. Tóm lược các mục cần hành động:

| Mã S3 | Vị trí trong bài | Kết luận | Bằng chứng (S3) | Việc cần làm |
|---|---|---|---|---|
| K34 | `paper.md:103`, `challenges.md:104` (L7) | **Sai** | 60k/120k/200k/300k là `estimate.perSubtask` (`src/config.ts:312`), chỉ để ước lượng; ngân sách hạng mục thật là `subtaskBudget()` = max(100 000; 2 × `budgetTokens` / số hạng mục) (`src/orchestrator.ts:1685-1689`) | R1 sửa câu theo đề xuất K34 |
| K46 | `challenges.md:110` (L13) | **Sai** so với mặc định repo | `allowedRuntimes.internal = ['*']` (`src/config.ts:324`, `ccoding.config.json:105-110`) | R1 sửa L13; Tom xác nhận có `ccoding.local.json` ghi đè không (câu hỏi mở 1 của S3) |
| K35, K37, K38, K32 | `paper.md:102-104`, `challenges.md:103-105` | Đúng một phần | Chỉ `src/runtimes/api.ts:263-264, 377-378, 514` đọc các giá trị này; `claude-cli.ts:145-176` không truyền trần | R1 thêm cột "áp cho runtime" vào Bảng 1; cải thiện I-03 (§6) |
| K39 | `paper.md:105` (L9) | Đúng một phần | `capped` chỉ do `api.ts` đặt (`api.ts:387, 530, 595`) → với `claude-cli`, `maxContinuations` không kích hoạt và KPI `capHits` luôn 0 | R1 ghi chú; design.md không dùng `capHits` làm tín hiệu sự cố cho benchtest |
| K23 | `paper.md:86` | Đúng một phần | Làn nhanh chỉ đổi mô hình pha plan sang Sonnet (`orchestrator.ts:1148`); bỏ discuss + finalize; synthesize dựng từ mẫu, không gọi LLM (`:1466-1467`) | R1 sửa câu |
| K10 | `paper.md:111`, `challenges.md:112` (L15) | Đúng một phần | Ở làn đầy, không có kiểm tra chặn reviewer review hạng mục của chính mình (`orchestrator.ts:1316`) | R1 nêu là giới hạn; cải thiện I-07 |
| K19 | `paper.md:111`, `challenges.md:112` | Đúng một phần | `verified === false` chỉ ghi log `review.unverified`; `attention` chỉ bật khi chưa duyệt hoặc lệnh kiểm còn lỗi (`orchestrator.ts:1377-1385, 1437-1438`) | R1 sửa câu, hoặc áp bản vá D-02 |
| K28 | `paper.md:99`, `challenges.md:100` (L3) | Đúng một phần | `outsidePathReason` cho phép thư mục tạm và thư mục hệ thống (`src/tools/shell-policy.ts:53-87`) | R1 nêu ngoại lệ; cải thiện I-13 |
| K40 | `challenges.md:106` (L9) | Đúng một phần | "2–4 hạng mục" chỉ là chữ trong prompt (`src/prompts.ts:379`), mã không cưỡng chế | R1 ghi "ràng buộc mềm" |
| K13 | `paper.md:84` | Đúng một phần | Gộp bằng `merge --no-ff --no-edit --no-verify` (`src/git.ts:144, 156`) — hook git của repo không chạy khi gộp | Cải thiện I-11 |
| K51 | `challenges.md:29` (C-05) | Chưa kiểm được | `wc -w` cho 735–941 nhưng đếm theo âm tiết, gồm frontmatter | R1 ghi rõ đơn vị |

S3 còn liệt kê 14 cơ chế có trong mã mà bài chưa nhắc (`technical-check.md` §2) — đáng đưa vào bài nhất: tiêu chí `pickLane` (4 000 ký tự / 300 tệp / 1,5 MB, để tái lập), hạng mục phụ thuộc chờ tiền đề được **gộp** (ảnh hưởng đường găng T-d), báo cáo làn nhanh không gọi LLM, hook fail-closed, và `--no-session-persistence` (`claude-cli.ts:145`) giải thích vì sao mỗi lượt gọi tự ghi cache (C-13).

### 1.1. Đối chiếu chéo: mục "sai" của S3 với bảng con số của S2

| Mục S3 | Có trong 20 số S2 đối chiếu? | Kết quả đối chiếu |
|---|---|---|
| K34 (`paper.md:103`) | Không — S2 chọn dòng có số hiệu năng (vòng/cache/giây/USD); L7 là hằng số cấu hình | Không mâu thuẫn. Hai nguồn độc lập, cả hai đưa vào R1 |
| K46 (`challenges.md:110`) | Không | Không mâu thuẫn |
| K52: `5866cda` tồn tại | S2 mục 3: 54/54 hash là `commit`, có `5866cda` và `d7600f6` | **Khớp** |
| 10 hash S3 kiểm (`d7600f6, 0e82b82, a9b6214, 7291cec, ba70470, 8f92a52, f4681f1, 505a1df, b80769b, fc570f3`) | Cả 10 nằm trong danh sách 54 hash của S2 | **Khớp** |
| K44: "93k → 7,6k token" chỉ có trong chú thích mã | S2 không đối chiếu | Bằng chứng yếu, ghi nguồn là chú thích `claude-cli.ts:173` |

Kết luận: các mục "sai" của S3 là sai **mô tả cơ chế**, các mục lệch của S2 là sai **con số**. Không có mục nào hai bên kết luận ngược nhau.

## 2. Kiểm số liệu (từ S2, S1)

| # | Tệp:dòng | Bài ghi | Script / bảng | Kết quả | Nguồn |
|---|---|---|---|---|---|
| 1 | `paper.md:248` | đầu ra 38.1 %, ghi cache 49.4 %, đọc cache 10.2 % | 38.3 %, 49.6 %, 9.9 % (T-e, dòng "Nền"; tổng 8.042 USD khớp) | **Lệch** | S2 #18 |
| 2 | `paper.md:222` | "5/10 ô trong khoảng 2,8–4" | 7/12 ô (khoảng 2.76–6.08 khớp; T-b đã có C6) | **Lệch** | S2 #19 |
| 3 | `publication-plan.md:30`, `:159` | O1 "trần trên 5.1 %" | 4.7 % (0.038 USD, T-e) | **Lệch** | S2 #20 |
| 4 | 17 số khác (`paper.md:107, 162, 171, 175, 187, 190, 216, 229, 246, 332`; `challenges.md:37, 132`; `publication-plan.md:123`; `presentation-notes.md:29`) | — | — | Khớp | S2 #1–17 |
| 5 | T-f (C6, C5, C5+C6 có/không lượt treo) | 8 dòng chỉ số | `stats.mjs` cho cùng số | Khớp 8/8 | S1 "Đối chiếu" |

Chỗ chưa kiểm: số thô trong `c6-extract/*.csv` so với commit `5866cda` (S2 §6); các bảng C1–C4 của T-f bằng `stats.mjs` (S1 chỉ đối chiếu C5, C6, C5+C6).

## 3. Lệnh kiểm chứng và kết quả

### 3.1. Đã chạy (exit code do hạng mục chạy ghi lại)

| # | Lệnh | Người chạy | Exit | Kết quả |
|---|---|---|---:|---|
| 1 | `node docs/research/performance/scripts/token-analysis.mjs` | S2 | 0 | 261 dòng, bảng T-0, T-a…T-g; stderr rỗng |
| 2 | `node …/token-analysis.mjs --check docs/research/performance/token-analysis.md` | S2 | 0 | `OK: 10 bảng … trùng đầu ra script.` |
| 3 | `git apply --check <P1…P4>` (trần) | S2 | 1 ×4 | `patch failed: src/prompts.ts:480 / 271 / 624 / 524` |
| 4 | `git apply --unidiff-zero --ignore-whitespace --check <P1…P4>` | S2 | 0 ×4 | không lỗi; chưa kiểm bốn bản vá có chồng nhau không |
| 5 | `git log --oneline d7600f6..HEAD -- src/prompts.ts` | S2 | 0 | rỗng (mã không đổi từ `d7600f6`) |
| 6 | `git cat-file -t` × 54 hash trong `challenges.md` | S2 | 0 | 54/54 `commit` |
| 7 | `grep -rnE 'C6.{0,40}chưa có\|không nhanh hơn rõ rệt' --include=*.md docs/research` | S2 | 0 | 17 dòng (§7) |
| 8 | `node --test bench/vs-claude/harness/stats.test.mjs` | S1 | 0 | 8 pass, 0 fail (gồm σ = Δ = 1 → 16 lượt) |
| 9 | `node bench/vs-claude/harness/stats.mjs --rounds C6` / `C5` / `C5,C6` / `C5,C6 --exclude-run T-20261102-105231-9e5` / `… --required-runs --sim` / `--rounds C6 --format json` | S1 | 0 ×6 | đầu ra đầy đủ trong `stats-report.md` |
| 10 | `node docs/research/dev-review/estimate.mjs` | S4 | 0 | 57 lượt `done`; bảng E-1…E-4 |
| 11 | `git rev-parse HEAD`, `git status --short`, `git log --oneline -1` × 10 hash, `git cat-file -t 5866cda`, `wc -w agents/*/*.md` | S3 | 0 | xem `technical-check.md` §6 |
| 12 | `git rev-parse HEAD`; `git diff --stat 8b52644 HEAD -- <tài liệu bài> src/` | S5 | 0 | `e886c04…`; diff rỗng |

### 3.2. Chưa chạy (cần người có quyền, gợi ý cho reviewer @qa-tester)

```bash
# Bản vá mới của S5 (chưa kiểm --check) — dùng cùng cờ với P1–P4 vì working tree CRLF
git apply --ignore-whitespace --check docs/research/dev-review/patches/D-01-claude-cli-max-turns.diff
git apply --ignore-whitespace --check docs/research/dev-review/patches/D-02-attention-unverified.diff
git apply --ignore-whitespace --check docs/research/dev-review/patches/D-03-guard-block-diag.diff
# P1–P4 có chồng nhau không (chạy trên một bản sao tạm, KHÔNG trên nhánh)
git apply --unidiff-zero --ignore-whitespace --check P1 P2 P3 P4   # một lệnh, cả 4 tệp
# Đối chiếu requiredRuns S1 ↔ S4 bằng máy (thay phép tính tay ở §5.2)
node docs/research/dev-review/estimate.mjs | sed -n '/E-2b/,/E-3/p'
# Kiểm các khẳng định của S3
git grep -n "max-turns" -- src/            # kỳ vọng 0 kết quả (K37)
git grep -n "capped" -- src/runtimes/      # kỳ vọng chỉ api.ts (K39)
npm run typecheck && npm test              # sau khi áp thử D-01…D-03 trên nhánh tạm
```

Cũng chưa chạy: `run.mjs` (không chạy benchmark mới — theo quyết định chung), so số thô `c6-extract` với `5866cda`.

## 4. Công cụ thống kê (từ S1)

- **Tệp:** `bench/vs-claude/harness/stats.mjs` (+ `stats.test.mjs`, mục mới trong `bench/vs-claude/README.md`). Không phụ thuộc ngoài.
- **Phương pháp:** bootstrap phân tầng theo bài (10 000 resample, seed 20261102, CI percentile 95 %), kiểm định hoán vị trong từng bài (chính xác khi ≤ 200 000 tổ hợp, Monte Carlo khi lớn hơn), Cliff's δ, `requiredRuns` theo công thức đã chốt. Thống kê gộp = trung bình các bài của (TB CC − TB Claude).
- **Kết quả chính (S1):**

| Tập | Thời gian CC − Claude | p hoán vị | Chi phí CC − Claude | p hoán vị |
|---|---|---:|---|---:|
| C6 | −72,8 s [−105,3; −40,3]; tỉ lệ 0,716 | 0,0556 (chính xác, 36 tổ hợp) | +0,136 USD [−0,016; 0,287] | 0,3889 |
| C5 | +21,1 s [−22,6; 64,9] | 0,8971 | +0,144 USD [0,077; 0,210] | 0,0430 |
| C5+C6 bỏ lượt treo | −28,2 s [−44,4; −11,4]; tỉ lệ 0,840 | 0,0326 (MC) | +0,125 USD [0,047; 0,204] | 0,0306 |
| C5+C6 giữ lượt treo | −9,3 s [−40,2; 30,2] | 0,7774 (MC) | +0,122 USD [0,046; 0,199] | 0,0280 |

- **Giới hạn S1 tự nêu:** n = 2 mỗi ô làm p nhỏ nhất của một bài là 1/3; chưa hiệu chỉnh so sánh bội (nhiều bài × 2 chỉ số); lượt không ghép cặp; hai hệ khác mô hình. Tập "bỏ lượt treo" được chọn sau khi thấy dữ liệu.
- **Lưu ý dùng:** `--required-runs` trên CLI dùng Δ quan sát được nên không ổn định khi Δ nhỏ (t3 thời gian: Δ = 3,1 s → 3 401 lượt). Muốn Δ mục tiêu thì gọi hàm `requiredRuns({sigma, delta})`; CLI chưa có `--delta` (cải thiện I-12).

## 5. Kế hoạch thí nghiệm bổ sung (từ S4)

### 5.1. Các gói

Chi tiết: `dev-review/experiment-plan.md` §3–§9; tái lập bằng `node docs/research/dev-review/estimate.mjs`.

| Gói | Câu hỏi | Lượt | Giờ thực | USD (giả định) | Tầng |
|---|---|---:|---:|---:|---|
| **A** | D2: tách hiệu ứng mô hình — cùng Sonnet, t1–t5, 6 lượt/hệ/ô | 60 | 2,1 | 41 | MVP |
| **F1** | RQ5: A/B P1–P3 thăm dò, nhánh gốc dùng chung | 60 | 2,1 | 54 | MVP |
| **D** | D4: SWE-bench Verified 20 instance (cần adapter H4) | 40 | 2,4 | 41 | MVP |
| **C** | D4: 2 bài lớn > 15 phút (L1 nhiều module độc lập, L2 khâu phụ thuộc) | 24 | 8,2 | 311 | MVP |
| A+ / A2 / C3 / D2 / E / F2 / F3 | mở rộng | 404 | 19,8 | ≈ 521 | Mở rộng |

Tổng MVP 184 lượt, ≈ 14,8 giờ, ≈ 448 USD; gói C chiếm ~70 % USD MVP và là ước lượng kém chắc nhất. Bảng giả định chi phí dùng lại **nguyên văn** từ `experiment-plan.md` §2 (nguồn chính: `cost_usd` quan sát; giá Sonnet 3 / 15 / 0,30 / 3,75 / 6,0 và Opus 5 / 25 / 0,50 / 6,25 / 10,0 USD/triệu là **GIẢ ĐỊNH chưa tra lại ngày 2/11/2026**; hệ số hiệu chuẩn 0,71 Claude, 0,75 CCoding). S5 không đổi giả định nào.

### 5.2. Đối chiếu `requiredRuns` (S1) với `estimate.mjs` (S4)

**So mã:** cả hai dùng n = ⌈2·(z₁₋α/₂ + z₁₋β)²·σ²/Δ²⌉, σ = sd gộp có trọng số (n−1) của hai hệ trong ô (`stats.mjs:155-160, 206-207`; `estimate.mjs:54-55, 94-97`), α = 0,05, power = 0,8. z: S1 tính bằng nghịch đảo Acklam, S4 dùng hằng 1,959964 và 0,841621 — trùng tới 6 chữ số. Khác biệt duy nhất: S1 có sàn `max(2, …)`, S4 không có sàn nhưng chốt "n dùng = max(n, 6)". Lượt treo: S1 loại theo `task_id`, S4 theo `wall_s > 500`; trong dữ liệu hiện có hai cách trúng cùng một lượt (lượt C5 `t3` 579 s).

**So số (tính tay, chờ kiểm bằng lệnh §3.2):** dùng σ của S1 (C5+C6, bỏ lượt treo, `stats-report.md` bảng "Số lượt cần") và TB Claude Code của S4 (E-1), Δ = 20 % TB Claude:

| Bài | Chỉ số | σ (S1) | Δ = 20 % TB Claude (S4) | n tính tay | S4 công bố | Lệch |
|---|---|---:|---:|---:|---|---|
| t1 | thời gian | 12,4 | 25,2 | 4 | khoảng "4–38" | ≤ 1 |
| t2 | thời gian | 28,1 | 18,2 | 38 | cận trên 38 | 0 |
| t3 | thời gian | 45,4 | 41,0 | 20 | trong khoảng | ≤ 1 |
| t4 | thời gian | 25,2 | 40,6 | 7 (6,05 → sát ngưỡng làm tròn) | trong khoảng | ≤ 1 |
| t5 | thời gian | 28,7 | 51,8 | 5 | trong khoảng | ≤ 1 |
| t4 | chi phí | 0,028 | 0,125 | 1 (S1 có sàn → 2) | cận dưới "1–39" | 1 (do sàn) |
| t2 | chi phí | 0,136 | 0,087 | 39 | cận trên 39 | 0 |

Theo Δ quan sát, `estimate.mjs` phải cho đúng cột "n (công thức)" của S1 (t1 8, t2 55, t3 3 401, t4 5, t5 2 cho thời gian) vì cùng σ, cùng Δ, cùng z.

**Kết luận:** không ô nào lệch quá 1 lượt; chỗ lệch 1 lượt đến từ sàn `max(2, …)` và làm tròn σ trong báo cáo. Theo quy định đã chốt, **dùng số của S1** khi cần số chính xác; quyết định "6 lượt/hệ/ô cho MVP, 12 cho mở rộng" của S4 không đổi vì cao hơn sàn và nằm trong trần ngân sách. Lưu ý đã nêu ở S4: σ lấy từ n = 2–4 nên mọi số lượt là sơ bộ, phải tính lại sau 6 lượt đầu của gói A.

### 5.3. Câu hỏi mở của S4 mà S2/S3 trả lời được

| Câu hỏi S4 | Trả lời | Nguồn |
|---|---|---|
| Commit `d7600f6` có trong repo không? | Có | S2 §3; S3 K22 |
| Cách ép Opus ở mọi pha cho gói A2 | `variantOptions` có khóa `phaseModels` (`orchestrator.ts:3157-3168`); mô hình của hạng mục execute lấy từ hồ sơ agent — **chưa kiểm** có ghi đè được không | S3 §2 |
| `variants` truyền được `runtime` cho gói E? | Khóa `variantOptions` hiện là `variant, lane, phaseModels, repoMapMode, bashMaxOutput` — **không có `runtime`**. Gói E phải chọn runtime qua cấu hình dự án, hoặc thêm khóa | S3 §2 |
| Dùng tín hiệu "chạm trần" để đánh giá P2? | Không dùng được với `claude-cli`: `capHits` luôn 0 (K39). Đo số lần đọc trước lần ghi đầu từ `calls.csv` thay thế | S3 K39 |

## 6. Danh sách cải thiện theo ưu tiên

**Thang điểm (1–5):** *Impact* = lợi ích khi làm; *Risk* = rủi ro/hậu quả nếu **không** làm (sai trong bài, sự cố an toàn, số đo hỏng); *Effort* = công sức (1 = vài giờ, 5 = nhiều tuần). **Điểm = (Impact + Risk) × (6 − Effort)**, tối đa 50. Điểm là đánh giá chuyên gia của S5, không phải số đo.

"Cách đo" trỏ tới gói của S4 (`experiment-plan.md` §3). KPI kỳ vọng là **giả thuyết**, chưa đo.

| # | Cải thiện | Nguồn | Tệp / mô-đun | I | R | E | **Điểm** | KPI kỳ vọng | Cách đo | .diff |
|---|---|---|---|---:|---:|---:|---:|---|---|---|
| I-01 | R1: đồng bộ C6, sửa 3 số lệch, K34, K46, cột "áp cho runtime" ở Bảng 1, ghi p hoán vị 0,0556 cạnh CI C6 | S2 §4–5; S3 K34/K46/K35–39; S1 | `paper.md`, `challenges.md`, `publication-plan.md`, `presentation-notes.md`, `related-work.md`, `design.md` | 4 | 5 | 1 | **45** | grep §7 → 0 dòng; 0 số lệch khi S2 chạy lại mẫu 20 số | chạy lại lệnh 2 và 7 của §3.1 | Không (tài liệu, thuộc Phòng Nghiên cứu) |
| I-02 | P4: nhật ký sự cố khi sửa — nguồn dữ liệu cho vòng tự cải thiện | C-14 (còn mở); RQ5; P4 | `src/prompts.ts` (revisePrompt) | 4 | 2 | 1 | **30** | ≥ 1 mục sự cố có cấu trúc / lượt revise; không tăng token revise > 5 % | F1 (nhánh có P4 so với A); đếm mục "Nhật ký sự cố" trong đầu ra revise | Có: `prompt-patches/P4-incident-log-on-revise.diff` |
| I-03 | Trần lượt cho `claude-cli` theo `phases.toolTurns` (`--max-turns`) và báo `capped` khi chạm | S3 K37/K39; C-20; L8/L9 | `src/runtimes/claude-cli.ts` | 3 | 4 | 2 | **28** | 0 lượt execute > 40 lượt mô hình; `capHits` > 0 khi chạm trần (tín hiệu sự cố cho RQ5); `maxContinuations` hoạt động với `claude-cli` | A/B như F1 (biến thể có D-01); `tool_calls` trong `calls.csv` | **Có: `patches/D-01-claude-cli-max-turns.diff`** |
| I-04 | Harness H1 (xáo thứ tự có seed), H2 (cột mô hình thật), H5 (cờ failover), H6 (hạn treo) | S4 §7; C-49, lượt treo 579 s, C-23 | `bench/vs-claude/harness/run.mjs` | 5 | 4 | 3 | **27** | 0 lượt treo > hạn treo; 100 % lượt có cột mô hình; thứ tự có seed ghi trong MANIFEST | điều kiện tiên quyết của gói A; kiểm trên 1 lượt thử mỗi hệ | Không (S4 đề xuất; ngoài phạm vi `src/`) |
| I-05 | Bật `attention` khi reviewer có quyền chạy lệnh mà không kiểm chứng (`verified === false`) | S3 K19; L15 | `src/orchestrator.ts:1377-1438` | 2 | 3 | 1 | **25** | 100 % nhiệm vụ có `review.unverified` cũng có `attention = true` | unit test + quan sát trong gói A (đếm sự kiện `review.unverified`) | **Có: `patches/D-02-attention-unverified.diff`** |
| I-06 | Ghi sự kiện khi hook `claude-guard` chặn (đếm chặn đúng/nhầm) | S3 §4–5; L2–L4 "chưa đo"; C-46, C-48 | `src/runtimes/claude-cli.ts` (đọc `tool_result is_error`) | 3 | 3 | 2 | **24** | số lần chặn / lượt chạy có trong `calls.csv` hoặc log; tỉ lệ chặn nhầm (C-48) đo được | quan sát trong gói A và F1, không cần A/B | **Có: `patches/D-03-guard-block-diag.diff`** |
| I-07 | Làn đầy: cấm giao hạng mục cho reviewer, hoặc chuyển thành trọng tâm review như `shapeFastPlan` | S3 K10; L15 | `src/orchestrator.ts:1054-1064, 1316` | 3 | 3 | 2 | **24** | 0 hạng mục mà reviewer review chính mình | kiểm kế hoạch làn đầy trong log; không cần benchmark | Không |
| I-08 | Bản vá P1–P4 kèm dòng ngữ cảnh và chuẩn LF/CRLF (hoặc `.gitattributes` cho `*.diff`), để `git apply --check` trần qua | S2 §2 | `prompt-patches/*.diff`; `.gitattributes` | 2 | 2 | 1 | **20** | `git apply --check` trần exit 0 ×4 | chạy lại lệnh 3 của §3.1 | Không |
| I-09 | P2: tín hiệu dừng khảo sát cho `claude-cli` | C-20 (giảm nhẹ, chưa đo sau M3); P2 | `src/prompts.ts` | 2 | 2 | 1 | **20** | số lần đọc trước lần ghi đầu giảm; thời gian execute không tăng > 5 % | F1 (nhánh B2) | Có: `P2-stop-surveying.diff` |
| I-10 | Đo lại các mục "giảm nhẹ, chưa đo": C-02 (token họp), C-20, C-21 (đọc qua shell), C-40, C-42 (trúng cache) | `challenges.md` | `bench/` (phân tích), `src/kpi.ts` | 3 | 2 | 2 | **20** | mỗi mục có một số sau sửa thay cho "chưa đo" | dùng dữ liệu của gói A (không tốn lượt thêm) | Không |
| I-11 | Xem lại `--no-verify` khi gộp worktree con; ít nhất ghi lý do trong ARCHITECTURE | S3 K13 | `src/git.ts:144, 156` | 2 | 3 | 2 | **20** | hook git của repo dự án chạy (hoặc có ADR ghi lý do bỏ) | test gộp trên repo có hook pre-commit | Không |
| I-12 | Thêm `--delta` cho `stats.mjs` (Δ mục tiêu), hiệu chỉnh so sánh bội | S1 "Việc còn lại" | `bench/vs-claude/harness/stats.mjs` | 2 | 2 | 1 | **20** | `--required-runs --delta 0.2` cho đúng bảng §5.2 | test mới trong `stats.test.mjs` | Không |
| I-13 | L3: shell được phép đọc thư mục tạm và thư mục hệ thống — cân nhắc sandbox HĐH hoặc thu hẹp ngoại lệ | S3 K28; C-46 ("không phải sandbox") | `src/tools/shell-policy.ts:53-87` | 3 | 4 | 4 | **14** | 0 lần đọc ngoài worktree trừ danh sách cho phép đã ghi | kiểm bằng test hook + log chặn (I-06) | Không |
| I-14 | P3 / O4: reviewer chỉ nhận diff + kết quả lệnh kiểm tra | O4 2,8 % (T-e); P3 | `src/prompts.ts` (review) | 2 | 1 | 2 | **12** | −2,8 % chi phí CCoding (trần trên); tỉ lệ test ẩn không giảm > 2 điểm % | F1 (nhánh B3), F3 bộ giữ lại | Có: `P3-review-diff-only.diff` |
| I-15 | Windows chậm 2–3× so với cloud: tách chi phí khởi động `claude`/git/npm/hook | C-49 (còn mở, phần Windows) | harness, `src/runtimes/claude-cli.ts` | 2 | 2 | 3 | **12** | biết được thời gian khởi động / lượt gọi trên mỗi nền | H8 (ghi tải máy) + 1 lượt thử mỗi nền | Không |
| I-16 | P1 / O5: giới hạn đầu ra plan/review/synthesize | O5 1,7 % (T-e); P1 | `src/prompts.ts` | 1 | 1 | 1 | **10** | −1,7 % chi phí (trần trên); chất lượng kế hoạch không giảm | F1 (nhánh B1) | Có: `P1-output-cap.diff` |
| I-17 | "Ghế" ≤ 2 hạng mục/vai trò khi nhiều nhiệm vụ cùng chạy | C-23 (còn mở) | `src/orchestrator.ts` (`busy`, `maxConcurrentTasks`) | 3 | 2 | 4 | **10** | thời gian chờ agent giữa nhiệm vụ → ~0 | 2 nhiệm vụ cùng lúc, đo thời gian chờ plan | Không |
| I-18 | Review theo từng hạng mục khi gộp (thay vì một lần ở cuối) | C-32 (giảm nhẹ; thời gian còn mở) | `src/orchestrator.ts` (review/revise) | 3 | 2 | 4 | **10** | giảm 0,5–8 phút vòng sửa cuối | gói C (bài lớn nhiều hạng mục) | Không |
| I-19 | O1: tiền tố prompt ổn định dùng chung cache giữa agent | O1 4,7 % (T-e, trần trên); C-13 (còn mở) | `src/runtimes/common.ts:7-13`, `src/prompts.ts` | 2 | 1 | 3 | **9** | ≤ −4,7 % chi phí CCoding; tỉ lệ ghi cache CC/Claude giảm | A/B như F1 | Không |
| I-20 | O2: tái dùng phiên execute → revise (cần bỏ `--no-session-persistence` cho revise) | O2 0,7 % (T-e); S3 K43 | `src/runtimes/claude-cli.ts` | 1 | 1 | 4 | **4** | −0,7 % (trần trên) | không đáng một gói riêng | Không |

**Ghi chú về O1–O5.** Tổng O1–O5 không cộng thẳng được (O3 và O4 chồng lấn, T-e). O1 là mục lớn nhất, **trần trên 4,7 %** — vì vậy tối ưu cache/token chỉ cho lợi ích vài phần trăm; đòn bẩy lớn hơn là số lượt gọi và mô hình theo pha (O6, 20,7 % nhưng tính trên nền C1, nay C5 đã dùng Sonnet mọi pha).

**Bao phủ thách thức còn mở/giảm nhẹ.** 4 mục còn mở: C-13 (I-19, I-20), C-14 (I-02), C-23 (I-17), C-49 (I-04, I-15). 19 mục giảm nhẹ: C-02, C-20, C-21, C-40, C-42 (I-10); C-20 (I-03, I-09); C-32 (I-18); C-46, C-48 (I-06, I-13); C-11, C-12 (gói A/C của S4, đồng thời R1 cập nhật C-12 bằng số C6); C-03, C-04, C-06, C-07, C-09, C-24, C-34, C-41, C-44 — không có cải thiện riêng trong danh sách vì biện pháp hiện có đủ ở phạm vi bài; cần đo lại khi có gói A (I-10 mở rộng nếu có ngân sách).

## 7. Danh sách lệch Phòng Nghiên cứu phải sửa ở R1

Nguồn: grep S2 (§5 `verification.md`, 17 dòng), mục "sai"/"đúng một phần" của S3, lệch số của S2. Số dòng hợp lệ ở HEAD `e886c04` (xem đầu tệp).

| # | Tệp:dòng | Vấn đề | Sửa theo | Nguồn |
|---|---|---|---|---|
| R1-01 | `paper.md:5` | quy ước số liệu chỉ nêu C1–C5 | thêm C6 từ `c6-extract/` | S2 grep |
| R1-02 | `paper.md:179` | "C6 chưa có trong T-f; không có CI bootstrap cho C6" — sai | T-f có 2 dòng C6 (−72,8 s; +0,136 USD); thêm p hoán vị 0,0556 | S2 grep; S1 |
| R1-03 | `paper.md:204` | "C6 chưa có trong T-d" — sai | T-d có hàng C6 | S2 §4 ghi chú |
| R1-04 | `paper.md:220` | "C6 chưa có trong T-b" — sai | T-b có C6 (3.09, 3.66) | S2 grep |
| R1-05 | `paper.md:222` | "5/10 ô trong khoảng 2,8–4" | 7/12 ô | S2 #19 |
| R1-06 | `paper.md:248` | 38.1 / 49.4 / 10.2 % | 38.3 / 49.6 / 9.9 % (T-e) | S2 #18 |
| R1-07 | `paper.md` Bảng 3b | ghi "ngoài S2" | trích T-a/T-b/T-f/T-g | báo cáo tổng hợp Phòng NC |
| R1-08 | `paper.md:103`; `challenges.md:104` | K34: hằng số ước lượng gọi là ngân sách | câu sửa K34 (`technical-check.md`) | S3 |
| R1-09 | `challenges.md:110` | K46: "Nội bộ chỉ được `local, cerebras, groq`" | "Mặc định: Công khai/Nội bộ mọi runtime; Bảo mật/Hạn chế chỉ `local`" | S3 |
| R1-10 | `paper.md:102-105`; `challenges.md:103-106` | K32/K35/K37/K38/K39: giới hạn chỉ cho runtime API, bài ngầm hiểu áp cho benchtest | thêm cột "áp cho runtime" ở Bảng 1 | S3 |
| R1-11 | `paper.md:86`, `:111`, `:99`, `:84`; `challenges.md:106`, `:112`, `:100` | K23, K10, K19, K28, K13, K40: mô tả thiếu | câu sửa đề xuất trong `technical-check.md` §1 | S3 |
| R1-12 | `challenges.md:5`, `:36` (C-12), `:108` (L11), `:138` (P-07) | "C6 chưa có dữ liệu" | cập nhật bằng số C6 (T-a, T-f) | S2 grep |
| R1-13 | `challenges.md:29` (C-05) | "450–700 từ" không rõ đơn vị | ghi đơn vị và phạm vi đếm | S3 K51 |
| R1-14 | `publication-plan.md:6`, `:55`, `:181`; `presentation-notes.md:5` | "C6: chưa có dữ liệu" | cập nhật | S2 grep (`:55` cần mở dòng) |
| R1-15 | `publication-plan.md:197` | "không nhanh hơn rõ rệt" — mâu thuẫn T-f/T-g | "nhanh hơn ở bài nhiều module trong C6 (minh họa; p hoán vị 0,0556), chi phí không thấp hơn" | S2; S1 |
| R1-16 | `publication-plan.md:30`, `:159` | O1 "trần trên 5.1 %" | 4.7 % | S2 #20 |
| R1-17 | `related-work.md:337`, `:358`, `:361` | khả năng còn "C6 … chưa có" ở phần cuối dòng | mở từng dòng, cập nhật | S2 grep (chưa đọc hết dòng) |
| R1-18 | `self-improvement/design.md:208` | "Chưa có số đo C6 và chưa có `token-analysis.md`" | cập nhật; thêm ghi chú `capHits = 0` với `claude-cli`, export `ISSUE_RE`, dùng lại `TaskOptions.variant` + thêm vào `COMMON_KEYS` | S2 grep; S3 §4 |
| R1-19 | mọi chỗ nhắc `git apply --check` P1–P4 | lệnh trần luôn lỗi | ghi kèm `--unidiff-zero --ignore-whitespace` (hoặc làm I-08) | S2 §2 |
| — | `performance/token-analysis.md:22` | "`results/` chưa có C6" | **giữ** — mô tả nguồn dữ liệu, sau đó nói đã dùng `c6-extract` | S2 grep |

Ghi chú: S2 đếm 17 dòng grep, báo cáo tổng hợp trước ghi "20 chỗ"; chênh lệch có thể do mẫu grep/cách đếm, không ảnh hưởng danh sách sửa ở trên.

## 8. Mâu thuẫn và giới hạn còn lại giữa S1–S4

- **Không có mâu thuẫn về số** giữa S1, S2 và T-x ở các dòng đã đối chiếu. S4 dùng cùng dữ liệu (57 lượt `done`) như S1.
- **S4 "làn nhanh đã dùng Sonnet mọi pha"** (lấy từ `calls.csv` C5, O6) và **S3 K23 "làn nhanh chỉ đổi pha plan sang Sonnet"** (lấy từ mã) không mâu thuẫn: pha plan đổi sang Sonnet, finalize bị bỏ, synthesize không gọi LLM, phần còn lại theo hồ sơ agent. Bài nên viết theo câu của S3.
- **Chưa kiểm:** chồng lấn giữa P1–P4; số thô `c6-extract` so với `5866cda`; bảng giá; số instance và giấy phép SWE-bench (S4 ghi từ hiểu biết sẵn); `events.jsonl` của C6 (không có, nên đường găng C6 chưa tự kiểm được).
- **Bản vá D-01…D-03** chưa kiểm `--check`, chưa typecheck, chưa test. Đây là đề xuất, không áp dụng.

## 9. Bảo vệ dữ liệu

Không cần chạy cổng đầy đủ: hạng mục chỉ đọc mã/tài liệu và viết tài liệu nội bộ, không xử lý DLCN, không đưa bí mật, tên máy hay dữ liệu dự án A vào sản phẩm. Bản vá D-03 thêm một loại sự kiện chẩn đoán; nội dung sự kiện đi qua đường `diag`/`LogStore` sẵn có (che PII/bí mật), không ghi gì ra ngoài `data/`. Các gói thí nghiệm của S4 chỉ dùng bài tổng hợp và SWE-bench công khai — không dùng dữ liệu thật trên DEV/UAT.

## 10. Tệp liên quan

- Tệp này: `docs/research/dev-review.md`
- Bản vá mới (chưa kiểm `--check`): `docs/research/dev-review/patches/D-01-claude-cli-max-turns.diff`, `D-02-attention-unverified.diff`, `D-03-guard-block-diag.diff`
- Đầu vào: `dev-review/stats-report.md` (S1), `dev-review/verification.md` (S2), `dev-review/technical-check.md` (S3), `dev-review/experiment-plan.md` + `estimate.mjs` (S4)
