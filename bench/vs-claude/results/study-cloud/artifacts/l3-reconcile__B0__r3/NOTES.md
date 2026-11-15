# NOTES — Net revenue tháng 10/2026 (giờ VN, UTC+7)

**Kết quả:** `net_revenue_vnd` = 97.306.916; paid_count = 32; refund_count = 2; duplicate_rows_ignored = 5.

## Phương pháp
1. Đọc 85 dòng bằng `csv`. Dòng trùng y hệt = 85 − số dòng khác nhau = **5**. Dedupe theo `txn_id`; không có txn_id nào trùng mà nội dung khác nhau.
2. Tháng 10 theo giờ VN = khoảng UTC `[2026-09-30T17:00:00Z, 2026-10-31T17:00:00Z)` (đầu mở bên trái, cuối loại trừ).
3. Chỉ giữ `paid` và `refunded`; bỏ `void`, `pending`. Refund tính theo `created_at` của chính dòng refund, không theo giao dịch gốc.
4. `Decimal(str(amount))`; USD × 25.400, VND giữ nguyên; cộng chính xác, làm tròn ROUND_HALF_UP một lần ở cuối (tổng ở đây đã là số nguyên).

## Số trung gian
| Mục | VND |
|---|---|
| Tổng paid (32 giao dịch) | 99.796.416 |
| Tổng refund (2 giao dịch) | -2.489.500 |
| Tổng trước làm tròn | 97.306.916,00 |

## Được tính
- Paid: T0002 T0005 T0007 T0009 T0013 T0014 T0015 T0016 T0018 T0019 T0020 T0022 T0024 T0028 T0030 T0033 T0034 T0036 T0037 T0038 T0042 T0047 T0050 T0054 T0058 T0060 T0061 T0062 T0063 T0067 T0071 T0074
- Refund: T0075 (-941.000), T0076 (-1.548.500)

## Ca biên
- T0072 (09-30T16:59:59Z) loại (tháng 9); T0071 (17:00:00Z) tính. T0030 (09-30T20:22Z = 01/10 03:22 VN) tính; T0043 (09-30T15:27Z) loại.
- T0074 (10-31T16:59Z) tính; T0073 (17:00Z) loại (tháng 11). T0031 (11-01T23:15Z) loại.
- Refund T0078, T0079 (01/11 theo cả UTC và VN), T0077, T0080 (tháng 11) loại, dù giao dịch gốc (T0020, T0042, T0074...) nằm trong tháng 10 — gốc vẫn tính là paid. T0075, T0076 nằm trong tháng 10 nên tính.
- txn_id xuất hiện nhiều lần (mỗi cái 2 dòng y hệt): T0019, T0022, T0057, T0062, T0079 → 5 dòng trùng; T0057 là void, T0079 là refund tháng 11 nên không ảnh hưởng tổng.
- USD có 1 chữ số thập phân (T0054 56.4 paid = 1.432.560 VND) được parse bằng Decimal, không dùng float. T0053 (215.2) là void nên loại.
