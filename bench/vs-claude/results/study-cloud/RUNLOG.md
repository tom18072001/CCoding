# Sổ chạy study-cloud (phiên Claude Code cloud)

Theo `bench/vs-claude/RUNBOOK-cloud-session.md`, Nhánh 1 (`docs/research/run-plan.md` §5.1): nhánh chưa gộp `main`, t1–t5 chưa có `task.json`, chưa có arm làn nhanh.

- Server CCoding: worktree `origin/main`, commit `e0bd2f401905c8d1765e70b067f4f9855d4a453e`, cổng 7424, runtime duy nhất `claude-cli` (phiên đăng nhập của phiên cloud; không 9router, không API key ngoài).
- Claude Code CLI: 2.1.316. Node v22.23.4.
- Tự kiểm (oracle/null, không gọi LLM): oracle = 1,00 ở cả 9 bài R9; 4 bài `a1,l1-oncall,l2-knights,r1` lỗi ENOENT (`repo/` rỗng, đã biết) nên bị loại khỏi `--tasks` như §3.1.
- Không xem điểm giữa các cửa sổ (`preregistration.md` §4.4a); chỉ xem số lượt, trạng thái, thời gian, token.

| Lệnh | Arm | Bài | Lượt | Bắt đầu (UTC) | Kết thúc (UTC) | Ghi chú |
|---|---|---|---|---|---|---|
| W1 | A0-sonnet, B0 | R9 | r1–3 (54) | 2026-11-02T11:41:23Z | 2026-11-02T13:15:35Z | xong 54/54 |
| W2a | A0-sonnet, B0 (server main 7424, chặn web) | N4 = a1, l1-oncall, l2-knights, r1 `--judge` | r1–3 (24) | 2026-11-02T13:35:19Z | 2026-11-02T15:05Z | xong 24/24 |
| W2b | A0-sonnet, B6 (server nhánh 7425, chặn web) | T5 = t1-duration, t2-orders, t3-api, t4-perf, t5-logq | r1–3 (30) | 2026-11-02T15:06:56Z | 2026-11-02T16:19:44Z | xong 30/30 |
| W2c | A0-sonnet, B0 (server main 7424, chặn web) | s1-sec-review | r4–10 (14) | 2026-11-02T16:21:21Z | 2026-11-02T16:40:11Z | xong 14/14 |
| B7a | A0-sonnet, B7 (server nhánh 7425, chặn web) | T5 | B7 r1–9, A0-sonnet r4–9 (75) | 2026-11-02T16:41:22Z | 2026-11-02T19:12:11Z | xong 75/75 |
| B7b | A0-sonnet, B7 (server nhánh 7425, chặn web) | `all` = 18 bài có `task.json` | r1–3, mới 39 lượt B7 | 2026-11-02T19:13:32Z | 2026-11-02T20:21:00Z | xong 39/39 |
| B6b | A0-sonnet, B6 (server nhánh 7425, chặn web) | T5 | B6 r4–9 (30) | 2026-11-02T20:22:20Z | 2026-11-02T22:27:23Z | xong 30/30 |
| neo-A0 | A0-sonnet (runner trỏ server nhánh 7425; arm A không dùng server) | T5 | r10–11 (10) | 2026-11-02T22:28:16Z | 2026-11-02T22:38:45Z | xong 10/10 |
| W3a | A0-sonnet, B5 (server main 7424, chặn web) | R13 `--judge` | B5 r1–3 (39) | 2026-11-02T23:52:15Z | 2026-11-03T01:18:22Z | xong 39/39 (3 lượt hạ tầng đã chạy lại) |
| W3b | A0-sonnet, B6 (server nhánh 7425, chặn web) | R13 `--judge` | B6 r1–3 (39) | 2026-11-03T00:35:25Z | 2026-11-03T02:11:29Z | 36/39; 3 khóa chờ bù |
| neo-W3 | B0 (server main 7424), `--out study-cloud-anchor-W3` | l4-startup-order | r1–2 (2) | 2026-11-03T02:11:30Z | 2026-11-03T02:16:37Z | xong 2/2 |

## Bảng cửa sổ (`run-plan.md` §3.0)

| CS | Hash CCoding (server) | `git status --short` (server) | Bắt đầu (UTC) | Kết thúc (UTC) | Arm | Lượt lỗi hạ tầng / bị loại | Anchor B0 |
|---|---|---|---|---|---|---|---|
| W1 | `e0bd2f401905c8d1765e70b067f4f9855d4a453e` (origin/main) | sạch (chỉ có `ccoding.local.json`, đã gitignore) | 2026-11-02T11:41:23Z | 2026-11-02T13:15:35Z | A0-sonnet, B0 | 0 / 0 | không cần |

## W1: số liệu vận hành (không xem điểm)

| Arm | Lượt | done | khác done | leak | Token có trọng số | Wall-sum |
|---|---|---|---|---|---|---|
| A0-sonnet | 27 | 27 | 0 | 0 | 1,06 M | 0,16 h |
| B0 | 27 | 27 | 0 | 0 | 5,85 M | 1,41 h |

Tổng 6,91 M token có trọng số, 1,57 h wall-sum (mô hình §1.3 dự kiến 17,8 M và 3,6 h cho W1).
Không lượt nào gặp hạn mức; không cần quarantine (§5.0).

**Công cụ web ở arm B.** Rà soát cho thấy runtime claude-cli của CCoding cấp WebSearch/WebFetch cho 7 agent, trong khi arm A cấm.
Đã kiểm `calls.jsonl` của cả 27 lượt B0 ở W1: không có lượt gọi web nào (chỉ `run_command`, `read_file`, `write_file`, `edit_file`, `search`, `git_read`, `list_files`).
Từ W2, server chặn web qua `extraArgs: ["--disallowedTools", "WebFetch,WebSearch"]` trong `ccoding.local.json`.

**Đổi server sau W1.** Nhánh đã gộp `main` trong lúc W1 chạy; theo yêu cầu chủ dự án, W1 chạy xong trên server `origin/main`, các cửa sổ sau dùng server dựng từ `perf/vs-claude-loop` và ghi vào `--out` mới (`run-plan.md` §6.4).

## W2 (Nhánh 2, `run-plan.md` §5.2; RUNBOOK bước 3b: hai server)

- Server 7424: `origin/main` `e0bd2f401905c8d1765e70b067f4f9855d4a453e`, cho A0-sonnet/B0/B5. Server 7425: worktree nhánh `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c` (có B-01/B-02/B-10 và bản sửa bộ đo `7fb18ba`), cho B6/B7. Cả hai: `git status --short` sạch; `ccoding.local.json` chặn web bằng `extraArgs: ["--disallowedTools", "WebFetch,WebSearch"]` (đã kiểm: phiên claude với cờ này chỉ còn `Read` trong danh sách công cụ).
- Runner dùng `run.mjs` của nhánh từ commit `7fb18ba`: dò hạn mức chỉ trên trường lỗi của `calls.jsonl`; chấm code với `--test-force-exit`, hạn mỗi tệp test 600 s; arm B chưa tạo được task thì ghi `infra`. W1 chạy bằng runner cũ (không có các sửa này; R9 không có bài nào bị ảnh hưởng: t4/t5 không thuộc R9, mọi lượt W1 `done`).
- `config.json` bị ghi đè mỗi lệnh; bản của từng lệnh lưu ở `config-<nhãn>.json` (W1 lấy lại từ commit `d0375f9`).

**W2a** (A0-sonnet + B0 × N4 × r1–3 `--judge`, server 7424): 24/24 `done`, 0 lỗi hạ tầng, 0 leak.

| Arm | Lượt | Token có trọng số | Wall-sum |
|---|---|---|---|
| A0-sonnet | 12 | 0,71 M | 0,22 h |
| B0 | 12 | 5,08 M | 1,25 h |

Công cụ trong `calls.jsonl` của 12 lượt B0: `run_command`, `edit_file`, `search`, `write_file`, `read_file`, `list_files`; không có web.

**W2b** (A0-sonnet + B6 × T5 × r1–3, server 7425): 30/30 `done`, 0 lỗi hạ tầng, 0 leak.

| Arm | Lượt | Token có trọng số | Wall-sum | Wall dài nhất |
|---|---|---|---|---|
| A0-sonnet | 15 | 1,28 M | 0,27 h | 119 s |
| B6 | 15 | 4,67 M | 0,93 h | 320 s |

B6 chạy đúng làn nhanh: các pha trong `calls.jsonl` chỉ có route → plan → execute → accept (không có review/synthesize).
`calls.jsonl` của 15 lượt B6 trên server 7425 không có WebFetch/WebSearch. Bài t5-logq (log có `status=429`) không còn bị nhận nhầm là hạn mức.

**W2c** (A0-sonnet + B0 × s1 × r4–10, server 7424; bổ sung s1 lên N = 10): 14/14 `done`, 0 lỗi hạ tầng, 0 leak.

| Arm | Lượt | Token có trọng số | Wall-sum | Wall dài nhất |
|---|---|---|---|---|
| A0-sonnet | 7 | 0,13 M | 0,02 h | 14 s |
| B0 | 7 | 1,29 M | 0,29 h | 200 s |

`calls.jsonl` của 7 lượt B0 không có WebFetch/WebSearch.

## Bước 3b: arm làn đơn B7 (SL), server 7425 `7fb18bab45c39e1cbba16bf9d4abec45cf2a379c`

**B7a** (A0-sonnet + B7 × T5 × r1–9; A0-sonnet đã có r1–3 từ W2b): 75/75 `done`, 0 lỗi hạ tầng, 0 leak, không gặp hạn mức.

| Arm | Lượt mới | Token có trọng số | Wall-sum | Wall dài nhất |
|---|---|---|---|---|
| A0-sonnet | 30 | 2,54 M | 0,53 h | 124 s |
| B7 | 45 | 9,36 M | 1,97 h | 380 s |

Chuỗi pha trong `calls.jsonl` của 45 lượt B7: 31 lượt chỉ `execute:senior-swe → accept:cto`; 14 lượt sau lượt execute đầu thì nâng lên `plan:dev-lead` rồi execute thêm (6 lượt thêm 1 agent, 5 lượt thêm 2, 3 lượt thêm 3) trước accept. Không có lượt gọi WebFetch/WebSearch.
Trình theo dõi (watcher/tự commit) bị dừng ở giới hạn 2 giờ của tác vụ nền lúc 18:41Z và được khởi động lại; `run.mjs` không bị gián đoạn.
Ghi chú tuân thủ: khi xem đuôi log vận hành lúc 18:41Z, người chạy thấy điểm của 2 lượt t1-duration r8 (dòng log có in `score`); các lần xem sau đã lọc bỏ cột điểm.

**B7b** (A0-sonnet + B7 × `--tasks all` × r1–3): `all` gồm 18 bài; `l1-modules` và `l2-chain` chưa có `task.json` nên runner không xếp (hàng đợi 108 = 18 × 2 × 3). A0-sonnet đã đủ khóa, B7 trên T5 đã có từ B7a, nên lệnh chỉ chạy 39 lượt B7 trên 13 bài còn lại: 39/39 `done`, 0 lỗi hạ tầng, 0 leak, không gặp hạn mức. Token có trọng số 4,20 M, wall-sum 1,12 h, lượt dài nhất 430 s.

## Bước 3 (RUNBOOK 3b.3): làn nhanh B6 lên 9 lượt, để so mô tả

**B6b** (A0-sonnet + B6 × T5 × r1–9; A0-sonnet đã đủ r1–9, B6 đã có r1–3 từ W2b): chỉ chạy 30 lượt B6 r4–9: 30/30 `done`, 0 lỗi hạ tầng, 0 leak, không gặp hạn mức, không gọi WebFetch/WebSearch. Token có trọng số 9,60 M, wall-sum 2,07 h, lượt dài nhất 420 s.
Trình theo dõi lại bị dừng ở giới hạn 2 giờ lúc 22:22Z và được khởi động lại; `run.mjs` không bị gián đoạn.

**Neo A0-sonnet** (RUNBOOK 3b.2, tùy chọn: `--arms A0-sonnet --tasks T5 --repeats 11`): 10/10 `done`, 0 lỗi hạ tầng, 0 leak. Token có trọng số 0,83 M, wall-sum 0,17 h, lượt dài nhất 113 s.

## Trạng thái sau RUNBOOK bước 3b

Tổng 276 lượt trong `runs.jsonl`: A0-sonnet 101, B0 46, B6 45, B7 84; không lượt nào lỗi hạ tầng hay gặp hạn mức; chưa chạy `analyze.mjs`/`pairwise.mjs` và chưa xem điểm tổng hợp (RUNBOOK bước 4, `preregistration.md` §4).

## W3 (`run-plan.md` §5.2: `--arms A0-sonnet,B5,FL --tasks $R13 --repeats 3 --judge`)

Theo RUNBOOK bước 3b (hai server), lệnh tách đôi: `--arms A0-sonnet,B5` trên server main 7424 (W3a) và `--arms A0-sonnet,B6` trên server nhánh 7425 (W3b), chạy tuần tự. A0-sonnet đã đủ r1–3 trên R13 nên không có lượt A0 mới. Thứ tự xen kẽ vì vậy khác lệnh gộp ba arm của `run-plan.md` (lịch phụ thuộc thứ tự `--arms`). Hai lệnh dùng cùng `--out study-cloud`. Hash server không đổi: 7424 `e0bd2f4…`, 7425 `7fb18ba…`; `git status --short` sạch.

**Container khởi động lại ba lần** (khoảng 23:49Z, 00:24Z, 01:13Z): mỗi lần hai server và `run.mjs` tắt; lượt đang chạy dở không có dòng kết quả và được chạy lại khi chạy tiếp đúng lệnh. Lần đầu (23:50Z) chuỗi khởi chạy trước khi bật lại server nên các lệnh thoát ngay, không ghi lượt nào; 4 commit tạm chỉ chứa `config` đã gỡ ở `838a5f1`.

| Arm | Khóa `done` | Dòng `infra` | Token có trọng số | Wall-sum | Wall dài nhất | leak |
|---|---|---|---|---|---|---|
| B5 (W3a) | 39/39 | 3 | 2,82 M | 0,74 h | 310 s | 0 |
| B6 (W3b) | 36/39 | 5 | 5,90 M | 1,46 h | 671 s | 0 |

**Lỗi hạ tầng (8 dòng `infra`, 0 lượt gọi LLM).** Mỗi dòng hỏng sau 1–6 ms ngay khi tạo project. Đã ghi lỗi gốc bằng một module nạp qua `NODE_OPTIONS=--import` (chỉ bọc `fetch`, không sửa `run.mjs`): `POST /api/projects` → `UND_ERR_SOCKET other side closed`, tức runner gửi trên socket keep-alive mà server vừa đóng. Từ lệnh `anchor-W3` trở đi, module này gửi lại **một lần** khi gặp đúng lỗi đó, chỉ với GET và `POST /api/projects` (upsert theo id); `POST /api/tasks` không bao giờ gửi lại. Dòng `infra` giữ nguyên trong `runs.jsonl` làm bằng chứng; `analyze.mjs` và `prereg-tests.mjs` bỏ qua `status: infra`. Khóa hỏng được chạy lại với cùng `rN` (cơ chế của `run.mjs` từ `7fb18ba`); khác quy tắc "rep mới" của `run-plan.md` §5.0, nhưng lượt hỏng không có kết quả nào để chọn lọc.
Khóa B6 còn thiếu (`re1-lit-synthesis` r2, `l2-knights` r3, `r1-elk-design` r3) sẽ bù bằng cách chạy lại đúng lệnh W3b sau chuỗi.

**Neo B0 W3** (`results/study-cloud-anchor-W3`): 2/2 `done`; TB 154 945 token, 145 s; so với B0 × `l4` W1 (r1–3: 162 074 token, 143 s): token ×0,96, thời gian ×1,01. Không có dấu hiệu "cửa sổ trôi" (ngưỡng ±30 %).
