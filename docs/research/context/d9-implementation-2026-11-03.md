# D9: các đề xuất backlog đã thực hiện (03/11/2026)

Tài liệu này cho Phòng Nghiên cứu biết từng đề xuất còn mở trong backlog đã được làm tới đâu, bật hay tắt mặc định, kiểm bằng gì và còn cần đo gì. Nhãn dữ liệu: Nội bộ. Căn cứ là quyết định của giám đốc ngày 03/11: đề xuất đã có thì sửa, thay đổi hành vi đặt sau công tắc cấu hình. Kết quả lệnh lấy từ bàn giao, ưu tiên bản kiểm tích hợp (S8). Phần nào chưa chạy thì ghi rõ.

## 1. Tóm tắt

Mười hạng mục (B-03, B-07, B-08, B-09, B-12, B-13, B-14a, B-14b, B-16, B-17) đã có mã và test. Chưa hạng mục nào được đo hiệu quả bằng lượt chạy thật. Quy tắc mặc định (gọi là A-DEF) giữ nguyên: cấu hình mặc định của các nhánh đo không đổi. Năm công tắc tắt mặc định: `lanes.single.slim.compactTemplate`, `runtimes.claude-cli.stablePrefix`, `phases.outputCap` cùng `phases.stopSurveyHint` (B-09), và `planner.difficultyModel` (B-17). Bốn nhóm bật mặc định theo khuyến nghị của backlog: B-07, B-08, B-03 và B-13.

## 2. Kết quả kiểm tích hợp

Trên nhánh đã gộp S1–S6, S8 báo như sau.

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | 325 test, 322 đạt, 0 lỗi, 3 bỏ qua |
| `node bench/vs-claude/run.mjs --arms oracle,null --tasks g1…g6 --repeats 1` | exit 0, 12/12 lượt |
| `node docs/research/analysis/prereg-tests.mjs` | exit 0, đọc được dữ liệu cũ |
| `git diff --stat perf/vs-claude-loop...HEAD -- docs/research/paper` | rỗng |

Kết luận của S8: Đạt, không có lỗi nặng. Điểm oracle là 1,00 ở cả sáu bài. Điểm null là g4 0,00; g2, g5, g6 0,11; g3 0,13; g1 0,22 (đều ≤ 0,25).

Chưa chạy: `claude` thật, script chẩn đoán cache, giao diện `public/app.js` trong trình duyệt, và `prereg-tests.mjs --check`. Ở S4, chế độ `--check` in "LỆCH" (bảng vòng 3 không trùng đầu ra script, chưa rõ do CRLF hay nguyên nhân khác); S8 không chạy lại chế độ này.

## 3. Từng hạng mục

Mỗi mục nêu mục đích, công tắc, tệp, test và việc còn cần đo. Hash commit nằm ở Phụ lục A.

### 3.1. B-07: trần lượt cho `claude-cli`

Runtime `claude-cli` trước đây không có trần lượt như runtime API. Nay lệnh dựng có `--max-turns` theo pha, lấy từ `phases.toolTurns` (plan 8, finalize 4, execute 40, review 10, revise 16, synthesize 4, accept 6).

- Công tắc: `runtimes.claude-cli.maxTurns`. Bật mặc định; chỉ tắt khi đặt `false`.
- Tệp: `src/runtimes/claude-cli.ts` (hàm thuần mới `buildClaudeArgs`), `src/config.ts`.
- Khi chạm trần, `diag` ghi "chạm trần N lượt" nên KPI `capHits` đếm được. Subtype `error_max_turns` không còn tính là lỗi.
- Test: `test/claude-max-turns.test.ts` (4 test). Công tắc tắt thì args y hệt bản trước.
- Cần đo: cờ và subtype lấy theo tài liệu, chưa thử với bản `claude` đang cài. Trần review 10 lượt có thể thấp với reviewer chạy test nhiều bước.

### 3.2. B-08: hook dùng `cwd` và cho đọc tool-results của phiên

Hook chặn đường dẫn nay tính đường dẫn tương đối theo `cwd` có trong sự kiện, và cho công cụ Read đọc tệp tool-results của đúng phiên đó.

- Công tắc: `guard.useEventCwd` và `guard.allowOwnToolResults`. Cả hai bật mặc định. Thiếu `cwd` thì giữ hành vi cũ.
- Cách chặn: `realpath` rồi `path.relative` với worktree; kết quả bắt đầu bằng `..` hoặc là đường dẫn tuyệt đối thì chặn. Chặn cả phiên khác và thư mục khác trong `.claude/`.
- Tệp: `src/tools/guard-paths.ts` (mới), `src/tools/claude-guard.ts`, `src/config.ts`, `src/types.ts`.
- Test: `test/claude-guard-paths.test.ts` (12 test), gồm `../`, symlink, junction Windows và phiên khác. Hai test junction chạy thật, không bị skip, và đạt.
- Cần đo: không có số đo hiệu năng riêng. Số lần chặn nhầm sẽ thấy qua sự kiện `guard.block`.

### 3.3. B-03: nhật ký sự cố ở pha revise

Pha revise được yêu cầu ghi mục "Nhật ký sự cố" gồm lỗi, nguyên nhân, cách sửa và lệnh kiểm. Bộ đọc ghi kết quả vào LogStore làm đầu vào cho vòng tự cải thiện (RQ5).

- Công tắc: `phases.incidentLog`. **Bật mặc định.** Vì vậy prompt revise mặc định khác bản trước; test băm byte chỉ khẳng định trùng khi tắt. Muốn trở lại prompt cũ thì đặt `false`.
- Log: kind `revise.incident`, payload `{ taskId, subtaskId, round, items: [{ error, cause, fix, verifyCmd }], b02: { blocked, rounds }, parsed }`. Revise không có mục này thì `parsed=false`, `items=[]` và không ném lỗi.
- Tệp: `src/incident.ts` (mới), `src/prompts.ts`, `src/orchestrator.ts`, `src/config.ts`.
- Test: `test/s3-incident-difficulty.test.ts` (11 test, dùng chung với B-09 và B-17), gồm che PII và khóa giả qua LogStore.
- Cần đo: `b02.blocked` được suy ra là có dùng vòng sửa của cổng chất lượng. Chưa có tỉ lệ mục sự cố trên lượt revise thật, và chưa đo mức tăng token revise (ngưỡng backlog: không quá 5 %).

### 3.4. B-09: giới hạn đầu ra và tín hiệu dừng khảo sát

Hai đoạn nhắc thêm vào prompt: mỗi mục không quá 120 từ, và dừng khảo sát khi đã đủ thông tin.

- Công tắc: `phases.outputCap` và `phases.stopSurveyHint`. **Tắt mặc định.**
- Giới hạn đầu ra áp cho execute và synthesize. Plan và review trả JSON nên không áp. Đây là điểm khác so với đề bài gốc, theo diff P1.
- Tệp: `src/prompts.ts`, `src/config.ts`, `src/orchestrator.ts` (đọc cờ trong `pctx()`).
- Test: `test/s3-incident-difficulty.test.ts`. Khi tắt, băm prompt execute, revise, synthesize trùng bản trước.
- Cần đo: chưa chạy A/B nào. Với `claude-cli`, đo P2 bằng số lần đọc trước lần ghi đầu, không dùng `capHits`.

### 3.5. B-12: bộ sáu bài cài lỗi g1–g6

Bộ bài này đo ba cổng chất lượng: lệnh kiểm đỏ (b02), thiếu sót kế hoạch (b10), lỗi ẩn do CTO nghiệm thu (cto). Mỗi bài có mã khởi tạo cài lỗi, test công khai, test ẩn và lời giải tham chiếu.

| Loại | Bài | Cổng kỳ vọng |
|---|---|---|
| red-check | g1-slug-dedupe, g2-cart-coupon | b02 |
| plan-omission | g3-qty-rename, g4-gb-unit | b10 |
| hidden-wrong | g5-median-stats, g6-range-merge | cto |

- Công tắc: không áp dụng, đây là dữ liệu bench. Sự kiện `gate.decision` (payload `{ gate, verdict, rounds?, subtaskId? }`) do `src/orchestrator.ts` ghi ở ba cổng và là bên ghi duy nhất. Một nhiệm vụ có thể có nhiều sự kiện `b02`.
- Bộ đọc: `gates.b02`, `gates.b10`, `gates.cto` trong `runs.jsonl` (mục 3.6); trường không có dữ liệu để `null`.
- Tệp: `bench/vs-claude/tasks/g1-…g6-…/`, `bench/vs-claude/README.md`.
- Test: tự kiểm oracle/null (kết quả ở mục 2). Test g4 lần đầu có null 0,33, S6 đã bớt test ẩn mà null qua được rồi chạy lại ra 0,00.
- Cần đo: chưa chạy arm LLM nào trên bộ này. Cần lượt đo đăng ký theo prereg §9.

### 3.6. B-13: số đo theo pha ở bench và chỉ số trúng cache ở ứng dụng

**Bench.** `runs.jsonl` ghi thêm token đủ bốn thành phần, thời gian và model theo pha. Không đổi trường cũ: `byPhase` của vs-claude vẫn là số có trọng số, vì đổi thành object sẽ phá `analyze.mjs`.

| Trường mới | Nội dung |
|---|---|
| `byPhaseDetail[p]` | `{calls, input, cacheRead, cacheWrite, output, ms}` |
| `byPhaseModel[p]` | danh sách model của pha |
| `models` | danh sách model của lượt chạy |
| `gates` | `b02`, `b10`, `cto` (mục 3.5) |

Tệp: `src/bench.ts` (`byPhase` trong `RunMetrics` thêm trường tùy chọn), `bench/vs-claude/lib/ccoding.mjs`. Test: `test/bench.test.ts` (+2), `bench/vs-claude/test/gates-b13.test.mjs` (7 test; chạy riêng bằng `node --test`, không nằm trong `npm test`). Có test dòng `runs.jsonl` dạng cũ chạy qua `analyze.mjs` exit 0.

**Ứng dụng.** Chỉ số `cacheRead / (cacheRead + cacheWrite + input)` tính theo lượt gọi, pha và runtime; mẫu số 0 thì trả `null` và giao diện ẩn.

- Hiển thị: thẻ "Tỉ lệ trúng cache" ở trang Token và cột "Trúng cache" trong KPI v2. Route mới `GET /api/cache`.
- Tệp: `src/kpi.ts`, `src/server.ts`, `public/app.js`. Test: `test/cache-hit.test.ts` (3 test, khớp tính tay trong ±0,1 điểm %).
- Công tắc: không có; chỉ thêm trường. Mặc định bật.
- Cần đo: giao diện chưa kiểm trong trình duyệt. Thẻ chỉ tải khi mở trang, không tự làm mới. Route đọc `calls.jsonl` qua `store.callsFile`, không qua `LogStore`; S5 đã hỏi lại xem có cần đổi.

### 3.7. B-14a: script chẩn đoán cache

Script xác định vì sao `claude -p` ghi cache mà không đọc lại. Nó chạy 3 cặp gọi (giống hệt, khác bộ công cụ, khác `cwd`) cộng một lượt khởi động, tổng 7 lượt, trần 8.

- Công tắc: không áp dụng. Cờ lấy từ `buildClaudeArgs` trong `dist/`, không chép lại.
- Tệp: `bench/vs-claude/cache-diagnostic.mjs`, `bench/vs-claude/fixtures/cache-diagnostic.fixture.json`. Có `--fixture` và `--dry-run`, không gọi `claude`.
- Test: `bench/vs-claude/test/cache-diagnostic.test.mjs` (4 test). Chạy với dữ liệu giả ra h(a)=0,9831, h(b)=0,008, h(c)=0,9748. Đây là dữ liệu giả, không phải kết quả đo.
- **Chưa chạy thật.** Người điều phối chạy ngoài hook: `npm run build` rồi `node bench/vs-claude/cache-diagnostic.mjs --out <csv>`.

### 3.8. B-14b: công tắc ổn định tiền tố

Giữ một bộ công cụ cố định cho cả nhiệm vụ để tiền tố prompt không đổi giữa các pha. Hook chặn theo pha. Pha không sửa tệp chạy ở thư mục gốc nhiệm vụ.

- Công tắc: `runtimes.claude-cli.stablePrefix`. **Tắt mặc định** (không khai báo, mã so `=== true`). Khi tắt, args không đổi (`deepEqual` trong test) và `CCODING_GUARD` không có trường `stablePrefix`.
- Cách chặn: pha đưa vào hook qua trường `phase` trong `CCODING_GUARD`. Ngoài `execute` và `revise` (kể cả thiếu hoặc sai pha), hook chặn Write, Edit, MultiEdit, NotebookEdit và toàn bộ Bash, không lọc Bash bằng regex.
- Tệp: `src/tools/claude-guard.ts`, `src/runtimes/claude-cli.ts`, `src/orchestrator.ts` (chọn `reqCwd`), `src/config.ts`, `docs/data-protection-assessment.md`.
- Test: `test/claude-stable-prefix.test.ts` (8 test), gồm bộ lệnh Bash ác ý.
- Rủi ro (S2, kết luận "đạt có điều kiện"): bộ công cụ cố định gồm Write, Edit, Bash ở mọi pha, nên hook lỗi thì pha chỉ đọc có công cụ ghi. Review hạng mục con đọc cây gốc nhiệm vụ, không đọc worktree con chưa gộp. Không bật cho dự án Bảo mật hoặc Hạn chế.
- **Hiệu quả cache chưa đo.** Điều kiện bật: chạy B-14a thật và chủ dự án chấp nhận hai rủi ro trên.

### 3.9. B-16: arm B7cabO

Arm `B7cabO` giữ cấu hình của `B7cab` và thêm `phaseModels: {accept: "opus"}`, để so tác động của model nghiệm thu.

- Tệp: `bench/vs-claude/arms.json` (cùng khóa `_suites.gates`), `bench/vs-claude/run.mjs`, `bench/vs-claude/lib/queue.mjs` (`--tasks suite:gates`).
- Test: `bench/vs-claude/test/gates-b13.test.mjs`.
- Cần đo: arm chỉ kiểm bằng dữ liệu giả. Cú pháp `phaseModels` chưa kiểm theo cách `src/bench.ts` đọc. Cần lượt đo đăng ký theo prereg §9.

### 3.10. B-17: model của pha plan theo độ khó

Độ khó được chấm từ tín hiệu làn đã tính trước lượt plan, rồi chọn model tương ứng. Không thêm lượt LLM.

- Công tắc: `planner.difficultyModel.enabled`. **Tắt mặc định**; bảng model `{1: 'sonnet', 3: 'opus'}`.
- Chấm điểm: mỗi tín hiệu đạt ngưỡng cộng 1 điểm (số phần ≥3, tệp chạm ≥4, brief ≥2000 ký tự, repo ≥150 tệp, repo ≥750k byte); chuỗi tuần tự trừ 1. Mức 1 là 0 điểm, mức 2 là 1–2 điểm, mức 3 từ 3 điểm. Không có tín hiệu thì dùng mức 2 và ghi log `plan.difficulty`.
- Tệp: `src/difficulty.ts` (mới), `src/orchestrator.ts` (`applyPlanDifficulty`), `src/config.ts`.
- Test: `test/s3-incident-difficulty.test.ts`, gồm giá trị biên.
- Cần đo: **chờ dữ liệu model theo pha** từ B-13 trên lượt chạy thật. Ngưỡng điểm là đề xuất của người làm, chưa được đo. Tín hiệu làn nằm trong bộ nhớ nên mất khi khởi động lại tiến trình, khi đó rơi về mức 2.

## 4. Việc còn cần đo, gom lại

| Việc | Ai làm | Điều kiện |
|---|---|---|
| Chạy B-14a thật | người điều phối | ngoài hook chặn `claude` |
| Đo B-12 và B-16 (g1–g6, arm B7cabO) | Phòng Nghiên cứu | lượt đo đăng ký prereg §9 |
| Đo B-17 | Phòng Nghiên cứu | có dữ liệu model theo pha |
| Đo hiệu quả cache của stablePrefix | người điều phối | sau B-14a |
| Đo P1, P2 (B-09), mức tăng token B-03 | Phòng Nghiên cứu | A/B F1 |
| Kiểm giao diện trang Token và KPI | người có trình duyệt | chưa ai kiểm |
| Chạy lại `prereg-tests.mjs --check` | người có quyền chạy | S4 báo LỆCH, chưa rõ nguyên nhân |

## 5. Lưu ý vận hành

- Thư mục kết quả chưa theo dõi bởi git trong `bench/vs-claude/results/` (`selftest-g/`, `selftest-g2/`, `2026-11-03-13-15/`, `2026-11-03-13-18/`) và `.s2-tmp/` cần người gộp xóa hoặc đưa vào `.gitignore`, để không commit nhầm.
- Test lỗi ở baseline (1 lỗi) không còn đỏ ở mọi lần chạy sau, nhưng chưa ai điều tra nguyên nhân. Có thể là test không ổn định; cần theo dõi.
- `continueTruncated` (`src/orchestrator.ts`) gọi `rt.run` trực tiếp. Không phải thay đổi mới và nằm trong đường `Orchestrator.call()`.
- Phần "args không đổi byte" khi tắt công tắc được S8 xác nhận bằng cách đọc test, chưa tự đổi cấu hình để đo lại.

## Sửa sau gộp (D9b · B-08, B-14)

**Nguồn:** bàn giao S1 (`36febd9`/`229c032`) và S2 (`9f31fbb`); số liệu ở dưới do S3 chạy trong lượt này trên Windows.

### 8 test đỏ trên Linux và nguyên nhân
- Các test: `claude-guard-paths.test.ts:38` (`..\..\ngoai\moi.txt`), `claude-guard.test.ts:29` (Grep `C:/Users/admin`), 5 test B-14b trong `claude-stable-prefix.test.ts` (root `C:/tmp/x`).
- Nguyên nhân: hook giải đường dẫn bằng `path.resolve`/`path.relative` theo nền tảng đang chạy. Trên Linux, `C:/…` và `..\..` bị coi là đường dẫn tương đối nên không bị chặn (hoặc bị chặn nhầm với root `C:/…`).
- Số 8 lấy từ báo cáo của người điều phối; S3 **chưa tái hiện** trên Linux (xem "Bằng chứng Linux").

### Cách sửa (S1, D1–D5)
- `src/tools/guard-paths.ts`: chọn `path.win32` hay `path.posix` theo kiểu đường dẫn của root (`pathImplFor`), không theo `process.platform`. `isWinAbs` được xuất từ đây, `shell-policy.ts` import lại (một định nghĩa duy nhất).
- Đường dẫn của tool khác kiểu root thì coi là ngoài root (`C:/…` khi root POSIX; `/…` và UNC khi root Windows). Ngoại lệ: MSYS `/c/…` khi root Windows được đổi bằng `msysToWin` rồi so.
- Dấu `\` luôn đổi thành `/` trước khi resolve theo posix. `realpathSync.native` chỉ gọi khi kiểu đường dẫn khớp nền tảng chạy; root win32 so không phân biệt hoa thường.
- 6 test B-14 mới tiêm kiểu đường dẫn qua root để chạy ngữ nghĩa Linux ngay trên Windows.

### fast-lane.test.ts:182 (nguồn: bàn giao S2)
- **Nguyên nhân chưa được chứng minh.** S2 không tái hiện được (20/20 đạt trước khi sửa). Giả thuyết: spawn `bash` vượt timeout 5 s khi máy tải, hoặc `bash` phân giải sang WSL.
- Cách làm chắc hơn: `pickBash()` chọn Git Bash tường minh, timeout 5 s → 30 s, thêm ca đối chứng `input: ''` để phân biệt chậm với treo, `rmSync` bọc `try/catch`. Test không bị xóa; vẫn kiểm "không treo khi stdin là pipe không đóng".
- Vì chưa có nguyên nhân chứng minh, không khẳng định đã hết chập chờn; 3 lần chạy dưới chỉ cho thấy không tái phát.

### Số liệu do S3 chạy (Windows)
| Lệnh | Kết quả |
|---|---|
| `npm run build` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` lần 1 | exit 0 · tests 331 · pass 328 · fail 0 · skipped 3 |
| `npm test` lần 2 | exit 0 · tests 331 · pass 328 · fail 0 · skipped 3 |
| `npm test` lần 3 | exit 0 · tests 331 · pass 328 · fail 0 · skipped 3 |

### Bằng chứng Linux
`wsl -l -v` chỉ có `docker-desktop`, không có distro chạy Node. Chưa chạy trên Linux; ngữ nghĩa Linux được phủ bằng test tiêm path.posix của S1.

**Người điều phối chạy trên Linux (3/11/2026, sau khi gộp D9b `de9d92e` và BRIEF-13 `742fbcb`).**
- Sau D9b, 7/8 test đỏ đã xanh: `claude-guard-paths:38`, `claude-guard:29` và 5 test B-14b.
- **Test thứ 8:** `s3-incident-difficulty.test.ts` "B-09: công tắc tắt → prompt trùng từng byte". Lỗi do băm chụp chỉ đúng trên Windows: `src/prompts.ts` chỉ thêm ghi chú "Shell là PowerShell" khi `process.platform === 'win32'`, không phải do B-09 làm đổi prompt.
- **Kiểm chứng:** dựng đúng fixture của test trên mã `90cd913` (trước B-09) chạy Linux, cho `execute f0c3a63729e64800`, `revise 9dcde8fcc4ffcded`, `synthesize 82b8ba8ef40d98b8`. Mã hiện tại trên Linux cho cùng ba giá trị, nên tính bất biến khi tắt công tắc vẫn đúng trên Linux.
- **Sửa:** băm chụp theo nền tảng (bản win32 giữ nguyên, thêm bản posix). Không đổi `src/`.

| Lệnh (Linux, Node 22) | Kết quả |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run build` | exit 0 |
| `npm test` lần 1, 2, 3 | exit 0 · tests 331 · pass 331 · fail 0 · skipped 0 (cả ba lần) |
| 3 lệnh kiểm của dự án `ccoding-research` | exit 0 |
| `holdout-sample-size.mjs --size` và `--check holdout-and-sample-size.md` | exit 0, hash khớp `holdout-lock.json` |

- `fast-lane.test.ts:182` xanh ở cả 3 lần trên Linux.
- **Số skipped khác nhau:** Windows bỏ qua 3 test, Linux 0. Có ba test tự bỏ qua trên win32:
  - `bench.test.ts:248` (`skip: process.platform === 'win32'`);
  - `logview.test.ts:96` (herdr giả dùng shebang);
  - `claude-guard-paths.test.ts:77, :121` (`t.skip(why)`, tùy quyền tạo liên kết).

  Con số 3 của Windows khớp với các test này, nên đây không phải lỗi.

### Rà "không nới chính sách" (D6)
`git diff 3da8dc5 HEAD` trên `test/claude-guard*.test.ts`, `claude-stable-prefix.test.ts`, `shell-policy.test.ts`: không có dòng nào bị xóa/sửa (chỉ `claude-guard-paths.test.ts` được thêm 42 dòng). Các ca chặn cũ (`../`, symlink, junction, `.claude/` ngoài tool-results, Grep ra ngoài) giữ nguyên kỳ vọng. D3 có test cho cả hai chiều: `C:/…` khi root POSIX và `/etc/passwd`, UNC khi root Windows đều bị chặn.

## Phụ lục A. Commit

| Mục | Commit | Commit gộp vào nhánh nhiệm vụ |
|---|---|---|
| B-07 | `7a2dacf` | `6bd681d` |
| B-14a | `346cf8d` | `6bd681d` |
| B-08, B-14b | `e482fc9` | `351ef87` |
| B-03, B-09, B-17 | `8ec6ef3` | `0a155e1` |
| B-13 (bench), bộ đọc cổng B-12 | `8a3f1a7` | `1f38784` |
| B-12, B-16 (arms.json) | `a0e6011` | `1f38784` |
| Test của S4 | `4d83465` | `1f38784` |
| B-13 (ứng dụng) | `da52654` | `bee8f11` |
| B-12 (bài g1–g6) | `d06c9a5` | `9ea9726` |
| Kiểm tích hợp | `e1e4903` | `302b925` |

Hash là dạng rút gọn lấy từ `git log --oneline`. Ba mục B-03, B-09, B-17 chung một commit vì sửa chung ba tệp.

## Phụ lục B. Câu hỏi còn mở

- Có tách commit `8ec6ef3` thành ba commit theo mã B-xx không? Quy ước "mỗi commit ghi mã B-xx" hiện chỉ đáp ứng bằng một commit chung.
- B-08 và B-14b cũng chung một commit `e482fc9`.
- `/api/cache` nên đọc qua `LogStore` hay đọc `calls.jsonl` trực tiếp như `kpiReport`?
