# NOTES — Net revenue tháng 10/2026 (giờ VN)

Kết quả: net_revenue_vnd = 97.306.916; paid_count = 32; refund_count = 2; duplicate_rows_ignored = 5.

## Phương pháp
- **Múi giờ**: `created_at` (UTC) + 7 giờ, lọc `2026-10-01 00:00:00 ≤ local < 2026-11-01 00:00:00`.
- **Bỏ trùng**: mỗi `txn_id` tính một lần (giữ dòng đầu). 85 dòng, 80 txn_id khác nhau → 5 dòng trùng, đếm trên toàn tệp. Các dòng trùng đều giống hệt nhau, không có txn_id xung đột nội dung.
- **Trạng thái**: chỉ `paid` (dương) và `refunded` (âm); bỏ `void`, `pending`.
- **Refund**: tính theo tháng của dòng refund, không theo ngày đơn gốc.
- **Tiền tệ**: USD × 25.400 bằng `Decimal` (parse từ chuỗi, không float), cộng chính xác toàn bộ, làm tròn ROUND_HALF_UP một lần ở cuối (tổng chính xác đã là số nguyên).

## Tổng phụ (tháng 10, sau bỏ trùng)
| Nhóm | Số GD | Gốc | VND |
|---|---|---|---|
| paid VND | 25 | 60.781.000 | 60.781.000 |
| paid USD | 7 | 1.536,04 USD | 39.015.416 |
| refund VND | 2 | -2.489.500 | -2.489.500 |
| Tổng | | | 97.306.916 |

## Dòng sát ranh giới
| txn | UTC | Giờ VN | Xử lý |
|---|---|---|---|
| T0072 | 09-30 16:59:59 | 09-30 23:59:59 | loại |
| T0071 | 09-30 17:00:00 | 10-01 00:00:00 | tính |
| T0030 | 09-30 20:22 | 10-01 03:22 | tính |
| T0043 | 09-30 15:27 | 09-30 22:27 | loại |
| T0042 | 10-30 17:06 | 10-31 00:06 | tính |
| T0074 | 10-31 16:59 | 10-31 23:59 | tính |
| T0073 | 10-31 17:00 | 11-01 00:00 | loại |
| T0031 | 11-01 23:15 | 11-02 | loại |
| T0075 (hoàn T0022) | 10-14 17:09 | 10-15 | tính |
| T0076 (hoàn T0024) | 10-23 08:53 | 10-23 | tính |
| T0078, T0079 | 11-01 | 11-01 | loại |
| T0077, T0080 | tháng 11 | tháng 11 | loại |

Script: scratchpad `recon.py` (ngoài repo, chỉ dùng thư viện chuẩn).
