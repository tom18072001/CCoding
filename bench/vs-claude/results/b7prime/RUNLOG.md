# Sổ chạy `b7prime` (RUNBOOK bước 3d, arm B7′)

Phân loại dữ liệu: **Nội bộ** (bài tổng hợp, không có DLCN). Không xem điểm.

- Server 7425: worktree `../ccoding-b7p` ở `1333eef11ea499ea2ac3ca1534133ef37b9720c3` (RUNBOOK 3d mục 3; không lấy `HEAD`). `git status --short` sạch; `ccoding.local.json` giống các cửa sổ trước (chỉ `claude-cli`, chặn WebFetch/WebSearch, cổng 7425); thư mục dữ liệu mới `ccoding-b7p/data`.
- Runner: `run.mjs` của chính worktree `1333eef` (có arm `B7cab`, `B7c` trong `arms.json`), `--work /tmp/vb7p`, `--timeout 20`. Module ghi lỗi `fetch` và gửi lại một lần khi gặp socket keep-alive (giống `study-cloud` từ W3, nạp qua `NODE_OPTIONS`, không sửa runner).
- **Claude Code CLI 2.1.317** (W1–W5 dùng 2.1.316): container đã cập nhật CLI giữa hai đợt.
- RUNBOOK 3d mục 2 ("không chạy A2 × R13 và B0 × T5 trên cloud"): hai lệnh này đã chạy xong ở W5b/W5c của `study-cloud` trước khi đọc mục này.

| Lệnh | Arm | Bài | Lượt | Bắt đầu (UTC) | Kết thúc (UTC) | Ghi chú |
|---|---|---|---|---|---|---|
| B7cab-GD1 | A0-sonnet, B7cab | T5 | r1–2 (20) | 2026-11-03T08:43:41Z | 2026-11-03T09:23:32Z | xong 20/20 |

| Arm | Lượt `done` | `infra` | leak | Token có trọng số | Wall-sum | Wall dài nhất |
|---|---|---|---|---|---|---|
| A0-sonnet | 10/10 | 0 | 0 | 0,85 M | 0,20 h | 120 s |
| B7cab | 10/10 | 0 | 0 | 1,77 M | 0,44 h | 330 s |

Không gặp hạn mức hay hết credit.

## Điểm dừng GĐ1 (B-11.5)

R̂ = mũ của TB theo bài log(TB B7cab / TB A0-sonnet), `bootstrapRatio` của `docs/research/analysis/prereg-tests.mjs` ở `1333eef` (hạt 20261102, B = 4000, CI 90 %), 2 lượt mỗi ô trên t1–t5:

| Đại lượng | R̂ | CI 90 % |
|---|---|---|
| Token có trọng số | 2,04 | [1,45; 2,99] |
| Thời gian thực | 2,16 | [1,53; 3,21] |

**R̂ > 1,6 ở cả hai đại lượng ⇒ dừng vô ích, chưa phải kết luận.** Không chạy GĐ2 (`--repeats 10`). Với n = 2 mỗi ô, CI rất rộng; đây chỉ là quy tắc dừng sớm của B-11.5, không phải phép TOST của B-01.

**B7c (RUNBOOK 3d mục 6) không chạy.** Chuỗi tự động bắt đầu `B7c-GD1` lúc 09:23:33Z; người chạy dừng tay ngay (ngoài phạm vi yêu cầu của chủ dự án lần này, ưu tiên tiết kiệm credit) và hủy task server `T-20261103-092333-123` (t5-logq B7c r1) trước khi có dòng kết quả nào. Đã xóa `config-B7c-GD1.json` và trả `config.json` về bản của B7cab-GD1. Lượt bị hủy đã tốn một phần credit nhưng không có dữ liệu.
