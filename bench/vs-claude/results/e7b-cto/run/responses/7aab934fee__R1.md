## Tóm tắt
Chưa nghiệm thu. Phần lớn đặc tả đã được hiện thực đúng theo đọc mã: xác thực và phân quyền, thứ tự kiểm tra lỗi, bộ lọc, CSV và nhật ký. `npm test` xanh (6/6). Tuy vậy, so sánh theo `createdAt` ở `src/handlers/tasks.js` có lỗi khiến sắp xếp mặc định sai khi hai nhiệm vụ có cùng `createdAt`. Bộ nghiệm thu ẩn gọi HTTP thật nhiều khả năng sẽ chạm vào lỗi này. Tôi chỉ đọc mã, không chạy được `node` (bị chặn) nên chưa tái hiện lỗi bằng lệnh.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, test cũ cập nhật theo dạng kết quả mới, có test cho từng tính năng | Đạt | Báo cáo: 2 → 6 test, 0 fail. `test/tasks.test.js` có các test "xác thực & phân quyền", "lọc, tìm, sắp xếp, phân trang", "xuất CSV", "nhật ký thao tác". |
| Xác thực và phân quyền: 401, 403, 404 theo vai trò, thứ tự 401 → 400 → 404 → 403 → body 400 | Đạt (theo đọc mã) | `tasks.js`: `authenticate`, `visible`. PATCH kiểm 404, rồi 403, rồi `readJson`, rồi 403 theo trường, rồi `validate`. DELETE nhiệm vụ nhóm khác của member trả 404 trước 403. `/audit` kiểm query trước rồi mới 403. |
| Lọc, tìm, phân trang: dạng `{items,total,page,pageSize}`, 400 `INVALID_QUERY` với `field` đầu tiên theo URL, tham số trùng hoặc lạ, `q` bỏ dấu và `đ`, `dueBefore`, ngày thật | Đạt (theo đọc mã) | `parseListQuery`, `isValidDate`, `fold`. Duyệt `searchParams` theo thứ tự URL. |
| Sắp xếp: hòa thì theo `id` số tăng dần, `dueDate` null luôn cuối, `title` dùng locale `vi` | Không | `tasks.js`, hàm `cmp`, nhánh `createdAt`: `r = a.createdAt < b.createdAt ? -1 : !(a.createdAt > b.createdAt) ? 1 : 0`. Khi hai giá trị bằng nhau, `!(a>b)` đúng nên trả 1, không phải 0. Kết quả là `r*dir \|\| idNum(a)-idNum(b)` luôn khác 0, tie-break theo `id` không bao giờ chạy và comparator không nhất quán. Đây là sắp xếp mặc định. Seed có 12 giá trị `createdAt` và đồng hồ `now` cố định trong test, nên trùng giá trị là tình huống thật. Nhánh `dueDate`, `priority`, `title` dùng `\|\| idNum` đúng. |
| CSV: header HTTP, BOM, `\r\n` sau dòng cuối, RFC 4180, chống công thức, `page`/`pageSize` bị 400 | Đạt (theo đọc mã) | `csvCell`, `toCsv`, route `/tasks/export.csv` (đăng ký trước `/tasks/:id`), `parseListQuery(...,false)`. |
| Nhật ký: `seq`, `at`, `changes` sắp a→z, chỉ ghi khi thành công, `GET /audit` chỉ admin và lọc `taskId` | Đạt (theo đọc mã) | `store.logAudit` sắp xếp `changes`. `update` chỉ ghi trường có giá trị khác. Thao tác lỗi ném lỗi trước khi ghi. `/audit` trả mới nhất trước. |

## Rủi ro & việc còn mở
- Lỗi so sánh `createdAt` bằng nhau (xem bảng). Cách sửa: trả 0 khi bằng nhau, tức `a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0`. Cần thêm test với các nhiệm vụ cùng `createdAt`, cả tăng lẫn giảm, trong đó có `t2` và `t10`.
- Chưa kiểm được bằng lệnh các điểm sau, vì tôi chỉ đọc mã:
  - Hành vi qua HTTP thật.
  - Chuỗi tiếng Việt sau chuẩn hóa NFD, vì lớp ký tự trong `fold` là ký tự Unicode literal.
  - BOM, vì `'﻿'` là literal trong tệp.
- Trường hợp cần xác nhận với giám đốc: PATCH của manager với `team` không hợp lệ (ví dụ `"C"`) và khác nhóm mình trả 403 trước 400. Điều này khớp thứ tự đặc tả nhưng nên có test.

## Việc tiếp theo
- **Sửa comparator `createdAt` và bổ sung test sắp xếp khi hòa** · Sửa nhánh `createdAt` trong `cmp` ở `src/handlers/tasks.js`; thêm test cho các nhiệm vụ cùng `createdAt` (tăng, giảm, `t2` < `t10`, `dueDate` null cuối); chạy `npm test` · `@senior-swe` · Xong khi `npm test` xanh và các test mới đạt.
