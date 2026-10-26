# Runtime — agent chạy bằng gì?

Mỗi lượt gọi agent được giao cho một **runtime**. Thứ tự chọn (cái đầu tiên có giá trị thắng):

1. `--runtime` của nhiệm vụ (UI: *Tùy chọn nâng cao*)
2. `runtime` của dự án
3. `runtime:` trong frontmatter agent.md (mặc định `inherit`)
4. `runtime.default` trong cấu hình (`auto`)

Thứ tự `auto` mặc định: `claude-cli → bifrost → anthropic-api → openai-api → codex-cli → kimi-cli → ollama → mock`.

Runtime được chỉ định nhưng **chưa sẵn sàng** hoặc **bị chặn bởi nhãn dữ liệu** ⇒ rơi về `auto` và ghi cảnh báo `runtime.fallback` vào log. `auto` duyệt `runtime.order` và chọn runtime đầu tiên vừa sẵn sàng vừa được phép.

## Bảng runtime

### `claude-cli` — Claude Code
- Lệnh: `claude -p --output-format stream-json --verbose --model <alias> --no-session-persistence`, prompt qua stdin.
- Pha thực thi/sửa: `--tools <tools trong agent.md> --permission-mode acceptEdits` (đổi bằng `runtimes.claude-cli.permissionMode`); pha họp/định tuyến: không công cụ; pha kế hoạch/review/tổng hợp: chỉ công cụ đọc.
- Token & chi phí **chính xác** từ sự kiện `result` (input, output, cache đọc/ghi, `total_cost_usd`).
- Model: `opus` / `sonnet` / `haiku` dùng thẳng alias.

### `codex-cli` — OpenAI Codex
- `codex exec --json --skip-git-repo-check --sandbox workspace-write|read-only [-m model] -`.
- Token từ sự kiện `turn.completed` (input gồm cả cache → tách riêng). Đặt model trong `models.codex-cli`.

### `kimi-cli` — Kimi Code
- `kimi -p "<prompt>" --output-format stream-json [-m model]`. Prompt dài > 20k ký tự được ghi ra `.ccoding/prompts/<id>.md` trong workspace và agent được dặn đọc file đó.
- Nếu CLI không báo usage ⇒ token **ước lượng** (đánh dấu `estimated`, UI hiện `≈`).

### `anthropic-api`
- Messages API (stream), khóa ở `$ANTHROPIC_API_KEY` (đổi tên biến bằng `apiKeyEnv`). Không dùng công cụ — agent trả sản phẩm dạng văn bản/khối code.
- Model: `models.anthropic-api` ánh xạ alias → id (mặc định `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`).

### `openai-api` — mọi API tương thích OpenAI
- `POST <baseUrl>/chat/completions` (stream, `stream_options.include_usage`).
- **9router**: `baseUrl: http://localhost:20128/v1`, khóa lấy từ dashboard của 9router (đặt vào biến môi trường, ví dụ `NINEROUTER_API_KEY`, và `apiKeyEnv` tương ứng). Model dạng `cc/claude-…`, `cx/…` hoặc tên combo — xem `GET /v1/models`.
- **Ollama** (cục bộ): `baseUrl: http://localhost:11434/v1`, `"local": true` ⇒ được phép xử lý dữ liệu *Bảo mật*/*Hạn chế*.
- Không ánh xạ model ⇒ dùng `defaultModel`, nếu trống lấy model đầu tiên server liệt kê.

### `bifrost` — gateway Bifrost (khuyến nghị)
- Runtime tùy biến kiểu `openai-api`, mặc định `http://localhost:8080/v1`. Chạy Bifrost: `npx -y @maximhq/bifrost` (web UI cùng cổng 8080) — hoặc để `herdr up` tự chạy (xem `herdr.services`).
- Model đặt theo dạng `provider/model` của Bifrost, ví dụ `ollama/qwen3:8b`, `anthropic/claude-sonnet-…`, `openai/gpt-…` — ánh xạ alias trong `models.bifrost`.
- **Gắn tag mỗi request** (chỉ mã định danh, không nội dung): `x-bf-dim-app=ccoding`, `x-bf-dim-agent`, `x-bf-dim-department`, `x-bf-dim-task`, `x-bf-dim-phase`, `x-bf-dim-project`, `x-bf-dim-subtask`, và `x-request-id` = mã lượt gọi trong sổ cái token ⇒ đối chiếu được log Bifrost với `data/usage/ledger.jsonl`.
- **Key ảo theo phòng ban**: tạo virtual key trong Bifrost (Virtual Keys → Add), đặt ngân sách/giới hạn, rồi khai báo:
  ```json
  "bifrost": { "virtualKeys": { "dev": "env:BIFROST_VK_DEV", "research": "env:BIFROST_VK_RESEARCH", "office": "env:BIFROST_VK_OFFICE" } }
  ```
  Giá trị dạng `env:TEN_BIEN` đọc từ biến môi trường (khuyến nghị, Windows: `setx BIFROST_VK_DEV sk-bf-…`); có thể ghi thẳng khóa trong `ccoding.local.json` (đã `.gitignore`). Key gửi qua header `x-bf-vk`.
- **LiteLLM** dùng cùng cơ chế: `"tags": "litellm"` (gửi `x-litellm-tags`), `"virtualKeyHeader": "authorization"`.

#### Thiết lập Bifrost trên Windows (đã kiểm chứng với Bifrost v2.3)
1. `scripts\new-bifrost-keys.ps1` — sinh key ảo ngẫu nhiên cho 3 phòng (`BIFROST_VK_DEV/RESEARCH/OFFICE`, lưu vào biến môi trường người dùng, không in ra).
2. Đặt khóa của dịch vụ phía sau (ví dụ 9router — lấy ở dashboard 9router): `setx NINEROUTER_API_KEY "<khóa>"`.
3. `scripts\bifrost.ps1` (hoặc để `herdr up` chạy trong tab **Dịch vụ**) — lần đầu tạo `data\bifrost\config.json` từ [`docs/bifrost.config.example.json`](bifrost.config.example.json): provider tùy biến `ninerouter` (OpenAI-compatible → `http://127.0.0.1:20128`), 3 key ảo theo phòng, **không lưu nội dung prompt** (`disable_content_logging`), bắt buộc key khi suy luận (`enforce_auth_on_inference`).
4. Bảng điều khiển Bifrost (http://127.0.0.1:8080) bị khóa cho tới khi tạo tài khoản quản trị: `setx BIFROST_SETUP_TOKEN "<chuỗi bí mật tự đặt>"`, khởi động lại Bifrost, mở trang và nhập token để tạo admin. Việc định tuyến/tag vẫn chạy bình thường khi chưa mở bảng điều khiển.

`requireEnv` trong cấu hình runtime: runtime chỉ được coi là sẵn sàng khi các biến đó đã đặt (trên Windows CCoding đọc cả biến vừa `setx` mà không cần mở lại terminal).

### `ollama` — mô hình cục bộ
- Runtime tùy biến `openai-api` tại `http://localhost:11434/v1`, `"local": true` ⇒ **được phép** xử lý dự án *Bảo mật*/*Hạn chế*. Cần `ollama pull <model>` trước; đặt `models.ollama` (ví dụ `"sonnet": "qwen3:8b"`).

### Thêm runtime tùy biến
Bất kỳ khóa mới trong `runtimes` có `"type": "openai-api"` sẽ thành một runtime riêng (ví dụ `litellm`, `openrouter`, `vllm`), dùng được trong `runtime.order`, dự án và agent.md.

### `mock`
- Không gọi LLM; sinh kế hoạch/thảo luận/sản phẩm mô phỏng theo vai trò. Dùng để demo giao diện, kiểm thử, và làm "lưới an toàn" khi không có runtime nào được phép.
- `runtimes.mock.minDelayMs/maxDelayMs` chỉnh tốc độ; `reviewRejectRate` (0–1) mô phỏng reviewer yêu cầu sửa.

## Ví dụ `ccoding.local.json` (Bifrost + Ollama, chạy kèm trong herdr)

```json
{
  "runtime": { "order": ["bifrost", "ollama", "kimi-cli", "mock"] },
  "models": {
    "bifrost": { "opus": "anthropic/claude-opus-5-5", "sonnet": "anthropic/claude-sonnet-5-5", "haiku": "ollama/qwen3:8b" },
    "ollama": { "opus": "qwen3:14b", "sonnet": "qwen3:8b", "haiku": "qwen3:8b" }
  },
  "herdr": { "services": [ { "label": "bifrost", "command": "npx -y @maximhq/bifrost" } ] }
}
```

Một số agent chạy runtime khác: thêm `runtime: kimi-cli` vào frontmatter agent đó (ví dụ cho `literature-researcher`).

## Bảng giá (tùy chọn)

Runtime không báo chi phí ⇒ có thể khai báo `pricing` (USD / 1 triệu token) theo id model để UI tính chi phí. Hãy điền theo bảng giá hiện hành của nhà cung cấp — CCoding không tự đoán giá.
