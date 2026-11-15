# Test bị bỏ qua có điều kiện (K3, D18d)

Quét `test/` tìm `{ skip: … }`, `t.skip(…)`, `test.skip`, `todo`. Không có `test.skip`/`todo` vô điều kiện và `test/helpers.ts` không có skip gián tiếp. Các chuỗi `skipped` còn lại trong `test/` (accept.skipped, review.skipped, incident.skipped, `status: 'skipped'`…) là tên sự kiện/trạng thái nghiệp vụ, không phải skip của test runner.

## Bảng

| Tệp:dòng | Test | Điều kiện bỏ qua | Nền tảng | Lý do | Cách bật |
|---|---|---|---|---|---|
| `test/agent-probes.test.ts:36` | probe `--self-test` | `dist/kpi.js` không có **và** tự build thất bại | mọi nền tảng | `bench/agent-probes/probe.mjs` import từ `dist/` | Đã sửa (xem dưới): test tự build. Thủ công: `npm run build` |
| `test/agent-probes.test.ts:43` | probe: API gốc Ollama, `num_ctx`, che PII | như trên | mọi nền tảng | như trên | như trên |
| `bench/vs-claude/test/cache-diagnostic.test.mjs:30` | fixture: ra đủ 7 hàng, đúng h, diễn giải khớp G1 | thiếu thư mục `dist/` | mọi nền tảng | bài kiểm nạp bản build của CCoding | `npm run build` rồi chạy lại `npm run test:bench` |
| `bench/vs-claude/test/cache-diagnostic.test.mjs:47` | fixture thiếu lượt → lỗi rõ | như trên | mọi nền tảng | như trên | như trên |
| `test/bench.test.ts:248` | claude-cli: bashMaxOutput → `BASH_MAX_OUTPUT_LENGTH` | `process.platform === 'win32'` | chỉ chạy Linux/macOS | `claude` giả là script shebang (node); Windows không spawn được tệp không đuôi | Chạy trên Linux/macOS/WSL (`npm test`) |
| `test/extract.test.ts:504` | PDF qua pdftotext | `pdftotext -v` không chạy được trong PATH | mọi nền tảng | thiếu poppler-utils | Cài poppler (Windows: MSYS2 `mingw-w64-*-poppler`, Linux: `apt install poppler-utils`), đưa vào PATH |
| `test/extract.test.ts:514` | PDF mã hóa mật khẩu rỗng (qpdf) | `qpdf --version` không chạy được | mọi nền tảng | thiếu qpdf | Cài qpdf (`apt install qpdf` / `winget install qpdf`), đưa vào PATH |
| `test/logview.test.ts:96` | herdr logs: dựng space log, idempotent, `--rebuild` | `process.platform === 'win32'` (`t.skip`) | chỉ chạy Linux/macOS | herdr giả là script shebang; như bench | Chạy trên Linux/macOS/WSL |
| `test/claude-guard-paths.test.ts:77` | symlink/junction trong worktree trỏ ra ngoài bị chặn | `tryLink` ném lỗi (thiếu quyền, hệ tệp không hỗ trợ) | mọi nền tảng; Windows dùng junction (không cần quyền admin) | không tạo được liên kết | Linux/macOS hoặc Windows thường tạo được; nếu skip, kiểm quyền/hệ tệp của thư mục tạm |
| `test/claude-guard-paths.test.ts:121` | junction trong tool-results trỏ ra ngoài | như trên | như trên | như trên | như trên |
| `test/shell-policy-write-outside.test.ts:40` | thư mục hệ thống Windows | `SystemRoot`/`windir` không đặt | thực tế chỉ Windows (biến này có sẵn); Linux skip | cần dựng đường dẫn thư mục hệ thống Windows | Chạy trên Windows, hoặc đặt `SystemRoot=C:\Windows` (chỉ dùng làm chuỗi, không chạm đĩa) |
| `test/diff-read-inside.test.ts` | readInside: symlink/junction thư mục trong worktree trỏ ra ngoài bị chặn | không tạo được symlink/junction | mọi nền tảng (Windows dùng junction) | cần liên kết thật | Kiểm quyền/hệ tệp của thư mục tạm |
| `test/diff-read-inside.test.ts` | readInside: Windows — khác hoa/thường vẫn là cùng thư mục | `process.platform !== 'win32'` | chỉ chạy Windows | Linux/macOS phân biệt hoa/thường nên ca không có nghĩa | Chạy trên Windows |
| `test/same-path.test.ts:36` | samePath: dạng 8.3 và dạng dài của cùng thư mục là một | `process.platform !== 'win32'` (`t.skip`) | chỉ chạy Windows | tên 8.3 chỉ có trên Windows | Chạy trên Windows |
| `test/same-path.test.ts:40`, `:64` | samePath: tên 8.3 (hai test) | ổ đĩa tắt tên 8.3 (`fsutil 8dot3name`) hoặc không dịch được (`t.skip`) | chỉ Windows | không có tên ngắn để so | Bật 8.3 cho ổ chứa thư mục tạm |

Ghi chú: các `t.skip(…)` trong thân test (`logview`, `claude-guard-paths`, `same-path`) không nằm trong `test/skips.json` vì rule `skip-registry` chỉ đối chiếu dòng khai báo test có `skip:`/`test.skip`. `skips.json` có 10 mục (2 `cache-diagnostic`, 2 `agent-probes`, `bench`, 2 `extract`, `shell-policy-write-outside`, 2 `diff-read-inside`), khớp id, điều kiện và lý do của các dòng tương ứng trong bảng.

## Lần chạy thật trên máy này (Windows 11, Node ≥ 22)

`npm test` → exit 0, `tests 797 · pass 794 · fail 0 · skipped 3` (dist/ đã có, `pdftotext` có ở `/mingw64/bin`, `qpdf` không có). Ba test bị bỏ qua:

1. `bench.test.ts:248` (win32)
2. `extract.test.ts:514` (không có qpdf)
3. `logview.test.ts:96` (win32)

Symlink/junction tạo được; `SystemRoot` có.

## Giải thích 4 / 3 / 1

Tập skip chắc chắn theo nền tảng: **Windows** = bench + logview (2 test cố định). Phần còn lại phụ thuộc môi trường: qpdf, pdftotext, `SystemRoot` (và `dist/` trước D18d).

- **3 (máy này, và theo ghi nhận là reviewer):** 2 test win32 + qpdf thiếu. Đo trực tiếp, `dist/` có, `pdftotext` có.
- **4 (CCoding chạy trên Windows):** khớp nhất với 3 ở trên cộng **pdftotext vắng trong PATH của tiến trình CCoding** (extract.test.ts:504). Phương án khác (thiếu `dist/`) sẽ cho **5**, không khớp 4 nên bị loại. **Đã xác nhận bằng số đo** (mục "Đo lại của người điều phối", dòng WMI: pdftotext không, qpdf không, 797 test, 4 bỏ qua): `Git\mingw64\bin` (nơi có pdftotext) có trong PATH của phiên tương tác nhưng không có trong PATH khi tiến trình được tạo như máy chủ văn phòng.
- **1 (Linux):** đã đo (container cloud, Node 22, commit `d82a239`): máy có **cả pdftotext lẫn qpdf**; test bỏ qua duy nhất là `shell-policy-write-outside.test.ts` vì không đặt `SystemRoot`. Hai test win32 (bench, logview) chạy. Giả định cũ "thiếu qpdf hoặc pdftotext" là sai. Số đo này có trước `same-path.test.ts` (commit `5cba98ee`, không phải tổ tiên của `d82a239`); từ commit đó Linux có thêm 1 test bỏ qua (`same-path.test.ts:36`, chỉ Windows), tức dự kiến **2**, chưa đo lại.

Điểm lệch giữa môi trường (sau khi đã sửa): `PATH` (pdftotext, qpdf), biến `SystemRoot`, nền tảng và (với `same-path`) việc ổ đĩa có bật tên 8.3. `dist/` không còn gây lệch.

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

## Đính chính D17(c) (D22, 15/11/2026)

Người điều phối từng ghi test D17(c) (`followup-paths.test.ts:139`, "vòng bổ sung ở làn đầy") "đỏ khi không có `claude` trong PATH". **Ghi nhận đó sai.** Chạy lại với thư mục bin riêng không chứa `claude` thì test vẫn xanh, nên PATH không phải nguyên nhân. Nguyên nhân thật là **ngân sách** (nhiệm vụ dừng ở `paused` vì hết ngân sách thay vì `done`); D20b đã ghim `budgetTokens` cho test này (commit `242a5b5f`, "BRIEF-D20b: bỏ chuỗi giống đường dẫn máy…", và gộp ở `187f498d`; tra bằng `git log --grep=D20b`). Không còn phụ thuộc môi trường.

### Số bỏ qua 4 so với 3

Theo bảng "Đo lại của người điều phối": số test bỏ qua phụ thuộc môi trường chỉ ở hai công cụ ngoài trong PATH.
- **3**: Windows, phiên `cmd` tương tác. Hai test cố định theo nền tảng (`bench.test.ts` win32, `logview.test.ts` win32) cộng `extract.test.ts` qpdf (không có qpdf). `pdftotext` có vì PATH chứa `Git\mingw64\bin`.
- **4**: Windows, tiến trình tạo như máy chủ văn phòng. Ba test trên cộng `extract.test.ts` pdftotext, vì PATH hệ thống không có `Git\mingw64\bin`.
- Chênh 1 test = điều kiện skip "`pdftotext -v` không chạy được trong PATH", phụ thuộc PATH của tiến trình chạy test, không phải lỗi mã.
- Lần chạy `npm test` trong worktree này (Windows): `tests 867 · pass 864 · fail 0 · skipped 3` ở D22; baseline D23: `tests 874 · pass 871 · fail 0 · skipped 3` (pdftotext có trong PATH của phiên này, khớp dòng "3").

### Thư mục mô phỏng (D20b còn mở)

`git ls-files .ccoding | grep -E 'sim-a|scratch'` → không có tệp nào bị commit; không cần `git rm`. Thư mục chưa track (`.ccoding/sim-a`, `.ccoding/sim-a-s4`, `scratch-2b9`) nếu còn ở worktree chính thì người điều phối dọn tay vì hook chặn xóa.
