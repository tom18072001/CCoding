## Tóm tắt
Chưa nghiệm thu. `src/iis.js:49` đổi `time-taken` từ ms sang ns sai chiều: nó chia cho 1e6 (`n / 1e6`) thay vì nhân. Ví dụ `time-taken` = 1500 ms cho ra 0.0015 thay vì 1_500_000_000. `npm test` xanh chỉ vì test hiện có không kiểm `event.duration`. Các quy tắc còn lại đọc code thấy khớp đề bài.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` chạy xanh | Đạt | Báo cáo: sau thực thi exit 0, 1 pass / 0 fail (kết quả CCoding tự chạy). |
| `#Fields:` nhiều lần, directive khác và dòng trống bị bỏ qua, dòng trước `#Fields:` bị bỏ qua | Đạt | `src/iis.js:26-32`. Tôi chỉ đọc code, chưa chạy. |
| Dòng sai số cột bị bỏ qua, `-` bị bỏ key, đầu ra là object lồng nhau | Đạt | `src/iis.js:34`, `:40`, hàm `setPath` ở `:2-6`. Chỉ đọc code. |
| Ánh xạ chuỗi và số (`server.ip`, `client.ip`, `http.request.method`, `url.path`, `url.query`, `user.name`, `http.response.status_code`, `server.port`), `user_agent.original` đổi `+` thành khoảng trắng | Đạt | `src/iis.js:8-19`, `:50-51`. Chỉ đọc code. |
| `@timestamp` là ISO 8601 UTC có mili giây | Đạt | `src/iis.js:54-57` dùng `new Date(...Z).toISOString()`. Chỉ đọc code. |
| `time-taken` (ms) → `event.duration` (ns) | **Không** | `src/iis.js:49` dùng `n / 1e6`, đúng phải là `n * 1e6`. Grep `test/` không thấy test nào cho `duration` hay `time-taken`. |
| Có test cho các quy tắc chính, gồm duration | Không | Chỉ có `test/basic.test.js`, không có khớp với duration. |

## Rủi ro & việc còn mở
- Lỗi đổi đơn vị làm sai dữ liệu `event.duration` ở mọi bản ghi có `time-taken`. Test không bắt được lỗi này.
- Chưa có test cho nhiều `#Fields:`, giá trị `-`, dòng sai số cột và `+` trong user-agent. Mấy mục này tôi chỉ đánh giá qua đọc code.
- Cạnh biên: `date` hoặc `time` là `-` thì không có `@timestamp`. Hành vi này hợp lý.

## Việc tiếp theo
- **Sửa đổi đơn vị `event.duration`** · Đổi `n / 1e6` thành `n * 1e6` ở `src/iis.js:49` và thêm test (ví dụ `time-taken` 1500 → 1500000000) · dev (`@senior-swe`). Xong khi `npm test` xanh và test duration nằm trong repo.
- **Bổ sung test hồi quy** · Nhiều `#Fields:`, `-`, dòng sai số cột, `+` trong user-agent, timestamp · dev. Xong khi các test này đều xanh.
