## Tóm tắt
**Chưa nghiệm thu.** Gần hết các quy tắc trong đề bài đã được hiện thực đúng, nhưng phép đổi `time-taken` sai. Code đang chia cho 1e6 thay vì nhân với 1e6, nên `event.duration` lệch 10¹² lần so với yêu cầu (15 ms ra `1.5e-5` thay vì `15000000`). Lỗi này lọt qua vì test chỉ có một ca cơ bản, không đụng tới `time-taken`.

Tôi không tự chạy được code để thử (vai trò CTO bị chặn chạy `node`). Mọi kết luận về hành vi bên dưới là đọc mã tĩnh. Bằng chứng chạy thật duy nhất là `npm test` do CCoding chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, giữ export `parseIisLog` và định dạng ES module | Đạt | CCoding tự chạy `npm test`: exit 0, pass 1/1. `src/iis.js:21` có `export function parseIisLog`; `package.json` có `"type": "module"` |
| Directive: dòng `#` bị bỏ qua, nhiều `#Fields:` áp dụng tuần tự, bỏ dòng trống, bỏ dòng trước `#Fields:` | Đạt (đọc mã) | `src/iis.js:25-33`: regex `^#Fields:` gán lại `fields` mỗi lần gặp, các directive khác được `continue`, dòng trống được `continue`, và `if (!fields) continue`. Chưa có test riêng |
| Tách cột bằng một dấu cách; giá trị `-` thì bỏ key; số cột lệch thì bỏ dòng | Đạt (đọc mã) | `src/iis.js:34-35` dùng `split(' ')` rồi so `length`; `:40` có `if (v === '-') return`. Chưa có test riêng |
| Ánh xạ các trường chuỗi và số (`server.ip`, `client.ip`, method, `url.path`, `url.query`, `user.name`, `status_code`, `server.port`), output là object lồng nhau | Đạt (đọc mã) | Bảng `STRING_FIELDS`/`NUMBER_FIELDS` ở `src/iis.js:8-19`; `setPath` tạo object lồng nhau ở `:2-6`. Test `test/basic.test.js` kiểm 4 trong số các trường này |
| `@timestamp` là ISO 8601 UTC có mili giây | Đạt | `src/iis.js:54-57` dùng `new Date(...Z).toISOString()`; test kiểm giá trị `2026-10-01T08:15:02.000Z` |
| `cs(User-Agent)` → `user_agent.original`, đổi mọi `+` thành dấu cách | Đạt (đọc mã) | `src/iis.js:51` dùng `v.replace(/\+/g, ' ')`. Chưa có test |
| `time-taken` (ms) → `event.duration` tính bằng nano giây (number) | **Không** | `src/iis.js:49` viết `n / 1e6`, đúng phải là `n * 1e6`. 1 ms = 1.000.000 ns |
| Có test cho các quy tắc chính (đề bài cho phép thêm test) | Không (khuyến nghị) | Diff chỉ sửa `src/iis.js` (58 dòng). `test/basic.test.js` vẫn là test gốc với một ca duy nhất |

## Rủi ro & việc còn mở
- **Dữ liệu sai (cao):** `event.duration` sai 10¹² lần, nên mọi dashboard hay cảnh báo về độ trễ dựng trên dữ liệu này đều vô nghĩa.
- **Quy trình (trung bình):** cổng chất lượng duyệt chỉ dựa trên một test cơ bản và bỏ qua review. Lỗi đổi đơn vị lọt qua là vì vậy. Độ phủ test hiện quá mỏng so với 5 quy tắc của đề bài.
- **Nhỏ:** nếu dòng `#Fields:` rỗng thì `fields` thành `['']`, và một dòng dữ liệu một cột vẫn được nhận. Đây là ca biên, không trái đề bài.

## Việc tiếp theo
1. **Sửa đơn vị `event.duration`.** Phạm vi: `src/iis.js:49` đổi `/ 1e6` thành `* 1e6`. Người làm: @senior-swe (dev). Xong khi: `time-taken` 15 cho ra `event.duration === 15000000`.
2. **Bổ sung test theo đề bài.** Phạm vi: thêm `test/rules.test.js` phủ các ca: nhiều `#Fields:`, `-` bị bỏ key, dòng lệch số cột, dòng trước `#Fields:`, UA có `+`, `time-taken`, `s-port`, `cs-username`, `cs-uri-query`, CRLF. Người làm: @senior-swe (dev). Xong khi: `npm test` xanh với các ca đó.
