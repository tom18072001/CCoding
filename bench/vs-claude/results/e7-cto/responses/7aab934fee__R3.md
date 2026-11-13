## Tóm tắt

Chưa nghiệm thu. Đọc mã `src/handlers/tasks.js` đối chiếu `FEATURES.md` thì thấy 3 trong 4 tính năng đúng đặc tả. Tính năng sắp xếp theo `createdAt` (mặc định của danh sách) có lỗi rõ ràng, nên tính năng 2 và CSV bị ảnh hưởng. Tôi không chạy được lệnh trong phiên này (bị chặn xin quyền). Kết quả `npm test` xanh (6/6) là lấy từ báo cáo của CCoding, tôi không tự chạy lại. Các test hiện có không bắt được lỗi này.

**Lỗi:** `src/handlers/tasks.js`, hàm so sánh trong `queryTasks`, nhánh `createdAt`:
```js
r = a.createdAt < b.createdAt ? -1 : !(a.createdAt > b.createdAt) ? 1 : 0;
```
- Khi `a` lớn hơn `b` thì trả 0, tức là rơi xuống so theo `id`.
- Khi hai giá trị bằng nhau thì trả 1, và `cmp(a,b)` = `cmp(b,a)` = 1. Hàm so sánh không nhất quán.
- Hệ quả: `sort=-createdAt` không cho thứ tự mới nhất trước mà thành thứ tự theo `id`. Khi `createdAt` trùng nhau (đồng hồ cố định trong test) thì thứ tự hòa không theo `id` như đặc tả.
- Cách sửa: dùng `r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0`.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực & phân quyền (401, 403, 404 theo vai trò, thứ tự kiểm tra) | Đạt | `authenticate()` chạy đầu mọi route. Member nhóm khác nhận 404 qua `visible()`. Member chỉ được PATCH `status` trên nhiệm vụ giao cho mình. Manager bị chặn `team` khác nhóm khi tạo/sửa và không được xóa. Chỉ admin được xóa. Kiểm 403 đặt trước `validate` body. |
| 2. Danh sách: lọc, tìm không dấu, phân trang, validate query | Đạt | `parseListQuery`: từ chối tham số lạ hoặc trùng, báo lỗi theo thứ tự xuất hiện trên URL, `INVALID_QUERY` kèm `field`. `fold()` xử lý NFD và `đ`. Kết quả có dạng `{items,total,page,pageSize}`. |
| 3. Sắp xếp (mặc định `createdAt`, `-` giảm dần, hòa theo số `id`, `dueDate` null ở cuối) | Không | Lỗi so sánh `createdAt` nêu trên. Các nhánh `dueDate`, `title`, `priority` đúng. |
| 4. Xuất CSV (header, BOM, `\r\n`, RFC 4180, chống công thức, không phân trang) | Đạt (chưa chạy) | `toCsv`/`csvCell` và header `content-type`, `content-disposition` đúng đặc tả. `page`/`pageSize` bị loại khỏi danh sách tham số cho phép. Route được đăng ký trước `/tasks/:id`. Thứ tự dòng trong CSV vẫn phụ thuộc lỗi sắp xếp ở tiêu chí 3. |
| 5. Nhật ký thao tác và `GET /audit` | Đạt | `store.logAudit` (`seq` tăng dần, `at = now().toISOString()`, `changes` sắp a→z). `update` chỉ ghi trường đổi giá trị. Chỉ ghi khi thao tác thành công. `/audit` chỉ cho admin, mới nhất trước, chỉ nhận `taskId`. |
| 6. Test cập nhật, thêm test cho từng tính năng, `npm test` xanh | Chưa kiểm được | Báo cáo CCoding ghi 2 test trước và 6 test sau, đều pass. Tôi không tự chạy lại. Chưa xác nhận test có phủ sắp xếp `createdAt` giảm dần hoặc trường hợp `createdAt` trùng nhau. |
| 7. Không thêm thư viện ngoài | Đạt | `package.json` không có `dependencies`. Mã chỉ dùng module `node:`. |

```json
{"accepted": false, "summary": "Các tính năng xác thực/phân quyền, lọc/tìm/phân trang, CSV và nhật ký đúng đặc tả khi đọc mã, nhưng hàm so sánh sắp xếp theo createdAt sai (a>b trả 0, a==b trả 1) nên sort=-createdAt và thứ tự hòa sai, ảnh hưởng cả CSV. Chưa tự chạy lại npm test.", "criteria": [{"name": "Xác thực & phân quyền đúng vai trò và thứ tự kiểm tra", "result": "pass", "evidence": "src/handlers/tasks.js: authenticate, visible(), kiểm tra 403 trước validate body"}, {"name": "Danh sách: lọc, tìm không dấu, phân trang, validate query", "result": "pass", "evidence": "parseListQuery và fold() trong src/handlers/tasks.js"}, {"name": "Sắp xếp đúng (mặc định createdAt, hòa theo id số, dueDate null cuối)", "result": "fail", "evidence": "Nhánh createdAt trong queryTasks: `a<b?-1:!(a>b)?1:0` trả 0 khi a>b và 1 khi bằng nhau"}, {"name": "Xuất CSV đúng định dạng và quyền", "result": "pass", "evidence": "toCsv/csvCell và header trong route /tasks/export.csv; thứ tự dòng bị ảnh hưởng bởi lỗi sắp xếp"}, {"name": "Nhật ký thao tác và GET /audit", "result": "pass", "evidence": "store.logAudit, route /audit, các lệnh gọi logAudit trong POST/PATCH/DELETE"}, {"name": "Test cập nhật/thêm đầy đủ và npm test xanh", "result": "unknown", "evidence": "Báo cáo CCoding: 6/6 pass; tôi không tự chạy lại và chưa thấy test phủ createdAt giảm dần/trùng"}, {"name": "Không thêm thư viện ngoài", "result": "pass", "evidence": "package.json không có dependencies"}], "risks": ["Hàm so sánh createdAt sai: bộ nghiệm thu ẩn rất dễ bắt được (sort=-createdAt, createdAt trùng nhau do đồng hồ cố định)", "Test hiện có có thể không phủ trường hợp createdAt trùng hoặc sắp giảm dần", "Chưa tự chạy npm test hay gọi HTTP thật trong lần nghiệm thu này"], "followUps": [{"title": "Sửa so sánh createdAt và thêm test", "brief": "Trong src/handlers/tasks.js, hàm queryTasks, sửa nhánh sort createdAt thành `r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0` để hòa rơi xuống so theo id số tăng dần. Thêm test trong test/tasks.test.js cho: sort=createdAt, sort=-createdAt, các nhiệm vụ trùng createdAt (đồng hồ cố định) kiểm tra hòa theo id số (t2 < t10), và CSV cùng thứ tự. Chạy npm test để đảm bảo xanh.", "department": "dev"}]}
```