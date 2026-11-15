## Tóm tắt
Nghiệm thu. Tôi đã đọc `FEATURES.md` và các tệp mã chính (`tasks.js`, `query.js`, `auth.js`, `csv.js`, `audit.js`, `store.js`, `http.js`, `server.js`), rồi đối chiếu từng quy tắc đặc tả. Không thấy chỗ nào lệch. `npm test` do CCoding tự chạy: 16/16 pass, baseline là 2/2. Tôi không tự chạy lại test hay gọi HTTP thật, và bộ nghiệm thu ẩn chưa được chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực & phân quyền đúng vai trò, đúng thứ tự 401 → 400 → 404 → 403 → 400 | Đạt | `src/auth.js` trả 401 `UNAUTHENTICATED`. `tasks.js` dùng `findVisible` (member nhóm khác → 404) trước khi kiểm quyền 403. Manager: tạo/sửa/chuyển nhóm khác → 403, không được xóa. Member: không tạo/xóa, chỉ sửa `status` của việc giao cho mình. JSON lỗi được hoãn bằng `readBody` để 403 đến trước 400 (`tasks.js:38-46`, `80-123`). |
| 2. `GET /tasks` trả `{items,total,page,pageSize}`; lọc, tìm `q` bỏ dấu và `đ`, sắp xếp, phân trang theo đặc tả | Đạt | `query.js`: tham số lạ hoặc lặp → 400, báo tham số đầu tiên theo thứ tự URL. Kiểm ngày theo lịch, page/pageSize chỉ nhận số nguyên trong miền. Sort hòa theo `id` số tăng dần bất kể chiều, `dueDate` null luôn cuối, `localeCompare(...,'vi')`. Member bị áp thêm lọc nhóm (`tasks.js:48-53`). `page` quá lớn trả `items: []`. |
| 3. `GET /tasks/export.csv` đúng header, BOM, `\r\n`, RFC 4180, chống chèn công thức, không nhận page/pageSize | Đạt | `csv.js`: BOM, dòng tiêu đề đúng, `\r\n` sau dòng cuối, bọc ngoặc kép và nhân đôi `"`, tiền tố `'` cho `= + - @ \t \r`, `null` → ô trống, số giữ nguyên. `tasks.js:57-64` đặt header `text/csv; charset=utf-8` và `Content-Disposition`. Route khai báo trước `/tasks/:id`. `EXPORT_PARAMS` bỏ page/pageSize. |
| 4. Nhật ký: `seq`, `at`, `action`, `changes` sắp a→z, chỉ ghi khi thành công; `GET /audit` chỉ admin, mới nhất trước, lọc `taskId` | Đạt | `store.record` sắp `changes` bằng `.sort()` và `seq = audit.length + 1`. `update` chỉ ghi trường có giá trị mới khác giá trị cũ (`tasks.js:108`). `delete` ghi `[]`. Việc ghi nhật ký nằm sau validate nên thao tác lỗi không ghi. `audit.js` kiểm 401, rồi 400 (tham số), rồi 403, và sắp `seq` giảm dần. |
| 5. Test có sẵn đã cập nhật theo dạng kết quả mới, có test cho từng tính năng, `npm test` xanh, không thêm thư viện ngoài | Đạt | Mục "Lệnh kiểm tra" của báo cáo: `npm test` exit 0, 16 pass / 0 fail. Có `test/auth`, `list`, `export`, `audit.test.js` mới và `tasks.test.js` sửa. Mã chỉ dùng module `node:`. |
| 6. Bộ nghiệm thu ẩn qua HTTP thật | Chưa kiểm được | Tôi không có bộ nghiệm thu ẩn và không chạy server. Kết luận ở trên dựa trên đọc mã và kết quả `npm test` do CCoding tự chạy. |

Tiêu chí 6 là rủi ro chung nên không đưa vào danh sách bắt buộc; mọi tiêu chí bắt buộc (1–5) đều Đạt.

## Rủi ro & việc còn mở
- `localeCompare(..., 'vi')` phụ thuộc ICU của bản Node đang chạy. Nếu Node build thiếu full-icu, thứ tự sort `title` có thể lệch với bộ ẩn.
- `validate` cho `dueDate` chỉ kiểm dạng `YYYY-MM-DD`, không kiểm ngày có thật. Đặc tả không yêu cầu điều này cho body, nên không tính là lỗi.
- Tôi chưa đọc nội dung các tệp test. Chỉ có bằng chứng số lượng test và kết quả pass.

## Việc tiếp theo
Đề xuất, giám đốc quyết định:
- **Chạy thử HTTP thật các ca biên** · phạm vi: dựng server, thử các ca biên (member PATCH body `{status}` trùng giá trị cũ → 403; `?page=1&page=2` → 400; `q=đường`; `sort=-dueDate` có null; CSV ô bắt đầu bằng `=`; `GET /audit?taskId=`) · ai làm: `@qa-tester` · xong khi mọi ca khớp đặc tả.
