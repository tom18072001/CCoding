## Tóm tắt
Tôi nghiệm thu: cả 6 lỗi trong ISSUES.md đã được sửa ở nguyên nhân gốc và có test hồi quy riêng trong `test/regression.test.js`. API công khai không đổi. Bằng chứng chạy `npm test` lấy từ báo cáo của CCoding (14/14 pass), vì hook chặn tôi chạy `npm` ở vai chỉ đọc. Phần còn lại tôi kiểm bằng cách đọc diff `52c3623..HEAD`.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| #1 Làm tròn xu half away from zero ở mọi chỗ đổi tiền | Đạt | `src/money.js` `toCents` làm tròn theo chữ số thập phân. `checkout.js` mã cố định dùng `toCents`. `catalog.js:13` và `minSubtotal` (`promotions.js`) vốn đã gọi `toCents`. Test `#1` kiểm 1.005→101, -1.005→-101, 2.675→268. |
| #2 Tổng giảm đúng bằng số tiền mã, chia theo phần dư lớn nhất | Đạt | `allocate` trong `money.js` chia phần dư lớn nhất, hòa thì ưu tiên chỉ số nhỏ. Test `#2` kiểm `[334,333,333]` và tổng giảm bằng 1000 (mã cố định) và 100 (mã %). |
| #3 Mua X tặng Y | Đạt | `freeUnits` đổi thành `floor(qty/(buy+free))*free`. Test `#3` kiểm 2→0, 3→1, 5→1, 6→2 và cấu hình 3 tặng 2. |
| #4 `endsAt` dạng ngày dùng được tới hết ngày UTC | Đạt | `endExclusive` trong `promotions.js` cộng 1 ngày cho chuỗi dạng `YYYY-MM-DD`. Test `#4` kiểm 10:00 và 23:59:59.999 của 30/11 vẫn dùng được, còn `2026-12-01T00:00:00Z` bị từ chối. |
| #5 Giữ chỗ tồn kho khớp tổng số lượng trong giỏ | Đạt | `cart.js`: `updateQty` chỉ reserve/release phần chênh lệch, `removeItem` release số lượng đang giữ. Test `#5` kiểm kịch bản kho 4, thêm 2 rồi sửa thành 3, và kiểm xóa món. |
| #6 Thuế tính trên `net` | Đạt | `checkout.js` đổi thành `lineTax(l.net, …)`. `tax.js` đổi phép nhân để tránh sai số nhị phân. Test `#6` kiểm giảm 50% cho thuế 50 và tổng 550. |
| `npm test` xanh, có test hồi quy, không đổi API | Đạt | Theo báo cáo CCoding: baseline 6 pass, sau sửa 14 pass, 0 fail. `regression.test.js` có 8 test. Diff không đổi tên hàm, tham số hay dạng kết quả. Tôi không tự chạy lại được. |
| Giữ nguyên các hành vi đang đúng (bộ ẩn) | Chưa kiểm được | Bộ nghiệm thu ẩn nằm ngoài tầm tôi. Các test cũ vẫn pass, nhưng không có bằng chứng nào về các ca biên khác. |

## Rủi ro & việc còn mở
- Mã giảm theo danh mục (`checkout.js:37`) vẫn dùng `Math.round` từng dòng, không dùng `allocate`. ISSUES.md không nêu, nên tôi không coi đây là lỗi.
- `Math.round` trong `checkout.js:30` (tính tổng giảm theo %) và trong `tax.js` vẫn làm tròn half-up với số dương. Với số tiền dương dạng xu nguyên thì khớp half away from zero.
- `toCents` quay về `Math.round(amount*100)` khi giá trị ≥1e15. Ngưỡng này nằm ngoài dải dùng thực tế.
- Báo cáo mô tả review là "tự động, không gọi model". Chưa có người hay QA đọc code độc lập.

## Việc tiếp theo
- **Review độc lập và bổ sung ca biên** · chạy lại `npm test`. Thêm test cho `allocate` với tổng âm, trọng số 0 và hòa phần dư. Thêm test cho `endsAt` dạng ISO đầy đủ, và cho mã theo danh mục kết hợp thuế · `@qa-tester`.
