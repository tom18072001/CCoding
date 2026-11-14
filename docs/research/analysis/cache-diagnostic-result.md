# Kết quả chẩn đoán cache claude-cli (B-14): BỊ CHẶN, chưa có số đo

> Hạng mục S3 · @devops · 3/11/2026 · phân loại dữ liệu: **Nội bộ**.
> Đặc tả: `cache-diagnostic-spec.md` Phần 1. **Chưa chạy lượt `claude -p` nào. Không có số đo cacheWrite/cacheRead trong tệp này.**

## 1. Trạng thái

Hook `claude-guard` của CCoding chặn bước dựng môi trường đo. Theo chỉ dẫn của nhiệm vụ ("hook chặn thì ghi lại và dừng, không nới hook"), tôi dừng ở đây và không tìm đường vòng.

## 2. Thông tin môi trường đã kiểm

| Mục | Kết quả |
|---|---|
| SHA nhánh (`ccoding/t-20261103-150402-045--s3`) | `8837bf55d447894bfc1be6e243db2111d4187cbb` |
| `claude --version` (hook cho phép) | `2.1.312 (Claude Code)` |
| Giờ kiểm | 3/11/2026 (không có lượt đo nào) |
| Cờ `claude-cli.ts` | Đối chiếu số dòng với spec §1.1: `:138` (`--version`), `:145` (`-p`, `stream-json`, `--verbose`, `--model`, `--no-session-persistence`), `:148` (`--tools`, `--permission-mode`), `:169` (`--allowedTools`), `:175` (`--strict-mcp-config --setting-sources project,local`) đều khớp spec |

Biến môi trường, kiểm theo tên (không ghi giá trị):

| Biến | Có/không |
|---|---|
| `ANTHROPIC_API_KEY` | không |
| `ANTHROPIC_BASE_URL` | không |
| `ANTHROPIC_AUTH_TOKEN` | không |
| `CLAUDE_CODE_USE_BEDROCK` | không |
| `CLAUDE_CODE_USE_VERTEX` | không |
| `NINEROUTER_URL` | không |

Không thấy biến nào cho 9router hoặc API key ngoài ở danh sách trên. Việc liệt kê toàn bộ biến môi trường bị hook chặn (xem §3a), nên danh sách này chỉ gồm các tên đã kiểm.

## 3. Thông điệp chặn nguyên văn

**(a)** Lệnh liệt kê tên toàn bộ biến môi trường (để rà biến lạ):

```
PreToolUse:Bash hook error: [node "<máy-chạy>/CCoding/dist/tools/claude-guard.js"]: CCoding chặn lệnh: liệt kê toàn bộ biến môi trường / đọc biến chứa khóa
```

**(b)** Lệnh dựng thư mục tạm `/tmp/b14`, ghi script đo và khởi chạy 3 cặp `claude -p` (lệnh gộp, bị chặn nguyên khối):

```
PreToolUse:Bash hook error: [node "<root>/dist/tools/claude-guard.js"]: CCoding chặn lệnh: đường dẫn ngoài thư mục làm việc của nhiệm vụ (`cd /tmp/b14`) — chỉ làm việc trong <worktree của nhiệm vụ>
```

## 4. Vì sao dừng

Spec §1.2 yêu cầu `cwd` của mỗi lượt đo là **thư mục tạm rỗng ngoài repo** (không `CLAUDE.md`, không `.git`), mỗi cặp một tên, để `--setting-sources project,local` không nạp cấu hình làm nhiễu cặp (c). Hook chỉ cho làm việc trong worktree.

- Dùng thư mục trong worktree thì cwd thừa hưởng `CLAUDE.md`/`AGENTS.md` và `.git`. Phép đo sai điều kiện của spec, và cặp (c) mất giá trị đối chứng.
- Cho script đo tự tạo thư mục ngoài worktree rồi gọi `claude` từ đó là lách giới hạn đường dẫn của hook bằng một lớp trung gian. Điều này trái chỉ dẫn "không nới hook".

Chưa lượt `claude -p` nào được chạy, kể cả lượt khởi động. Ngân sách 8 lượt chưa dùng.

## 5. Việc cần người có quyền (Tom)

Một trong hai:

1. Chạy script đo từ phiên ngoài CCoding (terminal thường, đăng nhập Max), hoặc
2. Cho phép một thư mục tạm cố định ngoài worktree (ví dụ `%TEMP%\b14-cwd`) trong chính sách của hook. Đây là quyết định của chủ dự án, không phải của agent.

Thiết kế sẵn sàng chạy, theo spec §1.2–1.6:

- Mô hình: `sonnet`. Cờ: `claude -p --output-format stream-json --verbose --model sonnet --no-session-persistence --tools <T> --permission-mode acceptEdits --allowedTools <T> --strict-mcp-config --setting-sources project,local`. Prompt qua stdin, `nonce` đầu stdin, đoạn văn tổng hợp, kết thúc "Trả lời đúng một từ: OK.".
- Không truyền `--settings` (hook PreToolUse của CCoding, `claude-cli.ts:152-154`) vì hook này không nằm trong tiền tố prompt. Đây là điểm lệch nhỏ so với runtime, cần ghi khi báo cáo số đo.
- Cặp (a): cùng `Read,Grep`, cùng cwd. Cặp (b): `Read,Grep` rồi `Read,Grep,Edit,Write`, cùng cwd. Cặp (c): cùng công cụ, cwd `c1` rồi `c2`.
- Hai lượt trong cặp cách nhau ≤ 60 s; giữa các cặp chờ > 5 phút; tối đa 8 lượt (1 khởi động, 6, 1 dự phòng có lý do).
- Nếu h(a) < 0,5 thì dừng, không chạy (b) và (c).
- Chỉ ghi `usage` (`cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens`, `output_tokens`), không lưu nội dung phản hồi.
- Đầu ra CSV: `pair,call,model,gap_s,cw,cr,in,out,h`. Kết luận khớp/không khớp theo bảng §1.4.

CSV (chưa có dữ liệu):

```
pair,call,model,gap_s,cw,cr,in,out,h
```

## 6. Data Protection Gate

Không có dữ liệu mới nào được tạo hay đưa ra ngoài, nhãn Nội bộ. Prompt giả (khi chạy) là văn bản tổng hợp, không chứa PII.
