# CCoding Office 🏢

**Văn phòng AI đa tác tử** chạy trên máy của bạn: một *Điều phối viên* nhận việc, giao cho **trưởng phòng**, các **sub-agent** tự họp thảo luận, chia việc, làm song song, review lẫn nhau rồi nộp báo cáo. Mọi lượt làm việc được **ghi log theo từng vị trí** và **đếm token in/out** theo agent, phòng ban, nhiệm vụ, dự án. Chạy nền bằng **[herdr](https://herdr.dev)** — tắt terminal, các agent vẫn làm việc.

![CCoding Office](docs/screenshot.png)

## Tính năng

- **2 phòng ban, 20 nhân sự** (mỗi người một `agent.md` riêng, viết dựa trên skill của Tom + kinh nghiệm cộng đồng):
  - 🔵 **Phòng Phát triển Dự án** (công việc): Trưởng phòng, Kiến trúc sư giải pháp, Senior Software Engineer, Backend, Frontend, Data Engineer (ELK), DevOps/SRE, ATTT & Bảo vệ dữ liệu, Business Analyst, Pre-sales & HSDT, Technical Writer, QA.
  - 🟣 **Phòng Nghiên cứu** (học thuật): Trưởng phòng (PI), Literature Researcher, Data Scientist, Methodologist, Academic Writer, Peer Reviewer.
  - 🔴 **Điều phối viên** định tuyến nhiệm vụ; **CTO** nghiệm thu kết quả theo tiêu chí (Đạt/Không kèm bằng chứng) trước khi giao cho giám đốc.
- **5 chế độ xử lý**: *Tự động* (điều phối viên chọn phòng) · *Theo phòng ban* · *Theo dự án* (workspace, runtime, phân loại dữ liệu, ngân sách riêng) · *Liên phòng* (Nghiên cứu → Phát triển) · *Giao riêng* một agent.
- **Quy trình như một phòng ban thật**: lập kế hoạch → họp thảo luận (phát biểu, @nhắc nhau; tự bỏ họp khi việc nhỏ) → chốt → *(tùy chọn)* **giám đốc duyệt kế hoạch** → thực thi song song theo phụ thuộc → review & sửa → báo cáo tổng hợp → **CTO nghiệm thu**. Mỗi mốc là một **checkpoint**: tạm dừng / tiếp tục / làm lại từ review / nghiệm thu lại / chạy lại hạng mục mà không mất tiến độ.
- **Mã nhiệm vụ ngắn `CC-12`** (tiền tố `taskPrefix`) ở giao diện, URL, CLI, API; nhắc mã trong tin nhắn thành liên kết. Danh sách nhiệm vụ **dạng cây**: nhiệm vụ → hạng mục → việc nối/việc tách, nhãn đang chạy cộng dồn.
- **Agent làm việc thật trên repo**: đọc/ghi file, chạy test, typecheck, migration DB dev trong **git worktree + nhánh riêng** cho từng nhiệm vụ (không đụng nhánh chính, không push) — xem [docs/TOOLS.md](docs/TOOLS.md).
- **Đính kèm tệp** (PDF, DOCX, XLSX, PPTX, MD, CSV, JSON, code…): trích chữ tại chỗ, đưa vào bối cảnh nhiệm vụ.
- **Ngân sách token 2 chế độ**: *chạy tới khi hoàn thành* (chỉ cảnh báo 80%/100%) hoặc *tạm dừng khi chạm trần* — kèm nút tăng ngân sách, chạy tiếp, đóng gói vào dự án.
- **Hết token ⇒ tự chuyển tài nguyên** theo chuỗi model dự phòng (vd. Claude Max → Codex), hạn mức theo ngày, cảnh báo trên giao diện/herdr; hết sạch thì tạm dừng và tự chạy lại khi mở hạn mức.
- **Log theo vị trí** (`data/logs/agents/<id>.jsonl`), theo phòng ban, theo nhiệm vụ; **bản ghi đầy đủ từng lượt gọi** (`data/runs/<task>/calls.jsonl`: phản hồi thô, công cụ, các lần chuyển runtime, finish_reason, kích thước prompt); có **chuỗi băm** để phát hiện chỉnh sửa (`ccoding logs verify`). Báo cáo phân tích token: [docs/PROCESS-REVIEW.md](docs/PROCESS-REVIEW.md). Đổi cách tối ưu token thì đo trước bằng **benchtest** (`ccoding bench`: cùng đề bài, từng biến thể, xen kẽ, chỉ khi máy rảnh) — [docs/BENCH.md](docs/BENCH.md).
- **Bộ đếm token** cho từng lượt gọi: input, output, cache đọc/ghi, chi phí — tổng hợp theo agent / phòng / task / dự án / model / ngày (UI, CLI `ccoding usage --watch`, và hiển thị trên sidebar herdr).
- **Nhiều runtime**: Claude Code CLI, Codex CLI, Kimi Code CLI, Anthropic API, API tương thích OpenAI (9router, Ollama, OpenRouter…), và `mock` để chạy thử offline.
- **Data Protection Gate tích hợp**: nhãn dữ liệu theo dự án quyết định runtime nào được nhận dữ liệu; tự che khóa bí mật/PII trước khi ghi log hay gửi ra ngoài.
- **Xem và gộp thay đổi**: tab 🧬 **Thay đổi** (diff theo worktree hoặc từng commit, bình luận theo dòng → gửi thành yêu cầu sửa), 🧪 **lệnh kiểm tra trước/sau** (báo hồi quy), 🚀 **Sẵn sàng gộp** (kiểm review, lệnh kiểm tra, dòng giống khóa bí mật, fast-forward; đẩy nhánh / đẩy vào nhánh xuất phát / mở PR — không bao giờ `--force`).
- **Theo dõi khi chạy**: luồng hoạt động trực tiếp từng hạng mục, ⏱ **dòng thời gian** (mỗi lượt gọi một thanh, đường găng, song song tối đa), 📥 **Cần bạn** (duyệt bằng phím, có hoàn tác), bảng lệnh **Ctrl+K**, URL riêng cho từng màn, thông báo trình duyệt.
- **Giao diện quản lý**: cột trái theo nhóm *Làm việc* (Nhiệm vụ, Dự án dạng cây, 🔁 Việc định kỳ, 📦 Sản phẩm, 💬 Prompt, Gắn sao, Thư viện prompt) và *Tổ chức* (Nhân sự, 🧩 Kỹ năng & Kết nối, 🛡 Kiểm toán, Token, Hạn mức, KPI, Nhật ký); **màn 💬 Prompt kiểu ứng dụng chat** (hội thoại theo dự án, chỉ dẫn bổ sung khi việc đang chạy, giao tiếp nối khi đã xong); **thư viện & khung soạn prompt**, kiểm tra yêu cầu khi gõ; **văn phòng** ở ô phụ bên phải chia theo phòng ban (mỗi agent một bàn, vòng màu trạng thái, bong bóng việc đang làm; bấm agent → giao việc riêng, góp ý, mở việc đang làm, tăng ngân sách) + **CLI** đầy đủ — xem [docs/UI.md](docs/UI.md).
- **🔁 Việc định kỳ**: giao lại một nhiệm vụ mẫu hằng ngày / theo thứ / mỗi N giờ (không chạy chồng, chạy bù khi lỡ lịch ≤ 6 giờ, giữ dự án và nhãn dữ liệu). **📦 Sản phẩm**: mọi báo cáo, sản phẩm hạng mục, kết luận nghiệm thu, thay đổi mã. **🛡 Kiểm toán**: ai làm gì lúc nào (giao/hủy/duyệt, đẩy nhánh, cấu hình, lệnh bị chặn…) từ nhật ký có chuỗi băm, kiểm toàn vẹn bằng một nút.

## Kiến trúc

```mermaid
flowchart LR
  U[Tom<br/>UI web · CLI] --> S[Server 127.0.0.1:7420<br/>REST + SSE]
  S --> O[Orchestrator]
  SC[Việc định kỳ<br/>bộ lập lịch] --> O
  O -->|định tuyến| R[Điều phối viên]
  O --> D1[Phòng Phát triển]
  O --> D2[Phòng Nghiên cứu]
  D1 & D2 -->|plan → họp → chốt → làm → review → báo cáo| RT{Runtime}
  O -->|nghiệm thu| CT[CTO]
  CT --> RT
  RT --> C[claude / codex / kimi CLI]
  RT --> A[Anthropic / OpenAI-compatible API]
  RT --> M[mock · Ollama cục bộ]
  O --> L[(data/logs · runs · usage ledger)]
  O -. runner herdr .-> H[herdr: mỗi agent một pane]
```

Chi tiết: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Cài đặt nhanh

Yêu cầu: **Node.js ≥ 22**, Git. (Windows: PowerShell 5+.)

```powershell
git clone https://github.com/tom18072001/CCoding.git
cd CCoding
npm install          # cài phụ thuộc + build (dist/)
node dist/cli.js doctor
node dist/cli.js serve   # mở http://127.0.0.1:7420
```

Thử ngay không tốn token:

```powershell
node dist/cli.js task "Thiết kế pipeline Logstash thu log IIS, chuẩn hóa ECS, cảnh báo 5xx" --runtime mock --wait
```

> Muốn gõ `ccoding …` thay cho `node dist/cli.js …`: chạy `npm link` một lần.

## Chạy nền bằng herdr

```powershell
# cài herdr (Windows)
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
# dựng văn phòng trong herdr và khởi động server nền
node dist/cli.js herdr up
# vào xem (thấy pane server, log, token, mỗi phòng một tab, mỗi agent một pane)
herdr --session ccoding
# rời đi nhưng mọi thứ vẫn chạy: ctrl+b q
```

Khi server chạy **bên trong herdr**, runner tự chuyển sang `herdr`: mỗi lượt làm việc của agent chạy thật trong pane riêng của agent đó, herdr hiển thị trạng thái `working/idle` và số token trên sidebar. Xem [docs/HERDR.md](docs/HERDR.md). Có sẵn script [`scripts/start-windows.ps1`](scripts/start-windows.ps1).

## Giao việc

**Giao diện web** → *＋ Mới* hoặc *💬 Prompt*: chọn chế độ, phòng ban, dự án hoặc một agent, nhập yêu cầu; theo dõi và trả lời ngay trong hội thoại. Quản lý trong *Tổng quan*, *📥 Cần bạn*, *Dự án*, *Nhiệm vụ* (trang nhiệm vụ: kế hoạch, lệnh kiểm tra, 🧬 thay đổi, ⏱ dòng thời gian, sản phẩm, báo cáo, CTO nghiệm thu, token, nhật ký, lượt gọi), *Việc định kỳ*, *Sản phẩm*, *Nhân sự* (hồ sơ agent.md, log vị trí, góp ý), *Kỹ năng & Kết nối*, *Kiểm toán*, *Token*, *Hạn mức*, *KPI*, *Nhật ký*. Bấm một agent trong văn phòng để giao việc riêng hoặc xem hồ sơ. Xem [docs/UI.md](docs/UI.md).

**CLI**:

```bash
ccoding task "Tổng quan tài liệu về data lineage cho đề cương luận văn" --dept research
ccoding task "Rà soát kiến trúc theo 10 nhóm phản biện" --project traceguard --rounds 2
ccoding task "Nghiên cứu phát hiện bất thường log rồi dựng prototype" --mode joint --wait
ccoding status            # nhiệm vụ (mã CC-n) & trạng thái agent
ccoding show CC-12        # chi tiết, hạng mục, review, CTO nghiệm thu, báo cáo
ccoding cancel CC-12
ccoding pause CC-12                           # tạm dừng, giữ tiến độ
ccoding resume CC-12 --budget-mode complete   # chạy tiếp tới khi xong (hoặc --add 500000)
ccoding resume CC-12 --from accept            # chỉ chạy lại bước CTO nghiệm thu
ccoding split CC-12 [--only S1,S2]            # tách hạng mục chưa xong thành nhiệm vụ riêng (mỗi nhiệm vụ một gói việc)
```

Mọi lệnh nhận mã ngắn `CC-12` hoặc id đầy đủ `T-…`.

Tùy chọn: `--rounds 0-3` (số vòng họp), `--parallel 1-8`, `--no-review`, `--runtime <id>`, `--budget <token>`, `--budget-mode complete|pause`.

**Dự án**: `ccoding project add elk-iis --name "Giám sát log IIS" --dept dev --class internal --path D:\work\elk-iis` — agent sẽ làm việc (đọc/ghi file, chạy lệnh theo quyền dự án) trong thư mục đó; nếu là repo git thì trên worktree + nhánh `ccoding/<task>` riêng. Nhiệm vụ đã chạy mà chưa gắn dự án: mở nhiệm vụ → *Đóng gói vào dự án*.

## Runtime

| Runtime | Dùng khi | Token | Dữ liệu |
|---|---|---|---|
| `claude-cli` | Có Claude Code (`claude`) | chính xác (+ chi phí) | gửi ra ngoài |
| `codex-cli` | Có Codex CLI | chính xác | gửi ra ngoài |
| `kimi-cli` | Có Kimi Code CLI (`kimi`) | ước lượng nếu CLI không báo | gửi ra ngoài |
| `anthropic-api` | Có `ANTHROPIC_API_KEY` | chính xác | gửi ra ngoài |
| `bifrost` | Gateway [Bifrost](https://github.com/maximhq/bifrost) tại `http://localhost:8080/v1` — gắn tag agent/phòng/task, key ảo + ngân sách riêng từng phòng | chính xác | tùy provider phía sau |
| `ollama` | Ollama `http://localhost:11434/v1` | chính xác | **cục bộ** — dùng được cho dự án Bảo mật/Hạn chế |
| `openai-api` | API tương thích OpenAI bất kỳ (9router, LiteLLM, OpenRouter…) | chính xác nếu server trả `usage` | cục bộ nếu đặt `"local": true` |
| `mock` | Demo, kiểm thử, dữ liệu "Hạn chế" khi chưa có model cục bộ | ước lượng | cục bộ |

Mặc định `runtime: auto` chọn runtime đầu tiên **sẵn sàng và được phép** theo thứ tự `claude-cli → bifrost → anthropic-api → openai-api → codex-cli → kimi-cli → ollama → mock`. Có thể thêm runtime tương thích OpenAI bất kỳ bằng `"type": "openai-api"`; `herdr up` có thể tự chạy kèm Bifrost (`herdr.services`). Ghi đè trong `ccoding.local.json` (không commit) — xem [ccoding.local.example.json](ccoding.local.example.json) và [docs/RUNTIMES.md](docs/RUNTIMES.md).

## Log & bộ đếm token

```
data/
├─ logs/system.jsonl              # toàn hệ thống (nguồn của trang 🛡 Kiểm toán)
├─ logs/agents/<agentId>.jsonl    # log riêng từng vị trí
├─ logs/departments/<dept>.jsonl  # log từng phòng ban
├─ usage/ledger.jsonl             # sổ cái token: mỗi lượt gọi LLM một dòng
├─ projects.json  prompts.json  routines.json  seq.json   # dự án, thư viện prompt, việc định kỳ, bộ đếm mã CC-n
├─ feedback/<agentId>.json  kpi-resolved.json  uploads/  bench/
└─ runs/<taskId>/
   ├─ task.json  transcript.jsonl  events.jsonl  calls.jsonl
   ├─ inputs/  prompts/  outputs/   <dept>-FINAL.md   FINAL.md   ACCEPTANCE.md
```

```bash
ccoding usage                       # tổng + theo phòng + theo agent + theo task
ccoding usage --by model --dept dev
ccoding usage --task <taskId> --json
ccoding usage --watch               # bảng token tự làm mới
ccoding kpi --days 7                # KPI v2 từng sub-agent (chất lượng, kết quả thật, trung thực, hiệu quả, tin cậy, tuân thủ) + việc cần sửa — docs/KPI.md
ccoding kpi --by model              # tách theo agent × model (vd. cùng vị trí chạy Claude và Ollama)
node bench/agent-probes/probe.mjs --models qwen3:8b   # probe thử thách từng agent.md trên Ollama
ccoding logs -f --agent data-engineer
ccoding logs verify                 # kiểm tra toàn vẹn chuỗi băm
```

## Nhân sự

| Phòng | ID | Vị trí (nhãn trên sơ đồ) | Model |
|---|---|---|---|
| Điều phối | `orchestrator` | Điều phối viên (Điều phối) | sonnet |
| | `cto` | CTO — điều phối kỹ thuật và nghiệm thu (CTO) | sonnet |
| Phát triển | `dev-lead` ★ | Trưởng phòng Phát triển (TP Phát triển) | opus |
| | `solution-architect` | Kiến trúc sư giải pháp (Kiến trúc sư) | opus |
| | `senior-swe` | Senior Software Engineer — phần khó, rà mã, sửa lỗi gốc (Senior SE) | sonnet |
| | `backend-dev` | Backend Developer — Node.js/TypeScript (Backend) | sonnet |
| | `frontend-dev` | Frontend Developer — Vanilla JS/3D dashboard (Frontend) | sonnet |
| | `data-engineer` | Data Engineer — ELK & pipelines (Data Eng) | sonnet |
| | `devops` | DevOps / SRE — Windows & Linux (DevOps) | sonnet |
| | `security` | Chuyên viên ATTT & Bảo vệ dữ liệu (ATTT) | sonnet |
| | `business-analyst` | Business Analyst — yêu cầu, bảng gap, tiêu chí nghiệm thu (BA) | sonnet |
| | `ba-presales` | Pre-sales & HSDT (Pre-sales) | sonnet |
| | `tech-writer` | Technical Writer — tài liệu kỹ thuật, README (Tech Writer) | sonnet |
| | `qa-tester` | QA Engineer & Reviewer (QA) | sonnet |
| Nghiên cứu | `research-lead` ★ | Trưởng phòng Nghiên cứu — PI (TP Nghiên cứu) | opus |
| | `literature-researcher` | Literature Researcher (Literature) | sonnet |
| | `data-scientist` | Data Scientist / ML Researcher (Data Sci) | sonnet |
| | `methodologist` | Research Methodologist (Phương pháp) | sonnet |
| | `academic-writer` | Academic Writer & Editor VI/EN (Writer) | sonnet |
| | `peer-reviewer` | Peer Reviewer — Devil's Advocate (Phản biện) | opus |

Thêm/sửa nhân sự: chỉ cần thêm file `agents/<phòng>/<id>.md` (frontmatter + nội dung) — xem [docs/AGENTS-GUIDE.md](docs/AGENTS-GUIDE.md). Thêm phòng ban mới: thêm `departments/<id>.md`.

## Data Protection Gate (bắt buộc)

Dự án tuân theo "Khung bảo vệ dữ liệu trong Quản trị dữ liệu".
- Trước khi chốt thiết kế, kịch bản hoặc thay đổi lớn về dữ liệu, AI/agent PHẢI chạy đánh giá bảo vệ dữ liệu
  (5 lớp, 25 năng lực GOV/PRE/DET/PRI/RES, pháp lý VN) và đưa khuyến nghị cho chủ dự án.
- Mọi tập dữ liệu mang nhãn nội bộ (Công khai/Nội bộ/Bảo mật/Hạn chế) + phân loại pháp lý; nhiều tiêu chí → mức cao nhất.
- Không dùng dữ liệu thật trên DEV/UAT; PII phải được che/token hóa trước khi vào log, index, môi trường phân tích.
- Nhật ký: xử lý dữ liệu cốt lõi/quan trọng ≥ 6 tháng; nhật ký hệ thống truy xuất ≥ 12 tháng; log làm chứng cứ phải bất biến (WORM, băm, ký số).
- Sự cố DLCN: thông báo ≤ 72 giờ. Chuyển xuyên biên giới / xử lý DLCN: hồ sơ đánh giá tác động.
- Kết quả đánh giá lưu tại: docs/data-protection-assessment.md

Trong CCoding, nhãn dữ liệu của **dự án** quyết định runtime: mặc định `Bảo mật` và `Hạn chế` chỉ được chạy trên runtime **cục bộ** (mock, Ollama…); khóa bí mật luôn bị che trước khi gửi đi; log luôn che PII.

## Cấu trúc thư mục

```
agents/            hồ sơ vị trí (agent.md) — orchestrator, cto + dev/ + research/
departments/       điều lệ phòng ban (thành viên, trưởng phòng, reviewer, từ khóa định tuyến)
src/               mã nguồn TypeScript (orchestrator, runtimes, server, CLI, herdr)
public/            giao diện web JS thuần (không build, không framework; chân dung agent vẽ pixel bằng canvas)
docs/              kiến trúc, herdr, runtime, hướng dẫn agent, đánh giá bảo vệ dữ liệu
test/              kiểm thử (node:test) — chạy `npm test`
ccoding.config.json  cấu hình mặc định (ghi đè bằng ccoding.local.json)
```

## Phát triển

```bash
npm run dev        # server + tự build lại khi sửa src/
npm test           # 166 bài kiểm thử (node:test): planner, runtime, bảo mật, e2e, API, giao diện dữ liệu (UX-1→4)
npm run typecheck
```
