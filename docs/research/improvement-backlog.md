# Backlog nâng cấp dựa trên bằng chứng — vòng 3, gói 1 (R3)

> Phòng Nghiên cứu · hạng mục S3 (@data-scientist) · 2/11/2026 · phân loại dữ liệu: nội bộ.
> Nguyên tắc của giám đốc: mọi nâng cấp phải dựa vào nghiên cứu; mỗi thay đổi của Phòng Dev ghi mã `B-xx`; benchtest chạy theo `preregistration.md` (R1, hạng mục S2) để kiểm lại.
> Số từ `token-analysis.md` dẫn theo **mã bảng** (T-0, T-d…), không chép lại bản S1 đang làm mới. Mã giả thuyết H1–H8 theo bản nháp trong đề bài; mã chính thức do `preregistration.md` quyết định.
> Phạm vi: chỉ viết tài liệu. Không sửa `src/`. Các số "kỳ vọng" là **giả thuyết cần kiểm**, không phải kết quả.

## 0. Tóm tắt xếp hạng

| Hạng | Mã | Nâng cấp | Gộp ứng viên | Hiệu quả (1–5) | Công sức (1–5) | Ưu tiên = H/E | Giám đốc duyệt lên main |
|---:|---|---|---|---:|---:|---:|---|
| 1 | **B-01** | Làn đơn cho việc nhỏ | "làn đơn" | 5 | 3 | 1,7 | Có |
| 2 | **B-02** | Cổng chất lượng (kiểm → sửa → mẫu đầu ra → reviewer có điều kiện) | lệnh đỏ vào vòng sửa; P3; D-02; G5 (loại) | 4 | 3 | 1,3 | Có |
| 3 | B-03 | Nhật ký sự cố khi sửa | P4 | 2 | 1 | 2,0 | Có |
| 4 | B-04 | Bộ phân tích lệnh shell của hook (nháy, lệnh đọc) | G1, G2 | 3 | 2 | 1,5 | Có (biên bảo mật) |
| 5 | B-05 | Script kiểm nhất quán số liệu | G7 | 3 | 2 | 1,5 | Không |
| 6 | B-06 | Chẩn đoán chặn của hook | G6, D-03 | 2 | 2 | 1,0 | Có |
| 7 | B-07 | Trần lượt cho `claude-cli` | D-01 | 2 | 2 | 1,0 | Có |
| 8 | B-08 | `cwd` của hook và Read tệp tool-results | G3, G4 | 2 | 3 | 0,7 | Có (biên bảo mật) |
| 9 | B-09 | Giới hạn đầu ra / tín hiệu dừng khảo sát (hoãn) | P1, P2 | 1 | 1 | 1,0 | Có |

B-01 và B-02 đứng đầu theo quyết định của giám đốc (2/11, 13:42), không phải theo điểm. Thang điểm 1–5 là đánh giá chuyên gia; chỉ B-01/B-02 có số đo hỗ trợ trực tiếp (§3).

**Phủ ứng viên:** G1→B-04 · G2→B-04 · G3→B-08 · G4→B-08 · G5→loại, ghi ở B-02 · G6→B-06 · G7→B-05 · D-01→B-07 · D-02→B-02 · D-03→B-06 · P1→B-09 · P2→B-09 · P3→B-02 · P4→B-03.

---

## 1. Kiểm nhận định N1–N5 bằng CSV

**Nguồn:** `docs/research/context/tool-failures-2026-11-02.csv` (75 dòng dữ liệu, 2 nhiệm vụ: `…112755-181` 39 dòng, `…121636-dd9` 36 dòng).
**Lệnh:** `node docs/research/context/failures-count.mjs` (đếm), `… --list <category>` (liệt kê, cột đầu là số thứ tự dòng dữ liệu `#`), `… --ro-other` (lượt chỉ đọc chưa giải thích). Script phân tích CSV có trường nhiều dòng; chỉ đọc.

### 1.1 Đếm lại (khớp bảng của người giao việc)

| Loại | Số lượt | Theo công cụ | Theo vai trò (số lượt) |
|---|---:|---|---|
| `git-read-deny` | 44 | 44 `run_command` | academic-writer 16 · peer-reviewer 8 · solution-architect 5 · methodologist 4 · research-lead 4 · dev-lead 4 · literature-researcher 3 |
| `outside-path` | 10 | 8 `run_command`, 1 `write_file`, 1 `read_file` | data-scientist 5 · qa-tester, backend-dev, devops, solution-architect, academic-writer 1 mỗi vai trò |
| `exit-nonzero` | 8 | 8 `run_command` | data-scientist 6 · qa-tester 1 · literature-researcher 1 |
| `tool-error` | 6 | 4 `edit_file`, 1 `fetch_url`, 1 `write_file` | academic-writer 4 · methodologist 1 · data-scientist 1 |
| `read-gate-nudge` | 5 | 4 `read_file`, 1 `search` | solution-architect 3 · methodologist 1 · academic-writer 1 |
| `policy-other` | 2 | 2 `run_command` | data-scientist 2 |
| **Tổng** | **75** | 56 pha execute · 8 review · 5 revise · 4 plan · 2 synthesize | |

### 1.2 Bảng kiểm

| # | Nhận định | Truy vấn / lệnh | Kết quả | Kết luận |
|---|---|---|---|---|
| N1a | Phần lớn `git-read-deny` thực chất chỉ đọc | `failures-count.mjs` (mục "N1: … phân loại tĩnh"): bỏ chuỗi trong nháy, rồi tìm chuyển hướng ra tệp, heredoc, `sed -i`, `rm/mv/cp/mkdir/touch/tee`, `node/python/npm` | **36/44 (81,8 %)** chỉ đọc · 3 chạy `node` (không ghi) · 5 có ghi hoặc heredoc (chặn đúng) | **Đúng** (phân loại tĩnh theo văn bản lệnh, chưa phát lại qua hook) |
| N1b | Nguyên nhân: tách theo `\|` và `;` không xét nháy | Trong 36 lượt chỉ đọc, đếm lượt có `\|` hoặc `;` nằm **bên trong** chuỗi có nháy; đối chiếu mã `shell-policy.ts:171` (`split(/&&\|;/)`), `:177` (`split('\|')`), `:170` (`[<>]` bất kỳ ⇒ chặn) | **30/36** có dấu tách trong nháy (vd. `grep "a\|b"`, `sed -n '271p;480p;524p'`, regex `^(a\|b)`) | **Đúng** — mã không biết nháy ở 3 chỗ trên. Lưu ý: dòng 170 còn chặn cả `>` trong nháy |
| N1c | Hook không nhận `echo`, `sed -n` nhiều địa chỉ, `tail -c`, `awk` | Trong 36 lượt chỉ đọc: đếm `echo`, `sed -n`, `awk`, `tail -c`, `for`; đối chiếu `READ_CMD` (`shell-policy.ts:149`), `SED_PRINT` (`:151`) | `echo` **4** · `awk` **1** · `for` **1** · `sed -n` **10** (không đếm riêng được bao nhiêu lượt nhiều địa chỉ) · `tail -c` **0** | **Đúng một phần.** `echo`, `awk` không có trong `READ_CMD` ⇒ đúng. `SED_PRINT` chỉ nhận một địa chỉ `Np`/`N,Mp` ⇒ nhiều địa chỉ bị chặn, đúng. **`tail -c` sai:** `tail` có trong `READ_CMD`; lần `tail -c 400 ../paper/paper.md` (dòng #45) bị chặn do đường dẫn, không do lệnh. Phân loại lại: `tail -c` → N2 |
| N1d | (bổ sung) lượt chỉ đọc chưa giải thích | `--ro-other` | 1 lượt (#5, lệnh bị cắt trong CSV) | Không đủ dữ liệu; nhiều khả năng cùng nguyên nhân N1b |
| N2a | Một số `outside-path` chặn nhầm vì `../` tính từ gốc worktree, trong khi Bash giữ `cwd` | `--list outside-path`; đọc các dòng #21, #45 | #45 `tail -c 400 ../paper/paper.md` chạy sau lệnh `cd docs/research/performance` ở lệnh trước (cùng vai trò) ⇒ nếu `cwd` được giữ thì đường dẫn nằm trong worktree. #21: `../data` nằm trong chuỗi `sed` | **Đúng một phần:** 2/10 lượt có dấu hiệu chặn nhầm; **không chứng minh được** từ CSV vì CSV không có `cwd` thật (đó là lý do cần G3) |
| N2b | Một lượt chặn Read tệp `tool-results` | `--list outside-path` dòng #33: `read_file` tới `<home>\.claude\projects\…\tool-results\…` | 1 lượt | **Đúng** (1/10) |
| N2c | (kết quả kiểm) chặn đúng chính sách | dòng #12 (`write_file` vào thư mục Temp), #51 (`cat > /tmp/patch.mjs`) | 2/10 | Đúng chính sách; hướng dẫn của giám đốc cũng cấm `/tmp` |
| N2d | (không xác định) | dòng #26, #27 (`cd ..; cd ..`, `cd ../../..`), #28, #50, #58 | 5/10 | Không thể kết luận từ CSV (thiếu `cwd` lúc gọi) |
| N3a | peer-reviewer không chạy được `token-analysis.mjs --check` và `node --test` | `--list git-read-deny`, lọc `agent=peer-reviewer` | 8/8 lượt bị chặn đều là `git-read-deny`; **4/8** (#16, #22, #70, #75) là lệnh `node …token-analysis.mjs` / `--check`; 4/8 còn lại là lệnh đọc bị tách sai (#17 `cat`, #18 `sed -n '271p;480p;524p'`, #20, #71–#72 tổ hợp `grep`/`ls`) | **Đúng một phần:** 50 % số lượt chặn của reviewer là lệnh kiểm tra thật; 50 % là lỗi parser (N1) |
| N3b | Đây là một nguồn làm điểm Chất lượng của reviewer thấp | Không kiểm được: CSV không chứa cách tính điểm; `kpi.ts` tính Chất lượng từ nhiều tín hiệu | — | **Chưa kiểm được.** Cần `GET /api/kpi?agent=peer-reviewer` kèm chi tiết phần Chất lượng trước/sau khi `checkCommands` chạy. Dùng làm KPI kiểm lại của B-02 |
| N3c | CCoding tự chạy `checkCommands` trước thực thi, sau thực thi, sau mỗi vòng sửa | Đọc `orchestrator.ts:1326` (baseline), `:2535` (chạy), `:1360` (chạy lại khi `staleAt`), `:1391-1393` (đưa kết quả vào bằng chứng review) | Có ở baseline, sau thực thi, và trước review khi workspace đã đổi | **Đúng**, nhưng reviewer vẫn bị gọi trước khi mã đỏ được xử lý (xem B-02) |
| N4 | Lỗi cuối của academic-writer là số cũ sót ở tệp khác | CSV không chứa nội dung tệp. Gián tiếp: các lệnh #42, #43, #60, #62–#68 của academic-writer là chuỗi `grep` tìm cụm lỗi thời. Kiểm hiện trạng: Grep `C6[^\|\n]{0,40}chưa có\|chưa có dữ liệu` trong `docs/research/*.md` | `paper.md` 0, `challenges.md` 0; còn 33 chỗ ở `CHANGELOG.md` 11, `dev-review.md` 8, `dev-review/verification.md` 13, `context/kpi-…md` 1 (đều là lịch sử hoặc trích dẫn) | **Không kiểm được từ CSV; hiện trạng đã sạch ở 2 tệp bị nêu.** Cơ chế "một số lệch giữa nhiều tệp" hợp lý (R1-xx trong `dev-review.md`) nên giữ B-05 ở mức hỗ trợ, không phải sửa nóng |
| N5 | Vượt ngân sách vì đề bài lớn | CSV không có token. `kpi-research…md:20-23`: data-scientist 3,9M/hạng mục; phòng 30,4M so với 10M | — | **Chưa kiểm được** từ CSV. Phép kiểm cần: token mỗi nhiệm vụ theo kích thước đề bài (API `kpi`), so gói nhỏ này (6M cho 3 hạng mục) với nhiệm vụ trước. Khớp với B-01: không chia việc nhỏ ra nhiều agent |

**Điều chưa nhận định nào nêu:** 75 lượt lỗi = 75 vòng gửi lại cả hội thoại. Chỉ riêng `git-read-deny` do parser (36) là 48 % tổng lỗi; sửa B-04 là cách rẻ nhất để bớt chúng. Số token thực của chúng **chưa đo** (CSV không có token).

---

## 2. Bằng chứng nền cho B-01 và B-02

Chạy: `node docs/research/context/lane-threshold.mjs` (đọc `bench/vs-claude/results/runs.csv`, vòng C7, Sonnet đơn và làn nhanh cùng thời điểm).

| Bài | Sonnet đơn (s) | Làn nhanh (s) | Tỉ lệ TG | Sonnet ($) | Làn nhanh ($) | Tỉ lệ chi phí | Test ẩn làn nhanh |
|---|---:|---:|---:|---:|---:|---:|---|
| t1-duration | 65,5 (n=2) | 109,0 (n=1) | 1,66 | 0,200 | 0,398 | 1,99 | 149/149 |
| t2-orders | 41,5 (n=2) | 71,0 (n=1) | 1,71 | 0,156 | 0,396 | 2,53 | **52/60** |
| t3-api | 107,5 (n=2) | 192,0 (n=1) | 1,79 | 0,341 | 1,126 | 3,30 | 87/87 |
| t4-perf | 49,0 (n=2) | 120,0 (n=1) | 2,45 | 0,150 | 0,533 | 3,56 | 19/19 |
| t5-logq | 165,5 (n=2) | 127,0 (n=1) | 0,77 | 0,439 | 1,038 | 2,36 | 146/146 |
| Σ | 429,0 | 619,0 | **1,44** | 1,286 | 3,492 | **2,72** | |

- Tổng thời gian khớp bảng **T-d (3)** (`token-analysis.md:292`: 429,0 s và 619,0 s). Phần cố định của điều phối (kế hoạch + review + gộp) = **239,5 s = 55,8 %** thời gian Sonnet đơn (C7; `token-analysis.md:292`, đọc ở `:300`); gộp C5–C7 là 72,8 % (`:298`). C8 chỉ có 3 lượt làn nhanh trên t2 và không có Sonnet đơn (quyết định D1) nên không làm đổi 55,8 %.
- Cố định trung bình mỗi bài ở C7: 239,5 / 5 ≈ **48 s** (khoảng 38,5–58,6 s; `token-analysis.md:287-291`).
- Hồi quy thô (5 điểm, mỗi điểm 1 lượt làn nhanh): TG làn nhanh = **87,1 + 0,428 × TG đơn**; giao điểm T* = a/(1−b) = **152 s**. Dưới T*, làn nhanh chậm hơn; trên T*, nhanh hơn. Đây là **khám phá n=5**, không có CI; chính thức hóa bằng H4 (hệ số chặn, độ dốc) ở C9.
- Bài duy nhất làn nhanh thắng về thời gian là t5 (165,5 s đơn). Về **chi phí** làn nhanh đắt hơn ở cả 5 bài (1,99–3,56 lần).
- Độ dài đề bài của t1–t5 là 372–542 ký tự (`bench/vs-claude/tasks/t*/prompt.txt`) và repo nhỏ, nên quy tắc làn tự chọn hiện có (`config.ts:294`: `maxBriefChars` 4000, `maxRepoFiles` 300; `orchestrator.ts:1115-1136`) chọn làn nhanh cho **cả 5 bài**, trong khi 4/5 bài chậm hơn Sonnet đơn. Tín hiệu hiện có không phân biệt được.
- t2 làn nhanh C7: 52/60 test ẩn, Sonnet đơn 60/60 (`runs.csv`, C7, t2). C8 (sau `c55a249`): 3/3 lượt 60/60 (166, 102, 120 s; $1,22, $0,55, $0,61). n quá nhỏ để kết luận; nhưng chứng minh test ẩn có thể tụt, cổng chất lượng là cần thiết.

---

## 3. B-01 — Làn đơn cho việc nhỏ

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Với việc nhỏ, điều phối nhiều bên trả phí cố định mà một agent đơn không phải trả: làn nhanh C7 chậm 1,44 lần và đắt 2,72 lần Sonnet đơn (cùng mô hình). Mục tiêu giám đốc: việc nhỏ dùng agent đơn. |
| **2. Bằng chứng** | §2: `lane-threshold.mjs` (Σ 619,0 s so với 429,0 s; $3,492 so với $1,286). `token-analysis.md` T-d (3) `:292` (cố định 55,8 %). `PROCESS-REVIEW.md:221-280` (§13): C5 và C6 cùng chiều. Làn tự chọn hiện nay chọn làn nhanh cho cả t1–t5: `orchestrator.ts:1115-1136`, `config.ts:294`. |
| **3. Nguyên nhân gốc** | **Đã kiểm một phần:** phần cố định = kế hoạch (115,6 s) + review (116,8 s) + gộp (7,1 s) trên 5 bài (T-d (3)); mỗi lượt gọi agent là một phiên `claude -p` mới ghi lại tiền tố cache (`PROCESS-REVIEW.md:266`). **Giả thuyết:** execute song song không bù được (execute/Sonnet đơn 48–132 %, `token-analysis.md:287-291`) vì phần việc nhỏ không chia song song được. |
| **4. Thay đổi đề xuất** | Thêm `lane: 'single'` bên cạnh `'fast'`/`'full'`; chọn tự động theo §3.1; mặc định cho việc nhỏ. Luồng ở §3.2. |
| **5. Hiệu quả kỳ vọng** | Trên t1–t5: thời gian và chi phí trong **±15 %** Claude Code đơn cùng mô hình (từ 1,44× và 2,72× hiện nay). Kỳ vọng thời gian −30 % và chi phí −60 % so với làn nhanh (C7). **Giả thuyết**. |
| **6. Cách kiểm lại** | H1 (thời gian làn nhanh/Claude Code ≥ 1,3 ⇒ lý do tồn tại B-01), H2 (chi phí làn nhanh > Claude Code), H3 (test ẩn không kém hơn, biên 2 điểm %), H4 (hiệu chỉnh ngưỡng), H5 (l1-modules), H6 (l2-chain). **Đề nghị S2 thêm H9:** tương đương ±15 % thời gian và chi phí của làn đơn so với Claude Code đơn (TOST, bài t1–t5, C9 hoặc vòng kế). Vòng benchtest: C9 cho H1–H3 (sau `c55a249`; làn đơn chưa tồn tại ở C9 nên C9 chỉ cho baseline); vòng sau B-01 cho H9; t6–t8 giữ lại cho H7. |
| **7. Rủi ro và bảo vệ dữ liệu** | Rủi ro: (a) chọn sai làn ⇒ việc lớn chạy đơn chậm — giảm bằng §3.3 nâng cấp; (b) mất reviewer ⇒ chất lượng — giảm bằng B-02. Dữ liệu: làn đơn chạy trong worktree, qua `Orchestrator.call()`, `LogStore`, hook, nhãn dữ liệu và Data Protection Gate như làn khác; không thêm đường ghi ngoài `data/`. |
| **8. Ưu tiên** | Hiệu quả 5 / công sức 3 = 1,7. Bắt buộc đứng đầu. |
| **9. Giám đốc duyệt** | **Có** — thay đổi mặc định chọn làn của hệ thống. |

### 3.1 Tiêu chí nhỏ/lớn tự động

**Tín hiệu tính trước khi chạy** (không gọi LLM, tất cả đã có hoặc suy ra từ `git ls-files` và đề bài):

| Tín hiệu | Cách lấy | Giá trị t1–t5 | Dùng để |
|---|---|---|---|
| `briefChars` | `task.brief.length` (đã dùng ở `orchestrator.ts:1121`) | 372–542 | Chặn trên (đề dài ⇒ lớn); **không** phân biệt t1–t5 |
| `parts` — số phần độc lập | Đếm mục đánh số/gạch đầu dòng ở cấp cao nhất, hoặc số module được nêu tên trong đề | chưa đo; l1-modules = 5, l2-chain = 4 tầng phụ thuộc | Quyết định chính: cần ≥ 3 phần độc lập thì song song mới có ích |
| `filesTouched` | Số đường dẫn trong đề bài khớp `git ls-files`, cộng số thư mục được nêu | chưa đo | Phạm vi |
| `repoFiles`, `repoBytes` | `git ls-files` (đã có, `:1122-1135`) | nhỏ | Chặn trên |
| `forced` | `options.lane` hoặc cấu hình dự án | — | Người dùng/dự án ép làn (đã có `'fast'/'full'`, `:1116-1118`) |

**Công thức (theo D7):** dùng làn đơn khi `T_đơn_ước < k × a`, với `a` = hệ số chặn (chi phí cố định của điều phối) và `k` hệ số ngưỡng.

- `a₀ = 48 s` (trung bình cố định mỗi bài ở C7, §2).
- `k₀ = 3` ⇒ ngưỡng ban đầu `3 × 48 ≈ 144 s`. Lý do chọn: ngưỡng này nằm giữa t3 (107,5 s, làn nhanh thua) và t5 (165,5 s, làn nhanh thắng) và gần giao điểm hồi quy thô T* = 152 s (§2). **Đây là điều chỉnh theo chính dữ liệu C7, nên là thăm dò**; không dùng làm bằng chứng cho H1–H3.
- `T_đơn_ước` lấy từ tín hiệu: **chưa có công thức hồi quy** vì chỉ có 5 điểm và `briefChars` không phân biệt được. Bản đầu dùng quy tắc thứ tự, không giả vờ chính xác:
  1. `forced` ⇒ theo ép.
  2. `briefChars > fastLane.maxBriefChars` hoặc repo vượt ngưỡng hiện có ⇒ **lớn**.
  3. `parts ≥ 5` hoặc `filesTouched ≥ 6` ⇒ **lớn** (ngưỡng đặt tại cỡ l1-modules; hiệu chỉnh theo H5).
  4. Ngược lại ⇒ **nhỏ ⇒ làn đơn**.
  Theo quy tắc này cả t1–t5 (≤ 4 phần) vào làn đơn, khớp với dữ liệu: chi phí làn nhanh đắt hơn ở 5/5 bài, thời gian chậm hơn ở 4/5 bài.
- Nhật ký bắt buộc ghi `signals`, `lane`, `why` (như `⚡ Làn nhanh (${pick.why})`, `orchestrator.ts:1169`) để hiệu chỉnh sau.

**Kế hoạch hiệu chỉnh** (S2 viết quy tắc cập nhật chính thức trong `preregistration.md`; phần S3 đề xuất để thống nhất):
- Với dữ liệu C9 (t1–t5) và l1-modules, l2-chain: hồi quy `TG_đa-agent = a + b × TG_đơn` (đó là H4). Hệ số chặn `a` thay `a₀`; **`k = 1/(1−b)`** (giao điểm `T* = a/(1−b)`, nên `T*/a = k`). Hiện thô: b = 0,428 ⇒ k = 1,75; chọn `k₀ = 3` cao hơn có chủ ý, vì nhầm sang việc lớn rẻ hơn nhầm sang việc nhỏ (chi phí làn nhanh đắt 2,72 lần).
- Ngưỡng `parts` và `filesTouched`: chỉnh theo H5 (l1-modules: CCoding nhanh hơn?) và H6 (l2-chain: CCoding không nhanh hơn và tốn hơn ⇒ chuỗi phụ thuộc không nên vào đa-agent dù có nhiều tầng; ⇒ thêm tín hiệu `phụ thuộc tuần tự` giữ làn đơn).
- Không chỉnh ngưỡng bằng t6–t8 (bài giữ lại, chỉ để xác nhận, H7).

### 3.2 Luồng làn đơn

1. Chọn làn (§3.1), ghi `signals`. Chạy `checkCommands` baseline (đã có `orchestrator.ts:1326`).
2. **Một agent đúng vai** (vai chọn theo loại việc; có quyền `exec` nếu dự án có `checkCommands`) chạy pha `execute` trong worktree nhiệm vụ. Không route/plan/discuss/finalize, không họp, không kế hoạch nhiều bên, không worktree con, không tổng hợp bằng LLM.
3. Gọi qua `Orchestrator.call()` (log, token, chính sách dữ liệu, KPI) — không gọi runtime trực tiếp.
4. Chạy cổng chất lượng (B-02).
5. Báo cáo (`FINAL.md`) dựng từ đầu ra theo **mẫu của giám đốc** không gọi LLM, như `finalReport: 'template'` (`orchestrator.ts:1488`); đầu ra của agent phải đủ mục "Mẫu đầu ra" của vai đó (kiểm ở B-02).
6. Chi phí cố định kỳ vọng còn lại: 0 pha plan/review/synthesize (trừ khi B-02 yêu cầu reviewer).

### 3.3 Nâng lên multi-agent

Điều kiện (một trong): (a) còn đỏ sau N vòng sửa của B-02; (b) phạm vi phát sinh vượt ngưỡng: `filesTouched` thực tế (từ diff) > 6 hoặc > 2 × ước lượng ban đầu, hoặc agent phát hiện `parts ≥ 5`; (c) agent đơn tự báo việc lớn (dòng `ESCALATE:` kèm danh sách phần độc lập trong đầu ra). **Giữ worktree** và bàn giao dở dang: diff hiện tại, kết quả `checkCommands` (`pc.baseline`, `pc.latest`), ghi chú của agent; làn đầy/nhanh nhận lại worktree thay vì làm lại từ đầu (cơ chế lưu trạng thái: `this.save(task)`, `run.revising`, `orchestrator.ts:1343-1350`). Sự kiện nâng cấp ghi vào log và vào `Sai lệch`/KPI vì đó là chi phí đã trả.

### 3.4 Chỉ tiêu nghiệm thu B-01

| Chỉ tiêu | Ngưỡng | Cách đo | Vòng |
|---|---|---|---|
| Thời gian so với Claude Code đơn cùng mô hình | trong ±15 % (tỉ lệ ∈ [0,85; 1,15]) | `runs.csv` `wall_s`, CI bootstrap 95 % | vòng sau B-01, t1–t5 (H9 đề nghị) |
| Chi phí | trong ±15 % | `runs.csv` `cost_usd` | như trên |
| Test ẩn | không kém hơn, biên 2 điểm % | `hidden_pass/hidden_total` (H3) | như trên + t6–t8 giữ lại (H7) |
| KPI | không giảm so với baseline | `GET /api/kpi?task=…` trước/sau | mỗi vòng |
| Chọn đúng làn | l1-modules → đa-agent nhanh hơn (H5); l2-chain → không đa-agent (H6) | `lane` trong log + `runs.csv` | sau C9 |

---

## 4. B-02 — Cổng chất lượng

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Bỏ điều phối thì mất lớp kiểm. Hiện nay lệnh đỏ chỉ ép "không duyệt" **sau khi reviewer đã chạy** (một lượt LLM đắt): reviewer được gọi trước (`orchestrator.ts:1365`), rồi mới ghi đè bằng `checkRegressions` (`:1380-1388`). Chỉ regression (đạt ở baseline, hỏng sau) mới bị ép; lệnh đỏ từ baseline thì không. Reviewer không có `checkCommands` hay không chạy lệnh (`verified === false`, `:1399-1407`) chỉ cảnh báo. Nội dung đầu ra không được kiểm tuân thủ "Mẫu đầu ra" trước khi nhận (KPI chỉ chấm sau: `kpi.ts:324-327`). t2 làn nhanh C7 chỉ 52/60 test ẩn. |
| **2. Bằng chứng** | `orchestrator.ts:1326, 1360, 1365, 1380-1388, 1399-1407, 2504-2568`; `kpi.ts:144, 168, 324-327, 608-611`; §1.2 N3c; §2 (52/60). Review là pha dài nhất ở C5 (`kpi-research…md:62`); review + revise = 116,8 s trên 5 bài ở C7 (T-d (3), `token-analysis.md:292`). |
| **3. Nguyên nhân gốc** | Đã kiểm bằng đọc mã: thứ tự gọi reviewer → kiểm tra regression. **Giả thuyết:** reviewer gọi khi mã đã đỏ là lãng phí; chưa đo tỉ lệ lượt rơi vào trường hợp này. |
| **4. Thay đổi đề xuất** | §4.1–4.4. |
| **5. Hiệu quả kỳ vọng** | (a) Bỏ 1 lượt review khi mã đỏ: tiết kiệm tối đa phần review của lượt đó (≈ 23 s trung bình mỗi bài ở C7: 116,8/5); (b) làn đơn không reviewer mặc định: bỏ phần review (cùng nguồn) trừ khi điều kiện §4.3 thỏa; (c) P3 (reviewer chỉ nhận diff + kết quả lệnh) trần −2,8 % chi phí CCoding (`dev-review.md:181`, O4 ở bảng T-e) — dưới nhiễu ±15 %, không tách được. (d) Chất lượng: test ẩn không thấp hơn Claude Code đơn (H3), 0 đầu ra thiếu mục mẫu. **Giả thuyết.** |
| **6. Cách kiểm lại** | H3 (test ẩn không kém hơn); KPI: `compliance.templateCoverage` = 100 % cho lượt làn đơn, Chất lượng của reviewer (N3b) khi reviewer còn chạy; đếm `checks.run` đỏ → số reviewer bị bỏ qua. Vòng: cùng vòng với B-01 (H9) và C9 làm baseline; t6–t8 (H7). |
| **7. Rủi ro và bảo vệ dữ liệu** | Rủi ro: (a) vòng sửa kéo dài ⇒ giới hạn N; (b) `checkCommands` chạy mã của dự án ⇒ chỉ chạy với quyền `exec` và qua `denyCommands` như `orchestrator.ts:2507`; (c) mẫu đầu ra kiểm cứng ⇒ agent "đệm" tiêu đề rỗng: chỉ chấp nhận tiêu đề có nội dung (xem 4.2). Dữ liệu: không đổi nhãn, hook, `LogStore`; kết quả kiểm (stdout) đi qua `LogStore` che bí mật; không đưa vào đầu vào reviewer những tệp `.env`. Gate dữ liệu: thay đổi chạm bảo mật hay dữ liệu ⇒ bắt buộc reviewer (§4.3). |
| **8. Ưu tiên** | Hiệu quả 4 / công sức 3 = 1,3. Bắt buộc đứng thứ hai. |
| **9. Giám đốc duyệt** | **Có** — đổi cách duyệt/ép sửa. |

### 4.1 Vòng kiểm → sửa

1. `checkCommands` chạy ở **baseline** (đã có) và **sau thực thi** và **sau mỗi vòng sửa** (đã có `runProjectChecks(…, 'baseline' | 'execute' | 'revise')`, `orchestrator.ts:2504`).
2. Đỏ hoặc hồi quy ⇒ vào vòng sửa **ngay**, **không gọi reviewer**. Đỏ = lệnh có `ok=false` mà không phải do baseline đã đỏ; hồi quy = `checkRegressions` (`:2564-2568`). Lệnh đã đỏ từ baseline (như `--check` ở nhiệm vụ này) không chặn, chỉ được ghi chú (đúng yêu cầu: "lỗi đã có ở baseline không phải việc của hạng mục").
3. Prompt vòng sửa nhận: đúng đầu ra của lệnh đỏ (đã cắt theo `maxOutputChars`), không phải toàn bộ lịch sử.
4. **N ban đầu = 2** vòng sửa theo kiểm tra (`config.defaults.maxRevisions` hiện 1, `config.ts:285`, kẹp tối đa 3 ở `orchestrator.ts:296`; tách tham số mới `gate.maxFixRounds = 2` để không đổi hành vi review). Lý do: một vòng sửa ≈ 50 s (C5 t2, `PROCESS-REVIEW.md:256`), hai vòng giữ chi phí xấu nhất trong +100 s, dưới ngưỡng t* (§3.1). Hiệu chỉnh lại khi có số vòng sửa thực tế ở C9.
5. Còn đỏ sau N vòng ⇒ nâng lên multi-agent (§3.3).

### 4.2 Kiểm "Mẫu đầu ra" bằng đúng phép kiểm của KPI

Dùng nguyên hàm của `src/kpi.ts` để cổng và KPI cho cùng một kết quả:

- Lấy danh sách mục: `templateHeadings(body)` (`kpi.ts:144`) từ hồ sơ `agent.md` của vai chạy.
- Đo: `templateCoverage(text, headings)` (`kpi.ts:168`), so khóa bằng `headingKey` (`kpi.ts:163`: phần trước `(`, `·`, `:`, `—`, chuẩn hóa, tối đa 28 ký tự).
- Mở đầu "Tóm tắt": cùng biểu thức `kpi.ts:327` (`/^#{1,3}\s*Tóm tắt/im`).
- **Cổng đạt khi `coverage === 1` và có "Tóm tắt".** (KPI chỉ cảnh báo khi < 70 %, `kpi.ts:608`; cổng nghiêm hơn có chủ ý, vì tiêu chí của giám đốc là đúng mẫu.) Thiếu ⇒ một lượt "sửa định dạng" ngắn, không dùng công cụ, nêu đúng `missing`; tính vào N.
- Giới hạn đã biết: `templateCoverage` chỉ so tiêu đề (không đo nội dung). Phép kiểm chưa phát hiện tiêu đề rỗng; thêm ngưỡng tối thiểu số dòng dưới tiêu đề là việc của Phòng Dev (đề xuất: ≥ 1 dòng không rỗng), nêu ở rủi ro (c).

### 4.3 Khi nào cần reviewer

Reviewer (LLM) chỉ được gọi khi một trong:
- **Không có `checkCommands`** của dự án (cổng không có bằng chứng máy; kiểu `verified` không xác định ở `:1399`). Bản vá **D-02** (`attention` khi không kiểm chứng) gộp vào đây: dùng `attention = true` nếu reviewer cũng không chạy lệnh.
- **Thay đổi đụng bảo mật hoặc dữ liệu:** diff chạm đường dẫn khớp danh sách (đề xuất ban đầu): `src/tools/**` (hook, chính sách), `src/runtimes/**`, `src/kpi.ts`, `src/store.ts`/`LogStore`, `.env*`, `data/`, `agents/**` (định dạng `agent.md`), `config`, hoặc dự án có nhãn dữ liệu ≥ Bảo mật. Phù hợp quy tắc repo: đổi định dạng `agent.md` ⇒ cập nhật tài liệu/test; Data Protection Gate bắt buộc.
- Cổng định dạng thất bại sau N vòng, hoặc đỏ sau N vòng (trước khi nâng cấp lên multi-agent).

Reviewer khi được gọi nhận **diff + kết quả lệnh kiểm** thay vì toàn bộ đầu ra (P3, gộp vào B-02). Đây là phần P3, độ lớn trần −2,8 % (O4); coi như bổ sung rẻ chứ không phải lý do.

**G5 (vai chỉ đọc tự chạy `checkCommands`) — loại.** Lý do: (a) CCoding đã tự chạy `checkCommands` và đưa kết quả cho reviewer (`:1391-1393`, `:2535`), nên reviewer không cần tự chạy; (b) `node --test` và `--check` chạy mã dự án, cho vai "chỉ đọc" chạy chúng làm vỡ bảo đảm đọc-chỉ của hook (`shell-policy.ts:154-189`); (c) N3a cho thấy chỉ 4/8 lượt chặn là lệnh kiểm tra, bù bằng cách trên.

### 4.4 Mọi lượt gọi

Mọi lượt (execute, vòng sửa, sửa định dạng, reviewer) đi qua `Orchestrator.call()` để được ghi log, đếm token, áp chính sách dữ liệu, rồi **được chấm KPI** (`computeKpi`, `kpi.ts:199`). Không gọi runtime trực tiếp (quy ước repo).

### 4.5 Chỉ tiêu nghiệm thu B-02

| Chỉ tiêu | Ngưỡng | Cách đo |
|---|---|---|
| Test ẩn | không kém hơn Claude Code đơn, biên 2 điểm % (H3) | `runs.csv` |
| `compliance.templateCoverage` | 100 % (lượt làn đơn) | `GET /api/kpi` |
| Lượt reviewer bị bỏ khi mã đỏ | = số sự kiện `checks.run` đỏ (không còn `review` sau đỏ) | `logs` kind `checks.run` + `phases.csv` |
| Số vòng sửa | ≤ N=2; lượt vượt N ⇒ có sự kiện nâng cấp | log |
| KPI phòng | không thấp hơn baseline (82 điểm cho 2 nhiệm vụ 2/11; 68 trong 7 ngày: `kpi-research…md:15`) | `GET /api/kpi` |
| Hiệu quả | thời gian, chi phí trong ±15 % (như B-01) | `runs.csv` |

---

## 5. Các mục còn lại

### B-03 — Nhật ký sự cố khi sửa (P4)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Vòng tự cải thiện cần dữ liệu về sự cố ở pha sửa; hiện không có bản ghi có cấu trúc (C-14 còn mở). |
| **2. Bằng chứng** | `dev-review.md:169` (I-02); `publication-plan.md:180` (xếp P4 làm trước các bản vá tối ưu); bản vá `self-improvement/prompt-patches/P4-incident-log-on-revise.diff`. Bản vá ở đó cần `--unidiff-zero --ignore-whitespace` (`dev-review.md:13`). |
| **3. Nguyên nhân gốc** | Đã kiểm: bản vá không qua `git apply --check` trần vì CRLF/LF và hunk không có ngữ cảnh (`dev-review/verification.md:25`), không do mã đã đổi. |
| **4. Thay đổi đề xuất** | Áp P4 vào `src/prompts.ts` (`revisePrompt`); làm lại bản vá có ngữ cảnh/LF (I-08). Phối hợp với B-02: dữ liệu vòng sửa theo kiểm tra cũng ghi vào mục "Nhật ký sự cố". |
| **5. Hiệu quả kỳ vọng** | ≥ 1 mục sự cố có cấu trúc mỗi lượt revise; token revise tăng ≤ 5 % (theo KPI của I-02). Giả thuyết. |
| **6. Cách kiểm lại** | Đếm mục "Nhật ký sự cố" trong đầu ra revise; so token revise trước/sau. Nhánh B-P4 của kế hoạch F1 (`experiment-plan.md:63`). |
| **7. Rủi ro / dữ liệu** | Nhật ký sự cố có thể chứa trích đoạn lỗi: đi qua `LogStore` (che PII/bí mật), không ghi ra ngoài `data/`. |
| **8. Ưu tiên** | 2 / 1 = 2,0. |
| **9. Giám đốc duyệt** | Có — đổi prompt hệ thống. |

### B-04 — Bộ phân tích lệnh shell của hook (G1, G2)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hook chặn lệnh chỉ đọc hợp lệ; mỗi lượt chặn là một vòng gửi lại hội thoại. |
| **2. Bằng chứng** | §1.2 N1a–N1c: **36/44** `git-read-deny` chỉ đọc (48 % trong 75 lỗi); 30 có `\|`/`;` trong nháy; `echo` 4, `awk` 1, `sed -n` nhiều địa chỉ trong 10 lượt `sed -n`. Mã: `shell-policy.ts:170, 171, 177, 149, 151`. |
| **3. Nguyên nhân gốc** | **Đã kiểm bằng đọc mã:** tách `&&`/`;` và `\|` bằng `split` không biết nháy; `[<>]` bất kỳ cũng chặn; `READ_CMD` thiếu `echo`, `awk`; `SED_PRINT` một địa chỉ. **Chưa kiểm:** phát lại 36 lệnh qua hàm thật (mã hiện tại có thể khác bản hook lúc xảy ra lỗi, `kpi-research…md:3-4`). Phát lại là bước đầu tiên của Phòng Dev. |
| **4. Thay đổi đề xuất** | **G1:** tách câu lệnh có xét nháy (đã có `splitArgs` ở `:102`; dùng bộ tách mức câu cho `&&`, `;`, `\|`, bỏ qua trong `"…"`/`'…'`; cấm `$(`, backtick, `>` ngoài nháy). **G2:** thêm `echo` (không chuyển hướng), `awk` không có `system()`/ghi tệp, `sed -n` nhiều địa chỉ `Np;Mp` vào danh sách chỉ đọc; giữ `READ_CMD_FORBIDDEN`. Kiểm bằng test: 36 lệnh chỉ đọc phải qua; 5 lệnh ghi và 3 lệnh chạy mã vẫn bị chặn. |
| **5. Hiệu quả kỳ vọng** | Bớt tới 36/75 = 48 % lượt lỗi công cụ ở hai nhiệm vụ 2/11. Token tiết kiệm **chưa đo** (CSV không có token). Giả thuyết. |
| **6. Cách kiểm lại** | Test đơn vị trên 36+8 lệnh (tập tái dùng được vì lấy từ CSV); đếm lại `failures-count.mjs` trên log 7 ngày sau triển khai; KPI Tin cậy, Hiệu quả. Không cần A/B benchtest. |
| **7. Rủi ro / dữ liệu** | Đây là **biên bảo mật** của vai chỉ đọc: bộ tách sai ⇒ lệnh ghi lọt qua. Phải có bộ test "lệnh ác ý" (`; rm`, `$(...)`, heredoc, `> tệp`, `tee`, `sed -i`, `awk 'BEGIN{system(...)}'`). Giữ chặn `.env`/bí mật (`SECRET_ARG`, `:132`). |
| **8. Ưu tiên** | 3 / 2 = 1,5. |
| **9. Giám đốc duyệt** | Có (bảo mật). |

### B-05 — Script kiểm nhất quán số liệu (G7)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Số liệu lệch giữa các tệp tài liệu (cụm "C6 chưa có dữ liệu" cũ), bị bắt ở review cuối. |
| **2. Bằng chứng** | `kpi-research…md:19` (academic-writer còn major ở review cuối); `dev-review.md:217` (mục R1 đồng bộ); §1.2 N4: hiện `paper.md` và `challenges.md` đã 0 chỗ sót, còn 33 chỗ ở 4 tệp (lịch sử/trích dẫn). |
| **3. Nguyên nhân gốc** | Giả thuyết: số chuẩn sống trong nhiều tệp, không có nguồn duy nhất. Chưa kiểm cơ chế bằng dữ liệu. |
| **4. Thay đổi đề xuất** | `docs/research/consistency-check.mjs` + `facts.json` (mỗi mục: mã số, giá trị chuẩn, tệp nguồn, cụm lỗi thời bị cấm, ngoại lệ có lý do như `CHANGELOG.md`). Chạy được như `--check` (exit ≠ 0 khi lệch). Dùng như lệnh kiểm tra của dự án sau khi S1 ổn định. Không thuộc `src/`. |
| **5. Hiệu quả kỳ vọng** | 0 số lệch giữa tệp ở review cuối; giảm số vòng review tài liệu. Chưa định lượng. |
| **6. Cách kiểm lại** | `node …/consistency-check.mjs` exit 0; đếm major "số lệch" ở review cuối các nhiệm vụ viết tài liệu (KPI academic-writer, Chất lượng). |
| **7. Rủi ro / dữ liệu** | Báo động giả nếu cụm cấm quá rộng ⇒ danh sách ngoại lệ. Chỉ đọc `docs/`; không dữ liệu cá nhân. |
| **8. Ưu tiên** | 3 / 2 = 1,5. |
| **9. Giám đốc duyệt** | Không (công cụ tài liệu; chỉ cần Phòng Dev review). |

### B-06 — Chẩn đoán chặn của hook (G6, D-03)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Thông báo chặn không nói câu lệnh con nào gây chặn, và hệ thống không đếm chặn đúng/nhầm. |
| **2. Bằng chứng** | CSV: cột `reason` của `git-read-deny` đều là chuỗi `deny` chung (`shell-policy.ts:168`) ngay cả khi lệnh chỉ đọc; `dev-review.md:173` (I-06; C-46, C-48 "chưa đo"). Bản vá `dev-review/patches/D-03-guard-block-diag.diff` (chưa `--check`, `dev-review.md:227`). |
| **3. Nguyên nhân gốc** | Đã kiểm: một thông điệp cố định cho mọi lý do (`:168-188`). |
| **4. Thay đổi đề xuất** | **G6:** trả về câu con và quy tắc vi phạm (vd. `câu 2: "awk" không trong danh sách đọc`). **D-03:** ghi sự kiện chẩn đoán mỗi lần chặn (đi qua `diag`/`LogStore`). Chạy `git apply --ignore-whitespace --check` cho D-03, typecheck, test trước khi áp. |
| **5. Hiệu quả kỳ vọng** | Agent tự sửa lệnh ở lượt kế (giảm lượt lặp); đo được tỉ lệ chặn nhầm — đó mới là lợi ích chính (số liệu cho B-04, B-08). Chưa định lượng. |
| **6. Cách kiểm lại** | Số chặn/lượt chạy có trong `calls.csv` hoặc log; tỉ lệ chặn nhầm (C-48). Không cần A/B. |
| **7. Rủi ro / dữ liệu** | Thông báo chặn không được lộ nội dung bí mật trong lệnh; sự kiện đi qua `LogStore`. |
| **8. Ưu tiên** | 2 / 2 = 1,0. Làm sau B-04 (cùng tệp). |
| **9. Giám đốc duyệt** | Có. |

### B-07 — Trần lượt cho `claude-cli` (D-01)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Lượt execute của `claude-cli` không có trần lượt mô hình; một lượt có thể kéo rất dài (C5 t3 lượt 1: 579 s do treo, đã sửa riêng ở `0e82b82`). |
| **2. Bằng chứng** | `dev-review.md:170` (I-03: S3 K37/K39, C-20); `PROCESS-REVIEW.md:260` (lượt 579 s); bản vá `D-01-claude-cli-max-turns.diff` (chưa `--check`). |
| **3. Nguyên nhân gốc** | Giả thuyết (từ review mã): `claude-cli` không dùng `phases.toolTurns`. Chưa kiểm lại trên mã hiện tại. |
| **4. Thay đổi đề xuất** | Áp D-01 sau khi `--check`, typecheck, test: truyền `--max-turns` từ `phases.toolTurns`, báo `capped` khi chạm. Liên kết B-02: chạm trần = tín hiệu nâng lên multi-agent / sự cố cho B-03. |
| **5. Hiệu quả kỳ vọng** | 0 lượt execute > 40 lượt mô hình; `capHits` > 0 khi chạm trần (I-03). Chưa định lượng thời gian. |
| **6. Cách kiểm lại** | `tool_calls` trong `calls.csv`; A/B nhánh có D-01 (F1). |
| **7. Rủi ro / dữ liệu** | Trần quá thấp cắt việc dở dang ⇒ để `maxContinuations` hoạt động. Không động chạm dữ liệu. |
| **8. Ưu tiên** | 2 / 2 = 1,0. |
| **9. Giám đốc duyệt** | Có. |

### B-08 — `cwd` của hook và Read tệp tool-results (G3, G4)

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Hook tính `../` từ gốc worktree dù Bash giữ thư mục; chặn Read tệp `tool-results` do chính Claude Code lưu. |
| **2. Bằng chứng** | §1.2 N2: 1/10 chắc chắn (#33), 2/10 có dấu hiệu (#21, #45), 5/10 không xác định; 2/10 đúng chính sách. Tức tối đa 3/75 = 4 % lỗi. |
| **3. Nguyên nhân gốc** | Giả thuyết, chưa kiểm: sự kiện hook của Claude Code có trường `cwd` hay không. Phải kiểm trước (đọc tài liệu hook của phiên bản đang dùng). |
| **4. Thay đổi đề xuất** | **G3:** dùng `cwd` từ sự kiện hook để giải `..`, vẫn đòi kết quả nằm trong worktree. **G4:** cho Read tệp trong thư mục `tool-results` của chính phiên (khớp id phiên), không phải thư mục khác trong `.claude/`. |
| **5. Hiệu quả kỳ vọng** | Tối đa 3 lượt/75 ở hai nhiệm vụ 2/11 (4 %). Nhỏ. |
| **6. Cách kiểm lại** | Test hook với `cwd` giả lập: `../x` trong và ngoài worktree; đếm `outside-path` ở log 7 ngày sau triển khai. |
| **7. Rủi ro / dữ liệu** | **Biên bảo mật** (L3 ở `dev-review.md:180`): nới đường dẫn mở lối đọc ngoài worktree; cho phép chỉ thư mục `tool-results` đúng phiên, `realpath` để chống liên kết tượng trưng. |
| **8. Ưu tiên** | 2 / 3 = 0,7. Thấp nhất. |
| **9. Giám đốc duyệt** | Có (bảo mật). |

### B-09 — Giới hạn đầu ra, tín hiệu dừng khảo sát (P1, P2) — hoãn

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | P1 giới hạn đầu ra plan/review/synthesize; P2 nhắc dừng khảo sát. |
| **2. Bằng chứng** | `dev-review.md:176, 183` (I-09, I-16); O5 = 1,7 % (trần trên, bảng T-e). Hook đã nhắc: 5 lượt `read-gate-nudge` trong CSV (§1.1), thông báo "đọc 16 lần liên tiếp mà chưa ghi" cho thấy cơ chế thay thế P2 đã chạy. |
| **3. Nguyên nhân gốc** | P2: phần lớn đã được hook "giới hạn khảo sát" thay thế (đã kiểm: thông báo trong log, §1.1). P1: B-01 làm mất pha plan/review/synthesize ở việc nhỏ, nên phần tiết kiệm 1,7 % thu hẹp. |
| **4. Thay đổi đề xuất** | **Không làm trong vòng này.** Giữ P1/P2 trong `prompt-patches/`; xem lại sau khi B-01/B-02 xong và chỉ còn việc lớn đi đa-agent. |
| **5. Hiệu quả kỳ vọng** | ≤ 1,7 % chi phí (trần trên) — dưới nhiễu ±15 % của chỉ tiêu B-01; không phát hiện được bằng benchtest cỡ này. |
| **6. Cách kiểm lại** | F1 nhánh B1/B2 nếu làm sau. |
| **7. Rủi ro / dữ liệu** | Không đụng dữ liệu. Rủi ro cắt cụt đầu ra. |
| **8. Ưu tiên** | 1 / 1 = 1,0, hoãn. |
| **9. Giám đốc duyệt** | Có (đổi prompt) nếu làm. |

---

## 6. Quan hệ với đăng ký trước và các giới hạn

| Mục | Giả thuyết kiểm | Ghi chú |
|---|---|---|
| B-01 | H1, H2, H3, H4, H5, H6; đề nghị H9 (tương đương ±15 %) | H9 do S2 quyết định; S3 chỉ đề nghị. Ngưỡng `k₀=3` lấy từ C7 nên **không** dùng C7 để "xác nhận" chính nó |
| B-02 | H3, H7; KPI | H7 (bài giữ lại t6–t8) là xác nhận |
| B-03…B-09 | KPI, đếm log, test đơn vị | Không cần benchtest, trừ B-03/B-07 (F1) và B-09 |

**Giới hạn và kết quả âm tính**
- N3b, N5 **không kiểm được** từ CSV; N4 kiểm gián tiếp. Phép kiểm cần dữ liệu từ API `kpi`.
- N1 là phân loại tĩnh theo văn bản lệnh (CSV có thể cắt lệnh dài; 1 lượt không giải thích được). Chưa phát lại qua hook thật.
- `tail -c` (N1c) **sai**; N2 chỉ chứng minh chắc 1/10 lượt chặn nhầm.
- Hồi quy thô ở §2 chỉ có 5 điểm, mỗi điểm 1 lượt làn nhanh; không có CI. `k₀=3` chọn trên chính C7. C8 không có Sonnet đơn (D1) nên không dùng được cho `a`.
- t2 52/60 là 1 lượt; C8 3/3 sau `c55a249` không kết luận được.
- Số "hiệu quả kỳ vọng" ở B-02…B-09 là giả thuyết; chỉ B-01 có số đo nền.
- Nếu S1 đổi số ở T-d (3) (D2), peer-reviewer sửa tại chỗ; script `lane-threshold.mjs` đọc thẳng `runs.csv`, không phụ thuộc `token-analysis.md`.
- Bảo vệ dữ liệu: tài liệu này nội bộ, không chứa DLCN hay bí mật; CSV đã thay đường dẫn bằng `<ws>/<home>/<proj>`. Không cần đánh giá bảo vệ dữ liệu riêng; các mục B-04, B-08 chạm biên bảo mật nên cần giám đốc duyệt và bộ test ác ý.

## 7. Tái lập

```
node docs/research/context/failures-count.mjs                     # N1–N5: đếm theo loại, vai trò, công cụ, phân loại tĩnh
node docs/research/context/failures-count.mjs --list git-read-deny  # liệt kê (đổi tên category cho nhóm khác)
node docs/research/context/failures-count.mjs --ro-other           # lượt chỉ đọc chưa giải thích
node docs/research/context/lane-threshold.mjs                      # §2: C7 Sonnet đơn so với làn nhanh, hồi quy thô, k
```
Môi trường: Node ≥ 22, không phụ thuộc ngoài. Hai script nằm ở `docs/research/context/` (thêm mới, không sửa tệp thuộc S1).
