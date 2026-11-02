# Sổ chạy study-cloud (phiên Claude Code cloud)

Theo `bench/vs-claude/RUNBOOK-cloud-session.md`, Nhánh 1 (`docs/research/run-plan.md` §5.1): nhánh chưa gộp `main`, t1–t5 chưa có `task.json`, chưa có arm làn nhanh.

- Server CCoding: worktree `origin/main`, commit `e0bd2f401905c8d1765e70b067f4f9855d4a453e`, cổng 7424, runtime duy nhất `claude-cli` (phiên đăng nhập của phiên cloud; không 9router, không API key ngoài).
- Claude Code CLI: 2.1.316. Node v22.23.4.
- Tự kiểm (oracle/null, không gọi LLM): oracle = 1,00 ở cả 9 bài R9; 4 bài `a1,l1-oncall,l2-knights,r1` lỗi ENOENT (`repo/` rỗng, đã biết) nên bị loại khỏi `--tasks` như §3.1.
- Không xem điểm giữa các cửa sổ (`preregistration.md` §4.4a); chỉ xem số lượt, trạng thái, thời gian, token.

| Lệnh | Arm | Bài | Lượt | Bắt đầu (UTC) | Kết thúc (UTC) | Ghi chú |
|---|---|---|---|---|---|---|
| W1 | A0-sonnet, B0 | R9 | r1–3 (54) | 2026-11-02T11:41:23Z | | đang chạy |
