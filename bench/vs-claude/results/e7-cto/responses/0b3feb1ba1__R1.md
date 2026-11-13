## Tóm tắt
Nghiệm thu. Tôi đọc mã trong `src/handlers/tasks.js`, `src/query.js`, `src/store.js`, `src/http.js` và `src/router.js` và đối chiếu từng quy tắc của FEATURES.md. Tôi không thấy chỗ nào lệch đặc tả. `npm test` do CCoding tự chạy đã xanh: 8/8 pass, baseline là 2/2. Riêng phiên này tôi không chạy lại `npm test` được vì hook chặn lệnh không chỉ đọc. Tôi cũng chưa gọi thử HTTP thật, nên kết luận về hành vi dựa trên đọc mã.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực & phân quyền đúng vai trò, mã lỗi và thứ tự 401→400→404→403→400 | Đạt | `authenticate` chạy đầu mọi handler (`query.js`). Member nhận 404 với nhiệm vụ nhóm khác và 403 khi tạo hoặc xóa. Member chỉ sửa được `status` trên nhiệm vụ giao cho mình. Manager bị 403 khi tạo, sửa hoặc chuyển nhóm khác, và 403 khi xóa. `validate` chạy sau các kiểm tra quyền (`tasks.js`). |
| 2. `GET /tasks` có lọc, tìm không dấu, sắp xếp, phân trang đúng đặc tả | Đạt | `parseQuery` từ chối tham số lạ hoặc trùng và trả `INVALID_QUERY` kèm `field` theo thứ tự xuất hiện trên URL. `validDate` kiểm ngày theo lịch. `page` và `pageSize` kiểm đủ miền. `fold` dùng NFD và xử lý `đ`/`Đ`. `dueDate` rỗng luôn xếp cuối, hòa thì xếp theo `id` tăng dần theo số, `title` dùng `localeCompare('vi')`. Dạng trả về là `{items,total,page,pageSize}`. Member bị áp thêm bộ lọc nhóm. |
| 3. Xuất CSV đúng header, BOM, RFC 4180, chống chèn công thức | Đạt | Route `/tasks/export.csv` khai báo trước `/tasks/:id`. Hai header HTTP đúng. `toCsv` thêm BOM, dùng `\r\n` kể cả sau dòng cuối. `cell` bọc ngoặc kép khi cần, nhân đôi `"`, thêm `'` cho chuỗi bắt đầu bằng `= + - @ \t \r` mà không đụng số, `null` thành ô trống. `page`/`pageSize` bị 400 vì `paged:false`. |
| 4. Nhật ký thao tác và `GET /audit` | Đạt | `logAudit` chỉ chạy sau khi thao tác thành công. `seq` bắt đầu từ 1, `at` lấy từ `now()`, `changes` sắp a→z. `update` chỉ ghi trường có giá trị đổi, `delete` ghi `[]`. `/audit` kiểm tham số (400) trước quyền (403), trả mới nhất trước, lọc được theo `taskId`. |
| 5. Test cũ cập nhật theo dạng kết quả mới, có test cho từng tính năng, `npm test` xanh | Đạt | Diff có `test/tasks.test.js` và `test/helpers.js` được sửa, và `test/features.test.js` mới (141 dòng). CCoding tự chạy: sau thực thi 8 pass, 0 fail. Tôi chưa đọc nội dung từng test để đánh giá độ phủ. |
| 6. Không thêm thư viện ngoài, giữ `createServer({seed?, now?})` | Đạt | Các tệp đã đọc chỉ dùng module `node:`. Diff không đổi `package.json`. |

## Rủi ro & việc còn mở
- Body JSON sai cú pháp trả `INVALID_JSON` (400) trước kiểm tra 403 của manager. Đặc tả xếp validate body sau cùng. Trường hợp này hiếm và đặc tả không nêu rõ.
- `validate` trong `tasks.js` chỉ kiểm dạng regex của `dueDate` trong body, không kiểm ngày có thật. Đặc tả chỉ đòi kiểm theo lịch cho tham số truy vấn, nên không vi phạm.
- Bộ nghiệm thu ẩn chạy qua HTTP thật. Hành vi biên (sắp xếp, dấu tiếng Việt, CSV) tôi mới đánh giá qua đọc mã, chưa chạy thật.

## Việc tiếp theo
- **Smoke test HTTP end-to-end:** khởi động server, gọi bằng curl các ca biên rồi đối chiếu với đặc tả. Các ca gồm `q` có dấu và `đ`, `sort=-dueDate` có nhiệm vụ rỗng `dueDate`, tiêu đề CSV bắt đầu bằng `=`, `page` vượt trang và `GET /audit?x=1`. Phòng dev hoặc `@qa-tester` làm. Xong khi không ca nào lệch đặc tả.
