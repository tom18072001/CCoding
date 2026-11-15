# Ghi chú phương pháp

1. Đọc `transactions.csv`; loại dòng trùng hoàn toàn theo `txn_id` (5 dòng trùng trong cả file, không có bản trùng khác nội dung).
2. Chuyển `created_at` (UTC) sang UTC+7, giữ giao dịch có tháng 10/2026 giờ Việt Nam (biên: 2026-09-30T17:00Z đến 2026-10-31T16:59Z).
3. Chỉ tính `paid` và `refunded`; bỏ `void`, `pending`. Refund tính theo ngày tạo của dòng refund, không theo giao dịch gốc.
4. USD × 25.400 VND, cộng bằng `Decimal` (chính xác), làm tròn half-up một lần ở cuối.

Kết quả: net_revenue_vnd = 97.306.916 (tổng đúng = 97.306.916,00), 32 paid, 2 refund (T0075, T0076), 5 dòng trùng.
Các refund T0078 (2026-11-01T11:09Z), T0079, T0080, T0077 nằm ngoài tháng 10 giờ VN nên bị loại.
