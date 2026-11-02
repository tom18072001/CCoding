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
