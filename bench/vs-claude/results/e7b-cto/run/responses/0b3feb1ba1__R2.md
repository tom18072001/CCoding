Tôi đã đọc xong đặc tả, mã nguồn và test, giờ viết kết luận nghiệm thu.

## Tóm tắt
**Nghiệm thu.** Cả 4 tính năng trong `FEATURES.md` đã được làm và khớp từng quy tắc tôi đối chiếu: mã lỗi, thứ tự kiểm 401→400→404→403→400, định dạng CSV, cách ghi nhật ký. Lần chạy `npm test` do CCoding tự thực hiện ra exit 0 với 8/8 test đạt, test cũ đã sửa cho dạng kết quả mới, không thêm thư viện ngoài. Hook đã chặn khi tôi định chạy `npm test`, nên tôi không tự chạy test hay gọi HTTP thử. Phần kết luận dưới đây dựa trên việc đọc code kỹ cộng với kết quả CCoding đã chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Xác thực `X-User` và phân quyền admin/manager/member, trả đúng 401/403/404 | Đạt | `src/query.js` (`authenticate`) dùng chung cho mọi route `/tasks…` và `/audit`. Trong `src/handlers/tasks.js`, hàm `hidden()` trả 404 khi member truy cập nhiệm vụ nhóm khác. Manager tạo hoặc sửa nhiệm vụ nhóm khác bị 403, đổi `team` sang nhóm khác bị 403, xóa bị 403. Member tạo hoặc xóa bị 403. Member chỉ sửa được trường `status` của nhiệm vụ giao cho mình. Có test `phân quyền member/manager` trong `test/features.test.js:27-51`. |
| Thứ tự kiểm 401 → 400 query → 404 → 403 → 400 body | Đạt | Trong PATCH, các kiểm 404 và 403 chạy trước `readJson` và `validate`. Trong `/audit`, kiểm query (400) chạy trước kiểm admin (403). Test ở dòng 24 xác nhận 401 đi trước 400, dòng 49 xác nhận lỗi validate body trả 400 sau khi đã qua kiểm quyền. |
| `GET /tasks` có lọc, tìm, sắp xếp, phân trang và lỗi `INVALID_QUERY` theo đúng đặc tả | Đạt | `parseQuery` trong `src/query.js` duyệt tham số theo thứ tự xuất hiện trên URL, nên báo đúng tham số lỗi đầu tiên. Tham số lạ hoặc lặp lại trả 400. Ngày được kiểm có thật trên lịch. `fold` chuẩn hóa NFD, bỏ dấu trong dải U+0300–U+036F (tôi đã kiểm bằng byte) và đổi đ/Đ thành d. Nhiệm vụ không có `dueDate` luôn xếp cuối, khi hòa thì xếp theo `id` dạng số tăng dần. Kết quả có dạng `{items,total,page,pageSize}`. Test ở `test/features.test.js:53-92`. |
| Xuất CSV: header HTTP, BOM, `\r\n`, chuẩn RFC 4180, chống chèn công thức, cấm phân trang | Đạt | `toCsv` và `cell` trong `src/query.js`: BOM là `EF BB BF` (đã kiểm bằng byte), giá trị chuỗi bắt đầu bằng `=+-@\t\r` được thêm `'` trước rồi mới bọc ngoặc kép. Route `export.csv` được đăng ký trước `/tasks/:id`. Test so khớp chính xác nội dung và byte thô ở `test/features.test.js:94-123`. |
| Nhật ký thao tác: `seq`, `at` lấy từ `now()`, `changes` sắp a→z, thao tác lỗi không ghi, `/audit` chỉ cho admin và có lọc `taskId` | Đạt | `src/store.js` (`logAudit`). Bản ghi chỉ được ghi sau khi thao tác thành công. Với `update`, `changes` chỉ gồm các trường có giá trị đổi khác. Test ở `test/features.test.js:125-141`. |
| Test có sẵn đã cập nhật, mỗi tính năng có test riêng, `npm test` xanh | Đạt | Phần sửa trong `test/tasks.test.js` và `test/helpers.js` (mặc định gửi `x-user: u1`). Lần CCoding tự chạy: trước khi sửa 2/2, sau khi sửa 8/8 đạt, exit 0. |
| Không thêm thư viện ngoài | Đạt | `package.json` không có trong diff và không có `dependencies`. |

## Rủi ro & việc còn mở
- **Thấp:** Các route `GET/PATCH/DELETE /tasks/:id` và `POST /tasks` bỏ qua tham số truy vấn thay vì trả 400. Đặc tả chỉ liệt kê tham số cho danh sách và `/audit`, nên cách hiểu này hợp lý. Nếu bộ chấm ẩn hiểu khác thì có thể lệch.
- **Thấp:** Khi manager gửi `team` không hợp lệ (ví dụ `"C"`), API trả 403 chứ không phải 400. Cách này đúng theo nghĩa đen của đặc tả ("team khác nhóm mình → 403") và đúng thứ tự 403 trước 400.
- **Thấp:** Member gửi PATCH với body `{}` vẫn được 200 và ghi một bản ghi `update` có `changes: []`. Đặc tả không cấm trường hợp này.
- Tôi không tự gọi HTTP thử được vì hook chặn lệnh không chỉ-đọc. Bằng chứng chạy thật duy nhất là lần chạy `npm test` của CCoding.

## Việc tiếp theo
- **Chốt cách xử lý query ở route đơn lẻ.** Cần xác nhận với giám đốc xem `/tasks/:id` và `POST /tasks` có phải trả 400 khi có tham số truy vấn lạ hay không; nếu có thì phòng dev bổ sung kèm test. Người quyết: giám đốc.
