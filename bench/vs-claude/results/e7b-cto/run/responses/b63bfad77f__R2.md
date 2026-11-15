## Tóm tắt
**Nghiệm thu.** Cả ba lỗi khách báo đều đã được sửa tận gốc, mỗi lỗi một dòng: `money.js` tính sai làm tròn, `cart.js` áp coupon hai lần và so sánh giới hạn số lượng sai, `stock.js` kiểm tra tồn kho sai. Không hàm export nào bị đổi tên hay đổi chữ ký, và có 9 test hồi quy. Kết quả chạy thật `npm test` exit 0, 9/9 test đạt. Hook chặn nên tôi không chạy lại `npm test` được; tôi đã đọc từng dòng diff và test để xác nhận.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon chỉ áp một lần lên subtotal, không áp hai lần | Đạt | `git diff 4d0cc06 99c6345`: bản cũ trừ % ở từng dòng rồi trừ thêm lần nữa ở subtotal. Bản mới cộng `unitPrice*qty` rồi gọi `applyPercent` một lần (`src/cart.js:28-30`). Test `coupon applies once across multiple lines` cho 50000 trừ 10% ra 45000. |
| Tiền là số nguyên VND, giảm theo % làm tròn half-up | Đạt | `src/money.js:3`: `amount - Math.floor((amount*pct + 50)/100)` là làm tròn half-up khoản giảm khi `amount` và `pct` là số nguyên. Test: `applyPercent(1005,10)=904` (giảm 100,5 thành 101), `999,15` ra 849, kiểm `Number.isInteger`, các trường hợp biên 0%, 100% và giỏ rỗng. |
| Tồn kho không âm | Đạt | `src/stock.js:7` đổi `have < 0` thành `have < qty`. Test `stock cannot go negative`: mua vượt thì báo `INSUFFICIENT_STOCK` và tồn kho giữ nguyên, mua hết thì tồn về 0, mua tiếp thì báo lỗi. Kiểm `QTY_LIMIT` xảy ra trước `reserve` nên khi bị từ chối không giữ nhầm hàng. |
| Mua được đúng `MAX_QTY_PER_LINE` trên một dòng, quá thì bị chặn | Đạt | `src/cart.js:13` đổi `>=` thành `>`. Hai test xác nhận: thêm thẳng 10, và tăng 7 rồi thêm 3 lên 10. Thêm 1 nữa thì báo `QTY_LIMIT`. |
| Giữ nguyên tên và chữ ký mọi hàm export | Đạt | Diff chỉ sửa thân hàm. Các export `createCart`, `addItem`, `removeItem`, `applyCoupon`, `total`, `MAX_QTY_PER_LINE`, `applyPercent`, `sum`, `setStock`, `available`, `reserve`, `release` không đổi. |
| Có test hồi quy và `npm test` xanh | Đạt | CCoding tự chạy: trước khi sửa exit 1, sau khi sửa exit 0 với 9 pass, 0 fail. `test/cart.test.js` có đủ 9 test. |

## Rủi ro & việc còn mở
- **Cách hiểu "half-up" (thấp):** mã làm tròn half-up *khoản giảm*, nên tổng tiền thực chất được làm tròn half-down, ví dụ 150 giảm 1% ra 148. Cách này khớp chú thích trong `money.js` và đề bài ("percentage discounts round half-up"). Nếu nghiệp vụ muốn làm tròn half-up *tổng tiền* thì kết quả lệch 1 đồng ở các ca đúng ,5.
- **`pct` không nguyên (thấp):** nếu coupon là số lẻ như 12.5%, phép `Math.floor` trên số thực có thể sai ±1 đồng ở ca biên vì sai số dấu phẩy động. Hiện `applyCoupon` không kiểm tra `pct` có phải số nguyên trong khoảng 0–100 hay không.
- Kho hàng (`stock`) là Map dùng chung cho cả module và các test, nên test phải dùng SKU riêng để không ảnh hưởng nhau. Hiện test đã làm vậy.

## Việc tiếp theo
- **Kiểm tra đầu vào coupon** · Phạm vi: `applyCoupon` báo lỗi nếu `pct` không phải số nguyên trong khoảng 0–100, kèm test · Ai làm: Phòng Phát triển (tùy chọn, giám đốc quyết định).
