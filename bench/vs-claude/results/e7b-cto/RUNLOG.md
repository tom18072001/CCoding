# E7b: sổ chạy

Thiết kế: `docs/research/preregistration.md` §9 (khối "Đăng ký trước E7b", phụ lục (1), phụ lục (2), bảng QH1–QH36). Sổ tay: `RUNBOOK.md` cùng thư mục. Phân loại dữ liệu: **Nội bộ**. Người chạy: người điều phối, theo ủy quyền của chủ dự án (14/11/2026 16:44). Sổ này ghi trước khi xem bất kỳ kết luận nào; người chạy chỉ đếm dòng và đọc trường hạ tầng.

## Bản ghim (ghi trước lượt gọi đầu tiên)

- **Commit:** `5911bf0ce179ff1627fd37d0db1a27a5ba2ed49e` của `perf/vs-claude-loop` (có D24, D25, D26, BRIEF-26/26b/26c/26d). Worktree riêng trên máy chạy (đường dẫn không công bố), `npm ci` và `npm run build` xong.
- **CLI:** `2.1.318 (Claude Code)`, `DISABLE_AUTOUPDATER=1`.
- **Môi trường:** tiến trình chạy bỏ `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CCODING_CONFIG` trước khi khởi động; chỉ phiên đăng nhập claude.ai.
- **Tệp cấu hình:** ghi lại đúng byte của blob git (LF) trước khi chạy, vì bản checkout Windows (`core.autocrlf=true`) có thể ra CRLF và làm lệch `SHA256SUMS` (QH6). sha256: `config-R1b.json` `91cc507d2c87…`, `config-R2b.json` `3f62d742c651…`, khớp `SHA256SUMS`.
- **Danh sách chốt:** `selected.json` của E7, git blob `5b3e8fcf2ba3816b39fdb5ba9ef021232a4b2f5f` (QH1).
- **sha256 (12 ký tự đầu, byte trên đĩa của máy chạy):** `selected.json` `00a29bcc71f0`, `items.json` `3f775aba84d8`, `bench/vs-claude/e7/run.mjs` `66b37938ec23`, `bench/vs-claude/e7/lib.mjs` `272ce5f1e204`, `docs/research/analysis/e7b-analyze.mjs` `65261d803d2a`, `ccoding.local.json` `0ee7b0a6b4ac` (chép từ bản 3e, giống E7). Các tệp văn bản trên máy chạy có thể là CRLF, nên sha256 này khác sha256 tính trên LF.
- **`dist` gộp:** `ff5bff640a40a5b3…` (sha256 của chuỗi các sha256 từng tệp trong `dist/`, xếp theo đường dẫn đầy đủ, nối bằng xuống dòng).
- **Kịch bản chạy:** `ops/e7b-run.ps1` và `ops/e7b-count.mjs` trên máy chạy (ngoài repo).
  - Kiểm trước khi chạy: CLI, D24 (`--arm-config` có trong `run.mjs`), `SHA256SUMS`, blob `selected.json`, có `ccoding.local.json`.
  - Chạy thử, rồi chạy chính một tiến trình.
  - Hết hạn mức (thoát mã 3): chờ đến giờ mở lại ghi trong dòng `rate-limit` (`resetsAt`) cộng 5 phút; không đọc được thì chờ 60 phút.
  - Cặp đã có 3 dòng `infra` không chạy lại (QH7), qua `--only`.
  - Dừng ngay khi: `acceptAuthSources` khác `["none"]` (QH11), 3 dòng 403 liên tiếp (QH31), hoặc 5 lần không tiến triển.
  - `e7b-count.mjs` chỉ đọc `id`, `arm`, `status`, `error` (để nhận 403) và `acceptAuthSources`.

## Chạy thử (QH34), 15/11/2026 06:58–06:59 UTC

- Mục dự phòng `067cd64cc5`, `--arms R1,R2` trong một tiến trình, ghi ra thư mục ngoài `e7b-cto/`. Hai dòng `done`, 0 `infra`.
- `e7b-analyze.mjs --smoke`: mọi kiểm hạ tầng **OK**:
  - `extraConfigSha256` từng arm khớp `SHA256SUMS`;
  - `maxTurns` 6 (R1) và 16 (R2);
  - `acceptCalls` 1;
  - `acceptAuthSources` `["none"]`;
  - `acceptTurnCapped` là boolean;
  - `models`: `claude-sonnet-5-5` (R1), `claude-opus-5-5` (R2);
  - `promptSha` hai arm giống nhau (`bab05640`), `ccodingCommit` giống nhau.
- Không có dấu hiệu 403. Người chạy không đọc `verdict` của lượt thử.

## Chạy chính (QH3)

- Bắt đầu 15/11/2026 06:59 UTC, một tiến trình, `--arms R1,R2 --arm-config … --selected …`, 128 mục × 2 arm = 256 cặp.
- **Đếm theo thời điểm** (chỉ `e7b-count.mjs`): 07:12 14/256; 08:04 90/256; 09:06 177/256; 10:03 251/256. Mọi lần đếm: 0 dòng `infra`, 0 `authSource` lạ, 0 dòng 403.
- **Kết thúc 10:07:38 UTC** (dòng cuối `runs.jsonl` lúc 10:07:38, dòng đầu 06:59:40). **Một lần gọi `run.mjs`, thoát 0.** Không chạm hạn mức, không có lần dừng hay chạy lại nào, không dùng `--only`.
- **Kết quả đếm:** 256/256 cặp `done` (128 R1, 128 R2), 0 dòng `infra`, 0 cặp thiếu, 0 mục loại ở bước chuẩn bị.
- **Trường hạ tầng trên mọi dòng** (người chạy đọc sau khi đủ, trước khi giao phân tích):
  - `models`: `claude-sonnet-5-5` (R1), `claude-opus-5-5` (R2);
  - `maxTurns` 6 (R1), 16 (R2);
  - `acceptCalls` = 1;
  - `acceptAuthSources` = `["none"]`.
- **Lưu vào repo:**
  - `run/`: `runs.jsonl`, `responses/` (256 tệp), `config-2026-11-15T06-59-07-851Z.json`. Runner đã thay đường dẫn máy bằng `<ccoding>`, `<work>`, `<home>`; lint `machine-path` xanh.
  - `calls-accept/w1|w2/runs/<taskId>/calls.jsonl`: bản rút gọn của `calls.jsonl` trên máy chạy, chỉ lượt `accept` (256 bản ghi), để đối chiếu `--data` (nguồn phụ, Phụ lục (2) (b)). Chỉ có các trường `taskId`, `phase`, `model`, `authSource`, `turnCapped`, `turns`, `toolCalls`, `errorKind`, `stopReason`; không có prompt, văn bản hay đường dẫn. Thư mục dữ liệu app đầy đủ (chưa che PII) giữ trên máy chạy, không commit.
- Người chạy chưa đọc `verdict`, nội dung `responses/` hay số đo nào. Với `responses/`, người chạy chỉ quét chuỗi đường dẫn máy. Phân tích giao Phòng Nghiên cứu (BRIEF-27).
