## Tóm tắt
Chưa nghiệm thu. Ba lỗi đề bài nêu (coupon, tồn kho âm, mua đúng số lượng tối đa) đã được sửa đúng và có test hồi quy. Tuy nhiên, diff lại **đưa vào một lỗi mới** ở `removeItem`: điều kiện bị đảo ngược. Test không phủ hàm này nên không bắt được. Tôi không chạy được `npm test` vì hook chặn lệnh, nên kết quả test dựa vào báo cáo của CCoding (exit 0, 6/6 pass).

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Coupon áp một lần lên subtotal, không áp theo từng dòng | Đạt | `src/cart.js` `total()` cộng các dòng rồi gọi `applyPercent` một lần. Có test "coupon applied once…". |
| Giảm giá % ra số nguyên VND, làm tròn half-up | Đạt | `src/money.js`: `Math.floor((amount*pct+50)/100)`. Test 1005×10% → 904 và 10016 → 9014. |
| Tồn kho không âm | Đạt (cho `reserve`) | `src/stock.js` kiểm `have < qty` và qty nguyên dương. Test "stock cannot go negative". |
| Mua được đúng `MAX_QTY_PER_LINE`, vượt thì báo `QTY_LIMIT` | Đạt | `src/cart.js` đổi `>=` thành `>`. Test "can buy exactly MAX…". |
| Không làm hỏng hành vi hiện có (giữ nguyên tên và chữ ký hàm export, không gây hồi quy) | **Không** | `git diff cbc3a44 HEAD -- src/cart.js`: `if (i < 0) return;` bị đổi thành `if (!(i < 0)) return;`. Hậu quả: xóa SKU có trong giỏ thì thoát ngay, không `release` tồn kho và không xóa dòng. Xóa SKU không có thì `cart.lines[-1].qty` ném TypeError. Không có test nào cho `removeItem`. |
| `npm test` xanh và có test hồi quy | Đạt một phần | Báo cáo CCoding: baseline exit 1, sau sửa exit 0 (6 pass). Tôi không tự chạy lại được (hook chặn `npm`). Test chỉ phủ 3 nhóm lỗi, không phủ `removeItem`/`release`. |

## Rủi ro & việc còn mở
- **Cao:** `removeItem` hỏng như mô tả ở trên. Tồn kho bị rò (giữ chỗ mà không nhả) và có thể crash. Diff gốc cho thấy base đúng, nên đây là hồi quy do lần sửa này gây ra. Review tự động ghi "đã duyệt" mà không phát hiện.
- Trung bình: `applyCoupon` không kiểm `pct` trong khoảng 0–100 hoặc số nguyên. Việc này ngoài đề bài nên chỉ ghi nhận.
- Thấp: tồn kho là `Map` trong bộ nhớ dùng chung giữa các test. Hiện các test dùng SKU khác nhau nên chưa gây lỗi.

## Việc tiếp theo
- **Sửa hồi quy `removeItem` và thêm test.** Phạm vi: trả lại `if (i < 0) return;` trong `src/cart.js`. Thêm test: xóa dòng thì `available` tăng lại đúng số lượng và dòng biến mất, xóa SKU không tồn tại thì không ném lỗi. Giao `@senior-swe`. Xong khi `npm test` xanh và diff không còn đảo điều kiện.
