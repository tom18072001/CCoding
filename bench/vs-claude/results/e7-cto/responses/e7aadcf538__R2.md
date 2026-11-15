## Tóm tắt
Nghiệm thu. `GET /tickets` không tham số vẫn trả mảng trần sắp theo `id`. Hai filter, sort, cursor pagination và mã lỗi 400 đều làm đúng đề bài. Bằng chứng gồm việc đọc trực tiếp `src/handler.js` cùng `test/list.test.js`, và lần chạy `npm test` của CCoding (exit 0, 14/14 pass, test cũ `existing.test.js` vẫn xanh). Hook chỉ đọc chặn lệnh `npm`/`node` nên tôi không tự chạy test hay thử thêm trường hợp biên. Các trường hợp biên dưới đây tôi kiểm bằng cách đọc code.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Gọi không tham số vẫn trả mảng trần sắp theo id, giữ tương thích với client cũ | Đạt | Ở `src/handler.js`, khi `limit === null` thì trả `body: list` với sort mặc định là `id`. `req.query` thiếu thì được thay bằng `{}`. Test `no params: bare array sorted by id` và `test/existing.test.js` đều pass (lần chạy của CCoding, 14/14) |
| `status` lọc theo danh sách và kiểm từng giá trị theo `STATUSES`; `assignee` lọc theo danh sách, `none` khớp `null` | Đạt | Dùng `parseList` kết hợp `STATUSES.includes`; assignee được map `null → 'none'`. Test `status and assignee filters` pass |
| `sort` nhận `id`/`priority`/`createdAt`, có thể thêm tiền tố `-`; khi bằng nhau luôn xếp theo id tăng dần dù sort chiều nào | Đạt | Hàm `cmp` có dạng `(…dir…) \|\| a.id - b.id`, nên phần id không bị đảo chiều. Test `sort with id tiebreak` pass, và `--id` trả 400 |
| Có `limit` thì trả `{ items, nextCursor }`; trang cuối có `nextCursor = null`; đi hết các trang không trùng, không sót | Đạt | Phân trang theo keyset (cursor ghi `v` và `i`). `nextCursor` chỉ được tạo khi `list.length > limit`. Có 6 test `pagination walks everything` (đủ mọi kiểu sort) và test `exact fit` với limit 23 và 100, tất cả pass |
| Cursor chỉ hợp lệ khi `status`, `assignee`, `sort` giống lúc cấp | Đạt | Fingerprint `fp` được nhúng trong cursor và so khớp trong `decodeCursor`. Test `cursor valid only with same filters` thử 4 kiểu lệch, kết quả đều là `invalid_cursor` |
| Tham số sai trả 400 `{ error: 'invalid_<param>' }`; tham số lạ bị bỏ qua | Đạt | Hàm `bad(p)` lo phần này. Test `validation errors` có 14 ca: status, assignee, sort, limit `0`/`101`/`1.5`/`abc`/`''`/`-1`, cursor không kèm limit, cursor sai định dạng, cursor `e30` (`{}`). Test `unknown params ignored` cũng pass |
| Có test và `npm test` chạy được | Đạt | Thêm `test/list.test.js` với 76 dòng. Lần chạy của CCoding: trước khi sửa 1 test, sau khi sửa 14 test, cả 14 pass |

## Rủi ro & việc còn mở
- **Fingerprint so khớp nguyên chuỗi**: cursor cấp khi không có `sort` sẽ bị từ chối nếu lần sau client gửi `sort=id`, dù hai cách gọi cho cùng kết quả. Tương tự, `status=open,closed` khác với `closed,open`. Cách này vẫn đúng chữ của đề bài ("same values"), nhưng có thể làm client bất ngờ. Mức ảnh hưởng: thấp.
- **Cursor chỉ mã hoá base64url, không ký**: client có thể tự tạo cursor có fingerprint hợp lệ. Hậu quả chỉ là nhảy tới vị trí khác trong cùng tập dữ liệu, không lộ thêm dữ liệu. Mức ảnh hưởng: thấp, vì dữ liệu chạy in-memory và nhãn là internal.
- **`limit` có số 0 đứng đầu (vd. `"007"`) vẫn được nhận**: đọc ra là 7, nằm trong 1–100. Đề bài không cấm, chỉ ghi lại đây.
- Tôi không tự chạy được test hay thử thêm trường hợp biên vì hook chỉ đọc chặn lệnh. Mọi kết luận về hành vi chạy thật đều dựa vào lần chạy `npm test` của CCoding.

## Việc tiếp theo
- **Chuẩn hoá fingerprint của cursor** · Phạm vi: chuẩn hoá `sort` (không có sort xem như `id`) và sắp xếp, bỏ trùng trong danh sách `status`/`assignee` trước khi so khớp; thêm test cho từng trường hợp · Phòng: dev. Đây chỉ là đề xuất, giám đốc quyết định có làm hay không.
