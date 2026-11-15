## Tóm tắt

Ba lỗi trong đề bài đã được sửa đúng gốc rễ và `npm test` xanh (6/6). Tuy nhiên diff còn đưa vào một **lỗi hồi quy mới** trong `removeItem` (`src/cart.js`). Các test hiện có không phát hiện ra lỗi này. Vì vậy tôi **không nghiệm thu**. Báo cáo phòng ban ghi "đạt" là sai.

Lỗi hồi quy: dòng `if (i < 0) return;` ở base đã bị đổi thành `if (!(i < 0)) return;`.
- Khi SKU có trong giỏ, hàm thoát ngay, nên dòng không bị xoá và tồn kho không được hoàn lại.
- Khi SKU không có trong giỏ, hàm chạy tiếp và gặp `cart.lines[-1].qty`, ném `TypeError`.

Tôi chưa chạy lại `npm test` (lệnh bị chặn xin phép). Kết quả 6/6 lấy từ báo cáo, còn diff và test tôi đã đọc trực tiếp.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp dụng một lần lên subtotal, không áp theo từng dòng | Đạt | `src/cart.js` `total()` giờ chỉ cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Test "coupon applied once across multiple lines" kiểm tra giá trị 9014. |
| Giảm giá phần trăm làm tròn half-up, kết quả là số nguyên dong | Đạt | `src/money.js`: `Math.floor((amount*pct+50)/100)`. Test "percentage rounds half-up" (1005 giảm 10% còn 904). |
| Tồn kho không âm | Đạt | `src/stock.js` `reserve` giờ kiểm `have < qty` và `qty` hợp lệ. Test "stock cannot go negative". |
| Mua được đúng `MAX_QTY_PER_LINE` trên một dòng, vượt thì bị chặn | Đạt | `src/cart.js`: `>=` đổi thành `>`. Test "can buy exactly MAX_QTY_PER_LINE, not more". |
| Giữ nguyên tên và chữ ký hàm export | Đạt | Diff không đổi chữ ký nào. |
| Có test hồi quy cho từng lỗi | Đạt | `test/cart.test.js` có 4 test mới, tương ứng ba lỗi. |
| Không gây hồi quy ở chức năng khác (`removeItem`) | **Không** | Diff `src/cart.js` đổi `if (i < 0) return;` thành `if (!(i < 0)) return;`. Không test nào gọi `removeItem`. |
| `npm test` xanh sau thực thi | Đạt | Báo cáo: exit 0, 6 pass, 0 fail. Tôi chưa chạy lại. |

## Rủi ro và việc còn mở

- `removeItem` hỏng: không xoá được dòng, không hoàn kho, và ném lỗi khi SKU không tồn tại.
- Quy trình review tự động đã bỏ sót lỗi này vì không có test nào phủ `removeItem`.
- `applyCoupon` chưa kiểm tra `pct` nằm trong khoảng 0–100.
- `addItem` chưa kiểm tra `unitPrice` hợp lệ.

```json
{"accepted": false, "summary": "Ba lỗi theo đề bài đã được sửa đúng và test xanh, nhưng diff làm hỏng removeItem (đảo điều kiện thành `!(i < 0)`) mà không có test phát hiện, nên không nghiệm thu.", "criteria": [{"name": "Coupon áp dụng một lần lên subtotal", "result": "pass", "evidence": "src/cart.js total() chỉ cộng unitPrice*qty rồi applyPercent một lần; test 'coupon applied once across multiple lines' (9014)"}, {"name": "Giảm giá % làm tròn half-up, kết quả nguyên dong", "result": "pass", "evidence": "src/money.js Math.floor((amount*pct+50)/100); test 'percentage rounds half-up' (904)"}, {"name": "Tồn kho không âm", "result": "pass", "evidence": "src/stock.js reserve kiểm have < qty và qty hợp lệ; test 'stock cannot go negative'"}, {"name": "Mua đúng MAX_QTY_PER_LINE, vượt thì bị chặn", "result": "pass", "evidence": "src/cart.js đổi >= thành >; test 'can buy exactly MAX_QTY_PER_LINE, not more'"}, {"name": "Giữ nguyên tên và chữ ký hàm export", "result": "pass", "evidence": "git diff 550631b -- src không đổi chữ ký nào"}, {"name": "Có test hồi quy cho từng lỗi", "result": "pass", "evidence": "test/cart.test.js có 4 test mới phủ ba lỗi"}, {"name": "Không gây hồi quy ở chức năng khác (removeItem)", "result": "fail", "evidence": "git diff 550631b -- src/cart.js: 'if (i < 0) return;' bị đổi thành 'if (!(i < 0)) return;' nên không xoá dòng, không hoàn kho, và ném TypeError khi SKU không có; không test nào phủ removeItem"}, {"name": "npm test xanh sau thực thi", "result": "pass", "evidence": "Báo cáo CCoding: exit 0, 6 pass, 0 fail (tôi chưa chạy lại)"}], "risks": ["removeItem hỏng: không xoá dòng, không hoàn kho, ném TypeError khi SKU không có trong giỏ", "Không có test cho removeItem/release nên review và test xanh không bắt được lỗi hồi quy", "applyCoupon chưa kiểm tra pct nằm trong 0–100", "addItem chưa kiểm tra unitPrice hợp lệ"], "followUps": [{"title": "Sửa hồi quy removeItem và thêm test", "brief": "Trong src/cart.js, khôi phục removeItem về `if (i < 0) return;` (điều kiện hiện tại `!(i < 0)` bị đảo). Thêm test trong test/cart.test.js: (1) removeItem xoá dòng khỏi cart.lines và available(sku) tăng lại đúng qty; (2) removeItem với SKU không có trong giỏ không ném lỗi và không đổi tồn kho. Giữ nguyên tên và chữ ký hàm export, chạy npm test.", "department": "dev"}, {"title": "Kiểm tra đầu vào coupon và giá", "brief": "Thêm kiểm tra trong applyCoupon (pct là số trong 0–100) và addItem (unitPrice là số nguyên không âm), ném Error có mã rõ ràng, kèm test. Giữ nguyên chữ ký hàm export.", "department": "dev"}]}
```