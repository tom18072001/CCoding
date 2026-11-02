# Harness cũ: benchtest CCoding vs Claude Code thuần (`bench/vs-claude/harness`, bài t1–t5, vòng C1–C9)

> Bộ đo chính hiện nay là [`../README.md`](../README.md) (13 bài, arms A0–B5, giả thuyết H1–H10). Tài liệu này giữ cho harness cũ và số liệu C1–C9.

Đo **cùng một đề bài, cùng repo xuất phát** trên hai hệ: Claude Code chạy một mình (`claude -p`, Opus) và văn phòng CCoding
(dự án có repo, quyền `exec`, worktree), chấm bằng **test ẩn** mà cả hai hệ không thấy. Số đo: tỉ lệ test ẩn đạt, thời gian,
token (đầu vào, đầu ra, đọc/ghi cache) và chi phí quy đổi theo giá niêm yết do Claude Code báo.

## Bộ bài (`tasks/`)

| Bài | Loại | Test ẩn | Ghi chú |
|---|---|---:|---|
| `t1-duration` | module theo đặc tả dày quy tắc | 149 | `parseDuration`/`formatDuration`, ISO 8601, làm tròn, nhớ đơn vị |
| `t2-orders` | sửa 6 lỗi khách báo (triệu chứng, chưa rõ nguyên nhân) | 60 | tiền xu, phân bổ phần dư, mua X tặng Y, hạn mã UTC, giữ chỗ kho, thuế |
| `t3-api` | 4 tính năng trên API Node có sẵn | 87 | xác thực/phân quyền, lọc-tìm-sắp-phân trang, CSV RFC 4180, nhật ký |
| `t4-perf` | tối ưu hiệu năng, kết quả phải giống từng byte | 19 | 15 s → < 1 s với 200k dòng; so với bản cũ (oracle) + băm |
| `t5-logq` | công cụ nhiều module từ đặc tả | 146 | parser JSON/logfmt, ngôn ngữ truy vấn + vị trí lỗi, tổng hợp, CLI |

Mỗi bài: `starter/` (repo xuất phát, có `SPEC.md`/`ISSUES.md`/`FEATURES.md`/`PERF.md` và vài test thấy được), `prompt.txt`
(đề giao cho cả hai hệ, giống hệt nhau), `hidden/` (test ẩn), `ref/` (lời giải tham chiếu — đạt 100% test ẩn; khởi điểm đạt rất ít).
Kiểm lại bộ bài: `bash harness/validate.sh <bài>`.

## Cách chạy

> Lưu ý: `run.mjs` đọc cấu hình ngay khi nạp, kể cả với `--help`. Bản clone sạch chỉ có `config.example.json`; hãy chép thành `config.json` (điền `benchRoot`, `workRoot`) trước, nếu không sẽ báo ENOENT. Với config hợp lệ, `node harness/run.mjs --help` in danh sách lệnh (`run | regrade | cost`) và thoát 0.

```bash
# server CCoding (runtime claude-cli), vd. cổng 7420; config: harness/config.example.json (benchRoot, workRoot, ccodingUrl, variants)
node harness/run.mjs run --config config.json --run R1 --tasks t1-duration,t2-orders --systems claude --repeats 2 --concurrency 1
node harness/run.mjs run --config config.json --run R1 --tasks t1-duration,t2-orders --systems ccoding --repeats 2 --concurrency 1
python3 harness/report.py R1
```

- Mỗi lượt: chép `starter/` vào thư mục tạm ngoài repo, `git init`; Claude Code chạy `claude -p --model opus --permission-mode acceptEdits
  --allowedTools Bash,Read,Edit,Write,Grep,Glob,TodoWrite,Task,Agent --strict-mcp-config --setting-sources project,local`
  (cùng cách ly cấu hình người dùng như runtime claude-cli của CCoding); CCoding nhận dự án mới (mỗi lượt một dự án → không có
  lịch sử dự án), `checkCommands: ["npm test"]`, `budgetMode: complete`.
- Chấm: chép kết quả (worktree của CCoding / thư mục của Claude Code) sang thư mục chấm, thêm `test-hidden/`, chạy `node --test`.
- **Chạy mỗi hệ tuần tự** (`--concurrency 1` cho mỗi hệ): hai nhiệm vụ CCoding cùng lúc trên một server tranh agent (một agent làm
  một việc một lúc) — số đo thời gian bị nhiễu (đo 2/11: lập kế hoạch chờ nhau 34 giây).
- Bỏ `CLAUDE_EFFORT` của môi trường cho cả hai hệ (`dropEnv`); trên Windows `scrubKeys` để Claude Code dùng phiên đăng nhập.
- `audit` trong `result.json`: lệnh/tệp agent đụng tới có dấu hiệu tìm test ẩn (chưa lượt nào có).

## Kết quả

- `results/REPORT.md` — bảng tổng hợp theo vòng (C1…C6) và từng lượt; `results/summary.json` — cùng số liệu dạng JSON.
- `results/runs.csv` — mỗi lượt: thời gian, chi phí quy đổi, test ẩn, token vào/ra/đọc cache/ghi cache, mã nhiệm vụ CCoding.
- `results/phases.csv` — CCoding: nhiệm vụ × pha × agent × mô hình (lượt gọi, giây, token, chi phí).
- `results/calls.csv` — CCoding: từng lượt gọi agent (token, thời gian, kích thước system/context/prompt theo ký tự, tổng ký tự
  đầu ra công cụ, số lần thử lại).
- `results/claude_turns.csv` — Claude Code: từng lượt mô hình trong phiên (token, ghi cache TTL 1 giờ / 5 phút, công cụ gọi);
  `output_partial` là số lúc bắt đầu luồng, tổng đầu ra xem `runs.csv`. Transcript thô không commit.
- `results/C*/<bài>.<hệ>.<lượt>/` — `result.json` (kết quả lượt + chấm), `grade-hidden.tap`, `grade-visible.tap`.

Sinh lại: `python3 harness/export.py results C1 C2 C3 C4 C5 C6 --ledger <data/ của server CCoding> [--ledger …]`.
Phân tích và các thay đổi rút ra: `docs/PROCESS-REVIEW.md` mục 13.

## `stats.mjs` — khoảng tin cậy và kiểm định

`harness/stats.mjs` (Node ≥ 22, không phụ thuộc gói ngoài) đọc `results/runs.csv` (đã có C1–C7; không còn đọc `c6-extract/`; dòng trùng vòng/bài/hệ/lượt được bỏ) rồi tính, theo từng bài và gộp (phân tầng theo bài): chênh lệch TB và tỉ lệ CC/Claude của thời gian và chi phí kèm CI bootstrap percentile 95% (10 000 lần, seed mặc định 20261102, được in ra đầu ra), kiểm định hoán vị hai phía (chính xác khi ≤ 200 000 tổ hợp, nếu không thì Monte Carlo 10 000 lần) và Cliff's delta. "CC" = mọi hệ `ccoding*`.

```bash
node bench/vs-claude/harness/stats.mjs --rounds C6
node bench/vs-claude/harness/stats.mjs --rounds C5,C6 --exclude-run T-20261102-105231-9e5   # bỏ lượt C5 t3 treo stdin 579 s
node bench/vs-claude/harness/stats.mjs --rounds C5,C6 --tasks t3-api,t5-logq --format json
node bench/vs-claude/harness/stats.mjs --required-runs --sim --alpha 0.05 --power 0.8      # số lượt cần mỗi ô
node bench/vs-claude/harness/stats.mjs --rounds C7 --baseline claude-sonnet               # làn nhanh so với Claude Code Sonnet (cùng thời điểm)
node bench/vs-claude/harness/stats.mjs --rounds C7 --baseline claude-sonnet --required-runs --delta wall=30,cost=0.1   # n cần để phát hiện Δ cho trước
node --test bench/vs-claude/harness/stats.test.mjs
```

Tùy chọn: `--runs a.csv,b.csv`, `--rounds`, `--tasks`, `--exclude-run <task_id|vòng/bài/hệ/lượt>`, `--baseline <hệ>` (mặc định `claude` = Opus; `claude-sonnet` cho C7), `--delta wall=<giây>,cost=<USD>` (chênh lệch cần phát hiện, dùng với `--required-runs`), `--seed`, `--resamples`, `--format md|json`. Với 2 lượt mỗi ô, p hoán vị nhỏ nhất chỉ là 1/3 (một bài) hoặc 2/36 (hai bài), nên chỉ dùng như minh họa. Kết quả mẫu và đối chiếu: `docs/research/dev-review/stats-report.md`.
