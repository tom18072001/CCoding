Tôi đã đọc xong đặc tả, mã nguồn và test; đang viết kết luận nghiệm thu. Hook của CCoding chặn `npm`/`node` với vai trò chỉ đọc, nên tôi dùng kết quả `npm test` do CCoding tự chạy, còn lại kiểm bằng cách đọc mã.

## Tóm tắt
**Chưa nghiệm thu.** Phần lớn đặc tả đã làm đúng: xác thực, phân quyền, thứ tự kiểm tra, lọc, tìm, phân trang, CSV, nhật ký, và `npm test` xanh (6/6). Tuy vậy, hàm so sánh khi sắp theo `createdAt` bị sai logic. Cả sắp mặc định lẫn `sort=-createdAt` đều không đúng đặc tả. Bộ nghiệm thu ẩn rất có thể sẽ bắt lỗi này. Test hiện có không phát hiện ra vì trong seed, thứ tự `id` trùng với thứ tự `createdAt`, và không có test nào cho `-createdAt` hay trường hợp `createdAt` bằng nhau.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực & phân quyền (401 → 400 → 404 → 403 → validate 400; quyền admin/manager/member) | Đạt | `src/handlers/tasks.js`: `authenticate` chạy đầu mọi route; `visible()` trả 404 cho member khác nhóm; manager khác nhóm hoặc đổi `team` → 403; member chỉ được sửa `status` của việc giao cho mình. Test `xác thực & phân quyền` (test/tasks.test.js:41-74) phủ các nhánh chính. |
| 2. Lọc, tìm, phân trang, mã lỗi `INVALID_QUERY` (báo tham số lỗi đầu tiên trên URL, tham số lặp hoặc lạ) | Đạt | `parseListQuery` duyệt tham số theo thứ tự trên URL và kiểm `seen`/`allowed`. Hàm `fold` dùng NFD, bỏ dải U+0300–U+036F (đã kiểm bằng `od`), đổi `đ/Đ` thành `d`. Test ở dòng 76-102. |
| 3. Sắp xếp đúng đặc tả (mặc định `createdAt` tăng dần, `-` là giảm dần, hòa thì theo id tăng dần) | **Không** | `src/handlers/tasks.js`, nhánh `else r = a.createdAt < b.createdAt ? -1 : !(a.createdAt > b.createdAt) ? 1 : 0;`. Khi a>b hàm trả 0, khi bằng nhau lại trả 1, tức là đảo ngược. Hệ quả: `sort=-createdAt` cho thứ tự không nhất quán, gần như tăng dần theo id. Khi các nhiệm vụ có `createdAt` trùng nhau (tạo cùng lúc với đồng hồ cố định), quy tắc hòa theo id không được áp. Các nhánh `dueDate`/`priority`/`title` đúng. |
| 4. Xuất CSV (header HTTP, BOM, CRLF, RFC 4180, chống chèn công thức, không nhận `page`/`pageSize`) | Đạt | `csvCell`/`toCsv` khớp đặc tả: thêm `'` trước khi bọc ngoặc kép, số giữ nguyên, `null` thành ô trống. Test `xuất CSV` (dòng 104-121) kiểm t7, t8, t11 và trả 400 khi có `page`. |
| 5. Nhật ký thao tác (`seq`, `at` lấy từ `now()`, `changes` sắp a→z, thao tác lỗi không ghi; `/audit` chỉ admin, mới nhất trước, lọc `taskId`) | Đạt | `store.logAudit` sắp `changes`. `update` chỉ ghi trường có giá trị đổi. `/audit` kiểm query (400) trước rồi mới kiểm quyền (403), đúng thứ tự. Test ở dòng 123-141. |
| 6. Cập nhật test cũ, thêm test cho từng tính năng, `npm test` xanh | Đạt | CCoding tự chạy: trước khi sửa 2/2 pass, sau khi sửa 6/6 pass, exit 0. Có 4 test mới, mỗi tính năng một test. Test CRUD đã đổi sang dạng `{items,total}`. |
| 7. Không thêm thư viện ngoài, giữ `createServer({seed?, now?})` | Đạt | Diff `package.json` chỉ nâng version lên 0.4.0, không có dependencies. `src/server.js` không đổi. |

## Rủi ro & việc còn mở
- **Cao:** lỗi so sánh `createdAt` (tiêu chí 3) sẽ làm hỏng mọi kiểm tra HTTP của bộ ẩn có dùng `sort=-createdAt`, hoặc sắp mặc định sau khi tạo nhiều nhiệm vụ cùng thời điểm.
- **Trung bình:** test thiếu các ca `sort=-createdAt`, `sort=title`/`-title` (dùng `localeCompare` với locale `vi`), hòa có id ≥ 10 (`t2` < `t10`), và `createdAt` trùng nhau.
- **Thấp:** tôi không tự chạy được thử qua HTTP vì hook chặn `node`/`npm` với vai trò chỉ đọc. Kết luận tiêu chí 3 dựa trên đọc mã; logic sai là hiển nhiên khi đọc, không phụ thuộc vào việc chạy.

## Việc tiếp theo
- **Sửa hàm so sánh `createdAt` và bổ sung test sắp xếp** · trong `queryTasks` thay bằng `r = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;`. Thêm test cho `sort=-createdAt` (kỳ vọng t12…t1), cho trường hợp tạo 2 nhiệm vụ với `now` cố định rồi kiểm thứ tự tăng và giảm (hòa vẫn theo id tăng dần), và cho `sort=title` · @senior-swe (Phòng Phát triển) · Xong khi `npm test` xanh và có các test trên.
