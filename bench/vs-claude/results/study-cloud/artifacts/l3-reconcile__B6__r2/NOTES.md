# NOTES – Doanh thu thuần tháng 10/2026 (giờ VN, UTC+7)

Kết quả: net_revenue_vnd = 97.306.916; paid_count = 32; refund_count = 2; duplicate_rows_ignored = 5.

## Phương pháp
1. Đọc CSV (85 dòng dữ liệu, 80 txn_id phân biệt). Kiểm tra: mọi created_at dạng `...Z`, status/currency sạch (không khoảng trắng/hoa thường lẫn), số không có dấu phân tách nghìn, refund đều âm. Các txn_id trùng đều giống hệt từng cột (5 dòng thừa: T0062, T0019, T0057, T0079, T0022); không có txn_id trùng khác nội dung.
2. Mỗi txn_id tính một lần, đổi created_at sang UTC+7, giữ [2026-10-01 00:00, 2026-11-01 00:00).
3. Chỉ `paid` (+) và `refunded` (−, theo tháng của dòng refund); bỏ `void`, `pending`.
4. Dùng `Fraction`: USD × 25400, cộng chính xác, làm tròn half-up một lần ở cuối (tổng thực tế đã là số nguyên).

## Bẫy đã gặp
- Duplicate chính xác: 5 dòng.
- Biên múi giờ: T0071 (30/09 17:00:00Z) và T0074 (31/10 16:59Z) tính vào tháng 10; T0072 (30/09 16:59:59Z) và T0073 (31/10 17:00Z) ra ngoài.
- Refund khác tháng: T0079, T0078, T0080, T0077 là refund tháng 11 → không trừ; T0075 và T0076 (tháng 10) được trừ.
- void/pending bị loại; đơn paid tháng 11 hoặc tháng 9 bị loại.

## Kiểm chứng
Tính lại độc lập bằng Python `Decimal` + `zoneinfo`-style offset: cùng tổng 97306916.
