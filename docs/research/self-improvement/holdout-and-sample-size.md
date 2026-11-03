# B-19 / S2a — Bộ bài giữ lại (khóa hash) và cỡ mẫu A/B của vòng tự cải thiện RQ5

> Phòng Nghiên cứu · vòng 4, gói 7, hạng mục S2a (@data-scientist) · 3/11/2026 · phân loại dữ liệu: nội bộ. Đầu vào của `implementation-spec.md` (S2b). Mọi bảng §2 và §4 là đầu ra nguyên văn của `docs/research/self-improvement/holdout-sample-size.mjs`; kiểm bằng `--check`. Không chạy benchmark mới; không sửa `src/`, `bench/`.

## Tóm tắt

- **Bộ giữ lại: 10 bài** (c1–c5, l1-oncall, l2-knights, l3-reconcile, l4-startup-order, s1-sec-review), loại t1–t5, g1–g6, `l1-modules`/`l2-chain` (B-15) và 3 bài chấm bằng LLM-judge (a1, r1, re1). Hash SHA-256 của `task.json` và thư mục `hidden/` đã **khóa trước** (`holdout-lock.json`, §2); script từ chối tính cỡ mẫu nếu lệch.
- **Cỡ mẫu (giả định D5, τ² = 0):** sàng lọc **r = 3** lượt/nhánh/bài (60 lượt); xác nhận **r = 8** lượt/nhánh/bài (160 lượt). Chỉ số ràng buộc là **wall-clock** (σ² dữ liệu: r = 8 ở α = 0,05; 10 ở Holm xấu nhất), không phải token (r = 4–5) hay test đạt (r = 5–6).
- **Cảnh báo chính:** phương sai giữa lượt đo được rất nhỏ (σ²_w token 0,0067, n = 37, chỉ 3 lượt mỗi ô, một ngày chạy) nhưng **τ² (bản vá × bài) chưa có số đo**. Khi τ² = 0,0005 thì với r = 8 cần 11–15 bài cho wall-clock (SS-6); khi τ² = 0,002 cần 16–25 bài. Phải đo lại τ² ở pha sàng lọc rồi tính lại T trước khi chạy xác nhận.
- **Điểm số gần trần:** B0 đạt 1,000 trên cả 10 bài; chỉ c3 và l1-oncall có biến thiên ở nhánh khác. Chỉ số an toàn (test đạt) trên bộ này chỉ phát hiện được **hồi quy từ trần**, không đo được cải thiện chất lượng.

## Tệp đã lưu

- `docs/research/self-improvement/holdout-and-sample-size.md` (tệp này).
- `docs/research/self-improvement/holdout-sample-size.mjs` (script: `--hash`, `--size`, `--check`).
- `docs/research/self-improvement/holdout-lock.json` (hash đã khóa, 10 bài).

## Dữ liệu

- Bài: `bench/vs-claude/tasks/*` (commit nhánh `c63b4ed`). Kết quả: `bench/vs-claude/results/study-cloud/runs.jsonl`, 448 dòng, blob git `9131f7768ff1badc4f50264de37ac4cae1bc0d5c`, commit cuối đổi tệp `e8354fa`. Bộ lọc `classifyRows().kept` ∩ `status = done` (giống `variance-decomposition.mjs`). Bài tổng hợp, không có dữ liệu cá nhân thật.
- **A = nhánh B0** (CCoding mặc định, nhánh sẽ bị vá). Đây là **giả định**: runs chạy ngày 2/11/2026 ở ba cửa sổ (SS-0), trước mọi bản vá; vòng RQ5 phải đo lại A trong chính lượt A/B (xen kẽ A/B, design.md §7).

## Giao thức đánh giá

Chốt trước khi tính (D6): **bước 1** hash (§2) → **bước 2** cỡ mẫu (§4). Thứ tự được thực thi bởi script: `--size` đọc `holdout-lock.json`, so lại hash hiện tại, lệch thì `exit 1`.

- **Chọn bài:** theo tiêu chí hình thức §1, không theo kết quả A/B (chưa có lượt A/B nào).
- **Ngưỡng (D5, giả định do giám đốc chốt, design.md §5.3):** token — cận trên 95 % của B/A < 0,95 (bản vá tối ưu) hoặc < 1,05 (P4, "không xấu đi"); an toàn — biên không thua kém −2 điểm phần trăm test ẩn đạt; thời gian — cận trên < 1,05. α = 0,05 hai phía, power 0,8 (**giả định**). Holm trên 3 chỉ số: báo cả α = 0,05 và α = 0,05/3 (cận xấu nhất của Holm).
- **Mô hình:** ℓ_t = TB ln B − TB ln A theo bài; Var = τ²/T + 2σ²_w/(T·r). τ² = 0 dùng `requiredRuns()` của `bench/vs-claude/harness/stats.mjs` (r = ⌈n/T⌉); τ² > 0 dùng công thức đóng trong script (**không phải** `stats.mjs`, không kiểm độc lập; ở τ² = 0 trùng `requiredRuns`).
- **Kịch bản phương sai:** thấp (×0,5), vừa (dữ liệu B0), cao (×2) — cùng quy ước K3 gấp đôi của `variance-decomposition.md`. Mức hiệu ứng thật giả định: token B/A = 0,90 (nhạy: 0,85); P4 và thời gian: 1,00.
- **Thay đổi so với design.md §5.4 (D7):** t1–t5, g1–g6 chỉ dùng chẩn đoán ở bước gom nhóm lỗi; **cả hai pha** sàng lọc và xác nhận chạy trên bộ giữ lại; kết luận chỉ lấy từ pha xác nhận, không gộp lượt sàng lọc. Bộ giữ lại ở đây **đã từng chạy** với các nhánh nghiên cứu (không có bài chưa từng chạy), khác "chưa từng chạy với bất kỳ nhánh nào" của §5.4; phần bù là: chưa dùng để chẩn đoán hay viết bản vá, và không có lượt nào chạy với prompt đã vá.

## 1. Chọn và loại từng bài (ứng viên theo đề bài: 13 bài)

Kiểm: `git log -- bench/vs-claude/tasks`, `grep` tên bài trong `improvement-backlog.md`, `preregistration.md`, `analysis/cache-diagnostic-spec.md`, và đếm dòng `runs.jsonl` theo bài/nhánh (lệnh ở "Tái lập"). Cả 13 ứng viên **đã có lượt chạy** ở study-cloud (25–41 dòng mỗi bài, nhiều nhánh) vì là bộ đo của giám đốc; không bài nào được nhắc làm đầu vào B-12 (bộ g1–g6, đã loại), B-15 (`l1-modules`, `l2-chain`, đã loại) hay B-16 (dùng bộ B-12).

| Bài | Quyết định | Lý do |
| --- | --- | --- |
| c1-iis-ecs, c2-burst-alert, c4-audit-chain, c5-tickets-api | **Chọn** | chấm bằng test ẩn tất định (`grader: code`); B0 đạt 1,000 (trần); cho token/thời gian và nhạy hồi quy an toàn |
| c3-shop-bugs | **Chọn** | như trên; một nhánh CCoding khác có lượt không đạt (SD điểm 0,0711): bài nhóm code còn dư địa |
| l1-oncall | **Chọn** | `grader: exact` (`answer.json`) tất định; SD điểm 0,0821 (A0-sonnet 2/3 đạt) |
| l2-knights, l3-reconcile, l4-startup-order | **Chọn** | `grader: exact` tất định; thêm bài logic để bộ không chỉ là code |
| s1-sec-review | **Chọn** | chấm tất định theo recall/precision của `issues.json`; 10 lượt B0 cho ước lượng phương sai tốt nhất |
| a1-ambiguous-spec, r1-elk-design | **Loại** | `grader: checklist` cần `--judge` (LLM chấm, SR-07): lượt chấm ngoài `Orchestrator.call()` của vòng này và thêm một nguồn phương sai; đã dùng làm gold/agreement (`analysis/gold-key.csv`) |
| re1-lit-synthesis | **Loại** | `grader: research`; SR-07 cho chấm judge nhóm a1/r1/re1; chưa kiểm tay cách chấm nên loại thận trọng |
| t1–t5, g1–g6 | **Loại** (D7) | chỉ dùng chẩn đoán; g1–g6 thuộc B-12 |
| l1-modules, l2-chain | **Loại** | B-15 (arm B1 trên hai bài này) |

**Test ẩn ngoài đường dẫn agent đọc được (đã kiểm bằng đọc mã và grep, chưa chạy harness):** (1) `hidden/` nằm cạnh `repo/` trong `tasks/<bài>/`, không nằm trong `repo/`; (2) grep `hidden|solution|answer.json|checklist` trong `repo/` của 10 bài cho 0 tệp, và `brief`/`deliverable` trong `task.json` không chứa `hidden`, `solution`, `../`; (3) `harness/run.mjs` chép `starter` vào thư mục làm việc (dòng 59) và chỉ chép `hidden/` vào thư mục chấm riêng `grade-*` (dòng 208–209); cờ `leak` (dòng 248) dò đường dẫn `bench/tasks|hidden|test-hidden`.

**Hai điểm cần Phòng Dev xác nhận (chưa kiểm được vì không chạy harness):** (a) harness đọc `tasks/<bài>/starter`, trong khi 13 bài ứng viên có `repo/` (chỉ `l1-modules`, `l2-chain` có `starter/`) — cần xác nhận harness hay lược đồ bài đã đổi; (b) runtime `claude-cli` không có sandbox: agent biết đường dẫn tuyệt đối vẫn đọc được `tasks/*/hidden/` nếu máy bench cùng đĩa. Biện pháp: `hidden/` chỉ gắn vào bước chấm (ngoài cây thư mục agent) và theo dõi cờ `leak`; B-18 (sandbox) giảm nguy cơ nhưng chưa phải điều kiện đã có.

## 2. Bước 1 — Hash đã khóa (trước khi tính cỡ mẫu)

Lệnh: `node docs/research/self-improvement/holdout-sample-size.mjs --hash` → exit 0. 10 dòng "có" được chép vào `holdout-lock.json`.

| Bài | Trong bộ giữ lại | sha256 task.json | Số tệp ẩn | sha256 thư mục hidden/ |
| --- | ---: | ---: | ---: | ---: |
| c1-iis-ecs | có | `cfab976b556d8d03e3b4c65f14a36419c3c3b35f194e4c8c3655fce492202deb` | 2 | `6565ca2323bc4865d2473454acaf9688182c35fe6c796ee2d8eef921b950e108` |
| c2-burst-alert | có | `308513e6112e6d73d38ce771568a7d1316437c64870e0cca847a9d916d78cbf8` | 2 | `5277755da8e57382dd844060a24c83c41afe62d67bd18dd24564052eb0a70fc7` |
| c3-shop-bugs | có | `723e266c61c51416e715d7e35c5a1d1a8eaa79f626b94356f49a32bbdb2b9d9a` | 4 | `77b7e695fedaa8ec1b96486be5ca951a71e7a282f3a013bed68326c8f5109494` |
| c4-audit-chain | có | `6ac634a94400520fe25cfe48f0de5e673a3aba8c0549ba9b6b04f583653e1a28` | 2 | `dec3ef65f5b30b0103528630445d235460e019e511cee3646b0c4904f8a8a433` |
| c5-tickets-api | có | `132988780f1f52fdcab5fad058927911b211cc6d456acc0b96e9c88c5ac9eeaf` | 2 | `2648b012cf765f509aba7004643d8cfd7bc950545b981d93ab419e0e98b7b8e1` |
| l1-oncall | có | `59c1d04f2e1f6eec6f14619dab134fae2720569d63c3d24d3313f5b8a9903b8c` | 1 | `6dd47dfb85226e100acc7686922a600dbae8cc40c36ba29a0a6c17f1a21551c3` |
| l2-knights | có | `9701823e9a5f5f0a7e98a7a32f8b905ca7bf6c2f1482a8e405362e144d1c5171` | 1 | `a08e8d994b0618119ed905aa7d6e54d09e7077db87306a59e4fc1fcd52e44588` |
| l3-reconcile | có | `357593db167c54b4f307b9bb66771910bdb32ab71d857ff1a93a9a24fc055073` | 1 | `bd033ab3712ab6e5cad7373207deb4e75ebfb48172ec94c49457434331171701` |
| l4-startup-order | có | `cf69a6939604dfd8ff06480b90aa4f4da693d98a0c107393c24e20ac367e0580` | 1 | `25d0003e3e422de9bfd3340f43bc926a2d9c46f4ec87b33612f1d21ddf224b31` |
| s1-sec-review | có | `8c5f1505c2b8747c91b8f20d657ed0e8d821d5d1ea9a4bcc822d2172cdef1b02` | 2 | `278257718ce3da6a4c31b24cff68ad42d550432a4c1de9b94a557bd274614540` |
| a1-ambiguous-spec | không (loại, §1) | `816faacafbdeecd76f5e50b2d86b8f330411279961caeb4b638ab255a9eea57a` | 2 | `e485ae20ed85244435b66edfb02d630c2bf01fd60574543c411b18e2efcae569` |
| r1-elk-design | không (loại, §1) | `d02c4171e1959913708fbb140c85e2b4dff07f51342d437cab8d63e4f11ef218` | 2 | `b2632723fd1695f643d8a87c49bb8b202334d4e6e06d898f0cd541bf1d2f1532` |
| re1-lit-synthesis | không (loại, §1) | `1b2733539d3b548e3b44b97ed43ef4c7693db37d27b5b0820b0e4a3690b4838e` | 2 | `75ed1d692b2dd3314cdc87bf4654eb3b8974e4b2ea70585e46c186ace9ecf150` |

Quy ước: sha256 chuẩn hóa CRLF → LF (như `prereg-tests.mjs`); hash thư mục = sha256 của các dòng `đường dẫn tương đối<TAB>sha256 tệp` sắp theo tên, mỗi dòng kết thúc bằng LF.

## 3. Điều kiện đọc §4

- **Nguồn phương sai (SS-1):** B0, 10 bài, n = 37 lượt done, 27 bậc tự do; ba cửa sổ ngày 2/11/2026 (W1 24, W2a 6, W2c 7 lượt; SS-0); `runs.jsonl` blob `9131f77…`, commit cuối `e8354fa`. Mỗi ô (bài × nhánh) chỉ 3 lượt, riêng s1 10. **n quá nhỏ để ước lượng tin cậy:** σ²_w token B0 = 0,0067, thấp hơn nhiều so với A0-sonnet (0,0295) và σ²_B của t1–t5 trong `variance-decomposition.md` (0,0717). Vì vậy bảng có ba kịch bản (×0,5; ×1; ×2); coi kịch bản **cao** là kịch bản lập kế hoạch an toàn cho tới khi có ≥ 5 lượt mỗi ô.
- **τ² không có số đo.** Chưa có cặp A/B theo bản vá, nên τ² là tham số kịch bản (0; 0,0005 ≈ SD hiệu theo bài 2,2 %; 0,002 ≈ 4,5 %; 0,01 = 10 %). Với T = 10, τ² = 0,01 làm mọi chỉ số "vô hạn" (SS-3); ở σ² vừa, wall-clock cần r = 9 khi τ² = 0,0005 và r = 22 khi τ² = 0,002 (α = 0,05); **thêm lượt không bù được thiếu bài** (SS-6).
- **An toàn (SS-4):** SD điểm lấy từ mọi nhánh CCoding (0,0336) vì B0 một mình có SD 0 (trần ở cả 37 lượt). r = 5–8 chỉ khi τ² ≈ 0; SD ×2 cần 18–32. 8/10 bài chạm trần nên phép đo chỉ thấy hồi quy từ trần.
- **Wall-clock phụ thuộc máy:** design.md §7 ghi Windows chậm 2–3× và hạn mức 5 giờ; σ²_w wall lấy từ dữ liệu cloud Linux. Chạy A/B xen kẽ trong cùng cửa sổ để triệt phần này.

## 4. Bước 2 — Cỡ mẫu (đầu ra của `--size`)

Lệnh: `node docs/research/self-improvement/holdout-sample-size.mjs --size` → exit 0 (sau khi hash khớp `holdout-lock.json`). Phần dưới là đầu ra nguyên văn.

### SS-0. Xuất xứ lượt B0 trên các bài giữ lại (cửa sổ chạy theo `WINDOWS` của prereg-tests.mjs)

| Cửa sổ | n lượt B0 | từ | đến |
| --- | ---: | ---: | ---: |
| W1 | 24 | 2026-11-02T11:44:04.212Z | 2026-11-02T13:15:19.429Z |
| W2a | 6 | 2026-11-02T13:37:36.558Z | 2026-11-02T14:42:21.979Z |
| W2c | 7 | 2026-11-02T16:23:52.952Z | 2026-11-02T16:40:10.650Z |

Trung bình mỗi lượt B0: 196,1 nghìn token quy đổi, 169,1 giây.

### SS-1. Nguồn phương sai: σ²_w giữa lượt trong bài (gộp ΣSS/Σ(n−1)) trên các bài giữ lại

| Nhánh dữ liệu | n lượt done (kept) | bậc tự do | σ²_w ln(token quy đổi) | σ²_w ln(wallSec) | SD điểm (test ẩn) |
| --- | ---: | ---: | ---: | ---: | ---: |
| B0 (CCoding mặc định) | 37 | 27 | 0,0067 | 0,0109 | 0,0000 |
| B7 (CCoding làn đơn) | 30 | 20 | 0,0046 | 0,0099 | 0,0000 |
| mọi nhánh CCoding (B0,B5,B6,B7,A1,A2) | 175 | 115 | 0,0080 | 0,0127 | 0,0336 |
| A0-sonnet (không CCoding; chỉ đối chiếu) | 37 | 27 | 0,0295 | 0,0514 | 0,0524 |

Dữ liệu: `bench/vs-claude/results/study-cloud/runs.jsonl`, bộ lọc `classifyRows().kept` ∩ `status = done` (giống `variance-decomposition.mjs`). Chỉ các bài giữ lại. Không lọc theo điểm.

### SS-2. Theo bài (nhánh B0): n, σ²_w token, σ²_w wallSec, điểm TB; SD điểm theo mọi nhánh CCoding

| Bài | n (B0) | σ²_w token | σ²_w wallSec | điểm TB (B0) | SD điểm (mọi nhánh CCoding) |
| --- | ---: | ---: | ---: | ---: | ---: |
| c1-iis-ecs | 3 | 0,0001 | 0,0111 | 1,000 | 0,0000 |
| c2-burst-alert | 3 | 0,0059 | 0,0140 | 1,000 | 0,0000 |
| c3-shop-bugs | 3 | 0,0003 | 0,0133 | 1,000 | 0,0711 |
| c4-audit-chain | 3 | 0,0019 | 0,0007 | 1,000 | 0,0000 |
| c5-tickets-api | 3 | 0,0096 | 0,0025 | 1,000 | 0,0000 |
| l1-oncall | 3 | 0,0001 | 0,0016 | 1,000 | 0,0821 |
| l2-knights | 3 | 0,0047 | 0,0093 | 1,000 | 0,0000 |
| l3-reconcile | 3 | 0,0002 | 0,0072 | 1,000 | 0,0000 |
| l4-startup-order | 3 | 0,0017 | 0,0111 | 1,000 | 0,0000 |
| s1-sec-review | 10 | 0,0147 | 0,0170 | 1,000 | 0,0000 |

### SS-3. Số lượt r mỗi nhánh mỗi bài, pha xác nhận (T = 10 bài, power 0,8, hai phía)

| Chỉ số và giả định hiệu ứng | Δ (thang ln) | α | τ² | r, σ² thấp (×0,5) | r, σ² vừa (dữ liệu B0) | r, σ² cao (×2) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05 | 0,0000 | 2 | 4 | 8 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05 | 0,0005 | 3 | 5 | 9 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05 | 0,0020 | 4 | 8 | 16 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05 | 0,0100 | vô hạn | vô hạn | vô hạn |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05/3 (Holm xấu nhất) | 0,0000 | 3 | 5 | 10 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05/3 (Holm xấu nhất) | 0,0005 | 3 | 6 | 12 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05/3 (Holm xấu nhất) | 0,0020 | 9 | 17 | 34 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,0541 | 0,05/3 (Holm xấu nhất) | 0,0100 | vô hạn | vô hạn | vô hạn |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05 | 0,0000 | 1 | 1 | 2 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05 | 0,0005 | 2 | 2 | 2 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05 | 0,0020 | 2 | 2 | 2 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05 | 0,0100 | 2 | 3 | 5 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05/3 (Holm xấu nhất) | 0,0000 | 1 | 2 | 3 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05/3 (Holm xấu nhất) | 0,0005 | 2 | 2 | 3 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05/3 (Holm xấu nhất) | 0,0020 | 2 | 2 | 3 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,1112 | 0,05/3 (Holm xấu nhất) | 0,0100 | 4 | 8 | 15 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0000 | 3 | 5 | 9 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0005 | 3 | 6 | 11 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0020 | 7 | 14 | 27 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0100 | vô hạn | vô hạn | vô hạn |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0000 | 3 | 6 | 12 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0005 | 4 | 8 | 16 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0020 | 25 | 50 | 99 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0100 | vô hạn | vô hạn | vô hạn |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0000 | 4 | 8 | 15 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0005 | 5 | 9 | 18 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0020 | 11 | 22 | 43 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05 | 0,0100 | vô hạn | vô hạn | vô hạn |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0000 | 5 | 10 | 20 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0005 | 7 | 13 | 25 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0020 | 40 | 80 | 160 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,0488 | 0,05/3 (Holm xấu nhất) | 0,0100 | vô hạn | vô hạn | vô hạn |

Δ = khoảng cách giữa hiệu ứng thật giả định và ngưỡng. r = ⌈n/T⌉ với n = `requiredRuns({sigma, delta, alpha, power})` khi τ² = 0; τ² > 0 theo công thức đóng ở đầu script (không phải `stats.mjs`). "vô hạn" = τ²/T lớn hơn SE mục tiêu: thêm lượt không giúp, phải thêm bài.

### SS-4. An toàn (test ẩn đạt, biên không thua kém −2 điểm phần trăm; hiệu ứng thật giả định 0)

| α | Kịch bản SD điểm | SD điểm | r (τ² = 0) | r (τ² = 0,0001; SD hiệu theo bài ≈ 1 pp) | r (τ² = 0,0004; ≈ 2 pp) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0,05 | SD ×0,5 | 0,0168 | 2 | 2 | 6 |
| 0,05 | SD đo được | 0,0336 | 5 | 6 | 21 |
| 0,05 | SD ×2 | 0,0671 | 18 | 23 | 83 |
| 0,05/3 (Holm xấu nhất) | SD ×0,5 | 0,0168 | 2 | 2 | vô hạn |
| 0,05/3 (Holm xấu nhất) | SD đo được | 0,0336 | 6 | 8 | vô hạn |
| 0,05/3 (Holm xấu nhất) | SD ×2 | 0,0671 | 24 | 32 | vô hạn |

SD gộp theo mọi nhánh CCoding vì B0 một mình gần như luôn đạt trần. Điểm gần trần làm SD nhỏ: r thấp ở đây phản ánh trần, không phải phép đo nhạy.

### SS-5. Pha sàng lọc: tỉ số B/A nhỏ nhất phát hiện được (power 0,8, α = 0,05 hai phía, τ² = 0), T = 10

| r mỗi nhánh mỗi bài | Chỉ số | Lượt mỗi nhánh | B/A phát hiện được, σ² thấp (×0,5) | B/A phát hiện được, σ² vừa (dữ liệu B0) | B/A phát hiện được, σ² cao (×2) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | token | 20 | ×1,053 | ×1,075 | ×1,108 |
| 2 | wallSec | 20 | ×1,068 | ×1,097 | ×1,140 |
| 3 | token | 30 | ×1,043 | ×1,061 | ×1,088 |
| 3 | wallSec | 30 | ×1,055 | ×1,078 | ×1,113 |
| 4 | token | 40 | ×1,037 | ×1,053 | ×1,075 |
| 4 | wallSec | 40 | ×1,047 | ×1,068 | ×1,097 |

Sàng lọc chỉ để loại bản vá xấu rõ (D7, design.md §5.3). Đọc: B/A ≥ giá trị trong ô thì sàng lọc phát hiện với xác suất ≥ 0,8.

### SS-6. Số bài T cần khi τ² > 0 (σ² vừa, r cố định)

| Chỉ số và giả định hiệu ứng | α | τ² | T khi r = 6 | T khi r = 8 |
| --- | ---: | ---: | ---: | ---: |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05 | 0,0005 | 8 | 6 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05 | 0,0020 | 12 | 10 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05 | 0,0100 | 33 | 32 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0005 | 10 | 8 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0020 | 16 | 14 |
| token: B/A thật 0,90, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0100 | 44 | 42 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05 | 0,0005 | 2 | 2 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05 | 0,0020 | 3 | 3 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05 | 0,0100 | 8 | 8 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0005 | 3 | 2 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0020 | 4 | 4 |
| token: B/A thật 0,85, cần cận trên < 0,95 | 0,05/3 (Holm xấu nhất) | 0,0100 | 11 | 10 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0005 | 10 | 8 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0020 | 14 | 13 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0100 | 41 | 39 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0005 | 13 | 10 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0020 | 19 | 17 |
| token (P4, không xấu đi): B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0100 | 54 | 52 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0005 | 14 | 11 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0020 | 19 | 16 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05 | 0,0100 | 45 | 42 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0005 | 19 | 15 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0020 | 25 | 21 |
| wall-clock: B/A thật 1,00, cận trên < 1,05 | 0,05/3 (Holm xấu nhất) | 0,0100 | 60 | 56 |

T = ⌈(τ² + 2σ²_w/r) / (Δ/(z_{1−α/2} + z_{1−β}))²⌉ (công thức đóng của script, không phải `stats.mjs`).

### SS-7. Chi phí một bản vá (A và B, T bài), ước theo trung bình B0 ở SS-0

| Pha | Tổng lượt (2 nhánh) | Token quy đổi (triệu) | Giờ máy chạy tuần tự |
| --- | ---: | ---: | ---: |
| sàng lọc r = 3 | 60 | 11,8 | 2,8 |
| xác nhận r = 6 | 120 | 23,5 | 5,6 |
| xác nhận r = 8 | 160 | 31,4 | 7,5 |
| xác nhận r = 10 | 200 | 39,2 | 9,4 |

Ước thô: mỗi lượt A và B tốn như B0 trung bình; không tính lượt hỏng/xóa, nạp lại cache, thời gian chờ hạn mức 5 giờ.


## 5. Cỡ mẫu đề xuất (S2b dùng nguyên các số này)

| Pha | r mỗi nhánh mỗi bài | Bài | Lượt mỗi nhánh | Tổng lượt | Căn cứ |
| --- | ---: | ---: | ---: | ---: | --- |
| Sàng lọc (chỉ loại bản vá xấu rõ) | 3 | 10 | 30 | 60 | SS-5: phát hiện B/A ≥ ×1,061 (token), ×1,078 (thời gian) ở σ² vừa; ×1,088 / ×1,113 ở σ² cao. Cũng để ước lượng τ² và σ²_w trước pha xác nhận |
| Xác nhận (kết luận) | 8 | 10 | 80 | 160 | SS-3, τ² = 0, σ² vừa: wall-clock 8 (α = 0,05) / 10 (Holm); token 4–5; an toàn 5–6 (SS-4). Chọn 8 để phủ wall-clock ở α = 0,05; **nâng lên 10** nếu giám đốc muốn phủ Holm xấu nhất |

Quy tắc đi kèm (đề xuất cho S2b, giả định):
1. Sau sàng lọc, ước lượng τ² từ độ lệch của ℓ_t giữa các bài; nếu τ² ≥ 0,0005, tính lại T theo SS-6 và **không chạy xác nhận trên 10 bài** — hoặc mở rộng bộ giữ lại (viết bài mới có test ẩn tất định; hoặc cho a1/r1/re1 vào với `--judge` qua `Orchestrator.call()`), hoặc giám đốc nới biên thời gian.
2. Sàng lọc và xác nhận không gộp (D7). Chạy xen kẽ A/B theo khối bài (design.md §7).
3. Tính lại khi n của B0 mỗi ô ≥ 5 hoặc khi mô hình/CLI đổi phiên bản.
4. Chi phí (SS-7): sàng lọc ≈ 11,8 triệu token quy đổi và 2,8 giờ; xác nhận r = 8 ≈ 31,4 triệu và 7,5 giờ, mỗi bản vá, chưa gồm lượt hỏng và chờ hạn mức; pha xác nhận phải chia nhiều cửa sổ 5 giờ.

## Phân tích lỗi

- **Phương sai thấp có thể do mẫu:** 3 lượt mỗi ô, một ngày, ba cửa sổ gần nhau; không kiểm được độ ổn định giữa ngày. Nếu phương sai thật gấp đôi (cột cao), r xác nhận cho wall-clock lên 15–20.
- **Hiệu ứng cửa sổ** (W1/W2a/W2c) nằm lẫn trong σ²_w; không tách được vì mỗi bài chỉ có B0 ở một–hai cửa sổ.
- **Bộ gần trần:** token và thời gian đo được trên 10 bài, nhưng hiệu ứng lên chất lượng thì không (8/10 bài trần).
- Công thức τ² > 0 do script tự đặt; chỉ đối chiếu được với `requiredRuns` ở τ² = 0.

## Tái lập

```
node docs/research/self-improvement/holdout-sample-size.mjs --hash
node docs/research/self-improvement/holdout-sample-size.mjs --size
node docs/research/self-improvement/holdout-sample-size.mjs --check docs/research/self-improvement/holdout-and-sample-size.md
```

Môi trường: Node ≥ 22 (chạy bằng Node 24.14.0), không gói ngoài, offline, không seed (công thức đóng, không mô phỏng). Kiểm bài/nhánh đã chạy: đếm dòng `"<bài>"` trong `bench/vs-claude/results/*/runs.jsonl` và đếm theo (bài, nhánh) với `status = done` trong `study-cloud/runs.jsonl`.

## Giới hạn

- Giả định (D5) chưa kiểm: ngưỡng hiệu ứng, α, power, hiệu ứng thật 0,90/0,85/1,00, biên −2 điểm phần trăm.
- σ²_w từ B0 n = 37; τ² không có số đo; các cột là kịch bản, không phải ước lượng.
- Bộ đã từng chạy ở study-cloud (không "chưa từng chạy" như §5.4); hai điểm harness ở §1 chưa kiểm.
- Kết quả âm tính: với T = 10 và τ² = 0,01 **không** có r nào đủ cho bất kỳ chỉ số nào; với τ² = 0,002 wall-clock cần r = 22 (σ² vừa) đến 43 (σ² cao) ở α = 0,05 (SS-3), tức không thực tế. Cần thêm bài.
- Không chạy benchmark; mọi số cỡ mẫu truy được về `--size` ở §4.
