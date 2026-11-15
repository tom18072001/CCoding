## Tóm tắt
**Chưa nghiệm thu.** Các tham số mới (lọc, sắp xếp, phân trang bằng cursor, validation) được làm đúng đề bài và `npm test` chạy xanh 74/74. Tuy vậy, có một lỗi hồi quy ở bộ định tuyến: tại `src/handler.js:6`, điều kiện `&&` của bản gốc bị đổi thành `||`. Vì vậy **mọi request GET** đều trả về danh sách: `GET /tickets/5` không còn trả về một ticket mà trả về cả mảng, còn `POST /tickets` cũng trả về danh sách thay vì 404. Không có test nào phát hiện lỗi này, vì cả hai tệp test chỉ gọi `GET /tickets`.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Gọi `GET /tickets` không tham số vẫn trả mảng trần, sắp theo id | Đạt | `src/handler.js:95`; `test/existing.test.js:4`, `test/tickets-query.test.js:24,31`; CCoding chạy `npm test` → exit 0 |
| 2. Lọc `status` (giá trị phải thuộc `STATUSES`) và `assignee` (có giá trị `none`) | Đạt | `src/handler.js:56-64,89-93`; các test ở dòng 37, 50, 189 |
| 3. `sort` nhận `id`/`priority`/`createdAt`, có thể thêm `-`; hòa thì xếp theo id tăng dần bất kể chiều | Đạt | `src/handler.js:65-69,94` (`dir*cmp(...) \|\| a.id - b.id`); các test ở dòng 73, 78, 197 |
| 4. `limit` từ 1 đến 100 thì trả `{items, nextCursor}`; trang cuối có `nextCursor` là null; cursor chỉ dùng được với đúng `status`/`assignee`/`sort` đã phát hành nó | Đạt | `src/handler.js:70-75,76-85,97-106` (keyset + chữ ký tham số); các test ở dòng 122, 129, 140, 146, 156, 182 |
| 5. Tham số sai trả 400 `{error:'invalid_<param>'}`, kể cả `cursor` không kèm `limit`; tham số lạ bị bỏ qua | Đạt | `src/handler.js:18,58,63,68,72-74,82-84`; các test ở dòng 189-228 |
| 6. Không làm hỏng các route khác: `GET /tickets/:id` và 404 cho route lạ | **Không** | Bản gốc (`git show 1903806:src/handler.js`) dùng `req.method === 'GET' && req.path === '/tickets'`. Bản mới ở `src/handler.js:6` dùng `\|\|`, nên nhánh `/tickets/:id` ở dòng 9 không bao giờ được chạy tới với GET. Tôi kết luận từ việc đọc code; không chạy thử được vì vai trò chỉ đọc chặn lệnh `node` |
| 7. Có test và `npm test` xanh | Đạt (một phần) | 74/74 pass theo lần chạy của CCoding. Nhưng chưa có test cho route `/tickets/:id` hay cho 404 |

## Rủi ro & việc còn mở
- **Cao:** client gọi `GET /tickets/:id` sẽ nhận một mảng thay vì object. Đây là thay đổi phá vỡ hợp đồng API, đi ngược yêu cầu "không được thay đổi" trong đề bài.
- **Trung bình:** hiện không có test hồi quy cho các route ngoài `GET /tickets`, nên lỗi lọt qua cổng chất lượng.
- **Thấp, không chặn:** chữ ký cursor gom danh sách thành tập đã sắp xếp. Vì vậy `status=open,closed` và `status=closed,open` dùng chung cursor được. Cách này hợp lý về ngữ nghĩa nhưng nên ghi lại thành quyết định.

## Việc tiếp theo
- **Sửa hồi quy định tuyến ở handler** · Phạm vi: đổi `||` thành `&&` ở `src/handler.js:6`, rồi thêm test cho `GET /tickets/:id` (có tồn tại → 200 trả object, không tồn tại → 404), cho `POST /tickets` → 404 và cho route lạ → 404 · Người làm: `@senior-swe` (phòng dev) · Xong khi: `npm test` xanh và các test mới đều pass.
