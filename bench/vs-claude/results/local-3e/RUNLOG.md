# Sổ chạy đợt 3e, phần local: E3, E4, E5, E6 (máy giám đốc, gói Max)

Phân loại dữ liệu: **Nội bộ**. Bài tổng hợp, không có dữ liệu thật. Ghi trước lượt local đầu tiên theo `docs/research/run-plan.md` §5.4.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt chạy E4–E6 local lúc 10:02 ngày 4/11/2026, giờ VN. E3 chuyển sang local theo sai lệch ghi lúc 10:05 (§9 khối (c)) |
| Commit ghim local | `6c454f67518244af6724ca68037613f99e34ab46`: có D9–D11 và D10b. Worktree `C:\Users\admin\ccoding-vs-claude\ccoding-3e`, `npm ci` và `npm run build` xong |
| Server | Cổng 7425, `ccoding.local.json`: `runner: process`, chỉ `claude-cli` (đăng nhập gói Max, không khóa API), chặn web bằng `--disallowedTools WebFetch,WebSearch`. Thư mục dữ liệu riêng `ccoding-3e\data`. **Không đụng server 7420** |
| Claude Code CLI (máy giám đốc) | 2.1.312 (cloud E1, E2: 2.1.318). Từ D11, SR-03 ghi phiên bản này vào từng dòng |
| Kịch bản | `run3e.ps1` chạy tuần tự E3 → E4a → E4b → E5 → E6a → E6b → E6c. Runner thoát mã 3 (hạn mức) thì chờ 20 phút rồi chạy lại; khóa đã xong được bỏ qua. Tạo tệp `STOP-3e` để dừng |
| N của E4 | Cố định trước theo §9 khối (a) bước 5: R_E4 = 16 (B7cab, B7cabO × g1, g2, g5, g6), R_B6 = 32 (B6 × g3, g4); tổng 192 lượt. q̂ của E2 chỉ để mô tả, không đổi N |
| Timeout | E3, E5, E6b, E6c: 40 phút. E4, E6a: 20 phút |
| Không xem điểm | Log ghi vào tệp, người điều phối chỉ đếm số lượt. Phòng Nghiên cứu phân tích khi đủ N |
