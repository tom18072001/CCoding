# Phòng Dev, gói D20b: CI xanh thật trên GitHub (4 ô ma trận) cho nhánh D20

**Gói vừa: 4 hạng mục. Ngân sách 8M token.** Giao 15/11/2026. Việc nối của D20 (T-20261114-233050-abe): làm tiếp trên nhánh `ccoding/t-20261114-233050-abe`. Người điều phối đã gộp `perf/vs-claude-loop` (`2b9a6cc`) vào nhánh này ở commit `f6f5b7f2`; xung đột `docs/ARCHITECTURE.md` giữ cả hai đoạn.

**Căn cứ:**
- Nghiệm thu D20 của CTO: chưa nghiệm thu; `npm run check` đỏ; CI chưa chạy trên runner thật.
- **CI thật trên GitHub** (người điều phối đẩy nhánh):
  - **`f6f5b7f2`, 4/4 ô đỏ ở bước typecheck:** `test/accept-followup-d18b.test.ts(100,46)`: TS2353, `kind` không có trong kiểu tham số. Test của D18d, nay mới bị kiểm kiểu nhờ `tsconfig.test.json` của D20.
  - **`a64787d5` (D20 trước khi gộp):**
    - ubuntu ×2: đỏ ở `npm run lint`;
    - windows ×2: lint xanh, `npm test` đỏ 14 test.
  - **`perf/vs-claude-loop`:** 60/60 lần chạy CI gần nhất (PR #6) đều đỏ, chưa ai để ý.
    - ubuntu: 1 test đỏ, `followup-paths.test.ts:139` D17(c);
    - windows: 12 test đỏ, đều về git và worktree.
- **Người điều phối đã tái hiện hoặc khoanh nguyên nhân:**
  - **Lint đỏ trên Linux:** `baseline.json` lưu sha256 của byte tệp ở cây làm việc. Máy chạy văn phòng có `core.autocrlf=true` nên tệp có CRLF; Linux và CI ubuntu có LF ⇒ mã băm khác.
    - Hệ quả trên Linux: khoảng 650 lỗi `machine-path` ở `bench/vs-claude/results/**`, cộng các mục baseline cũ.
    - Thêm 51 mục `research-file-line` không còn khớp gì, vì BRIEF-22c đã sửa hết lỗi đó. Đây là cơ chế chỉ được giảm đang chạy đúng: phải xóa các mục này.
  - **D17(c):** test đỏ khi `claude` không có trong PATH. Tái hiện: bỏ thư mục chứa `claude` khỏi PATH ⇒ `status=paused`, mong `done`. Runner GitHub không có `claude`. Test phụ thuộc runtime thật dù dùng runtime giả.
  - **Windows trên GitHub:** đường dẫn tạm dạng 8.3 (tên thư mục người dùng rút gọn kiểu `RUNNER~1`) trong khi git trả đường dẫn dài. Các phép so đường dẫn sai, vd. `diff.test.ts:62` ra `'branch'` thay vì `'worktree'`, `isWorktreeOf`, gộp worktree con.
    - Đây có thể là lỗi thật của sản phẩm với người dùng Windows có tên tài khoản dài hoặc có dấu cách, không chỉ lỗi test.
  - **`test:bench`:** `bench/vs-claude/test/e7.test.mjs:372` đỏ trên nhánh D20 nhưng xanh trên `perf/vs-claude-loop` (`2b9a6cc`) ⇒ hồi quy do D20.
  - **`skip-registry` (Linux):**
    - `test/agent-probes.test.ts:36`, `:43`: `skip: skipReason` (biến, không phải chuỗi). Rule không thấy lý do.
    - `docs/diagnostics/skipped-tests.md` chưa nhắc hai skip của `bench/vs-claude/test/cache-diagnostic.test.mjs`.

**Phạm vi:**
- **Được sửa:** `src/`, `test/`, `scripts/`, `.github/workflows/`, `package.json` (chỉ `scripts`), `tsconfig*.json`, `docs/` (trừ `docs/research/`), `bench/vs-claude/test/`, `bench/vs-claude/lib/`.
- **Không sửa:** `docs/research/`, `bench/vs-claude/results/`, `agents/`.
- Không chạy benchmark, không gọi `claude -p` thật. Không cài phần mềm.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề. K4 chạy sau cùng.

**Mô phỏng CI tại chỗ** (bắt buộc trước khi báo xong; dùng ở K1–K4):
- **(a) LF như ubuntu:** `git -c core.autocrlf=false worktree add <thư-mục-tạm> HEAD`; trong đó chạy `npm ci` và `npm run check`.
- **(b) Không có `claude` trong PATH:** chạy `npm test` với PATH đã bỏ thư mục chứa `claude`.
- **(c) Đường dẫn tạm 8.3:** lấy dạng ngắn của thư mục tạm (vd. `for %I in ("%TEMP%") do @echo %~sI` trong `cmd`), đặt `TEMP` và `TMP` theo dạng đó, rồi chạy `npm test`. Nếu ổ đĩa tắt tên 8.3 thì ghi rõ, và thay bằng test đơn vị so đường dẫn ngắn/dài.
- Ghi lệnh và kết quả (exit code, số test) của (a), (b), (c) vào báo cáo.

## Hạng mục

**K1 — senior-swe: mã băm không phụ thuộc kiểu xuống dòng; dọn baseline**
- Mọi chỗ băm nội dung tệp trong `scripts/lint/` (sha256 của `baseline.json`, khóa `prereg-lock`, chỗ khác nếu có) phải ra cùng kết quả cho cùng nội dung có CRLF hay LF. Đổi CRLF thành LF trước khi băm; có test.
- Dựng lại `baseline.json` theo mã băm mới. Xóa mục không còn khớp: 51 mục `research-file-line` và các mục `machine-path` cũ.
  - Không thêm mục mới cho lỗi phát sinh sau `2b9a6cc`.
- **Kiểm "baseline chỉ được giảm":**
  - mốc không có `baseline.json` ⇒ đạt;
  - có ⇒ mỗi mục ở HEAD phải có ở mốc, so theo khóa (rule, tệp, neo hoặc sha256 sau chuẩn hóa).
  - Test cả hai ca.
- `CCODING_BASE_REF` cũng được đặt khi chạy `runSubSetup` trong worktree con.

**K2 — backend-dev: typecheck, hồi quy e7, skip-registry**
- Sửa lỗi kiểu ở `test/accept-followup-d18b.test.ts:100` mà không dùng `any` hay `@ts-ignore`.
- `e7.test.mjs:372`: tìm commit D20 gây đỏ (so với `2b9a6cc`), sửa mã hoặc test cho đúng hành vi đã chốt. Ghi nguyên nhân.
- `skip-registry`: `agent-probes.test.ts` khai lý do dạng rule đọc được. Thêm hai skip của `cache-diagnostic.test.mjs` vào `docs/diagnostics/skipped-tests.md` và `test/skips.json`.

**K3 — @devops: test chạy được trên runner sạch**
- **D17(c)** và mọi test khác phụ thuộc runtime thật có trong PATH: test dùng runtime giả phải xanh khi không có `claude`, `codex`, `kimi`. Tìm đúng chỗ (kiểm tính khả dụng của runtime, chọn model theo pha, làn đầy) rồi sửa test hoặc mã.
- **Đường dẫn Windows dạng 8.3:**
  - chuẩn hóa đường dẫn trước khi so (vd. `fs.realpathSync.native` cả hai phía) trong `src/` ở các chỗ so worktree, nhánh, thư mục con;
  - thêm test đơn vị cho so đường dẫn ngắn với dài;
  - mô phỏng (c) phải xanh.
- `.github/workflows/ci.yml` vẫn giữ ma trận 4 ô, không `continue-on-error`, không bỏ bước.

**K4 — qa-tester: review và chạy ba mô phỏng**
- Kết luận theo mẫu JSON.
- Tự chạy (a), (b), (c) và ghi bảng: mô phỏng → lệnh → exit code → số test đạt/đỏ/bỏ qua.
- 🧪 `npm run check` phải xanh trên máy chạy văn phòng.
- Ghi rõ: kết quả CI thật trên GitHub do người điều phối đẩy nhánh và đối chiếu. CI còn đỏ thì người điều phối giao vòng sửa kèm log.
