## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi khách hàng báo (coupon, tồn kho âm, mua đúng mức tối đa) đã được sửa đúng nguyên nhân, có regression test, và `npm test` chạy xanh (6/6). Nhưng diff còn đảo ngược điều kiện trong `removeItem` mà không ai yêu cầu, làm hỏng một hàm trước đó chạy đúng. Không có test nào cho `removeItem` nên lỗi này lọt qua cổng chất lượng. Tôi phát hiện bằng cách đọc diff, chưa chạy thử.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Coupon chỉ áp **một lần** lên subtotal | Đạt | Ở `src/cart.js:29`, `total()` bỏ `applyPercent` theo từng dòng và chỉ áp trên subtotal (dòng 31). Test "coupon applied once across multiple lines" khẳng định 10016 → 9014. |
| 2. Tổng là số nguyên VND, giảm % làm tròn half-up | Đạt | Ở `src/money.js:3`, `discount = Math.floor((amount*pct + 50)/100)`. Test "percentage rounds half-up" (1005, 10% → 904) và test 10016 → 9014. |
| 3. Tồn kho không thể âm | Đạt | Ở `src/stock.js:7`, `reserve` kiểm `have < qty` (base kiểm `have < 0`, sai). Test "stock cannot go negative" xác nhận `available('F')` giữ ở 0 và ném `INSUFFICIENT_STOCK`. |
| 4. Mua được đúng `MAX_QTY_PER_LINE`, không được hơn | Đạt | Ở `src/cart.js:13`, `>=` đổi thành `>`. Test "can buy exactly MAX_QTY_PER_LINE, not more". |
| 5. Có regression test và `npm test` xanh | Đạt | `test/cart.test.js` thêm 4 test. CCoding tự chạy: baseline exit 1, sau khi sửa exit 0 với 6/6 pass. |
| 6. Không gây hỏng chức năng khác, giữ nguyên tên và signature export | **Không** | Signature giữ nguyên. Nhưng `src/cart.js:20` đổi `if (i < 0) return;` thành `if (!(i < 0)) return;`. Với SKU có trong giỏ, hàm thoát ngay: không xóa dòng, không `release` tồn kho, nên hàng giữ chỗ bị "rò". Với SKU không có trong giỏ, hàm đọc `cart.lines[-1].qty` và ném `TypeError`. Ba lỗi trong đề bài không liên quan đến `removeItem`, và trong `test/cart.test.js` không có test nào gọi hàm này. |

## Rủi ro & việc còn mở
- **Cao, cả dữ liệu lẫn vận hành:** `removeItem` hỏng nên tồn kho bị giữ chỗ vĩnh viễn khi khách bỏ hàng khỏi giỏ, và xóa SKU không có trong giỏ làm crash.
- **Trung bình, quy trình:** cổng chất lượng duyệt chỉ vì `npm test` xanh, trong khi bộ test không phủ `removeItem`. Một lỗi vừa gây ra đã lọt qua mà không ai review.
- **Thấp, cần nghiệp vụ xác nhận:** "half-up" đang được hiểu là làm tròn **tiền giảm**. Nếu hiểu là làm tròn **tổng sau giảm** thì ở giá trị .5 kết quả lệch 1đ (ví dụ 1005 với 10% sẽ ra 905 thay vì 904). Cách hiểu hiện tại hợp lý nhưng là giả định.
- **Thấp:** `applyCoupon` không kiểm `pct` (âm, >100, không nguyên). Ngoài phạm vi đề bài.

## Việc tiếp theo
- **Khôi phục `removeItem` và thêm test** · Phạm vi: `src/cart.js:20` đổi lại thành `if (i < 0) return;`; thêm test cho hai trường hợp: xóa SKU có trong giỏ (dòng bị xóa, `available` được hoàn lại) và xóa SKU không có trong giỏ (không ném lỗi, giỏ không đổi) · Ai làm: Phòng Phát triển (`@senior-swe`) · Xong khi: `npm test` xanh và có test mới cho `removeItem`.
- **Xác nhận quy ước làm tròn** · Phạm vi: giám đốc hoặc BA chốt "half-up" áp cho tiền giảm hay tổng sau giảm · Ai làm: giám đốc quyết định.
