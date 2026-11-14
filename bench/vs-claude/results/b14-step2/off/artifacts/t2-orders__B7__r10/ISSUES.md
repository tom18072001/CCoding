# Lỗi khách hàng báo (bản 1.4.2)

Các báo cáo dưới đây đến từ bộ phận CSKH — chỉ mô tả triệu chứng, chưa ai điều tra nguyên nhân. Hành vi đúng được mô tả trong chú thích của từng module (`src/*.js`) và trong từng báo cáo.

1. **Sai 1 xu khi giá có 3 chữ số thập phân.** Sản phẩm nhập giá `1.005` bị lưu thành `1.00` (phải là `1.01`, làm tròn half away from zero; `-1.005` → `-1.01`). Giá `2.675` cũng bị lệch. Kiểm tra mọi chỗ đổi số tiền sang xu (giá sản phẩm, mã giảm cố định, giá trị đơn tối thiểu).
2. **Tổng giảm giá bị hụt.** Giỏ 3 món, mã giảm cố định `10.00` nhưng tổng giảm trên hóa đơn chỉ `9.99`. Tương tự với mã giảm %. Tổng giảm của các dòng phải đúng bằng số tiền giảm của mã, chia theo phương pháp phần dư lớn nhất như mô tả ở `allocate`.
3. **Mua 2 tặng 1 tặng sai.** Giỏ có 2 hộp đã được miễn phí 1 hộp. Đúng: phải có đủ 3 hộp thì 1 hộp miễn phí; 5 hộp → 1 miễn phí; 6 hộp → 2 miễn phí. Áp dụng tương tự cho mọi cấu hình mua X tặng Y.
4. **Mã còn hạn bị báo hết hạn.** Mã `endsAt: '2026-11-30'` bị từ chối lúc 10h sáng (UTC) ngày 30/11. Mã phải dùng được tới hết ngày `endsAt` (UTC) và bị từ chối từ `2026-12-01T00:00:00Z`.
5. **Kho báo hết hàng sai.** Kho còn 4, khách thêm 2 vào giỏ rồi sửa số lượng thành 3 → báo hết hàng. Khách xóa món khỏi giỏ nhưng khách khác vẫn không mua được món đó. Số lượng đang giữ chỗ phải luôn bằng tổng số lượng trong các giỏ.
6. **Thuế tính trên giá chưa giảm.** Khi có mã giảm giá, thuế trên hóa đơn vẫn tính theo giá gốc. Thuế phải tính trên giá sau giảm (`net`) của từng dòng.
