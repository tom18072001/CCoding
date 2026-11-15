## Tóm tắt
Nghiệm thu. Tôi đọc `FEATURES.md` đối chiếu với `src/handlers/tasks.js`, `src/store.js`, `src/http.js`, `src/router.js` và `test/features.test.js`, và cả 4 tính năng khớp đặc tả. Bằng chứng chạy là kết quả `npm test` do CCoding tự chạy: 8/8 pass, trước đó 2/2. Tôi không tự chạy lại được vì hook chặn `npm`. Mã lỗi, thứ tự kiểm tra và định dạng CSV tôi chỉ đối chiếu bằng đọc mã, chưa gọi HTTP thật.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực & phân quyền: 401 khi thiếu hoặc sai `X-User`; quyền admin, manager, member đúng đặc tả; member gặp nhiệm vụ nhóm khác thì 404 | Đạt | `authenticate()` được gọi đầu mọi route `/tasks…` và `/audit`. Các nhánh `forbidden()` và `notFound()` của POST, PATCH, DELETE khớp từng quy tắc. Test "xác thực" và "phân quyền" trong `test/features.test.js:18-53`. |
| 2. Thứ tự kiểm tra 401 → 400 query → 404 → 403 → 400 body | Đạt | PATCH và DELETE kiểm tra theo thứ tự 404 → 403 → body. `/audit` kiểm tra query trước quyền, test `features.test.js:115`. Route `/tasks/export.csv` đăng ký trước `/tasks/:id`. |
| 3. `GET /tasks` trả `{items,total,page,pageSize}`, có lọc, tìm không dấu, sắp xếp, phân trang, và `INVALID_QUERY` kèm `field` | Đạt | `parseQuery` báo tham số lỗi đầu tiên theo thứ tự URL và từ chối tham số lạ hoặc lặp. `fold()` xử lý NFD và `đ`. Với `dueDate`, nhiệm vụ không có ngày luôn ở cuối. Hòa thì xếp theo `idNum` tăng dần. Test `features.test.js:55-81`. |
| 4. Xuất CSV: header HTTP, BOM, `\r\n`, RFC 4180, chống chèn công thức, không nhận `page`/`pageSize` | Đạt | `toCsv` và `csvCell` trong `tasks.js`. Route export loại `page`/`pageSize` khỏi danh sách tham số cho phép. Test kiểm byte BOM thô, `'=SUM`, `'-Ghi chú` và ô trống cho `null` (`features.test.js:83-99`). |
| 5. Nhật ký: `seq`, `at` lấy từ `now()`, `changes` sắp xếp, lỗi không ghi, `GET /audit` chỉ admin và lọc `taskId` | Đạt | `store.log` ghi sau khi validate xong. Update chỉ tính trường có giá trị đổi. Test `features.test.js:101-116`. |
| 6. Test cũ được cập nhật theo dạng kết quả mới, có test cho từng tính năng, `npm test` xanh, không thêm thư viện | Đạt | `test/tasks.test.js` được sửa, thêm `test/features.test.js` với 6 test. CCoding chạy: 8 test, 8 pass, 0 fail. Chỉ dùng module `node:*`. |
| 7. Hành vi qua HTTP thật trên bộ ẩn | Chưa kiểm được | Test chạy qua `helpers.start`, có gọi HTTP, nhưng tôi không tự chạy lại và không có bộ ẩn. |

## Rủi ro & việc còn mở
- `dueDate` trong body POST/PATCH chỉ kiểm bằng regex, nên `2026-02-30` vẫn được nhận. Đặc tả chỉ yêu cầu kiểm lịch ở query, nên không tính là lỗi.
- Manager gửi `team` lạ (vd. `C`) khi POST hoặc PATCH nhận 403 thay vì 400. Điều này đúng với thứ tự "403 trước validate body", nhưng bộ ẩn có thể có kỳ vọng khác.
- Chưa có test cho một số nhánh biên: query `status=todo,` (dấu phẩy thừa), `assignee=none` kết hợp `team`, tab ở đầu giá trị CSV, và `taskId` của nhiệm vụ đã xóa trong `/audit`. Theo đọc mã, các nhánh này xử lý đúng.

## Việc tiếp theo
- **Bổ sung test biên**: thêm test cho các nhánh biên liệt kê ở trên, và chạy thủ công vài request `curl` vào server thật. Việc nhỏ, giao cho `@senior-swe`. Xong khi `npm test` xanh và các test mới pass. Giám đốc quyết định có giao hay không.
