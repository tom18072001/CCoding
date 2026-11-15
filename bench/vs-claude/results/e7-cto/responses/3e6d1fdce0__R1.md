## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (9/9) và phần lớn đặc tả đã có trong mã: xác thực và phân quyền, thứ tự kiểm tra, validate query, CSV, audit. Tuy nhiên `sort=dueDate` và `sort=-dueDate` sai logic so sánh (`src/query.js`, nhánh `field === 'dueDate'` trong `filterSort`), và test hiện có không bắt được lỗi này. Bộ nghiệm thu ẩn gọi API thật, nên khả năng cao sẽ trượt ở đây. Tôi không chạy được `node` (vai trò chỉ đọc), nên kết luận về lỗi này dựa trên đọc mã.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, test cũ cập nhật cho dạng `{items,total,page,pageSize}`, có test cho từng tính năng | Đạt | Báo cáo: baseline 2/2, sau thực thi 9/9, exit 0. Có `test/features.test.js` mới và `test/tasks.test.js` được sửa. |
| Tính năng 1: 401, 403 và 404 đúng vai trò (member không thấy nhiệm vụ nhóm khác, member chỉ sửa `status` của nhiệm vụ giao cho mình, manager bị giới hạn theo nhóm, xóa chỉ admin) | Đạt (qua đọc mã) | `src/handlers/tasks.js`: `authenticate`, `visible`, nhánh POST/PATCH/DELETE. Lỗi JSON body được hoãn để 403 chạy trước 400. |
| Thứ tự kiểm tra 401 → 400 query → 404 → 403 → 400 body | Đạt (qua đọc mã) | `src/handlers/tasks.js`: `parseTaskQuery` chạy trước kiểm tra quyền; PATCH kiểm tra 404 rồi 403 rồi validate. `/audit` kiểm tra query trước khi kiểm tra admin. |
| Tính năng 2: lọc, tìm (bỏ dấu, `đ`→`d`), phân trang, tham số lạ hoặc lặp → 400, báo lỗi đầu tiên theo thứ tự trên URL | Đạt (qua đọc mã) | `src/query.js`: `parseTaskQuery`, `normalize`, `validDate`, `intParam`. |
| Tính năng 2: `sort=dueDate` và `sort=-dueDate` đúng thứ tự, nhiệm vụ không có `dueDate` nằm cuối | **Không** | `src/query.js`, `filterSort`: biểu thức `!(a.dueDate < b.dueDate) ? -1 : a.dueDate > b.dueDate ? 1 : 0` đảo logic. Khi a<b trả 0 (rơi về hòa theo id), khi a≥b trả -1. Thứ tự theo ngày vì vậy sai. Test ở `test/features.test.js:84-88` chỉ kiểm tra "không có dueDate nằm cuối", không kiểm tra thứ tự các ngày. |
| Tính năng 3: CSV (header, BOM, `\r\n`, RFC 4180, chống chèn công thức, không phân trang) | Đạt (qua đọc mã) | `src/csv.js`, route `export.csv` dùng `paged:false` nên `page`/`pageSize` → 400. Có test ở `test/features.test.js:123`. |
| Tính năng 4: audit (`seq`, `at` theo `now()`, `changes` sắp xếp, chỉ ghi khi thành công, `GET /audit` chỉ admin, lọc `taskId`) | Đạt (qua đọc mã) | `src/store.js` `logAudit`; `src/handlers/tasks.js` chỉ ghi sau khi validate thành công. |

## Rủi ro & việc còn mở
- **Lỗi chặn nghiệm thu:** sort theo `dueDate` sai (xem bảng). Ảnh hưởng trực tiếp tới bộ nghiệm thu ẩn.
- Các sort khác (`createdAt`, `priority`, `title`) dùng so sánh trực tiếp hoặc `localeCompare('vi')`, nhìn đúng nhưng chưa có test kiểm tra thứ tự cụ thể.
- `validate` của body (`dueDate`) chỉ kiểm tra dạng chuỗi, không kiểm tra ngày có thật theo lịch. Đặc tả không yêu cầu điều này, nên chỉ là lưu ý.
- Các tiêu chí "Đạt (qua đọc mã)" chưa được tôi chạy thật qua HTTP. Chỉ có kết quả `npm test` là bằng chứng chạy thật.

## Việc tiếp theo
- **Sửa so sánh `dueDate` trong `filterSort` và thêm test thứ tự**: dev / `@senior-swe`. Phạm vi là `src/query.js` và `test/features.test.js`. Test cần khẳng định thứ tự ngày tăng và giảm, có nhiệm vụ không có ngày nằm cuối, hòa theo id số. Xong khi `npm test` xanh và test mới đỏ nếu hoàn lại lỗi cũ.
