# Gộp `main` mới vào nhánh nghiên cứu: xung đột, thay đổi hành vi và ảnh hưởng tới benchmark

Nhãn dữ liệu: **Nội bộ**. Tài liệu dành cho Phòng Nghiên cứu và người chạy benchmark local. Nó ghi lại việc gộp nhánh `main` mới vào nhánh `perf/vs-claude-loop`, những gì `main` thay đổi, và phần nào cần mô tả ở §4 của báo cáo khoa học.

Nguồn: tệp bàn giao `merge-main-2026-11-03.handoff.md` (kết quả gộp, bảng B-xx, kết quả kiểm tra) và lịch sử git chỉ đọc của `main`. Điều gì chưa kiểm chứng bằng chạy thật được ghi rõ là giả định.

## 1. Tóm tắt

Nhánh nghiên cứu đã nhận toàn bộ 16 commit mới của `main` bằng một merge commit, không rebase và không đẩy lên `main`. Git chỉ báo xung đột ở hai tệp, cả hai đã được giải mà không mất nội dung của phía nào. Mặc định của mọi công tắc B-xx không đổi. Typecheck và toàn bộ test xanh sau khi build lại `dist/`.

Kết luận cho benchmark: luồng điều phối, pha, model mặc định, prompt và hook không đổi. Phần `main` thêm vào chủ yếu là chỉ số đọc (KPI v2), giao diện, runtime ngoài và chính sách ngân sách mặc định rỗng. Ngoại lệ cần kiểm trước mỗi lần đo là tệp `data/budgets.json`.

## 2. Xung đột và cách giải

Mục này liệt kê từng tệp mà hai phía cùng sửa. Hai tệp có xung đột văn bản; các tệp còn lại tự gộp sạch vì hai phía sửa vùng khác nhau.

| Tệp | Loại | Cách giải |
|---|---|---|
| `src/orchestrator.ts` (pha review, quanh `parseReview`) | Xung đột văn bản | Giữ cả hai phía. Đặt `reviewerApproved` trước khối `assignStrayIssues`. |
| `docs/data-protection-assessment.md` | Xung đột văn bản | Nối phần B-xx của nhánh, rồi phần "Bổ sung: sửa KPI v2 và bộ probe" của `main`. Không mất dòng nào. |
| `src/types.ts`, `src/kpi.ts`, `src/server.ts`, `test/process.test.ts` | Tự gộp | Giữ kết quả tự gộp; typecheck và test xác nhận. |

Về `src/orchestrator.ts`: nhánh thêm `assignStrayIssues` và ép `review.approved=false` khi còn vấn đề lạc hướng. `main` thêm `const reviewerApproved = review.approved` để KPI chấm reviewer theo kết luận gốc. Nếu đặt `reviewerApproved` sau khối ép, KPI sẽ đọc giá trị đã bị ép và chấm sai reviewer. Vì vậy thứ tự là bắt buộc. Kết quả nằm ở `src/orchestrator.ts:1896` (khai báo) và `:1920` (ghi vào `run.review`). `src/kpi.ts:714` đọc `run.review.reviewerApproved` trước.

Các tệp nhánh sửa mà `main` không chạm đều giữ nguyên: `config.ts`, `lane.ts`, `plan-gate.ts`, `planner.ts`, `prompts.ts`, `quality-gate.ts`, `slim.ts`, `runtimes/claude-cli.ts`, `tools/claude-guard.ts`, `tools/shell-policy.ts` và `bench/vs-claude/`.

## 3. Thay đổi hành vi của `main` và ảnh hưởng tới benchmark

Mục này trả lời câu hỏi: thay đổi nào của `main` có thể làm số đo local lệch so với các mốc đo trước gộp. Mỗi dòng có bằng chứng và đánh giá "có", "không" hoặc "chưa rõ".

Phạm vi `main` thay đổi trong `src/` (từ điểm tách đến đỉnh `main`, đối chiếu bằng `git diff --stat`): `app`, `budgets` (mới), `cli`, `kpi`, `orchestrator`, `routines`, `server`, `types`, và các runtime `api`, `cli-agents`, `external` (mới), `index`. Tổng cộng 19 tệp, 2003 dòng thêm, 88 dòng xóa, gồm cả `docs/KPI.md`, `docs/EXTERNAL-AGENTS.md` và `bench/agent-probes/`.

| Hạng mục | Bằng chứng | Ảnh hưởng |
|---|---|---|
| Pha, model mặc định | `git diff` trên `src/config.ts` rỗng; giá trị vẫn ở `config.ts:299-304` | Không |
| Prompt | `git diff` trên `src/prompts.ts`, `src/planner.ts`, `src/lane.ts` rỗng | Không |
| Hook | `git diff` trên `src/tools/` và `src/runtimes/claude-cli.ts` rỗng | Không |
| KPI v2 | `src/kpi.ts` +547 dòng; `docs/KPI.md` | Không (chỉ số đọc) |
| Ngân sách dự án/agent | `src/budgets.ts`; `src/orchestrator.ts:2232` và `:3378` | Không theo mặc định; xem ghi chú dưới |
| Runtime mới và sửa nhỏ | `src/runtimes/external.ts`, `api.ts`, `cli-agents.ts`, `index.ts` | Không với `claude-cli`; chưa rõ với runtime API |
| Backlog, Kanban, đổi thuộc tính | `src/orchestrator.ts`, `src/routines.ts`, `src/server.ts` | Không |
| `app.ts`, `cli.ts` | `src/app.ts` thêm `BudgetPolicies`; `src/cli.ts` +15 dòng | Không (giả định cho `cli.ts`, chưa đọc chi tiết) |
| Giao diện, bộ probe | `public/*`, `bench/agent-probes/*` | Không |

### 3.1. Pha, model mặc định, prompt và hook

`main` không sửa `config.ts`, `prompts.ts`, `planner.ts`, `lane.ts`, `claude-cli.ts`, `claude-guard.ts` hay `shell-policy.ts`. Do đó pha, model, trần token theo pha, prompt hệ thống và hook `claude-guard` giống hệt trước gộp. Cờ của `claude -p` cũng giống hệt, nên chẩn đoán cache của `claude-cli` không cần đo lại sau gộp. Các mốc đo trước gộp vẫn dùng cùng luồng điều phối.

### 3.2. KPI v2 và `docs/KPI.md`

KPI v2 thêm các hàm `computeKpi`, `verificationClaim`, `checksOutcome`, `checksByDept` và `runtimeLimits`. Các quy tắc đáng chú ý:

- Chỉ số Trung thực chỉ tính khẳng định có lệnh kiểm chứng thành công.
- Hiệu chỉnh reviewer theo `run.review.reviewerApproved`. Đây là trường mới, ghi thêm vào bản ghi `runs` (`src/types.ts:300`).
- Bỏ dòng ma `agent@?` và không đếm trùng bằng chứng.

Các hàm này chỉ đọc dữ liệu đã có. Chúng không đổi luồng chạy, nên không đổi token hay kết quả nhiệm vụ. Chỉ số KPI lấy từ các lần chạy cũ sẽ khác khi tính lại bằng v2, nên không so trực tiếp số KPI trước và sau gộp.

### 3.3. Ngân sách và trần token theo dự án hoặc agent

`src/budgets.ts` thêm chính sách ngân sách cộng dồn nhiều nhiệm vụ trong một kỳ (ngày, tháng, toàn bộ). Mỗi chính sách có ngưỡng mềm (cảnh báo) và trần cứng (tạm dừng). Chính sách lưu ở `data/budgets.json`; mức dùng tính từ sổ cái token.

`Orchestrator.checkPolicies` (`src/orchestrator.ts:2232`, gọi ở `:3378`) chạy trước mỗi lượt gọi model. Khi chạm trần cứng, nhiệm vụ bị tạm dừng với `pause.reason='budget'`. Mặc định không có chính sách, nên không ảnh hưởng. Nếu `data/budgets.json` còn chính sách cũ, chạy benchmark có thể bị dừng giữa chừng. **Hành động cần làm:** trước mỗi lần đo, xác nhận tệp này rỗng hoặc không tồn tại. Ngân sách theo nhiệm vụ (`budgetTokens`, `toolInputBudget`) không đổi; `defaults.budgetTokens` vẫn là 1.500.000 theo bàn giao.

### 3.4. Runtime

`src/runtimes/external.ts` (163 dòng) thêm agent ngoài, chạy qua tiến trình (stdin/stdout JSON) hoặc HTTP. `src/runtimes/index.ts` đăng ký loại `process` và `http` ngoài loại `openai-api` đã có. Runtime này chỉ được tạo khi cấu hình khai báo, nên không ảnh hưởng lần chạy mặc định.

Hai sửa nhỏ khác ghi thêm siêu dữ liệu cho KPI:

- `api.ts` ghi `maxPromptTokens`, là prompt lớn nhất trong các vòng.
- `cli-agents.ts` đặt `toolsTracked: false` cho Codex CLI và Kimi CLI, vì CCoding không ghi được thao tác công cụ của hai runtime này.

Hai trường này chỉ phục vụ đo. Mức ảnh hưởng của sửa đổi trong `api.ts` tới hành vi vòng gọi công cụ là **chưa rõ**: diff cho thấy chỉ thêm bộ đếm, nhưng chưa có lần chạy xác nhận.

### 3.5. Luồng nhiệm vụ, `routines.ts`, `app.ts`, `cli.ts`

`main` thêm backlog (`createTask` với `input.backlog` cho trạng thái `paused/backlog`), `setStage` và `updateProps`. `updateProps` cho đổi tiêu đề, ưu tiên, người phụ trách và dự án khi nhiệm vụ chưa chạy, và không bao giờ hạ nhãn dữ liệu. Các nhiệm vụ do `run.mjs` sinh ra không dùng backlog. `routines.ts` chỉ thêm nhãn tiếng Việt cho lý do `backlog`. `app.ts` chỉ khởi tạo `BudgetPolicies` và truyền vào Orchestrator.

### 3.6. Giao diện và bộ probe

Giao diện v2, Kanban và KPI cạnh agent nằm trong `public/*`. Bộ probe ở `bench/agent-probes/` chạy mã do model sinh trong sandbox và ghi kết quả vào `data/`. Hai phần này không nằm trên đường chạy của `bench/vs-claude/`.

## 4. Nội dung Phòng Nghiên cứu cần mô tả ở §4 bài báo

Phần mô tả hệ thống ở §4 phải phản ánh CCoding sau gộp. Các điểm sau là mới so với bản mô tả trước:

1. KPI v2: các chỉ số, quy tắc Trung thực dựa trên lệnh kiểm chứng và hiệu chỉnh reviewer theo kết luận gốc.
2. Ngân sách theo dự án và theo agent, với ngưỡng mềm, trần cứng và tạm dừng. Nên nói rõ đây là lớp tách khỏi ngân sách từng nhiệm vụ.
3. Agent ngoài kiểu tiến trình hoặc HTTP.
4. Backlog, Kanban và đổi thuộc tính tại chỗ.
5. Bộ probe thử thách trên Ollama với sandbox.
6. Thứ tự ghi `reviewerApproved` trước khi ép không duyệt, vì nó ảnh hưởng cách đọc số liệu reviewer.

Về tính nhất quán của các mốc đo W1–W5 trước gộp: theo bàn giao, chúng dùng cùng luồng điều phối vì `main` không đổi `config.ts`, `prompts.ts` và `lane.ts`. Đây là kết luận từ diff, chưa có lần đo lại sau gộp để xác nhận.

## 5. Mặc định công tắc B-xx sau gộp

Bảng này cho thấy giá trị mặc định ngay sau gộp. Các tệp nguồn không nằm trong diff của merge, nên giá trị trùng hoàn toàn với trước gộp. Không có mặc định nào bị đổi, và không bật (a-brief) hay (b).

| Mã | Công tắc và mặc định | Nguồn |
|---|---|---|
| B-01 | `lanes.single = { enabled: true, maxParts: 5, maxFilesTouched: 6 }`; thứ tự ưu tiên `options.lane` > `ProjectDef.lane` > tự động | `src/config.ts:307` |
| B-01 | `fastLane = { enabled: true, maxBriefChars: 4000, maxRepoFiles: 300, maxRepoBytes: 1_500_000, planModel: 'sonnet', finalReport: 'template', maxParallel: 4 }` | `src/config.ts:306` |
| B-02 | `gate.maxFixRounds = 2` | `src/config.ts:295`; `src/orchestrator.ts:3128` |
| B-04 | Bộ tách lệnh shell có xét nháy, luôn bật | `src/tools/shell-policy.ts:144` |
| B-05 | Không có công tắc cấu hình riêng (giả định: chỉ grep `config.ts`, `types.ts`, chưa đọc nơi triển khai) | không có |
| B-06 | Chẩn đoán chặn, sự kiện `guard.block`, luôn bật | `src/tools/shell-policy.ts:395` |
| B-10 | Cổng phủ kế hoạch `planGate`, không gọi LLM, chạy khi không ở chế độ solo | `src/plan-gate.ts`; `src/orchestrator.ts:1781` |
| B-11 | `lanes.single.slim = { accept: 'full', compactTemplate: false, promptDiet: true }` | `src/slim.ts:19` |
| Hook | Luôn gắn `claude-guard.js` (timeout 15); `closeStdin` bật; `userSettings` tắt; `useApiKey` tắt | `src/runtimes/claude-cli.ts:152-186` |

## 6. Kết quả typecheck và test

Mục này ghi kết quả chạy thật sau gộp, do người thực hiện gộp báo cáo; tài liệu này không chạy lại các lệnh đó.

| Lệnh | Kết quả |
|---|---|
| `npm run typecheck` | Exit 0. Lần đầu lỗi TS1185 do còn dấu xung đột; sạch sau khi giải. |
| `npm test` lần 1 | Exit 1: pass 280, fail 2, skipped 3. |
| `npm run build` | Exit 0. |
| `npm test` lần 2 | Exit 0: pass 282, fail 0, skipped 3. |

Hai test đỏ ở lần 1 là `test/agent-probes.test.ts:26` và `:33`. Thông điệp: `dist/kpi.js` không export `verificationClaim`. Nguyên nhân là `dist/` (không theo dõi bằng git) còn là bản build cũ. Đây không phải lỗi mã. Sau mỗi lần gộp phải chạy `npm run build` trước `npm test`.

**EPERM chập chờn trên Windows:** test dễ gặp là `rmSync` ở `test/fast-lane.test.ts:182`. Nó không xảy ra ở cả hai lần chạy, nên số lần chạy lại vì EPERM là 0. Nếu về sau gặp, ghi rõ tên test và chạy lại một lần.

Trước gộp, baseline có 1 test đỏ (pass 249, fail 1, skipped 4). Sau gộp không còn test đỏ, nên không có lỗi mới.

## 7. Data Protection Gate

Không có dữ liệu mới được đưa vào, nhãn dữ liệu giữ nguyên là Nội bộ, nên không cần đánh giá bảo vệ dữ liệu mới. Phần đánh giá hiện có trong `docs/data-protection-assessment.md` đã được nối đủ hai phía.

## Phụ lục A. Tham chiếu lịch sử git

Phụ lục này chuyển các mã commit khỏi thân tài liệu.

- Nhánh trước gộp: `8837bf5`. Đỉnh `main` được gộp: `9e6079b`. Điểm tách chung: `e0bd2f4`.
- 16 commit của `main` trong khoảng `e0bd2f4..9e6079b`, nhóm theo chủ đề:
  - KPI v2 và probe: `0b46798`, `6f9faba`, `e6f6798`, `10e7bfb`, `13b545a`, `0b72bc2`, `3d7be98`, `a3f79d0`.
  - Giao diện v2: `fcb5447`, `6bc2ce9`.
  - Lộ trình REA (KPI cạnh agent, Kanban, ngân sách, agent ngoài): `2de3480`.
  - Đổi người phụ trách/dự án tại chỗ, backlog, kéo thả Kanban: `2d29ded`.
  - Các commit gộp pull request: `3e55324`, `fd92cbd`, `62b811b`, `9e6079b`.

## Phụ lục B. Câu hỏi còn mở

- B-05 chưa có công tắc cấu hình riêng; cần người nắm B-05 xác nhận cách mô tả ở §4.
- Mức ảnh hưởng của `maxPromptTokens` trong `api.ts` tới vòng gọi công cụ chưa được đo.
- `src/cli.ts` (+15 dòng) chưa được đọc chi tiết trong tài liệu này.
- Git cảnh báo LF sẽ đổi thành CRLF ở hai tệp tài liệu; không ảnh hưởng nội dung.
