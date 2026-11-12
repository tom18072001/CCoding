# Chạy lại và thẩm định V4-3f (G, P) và E4, E5′, E6 (BRIEF-19 K1, hạng mục S1)

Ngày 13/11/2026. Phân loại dữ liệu: **Nội bộ**. Không gọi LLM, không chạy benchmark, không mở `b14-step2` hay `e8-parallel`, không sửa `bench/`. Chỉ đọc tệp đã commit ở commit gốc `d1e8573`.

**Thứ tự thời gian (bằng chứng thứ tự cho S5):**
- **Commit 1** (trước khi sửa script): phần 1–5 của tệp này, các tệp `v43f-rerun/*.before.txt`, script mới `v43f-findings.mjs`. Số "trước khi sửa" ở đây.
- **Commit 2** (sửa script và test): phần 6 ghi số sau khi sửa. Mã hai commit ghi ở cuối tệp (mục 7).

## 1. Môi trường và lệnh

| Mục | Giá trị |
|---|---|
| Máy | Windows 11, Node v24.14.0 (RUNLOG của G dùng Node v22.23.4 trên Linux), `npm install` để có `typescript` |
| Commit gốc | `d1e8573` |
| Xuống dòng | Worktree dùng CRLF (`core.autocrlf=true`), nên `sha256sum` trên tệp làm việc khác RUNLOG. Băm theo blob LF (`git show HEAD:<tệp> \| sha256sum`) **khớp** RUNLOG: `g-analyze.mjs` `f0fdb520…` (bản lúc báo, có `--rebase`), `g-mutation.mjs` `2cb16cc5…` (G-b), `study-cloud/runs.jsonl` `0dcee840…`, `g-mutation.jsonl` `782dc8b0…`, `g4-survivors.json` `8a16ae33…`, `p-analyze.mjs` `c336213d…` (sau P-c), `p-extract.mjs` `6a52aac9…` (bản P-a), `bench/vs-claude/analyze.mjs` blob `7c69f438…` (đúng bản ghi ở `local-3e/RUNLOG.md`) |

| # | Lệnh | Exit | Đầu ra (LF) | So với |
|---|---|---|---|---|
| 1 | `node docs/research/analysis/g-analyze.mjs bench/vs-claude/results/g-mutation/g-mutation.jsonl --rebase bench/vs-claude/results/g-mutation/g-rebase.jsonl` | 0 (lần đầu 1: thiếu `typescript`, xem D-G2) | `v43f-rerun/g.before.txt` | `g-mutation/report.md`: **41/41 dòng giống hệt** |
| 2 | `node docs/research/analysis/p-analyze.mjs <prod-parallel.json>` | **không chạy được** (xem mục 3) | — | `p-parallel/RUNLOG.md` |
| 3 | `node docs/research/analysis/e4-analyze.mjs` | 0 | `v43f-rerun/e4.before.txt` | `gates-main/report-e4.md`: giống hệt |
| 4 | `node docs/research/analysis/e5f-analyze.mjs bench/vs-claude/results/b15f-main/runs.jsonl --subtasks bench/vs-claude/results/b15f-main/subtasks.json` | 0 | `v43f-rerun/e5f.before.txt` | `b15f-main/report.md`: giống hệt |
| 5 | `node docs/research/analysis/h6-sensitivity.mjs bench/vs-claude/results/h6-3e/runs.jsonl` | 0 | `v43f-rerun/h6-sensitivity.before.txt` | `h6-3e/report-h6-sensitivity.md`: giống hệt |
| 6 | `node bench/vs-claude/analyze.mjs <bản sao h6-3e ở thư mục tạm>` (chạy trên bản sao vì tập lệnh ghi `report.md`, `summary.csv`, `pareto.csv` vào thư mục chạy; không ghi vào `bench/`) | 0 | `v43f-rerun/h6-analyze-stdout.txt` | `h6-3e/report.md`, `summary.csv`, `pareto.csv`: giống hệt, trừ dòng `Folder:` (đường dẫn) |
| 7 | `node docs/research/analysis/v43f-findings.mjs` | 0 | `v43f-rerun/findings.before.txt` | ba phát hiện (mục 5) |

So sánh sau khi bỏ `\r`. "Giống hệt" nghĩa là mọi chữ số trong báo cáo đã commit được script tái tạo, nên mọi số in ra đều **khớp, lệch 0**.

## 2. Bảng đối chiếu từng số

### 2.1 G (đối chiếu `g-mutation/RUNLOG.md` bảng "Kết quả", và `report.md`)

| Số | Script in ra | RUNLOG / report | Lệch |
|---|---|---|---|
| Lượt có base / đủ điều kiện | 250 / 209 | 250 / 209 | 0 |
| Đột biến / lỗi thật / không phải lỗi thật | 2436 / 2097 / 339 | 2 436 / 2 097 / (339 trong report) | 0 |
| Quá hạn `npm test` / quá hạn test ẩn | 25 / 0 | 25 / 0 (report) | 0 |
| Lượt có đột biến, số bài | 203, 9 | 203, 9 | 0 |
| Lượt base chạy lại 600 s (G-a) | 0 | 0 (`g-rebase.jsonl` rỗng) | 0 |
| G-1 tất cả | 0/239 [0,0; 1,5] % | 0/239 [0; 1,5 %] | 0 |
| G-2 tất cả / A0-sonnet | 0/250 [0,0; 1,5] / 0/70 [0,0; 5,1] | 0/250 / 0/70 [0; 5,1 %] | 0 |
| G-2 B6, B7 | 0/60, 0/60 | "làn nhanh 0/60; làn đơn 0/60" | 0 |
| G-3 gộp | 1903/2097 = 90,7 % [84,3; 95,9] | 1 903/2 097 = 90,7 % [84,3; 95,9] | 0 |
| G-3 nhóm A / C | 550/601 = 91,5 % [84,9; 96,8] / 1139/1246 = 91,4 % [84,9; 96,5] | giống | 0 |
| G-3Δ | +0,8 điểm % [−4,7; +7,4], p = 0,7408 | +0,8 [−4,7; +7,4], p = 0,74 | 0 (RUNLOG làm tròn p) |
| Theo bài thấp nhất / cao nhất | c2-burst-alert 73,2 %, t2-orders 78,4 %, c5-tickets-api 83,0 % / c4-audit-chain 100 % | giống | 0 |
| Theo toán tử thấp nhất / cao nhất | CRP 82,1 % / UOI 98,3 % | giống | 0 |
| G-4 kho lỗi lọt cổng | 194 | `g4-survivors.json` có 194 phần tử | 0 |

Kiểm thêm (không có trong script): base test ẩn khớp `pass` chính thức ở **250/250** lượt (RUNLOG G-b: 250/250) và `hPass` = 239 (mẫu số G-1) khớp.

### 2.2 P (không chạy lại được; xem mục 3)

Số trong `p-parallel/RUNLOG.md` không tái tạo được từ tệp đã commit. Kiểm gián tiếp:

| Số | Cách kiểm | Kết quả |
|---|---|---|
| CP 95 % của 42/54, 6/213, 2/47 | `cp()` của `g-analyze.mjs` | [64,4; 88,0], [1,0; 6,0], [0,5; 14,5] **khớp** RUNLOG |
| Tiết kiệm 375 phút, 27,5 % | (1366 − 990) / 1366 = 27,5 %; 376 so với 375 là do làm tròn phút từng lượt | khớp ở mức làm tròn |
| 6/213 = 2,8 % | 213 = 207 gộp xong + 6 xung đột | khớp |
| Hash `p-analyze.mjs`, `p-extract.mjs` | blob LF | khớp RUNLOG |
| Các số **không do `p-analyze.mjs` tạo ra** | CP của P-1, P-3; "Theo phòng"; "so với đường găng" | không có trong script đã commit: xem D-P2 |

### 2.3 E4 (đối chiếu `gates-main/report-e4.md`; RUNLOG `gates-main` không ghi số kết quả)

| Số | Script | Report | Lệch |
|---|---|---|---|
| Dòng / `done` / không `done` | 203 / 192 / 11 | giống | 0 |
| b02 (g1, g2): lượt / dương / q̂ | 64 / 0 / 0,0 % [0,0; 5,6] | giống | 0 |
| cto (g5, g6): lượt / dương / q̂ | 64 / 0 / 0,0 % [0,0; 5,6] | giống | 0 |
| b10 (B6 × g3, g4) | 1/64 = 1,6 % [0,0; 8,4] | giống | 0 |
| Lượt sạch n; theo nguồn; test ẩn đạt | 65; E3 4, E5′ 40, E6 21; 63/65 | giống; khớp A1 (4 + 40 + 21 = 65) | 0 |
| Sạch: b02, b10, cto chặn | 0/65, 5/60, 62/65 [87,1; 99,0] | giống | 0 |
| H-O1: 0/0, McNemar 0 so với 0, p = 1,000 | | giống | 0 |
| Khám phá: chặn trên lượt đạt B7cab, B7cabO | 23/64, 1/64; 22 so với 0, p = 4,8e-7 | giống | 0 |
| Chi phí | B7cab 0,245 USD, 99.415 token; B7cabO 0,365 USD, 115.464; tỉ số USD 1,49 | giống | 0 |
| Mỗi khóa có đúng một dòng `done` (RUNLOG) | 0 khóa trùng | khớp | 0 |

### 2.4 E5′ (đối chiếu `b15f-main/report.md`; RUNLOG không ghi số kết quả)

| Số | Script | Report / §9 | Lệch |
|---|---|---|---|
| R̂ token | 0,722 [0,668; 0,790] "B1F thấp hơn" | giống | 0 |
| R̂ thời gian | 0,717 [0,667; 0,779] | giống | 0 |
| Δ điểm | −0,000 [−0,001; 0,000] | giống | 0 |
| n, cặp loại, rò rỉ, không `done` | 10/10/10/10; 0; 0; 2 | giống; A5 (không loại cặp nào) khớp | 0 |
| TB token B0F, B1F; thời gian | 1.167.070, 844.975; 836, 600 s | giống | 0 |
| Phần họp TB B0F | 10,7 % | giống (số của BRIEF) | 0 |
| Số hạng mục kế hoạch TB | B0F 5,95; B1F 5,15; 40/40 khóa có số | giống; khớp A3 (40/40) | 0 |
| Nguồn `subtasks.json` (server 7426, `ccoding-e5f\data\runs`) | | | **không kiểm được**: thư mục ngoài repo |

### 2.5 E6 (đối chiếu `h6-3e/report-h6-sensitivity.md`, `report.md`, §9 A4)

| Số | Script | Report / §9 | Lệch |
|---|---|---|---|
| A1: 7 bài / 5 bài | +0,0 pp [−0,1; 0,2] / −0,0 pp [−0,1; 0,0], nhạy: có | giống; A4 "A1: +0,0 ở 7, −0,0 ở 5" | 0 |
| A2: 7 bài / 5 bài | +0,1 pp [0,0; 0,2] / 0,0 [0,0; 0,0], nhạy: có | giống; A4 "A2: +0,1 và 0,0" | 0 |
| Δ_i từng bài, dải 1 − null | bảng 7 dòng × 2 arm | giống | 0 |
| H6 `analyze.mjs` (56 lượt, 4 dòng infra loại) | `summary.csv`, `pareto.csv`, `report.md` | giống (trừ đường dẫn) | 0 |
| Blob `analyze.mjs` | `7c69f438…` | `local-3e/RUNLOG.md:39` | 0 |

## 3. P: tại sao không chạy lại được

- Đầu vào của `p-analyze.mjs` là `prod-parallel.json`. Theo `p-parallel/RUNLOG.md` tệp này **không commit** (repo công khai; có `createdAt` nên 33/57 nhãn nối ngược được về mã nhiệm vụ), nằm trên máy giám đốc ở `ops\prod-parallel-b.json`.
- Việc đọc đường dẫn ngoài worktree bị chặn theo quy tắc nhiệm vụ, và tệp không được đưa vào repo. **Không bịa số.** Phần kiểm được: băm script (khớp), CP từ đếm (khớp), test dữ liệu giả (xanh), và đọc mã so với §9 (mục 4).
- Việc cần người có quyền: chạy `node docs/research/analysis/p-analyze.mjs <tệp> --json` trên máy giám đốc và so với RUNLOG, sau khi script sửa ở commit 2.

## 4. Đối chiếu script với §9 (bảng lệch)

Quy ước: **S** = đã sửa ở commit 2; **K** = không sửa, kèm lý do. Số dòng là của `d1e8573` (trước khi sửa).

### 4.1 G (`g-analyze.mjs`, `g-mutation.mjs` so với "Đăng ký trước V4-3f", khối G)

| Mã | Dòng mã | Câu §9 | Phát hiện | Xử lý |
|---|---|---|---|---|
| D-G1 | `g-analyze.mjs:48-61` (`bootstrap2`), `:65-74` (`deltaStat`) | G (6): "CI của Δ bằng bootstrap hai tầng (lấy lại bài, rồi lấy lại lượt trong bài)" | `bootstrap2` đưa các lượt đã rút vào một mảng phẳng, rồi `deltaStat` nhóm lại theo `r.task`. Bài bị rút 2 lần bị gộp thành **một** bài (mất bội số); bài rút 0 lần vắng. Δ\* thành trung bình trên các bài *khác nhau* được rút, không phải trên 9 lần rút. Hệ quả: phân bố bootstrap của Δ hẹp hơn một bootstrap theo cụm đúng. Recall gộp (`recall`) không bị ảnh hưởng vì cộng gộp theo lượt | **S**: gắn chỉ số lần rút vào mỗi lượt, `deltaStat` nhóm theo lần rút. Số "sau" ở mục 6 |
| D-G2 | `g-analyze.mjs:7` → `g-mutation.mjs:18-19` | Mục (7) "mã chạy lại được" (DoD) | `g-analyze.mjs` (và `e4-analyze.mjs`, `v43f-findings.mjs`) chỉ cần `rng` nhưng import cả `g-mutation.mjs`, mà tệp này import `typescript` và `bench/vs-claude/lib/grade.mjs`. Ở worktree không có `node_modules`: `ERR_MODULE_NOT_FOUND` | **S**: chép `rng` (cùng thuật toán) vào `g-analyze.mjs`; test khẳng định trùng dãy với `g-mutation.mjs` |
| D-G3 | `g-analyze.mjs:60` | G (6): "phân vị 2,5 % và 97,5 %" | Dùng `floor(0,025·(n−1))` và `ceil(0,975·(n−1))`: làm tròn ra ngoài, lệch ≤ 1 hạng trong 4000 (0,025 điểm phân vị), bảo thủ hơn nội suy | **K**: thay đổi chữ số thứ 3 ở mức không đáng kể so với độ rộng CI ≥ 11 điểm %; không đổi kết luận. Ghi ở đây |
| D-G4 | `g-mutation/RUNLOG.md` mục G-a | G-a: "ghi 4/11 lúc 19:39, trong lúc chạy, trước khi tính G-1/G-2" | Đối chiếu giờ commit: mốc khóa `f5a31dc` 19:31:56; RUNLOG trước khi chạy `4d62256` 19:32:06 **không có** chữ "G-a" (0 lần); mục G-a xuất hiện lần đầu ở `5ca04f4` 20:23:15, cùng commit với kết quả (`report.md`). Bản `g-analyze.mjs` khóa (`44c28b8f…`, blob ở `4d62256`) chưa có `--rebase`. Vậy "quyết định trước khi tính G-1/G-2" **không kiểm chứng được bằng git**, chỉ bằng lời của RUNLOG | **K**: không sửa được lịch sử. Tác động bằng 0: không có lượt base nào quá hạn 60 s (`slow` = 0, `vTimeout` = 0, `g-rebase.jsonl` rỗng), nên G-1/G-2 giống hệt có hay không có G-a. Phải ghi "không kiểm chứng được" ở S5 |
| D-G5 | `g-analyze.mjs:35-44`; `g-mutation.jsonl` | G (5) "Phụ: số lần quá hạn" | 25 đột biến quá hạn `npm test` đều là lỗi thật và được tính là "bị chặn" (đỏ). Nếu coi quá hạn là không chặn, recall = 1878/2097 = **89,6 %** (so với 90,7 %); nếu loại khỏi cả tử số lẫn mẫu số: 1878/2072 = 90,6 %. §9 (2) định nghĩa "đỏ = thoát ≠ 0 hoặc quá 60 s", nên cách tính đúng đăng ký | **K**: đúng §9 (2). Báo độ nhạy 89,6 % ở đây |
| D-G6 | `g-mutation.jsonl` | G (4): "mỗi lượt tối đa 12 vị trí" | 203 lượt đều có đúng 12 đột biến. **6 lượt đủ điều kiện (`t1-duration__B6__r1,2,3,5,6,7`) có 0 vị trí đột biến** (1 tệp sản phẩm, `sites` = 0), nên "209 đủ điều kiện" nhưng chỉ 203 lượt vào G-3. Không đổi G-1/G-2. Nhưng 6/6 lượt này là cả bài `t1-duration` của B6 | **K**: ghi như phạm vi: `t1-duration` vắng ở nhóm C nhánh B6 (các arm khác vẫn có). Đã thể hiện ở "203 lượt" |
| — | `g-mutation.mjs:27-61` | G (4) toán tử | **Khớp**: ROR (4 loại đổi), EQ, AOR (+↔−, *↔/, %→*), LCR, UOI (bỏ `!`), CRP (n→n+1, 0→1), COND (`if`, `while`, `?:`) | — |
| — | `g-mutation.mjs:71-75,159` | G (4) lấy mẫu | **Khớp**: không lặp, 12/lượt, hạt `20261104\|<key>` | — |
| — | `g-mutation.mjs:21-25,155` | G (4) đủ điều kiện, hạn giờ | **Khớp**: base `npm test` xanh, base test ẩn đạt, ≤ 30 s; hạn 30 s/tệp, 60 s/bộ; loại `t4-perf` | — |
| — | `g-analyze.mjs:76-91` | G (6) hoán vị | **Khớp**: xáo nhãn arm giữa các lượt trong bài (giữ cỡ nhóm), M = 10000, hai phía, p = (1 + #≥)/(M + 1); chỉ bài có lỗi thật ở cả hai nhóm | — |
| — | `g-analyze.mjs:9-11,106` | G (5) nhóm | **Khớp**: A = {A0-sonnet}, C = {B0, B5, B6, B7}; A1, A2 chỉ theo arm | — |
| — | `g-analyze.mjs:14-21` | G (6) CP | **Khớp** (CP bằng chia đôi CDF nhị thức; kiểm với `cp` ở test) | — |

### 4.2 P (`p-analyze.mjs` so với khối P)

| Mã | Dòng mã | Câu §9 | Phát hiện | Xử lý |
|---|---|---|---|---|
| D-P1 | `p-analyze.mjs:67-68` | P (3): "số nhiệm vụ kết thúc còn lệnh kiểm tra đỏ" | `endRed`, `endChecked`, `endNewRed`, `baselineRed`, `endDeniedOnly` đếm theo **lượt phòng** (54 lượt, 53 nhiệm vụ), không theo nhiệm vụ như đã đăng ký và như RUNLOG ghi ("11/47 nhiệm vụ"). Một nhiệm vụ có 2 lượt phòng bị đếm hai lần. Các đếm khác (`merges`, `conflictMsgs`, `serialMsgs`) đã dùng `uniq` theo nhiệm vụ, nên đây là bất nhất nội bộ | **S**: dùng `uniq(rs)` cho năm đếm này. **Không xác nhận được số thật**: dữ liệu không có trong repo (mục 3) |
| D-P2 | `p-analyze.mjs:73-84` (báo cáo) | P (3): chỉ P-1, P-2, P-3, "báo tách theo `isolation`" | RUNLOG báo thêm (i) CP 95 % cho P-1, P-3, (ii) "Theo phòng" (Dev so với Nghiên cứu), (iii) "so với đường găng". Script đã commit **không in** (i) và (ii); (iii) chỉ có hàm `criticalPathMs` nhưng báo cáo không dùng. Các số này sinh ra bằng thao tác ngoài script, không tái lập được, và **không có trong §9** (thêm sau khi thấy kết quả, không ghi ở P-a/P-b/P-c) | **S**: đưa CP, theo phòng và đường găng vào báo cáo, ghi nhãn "ngoài đăng ký, mô tả". Đây là bổ sung công cụ, không đổi số đã báo |
| D-P3 | `p-extract.mjs` (diff `f5a31dc`…`HEAD`) | P-a: "làm đổi thước đo nào ngoài lệnh đỏ không?" | **Không.** Diff chỉ thêm ba trường (`checksBaseline`, `checksNewRed`, `checksDenied`); P-1, P-2, mốc thời gian, đếm gộp/xung đột không đổi. Lưu ý: `checksNewRed` và `checksBaseline.red` **loại lệnh bị chặn theo chính sách (`denied`)**, còn `checksLatest.red` thì tính cả lệnh đó; P-a ghi ba trường nhưng không nói rõ quy tắc loại này | **K**: không đổi thước đo chính. Ghi để S5 thêm vào P-a |
| D-P4 | `p-analyze.mjs:44-46` (P-c) | P (3) | Đã sửa ở `f9ed4ed`…: phụ thuộc bắc cầu; có test. Khớp | — |
| — | `p-analyze.mjs:39-41,10-21` | P (2), P-1 | **Khớp**: đơn vị = lượt phòng ≥ 2 hạng mục đủ hai mốc và thời lượng > 0; hợp khoảng; `maxConcurrent` coi nối đuôi không chồng | — |
| — | `p-extract.mjs:13,15` | P (1) | Chỉ `fetch` GET trên API (không có `fs` đọc `data/`); chỉ đếm ba mẫu `PATTERNS` | — |

### 4.3 E4 (`e4-analyze.mjs` so với E4 (3)–(8), A1, A2)

| Mã | Dòng mã | Câu §9 | Phát hiện | Xử lý |
|---|---|---|---|---|
| D-E4-1 | `e4-analyze.mjs:32,36,100` | E4 (6): CI bootstrap cụm theo `runId` của `agreement.mjs`, mỗi cổng một CSV, `--label gate`; kèm CP | Script chỉ tính Clopper–Pearson cho q̂ (64 lượt) và không có bootstrap cụm. Recall không ước lượng được (0 < 10 dương), nên phần bootstrap không cần; q̂ = 0/64 thì bootstrap cho [0; 0] suy biến, CP rộng hơn và bảo thủ. §9 không nêu sai lệch này | **K**: không đổi kết luận (không có recall). S5 nên ghi 1 dòng: "q̂ chỉ CP, không bootstrap cụm" |
| D-E4-2 | `e4-analyze.mjs:62` | E4 (7): "có hại" (chặn nhầm B7cabO > B7cab + 0,10 sau ≥ 20 lượt sạch) | Ghi "không đánh giá được: E4 không có lượt sạch của B7cab/B7cabO". Đúng theo định nghĩa "sạch" (bài ngoài g1–g6). Nhưng ở bảng khám phá A2, B7cabO chặn **ít hơn** B7cab trên lượt có test ẩn đạt (1/64 so với 23/64), nên hiệu số có dấu "có lợi", không "có hại" | **K**: chỉ nêu |
| D-E4-3 | `e4-analyze.mjs:42` | A1 | Lượt sạch lấy 40 lượt B0F/B1F của E5′ thay cho E5; **khớp A1** (65). Ý nghĩa: 40/65 lượt sạch là cùng hai bài (`l1-modules`, `l2-chain`) và cùng làn ép `full`; xem phát hiện 1 | **K** |
| — | `e4-analyze.mjs:21,31,34,38` | E4 (8) | **Khớp**: chỉ `done`, không `excluded`, không `leak`; cổng `null` bỏ khỏi mẫu cổng đó; dương b02 theo `checksRed > 0`, cto theo `pass === false`, b10 theo bài; MIN_POS = 10 | — |
| — | `e4-analyze.mjs:51-52` | E4 (6) McNemar | **Khớp**: ghép cặp theo (bài, `rep`), McNemar chính xác, 64 cặp | — |
| — | E4 (8) "thay lượt tối đa 2 mỗi ô" | | Dòng không `done` (11) đều thuộc **cùng khóa** và được runner chạy lại đúng khóa (`g2-cart-coupon__B7cab__r1`: 1 `failed` + 7 `quota`; `g5…B7cabO__r12` 1 `quota`; `g4…B6__r1`, `r5` 2 `failed`); mỗi khóa đúng một dòng `done`. Không có lượt thay khóa nên không chạm trần 2 | — |

### 4.4 E5′ (`e5f-analyze.mjs` so với E5′ (5)–(8), A3, A5)

| Mã | Dòng mã | Câu §9 | Phát hiện | Xử lý |
|---|---|---|---|---|
| D-E5-1 | `e5f-analyze.mjs:29` | E5′ (6): "CI 90 %" | Chỉ số phân vị `floor(0,05·4000)` = 200 và `floor(0,95·4000)` = 3800: cận dưới là phân vị 5,00 %, cận trên là phân vị 95,03 %. Không đối xứng, lệch 1 hạng. Đã biết ở A-6 (`lib/stats.mjs` nêu rõ) | **K**: lệch 0,025 điểm phân vị; để các số đã báo giữ nguyên |
| D-E5-2 | `e5f-analyze.mjs:33-36` | E5′ (8), A5 | Chỉ loại cặp khi B0F thiếu `discuss`. Dòng `excluded` trong `done` bị bỏ lặng lẽ và không đếm vào báo cáo (khác `leak`, `notDone`). Ở dữ liệu này `excluded` = 0 nên không ảnh hưởng | **K**: không có số nào bị ảnh hưởng; ghi |
| — | `e5f-analyze.mjs:13,45` | E5′ (6) | **Khớp**: R̂ = exp(TB theo bài của ln(TB B1F / TB B0F)), bootstrap hai tầng (bài rồi lượt), 4000, hạt 20261104, CI 90 %; `bootstrapRatio` của `prereg-tests.mjs`; không p; "CI chứa 1 → không phân biệt được" | — |
| — | `e5f-analyze.mjs:36-37` | E5′ (8), A5 | **Khớp**: loại cả cặp (bài, `rep`); độ nhạy không loại (cho cùng số vì loại 0) | — |
| — | `e5f-analyze.mjs:58` | A3 | **Khớp** (40/40 khóa có số hạng mục). Nguồn gốc `subtasks.json` ngoài repo, **không kiểm được** | — |

### 4.5 E6 (`h6-sensitivity.mjs` và `analyze.mjs` so với "Phân tích độ nhạy mô tả cho H6", E6 (5)–(8), A4)

| Mã | Dòng mã | Câu §9 | Phát hiện | Xử lý |
|---|---|---|---|---|
| D-E6-1 | `h6-sensitivity.mjs:11,24`; `e5f-analyze.mjs:20-30` | "B = 4000, hạt 20261102 (§2.5)" | Độ nhạy dùng `rng` của `prereg-tests.mjs` (mulberry32 từ hạt số) với `bootstrapDiff`, còn H6 chính (`analyze.mjs`) dùng `mulberry32` của `lib/stats.mjs` và nội suy phân vị; cùng hạt nhưng khác dãy và khác cách lấy phân vị. Nên CI độ nhạy 7 bài (A1 [−0,1; 0,2] pp, 90 %) không trùng từng chữ số với CI của `analyze.mjs` (B0 − A1: [−0,3; +0,1] pp, bootstrap 95 %). Khác mức và dấu, nên không so trực tiếp. Không đổi kết luận (cả hai trong ±5 pp) | **K**: độ nhạy là mô tả, §9 cho phép "90 % hoặc 95 %" |
| D-E6-2 | `h6-sensitivity.mjs:27-28` | "(iii) cờ nếu Δ̂ đổi phía so với 0 hoặc CI đổi vị trí so với ±0,05" | Cờ bật chỉ vì dấu của Δ̂ (±0,0 pp: |Δ̂| < 0,1 pp, dung sai 1e-12), nên cờ "có" ở cả A1 và A2. **Khớp chữ §9**; A4 đã ghi độ lớn | **K** |
| D-E6-3 | `h6-sensitivity.mjs:24` | "tính lại trên 5 bài" | Độ nhạy không áp quy tắc trần (bài ≥ 0,99 bị loại khỏi tương đương ở H6 chính). Đúng như §9 (chỉ bỏ hai bài sàn cao) | **K** |
| — | `h6-3e/RUNLOG.md`; `analyze.mjs` | E6 (9) | **Khớp**: 56 lượt, 4 dòng infra loại, blob `analyze.mjs` đúng bản ghi | — |

## 5. Ba phát hiện tính lại

Đầu ra nguyên văn: `v43f-rerun/findings.before.txt` (lệnh `node docs/research/analysis/v43f-findings.mjs`). Đơn vị lấy mẫu thực sự của mọi CP dưới đây là bài và phiên chạy, không phải lượt: CP coi lượt độc lập nên **quá hẹp**.

### 5.1 CTO chặn 62/65 lượt sạch

- **Số gốc khớp:** 62/65, CP 95 % [87,1; 99,0]. Test ẩn đạt 63/65. Nhãn "sạch" = bài ngoài g1–g6, không phải "sản phẩm đúng": 2/65 lượt không đạt test ẩn (CTO chặn cả 2). Trên 63 lượt đạt: chặn 60/63 [86,7; 99,0].
- **Tách theo bài, cỡ bài và nguồn** (cỡ bài lấy từ trường `size` của dòng; CP 95 % từng ô):

| Cỡ bài | n | CTO chặn | CP 95 % |
|---|---|---|---|
| ≤ 4 (`t1-duration` 1, `t4-perf` 1, `t2-orders` 4, `t5-logq` 4) | 12 | 10 | [51,6; 97,9] |
| 5–6 (`l1-modules` 5, `t3-api` 6) | 28 | 27 | [81,7; 99,9] |
| ≥ 7 (`l2-chain` 7) | 25 | 25 | [86,3; 100] |

  Chi tiết 16 ô (bài × nguồn × arm × làn) ở `findings.before.txt`. Ba lượt không bị chặn: `t2-orders` B0 làn nhanh 1/1 không chặn, `t2-orders` B0 làn đơn 1/2 không chặn, `t3-api` B0 làn nhanh 1/3 không chặn.
- **Đọc:** hai bài `l1-modules` và `l2-chain` chiếm 50/65 lượt và bị chặn **50/50**; năm bài còn lại bị chặn 12/15 (3 lượt không chặn: `t2-orders` 2, `t3-api` 1). Mẫu lệch về hai bài và về làn đầy đủ ép (E5′: 40 lượt, 62 % mẫu).
- **Nhiễu nhận dạng:** mọi lượt sạch đều thuộc họ B0/B1/B0F/B1F, còn E4 dùng B7cab, B7cabO, B6 trên bài g. Trên lượt có test ẩn đạt ở E4, CTO chặn: B7cab 23/64 [24,3; 48,9], B7cabO 1/64, **B6 23/64** (g3 19/32, g4 4/32). Không có arm nào có ở cả hai tập, nên không thể suy "CTO chặn nhiều vì bài lớn" hay "vì cấu hình B0".
- **Kết luận được phép:** trong mẫu này CTO (B0/B0F/B1F) gần như luôn từ chối nghiệm thu các bài có size ≥ 5 dù test ẩn đạt; không thể nói chặn nhầm là do cỡ bài, do arm hay do đề bài. Không tuyên bố tỉ lệ cho quần thể bài. Đây là "chưa đạt" của CTO, nhiệm vụ vẫn giao kết quả (chú thích của báo cáo E4).

### 5.2 B7cab chặn 23/64 so với B7cabO chặn 1/64 (giữ nhãn **khám phá**)

| Bài | B7cab chặn/đạt | B7cabO chặn/đạt | chỉ Sonnet chặn | chỉ Opus chặn |
|---|---|---|---|---|
| g1-slug-dedupe | 10/16 | 1/16 | 9 | 0 |
| g2-cart-coupon | 12/16 | 0/16 | 12 | 0 |
| g5-median-stats | 0/16 | 0/16 | 0 | 0 |
| g6-range-merge | 1/16 | 0/16 | 1 | 0 |
| Gộp | 23/64 [CP 24,3; 48,9] | 1/64 [0,0; 8,4] | 22 | 0 |

- McNemar chính xác 22 so với 0: p = 4,8e-7 (khớp). Nhãn **khám phá** giữ nguyên (A2): không có trong (5)/(6), ngoài họ Holm, không vào kết luận chính. `p` chỉ mô tả.
- Hiệu ứng tập trung ở **hai bài** (g1, g2: 21 trong 22 lần bất đồng); `g5` không có bất đồng nào. Nên không nói "Opus nghiêm ngặt hơn nói chung".
- 64/64 lượt mỗi arm đều đạt test ẩn, nên chặn = chặn nhầm theo nhãn test ẩn, nhưng nhãn đó không đo "bản kế hoạch/diff có đạt đề bài", và chạy ở E4a trong cùng phiên bản CLI 2.1.312.
- Chi phí đi kèm: B7cabO 0,365 so với 0,245 USD/lượt (×1,49).

### 5.3 R̂ E5′ = 0,722: tách họp khỏi số hạng mục kế hoạch

Tất cả cùng cách tính: tỉ số B1F/B0F, TB hình học theo bài, CI 90 % hai tầng, 4000, hạt 20261104 (n = 10 mỗi ô, 2 bài).

| Phép tính | R̂ | CI 90 % |
|---|---|---|
| Token có trọng số (như báo cáo) | 0,722 | [0,668; 0,790] |
| Bỏ token `discuss` + `finalize` khỏi B0F | 0,807 | [0,746; 0,884] |
| Số hạng mục kế hoạch (không phải token) | 0,865 | [0,805; 0,924] |
| Token (gồm họp) trên mỗi hạng mục | 0,834 | [0,753; 0,922] |
| Token không họp trên mỗi hạng mục | 0,933 | [0,849; 1,028] |
| Token pha `execute` | 0,789 | [0,725; 0,865] |

- **Phần của riêng họp:** B0F có 10,7 % token ở `discuss` + `finalize`, nên nếu họp là nguồn duy nhất thì R̂ ≈ 0,893. Bỏ phần họp ra khỏi B0F: 0,722/0,807 = **0,895** (khớp).
- **Phần do số hạng mục:** 5,15 so với 5,95 (0,865). Theo bài: `l1-modules` 6,1 so với 5,4; `l2-chain` 5,8 so với 4,9.
- **Còn lại:** token không họp trên mỗi hạng mục 0,933 (CI chứa 1).
- **Ba thừa số** (gần đúng, vì tỉ số các trung bình không nhân đúng tuyệt đối): 0,895 (họp) × 0,865 (số hạng mục) × 0,933 (mỗi hạng mục) = 0,722. Tức mức giảm 27,8 % gồm khoảng 10 % do bỏ họp, khoảng 13 % do kế hoạch ít hạng mục hơn, khoảng 7 % còn lại không phân biệt được với 0.
- **Theo pha** (TB B1F/B0F): `execute` 0,790, `synthesize` 0,796, `accept` 0,934, `plan` 1,041, `route` 1,003. `discuss` và `finalize` về 0 (122.476 token TB ở B0F).
- **Cảnh báo:** số hạng mục là **biến trung gian** (kế hoạch được chốt sau họp), không phải biến nhiễu độc lập; mô tả này chỉ cho biết phần tiết kiệm đi qua kênh nào, không phải ước lượng nhân quả. Không chứng minh "bỏ họp làm kế hoạch ít hạng mục hơn" (n = 10 mỗi ô, 2 bài). Điểm test ẩn hầu như không đổi (Δ −0,000), nhưng nhiệm vụ gần trần.
- **Nên báo:** R̂ = 0,722 là tổng ba thứ. Chỉ khoảng 10 % đến từ token của chính cuộc họp. Câu "bỏ họp tiết kiệm 28 % token" nên đi kèm "phần lớn qua kế hoạch ngắn hơn".

## 6. Sau khi sửa (commit 2)

_(Điền sau khi sửa script; xem phần dưới.)_

## 7. Mã commit

- Commit 1 (trước khi sửa): _(điền)_
- Commit 2 (sửa và test): _(điền)_
