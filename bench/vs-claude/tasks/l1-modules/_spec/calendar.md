## Module `calendar` — ngày làm việc, nghỉ bù, tuần ISO

Hiện thực `src/calendar/index.js` (ES module, không thêm thư viện ngoài, không import module khác của dự án). Mọi hàm là **named export**. Module **không đọc đồng hồ thật** và không dùng `Date.now()`; mọi ngày do người gọi truyền vào.

### Khái niệm

- **Ngày** là chuỗi `YYYY-MM-DD` đúng 10 ký tự (bốn chữ số năm, hai chữ số tháng, hai chữ số ngày), là ngày có thật theo lịch Gregorian (năm nhuận: chia hết cho 4, trừ năm chia hết cho 100 mà không chia hết cho 400; `2000-02-29` hợp lệ, `1900-02-29` và `2100-02-29` không). Chỉ hỗ trợ năm **1900 đến 2100**: `1900-01-01` … `2100-12-31`. Mọi ngày đầu vào ngoài khoảng, sai cú pháp (`2026-1-5`, `2026/01/05`, có khoảng trắng) hoặc không phải chuỗi → `CAL_INVALID_DATE`.
- **Thứ trong tuần** theo ISO: 1 = thứ Hai … 7 = Chủ nhật.
- Mỗi ngày thuộc đúng một loại, xét **theo thứ tự ưu tiên**:
  1. `holiday` — có trong bảng ngày lễ bên dưới (kể cả khi rơi vào thứ Bảy/Chủ nhật);
  2. `compensation` — ngày nghỉ bù cho một ngày lễ (xem quy tắc nghỉ bù);
  3. `weekend` — thứ Bảy hoặc Chủ nhật;
  4. `working` — còn lại.
- **Ngày làm việc** là ngày loại `working`. Ngoài năm 2025–2027 không có ngày lễ nào, chỉ có cuối tuần.

### Bảng ngày lễ (nguồn duy nhất của module)

| Năm | Ngày | Tên |
|---|---|---|
| 2025 | `01-01` | Tết Dương lịch |
| 2025 | `01-29`, `01-30`, `01-31`, `02-01` | Tết Nguyên đán |
| 2025 | `04-07` | Giỗ Tổ Hùng Vương |
| 2025 | `04-30` | Ngày Giải phóng miền Nam |
| 2025 | `05-01` | Quốc tế Lao động |
| 2025 | `09-01`, `09-02` | Quốc khánh |
| 2026 | `01-01` | Tết Dương lịch |
| 2026 | `02-16`, `02-17`, `02-18`, `02-19`, `02-20` | Tết Nguyên đán |
| 2026 | `04-26` | Giỗ Tổ Hùng Vương |
| 2026 | `04-30` | Ngày Giải phóng miền Nam |
| 2026 | `05-01` | Quốc tế Lao động |
| 2026 | `09-02`, `09-03` | Quốc khánh |
| 2027 | `01-01` | Tết Dương lịch |
| 2027 | `02-06`, `02-07`, `02-08`, `02-09`, `02-10` | Tết Nguyên đán |
| 2027 | `04-16` | Giỗ Tổ Hùng Vương |
| 2027 | `04-30` | Ngày Giải phóng miền Nam |
| 2027 | `05-01` | Quốc tế Lao động |
| 2027 | `09-02`, `09-03` | Quốc khánh |

(Ngày đầy đủ là `<năm>-<ngày>`, vd. `2025-02-01`. Đây là bảng của bài toán, không phải lịch nghỉ chính thức.)

### Quy tắc nghỉ bù

Duyệt các ngày lễ theo **thứ tự thời gian tăng dần**. Với mỗi ngày lễ rơi vào thứ Bảy hoặc Chủ nhật, ngày nghỉ bù của nó là **ngày đầu tiên sau ngày lễ** thỏa đồng thời: (a) là thứ Hai–thứ Sáu; (b) **không** có trong bảng ngày lễ (dù ngày lễ đó ở sau); (c) chưa là ngày nghỉ bù của ngày lễ đã xử lý trước đó. Mỗi ngày lễ cuối tuần có đúng một ngày bù; ngày lễ trong tuần không có ngày bù.

Hệ quả cần nhớ: các ngày bù trong cùng một kỳ nghỉ nối tiếp nhau. Ví dụ 2027: lễ thứ Bảy `02-06` → thứ Hai–thứ Tư `02-08..02-10` đều là lễ → bù ở thứ Năm `02-11`; lễ Chủ nhật `02-07` → ngày kế tiếp thỏa là thứ Sáu `02-12`. Các ngày bù trong bảng: `2025-02-01 → 2025-02-03`, `2026-04-26 → 2026-04-27`, `2027-02-06 → 2027-02-11`, `2027-02-07 → 2027-02-12`, `2027-05-01 → 2027-05-03`.

### API

```js
isValidDate(s)                         → boolean            // không bao giờ ném lỗi
addDays(date, n)                       → ngày
diffDays(a, b)                         → số nguyên          // số ngày lịch từ a đến b (b − a)
dayOfWeek(date)                        → 1..7
dayInfo(date)                          → { date, weekday, type, name }
isWorkingDay(date)                     → boolean
compensationFor(holidayDate)           → ngày | null
nonWorkingDays(year)                   → [{ date, type, name }]
addWorkingDays(date, n)                → ngày
rollForward(date)                      → ngày
rollBackward(date)                     → ngày
workingDaysBetween(from, to, options?) → số nguyên
isoWeek(date)                          → { year, week, weekday }
isoWeeksInYear(year)                   → 52 | 53
isoWeekToDate(year, week, weekday?)    → ngày
formatIsoWeek(date)                    → 'YYYY-Www-D'
```

### Lỗi

| `code` | Khi nào |
|---|---|
| `CAL_INVALID_DATE` | đầu vào ngày không hợp lệ (xem Khái niệm); `year` của `nonWorkingDays` không phải số nguyên trong 1900–2100 |
| `CAL_INVALID_COUNT` | `n` không phải số nguyên an toàn; với `addWorkingDays` còn là `|n| > 10000` |
| `CAL_OUT_OF_RANGE` | kết quả (ngày) nằm ngoài `1900-01-01 … 2100-12-31` |
| `CAL_INVALID_OPTION` | `options.bounds` ngoài danh sách |
| `CAL_INVALID_WEEK` | năm ISO không phải số nguyên trong 1900–2100; tuần không nằm trong `1..isoWeeksInYear(year)`; thứ trong tuần ngoài 1..7 |

Với hàm nhận ngày rồi tham số khác, **kiểm ngày trước** (`CAL_INVALID_DATE`), rồi mới kiểm tham số còn lại; với `workingDaysBetween`: `from`, `to`, rồi `options`.

### Hàm cơ bản

- `addDays(date, n)`: cộng `n` ngày lịch (âm = lùi). `n` nguyên (không giới hạn độ lớn, nhưng kết quả phải trong khoảng, nếu không `CAL_OUT_OF_RANGE`).
- `diffDays(a, b)` = số ngày lịch của `b` trừ `a` (có thể âm).
- `dayOfWeek(date)`: `2026-04-26` → 7 (Chủ nhật); `2025-01-29` → 3.
- `dayInfo(date)` → `{ date, weekday, type, name }`: `type` là `'working' | 'weekend' | 'holiday' | 'compensation'`; `name` là tên ngày lễ (loại `holiday`), `'Nghỉ bù ' + tên ngày lễ gốc` (loại `compensation`), còn lại `null`. Ví dụ `dayInfo('2025-02-01')` → `{ date: '2025-02-01', weekday: 6, type: 'holiday', name: 'Tết Nguyên đán' }`; `dayInfo('2025-02-03')` → `{ date: '2025-02-03', weekday: 1, type: 'compensation', name: 'Nghỉ bù Tết Nguyên đán' }`.
- `isWorkingDay(date)` ⇔ `dayInfo(date).type === 'working'`.
- `compensationFor(date)`: nếu `date` là ngày lễ cuối tuần → ngày nghỉ bù của nó; ngược lại (không phải ngày lễ, hoặc lễ trong tuần) → `null`.
- `nonWorkingDays(year)`: các ngày loại `holiday` hoặc `compensation` có **năm của ngày đó** bằng `year`, sắp tăng dần theo ngày, mỗi phần tử `{ date, type, name }` (cuối tuần thường **không** liệt kê). Năm không có ngày nào → `[]`.

### `addWorkingDays(date, n)`

- `n` nguyên, `|n| ≤ 10000`. `n = 0` → trả `date` **nguyên vẹn** (kể cả khi nó không phải ngày làm việc).
- `n > 0`: đi tới từng ngày sau `date`, trả ngày làm việc thứ `n`. `n < 0`: đi lùi, trả ngày làm việc thứ `|n|` trước `date`. Ngày xuất phát **không tính**, dù nó có là ngày làm việc hay không.
- Ví dụ: `addWorkingDays('2025-01-27', 1)` → `2025-01-28`; `('2025-01-27', 2)` → `2025-02-04` (nghỉ 29/1–2/2 vì lễ và cuối tuần, 3/2 là ngày bù); `('2025-02-04', -2)` → `2025-01-27`; `('2026-04-24', 1)` → `2026-04-28`; `('2027-02-05', 1)` → `2027-02-15`; `('2025-02-02', 1)` → `2025-02-04`.
- Kết quả ngoài khoảng hỗ trợ → `CAL_OUT_OF_RANGE` (vd. `('2100-12-30', 2)`).
- `rollForward(date)`: nếu `date` là ngày làm việc thì trả chính nó, nếu không thì ngày làm việc kế tiếp. `rollBackward(date)`: tương tự về phía trước đó. Kết quả ngoài khoảng → `CAL_OUT_OF_RANGE`.

### `workingDaysBetween(from, to, options?)`

`options.bounds` (mặc định `'start'`) quy định biên nào được tính, khi `from ≤ to`:

| `bounds` | Khoảng đếm |
|---|---|
| `'start'` | `[from, to)` — tính `from`, không tính `to` |
| `'end'` | `(from, to]` — không tính `from`, tính `to` |
| `'both'` | `[from, to]` — tính cả hai |
| `'neither'` | `(from, to)` — không tính biên nào |

Kết quả là số ngày **làm việc** trong khoảng đó. Khi `from = to`: chỉ `'both'` có thể cho 1 (nếu là ngày làm việc), còn lại 0.

Khi `from > to`: kết quả là **số đối** của số ngày làm việc trong khoảng cùng hai đầu mút, trong đó biên của `from` và `to` giữ nguyên ý nghĩa (`'start'` luôn nghĩa là "tính `from`, không tính `to`"). Nghĩa là `workingDaysBetween(B, A)` với `A < B` và `'start'` đếm các ngày trong `(A, B]` rồi đổi dấu. Kết quả 0 luôn là `+0`. Tính chất: nếu `to` là ngày làm việc và `from < to`, `addWorkingDays(from, workingDaysBetween(from, to, {bounds: 'end'})) === to`.

Ví dụ (`from = 2026-04-24` thứ Sáu, `to = 2026-04-29` thứ Tư; 25/4 thứ Bảy, 26/4 lễ Chủ nhật, 27/4 nghỉ bù; làm việc: 24, 28, 29): `'start'` → 2; `'end'` → 2; `'both'` → 3; `'neither'` → 1. Đảo chiều (`from = 2026-04-29`, `to = 2026-04-24`): `'start'` → −2; `'both'` → −3.

### Tuần ISO (ISO 8601)

Tuần bắt đầu thứ Hai; tuần 1 là tuần chứa thứ Năm đầu tiên của năm (tương đương: tuần chứa ngày 4/1). Một ngày đầu/cuối năm có thể thuộc tuần của năm ISO khác.

- `isoWeek(date)` → `{ year, week, weekday }` với `year` là **năm ISO** (có thể khác năm của ngày). Ví dụ: `2021-01-01` → `{ year: 2020, week: 53, weekday: 5 }`; `2018-12-31` → `{ year: 2019, week: 1, weekday: 1 }`; `2023-01-01` → `{ year: 2022, week: 52, weekday: 7 }`; `2026-12-31` → `{ year: 2026, week: 53, weekday: 4 }`.
- `isoWeeksInYear(year)`: 53 nếu 1/1 là thứ Năm, hoặc năm nhuận mà 1/1 là thứ Tư; ngược lại 52. Ví dụ 2020, 2026, 2015 → 53; 2021, 2024, 2025 → 52.
- `isoWeekToDate(year, week, weekday = 1)`: ngày của thứ `weekday` trong tuần `week` của năm ISO `year`. `isoWeekToDate(2021, 1)` → `2021-01-04`; `(2020, 53, 5)` → `2021-01-01`; `(2019, 1)` → `2018-12-31`. Tuần 53 của năm 52 tuần → `CAL_INVALID_WEEK`. Tính chất: `isoWeekToDate(w.year, w.week, w.weekday)` bằng ngày gốc với `w = isoWeek(ngày)`.
- `formatIsoWeek(date)` → `'YYYY-Www-D'`, năm 4 chữ số, tuần 2 chữ số: `'2021-01-01'` → `'2020-W53-5'`; `'2025-01-06'` → `'2025-W02-1'`.

### Điểm dễ hiểu nhầm

- Ngày lễ rơi cuối tuần vẫn có `type: 'holiday'` (không phải `weekend`); ngày bù mới là `compensation`.
- Ngày bù **không** nhảy sang một ngày lễ khác, và hai lễ cuối tuần liên tiếp không dùng chung một ngày bù.
- `addWorkingDays` không tính ngày xuất phát; `n = 0` không dịch ngày.
- `workingDaysBetween` mặc định là nửa mở `[from, to)`; đảo chiều là số đối của khoảng cùng hai biên, không phải của khoảng `[to, from)`.
- Năm ISO của `isoWeek` không luôn bằng năm trong chuỗi ngày.
