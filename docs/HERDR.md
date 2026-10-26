# Chạy nền với herdr

[herdr](https://herdr.dev) là *agent multiplexer* trong terminal (giống tmux nhưng hiểu trạng thái agent: blocked / working / done / idle). Tách phiên (`ctrl+b q`) thì mọi pane vẫn chạy; gõ lại `herdr --session ccoding` để vào.

## Cài đặt

```powershell
# Windows (bản native, dùng ConPTY)
powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"
# macOS / Linux
curl -fsSL https://herdr.dev/install.sh | sh
```

Kiểm tra: `herdr --version` và `node dist/cli.js doctor`.

## Dựng văn phòng

```powershell
node dist/cli.js herdr up
```

Lệnh này (idempotent — chạy lại chỉ bổ sung phần thiếu):

1. Khởi động herdr server phiên **`ccoding`** (chạy nền, không cần cửa sổ).
2. Tạo workspace **CCoding Office**:
   - tab **Văn phòng**: pane `server` (`ccoding serve`), pane `logs` (`ccoding logs -f`), pane `tokens` (`ccoding usage --watch`);
   - tab **Phát triển** và **Nghiên cứu**: pane log của phòng (`ccoding logs -f --dept …`).
3. Server chạy trong herdr ⇒ runner tự là `herdr`: lần đầu agent nhận việc, một pane mang tên agent (ví dụ `Hùng · data-engineer`) được tạo trong tab phòng của họ. Mỗi lượt làm việc chạy `ccoding agent-exec --job …` trong pane đó — bạn thấy agent đang viết gì theo thời gian thực.
4. Agent báo trạng thái lên herdr (`pane report-agent … --state working|idle`) và token (`pane report-metadata --token in=… --token out=…`), herdr hiện trên sidebar; khi xong nhiệm vụ có thông báo.

```powershell
herdr --session ccoding          # vào văn phòng
# ctrl+b q                        # rời đi, mọi thứ vẫn chạy
herdr --session ccoding agent list
node dist/cli.js herdr status    # bố cục đã lưu (data/herdr.json)
node dist/cli.js herdr down      # đóng workspace
herdr --session ccoding server stop   # dừng hẳn server herdr (dừng cả các pane)
```

## Cấu hình (`ccoding.config.json` › `herdr`)

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `session` | `ccoding` | tên phiên herdr (biến môi trường `CCODING_HERDR_SESSION`) |
| `workspaceLabel` | `CCoding Office` | tên workspace |
| `agentPanes` | `true` | chạy mỗi lượt agent trong pane riêng (tắt → chạy tiến trình con trực tiếp) |
| `notify` | `true` | thông báo herdr khi xong nhiệm vụ |
| `bin` | (tự tìm) | đường dẫn `herdr.exe` nếu không có trong PATH |

`runner`: `auto` (herdr nếu server chạy trong pane herdr), `process` hoặc `herdr` (biến môi trường `CCODING_RUNNER`).

## Ghi chú Windows

- Pane dùng PowerShell/cmd; lệnh do CCoding gửi có dạng `node "<repo>\dist\cli.js" …` chạy được ở cả hai.
- Nếu herdr không nằm trong PATH của tiến trình (ví dụ mở từ ứng dụng khác), đặt `"herdr": { "bin": "C:\\Users\\<bạn>\\.herdr\\...\\herdr.exe" }` trong `ccoding.local.json`.
- `herdr terminal attach` chưa hỗ trợ trên Windows; dùng `herdr --session ccoding` để vào giao diện.
