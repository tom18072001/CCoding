# Backlog nâng cấp dựa trên bằng chứng — vòng 3, gói 1 (R3) · cập nhật gói 2 (R8)

> Phòng Nghiên cứu · hạng mục S3 (@data-scientist) · 2/11/2026 · phân loại dữ liệu: nội bộ.
> Cập nhật R8 (T-20261102-175854-65c, S3, @research-lead, 2/11/2026): thêm **B-10** (cổng phủ kế hoạch, §5), sửa B-02 §4.1 bước 2 (lệnh đỏ mà đề bài yêu cầu xanh ⇒ bắt buộc vòng sửa), cập nhật §0 và §6, đổi mã giả thuyết. Bằng chứng mới: ca `t5-logq.ccoding-fastlane.2` của C9 (`docs/research/context/c9-partial-2026-11-02.md` §2).
> Cập nhật R12 (T-20261103-025758-514, S3, @methodologist, 3/11/2026): thêm **B-11** (làm gọn làn đơn, §5), đề xuất chỉ tiêu B-01′ (×1,3, chờ giám đốc duyệt; `preregistration.md` §9 V4-01, nhãn post-hoc) và kế hoạch đo B7′ (§5 B-11.5). Số lấy từ `analysis/b7-cost-decomposition.md` và `analysis/b02m-replay.md`.
> Nguyên tắc của giám đốc: mọi nâng cấp phải dựa vào nghiên cứu; mỗi thay đổi của Phòng Dev ghi mã `B-xx`; benchtest chạy theo `preregistration.md` để kiểm lại.
> Số từ `token-analysis.md` dẫn theo **mã bảng** (T-0, T-d…), không chép lại bản S1 đang làm mới.
> **Mã giả thuyết (từ R8):** hệ chính là **H1–H10 của bộ đo giám đốc** (`bench/vs-claude/analyze.mjs:61-115`), viết `H_i` trong tệp này. Giả thuyết H1–H9 của `preregistration.md` bản 1 đổi mã theo quy ước H_i → ĐK-P_i (bản 2, hạng mục S4; cùng quy ước với `preregistration.md` §3.3, thống nhất ở v2.1). **Trùng mã:** P1–P4 ở cột "Gộp ứng viên", B-02, B-03, B-09 là **bản vá prompt** trong `self-improvement/prompt-patches/`; vì vậy trong tệp này giả thuyết bản 1 ghi là **ĐK-P_i** (= P_i của `preregistration.md` bản 2). Đề nghị S4 ghi chú trùng mã này trong bảng ánh xạ P↔H.
> Phạm vi: chỉ viết tài liệu. Không sửa `src/`. Các số "kỳ vọng" là **giả thuyết cần kiểm**, không phải kết quả.

## 0. Tóm tắt xếp hạng

| Hạng | Mã | Nâng cấp | Gộp ứng viên | Hiệu quả (1–5) | Công sức (1–5) | Ưu tiên = H/E | Giám đốc duyệt lên main |
|---:|---|---|---|---:|---:|---:|---|
| 1 | **B-01** | Làn đơn cho việc nhỏ | "làn đơn" | 5 | 3 | 1,7 | Có |
| 2 | **B-02** | Cổng chất lượng (kiểm → sửa → mẫu đầu ra → reviewer có điều kiện) | lệnh đỏ vào vòng sửa (đề bài đòi xanh ⇒ bắt buộc, R8); P3; D-02; G5 (loại) | 4 | 3 | 1,3 | Có |
| 3 | **B-10** | Cổng phủ kế hoạch (phần việc không ai nhận ⇒ chặn; kế hoạch đọc dở ⇒ không chạy) | ca t5 C9 (R8) | 4 | 2 | 2,0 | Có |
| 4 | B-03 | Nhật ký sự cố khi sửa | P4 | 2 | 1 | 2,0 | Có |
| 5 | B-04 | Bộ phân tích lệnh shell của hook (nháy, lệnh đọc) | G1, G2 | 3 | 2 | 1,5 | Có (biên bảo mật) |
| 6 | B-05 | Script kiểm nhất quán số liệu | G7 | 3 | 2 | 1,5 | Không |
| 7 | B-06 | Chẩn đoán chặn của hook | G6, D-03 | 2 | 2 | 1,0 | Có |
| 8 | B-07 | Trần lượt cho `claude-cli` | D-01 | 2 | 2 | 1,0 | Có |
| 9 | B-08 | `cwd` của hook và Read tệp tool-results | G3, G4 | 2 | 3 | 0,7 | Có (biên bảo mật) |
| 10 | B-09 | Giới hạn đầu ra / tín hiệu dừng khảo sát (hoãn) | P1, P2 | 1 | 1 | 1,0 | Có |
| — | **B-11** (R12, vòng 4) | Làm gọn làn đơn: (a) nghiệm thu [**bị chặn**], (b) mẫu gọn [**cần giám đốc duyệt**], (c) prompt, (d) định tuyến [không có cơ sở]; đề xuất chỉ tiêu B-01′ ×1,3 (§5 B-11) | S1 `b7-cost-decomposition.md`; S2 `b02m-replay.md` (cho (a)) | chưa chấm | chưa chấm | — | Có |

B-01 và B-02 đứng đầu theo quyết định của giám đốc (2/11, 13:42), không phải theo điểm. **B-10 đứng thứ ba** (R8): cùng điểm ưu tiên 2,0 với B-03, nhưng là mục duy nhất ngoài B-01/B-02 có số đo chất lượng trực tiếp (t5: 95/146 test ẩn, §5 B-10), chặn một loại lỗi mà reviewer LLM đã bỏ lọt, và nên triển khai cùng B-02 (chung bước "trước thực thi/sau thực thi" của pipeline). Thang điểm 1–5 là đánh giá chuyên gia; chỉ B-01/B-02/B-10 có số đo hỗ trợ trực tiếp (§3, §5 B-10).

**Phủ ứng viên:** G1→B-04 · G2→B-04 · G3→B-08 · G4→B-08 · G5→loại, ghi ở B-02 · G6→B-06 · G7→B-05 · D-01→B-07 · D-02→B-02 · D-03→B-06 · P1→B-09 · P2→B-09 · P3→B-02 · P4→B-03 · ca t5 C9 (kế hoạch bỏ sót `agg.js`)→B-10 · ca t5 C9 (`npm test` đỏ mà review duyệt)→B-02 §4.1.

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

- **Cơ sở của các tỉ lệ:** 1,44 và 2,72 là tỉ lệ **tổng thô, chỉ C7** (Σ làn nhanh / Σ Sonnet đơn, 5 bài, đơn vị gốc). Các tỉ lệ của S1 trong `token-analysis.md` (1,545 và 2,947) là **C7+C8 phân tầng theo bài**; hai bộ số khác cơ sở chứ không mâu thuẫn. Backlog dùng bộ C7 vì C8 không có Sonnet đơn (D1). Nếu hai bộ cần so, dẫn theo mã bảng của S1.
- Tổng thời gian khớp bảng **T-d (3)** (`token-analysis.md:292`: 429,0 s và 619,0 s). Phần cố định của điều phối (kế hoạch + review + gộp) = **239,5 s = 55,8 %** thời gian Sonnet đơn (C7; `token-analysis.md:292`, đọc ở `:300`); gộp C5–C7 là 72,8 % (`:298`). C8 chỉ có 3 lượt làn nhanh trên t2 và không có Sonnet đơn (quyết định D1) nên không làm đổi 55,8 %.
- Cố định trung bình mỗi bài ở C7: 239,5 / 5 ≈ **48 s** (khoảng 38,5–58,6 s; `token-analysis.md:287-291`).
- Hồi quy thô (5 điểm, mỗi điểm 1 lượt làn nhanh): TG làn nhanh = **87,1 + 0,428 × TG đơn**; giao điểm T* = a/(1−b) = **152 s**. Dưới T*, làn nhanh chậm hơn; trên T*, nhanh hơn. Đây là **khám phá n=5**, không có CI; chính thức hóa bằng ĐK-P4 (hệ số chặn, độ dốc) ở C9.
- Bài duy nhất làn nhanh thắng về thời gian là t5 (165,5 s đơn). Về **chi phí** làn nhanh đắt hơn ở cả 5 bài (1,99–3,56 lần).
- Độ dài đề bài của t1–t5 là 372–542 ký tự (`bench/vs-claude/tasks/t*/prompt.txt`) và repo nhỏ, nên quy tắc làn tự chọn hiện có (`config.ts:294`: `maxBriefChars` 4000, `maxRepoFiles` 300; `orchestrator.ts:1115-1136`) chọn làn nhanh cho **cả 5 bài**, trong khi 4/5 bài chậm hơn Sonnet đơn. Tín hiệu hiện có không phân biệt được.
- t2 làn nhanh C7: 52/60 test ẩn, Sonnet đơn 60/60 (`runs.csv`, C7, t2). C8 (sau `c55a249`): 3/3 lượt 60/60 (166, 102, 120 s; $1,22, $0,55, $0,61). n quá nhỏ để kết luận; nhưng chứng minh test ẩn có thể tụt, cổng chất lượng là cần thiết.
- **(R8) C9, t5 làn nhanh lượt 2:** 95/146 test ẩn trong khi `npm test` vẫn đỏ và review vẫn duyệt (chi tiết và dòng dẫn ở §4.1 bước 2 và §5 B-10). Đây là ca thứ hai sau t2 C7 cho thấy test ẩn tụt ở làn nhanh, lần này do **kế hoạch bỏ sót phần việc**, không do lỗi cài đặt.

---

## 3. B-01 — Làn đơn cho việc nhỏ

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Với việc nhỏ, điều phối nhiều bên trả phí cố định mà một agent đơn không phải trả: làn nhanh C7 chậm 1,44 lần và đắt 2,72 lần Sonnet đơn (cùng mô hình). Mục tiêu giám đốc: việc nhỏ dùng agent đơn. |
| **2. Bằng chứng** | §2: `lane-threshold.mjs` (Σ 619,0 s so với 429,0 s; $3,492 so với $1,286). `token-analysis.md` T-d (3) `:292` (cố định 55,8 %). `PROCESS-REVIEW.md:221-280` (§13): C5 và C6 cùng chiều. Làn tự chọn hiện nay chọn làn nhanh cho cả t1–t5: `orchestrator.ts:1115-1136`, `config.ts:294`. |
| **3. Nguyên nhân gốc** | **Đã kiểm một phần:** phần cố định = kế hoạch (115,6 s) + review (116,8 s) + gộp (7,1 s) trên 5 bài (T-d (3)); mỗi lượt gọi agent là một phiên `claude -p` mới ghi lại tiền tố cache (`PROCESS-REVIEW.md:266`). **Giả thuyết:** execute song song không bù được (execute/Sonnet đơn 48–132 %, `token-analysis.md:287-291`) vì phần việc nhỏ không chia song song được. |
| **4. Thay đổi đề xuất** | Thêm `lane: 'single'` bên cạnh `'fast'`/`'full'`; chọn tự động theo §3.1; mặc định cho việc nhỏ. Luồng ở §3.2. |
| **5. Hiệu quả kỳ vọng** | Trên t1–t5: thời gian và chi phí trong **±15 %** Claude Code đơn cùng mô hình (từ 1,44× và 2,72× hiện nay). Kỳ vọng thời gian −30 % và chi phí −60 % so với làn nhanh (C7). **Giả thuyết**. |
| **6. Cách kiểm lại** | **Hệ chính (bộ đo giám đốc):** H5 (tỉ lệ chi phí token có trọng số và thời gian, `analyze.mjs:80-85`), H1/H2 (việc chia được / việc gắn chặt, `:61-68`), H10 (lợi thế tăng theo `size`, `:108-115`), H6 (agent đơn cùng lượng tính toán, `:86-91`); giả thuyết B-01 mới của bản 2 (TOST ±15 % so với A0-sonnet trên token có trọng số, thời gian thực, điểm — S4). **Bộ cũ t1–t5:** ĐK-P1 (thời gian làn nhanh/Claude Code ≥ 1,3 ⇒ lý do tồn tại B-01), ĐK-P2 (chi phí làn nhanh > Claude Code), ĐK-P3 (test ẩn không kém hơn, biên 2 điểm %), ĐK-P4 (hiệu chỉnh ngưỡng), ĐK-P5 (l1-modules), ĐK-P6 (l2-chain), ĐK-P9 (tương đương ±15 %, nay ánh xạ sang giả thuyết B-01 mới). Vòng benchtest: C9 cho ĐK-P1–P3 (sau `c55a249`; làn đơn chưa tồn tại ở C9 nên C9 chỉ cho baseline); vòng sau B-01 cho giả thuyết B-01; t6–t8 giữ lại cho ĐK-P7. |
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

**Công thức (theo D7):** dùng làn đơn khi `T̂_đơn < k × a`. Chỉ **một** định nghĩa của `a`: **hệ số chặn của hồi quy `TG_làn-nhanh = a + b × TG_đơn`** (đúng biến của ĐK-P4, `preregistration.md` §7); `k = 1/(1−b)`, nên `k × a` chính là giao điểm T* mà dưới đó đa-agent chậm hơn.

- Giá trị khởi đầu (hồi quy thô C7, n=5, §2): `a₀ = 87,1 s`, `b₀ = 0,428` ⇒ `k₀ = 1/(1−0,428) = 1,75` ⇒ `k₀ × a₀ ≈ 152 s`. Đây là **thăm dò trên chính C7**, không dùng làm bằng chứng cho ĐK-P1–P3.
- Con số 48 s (cố định trung bình mỗi bài, §2) là **đại lượng mô tả** các pha plan+review+gộp, **không** phải `a` và không vào công thức. (Bản trước trộn hai định nghĩa: 1,75 × 87,1 ≈ 152 ≈ 3 × 48; đã bỏ `k₀ = 3`.)
- **Bản đầu quyết định bằng quy tắc thứ tự 1–4 dưới đây; `k × a` chưa dùng để quyết định ở bản đầu.** Lý do: chưa có nguồn `T̂_đơn` đáng tin (5 điểm, `briefChars` không phân biệt).
  1. `forced` ⇒ theo ép.
  2. `briefChars > fastLane.maxBriefChars` hoặc repo vượt ngưỡng hiện có ⇒ **lớn**.
  3. `parts ≥ 5` hoặc `filesTouched ≥ 6` ⇒ **lớn** (ngưỡng đặt tại cỡ l1-modules; hiệu chỉnh theo ĐK-P5).
  4. Ngược lại ⇒ **nhỏ ⇒ làn đơn**.
- **Nguồn `T̂_đơn` cho giai đoạn 2** (bật khi dự án có ≥ 3 nhiệm vụ làn đơn đã xong): `T̂_đơn` = trung vị `wall` của các nhiệm vụ làn đơn trước đó **cùng dự án** có cùng `parts` (làm tròn lên bậc 1–2, 3–4, ≥ 5); thiếu lịch sử thì dùng quy tắc 1–4. Khi có `T̂_đơn`, thêm điều 5: `T̂_đơn ≥ k × a` ⇒ lớn. Hành vi hệ thống do đó **chỉ đổi theo `k`, `a` ở giai đoạn 2**; ở giai đoạn 1 C9/ĐK-P4 chỉ hiệu chỉnh ngưỡng `parts`/`filesTouched` (cùng ĐK-P5, ĐK-P6).
- **Mâu thuẫn đã biết, chấp nhận có chủ ý:** t5 (165,5 s đơn) lớn hơn `k₀ × a₀ = 152 s`, nhưng quy tắc 1–4 đưa t5 vào làn đơn (4 phần). Làn đơn trên t5 dự kiến ≈ Claude Code (không thua về thời gian so với Claude Code; chậm hơn làn nhanh C7 127 s) nhưng rẻ hơn nhiều (làn nhanh đắt 2,36× ở t5); mục tiêu giám đốc là tối ưu chi phí. Kiểm bằng giả thuyết B-01 (ĐK-P9) trên t5. Nếu C9 cho thấy giai đoạn 2 xếp t5 vào làn lớn mà đo được lợi, chuyển bằng điều 5. (R8: ca t5 C9 lượt 2 — kế hoạch đa-agent bỏ sót `agg.js`, §5 B-10 — là thêm một lý do giữ t5 ở làn đơn: một agent không có bước chia việc nên không thể "bỏ sót hạng mục".)
- Nhật ký bắt buộc ghi `signals`, `lane`, `why` (như `⚡ Làn nhanh (${pick.why})`, `orchestrator.ts:1169`) để hiệu chỉnh sau.

**Kế hoạch hiệu chỉnh** (S2 viết quy tắc cập nhật chính thức trong `preregistration.md`; phần S3 đề xuất để thống nhất):
- Với dữ liệu C9 (t1–t5) và l1-modules, l2-chain: hồi quy `TG_đa-agent = a + b × TG_đơn` (đó là ĐK-P4) cho `a` và `b`, từ đó `k = 1/(1−b)`; cập nhật `a₀, k₀` (§3.1) và chỉ có hiệu lực lên quyết định từ giai đoạn 2. Nhầm sang việc lớn rẻ hơn nhầm sang việc nhỏ về chi phí (làn nhanh đắt 2,72× ở C7), nên khi `b` ước lượng có CI rộng, lấy cận trên của `k`.
- Ngưỡng `parts` và `filesTouched`: chỉnh theo ĐK-P5 (l1-modules: CCoding nhanh hơn?) và ĐK-P6 (l2-chain: CCoding không nhanh hơn và tốn hơn ⇒ chuỗi phụ thuộc không nên vào đa-agent dù có nhiều tầng; ⇒ thêm tín hiệu `phụ thuộc tuần tự` giữ làn đơn). Trên bộ đo giám đốc, ngưỡng tương ứng được kiểm bằng H10 (`analyze.mjs:108-115`, biến `size`) — xem thẩm định `size` của S1 (`suite-review.md`).
- Không chỉnh ngưỡng bằng t6–t8 (bài giữ lại, chỉ để xác nhận, ĐK-P7).

### 3.2 Luồng làn đơn

1. Chọn làn (§3.1), ghi `signals`. Chạy `checkCommands` baseline (đã có `orchestrator.ts:1326`).
2. **Một agent đúng vai** (vai chọn theo loại việc; có quyền `exec` nếu dự án có `checkCommands`) chạy pha `execute` trong worktree nhiệm vụ. Không route/plan/discuss/finalize, không họp, không kế hoạch nhiều bên, không worktree con, không tổng hợp bằng LLM.
3. Gọi qua `Orchestrator.call()` (log, token, chính sách dữ liệu, KPI) — không gọi runtime trực tiếp.
4. Chạy cổng chất lượng (B-02).
5. Báo cáo (`FINAL.md`) dựng từ đầu ra theo **mẫu của giám đốc** không gọi LLM, như `finalReport: 'template'` (`orchestrator.ts:1488`); đầu ra của agent phải đủ mục "Mẫu đầu ra" của vai đó (kiểm ở B-02).
6. Chi phí cố định kỳ vọng còn lại: 0 pha plan/review/synthesize (trừ khi B-02 yêu cầu reviewer).

### 3.3 Nâng lên multi-agent

Điều kiện (một trong): (a) còn đỏ sau N vòng sửa của B-02; (b) phạm vi phát sinh vượt ngưỡng: `filesTouched` thực tế (từ diff) > 6 hoặc > 2 × ước lượng ban đầu, hoặc agent phát hiện `parts ≥ 5`; (c) agent đơn tự báo việc lớn (dòng `ESCALATE:` kèm danh sách phần độc lập trong đầu ra). **Giữ worktree** và bàn giao dở dang: diff hiện tại, kết quả `checkCommands` (`pc.baseline`, `pc.latest`), ghi chú của agent; làn đầy/nhanh nhận lại worktree thay vì làm lại từ đầu (cơ chế lưu trạng thái: `this.save(task)`, `run.revising`, `orchestrator.ts:1343-1350`). Sự kiện nâng cấp ghi vào log và vào `Sai lệch`/KPI vì đó là chi phí đã trả. Kế hoạch đa-agent sau nâng cấp phải qua cổng phủ kế hoạch B-10.

### 3.4 Chỉ tiêu nghiệm thu B-01

| Chỉ tiêu | Ngưỡng | Cách đo | Vòng |
|---|---|---|---|
| Thời gian so với Claude Code đơn cùng mô hình | trong ±15 % (tỉ lệ ∈ [0,85; 1,15]) | `runs.csv` `wall_s`, CI bootstrap 95 % | vòng sau B-01, t1–t5 (giả thuyết B-01 của bản 2, ĐK-P9) |
| Chi phí | trong ±15 % | `runs.csv` `cost_usd` | như trên |
| Test ẩn | không kém hơn, biên 2 điểm % | `hidden_pass/hidden_total` (ĐK-P3) | như trên + t6–t8 giữ lại (ĐK-P7) |
| KPI | không giảm so với baseline | `GET /api/kpi?task=…` trước/sau | mỗi vòng |
| Chọn đúng làn | l1-modules → đa-agent nhanh hơn (ĐK-P5); l2-chain → không đa-agent (ĐK-P6) | `lane` trong log + `runs.csv` | sau C9 |

(Cách đo trên bộ đo giám đốc — token có trọng số, A0-sonnet làm đối chứng, TOST ba đại lượng — do S4 chốt trong `preregistration.md` bản 2; bảng này giữ chỉ tiêu cho bộ cũ t1–t5.)

---

## 4. B-02 — Cổng chất lượng

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Bỏ điều phối thì mất lớp kiểm. Hiện nay lệnh đỏ chỉ ép "không duyệt" **sau khi reviewer đã chạy** (một lượt LLM đắt): reviewer được gọi trước (`orchestrator.ts:1365`), rồi mới ghi đè bằng `checkRegressions` (`:1380-1388`). Chỉ regression (đạt ở baseline, hỏng sau) mới bị ép; lệnh đỏ từ baseline thì không. Reviewer không có `checkCommands` hay không chạy lệnh (`verified === false`, `:1399-1407`) chỉ cảnh báo. Nội dung đầu ra không được kiểm tuân thủ "Mẫu đầu ra" trước khi nhận (KPI chỉ chấm sau: `kpi.ts:324-327`). t2 làn nhanh C7 chỉ 52/60 test ẩn. **(R8)** C9 t5 làn nhanh lượt 2: đề bài đòi `npm test` xanh, lệnh đỏ từ baseline đến sau thực thi, reviewer LLM vẫn duyệt, 95/146 test ẩn (§4.1 bước 2). |
| **2. Bằng chứng** | `orchestrator.ts:1326, 1360, 1365, 1380-1388, 1399-1407, 2504-2568`; `kpi.ts:144, 168, 324-327, 608-611`; §1.2 N3c; §2 (52/60). Review là pha dài nhất ở C5 (`kpi-research…md:62`); review + revise = 116,8 s trên 5 bài ở C7 (T-d (3), `token-analysis.md:292`). **(R8)** `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/ccoding-task.json:4, 83, 85-86, 104-109, 173-201`; `…/result.json:14, 39-42`. |
| **3. Nguyên nhân gốc** | Đã kiểm bằng đọc mã: thứ tự gọi reviewer → kiểm tra regression. **(R8) Đã kiểm trên ca t5:** lệnh "đỏ kéo dài" (0/3 → 22/23) không phải regression nên không bị ép; quyết định duyệt rơi vào reviewer LLM, và reviewer duyệt dù chính nhận xét của nó ghi `npm test` exit 1 và `agg.js` còn stub. **Giả thuyết:** reviewer gọi khi mã đã đỏ là lãng phí; chưa đo tỉ lệ lượt rơi vào trường hợp này. |
| **4. Thay đổi đề xuất** | §4.1–4.4. |
| **5. Hiệu quả kỳ vọng** | (a) Bỏ 1 lượt review khi mã đỏ: tiết kiệm tối đa phần review của lượt đó (≈ 23 s trung bình mỗi bài ở C7: 116,8/5); (b) làn đơn không reviewer mặc định: bỏ phần review (cùng nguồn) trừ khi điều kiện §4.3 thỏa; (c) P3 (reviewer chỉ nhận diff + kết quả lệnh) trần −2,8 % chi phí CCoding (`dev-review.md:181`, O4 ở bảng T-e) — dưới nhiễu ±15 %, không tách được. (d) Chất lượng: test ẩn không thấp hơn Claude Code đơn (ĐK-P3), 0 đầu ra thiếu mục mẫu, **0 lượt "duyệt" khi lệnh đề bài đòi xanh còn đỏ** (R8). **Giả thuyết.** |
| **6. Cách kiểm lại** | **Hệ chính:** H8 (`analyze.mjs:96-100`, lỗi phối hợp: thiếu sản phẩm / bỏ yêu cầu; xem giới hạn ở B-10 trường 6), H3 (review tăng recall, `:69-75` — reviewer có đáng gọi không), H7 (độ ổn định, `:92-95`); giả thuyết B-02 mới của bản 2 (cổng chặn ca "đỏ kéo dài + bỏ sót phần việc" — S4). **Bộ cũ:** ĐK-P3 (test ẩn không kém hơn); KPI: `compliance.templateCoverage` = 100 % cho lượt làn đơn, Chất lượng của reviewer (N3b) khi reviewer còn chạy; đếm `checks.run` đỏ → số reviewer bị bỏ qua. Phát lại offline: quy tắc §4.1 bước 2 trên `results/C9/*/ccoding-task.json` phải đẩy `t5-logq.ccoding-fastlane.2` vào vòng sửa. Vòng: cùng vòng với B-01 và C9 làm baseline; t6–t8 (ĐK-P7). |
| **7. Rủi ro và bảo vệ dữ liệu** | Rủi ro: (a) vòng sửa kéo dài ⇒ giới hạn N; (b) `checkCommands` chạy mã của dự án ⇒ chỉ chạy với quyền `exec` và qua `denyCommands` như `orchestrator.ts:2507`; (c) mẫu đầu ra kiểm cứng ⇒ agent "đệm" tiêu đề rỗng: chỉ chấp nhận tiêu đề có nội dung (xem 4.2). Dữ liệu: không đổi nhãn, hook, `LogStore`; kết quả kiểm (stdout) đi qua `LogStore` che bí mật; không đưa vào đầu vào reviewer những tệp `.env`. Gate dữ liệu: thay đổi chạm bảo mật hay dữ liệu ⇒ bắt buộc reviewer (§4.3). |
| **8. Ưu tiên** | Hiệu quả 4 / công sức 3 = 1,3. Bắt buộc đứng thứ hai. |
| **9. Giám đốc duyệt** | **Có** — đổi cách duyệt/ép sửa. |

### 4.1 Vòng kiểm → sửa

1. `checkCommands` chạy ở **baseline** (đã có) và **sau thực thi** và **sau mỗi vòng sửa** (đã có `runProjectChecks(…, 'baseline' | 'execute' | 'revise')`, `orchestrator.ts:2504`).
2. Phân loại từng lệnh sau thực thi (`baseline` → `sau`):
   - **Hồi quy** (xanh → đỏ, `checkRegressions`, `:2564-2568`) hoặc **đỏ mới** (không có baseline, ví dụ lệnh mới): vào vòng sửa **ngay**, không gọi reviewer.
   - **Đỏ kéo dài mà đề bài yêu cầu lệnh xanh** (đỏ → đỏ; đề bài nêu tên lệnh, hoặc nêu mục tiêu làm xanh nó như "đảm bảo `npm test` xanh", hay `--check` ở R2): **bắt buộc vào vòng sửa**, không gọi reviewer, và **reviewer LLM không có quyền quyết định duyệt** cho lệnh này: `approved` bị ép `false` chừng nào lệnh còn đỏ, bất kể reviewer viết gì. Hết N vòng mà còn đỏ ⇒ nâng cấp (bước 5), không bao giờ kết thúc `done` + `approved`. Nhận biết "đề bài yêu cầu" bằng so khớp chuỗi, không gọi LLM: tên lệnh trong `checkCommands` xuất hiện trong `task.brief` (kể cả trong dấu `` ` ``). Prompt vòng sửa kèm danh sách tệp/module chưa có hạng mục nhận (từ B-10) nếu có.
   - **Đỏ kéo dài không liên quan đề bài** (đỏ → đỏ, đề bài không nhắc lệnh): không chặn nhưng **bắt buộc gọi reviewer** (§4.3) và ghi chú, vì cổng không xác nhận được gì về lệnh đó.
   - **Xanh** (xanh → xanh, hoặc đỏ → xanh): qua.
   (Bốn nhánh rời nhau; bản trước định nghĩa "đỏ" và "hồi quy" gần trùng. R8 tách "đỏ kéo dài" thành hai nhánh theo đề bài và bỏ quyền duyệt của reviewer ở nhánh đầu.)

   **Bằng chứng review duyệt nhầm — C9, `t5-logq.ccoding-fastlane.2` (nhiệm vụ T-20261102-140019-8c2).** Mọi đường dẫn dưới đây tương đối với `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/`:
   - Đề bài: "… Viết test cho các module, đảm bảo `npm test` xanh." (`ccoding-task.json:4`).
   - Baseline: `npm test` exit 1, 0/3 (`ccoding-task.json:174-180`). Sau thực thi: exit 1, 22/23, test hỏng `tổng hợp count by` với lỗi `aggregate is not a function` (`ccoding-task.json:185-196`). Hệ thống có bắt được: `attention.reason = "checks"`, "Lệnh kiểm tra còn lỗi: npm test" (`ccoding-task.json:198-201`) — nhưng chỉ là cảnh báo.
   - Review: `approved: true` (`ccoding-task.json:85`), chỉ 3 issue `minor` (`:87-103`); bản thân tóm tắt review ghi "`npm test` vẫn exit 1 vì `src/agg.js` còn là stub … `bin/logq.js` và `agg.js` chưa được review" (`:86`), và danh sách `checks` của review có `npm test` exit 1 (`:104-109`). Tức reviewer **thấy** lệnh đỏ và phần việc thiếu nhưng vẫn duyệt vì coi đó là "ngoài phạm vi review".
   - Không có vòng sửa: `reviewRound: 0` (`:83`), `maxRevisions: 1` (`:149`); nhiệm vụ kết thúc `status: "done"` (`:8`), `result.json:14` `approved: true`.
   - Hậu quả: 95/146 test ẩn (`result.json:39-42`).
   - Với quy tắc mới: `npm test` có trong đề bài và đỏ → đỏ ⇒ nhánh "đỏ kéo dài mà đề bài yêu cầu" ⇒ vòng sửa thay cho lượt review, `approved` không thể `true`. Phần việc bị bỏ sót (`agg.js`, CLI) còn được B-10 chặn **trước** thực thi.
3. Prompt vòng sửa nhận: đúng đầu ra của lệnh đỏ (đã cắt theo `maxOutputChars`), không phải toàn bộ lịch sử.
4. **N ban đầu = 2** vòng sửa theo kiểm tra (`config.defaults.maxRevisions` hiện 1, `config.ts:285`, kẹp tối đa 3 ở `orchestrator.ts:296`; tách tham số mới `gate.maxFixRounds = 2` để không đổi hành vi review). Lý do: một vòng sửa ≈ 50 s (C5 t2, `PROCESS-REVIEW.md:256`), hai vòng giữ chi phí xấu nhất trong +100 s, dưới giao điểm T* ≈ 152 s (§3.1). Hiệu chỉnh lại khi có số vòng sửa thực tế ở C9.
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
- **Đỏ kéo dài** không liên quan đề bài (§4.1 bước 2). Đỏ kéo dài mà đề bài yêu cầu xanh thì **không** gọi reviewer mà vào vòng sửa (R8).
- Cổng định dạng thất bại sau N vòng, hoặc đỏ sau N vòng (trước khi nâng cấp lên multi-agent).

Reviewer khi được gọi nhận **diff + kết quả lệnh kiểm** thay vì toàn bộ đầu ra (P3, gộp vào B-02). Đây là phần P3, độ lớn trần −2,8 % (O4); coi như bổ sung rẻ chứ không phải lý do.

**G5 (vai chỉ đọc tự chạy `checkCommands`) — loại.** Lý do: (a) CCoding đã tự chạy `checkCommands` và đưa kết quả cho reviewer (`:1391-1393`, `:2535`), nên reviewer không cần tự chạy; (b) `node --test` và `--check` chạy mã dự án, cho vai "chỉ đọc" chạy chúng làm vỡ bảo đảm đọc-chỉ của hook (`shell-policy.ts:154-189`); (c) N3a cho thấy chỉ 4/8 lượt chặn là lệnh kiểm tra, bù bằng cách trên.

### 4.4 Mọi lượt gọi

Mọi lượt (execute, vòng sửa, sửa định dạng, reviewer) đi qua `Orchestrator.call()` để được ghi log, đếm token, áp chính sách dữ liệu, rồi **được chấm KPI** (`computeKpi`, `kpi.ts:199`). Không gọi runtime trực tiếp (quy ước repo).

### 4.5 Chỉ tiêu nghiệm thu B-02

| Chỉ tiêu | Ngưỡng | Cách đo |
|---|---|---|
| Test ẩn | không kém hơn Claude Code đơn, biên 2 điểm % (ĐK-P3) | `runs.csv` |
| `compliance.templateCoverage` | 100 % (lượt làn đơn) | `GET /api/kpi` |
| Lượt reviewer bị bỏ khi mã đỏ | = số sự kiện `checks.run` đỏ (không còn `review` sau đỏ) | `logs` kind `checks.run` + `phases.csv` |
| **(R8)** Lượt `approved` khi lệnh đề bài đòi xanh còn đỏ | **0** | `ccoding-task.json`: `review.approved` và `projectChecks.latest[].ok` của lệnh có tên trong `brief`; phát lại trên C9 phải bắt `t5-logq.ccoding-fastlane.2` |
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

### B-10 — Cổng phủ kế hoạch (R8, ca t5 C9)

Mọi đường dẫn tệp kết quả dưới đây tương đối với `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/` (nhiệm vụ T-20261102-140019-8c2), trừ khi ghi khác.

| Trường | Nội dung |
|---|---|
| **1. Vấn đề** | Kế hoạch đa-agent có thể bỏ sót phần việc mà không bước nào phát hiện: không có phép kiểm **độ phủ** của danh sách hạng mục so với đề bài và so với chính tóm tắt kế hoạch; kế hoạch đọc được một phần vẫn được chạy như kế hoạch đủ. Ở t5 C9, 2/4 phần việc không ai làm, review vẫn duyệt (B-02), 95/146 test ẩn. |
| **2. Bằng chứng** | (a) Đề bài nêu 4 đích: "thư viện (`src/parse.js`, `src/query.js`, `src/agg.js`) và CLI `bin/logq.js`" (`ccoding-task.json:4`). (b) Tóm tắt kế hoạch: "Bốn hạng mục độc lập … parse.js, query.js, agg.js và CLI" (`ccoding-task.json:75`). (c) Danh sách hạng mục thực tế chỉ có **2**: S1 "Hiện thực src/parse.js + test" (`:31-32`), S2 "Hiện thực src/query.js + test" (`:54-55`); `result.json:16-27` cùng 2 mục. (d) S2 hỏng một phần: mô tả là văn bản lạc "Chỉ giao cho backend-dev nếu S1 có người khác làm … (Assignee thực tế: data-engineer …)" (`:41`), trong khi `assignee` là `frontend-dev` (`:56`) và `deliverable` là "(không dùng)" (`:57`). (e) Thay đổi chỉ chạm `parse.js`, `query.js` và 2 tệp test (`result.json:104-109`; `ccoding-task.json:203`). (f) 51 test ẩn hỏng (`result.json:39-94`): **37** nhóm "tổng hợp…" (`:44-80`, tức toàn bộ nhóm; `grade-hidden.tap` không có dòng `ok` nào của nhóm này) và **14** nhóm "CLI…" (`:81-94`; nhóm CLI chỉ đạt 1 test, `grade-hidden.tap:1615`). (Đính chính `context/c9-partial-2026-11-02.md` §2 ghi "toàn bộ 51 test hỏng thuộc nhóm tổng hợp": thực tế 37 tổng hợp + 14 CLI, đúng với hai đích không ai nhận.) (g) Chính dev và reviewer đều ghi nhận phần thiếu nhưng không ai có quyền/nhiệm vụ xử lý: tóm tắt S2 "`parse.js` và `agg.js` chưa được hiện thực" (`:60`); review "`bin/logq.js` và `agg.js` chưa được review. Hai phần này cần hoàn thành …" (`:86`). |
| **3. Nguyên nhân gốc** | **Đã kiểm (từ tạo phẩm):** không hạng mục nào nhận `src/agg.js` và `bin/logq.js`; số hạng mục (2) khác số tóm tắt kế hoạch tự khai (4); hạng mục S2 có trường mâu thuẫn nhau. **Giả thuyết, chưa kiểm:** đầu ra pha plan hỏng một phần và `parsePlan` chỉ lấy được 2 mục (mô tả S2 giống phần chú thích lọt vào trường `description`). Kiểm cần `data/runs/T-20261102-140019-8c2/calls.jsonl` trên server cloud (cổng 7422) — **không có trong repo**, chưa đọc được. Dù nguyên nhân là LLM lập kế hoạch thiếu hay bộ phân tích cắt mất, cổng phủ dưới đây bắt được cả hai vì nó so **kết quả đã phân tích** với đề bài và tóm tắt. |
| **4. Thay đổi đề xuất** | Thêm một bước kiểm tất định (không gọi LLM) **sau `parsePlan`, trước pha execute**, áp cho làn nhanh và làn đầy (và cho kế hoạch sau nâng cấp ở §3.3). **Quy tắc A — phần việc không ai nhận ⇒ chặn trước khi thực thi.** Tập đích `D` = các đường dẫn tệp/module nêu trong `task.brief` hoặc `planSummary` (so khớp mẫu đường dẫn có đuôi tệp hoặc tên khớp `git ls-files`, kể cả tên rút gọn như `agg.js` ↔ `src/agg.js`). Một đích được **phủ** khi xuất hiện trong `title`, `description` hoặc `deliverable` của ít nhất một hạng mục, hoặc trong danh sách `outOfScope` mà kế hoạch khai kèm lý do (vd. `src/index.js` "đã có sẵn nên không ai sửa", `:75`). `D` còn đích chưa phủ ⇒ không chạy execute; một lượt "sửa kế hoạch" (qua `Orchestrator.call()`) nhận đúng danh sách đích thiếu; vẫn thiếu ⇒ dừng, `attention = "plan-coverage"`, không chạy kế hoạch thiếu. **Quy tắc B — kế hoạch không đọc được đầy đủ ⇒ không chạy kế hoạch dở.** Kế hoạch bị coi là đọc dở khi một trong: (i) số hạng mục phân tích được khác số hạng mục tóm tắt kế hoạch tự khai (số đếm bằng chữ hoặc số: "Bốn hạng mục" ⇒ 4, ở t5 phân tích ra 2); (ii) hạng mục có `deliverable` rỗng hoặc giữ chỗ ("(không dùng)", "—"); (iii) trường mâu thuẫn trong cùng hạng mục (tên vai trong `description` khác `assignee`, như `:41` so với `:56`); (iv) bộ phân tích báo cắt cụt/JSON không đóng. Khi đó: gọi lại pha plan **một** lần; vẫn dở ⇒ dừng với `attention = "plan-unreadable"`. Không bao giờ chạy tập con hạng mục đã đọc được. |
| **5. Hiệu quả kỳ vọng** | Ca t5 C9 lượt 2 bị chặn bởi cả A (`src/agg.js`, `bin/logq.js` chưa phủ) và B (i: 4 ≠ 2; ii: `(không dùng)`; iii: `data-engineer`/`frontend-dev`). Không chặn nhầm t1 C9 lượt 3: đề bài nêu `src/duration.js` (`results/C9/t1-duration.ccoding-fastlane.3/ccoding-task.json:4`), tóm tắt kế hoạch nêu `src/parse.js`, `src/format.js`, `src/duration.js` (`…/ccoding-task.json:75`), hai hạng mục nhận đủ (`…:32, :55`); lượt đó 148/149 test ẩn với một lỗi cài đặt riêng lẻ (`…/result.json:39-44`), `npm test` cuối xanh (`…/ccoding-task.json:172`) — tức **không** cùng nguyên nhân với t5. Chi phí: phép kiểm không gọi LLM; chỉ tốn một lượt plan khi bị chặn. Độ lớn về chất lượng trên bộ đo chưa biết: n = 1 ca. **Giả thuyết.** |
| **6. Cách kiểm lại** | **(a) Phát lại offline** (không cần LLM, không tốn hạn mức): chạy hàm cổng trên mọi `bench/vs-claude/results/C*/*/ccoding-task.json` (`brief`, `runs[].planSummary`, `runs[].subtasks`). **(b) Nơi đo trên bộ đo giám đốc: H8** "Coordination failures (deliverable missing / requirements dropped)" (`bench/vs-claude/analyze.mjs:96-100`). Tên H8 mô tả **đúng loại lỗi này** ("requirements dropped" = phần việc của đề bài không ai làm), nên H8 là giả thuyết chính để kiểm B-10. **Giới hạn đã kiểm bằng đọc mã:** phán quyết H8 chỉ dựa vào tỉ lệ `formatMiss` (`analyze.mjs:97`, `:99` `verdict(fm(TREAT) > fm(BASE), false)`); grader coding `gradeCode` không trả `formatMiss` (`bench/vs-claude/lib/grade.mjs:26-41`), nên với bài coding `fm` luôn 0 và **ca kiểu t5 không làm đổi phán quyết H8**; nó chỉ hiện ở chỉ số mô tả "failed hidden-test share" (`analyze.mjs:98`), vốn không phân biệt "bỏ sót phần việc" với "lỗi cài đặt rải rác". Ngoài ra đối số `unknown` luôn `false` (`:99`) nên H8 không bao giờ báo "insufficient data". Đề nghị (không sửa mã; chuyển S1 ghi vào `suite-review.md` và S4 quyết định có khóa có điều kiện hay không): thêm chỉ số "bỏ yêu cầu" = tỉ lệ lượt coding có **một nhóm test ẩn hỏng toàn bộ** (nhóm = tiền tố trước `:` của tên test; t5: "tổng hợp" 37/37), và đưa chỉ số này vào phán quyết H8. **(c)** t1–t5 chưa có `task.json` trong bộ đo mới (Phòng Dev đang thêm), nên H8 trên t5 chỉ đo được sau khi Phòng Dev merge (nhánh 2 của `run-plan.md`). |
| **7. Rủi ro / dữ liệu** | (a) Chặn nhầm khi đề bài nhắc tệp chỉ để tham khảo ⇒ cơ chế `outOfScope` có lý do, và đo tỉ lệ chặn nhầm ở phát lại (a). (b) Bỏ lọt khi đề bài nêu phần việc không bằng đường dẫn ("thêm CLI") ⇒ quy tắc B (i) vẫn bắt nếu tóm tắt tự khai số phần; đích không có tên tệp nằm ngoài phạm vi bản đầu. (c) Vòng plan lặp ⇒ tối đa 1 lượt lại cho mỗi quy tắc. Dữ liệu: chỉ đọc `brief`, `planSummary`, `subtasks` đã có trong trạng thái nhiệm vụ; sự kiện chặn ghi qua `LogStore`; không thêm đường ghi ngoài `data/`, không đổi nhãn dữ liệu. |
| **8. Ưu tiên** | Hiệu quả 4 / công sức 2 = 2,0. Hạng 3 (§0): ngay sau B-01/B-02, triển khai cùng B-02. |
| **9. Giám đốc duyệt** | **Có** — thêm điểm chặn vào pipeline kế hoạch. |

**Chỉ tiêu nghiệm thu B-10**

| Chỉ tiêu | Ngưỡng | Cách đo |
|---|---|---|
| Bắt ca đã biết | `t5-logq.ccoding-fastlane.2` bị chặn bởi **cả** quy tắc A và B | phát lại (a) trên `results/C9/` |
| Chặn nhầm | ≤ 1 lượt bị chặn ngoài ca t5 trong toàn bộ lượt CCoding có `ccoding-task.json` ở `results/C*/`; mỗi lượt chặn có giải thích; `t1-duration.ccoding-fastlane.3` **không** bị chặn | phát lại (a) |
| Không chạy kế hoạch dở | 0 lượt có số hạng mục đã chạy < số hạng mục tóm tắt tự khai | `ccoding-task.json` (`runs[].subtasks` so với `planSummary`) |
| Lỗi phối hợp trên bộ đo | arm CCoding sau B-10: tỉ lệ "bỏ yêu cầu" (nhóm test ẩn hỏng toàn bộ, đề nghị ở trường 6) không lớn hơn A0-sonnet trên bài coding; phán quyết H8 không "SUPPORTED" theo chiều CCoding tệ hơn | H8, `analyze.mjs:96-100` (sau khi bổ sung chỉ số); trước đó đọc "failed hidden-test share" `:98` |
| Chi phí | 0 lượt LLM thêm khi kế hoạch đạt; ≤ 1 lượt plan khi bị chặn | log `plan` |

---

### B-11 — Làm gọn làn đơn (R12, vòng 4 gói 1; 3/11/2026; @methodologist)

**Mọi số dưới đây chép từ hai nguồn, không tự ước số mới:** `analysis/b7-cost-decomposition.md` (viết tắt **S1**, bảng T-n) và `analysis/b02m-replay.md` (**S2**). Mã gọi lại: sha256 `runs.jsonl` ở S1 T-0. Phép tính số học từ số của S1 được ghi công thức và nhãn "tính từ S1". Đây là **đề xuất**; chưa có biện pháp nào được triển khai hay đo.

**B-11.1 Bối cảnh.** B-01 bị bác bỏ ở vòng 3: B7/A0 = ×2,498 token có trọng số và ×2,566 thời gian (`results-round3.md` §5). S1 tái lập ×2,51 và ×2,56 (S1 T-7). Chênh weighted trên t1–t5: pha accept 47,7 % (đo trực tiếp), out vượt A0 43,6 %, cacheWrite vượt A0 8,7 %, khác + dư 0,0 % (S1 T-5, thứ tự quy phần accept → out → cacheWrite → khác). B7b: 46,8 % / 45,4 % / 7,8 % / 0,0 %. **Hạn chế quyết định cách đọc:** `byPhase` chỉ có weighted theo pha, không có out/cacheWrite/giây theo pha (S1 T-2, T-6), nên accept TRÙNG một phần với out và cacheWrite; cận dưới "accept độc lập" chỉ 14,5 % (B7b 6,0 %) ở thứ tự ngược (S1 T-5). Thời gian (×2,57) không tách được theo pha (S1 T-6).

**B-11.2 Bốn biện pháp** (mỗi biện pháp 4 trường; "cận trên" = cắt hết phần tương ứng, không khả thi trọn vẹn; "ước lượng điểm" = số đo trực tiếp):

| | (a) Bỏ/rút gọn nghiệm thu CTO | (b) Mẫu đầu ra gọn cho làn đơn | (c) Giảm prompt hệ thống, bản đồ repo, tài liệu cho lượt đơn | (d) Bỏ lượt định tuyến LLM khi `ProjectDef.lane` ép làn |
|---|---|---|---|---|
| **Trạng thái** | **BỊ CHẶN** (phán quyết B-02 của S2 là "không đủ dữ liệu", không phải "đạt") | Chờ giám đốc | Đề xuất | **Không có cơ sở:** `pickLane` không gọi LLM |
| **1. Tiết kiệm token/thời gian ước lượng** | Token: pha accept = 47,7 % Δ (48,4k/bài) trên t1–t5; 46,8 % (29,0k/bài) trên B7b (S1 T-5). Là **ước lượng điểm của chính accept** nếu bỏ hẳn; là **cận trên** khi tính phần độc lập vì trùng out/cacheWrite: 14,5 % / 6,0 % (S1 T-5, thứ tự ngược). Trung vị accept mỗi lượt 46,6k (t1–t5), 28,9k (B7b) (S1 T-2). Thời gian: **không đo được** (S1 T-6) | Token: **cận trên** = out vượt A0: 43,6 % Δ (44,3k/bài) t1–t5; 45,4 % (28,1k) B7b (S1 T-5); theo thành phần 50,4 % / 56,1 % (S1 T-4). Không tách mẫu đầu ra khỏi báo cáo bàn giao, cũng không tách out của accept khỏi out của execute (S1 T-7), nên **không có ước lượng điểm**. Thời gian: không phân rã được; chỉ mô tả wall ~ out Spearman 0,97 (S1 T-6) | Token: **cận trên** = cacheWrite vượt A0: 8,7 % Δ (8,9k/bài) t1–t5; 7,8 % (4,9k) B7b (S1 T-5); theo thành phần 36,8 % / 38,0 % (S1 T-4). Prompt không được đo (`prompt.*Chars` chưa có, S1 §Đề xuất SR), nên **không có ước lượng điểm**. B7b yếu hơn: cacheWrite mỗi lượt gọi B7 10,8k < A0 13,2k (S1 T-4) | **Không ước lượng được và có thể bằng 0.** `orchestrator.ts:1198-1200`: `chooseLane` "không gọi LLM" (quy tắc 1–4 ở `src/lane.ts`); `byPhase` không có pha định tuyến (S1 T-2); cờ `routing.llm` chưa ghi (S1 §Giới hạn). Lưu ý: kiểm trên `HEAD` của nhánh này; server chạy B7 dùng `7fb18ba` (§9 V3-02), chưa đối chiếu mã `pickLane` ở hash đó |
| **2. Rủi ro chất lượng** | Mất lớp bắt lỗi mà reviewer/CTO từng bỏ lọt hoặc bắt được. Cổng B-02 (phát lại S2): bắt 1/1 ca dương (CI 95 % [2,5 %; 100 %]), chặn nhầm 0/53 lượt xanh ([0 %; 6,7 %]). Một ca dương không đủ để thay nghiệm thu. Vòng 3 mọi bài t1–t5 chạm trần điểm (`results-round3.md` §5 (c)) nên **không đo được** chênh chất lượng khi bỏ nghiệm thu | Mất thông tin cần cho KPI hoặc người đọc: `compliance.templateCoverage` phải giữ 100 % (§4.5). Giữ đúng tiêu đề mẫu nên rủi ro định dạng thấp; rủi ro là mục bị rút quá ngắn (vd. "Tệp đã lưu", "Lệnh kiểm chứng") | Thiếu ngữ cảnh ⇒ thêm lượt đọc tệp (đổi cacheWrite sang số lượt/lượt gọi, có thể tăng giờ); mất quy ước repo (`AGENTS.md`) ⇒ sai phong cách. **Không được lược** quy tắc dữ liệu/bảo mật | Thấp: cùng quy tắc chọn làn, chỉ khác "có/không gọi". Rủi ro duy nhất: ép làn đơn cho việc lớn (đã là quyết định của chủ dự án, `lane.ts:126`) |
| **3. Điều kiện áp dụng** | Chỉ khi **đồng thời**: (i) phán quyết B-02 = "đạt" (S2 hiện "không đủ dữ liệu"; cần thêm ca dương và dữ liệu B02-G/Q, §4.5); (ii) cổng B-02 xanh ở lượt đó (không còn lệnh đỏ mà đề bài nhắc); (iii) việc không đụng bảo mật/dữ liệu (§6, B-04, B-08); (iv) làn đơn. Phương án rút gọn (thay vì bỏ): nghiệm thu chỉ chạy khi cổng B-02 đỏ hoặc có `ESCALATE:` | Làn đơn; giữ nguyên tiêu đề mẫu (đúng chuỗi mà phép kiểm §4.2 tìm); giới hạn độ dài theo từng mục, mục "không áp dụng" ghi một dòng. **Phương án đề xuất:** mỗi mục tối đa N ký tự, N đặt sau khi có `outputChars` theo mục (SR mới của S1); phần dài (nhật ký chi tiết, liệt kê tệp) chuyển sang tệp trong workspace thay vì nằm trong thân báo cáo. **Không đặt N bây giờ** vì chưa có số đo | Làn đơn; đo `prompt.systemChars/repoMapChars/docsChars` trước (SR mới) rồi mới đặt ngưỡng; bản đồ repo chỉ lược cho việc có tệp nêu trong đề bài; tài liệu dài chuyển sang "đọc khi cần" | Chỉ khi `ProjectDef.lane` được đặt. Nếu kiểm lại mã ở hash server cho thấy `pickLane` không gọi LLM thì **đóng (d)**; không triển khai |
| **4. Mục cần giám đốc duyệt** | Có: đổi cổng chất lượng; mở khóa sau khi B-02 "đạt" | **CẦN GIÁM ĐỐC DUYỆT — đụng mẫu đầu ra của giám đốc.** Duyệt: (1) giữ nguyên bộ tiêu đề; (2) có giới hạn độ dài từng mục; (3) giá trị N | Có đối với phần prompt mang quy tắc an toàn/dữ liệu (không lược). Không cần với bản đồ repo và tài liệu, Phòng Dev tự quyết kèm test | Không cần duyệt thiết kế; cần xác nhận dự án nào ép làn |

**B-11.3 Bảng chồng lấn theo thành phần phân rã của S1 (không cộng trùng).** Cột = phần Δ weighted theo thứ tự quy phần của S1 (t1–t5 / B7b, S1 T-5). Dấu ● = biện pháp rút từ phần đó; ◐ = rút từ phần đó nhưng token trùng với phần "accept" (S1 T-5 ghi: out và cacheWrite dùng số cả lượt nên trùng một phần accept).

| Biện pháp | accept (47,7 % / 46,8 %) | out vượt A0 (43,6 % / 45,4 %) | cacheWrite vượt A0 (8,7 % / 7,8 %) | khác + dư (0,0 % / 0,0 %) |
|---|:---:|:---:|:---:|:---:|
| (a) nghiệm thu | ● | ◐ (out của accept) | ◐ (cacheWrite của accept) | — |
| (b) mẫu gọn | — | ● (execute + accept) | — | — |
| (c) prompt | — | — | ● (phần còn lại ◐ trùng accept) | cacheRead (12,8 % / 5,9 % theo thành phần, S1 T-4) |
| (d) định tuyến | — | — | — | không đo được |

Quy tắc không cộng trùng: (i) không cộng (a) với (b) hay (c) bằng phép cộng phần trăm, vì token của accept nằm trong cả ba cột; (ii) hợp của ba cột đầu = 100 % Δ theo cách quy phần nên "cận trên cộng" không mang thông tin; (iii) chỉ nêu **mức cắt cần thiết** và **kịch bản đơn lẻ**. Kịch bản đơn lẻ áp công thức của S1 (§Hàm ý) R′ = 1 + (1 − f) × 1,51, với 2,51 là ước lượng điểm vòng 3 và f là phần Δ đã cắt (tính từ S1; chưa kiểm bằng dữ liệu):

| Kịch bản (cận trên cắt hết phần) | f (thứ tự chính) | R′ | f (thứ tự ngược) | R′ |
|---|---:|---:|---:|---:|
| (a) bỏ hẳn accept (**bị chặn**) | 47,7 % | ×1,79 (S1 §Hàm ý) | 14,5 % | ×2,29 |
| (b) cắt hết out vượt A0 | 43,6 % | ×1,85 | 49,4 % | ×1,76 |
| (c) cắt hết cacheWrite vượt A0 | 8,7 % | ×2,38 | 36,1 % | ×1,96 |

Các ô thứ tự chính của (b), (c) là phần còn lại sau khi accept đã quy phần (thứ tự accept → out → cacheWrite); R′ không áp dụng được cho tổ hợp. **Thang đo không tương thích (chỉ báo thô):** f là tỷ phần của Δ cộng theo bài (trung bình số học các trung vị, S1 T-5), còn 2,51 là trung bình hình học của tỷ số theo bài (S1 T-7). Tỷ số theo bài dao động ×1,73 … ×4,01 (S1 T-3), nên f bị các bài đắt chi phối. Vì vậy R′ và các ngưỡng 80,1 %/90,1 % dưới đây chỉ là chỉ báo thô về độ lớn, **không đủ làm lập luận định lượng** cho con số ×1,3. Cách chặt hơn (chưa làm): data-scientist trừ accept theo từng lượt trong `runs.jsonl` rồi tính lại tỷ số theo kiểu đăng ký trước. Mức cắt cần: ×1,3 cần f ≥ (2,51 − 1,3)/1,51 = **80,1 %** Δ; ±15 % (×1,15) cần f ≥ (2,51 − 1,15)/1,51 = **90,1 %** Δ (tính từ S1).

**B-11.4 Đọc kết quả và đề xuất chỉ tiêu B-01 mới (ĐỀ XUẤT, CHỜ GIÁM ĐỐC DUYỆT).**
- **Đề xuất:** sau B-11, B-01′: token có trọng số **và** thời gian thực của làn đơn ≤ **×1,3** A0-sonnet; **±15 % giữ làm mục tiêu dài hạn**, không bỏ. Chỉ tiêu chất lượng (test ẩn, KPI, `templateCoverage` 100 %) giữ nguyên §3.4.
- **Lập luận (từ S1):** (1) ×1,3 cần cắt ≥ 80,1 % Δ, ±15 % cần ≥ 90,1 %. Không biện pháp đơn nào của S1 làm được; (a) bị chặn. Nếu không có (a), phần rút được từ out + cacheWrite + khác là 52,3 % (thứ tự chính) đến 85,5 % (ngược) Δ (100 % − 47,7 % / 14,5 %), tức chỉ chạm ngưỡng 80,1 % khi cắt gần hết out vượt A0 và cacheWrite vượt A0 ở thứ tự ngược, không khả thi vì phần out gồm mã thật. (2) Phần chi phí cố định không thể bỏ: B7 luôn có execute (S1 T-2: 2 lượt gọi trở lên ở 100 % lượt B7 t1–t5); mỗi lượt gọi ghi cache ~ một lượt A0 (cacheWrite mỗi lượt gọi B7 17,8k so với 14,7k mỗi lượt A0, t1–t5, S1 T-4); nền thời gian B7b A0 15 s so với B7 hai lượt 80 s (S1 T-6). **Phần cố định chưa đo** (S1 T-6: giây theo pha, lệnh kiểm tra, tạo worktree đều "không đo được"), nên ×1,3 là con số **thực dụng**, không phải cận suy ra. (3) Tại sao không giữ ±15 % ngay: đạt ±15 % cần thực gần như xóa mọi chênh lệch.
- **Rủi ro của việc đổi chỉ tiêu (nêu rõ):** đổi sau khi thấy dữ liệu B7 (xem §9 V4-01, nhãn post-hoc). Biện pháp giảm: (i) giữ phán quyết "bác bỏ ±15 %" của vòng 3; (ii) chỉ tiêu mới chỉ áp cho dữ liệu B7′ mới, đã đăng ký và commit trước lượt đầu; (iii) gọi kết quả "B-01′", không gọi là xác nhận B-01; (iv) báo cả khoảng tin cậy so với ±15 %. Nếu giám đốc không đồng ý đổi, giữ ±15 % và coi B-11 là hướng giảm, phán quyết không đổi.
- Dòng sửa đăng ký trước: `preregistration.md` §9, mã **V4-01**.

**B-11.5 Kế hoạch đo lại B7′ (khóa đăng ký trước khi chạy).**
- **Hạn chót:** toàn bộ lượt chạy và phân tích xong trước **5/11/2026 14:59** (hết credit cloud). Mọi giờ theo múi giờ +07.
- **Arm.** B7′ = B7 + các biện pháp B-11 đã được duyệt và triển khai. **(a) BỊ CHẶN nên B7′ không chứa (a)**; (d) đóng nếu mã xác nhận không có lượt định tuyến LLM. B7′ do vậy chỉ gồm (c) và (b) nếu giám đốc duyệt. Tên arm do Phòng Dev đặt trong `bench/vs-claude/arms.json` (đề xuất `B7p`); S3 không sửa `bench/`. **Nếu không biện pháp nào được duyệt và triển khai kịp hạn thì không chạy B7′** (không có gì để đo); ghi lại bằng dòng §9.
- **Đối chứng và môi trường.** A0-sonnet chạy **cùng cửa sổ, cùng server, cùng hash `commit`, xen kẽ lượt** với B7′ (khác vòng 3, khi A0 lấy từ hai cửa sổ: `validity-round3.md`; S1 §Phân tích lỗi). Máy cô lập nếu có thể: một server, một luồng tuần tự, không chạy CCoding khác (V3-10). Nếu không cô lập được, ghi là đe dọa và báo `wallSec` kèm cảnh báo.
- **Bài và số lượt.** Chính: t1–t5 (cùng bài với B7a để ghép được với B7 cũ), **10 lượt B7′ và 10 lượt A0 mỗi bài = 100 lượt**. Phụ (mô tả, cắt trước nếu thiếu thời gian): 13 bài B7b × 2 lượt mỗi arm = 52 lượt.
- **Độ rộng CI dự kiến (giả định, cần kiểm).** CI 90 % của B7/A0 ở vòng 3 (a): [2,02; 3,18] với cỡ ô 9 B7 / 6 A0 ⇒ nửa độ rộng trên thang log ≈ ln(3,18/2,02)/2 ≈ 0,227 (tính từ `results-round3.md` §5). Nếu phương sai giữa lượt trong ô giữ nguyên, nâng lên 10/10 chỉ thu hẹp theo căn bậc hai của cỡ ô, tức nửa độ rộng ≈ 0,2 (không chắc: một phần phương sai là giữa bài, chỉ có 5 bài, không giảm khi thêm lượt). Hệ quả: cận trên CI ≈ R × 1,22–1,25, nên **kết luận "R ≤ 1,3" chỉ có khi R thật ≲ 1,05–1,07**; trong các trường hợp khác kết quả là "không kết luận". Kế hoạch **chấp nhận rủi ro này** và đăng ký trước ba trạng thái: **đạt** nếu cận trên CI 90 % ≤ 1,3 ở cả token và thời gian; **bác bỏ** nếu cận dưới > 1,3 ở một đại lượng; ngược lại **không kết luận**, báo R kèm CI so với ±15 % và ×1,3. **Điều kiện cứng trước commit khóa (không phải ghi chú):** data-scientist chạy bootstrap bằng `prereg-tests.mjs` trên `runs.jsonl` hiện có, tách phương sai log(tỷ số) giữa bài và giữa lượt trong bài, rồi lưu đầu ra vào `docs/research/analysis/` kèm hash. **Không có đầu ra này thì không được commit khóa và không chạy lượt nào.** Quy tắc phân bổ (đề xuất, ngưỡng là giả định chưa kiểm, giám đốc/data-scientist chốt): nếu phương sai giữa bài lớn hơn giữa lượt thì giữ tổng 100 lượt nhưng chia lại sang nhiều bài hơn (thêm bài từ B7b, ít lượt mỗi bài, A0 ghép cặp cùng bài) thay vì thêm lượt trên cùng 5 bài, vì thêm lượt không thu hẹp phần phương sai giữa bài. Quy tắc và kết quả bootstrap ghi vào commit khóa. Chưa chạy bootstrap tại thời điểm viết.
- **Ước token và thời gian so với hạn mức.** Cận trên thô lấy trung vị t1–t5 của S1 T-1 (B7: 198,7k weighted và 140,2 s mỗi lượt; A0: 65,7k và 52,4 s mỗi lượt) × số lượt: B7′ ≤ 50 × 198,7k ≈ 9,9M; A0 50 × 65,7k ≈ 3,3M; cộng ≈ 13,2M weighted; thời gian ≤ 50 × 140,2 s + 50 × 52,4 s ≈ 9 630 s ≈ 2,7 giờ. Vì trung vị thấp hơn trung bình (có 3 lượt 6 lượt gọi ở 518k, S1 T-2), cộng dự phòng 30 % **cho cả token và thời gian**: token ≈ 17,2M; thời gian ≈ 9 630 × 1,3 ≈ 12 520 s ≈ 3,5 giờ. Phần phụ B7b (S1 T-6: B7 hai lượt gọi ≈ 80 s, A0 ≈ 15 s): token B7 99,5k × 26 + A0 33,0k × 26 ≈ 3,4M (chưa cộng dự phòng); thời gian ≤ 26 × 80 + 26 × 15 = 2 470 s ≈ 0,7 giờ, kèm dự phòng 30 % ≈ 3 210 s ≈ 0,9 giờ. **Tổng: token ≈ 20,6M (dưới trần cửa sổ 22M, sát); thời gian ≈ 3,5 + 0,9 ≈ 4,4 giờ, VƯỢT trần 3,6 giờ của `preregistration.md` §4.4(d).** Hệ quả: phần chính (≈ 3,5 giờ) vừa sát trần, **phần phụ B7b chỉ chạy khi giám đốc cho phép vượt trần 3,6 giờ hoặc khi lượt chính thực tế nhanh hơn cận trên**; mặc định cắt phần phụ (đã có ở quy tắc dừng (6)). **B7′ thực tế dự kiến rẻ hơn B7 (mục đích của B-11)**, nên đây là cận trên. Thời gian ở đây là thời gian chạy tuần tự; không gồm thời gian phân tích. **Chưa biết hạn mức credit cloud thật còn lại**: giám đốc xác nhận trước khi chạy.
- **Lịch (đề xuất).** 3/11 tối: giám đốc duyệt B-11 và chỉ tiêu B-01′. 4/11 sáng: Phòng Dev triển khai (c) (và (b) nếu duyệt), test chạy xanh; 4/11 trước 12:00: **commit khóa**. 4/11 12:00 – 5/11 06:00: chạy chính (≈ 2,7 giờ thời gian chạy, dư rộng cho lượt lỗi và chạy lại). 5/11 06:00 – 10:00: chạy phụ nếu còn. 5/11 12:00: dừng, phân tích; 5/11 14:00: bàn giao. Không lượt nào bắt đầu sau 5/11 10:00.
- **Quy tắc dừng** (tuân §4.4): (1) không dừng sớm vì kết quả, không tăng n để đuổi CI; (2) dừng cả hai nhánh khi gặp hạn mức/đăng nhập (E3); (3) dừng lô nếu ≥ 25 % lượt của một ô là lỗi hạ tầng E1/E4; (4) hết ngân sách cửa sổ thì dừng, báo n thực tế, ô thiếu đánh dấu, không đổi phép kiểm; (5) tới 5/11 12:00 chưa xong thì dừng và phân tích với n thực tế; (6) cắt phần phụ trước, không cắt A0 chính (mất ghép cặp).
- **Yêu cầu khóa.** **Trước lượt chạy đầu tiên** phải có commit chứa: tệp này (mục B-11.5), dòng §9 V4-01, `arms.json` có arm B7′, hash script phân tích (`prereg-tests.mjs`, `b7-cost-decomposition.mjs`), đầu ra bootstrap tách phương sai giữa bài/giữa lượt (điều kiện cứng, xem "Độ rộng CI dự kiến"), hash server/commit (§8). Hash commit khóa ghi vào §8 trước khi mở `runs.jsonl` mới. Phần nào ghi sau khi đã có dữ liệu phải ghi §9 và nhãn "ghi sau khi dữ liệu đã có". Chưa ai commit khóa tại thời điểm viết (3/11/2026).
- **Chất lượng khi đo.** Điểm t1–t5 chạm trần (`results-round3.md` §5 (c)): B-01′(c) sẽ "không kết luận" lần nữa nếu vẫn chạm trần. Do đó giữ chất lượng bằng test ẩn không kém hơn (biên 2 điểm %), `templateCoverage` 100 %, KPI không giảm, và báo Δ điểm mô tả; phần phụ B7b (bài chưa chắc chạm trần) là chỗ tìm tín hiệu chất lượng, ở mức mô tả.
- **Trường cần ghi thêm cho B7′** (từ S1 §Đề xuất SR): `byPhase[phase].{output,cacheRead,cacheWrite,input,wallMs,calls}`, `timing.*Ms`, `prompt.*Chars`, `routing.llm/lane`, `outputChars` theo mục, giữ `calls.jsonl`, `window/serverPort/commit` mỗi dòng. Nếu những trường này chưa có trước 4/11 thì B7′ vẫn chạy được nhưng không tách được nguồn tiết kiệm; ghi rõ trong kết quả.

**B-11.6 Giới hạn.** Không có `calls.jsonl` của server cloud (S1 §Giới hạn dữ liệu); mọi "tiết kiệm" là cận trên hoặc cận không thông tin, không phải đo. Phán quyết B-02 "không đủ dữ liệu" (S2) dựa trên 1 ca dương trong 54 lượt; không phát biểu khác. Kiểm lại: `node docs/research/scripts/consistency-check.mjs` (xem tệp bàn giao).

---

## 6. Quan hệ với đăng ký trước và các giới hạn

**Quy ước mã (R8):** cột "Bộ đo giám đốc" dùng H1–H10 của `bench/vs-claude/analyze.mjs` (hệ chính). Cột "Bản 1" dùng ĐK-P1–P9 (= H1–H9 của `preregistration.md` bản 1, đổi mã theo H_i → ĐK-P_i; **một quy ước duy nhất `ĐK-P_i` ở cả hai tệp**, để khỏi lẫn với bản vá prompt P1–P4 và mức ưu tiên SR P0/P1/P2). Ánh xạ chính thức ĐK-P↔H và giả thuyết B-01/B-02 mới do S4 chốt trong `preregistration.md` bản 2; bảng dưới chỉ là đề nghị từ phía backlog.

| Mục | Bộ đo giám đốc (hệ chính) | Bản 1 (ĐK-P_i) | Ghi chú |
|---|---|---|---|
| B-01 | H5 (`analyze.mjs:80-85`), H1, H2 (`:61-68`), H6 (`:86-91`), H10 (`:108-115`); **giả thuyết B-01 mới** (TOST ±15 % so với A0-sonnet: token có trọng số, thời gian thực, điểm; S4) | ĐK-P1–P6; ĐK-P9 (tương đương ±15 %) ánh xạ sang giả thuyết B-01 mới | Ngưỡng `k₀ × a₀` (= T* ≈ 152 s) lấy từ C7 nên **không** dùng C7 để "xác nhận" chính nó. H10 dùng `size` làm biến giải thích: xem thẩm định của S1 trước khi dùng H10 để hiệu chỉnh ngưỡng `parts` |
| B-02 | H8 (`:96-100`), H3 (`:69-75`), H7 (`:92-95`); **giả thuyết B-02 mới** (cổng chặn ca "đỏ kéo dài + bỏ sót phần việc"; S4) | ĐK-P3, ĐK-P7 (bài giữ lại t6–t8, xác nhận); KPI | Ca chuẩn để phát lại: `t5-logq.ccoding-fastlane.2` (§4.1 bước 2). Giả thuyết B-02 mới dùng quy tắc "lệnh đề bài đòi xanh còn đỏ ⇒ vòng sửa" (§4.1) và quy tắc phủ B-10 |
| **B-10** | **H8** (`analyze.mjs:96-100`) — đúng loại lỗi "requirements dropped"; phán quyết hiện chỉ dựa `formatMiss` nên chưa bắt được ca coding kiểu t5 (§5 B-10 trường 6) | ĐK-P3 (test ẩn không kém hơn) | Phát lại offline trên `results/C*/` không tốn hạn mức 5 giờ; nên chạy trước mọi vòng LLM. Chung giả thuyết B-02 mới |
| B-03…B-09 | — | — | KPI, đếm log, test đơn vị. Không cần benchtest, trừ B-03/B-07 (F1) và B-09 |

**Giới hạn và kết quả âm tính**
- N3b, N5 **không kiểm được** từ CSV; N4 kiểm gián tiếp. Phép kiểm cần dữ liệu từ API `kpi`.
- N1 là phân loại tĩnh theo văn bản lệnh (CSV có thể cắt lệnh dài; 1 lượt không giải thích được). Chưa phát lại qua hook thật.
- `tail -c` (N1c) **sai**; N2 chỉ chứng minh chắc 1/10 lượt chặn nhầm.
- Hồi quy thô ở §2 chỉ có 5 điểm, mỗi điểm 1 lượt làn nhanh; không có CI. `a₀, k₀` ước lượng trên chính C7. C8 không có Sonnet đơn (D1) nên không dùng được cho `a`.
- t2 52/60 là 1 lượt; C8 3/3 sau `c55a249` không kết luận được.
- **(R8)** B-10 và sửa §4.1 dựa trên **1 ca** (t5 C9 lượt 2). Nguyên nhân "plan hỏng một phần / `parsePlan` cắt" chưa kiểm vì `calls.jsonl` nằm trên server cloud, không có trong repo. C9 dừng giữa chừng do hạn mức (`context/c9-partial-2026-11-02.md` §1), nên tần suất của loại lỗi này chưa ước lượng được.
- **(R8)** `context/c9-partial-2026-11-02.md` §2 ghi 51 test hỏng đều thuộc nhóm tổng hợp; tạo phẩm cho thấy 37 tổng hợp + 14 CLI (§5 B-10 trường 2f). Kết luận không đổi (cả hai là đích không ai nhận).
- Số "hiệu quả kỳ vọng" ở B-02…B-10 là giả thuyết; chỉ B-01 có số đo nền, B-02/B-10 có thêm 1 ca chất lượng.
- Nếu S1 đổi số ở T-d (3) (D2), peer-reviewer sửa tại chỗ; script `lane-threshold.mjs` đọc thẳng `runs.csv`, không phụ thuộc `token-analysis.md`.
- Bảo vệ dữ liệu: tài liệu này nội bộ, không chứa DLCN hay bí mật; CSV đã thay đường dẫn bằng `<ws>/<home>/<proj>`. Đường dẫn máy cloud trong tạo phẩm C9 (`/home/claude/…`) không được chép vào tệp này. Không cần đánh giá bảo vệ dữ liệu riêng; các mục B-04, B-08 chạm biên bảo mật nên cần giám đốc duyệt và bộ test ác ý.

## 7. Tái lập

```
node docs/research/context/failures-count.mjs                     # N1–N5: đếm theo loại, vai trò, công cụ, phân loại tĩnh
node docs/research/context/failures-count.mjs --list git-read-deny  # liệt kê (đổi tên category cho nhóm khác)
node docs/research/context/failures-count.mjs --ro-other           # lượt chỉ đọc chưa giải thích
node docs/research/context/lane-threshold.mjs                      # §2: C7 Sonnet đơn so với làn nhanh, hồi quy thô, k
```
Môi trường: Node ≥ 22, không phụ thuộc ngoài. Hai script nằm ở `docs/research/context/` (thêm mới, không sửa tệp thuộc S1).

Bằng chứng R8 (B-10, §4.1 bước 2) đọc trực tiếp bằng Read/Grep, không cần script: `bench/vs-claude/results/C9/t5-logq.ccoding-fastlane.2/{ccoding-task.json,result.json,grade-hidden.tap}`, `bench/vs-claude/results/C9/t1-duration.ccoding-fastlane.3/{ccoding-task.json,result.json}`, `bench/vs-claude/analyze.mjs:96-100`, `bench/vs-claude/lib/grade.mjs:26-41`.
