## Tóm tắt
Nghiệm thu. Tôi đọc `src/handler.js`, `test/list.test.js` và `src/data.js`, và cả 5 tiêu chí đều Đạt. Tôi không tự chạy lại `npm test`. Kết quả chạy là của CCoding: 14/14 test pass, baseline là 1 test. Phần hành vi tôi đối chiếu bằng cách đọc mã và test.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Không có tham số thì body vẫn là mảng trần sắp theo id; tham số lạ bị bỏ qua | Đạt | `handler.js:84` trả `list` khi không có `limit`. Mặc định `field='id'` (dòng 56). Test `no params` và `unknown params ignored` (`list.test.js:8,74`). |
| 2. Lọc `status` (kiểm theo `STATUSES`) và `assignee` (`none` khớp `null`), danh sách phân cách bằng dấu phẩy | Đạt | `handler.js:46-55`. Giá trị rỗng hoặc status lạ trả 400. Test `status and assignee filters` và các ca validation. |
| 3. `sort` gồm id/priority/createdAt, tiền tố `-` cho giảm dần, hòa thì theo id tăng | Đạt | `handler.js:56-64, 78-83`: `a.id - b.id` luôn tăng. Test `sort with id tiebreak` kiểm `-priority`, `createdAt`, `-id`. |
| 4. `limit` 1-100 trả `{items, nextCursor}`; cursor opaque, trang cuối `null`, duyệt đủ không sót, không trùng | Đạt | `handler.js:65-70, 84-88` dùng keyset pagination. Test duyệt toàn bộ 6 kiểu sort với limit=4 so với kết quả không phân trang. Test `last page` kiểm limit=23 và 100. |
| 5. Validation trả 400 `invalid_<param>`: status, sort, limit (ngoài khoảng hoặc không phải số nguyên), cursor sai định dạng, cursor lệch `status`/`assignee`/`sort`, cursor không có `limit` | Đạt | `handler.js:18, 74-76` và fingerprint ở dòng 71. Test `validation errors` có 14 ca. Test `cursor valid only with same filters` kiểm 4 kiểu lệch. |

## Rủi ro & việc còn mở
- Fingerprint của cursor so chuỗi thô. Cursor lấy từ `sort` vắng mặt bị từ chối khi dùng với `sort=id`. Cursor lấy từ `status=a,b` bị từ chối khi dùng với `status=b,a`. Đề bài nói "cùng giá trị" nên cách làm này chấp nhận được, nhưng client có thể thấy bất ngờ. Mức thấp.
- Cursor không được ký. Client tự dựng được cursor hợp lệ về cấu trúc. Hậu quả chỉ là vị trí bắt đầu trang, không lộ dữ liệu. Mức thấp.
- Không có test cho `createdAt` hòa nhau qua ranh giới trang, và không có test cho `status`/`assignee` dạng không phải chuỗi. Logic đúng theo mã nên rủi ro thấp.
- Dữ liệu là seed giả, không có dữ liệu cá nhân thật.

## Việc tiếp theo
Không có việc bắt buộc. Nếu giám đốc muốn, có thể giao `@senior-swe` việc nhỏ này: chuẩn hóa fingerprint của cursor (bỏ qua thứ tự trong danh sách, coi `sort` vắng mặt là `id`) và thêm test. Tiêu chí xong: `npm test` xanh và có test cho hai ca trên.
