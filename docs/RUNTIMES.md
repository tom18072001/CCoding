# Runtime — agent chạy bằng gì?

Mỗi lượt gọi agent được giao cho một **runtime**. Thứ tự chọn (cái đầu tiên có giá trị thắng):

1. `--runtime` của nhiệm vụ (UI: *Tùy chọn nâng cao*)
2. `runtime` của dự án
3. `runtime:` trong frontmatter agent.md (mặc định `inherit`)
4. `runtime.default` trong cấu hình (`auto`)

Thứ tự `auto` mặc định: `claude-cli → bifrost → anthropic-api → openai-api → codex-cli → kimi-cli → ollama → mock`.

Runtime được chỉ định nhưng **chưa sẵn sàng** hoặc **bị chặn bởi nhãn dữ liệu** ⇒ rơi về `auto` và ghi cảnh báo `runtime.fallback` vào log. `auto` duyệt `runtime.order` và chọn runtime đầu tiên vừa sẵn sàng vừa được phép. `mock` chỉ được dùng khi nằm trong `runtime.order` (cấu hình máy thật nên bỏ `mock` khỏi `order` để không bao giờ nhận sản phẩm giả).

## Chuỗi model dự phòng, hạn mức và tự chuyển khi hết token

Mỗi bí danh (`opus`/`sonnet`/`haiku`) trong `models.<runtime>` có thể là **một chuỗi** theo thứ tự ưu tiên:

```json
"models": {
  "bifrost": {
    "sonnet": [
      { "model": "ninerouter/xx/free-model", "dailyTokenLimit": 2000000, "label": "Mốc miễn phí" },
      { "model": "ninerouter/cc/claude-sonnet-5-5", "label": "Claude Max" },
      { "model": "ninerouter/cx/gpt-6-sol", "label": "Codex" }
    ]
  }
}
```

Mỗi lượt gọi, CCoding dựng danh sách tài nguyên = (runtime ưu tiên → `runtime.order`) × (chuỗi model của runtime đó), bỏ qua tài nguyên:

- đang **nghỉ**: hết hạn mức (`quota` — tới thời điểm reset nhà cung cấp báo trong `Retry-After`/thông báo, mặc định `runtime.quotaCooldownMs` = 30 phút), giới hạn tốc độ (`rate` — 1–5 phút), lỗi kết nối/timeout lặp lại (2–10 phút), phản hồi rỗng lặp lại (10 phút), lỗi xác thực (30 phút), model không hỗ trợ (6 giờ);
- đã chạm **`dailyTokenLimit`** trong ngày (của mục trong chuỗi hoặc của cả runtime) — đếm từ sổ cái token.

Lỗi trong lúc gọi ⇒ ghi `runtime.error`, đánh dấu nghỉ, **thử ngay tài nguyên kế tiếp** (`runtime.failover`, tối đa `runtime.maxFailover` lần). Hết hạn mức/lỗi xác thực ⇒ cảnh báo trên giao diện (chuông + thông báo nổi), log và thông báo herdr. Không còn tài nguyên nào ⇒ nhiệm vụ **tạm dừng** (không lỗi) và tự tiếp tục khi tài nguyên sớm nhất mở lại. Trạng thái từng runtime/model (đang nghỉ tới mấy giờ, token hôm nay/hạn mức) hiện ở thẻ *Runtime*.

Pha nhẹ dùng model rẻ hơn: `phases.models` (mặc định định tuyến và họp dùng `haiku`). Giới hạn token đầu ra theo pha: `phases.maxTokens` (thực thi 32k; đầu ra bị cắt được tự viết tiếp tối đa 2 lần).

Máy của Tom (9router): Claude Max (`cc/`) đứng đầu chuỗi, Codex `cx/gpt-6-sol` dự phòng. Model `cu/` (Cursor) qua 9router trả phản hồi rỗng và `cx/gpt-5.5` không hỗ trợ với tài khoản ChatGPT — không đưa vào chuỗi. Có tài nguyên miễn phí muốn dùng trước ⇒ đặt ở đầu chuỗi kèm `dailyTokenLimit`.

## Công cụ của agent

Runtime API tương thích OpenAI có `supportsTools` (mặc định bật; Ollama tắt) chạy vòng lặp công cụ của CCoding: đọc/ghi file, chạy lệnh trong workspace dự án. Xem [TOOLS.md](TOOLS.md).

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
- **LiteLLM** dùng cùng cơ chế — thêm runtime tùy biến:
  ```json
  "litellm": { "type": "openai-api", "label": "LiteLLM proxy", "baseUrl": "http://localhost:4000/v1", "tags": "litellm", "virtualKeyHeader": "authorization", "virtualKeys": { "*": "env:LITELLM_KEY" } }
  ```

#### Thiết lập Bifrost trên Windows (đã kiểm chứng với Bifrost v2.3)
1. `scripts\new-bifrost-keys.ps1` — sinh key ảo ngẫu nhiên cho 3 phòng (`BIFROST_VK_DEV/RESEARCH/OFFICE`, lưu vào biến môi trường người dùng, không in ra).
2. Đặt khóa của dịch vụ phía sau (ví dụ 9router — lấy ở dashboard 9router): `setx NINEROUTER_API_KEY "<khóa>"`.
3. `scripts\bifrost.ps1` (hoặc để `herdr up` chạy trong tab **Dịch vụ**) — lần đầu tạo `data\bifrost\config.json` từ [`docs/bifrost.config.example.json`](bifrost.config.example.json): provider tùy biến `ninerouter` (OpenAI-compatible → `http://127.0.0.1:20128`), 3 key ảo theo phòng, **không lưu nội dung prompt** (`disable_content_logging`), bắt buộc key khi suy luận (`enforce_auth_on_inference`).
4. Bảng điều khiển Bifrost (http://127.0.0.1:8080) bị khóa cho tới khi tạo tài khoản quản trị: `setx BIFROST_SETUP_TOKEN "<chuỗi bí mật tự đặt>"`, khởi động lại Bifrost, mở trang và nhập token để tạo admin. Việc định tuyến/tag vẫn chạy bình thường khi chưa mở bảng điều khiển.

`promptStyle: "combined"`: gửi hồ sơ vị trí và công việc trong một tin nhắn — cần khi upstream tự chèn system prompt (9router với model `cc/…` của gói Claude Code), nếu không agent có thể tự nhận là "Claude Code" thay vì vai trò trong agent.md.

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
  "runtime": { "order": ["bifrost", "ollama", "kimi-cli"] },
  "models": {
    "bifrost": { "opus": ["anthropic/claude-opus-5-5", "openai/gpt-6-sol"], "sonnet": "anthropic/claude-sonnet-5-5", "haiku": "ollama/qwen3:8b" },
    "ollama": { "opus": "qwen3:14b", "sonnet": "qwen3:8b", "haiku": "qwen3:8b" }
  },
  "herdr": { "services": [ { "label": "bifrost", "command": "npx -y @maximhq/bifrost" } ] }
}
```

Một số agent chạy runtime khác: thêm `runtime: kimi-cli` vào frontmatter agent đó (ví dụ cho `literature-researcher`).

## Bảng giá (tùy chọn)

Runtime không báo chi phí ⇒ có thể khai báo `pricing` (USD / 1 triệu token) theo id model để UI tính chi phí. Hãy điền theo bảng giá hiện hành của nhà cung cấp — CCoding không tự đoán giá.
