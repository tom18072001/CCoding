# Test bị bỏ qua có điều kiện (K3, D18d)

Quét `test/` tìm `{ skip: … }`, `t.skip(…)`, `test.skip`, `todo`. Không có `test.skip`/`todo` vô điều kiện và `test/helpers.ts` không có skip gián tiếp. Các chuỗi `skipped` còn lại trong `test/` (accept.skipped, review.skipped, incident.skipped, `status: 'skipped'`…) là tên sự kiện/trạng thái nghiệp vụ, không phải skip của test runner.

## Bảng

| Tệp:dòng | Test | Điều kiện bỏ qua | Nền tảng | Lý do | Cách bật |
|---|---|---|---|---|---|
| `test/agent-probes.test.ts:36` | probe `--self-test` | `dist/kpi.js` không có **và** tự build thất bại | mọi nền tảng | `bench/agent-probes/probe.mjs` import từ `dist/` | Đã sửa (xem dưới): test tự build. Thủ công: `npm run build` |
| `test/agent-probes.test.ts:43` | probe: API gốc Ollama, `num_ctx`, che PII | như trên | mọi nền tảng | như trên | như trên |
| `bench/vs-claude/test/cache-diagnostic.test.mjs:29` | fixture: ra đủ 7 hàng, đúng h, diễn giải khớp G1 | thiếu thư mục `dist/` | mọi nền tảng | bài kiểm nạp bản build của CCoding | `npm run build` rồi chạy lại `npm run test:bench` |
| `bench/vs-claude/test/cache-diagnostic.test.mjs:46` | fixture thiếu lượt → lỗi rõ | như trên | mọi nền tảng | như trên | như trên |
| `test/bench.test.ts:248` | claude-cli: bashMaxOutput → `BASH_MAX_OUTPUT_LENGTH` | `process.platform === 'win32'` | chỉ chạy Linux/macOS | `claude` giả là script shebang (node); Windows không spawn được tệp không đuôi | Chạy trên Linux/macOS/WSL (`npm test`) |
| `test/extract.test.ts:504` | PDF qua pdftotext | `pdftotext -v` không chạy được trong PATH | mọi nền tảng | thiếu poppler-utils | Cài poppler (Windows: MSYS2 `mingw-w64-*-poppler`, Linux: `apt install poppler-utils`), đưa vào PATH |
| `test/extract.test.ts:514` | PDF mã hóa mật khẩu rỗng (qpdf) | `qpdf --version` không chạy được | mọi nền tảng | thiếu qpdf | Cài qpdf (`apt install qpdf` / `winget install qpdf`), đưa vào PATH |
| `test/logview.test.ts:96` | herdr logs: dựng space log, idempotent, `--rebuild` | `process.platform === 'win32'` (`t.skip`) | chỉ chạy Linux/macOS | herdr giả là script shebang; như bench | Chạy trên Linux/macOS/WSL |
| `test/claude-guard-paths.test.ts:77` | symlink/junction trong worktree trỏ ra ngoài bị chặn | `tryLink` ném lỗi (thiếu quyền, hệ tệp không hỗ trợ) | mọi nền tảng; Windows dùng junction (không cần quyền admin) | không tạo được liên kết | Linux/macOS hoặc Windows thường tạo được; nếu skip, kiểm quyền/hệ tệp của thư mục tạm |
| `test/claude-guard-paths.test.ts:121` | junction trong tool-results trỏ ra ngoài | như trên | như trên | như trên | như trên |
| `test/shell-policy-write-outside.test.ts:40` | thư mục hệ thống Windows | `SystemRoot`/`windir` không đặt | thực tế chỉ Windows (biến này có sẵn); Linux skip | cần dựng đường dẫn thư mục hệ thống Windows | Chạy trên Windows, hoặc đặt `SystemRoot=C:\Windows` (chỉ dùng làm chuỗi, không chạm đĩa) |

## Lần chạy thật trên máy này (Windows 11, Node ≥ 22)

`npm test` → exit 0, `tests 797 · pass 794 · fail 0 · skipped 3` (dist/ đã có, `pdftotext` có ở `/mingw64/bin`, `qpdf` không có). Ba test bị bỏ qua:

1. `bench.test.ts:248` (win32)
2. `extract.test.ts:514` (không có qpdf)
3. `logview.test.ts:96` (win32)

Symlink/junction tạo được; `SystemRoot` có.

## Giải thích 4 / 3 / 1

Tập skip chắc chắn theo nền tảng: **Windows** = bench + logview (2 test cố định). Phần còn lại phụ thuộc môi trường: qpdf, pdftotext, `dist/`.

- **3 (máy này, và theo ghi nhận là reviewer):** 2 test win32 + qpdf thiếu. Đo trực tiếp, `dist/` có, `pdftotext` có.
- **4 (CCoding chạy trên Windows):** khớp nhất với 3 ở trên cộng **pdftotext vắng trong PATH của tiến trình CCoding** (extract.test.ts:504). Phương án khác (thiếu `dist/`) sẽ cho **5** (thêm 2 test probe), không khớp 4 nên bị loại. *Giả định, chưa kiểm chứng*: không có log PATH của lượt CCoding để xác nhận; `/mingw64/bin` (nơi có pdftotext) nằm trong PATH của Git Bash nhưng có thể không nằm trong PATH khi CCoding spawn. Cũng có thể trường hợp khác (vd. một test symlink không tạo được liên kết); không loại trừ được.
- **1 (Linux):** 2 test win32 chạy; chỉ còn qpdf (hoặc pdftotext) thiếu nếu `dist/` đã build và một trong hai công cụ chưa cài. *Giả định*: số liệu 1 chưa có log gốc; khớp khi Linux có poppler nhưng không có qpdf.

Điểm lệch giữa môi trường (sau khi đã sửa): chỉ còn `PATH` (pdftotext, qpdf) và nền tảng. `dist/` không còn gây lệch.

Ghi chú: chạy xong thì `skipped` của agent-probes luôn 0 nhờ tự build; trước D18d, trạng thái `dist/` (đã `npm run build` hay chưa) làm số skipped dao động ±2, đây là nguồn lệch số có thật giữa D18a và D18c (giả định về thời điểm build, chưa kiểm chứng bằng log).

## Đã sửa

`test/agent-probes.test.ts`: thay `skip: !built` bằng `ensureBuilt()`, tự chạy `tsc -p tsconfig.json` khi thiếu `dist/kpi.js`; chỉ skip nếu build thất bại, kèm lý do. Đã kiểm: dời `dist/` đi, chạy lại → 2 pass, 0 skipped, `dist/` được dựng lại.

Test win32/qpdf/pdftotext không sửa: thiếu thứ đó là hợp lý theo nền tảng/công cụ ngoài; cách bật ghi ở bảng.

## Đo lại của người điều phối (15/11/2026, sau nghiệm thu D18d)

CTO để mở tiêu chí "giải thích số 4 và 1" vì hai số này còn là giả định. Người điều phối đo lại bằng `npx tsx --test --test-reporter=tap "test/**/*.test.ts"` và lọc dòng `# SKIP`, ở commit `d82a239`.

| Môi trường | pdftotext | qpdf | `SystemRoot` | Số test | Bỏ qua | Test bị bỏ qua |
|---|---|---|---|---|---|---|
| Linux (container cloud, Node 22) | có | có | không đặt | 800 | **1** | `shell-policy-write-outside.test.ts`: thư mục hệ thống Windows (thiếu `SystemRoot`) |
| Windows, `cmd` của phiên tương tác (PATH có `Git\mingw64\bin`) | có | không | có | 797 | **3** | `bench.test.ts` (win32), `extract.test.ts` qpdf, `logview.test.ts` (win32) |
| Windows, tiến trình tạo qua WMI như máy chủ văn phòng (cùng biến `CCODING_*`) | **không** | không | có | 797 | **4** | ba test trên + `extract.test.ts` pdftotext |

Kết luận:
- **Số 4** của văn phòng: đã xác nhận bằng số đo. Tiến trình văn phòng chạy với PATH hệ thống, không có `Git\mingw64\bin`, nên thiếu `pdftotext`. Giả định của K3 đúng.
- **Số 1** trên Linux: giả định của K3 (thiếu qpdf hoặc pdftotext) **sai**. Máy Linux có cả hai công cụ; test bị bỏ qua là `shell-policy-write-outside` vì không có `SystemRoot`.
- **Số 3** của reviewer: khớp phiên `cmd` tương tác (có pdftotext, không có qpdf).
- Một lần chạy toàn bộ trong phiên `cmd` (văn phòng đang chạy hai nhiệm vụ cùng lúc) có 1 test đỏ: `followup-paths.test.ts:139` "D17(c) vòng bổ sung ở làn đầy", nhiệm vụ dừng ở `paused` thay vì `done` sau 15 giây. Chạy riêng tệp đó hai lần đều xanh (khoảng 11 giây), và lần chạy kiểu WMI ở bảng trên cũng xanh. Đây là test chập chờn khi máy tải nặng; giao Dev xử lý ở gói sau.
