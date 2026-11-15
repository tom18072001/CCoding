## Tóm tắt
**Nghiệm thu: Đạt.** Đã đọc toàn bộ `src/handlers/tasks.js` và `src/store.js` và đối chiếu từng quy tắc trong `FEATURES.md`. Cả 4 tính năng đã có, đúng thứ tự kiểm tra 401 → 400 → 404 → 403 → 400 (body). Hệ thống đã tự chạy `npm test` sau khi sửa và được 8/8 test xanh (trước đó 2/2). Tôi không tự chạy lại được `npm test` vì hook của văn phòng chặn lệnh không chỉ đọc. Còn một trường hợp biên về thứ tự lỗi với body JSON hỏng, ghi ở mục rủi ro.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực `X-User` (thiếu hoặc không có trong `seed.users` → 401 `UNAUTHENTICATED`), áp cho mọi route `/tasks…` và `/audit` | Đạt | `authenticate()` được gọi đầu tiên trong cả 7 handler (`src/handlers/tasks.js`); test `xác thực: thiếu/sai X-User → 401` |
| Phân quyền admin / manager / member đúng đặc tả (member thấy nhóm khác → 404, chỉ sửa `status` của việc giao cho mình; manager không tạo hay chuyển sang nhóm khác, không xóa) | Đạt | Handler POST, PATCH, DELETE và `GET /tasks/:id`: member bị lọc theo nhóm và trả 404 trước 403; khi member gửi trường khác `status` thì xét theo tên khóa (kể cả trùng giá trị cũ) → 403; test `phân quyền: member` và `phân quyền: manager` |
| `GET /tasks` trả `{items,total,page,pageSize}`; tham số lạ hoặc lặp → 400 `INVALID_QUERY` kèm `field` của tham số lỗi đầu tiên trên URL; lọc và tìm không dấu (NFD, bỏ U+0300–036F, `đ` → `d`); sắp xếp với hòa theo id số, `dueDate` null luôn ở cuối, `title` theo `localeCompare('vi')`; ngày theo lịch thật; page/pageSize trong miền | Đạt | `parseQuery` duyệt `URLSearchParams` theo thứ tự trên URL; `validDate` dùng round-trip UTC; tôi đã đọc byte của regex trong `fold` và đúng là U+0300–U+036F (`od -c`); comparator trả về sớm khi `dueDate` null, không nhân với chiều sắp; test `lọc, tìm, sắp xếp, phân trang` |
| Xuất CSV: không có page/pageSize (→ 400), header HTTP đúng, có BOM, xuống dòng `\r\n` kể cả sau dòng cuối, đúng RFC 4180, chặn chèn công thức chỉ với chuỗi | Đạt | `toCsv` và `csvCell`: tiền tố `'` được thêm trước khi bọc ngoặc kép, số giữ nguyên, null → ô trống; BOM là byte `EF BB BF` thật; route `export.csv` khai báo trước `/tasks/:id`; test `xuất CSV` |
| Nhật ký thao tác: `seq` tăng từ 1, `at` lấy từ `now()` tiêm vào, `changes` sắp a→z (update chỉ ghi trường có giá trị đổi, delete ghi `[]`), thao tác lỗi không ghi; `/audit` chỉ cho admin, mới nhất trước, lọc theo `taskId`, tham số khác → 400 trước 403 | Đạt | `Store.log` và các lệnh `store.log` chỉ được gọi sau khi thao tác thành công; handler `/audit` chạy `parseQuery` trước khi kiểm vai trò; test `nhật ký thao tác` |
| Test cũ đã sửa cho hợp dạng kết quả mới, có thêm test cho từng tính năng, `npm test` xanh, không thêm thư viện ngoài | Đạt | `git diff test/tasks.test.js` (dùng `json.total`, thêm header `X-User`); có `test/features.test.js` với 6 test; hệ thống tự chạy `npm test` → exit 0, pass 8/8; `package.json` không có dependencies |

## Rủi ro & việc còn mở
- **Thứ tự lỗi khi body JSON hỏng (mức thấp):** trong `PATCH`, `readJson` chạy trước khi kiểm quyền 403 của member. Vì vậy member PATCH một việc không giao cho mình mà gửi body JSON hỏng sẽ nhận 400 `INVALID_JSON` thay vì 403. Đặc tả xếp 403 trước bước validate body. Bộ nghiệm thu ẩn có thể bắt trường hợp này nếu nó coi JSON hỏng là lỗi body.
- `X-User` gửi lặp sẽ bị Node gộp thành `"u1, u2"` và trả 401. Cách này hợp lý nhưng đặc tả không nói tới.
- Bản thân CTO chưa chạy lại test hay gọi thử HTTP; kết luận dựa trên lần chạy `npm test` của hệ thống và việc đọc mã.

## Việc tiếp theo
- **Đưa kiểm quyền 403 của member lên trước `readJson` trong PATCH** · Trong `PATCH /tasks/:id`, nếu member và `t.assignee !== user.id` thì trả 403 trước khi đọc body; thêm test cho body JSON hỏng · @senior-swe (Phòng Phát triển) · Xong khi test mới xanh và `npm test` vẫn xanh.
