# Chẩn đoán: `403 Attention Required! | Cloudflare` chỉ xảy ra trên đường runtime `claude-cli` của CCoding

> Ghi chú chẩn đoán (13–14/11/2026, hạng mục K2 của BRIEF-D15). Phân loại dữ liệu: **Nội bộ**. Chỉ đọc mã và so sánh; **không** chạy `claude -p`, không gọi mạng, không in giá trị biến môi trường thật.
> Nhãn: **[ĐÃ KIỂM CHỨNG]** = suy ra chắc chắn từ mã hoặc từ phép thử `node -e` thuần (không mạng); **[CHƯA KIỂM CHỨNG]** = giả thuyết chưa thử được.

## 1. Hiện tượng (RUNLOG E7, mục "Bước 2 xong; 16 lượt R1/R2 lỗi xác thực…")

- 16 lượt accept (8 của R1, 8 của R2) kết thúc bằng `Failed to authenticate. API Error: 403 Attention Required! | Cloudflare`, mỗi lượt 5–15 giây.
- Dồn vào hai khoảng: 09:47:55–09:51:49 và 10:17:37–10:20:05 UTC (13/11/2026). Cùng khoảng đó mọi lượt R3 (`claude -p` gọi thẳng qua `bench/vs-claude/lib/claude.mjs`) chạy bình thường.
- Cùng ngày RUNLOG ghi: máy chạy có `ANTHROPIC_API_KEY` cấp người dùng và harness chuyển R3 sang `claudeEnv()` (`bench/vs-claude/lib/claude.mjs:7-21`).
- Nhận xét: lỗi dồn thành **hai cụm thời gian hẹp**, trong khi phần lớn lượt CCoding khác (384/384 cặp hoàn tất) xác thực được. Một khác biệt **cố định** của đường CCoding (cờ, env, cwd) khó tự giải thích hai cụm; nó chỉ giải thích được khi kết hợp với một yếu tố **theo thời gian** (tần suất/đồng thời, xem H1, H2).

## 2. Bảng khác biệt

Nguồn: CCoding = `src/runtimes/claude-cli.ts` (`buildClaudeArgs` :237-282, `run()` :297-346), `scrubEnv` = `src/tools/workspace.ts:291-304`, `runProcess` = `src/runtimes/spawn.ts:87-103`. Bench = `bench/vs-claude/lib/claude.mjs` (`claudeEnv` :16-21, `claudeArgs` :53-59, `runClaude` :61-65).

### 2.1 Biến môi trường

| # | Khác biệt | Bằng chứng | Cơ chế có thể dẫn tới 403 | Nhãn |
|---|---|---|---|---|
| E1 | **Regex lọc khóa/token giống hệt** ở hai bên. Phép thử `node -e` trên tên mẫu: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `GITHUB_ACTIONS` bị xóa ở cả hai; `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`, `CI`, `CLAUDE_CONFIG_DIR`, `USERPROFILE`, `APPDATA` được giữ ở cả hai. | `src/tools/workspace.ts:294` ↔ `bench/vs-claude/lib/claude.mjs:8` | Không phải khác biệt: `scrubEnv` xóa biến chứa `TOKEN` (kể cả token OAuth dạng biến môi trường) y hệt `claudeEnv` ở R3. **Loại** giả thuyết "scrubEnv làm mất token đăng nhập, riêng đường CCoding". | [ĐÃ KIỂM CHỨNG] |
| E2 | `CI=1` chỉ có bên CCoding (đặt khi chưa có `CI`). Bench giữ nguyên `CI` của máy. | `workspace.ts:297` | CLI ở chế độ CI có thể đổi hành vi (không tương tác, cách làm mới token, kiểm tra cập nhật, telemetry). Repo không có bằng chứng về hành vi nội bộ của CLI. | [CHƯA KIỂM CHỨNG] |
| E3 | `CCODING_AGENT=1`, `npm_config_include=dev`, xóa `NODE_ENV=production`/`npm_config_omit|production|only` chỉ ở CCoding. | `workspace.ts:298-302` | Chỉ ảnh hưởng npm/công cụ con, không liên quan xác thực HTTP. Khả năng rất thấp. | [CHƯA KIỂM CHỨNG] (suy luận) |
| E4 | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` chỉ có ở bench (R3). | `claude.mjs:19` | Tắt các request không thiết yếu; R3 gửi ít request hơn, ít bị thử thách bot/giới hạn tần suất của Cloudflare hơn. Đây là khác biệt env hợp lý nhất theo hướng bất lợi cho CCoding. | [CHƯA KIỂM CHỨNG] |
| E5 | `CCODING_GUARD` (JSON) khi `allowTools`; `BASH_MAX_OUTPUT_LENGTH` khi cấu hình. | `claude-cli.ts:254-271` | Chỉ hook guard/Bash đọc, không chạm xác thực. | [ĐÃ KIỂM CHỨNG] (đọc mã) |
| E6 | `useApiKey` đúng ⇒ CCoding truyền **nguyên** `process.env` (không lọc); mặc định thì lọc như E1. | `claude-cli.ts:340` | Nếu máy chạy đặt `useApiKey: true`, đường CCoding dùng `ANTHROPIC_API_KEY`/`BASE_URL` cấp người dùng còn R3 thì không ⇒ hai đường xác thực khác nhau. Cần xem `config-*.json` của E7. | [CHƯA KIỂM CHỨNG] |
| E7 | CCoding chạy **trong cùng tiến trình** với harness E7 (`runCto(app, …)`) nên `process.env` gốc giống R3; khác biệt chỉ ở bước lọc. | `bench/vs-claude/e7/lib.mjs:215` | Loại giả thuyết "môi trường gốc hai arm khác nhau". | [ĐÃ KIỂM CHỨNG] (đọc mã) |

### 2.2 Cờ CLI

| # | Khác biệt | Bằng chứng | Cơ chế có thể dẫn tới 403 | Nhãn |
|---|---|---|---|---|
| F1 | CCoding luôn thêm `--settings <JSON hook PreToolUse (+ sandbox nếu bật)>`; bench không. | `claude-cli.ts:250-253` | Phía CCoding, `--settings` chỉ mang hook/sandbox cục bộ, không đổi endpoint hay header. Chỉ liên quan nếu `sandbox` bật (F4). | [CHƯA KIỂM CHỨNG] cho hành vi bên trong CLI |
| F2 | CCoding: `--tools <theo pha>` hoặc `--tools ''` + `--allowedTools`; bench: `--tools` tùy chọn, `--disallowedTools WebFetch,WebSearch,Task`, `--permission-mode`. | `claude-cli.ts:238-276` ↔ `claude.mjs:54-58` | Danh sách công cụ không đổi bước xác thực. | [CHƯA KIỂM CHỨNG] (suy luận) |
| F3 | Cả hai dùng `--strict-mcp-config --setting-sources project,local` (CCoding trừ khi `userSettings: true`), `--no-session-persistence`, `--output-format stream-json --verbose`. | `claude-cli.ts:279`, `:238` ↔ `claude.mjs:58`, `:54-58` | Giống nhau → không phải nguyên nhân. | [ĐÃ KIỂM CHỨNG] (đọc mã) |
| F4 | `osSandbox.enabled` ⇒ khóa `sandbox` trong `--settings`; trên Windows ⇒ `wrapForWsl` chạy `wsl.exe --cd … --exec claude …`. Mặc định tắt. Mã tự ghi "CHƯA KIỂM TRÊN MÁY THẬT"; có mẫu nhận diện `net-403` ở `parseSandboxDeny`. | `claude-cli.ts:252,332-333`, `:100`, `:118` | Trong WSL, `claude` đọc `~/.claude` và đăng nhập **của distro**, proxy sandbox có thể trả 403. Chỉ áp dụng nếu E7 bật `osSandbox`. | [CHƯA KIỂM CHỨNG] |
| F5 | Prompt qua **stdin** ở CCoding; E7 R3 cũng dùng `stdin: true` (mặc định bench là tham số). | `claude-cli.ts:342` ↔ `claude.mjs:49-52,65` | Giống nhau ở E7 → không giải thích được. | [ĐÃ KIỂM CHỨNG] (đọc mã) |
| F6 | CCoding spawn qua `resolveCommand` (có thể qua `cmd.exe /d /s /c` với `windowsVerbatimArguments` khi lệnh là `.cmd`); bench spawn `claude` trực tiếp. | `spawn.ts:88-102` | Chỉ đổi cách trích dẫn đối số, không đổi mạng/xác thực. | [CHƯA KIỂM CHỨNG] (suy luận) |
| F7 | Đường herdr/`agent-exec` chạy trong pane riêng; lượt accept đi qua `Orchestrator.call()` → runtime, không qua pane. | `src/herdr.ts:408`, `src/cli.ts:903` | Không áp dụng cho 16 lượt này nếu E7 không dùng herdr. | [CHƯA KIỂM CHỨNG] (chưa xác minh E7 có dùng herdr) |

### 2.3 `cwd` / HOME / WSL (thư mục cấu hình & thông tin đăng nhập)

| # | Khác biệt | Bằng chứng | Cơ chế có thể dẫn tới 403 | Nhãn |
|---|---|---|---|---|
| C1 | `cwd`: CCoding = `req.cwd` (worktree riêng của nhiệm vụ); bench R3 = workspace của lượt chạy. | `claude-cli.ts:332` ↔ `claude.mjs:65` | `cwd` quyết định cài đặt `project,local` (`.claude/settings*.json`). Một `.claude/settings.json` có `apiKeyHelper`/`env`/`ANTHROPIC_BASE_URL` sẽ nạp ở đây. Cần so `.claude/` của hai bên. | [CHƯA KIỂM CHỨNG] |
| C2 | Cả hai **không** đặt `HOME`/`USERPROFILE`/`CLAUDE_CONFIG_DIR` (cả hai giữ, xem E1) → CLI đọc cùng thư mục đăng nhập Windows. | `workspace.ts:294-296`, `claude.mjs:18` | Cùng thông tin đăng nhập nên đăng nhập không khác nhau; nhưng nhiều tiến trình song song cùng làm mới token trên một tệp có thể tranh chấp. | [CHƯA KIỂM CHỨNG] |
| C3 | Tần suất/đồng thời: một nhiệm vụ CCoding gọi `claude` nhiều lần liên tiếp (route, plan, execute, review, accept…); R3 chỉ một phiên mỗi lượt. | RUNLOG: lượt lỗi 5–15 s, dồn hai cụm | "Attention Required" là trang thử thách bot/giới hạn theo IP/UA/tần suất; số lần khởi động CLI (mỗi lần kiểm tra đăng nhập) của đường CCoding cao hơn R3 trong cùng khoảng. | [CHƯA KIỂM CHỨNG] |

## 3. Giả thuyết xếp hạng

Tiêu chí: (a) khớp với hai cụm thời gian hẹp và R3 vẫn sạch; (b) có khác biệt thật trong mã; (c) chưa bị loại.

1. **H1 — Cloudflare giới hạn/thử thách theo tần suất hoặc đồng thời ở bước xác thực; đường CCoding khởi động CLI nhiều hơn (C3) và còn gửi lưu lượng "không thiết yếu" mà R3 tắt (E4).** Khớp hai cụm, lỗi fail nhanh 5–15 s, R3 sạch. *Phép thử (Tom tự chạy sau):* chạy cùng một nhiệm vụ nhỏ qua CCoding hai lần, lần 2 đặt `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` vào môi trường tiến trình CCoding; so số lượt `error` 403 trong `calls.jsonl`. Hoặc đếm số lần `claude` khởi động/phút ở hai cụm lỗi so với giờ khác.
2. **H2 — Tranh chấp tệp đăng nhập khi nhiều tiến trình `claude` cùng làm mới token (C2).** *Phép thử:* chạy 4 tiến trình `claude -p "ok" --tools ""` đồng thời cùng thư mục cấu hình; đếm lỗi xác thực; lặp lại tuần tự để đối chứng.
3. **H3 — `CI=1` đổi cách CLI xử lý xác thực/làm mới token (E2).** Là khác biệt cố định duy nhất rõ ràng trong env nhưng một mình không giải thích tính theo cụm. *Phép thử:* hai lệnh `claude -p "ok" --tools "" --output-format json` trong cùng thư mục, một có `CI=1`, một bỏ `CI`; so kết quả và `apiKeySource` trong sự kiện `init`.
4. **H4 — `useApiKey: true`, `osSandbox`, hoặc `.claude/settings` của worktree đưa đường CCoding sang endpoint/proxy khác (E6, F4, C1).** Loại được bằng đọc cấu hình, không cần chạy CLI. *Phép thử:* đọc `runtimes.claude-cli.useApiKey` và `osSandbox.enabled` trong `bench/vs-claude/results/e7-cto/config-*.json`; liệt kê `.claude/` của worktree.
5. **H5 — Khác biệt cờ công cụ/`--settings`/stdin/`cmd.exe` (F1, F2, F5, F6).** Thấp nhất: không chạm xác thực hoặc đã giống nhau.

**Đã loại bằng mã:** "scrubEnv làm mất token OAuth riêng đường CCoding" (E1), "môi trường gốc hai arm khác nhau" (E7), `--setting-sources`/`--strict-mcp-config`/stdin khác nhau (F3, F5).

## 4. Đề xuất tiếp (chưa làm)

- Khi lỗi xác thực, ghi vào bản ghi lượt gọi các trường chẩn đoán an toàn: `apiKeySource` của sự kiện `init`, có/không `CI`, có/không `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `cwd` đã băm; **không** ghi giá trị biến. Cần quyết định riêng vì sửa `src/` ngoài phạm vi K2.
- Lỗi 403/Cloudflare nên được coi là lỗi hạ tầng tạm thời và thử lại có lùi thời gian (thuộc K1).

## 5. Những gì ghi chú này KHÔNG làm

- **Không** đổi cơ chế đăng nhập (vẫn phiên đăng nhập claude.ai của máy; `useApiKey` giữ nguyên).
- **Không** thêm khóa API, không đặt `ANTHROPIC_*`, không dùng 9router.
- **Không** chạy `claude -p`, không gọi mạng, không chạy benchmark; **không** sửa `src/`, `bench/`, `docs/research/`.
- **Không** chép giá trị biến môi trường thật hay token; phép thử `node -e` chỉ dùng **tên** biến mẫu.
- Mọi kết luận về hành vi nội bộ của Claude Code CLI (`CI`, cờ lưu lượng không thiết yếu, làm mới token) là **[CHƯA KIỂM CHỨNG]**.

## Bổ sung D16/K1 — lỗi hạn mức 5 giờ giữa lượt (`resets 1am (Asia/Bangkok)`)

- D15 đã sửa sẵn phần chính của ca này: lượt có `error` kèm `text` làm dở đi vào nhánh lỗi, ghi usage lượt làm dở, tạm dừng `quota` (không `failed`, không thử lại tức thì, không ghi báo cáo tổng hợp từ thông báo lỗi). Các ca này nay có test (`test/quota-5h-pause.test.ts`), xanh ngay không cần sửa.
- Chỗ còn thiếu: giờ tự tiếp tục không đọc được từ dạng `resets <giờ> (<múi giờ IANA>)` nên rơi về `quotaCooldownMs`. D16 thêm bộ đọc trong `parseRetryAt` (`src/runtimes/errors.ts`) và `call()` truyền `parseRetryAt(undefined, r.error)` khi runtime không kèm `retryAt`. Múi giờ sai ⇒ vẫn rơi về `quotaCooldownMs`.
