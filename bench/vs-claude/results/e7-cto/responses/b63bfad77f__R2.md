## Tóm tắt
**Nghiệm thu.** Đề bài nêu ba lỗi, và cả ba đều đã được sửa tận gốc ở `src/`. Coupon giờ chỉ trừ một lần trên tổng tiền hàng và làm tròn half-up về số nguyên. Kho không còn bị âm. Một dòng hàng mua được đúng `MAX_QTY_PER_LINE`. Tên và chữ ký của các hàm export giữ nguyên, có test hồi quy cho từng lỗi. Theo lần chạy của CCoding, `npm test` trước khi sửa thoát mã 1, sau khi sửa thoát mã 0 với 9/9 test đạt. Tôi không tự chạy lại được vì hook chặn `npm`.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Coupon chỉ áp một lần trên tổng tiền hàng (trước đây bị trừ hai lần nên lệch nhiều) | Đạt | `src/cart.js:28-30`: `total()` cộng `unitPrice*qty` của các dòng rồi gọi `applyPercent` đúng một lần. Bản cũ trừ % ở từng dòng rồi trừ thêm lần nữa trên tổng. Test `coupon applies once across multiple lines` cho kết quả 45000 (`test/cart.test.js:21-28`). |
| 2. Tiền là số nguyên VND, phần giảm làm tròn half-up | Đạt | `src/money.js:3`: `amount - Math.floor((amount*pct + 50)/100)`. Bản cũ trả về số lẻ. Có test cho trường hợp đúng .5 (1005 giảm 10% còn 904) và cho pct 0/100 (`test/cart.test.js:29-33, 51-58`). |
| 3. Kho không thể âm | Đạt | `src/stock.js:7`: điều kiện kiểm tra đổi từ `have < 0` thành `have < qty`. Khi đặt vượt tồn kho thì báo lỗi và tồn kho giữ nguyên (`test/cart.test.js:34-43`). |
| 4. Mua được đúng MAX_QTY_PER_LINE trên một dòng, không vượt quá | Đạt | `src/cart.js:13`: `>=` đổi thành `>`. Kiểm tra giới hạn chạy trước `reserve` nên khi bị từ chối thì kho không bị trừ. Có test thêm một lần đủ 10 và test cộng dồn lên đủ 10 (`test/cart.test.js:44-50, 68-76`). |
| 5. Giữ nguyên tên và chữ ký các hàm export | Đạt | `git diff 2927d06 HEAD -- src` chỉ sửa phần thân hàm, không đổi dòng khai báo hay export nào. |
| 6. Có test hồi quy và `npm test` xanh | Đạt | CCoding tự chạy `npm test`: trước khi sửa thoát mã 1, sau khi sửa thoát mã 0, 9 pass / 0 fail. Tôi không chạy lại được vì hook chặn `npm`. |

## Rủi ro & việc còn mở
- Cách hiểu "half-up": code đang làm tròn **số tiền giảm** rồi lấy tổng trừ đi. Nếu giám đốc muốn làm tròn **tổng sau giảm** thì ở các ca đúng .5 sẽ chênh 1 đồng, ví dụ 50đ giảm 1% ra 49 thay vì 50. Cách hiện tại khớp với chú thích trong `money.js`.
- Nếu `pct` không phải số nguyên (ví dụ 12.5), phép tính dấu phẩy động có thể lệch ở biên làm tròn. Code cũng không kiểm tra `pct` nằm trong khoảng 0–100. Cả hai nằm ngoài phạm vi đề bài, mức ảnh hưởng thấp.
- Các test dùng chung một kho toàn cục (`stock` Map), mỗi test dùng một mã SKU riêng nên hiện không ảnh hưởng nhau. Nếu sau này test chạy song song hoặc dùng lại SKU thì có thể vỡ.

## Việc tiếp theo
- **Kiểm tra đầu vào coupon** · Cho `applyCoupon` từ chối `pct` không hợp lệ (âm, lớn hơn 100, không phải số nguyên) và thêm test · Phòng Phát triển (đề xuất, chờ giám đốc quyết).
