# NOTES – Doanh thu thuần tháng 10/2026 (giờ VN, UTC+7)

Script: `tools/reconcile.py` (Python, `Decimal`, không dùng float). Chạy: `python3 -I tools/reconcile.py`.

## Kết quả (khớp answer.json)
- net_revenue_vnd = **97306916** (tổng chính xác 97306916.00, làm tròn half-up một lần ở cuối)
- paid_count = **32**, refund_count = **2**, duplicate_rows_ignored = **5**

## Phương pháp
1. 85 dòng; khử trùng theo `txn_id`. 5 dòng thừa là bản sao giống hệt (T0062, T0019, T0057, T0079, T0022). Không có txn_id trùng mà nội dung khác nhau (script kiểm tra: 0).
2. Đổi `created_at` UTC sang UTC+7, giữ giờ địa phương trong 2026-10-01 00:00 – 2026-10-31 23:59:59, tức UTC từ 09-30T17:00:00Z đến trước 10-31T17:00:00Z.
3. Chỉ tính `paid` (amount > 0) và `refunded` (amount < 0); bỏ `void`, `pending`. Status/currency đã trim và chuẩn hóa chữ hoa/thường (dữ liệu vốn đã sạch).
4. USD × 25400 bằng Decimal, cộng chính xác rồi mới làm tròn.

## Các bẫy đã gặp
- Biên múi giờ: T0071 (09-30T17:00:00Z) tính vào tháng 10; T0072 (09-30T16:59:59Z) không; T0074 (10-31T16:59Z) tính; T0073 (10-31T17:00Z) thuộc 01/11 nên loại.
- Hoàn tiền tính theo ngày dòng hoàn tiền: T0075 (hoàn T0022) và T0076 (hoàn T0024) thuộc tháng 10. T0077, T0078, T0079, T0080 tạo sang tháng 11 nên không tính, dù giao dịch gốc nằm trong tháng 10. T0079 còn nằm trong số dòng trùng.
- void/pending bị loại; USD nhân tỷ giá cố định, không làm tròn từng dòng.
