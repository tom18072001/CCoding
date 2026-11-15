Đang chốt nghiệm thu. Tôi đã đọc FEATURES.md, toàn bộ `src/` và `test/features.test.js`, và tìm thấy một lỗi chặn ở phần sắp xếp theo `dueDate`.

## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (9/9, CCoding tự chạy) và phần lớn đặc tả đã làm đúng: 401, phân quyền, mã lỗi và thứ tự kiểm tra, CSV, nhật ký thao tác. Nhưng `sort=dueDate` và `sort=-dueDate` sắp sai thứ tự vì hàm so sánh trong `src/query.js:81` viết sai logic. Test hiện có chỉ kiểm nhiệm vụ không có `dueDate` nằm cuối, không kiểm thứ tự ngày, nên lỗi lọt qua. Bộ nghiệm thu ẩn gọi HTTP thật gần như chắc chắn bắt được lỗi này.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực `X-User` → 401 `UNAUTHENTICATED` trên mọi route `/tasks…` và `/audit`, kiểm trước 400/404 | Đạt | Mọi route bọc `auth()` (`src/handlers/tasks.js:45`); test `features.test.js:18-27` |
| 2. Phân quyền admin/manager/member (403 `FORBIDDEN`, member gặp nhiệm vụ nhóm khác → 404, member chỉ sửa `status` của việc giao cho mình), thứ tự 404 → 403 → validate body | Đạt | `tasks.js:79-121`: lỗi JSON được hoãn để 403 báo trước 400; test `features.test.js:29-65` |
| 3. `GET /tasks` có lọc, tìm không dấu, phân trang, `INVALID_QUERY` báo đúng `field` theo thứ tự trên URL | Đạt | `src/query.js:29-68`; test `features.test.js:67-116` (gồm `2026-02-30`, `1.5`, `101`, tham số lặp, thứ tự lỗi) |
| 4. Sắp xếp đúng đặc tả cho cả 4 trường và hai chiều, hòa thì theo id tăng dần theo số | **Không** | `src/query.js:81`: `c = !a.dueDate ? 0 : !(a.dueDate < b.dueDate) ? -1 : a.dueDate > b.dueDate ? 1 : 0`. Khi a < b thì trả 0 (coi như hòa), khi a ≥ b thì trả −1. Hàm so sánh không nhất quán, nên thứ tự ngày sai ở cả hai chiều. Với seed, thứ tự đúng của `sort=dueDate` phải là t8, t12, t1, t9, t5, t6, t2, t11, t4, t7, t3, t10. Test `features.test.js:84-88` không kiểm thứ tự này |
| 5. Xuất CSV đúng header HTTP, BOM, `\r\n` (kể cả sau dòng cuối), RFC 4180, chống chèn công thức, `page`/`pageSize` → 400 | Đạt | `src/csv.js`, `tasks.js:48-54`; test `features.test.js:118-135` kiểm byte BOM, ô vừa có dấu `'` vừa bọc ngoặc kép, và dòng `-a` |
| 6. Nhật ký thao tác: `seq`, `at` lấy từ `now()`, `changes` sắp a→z và chỉ gồm trường đổi giá trị, thao tác lỗi không ghi, `/audit` chỉ cho admin, mới nhất trước, lọc `taskId` | Đạt | `src/store.js:45-49`, `tasks.js:56-66`; test `features.test.js:137-154` |
| 7. Test cũ sửa theo dạng kết quả mới, có test cho từng tính năng, `npm test` xanh, không thêm thư viện ngoài | Đạt | CCoding tự chạy: `npm test` exit 0, 9 pass / 0 fail; `package.json` không có dependencies |

Ghi chú: tôi không tự chạy được lệnh nào vì hook chỉ cho phép đọc. Các kết luận dựa trên mã nguồn và kết quả `npm test` do CCoding chạy.

## Rủi ro & việc còn mở
- **Cao:** sort theo `dueDate` sai (tiêu chí 4). Đây là hành vi đặc tả nêu rõ, bộ nghiệm thu ẩn rất có thể kiểm.
- **Thấp:** đặc tả không nói rõ trường hợp vừa có tham số lặp vừa có tham số khác lỗi thì báo `field` nào. Mã hiện tại báo theo vị trí xuất hiện đầu tiên của tham số, cách hiểu này hợp lý.
- **Thấp:** sort theo `createdAt`/`priority` dựa vào so sánh `<` và `>` trên dữ liệu đúng kiểu. Với seed hiện tại thì ổn.

## Việc tiếp theo
- **Sửa sort theo `dueDate` và thêm test thứ tự** · Sửa comparator ở `src/query.js:81` thành `c = !a.dueDate ? 0 : a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0`. Thêm test HTTP so khớp nguyên mảng id cho `sort=dueDate` và `sort=-dueDate` trên seed, đồng thời kiểm hòa ngày (t5/t6, t1/t9) thì theo id tăng dần và null nằm cuối ở cả hai chiều. Chạy lại `npm test` · Phòng Phát triển (`@senior-swe`).
