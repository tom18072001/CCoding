## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi trong đề bài (coupon, tồn kho âm, giới hạn số lượng) đã được sửa đúng gốc và có test hồi quy. Theo lần chạy CCoding tự thực hiện, `npm test` đạt 6/6. Tuy nhiên bản sửa đã làm hỏng `removeItem` trong `src/cart.js`, một hàm trước đó vẫn chạy đúng. Điều kiện `if (i < 0) return;` bị đổi thành `if (!(i < 0)) return;`, nên hàm giờ chạy ngược. Không có test nào phủ hàm này, vì vậy cổng chất lượng vẫn báo xanh.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| (1) Coupon chỉ áp **một lần** trên subtotal | Đạt | `src/cart.js` `total()`: cộng `unitPrice*qty` thành subtotal rồi gọi `applyPercent` đúng một lần. Bản cũ trừ giảm giá ở từng dòng rồi lại trừ thêm trên subtotal, tức là giảm hai lần. |
| (1) Giảm giá theo % làm tròn half-up về đồng nguyên (VND số nguyên) | Đạt | `src/money.js`: `Math.floor((amount*pct*2+100)/200)` tương đương `floor(x+0.5)`, đúng với số không âm. Có test cho 999×15% ra 849 và cho trường hợp đúng .5 (5×10% ra 4). |
| (2) Tồn kho không thể âm | Đạt | `src/stock.js` `reserve`: báo lỗi khi `have < qty` hoặc qty không hợp lệ. Test "stock cannot go negative" kiểm cả việc tồn kho giữ nguyên sau khi bị từ chối. |
| (3) Mua được đúng `MAX_QTY_PER_LINE` trên một dòng, không vượt | Đạt | `src/cart.js:13`: điều kiện đổi từ `>=` sang `>`. Test thêm dần đến đúng 10, lần thêm thứ 11 báo `QTY_LIMIT`, tồn kho chỉ bị trừ 10. |
| Không phát sinh lỗi mới; giữ hành vi các hàm export khác | **Không** | Diff `src/cart.js` của `removeItem` đổi `if (i < 0) return;` thành `if (!(i < 0)) return;`. Với SKU có trong giỏ, hàm thoát sớm: dòng hàng không bị xóa và tồn kho không được trả lại. Với SKU không có trong giỏ, `cart.lines[-1].qty` là `undefined.qty` nên ném TypeError. Đây là lỗi mới do bản sửa gây ra. |
| Giữ nguyên tên và chữ ký mọi hàm export | Đạt | Theo diff, `createCart`, `addItem`, `removeItem`, `applyCoupon`, `total`, `applyPercent`, `sum`, `setStock`, `available`, `reserve`, `release` và `MAX_QTY_PER_LINE` đều không đổi tên hay tham số. |
| Có test hồi quy và `npm test` xanh | Đạt (một phần) | Lần chạy CCoding tự thực hiện sau khi sửa: exit 0, 6/6 pass. Có 4 test mới cho ba lỗi. Nhưng không có test nào cho `removeItem`, nên lỗi hồi quy ở trên lọt qua. |

Ghi chú: tôi không tự chạy lại được `npm test` hay một đoạn script thử, vì guard của môi trường chặn lệnh không chỉ-đọc. Kết luận về `removeItem` dựa trên việc đọc diff so với commit `70f9acd`. Logic ở đây đơn giản và xác định, nên tôi đánh giá kết luận này có độ tin cậy cao.

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng. Khách không xóa được hàng khỏi giỏ, và tồn kho đã giữ chỗ không bao giờ được trả lại. Dùng lâu sẽ thành tồn kho "ảo hết hàng", gây sai dữ liệu và ảnh hưởng vận hành. Xóa một SKU không có trong giỏ thì gây crash.
- **Trung bình:** Báo cáo của phòng ghi "không thuộc diện bắt buộc review" vì test xanh. Thực tế cổng chất lượng không bắt được lỗi do diff sinh ra ở phần không có test.
- **Thấp:** `applyPercent` chỉ đúng với `pct` là số nguyên từ 0 đến 100. Đề bài không nói gì về % lẻ hay % ngoài khoảng này, và `applyCoupon` hiện không kiểm tra đầu vào.

## Việc tiếp theo
- **Khôi phục `removeItem` và thêm test** · Phạm vi: `src/cart.js`, `test/cart.test.js` · Ai làm: @senior-swe (Phòng Phát triển) · Xong khi: điều kiện trở lại `if (i < 0) return;`; có test chứng minh xóa một dòng có sẵn thì dòng biến mất và tồn kho được trả đủ, còn xóa SKU không có trong giỏ thì không ném lỗi và không đổi gì; `npm test` xanh.
