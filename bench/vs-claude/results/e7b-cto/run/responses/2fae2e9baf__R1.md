## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi trong đề bài (coupon, stock âm, giới hạn số lượng) đã được sửa đúng và có test. Tuy nhiên diff còn làm hỏng `removeItem` ở `src/cart.js`, một lỗi mới mà không test nào bắt được. `npm test` xanh (6/6) nhưng không phủ hàm này.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp một lần lên subtotal; làm tròn half-up ra VND nguyên | Đạt | `src/cart.js` `total()` cộng subtotal rồi gọi `applyPercent` một lần. `src/money.js` dùng `floor((amount*pct*2+100)/200)`, toàn số nguyên. Test ở `test/cart.test.js`: 849 và 4. |
| Stock không âm: `reserve` từ chối khi không đủ hàng | Đạt | `src/stock.js` kiểm `have < qty` và `qty` không hợp lệ. Test "stock cannot go negative". |
| Mua đúng `MAX_QTY_PER_LINE` được, vượt thì bị chặn | Đạt | `src/cart.js` đổi `>=` thành `>`. Test "can buy exactly MAX_QTY_PER_LINE, not more". |
| Giữ nguyên tên và chữ ký hàm export | Đạt | Diff không đổi tên hay chữ ký nào. |
| Không phát sinh hồi quy ở các hàm khác | **Không** | `src/cart.js` `removeItem` bị đổi từ `if (i < 0) return;` thành `if (!(i < 0)) return;`. Khi SKU có trong giỏ, hàm thoát sớm: không `release` tồn kho và không xóa dòng. Khi SKU không có, `cart.lines[-1].qty` ném TypeError. Gốc ban đầu đúng, nên đây là lỗi do diff này đưa vào. |
| Có test hồi quy cho các lỗi đã sửa; `npm test` xanh | Đạt (một phần) | Báo cáo: sau sửa `npm test` exit 0, pass 6/6. Chưa có test nào cho `removeItem`. |

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng như mô tả ở trên. Người dùng không xóa được hàng khỏi giỏ và tồn kho không được hoàn lại. Xóa SKU không có trong giỏ sẽ ném TypeError.
- Trung bình: review tự động chỉ dựa vào `npm test` xanh nên không phát hiện lỗi này.
- Thấp: `applyCoupon` không kiểm tra `pct` nằm trong 0–100. Đề bài không yêu cầu nên chỉ ghi nhận.

## Việc tiếp theo
- **Khôi phục `removeItem` và thêm test** · Đổi lại thành `if (i < 0) return;`. Thêm test: xóa SKU có trong giỏ thì stock được hoàn và dòng bị xóa. Xóa SKU không có thì không lỗi. Chạy lại `npm test`. · `@senior-swe`.
