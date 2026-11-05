# NOTES – Doanh thu thuần 10/2026 (giờ VN, UTC+7)

Script: `reconcile.py` (csv + Decimal, không float). Chạy `python3 reconcile.py` → ghi `answer.json`.

## Phương pháp
1. Đọc 85 dòng dữ liệu; khử trùng theo `txn_id` → 5 dòng trùng (`duplicate_rows_ignored`=5). Cả 5 là bản sao giống hệt (không có txn_id trùng nhưng khác nội dung).
2. Đổi `created_at` UTC → UTC+7, giữ [2026-10-01 00:00, 2026-11-01 00:00) giờ VN (30/09 17:00Z thuộc tháng 10; 31/10 17:00Z thuộc tháng 11).
3. Chỉ giữ `paid` và `refunded`; bỏ `void`, `pending`. Refund tính theo ngày của dòng refund, không theo giao dịch gốc (`ref_txn` không dùng để lọc).
4. USD × 25400 bằng Decimal, cộng tổng, làm tròn ROUND_HALF_UP một lần ở cuối.
5. Đếm distinct: paid=32, refund=2.

## Kết quả
net_revenue_vnd = 97306916 (tổng chính xác 97306916.00), paid_count=32, refund_count=2, duplicate_rows_ignored=5.

## Kiểm tra
- Không có paid âm / refunded dương (script có xử lý theo quy tắc "refund là số âm" nhưng không kích hoạt).
- Kiểm chéo bằng cách tính thứ hai (Fraction + `astimezone`, liệt kê tay các dòng refund và dòng sát biên) cho cùng tổng.
- Tổng không âm nên không phát sinh vấn đề làm tròn half-up với số âm.

## Giả định
- Tiền tệ chỉ có VND và USD; status khớp chính xác chữ thường.
