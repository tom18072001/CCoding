# Kế hoạch chạy bộ đo vs-claude theo cửa sổ hạn mức 5 giờ (2/11 → 5/11/2026)

> Hạng mục S2 (R7) · data-scientist · phân loại dữ liệu: internal. Chỉ đọc mã và `results/`; chưa chạy lượt LLM nào. Mọi con số truy được về tệp hoặc lệnh ở §7 và Phụ lục A.

## Tóm tắt

- **Chưa có dữ liệu thí điểm của bộ đo mới:** `bench/vs-claude/results/pilot1/` **có** nhưng chỉ chứa `config.json` (cấu hình, 1 113 byte; kiểm bằng `ls -la`), **không có** `runs.jsonl` hay lượt chạy nào, nên không đo được chi phí của bộ đo mới. Chi phí của A1, A2, B1–B5, làn nhanh trên 13 bài mới là **ngoại suy** từ C1–C9 (chỉ có t1–t5, hệ Claude Code và CCoding); giả định ghi ở §1.2.
- **Quy đổi:** 1 cửa sổ ≈ **25,1 triệu token có trọng số** ≈ **61,7 USD** ≈ **4,03 giờ wall-sum** (96 lượt trong `runs.csv` bắt đầu từ 2/11 02:00 UTC, trước khi chạm hạn mức lúc 14:14). Mỗi cửa sổ xếp tối đa **22 triệu** và **3,6 giờ wall-sum**, đã gồm `--judge` và `pairwise`.
- **Kết quả xếp lịch:** Nhánh 1 (bộ hiện tại, 9/13 bài chạy được) xong trong **5 cửa sổ**. Nhánh 2 (sau khi Phòng Dev merge) cần ≈ 91 triệu cho phần ưu tiên: vừa **5 cửa sổ**. Toàn bộ danh sách (thêm H7 mở rộng, A0-opus, B3) ≈ 143 triệu ≈ 6,5 cửa sổ, nên các mục đó **không đạt trước 5/11** ở Nhánh 2. Cửa sổ 6 (5/11) chỉ là dự phòng.
- **Không đạt trước 5/11 dù có đủ cửa sổ:** H8, H9, H10 (do thiết kế phép kiểm, không do hạn mức) và B-02 kiểm chứng thống kê. H7 không đạt ở Nhánh 2. B-01 trên arm làn nhanh hiện có **đã dự đoán không tương đương** (token ×4,09, thời gian ×2,20 so với A0-sonnet, C7+C9).
- **Bốn cảnh báo vận hành** (đọc §3.0 và §5.0 trước khi chạy): (1) lượt hỏng vì hạn mức vẫn bị `run.mjs` coi là "đã xong" và bị bỏ qua khi chạy lại; (2) `analyze.mjs` tính cả lượt hỏng với điểm 0; (3) 4 bài `a1,l1,l2,r1` lỗi ENOENT cho mọi arm; (4) `pairwise.mjs` bỏ qua cặp mới nếu `pairwise.jsonl` đã có `task#rep` đó.
- **Đợt 3e (sau D9, §5.4) — chỉ chạy khi giám đốc đã duyệt:** E1–E3 chạy trên cloud trước 5/11 14:59, gồm 34 lượt `run.mjs` và 7–8 lượt `claude -p`, ≈ 22 USD, ≈ 2,5 giờ máy. E4–E6 chạy local bằng hạn mức gói, ≈ 139–181 lượt, ≈ 128–149 USD, ≈ 12–13,9 giờ máy. Các số này cộng từ bảng BRIEF-14, quy giá Sonnet. E2 chỉ chạy khi §9 `V4-3e-*` đã commit; E4 chỉ chạy khi N đã chốt bằng công thức §9.

## Tệp đã lưu

- `docs/research/run-plan.md` (tệp này). Không sửa `src/`, `bench/`, `results/`. Mô hình chi phí ở Phụ lục A (chỉ một tệp theo phạm vi hạng mục; bản chạy được nằm tạm ngoài repo).

## Dữ liệu

| Nguồn | Dùng để | Ghi chú |
|---|---|---|
| `bench/vs-claude/results/runs.csv` (115 dòng) | thời gian, token, USD, điểm test ẩn, ngày chạy | cột `system` ∈ {`claude`, `claude-sonnet`, `ccoding`, `ccoding-fastlane`, `ccoding-fast`, `ccoding-sonlead`, `ccoding-new`}; bộ cũ, chỉ t1–t5 |
| `calls.csv` (310), `phases.csv` (296) | không dùng cho số liệu kế hoạch | — |
| `results/selftest/` | oracle/null | tạo trên cloud khi `repo/` đủ; trong worktree này 4 bài lỗi (§7) |
| `docs/research/context/c9-partial-2026-11-02.md` | mốc 4,5 giờ, 429 lúc 14:14, mở lại 16:50 | |
| `arms.json`, `run.mjs`, `analyze.mjs`, `pairwise.mjs`, `lib/*.mjs` | cờ, khả năng chạy tiếp, phép kiểm | dẫn dòng ở nơi dùng |

Ánh xạ tên hệ (dùng để ước lượng): `claude-sonnet` ≈ **A0-sonnet**; `claude` (Opus) ≈ **A0-opus**; `ccoding` (14e2ec6, C1) ≈ B0 **bản cũ**; `ccoding-fastlane` ≈ **FL** (làn nhanh, sau `c55a249`). Đây là giả định tương ứng, không phải cùng cấu hình.

## Giao thức đánh giá

Đây là kế hoạch ước lượng, không có phép kiểm giả thuyết nào được chạy. Sức mạnh thống kê (§4) dùng n = 2(z₁₋α/₂ + z₁₋β)²σ²/Δ² như `harness/stats.mjs` `requiredRuns` (dòng 177); TOST dùng n = 2σ²(z₁₋α + z₁₋β/₂)²/m². σ lấy từ C5–C9 khi có; ngược lại là **giả định**, ghi rõ ở ô tương ứng.

---

## 1. Ước lượng chi phí mỗi lượt

Đơn vị: **token có trọng số** = input + 1,25 × cache write + 0,1 × cache read + 5 × output (README "Fairness rules"; `lib/claude.mjs:15`); k = nghìn. §1.1 là số đo từ `runs.csv` (status `done`); §1.2 là giả định.

### 1.1 Số đo được (bộ cũ t1–t5)

| Hệ | n | Thời gian trung vị (p10–p90) | Token có trọng số trung vị (p10–p90) | USD trung vị | σ log(thời gian) trong ô | σ log(token) trong ô |
|---|---|---|---|---|---|---|
| claude-sonnet (A0-sonnet) | 36 | 71 s (43–165) | 90k (73k–208k) | 0,19 | 0,14 | 0,10 |
| ccoding-fastlane (FL) | 40 | 156 s (104–247) | 368k (232k–551k) | 0,83 | 0,29 | 0,24 |
| ccoding (B0 cũ, C1) | 10 | 405 s (146–479) | 536k (264k–814k) | 1,44 | — | — |
| claude (A0-opus) | 24 | 197 s (93–270) | 173k (109k–260k) | 0,72 | 0,14 | 0,15 |

Theo bài (trung vị thời gian s / token k): A0-sonnet t1 65/90, t2 42/77, t3 105/170, t4 68/75, t5 165/208 (n = 7–8 mỗi bài). FL t1 116/300, t2 127/339, t3 221/533, t4 134/254, t5 177/507. B0 cũ t1 346/494, t2 146/264, t3 479/814, t4 569/536, t5 421/892 (n = 2 mỗi bài).

**Tỉ lệ FL/A0-sonnet** (trung vị toàn bộ): token ×4,09 · thời gian ×2,20 · USD ×4,47. **B0 cũ/A0-sonnet cùng bài:** token ×4,3–5,5, thời gian ×2,6–5,3. Chất lượng: A0-sonnet đạt test ẩn **1,000** (36/36 lượt, không rớt test); FL **0,987** (4/40 lượt < 1,0; 2/40 < 0,9; sd 0,059).

### 1.2 Ngoại suy cho 13 bài mới và các arm chưa có dữ liệu

Cơ sở A0-sonnet theo bài (k token / s): c1 90/65, c2 80/45, c3 170/105, c4 130/90, c5 210/165 (theo t1–t5 cùng số phần; c4 là nội suy); l1 30/30, l2 40/40, l3 50/45, l4 50/45, s1 80/90, a1 50/60, r1 70/90, re1 100/120. **Các bài không phải coding là giả định** (không có số đo).

| Arm | Hệ số token × A0 (sàn) | Hệ số thời gian × A0 (sàn) | Cơ sở | Độ tin cậy |
|---|---|---|---|---|
| A0-sonnet | 1 | 1 | đo (t1–t5) | cao cho coding, thấp cho bài khác |
| FL | 3,1 (250k) | 1,75 (120 s) | đo C7+C9: 387k/155 s so với 124k/89 s (t1–t5) | trung bình (chỉ t1–t5) |
| B0 | 5 (300k) | 4,5 (200 s) | đo B0 cũ (14e2ec6) ×4,3–5,5; **bản hiện tại chưa đo** | thấp–trung bình |
| B5 | 2,5 (150k) | 2 (100 s) | **giả định**: một thành viên Sonnet qua CCoding, nhẹ hơn FL | thấp |
| A1 | 1,6 | 1,8 | **giả định**: thêm bước lập kế hoạch và tự review (`PROCESS_SUFFIX`, `lib/claude.mjs:6`) | thấp |
| A2 | 3,3 | 3,3 | 3 ứng viên tuần tự + bộ chọn (`run.mjs:116`) | trung bình (cấu trúc) |
| A0-opus | 3,8 (quy theo USD) | 2,2 | đo `claude`/`claude-sonnet` cùng bài: token ×1,2–2,2, USD ×3,8, thời gian ×1,5–3,2 | trung bình |
| B3 (toàn Opus) | 12,5 (quy theo USD) | 5,8 | **giả định**: B0 × 2,5 theo USD | thấp |

Arm dùng Opus được **quy token theo USD** vì chưa biết hạn mức tính theo token hay giá; nếu tính theo token thô thì chi phí A0-opus thấp hơn khoảng 2,4 lần. Giá mỗi triệu token của các arm Sonnet gần nhau (2,1–2,7 USD), nên hai cách tính chỉ khác nhau ở A0-opus và B3, hai arm xếp cuối.

Chi phí phụ (**không có số đo, giả định**): `--judge` (Opus, một lượt gọi mỗi lượt chấm, chỉ a1 và r1): 30k + 30 s. `pairwise` (2 thứ tự mỗi cặp, chỉ r1, a1, re1; `pairwise.mjs:15`): 85k + 50 s mỗi cặp.

### 1.3 Chi phí mỗi lượt theo arm × nhóm bài (kết quả mô hình Phụ lục A)

Trung bình theo nhóm, k token quy đổi / giây:

| Arm | coding (c1–c5) | t1–t5 | logic (l1–l4) | s1 | a1 | r1 | re1 |
|---|---|---|---|---|---|---|---|
| A0-sonnet | 136k / 94 | 124k / 89 | 43k / 40 | 80k / 90 | 50k / 60 | 70k / 90 | 100k / 120 |
| FL | 422k / 174 | 390k / 167 | 250k / 120 | 250k / 158 | 250k / 120 | 250k / 158 | 310k / 210 |
| B0 | 680k / 423 | 620k / 403 | 300k / 201 | 400k / 405 | 300k / 270 | 350k / 405 | 500k / 540 |
| B5 | 340k / 190 | 310k / 181 | 150k / 100 | 200k / 180 | 150k / 120 | 175k / 180 | 250k / 240 |
| A1 | 218k / 169 | 198k / 160 | 68k / 72 | 128k / 162 | 80k / 108 | 112k / 162 | 160k / 216 |
| A2 | 449k / 310 | 409k / 294 | 140k / 132 | 264k / 297 | 165k / 198 | 231k / 297 | 330k / 396 |
| A0-opus | 517k / 207 | 471k / 196 | 162k / 88 | 304k / 198 | 190k / 132 | 266k / 198 | 380k / 264 |
| B3 | 1700k / 545 | 1550k / 519 | 750k / 261 | 1000k / 522 | 750k / 348 | 875k / 522 | 1250k / 696 |

**Khoảng:** arm có số đo dùng p10–p90 của §1.1 (≈ ×0,6–×1,5 quanh trung vị). Arm ngoại suy: **khoảng cho kế hoạch ×0,5 đến ×2** quanh giá trị trên (giả định; không đủ dữ liệu để hẹp hơn). Hệ quả: cửa sổ có B5/A1/B3 có thể lệch ±50 %; **đo lại sau mỗi cửa sổ** (§3.0) trước khi xếp cửa sổ kế tiếp.

---

## 2. Quy đổi một cửa sổ hạn mức

| Đại lượng | Giá trị | Nguồn |
|---|---|---|
| Mốc dùng | ≈ 4,5 giờ "dùng" đến 429 lúc 14:14 ngày 2/11; mở lại 16:50 | `context/c9-partial-2026-11-02.md` §1 |
| Lượt trong `runs.csv` có `started` ≥ 2026-11-02T02:00Z | 96 lượt (C2–C9) | `runs.csv` |
| Tổng wall-sum | **4,03 giờ** | cộng `wall_s` |
| Tổng USD | **61,7** | cộng `cost_usd` |
| Tổng token có trọng số | **25,1 triệu** | công thức §1 |
| 1 cửa sổ ≈ | **25 triệu token ≈ 62 USD ≈ 4,0 giờ wall-sum** | ba số trên |
| Xếp tối đa mỗi cửa sổ | **22 triệu** và **3,6 giờ wall-sum** (= 4/4,5 của mốc) | quyết định kế hoạch |

Giới hạn của phép quy đổi (giả định):

1. **Chỉ một điểm dữ liệu.** Chưa biết hạn mức tính theo token, USD hay giờ; ở bộ Sonnet ba cách cho kết quả gần nhau, nên kế hoạch dùng cả hai ngưỡng (22 triệu **và** 3,6 giờ).
2. `runs.csv` **không có** 4 lượt hỏng vì 429 (đã chuyển ra ngoài), lượt `--judge`/`pairwise`, và việc giám đốc dùng CCoding cùng tài khoản. Vì vậy 25 triệu có thể là cận **dưới** của dung lượng thật, nhưng nếu giám đốc dùng song song thì phần còn lại thấp hơn. **Cần giám đốc xác nhận không dùng CCoding trong cửa sổ chạy** (R1, §8).
3. C9 chạy hai luồng song song: 39 lượt trong 40 phút thực, wall-sum 1,30 giờ. Kế hoạch giả định **một luồng tuần tự** (đúng khuyến cáo "máy rảnh" của README, và cần để `wallSec` dùng được cho H5). Hai luồng rút ngắn thời gian thực nhưng làm nhiễu `wallSec`.

**Lịch cửa sổ giả định** (cloud chạy không người trực, chưa kiểm khả thi): W1 từ 2/11 16:50; W2, W3 ngày 3/11; W4, W5 ngày 4/11; W6 sáng 5/11 chỉ nếu credit chưa hết hạn. W1–W5 coi là chắc, W6 là dự phòng. Nếu chỉ có 3 cửa sổ: Nhánh 1 vẫn đủ H1, H2, H3, H5, H6; Nhánh 2 đủ H1, H2, H3, H5 và chưa có H4, H6, B-01.

---

## 3. Hàng đợi arm × bài × lượt theo cửa sổ

Quy ước: R9 = `c1,c2,c3,c4,c5,l3,l4,s1,re1`; N4 = `a1,l1,l2,r1` (cần sửa `repo/`); T5 = `t1,t2,t3,t4,t5` (cần `task.json`); R13 = R9 + N4. `FL` là tên tạm của arm làn nhanh; dùng đúng tên Phòng Dev đặt trong `arms.json`. M = triệu token quy đổi, h = giờ wall-sum (mô hình §1.3, Phụ lục A). **Mọi cửa sổ ghi vào cùng một thư mục `bench/vs-claude/results/s2`**: `run.mjs` bỏ qua khóa đã xong (`run.mjs:64`, `:159`), `analyze.mjs` và `pairwise.mjs` thấy mọi arm.

Thứ tự theo ưu tiên của đề bài: A0-sonnet, B0, B5, làn nhanh; rồi A1, A2 (H6); A0-opus và B3 sau cùng.

### 3.0 Quy tắc chung mỗi cửa sổ

- **Trước khi chạy:** `node dist/cli.js serve` đang chạy nếu có arm B*/FL (`run.mjs:66`; chưa kiểm `dist/` trong worktree này). Máy rảnh. Luôn có `--timeout 20` (mặc định 60 phút, `run.mjs:34`: một lượt treo ăn 1/5 cửa sổ).
- **Điểm dừng an toàn:** dừng (Ctrl-C) bất cứ lúc nào **giữa hai lượt**. Dòng kết quả chỉ ghi sau khi chấm xong (`run.mjs:175`), nên lượt đang chạy bị bỏ và chạy lại từ đầu khi tiếp tục (mất tối đa 1 lượt, ≤ ~1M). Chạy tiếp = **đúng lệnh cũ**, cùng `--out`. Lịch xen kẽ phụ thuộc `--seed`, số lượt và thứ tự `--arms` (`run.mjs:42-52`); giữ nguyên. Tăng `--repeats` (3 → 5) giữ khóa cũ vì thứ tự mỗi lượt sinh từ `${seed}/${r}`.
- **Khi gặp 429:** làm §5.0 (phân loại **rồi** chuyển) **trước** khi chạy lại, nếu không các lượt hỏng bị coi là đã xong.
- **Không nhìn trộm (`preregistration.md` §4.4a).** Giữa các cửa sổ **không** chạy `analyze.mjs` hay `pairwise.mjs` và không đọc `score`, chênh lệch, CI, p giữa các arm. Chỉ xem thống kê vận hành theo arm: số lượt, `status`, `wallSec`, `tokens.weighted`, số lượt loại/`leak`/T. Dùng:
  `node -e "const r=require('fs').readFileSync('bench/vs-claude/results/s2/runs.jsonl','utf8').split('\n').filter(Boolean).map(JSON.parse),g={};for(const x of r){const a=g[x.arm]??={n:0,done:0,leak:0,w:0,s:0};a.n++;a.done+=x.status==='done';a.leak+=!!x.leak;a.w+=x.tokens?.weighted??0;a.s+=x.wallSec??0}console.table(g)"`
  (không đọc cột `score`). `analyze.mjs`/`pairwise.mjs` chỉ chạy khi đã đủ N theo §4 của giả thuyết đó, và các lệnh ở §5.3 chỉ dùng khi đó. Cắt hay đổi thứ tự arm giữa chừng chỉ được dựa trên chi phí/hạn mức, không dựa trên kết quả.
- **Sau mỗi cửa sổ (không gọi LLM):** §5.0; ghi M và giờ thực dùng từ bảng vận hành ở trên; thay hệ số §1.2 bằng số đo nếu lệch > 30 %; ghi hash commit (§6.4).
- **Bước kiểm "rep chạy lại ≠ rep đã loại" (sau mỗi cửa sổ có lượt bị loại/chuyển sang `excluded.jsonl`).** Với mỗi khóa arm × bài đã loại, kiểm lượt chạy lại trong `runs.jsonl` mang `rep` **mới**, khác `rep` đã nằm trong `excluded.jsonl` (đối chiếu hai tệp theo khóa arm × bài × `rep`; `run.mjs:64` có thể chạy lại với cùng `rN`, xem §5.0). Trùng `rep` ⇒ gán `rep` mới bằng tay và ghi vào sổ trước khi mở cửa sổ kế. **Giữ bước này trong checklist cho tới khi SR-01(d) được gộp** (khóa bị loại vẫn tính là đã xong, lượt thay lấy `rep` mới); khi đó xóa bước và ghi vào sổ ngày gộp.
- **Dừng cả lô** nếu ≥ 25 % lượt của một ô bị lỗi hạ tầng (`preregistration.md` §4.3c).
- **Các arm chạy ở cửa sổ khác nhau, nên KHÔNG cùng điều kiện với cặp A0-sonnet + B0 (W1).** Chỉ cặp A0-sonnet + B0 của W1 chạy xen kẽ trong cùng một cửa sổ (H1, H2, H5 so trong cặp này). B5, A1, A2, FL, A0-opus, B3 chạy ở W2 trở đi, tức khác thời điểm trong ngày, khác tải của nhà cung cấp, và có thể khác hash CCoding so với B0 của W1. Hệ quả: (i) mọi so sánh **giữa arm không cùng cửa sổ** (ví dụ B5 so với B0, FL so với B0, A2 so với B0) chịu nhiễu cửa sổ và thời điểm, phải ghi là "khác cửa sổ" khi báo cáo; (ii) arm nào có A0-sonnet cùng lệnh (`--arms A0-sonnet,<arm>`, §5) thì so với A0-sonnet **cùng cửa sổ** trước, không so với A0-sonnet của W1; (iii) `wallSec` và `tokens.weighted` không so được thẳng giữa cửa sổ. Quy tắc neo B0 bên dưới chỉ để **đo** độ trôi, không dùng hiệu chỉnh số liệu.

**Bảng cửa sổ (bắt buộc điền ngay sau mỗi cửa sổ, trước khi mở cửa sổ kế tiếp).** Hash lấy bằng `git rev-parse HEAD` và `git status --short` (§6.4); thời điểm lấy từ `started` của lượt đầu và `started + wallSec` của lượt cuối trong `runs.jsonl`, ghi UTC. Chưa chạy cửa sổ nào ⇒ chưa có giá trị; **không điền trước**.

| CS | Hash CCoding (`git rev-parse HEAD`) | `git status --short` | Bắt đầu (UTC) | Kết thúc (UTC) | Arm chạy trong cửa sổ | Lượt lỗi hạ tầng / bị loại | Anchor B0 (token, giây) |
|---|---|---|---|---|---|---|---|
| W1 | (chưa chạy) | | | | A0-sonnet, B0 | | không cần (B0 chính nằm ở W1) |
| W2 | (chưa chạy) | | | | theo nhánh (§3.1/§3.2) | | |
| W3 | (chưa chạy) | | | | | | |
| W4 | (chưa chạy) | | | | | | |
| W5 | (chưa chạy) | | | | | | |
| W6 (nếu có) | (chưa chạy) | | | | | | |

Hash khác nhau giữa các cửa sổ ⇒ ghi lý do (§6.4: phải dùng `--out` mới, `s2b`). Hash giống nhau mà arm B*/FL khác cửa sổ vẫn là "khác cửa sổ" (thời điểm, không chỉ mã).

- **Neo B0 (chạy nếu còn ngân sách; không thuộc §4 và không vào `analyze.mjs`).**
  - **k = 2** lượt B0 mỗi cửa sổ W2–W5 (tối đa 8 lượt), bài cố định **`l4-startup-order`** (có trong R9 và R13, chạy được cả hai nhánh, B0 rẻ nhất trong nhóm đủ điều kiện: pilot 222 408 token, 160 s; `context/pilot1-2026-11-02.md`; pilot là n = 1 nên chỉ dùng để ước chi phí).
  - **Chi phí theo §1.3** (nhóm logic, B0 = 300k token / 201 s mỗi lượt): **0,6 M và ≈ 0,11 h mỗi cửa sổ**, 2,4 M và ≈ 0,45 h cho 4 cửa sổ (≈ 2,6 % của 91 M ở Nhánh 2). Số theo pilot (2 × 222k = 0,44 M, 2 × 160 s) thấp hơn; kế hoạch dùng số §1.3 vì thận trọng hơn.
  - **Ngưỡng cửa sổ:** Nhánh 1 W2 đã 3,5 h, thêm 0,11 h thành ≈ 3,61 h, chạm trần 3,6 h; nếu W2 sát trần thì giảm k xuống 1 ở W2. Các cửa sổ còn lại đủ chỗ (≤ 3,51 h).
  - **Tách khóa:** mỗi cửa sổ dùng `--out` riêng (`bench/vs-claude/results/s2-anchor-W2`, `…-W3`, …) và lệnh `node bench/vs-claude/run.mjs --arms B0 --tasks l4 --repeats 2 --timeout 20 --out <thư mục anchor>`; không ghi vào `results/s2`. Lý do: `run.mjs` bỏ qua khóa đã xong, nên cùng `--out` thì cửa sổ sau không chạy lại được, và anchor sẽ lẫn vào N của H1–H10.
  - **Dùng làm gì:** so token và `wallSec` trung bình của 2 lượt anchor với B0 × `l4` của W1 (r1–r3). Ghi tỉ lệ vào cột "Anchor B0". Lệch > 30 % ⇒ ghi cảnh báo "cửa sổ trôi" cạnh mọi so sánh khác cửa sổ trong báo cáo. Điểm `l4` của B0 không dùng (bài chạm trần ở pilot, không mang tín hiệu chất lượng); anchor chỉ đo thời gian và token. Với k = 2 và một bài, đây là chỉ báo thô, **không phải** hiệu chỉnh và không có khoảng tin cậy.

### 3.1 Nhánh 1 — chưa có thay đổi của Phòng Dev (9 bài chạy được)

Bốn bài `a1,l1,l2,r1` lỗi ENOENT ở `freshWorkspace` (`run.mjs:72`) cho **mọi** arm (xảy ra trước khi gọi LLM, nên không tốn hạn mức), nên bị bỏ khỏi `--tasks`. Không có arm FL, không có t1–t5, không có cờ nhận hạn mức.

| CS | Lượt chạy (theo thứ tự) | Lượt | M | h | Giả thuyết đủ N sau cửa sổ (chỉ phân tích khi đủ N, §3.0) |
|---|---|---|---|---|---|
| **W1** (2/11 từ 16:50) | A0-sonnet + B0 × R9 × r1–3 (xen kẽ); `pairwise` re1 | 54 | 17,8 | 3,6 | **H5** đủ N; H1, H2, H3, H7, H9, H10 chưa đủ N (không xem điểm) |
| **W2** | B5 × R9 × r1–3 → A1 × R9 × r1–3 → s1 bổ sung A0-sonnet + B0 đến r10 | 68 | 15,4 | 3,5 | **H3** (n = 10/arm); H1, H2 đủ N từ W1; H6 phần A1 chưa đủ N (phân tích khi đủ N) |
| **W3** | A2 × R9 × r1–3 → A0-sonnet + B0 × R9 bổ sung r4 | 45 | 15,4 | 3,3 | **H6** (A1 và A2) |
| **W4** | A0-sonnet + B0 × R9 bổ sung r5 → A0-opus × R9 × r1–3 | 45 | 16,8 | 2,6 | **H7** (r5) |
| **W5** (tùy chọn) | B3 × R9 × r1 | 9 | 12,3 | 1,2 | B3 chỉ mô tả (r1, không kiểm) |

Tổng Nhánh 1: 77,7 triệu, 5 cửa sổ (chưa tính anchor B0, +0,6 M mỗi cửa sổ W2–W5, §3.0). **Cửa sổ khác nhau:** B5 (W2), A1 (W2), A2 (W3), A0-opus (W4), B3 (W5) chạy khác cửa sổ với B0 của W1; mỗi arm chỉ so cùng cửa sổ với A0-sonnet đi kèm trong lệnh (§3.0).

### 3.2 Nhánh 2 — Phòng Dev đã merge (N4 chạy được, T5 có `task.json`, có FL, có cờ hạn mức)

Chuyển sang Nhánh 2 **ở ranh giới cửa sổ đầu tiên sau khi merge**; W1 giống Nhánh 1. Dùng cùng `--out` nên không mất lượt đã chạy. Nếu merge xảy ra sau W2, dịch các dòng dưới đi một cửa sổ và áp dụng cột "không đạt" cho các ô vượt W5.

| CS | Lượt chạy (theo thứ tự) | Lượt | M | h | Giả thuyết đủ N sau cửa sổ (chỉ phân tích khi đủ N, §3.0) |
|---|---|---|---|---|---|
| **W1** | giống Nhánh 1 | 54 | 17,8 | 3,6 | **H5** |
| **W2** | A0-sonnet + B0 × N4 × r1–3 `--judge` → A0-sonnet + FL × T5 × r1–3 → s1 bổ sung đến r10 | 68 | 16,3 | 3,3 | **H1** (4 bài), **H2** (4 bài), **H3** đủ N; H4, B-01 chưa đủ N |
| **W3** | B5 + FL × R13 × r1–3 `--judge` | 78 | 21,9 | 3,4 | dữ liệu B5/FL cho phân tích sau; chưa phân tích H10 (13 bài) |
| **W4** | A0-sonnet + FL × T5 đến r9 → a1 bổ sung đến r11 `--judge` → A1 × R13 × r1 | 89 | 20,5 | 3,4 | **H4** (n = 11/arm), **B-01 TOST** (FL, 45 lượt/arm) đủ N |
| **W5** | A1 r2–3 → A2 × R13 × r1–2 → B0 × T5 × r1 (nối harness cũ) | 57 | 14,4 | 3,4 | **H6** (A1 r3, A2 r2); nối t1–t5 |
| W6 (dự phòng) | A2 r3 (3,8M) **hoặc** H7 bổ sung r4–5 (14,6M, 3,1 h) | ≤ 66 | ≤ 14,6 | ≤ 3,1 | chỉ khi W6 tồn tại |
| không xếp | A0-opus × R13 × r3 (13,1M, 1,8 h); B3 × R13 × r1 (15,4M, 1,6 h) | — | 28,5 | 3,4 | không đạt trước 5/11 (hết ngân sách) |

**Cửa sổ khác nhau:** FL (W2–W4), B5 (W3), A1/A2 (W4–W5) chạy khác cửa sổ với B0 × R13 của W1/W2; riêng W3 không có A0-sonnet hay B0 trong cùng cửa sổ, nên B5 và FL ở W3 chỉ so được với arm khác cửa sổ, kèm anchor B0 (§3.0) để đo độ trôi.

Tổng W1–W5 ≈ 91 triệu / 17 giờ wall-sum (chưa tính anchor B0, +2,4 M / +0,45 h tổng, §3.0). Nếu số đo thật ở W1 cao hơn mô hình > 20 %, cắt theo thứ tự: B3 → A0-opus → B0 × T5 → A2 r2 → A1 r3.

Điểm dừng an toàn Nhánh 2 giống §3.0; mỗi dòng lệnh §5.2 là một đơn vị chạy tiếp được.

---

## 4. Số lượt tối thiểu cho từng giả thuyết

Phép kiểm và ngưỡng theo `analyze.mjs` (dòng dẫn trong cột 1). "Đạt" = số lượt tối thiểu nằm trọn trong W1–W5 (kể cả judge/pairwise) và phép kiểm có thể ra kết luận về mặt cơ học; **không** có nghĩa kết quả sẽ ủng hộ giả thuyết. "Không đạt" kèm lý do và phương án lùi. B1 = Nhánh 1, B2 = Nhánh 2.

| Giả thuyết (phép kiểm) | Bài × arm | Số lượt tối thiểu | Nhánh 1 | Nhánh 2 | Phương án lùi / ghi chú |
|---|---|---|---|---|---|
| **H1** coding/design size ≥ 3: Δ ≥ +10 pp và CI dưới > 0 (`analyze.mjs:63`) | c3, c4, c5 (+r1) × A0-sonnet, B0 | r = 3 mỗi ô: 18 (B1) / 24 (B2) | **đạt trước 5/11** (W1) | **đạt trước 5/11** (W2) | 3–4 bài: CI theo bài rất rộng, **thêm lượt không hẹp CI** (biến thiên giữa bài). A0-sonnet đạt ~1,00 ở t1–t5: Δ ≥ +10 pp **không thể** nếu c3–c5 cũng gần trần. Báo Δ và CI |
| **H2** logic: Δ ≤ +5 pp (`:67`) | l3, l4 (+l1, l2) × A0-sonnet, B0 | r = 3: 12 (B1) / 24 (B2) | **đạt** (W1) | **đạt** (W2) | Chỉ so điểm ước lượng, không có biên: dễ "SUPPORTED". Báo CI kèm |
| **H3** review: recall ≥ +15 pp, precision mất ≤ 5 pp (`:70-74`) | s1 × A0-sonnet, B0 | r = 10 mỗi arm (σ recall = 0,12 giả định, Δ = 15 pp, 80 %): 20 | **đạt** (W2) | **đạt** (W2) | Một bài, nên kết luận chỉ về s1. Nếu σ thực > 0,17 cần r ≥ 20: không đạt, lùi về mô tả |
| **H4** requirements: Δ ≥ +20 pp (`:78`) | a1 × A0-sonnet, B0, `--judge` | r = 11 mỗi arm (σ = 0,17 giả định, Δ = 20 pp): 22 | **không đạt** (a1 chưa chạy được) | **đạt** (W4) | Lùi (B1): chờ sửa `repo/`. `task.json` của l3 và r1 gắn H4 nhưng `analyze.mjs` chỉ tính category `requirements` (= a1) |
| **H5** chi phí: token ≥ ×3 **và** thời gian ≥ ×1,5 ở ≥ 80 % bài (`:84`) | mọi bài × A0-sonnet, B0 | r = 3 (trung vị): 54 (B1) / 78 (B2) | **đạt** (W1) | **đạt** (W2) | Số liệu cũ cho ×4,3–5,5 token và ×2,6–5,3 thời gian: biên rộng |
| **H6** A1/A2 so với B0: \|Δ\| ≤ 5 pp ở ít nhất một (`:90`) | mọi bài × A1, A2, B0 | A1 r = 3, A2 r = 2: 45 (B1) / 65 (B2) | **đạt** (W3) | **đạt** (W5) | "Ít nhất một" + chỉ so điểm ước lượng: dễ đạt vô nghĩa. TOST ±5 pp cần ≥ 60 lượt/arm: không làm |
| **H7** SD ratio ≤ 0,7, ≥ 3 bài (`:94`) | mọi bài × A0-sonnet, B0 | r = 5 mỗi ô: 90 (B1) / 130 (B2) | **đạt** (W4) | **không đạt** (cần W6: 14,6M) | Cần ≥ 3 bài có sd(A0-sonnet) > 0; A0-sonnet có sd = 0 ở cả 5 bài t1–t5, nên H7 có thể là "thiếu dữ liệu" bất kể N. Lùi (B2): báo SD mô tả với r = 3 |
| **H8** lỗi điều phối: tỉ lệ deliverable thiếu TREAT > BASE (`:99`) | mọi bài | ≈ 100+ mỗi arm, ≥ 6 sự kiện (5 % vs 0 %) | **không đạt** | **không đạt** | Phép kiểm "TREAT > BASE" thành SUPPORTED chỉ với 1 sự kiện. Lùi: mô tả + xem transcript từng lượt `formatMiss` / thiếu test. Ca t5/FL (95/146) là sự kiện đầu |
| **H9** research: độ chính xác trích dẫn và từ chối đúng ≥ +10 pp (`:106`) | re1 × A0-sonnet, B0 | ≥ 35 mỗi arm (σ = 0,15 giả định); từ chối (nhị phân) ≥ 75 mỗi arm | **không đạt** | **không đạt** | 35 lượt re1 mỗi arm ≈ 21 triệu + 6,4 giờ. Lùi: r = 3 mô tả + `pairwise` re1 |
| **H10** độ dốc Δ theo size, hoán vị p < 0,05 (`:114`) | mọi bài × A0-sonnet, B0 | thêm lượt **không** tăng sức mạnh (biến giữa bài, n = 9–13) | **không đạt** | **không đạt** | Σ(x − x̄)² của size = 16,75 (13 bài) / 8,9 (9 bài); với σ(Δ theo bài) = 0,2 giả định, SE = 0,049 / 0,067 mỗi phần; phát hiện độ dốc 5 pp/phần chỉ ≈ 27 % / ≈ 18 % (α một phía 0,05). size lại trùng với loại bài. Lùi: mô tả, không dùng quyết định |
| **B-01 làn đơn**: TOST ±15 % với A0-sonnet, trên (a) token có trọng số, (b) thời gian thực, (c) điểm tương đối; bootstrap 90 % CI, α = 0,05 mỗi phía, theo bài | t1–t5 × FL (hoặc arm làn đơn khi có), A0-sonnet | (a) 30/arm (σ log 0,10 và 0,24); **(b) 45/arm** (σ log 0,14 và 0,29); (c) 8–17/arm (σ 0,10–0,15, giả định). **Chọn 45/arm = 9 mỗi bài** | **không đạt** (không có FL, T5) | **đạt** (W4) cho arm FL; làn đơn thật **chỉ nếu arm có mặt trước W4** | C7+C9 đã cho FL/A0-sonnet = token ×4,09, thời gian ×2,20: **FL không tương đương**. Cỡ mẫu trên là **cận dưới**: tính theo lượt độc lập, trong khi đăng ký trước chọn bootstrap theo bài (5 bài t1–t5), nên dị biệt tỉ số giữa bài không vào công suất; cần mô phỏng bootstrap phân tầng bằng dữ liệu C7+C9 (chưa làm) trước khi coi 45/arm là đủ. Chỉ chạy r4–9 (15,4M) cho arm làn đơn *mới*; nếu chưa có thì dùng 15M đó cho H4 và H3. A0-sonnet có thêm 36 lượt lịch sử C7+C9 để độ nhạy |
| **B-02** cổng chất lượng: test ẩn không kém A0-sonnet, biên 2 pp, một phía α = 0,05 | t1–t5, c5 × arm có cổng | n ≈ 106/arm (σ = 0,059 từ 40 lượt FL; sd A0 = 0) | **không đạt** | **không đạt** | Lùi: kiểm cơ chế ở dòng dưới |
| **B-02 cơ chế**: cổng chặn ca "đỏ kéo dài và bỏ sót phần việc" | phát lại ca t5/FL + ca gieo lỗi ở runtime giả (mock) | 3 lượt xác định, không tốn hạn mức LLM | **đạt** nếu cổng đã merge | **đạt** nếu cổng đã merge | Tần suất thật: 4/40 lượt FL < 1,0 test ẩn; ca "đỏ kéo dài" ≈ 1–2/40, quan sát ≥ 3 ca cần ≈ 120 lượt FL: **không đạt** thống kê |

TOST: m = ln 1,15 = 0,140 cho log tỉ lệ; n/arm = 2σ²(1,645 + 1,282)²/m², với σ² = tổng hai phương sai trong ô chia cho 2 khi hai arm cùng n. Công suất 80 % tại chênh lệch thật bằng 0.

---

## 5. Lệnh cụ thể

Thiết lập một lần mỗi phiên shell (Git Bash, thư mục gốc repo):

```bash
R9=c1,c2,c3,c4,c5,l3,l4,s1,re1                  # Nhánh 1
N4=a1,l1,l2,r1; T5=t1,t2,t3,t4,t5; R13=$R9,$N4  # Nhánh 2
OUT=bench/vs-claude/results/s2
node dist/cli.js serve                           # cửa sổ riêng; chỉ cần khi có arm B*/FL
```

### 5.0 Quarantine trước mỗi lần chạy lại và trước mỗi lần phân tích

Lý do (đọc mã): lượt hỏng (429, timeout) vẫn ghi vào `runs.jsonl` với `status: 'failed'` (`lib/claude.mjs:50`, `lib/ccoding.mjs:69`; ghi ở `run.mjs:175`). Khi khởi động, **mọi khóa** có dòng đều vào `done` (`run.mjs:64`) nên bị bỏ qua; `analyze.mjs` chỉ loại `leak` (`analyze.mjs:12`), không loại `status`, nên lượt hỏng điểm 0 làm lệch trung bình. **Thứ tự bắt buộc: phân loại trước, chuyển sau. Không chạy `run.mjs` lần nào trước khi bước 2 xong** (nếu chạy, `run.mjs:64` giữ khóa cũ nhưng mọi dòng `failed` còn nằm trong `runs.jsonl` sẽ bị tính; và nếu chuyển hết rồi đưa lại bằng tay thì `runs.jsonl` có hai dòng trùng khóa, `analyze.mjs` đếm cả hai).

Nguyên tắc (`preregistration.md` §4.1, §4.3): chỉ chuyển lượt có **bằng chứng hạ tầng** (Q, E1, E4, T do hạ tầng). Lượt `failed` mà **không** có bằng chứng hạ tầng là kết quả (N1, hoặc T do hệ không xong, tiêu chí T) và **ở nguyên** trong `runs.jsonl`: nếu chuyển đi, lần chạy sau tự chạy lại cùng khóa và arm hay timeout (B0 với `--timeout 20`) được thêm một lần thử, tức thiên lệch có lợi cho nó.

Bước 1 — chỉ liệt kê, không ghi gì. Bằng chứng hạ tầng = `error` hoặc `artifacts/<key>/_FINAL.txt` chứa `429`, `usage_limit`, `rate limit`, `quota`, `overloaded`, `ECONN`, `ENOENT`, `ETIMEDOUT`. Đối số 1 là `--timeout` (phút) của lệnh vừa chạy. Dòng `failed` có `wallSec ≥ 0,98 × timeout × 60` mà không có bằng chứng được nhãn `T-giữ`:

```bash
cat > /tmp/classify.cjs <<'EOF'
const fs=require('fs'),path=require('path');
const [,, dir, timeoutMin, apply]=process.argv;
const L=fs.readFileSync(path.join(dir,'runs.jsonl'),'utf8').split('\n').filter(Boolean);
const infra=/429|usage.?limit|rate.?limit|quota|overloaded|ECONN|ENOENT|ETIMEDOUT/i;
const keep=[],move=[];
for(const l of L){const r=JSON.parse(l);
  if(r.status==='done'){keep.push(l);continue}
  let txt=String(r.error??'');
  try{txt+=fs.readFileSync(path.join(dir,'artifacts',r.key,'_FINAL.txt'),'utf8')}catch{}
  const hit=infra.test(txt);
  const tmo=(r.wallSec??0)>=0.98*timeoutMin*60;
  console.log(r.key,r.status,hit?'HẠ-TẦNG -> chuyển':(tmo?'T-giữ (hệ không xong)':'N1-giữ (kết quả)'));
  (hit?move:keep).push(l)}
console.log('giữ',keep.length,'chuyển',move.length);
if(apply==='apply'){
  fs.appendFileSync(path.join(dir,'excluded.jsonl'),move.map(l=>l+'\n').join(''));
  fs.writeFileSync(path.join(dir,'runs.jsonl'),keep.map(l=>l+'\n').join(''))}
EOF
node /tmp/classify.cjs bench/vs-claude/results/s2 20          # bước 1: chỉ in
```

Bước 2 — người chưa xem `score` của các dòng đó đọc danh sách ở bước 1, sửa nhãn nếu regex sai (ví dụ nhắc "429" trong nội dung sản phẩm), rồi mới áp dụng:

```bash
node /tmp/classify.cjs bench/vs-claude/results/s2 20 apply    # chuyển dòng hạ tầng sang excluded.jsonl
```

**Chạy lại sau khi loại lượt (giống hệt `preregistration.md` §4.1).** Chạy lại bằng `rep` MỚI, cùng khóa arm × bài; lượt bị loại vẫn giữ trong log kèm lý do, không ghi đè. Quy tắc áp dụng từ v2.1, không hồi tố cho 4 lượt C9 đã loại (`context/c9-partial-2026-11-02.md`); nếu C9 chạy tiếp thì theo quy tắc này. Thay lượt tối đa 2 mỗi ô (E1/E3/E4).

Lưu ý cơ chế (cần kiểm): `run.mjs:64` chỉ bỏ qua khóa còn dòng trong `runs.jsonl`, nên khóa `rN` đã chuyển sang `excluded.jsonl` sẽ bị chạy lại với **cùng `rN`**, trái quy tắc trên. Cho tới khi SR-01 xong (trường `excluded`, khóa bị loại vẫn tính là đã xong, `suite-review.md` §5), vận hành viên phải gán `rep` mới bằng tay và ghi vào sổ; chưa có lệnh đã thử cho việc này. Số lượt `T-giữ` và `N1-giữ` theo arm được ghi vào sổ để báo cáo. Phòng Dev đang thêm nhận biết hạn mức vào `run.mjs`; khi có, bước này có thể thay bằng cờ đó (tên cờ chưa biết). Lưu ý: `/tmp/classify.cjs` là script vận hành nằm ngoài repo (hạng mục giới hạn một tệp); chưa chạy trên dữ liệu thật vì chưa có `results/s2`.

### 5.1 Nhánh 1

```bash
# W1  (54 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks $R9 --repeats 3 --timeout 20 --out $OUT
# (không chạy analyze/pairwise ở đây: chỉ xem bảng vận hành §3.0; phân tích ở §5.3 khi đủ N)

# W2  (27 + 27 + 14 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,B5 --tasks $R9 --repeats 3 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,A1 --tasks $R9 --repeats 3 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks s1 --repeats 10 --timeout 20 --out $OUT

# W3  (27 + 18 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,A2 --tasks $R9 --repeats 3 --timeout 40 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks $R9 --repeats 4 --timeout 20 --out $OUT

# W4  (18 + 27 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks $R9 --repeats 5 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,A0-opus --tasks $R9 --repeats 3 --timeout 20 --out $OUT

# W5 (tùy chọn, 9 lượt)
node bench/vs-claude/run.mjs --arms B3 --tasks $R9 --repeats 1 --timeout 30 --out $OUT
```

Khi A0-sonnet đã đủ lượt của khóa, lệnh `--arms A0-sonnet,X` chỉ chạy phần còn thiếu của X. Phần thiếu ở A0-sonnet (r4, r5) chạy xen kẽ với B0 trong cùng lệnh.

### 5.2 Nhánh 2 (thay cho W2–W5)

```bash
# W2  (24 + 30 + 14 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks $N4 --repeats 3 --judge --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,FL --tasks $T5 --repeats 3 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks s1 --repeats 10 --timeout 20 --out $OUT

# W3  (78 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,B5,FL --tasks $R13 --repeats 3 --judge --timeout 20 --out $OUT

# W4  (60 + 16 + 13 lượt)
node bench/vs-claude/run.mjs --arms A0-sonnet,FL --tasks $T5 --repeats 9 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks a1 --repeats 11 --judge --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A1 --tasks $R13 --repeats 1 --timeout 20 --out $OUT

# W5  (26 + 26 + 5 lượt)
node bench/vs-claude/run.mjs --arms A1 --tasks $R13 --repeats 3 --timeout 20 --out $OUT
node bench/vs-claude/run.mjs --arms A2 --tasks $R13 --repeats 2 --timeout 40 --out $OUT
node bench/vs-claude/run.mjs --arms B0 --tasks $T5 --repeats 1 --timeout 20 --out $OUT
```

Lệnh `--arms A0-sonnet,B5,FL` ở W3 không sinh thêm lượt A0-sonnet vì A0-sonnet đã đủ r1–3 trên R9 (W1) và N4 (W2); `--judge` chỉ gọi Opus cho a1, r1.

### 5.3 Phân tích (không gọi `run.mjs`) — chỉ khi đã đủ N

Chạy sau cửa sổ cuối đóng N của giả thuyết (§4), không chạy giữa chừng (`preregistration.md` §4.4a). Phân tích trên bản sao `runs.jsonl` đã áp sổ lượt loại (§5.0).

```bash
# analyze.mjs ghi đè report.md mỗi lần chạy; chuyển hướng ra tệp riêng
for X in B0 B5 FL A1 A2; do node bench/vs-claude/analyze.mjs $OUT --baseline A0-sonnet --treatment $X > $OUT/report-$X.md; done

# pairwise.mjs: bỏ qua mọi task#rep đã có trong pairwise.jsonl, bất kể cặp --x/--y (pairwise.mjs:31-32),
# nên phải dời kết quả của cặp trước ra trước khi chạy cặp sau
for Y in B0 B5 FL; do
  node bench/vs-claude/pairwise.mjs $OUT --x A0-sonnet --y $Y
  mv $OUT/pairwise.jsonl $OUT/pairwise-$Y.jsonl; mv $OUT/pairwise.md $OUT/pairwise-$Y.md
done
```

`analyze.mjs` mặc định `--baseline A0-sonnet`, `--treatment B0` (`analyze.mjs:15-16`); **H6** chỉ có khi A1/A2 nằm trong thư mục và chỉ so với `--treatment` đang chọn. `pairwise.mjs` chỉ xét category `design,requirements,research` (r1, a1, re1; `pairwise.mjs:15`) và ghép X, Y theo cùng `rep`. Nếu `pairwise` dừng giữa chừng, chạy lại đúng lệnh trước khi `mv`.

### 5.4 Đợt 3e (sau D9: B-14, B-12, B-16, B-15, H6) — chỉ chạy khi giám đốc đã duyệt

> Hạng mục S3 của BRIEF-14 (vòng 4, gói 8) · research-lead · phân loại dữ liệu: Nội bộ. Đồng bộ lại ở vòng 4 gói 9 (BRIEF-15, T-20261103-224501-4e4) theo bảng quyết định đầu mục §9 gói 8. Mục này là **kế hoạch vận hành**: chép lệnh từ `bench/vs-claude/RUNBOOK-cloud-session.md` Bước 3e và lệnh phân tích cổng đã chốt cho `docs/research/analysis/gates-pairs.mjs`. Giả thuyết, thước đo, phép kiểm, quy tắc dừng và quy tắc loại nằm ở `preregistration.md` §9, mục "Đăng ký trước vòng 4 gói 8: đợt đo 3e (ghi 3/11/2026, trước lượt đầu tiên; …)", dòng `V4-3e-E1` … `V4-3e-E6`. Khi §9 và mục này lệch nhau thì theo §9. Số USD và giờ máy dưới đây là ước lượng của người điều phối (BRIEF-14), không phải ngưỡng; riêng **trần 15 giờ của E4** là quy tắc dừng của §9.

**Điều kiện trước khi chạy** (RUNBOOK 3e):
1. D9b đã gộp (8 test hook Linux xanh).
2. §9 đã có các dòng `V4-3e-E1` … `V4-3e-E6` **và đã commit**, kể cả công thức chốt N cho E4.
3. Giám đốc đã duyệt chi phí.

commit khóa §9: <hash>

Dòng trên do orchestrator điền bằng hash commit gộp của nhiệm vụ T-20261103-224501-4e4 (mốc khóa §9 gói 8), sau khi gộp và trước lượt đầu của E2. **Dòng còn `<hash>` thì không được bắt đầu E2.**

**Điểm dừng cứng:**
- **Trước E2:** chỉ chạy khi §9 đã commit, có công thức chốt N cho E4, **và dòng `commit khóa §9` ở trên đã có hash thật**. Chưa đủ thì dừng sau E1.
- **Trước lượt local đầu tiên** (E4, hoặc phần cloud chạy tiếp ở local theo §5.4.2): đã chốt server local dựng từ commit nào (§5.4.2, [CẦN XÁC NHẬN]), ghi quyết định vào RUNLOG và commit. Chưa chốt thì không chạy local.
- **Trước E4:** ghi vào RUNLOG, có commit, phép tính N theo §9 khối (a) từ E2. Theo §9 khối (a) bước 5, kết quả đã xác định trước: R_E4 = 16, R_B6 = 32, tổng 192 lượt; RUNLOG ghi q̂ của E2 chỉ để mô tả. Không chọn N sau khi xem điểm.
- **Trước E6:** `--out` của E6 đã chốt ở §9 `V4-3e-E6` mục (9): thư mục mới `bench/vs-claude/results/h6-3e`, chỉ ghép A với B0 cùng cửa sổ và cùng server. Ghi nguồn p (SR-26 có hash hay phương án lùi) vào RUNLOG và commit trước lượt E6 đầu tiên.
- **Không xem điểm** giữa các phần (§3.0, `preregistration.md` §4.4a). Giữa các phần chỉ xem bảng vận hành ở §3.0, đổi đường dẫn sang thư mục `--out` của phần đó.
- **Thiếu credit hoặc thiếu giờ:** thứ tự ưu tiên lấy theo §9. Mục này không chép lại để tránh hai bản lệch nhau.

**Thiết lập (RUNBOOK 3e bước 1)**, một lần cho mỗi máy, cloud hoặc local:

```bash
git pull && git worktree add ../ccoding-3e HEAD && cd ../ccoding-3e && npm ci --no-audit --no-fund && npm run build
# ccoding.local.json như Bước 2, "server": { "port": 7425 }; chạy nền: node dist/cli.js serve
git -C ../ccoding-3e rev-parse HEAD   # ghi vào RUNLOG
S3E="--runtime claude-cli --ccoding-url http://127.0.0.1:7425 --ccoding-data ../ccoding-3e/data --work /tmp/vb"
```

Bản này có B-13 (`runs.jsonl` ghi `model`, token và giây theo pha) và B-12 (`gates.b02`, `gates.b10`, `gates.cto`). Local dùng server riêng cổng 7425, không đụng server 7420.

**Quy tắc mỗi phần**, từ E1 đến E6:
1. **Trước khi chạy**, nếu thư mục `--out` đã có `runs.jsonl`, làm quarantine §5.0 trên thư mục đó. Đối số timeout bằng `--timeout` của lệnh: `node /tmp/classify.cjs <thư mục --out> <timeout>`, đọc danh sách, rồi mới thêm `apply`. Sau đó làm bước kiểm "rep chạy lại ≠ rep đã loại" ở §3.0. E1 không qua `run.mjs` nên không có bước này.
2. **Trước khi phân tích**, làm lại quarantine §5.0 trên thư mục đó.
3. **Ghi RUNLOG** cho mỗi phần: hash server (`git -C ../ccoding-3e rev-parse HEAD`), `git status --short`, giờ bắt đầu và kết thúc (UTC), và `model` theo pha lấy từ `runs.jsonl` (B-13). §9 ghi hash là "ghi khi chạy"; giá trị thật nằm ở RUNLOG.
4. **Commit sau mỗi lệnh** (RUNBOOK Bước 3): `git add bench/vs-claude/results && git commit -m "…" && git push`.

#### 5.4.1 Bảng cloud: E1–E3, trước 5/11 14:59 giờ VN

| Thứ tự | Phần | §9 | Lệnh, chép nguyên từ RUNBOOK 3e | Số lượt | USD (Sonnet) | Giờ máy | Điểm commit |
|---|---|---|---|---|---|---|---|
| 1 | E1, B-14 chẩn đoán cache | `V4-3e-E1` | `node bench/vs-claude/cache-diagnostic.mjs --model sonnet --out bench/vs-claude/results/b14-diag/diag.csv` | 7–8 lượt `claude -p` | ≈ 0,2 | ≈ 0,3 | sau lệnh |
| 2 | E2, thí điểm B-12/B-16 | `V4-3e-E2` | `node bench/vs-claude/run.mjs --arms B7cab,B7cabO --tasks suite:gates --repeats 2 --timeout 20 $S3E --out bench/vs-claude/results/gates-pilot` rồi `node bench/vs-claude/run.mjs --arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 2 --timeout 20 $S3E --out bench/vs-claude/results/gates-pilot` | 28 | ≈ 14 | ≈ 1,4 | sau **mỗi** lệnh |
| 3 | E3, thí điểm bài lớn | `V4-3e-E3` | `node bench/vs-claude/run.mjs --arms A0-sonnet,B0,B1 --tasks l1-modules,l2-chain --repeats 1 --timeout 40 $S3E --out bench/vs-claude/results/large-pilot` | 6 | ≈ 8 | ≈ 0,8 | sau lệnh |
| | **Cộng cloud** | | | 34 lượt `run.mjs` + 7–8 `claude -p` | ≈ 22,2 | ≈ 2,5 | |

Ghi chú theo RUNBOOK:
- **E1** chạy trực tiếp trong shell, không qua CCoding nên không qua hook. Script tự chờ 330 giây giữa các cặp. Diễn giải theo bảng ở `analysis/cache-diagnostic-spec.md` Phần 1.
- **E2:** B6 chạy vì cổng b10 chỉ có ở làn có pha plan; làn đơn không có pha này. E2 có 24 lượt B7cab/B7cabO (2 arm × 6 bài × 2) và 4 lượt B6 (1 arm × 2 bài × 2).
- **E3:** kiểm lượt B0 có pha `discuss` (`byPhase.discuss`). Nếu không có, B-15 không đo được trên bài đó: ghi RUNLOG và báo lại. Đây là quy tắc loại của B-15 (§9 `V4-3e-E3`/`V4-3e-E5`).
- Dòng "Cộng" cộng từ bảng BRIEF-14.

**Phân tích cổng sau E2.** Không gọi LLM và không đọc `score`. Chỉ chạy sau quarantine §5.0 trên `gates-pilot`. Mỗi cổng ra một tệp CSV riêng: `agreement.mjs` gộp mọi dòng trong một tệp thành một ma trận, nên không được trộn b02/b10/cto. `agreement.mjs --pairs` nhận đường dẫn tệp, không đọc stdin, nên **không dùng pipe `|`**.

```bash
P=bench/vs-claude/results/gates-pilot
# nhãn chính: --label gate (nhãn tại thời điểm cổng, B-12 7(b)); độ nhạy: --label task (nhãn theo bài)
# đơn vị chính: lần cổng quyết định (B-12); độ nhạy: mỗi lượt một cặp; CI bootstrap cụm theo runId
for L in gate task; do
  for U in decision run; do
    for G in b02 b10 cto; do
      node docs/research/analysis/gates-pairs.mjs $P/runs.jsonl --arms-json bench/vs-claude/arms.json --unit $U --gate $G --negatives clean --label $L --out $P/pairs-$G-$U-$L.csv
      node docs/research/analysis/agreement.mjs --pairs $P/pairs-$G-$U-$L.csv --positive 1 > $P/agreement-$G-$U-$L.md
    done
  done
done
```

- Cổng `null` (ví dụ b10 ở làn đơn) bị bỏ khỏi mẫu của cổng đó. Bài cài lỗi thuộc cổng khác bị loại khỏi mẫu của cổng đang xét (`--negatives clean`). Hai số dòng bị bỏ in ra stderr và phải chép vào RUNLOG.
- Dòng tổng hợp `gates-pairs: b02|cto nhãn hiệu lực: …; số dòng lùi: N/M; tỷ lệ lùi: P%` luôn có ở stderr, và vào stdout khi có `--out`; chép vào RUNLOG. Tỉ lệ lùi > 10 % thì kết quả b02 ở `--label gate` chỉ là thăm dò, báo nhãn theo bài (§9, quy ước chung). Khi chưa có `gates.b02.checksRed` (D10 mục C), tỉ lệ lùi là 100 %.
- Nhãn cto ở `--label gate`: g5/g6 lấy `ref = 1` khi dòng `runs.jsonl` có `pass = false`, `0` khi `pass = true`; bài sạch `ref = 0`; dòng g5/g6 thiếu `pass` lùi về nhãn theo bài, báo ở stderr và dòng tổng hợp `cto` (§9, quy ước chung). Giới hạn của `--unit decision` (thứ tự và nhãn từng vòng của b02 bị mất) ghi ở `docs/research/analysis/README.md`.
- Từ dữ liệu này, Phòng Nghiên cứu tính q̂_b02, q̂_cto theo tử và mẫu của §9 khối (a) bước 1, cộng hai arm, không tách arm. Sau đó ghi RUNLOG cùng N theo khối (a) (đã xác định: R_E4 = 16, R_B6 = 32), rồi commit `pairs-*.csv`, `agreement-*.md` và RUNLOG. Đây là điểm dừng trước E4.

**Hết credit trên cloud** (429, "usage_limit_reached", "credit", "hit your … limit"): dừng ngay, commit phần đã có, ghi khóa cuối cùng vào RUNLOG. **Không** chạy tiếp bằng hạn mức gói trên cloud.

#### 5.4.2 Điều kiện chuyển sang local

Chuyển sang local khi có **một** trong ba điều kiện:
1. Hết hạn cloud: đã tới 5/11 14:59 giờ VN.
2. Cạn credit: gặp các thông báo ở trên.
3. E2 chưa xong khi hết giờ cloud. Khi đó phần còn lại của E2 chạy local **trước** E4, bằng đúng lệnh E2, cùng `--out bench/vs-claude/results/gates-pilot`. Runner bỏ qua khóa đã `done`. E3 dở dang cũng chạy tiếp theo cách này, trước E5.

Phần cloud nào chưa xong khi chuyển vẫn giữ thứ tự E1 → E2 → E3 và giữ các điểm dừng ở trên.

**Cách nối dữ liệu cloud với local:**
- Cùng thư mục `--out` cho cùng một phần, nên khóa `task__arm__rN` (`run.mjs:49`) là khóa chung, theo §6.1.
- Mỗi phần, và mỗi máy trong cùng phần, ghi một dòng RUNLOG gồm hash server, `git status --short`, máy (cloud hoặc local) và `model` theo pha. Khi phân tích, hash hoặc `model` theo pha khác nhau giữa các lượt của cùng phần thì tách ra làm biến độ nhạy, không gộp im lặng (§6.4).
- Máy local dựng server từ **cùng commit** với cloud: `git worktree add ../ccoding-3e <hash cloud>`, thay cho `HEAD`, rồi kiểm bằng `git -C ../ccoding-3e rev-parse HEAD`. Đây là đề xuất của mục này, chưa có trong RUNBOOK; giám đốc hoặc người điều phối xác nhận trước khi chạy local [CẦN XÁC NHẬN]. Đây là điểm dừng "trước lượt local đầu tiên" ở trên.

#### 5.4.3 Bảng local: E4–E6, bằng hạn mức gói

Cùng thiết lập `$S3E`, server riêng cổng 7425 trên máy giám đốc. Gặp giới hạn 5 giờ thì chờ cửa sổ sau; runner bỏ qua khóa đã `done`. Mỗi cửa sổ vẫn theo §3.0: máy rảnh, một luồng, điền bảng vận hành.

| Thứ tự | Phần | §9 | Lệnh (cờ chép nguyên từ RUNBOOK 3e bước 6) | Số lượt | USD (Sonnet) | Giờ máy | Điểm commit |
|---|---|---|---|---|---|---|---|
| 4 | E4, B-12/B-16 chính | `V4-3e-E4` | hai lệnh, theo thứ tự: `node bench/vs-claude/run.mjs --arms B7cab,B7cabO --tasks g1-slug-dedupe,g2-cart-coupon,g5-median-stats,g6-range-merge --repeats 16 --timeout 20 $S3E --out bench/vs-claude/results/gates-main` rồi `node bench/vs-claude/run.mjs --arms B6 --tasks g3-qty-rename,g4-gb-unit --repeats 32 --timeout 20 $S3E --out bench/vs-claude/results/gates-main` | 128 + 64 = 192 | ≈ 60 + B6 (chưa ước lượng) | ≈ 8,8; **trần 15** | sau **mỗi** lệnh, và cuối mỗi cửa sổ 5 giờ |
| 5 | E5, B-15 chính | `V4-3e-E5` | `node bench/vs-claude/run.mjs --arms B0,B1 --tasks l1-modules,l2-chain --repeats 10 --timeout 40 $S3E --out bench/vs-claude/results/b15-main` | 40 | ≈ 73 | ≈ 7 | cuối mỗi cửa sổ 5 giờ; trải trên nhiều cửa sổ |
| 6 | E6, H6 cho đủ N | `V4-3e-E6` | ba lệnh: `--arms A1 --repeats 3 --timeout 20`, `--arms A2 --repeats 2 --timeout 40`, `--arms B0 --repeats 3 --timeout 20`, mỗi lệnh với `--tasks l1-modules,l2-chain,t1-duration,t2-orders,t3-api,t4-perf,t5-logq $S3E --out bench/vs-claude/results/h6-3e` | 21 + 14 + 21 = 56 (B0 mới 21) | ≈ 37 | ≈ 3,1 | sau mỗi lệnh |
| | **Cộng local** | | | 288 | ≈ 170 + B6 | ≈ 18,9 | |

Ghi chú:
- **Số lượt E4** theo §9 khối (a): E2 có tối đa 8 lượt có lỗi cài mỗi cổng, ít hơn 10 dương thật, nên bước 5 luôn áp (q = 0,5, N_gộp = 64). Vì vậy R_E4 = ⌈64/4⌉ = 16 trên 4 bài × 2 arm = 128 lượt, và R_B6 = ⌈64/2⌉ = 32 trên 2 bài = 64 lượt. g3, g4 bị bỏ khỏi B7cab, B7cabO vì làn đơn không có pha plan, nên b10 luôn `null`. b10 lấy từ lệnh B6 (chạy local, không tốn USD cloud). `<OUT_E4>` là thư mục mới `bench/vs-claude/results/gates-main`: lượt thí điểm `gates-pilot` không vào mẫu chính.
- **Trần thời gian máy của E4 (§9 khối (a) bước 4):**
  - Trần là **15 giờ đồng hồ thực**, cộng (giờ kết thúc − giờ bắt đầu, UTC, ghi RUNLOG) của các lệnh E4. Thời gian chờ giữa hai cửa sổ không tính. E4 dùng tối đa 3 cửa sổ 5 giờ.
  - Chạy lệnh B7cab, B7cabO trước, lệnh B6 sau.
  - Khi chạm trần: không bắt đầu lượt mới, cho lượt đang chạy chạy hết rồi dừng. Báo số lượt đã chạy mỗi ô (cổng × arm × bài). **Không chạy bù**, không mở cửa sổ thứ tư.
- **USD và giờ của E4:**
  - Tốc độ lấy theo BRIEF-14: 50–92 lượt mất 2,3–4,2 giờ, tức ≈ 2,75 phút mỗi lượt, và 23–44 USD, tức ≈ 0,47 USD mỗi lượt.
  - 128 lượt B7cab, B7cabO ≈ 5,9 giờ và ≈ 60 USD.
  - 64 lượt B6 ≈ 2,9 giờ, giả định B6 chạy cùng tốc độ (chưa kiểm). USD của B6 chưa ước lượng.
  - Đây chỉ là phép nhân, chưa có số đo.
- **`--out` của E5 là thư mục mới `bench/vs-claude/results/b15-main`**, không dùng `large-pilot`. Lý do: §9 `V4-3e-E3` mục (6) ghi dữ liệu E3 "không gộp vào ước lượng của E5", và `V4-3e-E5` mục (4) ghi "Thí điểm E3 (6 lượt) tách riêng, không gộp". Vì runner bỏ qua khóa đã `done`, nếu E5 ghi vào `large-pilot` thì B0, B1 r1 của E3 sẽ bị coi là r1 của E5: mỗi ô chỉ có 9 lượt mới và lượt thí điểm lọt vào mẫu chính. Với thư mục mới, E5 chạy đủ r1–r10 mỗi ô. Nếu E5 dừng giữa chừng, chạy tiếp đúng lệnh trên, cùng `b15-main`.
- **`--timeout` của E5:** RUNBOOK 3e bước 6 ghi "cùng lệnh" nhưng không ghi timeout cho E5. `--timeout 40` của E5 là **đề xuất** của mục này, lấy theo lệnh E3 cùng bài và cùng arm B0, B1 [CẦN XÁC NHẬN]. Chốt trước lượt E5 đầu tiên, sau đó không đổi giữa chừng (§3.0).
- **E6:**
  - `--out` là thư mục mới `bench/vs-claude/results/h6-3e`, theo §9 `V4-3e-E6` mục (9). H6 chỉ ghép A với B0 cùng cửa sổ và cùng server.
  - Không dùng `results/study-cloud`, vì runner bỏ qua khóa đã `done`. Nếu dùng chung, các khóa H6 cũ của server 7424 sẽ trộn với server 3e, trái §6.4. Vì vậy E6 chạy đủ N từ đầu: 56 lượt, B0 mới 21. Thay cho "≈ 49, trừ khóa đã có" của BRIEF-14.
  - `--timeout` giữ như các khóa H6 đã có (§5.2): A1, B0 là 20, A2 là 40.
  - USD và giờ nhân từ BRIEF-14 theo tỉ lệ 56/49: 32 → ≈ 37 USD, 2,7 → ≈ 3,1 giờ. Đây chỉ là phép nhân.
- **E5:** quy tắc loại "lượt đối chứng phải có pha `discuss`" áp như ở E3 (§9).
- Dòng "Cộng":
  - 192 + 40 + 56 = 288 lượt.
  - USD ≈ 60 + 73 + 37 = 170, chưa gồm B6.
  - Giờ ≈ 8,8 + 7 + 3,1 = 18,9.
  - Theo §2 (3,6 giờ wall-sum mỗi cửa sổ, giả định), 18,9 giờ cần **ít nhất 6 cửa sổ** 5 giờ.

**Phân tích cổng sau E4.** Cùng dạng như sau E2, với `P=bench/vs-claude/results/gates-main`. Chỉ chạy khi E4 đã đủ N hoặc đã chạm trần thời gian, sau quarantine §5.0:

```bash
P=bench/vs-claude/results/gates-main
for L in gate task; do
  for U in decision run; do
    for G in b02 b10 cto; do
      node docs/research/analysis/gates-pairs.mjs $P/runs.jsonl --arms-json bench/vs-claude/arms.json --unit $U --gate $G --negatives clean --label $L --out $P/pairs-$G-$U-$L.csv
      node docs/research/analysis/agreement.mjs --pairs $P/pairs-$G-$U-$L.csv --positive 1 > $P/agreement-$G-$U-$L.md
    done
  done
done
```

- Kết quả đăng ký dùng `--unit decision --label gate`. `--unit run` và `--label task` là độ nhạy. b10 chỉ báo theo nhãn bài, từ các lượt B6. Recall gộp hai arm.
- Lượt thí điểm `gates-pilot` không đưa vào mẫu chính.
- Phép so B7cab với B7cabO (B-16: McNemar chính xác ghép cặp theo bài và `rep`, Clopper–Pearson từng arm) theo §9 `V4-3e-E4`, không theo mục này. Commit `pairs-*.csv`, `agreement-*.md` sau khi chạy.

**Nhãn người** (RUNBOOK 3e bước 7, giám đốc, khoảng 30–45 phút, làm được song song với E4–E6): gán 60 mục ở `docs/research/analysis/gold-sheet.csv` (arm đã ẩn). Sau đó Phòng Nghiên cứu chạy `agreement.mjs` với `gold-key.csv`: `node docs/research/analysis/agreement.mjs --gold-score` (theo `agreement.mjs:11`).

---

## 6. Gộp với harness cũ (`harness/`, C1–C9)

### 6.1 Khóa chung

| | Harness cũ (`runs.csv`) | Bộ đo mới (`runs.jsonl`) |
|---|---|---|
| Khóa lượt | `run/task/system/rep` (`stats.mjs:36-47`, bỏ dòng trùng) | `task__arm__rN` (`run.mjs:49`) |
| Bài | `t1-duration`…`t5-logq` | `t1`…`t5` sau khi Phòng Dev thêm `task.json` (giữ nguyên `id` cũ để khóa chung) |
| Hệ | `claude-sonnet`, `ccoding-fastlane`, `ccoding`, `claude` | `A0-sonnet`, `FL`, `B0`, `A0-opus` |

Bảng ánh xạ hệ (§ Dữ liệu) chỉ dùng cho **mô tả** và **độ nhạy**, không gộp vào phân tích chính: B0 hiện tại không phải `ccoding` 14e2ec6.

### 6.2 Cột không so được

| Cột | Vì sao | Cách xử lý |
|---|---|---|
| điểm | cũ: `hidden_pass/hidden_total`; mới: `score` của grader từng loại | chỉ so điểm t1–t5 giữa hai harness khi grader giống nhau; kiểm bằng oracle/null |
| token | cũ: `input, output, cache_read, cache_write` từ log CCoding và Claude Code; mới: `tokens.weighted` | tính lại theo công thức §1 trên cột cũ (đã làm ở §1.1) |
| thời gian | C4 chạy hai nhiệm vụ cùng lúc ("số đo thời gian nhiễu"); C5–C9 chạy hai hệ song song | không dùng `wall_s` của C4 và C9 cho TOST; chỉ tham chiếu |
| USD | cũ có; mới `costUsd` (CCoding có thể bằng 0 nếu runtime không báo) | kiểm `costUsd > 0` trước khi dùng |
| `leak` | chỉ có ở bộ mới | bộ cũ coi `leak = false` (giả định) |
| `size`, `category` | chỉ có ở bộ mới | H1, H10 không áp cho t1–t5 trừ khi `task.json` gán |

### 6.3 t1–t5 qua `task.json`

Phòng Dev thêm `task.json` cho t1–t5; kế hoạch chỉ cần `id` khớp tiền tố (`run.mjs:23`: `t === s || t.startsWith(s + '-')`). Trường `size`/`category`/`hypotheses` của t1–t5 do Phòng Dev gán; đề xuất `category: coding`, `size` = số phần theo `harness/README.md` (cần S1 xác nhận). Khi chưa có, t1–t5 vẫn dùng được qua dữ liệu C1–C9 (§1) nhưng không nằm trong lịch chạy.

### 6.4 Phiên bản CCoding theo hash commit

Lượt B*/FL phải gắn hash commit đang chạy, không chỉ nhãn arm. `run.mjs` hiện **không** ghi hash (`config.json` ghi `argv` và `cfg`, không ghi git). Làm tay, không sửa mã: trước mỗi cửa sổ chạy `git rev-parse HEAD` và `git status --short`, ghi cùng thời điểm vào nhật ký chạy của người vận hành. **Không** `git pull` hay đổi nhánh giữa cửa sổ; nếu phải đổi, dùng `--out` mới (`s2b`), vì nếu không H1–H10 trộn hai phiên bản CCoding.

---

## 7. Lệnh đã chạy (kiểm tra không gọi LLM)

Môi trường: Git Bash trên Windows 11, Node v24.14.0, nhánh `ccoding/t-20261102-175854-65c--s2`. Thư mục tạm ngoài repo: `C:\Users\admin\AppData\Local\Temp\tmp.D21Vf9OIYe`.

| Lệnh | Exit | Kết quả (nguyên văn rút gọn) |
|---|---|---|
| `node bench/vs-claude/run.mjs --arms oracle,null --repeats 1 --out <tmp>/selftest` | 0 | 26 lượt: 18 chấm được (oracle 1,00; null 0,00–0,22); **8 dòng `ERROR Error: ENOENT: no such file or directory, lstat '…\tasks\<id>\repo'`** cho `l2-knights`, `r1-elk-design`, `l1-oncall`, `a1-ambiguous-spec` (mỗi bài 2 dòng: null, oracle). `run.mjs` thoát 0 dù có lỗi |
| `node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --tasks c1,c2,c3,c4,c5,l3,l4,s1,re1 --repeats 3 --timeout 20 --dry-run --out bench/vs-claude/results/s2` | 0 | `54 runs -> C:\Users\admin\CCoding\workspaces\ccoding-research\wt-T-20261102-175854-65c--S2\bench\vs-claude\results\s2` rồi 54 khóa (đầu: `l4-startup-order__B0__r1`, `l4-startup-order__A0-sonnet__r1`, `c2-burst-alert__A0-sonnet__r1` …). Không tạo thư mục; `git status --short` rỗng |
| `node --test bench/vs-claude/harness/stats.test.mjs` | 0 | `ℹ tests 12 · ℹ pass 12 · ℹ fail 0 · ℹ cancelled 0 · ℹ skipped 0 · ℹ todo 0` |
| `node docs/research/performance/scripts/token-analysis.mjs --check docs/research/performance/token-analysis.md` | 1 | **lỗi đã có ở baseline** (bảng cũ thiếu vòng C9); không thuộc hạng mục này |

Chưa chạy được: dry-run của lệnh Nhánh 2 (bài T5/N4 và arm `FL` chưa có trong worktree này nên `run.mjs` sẽ báo `Unknown arm`/bỏ bài). Phải chạy lại `--dry-run` cho từng lệnh Nhánh 2 sau khi Phòng Dev merge.

## 8. Rủi ro và giả định chưa kiểm

| # | Rủi ro / giả định | Tác động | Cách giảm |
|---|---|---|---|
| R1 | Hạn mức dùng chung; giám đốc dùng CCoding song song | ngân sách cửa sổ thấp hơn 22 triệu | xác nhận không dùng; ghi M thực dùng sau mỗi cửa sổ |
| R2 | Hạn mức tính theo USD thay vì token | A0-opus, B3 đắt hơn kế hoạch | đã quy theo USD; hai arm xếp cuối |
| R3 | Hệ số B5, A1, B3 và bài không phải coding ngoại suy ±50–100 % | sai lệch cửa sổ | đo lại sau W1; cắt theo thứ tự §3.2 |
| R4 | Credit hết hạn 5/11 không rõ giờ | W6 không chắc | chỉ W1–W5 tính "đạt" |
| R5 | Các arm chạy ở cửa sổ khác nhau (A0-sonnet r1–3 chỉ ở W1) | trôi theo thời gian/tải | A0-sonnet chạy xen kẽ r4–r5 cùng B0 (Nhánh 1); so A0-sonnet W1 với t1–t5 của C9 để kiểm trôi |
| R6 | `size` của t1–t5 và gán H4 ở l3, r1 chưa nhất quán | H1, H4, H10 sai bài | để S1 xử lý; kế hoạch dùng đúng `analyze.mjs` |
| R7 | Nhiệm vụ CCoding còn chạy sau khi Ctrl-C `run.mjs` | tiêu hạn mức ngoài số đo | hủy nhiệm vụ đang chạy qua `POST /api/tasks/<id>/cancel` (`lib/ccoding.mjs:36` dùng được endpoint này; chưa kiểm khi dừng ngoài) |
| R8 | `pairwise` và `--judge` dùng Opus: tốn hạn mức, và giám khảo LLM chấm sản phẩm của LLM | sai lệch/tốn | số liệu chi phí là giả định (30k, 85k); xem S1 |

## Giới hạn

- **Không có số đo cho A1, A2, B1–B5, FL ngoài t1–t5, và mọi bài không phải coding**; ước lượng chúng là giả định (§1.2). Mọi σ cho H3, H4, H9, H10 là giả định.
- **Một điểm dữ liệu cho hạn mức** (4,5 giờ ngày 2/11); không biết quy tắc tính.
- B0 hiện tại chưa đo; B0 cũ (14e2ec6) có thể tốn khác.
- Không chạy lượt LLM, không chạy pilot; chưa kiểm `dist/cli.js serve` trong worktree này.
- Kết quả âm tính báo trước: H8, H9, H10, H7 (Nhánh 2) và B-02 thống kê **không đạt trước 5/11** theo thiết kế; B-01 trên FL dự đoán **không tương đương** theo C7+C9.

## Phụ lục A. Mô hình chi phí (tái lập §1.3, §3)

Lưu tạm ngoài repo (`/tmp/rp/model.mjs`, Node). `cost(arm, task) = [max(A0[t][0]·mult_token, sàn_k), max(A0[t][1]·mult_wall, sàn_s)]`; `block(arms, tasks, reps)` cộng chi phí các lượt, cộng 30k + 30 s cho mỗi lượt `--judge` ở a1, r1, và 85k + 50 s cho mỗi cặp pairwise ở a1, r1, re1.

```js
const A0 = { c1:[90,65], c2:[80,45], c3:[170,105], c4:[130,90], c5:[210,165],
  t1:[90,65], t2:[77,42], t3:[170,105], t4:[75,68], t5:[208,165],
  l1:[30,30], l2:[40,40], l3:[50,45], l4:[50,45], s1:[80,90], a1:[50,60], r1:[70,90], re1:[100,120] };
// [hệ số token, hệ số thời gian, sàn k token, sàn giây]
const MULT = { 'A0-sonnet':[1,1,0,0], B0:[5,4.5,300,200], B5:[2.5,2,150,100], FL:[3.1,1.75,250,120],
  A1:[1.6,1.8,0,0], A2:[3.3,3.3,0,0], 'A0-opus':[3.8,2.2,0,0], B3:[12.5,5.8,750,260] };
```

Tổng theo khối (M quy đổi / giờ wall-sum): A0-sonnet+B0 R9 r3 = 17,8/3,6 (kể cả pairwise re1); B5 R9 r3 = 7,4/1,3; A1 R9 r3 = 4,6/1,2; A2 R9 r3 = 9,5/2,1; A0-opus R9 r3 = 10,9/1,4; B3 R9 r1 = 12,3/1,2; s1 bổ sung r4–10 (A0+B0) = 3,4/1,0; bổ sung r4 hoặc r5 cho A0+B0 R9 ≈ 5,9/1,2 mỗi tầng (11,7/2,4 cả hai); Nhánh 2: A0+B0 N4 r3 (+judge, pairwise) = 5,2/1,2; A0+FL T5 r3 = 7,7/1,1; B5 R13 r3 = 9,2/1,7; FL R13 r3 = 12,5/1,7 (cộng 0,2 judge); FL T5 r4–9 = 11,7/1,4; A0 T5 r4–9 ≈ 3,7/0,7; a1 bổ sung r4–11 (+judge) = 3,3/0,7; A1 R13 r1 ≈ 1,8/0,5; A1 R13 r3 = 5,5/1,5; A2 R13 r3 = 11,4/2,7; B0 T5 r3 = 9,3/1,7; H7 bổ sung R13 = 14,6/3,1; A0-opus R13 r3 = 13,1/1,8; B3 R13 r1 = 15,4/1,6.

Số đo §1.1 và tổng cửa sổ §2 tính từ `runs.csv` bằng `parseCsv` của `harness/stats.mjs`: lọc `status === 'done'`, trọng số = `input + 1,25·cache_write + 0,1·cache_read + 5·output`, trung vị/p10/p90 theo `system` và `task`; §2 lọc `started >= 2026-11-02T02:00`.
