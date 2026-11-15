## Tóm tắt
Chưa nghiệm thu. Phần lớn đặc tả đã được hiện thực đúng khi đọc mã: xác thực, phân quyền, validate query, CSV và audit. Nhưng có một lỗi thật ở sắp xếp mặc định `createdAt` (`src/handlers/tasks.js`, hàm `cmp` trong `queryTasks`). Test hiện có không bắt được lỗi này. Phần "thêm test cho từng tính năng" cũng còn mỏng: chỉ 6 test cho 4 tính năng. Tôi chưa chạy được server để kiểm chứng bằng HTTP thật, vì hook chặn việc ghi tệp kịch bản; kết luận dựa trên đọc mã và kết quả `npm test` của CCoding.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, test cũ đã cập nhật theo dạng `{items,total,page,pageSize}` | Đạt | Báo cáo: sau thực thi 6/6 pass, exit 0 (baseline 2/2). `test/tasks.test.js` và `test/helpers.js` có sửa trong diff. |
| Xác thực và phân quyền đúng vai trò và đúng thứ tự 401 → 400 → 404 → 403 → 400 | Đạt (qua đọc mã) | `authenticate` chạy đầu mọi route. Query được parse trước khi tra 404. Member bị 404 khi xem nhiệm vụ nhóm khác (`visible`). Member PATCH ngoài `status` hoặc không được giao cho mình → 403. Manager bị 403 khi tạo, chuyển hoặc sửa nhóm khác. Chỉ admin được xóa. Chưa chạy HTTP thật. |
| Lọc, tìm, phân trang, validate query (`INVALID_QUERY` kèm `field`, tham số lặp hoặc lạ, `q` bỏ dấu và `đ`, `dueBefore`, `none`) | Đạt (qua đọc mã) | `parseListQuery` duyệt theo thứ tự trên URL, nên báo tham số lỗi đầu tiên. Regex số nguyên chặt. `isValidDate` kiểm theo lịch. |
| Sắp xếp đúng đặc tả (mặc định `createdAt` tăng dần, hòa theo số `id`, `dueDate` null ở cuối, `title` locale `vi`) | **Không** | Nhánh `createdAt` trong `cmp` viết sai: `a.createdAt < b.createdAt ? -1 : !(a.createdAt > b.createdAt) ? 1 : 0`. Khi `a > b` trả 0, khi hai giá trị bằng nhau trả 1. Hệ quả là sắp xếp mặc định và `sort=±createdAt` sai, chỉ trông đúng khi `id` tình cờ cùng thứ tự với `createdAt`. Test chỉ nhắc `createdAt` ở dòng 27 và 110, không có test thứ tự. Các nhánh `dueDate`, `title`, `priority` nhìn đúng. |
| Xuất CSV: header HTTP, BOM, `\r\n`, RFC 4180, chống công thức, `page`/`pageSize` → 400 | Đạt (qua đọc mã) | `toCsv` và `csvCell` đúng đặc tả. Route `export.csv` đăng ký trước `/tasks/:id`. Test dòng 110 kiểm BOM và dòng tiêu đề. |
| Nhật ký: `seq`, `at`, `changes` sắp xếp, chỉ ghi khi thành công, `GET /audit` chỉ admin, lọc `taskId` | Đạt (qua đọc mã) | `store.logAudit` và route `/audit`. Với `/audit`, kiểm tham số (400) chạy trước kiểm quyền admin (403), đúng thứ tự đặc tả. `logAudit` chỉ gọi sau khi validate xong, nên thao tác lỗi không ghi. |
| Có test cho từng tính năng | Không đầy đủ | Chỉ 6 test (4 mới) cho 4 tính năng. Chưa thấy test cho sort, phân trang, `q` bỏ dấu, thứ tự lỗi query, chống công thức CSV hay quyền member/manager chi tiết. |

## Rủi ro & việc còn mở
- **Cao:** lỗi comparator `createdAt` sẽ làm bộ nghiệm thu ẩn hỏng ở mặc định của `GET /tasks`, `export.csv` và mọi chỗ phụ thuộc thứ tự. Sửa được trong một dòng.
- **Trung bình:** độ phủ test thấp nên các hành vi còn lại chưa có bằng chứng chạy thật. Những phần tôi kết luận "Đạt" chỉ dựa trên đọc mã.
- **Thấp:** `POST` của manager với `team` không hợp lệ (ví dụ `"C"`) trả 403 thay vì 400. Đây là cách đọc có thể chấp nhận theo "team khác nhóm mình → 403", nhưng nên đối chiếu thêm với đặc tả.
- Báo cáo của phòng chỉ ghi "đã chạy `npm test`", không có mô tả đối chiếu từng quy tắc. Review được bỏ qua vì diff không chạm vùng bảo mật, dù thay đổi liên quan trực tiếp tới phân quyền.

## Việc tiếp theo
- **Sửa comparator `createdAt` và thêm test sắp xếp** · Sửa nhánh `createdAt` trong `queryTasks`: so sánh `<` → -1, `>` → 1, bằng → 0, rồi hòa theo `id` số. Thêm test cho mặc định, `-createdAt`, `dueDate` có null ở cuối, `title` tiếng Việt · dev · xong khi test sắp xếp xanh và `npm test` xanh.
- **Bổ sung test theo từng tính năng qua HTTP thật** · Phân quyền theo ma trận vai trò, thứ tự lỗi 401/400/404/403, phân trang vượt trang, `q` bỏ dấu và `đ`, các trường hợp CSV đặc biệt, `seq`/`changes` của audit · dev · xong khi mỗi tính năng có ít nhất các ca chính và ca lỗi.
