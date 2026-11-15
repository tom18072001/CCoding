Tôi đã đọc xong đặc tả, mã nguồn và test. Dưới đây là kết luận nghiệm thu.

## Tóm tắt
**Nghiệm thu.** Đã đối chiếu từng quy tắc trong `FEATURES.md` với mã nguồn: cả 4 tính năng đều đã làm, thứ tự kiểm tra 401 → 400 → 404 → 403 → 400 đúng ở mọi route. Bằng chứng chạy thật do CCoding tự chạy: `npm test` exit 0, 16/16 test đạt (trước khi sửa là 2/2). Tôi không tự chạy lại được, vì hook chặn lệnh `node` với vai trò này. Vì vậy phần hành vi HTTP là tôi đọc mã chứ chưa thử từng biên.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực & phân quyền: thiếu hoặc sai `X-User` trả 401. Member không thấy nhóm khác (404), không được tạo hay xóa, chỉ sửa `status` của việc giao cho mình. Manager chỉ ghi được nhóm mình và không xóa. Thứ tự lỗi đúng | Đạt | `src/auth.js:5-10`; `src/handlers/tasks.js`: `findVisible` cho 404 trước 403. Lỗi JSON được giữ lại và trả sau 403 (`readBody`). Kiểm quyền member/manager ở POST, PATCH, DELETE. `test/auth.test.js` có 4 test |
| Danh sách: dạng `{items,total,page,pageSize}`. Lọc `status`/`assignee`(`none`)/`team`/`q` (bỏ dấu NFD, `đ`→`d`)/`dueBefore`. Sắp xếp: hòa thì theo id số, `dueDate` null luôn cuối, `title` so với locale `vi`. Phân trang. Báo `INVALID_QUERY` cho tham số lỗi đầu tiên, kể cả tham số lạ hoặc lặp | Đạt | `src/query.js`: `parseQuery` duyệt theo thứ tự trên URL. `validDate` loại ngày không có thật. `int` loại `1.5`/`0`/`101`. `applySort` có tie-break bằng `idNum`. Đã dùng Grep xác nhận regex bỏ dấu là `[\u0300-\u036f]`. `test/list.test.js` có 6 test |
| Xuất CSV: đúng header HTTP, có BOM, dùng CRLF kể cả sau dòng cuối, bọc ô theo RFC 4180, chống chèn công thức chỉ với chuỗi, `page`/`pageSize` trả 400, cùng quyền và bộ lọc với danh sách | Đạt | `src/csv.js:5-16`: BOM U+FEFF đã xác nhận bằng Grep; thêm `'` trước rồi mới bọc ngoặc kép. `src/handlers/tasks.js`: route export đăng ký trước `/tasks/:id`, dùng `EXPORT_PARAMS`. `test/export.test.js` có 3 test |
| Nhật ký thao tác: chỉ ghi thao tác thành công. Mục ghi có `seq` từ 1, `at` lấy từ `now()`, `changes` sắp a→z (create = các khóa trong body, update = chỉ trường đổi giá trị, delete = `[]`). `GET /audit` chỉ cho admin, mới nhất trước, lọc được theo `taskId`, tham số khác trả 400 | Đạt | `src/store.js:27-31` (`record`). Ở `src/handlers/tasks.js`, `record` được gọi sau khi validate xong. `src/handlers/audit.js`: kiểm tham số (400) trước quyền (403), sắp `seq` giảm dần. `test/audit.test.js` |
| Đã cập nhật test cũ, có test cho từng tính năng, `npm test` xanh, không thêm thư viện ngoài | Đạt | Mục “Lệnh kiểm tra của dự án (CCoding tự chạy)”: `npm test` exit 0, 16 pass / 0 fail. `test/tasks.test.js` đã đổi sang `list.json.items`/`total`. `package.json` không có `dependencies` |

## Rủi ro & việc còn mở
- **Thấp:** `src/router.js` gọi `decodeURIComponent` mà không bắt lỗi. Đường dẫn có `%` sai dạng (vd. `/tasks/%E0`) sẽ ra 500 thay vì 404.
- **Thấp:** member PATCH với body `{}` vẫn ghi một mục `update` có `changes: []`. Đặc tả không nói rõ trường hợp này, có thể khác với bộ nghiệm thu ẩn.
- **Thấp:** test chưa phủ vài tổ hợp biên về thứ tự lỗi. Ví dụ: member gửi JSON hỏng cho việc không giao cho mình (mong đợi 403), hoặc manager đổi `team` sang `"C"` (hiện ra 403).
- **Hạn chế khi nghiệm thu:** tôi không chạy lại được test hay thử HTTP vì hook chặn `node`. Bằng chứng chạy thật chỉ có từ lần chạy của CCoding.

## Việc tiếp theo
- **Làm cứng router với URL sai dạng** · bắt `URIError` trong `src/router.js` để trả 404 JSON, kèm 1 test · @senior-swe (Phòng Phát triển)
- **Bổ sung test biên cho thứ tự kiểm tra** · các tổ hợp 404/403/400 ở PATCH/POST và member PATCH body rỗng · @senior-swe
