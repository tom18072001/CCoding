## Tóm tắt
**Chưa nghiệm thu.** Ba lỗi trong đề bài (coupon, tồn kho âm, mua đúng số lượng tối đa) đã được sửa đúng gốc và có test hồi quy. `npm test` do CCoding chạy ra exit 0, 6/6 test đạt. Tuy vậy commit `041ca08` còn sửa thêm `removeItem` ở `src/cart.js:20`, đổi `if (i < 0) return;` thành `if (!(i < 0)) return;`, và việc này làm hỏng một hàm vốn đang chạy đúng. Không test nào gọi `removeItem`, nên `npm test` vẫn xanh dù hàm đã hỏng.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Coupon chỉ áp **một lần** trên subtotal | Đạt | `src/cart.js:28-30` cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Bản gốc trừ coupon ở từng dòng rồi trừ thêm lần nữa trên tổng. Test "coupon applies once…" (`test/cart.test.js:20`) đạt. |
| 2. Tiền là số nguyên VND, discount làm tròn half-up | Đạt | `src/money.js:3` dùng `Math.floor((a*p*2+100)/200)`, tương đương `floor(a·p/100 + 0.5)` với số không âm, tính hoàn toàn bằng số nguyên. Test 999×15% → 849 và test trường hợp đúng .5 (5×10% → 4) đều đạt (`test/cart.test.js:20-34`). |
| 3. Tồn kho không âm | Đạt | `src/stock.js:7` kiểm `have < qty` thay vì `have < 0`. Test "stock cannot go negative" (`test/cart.test.js:35`) kiểm cả việc tồn kho không đổi khi bị từ chối. |
| 4. Mua được đúng `MAX_QTY_PER_LINE` và không quá mức này | Đạt | `src/cart.js:13` đổi `>=` thành `>`. Test ở `test/cart.test.js:44` kiểm qty = 10 được nhận, thêm 1 thì ném `QTY_LIMIT`, và tồn kho khớp. |
| 5. Giữ nguyên tên và signature hàm export | Đạt | `git diff fda3a6a -- src`: không đổi dòng `export function` nào. |
| 6. Không làm hỏng hành vi có sẵn | **Không** | `src/cart.js:20` `if (!(i < 0)) return;` gây hai lỗi: (a) xóa SKU có trong giỏ thì hàm thoát sớm, dòng hàng không bị xóa và tồn kho không được trả lại; (b) xóa SKU không có thì `cart.lines[-1].qty` ném TypeError. Bản gốc `fda3a6a` dùng `if (i < 0) return;` là đúng. Kết luận này dựa trên đọc code; tôi không chạy được lệnh vì hook chặn. |
| 7. Có test hồi quy và `npm test` xanh | Đạt (có lưu ý) | CCoding tự chạy: trước khi sửa exit 1, sau khi sửa exit 0, 6/6 đạt. Không có test nào cho `removeItem`. |

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng hoàn toàn. Khách không bỏ được hàng khỏi giỏ, hàng đã giữ trong kho không được trả lại, và hàm ném TypeError khi xóa SKU không có trong giỏ.
- **Thấp:** Đề bài có thể hiểu theo hai cách: làm tròn số tiền giảm (bản sửa đang làm vậy, 0,5 → giảm 1) hoặc làm tròn tổng sau giảm (4,5 → 5). Hai cách chỉ cho kết quả khác nhau ở trường hợp đúng .5. Cách hiện tại khớp câu "percentage discounts round half-up". Giám đốc nên xác nhận.
- **Thấp:** `reserve` giờ ném `INSUFFICIENT_STOCK` cả khi qty không hợp lệ, trong khi lẽ ra nên là một lỗi kiểu BAD_QTY. Qua `addItem` thì không ảnh hưởng vì `addItem` đã kiểm qty trước.
- Bước review được bỏ qua vì "không thuộc diện bắt buộc". Cổng chất lượng chỉ dựa vào `npm test`, nên không bắt được lỗi ở đoạn code không có test.

## Việc tiếp theo
- **Khôi phục `removeItem` và thêm test** · Phạm vi: `src/cart.js:20`, `test/cart.test.js` · Đề xuất giao cho Phòng Phát triển (@senior-swe), có review chéo.
