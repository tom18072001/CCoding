# Phòng Dev, gói D24: harness E7 nhận cấu hình theo arm để E7b chạy xen kẽ trong một tiến trình; dòng chạy ghi lượt `accept` đủ để kiểm

**Gói nhỏ: 3 hạng mục. Ngân sách 4M token.** Giao 15/11/2026.

**Căn cứ:** biên bản CTO của BRIEF-26 (đăng ký E7b, T-20261115-094542-2d1) và `bench/vs-claude/results/e7b-cto/RUNBOOK.md` mục 1 và 7 trên nhánh đó.
- **E7b cần hai arm khác trần lượt `accept`:** R1b Sonnet trần 6, R2b Opus trần 16, mỗi arm một tệp cấu hình (chỉ khác `phases.toolTurns.accept`).
- **`bench/vs-claude/e7/run.mjs` chỉ nhận một `--config` mỗi tiến trình** (`run.mjs:35`, đặt `CCODING_CONFIG`). Mọi arm dùng chung một `app` (`appFor()`), nên không đặt được trần khác nhau theo arm. Phòng Nghiên cứu phải dùng hai tiến trình song song, tức sai lệch so với xen kẽ bảng Latin của E7. §9 đã có sẵn "phương án thay thế": một tiến trình xen kẽ khi Dev thêm tùy chọn.
- **`createApp(overrides, { root })`** (`src/app.ts:32`) chỉ đọc `CCODING_CONFIG` qua `loadConfig({ root })`. Nó không nhận tệp cấu hình tường minh, dù `loadConfig` đã có `configFile`.
- **Dòng R1/R2 của `runs.jsonl` thiếu trường hạ tầng của lượt `accept`:**
  - không có `authSource`, cờ chạm trần, số thao tác công cụ;
  - `turns` luôn 0 vì `runCto` cộng `calls[].turns` mà bản ghi `calls.jsonl` (`src/orchestrator.ts`, khoảng dòng 4082–4106) không có `turns`;
  - runtime `claude-cli` không đọc `num_turns` của sự kiện `result`.
  - Hệ quả: E7b phải giữ thư mục dữ liệu app (chưa che PII, ngoài repo) để kiểm, và repo công khai không tự kiểm lại được.
- **Bước 1 của `run.mjs` tự tạo `selected.json` trong `--out` nếu chưa có**, kèm chuẩn bị lại và có thể thay mục. E7b phải sao tay danh sách chốt của E7 vào thư mục `--out`.

**Phạm vi:**
- **Được sửa:** `src/app.ts`, `src/runtimes/claude-cli.ts`, `src/orchestrator.ts` (chỉ bản ghi lượt gọi), `src/types.ts`, `bench/vs-claude/e7/`, `bench/vs-claude/test/`, `test/`, `docs/` (trừ `docs/research/`).
- **Không sửa:** `bench/vs-claude/results/`, `docs/research/`, `bench/vs-claude/lib/`.
- Không chạy benchmark, không gọi `claude -p` thật.
- Dữ liệu: **Nội bộ**.

**Kế hoạch:** mỗi hạng mục kế hoạch ghi mã K ở đầu tiêu đề.

**Lệnh kiểm tra phải xanh** (CCoding tự chạy, `strictChecks` bật): `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:bench`, `npm run test:research`.

## Hạng mục

**K1 — senior-swe: cấu hình theo arm, danh sách chốt từ tệp, trường lượt `accept` trên dòng chạy**

Giao diện dưới đây là **cố định**: Phòng Nghiên cứu viết RUNBOOK và script phân tích E7b theo đúng tên cờ và tên trường này.

- **`createApp(overrides, { root, configFile })`:** truyền `configFile` cho `loadConfig`. Không truyền thì như cũ. Có test.
- **Cờ `--arm-config R1=<tệp>,R2=<tệp>[,R3=<tệp>]` cho `run.mjs`:**
  - mọi arm trong `--arms` phải có tệp; thiếu, trùng arm, tệp không tồn tại hay dùng cùng `--config` ⇒ lỗi rõ **trước** mọi lượt chuẩn bị hay gọi LLM;
  - mỗi arm CCoding (R1, R2) có **một app riêng**, dựng bằng `createApp(…, { root, configFile: <tệp của arm> })`, thư mục dữ liệu `<--ccoding-data>/<ARM_DIR[arm]>`;
  - R3 lấy `maxTurns` từ `phases.toolTurns.accept` của cấu hình nạp với tệp R3;
  - xen kẽ theo `latinOrders` như cũ, trong **một** tiến trình;
  - dòng `runs.jsonl` của mỗi arm ghi `extraConfigSha256` = sha256 (byte trên đĩa) của **tệp của chính arm đó**; tệp `config-*.json` của lượt ghi bảng arm → sha256.
- **Cờ `--selected <tệp>`:**
  - dùng danh sách chốt từ tệp này thay cho `<--out>/selected.json`; không chạy bước 1, không tạo hay sửa tệp nào trong `--out` ngoài `runs.jsonl`, `responses/`, `config-*.json`;
  - ghi sha256 của tệp vào `config-*.json`;
  - `--smoke` vẫn ưu tiên như cũ (một mục dự phòng).
- **Trường mới trên dòng R1/R2** (`runCto` ở `lib.mjs`), tính từ các bản ghi `calls.jsonl` của nhiệm vụ có `phase === 'accept'`:
  - `acceptCalls`: số bản ghi;
  - `acceptAuthSources`: mảng các giá trị `authSource` khác nhau, theo thứ tự gặp, bỏ giá trị rỗng;
  - `acceptTurnCapped`: `true` nếu có bản ghi nào `turnCapped === true`, không thì `false`;
  - `acceptToolCalls`: tổng `toolCalls` (thiếu tính 0);
  - `acceptTurns`: tổng `turns` nếu **mọi** bản ghi `accept` có `turns` là số, không thì `null`.
  - Dòng `infra` cũng ghi các trường này khi đọc được `calls.jsonl`.
- **Không truyền `--arm-config`, `--selected` ⇒ hành vi như cũ:** cùng thứ tự, cùng trường cũ, cùng `extraConfigSha256` theo `--config`.
- **Test** (thư mục tạm, runtime giả hoặc `mock`, không gọi `claude` thật):
  - chạy `run.mjs` thật (tiến trình con) với hai tệp trần 6 và 16 ⇒ lượt `accept` của R1 nhận `maxTurns` 6, của R2 nhận 16 (đọc ở yêu cầu runtime nhận được, không chỉ ở tệp cấu hình); `extraConfigSha256` từng dòng đúng tệp của arm; hai arm xen kẽ trong một tiến trình;
  - `--selected` ⇒ không có `selected.json` mới trong `--out`, đúng danh sách;
  - các lỗi cờ ở trên;
  - trường `accept*` trên dòng từ `calls.jsonl` giả (có `turnCapped`, `authSource`, `turns` thiếu ở một bản ghi ⇒ `acceptTurns` null).
- Cập nhật `bench/vs-claude/e7/README.md`: hai cờ mới, trường mới, ví dụ lệnh một tiến trình hai arm.

**K2 — backend-dev: `turns` của runtime `claude-cli` vào bản ghi lượt gọi**
- Runtime `claude-cli` đọc `num_turns` của sự kiện `result` (stream-json) và trả `turns` trong kết quả, cả khi chạm `--max-turns` (`error_max_turns`). Không có `num_turns` thì để trống, không tự đoán.
- Bản ghi `calls.jsonl` thêm `turns: result.turns` (thiếu thì không ghi khóa). Không đổi các khóa cũ, không đổi cách tính `turnCapped`.
- Rà mọi nơi đọc `calls.jsonl` (KPI, `bench/vs-claude/lib/`, giao diện) để chắc trường mới không làm đổi số cũ. Nêu kết quả rà trong báo cáo.
- **Test:** luồng stream-json giả có `num_turns` (kết thúc bình thường và `error_max_turns`) ⇒ `turns` đúng; không có `num_turns` ⇒ không có khóa.

**K3 — qa-tester: review**
- Kết luận theo mẫu JSON. Khối JSON đặt **cuối** câu trả lời, đúng mẫu, để hệ thống đọc được.
- **Thử sức bắt lỗi:**
  - đổi tệp của R2 sang trần 9 ⇒ test của K1 đỏ vì `maxTurns` R2 khác 16; trả lại ⇒ xanh;
  - `--arm-config` thiếu R2 khi `--arms R1,R2` ⇒ thoát khác 0 trước mọi lượt gọi.
- Xác nhận giao diện đúng **từng chữ** như K1 (tên cờ, tên trường), vì Phòng Nghiên cứu viết theo đó.
- Không truyền cờ mới ⇒ test E7 cũ vẫn xanh, không sửa kỳ vọng của test cũ.
