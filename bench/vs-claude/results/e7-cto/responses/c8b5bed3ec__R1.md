## Tóm tắt
Chưa nghiệm thu. Các tính năng chính (filter, sort, cursor pagination, validation) đúng với đề bài khi đọc code. Tuy nhiên diff làm hỏng routing: `src/handler.js:6` đổi `req.method === 'GET' && req.path === '/tickets'` thành `||`. Hậu quả là mọi request GET đều trả danh sách tickets. `GET /tickets/5` không còn trả một ticket và đường dẫn lạ không còn trả 404. Đây là hồi quy so với hành vi cũ, và 74 test xanh không phát hiện ra. Tôi chỉ đọc code, không chạy lại lệnh nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Không tham số: trả mảng trần sắp theo id, client cũ không bị ảnh hưởng | Đạt | `handler.js:54-95`: không có `limit` thì trả `items` là mảng; sort mặc định `id`. |
| `status` và `assignee` lọc theo danh sách, `none` khớp `assignee === null`, giá trị status sai thì 400 | Đạt | `handler.js:56-63, 89-93`; `STATUSES` lấy từ `data.js`. |
| `sort` gồm `id`/`priority`/`createdAt`, tiền tố `-` là giảm dần, đồng hạng theo `id` tăng dần | Đạt | `handler.js:65-69, 94`: `dir * cmp(...) \|\| a.id - b.id`. |
| `limit` 1–100 trả `{items, nextCursor}`, trang cuối `null`; cursor chỉ hợp lệ với cùng status/assignee/sort | Đạt | `handler.js:70-75, 97-106`; cursor ký bằng `sig` (`:77`) và kiểm ở `:41`. |
| Validation: 400 với `invalid_<param>`, `cursor` không có `limit` thì `invalid_cursor`, tham số lạ bị bỏ qua | Đạt | `handler.js:18, 82-84`; `limit` chỉ nhận `^\d+$`. |
| Không làm đổi hành vi routing hiện có (`GET /tickets/:id`, 404) | **Không** | `handler.js:6` dùng `\|\|`. Bản gốc ở commit `8a70543` dùng `&&`. Nhánh `/tickets/:id` ở dòng 9 không bao giờ chạy với GET. |
| `npm test` xanh và có test cho tính năng mới | Đạt, có giới hạn | Báo cáo: baseline 1 test, sau thực thi 74 pass, 0 fail. Test tính năng mới nằm ở `test/tickets-query.test.js`. Bộ test không bắt được lỗi routing ở dòng 6. |

## Rủi ro & việc còn mở
- **Cao:** `GET /tickets/:id` và mọi GET tới đường dẫn khác (kể cả không tồn tại) trả 200 kèm danh sách tickets thay vì ticket đơn lẻ hoặc 404. Client đang gọi chi tiết ticket sẽ nhận sai dữ liệu.
- **Trung bình:** thiếu test hồi quy cho `GET /tickets/:id`, đường dẫn lạ và method không phải GET.
- **Thấp:** ở dòng 62 `assignee` chấp nhận mọi chuỗi không rỗng nên tên lạ chỉ cho kết quả rỗng. Đề bài không yêu cầu 400 ở đây. Giá trị `none` là giá trị đặc biệt nên một người tên "none" sẽ bị trùng với nó.

## Việc tiếp theo
- **Sửa hồi quy routing trong `handler.js`:** đổi dòng 6 về `req.method === 'GET' && req.path === '/tickets'`. Thêm test cho `GET /tickets/5` (200, một ticket), `GET /tickets/999` (404), `GET /unknown` (404) và `POST /tickets` (404). Xong khi `npm test` xanh và các test mới thất bại nếu đảo về `||`. Người làm: `@senior-swe`.
