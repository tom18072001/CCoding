# l1-modules — năm module độc lập

Hiện thực năm thư viện nhỏ, **độc lập nhau**, theo đúng đặc tả dưới đây. Bộ nghiệm thu ẩn kiểm tra từng quy tắc qua API công khai.

## Quy ước chung

- ES module (`"type": "module"`), Node ≥ 22, **không thêm thư viện ngoài**, không dùng mạng, không đọc đồng hồ thật (đồng hồ, nếu cần, được tiêm qua tham số).
- Mỗi module nằm ở `src/<tên>/index.js` và xuất API bằng **named export**: `money`, `calendar`, `csvcheck`, `slug`, `ratelimit`.
- Các module **không import lẫn nhau và không dùng chung mã**; mỗi module tự chứa mọi thứ nó cần.
- Lỗi: hàm ném `Error` có thuộc tính `code` là chuỗi IN HOA có tiền tố theo module (ví dụ `MONEY_INVALID_AMOUNT`, `CAL_INVALID_DATE`, `RL_INVALID_COST`). Bộ kiểm tra so sánh `err.code`, không so thông điệp. Riêng `csvcheck` **trả về** mảng lỗi `{row, column, code}` thay vì ném.
- Test thấy được ở `test/` chỉ là vài ví dụ; hãy tự viết thêm test cho từng module và giữ `npm test` xanh.

## Module `money` — tiền VND/USD/EUR

Hiện thực `src/money/index.js` (ES module, không thêm thư viện ngoài, không import module khác của dự án). Mọi hàm là **named export**. Tính toán trên **số nguyên đơn vị nhỏ nhất**, không cộng dồn số thực.

### Khái niệm

- **Giá trị tiền** là đối tượng thuần `{ minor, currency }`: `minor` là số nguyên an toàn (`Number.isSafeInteger`) tính theo đơn vị nhỏ nhất; `currency` là một trong `'VND'`, `'USD'`, `'EUR'`.
- Đơn vị nhỏ nhất: VND = đồng (0 chữ số thập phân; `{minor: 1500, currency: 'VND'}` là 1.500 đồng). USD, EUR = xu (2 chữ số thập phân; `{minor: 1050, currency: 'USD'}` là 10,50 USD).
- Mọi hàm trả về giá trị tiền đều trả đối tượng **mới**, và `minor` không bao giờ là `-0` (kết quả 0 luôn là `+0`).
- **Làm tròn half-even** (làm tròn ngân hàng) ở mọi chỗ cần làm tròn: phần lẻ đúng một nửa thì về phía số chẵn (`2,5 → 2`, `3,5 → 4`, `-2,5 → -2`, `-3,5 → -4`); phần lẻ khác một nửa thì về số nguyên gần nhất. Mọi phép làm tròn của module làm tròn **đúng một lần**, ở đơn vị nhỏ nhất của loại tiền kết quả.

### Locale

| Locale | Phân cách nghìn | Phân cách thập phân | Vị trí ký hiệu |
|---|---|---|---|
| `en-US` (mặc định) | `,` | `.` | đứng trước, không cách: `$5.00` |
| `vi-VN` | `.` | `,` | đứng sau, cách một dấu cách: `5,00 $` |
| `fr-FR` | dấu cách thường U+0020 | `,` | đứng sau, cách một dấu cách: `5,00 €` |

Ký hiệu: VND `₫` (U+20AB), USD `$`, EUR `€`. Mã: `VND`, `USD`, `EUR`.

### API

```js
money(minor, currency)                   → { minor, currency }
parseMoney(text, options?)               → { minor, currency }
formatMoney(m, options?)                 → string
add(a, b)                                → money        // cùng loại tiền
subtract(a, b)                           → money        // a - b
compare(a, b)                            → -1 | 0 | 1
divideRoundHalfEven(n, d)                → số nguyên    // n / d làm tròn half-even
multiply(m, factor)                      → money        // factor là chuỗi thập phân
allocate(m, ratios)                      → money[]
convert(m, to, rates)                    → money
convertSum(list, to, rates)              → money
```

### Lỗi

Mọi lỗi là `Error` có thuộc tính `code`. Bảng mã:

| `code` | Khi nào |
|---|---|
| `MONEY_INVALID_CURRENCY` | loại tiền không phải VND/USD/EUR (kể cả kiểu không phải chuỗi), hoặc `parseMoney` không xác định được loại tiền |
| `MONEY_INVALID_AMOUNT` | `minor` không phải số nguyên an toàn; giá trị tiền không phải đối tượng; chuỗi số tiền sai cú pháp; đầu vào `parseMoney` không phải chuỗi; kết quả vượt quá số nguyên an toàn; `convertSum` nhận danh sách không phải mảng hoặc rỗng; `n`/`d` của `divideRoundHalfEven` không phải số nguyên an toàn |
| `MONEY_CURRENCY_MISMATCH` | cộng/trừ/so sánh hai loại tiền khác nhau; loại tiền ghi trong chuỗi khác `options.currency` |
| `MONEY_INVALID_LOCALE` | `options.locale` không thuộc `en-US`, `vi-VN`, `fr-FR` |
| `MONEY_INVALID_OPTION` | `options.display` hoặc `options.negative` có giá trị ngoài danh sách |
| `MONEY_INVALID_RATIO` | `ratios` của `allocate` không hợp lệ |
| `MONEY_INVALID_RATE` | hệ số của `multiply` hoặc tỉ giá của `convert` không hợp lệ |
| `MONEY_MISSING_RATE` | bảng tỉ giá không có cặp cần đổi |
| `MONEY_DIVIDE_BY_ZERO` | `divideRoundHalfEven(n, 0)` |

### `money(minor, currency)`

Kiểm `currency` trước (`MONEY_INVALID_CURRENCY`), rồi `minor` (`MONEY_INVALID_AMOUNT`). `money(-0, 'USD')` → `{minor: 0, currency: 'USD'}`.

### `parseMoney(text, options?)`

`options`: `{ locale?, currency? }`. Thứ tự kiểm lỗi: (1) `locale` → `MONEY_INVALID_LOCALE`; (2) `currency` nếu có → `MONEY_INVALID_CURRENCY`; (3) `text` không phải chuỗi → `MONEY_INVALID_AMOUNT`; (4) cú pháp số tiền → `MONEY_INVALID_AMOUNT`; (5) loại tiền trong chuỗi (xem dưới); (6) làm tròn.

1. Bỏ khoảng trắng đầu/cuối.
2. **Dấu âm**: hoặc một dấu `-`/`+` ở **đầu chuỗi** (trước cả ký hiệu; có thể có khoảng trắng sau dấu: `"- $5"`), hoặc cả chuỗi bọc trong ngoặc đơn `(...)` nghĩa là số âm (kế toán). Trong ngoặc không được có dấu `+`/`-` ở đầu. Dấu đặt ở chỗ khác (`"$-5"`, `"5-"`) → `MONEY_INVALID_AMOUNT`.
3. **Ký hiệu hoặc mã loại tiền** (tùy chọn): đúng **một** token, đứng trước hoặc sau số, cho phép khoảng trắng giữa token và số. Token là một trong `₫`, `$`, `€` hoặc mã đúng 3 chữ cái (không phân biệt hoa/thường: `usd` = `USD`). Chấp nhận cả hai vị trí **bất kể locale** (`"5.00$"` hợp lệ ở `en-US`). Có token ở cả hai phía → `MONEY_INVALID_AMOUNT`. Mã 3 chữ cái ngoài VND/USD/EUR (vd. `GBP`) → `MONEY_INVALID_CURRENCY` (chỉ xét sau khi phần số đã hợp lệ). Ký tự lạ khác (`£`) làm phần số sai → `MONEY_INVALID_AMOUNT`.
4. **Phần số** theo locale: phần nguyên là chuỗi chữ số liền (`1234567`) **hoặc** nhóm đúng 3 chữ số theo phân cách nghìn của locale (`1,234,567` ở `en-US`; nhóm đầu 1–3 chữ số; không trộn hai kiểu); sau đó tùy chọn phân cách thập phân và **ít nhất một** chữ số thập phân. Phải có chữ số trước dấu thập phân (`.5`, `,5` → lỗi) và sau nó (`5.` → lỗi). Không chấp nhận dạng mũ (`1e3`), khoảng trắng chen trong số ở locale không dùng dấu cách làm phân cách nghìn.
5. **Loại tiền** của kết quả: lấy từ token; nếu không có token thì từ `options.currency`; nếu cả hai không có → `MONEY_INVALID_CURRENCY`; nếu cả hai có mà khác nhau → `MONEY_CURRENCY_MISMATCH`.
6. **Làm tròn khi dư chữ số thập phân**: nếu số chữ số thập phân nhiều hơn loại tiền cho phép (VND: 0, USD/EUR: 2) thì làm tròn half-even **trên chuỗi thập phân đúng** (không dùng số thực): `"1.005"` USD → 100 (đúng nửa, 100 chẵn); `"1.015"` → 102; `"1.0051"` → 101; VND `"2.5"` → 2, `"3.5"` → 4. Làm tròn trên giá trị tuyệt đối rồi mới áp dấu.
7. Kết quả `minor` không an toàn (lớn hơn 9 007 199 254 740 991) → `MONEY_INVALID_AMOUNT`.

Ví dụ: `parseMoney('$1,234.56')` → `{minor: 123456, currency: 'USD'}` · `parseMoney('1.234.567 ₫', {locale: 'vi-VN'})` → `{minor: 1234567, currency: 'VND'}` · `parseMoney('1 234,56 €', {locale: 'fr-FR'})` → `{minor: 123456, currency: 'EUR'}` · `parseMoney('($5.00)')` → `{minor: -500, currency: 'USD'}` · `parseMoney('1,234', {locale: 'vi-VN', currency: 'USD'})` → `{minor: 123, currency: 'USD'}` (ở `vi-VN`, `,` là dấu thập phân: 1,234 → 1,23).

### `formatMoney(m, options?)`

`options`: `{ locale?, display?, negative? }`. `display`: `'symbol'` (mặc định), `'code'`, `'none'`. `negative`: `'sign'` (mặc định), `'parens'`. Thứ tự kiểm lỗi: `m` (đối tượng → `currency` → `minor`, đều theo mục `money`) → `locale` → `display`/`negative` (`MONEY_INVALID_OPTION`).

- Số: phần nguyên nhóm 3 chữ số bằng phân cách nghìn của locale, phần thập phân luôn đủ số chữ số của loại tiền (`$5.00`, không bao giờ `$5`); VND không có phần thập phân.
- `symbol`: `en-US` → `<ký hiệu><số>` (`$1,234.56`, `₫1,234,567`); `vi-VN`/`fr-FR` → `<số> <ký hiệu>` (`1.234,56 $`, `1 234,56 $`).
- `code`: `en-US` → `<mã> <số>` (`USD 5.00`); `vi-VN`/`fr-FR` → `<số> <mã>` (`5,00 USD`).
- `none`: chỉ phần số.
- Số âm: `sign` thì thêm `-` ở **đầu toàn chuỗi**: `-$5.00`, `-USD 5.00`, `-5,00 $`; `parens` thì bọc cả chuỗi trong ngoặc: `($5.00)`, `(5,00 $)`. Số không âm không bao giờ có dấu hay ngoặc.
- Tính chất: `parseMoney(formatMoney(m, {locale}), {locale})` bằng `m` với mọi `m` và locale (display `symbol`/`code`).

### `add`, `subtract`, `compare`

Kiểm `a` rồi `b` (như `formatMoney`), rồi khác loại tiền → `MONEY_CURRENCY_MISMATCH`. `add`/`subtract` kết quả vượt số nguyên an toàn → `MONEY_INVALID_AMOUNT`. `compare` trả `-1`, `0`, `1`.

### `divideRoundHalfEven(n, d)`

`n`, `d` là số nguyên an toàn; trả `n / d` làm tròn half-even thành số nguyên, **chính xác kể cả khi `n` rất lớn** (không qua số thực). `d` âm hợp lệ (`5 / -2` → `-2`). `d = 0` → `MONEY_DIVIDE_BY_ZERO`. Ví dụ: `(5, 2)` → 2; `(7, 2)` → 4; `(-5, 2)` → -2; `(10, 4)` → 2; `(14, 4)` → 4; `(2, 3)` → 1; `(-1, 3)` → `0` (không `-0`).

### `multiply(m, factor)`

`factor` là **chuỗi** thập phân khớp `^-?\d+(\.\d+)?$` (kiểu `number`, `1e2`, `.5`, `5.` → `MONEY_INVALID_RATE`). Kết quả `minor = m.minor × factor`, làm tròn half-even **một lần** ở đơn vị nhỏ nhất. Ví dụ: `multiply({minor: 1005, currency: 'USD'}, '0.08')` → 80,4 → `80`; `multiply({minor: 250, …}, '0.01')` → 2,5 → `2`; `multiply({minor: 350, …}, '0.01')` → `4`; `multiply({minor: 1005, …}, '1.1')` → 1105,5 → `1106`.

### `allocate(m, ratios)` — chia tiền không mất xu

`ratios`: mảng khác rỗng các số nguyên an toàn **không âm**, tổng lớn hơn 0; sai → `MONEY_INVALID_RATIO`. Trả mảng giá trị tiền cùng thứ tự và cùng loại tiền với `m`, **tổng đúng bằng `m.minor`**.

Thuật toán (khác bài `t2-orders`, **không** dùng phần dư thập phân lớn nhất):
1. Làm việc trên giá trị tuyệt đối `A = |m.minor|`, tổng tỉ lệ `T`. Phần cơ bản của phần tử i: `floor(A × r_i / T)`.
2. Phần dư `L = A − tổng các phần cơ bản` (luôn nhỏ hơn số phần tử có `r_i > 0`).
3. Phát **mỗi xu một đơn vị** cho `L` phần tử đầu tiên khi sắp các phần tử có `r_i > 0` theo **tỉ lệ `r_i` giảm dần; bằng nhau thì chỉ số nhỏ hơn đứng trước**. Phần tử có `r_i = 0` luôn nhận 0.
4. Nếu `m.minor` âm: áp dấu âm lên từng phần (số 0 vẫn là `+0`).

Ví dụ: `allocate(10 xu, [1, 3])` → `[2, 8]` (cơ bản 2 và 7, dư 1 cho tỉ lệ 3) — phần dư lớn nhất sẽ cho `[3, 7]`. `allocate(100, [1, 2, 3])` → `[16, 33, 51]`. `allocate(5, [3, 3, 1])` → `[3, 2, 0]`. `allocate(1000, [1, 1, 1])` → `[334, 333, 333]`. `allocate(7, [0, 1, 0, 1])` → `[0, 4, 0, 3]`. `allocate(-10, [1, 3])` → `[-2, -8]`.

### `convert(m, to, rates)` — đổi tiền

- `to`: loại tiền đích (kiểm trước → `MONEY_INVALID_CURRENCY`). Nếu `to` bằng loại tiền của `m` → trả bản sao của `m`, **không đọc `rates`**.
- `rates` là đối tượng lồng `rates[từ][đến]` = tỉ giá dạng **chuỗi thập phân dương** khớp `^\d+(\.\d+)?$`, nghĩa là 1 đơn vị **chính** (1 USD, 1 EUR, 1 VND, không phải 1 xu) của `từ` đổi được `tỉ giá` đơn vị chính của `đến`. Ví dụ `{ USD: { VND: '25000.5' } }`.
- Chỉ dùng **cặp trực tiếp**: không tự nghịch đảo (có `EUR→VND` không suy ra được `VND→EUR`), không qua trung gian. Thiếu cặp → `MONEY_MISSING_RATE`. `rates` không phải đối tượng, hoặc tỉ giá không phải chuỗi đúng dạng, hoặc bằng 0 → `MONEY_INVALID_RATE`.
- **Bước làm tròn: đúng một lần, ở cuối, theo đơn vị nhỏ nhất của loại tiền đích**, half-even. Giá trị chính xác: `minor_đích = minor_nguồn × tỉ_giá × 10^(chữ_số_đích − chữ_số_nguồn)`. Không làm tròn trung gian, không làm tròn tỉ giá.
- Ví dụ với `rates = { USD: { VND: '25000.5', EUR: '0.92' }, EUR: { USD: '1.087', VND: '27000' }, VND: { USD: '0.00004' } }`: 1,00 USD (`100`) → VND = 25000,5 → `25000`; 3,00 USD (`300`) → 75001,5 → `75002`; 0,01 USD → 250,005 → `250`; 10,00 USD → EUR `920`; 0,05 USD → 4,6 xu → EUR `5`; 1 000 000 VND → USD `4000`; 1 VND → USD `0`; -3,00 USD → VND `-75002`.

### `convertSum(list, to, rates)`

`list` là mảng khác rỗng các giá trị tiền (có thể nhiều loại tiền khác nhau). **Đổi và làm tròn từng khoản riêng** theo `convert`, rồi cộng các kết quả. Rỗng/không phải mảng → `MONEY_INVALID_AMOUNT`. Ví dụ: ba khoản 1,00 USD sang VND với `'25000.5'` → `25000 × 3 = 75000`, trong khi `convert` của khoản 3,00 USD gộp cho `75002`.

### Điểm dễ hiểu nhầm

- `allocate` phát dư theo **tỉ lệ lớn nhất**, không theo phần dư thập phân lớn nhất.
- `parseMoney` ở `vi-VN`/`fr-FR`: `,` là dấu thập phân; `1,234` là 1,234 chứ không phải một nghìn hai trăm ba mươi bốn.
- Tỉ giá tính theo **đơn vị chính**; `minor` là đơn vị nhỏ nhất (đổi USD→VND phải chia cho 100).
- Half-even trên số âm đối xứng quanh 0.

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

## Module `csvcheck` — phân tích CSV (RFC 4180) và kiểm theo lược đồ

Tệp: `src/csvcheck/index.js`. Xuất (named export): `parseCsv`, `validateCsv`. Không import module khác.

### Quy ước chốt (đọc trước)

1. **Số hàng (`row`)**: đánh số từ **1**, tính theo **bản ghi** (record), không theo dòng văn bản. **Hàng tiêu đề là hàng 1**, bản ghi dữ liệu đầu tiên là hàng 2. Ô có xuống dòng bên trong vẫn chỉ là một bản ghi. Dòng trống (xem dưới) không tính là bản ghi nên không chiếm số hàng.
2. **Thứ tự lỗi** trong `errors`: theo `row` tăng dần → trong cùng hàng, theo **thứ tự cột trong lược đồ** (không theo thứ tự cột trong tệp) → trong cùng ô, theo **thứ tự kiểm** cố định ở mục "Thứ tự kiểm một ô". Lỗi cấp hàng (`ROW_LENGTH`) đứng một mình trong hàng đó.
3. **Ô sai kiểu thì dừng**: ô đã báo `TYPE` thì không kiểm tiếp `ENUM`, `PATTERN`, độ dài, `MIN`/`MAX`, `UNIQUE` cho ô đó (và giá trị của nó không được ghi vào tập kiểm `UNIQUE`).
4. Lỗi dữ liệu **không ném ngoại lệ**: `validateCsv` trả về mảng lỗi. Chỉ đầu vào/lược đồ sai kiểu mới ném `Error` có `code` (tiền tố `CSV_`).

### `parseCsv(text, options?) → string[][]`

`text` là chuỗi; `options.delimiter` là đúng **một** ký tự, mặc định `,` (không được là `"`, `\r`, `\n`). Trả về mảng bản ghi, mỗi bản ghi là mảng chuỗi.

- **BOM**: nếu `text` bắt đầu bằng U+FEFF thì bỏ **đúng một** ký tự đó. BOM thứ hai (nếu có) là dữ liệu bình thường.
- **Kết thúc bản ghi**: `\r\n`, `\n` hoặc `\r` đơn lẻ; có thể lẫn lộn trong cùng tệp. Bản ghi cuối có hoặc không có kết thúc dòng đều như nhau (không sinh bản ghi rỗng thừa).
- **Dòng trống** (dòng không có ký tự nào, ngoài phần kết thúc dòng) **bị bỏ qua**. Dòng chỉ có dấu cách là một bản ghi một ô `"  "`. Dòng `""` (hai nháy kép) là bản ghi một ô rỗng, **không** bị bỏ.
- **Ô có nháy**: ô bắt đầu bằng `"` kéo dài đến nháy đóng; `""` bên trong là một `"`. Bên trong nháy, dấu phân cách và xuống dòng được giữ nguyên **đúng như trong văn bản** (CRLF vẫn là CRLF).
- Ô không nháy lấy nguyên văn, **không cắt khoảng trắng**. Dấu phân cách ở cuối bản ghi sinh thêm một ô rỗng: `"a,"` → `[["a",""]]`.
- `""` (chuỗi rỗng) → `[]`.
- **Lỗi** (ném `Error`, thuộc tính `code` và `row` = số hàng theo quy ước 1 nơi lỗi xảy ra):
  - `CSV_INVALID_INPUT`: `text` không phải chuỗi, hoặc `delimiter` không hợp lệ (`row` không có).
  - `CSV_UNTERMINATED_QUOTE`: hết văn bản khi còn đang trong nháy.
  - `CSV_BAD_QUOTE`: có `"` ở giữa ô không nháy (`ab"c`), hoặc sau nháy đóng còn ký tự khác ngoài dấu phân cách / kết thúc dòng / hết văn bản (`"ab"c`).

Ví dụ:

```js
parseCsv('a,b\r\n1,2\n');            // [['a','b'],['1','2']]
parseCsv('x,"y,""z"""\n"l1\nl2",');  // [['x','y,"z"'],['l1\nl2','']]
parseCsv('﻿a;b', { delimiter: ';' }); // [['a','b']]
```

### `validateCsv(text, schema, options?) → { ok, rowCount, errors }`

`options` được chuyển cho `parseCsv` (chỉ `delimiter`). `ok = errors.length === 0`. `rowCount` = số bản ghi dữ liệu (không tính tiêu đề), `0` nếu tệp rỗng hoặc lỗi phân tích. Mỗi lỗi là object có đúng 3 khóa: `{ row, column, code }`; `column` là **tên cột** (chuỗi) với lỗi theo ô và `MISSING_COLUMN`, là `null` với lỗi cấp hàng/tệp.

**Lược đồ**:

```js
{ columns: [
  { name: 'id',    type: 'int', required: true, unique: true, min: 1 },
  { name: 'email', type: 'string', pattern: '^[^@\\s]+@[^@\\s]+$', maxLength: 50 },
  { name: 'role',  enum: ['admin', 'user'] },
] }
```

Thuộc tính cột: `name` (bắt buộc, chuỗi, không trùng), `type` (`string` mặc định, `int`, `number`, `bool`, `date`), `required` (mặc định `false`), `pattern` (chuỗi regex, không cờ, **không neo** — dùng `^…$` nếu cần), `min`/`max` (bao gồm biên), `minLength`/`maxLength` (bao gồm biên), `unique`, `enum` (mảng chuỗi không rỗng). Lược đồ sai (không có `columns` mảng không rỗng, cột không phải object, `name` thiếu/trùng, `type` lạ, `pattern` không biên dịch được, `enum` không phải mảng chuỗi không rỗng, `min`/`max` không đúng loại — số hữu hạn cho `int`/`number`, chuỗi ngày hợp lệ cho `date` —, `minLength`/`maxLength` không phải số nguyên ≥ 0) → ném `Error` có `code === 'CSV_INVALID_SCHEMA'`, kiểm **trước** khi phân tích văn bản.

**Tiêu đề**: bản ghi đầu tiên là tiêu đề. Cột lược đồ tìm trong tiêu đề theo **tên, so sánh chính xác** (có phân biệt hoa thường, không cắt khoảng trắng); nếu tên tiêu đề lặp thì lấy cột đầu tiên. Cột của tệp không có trong lược đồ bị bỏ qua. Số cột kỳ vọng của mọi bản ghi dữ liệu = số ô của tiêu đề.

**Mã lỗi (bộ cố định)**:

| `code` | Khi nào | `row` / `column` |
|---|---|---|
| `EMPTY_INPUT` | không có bản ghi nào (kể cả tiêu đề) | 1 / `null` |
| `UNTERMINATED_QUOTE` | lỗi phân tích như trên | hàng nơi lỗi / `null` |
| `BAD_QUOTE` | lỗi phân tích như trên | hàng nơi lỗi / `null` |
| `MISSING_COLUMN` | cột lược đồ không có trong tiêu đề | 1 / tên cột |
| `ROW_LENGTH` | số ô của bản ghi dữ liệu ≠ số ô tiêu đề (thiếu hoặc thừa) | hàng / `null` |
| `REQUIRED` | `required` và ô rỗng `""` | hàng / tên cột |
| `TYPE` | ô không đúng kiểu | hàng / tên cột |
| `ENUM` | ô không nằm trong `enum` | hàng / tên cột |
| `PATTERN` | ô không khớp `pattern` | hàng / tên cột |
| `MIN_LENGTH` | độ dài < `minLength` | hàng / tên cột |
| `MAX_LENGTH` | độ dài > `maxLength` | hàng / tên cột |
| `MIN` | giá trị < `min` | hàng / tên cột |
| `MAX` | giá trị > `max` | hàng / tên cột |
| `UNIQUE` | trùng với ô cùng cột ở hàng trước | hàng / tên cột |

**Lỗi phân tích và tệp rỗng**: khi `parseCsv` gặp `CSV_UNTERMINATED_QUOTE` hoặc `CSV_BAD_QUOTE`, `validateCsv` **không ném** mà trả `errors` chỉ có **một** lỗi (`UNTERMINATED_QUOTE` hoặc `BAD_QUOTE`, bỏ tiền tố `CSV_`) và không kiểm gì khác. (Đầu vào không phải chuỗi / `delimiter` sai vẫn ném `CSV_INVALID_INPUT`.) Tệp không có bản ghi nào → một lỗi `EMPTY_INPUT`. Chỉ có tiêu đề → hợp lệ (nếu đủ cột), `rowCount: 0`.

**Hàng sai độ dài**: chỉ báo `ROW_LENGTH`, **không kiểm ô nào** của hàng đó và không ghi gì vào tập `UNIQUE`.

**Cột thiếu trong tiêu đề**: báo `MISSING_COLUMN` một lần (hàng 1), mọi cột còn lại vẫn được kiểm bình thường; cột thiếu không sinh lỗi `REQUIRED` ở hàng dữ liệu.

**Thứ tự kiểm một ô** (ô đã tách theo RFC 4180, không cắt khoảng trắng):

1. Ô rỗng (`""`): nếu `required` → `REQUIRED`; **dừng** (ô rỗng không bắt buộc luôn hợp lệ, không vào tập `UNIQUE`).
2. `TYPE` (dừng nếu sai).
3. `ENUM` → 4. `PATTERN` → 5. `MIN_LENGTH` → 6. `MAX_LENGTH` → 7. `MIN` → 8. `MAX` → 9. `UNIQUE`.

Các bước 3–9 **không dừng nhau**: một ô có thể có nhiều lỗi, theo thứ tự trên.

**Kiểu**:

- `string`: luôn đúng.
- `int`: khớp `^[+-]?\d+$` và là số nguyên an toàn (`Number.isSafeInteger`). `"007"`, `"+5"`, `"-0"` đúng; `"1.0"`, `"1e3"`, `" 1"` sai.
- `number`: khớp `^[+-]?\d+(\.\d+)?$` (không mũ, không `"5."`, không `".5"`, không `NaN`/`Infinity`) và hữu hạn.
- `bool`: `true` hoặc `false`, **không phân biệt hoa thường** (`TRUE` đúng). `1`, `yes` sai.
- `date`: đúng dạng `YYYY-MM-DD` và là ngày có thật theo lịch Gregory (có năm nhuận): `2024-02-29` đúng, `2023-02-29` và `2024-13-01` sai. Năm `0000` sai.

**Ràng buộc**:

- `enum`: so sánh chuỗi **nguyên văn** (phân biệt hoa thường), với mọi kiểu.
- `pattern`: `new RegExp(pattern).test(ô)`, không neo, với mọi kiểu.
- `minLength`/`maxLength`: độ dài tính theo **điểm mã Unicode** (`Array.from(ô).length`), trên văn bản gốc, với mọi kiểu.
- `min`/`max`: chỉ áp cho `int`, `number` (so sánh số: `Number(ô)`) và `date` (so sánh chuỗi `YYYY-MM-DD`). Với `string`, `bool` thì **bỏ qua**.
- `unique`: so sánh văn bản gốc nguyên văn (`"1"` và `"01"` là khác nhau). **Lần xuất hiện đầu tiên hợp lệ, các lần sau** báo `UNIQUE`. Chỉ ô qua được bước 1–2 mới được tính.

Ví dụ:

```js
const schema = { columns: [
  { name: 'id', type: 'int', required: true, unique: true, min: 1 },
  { name: 'name', maxLength: 5 },
] };
validateCsv('id,name\r\n1,An\r\n1,Bình Minh\r\nx,\r\n,Z\r\n', schema);
// → { ok: false, rowCount: 4, errors: [
//   { row: 3, column: 'id',   code: 'UNIQUE' },
//   { row: 3, column: 'name', code: 'MAX_LENGTH' },
//   { row: 4, column: 'id',   code: 'TYPE' },        // dừng: không kiểm min
//   { row: 5, column: 'id',   code: 'REQUIRED' },
// ] }
```

### Dễ hiểu nhầm

- Số hàng của lỗi **luôn tính tiêu đề là hàng 1** (dữ liệu bắt đầu từ 2), và đếm bản ghi chứ không đếm dòng.
- Mã lỗi ném (`CSV_…`) khác mã trong mảng lỗi (không có tiền tố).
- `pattern` không neo; `min`/`max` không áp cho chuỗi; ô rỗng không bắt buộc bỏ qua mọi ràng buộc.
- Thứ tự lỗi trong một hàng theo lược đồ, không theo thứ tự cột trong tệp.

## Module `slug` — chuẩn hóa, so khớp và sắp xếp tiếng Việt

Tệp: `src/slug/index.js` (ESM, named export, không thêm thư viện ngoài, **không dùng `Intl.Collator`** hay `localeCompare` — kết quả phải giống nhau trên mọi bản Node). Module này độc lập, không import module khác.

Mọi hàm nhận đầu vào không phải `string` (kể cả `null`, `undefined`, số) → ném `Error` có `code = "SLUG_INVALID_INPUT"`. Mọi hàm chấp nhận cả dạng NFC lẫn NFD của cùng một chữ (`"ệ"` dựng sẵn hay `"e"` + dấu nặng + dấu mũ cho kết quả như nhau).

### `fold(text) → string`

Bỏ dấu nhưng **giữ nguyên hoa/thường** và mọi ký tự khác: `đ` → `d`, `Đ` → `D`, mọi dấu kết hợp (U+0300–U+036F, gồm cả dấu móc `ơ`/`ư`, dấu mũ, dấu trăng `ă` và năm dấu thanh) bị bỏ. Kết quả ở dạng NFC. `fold("Đặng Thị Ánh")` = `"Dang Thi Anh"`; `fold("abc 123 !?")` = `"abc 123 !?"`.

### `slugify(text, options?) → string`

1. Bỏ dấu như `fold`, đổi sang chữ thường.
2. Giữ lại chỉ `a-z` và `0-9` (ASCII). **Mọi ký tự khác** (khoảng trắng, dấu câu, `_`, `.`, chữ không phải La-tinh như `日本`, chữ `ß`, chữ số toàn chiều rộng…) là ký tự phân cách.
3. Mỗi dãy phân cách liên tiếp thành đúng một dấu `-`; bỏ `-` ở đầu và cuối. Không còn chữ nào → `""`.
4. `options.maxLength` (mặc định: không giới hạn) phải là số nguyên ≥ 1, nếu không → `Error` có `code = "SLUG_INVALID_MAXLENGTH"` (kiểm tra ngay cả khi `text` rỗng). Nếu slug dài hơn `maxLength`: **không cắt giữa từ** — giữ nhiều từ nhất có thể, từ đầu tiên đến từ thứ k, sao cho slug ghép lại (nối bằng `-`) có độ dài ≤ `maxLength`. **Nếu ngay từ đầu tiên đã dài hơn `maxLength`** thì cắt cứng từ đó lấy `maxLength` ký tự đầu. Kết quả không bao giờ kết thúc bằng `-`.

Ví dụ: `slugify("Xin chào Việt Nam")` = `"xin-chao-viet-nam"`; `slugify("Đường Đồng Khởi")` = `"duong-dong-khoi"`; `slugify("  Hello,   World!!  ")` = `"hello-world"`; `slugify("Phòng 101/B2")` = `"phong-101-b2"`; `slugify("Straße")` = `"stra-e"`.
`slugify("xin chao viet nam", { maxLength: 12 })` = `"xin-chao"` (vì `"xin-chao-viet"` dài 13); với `maxLength: 13` = `"xin-chao-viet"`. `slugify("extraordinary day", { maxLength: 5 })` = `"extra"`.

### `uniqueSlug(base, existing) → string`

`base` là chuỗi không rỗng (rỗng hoặc không phải chuỗi → `SLUG_INVALID_INPUT`); `existing` là mảng hoặc `Set` các slug đã dùng (không phải thì `SLUG_INVALID_INPUT`). Trả `base` nếu chưa dùng; nếu đã dùng thì thử `base-2`, `base-3`, … và trả cái đầu tiên chưa có. Không sửa `existing`. `uniqueSlug("abc-2", ["abc-2"])` = `"abc-2-2"`.

### `looseEquals(a, b) → boolean` và `looseIncludes(haystack, needle) → boolean`

So khớp không dấu. Chuẩn hóa cả hai vế: bỏ dấu (như `fold`), chữ thường, mỗi dãy khoảng trắng (`\s+`) thành một dấu cách, bỏ khoảng trắng đầu/cuối. `looseEquals` so sánh bằng nhau sau chuẩn hóa; `looseIncludes` kiểm tra `needle` đã chuẩn hóa là chuỗi con của `haystack` đã chuẩn hóa (`needle` rỗng sau chuẩn hóa → `true`). `looseEquals("Đà   Nẵng ", "da nang")` = `true`; `looseIncludes("Thành phố Hồ Chí Minh", "ho chi")` = `true`.

### `compareVi(a, b) → -1 | 0 | 1` và `sortVi(list) → string[]`

Thứ tự chữ cái tiếng Việt, so theo **ba mức** (mức sau chỉ xét khi mọi mức trước bằng nhau):

**Mức 1 — chữ cái gốc.** Bảng cố định (ký tự không có trong bảng, kể cả chữ số và dấu cách, đứng **trước** mọi chữ cái):

`a ă â b c d đ e ê g h i k l m n o ô ơ p q r s t u ư v x y` rồi đến các chữ ngoại lai `f j w z` (theo đúng thứ tự này, sau `y`).

Quy ước so sánh: đổi cả hai chuỗi về chữ thường rồi tách thành dãy ký tự (mỗi chữ cái tiếng Việt, kể cả `ă â ê ô ơ ư đ`, là **một** ký tự; dấu thanh không tính ở mức này). So từng vị trí: ký tự không phải chữ cái xếp theo mã Unicode và đứng trước mọi chữ cái; chữ cái xếp theo bảng trên. Dãy ngắn là tiền tố của dãy dài thì đứng trước (`"an" < "anh"`, `"" < "a"`).

**Mức 2 — thanh điệu.** Thứ tự cố định: **không dấu < huyền (`̀`) < hỏi (`̉`) < ngã (`̃`) < sắc (`́`) < nặng (`̣`)**. Hai chuỗi bằng nhau ở mức 1 thì cùng độ dài; so thanh điệu từng vị trí, vị trí khác nhau đầu tiên quyết định. Ký tự không phải chữ cái có thanh "không dấu".

**Mức 3 — hoa/thường.** Vị trí khác nhau đầu tiên: chữ thường đứng **trước** chữ hoa (`"a" < "A"`).

Hệ quả: mức trước luôn thắng mức sau — `"A" < "b"`, `"ạ" < "b"`, `"ặ" < "ấ"` (vì `ă` < `â` ở mức 1), `"a" < "Á"` và `"á" > "A"` (thanh điệu thắng hoa/thường). Các chuỗi chỉ khác nhau do dạng NFC/NFD hoặc dấu kết hợp lạ thì `compareVi` = `0`.

`compareVi` trả đúng `-1`, `0` hoặc `1`. `sortVi(list)` trả **mảng mới** đã sắp tăng dần theo `compareVi`, ổn định (phần tử so bằng nhau giữ thứ tự gốc), không sửa `list`; `list` không phải mảng hoặc có phần tử không phải chuỗi → `SLUG_INVALID_INPUT`.

Ví dụ: `sortVi(["Huế","Hải Phòng","Hà Nội","Gia Lai","Đồng Nai","Đà Nẵng","Cần Thơ","Bắc Ninh","An Giang"])` = `["An Giang","Bắc Ninh","Cần Thơ","Đà Nẵng","Đồng Nai","Gia Lai","Hà Nội","Hải Phòng","Huế"]`; `sortVi(["ạ","ã","á","ả","à","a"])` = `["a","à","ả","ã","á","ạ"]`.

### Mã lỗi

| Mã | Khi nào |
|---|---|
| `SLUG_INVALID_INPUT` | tham số chuỗi/mảng sai kiểu (xem trên) |
| `SLUG_INVALID_MAXLENGTH` | `maxLength` không phải số nguyên ≥ 1 |

## Module `ratelimit` — giới hạn tần suất (token bucket và cửa sổ trượt)

Tệp: `src/ratelimit/index.js` (ESM, named export, không thêm thư viện ngoài). Module độc lập, không import module khác. **Đồng hồ chỉ đến từ tùy chọn `now`** — hàm `() => số mili giây` do người gọi tiêm vào; module không được dùng `Date.now`, `setTimeout`, `setInterval`. Giả định `now()` trả số nguyên mili giây tăng dần (xem "đồng hồ lùi" ở dưới).

Hai hàm tạo bộ giới hạn: `createTokenBucket(options)` và `createSlidingWindow(options)`. Mỗi bộ giới hạn quản lý **nhiều khóa độc lập** (`key`: chuỗi không rỗng). Cả hai trả đối tượng có cùng các phương thức:

| Phương thức | Ý nghĩa |
|---|---|
| `take(key, cost = 1)` | thử tiêu `cost` đơn vị cho `key`; trả `{ allowed, retryAfterMs, remaining }` |
| `peek(key, cost = 1)` | như `take` nhưng **không tiêu, không tạo khóa** |
| `reset(key)` | xóa trạng thái của `key`; trả `true` nếu khóa có tồn tại, ngược lại `false` |
| `sweep()` | dọn các khóa đã hết hạn (định nghĩa riêng từng loại); trả số khóa đã xóa |
| `size()` | số khóa đang được lưu (kể cả khóa hết hạn chưa được `sweep`) |

Kết quả `{ allowed, retryAfterMs, remaining }`:
- `allowed` (boolean): có được phép không.
- `retryAfterMs`: `0` nếu `allowed`; ngược lại là số mili giây **nguyên, làm tròn lên (ceil)** phải chờ rồi mới có thể `take` cùng `cost` thành công (nếu không có ai khác dùng khóa đó). Chờ đúng `retryAfterMs` thì lần `take` sau chắc chắn được phép.
- `remaining`: số đơn vị nguyên còn lại sau thao tác (xem từng loại). Với `peek`, là số còn lại **hiện tại** (chưa trừ `cost`).

Lần `take` bị từ chối **không tiêu gì**. `take` trên khóa chưa có sẽ tạo khóa; `peek` thì không.

### Kiểm tra đầu vào (thứ tự: khóa → `cost` → `cost` so với sức chứa)

- `key` không phải chuỗi hoặc là chuỗi rỗng → `Error` có `code = "RL_INVALID_KEY"`.
- `cost` (khi truyền, `undefined` = 1) không phải số nguyên ≥ 1 → `code = "RL_INVALID_COST"`.
- `cost` lớn hơn sức chứa (`capacity` của bucket / `limit` của cửa sổ) — không bao giờ thỏa được → **ném** `code = "RL_COST_EXCEEDS_CAPACITY"` (không trả `allowed: false`, không tạo khóa). `cost` đúng bằng sức chứa là hợp lệ.
- Tùy chọn sai khi tạo (xem dưới) → `code = "RL_INVALID_OPTIONS"`. `createTokenBucket()` không đối số cũng là `RL_INVALID_OPTIONS`.

### `createTokenBucket({ capacity, refillAmount = 1, refillIntervalMs = 1000, now })`

`capacity`, `refillAmount`, `refillIntervalMs` là số nguyên ≥ 1; `now` là hàm bắt buộc.

- Khóa mới bắt đầu **đầy** (`capacity` token). Bucket được nạp **liên tục**: mỗi `refillIntervalMs` mili giây thêm `refillAmount` token, tức `refillAmount / refillIntervalMs` token mỗi ms, tính cả phần lẻ, không vượt `capacity`. Tính toán phải chính xác (khuyến nghị dùng số nguyên: nhân mọi lượng token với `refillIntervalMs`) để `retryAfterMs` không bị sai do số thực.
- `take`: nạp bù theo thời gian từ lần cập nhật trước, rồi nếu token ≥ `cost` thì trừ `cost` và `allowed: true`. Ngược lại `allowed: false`, `retryAfterMs = ceil((cost − token hiện có) × refillIntervalMs / refillAmount)`.
- `remaining` = phần nguyên (floor) của số token (kể cả phần lẻ đang nạp dở) sau thao tác.
- **Đồng hồ lùi:** nếu `now()` nhỏ hơn thời điểm cập nhật trước của khóa, coi như không có thời gian trôi qua và **giữ nguyên** mốc cập nhật cũ (không lùi mốc).
- **Khóa hết hạn:** khóa mà bucket đã nạp đầy lại (token = `capacity` tại thời điểm `sweep`) — tương đương khóa mới. `sweep()` xóa các khóa này.

Ví dụ (`capacity: 5`, mặc định nạp 1 token/giây, đồng hồ bắt đầu 0): 5 lần `take("k")` đầu cho `remaining` 4, 3, 2, 1, 0; lần thứ 6 → `{ allowed: false, retryAfterMs: 1000, remaining: 0 }`. Với `{ capacity: 6, refillAmount: 3, refillIntervalMs: 2000 }` và bucket vừa cạn: `take` 1 token cần chờ `ceil(2000/3)` = 667 ms (ở 666 ms vẫn bị từ chối, `retryAfterMs` = 1).

### `createSlidingWindow({ limit, windowMs, now })`

`limit`, `windowMs` là số nguyên ≥ 1; `now` là hàm bắt buộc.

- Cửa sổ trượt **chính xác theo từng sự kiện**: mỗi lần `take` thành công ghi một sự kiện `{ t: now(), cost }`. Một sự kiện tại thời điểm `t` được tính trong cửa sổ khi `t > now − windowMs`, tức hết hiệu lực **đúng** tại `t + windowMs`.
- `used` = tổng `cost` các sự kiện còn hiệu lực. `take` được phép khi `used + cost ≤ limit`. `remaining` = `limit − used` sau thao tác (với `peek`: trước khi trừ `cost`).
- Bị từ chối: `retryAfterMs` là thời gian đến lúc đủ sự kiện cũ hết hiệu lực để `used + cost ≤ limit`: duyệt sự kiện từ cũ đến mới, cộng dồn `cost` đến khi cộng dồn ≥ `used + cost − limit`; với sự kiện cuối cùng đó, `retryAfterMs = ceil(t + windowMs − now())`.
- `take`/`peek` bỏ các sự kiện hết hiệu lực của khóa đó. Không quy định gì khi đồng hồ lùi.
- **Khóa hết hạn:** khóa không còn sự kiện hiệu lực nào tại thời điểm `sweep`. `sweep()` xóa các khóa này (và dọn sự kiện hết hiệu lực của khóa còn lại).

Ví dụ (`limit: 3`, `windowMs: 1000`): ba lần `take("k")` tại t=0 cho `remaining` 2, 1, 0; lần thứ tư tại t=0 → `{ allowed: false, retryAfterMs: 1000, remaining: 0 }`; tại t=999 → `retryAfterMs: 1`; tại t=1000 → được phép.

### Mã lỗi

| Mã | Khi nào |
|---|---|
| `RL_INVALID_KEY` | `key` không phải chuỗi không rỗng |
| `RL_INVALID_COST` | `cost` không phải số nguyên ≥ 1 |
| `RL_COST_EXCEEDS_CAPACITY` | `cost` > `capacity` / `limit` |
| `RL_INVALID_OPTIONS` | tùy chọn tạo bộ giới hạn thiếu hoặc sai kiểu/miền giá trị |

