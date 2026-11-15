## Tóm tắt

Cả ba lỗi đều được sửa đúng gốc ở `src/`, và các hàm export giữ nguyên tên và chữ ký. Có test hồi quy cho từng lỗi. Tôi đã đọc diff `HEAD~1` và `test/cart.test.js`. Tôi không tự chạy lại `npm test` vì lệnh cần được duyệt, nên kết quả test dựa vào bằng chứng của báo cáo: 9/9 pass, exit 0. Một điểm còn mở là cách làm tròn khi chiết khấu có phần lẻ đúng 0,5 đồng.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon chỉ áp một lần lên subtotal | Đạt | `src/cart.js` `total()` giờ cộng `unitPrice*qty` các dòng rồi gọi `applyPercent` một lần. Trước đó coupon bị áp hai lần (từng dòng, rồi tổng). Test "coupon applies once across multiple lines". |
| Chiết khấu % ra số nguyên dong, làm tròn half-up | Đạt | `src/money.js` dùng `amount - Math.floor((amount*pct+50)/100)`. Đây là làm tròn half-up trên số tiền chiết khấu. Test "rounds half-up", và test pct 0, pct 100, giỏ rỗng. |
| Tồn kho không âm | Đạt | `src/stock.js`: điều kiện `have < 0` đổi thành `have < qty`. Có test "stock cannot go negative". |
| Mua được đúng MAX_QTY_PER_LINE (10) trên một dòng, không hơn | Đạt | `src/cart.js`: `>=` đổi thành `>`. Test "exactly MAX_QTY_PER_LINE but not more" và "existing line can grow to exactly MAX". |
| Giữ nguyên tên và chữ ký các hàm export | Đạt | Diff `HEAD~1` chỉ đổi thân hàm. Không có export nào bị đổi hoặc xóa. |
| Có test hồi quy cho cả 3 lỗi | Đạt | `test/cart.test.js` có 9 test, trong đó có test cho coupon, làm tròn, tồn kho và giới hạn số lượng. |
| `npm test` xanh | Đạt (theo báo cáo, tôi không tự chạy lại) | Mục "Lệnh kiểm tra của dự án" ghi baseline exit 1, sau sửa exit 0 với 9 pass, 0 fail. Đây là bằng chứng CCoding tự chạy, không qua agent. |

## Rủi ro / việc còn mở
- Đề bài nói "chiết khấu làm tròn half-up". Code làm tròn phần chiết khấu lên, nên tổng tiền làm tròn xuống ở trường hợp .5. Đây là cách hiểu hợp lý, nhưng nên xác nhận với giám đốc.
- `applyCoupon` không kiểm tra `pct` (âm, trên 100, không nguyên). Đề bài không yêu cầu việc này.
- `removeItem` hoàn trả kho theo số lượng của dòng, và logic này không đổi. Tôi chưa thấy lỗi ở đó.

```json
{"accepted": true, "summary": "Ba lỗi (coupon áp hai lần kèm số lẻ, kho âm, giới hạn số lượng lệch một đơn vị) đã được sửa đúng gốc, kèm test hồi quy; npm test xanh 9/9 theo báo cáo. Tôi không tự chạy lại npm test.", "criteria": [{"name": "Coupon áp một lần lên subtotal", "result": "pass", "evidence": "src/cart.js total() chỉ gọi applyPercent một lần; test 'coupon applies once across multiple lines'"}, {"name": "Chiết khấu % ra số nguyên dong, làm tròn half-up", "result": "pass", "evidence": "src/money.js dùng Math.floor((amount*pct+50)/100); test rounds half-up và test pct 0, pct 100"}, {"name": "Tồn kho không âm", "result": "pass", "evidence": "src/stock.js đổi have < 0 thành have < qty; test 'stock cannot go negative'"}, {"name": "Mua được đúng MAX_QTY_PER_LINE, không hơn", "result": "pass", "evidence": "src/cart.js đổi >= thành >; hai test về MAX_QTY_PER_LINE"}, {"name": "Giữ nguyên tên và chữ ký export", "result": "pass", "evidence": "git diff HEAD~1 -- src chỉ đổi thân hàm"}, {"name": "Có test hồi quy cho cả 3 lỗi", "result": "pass", "evidence": "test/cart.test.js có 9 test bao phủ cả ba nhóm lỗi"}, {"name": "npm test xanh", "result": "pass", "evidence": "Báo cáo: baseline exit 1, sau sửa exit 0 với 9 pass, 0 fail (CCoding tự chạy); tôi không chạy lại"}], "risks": ["Làm tròn half-up áp lên phần chiết khấu, nên tổng tiền làm tròn xuống ở trường hợp .5; cần xác nhận cách hiểu với giám đốc", "applyCoupon không kiểm tra pct (âm, trên 100, không nguyên)", "Kết quả npm test dựa vào báo cáo, tôi không tự chạy lại"], "followUps": [{"title": "Kiểm tra đầu vào coupon", "brief": "Thêm kiểm tra pct trong applyCoupon (số nguyên từ 0 đến 100, ngược lại ném lỗi), giữ nguyên chữ ký hàm, và thêm test.", "department": "dev"}]}
```