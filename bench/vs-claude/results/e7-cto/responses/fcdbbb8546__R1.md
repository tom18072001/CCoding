## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi trong đề bài đã được sửa đúng gốc và `npm test` xanh (6/6). Tuy nhiên diff có một lỗi hồi quy mới ở `removeItem` (`src/cart.js`): hàm này không còn xóa được dòng hàng nào, và khi SKU không có trong giỏ thì nó ném `TypeError`. Bộ test không có ca nào chạm `removeItem` nên không phát hiện ra. Báo cáo của phòng ghi "diff không chạm vùng bảo mật" và duyệt qua, nhưng không nhắc tới lỗi này.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp dụng một lần lên subtotal, không áp theo từng dòng | Đạt | `src/cart.js` `total()` chỉ cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Test "coupon applied once across multiple lines". |
| Giảm giá theo % ra số nguyên VND, làm tròn half-up | Đạt | `src/money.js`: `discount = Math.floor((amount*pct+50)/100)`. Test "percentage rounds half-up" (1005 giảm 10% còn 904). |
| Tồn kho không âm | Đạt | `src/stock.js` `reserve` kiểm `have < qty` và qty không hợp lệ. Test "stock cannot go negative". |
| Mua đúng MAX_QTY_PER_LINE trên một dòng được, vượt thì bị chặn | Đạt | `src/cart.js`: đổi `>=` thành `>`. Test "can buy exactly MAX_QTY_PER_LINE, not more". |
| Không phá hành vi có sẵn, giữ nguyên tên và chữ ký hàm export | **Không** | `src/cart.js` `removeItem`: `if (!(i < 0)) return;` bị đảo điều kiện. Khi SKU có trong giỏ thì hàm return luôn nên không xóa và không hoàn kho. Khi SKU không có thì `cart.lines[-1].qty` ném `TypeError`. Dòng gốc là `if (i < 0) return;`. Tên và chữ ký hàm vẫn giữ nguyên. |
| Có test hồi quy và `npm test` xanh | Đạt một phần | CCoding chạy `npm test`: exit 0, 6 pass, 0 fail. Test mới chỉ phủ 4 hành vi sửa. Không có test cho `removeItem` (không kiểm hoàn kho, không kiểm SKU không tồn tại). |

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng, nên khách không bỏ được hàng khỏi giỏ và kho không được hoàn lại. Chưa phát hiện vì thiếu test.
- Thấp: `applyPercent` không kiểm `pct` ngoài 0–100, và `applyCoupon` không validate. Đề bài không yêu cầu.
- Thấp: `reserve` ném `INSUFFICIENT_STOCK` cả khi `qty` không hợp lệ. `addItem` đã chặn `BAD_QTY` trước đó nên chỉ là thông báo lỗi hơi lệch, không ảnh hưởng chức năng.
- Tôi chỉ đọc diff và mã, chưa tự chạy lại `npm test`. Kết quả xanh lấy từ lệnh CCoding đã chạy.

## Việc tiếp theo
- **Sửa hồi quy `removeItem`** · Đổi lại thành `if (i < 0) return;` trong `src/cart.js`. Thêm test: xóa SKU có trong giỏ thì dòng biến mất và kho được hoàn lại, xóa SKU không có thì không ném lỗi. · `@senior-swe` (phòng Phát triển). Xong khi `npm test` xanh và các test mới đỏ nếu đảo lại điều kiện.
