## Tóm tắt
**Nghiệm thu.** Tôi đã đọc `src/handler.js`, `test/list.test.js` và `src/data.js` và đối chiếu với từng yêu cầu của đề bài. Không có tiêu chí nào Không đạt. `npm test` do CCoding tự chạy có exit 0, 14/14 pass (baseline là 1 test). Tôi không tự chạy lại lệnh nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Không có tham số: vẫn trả mảng trần sắp theo id (tương thích client cũ) | Đạt | `handler.js:45,56,84` mặc định `field='id'`, `limit=null` nên trả `list`. Test "no params" kiểm 23 id tăng dần. |
| `status` và `assignee` là danh sách phân tách bằng dấu phẩy. `status` phải thuộc `STATUSES`. `none` khớp `assignee === null`. | Đạt | `handler.js:46-55`. Phần tử rỗng hoặc status lạ trả `invalid_status`. Test "status and assignee filters" và các ca validation. |
| `sort` nhận `id`, `priority`, `createdAt`, có thể thêm tiền tố `-`. Hòa thì xếp theo id tăng bất kể chiều. Mặc định `id`. | Đạt | `handler.js:58-64,78-83`: `\|\| a.id - b.id` không nhân với `dir`. Test "sort with id tiebreak" cho `-priority`, `createdAt` và `-id`. |
| `limit` 1–100. Khi có `limit` trả `{items, nextCursor}`, trang cuối `nextCursor` là `null`. `cursor` trả trang kế tiếp, chỉ hợp lệ với cùng `status`, `assignee`, `sort`. | Đạt | `handler.js:65-70,84-88`. Cursor là keyset mã hóa base64url kèm fingerprint của ba tham số lọc. Test duyệt hết dữ liệu với 6 kiểu sort, test trang cuối và vừa khít (`limit=23`), test cursor bị từ chối khi đổi `sort`, `status` hoặc `assignee`. |
| Validation trả 400 `{error:'invalid_<param>'}` cho status/sort/limit/cursor sai, cursor không có limit. Tham số lạ bị bỏ qua. | Đạt | `handler.js:48,53,59,62,67-69,74,76`. Test "validation errors" có 14 ca, gồm limit `0`, `101`, `1.5`, `abc`, `''`, `-1`, cursor rác, cursor `e30` và cursor không kèm limit. Test "unknown params ignored". |
| Có test và `npm test` xanh | Đạt | Báo cáo tổng hợp: `npm test` sau thực thi là 14 pass, 0 fail, exit 0. `test/list.test.js` có 76 dòng mới. |

## Rủi ro & việc còn mở
- **Fingerprint của cursor so chuỗi thô.** Cursor phát hành với `status=open,closed` bị từ chối nếu gọi lại bằng `closed,open`. Cursor phát hành khi không truyền `sort` cũng bị từ chối nếu gọi lại với `sort=id`. Đề bài nói "cùng giá trị" nên hành vi này chấp nhận được, nhưng hơi chặt. Nên chốt với giám đốc có cần chuẩn hóa hay không.
- **Thứ tự báo lỗi khi nhiều tham số sai** không được đề bài quy định. Code kiểm `status`, `assignee`, `sort`, `limit`, rồi `cursor`. Test chỉ kiểm từng lỗi riêng lẻ.
- **Cursor không được ký.** Nó chỉ dựa trên fingerprint, không có chữ ký. Với handler in-memory nội bộ thì rủi ro thấp, và cursor giả vẫn chỉ trả dữ liệu mà client đó được phép xem.
- **Thiếu test cho dữ liệu hòa ở ranh giới trang.** Seed có `priority` trùng nhiều, và test duyệt hết 6 kiểu sort với `limit=4` đã bao phủ gián tiếp. Chưa có test riêng cho giá trị `createdAt` trùng ở ranh giới trang.

## Việc tiếp theo
- **Chuẩn hóa fingerprint cursor** · Sắp xếp và khử trùng lặp giá trị `status`/`assignee`, coi `sort` vắng mặt bằng `sort=id`, rồi thêm test · dev (senior-swe) · xong khi test đổi thứ tự giá trị và `sort=id` mặc định vẫn dùng được cursor, còn lọc khác vẫn bị 400.
