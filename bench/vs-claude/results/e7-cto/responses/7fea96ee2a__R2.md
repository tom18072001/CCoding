## Tóm tắt
**Chưa nghiệm thu.** `src/iis.js` làm đúng gần hết đề bài, nhưng `time-taken` bị đổi sai chiều: code chia cho 1e6 thay vì nhân với 1e6. Ví dụ `time-taken=15` (ms) cho ra `event.duration = 0.000015`, trong khi đúng phải là `15000000` (ns). Test hiện có chỉ một ca và không đụng tới trường này, nên `npm test` vẫn xanh.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| T1. Giữ tên export `parseIisLog`, dạng ES module, `npm test` xanh | Đạt | `src/iis.js:21` `export function parseIisLog`; `package.json` có `"type": "module"`; CCoding tự chạy `npm test` sau khi sửa ra exit 0, pass 1/1 |
| T2. Directive: `#Fields:` đặt thứ tự cột và có hiệu lực tới `#Fields:` kế tiếp; bỏ qua directive khác, dòng trống, dòng đứng trước mọi `#Fields:` | Đạt (đọc tĩnh) | `src/iis.js` trong vòng lặp: `line.trim()===''` thì bỏ qua; dòng bắt đầu bằng `#` mà khớp regex `^#Fields:` thì gán lại `fields`, còn lại thì `continue`; `if (!fields) continue`. Có bỏ `\r` cho file CRLF |
| T3. Tách cột bằng một dấu cách; `-` thì bỏ khóa; số cột không khớp thì bỏ dòng | Đạt (đọc tĩnh) | `line.split(' ')`, `cols.length !== fields.length` thì `continue`, `if (v === '-') return` |
| T4. Ánh xạ các trường dạng chuỗi/số và `@timestamp` dạng ISO UTC có mili giây | Đạt | `STRING_FIELDS`/`NUMBER_FIELDS` khớp đề bài; `new Date(date+'T'+time+'Z').toISOString()` cho dạng `...T08:15:02.000Z`, được `test/basic.test.js:9` kiểm; UA đổi `+` thành dấu cách bằng `/\+/g` |
| T5. `time-taken` (ms) thành `event.duration` (ns, kiểu số) | **Không** | `src/iis.js`, nhánh `time-taken`: `setPath(rec, ['event','duration'], n / 1e6)` chia thay vì nhân, nên sai 10¹² lần. Phải là `n * 1e6` |
| T6. Đầu ra là object lồng nhau, không dùng khóa có dấu chấm | Đạt | Hàm `setPath` tạo object lồng nhau; test truy cập `out[0].http.request.method` |
| T7. Test đủ để kiểm hành vi đề bài | Không | Chỉ có một test (`test/basic.test.js`). Diff của phòng chỉ sửa `src/iis.js`, không thêm test nào cho `-`, cột lệch, nhiều `#Fields:`, `time-taken`, UA, `s-port`, `cs-username` |

Lưu ý: hook guard chặn lệnh chạy `npm`/`node` của CTO, nên T2, T3 và T5 được kết luận bằng cách đọc code. Riêng lỗi ở T5 thì đọc code là thấy rõ, không cần chạy mới biết.

## Rủi ro & việc còn mở
- **Dữ liệu (cao):** `event.duration` sai 10¹² lần. Dashboard hay cảnh báo về độ trễ dựa trên ECS sẽ sai hoàn toàn mà không có dấu hiệu gì.
- **Chất lượng (trung bình):** test không phủ các quy tắc 1–5, nên những lỗi kiểu này lọt qua cổng chất lượng tự động. Cổng ghi "không thuộc diện bắt buộc review", tức là thực tế chưa ai đọc đối chiếu với đề bài.
- **Nhỏ:** trường số không parse được (ví dụ `abc`) thì bị bỏ âm thầm. Đề bài không quy định trường hợp này nên chấp nhận được.

## Việc tiếp theo
- **Sửa đơn vị `event.duration` và bổ sung test** · Đổi `n / 1e6` thành `n * 1e6`, thêm test theo từng quy tắc của đề bài · @senior-swe (Phòng Phát triển)
