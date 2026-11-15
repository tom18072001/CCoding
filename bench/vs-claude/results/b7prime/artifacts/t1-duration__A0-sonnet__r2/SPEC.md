# duration — phân tích và định dạng khoảng thời gian

Hiện thực module `src/duration.js` (CommonJS, không thêm thư viện ngoài) export đúng hai hàm `parseDuration` và `formatDuration` theo đặc tả dưới đây. Bộ nghiệm thu sẽ kiểm tra rất nhiều trường hợp biên, nên hãy bám sát từng quy tắc.

Đơn vị và giá trị (mili giây): `w` = 604 800 000 · `d` = 86 400 000 · `h` = 3 600 000 · `m` = 60 000 · `s` = 1 000 · `ms` = 1.

## Lỗi

Mọi đầu vào không hợp lệ → ném `TypeError` với `message` = `"Invalid duration: " + JSON.stringify(input)` (với `undefined` thì là `"Invalid duration: undefined"`).

## `parseDuration(input) → number` (mili giây)

1. `input` là `number`: hữu hạn → trả về `input` làm tròn tới mili giây (xem quy tắc làm tròn); `NaN`/`±Infinity` → lỗi.
2. `input` không phải `string`/`number` (null, undefined, object, boolean…) → lỗi.
3. Chuỗi: bỏ khoảng trắng đầu/cuối, không phân biệt hoa/thường. Chuỗi rỗng → lỗi.
4. Dấu: có thể có **một** dấu `-` hoặc `+` ở đầu, áp dụng cho cả chuỗi (`"-1h30m"` = −5 400 000). Không có dấu ở từng thành phần bên trong (`"1h-30m"` → lỗi). Có thể có khoảng trắng giữa dấu và phần còn lại (`"- 5s"` hợp lệ).
5. **Số thuần**: `"1500"`, `"1.5"`, `"-20"` → số mili giây. Số hợp lệ = chữ số, có thể có phần thập phân bằng dấu chấm (`"0.5"`); phải có chữ số trước dấu chấm (`".5"` → lỗi) và sau dấu chấm (`"5."` → lỗi). Không chấp nhận dạng mũ (`"1e3"` → lỗi).
6. **Dạng đơn vị**: một hoặc nhiều thành phần `<số><đơn vị>`; giữa số và đơn vị có thể có khoảng trắng; giữa các thành phần có thể có khoảng trắng hoặc không (`"1h30m"`, `"1h 30m"`, `"2 days 4 hours"`). Số theo quy tắc ở mục 5. Bí danh đơn vị (không phân biệt hoa/thường):
   - `w`, `wk`, `wks`, `week`, `weeks`
   - `d`, `day`, `days`
   - `h`, `hr`, `hrs`, `hour`, `hours`
   - `m`, `min`, `mins`, `minute`, `minutes`
   - `s`, `sec`, `secs`, `second`, `seconds`
   - `ms`, `msec`, `msecs`, `millisecond`, `milliseconds`
   
   Mỗi đơn vị xuất hiện **tối đa một lần** và các thành phần phải theo thứ tự **giảm dần** w > d > h > m > s > ms (`"30m1h"`, `"1h1h"` → lỗi). Không trộn số thuần với thành phần có đơn vị (`"1h 30"` → lỗi). Ký tự lạ ở bất kỳ đâu → lỗi.
7. **ISO 8601** (bắt đầu bằng `P` sau dấu tùy chọn): `P<n>W` (tuần — không được kèm thành phần nào khác) hoặc `P[<n>D][T[<n>H][<n>M][<n>S]]`. Không khoảng trắng bên trong. Số có thể có phần thập phân bằng `.` hoặc `,` (`"PT0,5S"` = 500). Phải có ít nhất một thành phần; nếu có `T` thì sau `T` phải có ít nhất một thành phần (`"P"`, `"PT"`, `"P1DT"` → lỗi). Năm/tháng không hỗ trợ: `"P1Y"`, `"P1M"` (tháng, vì không có `T`) → lỗi; `"PT1M"` = 1 phút. Thứ tự thành phần bắt buộc như trên.
8. **Làm tròn**: kết quả cuối (sau khi cộng các thành phần và áp dấu) làm tròn tới số nguyên mili giây theo kiểu *half away from zero* (`0.5` → 1, `-0.5` → −1, `1.4` → 1). Kết quả `-0` trả về `0`.

## `formatDuration(ms, options?) → string`

- `ms` phải là `number` hữu hạn, nếu không → lỗi (message dùng `ms`).
- `options.style`: `"short"` (mặc định) hoặc `"long"`. Giá trị khác → lỗi `TypeError` (message tùy ý).
- `options.largest`: số nguyên ≥ 1, mặc định không giới hạn. Giá trị khác → `TypeError` (message tùy ý).
- Bước 1: làm tròn `ms` tới số nguyên (half away from zero). Lấy dấu và trị tuyệt đối.
- Bước 2: phân rã trị tuyệt đối thành w, d, h, m, s, ms (chia nguyên lần lượt).
- Bước 3 (chỉ khi có `largest`): gọi đơn vị lớn nhất có giá trị khác 0 là `U`. Giữ `largest` đơn vị **liên tiếp** bắt đầu từ `U` (tính cả đơn vị bằng 0 nằm giữa; nếu không đủ đơn vị thì giữ tới `ms`). Phần còn lại (các đơn vị nhỏ hơn) được làm tròn vào đơn vị giữ cuối cùng: nếu phần còn lại ≥ nửa đơn vị đó thì đơn vị đó +1. Việc +1 có thể **nhớ** lên đơn vị lớn hơn (60 m → 1 h, 24 h → 1 d, 7 d → 1 w, …) và có thể làm đơn vị lớn nhất mới xuất hiện (vd. `6d 23h 59m 31s` largest 2 → `1w`). Sau khi nhớ, chỉ hiển thị các đơn vị đã giữ (và đơn vị lớn hơn sinh ra do nhớ).
- Bước 4: bỏ các đơn vị bằng 0. Nếu không còn đơn vị nào → `"0ms"` (short) / `"0 milliseconds"` (long).
- Short: `<n><u>` nối bằng một dấu cách: `"1h 30m"`, `"2d 5s"`, `"250ms"`.
- Long: `<n> <tên>` nối bằng một dấu cách, tên số ít khi n = 1, số nhiều khi khác: `week/weeks`, `day/days`, `hour/hours`, `minute/minutes`, `second/seconds`, `millisecond/milliseconds` — vd. `"1 hour 30 minutes"`, `"2 weeks 1 day"`.
- Âm: thêm `-` trước toàn chuỗi: `"-1h 30m"`, `"-1 hour 30 minutes"`. Giá trị làm tròn thành 0 thì không có dấu.
- Tính chất: với mọi số hữu hạn `x`, `parseDuration(formatDuration(x)) === parseDuration(x)`.
