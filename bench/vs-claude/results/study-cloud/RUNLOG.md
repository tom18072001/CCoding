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
