## Tóm tắt
**Chưa nghiệm thu.** Phần parse, query và CLI khớp đặc tả ở mọi điểm tôi đọc được. Có một lỗi chắc chắn: `max <f>` trả về giá trị **nhỏ nhất**. Bộ nghiệm thu ẩn sẽ bắt được lỗi này, còn test hiện có thì không, vì chỉ kiểm `max` trên trường không tồn tại. Hook CCoding chặn tôi chạy `npm`/`node`, nên mọi kết luận về hành vi dưới đây đều đến từ đọc code. Bằng chứng chạy thật duy nhất là `npm test` xanh do CCoding tự chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, có test cho các module | Đạt | CCoding tự chạy: `npm test` → exit 0, 11 pass / 0 fail. Test nằm ở `test/logq.test.js` |
| `parseLine` đúng §1: JSON làm phẳng, bỏ object rỗng lồng bên trong, logfmt (kiểu giá trị, chuỗi thoát, lỗi cả dòng), `@t` lấy theo trường đầu tiên có mặt | Đạt (đọc code) | `src/parse.js`: `flatten` không giữ object rỗng; `parseLogfmt` trả `null` khi gặp key sai, ngoặc kép không đóng, hoặc ký tự dính liền sau ngoặc đóng; `addTime` dừng (`return`) ngay ở trường đầu tiên có mặt |
| `compile` đúng ngữ pháp, ngữ nghĩa và vị trí lỗi §2 | Đạt (đọc code) | `src/query.js`: thiếu `)` → `q.length`; thừa `)` hoặc `()` → vị trí `)`; `AND`/`OR` ở đầu → vị trí từ khóa; vế phải so sánh sai → `t.pos+field.length+op.length`; `field:` rỗng → ngay sau `:`; ngoặc kép không đóng → token `bad` tại `"` mở. `QuerySyntaxError` có `name`, `position` và message đúng tiền tố |
| `aggregate` đúng mọi spec §3 | **Không** | `src/agg.js:65`: `v.reduce((a, b) => (!(b > a) ? b : a))` chỉ thay `a` khi `b <= a`, nên luôn giữ giá trị nhỏ nhất. Ví dụ `[1,5,3]` → 1. Phần `count by`/`top` (sắp xếp, giữ kiểu key), sum/avg/min, pXX nearest-rank và histogram điền mốc trống đều đúng |
| CLI đúng §4: định dạng ra, table, `--stats`, mã thoát 0/1/2, stdout trống khi lỗi | Đạt (đọc code) | `bin/logq.js`: kiểm query và spec trước khi đọc tệp; đọc hết tệp rồi mới in; `cannot read <f>` → 1; tùy chọn lạ hoặc `table` không có `--agg` → 2; bỏ `@t` khi in bản ghi; cột key đệm tới `max(3, độ dài key)` rồi 2 dấu cách |
| Không thêm thư viện ngoài | Đạt | `package.json` không có `dependencies`; code chỉ `require('fs')` và module nội bộ |

## Rủi ro & việc còn mở
- **Cao:** `max` sai. Đây là tiêu chí kiểm được qua cả API lẫn CLI (`--agg "max f"`).
- **Trung bình:** Không có bằng chứng chạy thật cho các luật vị trí lỗi và CLI ngoài những gì 11 test phủ. Thiếu test cho max/min trên dữ liệu thật, vị trí lỗi của `AND` sau `(`/`NOT`, và tệp không đọc được (mã 1).
- **Thấp:**
  - `histogram 01m` trả về `interval: "1m"` chứ không giữ nguyên chuỗi người dùng nhập.
  - Histogram có khoảng thời gian rất lớn so với bucket sẽ sinh rất nhiều mốc (vòng lặp không giới hạn).
  - Tìm từ tự do coi `msg: null` như không có `msg`. Đặc tả không nói rõ trường hợp này.

## Việc tiếp theo
- **Sửa `max` và bổ sung test** · Phạm vi: `src/agg.js:65` và `test/logq.test.js` · Ai làm: Phòng Phát triển (@senior-swe) · Xong khi: `max` trả giá trị lớn nhất, có test cho `max`/`min` trên `[1,5,3]` và trên chuỗi số, thêm test CLI cho mã thoát 1 và các vị trí lỗi của từ khóa; `npm test` xanh.
