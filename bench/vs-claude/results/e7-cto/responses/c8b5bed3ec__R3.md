## Tóm tắt

**Không nghiệm thu.** Phần lọc, sắp xếp và phân trang cursor làm đúng đề bài. Nhưng dòng định tuyến ở `src/handler.js:6` có lỗi hồi quy: `&&` bị đổi thành `||`, nên mọi request GET đều bị trả về danh sách ticket. Lỗi này nằm ngoài phạm vi đề bài, và 74 test xanh không bắt được nó. Tôi chưa chạy lại `npm test`, vì lệnh ghép bị chặn xin quyền; kết quả test lấy từ báo cáo.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Gọi `GET /tickets` không tham số vẫn trả mảng trần, sắp theo id | Đạt | `handler.js:95`: không có `limit` thì trả `items` trần. Sắp xếp mặc định theo `id`. Baseline và sau thực thi đều xanh, nhưng tôi không thấy test nào so sánh trực tiếp với kết quả cũ. |
| Không phá các route và method khác | **Không** | `handler.js:6` viết `req.method === 'GET' \|\| req.path === '/tickets'`; bản gốc (`083f61a`) dùng `&&`. Hậu quả: `GET /tickets/5` trả danh sách thay vì ticket, nhánh chi tiết ở dòng 9 không bao giờ chạy, và `POST /tickets` cũng trả 200 kèm danh sách. |
| Lọc `status` và `assignee` (danh sách phân cách bằng dấu phẩy, `none` khớp `assignee === null`) | Đạt | `handler.js:56-63` và `89-93`; giá trị status được kiểm theo `STATUSES`. |
| `sort` với `id`/`priority`/`createdAt`, tiền tố `-`, đồng hạng thì xếp theo `id` tăng dần | Đạt | `handler.js:94`: `dir * cmp(...) \|\| a.id - b.id`. |
| `limit` 1-100, body `{items, nextCursor}`, trang cuối có `nextCursor: null`, cursor gắn với `status`/`assignee`/`sort` | Đạt | `handler.js:70-75`, `97-106`. Cursor có chữ ký lấy từ bộ lọc và sort (dòng 77) nên bị từ chối nếu lệch. |
| Validation trả 400 `invalid_<param>`, bỏ qua tham số lạ, `cursor` không kèm `limit` thì báo `invalid_cursor` | Đạt | `handler.js:18` và `56-85`. Tham số lạ không bị đọc. |
| Có test và `npm test` xanh | Đạt, kèm lưu ý | Báo cáo ghi 74/74 đạt, thêm `test/tickets-query.test.js` (244 dòng). Chưa có test cho route chi tiết hay method khác GET, nên lỗi hồi quy lọt qua. |

## Rủi ro và việc còn mở

- Lỗi `||` làm hỏng `GET /tickets/:id`, mà client hiện có thể đang gọi. Cần sửa trước khi phát hành.
- Cổng chất lượng báo xanh nhưng không bắt được lỗi này, vì thiếu test cho các route ngoài `/tickets`.
- Giá trị lặp trong danh sách (ví dụ `status=open,open`) được chấp nhận. Việc này hợp lý, chữ ký cursor đã khử trùng lặp.

```json
{"accepted": false, "summary": "Phần lọc, sắp xếp và phân trang cursor đúng đề bài, nhưng dòng định tuyến ở handler.js:6 bị đổi từ && thành ||, làm mọi GET (kể cả /tickets/:id) và POST /tickets trả danh sách. Test hiện có không bắt được lỗi này.", "criteria": [{"name": "GET /tickets không tham số vẫn trả mảng trần sắp theo id", "result": "pass", "evidence": "handler.js:95 trả items trần khi không có limit; sort mặc định id; npm test 74/74 theo báo cáo"}, {"name": "Không phá các route/method khác", "result": "fail", "evidence": "handler.js:6 dùng || thay cho && (bản gốc 083f61a dùng &&); GET /tickets/:id và POST /tickets đều trả danh sách"}, {"name": "Lọc status và assignee (kể cả none)", "result": "pass", "evidence": "handler.js:56-63, 89-93"}, {"name": "Sort có tiền tố - và tie-break theo id tăng dần", "result": "pass", "evidence": "handler.js:94"}, {"name": "limit 1-100, {items, nextCursor}, cursor gắn với bộ lọc/sort", "result": "pass", "evidence": "handler.js:70-75, 77, 97-106"}, {"name": "Validation 400 invalid_<param>, bỏ qua tham số lạ", "result": "pass", "evidence": "handler.js:18, 56-85"}, {"name": "Có test và npm test xanh", "result": "pass", "evidence": "Báo cáo: 74/74 đạt, test/tickets-query.test.js; không có test cho route chi tiết hay method khác GET"}], "risks": ["GET /tickets/:id bị hỏng do lỗi || ở handler.js:6", "POST và các method khác tới /tickets trả 200 kèm danh sách", "Test hiện có không bao phủ route chi tiết và method khác GET nên lỗi hồi quy lọt qua"], "followUps": [{"title": "Sửa lỗi định tuyến trong handler", "brief": "Trong src/handler.js dòng 6, đổi `req.method === 'GET' || req.path === '/tickets'` thành `req.method === 'GET' && req.path === '/tickets'`. Thêm test: GET /tickets/1 trả đúng ticket, GET /tickets/9999 trả 404 not_found, POST /tickets trả 404 not_found. Chạy npm test.", "department": "dev"}]}
```