# CCoding vs single Claude — benchmark suite

Compares CCoding's multi-agent office with a single Claude agent on the same briefs, workspaces, tools and runtime. Node ≥ 22, no dependencies.

## Layout

```
arms.json          systems under test (A0-opus, A0-sonnet, A1, A2, B0-B7, oracle, null)
run.mjs            runs arms × tasks × repeats (interleaved, resumable), grades, snapshots deliverables
analyze.mjs        hypotheses H1–H10, per-category scores, cost-quality frontier -> report.md, summary.csv, pareto.csv
pairwise.mjs       blinded pairwise LLM judge (both orders) for design / requirements / research deliverables
lib/queue.mjs      lượt đã xong, lane được hỗ trợ, kiểm arm trước khi chạy (hàm thuần, có test)
lib/               claude.mjs (single-agent arm) · ccoding.mjs (REST arm) · grade.mjs · judge.mjs
tasks/<id>/        task.json (brief, category, size/sizeBasis/sizeLegacy, grader) · repo/ (starting workspace) · hidden/ (tests, answers, references — never copied)
```

## Tasks (13 + t1–t5)

| Id | Category | Parts | Grader |
| --- | --- | --- | --- |
| c1-iis-ecs | coding | 2 | hidden node:test (6) |
| c2-burst-alert | coding | 2 | hidden node:test (7) |
| c3-shop-bugs | coding | 3 | hidden node:test (6), 3 seeded bugs in 3 files |
| c4-audit-chain | coding | 4 | hidden node:test (7) |
| c5-tickets-api | coding | 5 | hidden node:test (9), backward-compat trap |
| l1-oncall | logic | 1 | exact match (3 fields) |
| l2-knights | logic | 1 | exact match |
| l3-reconcile | logic | 2 | exact match; timezone, duplicate, refund, void traps |
| l4-startup-order | logic | 2 | exact match; hidden cycle |
| s1-sec-review | review | 3 | F1 over 7 seeded vulns + 3 decoys |
| a1-ambiguous-spec | requirements | 3 | 6-item checklist (regex or `--judge`) |
| r1-elk-design | design | 4 | 8-item checklist (regex or `--judge`), license trap |
| re1-lit-synthesis | research | 3 | answers, citation validity, correct refusal |


### Định nghĩa `size` (SR-05)

`size` = **số phần sản phẩm độc lập, kiểm được riêng** của bài, đếm theo đơn vị ghi ở `sizeBasis` (dạng `"<đơn vị>: <liệt kê>"`; số mục liệt kê phải bằng `size`):

| Đơn vị | Dùng cho | Cách đếm | Kiểm bằng máy |
| --- | --- | --- | --- |
| `files` | bài code có lời giải tham chiếu nhiều tệp (hoặc một) | số tệp `src/`, `bin/` mà lời giải tham chiếu (`ref/` hoặc `hidden/solution/`) tạo mới hoặc sửa so với workspace khởi đầu; không đếm test, tài liệu, `package.json`, dữ liệu | có (`test/task-size.test.mjs`) |
| `functions` | bài code một tệp | số hàm xuất / điểm vào brief bắt buộc | không |
| `answers` | logic, nghiên cứu | số khóa của `answer.json` | có |
| `sections` | tài liệu (requirements, design) | số phần brief liệt kê bắt buộc | không |
| `deliverables` | review | số tệp sản phẩm | không |

`sizeLegacy` giữ số cũ (1–5, chưa có định nghĩa) để tái lập kết quả đã công bố (D7); **không** dùng `sizeLegacy` cho phân tích mới. Giới hạn đã biết: đơn vị không đồng nhất giữa các loại bài, nên H10 phải điều chỉnh theo loại bài (SR-05 i); bài một tệp nhiều hành vi (c5) bị đếm 1.

| Bài | size cũ | size mới | Đơn vị |
| --- | --- | --- | --- |
| a1-ambiguous-spec | 3 | 2 | sections |
| c1-iis-ecs | 2 | 1 | functions |
| c2-burst-alert | 2 | 1 | functions |
| c3-shop-bugs | 3 | 3 | files |
| c4-audit-chain | 4 | 4 | functions |
| c5-tickets-api | 5 | 1 | functions |
| g1-slug-dedupe | 2 | 1 | files |
| g2-cart-coupon | 2 | 2 | files |
| g3-qty-rename | 4 | 4 | files |
| g4-gb-unit | 4 | 4 | files |
| g5-median-stats | 2 | 1 | files |
| g6-range-merge | 2 | 1 | files |
| l1-modules | 5 | 5 | files |
| l1-oncall | 1 | 3 | answers |
| l2-chain | 4 | 7 | files |
| l2-knights | 1 | 3 | answers |
| l3-reconcile | 2 | 4 | answers |
| l4-startup-order | 2 | 3 | answers |
| r1-elk-design | 4 | 6 | sections |
| re1-lit-synthesis | 3 | 4 | answers |
| s1-sec-review | 3 | 1 | deliverables |
| t1-duration | 2 | 1 | files |
| t2-orders | 6 | 4 | files |
| t3-api | 4 | 6 | files |
| t4-perf | 1 | 1 | files |
| t5-logq | 4 | 4 | files |

### Nhãn `hypotheses` (SR-15)

Nhãn trong `task.json` được đồng bộ với bộ lọc thật của `analyze.mjs`: **H1** = `category` ∈ {coding, design} và `size >= 3` (size mới); **H2** = logic; **H3** = review; **H4** = requirements; **H9** = research. H5–H8 và H10 tính trên mọi bài (H5/H6 giữ nhãn theo tập bài đã khai báo ở `preregistration.md` §2.5). Nhãn `B-12` đánh dấu bài thuộc bộ cổng g1–g6. `test/task-hypotheses.test.mjs` kiểm H1/H2/H3/H4/H9; đổi `size` thì nhãn H1 đổi theo.

### Bộ bài cài lỗi g1–g6 (B-12)

Sáu bài tổng hợp (không dựa trên t1–t5) để đo recall của cổng chất lượng. Chọn bằng `run.mjs --tasks suite:gates` (bảng tên ở `_suites.gates` trong `arms.json`). Cấu trúc như t1–t5 (`starter/`, `hidden/`, `ref/`, `prompt.txt`, `task.json` với `repoDir`/`solutionDir`), grader `code`. Nhãn thật nằm ở `task.json` → `plantedFaults: [{class, where, expectGate}]`; `plantedFaultNote` mô tả cách lỗi lọt qua.

| Id | class | expectGate | Lỗi cài sẵn | Test công khai ở starter |
| --- | --- | --- | --- | --- |
| g1-slug-dedupe | red-check | b02 | `slugify` không cắt dấu gạch hai đầu | **đỏ** |
| g2-cart-coupon | red-check | b02 | `toCents` dùng floor (19.99 → 1998) ở module phụ | **đỏ** |
| g3-qty-rename | plan-omission | b10 | đổi `qty`→`quantity`; `export.js`, `stock.js` không có test công khai | xanh |
| g4-gb-unit | plan-omission | b10 | thêm GB; `parse.js`, `validate.js` có danh sách đơn vị riêng | xanh |
| g5-median-stats | hidden-wrong | cto | `median` sort theo chuỗi, sai khi chẵn, đổi mảng gốc | xanh |
| g6-range-merge | hidden-wrong | cto | `overlaps` dùng `<=` với khoảng nửa mở | xanh |

Tự kiểm không gọi LLM: `node run.mjs --arms oracle,null --tasks suite:gates --repeats 1` — oracle phải 1,00, null thấp (≤ 0,25 mặc định).

### Bài t1–t5 (từ harness cũ) và `repoDir`/`solutionDir`

`tasks/t1-duration` … `t5-logq` giữ nguyên cấu trúc cũ (`starter/`, `prompt.txt`, `hidden/`, `ref/`) và có thêm `task.json` (`category: "coding"`, `size` + `sizeReason`, `brief` lấy từ `prompt.txt`, grader dùng `hidden/` có sẵn). Hai trường tùy chọn cho phép runner dùng thư mục không theo quy ước mới:

- `repoDir`: workspace khởi đầu (mặc định `repo/`; t1–t5 dùng `"starter"`). Thiếu thư mục thì runner tạo workspace rỗng, không lỗi ENOENT.
- `nullMax` (tùy chọn): ngưỡng null riêng của bài khi tự kiểm, mặc định 0,25; chỉ dùng cho ngoại lệ có `nullMaxReason` (hiện chỉ t2-orders).
- `solutionDir`: lời giải cho arm `oracle` (t1–t5 dùng `"ref"`), chép đè lên workspace trước khi chấm.

Grader code chép mọi tệp cấp 1 của `hidden/` (helper như `_helpers.js`) nhưng chỉ chạy `*.test.js`.

## Run

```bash
# 0. Grader self-test (no LLM, ~5 s): oracle must score 1.00 on every task, null near 0
node bench/vs-claude/run.mjs --arms oracle,null --repeats 1 --out bench/vs-claude/results/selftest

# 1. Start CCoding (for B arms)
node dist/cli.js serve

# 2. Pilot: 2 arms × 13 tasks × 1 repeat
node bench/vs-claude/run.mjs --arms A0-sonnet,B0 --repeats 1 --out bench/vs-claude/results/pilot

# 3. Full study (resumable — re-run the same command after an interruption)
node bench/vs-claude/run.mjs --arms A0-opus,A0-sonnet,A1,A2,B0,B1,B2,B6 --repeats 3 --judge --out bench/vs-claude/results/full

# 4. Analyse
node bench/vs-claude/analyze.mjs bench/vs-claude/results/full --baseline A0-sonnet --treatment B0
node bench/vs-claude/pairwise.mjs bench/vs-claude/results/full --x A0-opus --y B0

# Chế độ chấm (SR-07): MỘT chế độ cho cả nghiên cứu. Chạy chính LUÔN có `--judge` (regex chỉ là lưới an toàn).
# analyze.mjs từ chối khi `details.judge` khác nhau giữa các lượt cùng bài và ghi model giám khảo vào báo cáo.
# Cờ phân tích: `--strict` (từ chối khi một arm có nhiều hơn một hash CCoding, SR-03) · `--legacy-rng` (LCG cũ + xáo H10 cũ, chỉ để tái lập số đã công bố, SR-20)
# · `--allow-mixed-judge` (chỉ để đối chiếu dữ liệu cũ lẫn regex/opus; không dùng cho phân tích chính) · `--b01-arm SL` (arm cho dòng TOST B-01).
```

Options: `--tasks all|<id>,<prefix>,<category>` · `--repeats N` · `--timeout <min>` · `--runtime claude-cli` · `--ccoding-url` · `--ccoding-data <CCoding data dir>` (for `calls.jsonl` token detail; default `../../data`) · `--judge --judge-model opus` · `--claude-bin <path>` · `--work <dir>` (workspaces; default OS temp) · `--dry-run`. Test đơn vị: `node --test "bench/vs-claude/test/*.test.mjs"` (Node 24 không nhận tên thư mục).

## Arm B6 và B7

- **B6** — CCoding làn nhanh (`options.lane: "fast"`).
- **B0F** / **B1F** — CCoding ép làn đầy đủ (`options.lane: "full"`), B1F thêm `discussionRounds: 0` (bỏ họp). Dùng khi B0 tự chọn làn nhanh/đơn nên không có pha họp (E3, `l1-modules`, `l2-chain`).
- **B7** — CCoding làn đơn (`options.lane: "single"`), **chờ B-01** (`docs/research/improvement-backlog.md`). Trước khi gửi task, runner đọc union `lane` trong `src/types.ts` (hoặc `dist/types.d.ts`). Nếu chưa có `'single'`, runner thoát mã 2 với "Arm B7 cần lane 'single' (B-01) — CCoding hiện chưa hỗ trợ" và không chạy sang làn khác. `--dry-run` vẫn liệt kê lượt B7.

## Hạn mức tài khoản và chạy tiếp

Nếu một lượt gặp hạn mức (HTTP 429 `usage_limit_reached`, "You've hit your 5-hour limit · resets 4:50pm"), runner:

1. ghi dòng `status: "infra"`, `infra: "rate-limit"`, `resetsAt` (chuỗi thô từ thông báo, không đổi múi giờ) vào `runs.jsonl`, không chấm điểm;
2. in giờ mở lại;
3. dừng hàng đợi, **mã thoát 3**.

Lỗi hạ tầng khác (`infra: "error"`: không spawn được `claude`, không gửi được task, mất kết nối server) cũng ghi dòng infra nhưng hàng đợi đi tiếp. Dòng infra không tính là xong: chạy lại **đúng lệnh cũ** sau giờ mở lại thì các lượt đó được chạy lại. `analyze.mjs` loại các dòng infra và in số dòng đã loại. Chữ "rate limit" đứng một mình (trong mã/log của agent) không bị coi là hạn mức; cần tín hiệu mạnh (429, `usage_limit_reached`, "hit your … limit").

## So cờ `claude`: arm A0, harness cũ, CCoding

| Cờ | lib/claude.mjs | harness cũ | CCoding (`claude-cli.ts`) | Quyết định | Lý do |
|---|---|---|---|---|---|
| `--strict-mcp-config` | có | có | có, trừ khi `userSettings` | giữ | khớp |
| `--setting-sources` | không có (trước) | `project,local` | `project,local` | thêm `project,local` | không nạp MCP, hook, cài đặt cấp người dùng; trước đây A0 khác điều kiện |
| `--no-session-persistence` | có | có | có | giữ | khớp |
| `--permission-mode` | `acceptEdits` | `acceptEdits` | `acceptEdits` (`cfg.permissionMode`) | giữ | khớp |
| model | `--model <model>` | `--model <model>` | `--model` theo ánh xạ model của runtime | giữ | do arm truyền vào |
| công cụ cho phép | `--allowedTools Read,Write,Edit,Bash,Grep,Glob` | `Bash,Read,Edit,Write,Grep,Glob,TodoWrite,Task,Agent,NotebookEdit` | `--tools` theo vai trò, cộng `--allowedTools` | giữ khác (cố ý) | A0 là "một agent làm việc"; `Task` bị cấm để không sinh sub-agent. Harness cũ cho phép `Task` và `Agent` vì đo baseline mạnh. |
| `--disallowedTools` | `WebFetch,WebSearch,Task` | không có | không có (`--tools` đã giới hạn) | giữ khác (cố ý) | tắt web, giữ A0 đơn thuần |
| `--settings` hook `claude-guard` | không có | không có | có | giữ khác (cố ý) | chính sách riêng của CCoding, thuộc điều kiện của arm B |

`--allowedTools` chỉ cấp quyền chạy không hỏi, không giới hạn công cụ có sẵn: `TodoWrite` và `NotebookEdit` vẫn dùng được trong A0, còn CCoding dùng `--tools` để giới hạn thật. Chưa đổi sang `--tools` vì sẽ lệch định nghĩa của giám đốc; để Phòng Nghiên cứu quyết.

## Verified

- 2026-11-02: grader self-test - oracle 1.00 on all 18 tasks, null ≤ 0.25 on 17; ngoại lệ có chủ đích **t2-orders** null = 0.533 (`results/selftest/`). Test ẩn cũ của t2 cũng chấm hành vi `starter/` đã đúng; không sửa `hidden/` vì harness cũ còn dùng. `task.json` của t2 khai `nullMax: 0.6` kèm `nullMaxReason`. Khi so arm trên t2, trừ/đối chiếu điểm nền 0.533; kết quả t2 không nên đọc riêng lẻ.
- 2026-11-02: CCoding arm end-to-end against `node dist/cli.js serve` with `--runtime mock` (B0 and B5): project registration, task submission, polling, FINAL.md, calls.jsonl token accounting and phase breakdown (route ... accept) all work. Single-Claude arms tested with a stub `claude` binary.

## Fairness rules

- Same brief text, fresh git workspace per run, tools `Read,Write,Edit,Bash,Grep,Glob`, no web, same runtime.
- Workspaces live outside the suite; any run whose transcript or tool calls touch `hidden/`, answers or checklists is flagged `leak` and excluded.
- Order is interleaved and rotated per repeat. Run when the machine is idle; do not mix plans or rate-limit states mid-study.
- CCoding runs with `planApproval: false` (no director approval wait) and `budgetMode: complete`. B4 turns CTO acceptance off; B5 assigns the whole brief to one CCoding agent (`senior-swe`) to separate CCoding's scaffolding from the multi-agent office.
- CCoding writes its FINAL report in Vietnamese; graders only read the deliverable files, and the pairwise judge is told to ignore language.
- A2 picks its best candidate using only visible tests or a self-judge, never hidden graders.
- Weighted tokens = input + 1.25 × cache write + 0.1 × cache read + 5 × output (same as `ccoding bench`).

## Output (`results/<run>/`)

`runs.jsonl` (one row per run: score, details, tokens, cost, wall time, leak flag) · `artifacts/<key>/` (deliverable snapshot + `_FINAL.txt`) · `report.md` · `summary.csv` · `pareto.csv` · `pairwise.jsonl` / `pairwise.md`.

### Chi phí (USD) và giá Haiku 5.5 (D12/K2)

`lib/pricing.mjs` (phiên bản `PRICING_VERSION`) tính `costUsd` cho arm CCoding theo model của từng dòng `calls.jsonl`. Model không có trong bảng ⇒ `costUsd: null`, `costBasis: 'unknown-model'` (không đoán). Nguồn giá Haiku 5.5 và bảng trích nguyên văn nằm ở đầu `lib/pricing.mjs`.

- Haiku 5.5 có hai bậc giá theo độ dài prompt (ngưỡng 100K token, trang chính thức), nhưng `calls.jsonl` chỉ có token cộng dồn nên không biết bậc từng request. Quy ước: `costUsd` = **cận trên** (bậc > 100K), `costUsdLow` = **cận dưới** (bậc ≤ 100K), `costBasis` có hậu tố `/haiku-tier-upper`. Lượt không có Haiku giữ nguyên dạng cũ (không có `costUsdLow`). Đọc cache của Haiku là 0,1× giá input (Sonnet/Opus: 0,05×).
- Dữ liệu đã công bố trước 4/11/2026 (ví dụ `results/large-pilot`) có `costUsd: null` ở arm CCoding. `runs.jsonl` là dữ liệu thô, không sửa. Tính lại bằng:

```bash
node bench/vs-claude/recost.mjs bench/vs-claude/results/<run>            # ghi results/<run>/costs-recomputed.json
node bench/vs-claude/recost.mjs bench/vs-claude/results/<run> --out /tmp/costs.json
```

  Nguồn token: `<run>/calls/<key>.jsonl` nếu có; không thì `byPhaseDetail` × `byPhaseModel` của dòng `runs.jsonl` (cần mỗi pha đúng một model). Dòng không tính lại được giữ số cũ và ghi lý do. Phân tích dùng khoảng `[costUsdLow, costUsd]`.

## Older harness on this branch (`harness/`, tasks t1–t5, rounds C1–C9)

Before this suite, the `perf/vs-claude-loop` branch measured the same question with `harness/run.mjs` on five coding tasks
(`tasks/t1-duration` … `tasks/t5-logq`: `starter/`, `prompt.txt`, `hidden/`, `ref/`; nay có `task.json` riêng nên `run.mjs` ở trên chạy được chúng; cấu trúc thư mục cũ không đổi). `harness/` chỉ dùng module của node, không import `lib/`, nên thay đổi ở `lib/` không ảnh hưởng nó. Hai harness cùng tồn tại: harness cũ cho vòng C1–C9 (so được với kết quả cũ), bộ này là hệ đánh giá chính.
Docs: [`harness/README.md`](harness/README.md); results: `results/C1` … `results/C9`, `results/runs.csv`; analysis: `docs/PROCESS-REVIEW.md` §13 and `docs/research/`.

### Arm `nearmiss` và bài khám phá (SR-24, SR-11)

- `nearmiss` (tự kiểm bộ chấm, không gọi LLM, chi phí 0): chạy như `oracle` rồi đè `tasks/<id>/hidden/nearmiss/` lên workspace; mọi bài phải có thư mục này và phải chấm `0 < điểm < 1` (oracle = 1,00). Bài code: lời giải tham chiếu bị đột biến một chỗ; bài khác: đáp án/tham chiếu bỏ hoặc sai một mục. `hidden/nearmiss.note.txt` ghi chỗ đột biến. Kiểm: `node bench/vs-claude/run.mjs --arms oracle,null,nearmiss --repeats 1 --out <tmp>`.
- Ba bài khám phá `a2-oncall-sms` (requirements), `re2-stream-synthesis` (research, rubric riêng ở `hidden/rubric.json`), `s2-support-review` (review, có decoy): `"set": "exploratory"`, `hypotheses: []`, không có `sizeLegacy`; `analyze.mjs` chỉ đưa vào bảng khám phá (D6).

## E9-lite: chuẩn từ lời giải mẫu

`e9/gold-from-solution.mjs` (công cụ; KHÔNG gán nhãn chia được hay không, KHÔNG chọn bài) liệt kê với mỗi bài có cả `repoDir` và `solutionDir` các tệp thêm/sửa/xóa giữa hai thư mục (đường dẫn tương đối dùng `/`), số dòng thêm/xóa (Myers, sau khi chuẩn hóa CRLF→LF; nhị phân hoặc quá lớn → `null` kèm `flag`), module (thư mục cấp một, tệp ở gốc là `.`), `size` và `sizeBasis` (thiếu → `null`). Tệp chỉ khác CRLF/LF bị bỏ. Bỏ qua `node_modules`, `.git`, `.venv`, `__pycache__`, `.ccoding`. Đầu ra JSON sắp ổn định, có trường `sha256` (băm phần còn lại).

```bash
node bench/vs-claude/e9/gold-from-solution.mjs [--tasks-dir bench/vs-claude/tasks] [--out gold.json]
```

Test: `bench/vs-claude/test/e9-gold.test.mjs`, fixture `bench/vs-claude/test/fixtures/e9-gold/`.

## E9-lite: arm chỉ lập kế hoạch (P-H/P-S/P-O)

Ba arm `P-H`, `P-S`, `P-O` (`arms.json`) giống hệt nhau, chỉ khác `options.planModel` (`haiku`/`sonnet`/`opus`). Mỗi lượt gửi nhiệm vụ CCoding với `options: { lane: 'fast', planOnly: true, planModel }`: engine định tuyến, lập kế hoạch, qua cổng kế hoạch (kể cả sửa) rồi dừng; không thực thi, không chấm, không judge, **không in điểm**. Chỉ dùng được khi engine có `planOnly` (K1).

```bash
# server CCoding đang chạy (node dist/cli.js serve); thêm --runtime mock để chạy trọn luồng không gọi `claude -p`
node bench/vs-claude/run.mjs --arms P-H,P-S,P-O --tasks <id,id,...> --repeats 3 --seed e9lite-1 --out <thư-mục-out>
node bench/vs-claude/run.mjs --arms P-H,P-S,P-O --tasks <id,...> --repeats 3 --seed e9lite-1 --out <thư-mục-out> --dry-run   # chỉ xem thứ tự
```

- **Thứ tự**: xáo theo khối bài, tất định theo `--seed`: thứ tự bài xáo theo seed; trong mỗi bài, các cặp arm×lần lặp cũng xáo theo seed + tên bài. Không trộn arm `P-*` với arm có chấm điểm trong cùng một lệnh (thoát mã 2).
- **Chạy tiếp**: chạy lại đúng lệnh với cùng `--out` và `--seed`; khóa `bài__arm__rN` đã `done` trong `runs.jsonl` bị bỏ qua. Lượt `error`/`failed`/`infra` được chạy lại.
- **Mỗi lượt một dòng `runs.jsonl`**: khóa `{task, arm, rep}`; `planRaw`, `planFinal` (mảng `{id, title, assignee, dependsOn, files}`, `files` trích từ mô tả bằng `extractFiles` trong `lib/plan-only.mjs`); `planGate`; `replanCount` (= `run.planReplans`); `usage`; `planModel {arm, actual, source, match}`; `authSource`; `configHash` (sha256 của cấu hình arm + seed + runtime); `ccodingCommit`; `claudeCliVersion`. Không có `score`/`pass`.
- **Model lệch**: nếu model thật của lượt `plan` không chứa tên `planModel` của arm, dòng ghi `status: 'error'` kèm `error` (nhãn arm không được sai; lượt chạy lại khi chạy tiếp).
- **Ép làn**: `lane: 'fast'` ép làn nhanh như B6; với `planOnly` engine cũng đổi làn đơn thành làn nhanh. Muốn làn khác thì thêm arm mới, không sửa ba arm này.
- **`authSource`**: runtime `mock` ghi `mock`; với runtime thật, harness không thấy nguồn xác thực của server CCoding nên ghi `null` (người vận hành xác nhận phiên đăng nhập ở máy chạy server). `claudeCliVersion` là `null` khi `--runtime mock`.
- **Dữ liệu**: nhãn **Nội bộ**, chỉ gồm bài bench tổng hợp, không có PII, không đi xuyên biên giới. Chỉ thêm trường vào `runs.jsonl` trong thư mục `--out`; log CCoding vẫn qua `LogStore`.

Test: `bench/vs-claude/test/plan-only-arms.test.mjs` (server giả + runtime mock).
