# D10: nhật ký triển khai (B-18, B-19, B-12)

Phân loại dữ liệu: Nội bộ. Mục này do S0 (@devops) viết; các hạng mục khác bổ sung phía dưới.

## Spike G1 (sandbox-spec §d.0), không xâm lấn

Máy giám đốc, Windows 11 Pro 10.0.26300, kiểm ngày 2026-11-03. Không cài gì, không chạy `claude -p`.

| Lệnh | Exit | Đầu ra thật |
|---|---|---|
| `wsl -l -v` | 0 | `* docker-desktop  Running  2` (đầu ra gốc là UTF-16, đã bỏ byte NUL khi chép) |
| `claude --version` | 0 | `2.1.312 (Claude Code)` |
| `claude --help` (lọc `settings`) | 0 | `--settings <file-or-json>  Path to a settings JSON file or a JSON string to load additional settings from` |

Không lệnh nào bị hook chặn.

### Đối chiếu
- Phiên bản 2.1.312 ≥ 2.1.219 (ngưỡng `strictAllowlist`): **đạt**.
- `--settings` nhận "JSON string" (cùng cơ chế `buildClaudeArgs` đang dùng). `--help` không liệt kê khóa nào bên trong, nên chưa thể khẳng định từ `--help` rằng khóa `sandbox` được nhận. Tài liệu (`docs/research/sandbox-sources.md` dòng 81, C6, nguồn S-01) nói `sandbox.*` là khóa của `settings.json`; `--settings` nạp "additional settings" cùng lược đồ. Đây là suy luận từ tài liệu, **chưa kiểm bằng chạy thật**.
- WSL2 có bật, nhưng distro duy nhất là `docker-desktop`, distro nội bộ của Docker Desktop, không dành cho chạy Claude Code (không phải nơi cài `claude`, bubblewrap, socat). Chưa có distro dùng được (ví dụ Ubuntu).

### Kết luận G1: chưa xác định
- Phần phiên bản: đạt. Phần `--settings` nhận `sandbox`: chưa xác định (chỉ có bằng chứng tài liệu). Phần WSL2: không đạt tại thời điểm này (chưa có distro dùng được); cần giám đốc duyệt riêng việc cài distro.
- Việc đóng G1 cần: (1) cài distro WSL2 + `claude` + bubblewrap/socat trong đó (giám đốc duyệt); (2) một lượt chạy thật có sandbox để xác nhận khóa `sandbox` được nhận.

### Hệ quả cho backend WSL2
- S1 vẫn dựng khóa `sandbox` và test bằng fake; không cần làm lại.
- Backend WSL2 (`toWslPath`, `wrapForWsl`) đánh dấu "chưa kiểm trên máy thật".
- `sandboxAvailable()` trên máy này phải trả `ok:false` (không có distro dùng được) nên khi bật `osSandbox.enabled` sẽ fail-closed: lỗi tiếng Việt, ghi `sandbox.unavailable`, không chạy. Đây là hành vi đúng.
- Việc còn mở cho S7: thêm "cài distro WSL2 để đóng G1" vào danh sách chờ giám đốc duyệt. Khi chọn distro, `wsl -l -v` phải lọc bỏ `docker-desktop` và `docker-desktop-data`.

## Kiểm trên Linux của người điều phối (4/11/2026, sau khi gộp D10 `7b7f4cf` và BRIEF-15 `9e1694c`)

- **Một test đỏ trên Linux:** `test/sandbox-regression.test.ts:66` kỳ vọng đường dẫn hook luôn dạng `/mnt/<ổ>/…`.
  - Nguyên nhân: đường dẫn hook lấy theo nơi cài repo. Trên Windows là `C:\…` nên được ánh xạ; trên Linux đã là POSIX nên `toWslPath` giữ nguyên. Hành vi này đúng.
  - Sửa: kỳ vọng theo nền tảng. Win32 giữ nguyên regex `/mnt/…`; nền tảng khác đòi đường dẫn giữ nguyên. Không đổi `src/`.

| Lệnh (Linux, Node 22) | Kết quả |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run build` | exit 0 |
| `npm test` lần 1, 2, 3 | exit 0 · tests 391 · pass 391 · fail 0 · skipped 0 (cả ba lần) |
| `node --test bench/vs-claude/test/*.mjs` | 38/38 |
| `gates-pairs.test.mjs` + `agreement.test.mjs` | 33/33 |
| 3 lệnh kiểm của `ccoding-research`, `holdout-sample-size.mjs --check` | exit 0 |
| `run.mjs --arms oracle,null --tasks suite:gates` | oracle 1,00 cả 6 bài; null 0–0,22 |
| `run.mjs --arms oracle,null --tasks l1-modules,l2-chain,t1-duration,t5-logq` | oracle 1,00; null ≤ 0,007 |

- Máy cloud của người điều phối có `claude` nhưng không có `bwrap` và `socat`. Sandbox có sẵn của Claude Code trên Linux cần hai công cụ này, nên chưa chạy `scripts/sandbox-adversarial.mjs` thật. Việc chạy thật vẫn nằm trong danh sách chờ giám đốc duyệt, cùng với cài distro WSL2.

## B-18: sandbox cấp hệ điều hành cho `claude-cli`

Mục này nêu công tắc, nơi đặt mã và test của lớp sandbox thứ hai, đặt sau hook `claude-guard`. Lớp này chưa chạy thật trên máy nào.

**(a) Công tắc và giá trị mặc định.**
- `runtimes.claude-cli.osSandbox.enabled` mặc định `false` (kiểu ở `src/config.ts:19-33`, khai báo ở `src/config.ts:81`).
- Bật mà nền tảng không có sandbox thì từ chối chạy (fail-closed), ghi `sandbox.unavailable`.
- `platformBackend` nhận `auto`, `wsl2` hoặc `appcontainer`. `strictAllowlist` luôn bật, `extraAllowedDomains` mặc định rỗng.

**(b) Tệp, commit, test.**
- Tệp: `src/runtimes/claude-cli.ts`, `src/tools/claude-guard.ts`, `src/config.ts`, `scripts/sandbox-adversarial.mjs`, `scripts/sandbox-bench.mjs`, `scripts/lib/sandbox-cases.mjs`, `scripts/lib/sandbox-bench-stats.mjs`.
- Commit D10: `7b7f4cf` (gộp), `fa0c5ea` (kỳ vọng đường dẫn hook theo nền tảng). Commit D10b: xem mục "D10b" (DET-04).
- Test: `test/sandbox-args.test.ts`, `test/sandbox-regression.test.ts`, `test/sandbox-adversarial-cases.test.ts`, `test/sandbox-log-fallback.test.ts`.

**(c) Việc còn cần đo hoặc cần duyệt.**
- G1 chưa đóng (xem mục Spike G1): chưa có distro WSL2 dùng được, chưa kiểm bằng chạy thật rằng `--settings` nhận khóa `sandbox`.
- `scripts/sandbox-adversarial.mjs` và `scripts/sandbox-bench.mjs`: chưa chạy thật.
- Backend WSL2 (`toWslPath`, `wrapForWsl`): chưa kiểm trên máy thật.
- Bật `osSandbox`: chờ giám đốc duyệt.

## B-19: vòng tự cải thiện

Mục này mô tả công tắc, các tệp và test của vòng thu sự cố, đề xuất, duyệt, áp dụng và đo A/B. Vòng này tắt hoàn toàn theo mặc định.

**(a) Công tắc và giá trị mặc định.**
- `selfImprove.enabled` mặc định `false` (`src/config.ts:384`). Tắt thì không sự kiện, không lượt LLM, prompt giữ nguyên byte (CT-10).
- `selfImprove.collect` mặc định **`true`** (`src/config.ts:385`), không phải `false`. Mã thu sự cố chỉ chạy khi `enabled` và `collect` cùng bật, nên khi `enabled=false` thì không thu gì. Cần giám đốc quyết định có đổi mặc định `collect` thành `false` cho khớp ý đề bài hay không.
- Bật `enabled` bắt buộc có `server.token` (`src/config.ts:476`). Ba vai `analyst`, `author`, `runner` phải đôi một khác nhau. `ab.tasks` không được chứa `t1–t5`, `g1–g6`.
- `selfImprove.retention.proposalDays` mặc định 183 (`src/config.ts:398`), sàn 183.
- Ngân sách mặc định: phân tích 300 000, bản vá 400 000, sàng lọc A/B 14 000 000, xác nhận A/B 38 000 000 token (`src/config.ts:387`). Đây là giả định do giám đốc chốt.

**(b) Tệp, commit, test.**
- Tệp: `src/selfimprove.ts`, `src/orchestrator.ts`, `src/server.ts` (route), `src/config.ts`, `src/cli.ts`, `public/selfimprove.js`, `public/app.js`, `public/index.html`.
- Commit D10: `7b7f4cf`, `1f2f4ec` (token bắt buộc, POST cần token, che đường dẫn trong lỗi 409, chính sách `purgeExpired`).
- Commit D10b: `1e59dfb` (S1), `36371b8` (S3), `f8b238c` (S4), `b7fd1a6` (S5). Chi tiết ở mục "D10b".
- Test: `test/selfimprove.test.ts` (gồm CT-10 và sáu test nguồn sự cố tiền tố `S3:`), `test/selfimprove-apply.test.ts` (gồm bốn test tiền tố `retention:`), `test/selfimprove-ui.test.ts`, `test/selfimprove-route.test.ts`, `test/selfimprove-holm.test.ts`.

**(c) Việc còn cần đo hoặc cần duyệt.**
- Chưa có test tích hợp chạy cả vòng `Orchestrator` cho khối nguồn sự cố mới; test hiện ở mức `toIncident`, `onLog`, `collectGuardBlocks`.
- Nhánh Áp dụng thành công qua HTTP chưa có test; mức hàm đã có trong `test/selfimprove-apply.test.ts`.
- Chưa kiểm giao diện bằng trình duyệt thật, chỉ dùng DOM giả.
- Phát hiện M1 của route B-19 (theo đánh giá bảo vệ dữ liệu) cần xử lý trước khi bật.
- Chưa chạy A/B thật. Bật `selfImprove` và chốt ngân sách, ngưỡng: chờ giám đốc duyệt.

## B-12: số lệnh kiểm đỏ trong `gate.decision`

Mục này ghi thay đổi nhỏ nhất: sự kiện `gate.decision` của cổng B-02 kèm số kết quả kiểm đỏ để bench đọc được.

**(a) Công tắc và giá trị mặc định.** B-12 không có công tắc cấu hình riêng: `git diff 8b0b6c3 7b7f4cf -- src/config.ts` không có khóa nào cho B-12. Trường `checks: { red, total }` luôn được ghi vào `gate.decision` của cổng `b02`. Sự kiện cũ không có `checks` vẫn đọc được, `checksRed` khi đó là `null`.

**(b) Tệp, commit, test.**
- Tệp: `src/orchestrator.ts` (ghi `checks`), `src/bench.ts` (`gateDecisions` đọc `checksRed`), `src/git.ts` (xuất `identity`).
- Commit D10: `7b7f4cf` (gộp).
- Test: `test/bench.test.ts`, test `[B-12] gateDecisions: sự kiện mới có checks → checksRed; sự kiện cũ → null; trường cũ không đổi` (dòng 342).

**(c) Việc còn cần đo hoặc cần duyệt.** Chưa có phép đo nào dùng `checksRed` để so sánh các nhánh bench. Có thể thêm công tắc nếu giám đốc muốn tắt trường này; hiện chưa có yêu cầu.

## D10b: đóng các việc CTO nêu khi nghiệm thu D10

Mục này tóm tắt sáu việc của D10b và cách mỗi việc được đóng. Số test lấy từ bàn giao của từng hạng mục.

| Việc | Kết quả | Commit | Test |
|---|---|---|---|
| Nút Áp dụng (S1) | Có | `1e59dfb` | `test/selfimprove-ui.test.ts`, `test/selfimprove-route.test.ts` |
| Đường dự phòng DET-04 (S2) | Có | `0ce0b5a` | `test/sandbox-log-fallback.test.ts` |
| Chính sách giữ log (S4) | Có | `f8b238c` | `test/selfimprove-apply.test.ts` |
| Ba nguồn sự cố (S3) | Có | `36371b8` | `test/selfimprove.test.ts` |
| Holm thay Bonferroni (S5) | Có | `b7fd1a6` | `test/selfimprove-holm.test.ts` |
| Nguyên nhân skipped (S6) | Giải thích, không sửa mã | không có | không có |

### Nút Áp dụng (S1)

Giao diện B-19 khớp hợp đồng route ở `src/server.ts:685-720`. Trạng thái `proposed` có Duyệt và Từ chối. Trạng thái `approved` có Áp dụng. Trạng thái `applied` hoặc `rollback.proposed` có Rollback. Áp dụng và Rollback đều hỏi xác nhận, câu hỏi nêu đường dẫn tương đối của tệp đích.

Token đi qua `C.api` của `public/app.js`, không thêm kho lưu mới. Lỗi hiển thị bằng toast từ `message` của server. Nhánh 409 trong `src/server.ts` che thêm dataDir, thư mục gốc repo và `os.tmpdir()`. Có 4 test UI mới và 1 test route 409 (ba ca 409 và POST không token trả 401).

Hạn chế đã biết: regex che cũ biến `agents/dev/x.md` thành `agents<đường dẫn>`. Vẫn an toàn nhưng chưa giữ nguyên đường dẫn tương đối như quyết định D4.

### Đường dự phòng DET-04 (S2)

`logSandboxDeny` và `logSandboxUnavailable` (`src/tools/claude-guard.ts:176-232`) không còn bỏ qua im lặng. Khi xác định được dataDir, sự kiện vẫn vào `system.jsonl` qua LogStore. Chỉ khi không xác định được dataDir, hoặc `LogStore.write` ném lỗi, hàm ghi một dòng stderr cố định chứa `{tool, rule, backend}` và loại lỗi, rồi trả `{ok:false, kind}`. Dòng này không chứa lệnh gốc hay đường dẫn.

`claude-cli` nối cảnh báo vào `error` của lượt (với `sandbox.unavailable`, lượt vẫn fail-closed) hoặc vào `diag` (với `sandbox.deny`). Có 4 test `DET-04`. Stderr được coi là cảnh báo vận hành, không phải nơi lưu log.

### Chính sách giữ log (S4)

Quy định chi tiết nằm ở `docs/data-protection-assessment.md`, mục B-19 và mục DET-04 của B-18. Tóm tắt:
- Tệp bằng chứng không bao giờ bị xóa. Danh sách cố định trong code (`isEvidenceFile`, `src/selfimprove.ts:1057`) gồm `incidents.jsonl`, `ab-*.json`, toàn bộ `proposals/`, mọi `*.jsonl` và `*.chain`.
- Tệp khác dưới `data/self-improve/` giữ tối thiểu 183 ngày. Cấu hình thấp hơn bị nâng lên 183 kèm sự kiện `selfimprove.retention.clamped`.
- `data/logs/*.jsonl` giữ 400 ngày theo cấu hình `retentionDays` (`src/config.ts:437`).
- Nơi gọi: `cmdServe` trong `src/cli.ts` gọi `runRetention` một lần lúc khởi động, chỉ khi `selfImprove.enabled`. Không thêm timer hằng ngày vì server chưa có mẫu timer chung.
- Kết luận của S4: ĐẠT CÓ ĐIỀU KIỆN ở cổng thiết kế. Chưa có tác vụ tự dọn `data/logs/`, nên thực tế giữ vô thời hạn. Chưa có WORM hay ký số. Căn cứ pháp lý cần soát với văn bản gốc.
- Ghi chú: kết quả A/B thật nằm ở `ab/<pid>/…`, không phải `ab-*.json`. Các tệp khác trong `ab/` vẫn bị dọn khi quá hạn.

### Ba nguồn sự cố (S3)

B-19 bước 1 nay thu thêm `review.issue` (issue review mức blocker hoặc major), `checks.regressed` và `guard.block`, cạnh nguồn `revise.incident` có sẵn. Mã ở `src/selfimprove.ts` (`toIncident`, `onLog`, `collectGuardBlocks` ở dòng 222) và khối mới trong `src/orchestrator.ts`.

- `guard.block` do hook ghi ở tiến trình riêng, nên được đọc từ LogStore theo đúng task sau mỗi lượt review.
- Khử trùng lặp bằng khóa lưu trong `evidence.ref` của `incidents.jsonl`, dạng `taskId/subtask/rN#source:key`, nên không mất khi server khởi động lại.
- Comment của issue chỉ vào `incidents.jsonl`, không vào sự kiện log. `guard.block` không chép lệnh gốc.
- Task confidential hoặc restricted bị bỏ qua và ghi `incident.skipped`. Công tắc tắt thì không ghi nguồn nào.
- Có 6 test tiền tố `S3:` trong `test/selfimprove.test.ts`.
- Còn mở: lấy `guard.block` mới chỉ chạy sau review; nhiệm vụ không qua review chưa được thu.

### Holm thay Bonferroni (S5)

Đặc tả yêu cầu Holm trên ba chỉ số chính (`design.md` §5.3; `docs/research/self-improvement/implementation-spec.md:49`). Mã trước đó dùng Bonferroni. `decide()` giờ tính p một phía theo ngưỡng D5, áp Holm step-down (`holmAdjust`, `src/selfimprove.ts:628`), và chỉ đạt khi cả ba p đã chỉnh nhỏ hơn 0,05. `Decision` có thêm `pRaw` và `pHolm`, cũng được ghi vào log `selfimprove.ab.decided`. `tCdf` tự viết (`:616`), không thêm phụ thuộc.

Khoảng tin cậy báo cáo vẫn là khoảng t hai phía 95 % chia 3; quyết định dựa trên p Holm. Lập luận IUT (quy tắc "và" không cần hiệu chỉnh) chỉ nằm trong comment. Có 5 test trong `test/selfimprove-holm.test.ts`; hai test cũ CT-14 và CT-15 vẫn đạt.

Còn mở: hàm `tInv` (Cornish–Fisher) kém chính xác ở bậc tự do nhỏ, nên khoảng tin cậy và p có thể lệch nhẹ ở biên. Không thấy mã nào trong `src/` ghi `ab-confirm.json`; nếu script khác tạo tệp đó thì cần ghi thêm `pRaw`, `pHolm`.

### Nguyên nhân số skipped dao động 3–4 (S6)

Trên mã đã gộp S1–S5, `npm run typecheck` và `npm test` ×3 cho kết quả giống nhau: 415 test, 412 pass, 0 fail, 3 skipped, cùng ba test bị skip ở cả ba lần. Số skipped dao động do trạng thái máy, không do test chập chờn. Không có thay đổi mã nào cho việc này.

Hai test `agent-probes` bị skip khi chưa có `dist/`. S6 đã tái hiện: đổi tên `dist/` tạm thời thì chạy riêng tệp đó cho 2 skipped, 0 pass; sau đó khôi phục. Lần đo "4" ở baseline chưa xác định được test nào, vì không có dữ liệu ngày đó. Giả định (chưa tái hiện): thiếu `pdftotext`, `qpdf` hoặc quyền tạo symlink. Đề xuất: thêm `npm run build` vào `pretest` hoặc CI để loại biến số `dist/`. Chưa làm.

| test (tệp:dòng, tên) | điều kiện skip | win32 | posix | ổn định? | lý do |
|---|---|---|---|---|---|
| `bench.test.ts:248` claude-cli `bashMaxOutput` → `BASH_MAX_OUTPUT_LENGTH` | `process.platform === 'win32'` | skip | chạy | Có, tất định theo nền tảng | `claude` giả dùng shebang |
| `extract.test.ts:514` PDF mã hóa mật khẩu rỗng qua `qpdf` | `!hasTool('qpdf')` | skip (máy này) | tùy máy | Có, phụ thuộc máy | môi trường: thiếu `qpdf` |
| `logview.test.ts:96` herdr logs | `process.platform === 'win32'` | skip | chạy | Có, tất định theo nền tảng | `herdr` giả dùng shebang |
| `extract.test.ts:504` PDF qua `pdftotext` | `!hasTool('pdftotext')` | chạy (máy này có) | tùy máy | Phụ thuộc máy | môi trường |
| `agent-probes.test.ts:26` `--self-test` | `!fs.existsSync(dist/kpi.js)` | chạy khi có `dist/` | như win32 | Phụ thuộc `dist/` | trạng thái build |
| `agent-probes.test.ts:33` probe Ollama `num_ctx` | cùng điều kiện dòng trên | chạy khi có `dist/` | như win32 | Phụ thuộc `dist/` | trạng thái build |
| `claude-guard-paths.test.ts:77` symlink/junction trong worktree | `tryLink()` thất bại thì skip | chạy | chạy | Phụ thuộc quyền tạo link | môi trường: quyền symlink |
| `claude-guard-paths.test.ts:121` junction trong `tool-results` | cùng điều kiện dòng trên | chạy | chạy | Phụ thuộc quyền tạo link | môi trường: quyền symlink |

### Kiểm chứng của D10b

- Windows, mã đã gộp S1–S5 (S6): `npm run typecheck` exit 0; `npm test` ×3 đều exit 0, 415 test, 412 pass, 0 fail, 3 skipped.
- Linux, kiểm lại sau D10b: chưa chạy.
- Test có hành vi riêng theo nền tảng: test retention của S4 kiểm cả dấu phân cách win32 (`path.win32.join`) và posix. Kiểm trên posix thật: chưa chạy.

## Chờ giám đốc duyệt

Năm mục dưới đây là những việc chưa làm vì cần quyền cài đặt, chi phí hoặc quyết định của giám đốc. Mỗi mục nêu mục đích và đề xuất.

1. **Cài distro WSL2 cùng `claude`, bubblewrap và socat để đóng G1.**
   - Mục đích: máy giám đốc chỉ có distro `docker-desktop`, không dùng được cho sandbox. Cần một distro như Ubuntu để xác nhận khóa `sandbox` của `--settings` được nhận.
   - Đề xuất: duyệt cài một distro riêng. Khi chọn distro phải lọc bỏ `docker-desktop` và `docker-desktop-data`. Chưa cài, chưa chạy.

2. **Chạy thật `scripts/sandbox-adversarial.mjs` và `scripts/sandbox-bench.mjs`.**
   - Mục đích: kiểm sandbox chặn đúng các ca tấn công và đo chi phí. Máy cloud của người điều phối thiếu `bwrap` và `socat`, nên chưa chạy.
   - Đề xuất: chạy sau mục 1. Chưa chạy.

3. **Bật `runtimes.claude-cli.osSandbox.enabled`.**
   - Mục đích: thêm lớp sandbox hệ điều hành sau hook `claude-guard`.
   - Đề xuất: chỉ bật sau khi mục 1 và 2 đạt. Hiện mặc định `false`; bật sớm trên máy này sẽ fail-closed.

4. **Bật `selfImprove`.**
   - Mục đích: chạy vòng thu sự cố, đề xuất và áp dụng bản vá.
   - Đề xuất: chưa bật. Trước khi bật cần `server.token`, xử lý phát hiện M1 của route, và quyết định mặc định `collect` (hiện `true`). Lưu ý chưa có tác vụ dọn `data/logs/` và chưa có WORM hay ký số.

5. **Ngân sách và ngưỡng A/B.**
   - Mục đích: chốt chi phí và tiêu chí đạt của phép đo A/B.
   - Đề xuất: giữ xác nhận r = 8 (160 lượt) theo `implementation-spec.md:48`. Giữ ngưỡng D5 ở `implementation-spec.md:49` (token, an toàn, thời gian; Holm trên ba chỉ số chính). Nếu muốn phủ trường hợp Holm xấu nhất thì dùng r = 10 (200 lượt). Mọi ngưỡng hiện là giả định do giám đốc chốt.

## Kiểm trên Linux sau khi gộp D10b (người điều phối, 4/11/2026)

- **Lỗi:** `test/sandbox-log-fallback.test.ts:66` (DET-04) đỏ trên Linux. Khi một thành phần của đường dẫn là tệp, `fs.rmSync(guardState, { force: true })` ném `ENOTDIR`, vì `force` chỉ bỏ qua `ENOENT`. Trên Windows lỗi trả về là `ENOENT` nên không lộ ra.
- **Sửa** (`c614ef9`, `src/runtimes/claude-cli.ts`): bọc lệnh dọn tệp trạng thái hook bằng `try/catch` ở nhánh fail-closed. Hành vi không đổi: vẫn không chạy, vẫn trả lỗi tiếng Việt, vẫn ghi `sandbox.unavailable` hoặc báo lỗi ghi log.
- **Kết quả trên Linux:** `npm test` 3 lần đều exit 0 (tests 415, pass 415, fail 0, skipped 0). `node --test bench/vs-claude/test/*.mjs` 38/38. `consistency-check.mjs` đạt.
