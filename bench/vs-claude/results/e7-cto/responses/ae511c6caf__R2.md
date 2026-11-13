## Tóm tắt
Nghiệm thu **Đạt**. Tôi đã đọc diff của commit `4862632`: cả 6 lỗi trong ISSUES.md đều được sửa đúng chỗ gây lỗi và đều có test hồi quy trong `test/regression.test.js`. Tên hàm, lớp, tham số và dạng kết quả không đổi. CCoding tự chạy `npm test` sau khi sửa: exit 0, 14/14 pass (trước khi sửa là 6/6). Tôi không tự chạy lại `npm test` được vì hook chặn lệnh không chỉ-đọc, nên kết quả test lấy từ lần CCoding chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| #1 `toCents` làm tròn half away from zero (`1.005`→101, `-1.005`→-101, `2.675`→268), và mọi chỗ đổi sang xu đều qua `toCents` | Đạt | `src/money.js:5-13` làm tròn theo chữ số thập phân thay cho `amount*100`. Giá sản phẩm (`src/catalog.js` `add`), giá trị đơn tối thiểu (`src/promotions.js` `checkValidity`) và mã giảm cố định (`src/checkout.js:34`, trước đây dùng `Math.round(amount*100)`) đều gọi `toCents`. Có test `#1` ×2 |
| #2 Tổng giảm của các dòng đúng bằng số tiền của mã (cố định và %), chia theo phần dư lớn nhất | Đạt | `src/money.js` `allocate`: chia phần nguyên trước, phần còn lại cộng cho các dòng có phần dư lớn nhất, hòa thì theo thứ tự chỉ số (nhờ sort ổn định). Test `#2`: `allocate(1000,[1,1,1])`→`[334,333,333]`; mã 10.00 → giảm 1000; mã 10% → giảm 100 |
| #3 Mua X tặng Y chỉ tặng khi đủ X+Y món (2→0, 3→1, 5→1, 6→2) | Đạt | `src/promotions.js` `freeUnits` = `floor(qty/(buy+free))*free`. Test `#3` có thêm cấu hình 3+2 |
| #4 `endsAt` dùng được tới hết ngày UTC, từ chối từ `2026-12-01T00:00:00Z` | Đạt | `endExclusive` cộng `DAY_MS` khi `endsAt` có dạng `YYYY-MM-DD`; nếu là timestamp đầy đủ thì giữ nguyên. Test `#4` kiểm ba mốc 10:00, 23:59:59.999 và 00:00 ngày 1/12 |
| #5 Số lượng giữ chỗ luôn bằng tổng số lượng trong giỏ (sửa số lượng, xóa món, đặt về 0) | Đạt | `src/cart.js` `updateQty` chỉ giữ chỗ hoặc trả lại phần chênh lệch; `removeItem` trả lại kho. Test `#5` đúng kịch bản kho 4 → 2 → 3 và xóa món |
| #6 Thuế tính trên `net` của từng dòng | Đạt | `src/checkout.js:44` `lineTax(l.net, …)`. Test `#6`: giảm 50% trên 10.00 → thuế 50 |
| Không đổi API công khai; `npm test` xanh, giữ nguyên các test cũ | Đạt | Diff chỉ sửa phần thân hàm, export giữ nguyên. Lần chạy sau khi sửa: exit 0, 14 pass, 0 fail (6 test cũ vẫn pass) |

## Rủi ro & việc còn mở
- `src/tax.js` có một thay đổi ngoài phạm vi 6 lỗi: đổi số học `rate` sang số nguyên. Với các mức 10%, 5% và 0% thì kết quả tương đương, nhưng đây là thay đổi không có lỗi nào yêu cầu và không có test riêng.
- #3 mới chỉ được test ở mức `freeUnits`, chưa có test đi qua cả `computeTotals` (ví dụ giỏ 2 hộp phải có `discount = 0`).
- `toCents` đổi số sang chuỗi bằng `toFixed(10)`. Với số rất lớn (từ `1e15` trở lên) thì quay về cách cũ. Rủi ro thấp nhưng nên có thêm test cho các trường hợp biên như `0.005`, `-0.005` và số nguyên âm.
- Mã giảm theo danh mục và tiền giảm % (`Math.round`) không thuộc các lỗi được báo nên không được kiểm thêm.

## Việc tiếp theo
- **Bổ sung test biên cho checkout** · Thêm test `computeTotals` cho mua X tặng Y (2/3/6 món), `toCents(±0.005)` và `lineTax` cho từng loại thuế ở các giá trị .5 xu · @senior-swe (Phòng Phát triển) · Xong khi `npm test` xanh.
