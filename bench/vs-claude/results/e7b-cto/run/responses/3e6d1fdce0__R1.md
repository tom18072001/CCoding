## Tóm tắt

**Chưa nghiệm thu.** `npm test` xanh (9/9) và phần lớn đặc tả có trong mã: xác thực, phân quyền, lọc/phân trang, CSV, audit. Nhưng đọc `src/query.js` thấy `sort=dueDate` và `sort=-dueDate` bị lỗi so sánh. Test hiện có chỉ kiểm nhiệm vụ không có `dueDate` nằm cuối, không kiểm thứ tự các ngày. Hồ sơ cũng ghi "không thuộc diện bắt buộc review" nên chưa ai bắt được lỗi này. Bộ nghiệm thu ẩn gọi HTTP thật nhiều khả năng sẽ trượt ở chỗ này.

Vai trò CTO chỉ đọc nên tôi không chạy được mã. Kết luận về lỗi sắp xếp dựa trên đọc mã, chưa chạy lại.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, test cũ đã cập nhật theo dạng `{items,total,page,pageSize}`, có test cho từng tính năng | Đạt | Báo cáo: baseline 2 pass → sau 9 pass, 0 fail. `test/features.test.js` (154 dòng) và `test/tasks.test.js` đã sửa |
| Xác thực 401 và phân quyền admin/manager/member, đúng thứ tự 401→400→404→403→400 | Đạt (đọc mã) | `src/handlers/tasks.js`: `authenticate`, `visible`, nhánh POST/PATCH/DELETE. Member bị 404 trước 403. Lỗi JSON hoãn lại để 403 chạy trước 400. Chưa chạy lại để xác nhận |
| Lọc, tìm, phân trang và mã `INVALID_QUERY` (tham số lạ hoặc trùng, lỗi đầu tiên theo thứ tự URL, `page` vượt trang) | Đạt (đọc mã) | `src/query.js`: `parseTaskQuery`, `normalize` (NFD, `đ`→`d`), `validDate` kiểm lịch thật |
| Sắp xếp: `dueDate` tăng/giảm đúng, hòa theo `id` số tăng dần, nhiệm vụ không có `dueDate` luôn cuối | **Không** | `src/query.js`, dòng `c = !a.dueDate ? 0 : !(a.dueDate < b.dueDate) ? -1 : a.dueDate > b.dueDate ? 1 : 0`. Khi `a.dueDate >= b.dueDate` luôn trả -1, còn `a < b` trả 0, nên so sánh sai và không nhất quán. Ngày bằng nhau cũng không rơi về hòa theo `id`. Test (`test/features.test.js:84-88`) chỉ kiểm phần cuối, không kiểm thứ tự ngày |
| CSV: header HTTP, BOM, `\r\n`, RFC 4180, chống công thức, `page`/`pageSize` → 400, route đặt trước `/tasks/:id` | Đạt (đọc mã) | `src/csv.js`, `export.csv` trong `src/handlers/tasks.js` dùng `paged:false` |
| Audit: ghi khi thành công, `changes` sắp a→z, `GET /audit` chỉ admin, `taskId` là tham số duy nhất, mới nhất trước | Đạt (đọc mã) | `store.logAudit`, handler `/audit`. Kiểm tham số (400) chạy trước kiểm quyền (403), đúng thứ tự |

## Rủi ro & việc còn mở

- **Cao:** lỗi so sánh `dueDate` ở trên; chắc chắn ảnh hưởng `sort=dueDate` và `sort=-dueDate`.
- **Trung bình:** test chưa phủ các trường hợp biên của đặc tả: hòa theo `id` số (`t2` < `t10`), sắp xếp `title` theo locale `vi`, CSV có ký tự công thức/dấu phẩy/ngoặc kép, PATCH của member với body chứa trường khác `status`, thứ tự lỗi query.
- **Thấp:** `PATCH` không có thay đổi vẫn ghi mục audit với `changes: []`. Đặc tả không nói rõ, nên giữ nguyên hoặc hỏi giám đốc.
- Đầu ra "Đạt" ở các hàng đọc mã chưa có lần chạy HTTP thật nào làm bằng chứng.

## Việc tiếp theo

- **Sửa so sánh `dueDate` và bổ sung test biên.** Phạm vi: sửa nhánh `dueDate` trong `filterSort` (`src/query.js`) thành so sánh ngày tăng dần bình thường, hòa thì theo `id` số tăng dần, nhiệm vụ không có `dueDate` luôn cuối. Thêm test sắp xếp có thứ tự ngày, hòa theo `id` (`t2`/`t10`), `title` theo locale `vi`, và vài ca CSV/phân quyền biên. Người làm: `@senior-swe`. Xong khi `npm test` xanh và test mới trượt trên mã cũ.
