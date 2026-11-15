## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi trong đề bài đã được sửa đúng và có test hồi quy. Tuy nhiên diff đưa vào một lỗi mới ở `removeItem` (`src/cart.js`): điều kiện thoát sớm bị đảo ngược. Hàm này giờ không còn xóa được dòng hàng nào. `npm test` xanh vì không có test nào gọi `removeItem`.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp đúng một lần lên subtotal, không áp theo từng dòng | Đạt | `total()` trong `src/cart.js` giờ cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Test "coupon applies once to subtotal" kiểm tra 999 giảm 15% ra 849. |
| Giảm giá phần trăm ra số nguyên VND, làm tròn half-up | Đạt | `applyPercent` trong `src/money.js` dùng `Math.floor((amount*pct*2+100)/200)`, toàn bộ là phép tính số nguyên. Test "half-up rounding" kiểm tra 5 giảm 10% ra 4. Tôi đã đọc code, không tự chạy thêm các trường hợp biên khác. |
| Tồn kho không âm | Đạt | `reserve` trong `src/stock.js` giờ kiểm tra `have < qty` và qty không hợp lệ. Test "stock cannot go negative" kiểm tra tồn kho giữ 3 khi đặt 4, về 0 khi đặt 3, và lần đặt thêm 1 bị từ chối. |
| Mua được đúng `MAX_QTY_PER_LINE`, không vượt quá | Đạt | `>=` đổi thành `>` trong `addItem`. Test "can buy exactly MAX_QTY_PER_LINE, not more" kiểm tra mua đủ 10 được, mua thêm 1 bị `QTY_LIMIT`. |
| Không phát sinh hồi quy ở các hàm export khác | **Không** | `removeItem` ở `src/cart.js` (dòng 19) đổi từ `if (i < 0) return;` thành `if (!(i < 0)) return;`. Khi sku có trong giỏ, hàm thoát ngay và không giải phóng kho cũng không xóa dòng. Khi sku không có, `cart.lines[-1].qty` ném `TypeError`. Dòng này đúng ở commit `1a32d5b` và không thuộc phạm vi 3 lỗi của đề bài. |
| Có test hồi quy và `npm test` xanh | Đạt, kèm lưu ý | CCoding chạy `npm test` sau khi sửa: 6 pass, 0 fail, exit 0. Baseline exit 1. Lưu ý: không có test cho `removeItem`, nên lỗi ở dòng trên không bị phát hiện. |
| Giữ nguyên tên và chữ ký các hàm export | Đạt | Diff không đổi tên hay chữ ký nào. |

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng như mô tả ở trên. Giỏ không xóa được hàng, kho không được hoàn lại, và xóa sku không tồn tại gây crash. Review "Đã duyệt" của làn nhanh đã bỏ sót lỗi này, vì cổng chỉ dựa vào `npm test` xanh.
- **Trung bình:** Thiếu test cho `removeItem` và cho đường `release`.
- **Thấp:** `applyCoupon` không kiểm tra `pct` nằm trong 0–100. Đề bài không yêu cầu nên chỉ ghi nhận.

## Việc tiếp theo
- **Sửa hồi quy `removeItem`** · Phạm vi: khôi phục `if (i < 0) return;` ở `src/cart.js:19`. Thêm test: xóa dòng thì tồn kho được hoàn lại và dòng bị bỏ khỏi giỏ, xóa sku không có thì không ném lỗi. Tiêu chí xong: `npm test` xanh, test mới đỏ nếu đảo lại điều kiện. · Làm: `@senior-swe`, giám đốc quyết định có giao hay không.
