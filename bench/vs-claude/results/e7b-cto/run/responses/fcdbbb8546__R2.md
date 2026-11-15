## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi khách báo đã được sửa đúng nguyên nhân gốc, có test hồi quy, và `npm test` xanh (6/6). Nhưng diff còn đổi điều kiện trong `removeItem` mà đề bài không yêu cầu, và đổi sai: điều kiện bị đảo ngược. Bỏ một món đang có trong giỏ giờ không còn tác dụng gì: dòng hàng vẫn nằm trong giỏ và tồn kho không được trả lại. Bỏ một SKU không có trong giỏ thì ném `TypeError`. Không test nào phủ hàm này nên cổng chất lượng không bắt được.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Tổng tiền khi có coupon: chỉ trừ % một lần trên subtotal, ra số nguyên VND, làm tròn half-up | Đạt | `src/cart.js` `total()`: các dòng chỉ còn tính `unitPrice*qty`, bỏ việc trừ % hai lần (lỗi "lệch nhiều"). `src/money.js`: `Math.floor((amount*pct+50)/100)` cho kết quả nguyên, half-up (lỗi "lẻ đồng"). Test `coupon applied once…` (kỳ vọng 9014) và `percentage rounds half-up` (kỳ vọng 904). |
| 2. Tồn kho không âm | Đạt | `src/stock.js` `reserve()`: điều kiện cũ `have < 0` đổi thành `have < qty`, thêm kiểm `qty` là số nguyên dương. `addItem` kiểm `QTY_LIMIT` trước rồi mới `reserve`. Test `stock cannot go negative`. |
| 3. Mua được đúng `MAX_QTY_PER_LINE`, mua thêm thì bị chặn | Đạt | `src/cart.js:13`: `>=` đổi thành `>`. Test `can buy exactly MAX_QTY_PER_LINE, not more` kiểm cả việc tồn kho không bị trừ khi lỗi. |
| 4. Giữ nguyên tên và chữ ký mọi hàm export | Đạt | `git diff fc53f98 HEAD`: không đổi tên hay tham số của hàm export nào. |
| 5. Không gây hồi quy ở hành vi ngoài phạm vi sửa | **Không** | `git diff` ở `src/cart.js` `removeItem`: `if (i < 0) return;` bị đổi thành `if (!(i < 0)) return;`. Có món trong giỏ thì hàm `return` ngay, không bỏ dòng, không `release` tồn kho. Không có món thì truy cập `cart.lines[-1].qty` và ném `TypeError`. Đây là hồi quy do đội tự tạo ra. |
| 6. Có test hồi quy và `npm test` xanh | Đạt (có lưu ý) | CCoding tự chạy: baseline exit 1, sau khi sửa exit 0, `tests 6 · pass 6 · fail 0`. Tôi không tự chạy lại được vì hook chặn `npm`, nên dựa vào kết quả CCoding. Lưu ý: chưa có test nào cho `removeItem`. |

## Rủi ro & việc còn mở
- **Cao:** hồi quy `removeItem` (tiêu chí 5). Khách không bỏ được hàng khỏi giỏ và tồn kho bị giữ mãi, kho "ảo hết hàng". Gọi hàm với SKU không có trong giỏ làm sập luồng xử lý.
- **Thấp:** `applyCoupon` không kiểm `pct` (âm, lớn hơn 100, số lẻ). Nếu `pct` có phần thập phân, `amount*pct` có thể lệch 1 đồng do sai số số thực. Đề bài không yêu cầu xử lý, chỉ ghi lại để biết.
- **Thấp:** báo cáo dùng "làn nhanh", không có review của người, nên lỗi hồi quy lọt qua cổng chỉ dựa vào test xanh.

## Việc tiếp theo
- **Sửa hồi quy `removeItem` và thêm test.** Phạm vi: trả `src/cart.js` `removeItem` về `if (i < 0) return;`. Thêm test: bỏ món đang có thì dòng biến mất và `available()` tăng lại đúng số lượng; bỏ SKU không có thì không ném lỗi và không đổi gì. Người làm: `@senior-swe` (dev). Xong khi `npm test` xanh và có các test mới này.
- (Tùy chọn) **Kiểm tra `pct` hợp lệ trong `applyCoupon`.** Chỉ chặn `pct` ngoài khoảng 0–100, giữ nguyên chữ ký hàm. Cần giám đốc quyết có làm hay không vì đề bài không nêu.
