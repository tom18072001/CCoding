# Sổ chạy E1: chẩn đoán cache claude-cli (đợt 3e, V4-3e-E1)

Phân loại dữ liệu: **Nội bộ**. Lời nhắc giả, không có dữ liệu thật.

| Mục | Giá trị |
|---|---|
| Duyệt | Giám đốc duyệt đợt 3e lúc 10:02 ngày 4/11/2026, giờ VN |
| Kho | `perf/vs-claude-loop` tại `a4665c6`; `npm run build` exit 0 |
| Claude Code CLI | 2.1.318 |
| Lệnh | `node bench/vs-claude/cache-diagnostic.mjs --model sonnet --out bench/vs-claude/results/b14-diag/diag.csv` |
| Lần 1 | Khởi động 10:04 giờ VN bằng `nohup`. Môi trường dừng tiến trình, không có CSV hay log. Ước tính khoảng 3 lượt `claude -p`; ghi sai lệch ở `preregistration.md` §9 |
| Lần 2 | Khởi động `2026-11-04T03:09:43Z`, tiến trình nền do công cụ quản lý. **Đang chạy**; kết quả sẽ ghi bổ sung vào đây |
