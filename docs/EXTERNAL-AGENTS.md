# Agent ngoài (runtime `process` và `http`)

Cắm một agent bạn tự viết, hoặc dịch vụ agent của đội khác, vào CCoding như một runtime. Ý tưởng lấy từ adapter process/http của Paperclip. Điểm khác: lượt gọi vẫn đi qua `Orchestrator.call()`, nên vẫn có log chuỗi băm, đếm token, ngân sách và chính sách nhãn dữ liệu.

## Khai báo trong `ccoding.config.json`

```json
{
  "runtimes": {
    "my-agent":   { "type": "process", "command": "node", "extraArgs": ["examples/external-agent.mjs"] },
    "team-agent": { "type": "http", "baseUrl": "http://127.0.0.1:8088/run", "apiKeyEnv": "TEAM_AGENT_KEY" }
  }
}
```

Chọn runtime cho agent (`runtime:` trong agent.md), cho dự án, hoặc cho từng nhiệm vụ như mọi runtime khác.

## Giao kèo

Đầu vào: một JSON, qua stdin với `process`, qua thân POST với `http`.

```json
{ "version": 1, "runId": "T-…#12", "phase": "execute", "model": "…", "system": "hồ sơ vị trí", "context": "bối cảnh nhiệm vụ",
  "prompt": "việc của lượt này", "maxTokens": 8000,
  "agent": { "id": "backend-dev", "name": "…", "role": "member", "department": "dev" },
  "meta": { "taskId": "T-…", "subtaskId": "S1", "department": "dev", "projectId": "…", "callId": "T-…#12" } }
```

Đầu ra: `{ "text": "…", "usage": { "input": 1200, "output": 300 }, "model": "…" }`. Thiếu `usage` thì CCoding tự ước lượng (đánh dấu ước lượng). Với `process`, in văn bản thuần ra stdout cũng được.

Lỗi: `process` thoát mã khác 0, `http` trả mã khác 2xx, hoặc quá `timeoutMs`. Lỗi được phân loại như runtime khác (429 thì giới hạn tốc độ, 401 thì xác thực…), nên điều phối tự chuyển sang tài nguyên khác.

## An toàn dữ liệu

- Tiến trình con chỉ nhận `PATH`, `HOME`, `LANG` và `CCODING_RUN_ID`, `CCODING_TASK_ID`, `CCODING_AGENT_ID`, `CCODING_PHASE`. Khóa API của máy chủ không lọt sang.
- `process` mặc định được coi là cục bộ. Đặt `"local": false` nếu script gửi dữ liệu ra ngoài.
- `http` chỉ được coi là cục bộ khi địa chỉ là loopback (`127.0.0.1`, `localhost`, `::1`). Máy chủ ở xa không bao giờ nhận dữ liệu Bảo mật/Hạn chế.
- Agent ngoài không có vòng lặp công cụ của CCoding (`supportsTools: false`). Nếu agent tự sửa tệp, nó làm trong thư mục `cwd` của lượt gọi (worktree của nhiệm vụ).

Mẫu: `examples/external-agent.mjs`.
