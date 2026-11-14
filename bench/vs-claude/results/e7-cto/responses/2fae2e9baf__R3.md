## Tóm tắt

**Không nghiệm thu.** Ba lỗi khách báo đã được sửa đúng và có test. Nhưng bản sửa đã làm hỏng `removeItem` trong `src/cart.js`. Hàm này vốn đúng, và không có test nào phủ nó nên `npm test` vẫn xanh.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon chỉ áp một lần lên subtotal | Đạt | `src/cart.js` `total()` cộng `unitPrice*qty` rồi gọi `applyPercent` một lần. Test "coupon applies once to subtotal" trong `test/cart.test.js`. |
| Giảm giá % làm tròn half-up, kết quả là số nguyên dong | Đạt | `src/money.js` dùng `floor((amount*pct*2+100)/200)`. Test 15% trên 999 ra 849, test 10% trên 5 ra 4. |
| Tồn kho không âm | Đạt | `src/stock.js` `reserve` chặn khi `have < qty` hoặc `qty` không hợp lệ. Test "stock cannot go negative". |
| Mua được đúng `MAX_QTY_PER_LINE`, vượt thì báo `QTY_LIMIT` | Đạt | `src/cart.js` đổi `>=` thành `>`. Test "can buy exactly MAX_QTY_PER_LINE". |
| Giữ tên và chữ ký các hàm export | Đạt | Diff chỉ đổi phần thân hàm. |
| Không gây lỗi mới (regression) | **Không** | `src/cart.js` dòng 20: `if (!(i < 0)) return;`. Trước khi sửa là `if (i < 0) return;`. Hiện giờ, SKU có trong giỏ thì `removeItem` thoát ngay, không xóa dòng và không trả lại tồn kho. SKU không có trong giỏ thì `cart.lines[-1].qty` ném `TypeError`. |
| Có test hồi quy cho các lỗi đã sửa | Đạt một phần | Cả ba lỗi đều có test. `removeItem` không có test nào, nên không bắt được lỗi trên. |
| `npm test` xanh | Đạt | Báo cáo ghi 6 pass, 0 fail. Tôi chưa chạy lại vì lệnh bị chặn quyền. Tôi đã đọc diff và test trực tiếp. |

## Rủi ro và việc còn mở

- `removeItem` hỏng: giỏ hàng không bỏ được món và tồn kho bị giữ mãi. Đây là lỗi mới do bản sửa gây ra.
- Phần nhận xét "diff không chạm vùng bảo mật" và duyệt tự động của báo cáo không phát hiện được lỗi này.
- Chưa có validate cho `couponPct` (âm, trên 100, không phải số). Việc này nằm ngoài đề bài.

```json
{"accepted": false, "summary": "Ba lỗi khách báo đã sửa đúng và có test, nhưng bản sửa làm hỏng removeItem ở src/cart.js dòng 20 (đảo điều kiện thành `!(i < 0)`). Hàm này không có test nên npm test vẫn xanh.", "criteria": [{"name": "Coupon áp một lần lên subtotal", "result": "pass", "evidence": "src/cart.js total(); test 'coupon applies once to subtotal'"}, {"name": "Giảm giá % làm tròn half-up, ra số nguyên dong", "result": "pass", "evidence": "src/money.js applyPercent; test 849 và 4"}, {"name": "Tồn kho không âm", "result": "pass", "evidence": "src/stock.js reserve; test 'stock cannot go negative'"}, {"name": "Mua đúng MAX_QTY_PER_LINE", "result": "pass", "evidence": "src/cart.js đổi >= thành >; test 'can buy exactly MAX_QTY_PER_LINE'"}, {"name": "Giữ tên và chữ ký export", "result": "pass", "evidence": "git diff HEAD~1 -- src chỉ đổi phần thân hàm"}, {"name": "Không gây regression", "result": "fail", "evidence": "src/cart.js dòng 20: `if (!(i < 0)) return;` làm removeItem không xóa dòng, không release tồn kho, và ném TypeError khi SKU không có trong giỏ"}, {"name": "Test hồi quy cho các lỗi đã sửa", "result": "pass", "evidence": "test/cart.test.js có test cho cả ba lỗi; không có test cho removeItem"}], "risks": ["removeItem hỏng: không bỏ được món khỏi giỏ, tồn kho bị giữ mãi, và ném lỗi khi SKU không có trong giỏ", "Cổng chất lượng tự động không phát hiện lỗi vì không có test cho removeItem", "Chưa validate couponPct (âm, >100, không phải số), ngoài phạm vi đề bài"], "followUps": [{"title": "Sửa removeItem và thêm test", "brief": "Trong src/cart.js, removeItem có điều kiện bị đảo thành `if (!(i < 0)) return;`. Khôi phục thành `if (i < 0) return;`. Thêm test trong test/cart.test.js: (1) xóa SKU có trong giỏ thì dòng bị xóa và available() trả lại đủ qty; (2) xóa SKU không có thì không ném lỗi và không đổi tồn kho. Giữ nguyên tên và chữ ký các hàm export. Chạy npm test.", "department": "dev"}]}
```