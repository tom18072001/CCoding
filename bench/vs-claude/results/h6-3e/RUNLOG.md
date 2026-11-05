# Sổ chạy E6: H6 cho đủ N (đợt 3e, V4-3e-E6)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Người điều phối chỉ ghi số liệu chạy, **không xem điểm**. Log `logs-3e\E6*.log` có cột điểm nên giữ trên máy giám đốc.

| Mục | Giá trị |
|---|---|
| Server 7425 | worktree `ccoding-3e` tại `6c454f67518244af6724ca68037613f99e34ab46`. Mọi dòng ghi đúng commit này |
| Nguồn p của H6 | Ghi trước lượt đầu ở `local-3e/RUNLOG.md`, mục "Nguồn p của H6": p của SR-26 |
| Lệnh (`run3e-b.ps1`) | 7 bài `l1-modules, l2-chain, t1-duration, t2-orders, t3-api, t4-perf, t5-logq`, `--out results\h6-3e`. E6a: `--arms A1 --repeats 3 --timeout 20`. E6b: `--arms A2 --repeats 2 --timeout 40`. E6c: `--arms B0 --repeats 3 --timeout 40` |
| Thời gian (giờ VN) | E6a 4/11 19:53 → 21:04. E6b 21:04 → 5/11 00:15; chạm hạn mức 21:08–22:08, thoát mã 3 ba lần. E6c 00:15 → 02:05 |
| Claude Code CLI | **2.1.318** ở mọi dòng. Bản đã tự cập nhật từ lúc bắt đầu E4b (`gates-main/RUNLOG.md`) |
| `runs.jsonl` | sha256 `e23a98de981d74dd092d1391b8a93de86b6a03ba5bdd04179211fe9b990e5d5f`, 59 dòng |

## Kết quả chạy (không có điểm)

| Arm | Khóa `done` | Dòng không `done` | Rò rỉ | Token có trọng số | USD (`pricing.mjs`) | Thời gian thực |
|---|---|---|---|---|---|---|
| A1 | 21/21 | 0 | 0 | 5,81 M | 11,87 | 1,17 giờ |
| A2 | 14/14 | 3 hạn mức, cùng khóa `l2-chain__A2__r1`, chạy lại xong | 0 | 9,62 M | 19,83 | 2,17 giờ |
| B0 | **20/21** | 1 lỗi hạ tầng `t2-orders__B0__r3` (`infra: error`), **chưa chạy lại** | 0 | 8,97 M | 19,73 | 1,81 giờ |

- **Tổng:** 55/56 khóa xong. Thời gian máy 5,15 giờ, khoảng 51 USD.
- **Thiếu 1 khóa:** `t2-orders__B0__r3`. Theo §4.1, lượt lỗi hạ tầng được thay. Chạy lại bằng cùng lệnh E6c thì runner bỏ qua khóa đã xong, chỉ chạy đúng khóa này, khoảng 5 phút. Việc chạy lại chờ giám đốc cho phép dùng hạn mức.
- Phòng Nghiên cứu phân tích H6 theo §9 V4-3e-E6, kèm phân tích độ nhạy sàn null (t2, t4) đã đặt trước.
