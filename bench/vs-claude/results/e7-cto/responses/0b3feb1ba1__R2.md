Đã đọc xong spec, mã nguồn và test; dưới đây là kết luận nghiệm thu.

## Tóm tắt
**Nghiệm thu.** Tôi đã so từng quy tắc trong `FEATURES.md` với mã trong `src/handlers/tasks.js`, `src/query.js` và `src/store.js`; cả 7 tiêu chí đều Đạt. `npm test` xanh với 8/8 test pass. Kết quả này do CCoding tự chạy. Tôi không tự chạy lại được vì hook chỉ cho đọc đã chặn lệnh `npm`. Còn vài chỗ spec viết chưa rõ hoặc test còn mỏng. Không chỗ nào trái với spec, nên tôi xếp chúng vào mục rủi ro.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. Xác thực: thiếu hoặc sai `X-User` trả 401 `UNAUTHENTICATED` trên mọi route `/tasks…` và `/audit`, và 401 được kiểm trước 400 | Đạt | `authenticate()` ở `src/query.js:8-13` được gọi đầu tiên trong mọi handler (`src/handlers/tasks.js`). Test `features.test.js:15-25` kiểm cả trường hợp `?bogus=1` khi không có user |
| 2. Phân quyền và thứ tự 401 → 400 query → 404 → 403 → 400 body: member không thấy nhiệm vụ nhóm khác (404), chỉ sửa `status` của nhiệm vụ giao cho mình. Manager chỉ tạo và sửa trong nhóm mình, không chuyển nhóm, không xóa. Admin làm được mọi việc | Đạt | Ở PATCH và DELETE, `hidden()` (404) chạy trước các kiểm 403, rồi mới tới `readJson` và `validate` (`tasks.js:64-91`). POST của member trả 403 trước khi đọc body. Manager gửi `team` khác nhóm bị chặn 403 trước `validate`. Test `features.test.js:27-51` |
| 3. `GET /tasks` trả `{items,total,page,pageSize}`. Có lọc `status`/`assignee=none`/`team`/`dueBefore`, tìm `q` bỏ dấu (NFD, `đ`→`d`). `sort` có chiều giảm; khi hòa thì xếp theo id dạng số; nhiệm vụ không có `dueDate` luôn ở cuối; `title` so bằng `localeCompare('vi')` | Đạt | `parseQuery`/`applyQuery` ở `src/query.js:25-89`. Grep xác nhận dải ký tự kết hợp U+0300–U+036F trong `fold` (dòng 60) là ký tự thật. Phần so sánh `dueDate` trả kết quả trước khi nhân với chiều sắp. Test `features.test.js:53-92` |
| 4. Tham số sai, lạ hoặc lặp lại trả 400 `INVALID_QUERY` kèm `field` là tham số đầu tiên theo thứ tự trên URL. Ngày phải có thật trên lịch. `page`/`pageSize` phải là số nguyên trong miền | Đạt | Code lặp qua `new Set(query.keys())` nên giữ thứ tự xuất hiện. `validDate` kiểm ngày theo lịch. Regex `^\d+$` cùng kiểm miền giá trị. Test bảng lỗi có cả `sort=foo&page=0` lẫn `page=0&sort=foo` (`features.test.js:75-84`) |
| 5. Xuất CSV: đúng header HTTP, có BOM, xuống dòng `\r\n` kể cả sau dòng cuối, trích dẫn theo RFC 4180, thêm `'` chống chèn công thức với chuỗi (số giữ nguyên), không phân trang, dùng chung quyền với danh sách | Đạt | `toCsv`/`cell` ở `src/query.js:91-102`. BOM U+FEFF là ký tự thật (grep dòng 101). Danh sách tham số hợp lệ của export không có `page`/`pageSize`. Test `features.test.js:94-123` so khớp nguyên văn và kiểm byte `EF BB BF` |
| 6. Nhật ký thao tác: chỉ ghi khi thành công. Có `seq` từ 1, `at` lấy từ `now()`, `changes` sắp a→z, `update` chỉ ghi trường đã đổi giá trị. `GET /audit` chỉ cho admin, mới nhất trước, lọc được theo `taskId`, tham số khác trả 400, thứ tự kiểm là 401 → 400 → 403 | Đạt | `Store.logAudit` ở `src/store.js:42-46`. Code tính `changes` bằng cách so `body[k] !== t[k]` trước khi cập nhật (`tasks.js:73`). Kiểm query trước rồi mới kiểm vai trò (`tasks.js:93-103`). Test `features.test.js:125-141` |
| 7. Đã cập nhật test cũ, có test cho từng tính năng, `npm test` xanh, không thêm thư viện ngoài | Đạt | Mục "Lệnh kiểm tra của dự án (CCoding tự chạy)": `npm test` exit 0, 8/8 pass, trước khi sửa là 2/2. Diff `test/tasks.test.js` đổi sang `json.total`, còn `helpers.js` thêm `x-user` mặc định. `package.json` không đổi |

## Rủi ro & việc còn mở
- **Spec chưa rõ, có thể lệch với bộ nghiệm thu ẩn:**
  - `GET/PATCH/DELETE /tasks/:id` không kiểm tham số truy vấn. Spec nói bước "tham số truy vấn (400)" áp cho mọi route `/tasks…` nhưng không định nghĩa tham số cho các route này.
  - Phương thức không hỗ trợ (ví dụ `PUT /tasks`) trả 405 trước cả bước kiểm 401.
- **Test còn mỏng ở vài nhánh:**
  - Chưa có test cho `sort=title` (locale `vi`).
  - Chưa có test cho `sort=dueDate` tăng dần (null ở cuối).
  - Chưa có test cho `?audit?taskId=` khi có kết quả khớp.
  - Chưa có test cho manager PATCH với `team` trùng nhóm mình.
  - Chưa có test cho `status` nhiều giá trị lỗi kiểu `todo,,doing`.

  Mã cho các nhánh này đọc thấy đúng nhưng chưa có test giữ lại.
- **Từ trước, không thuộc phạm vi đợt này:** `dueDate` trong body chỉ kiểm định dạng, không kiểm ngày có thật. URL có `%` sai dạng ở `:id` làm `decodeURIComponent` ném lỗi và trả 500.
- **Bằng chứng:** tôi không tự chạy được test hay gọi HTTP thử vì hook chặn. Kết luận "xanh" dựa vào lần chạy của CCoding.

## Việc tiếp theo
- **Bổ sung test cho các nhánh sắp xếp và nhật ký còn thiếu** · thêm test vào `test/features.test.js`, không đổi `src/` · dev (@senior-swe).
- **Chốt cách xử lý tham số truy vấn trên `/tasks/:id` và thứ tự 405/401** · hỏi giám đốc hoặc người viết spec rồi chỉnh nếu cần · dev.
