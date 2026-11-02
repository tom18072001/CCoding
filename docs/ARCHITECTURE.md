# Kiến trúc CCoding Office

## Thành phần

| Thành phần | File | Vai trò |
|---|---|---|
| CLI | `src/cli.ts` | `serve`, `task`, `status`, `show`, `cancel`, `pause`, `resume`, `split`, `logs`, `usage`, `kpi`, `agents`, `project`, `bench`, `doctor`, `herdr`, `agent-exec` — nhận mã ngắn `CC-12` hoặc id đầy đủ |
| Server | `src/server.ts` | REST + Server-Sent Events, phục vụ giao diện `public/`; chỉ nghe 127.0.0.1, chống CSRF/DNS-rebinding; `/api/tasks/CC-12/…` được đổi sang id thật |
| Orchestrator | `src/orchestrator.ts` | Hàng đợi nhiệm vụ, định tuyến, vòng đời phòng ban, cổng duyệt kế hoạch, CTO nghiệm thu, khóa theo agent, ngân sách token, tạm dừng/tiếp tục, tách việc, hủy, cảnh báo |
| Prompt | `src/prompts.ts` | Ghép hồ sơ vị trí (agent.md) + bối cảnh + yêu cầu từng pha |
| Planner | `src/planner.ts` | Đọc JSON kế hoạch/review/định tuyến/nghiệm thu của LLM, sửa lỗi phổ biến, DAG phụ thuộc, lập lịch |
| Registry | `src/registry.ts` | Nạp `agents/**/*.md`, `departments/*.md`; vai trò `orchestrator`, `cto`, `lead`, `reviewer`, thành viên |
| Runtimes | `src/runtimes/*` | `claude-cli`, `codex-cli`, `kimi-cli`, `anthropic-api`, `openai-api` (Bifrost, Ollama, 9router…), `mock`; chuỗi model dự phòng, hạn mức |
| Công cụ agent | `src/tools/*` | Đọc/ghi/tìm tệp, chạy lệnh trong workspace (`workspace.ts`), chính sách lệnh (`shell-policy.ts`), hook PreToolUse cho Claude Code (`claude-guard.ts`), tra cứu web/OpenAlex (`web.ts`) |
| Git | `src/git.ts`, `src/diff.ts`, `src/ship.ts` | Worktree + nhánh riêng mỗi nhiệm vụ/hạng mục; diff cho giao diện; "Sẵn sàng gộp" (kiểm, đẩy nhánh, fast-forward — không `--force`) |
| Dòng thời gian | `src/timeline.ts` | Gantt của nhiệm vụ từ `calls.jsonl` + nhật ký (không gọi model) |
| Việc định kỳ | `src/routines.ts` | Lịch hằng ngày / theo thứ / mỗi N giờ, `data/routines.json`, bộ lập lịch trong `serve` |
| Kiểm toán, Sản phẩm | `src/audit.ts`, `src/artifacts.ts` | Lọc nhật ký hệ thống thành sự kiện kiểm toán; liệt kê sản phẩm của mọi nhiệm vụ |
| KPI, ước tính | `src/kpi.ts`, `src/estimate.ts`, `src/history.ts` | KPI từng sub-agent; ước tính token theo lịch sử; ghi chú giữa các nhiệm vụ |
| Bản đồ repo | `src/repomap.ts` | `.ccoding/<task>/repo-map.md` (+ chỉ mục bản gọn) cho agent |
| Tệp đính kèm | `src/uploads.ts` | Trích chữ PDF/DOCX/XLSX/PPTX… vào `data/uploads/` |
| Log | `src/logger.ts` | JSONL append-only, chuỗi băm, che PII/bí mật; kiểm chuỗi đọc một lần (CLI) hoặc đọc luồng (API) |
| Token | `src/usage.ts` | Sổ cái `usage/ledger.jsonl` + tổng hợp |
| Store | `src/store.ts` | `runs/<task>/task.json`, transcript, dự án, mã ngắn (`seq.json`), góp ý agent |
| herdr | `src/herdr.ts`, `src/logview.ts` | Dựng workspace, pane theo agent, space log, báo trạng thái/token |
| Benchtest | `src/bench.ts` | Chạy cùng đề bài với từng biến thể tùy chọn để đo trước khi đổi mặc định |

## Vòng đời một nhiệm vụ

```mermaid
sequenceDiagram
  participant T as Tom
  participant O as Orchestrator
  participant R as Điều phối viên
  participant L as Trưởng phòng
  participant M as Thành viên
  participant Q as Reviewer
  participant C as CTO
  T->>O: brief + chế độ (hoặc Việc định kỳ tới lịch)
  alt auto
    O->>R: route (JSON)
    R-->>O: phòng ban / liên phòng
  end
  O->>L: plan (JSON hạng mục, người nhận, phụ thuộc)
  loop vòng họp
    O->>M: discuss (≤120 từ, @mention)
  end
  O->>L: finalize (kế hoạch chốt + quyết định)
  O->>O: lệnh chuẩn bị + lệnh kiểm tra baseline (dự án git)
  opt duyệt kế hoạch bật
    O-->>T: tạm dừng "chờ duyệt kế hoạch"
    T->>O: duyệt / sửa người làm, phụ thuộc, bỏ hạng mục
  end
  par theo DAG, ≤ maxParallel, mỗi agent 1 việc
    O->>M: execute S1..Sn (công cụ trong worktree riêng)
  end
  O->>O: lệnh kiểm tra sau thực thi (báo hồi quy)
  O->>Q: review (JSON approved/issues)
  opt có major/blocker
    O->>M: revise
    O->>Q: review lại
  end
  O->>L: synthesize → FINAL.md
  O->>C: accept (tiêu chí Đạt/Không/Chưa kiểm được + bằng chứng)
  C-->>O: ACCEPTANCE.md; chưa đạt → "cần xem"
  O-->>T: SSE: trạng thái, hội thoại, token, cảnh báo
  opt giám đốc
    T->>O: duyệt / yêu cầu sửa / Sẵn sàng gộp → đẩy nhánh
  end
```

- **Liên phòng**: Phòng Nghiên cứu chạy đủ vòng đời trước; báo cáo của phòng này trở thành "kết quả từ phòng trước" trong prompt của Phòng Phát triển. CTO nghiệm thu một lần sau khi mọi phòng tổng hợp xong.
- **Theo dự án**: dự án quy định phòng mặc định (`auto`/`dev`/`research`/`joint`), workspace (repo git → worktree + nhánh `ccoding/<task>`), nhánh xuất phát, lệnh chuẩn bị/kiểm tra, runtime, phân loại dữ liệu, danh sách agent tham gia, model riêng từng agent, ngân sách token, duyệt kế hoạch.
- **Giao riêng** (`mode: "agent"`): một agent làm luôn — bỏ định tuyến, lập kế hoạch, họp và CTO nghiệm thu; reviewer của phòng vẫn review.
- **Checkpoint**: mỗi pha lưu vào `task.json`; server khởi động lại giữa chừng → nhiệm vụ "tạm dừng — bị gián đoạn", bấm Tiếp tục để chạy từ chỗ đã xong. `resume` nhận `from: "review" | "synthesize" | "accept"` và `rerun: ["S1"] | "all"`.

## Làn đơn, cổng chất lượng và cổng phủ kế hoạch

Ba cơ chế dưới đây giữ chi phí thấp cho việc nhỏ mà vẫn chặn kết quả sai. Làn đơn quyết định có cần cả đội hay không. Cổng phủ kế hoạch kiểm kế hoạch trước khi thực thi. Cổng chất lượng kiểm kết quả sau khi thực thi. Cả ba chạy bằng mã thuần, không gọi LLM để quyết định. Mọi lượt LLM phát sinh (sửa kế hoạch, vòng sửa, sửa định dạng, agent của làn đơn) đều đi qua `Orchestrator.call()`.

Cấu hình liên quan (mặc định trong `src/config.ts`, ghi đè bằng `ccoding.local.json`):

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `lanes.single.enabled` | `true` | Bật chọn làn đơn. Tắt thì việc nhỏ đi làn nhanh |
| `lanes.single.maxParts` | `5` | Từ số hạng mục này trở lên đề bài bị coi là lớn |
| `lanes.single.maxFilesTouched` | `6` | Từ số tệp này trở lên đề bài bị coi là lớn |
| `gate.maxFixRounds` | `2` | Số vòng sửa tối đa của cổng chất lượng. Không liên quan đến `maxRevisions` của review |

### Làn đơn (B-01)

Làn đơn dành cho việc nhỏ: một agent đúng vai làm trọn đề bài trong worktree của nhiệm vụ. Không có định tuyến, lập kế hoạch, họp, worktree con hay tổng hợp bằng LLM.

**Chọn làn.** `pickLane` gọi `laneSignals` rồi `chooseLane` (`src/lane.ts`). Không có lượt LLM nào. Kết quả ghi vào log `lane.pick` (gồm `signals`, `lane`, `why`) và gửi một tin hệ thống `🧭 Chọn làn …`. Các tín hiệu gồm:

| Tín hiệu | Nội dung |
|---|---|
| `briefChars` | Độ dài đề bài |
| `parts` | Số phần việc nêu trong đề bài (mục đánh số, "N module", danh sách tên) |
| `filesTouched` | Số tệp, thư mục đề bài nhắc tới (đường dẫn có trong `git ls-files`, tệp sẽ tạo) |
| `repoFiles`, `repoBytes` | Số tệp và dung lượng repo theo `git ls-files` |
| `forced` | Làn bị ép qua `options.lane` |
| `sequential` | Đề bài mô tả việc nối tiếp, đầu ra tầng trước làm đầu vào tầng sau |

Quy tắc áp theo thứ tự:

1. `forced` có giá trị thì theo giá trị đó.
2. `briefChars` vượt `fastLane.maxBriefChars`, hoặc repo vượt ngưỡng của `fastLane`, thì làn đầy (`full`).
3. `parts` ≥ `lanes.single.maxParts` hoặc `filesTouched` ≥ `lanes.single.maxFilesTouched` thì việc lớn, đi làn nhanh (`fast`). Ngoại lệ: nếu có `sequential` thì vẫn chọn `single`.
4. Còn lại chọn `single`.

Nếu `lanes.single.enabled` là `false` thì việc nhỏ đi `fast`. Các điều kiện cũ của `pickLane` (tắt `fastLane`, `mode` agent hoặc joint, không có workspace, `git ls-files` lỗi) vẫn cho `full`.

**Ép làn.** `options.lane` nhận `single`, `fast`, `full` hoặc `auto`. Hiện chưa có trường ép làn ở cấp dự án (`ProjectDef` không có trường `lane`). Dự án ở chế độ `auto` vẫn tốn một lượt định tuyến (`route`) bằng LLM, trừ khi ép `single`; khi ép `single`, `route()` định tuyến bằng từ khóa.

**Luồng.** `runSingleLane` chạy tuần tự:

1. Chạy baseline `checkCommands` (dự án git).
2. Chọn một agent đúng vai, xếp theo `skillScore`. Nếu dự án có `checkCommands` thì ưu tiên vai có công cụ `run_command`.
3. Chạy pha execute bằng một lần `runSubtask` trong worktree nhiệm vụ.
4. Chạy `runQualityGate` (xem mục B-02).
5. Dựng `FINAL.md` từ mẫu `templateReport`, không gọi LLM.

Run của làn đơn có đúng một hạng mục, nên KPI, lịch sử và nghiệm thu hoạt động như các làn khác. Reviewer chỉ được gọi tối đa một lượt, khi cổng yêu cầu (mục B-02). Nếu reviewer chê thì nhiệm vụ gắn `attention: review`, không có vòng sửa theo review.

**Nâng lên multi-agent.** Làn đơn nâng cấp khi xảy ra một trong ba điều kiện:

- Cổng chất lượng vẫn đỏ sau `gate.maxFixRounds` vòng sửa (nhánh `regression-or-new` hoặc `red-required`).
- Diff thực tế (bỏ `.ccoding/`) vượt `lanes.single.maxFilesTouched`, hoặc vượt gấp đôi số tệp ước lượng từ đề bài.
- Đầu ra của agent có dòng `ESCALATE: <lý do>`. Dòng này được kiểm cả trước và sau cổng.

Khi nâng cấp, CCoding giữ worktree và `projectChecks`, đặt lại `run.subtasks`, `run.stage` và `run.review`, rồi ghi `LANE-HANDOVER.md` (diff, kết quả baseline và mới nhất, ghi chú của agent). Tệp này nối vào `prior` của pha plan, nên kế hoạch mới phải qua cổng phủ kế hoạch. Đích là `fast` nếu `fastLane` bật và đề đủ ngắn, ngược lại là `full`. Sự kiện ghi vào log `lane.escalate` (`from`, `to`, `trigger`, `reason`) cùng một tin hệ thống.

**Nghiệm thu CTO.** Làn đơn không có đường riêng: `runTask` gọi `accept()` sau khi các phòng xong, không phân biệt làn. Run của làn đơn có `finalPath`, `review` và một hạng mục, nên CTO nhận đầu vào như thường và hành vi nghiệm thu không đổi. Đề xuất chưa áp dụng: cho `accept` bỏ qua hoặc dùng prompt gọn khi cổng chất lượng đã xanh và không chạm vùng nhạy cảm, vì nghiệm thu là một lượt LLM thêm. Cần đo bằng B7 thật trước khi quyết.

**Hạn chế đã biết.** Tiếp tục sau khi tạm dừng giữa lúc nâng cấp chưa tự nạp lại bản bàn giao; nội dung còn trong `LANE-HANDOVER.md`. Ngưỡng `lanes.single` chưa hiệu chỉnh bằng số đo thật.

### Cổng chất lượng (B-02)

Cổng chất lượng chặn việc duyệt khi lệnh kiểm tra còn đỏ và kiểm báo cáo của agent có đúng mẫu hay không. Nó chạy trong vòng review của multi-agent và được làn đơn gọi trực tiếp qua `Orchestrator.runQualityGate`. Logic phân loại nằm ở `src/quality-gate.ts`.

**Bốn nhánh.** `classifyChecks` so kết quả baseline với kết quả mới nhất của từng lệnh trong `checkCommands`:

| Nhánh (`CheckClass`) | Điều kiện | Xử lý |
|---|---|---|
| `green` | Lệnh xanh | Không cần làm gì thêm |
| `regression-or-new` | Đỏ, baseline xanh (hồi quy) hoặc không có baseline (đỏ mới) | Vào vòng sửa; còn đỏ sau vòng sửa thì ép không duyệt |
| `red-required` | Đỏ ở cả baseline, và `task.brief` nhắc tên lệnh (so khớp chuỗi) | Bắt buộc vào vòng sửa, không gọi reviewer, ép `approved = false` chừng nào còn đỏ |
| `red-unrelated` | Đỏ ở cả baseline, đề bài không nhắc tên lệnh (hoặc lệnh bị chính sách chặn) | Không bắt sửa; buộc gọi reviewer |

**Vòng sửa.** Tham số `gate.maxFixRounds` (mặc định 2) giới hạn số vòng, tách riêng khỏi `maxRevisions`. Prompt (`gateFixPrompt`) nhận đúng đầu ra của lệnh đỏ. Nếu có `run.planGate.uncovered` thì kèm danh sách đích chưa có hạng mục nhận. Mỗi vòng ghi log `gate.fix`. Phân loại ghi log `gate.classify`. Ngân sách N tính theo từng lần gọi cổng, không phải cả nhiệm vụ.

**Kiểm mẫu đầu ra.** `templateGate` dùng `templateHeadings`, `templateCoverage` và `headingKey` của `src/kpi.ts`, cộng kiểm tiêu đề "Tóm tắt". Cổng đạt khi coverage bằng 1. Tiêu đề không có dòng nội dung nào bên dưới bị coi là thiếu. Nếu không đạt, cổng chạy một lượt "sửa định dạng" ngắn, không dùng công cụ (`formatFixPrompt`, cờ `CallCtx.noTools`), tính vào N. Bản sửa chỉ thay bản cũ khi đạt mẫu. Kết quả ghi log `gate.template`.

**Khi nào gọi reviewer.** `needsReviewer` cho kết quả đúng khi có ít nhất một lý do trong `reviewerReasons`:

- dự án không có `checkCommands`;
- diff chạm vùng bảo mật hoặc dữ liệu (`sensitivePaths`: `src/tools/`, `src/runtimes/`, `src/kpi.ts`, `src/store.ts`, `.env*`, `data/`, `agents/`, tệp cấu hình);
- nhãn dữ liệu `confidential` hoặc `restricted`;
- có lệnh `red-unrelated`;
- chưa đạt sau các vòng sửa.

Nếu không có lý do nào thì bỏ qua reviewer và duyệt kèm lý do của cổng. Quyết định ghi log `gate.review` với `decision` là `forced-unapproved`, `skip-reviewer` hoặc `call-reviewer`. Khi dự án có `checkCommands`, bàn giao gửi cho reviewer được rút gọn (mỗi bàn giao tối đa 1.500 ký tự, diff tối đa 8.000 ký tự).

**D-02.** Nếu nhiệm vụ được duyệt mà không có kiểm chứng máy (dự án không có lệnh kiểm tra), reviewer có quyền chạy lệnh nhưng không chạy (`run.review.verified === false`), thì nhiệm vụ gắn `attention: review` để giám đốc xem.

### Cổng phủ kế hoạch (B-10)

Cổng phủ kế hoạch chạy sau khi có kế hoạch và trước khi thực thi. Nó chặn kế hoạch bỏ sót đích hoặc dở dang, vì lỗi này không thể sửa ở các pha sau. Logic ở `src/plan-gate.ts` (hàm `planGate`, `checkPlanCoverage`, `checkPlanReadable`, `planTargets`), nối vào orchestrator qua `gatePlan`, đặt trước bước duyệt kế hoạch. Cổng áp cho cả làn nhanh và làn đầy; việc giao riêng cho một agent thì bỏ qua. Làn đơn không đi qua cổng này vì không có bước chia việc; kế hoạch sau khi nâng cấp thì có.

| Quy tắc | Nội dung |
|---|---|
| A | Mỗi đích (tệp nguồn có đuôi tệp trong đề bài) phải có hạng mục nhận. Tệp tham khảo (`SPEC.md`, `package.json`), tệp "đã có sẵn", "không ai sửa", "chỉ dùng API" không tính |
| B (i) | Số hạng mục tự khai trong tóm tắt phải khớp số hạng mục phân tích được |
| B (ii) | `deliverable` không được là chỗ giữ như "(không dùng)" hay "—" |
| B (iii) | Vai nêu trong mô tả phải khớp `assignee` |
| B (iv) | JSON kế hoạch không bị cắt cụt hoặc bỏ dở (cờ `truncated` của `parsePlan`) |

Với quy tắc B (ii), `deliverable` rỗng hoặc thiếu chỉ bị coi là dở khi có hạng mục khác trong cùng kế hoạch có `deliverable` thật. Một đích có thể được miễn nếu trưởng phòng khai `outOfScope` kèm lý do.

Khi kế hoạch trượt A hoặc B, cổng chạy đúng một lượt sửa kế hoạch (`replanPrompt`, đi qua `Orchestrator.call()`). Nếu vẫn trượt, nhiệm vụ dừng ở trạng thái `failed` và không hạng mục nào được chạy. Trường `attention.reason` là:

- `plan-coverage` khi quy tắc A trượt (kể cả khi B cũng trượt);
- `plan-unreadable` khi chỉ quy tắc B trượt.

Log `plan.gate` ghi ở ba giai đoạn `blocked`, `replanned`, `stopped`. Kết quả lưu ở `run.planGate` (`uncovered`, `reasons`, `rules`, `replanned`); kế hoạch đạt lưu `rules: []`.

**Phát lại offline.** Công cụ `scripts/replay-plan-gate.mjs` chạy cổng trên kế hoạch đã ghi của bộ đo mà không gọi LLM. Nó đọc `bench/vs-claude/results/C*/*/ccoding-task.json` và danh sách vai từ `agents/**`, rồi in kết quả ra stdout, không ghi tệp nào.

```bash
npm run build && node scripts/replay-plan-gate.mjs
# chưa build: node --experimental-strip-types scripts/replay-plan-gate.mjs
```

Trên 54 lượt đã ghi, công cụ chặn 2 lượt: `C9/t5-logq.ccoding-fastlane.2` (quy tắc A và B) và `C7/t2-orders.ccoding-fastlane.1` (quy tắc B). Lượt `C9/t1` thứ 3 không bị chặn.

## Trạng thái agent

`idle` (rảnh) · `thinking` (lập kế hoạch/chốt/tổng hợp/định tuyến/nghiệm thu) · `discussing` (đang họp) · `working` (thực thi/sửa) · `reviewing` · `error`. Văn phòng hiện bằng vòng màu quanh chân dung agent.

Mỗi agent chỉ chạy **một lượt tại một thời điểm** (khóa theo agent) — hai nhiệm vụ cùng cần một người thì người đó làm lần lượt.

## Sự kiện thời gian thực (SSE `/api/events`)

| event | dữ liệu |
|---|---|
| `agent` | trạng thái agent (status, activity, task, runtime) |
| `task` | ảnh chụp nhiệm vụ |
| `message` | tin nhắn hội thoại (plan, discussion, decision, handoff, review, final, acceptance, system) |
| `usage` | một bản ghi sổ cái token |
| `log` | một dòng log |
| `output` | đoạn văn bản agent đang stream |
| `alert` | cảnh báo (lỗi, tạm dừng, ngân sách, cần xem, hết tài nguyên…) |
| `runtime` | trạng thái runtime thay đổi (tạm ngừng do hạn mức, mở lại) |

## REST API

Mọi `:id` của nhiệm vụ nhận id đầy đủ (`T-…`) hoặc mã ngắn (`CC-12`).

| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/health` · `/api/state` | còn sống (pid, runner) · toàn cảnh: phòng ban, agent, nhiệm vụ, dự án, token, `taskPrefix` |
| GET/POST | `/api/tasks` | danh sách · giao việc `{ brief, title?, mode, department?, projectId?, agentId?, followUp?, continueBranch?, attachments?, options? }` |
| GET | `/api/tasks/:id` | nhiệm vụ + transcript + danh sách file + token theo agent |
| GET | `/api/tasks/:id/file?path=FINAL.md` | nội dung file trong thư mục chạy (chặn path traversal) |
| POST | `/api/tasks/:id/notes` | chỉ dẫn bổ sung khi việc đang chạy |
| POST | `/api/tasks/:id/cancel` · `/pause` | hủy · tạm dừng |
| POST | `/api/tasks/:id/resume` | tiếp tục `{ addBudget?, budgetTokens?, budgetMode?, from?, rerun? }` |
| POST | `/api/tasks/:id/budget` | đổi ngân sách khi đang chạy |
| POST | `/api/tasks/:id/plan` | duyệt / sửa kế hoạch `{ department?, subtasks: [{ id, assignee?, dependsOn?, title?, description?, remove? }], approve?, note? }` |
| POST | `/api/tasks/:id/review` | giám đốc duyệt / yêu cầu sửa `{ decision: "approve" \| "reject", note?, subtasks?, issues? }` |
| POST | `/api/tasks/:id/split` · `/package` | tách hạng mục thành nhiệm vụ riêng · đóng gói vào dự án |
| GET/POST | `/api/tasks/:id/ship` | Sẵn sàng gộp: kiểm (`{ action: "check" }`), đẩy nhánh (`push`), fast-forward (`ff`) |
| GET | `/api/tasks/:id/diff[?commit=&file=&owners=1]` | thay đổi trên worktree / nhánh / từng commit |
| GET | `/api/tasks/:id/timeline` · `/calls` · `/events?kind=&subtask=` | dòng thời gian · bản ghi lượt gọi · nhật ký nhiệm vụ |
| POST/DELETE | `/api/uploads` · `/api/uploads/:id` | tải tệp đính kèm (trích chữ) · xóa |
| GET | `/api/alerts` | 100 cảnh báo gần nhất |
| GET | `/api/agents` · `/api/agents/:id` | nhân sự · agent.md, trạng thái, token, log vị trí |
| GET/POST/DELETE | `/api/agents/:id/feedback[/:fid]` | góp ý của giám đốc cho agent |
| GET/POST/DELETE | `/api/prompts[/:id]`, POST `/api/prompts/:id/use` | thư viện prompt |
| GET | `/api/kpi` · POST `/api/kpi/resolve` | KPI sub-agent · đánh dấu "đã sửa" |
| GET | `/api/usage?by=agent\|department\|task\|project\|model\|runtime\|day\|phase` | bảng token (lọc `agent`, `department`, `task`, `project`, `since`) |
| GET | `/api/quota` | hạn mức theo runtime/model (không trả giá trị khóa) |
| GET | `/api/logs?agent=&department=&task=&level=&limit=` | log |
| GET/POST/DELETE | `/api/projects[/:id]` | dự án (xóa có ghi nhật ký kiểm toán) |
| GET | `/api/runtimes?refresh=1` | runtime khả dụng & được phép theo nhãn dữ liệu |
| GET | `/api/audit?cat=&q=&task=&beforeSeq=&limit=` · `/api/audit/verify` | sự kiện kiểm toán (phân trang theo `seq`) · kiểm chuỗi băm nhật ký hệ thống |
| GET | `/api/artifacts?kind=&project=&agent=&q=` | sản phẩm của mọi nhiệm vụ |
| GET | `/api/skills` | kỹ năng, công cụ, quyền, runtime, dự án git, herdr |
| GET/POST | `/api/routines` | việc định kỳ: danh sách · tạo |
| POST/DELETE | `/api/routines/:id` · POST `/api/routines/:id/run` | sửa (`{ enabled: false }` luôn tắt được) / xóa · chạy ngay |
| POST | `/api/reload` | nạp lại agent.md/phòng ban |

Nếu đặt biến môi trường `CCODING_TOKEN`, mọi `/api/*` cần `Authorization: Bearer <token>` (hoặc `?token=` cho SSE); mở UI bằng `http://127.0.0.1:7420/#token=<token>`.

## Dữ liệu trên đĩa

Xem README › *Log & bộ đếm token*. Tất cả nằm trong `data/` (đã `.gitignore`), agent làm việc trong `workspaces/<dự án | task>` hoặc thư mục dự án chỉ định (repo git → worktree riêng).
