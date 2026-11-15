Bản nghiệm thu dưới đây dựa trên đọc code và đặc tả. Tôi không chạy được lệnh nào (hook của CCoding chặn `node`), nên kết quả `npm test` lấy từ lần CCoding tự chạy.

## Tóm tắt
**Chưa nghiệm thu.** Phần lớn đặc tả đã làm đúng: xác thực và phân quyền, thứ tự kiểm tra, bộ lọc, CSV, nhật ký thao tác. `npm test` cũng xanh (9/9). Nhưng có một lỗi chắc chắn: **sắp xếp theo `dueDate` sai thứ tự** giữa các nhiệm vụ đều có hạn. Bộ test có sẵn không bắt được lỗi này vì chỉ kiểm việc nhiệm vụ không có `dueDate` nằm cuối danh sách. Bộ nghiệm thu ẩn gọi HTTP thật nên gần như chắc chắn sẽ trượt ở chỗ này.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, có test cho từng tính năng, test cũ đã cập nhật theo dạng kết quả mới | Đạt | CCoding tự chạy: trước khi sửa 2/2, sau khi sửa 9/9 pass, exit 0. Có thêm `test/features.test.js` và sửa `test/tasks.test.js` |
| Không thêm thư viện ngoài | Đạt | `package.json` không có `dependencies`; mã nguồn chỉ dùng `node:*` |
| Xác thực và phân quyền: 401 khi thiếu hoặc sai `X-User`; quyền admin/manager/member; member gặp nhiệm vụ nhóm khác thì 404; thứ tự 401→400→404→403→400 | Đạt | `src/handlers/tasks.js`: `auth()` chạy trước mọi handler. `visible()` trả 404 trước 403. `readBody` hoãn lỗi JSON để kiểm quyền (403) chạy trước validate. `/audit` kiểm query trước khi kiểm vai trò |
| Lọc, tìm, phân trang, các lỗi `INVALID_QUERY` (tham số lạ, tham số lặp, báo lỗi đầu tiên theo URL), `q` bỏ dấu tiếng Việt | Đạt | `src/query.js` `parseTaskQuery`: Map đếm theo thứ tự xuất hiện; `validDate` kiểm ngày có thật; `intParam`; `normalize` (NFD, bỏ dấu, đ→d) |
| **Sắp xếp `dueDate` / `-dueDate` đúng thứ tự, hòa thì theo id tăng dần** | **Không** | `src/query.js`, nhánh `dueDate` của `filterSort`: `c = … !(a.dueDate < b.dueDate) ? -1 : a.dueDate > b.dueDate ? 1 : 0`. Hệ quả: a<b cho 0, a==b cho -1, a>b cho -1. Thứ tự sai và không nhất quán, và khi trùng ngày thì không rơi xuống so id. Test ở `test/features.test.js:84-88` chỉ kiểm phần null nằm cuối nên không phát hiện |
| Xuất CSV: header HTTP, BOM, `\r\n` cả sau dòng cuối, quy tắc RFC 4180, chống chèn công thức, `page`/`pageSize` bị 400 | Đạt | `src/csv.js` (thêm `'` trước rồi mới bọc ngoặc kép; số giữ nguyên). `parseTaskQuery(query, { paged: false })`. Header đặt trong route export |
| Nhật ký thao tác: `seq`, `at=now()`, `changes` sắp a→z, chỉ ghi khi thành công; `GET /audit` chỉ admin, mới nhất trước, lọc theo `taskId` | Đạt | `store.logAudit` được gọi sau validate và sau khi ghi. `changes` của update chỉ gồm trường có giá trị mới khác giá trị cũ. `/audit` sắp `seq` giảm dần |

## Rủi ro & việc còn mở
- **Cao:** lỗi sắp xếp theo `dueDate` (nêu ở bảng trên). Đây là phần bộ chấm ẩn rất dễ kiểm.
- **Thấp:** `page` có giá trị nguyên rất lớn (lớn hơn `MAX_SAFE_INTEGER`) đang bị trả 400. Đặc tả chỉ yêu cầu số nguyên ≥ 1, nên có thể bộ chấm mong 200 với `items: []`.
- **Thấp:** khi member PATCH với body rỗng `{}`, server trả 200 và vẫn ghi một mục audit với `changes: []`. Đặc tả không nói rõ trường hợp này.
- Quy trình: lần này review đi làn nhanh, được miễn review bắt buộc. Lỗi logic trên lọt qua vì test không kiểm thứ tự thật của kết quả sắp xếp.

## Việc tiếp theo
- **Sửa sắp xếp theo `dueDate` và thêm test thứ tự** · thay biểu thức so sánh bằng `a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0`; thêm test kiểm thứ tự chính xác theo cả hai chiều, gồm trường hợp trùng ngày (hòa thì id tăng dần) và null nằm cuối · @senior-swe (phòng Dev)
