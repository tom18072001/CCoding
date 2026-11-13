## Tóm tắt
**Nghiệm thu.** Tôi đọc diff và mã nguồn và thấy cả ba lỗi đã được sửa đúng gốc: coupon, tồn kho âm, và giới hạn số lượng mỗi dòng. Có test hồi quy cho từng lỗi, và các hàm export giữ nguyên tên và chữ ký. Tôi không tự chạy lại `npm test`, vì hook của môi trường chặn lệnh này ở vai trò chỉ đọc. Kết quả chạy test lấy từ báo cáo: CCoding chạy sau thực thi, 9/9 pass, exit 0.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp dụng một lần lên subtotal, không áp lên từng dòng | Đạt | `src/cart.js` `total()` chỉ cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Test "coupon applies once across multiple lines" mong đợi 45000. |
| `applyPercent` trả số nguyên VND, làm tròn half-up | Đạt | `src/money.js` dùng `amount - Math.floor((amount*pct+50)/100)`. Kiểm tay: 1005 với 10% cho 904, 999 với 15% cho 849. Test có cả pct 0 và 100. |
| Tồn kho không bao giờ âm | Đạt | `src/stock.js` `reserve` đổi điều kiện từ `have < 0` thành `have < qty`. Test "stock cannot go negative" kiểm cả việc reserve vượt mức và tồn kho giữ nguyên sau khi bị từ chối. |
| Mua được đúng `MAX_QTY_PER_LINE`, vượt thì báo `QTY_LIMIT` | Đạt | `src/cart.js` đổi `>=` thành `>`. Hai test: mua đúng 10 một lần, và cộng dồn dòng có sẵn tới đúng 10 rồi bị chặn ở 11. Việc kiểm giới hạn nằm trước `reserve`, nên không bị giữ tồn kho khi bị từ chối. |
| Giữ tên và chữ ký các hàm export; có test hồi quy; `npm test` xanh | Đạt (dựa vào báo cáo) | Diff chỉ đổi thân hàm. Test mới trong `test/cart.test.js`. Sau thực thi: `npm test` exit 0, 9 pass, 0 fail. Baseline exit 1. |

## Rủi ro & việc còn mở
- **Thấp:** `applyPercent` không kiểm `pct` ngoài 0–100 hoặc không nguyên. `applyCoupon` cũng không kiểm. Đề bài không yêu cầu, nhưng coupon âm hoặc lớn hơn 100 vẫn cho ra tổng vô nghĩa.
- **Thấp:** `addItem` trên dòng có sẵn bỏ qua `unitPrice` mới, giữ giá cũ. Đây không thuộc ba lỗi được báo.
- **Thấp:** `stock` là `Map` toàn cục trong tiến trình, nên các test dùng chung trạng thái. Hiện không gây xung đột vì mỗi test dùng sku riêng.
- Kết quả `npm test` là lời khai trong báo cáo, không phải lần chạy của tôi.

## Việc tiếp theo
Đề xuất để giám đốc quyết định:
- **Validate đầu vào coupon và giá** · thêm kiểm `pct` (số nguyên 0–100) và nhất quán `unitPrice` trong `applyCoupon` và `addItem`, kèm test · `dev`.
