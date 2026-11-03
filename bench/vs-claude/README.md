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
tasks/<id>/        task.json (brief, category, size, grader) · repo/ (starting workspace) · hidden/ (tests, answers, references — never copied)
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
```

Options: `--tasks all|<id>,<prefix>,<category>` · `--repeats N` · `--timeout <min>` · `--runtime claude-cli` · `--ccoding-url` · `--ccoding-data <CCoding data dir>` (for `calls.jsonl` token detail; default `../../data`) · `--judge --judge-model opus` · `--claude-bin <path>` · `--work <dir>` (workspaces; default OS temp) · `--dry-run`. Test đơn vị: `node --test "bench/vs-claude/test/*.test.mjs"` (Node 24 không nhận tên thư mục).

## Arm B6 và B7

- **B6** — CCoding làn nhanh (`options.lane: "fast"`).
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

## Older harness on this branch (`harness/`, tasks t1–t5, rounds C1–C9)

Before this suite, the `perf/vs-claude-loop` branch measured the same question with `harness/run.mjs` on five coding tasks
(`tasks/t1-duration` … `tasks/t5-logq`: `starter/`, `prompt.txt`, `hidden/`, `ref/`; nay có `task.json` riêng nên `run.mjs` ở trên chạy được chúng; cấu trúc thư mục cũ không đổi). `harness/` chỉ dùng module của node, không import `lib/`, nên thay đổi ở `lib/` không ảnh hưởng nó. Hai harness cùng tồn tại: harness cũ cho vòng C1–C9 (so được với kết quả cũ), bộ này là hệ đánh giá chính.
Docs: [`harness/README.md`](harness/README.md); results: `results/C1` … `results/C9`, `results/runs.csv`; analysis: `docs/PROCESS-REVIEW.md` §13 and `docs/research/`.
