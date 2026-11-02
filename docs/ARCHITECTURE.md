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
