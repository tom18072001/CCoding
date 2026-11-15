# Báo cáo doanh số quá chậm

`buildReport` (src/report.js) mất ~15 giây với 200.000 dòng đơn hàng (`npm run bench`) — bảng điều khiển gọi nó mỗi lần mở trang. Yêu cầu:

- **Dưới 1 giây** cho 200.000 dòng / 2.000 sản phẩm / 3.000 khách (`npm run bench`, dữ liệu sinh bằng `src/gen.js`).
- **Kết quả giống hệt** bản hiện tại cho MỌI đầu vào hợp lệ (cùng cấu trúc, cùng giá trị, cùng thứ tự phần tử mảng) — bản hiện tại là đặc tả, kể cả những hành vi trông lạ. Không đổi chữ ký hàm, không sửa dữ liệu đầu vào, không dùng bộ nhớ đệm giữa các lần gọi.
- Không thêm thư viện ngoài, không dùng worker/tiến trình con.
