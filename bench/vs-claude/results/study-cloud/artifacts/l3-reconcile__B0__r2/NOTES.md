# NOTES – Doanh thu thuần tháng 10/2026 (ICT)

**Kết quả:** net_revenue_vnd = 97,306,916; paid_count = 32; refund_count = 2; duplicate_rows_ignored = 5.

## Phương pháp
Python `csv` + `Decimal` (không float). Bỏ trùng theo dòng giống hệt → đổi `created_at` UTC sang UTC+7 → giữ dòng có giờ local trong [2026-10-01 00:00, 2026-11-01 00:00) (UTC [09-30T17:00Z, 10-31T17:00Z)) → chỉ lấy `paid`/`refunded` → USD × 25400 → cộng chính xác → làm tròn half-up một lần ở cuối.

| Bảng trung gian | Giá trị |
|---|---|
| Tổng VND (paid + refund VND) | 58,291,500 |
| Tổng USD | 1,536.04 |
| USD × 25400 | 39,015,416.00 |
| Tổng trước làm tròn | 97,306,916.00 |

## Kiểm tra dữ liệu
- 85 dòng; currency chỉ `VND` (61), `USD` (24); status `paid` 42, `void` 18, `pending` 18, `refunded` 7; không có biến thể hoa/thường hay khoảng trắng.
- Dấu amount đúng: paid dương, refunded âm (không cần đảo dấu; code vẫn ép âm cho refund).
- Không có txn_id lặp mà nội dung khác nhau.
- Dòng trùng giống hệt đã bỏ (5): T0062, T0019, T0057, T0079, T0022.
- Refund: T0075 (tháng 10, gốc T0022 trả 2/10) và T0076 (tháng 10, gốc T0024) được tính. T0079, T0078, T0080 (tháng 11) và T0077 (11/11) nằm ngoài tháng 10 nên không tính, dù gốc thuộc tháng 10. Mọi ref_txn đều có trong tệp.

## Dòng sát mốc (giờ local)
- T0072 30/9 23:59:59 → loại
- T0071 1/10 00:00:00 (UTC 09-30T17:00:00Z) → tính
- T0074 31/10 23:59 (USD 99.99) → tính
- T0073 1/11 00:00:00 (UTC 10-31T17:00:00Z) → loại
- T0043 30/9 22:27 → loại

## Giả định
Mỗi txn_id chỉ xuất hiện dạng giống hệt khi lặp, nên "giữ 1" không mơ hồ. Tỷ giá cố định 25,400.
