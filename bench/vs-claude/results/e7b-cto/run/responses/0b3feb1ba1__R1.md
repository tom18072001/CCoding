## Tóm tắt
Nghiệm thu. Tôi đọc `FEATURES.md` và đối chiếu từng quy tắc với `src/handlers/tasks.js`, `src/query.js`, `src/store.js`. Không thấy chỗ lệch đặc tả. Tôi không tự chạy được `npm test` vì công cụ chặn lệnh không phải chỉ đọc. Kết quả test dựa trên số liệu CCoding tự chạy trong báo cáo: 8/8 pass, baseline 2/2.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực `X-User` (401) và phân quyền admin/manager/member đúng đặc tả, gồm member thấy nhóm khác → 404 | Đạt | `authenticate` ở `src/query.js:8`. Các handler `tasks.js:47-89` có `hidden()` trả 404, manager bị chặn xóa, chặn đổi `team`, member chỉ sửa `status` trên nhiệm vụ giao cho mình. |
| Thứ tự kiểm tra 401 → 400 query → 404 → 403 → 400 body | Đạt | `GET /tasks` và `/audit` kiểm tra query trước quyền (`tasks.js:93-96`). `PATCH` kiểm tra 404, rồi 403, rồi `validate` (`tasks.js:67-74`). `POST` kiểm tra 403 trước `validate`. |
| `GET /tasks` trả `{items,total,page,pageSize}` với bộ lọc, `q` không dấu, sắp xếp, phân trang đúng đặc tả | Đạt | `src/query.js`: `parseQuery` từ chối tham số lạ và lặp, báo tham số đầu tiên theo thứ tự URL. `validDate` kiểm tra lịch, `fold` xử lý NFD và `đ`. `cmp` đặt `dueDate` rỗng ở cuối, so `title` bằng `localeCompare('vi')`, hòa thì theo id số tăng dần. |
| `GET /tasks/export.csv` đúng header, BOM, CRLF, RFC 4180, chống chèn công thức, `page`/`pageSize` → 400 | Đạt | `tasks.js:38-45` (header, `paged:false`). `query.js:92-102` (`cell`, `toCsv`, BOM, `\r\n` sau dòng cuối, thêm `'` chỉ cho chuỗi). Route export.csv đăng ký trước `/tasks/:id`. |
| Nhật ký thao tác và `GET /audit` chỉ admin, mới nhất trước, lọc `taskId` | Đạt | `store.logAudit` (`store.js:44-48`) có `seq` tăng dần, `at` từ `now()`, `changes` sắp a→z. `PATCH` chỉ ghi trường có giá trị đổi (`tasks.js:75`). Ghi nhật ký chỉ sau khi thao tác thành công. |
| Test cũ đã cập nhật, thêm test cho từng tính năng, `npm test` xanh | Đạt (dựa trên báo cáo) | `test/features.test.js` mới (141 dòng), `tasks.test.js` đổi sang `json.total`, `helpers.js` mặc định gửi `x-user`. Báo cáo ghi `npm test` 8/8 pass. Tôi không tự chạy lại. |
| Không thêm thư viện ngoài | Đạt | Diff chỉ có 6 tệp trong `src/` và `test/`, không đổi `package.json`. |

## Rủi ro & việc còn mở
- Test mới chỉ có 6 ca cho 4 tính năng. Các nhánh biên (thứ tự báo lỗi query, `dueDate` rỗng khi sắp giảm dần, member truyền `team` khác, CSV có ký tự đặc biệt) có thể chưa được phủ đủ. Tôi không đọc `features.test.js` để xác nhận.
- `page=007` được chấp nhận, vì regex `^\d+$` cho phép số 0 đứng đầu. Đặc tả không nói rõ trường hợp này.
- `POST` và `PATCH` chưa kiểm tra `dueDate` theo lịch (ví dụ `2026-02-30`). Đặc tả chỉ yêu cầu kiểm tra này cho tham số query, nên không tính là lỗi.
- Nhật ký nằm trong bộ nhớ, mất khi khởi động lại. Với phạm vi đề bài thì chấp nhận được.

## Việc tiếp theo
- **Bổ sung test biên cho 4 tính năng**: phạm vi là `test/features.test.js`. Phòng dev (`@senior-swe`) làm. Xong khi `npm test` xanh và các nhánh biên nêu trên đều có ca kiểm tra.
