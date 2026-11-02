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
