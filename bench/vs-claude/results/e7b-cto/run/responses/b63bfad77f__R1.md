## Tóm tắt
Nghiệm thu. Ba lỗi trong đề bài đều có nguyên nhân gốc được sửa đúng chỗ ở `src/cart.js`, `src/money.js` và `src/stock.js`. Mỗi lỗi có test hồi quy, và `npm test` chuyển từ exit 1 (baseline) sang exit 0 với 9/9 test đạt. Tôi không tự chạy lại `npm test` được vì hook chặn lệnh `npm`, nên kết quả chạy dựa vào số liệu CCoding ghi trong báo cáo. Phần code và test thì tôi đã đọc trực tiếp.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon chỉ áp một lần lên subtotal, không áp theo từng dòng | Đạt | `src/cart.js` `total()` giờ cộng `unitPrice*qty` trước, rồi gọi `applyPercent` một lần. Test "coupon applies once across multiple lines": 10000 + 2×20000 = 50000, giảm 10% còn 45000. |
| Giảm giá theo % làm tròn half-up về đồng nguyên | Đạt | `src/money.js`: `amount - Math.floor((amount*pct+50)/100)`. Test: `applyPercent(1005,10)=904`, `applyPercent(999,15)=849`, kết quả là số nguyên, biên pct 0 và 100 đúng. |
| Tồn kho không âm: `reserve` từ chối khi không đủ hàng | Đạt | `src/stock.js` đổi `have < 0` thành `have < qty`. Test "stock cannot go negative": mua 4 khi tồn 3 thì báo lỗi và tồn giữ nguyên 3; mua 3 thì tồn về 0; mua thêm 1 thì báo lỗi. |
| Mua đúng `MAX_QTY_PER_LINE` được, vượt thì báo `QTY_LIMIT` | Đạt | `src/cart.js` đổi `>=` thành `>`. Hai test: mua một lần đúng 10, và cộng dồn trên dòng có sẵn lên đúng 10; thêm 1 nữa thì báo `QTY_LIMIT`. |
| Giữ nguyên tên và chữ ký hàm export | Đạt | Diff `src` chỉ sửa phần thân hàm. Các export `createCart`, `addItem`, `removeItem`, `applyCoupon`, `total`, `applyPercent`, `sum`, `setStock`, `available`, `reserve`, `release` không đổi. |
| Có test hồi quy và `npm test` xanh | Đạt (dựa trên số liệu CCoding ghi) | `test/cart.test.js` có 9 test. Báo cáo ghi baseline exit 1 và sau sửa exit 0 (9 pass, 0 fail). Tôi chưa tự chạy lại được vì hook chặn `npm`. |

## Rủi ro & việc còn mở
- Thứ tự kiểm tra trong `addItem` là `QTY_LIMIT` rồi mới `reserve`, nên không có tồn kho bị trừ khi báo lỗi. Hành vi này đúng.
- Test dùng trạng thái stock toàn cục trong module, nhưng mỗi test dùng một SKU riêng nên chưa gây xung đột. Test mới dùng lại SKU cũ thì có thể phát sinh phụ thuộc thứ tự chạy.
- Chưa có validation cho `pct` ngoài khoảng 0–100 trong `applyCoupon`, và `unitPrice` không được kiểm tra là số nguyên. Đề bài không yêu cầu hai phần này.
- Khi thêm vào dòng có sẵn, `unitPrice` mới bị bỏ qua và giữ giá cũ. Đề bài không nói gì về trường hợp này.

## Việc tiếp theo
Đề xuất, giám đốc quyết định có giao hay không:
- **Validate đầu vào coupon và giá** · `applyCoupon` giới hạn pct trong 0–100; `addItem` kiểm tra `unitPrice` là số nguyên không âm; kèm test · dev.
