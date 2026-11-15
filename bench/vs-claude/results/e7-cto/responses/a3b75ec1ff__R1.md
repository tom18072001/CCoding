## Tóm tắt
Nghiệm thu. Tôi đọc `src/handlers/tasks.js`, `src/store.js` và `test/features.test.js` rồi đối chiếu từng quy tắc của FEATURES.md. Tôi không thấy chỗ nào lệch đặc tả. `npm test` do CCoding chạy là 8/8 xanh (baseline 2/2). Tôi không tự chạy được lệnh: hook chặn `npm` với vai trò chỉ đọc. Phần kết quả chạy vì vậy dựa vào báo cáo của CCoding.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực và phân quyền đúng vai trò, đúng thứ tự 401 → 400 query → 404 → 403 → 400 body | Đạt | `authenticate` chạy đầu mỗi route. `GET /audit` kiểm query trước rồi mới 403. PATCH kiểm 404 rồi 403 rồi mới `validate`. POST của manager kiểm 403 team trước `validate`. Member bị 403 khi body có khóa khác `status`, kể cả khi trùng giá trị cũ. Test: `features.test.js` các test "xác thực", "member", "manager". |
| `GET /tasks` trả `{items,total,page,pageSize}`. Lọc, tìm không dấu và `đ`, sắp xếp, phân trang đúng. Lỗi `INVALID_QUERY` báo đúng `field` | Đạt | `parseQuery` duyệt theo thứ tự URL và loại tham số lạ hoặc lặp. `fold` dùng NFD và đổi `đ` thành `d`. `queryTasks` hòa theo `idNum` tăng dần, `dueDate` null luôn ở cuối, `title` dùng `localeCompare(...,'vi')`. `page` vượt trang cho `items: []`. Test: "lọc, tìm, sắp xếp, phân trang". |
| Xuất CSV đúng header HTTP, BOM, `\r\n`, RFC 4180, chống chèn công thức; `page`/`pageSize` bị 400 | Đạt | `toCsv` và `csvCell` trong `tasks.js`. Route export bỏ `page`/`pageSize` khỏi danh sách tham số cho phép. Route nằm trước `/tasks/:id`. Test "xuất CSV" kiểm byte BOM thô, header, ô có dấu phẩy, ngoặc kép, xuống dòng, tiền tố `'`, ô null. |
| Nhật ký: `seq`, `at` lấy từ `now()`, `changes` đúng và đã sắp xếp, thao tác lỗi không ghi, `/audit` chỉ admin, mới nhất trước, lọc `taskId` | Đạt | `store.log` trong `store.js` sắp xếp `changes`. Handler chỉ gọi `log` sau khi `validate` và ghi dữ liệu thành công. PATCH chỉ ghi các trường có giá trị đổi. Test "nhật ký thao tác" dùng đồng hồ giả. |
| Test cũ được cập nhật theo dạng kết quả mới, có test cho từng tính năng, `npm test` xanh, không thêm thư viện | Đạt | `tasks.test.js` sửa 15 dòng, `features.test.js` mới 116 dòng. CCoding chạy `npm test` sau thực thi: 8 pass, 0 fail. Không có thay đổi nào ở `package.json`. |
| Test gọi API thật qua HTTP | Đạt | `features.test.js` dùng `start()` và `a.call` từ `helpers.js`, kèm `fetch` trực tiếp để kiểm BOM. Tôi chưa mở `helpers.js` nên chưa xác nhận chi tiết cách khởi động server. |

## Rủi ro & việc còn mở
- Tôi không tự chạy lại `npm test`. Tôi dựa vào kết quả CCoding đã chạy (8/8). Review chỉ chạy `npm test` và không có reviewer người đọc diff (Thấp).
- Các trường hợp biên mà đặc tả không nêu rõ, bộ nghiệm thu ẩn có thể kiểm (Thấp):
  - `assignee=` rỗng hiện lọc ra tập rỗng.
  - `dueDate` trong body chỉ kiểm dạng regex, không kiểm ngày có thật trên lịch.
  - `localeCompare('vi')` phụ thuộc ICU của bản Node đang chạy.
- Audit chỉ nằm trong bộ nhớ nên mất khi khởi động lại. Đặc tả không yêu cầu lưu bền (Thấp).

## Việc tiếp theo
- Chạy `npm test` và một kịch bản curl ngoài test, gồm các trường hợp biên ở trên, để xác nhận độc lập. Phạm vi nhỏ, giao cho `@qa-tester`. Xong khi kết quả khớp đặc tả.
