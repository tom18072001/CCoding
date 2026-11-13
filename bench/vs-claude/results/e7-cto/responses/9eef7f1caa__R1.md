## Tóm tắt
Nghiệm thu. Tôi đọc mã nguồn trong `src/` và đối chiếu từng quy tắc của `FEATURES.md`, không thấy chỗ lệch. Tôi không tự chạy `npm test` được vì hook chặn lệnh này, nên kết quả test lấy từ báo cáo CCoding: 16/16 pass, baseline 2/2. Các tiêu chí về hành vi qua HTTP thật được xét bằng đọc mã, chưa chạy thực tế.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, có test cho từng tính năng và test cũ đã cập nhật | Đạt | Báo cáo CCoding: 16 pass, 0 fail (baseline 2). Có các tệp `test/auth.test.js`, `list.test.js`, `export.test.js`, `audit.test.js`. `tasks.test.js` được sửa. Tôi không tự chạy lại. |
| Xác thực và phân quyền: 401 khi thiếu hoặc sai `X-User`. Quyền admin/manager/member. Member thấy nhóm khác thì 404. Member chỉ sửa `status` trên nhiệm vụ giao cho mình, kể cả khi trùng giá trị cũ. | Đạt | `src/auth.js`. `src/handlers/tasks.js`: `findVisible`, `canSee`, nhánh PATCH theo vai trò, DELETE chỉ admin, POST member 403, manager khác nhóm 403. |
| Thứ tự kiểm tra: 401 → 400 query → 404 → 403 → 400 body | Đạt | `tasks.js` hoãn lỗi JSON bằng `readBody` để 403 đứng trước 400. `audit.js` kiểm query trước rồi mới kiểm quyền admin. |
| Lọc, tìm, sắp xếp, phân trang: dạng `{items,total,page,pageSize}`. Tham số lạ hoặc lặp thì 400. Báo lỗi theo tham số đầu tiên trên URL. Ngày hợp lệ theo lịch. `q` không phân biệt dấu và `đ`. `dueDate` null luôn ở cuối. Hòa thì theo số của `id`. Sắp xếp `title` dùng locale `vi`. | Đạt | `src/query.js`: `parseQuery` duyệt theo thứ tự URL, `validDate`, `int`, `norm`, `applySort`. `tasks.js`: member tự lọc theo nhóm của mình, `page` vượt quá thì trả `items` rỗng. |
| Xuất CSV: header HTTP, BOM, `\r\n` kể cả sau dòng cuối, RFC 4180, chống công thức (số giữ nguyên), `page`/`pageSize` bị 400, route đăng ký trước `/tasks/:id` | Đạt | `src/csv.js`. `tasks.js`: `EXPORT_PARAMS` bỏ `page`/`pageSize`, header trả đúng. `http.js` `send` cho phép ghi đè header với chuỗi. |
| Nhật ký: `seq` từ 1, `at` lấy từ `now()` của server, `changes` đã sắp xếp. `update` chỉ ghi trường đổi giá trị. `delete` ghi `[]`. Thao tác lỗi không ghi. `GET /audit` chỉ admin, mới nhất trước, lọc `taskId`. | Đạt | `store.record`. `tasks.js`: chỉ ghi sau khi validate xong. `handlers/audit.js`. |
| Không thêm thư viện ngoài, giữ nguyên `createServer({seed?, now?})` | Đạt | `src/server.js` chỉ dùng module `node:` và nội bộ. Chữ ký `createServer` giữ nguyên. |

## Rủi ro & việc còn mở
- Chưa có lần chạy HTTP độc lập do CTO thực hiện. Kết luận dựa trên đọc mã và báo cáo CCoding. Bộ ẩn có thể bắt các ca biên, ví dụ giá trị query rỗng như `status=`, hoặc `Content-Length` lạ.
- `validate` không kiểm `dueDate` trong body theo lịch (`2026-02-30` vẫn lọt). Đặc tả chỉ yêu cầu kiểm ngày theo lịch ở query, nên không phải lỗi, nhưng đây là hành vi đã có sẵn.
- Báo cáo "làn nhanh" không có kết luận review độc lập, vì diff không chạm vùng bảo mật.

## Việc tiếp theo
- **Chạy kiểm thử HTTP biên** · viết script gọi server thật với các ca biên (query rỗng, trùng tham số, tên có dấu `Đ`/NFD, CSV có dấu `"` và `=`, thứ tự 403/400) · `@qa-tester` · xong khi mọi ca khớp đặc tả.
