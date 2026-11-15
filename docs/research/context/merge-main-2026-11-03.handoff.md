# Bàn giao S1 → S4: gộp `origin/main` (9e6079b) vào nhánh nghiên cứu (D8)

Nhãn dữ liệu: **Nội bộ**. Nhiệm vụ không đưa dữ liệu mới vào. Nhánh gốc 8837bf5; merge-base e0bd2f4; 16 commit của `main` (KPI v2 và probe, giao diện v2, lộ trình REA, đổi người phụ trách/dự án tại chỗ).

## (a) Xung đột theo tệp
Git báo xung đột văn bản ở 2 tệp. Các tệp còn lại tự gộp sạch (`src/kpi.ts`, `src/server.ts`, `src/types.ts`, `test/process.test.ts`).

| Tệp | Xung đột | Cách giải |
|---|---|---|
| `src/orchestrator.ts` (pha review, quanh `parseReview`) | Nhánh thêm `assignStrayIssues` + ép `review.approved=false`. `main` thêm `const reviewerApproved = review.approved` (KPI chấm reviewer theo kết luận gốc). | Giữ cả hai, đặt `reviewerApproved` **trước** khối `stray`. Nếu đặt sau, kết luận gốc của reviewer sẽ bị ép sai trước khi KPI đọc. |
| `docs/data-protection-assessment.md` | Cả hai phía cùng thêm phần ở cuối tệp. | Nối: phần của nhánh (B-xx) trước, phần "Bổ sung: sửa KPI v2 và bộ probe" của `main` sau. Không mất dòng nào. |
| `src/orchestrator.ts`, `src/types.ts`, `src/kpi.ts`, `src/server.ts`, `test/process.test.ts` (tự gộp) | Hai phía sửa vùng khác nhau. | Giữ nguyên kết quả tự gộp. `npm run typecheck` và test xác nhận. |

Tệp nhánh sửa mà `main` không chạm đều giữ nguyên (`git diff --cached HEAD` rỗng): `config.ts`, `lane.ts`, `plan-gate.ts`, `planner.ts`, `prompts.ts`, `quality-gate.ts`, `slim.ts`, `runtimes/claude-cli.ts`, `tools/claude-guard.ts`, `tools/shell-policy.ts`, `bench/vs-claude/`.

## (b) Mặc định công tắc B-xx, trước và sau gộp
Các tệp nguồn bên dưới không nằm trong diff của merge, nên giá trị trùng 100 %. Chỉ `orchestrator.ts` dịch dòng.

| Mã | Công tắc / mặc định | Nguồn trước | Nguồn sau | Trùng |
|---|---|---|---|---|
| B-01 | `lanes.single = { enabled: true, maxParts: 5, maxFilesTouched: 6 }`; `options.lane` > `ProjectDef.lane` > auto | `src/config.ts:307` (kiểu `:161-164`) | `src/config.ts:307` | ✔ |
| B-01 | `fastLane = { enabled: true, maxBriefChars: 4000, maxRepoFiles: 300, maxRepoBytes: 1_500_000, planModel: 'sonnet', finalReport: 'template', maxParallel: 4 }` | `src/config.ts:306` | `src/config.ts:306` | ✔ |
| B-02 | `gate.maxFixRounds = 2` (đọc `?? 2`) | `src/config.ts:295`; `src/orchestrator.ts` (`config.gate?.maxFixRounds ?? 2`) | `src/config.ts:295`; `src/orchestrator.ts:3128` | ✔ |
| B-04 | Bộ tách lệnh shell có xét nháy, luôn bật (không có công tắc) | `src/tools/shell-policy.ts:144` | `src/tools/shell-policy.ts:144` | ✔ |
| B-05 | Không có công tắc cấu hình riêng trong `config.ts`/`types.ts` (grep không thấy) | — | — | ✔ (không đổi) |
| B-06 | Chẩn đoán chặn (sự kiện `guard.block`), luôn bật | `src/tools/shell-policy.ts:395` | `src/tools/shell-policy.ts:395` | ✔ |
| B-10 | Cổng phủ kế hoạch `planGate` (hàm thuần, không gọi LLM), luôn chạy khi `!solo`; kết quả ở `run.planGate` | `src/plan-gate.ts`; `src/types.ts:299` | `src/plan-gate.ts`; `src/types.ts` (cùng trường); `src/orchestrator.ts:1781` | ✔ |
| B-11 | `lanes.single.slim = { accept: 'full', compactTemplate: false, promptDiet: true }` | `src/slim.ts:19` (nạp ở `src/config.ts:307`) | `src/slim.ts:19`, `src/config.ts:307` | ✔ |
| Hook claude-guard | Luôn gắn `PreToolUse` `claude-guard.js` (timeout 15); `closeStdin` mặc định bật (`!== false`); `userSettings` mặc định tắt (`--strict-mcp-config --setting-sources project,local`); `useApiKey` tắt (`scrubEnv`) | `src/runtimes/claude-cli.ts:152-153,164,175,186` | cùng dòng | ✔ |

Kiểm chứng: `git diff --cached HEAD --stat` trên `src/config.ts src/slim.ts src/lane.ts src/plan-gate.ts src/quality-gate.ts src/planner.ts src/prompts.ts src/runtimes/claude-cli.ts src/tools bench/vs-claude` → rỗng.
Không có mặc định B-xx nào thay đổi.

## (c) Đầu ra kiểm tra thật (sau gộp)
- `npm run typecheck` → exit 0 (lần đầu có lỗi TS1185 do còn dấu xung đột; sau khi giải hết thì sạch).
- `npm test` lần 1 → exit 1: `pass 280 · fail 2 · skipped 3`. Hai test đỏ cùng nguyên nhân: `test/agent-probes.test.ts:26` ("probe --self-test…") và `:33` ("probe: API gốc Ollama đặt num_ctx…"). Thông điệp: `The requested module 'dist/kpi.js' does not provide an export named 'verificationClaim'`. `bench/agent-probes/probes.mjs` nạp `dist/` (gitignored) mà `dist/` là bản build cũ trước khi `main` thêm `verificationClaim`. Đây **không phải lỗi mã**.
- `npm run build` (`tsc -p tsconfig.json`) → exit 0, rồi `npm test` lần 2 → **exit 0: `pass 282 · fail 0 · skipped 3`**.
- EPERM `rmSync` (`test/fast-lane.test.ts:182`): **không xảy ra** ở cả hai lần chạy, số lần chạy lại vì EPERM = 0.
- Lưu ý cho người chạy sau: sau khi gộp phải `npm run build` trước `npm test`, nếu không `agent-probes.test.ts` đỏ vì `dist/` cũ. Baseline trước gộp có 1 test đỏ (`fail 1`); sau gộp 0 đỏ, nên không có lỗi mới.

## (d) Thay đổi hành vi của `main` (cho benchmark và §4 bài báo)
Diff `e0bd2f4..origin/main` trong `src/`: `app, budgets, cli, kpi, orchestrator, routines, runtimes/{api,cli-agents,external,index}, server, types`. `main` **không** sửa `config.ts`, `prompts.ts`, `planner.ts`, `lane.ts`, `claude-cli.ts`, `claude-guard.ts`, `shell-policy.ts`, nên:
- **Pha và model mặc định**: không đổi (`phases.models/maxTokens/toolTurns/toolInputBudget` vẫn ở `config.ts:299-304`, `defaults.budgetTokens=1_500_000`).
- **Prompt**: không đổi ở `prompts.ts`. `main` chỉ thêm văn bản trong KPI và giao diện.
- **Hook**: không đổi.
- **KPI** (`src/kpi.ts` +547 dòng): KPI v2 (`computeKpi`, `verificationClaim`, `checksOutcome`, `checksByDept`, `runtimeLimits`); Trung thực chỉ tính khẳng định có lệnh kiểm chứng thành công; hiệu chỉnh reviewer theo `run.review.reviewerApproved` (trường mới, ghi thêm vào `runs`); bỏ dòng ma `agent@?`. Chỉ là chỉ số đọc, không đổi luồng chạy. Bộ probe mới ở `bench/agent-probes/` (sandbox mã model sinh, kết quả ghi trong `data/`).
- **Ngân sách/trần token**: `src/budgets.ts` (mới) có chính sách theo dự án/agent, ngưỡng mềm và trần cứng, lưu `data/budgets.json`, tính từ sổ cái token. `Orchestrator.checkPolicies` (`orchestrator.ts:2232`, gọi ở `:3378`) chạy trước mỗi lượt gọi model và có thể **tạm dừng** nhiệm vụ (`pause.reason='budget'`). Mặc định không có chính sách nào nên không ảnh hưởng benchmark. Khi đo cần xác nhận `data/budgets.json` rỗng hoặc không có. Ngân sách theo nhiệm vụ (`budgetTokens`, `toolInputBudget`) không đổi.
- **Luồng nhiệm vụ**: backlog (`createTask` với `input.backlog` → `paused/backlog`), `setStage`, `updateProps` (đổi tiêu đề/ưu tiên/người phụ trách/dự án khi nhiệm vụ chưa chạy; không bao giờ hạ nhãn dữ liệu). Không ảnh hưởng nhiệm vụ do `run.mjs` sinh ra, vì chúng không dùng backlog.
- **Runtime**: thêm `src/runtimes/external.ts` (agent ngoài, 163 dòng) và sửa nhỏ `api.ts`, `cli-agents.ts`, `index.ts`. `claude-cli.ts` không đổi, nên cờ `claude -p` giống hệt trước gộp (B-14 không cần đo lại).
- **Giao diện** (`public/*`, `docs/KPI.md`, `docs/EXTERNAL-AGENTS.md`): giao diện v2, Kanban, KPI cạnh agent. Không ảnh hưởng số đo.
- Cần mô tả ở §4: KPI v2, ngân sách dự án/agent, agent ngoài, backlog/Kanban, bộ probe. Các mốc đo W1–W5 trước gộp dùng cùng luồng điều phối vì `main` không đổi `config.ts`/`prompts.ts`/`lane.ts`.
- Hành vi lệch giữa hai phía được giải ở (a): `reviewerApproved` ghi **trước** khi `assignStrayIssues` ép `approved=false`.

Data Protection Gate: không có dữ liệu mới, không cần đánh giá mới.
