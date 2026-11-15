# Thử thật `recoverOrphans` trên server (D30/K3, 16/11/2026)

**Mục tiêu:** xác nhận trên server thật (không chỉ test) rằng nhiệm vụ `running` của phiên trước thành `paused`/`interrupted` khi server khởi động, có sự kiện `task.orphaned`, và `resume` chuyển được trạng thái.
**Dữ liệu:** giả, nhãn Nội bộ, không PII; thư mục `.scratch/k3-data/` (không phải `data/`). Nhiệm vụ `T-fake-orphan-1`.
**Runtime:** `mock` (`src/runtimes/mock.ts`), ép bằng `--runtime mock` và `CCODING_RUNTIME=mock`. Nhật ký xác nhận mọi lượt gọi là `[mock/…]` (10 bản ghi `"runtime":"mock"`, không có lượt `claude -p` nào). Server vẫn thăm dò `claude-cli`/`codex-cli` lúc khởi động (kiểm tồn tại, không gọi mô hình).
**Cổng:** 7499 (`CCODING_PORT`). Không chạm cổng 7430.
**Dừng tiến trình:** chỉ `taskkill /PID <pid> /T /F` theo PID ghi ở `.scratch/k3/server-N.pid`; không diệt theo tên.

## Lệnh

Script điều khiển: `.scratch/k3/trial.mjs` (vòng 1) và `.scratch/k3/trial2.mjs` (vòng 2). Mỗi server chạy bằng
`node --import tsx src/cli.ts serve --port 7499 --runtime mock` với `CCODING_DATA_DIR=.scratch/k3-data`, PID lấy từ `child.pid` rồi ghi vào `.scratch/k3/server-N.pid` trước khi dừng.

## Vòng 1 — nhiệm vụ giả `running`, `serverBootId` cũ (`boot-cu-da-chet`)

| Bước | Trạng thái |
|---|---|
| Trước (ghi tay vào `task.json`) | `running`, `serverBootId=boot-cu-da-chet` |
| Server 1 (PID 33432) khởi động | API và tệp đĩa: `paused`, `pause.reason=interrupted` |
| `POST /api/tasks/T-fake-orphan-1/resume` | HTTP 200, `running` (lượt gọi `[mock/haiku]` định tuyến, `[mock/opus]` lập kế hoạch) |
| Sau 3 giây | `paused`, `pause.reason=budget` (kế hoạch mock ước tính ~1,15M token, vượt ngân sách 100k) — chuyển trạng thái đúng thiết kế, không phải lỗi |
| Dừng | `taskkill /PID 33432 /T /F` |

## Vòng 2 — dừng server khi nhiệm vụ đang chạy thật, rồi khởi động lại

| Bước | Trạng thái |
|---|---|
| Server 2 (PID 53524) khởi động; `resume` với `budgetTokens=5000000`, `budgetMode=complete` | HTTP 200 |
| Ngay trước khi dừng | API và đĩa: `running`, `serverBootId=9d08e38f-e385-4090-b605-29ec0476b11c` (mã phiên thật của server 2) |
| Dừng | `taskkill /PID 53524 /T /F`; tệp đĩa vẫn `running` (không ai kịp ghi) |
| Server 3 (PID 44728) khởi động | API và đĩa: `paused`, `pause.reason=interrupted` |
| Dừng | `taskkill /PID 44728 /T /F` |

Đầu ra server 3 (`.scratch/k3/server-3.log`): `⚠ 1 nhiệm vụ bị gián đoạn khi server dừng → đã chuyển "tạm dừng", bấm Tiếp tục để chạy lại`.

## Trích nhật ký (`.scratch/k3-data/runs/T-fake-orphan-1/events.jsonl`, cắt gọn)

```
19:37:01.927Z warn task.orphaned  "Nhiệm vụ T-fake-orphan-1 mồ côi sau khi server dừng (running → paused), 0 hạng mục về pending"  data.from=running
19:37:02.216Z info task.resumed   "Tiếp tục T-fake-orphan-1 từ checkpoint (trước đó: interrupted) — ngân sách 100.0k · dừng khi chạm trần"
19:37:02.228Z info call.start     "Điều phối viên · Định tuyến nhiệm vụ [mock/haiku]"
19:37:23.169Z info task.resumed   "… (trước đó: budget) — ngân sách 5.00M · chạy tới khi hoàn thành"
19:37:23.265Z info call.start     "Technical Writer · Đang làm S1 [mock/sonnet]"
19:37:25.090Z warn task.orphaned  "Nhiệm vụ T-fake-orphan-1 mồ côi sau khi server dừng (running → paused), 0 hạng mục về pending"  data.from=running
```

Cùng sự kiện `task.orphaned` cũng có trong `logs/system.jsonl` của thư mục dữ liệu, với chuỗi băm `prev`/`hash` liền mạch.

## Dọn dẹp

PID đã ghi: 33432, 53524, 44728. Sau thử: `tasklist /FI "PID eq <pid>"` không còn tiến trình nào; không còn tiến trình nghe cổng 7499 (`netstat -ano`: 0 dòng LISTENING).

## Giới hạn

- Hạng mục chỉ có `runs: []` ban đầu, nên `returned=0` (không thử đường hạng mục `running` → `pending` trên server thật; đường đó có test đơn vị).
- Mock chỉ chứng minh chuyển trạng thái và luồng điều phối, không chứng minh chất lượng nội dung hay hành vi của `claude -p`.
- Một máy (Windows 11, Node v24.14.0), một nhiệm vụ.
