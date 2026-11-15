# Đối soát doanh thu thuần tháng 10/2026 (giờ Việt Nam)

## Phương pháp

1. **Loại trùng lặp**: `transactions.csv` có 85 dòng dữ liệu và 80 `txn_id` khác nhau. Năm ID xuất hiện hai lần,
   và mỗi cặp là bản sao trùng khớp hoàn toàn: T0019, T0022, T0057, T0062, T0079.
   Mỗi `txn_id` chỉ được tính một lần, nên `duplicate_rows_ignored = 5`. Con số này tính trên toàn tệp,
   bất kể trạng thái hay tháng.
2. **Khoảng thời gian**: tháng 10/2026 theo giờ UTC+7 tương ứng với
   `2026-09-30T17:00:00Z <= created_at < 2026-10-31T17:00:00Z` (UTC). Các trường hợp sát biên:
   - T0071 `09-30T17:00:00Z` → **tính** (00:00 ngày 01/10 giờ địa phương); T0030 `09-30T20:22Z` → tính.
   - T0072 `09-30T16:59:59Z`, T0043 `09-30T15:27Z` → **không tính** (vẫn là tháng 9 giờ địa phương).
   - T0074 `10-31T16:59Z` → tính; T0073 `10-31T17:00Z` → **không tính** (00:00 ngày 01/11 giờ địa phương).
3. **Trạng thái**: chỉ tính `paid` và `refunded`; bỏ qua `void` và `pending`.
4. **Hoàn tiền** được tính vào tháng tạo dòng hoàn tiền. Có hai giao dịch hoàn tiền trong tháng 10:
   T0075 (−941.000 VND, hoàn cho T0022) và T0076 (−1.548.500 VND, hoàn cho T0024).
   Các giao dịch T0078, T0079, T0080, T0077 thuộc tháng 11 theo giờ địa phương nên bị loại.
   Riêng T0079 có `13:40Z` ngày 01/11, nên chắc chắn không thuộc tháng 10.
5. **Tiền tệ**: USD được quy đổi theo tỷ giá 25.400 VND/USD và cộng bằng số thập phân chính xác.
   Chỉ làm tròn half-up về đồng ở bước cuối. Trong trường hợp này kết quả đã là số nguyên.

## Tính toán

| Thành phần | Số giao dịch | Số tiền |
|---|---|---|
| Đã thanh toán, VND | 25 | 60.781.000 VND |
| Đã thanh toán, USD | 7 | 1.536,04 USD × 25.400 = 39.015.416 VND |
| Hoàn tiền, VND | 2 | −2.489.500 VND |
| **Doanh thu thuần** | | **97.306.916 VND** |

Các giao dịch USD đã thanh toán trong tháng 10: T0013 316,98 · T0074 99,99 · T0018 361,95 · T0050 229,83 ·
T0015 284,38 · T0054 56,40 · T0028 186,51.
