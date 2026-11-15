## Tóm tắt
Nghiệm thu. `GET /tickets` không tham số vẫn trả mảng trần sắp theo `id`. Đã có đủ bộ lọc `status`/`assignee`, `sort` với tie-break theo `id` tăng dần, phân trang bằng cursor gắn với đúng bộ lọc và sort, và các lỗi `invalid_<param>`. Bằng chứng mạnh nhất là lần chạy `npm test` của CCoding: 14/14 pass, baseline là 1/1. Lúc nghiệm thu, hook chặn không cho tôi chạy `npm` hay `node`, nên tôi không tự chạy lại test hay thử thêm ca biên. Ngoài lần chạy đó, phần còn lại là tôi đọc code `src/handler.js` và `test/list.test.js` để đối chiếu với đề bài.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Không tham số thì giữ nguyên hành vi cũ (mảng trần, sắp theo `id`) | Đạt | `listTickets`: khi `limit === null` thì trả `body: list`, sort mặc định là `id` tăng dần. Test cũ `list returns all tickets sorted by id` và test mới `no params: bare array sorted by id` (so sánh đủ 1..23) đều pass. |
| Lọc `status` (danh sách cách nhau bởi dấu phẩy, chỉ nhận giá trị trong `STATUSES`) và `assignee` (có giá trị `none` khớp với `null`) | Đạt | `parseList` cộng `STATUSES.includes`. Ánh xạ `t.assignee === null ? 'none' : t.assignee`. Test `status and assignee filters` pass. |
| `sort` nhận `id\|priority\|createdAt`, có thể thêm tiền tố `-`; khi bằng nhau thì xếp theo `id` tăng dần bất kể chiều sort | Đạt | `cmp = (...dir...) \|\| a.id - b.id`, nên tie-break luôn tăng dần. Test `sort with id tiebreak` kiểm `-priority` và `createdAt`, `--id` bị trả 400. |
| Có `limit` (1–100) thì trả `{ items, nextCursor }`, trang cuối có `nextCursor = null`; cursor chỉ hợp lệ với đúng `status`/`assignee`/`sort` đã cấp nó | Đạt | Keyset cursor dạng base64url, mang fingerprint `[status, assignee, sort]`. Sáu test `pagination walks everything` cho 6 kiểu sort, mỗi test đi qua nhiều trang và so khớp với kết quả không phân trang. Có test trang cuối và vừa khít `limit=23` / `limit=100`, và test `cursor valid only with same filters` (4 ca lệch đều trả 400). |
| Tham số sai trả 400 với `{ error: 'invalid_<param>' }`; tham số lạ bị bỏ qua | Đạt | Test `validation errors` có 14 ca: status, assignee, sort, limit (0, 101, 1.5, abc, rỗng, -1), cursor không kèm limit, cursor sai định dạng, cursor `{}`. Test `unknown params ignored` pass. |
| Có test và `npm test` xanh | Đạt | CCoding tự chạy: `npm test`, exit 0, 14 tests, pass 14, fail 0. Diff chỉ chạm `src/handler.js` và `test/list.test.js`. |

## Rủi ro & việc còn mở
- **Không ảnh hưởng chức năng (tôi đọc code thấy, chưa chạy thử được):** fingerprint so trên chuỗi thô. Vì vậy cursor cấp khi không truyền `sort` sẽ bị từ chối nếu trang sau gửi `sort=id`. Tương tự, `status=open,closed` và `status=closed,open` bị coi là khác nhau. Cách hiểu này chặt nhưng vẫn khớp chữ "same values" trong đề bài. Client chỉ cần gửi lại đúng tham số cũ là không gặp lỗi.
- **Thấp:** cursor chỉ là base64 của JSON, không ký. Client có thể tự dựng cursor, nhưng chỉ dẫn tới một vị trí bắt đầu khác trên dữ liệu mà họ vốn được đọc. Với API in-memory và dữ liệu nội bộ thì chấp nhận được.
- **Ghi chú:** việc nghiệm thu dựa trên lần chạy test của CCoding. Tôi chưa kiểm thực tế các ca `limit=' 5'`, `limit='1e2'` hay tham số dạng mảng, chỉ đọc code: regex `^\d{1,9}$` và kiểm `typeof` sẽ trả 400 cho các ca này.

## Việc tiếp theo
- **(Tùy chọn) Chuẩn hóa fingerprint của cursor** · Nếu giám đốc muốn nới lỏng: coi sort bị bỏ trống là `id` và không phân biệt thứ tự giá trị trong danh sách `status`/`assignee` khi so cursor. Kèm test. · @senior-swe, phòng Phát triển.
