## Tóm tắt

Chấp nhận. Tôi đọc `src/handler.js`, `test/list.test.js` và `src/data.js`, và kết quả khớp với kết quả `npm test` trong báo cáo (14/14 pass, baseline 1/1). Tôi không tự chạy lại `npm test`. Cả 7 tiêu chí đều đạt. Còn vài điểm nhỏ về hành vi ở rìa, ghi ở phần rủi ro.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Gọi không tham số vẫn trả mảng trần sắp theo id | Đạt | `handler.js:84` trả `list` khi không có `limit`. Sắp mặc định `id` ở dòng 56. Test `no params: bare array sorted by id`. |
| `status` và `assignee` lọc theo danh sách phân tách bằng dấu phẩy. Status phải thuộc `STATUSES`. `none` khớp `assignee === null` | Đạt | `handler.js:46-55`. Test `status and assignee filters`. Test validation có `status: 'bogus'` và `'open,'`. |
| `sort` nhận `id`, `priority`, `createdAt`, có thể có tiền tố `-`. Khi bằng nhau thì xếp theo id tăng dần bất kể chiều | Đạt | `handler.js:58-64` và comparator ở dòng 78-82 (`|| a.id - b.id`). Test `sort with id tiebreak`. |
| `limit` 1-100 là số nguyên. Khi có `limit`, body là `{items, nextCursor}`. Trang cuối có `nextCursor` là `null`. `cursor` trả về trang kế tiếp | Đạt | `handler.js:65-70` và 84-88 (keyset pagination). Test `pagination walks everything` chạy với 6 kiểu sort và so với kết quả không phân trang. Test `last page has null cursor; exact fit`. |
| Cursor chỉ hợp lệ với cùng `status`, `assignee`, `sort` đã cấp. Cursor sai định dạng hoặc không khớp trả `invalid_cursor` | Đạt | Fingerprint ở `handler.js:71`, kiểm ở dòng 36 trong `decodeCursor`. Test `cursor valid only with same filters` và các ca cursor hỏng trong `validation errors`. |
| Mọi tham số sai trả 400 với `{error: 'invalid_<param>'}`. `cursor` không kèm `limit` cũng bị từ chối | Đạt | `handler.js:18` và 74. Test `validation errors` có 14 ca: status, assignee, sort, limit `0/101/1.5/abc/''/-1`, cursor. Ca `{cursor:'abc'}` không có limit cho ra `invalid_cursor`. |
| Tham số lạ bị bỏ qua. Test được thêm và `npm test` xanh | Đạt | Test `unknown params ignored`. Báo cáo ghi `npm test` sau thực thi: 14 pass, 0 fail, exit 0. |

## Rủi ro và việc còn mở

- Fingerprint của cursor dùng giá trị thô của query. Cursor cấp khi bỏ `sort` sẽ bị từ chối nếu dùng lại với `sort=id`, dù hai cách cho cùng thứ tự. Cách này chặt hơn đề bài, không sai.
- `assignee` không kiểm tên có tồn tại hay không, nên tên lạ trả danh sách rỗng. Đề bài không yêu cầu kiểm.
- Ca `assignee=''` trả `invalid_assignee`, ca `status=''` trả `invalid_status`. Đề bài không nói rõ hai ca này, và cách xử lý này hợp lý.
- Cursor không được ký, nên client có thể tự tạo cursor hợp lệ về cấu trúc. Chỉ ảnh hưởng vị trí trang, không có rủi ro bảo mật với dữ liệu in-memory này.

```json
{"accepted": true, "summary": "Việc triển khai khớp đề bài: không tham số vẫn trả mảng trần, có lọc, sắp xếp có tiebreak theo id, phân trang cursor gắn với bộ lọc, và validation 400. 14/14 test xanh theo báo cáo.", "criteria": [{"name": "Không tham số: mảng trần sắp theo id", "result": "pass", "evidence": "handler.js:56,84; test 'no params: bare array sorted by id'"}, {"name": "Lọc status/assignee (kể cả 'none') và validate status", "result": "pass", "evidence": "handler.js:46-55; test 'status and assignee filters' và 'validation errors'"}, {"name": "Sort id/priority/createdAt, tiền tố '-', tiebreak id tăng dần", "result": "pass", "evidence": "handler.js:58-64,78-82; test 'sort with id tiebreak'"}, {"name": "limit 1-100, body {items,nextCursor}, null ở trang cuối, cursor ra trang kế", "result": "pass", "evidence": "handler.js:65-70,84-88; test 'pagination walks everything' (6 kiểu sort), 'last page has null cursor; exact fit'"}, {"name": "Cursor gắn với status/assignee/sort đã cấp", "result": "pass", "evidence": "handler.js:71,36; test 'cursor valid only with same filters'"}, {"name": "Validation 400 invalid_<param>, cursor không kèm limit", "result": "pass", "evidence": "handler.js:18,74; test 'validation errors' (14 ca)"}, {"name": "Bỏ qua tham số lạ; có test; npm test xanh", "result": "pass", "evidence": "test 'unknown params ignored'; báo cáo: npm test 14 pass, 0 fail, exit 0"}], "risks": ["Cursor cấp khi bỏ sort bị từ chối khi dùng lại với sort=id, vì fingerprint dùng giá trị thô của query", "assignee không kiểm tên tồn tại, tên lạ trả danh sách rỗng", "Cursor không được ký, client có thể tự tạo cursor hợp lệ về cấu trúc", "Tôi chưa tự chạy lại npm test, chỉ dựa vào kết quả trong báo cáo"], "followUps": []}
```