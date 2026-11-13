# E7: CTO nghiệm thu trên lỗi lọt cổng — sổ chạy

Thiết kế: `docs/research/preregistration.md` §9, "Bản chốt E7 và E8" (v2.6). Sổ tay chạy: `bench/vs-claude/e7/README.md`. Phân loại dữ liệu: **Nội bộ**.

## Trước khi chạy (5/11/2026, người điều phối, không gọi LLM)

- **Lấy mẫu** (`sample.mjs`, trên máy cloud):
  - kho G-4 `g4-survivors.json`, sha256 `8a16ae33…`; `g-mutation.jsonl`, sha256 `782dc8b0…`;
  - được **65 lỗi + 65 đúng ở 8 bài** (trần 10 mỗi bài, tối đa 1 lỗi mỗi lượt): c1 1+1, c2 10+10, c3 10+10, c5 10+10, t1 4+4, t2 10+10, t3 10+10, t5 10+10;
  - `items.json` sha256 `8b4ee9c8…`.
- **Chạy thử bước chuẩn bị trên máy cloud** (Linux, chỉ để kiểm harness; danh sách chốt chính thức làm lại trên máy chạy):
  - chuẩn bị được 128 mục;
  - 2 mục lỗi của `t5-logq` (`fb0117bb43`, `563af1e6d7`) có test ẩn đạt ở cả 3 lần chạy lại, nên bị loại (`label-mismatch`). Dự phòng lỗi của bài chỉ có 1 mục (`9559ed26dc`); mục này đạt và thay cho mục hỏng thứ nhất, mục hỏng thứ hai không còn dự phòng. Vì vậy bài này còn 9 mục lỗi, và 1 mục đúng (`da4d3bf28c`) bị bớt để giữ ghép cặp; tổng 64 lỗi + 64 đúng = 128 _(sửa 13/11/2026 theo `selected.json` của lần chạy cloud: bản trước ghi nhầm "dự phòng cũng không đạt", không khớp với 9 mục lỗi; Phòng Nghiên cứu nêu ở BRIEF-19 K3)_;
  - nguyên nhân: bộ test ẩn của `t5-logq` cho số test khác nhau giữa các lần chạy cùng mã (123–146). Đã chuyển cho Phòng Nghiên cứu ở BRIEF-19 K3 để đánh giá ảnh hưởng tới G-3.
- **Mục chạy thử** (không thuộc mẫu, không vào phân tích): `067cd64cc5`, mục đúng dự phòng của `c1-iis-ecs`.
- **Test:** `npm run test:bench` 258/258, gồm `test/e7.test.mjs` 6/6. Ca R1 chạy qua `Orchestrator` thật với runtime giả: chặn mục lỗi, duyệt mục đúng, văn bản R1 = văn bản R3, không lộ nhãn.

## Mốc khóa và chạy

_(người chạy ghi: hash commit bản ghim, sha256 từng script, phiên bản CLI, sha256 `ccoding.local.json`, giờ bắt đầu từng bước, số mục chốt và mục thay, lỗi hạ tầng, giờ máy, USD. Không ghi kết luận của arm trước khi đủ.)_

### Dựng bản ghim và kịch bản nối tiếp (12/11/2026, người điều phối, được giám đốc giao quyền tự duyệt lúc 22:57)

- **Bản ghim:** `C:\Users\admin\ccoding-vs-claude\ccoding-e78`, detached ở `d70959c0611ad1237f03007576e0d31b344c6fe3`. Từ `cd90988` (mốc khóa E7/E8) tới bản này chỉ thêm dữ liệu và RUNLOG; không đổi `src/` hay `bench/vs-claude/e7`, `e8`.
  - `npm ci` và `npm run build` xong (`npm-setup.log` có SETUP-OK).
  - `ccoding.local.json` chép từ `ccoding-3e`, sha256 `0ee7b0a6…`.
  - CLI 2.1.318.
- **Kiểm nhanh trên Windows** (`ops/e7-wincheck.mjs`, 2 mục dự phòng, không gọi LLM, không ghi vào `results`):
  - mục lỗi `t2-orders` tìm lại được vị trí đột biến (khớp kiểu `artifact`) và `npm test` xanh;
  - mục đúng `c2-burst-alert` đạt;
  - repo trên Windows dùng `core.autocrlf=true`, nhưng vị trí đột biến vẫn khớp.
- **Kịch bản nối tiếp `e78-run.ps1`** (bản sao `setup/e78-run.ps1`, sha256 `cc729833…`; kèm `setup/e78-check.mjs`, sha256 `d7080ec3…`). Chạy bằng WMI lúc 23:08 ngày 12/11, pid 1244.
  - Chờ dòng "XONG 8 khoi" của B-14, rồi:
    1. E7 chạy thử mục `067cd64cc5`, tự kiểm `promptSha` R1 = R3 và bộ công cụ;
    2. bước 1 (chốt danh sách);
    3. bước 2 (chạy chính);
    4. E8.
  - Gặp hạn mức thì chờ 30 phút, không giới hạn số lần. Chạy lại được sau khi máy khởi động lại.
  - `e78-check.mjs` chỉ đọc trường hạ tầng (`status`, `promptSha`, `tools`, `maxConcSubtasks`), không đọc `verdict`.
- **Sai lệch nhỏ so với sổ tay (`e7/README.md`, bước 2):** `selected.json` và `prep.jsonl` không commit trước bước chạy chính. Thay vào đó, kịch bản ghi sha256 của hai tệp vào `ops/e78-run.txt` trước lượt gọi đầu tiên của bước chính. Lý do: chạy không người trực, không chờ được commit từ máy khác. Mốc giờ trong `selected.json` (`at`) và dòng đầu của `runs.jsonl` cho phép kiểm thứ tự.

### Chạy thử hỏng hai lần, sửa harness và ghim lại (13/11/2026, người điều phối)

Cả hai lần chỉ chạy mục chạy thử `067cd64cc5` (không thuộc mẫu, không vào phân tích). Chưa có lượt gọi LLM nào của bước 1 hay bước 2.

1. **12/11 23:53 UTC, bản ghim `d70959c`: 5 lần exit 1, kịch bản tự dừng (STOP-E78).**
   - Nguyên nhân: lệnh chạy thử trong `e78-run.ps1` không truyền `--items`, nên `run.mjs` đọc `items.json` trong thư mục chạy thử và hỏng `ENOENT` trước khi tải app. Không có lượt gọi LLM.
   - Sửa ở `521c98a`: thêm `--items` trỏ về `results/e7-cto/items.json`; ghi thêm sha256 gộp của `dist` (điều kiện 6 của K3).
   - Ghim lại `ccoding-e78` ở `521c98a` (gồm D14: `autocrlf`, hạn chờ `runCto`, `checkServers`). Từ `d70959c` tới đây không đổi `src/`, `package.json`, `package-lock.json`, nên không build lại; `dist` sha256 gộp `bbd93f0798e9…`.
2. **13/11 03:14 UTC, bản ghim `521c98a`: R1 xong; R3 hỏng 6 lần (mỗi lần khoảng 5 giây), kịch bản tự dừng lúc 03:15.**
   - Nguyên nhân: máy chạy có biến `ANTHROPIC_API_KEY` cấp người dùng (Windows, HKCU). Tiến trình chạy bằng WMI nhận biến này, và `claude -p` của R3 (harness gọi thẳng) dùng khóa thay cho phiên đăng nhập claude.ai. Claude Code báo trên stderr: "ANTHROPIC_API_KEY or another auth source is set and takes precedence over your claude.ai login". Runtime `claude-cli` của CCoding bỏ mọi biến khóa/token (`scrubEnv`), nên R1 không bị.
   - Thông báo lỗi chính của Claude Code nằm trong sự kiện `result`, nhưng harness chỉ lưu stderr, nên không biết khóa bị từ chối vì lý do gì; không lượt nào ra kết quả. Người điều phối chỉ đọc tên biến, không đọc giá trị.
   - Sửa ở `7ff4b9c`:
     - `claudeEnv()` bỏ biến khóa/token cho mọi tiến trình `claude` của harness, cùng mẫu với `scrubEnv`; áp cho `runClaude`, bộ chấm, bước chọn best-of-n và `cache-diagnostic`;
     - mỗi dòng của arm `claude -p` (R3, A0…) ghi `authSource` (trường `apiKeySource` của sự kiện init);
     - lỗi R3 ghi cả thông báo `result`;
     - `e78-check.mjs` đòi R3 `authSource = none` ở chạy thử, và `e78-run.ps1` dừng E7/E8 khi có dòng báo nguồn xác thực khác.
   - Kết quả chạy thử lần 2 chuyển sang `e7-smoke-pin-521c98a` (máy chạy). Chạy thử làm lại cả R1 và R3 ở bản ghim mới.
   - **Ảnh hưởng tới các đợt trước (giới hạn, chưa xác minh trực tiếp được):** các arm `claude -p` đã có dữ liệu (pilot1, b7prime, large-pilot, h6-3e; 2–4/11) không lưu `apiKeySource`. Bằng chứng gián tiếp là A2 của h6-3e (4/11) gặp hạn mức kiểu gói claude.ai ("10pm (Asia/Bangkok)"), tức lúc đó phiên đăng nhập được dùng. Khóa HKCU\Environment ghi lần cuối 5/11 03:09 UTC; mốc này không cho biết biến khóa có từ khi nào. Các đợt chỉ có arm CCoding (B-15f, local-3e, B-14) không bị ảnh hưởng vì runtime `claude-cli` luôn bỏ biến khóa.
3. **Bản ghim mới:** commit chứa mục này; hash, sha256 các script và `dist` ghi ở `ops/e78-run.txt` của máy chạy. Kịch bản `setup/e78-run.ps1` và `setup/e78-check.mjs` ở commit này thay bản `cc729833…`/`d7080ec3…`; sha256 mới ghi ở mục sau khi khởi động.


### Khởi động lại, bước 1 và kiểm nhãn (13/11/2026, người điều phối)

- **03:29:09 UTC**, bản ghim `e15f653`, pid 29080. Kịch bản `e78-run.ps1` sha256 `fc731b8af52f…`, `e78-check.mjs` sha256 `2af2a11820a6…` (bản `ops/` trên máy chạy; bản trong repo sinh ra hai tệp này qua git với `core.autocrlf`). `dist` sha256 gộp `bbd93f0798e9…`, không đổi so với `521c98a`.
- **03:29:53 chạy thử OK:** R1 và R3 đều `done`; `promptSha` R1 = R3; bộ công cụ đúng; R3 `authSource = none` (phiên đăng nhập claude.ai).
- **03:37:33 bước 1 xong:**
  - 128 mục (64 lỗi + 64 đúng); 3 mục bị bỏ hoặc thay: 2 mục lỗi `t5-logq` `label-mismatch` (`fb0117bb43`, `563af1e6d7`) và 1 mục đúng `t5-logq` bớt để ghép cặp (`da4d3bf28c`). Giống hệt lần chạy cloud.
  - `selected.json` sha256 `1263fb7c2ac4…`, `prep.jsonl` sha256 `0c1aa658bc48…`. Hai hash này được ghi vào `ops/e78-run.txt` trước lượt gọi đầu tiên của bước 2 (03:37:34). Hai tệp chép vào repo lúc khoảng 04:20, sau khi bước 2 đã chạy; người điều phối mới chỉ đếm số dòng của `runs.jsonl`.
- **Kiểm nhãn 3 lần (điều kiện 2 của K3; `e7/label-trials.mjs`, không gọi LLM, chạy trên máy cloud Linux, `label-trials.jsonl`):**
  - Cách làm: dựng sản phẩm của từng mục đúng như bước chuẩn bị, rồi chạy test ẩn 3 lần, không dừng ở lần trượt đầu.
  - Kết quả: **cả 64 mục lỗi trượt 3/3; cả 64 mục đúng đạt 3/3**, kể cả 9 mục lỗi và 9 mục đúng của `t5-logq`. Nhãn của danh sách chốt ổn định. Tính không tất định của bộ test ẩn `t5-logq` chỉ làm hỏng 2 mục đã bị loại ở bước 1.
  - Giới hạn: kiểm trên Linux. Trên Windows, bước 1 đã kiểm mỗi mục lỗi tới lần trượt đầu (tối đa 3 lần) và mỗi mục đúng 1 lần.
- **Mã phân tích theo điều kiện đọc K3** (viết trước khi xem dữ liệu bước 2; `e7/analyze.mjs`, `e8/analyze.mjs`, test `test/e7e8-k3.test.mjs`):
  - E7: bảng theo bài; hiệu recall R1 − R3 kèm bootstrap hai tầng theo bài, đọc cùng p của McNemar (< 10 cặp bất đồng thì p chỉ mô tả; hai bên không thống nhất thì "chưa kết luận"); độ nhạy coi "không đọc được kết luận" là chặn (§9 E7 (6)); độ nhạy bỏ `t5-logq`; cờ khi số lượt không đọc được lệch giữa các arm; recall theo số lần trượt khi kiểm nhãn.
  - E8: mô tả theo arm gồm số lượt chạy chồng, số lượt chia dưới 2 hạng mục, cổng kiểm tra cuối, điểm và pass (A0-sonnet làm mốc); câu giới hạn về σ_ln và server A/B.
  - Xung đột khi gộp của E8 lấy sau đợt bằng `p-extract.mjs` (chỉ GET) trên server A và B.

### Gián đoạn do máy chạy khởi động lại (13/11/2026, người điều phối)

- **04:33:54 UTC:** máy chạy khởi động lại. Nhật ký hệ thống (sự kiện 1074) ghi rằng việc khởi động lại do trình cài một phần mềm VPN mà người dùng máy chạy tự mở; không phải lỗi của đợt đo hay của Windows Update. Kịch bản `e78-run.ps1` (pid 29080) chết theo.
- Trước đó có 88 dòng `done` (R1 29, R2 30, R3 29), dòng cuối lúc 04:33:50. Không có dòng `infra` nào.
- Lượt đang chạy dở lúc khởi động lại không để lại dòng nào; nó chạy lại từ đầu khi kịch bản chạy tiếp:
  - `prepareItem` xóa và dựng lại thư mục của từng arm;
  - CCoding đánh dấu nhiệm vụ đang chạy dở là "bị gián đoạn" và không tự chạy tiếp, nên không có lượt gọi thừa.
- **08:53:25 UTC chạy tiếp** (pid 20572). Bản ghim, CLI 2.1.318, `dist` và sha256 các script không đổi (ghi lại ở `ops/e78-run.txt`). Các bước đã xong được bỏ qua: chạy thử, danh sách chốt (sha256 `selected.json` không đổi).
- **Ảnh hưởng:** không đổi mẫu hay thứ tự (thứ tự arm theo mục là cố định). Khoảng trống 4 giờ 20 phút giữa hai phần của đợt được ghi, vì thời gian và cửa sổ hạn mức là thước đo phụ; thước đo chính (chặn hay không) không phụ thuộc thời điểm chạy.
