## Tóm tắt
Chưa nghiệm thu. Phần filter, sort và cursor pagination đọc code thấy đúng đề bài. Nhưng `src/handler.js:6` có một lỗi hồi quy: điều kiện route bị đổi từ `&&` thành `||`. Mọi request GET, kể cả `GET /tickets/5`, giờ trả về danh sách, nên route chi tiết ticket không còn hoạt động. Lỗi này nằm ngoài các test hiện có nên 74 test vẫn xanh. Tôi không chạy được `npm test` vì hook chặn. Kết quả 74/74 pass lấy từ báo cáo của CCoding.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Không tham số thì trả mảng trần, sắp theo id; hành vi cũ ở các route khác không đổi | Không | Không tham số: mảng sắp theo id thì đúng (`handler.js:89-95`). Nhưng dòng 6 là `req.method === 'GET' \|\| req.path === '/tickets'`, bản gốc ở commit 1798a3e là `&&`. Hậu quả: `GET /tickets/5` và `GET /bất-kỳ` đều vào `listTickets`, còn nhánh dòng 9 không bao giờ chạy. Ngoài ra `POST /tickets` cũng trả 200 thay vì 404. |
| `status` và `assignee` lọc theo danh sách phân tách bằng dấu phẩy; `none` khớp `assignee === null`; giá trị status không thuộc `STATUSES` trả `invalid_status` | Đạt | `handler.js:56-63, 89-93`. `parseList` từ chối phần tử rỗng và status ngoài `STATUSES`. |
| `sort` nhận `id`, `priority`, `createdAt`, có thể thêm tiền tố `-`; đồng hạng thì xếp theo id tăng dần; mặc định là `id`; giá trị sai trả `invalid_sort` | Đạt | `handler.js:65-69, 78-79, 94`. `dir * cmp(...) \|\| a.id - b.id` giữ tie-break id tăng dần cho cả chiều giảm. Dữ liệu seed có `priority` kiểu số và `createdAt` là chuỗi ISO nên so sánh trực tiếp đúng. |
| `limit` nhận số nguyên 1-100 và trả `{items, nextCursor}`; `cursor` trả trang kế; cursor gắn với bộ `status`, `assignee`, `sort` đã cấp | Đạt (đọc code) | `handler.js:70-75, 97-106`. Cursor là keyset mã hóa base64url kèm chữ ký bộ lọc. `nextCursor` là `null` ở trang cuối. Chữ ký dùng tập đã sắp xếp và khử trùng nên không phụ thuộc thứ tự danh sách. |
| Validation: `invalid_<param>` kèm 400 cho limit, cursor sai dạng hoặc không khớp, cursor không có limit; tham số lạ bị bỏ qua | Đạt (đọc code) | `handler.js:18, 72-74, 81-85`. Tham số lạ không được đọc nên bị bỏ qua. |
| Có test, `npm test` xanh | Đạt, kèm điều kiện | Báo cáo CCoding: baseline 1 test, sau thực thi 74 pass / 0 fail; `test/tickets-query.test.js` có 244 dòng mới. Không có bằng chứng test nào phủ route `/tickets/:id` hay method khác GET, nên không bắt được lỗi hồi quy trên. Tôi không tự chạy lại được. |

## Rủi ro & việc còn mở
- **Cao:** lỗi hồi quy ở `handler.js:6`. `GET /tickets/:id` không còn trả một ticket, mà trả cả danh sách hoặc lỗi 400 nếu có query lạ. Đề bài yêu cầu client hiện tại không bị ảnh hưởng.
- **Thấp:** chưa có test cho các nhánh 404 và `/tickets/:id`. Chính chỗ thiếu này khiến lỗi hồi quy lọt qua.
- **Thấp:** `limit` như `007` vẫn hợp lệ theo regex `^\d+$`. Đề bài không nói rõ nên cần xác nhận có chấp nhận hay không.

## Việc tiếp theo
- **Sửa hồi quy route trong `handler.js`** · Đổi dòng 6 về `req.method === 'GET' && req.path === '/tickets'`. Thêm test: `GET /tickets/5` trả đúng một ticket, `GET /tickets/999` trả 404, `POST /tickets` trả 404. Chạy lại `npm test`. · dev (`@senior-swe`) · xong khi các test mới xanh và diff dòng 6 khớp bản gốc.
