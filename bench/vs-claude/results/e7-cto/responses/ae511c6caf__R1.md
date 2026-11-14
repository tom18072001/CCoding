## Tóm tắt
Tôi nghiệm thu: cả 6 lỗi trong ISSUES.md đã được sửa ở nguyên nhân gốc, đúng chỗ, và test hồi quy trong `test/regression.test.js` đều bao phủ từng lỗi. Tôi không tự chạy `npm test` được vì hook chặn lệnh `npm`. Kết quả xanh (14/14, baseline 6/6) lấy từ báo cáo phòng Phát triển, do CCoding tự chạy. Bằng chứng còn lại là đọc diff và mã nguồn. Có vài rủi ro nhỏ ở các nhánh mà test chưa chạm.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| #1 Đổi tiền sang xu làm tròn half away from zero (1.005→101, -1.005→-101, 2.675→268), áp dụng cho giá sản phẩm, mã cố định và minSubtotal | Đạt | `src/money.js:5-13` làm tròn theo chữ số thập phân. `catalog.js:13`, `checkout.js:34` và `promotions.js:32` đều gọi `toCents`. Test `#1` (2 test). |
| #2 Tổng giảm bằng đúng số tiền của mã, chia theo phần dư lớn nhất | Đạt | `allocate` trong `money.js:33-47` đã có largest remainder. Cả mã % và mã cố định đều đi qua `allocate`. Test `#2`, ví dụ `[334,333,333]`. |
| #3 Mua X tặng Y: cần đủ X+Y món thì mới tặng | Đạt | `promotions.js` đổi công thức thành `floor(qty/(buy+free))*free`. Test `#3` gồm các ca 2/3/5/6 với mua 2 tặng 1 và ca 7 với mua 3 tặng 2. |
| #4 `endsAt` dạng ngày dùng được tới hết ngày UTC, từ chối từ 00:00Z ngày kế tiếp | Đạt | `endExclusive` trong `promotions.js` cộng thêm một ngày khi `endsAt` có dạng `YYYY-MM-DD`. Test `#4` kiểm 10:00, 23:59:59.999 và 00:00 ngày kế tiếp. |
| #5 Số lượng giữ chỗ luôn bằng tổng số lượng trong giỏ (sửa số lượng, xóa món) | Đạt | `cart.js` `updateQty` chỉ reserve hoặc release phần chênh lệch. `removeItem` release đúng số lượng của dòng. Test `#5` gồm các ca sửa lên, sửa xuống, xóa và sửa về 0. |
| #6 Thuế tính trên `net` | Đạt | `checkout.js` đổi sang `lineTax(l.net, ...)`. Test `#6`: giảm 50% thì tax = 50. |
| Không đổi API công khai | Đạt | Diff chỉ sửa nội dung hàm; tên hàm, tham số và dạng kết quả không đổi. |
| `npm test` xanh | Đạt (theo báo cáo) | CCoding tự chạy: 14 pass, 0 fail. Tôi không chạy lại được vì hook chặn. |
| Hành vi đang đúng không bị hồi quy (bộ ẩn) | Chưa kiểm được | Bộ nghiệm thu ẩn chưa chạy. Chỉ có 6 test cũ vẫn xanh theo báo cáo. |

## Rủi ro & việc còn mở
- `toCents` dùng `toFixed(10)` và nhánh `abs >= 1e15` quay về `Math.round(amount*100)`. Tôi chưa thấy test cho số rất lớn, số rất nhỏ hoặc giá trị biên.
- Mã giảm `percent` và `category` dùng `Math.round` trên số nguyên xu, nên không bị ảnh hưởng bởi lỗi #1. Tôi chưa kiểm cách làm tròn khi dòng bị giảm là số âm.
- `Inventory.release` chặn dưới ở 0 bằng `Math.max`. Nếu có chỗ release lệch thì lỗi sẽ bị che, không báo ra. Chưa có test nhiều giỏ cùng tranh một SKU.
- Mã `bxgy` với giỏ có `qty` lớn chưa có test tích hợp qua `computeTotals`, chỉ test hàm `freeUnits`.
- `endExclusive` chỉ nhận chuỗi đúng dạng `YYYY-MM-DD`. Dạng có giờ vẫn so sánh theo thời điểm đó, đúng với mô tả nhưng chưa có test.

## Việc tiếp theo
- **Bổ sung test biên và tích hợp** · test `toCents` với số lớn, âm, `-0`; test `bxgy` qua `computeTotals`; test hai giỏ cùng giữ chỗ một SKU · dev (`@qa-tester`).
- **Chạy lại `npm test` ngoài hook** · xác nhận 14/14 xanh trước khi bàn giao cho giám đốc · dev.
