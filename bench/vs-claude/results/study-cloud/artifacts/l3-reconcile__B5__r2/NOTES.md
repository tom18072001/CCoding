# Ghi chú phương pháp
- Đọc `transactions.csv`; loại dòng trùng (cùng `txn_id`, các bản trùng đều giống hệt) → 5 dòng trùng bị bỏ.
- Chuyển `created_at` (UTC) sang UTC+7, giữ giao dịch có tháng local = 10/2026 (giao dịch cuối 9/2026 UTC có thể thành 10/2026 và ngược lại).
- Chỉ tính `paid` (dương) và `refunded` (âm, tính theo tháng của dòng refund); bỏ `void`, `pending`.
- USD × 25.400 bằng `Decimal` (chính xác), cộng toàn bộ rồi làm tròn half-up một lần ở cuối.
- Kết quả: net 97.306.916 VND, 32 paid, 2 refund, 5 dòng trùng.
