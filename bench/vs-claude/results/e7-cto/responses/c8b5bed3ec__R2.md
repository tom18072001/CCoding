## Tóm tắt
**Chưa nghiệm thu.** Phần query đề bài yêu cầu (filter, sort, pagination, validation) có code đúng và `npm test` đạt 74/74. Nhưng ở dòng định tuyến, điều kiện `&&` đã bị đổi thành `||`. Hậu quả là mọi request `GET`, kể cả `GET /tickets/:id` và mọi path không tồn tại, đều trả về danh sách ticket. Request `/tickets` với method khác `GET` cũng vậy. Route chi tiết ticket vì thế không bao giờ chạy tới được. Đây là regression ngoài phạm vi đề bài và test mới không bắt được.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Gọi `GET /tickets` không tham số vẫn trả mảng trần sắp theo id; các hành vi API hiện có không đổi | **Không** | `src/handler.js:6`: `if (req.method === 'GET' \|\| req.path === '/tickets')`, bản base `083f61a` là `&&`. Vì vậy `GET /tickets/5` nhận cả danh sách thay vì một ticket, path lạ nhận 200 thay vì 404, `POST /tickets` nhận danh sách. Không có test nào cho `/tickets/:id` hay các path khác (grep `test/` không ra kết quả). Riêng nhánh không tham số thì đúng: `test/existing.test.js` đạt. |
| `status` và `assignee` lọc theo danh sách phân tách bằng dấu phẩy; `none` khớp ticket có `assignee === null`; status phải thuộc `STATUSES` | Đạt | `parseList` cùng bộ lọc ở `src/handler.js` (khoảng dòng 56–64 và 87–91). Ticket có assignee null được quy về `'none'` trước khi so khớp. |
| `sort` nhận `id`, `priority`, `createdAt` (có thể thêm `-`); ticket bằng nhau xếp theo id tăng dần ở cả hai chiều; mặc định là `id` | Đạt | Bộ so sánh là `dir * cmp(...) \|\| a.id - b.id`: phần id nằm ngoài hệ số `dir` nên luôn tăng dần. |
| `limit` 1–100 trả về `{ items, nextCursor }`; trang cuối có `nextCursor = null`; cursor chỉ dùng được với đúng bộ `status`/`assignee`/`sort` đã phát hành nó | Đạt | Phân trang keyset theo điều kiện `c > 0 \|\| (c === 0 && id > cur.i)`, khớp với thứ tự sort. Chữ ký `sig` gồm tập status, tập assignee (đã bỏ trùng và sắp xếp) cùng chuỗi sort, và được so khi giải mã cursor. |
| Tham số sai trả 400 `{ error: 'invalid_<param>' }`, gồm cả `cursor` khi thiếu `limit`; tham số lạ bị bỏ qua | Đạt | Hàm `err(param)`, regex `^\d+$` kèm kiểm khoảng 1–100, nhánh `cursor` khi `limit === null`. Chỉ đọc các key đã biết nên tham số lạ không ảnh hưởng. |
| Có test và `npm test` đạt | Đạt | CCoding tự chạy: baseline 1 test, sau thực thi 74 pass, 0 fail (`test/tickets-query.test.js`, 244 dòng). |

Ghi chú: ba tiêu chí giữa bảng được đánh giá bằng cách đọc code. Hook bảo vệ chặn tôi chạy `node` để thử trực tiếp. Bằng chứng chạy thật duy nhất là 74 test đạt do CCoding chạy.

## Rủi ro & việc còn mở
- **Cao (vận hành):** regression định tuyến làm hỏng `GET /tickets/:id` mà client có thể đang dùng, và làm mọi path không tồn tại trả 200. Review bị bỏ qua theo "cổng chất lượng" nên lỗi này lọt qua.
- **Thấp:** cursor chỉ là base64url của JSON, không có chữ ký HMAC. Client sửa được cursor, nhưng chỉ đổi được vị trí trang trong cùng bộ lọc nên không lộ thêm dữ liệu. Mức này chấp nhận được với handler in-memory.
- **Thấp:** `limit=007` được chấp nhận và hiểu là 7. Đề bài không cấm.

## Việc tiếp theo
- **Sửa regression định tuyến `/tickets`** · đổi lại `||` thành `&&` ở `src/handler.js:6`, thêm test: `GET /tickets/5` trả ticket id 5, `GET /tickets/999` trả 404, `GET /unknown` trả 404, `POST /tickets` trả 404 · @senior-swe (Phòng Phát triển) · Xong khi `npm test` xanh và các test mới đạt.
