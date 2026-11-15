# cfgchain — đường ống 4 tầng cho ngôn ngữ cấu hình `cfg`

Thư viện ESM thuần (Node ≥ 22, không gói ngoài, không mạng, không đồng hồ) xử lý một ngôn ngữ cấu hình nhỏ tên `cfg`.
Bốn tầng nối tiếp, **tầng sau dùng đúng kiểu và đầu ra của tầng trước**:

| Tầng | Tệp | Vào | Ra |
|---|---|---|---|
| 1 | `src/lexer.js`, `src/parser.js` | văn bản `cfg` (một hoặc nhiều tệp trong bộ nhớ) | token, rồi AST có `{line, column}` |
| 2 | `src/check.js` | chương trình (đầu ra `parseProject`) + lược đồ tùy chọn | mảng lỗi ngữ nghĩa có mã và vị trí |
| 3 | `src/evaluate.js` | chương trình đã qua tầng 2 không lỗi | giá trị JSON thuần |
| 4 | `src/diff.js` | hai giá trị JSON (đầu ra tầng 3) | danh sách thao tác, văn bản, JSON |

`src/index.js` xuất lại mọi hàm công khai và thêm `compile` (mục 8). Mọi hàm công khai là **named export**. Import nội bộ có đuôi `.js`.
Văn bản `message` của lỗi tùy ý (tiếng Việt có dấu); test chỉ kiểm `code`, `file`, `line`, `column`.

Quy ước chung: `line` và `column` đếm từ **1**; `column` đếm theo đơn vị mã UTF-16 của chuỗi JS.
Xuống dòng là `\n`, `\r\n` (tính một lần) hoặc `\r` đơn lẻ. Nếu văn bản bắt đầu bằng BOM (U+FEFF) thì bỏ BOM đó và **không** tính nó vào cột.

---

## 1. Ngôn ngữ `cfg` (tóm tắt, ví dụ)

```
# chú thích đến hết dòng        // cũng là chú thích đến hết dòng        /* chú thích khối */
const region = "hn"
name = "app-${@region}"
port = 8080
debug = false
owner = null
ratio = -1.5e2
tags = ["a", "b", [1, 2],]            # dấu phẩy cuối được phép
server {
  host = "0.0.0.0"
  url  = "http://${server.host}:${port}"   # nội suy: đường dẫn cấu hình
  limits { max = "${port}" }               # chuỗi chỉ gồm một ${...} giữ nguyên kiểu (ở đây là số 8080)
}
include "common.cfg"                       # lấy nội dung tệp từ bản đồ tệp trong bộ nhớ
```

Câu lệnh (statement), phân tách chỉ bằng khoảng trắng/chú thích (không có dấu chấm phẩy, không có dấu phẩy giữa câu lệnh):

1. `khóa = giá_trị` — gán.
2. `khóa { câu lệnh… }` — khối (đối tượng) lồng nhau.
3. `include "đường_dẫn"` — chèn các câu lệnh của một tệp khác **tại đúng vị trí này** (trong khối đang đứng).
4. `const tên = giá_trị` — hằng, chỉ ở cấp cao nhất của tệp.

Giá trị: số, chuỗi, `true`, `false`, `null`, hoặc mảng `[giá_trị, giá_trị, …]` (mảng chứa được mảng; mảng **không** chứa khối).

`khóa` và `tên` là định danh `[A-Za-z_][A-Za-z0-9_-]*` (không phải từ khóa). Từ khóa: `include`, `const`, `true`, `false`, `null`.

---

## 2. Hình dạng AST (cam kết)

Mọi nút có `type`, `line`, `column`. Vị trí của nút là vị trí **ký tự đầu tiên của token đầu tiên** của nút đó.

| Nút | Trường | Vị trí |
|---|---|---|
| `File` | `body: Stmt[]` | luôn `line: 1, column: 1` |
| `Assign` | `key: string`, `value: Value` | token khóa |
| `Block` | `key: string`, `body: Stmt[]` | token khóa |
| `Include` | `path: string` | từ khóa `include` |
| `Const` | `name: string`, `value: Value` | từ khóa `const` |
| `Number` | `value: number` | token số |
| `Bool` | `value: boolean` | token |
| `Null` | — | token |
| `String` | `parts: Part[]` | dấu nháy mở |
| `Array` | `items: Value[]` | dấu `[` |

`Part` của chuỗi, theo thứ tự xuất hiện, hai `Text` không bao giờ đứng cạnh nhau, `Text` rỗng không xuất hiện (chuỗi rỗng `""` có `parts: []`):
- `{ type: 'Text', value: string }` (chỉ `type` và `value`, không có vị trí);
- `{ type: 'Ref', path: string[], const: boolean, line, column }` — vị trí là ký tự `$` của `${`.
  - `${a.b.0}` → `path: ['a','b','0']`, `const: false`.
  - `${@region}` → `path: ['region']`, `const: true`; `${@lst.1}` → `path: ['lst','1']`, `const: true` (phần sau tên hằng là chỉ mục vào giá trị hằng).

Kết quả `ast` của `parse` là nút `File`. Các nút **không** có trường nào khác ngoài bảng trên.

---

## 3. Tầng 1a — `tokenize(source)` (`src/lexer.js`)

Trả `{ ok: true, tokens }` hoặc `{ ok: false, error }` với `error = { code, message, line, column }`. Lexer **không bao giờ ném** với đầu vào là chuỗi.
Token: `{ type, value, line, column }`; luôn kết thúc bằng một token `eof` (`value: null`, vị trí = ngay sau ký tự cuối, tức vị trí con trỏ khi hết đầu vào).

| `type` | `value` | Ghi chú |
|---|---|---|
| `ident` | tên | định danh không phải từ khóa |
| `keyword` | tên từ khóa | |
| `number` | số JS | |
| `string` | mảng `Part` (như mục 2) | |
| `punct` | một trong `=` `{` `}` `[` `]` `,` | |
| `eof` | `null` | |

Khoảng trắng (space, tab, xuống dòng) và chú thích bị bỏ, không sinh token. Chú thích: `#…` và `//…` đến hết dòng; `/* … */` (không lồng nhau, được trải nhiều dòng).

**Số.** Token số bắt đầu bằng chữ số hoặc `-`; nó là chuỗi liên tục **dài nhất** gồm các ký tự `[0-9A-Za-z_.+-]`. Chuỗi đó phải khớp
`-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?` toàn bộ, và giá trị phải hữu hạn; nếu không → `LEX_BAD_NUMBER` tại ký tự đầu.
Do đó `01`, `1.`, `.5` (là ký tự lạ), `-`, `1e`, `12abc`, `1-2`, `1e999` đều lỗi. `-0` cho giá trị `0` (không phải `-0`). Không có dấu `+` đứng đầu.

**Chuỗi.** Trong dấu nháy kép. Thoát: `\n \t \r \" \\ \/ \$ \uXXXX` (đúng 4 chữ số hex). `\$` cho ký tự `$` thường (nên `"\${a}"` là văn bản `${a}`, không phải tham chiếu).
Ký tự `$` không theo sau bởi `{` là ký tự thường. Nội suy `${…}`: nội dung giữa `${` và `}` phải khớp
`@?ident(.đoạn)*` với `đoạn` là `ident` hoặc số nguyên không âm không có số 0 đứng đầu (`0` được); không có khoảng trắng; đoạn đầu (sau `@` nếu có) phải là `ident`, không phải số.
Chuỗi không được chứa xuống dòng thật.

**Mã lỗi lexer** (vị trí ghi trong ngoặc):
- `LEX_UNEXPECTED_CHAR` — ký tự không thuộc ngôn ngữ, kể cả `/` đơn lẻ, chữ có dấu ngoài chuỗi/chú thích (ký tự đó).
- `LEX_UNTERMINATED_STRING` — hết dòng hoặc hết tệp trước dấu nháy đóng (dấu nháy **mở** của chuỗi).
- `LEX_UNTERMINATED_COMMENT` — `/*` không có `*/` (vị trí `/*`).
- `LEX_BAD_ESCAPE` — thoát không hợp lệ, gồm `\u` thiếu hex và `\` đứng trước xuống dòng (ký tự `\`).
- `LEX_BAD_NUMBER` — như trên (ký tự đầu của token số).
- `LEX_BAD_INTERPOLATION` — `${` không đóng được `}` trước dấu nháy đóng/xuống dòng/hết tệp, hoặc nội dung sai dạng, kể cả rỗng (ký tự `$`).

Lexer dừng ở **lỗi đầu tiên theo thứ tự đọc**. Khi một chuỗi vừa chưa đóng vừa có nội suy hỏng, lỗi nào gặp trước (đọc từ trái sang) được báo.

---

## 4. Tầng 1b — `parse` và `parseProject` (`src/parser.js`)

### `parse(source)`
Chạy `tokenize` **trọn vẹn trước**, rồi mới phân tích cú pháp: nếu lexer có lỗi, trả lỗi lexer (kể cả khi trước đó văn bản đã có lỗi cú pháp).
Trả `{ ok: true, ast }` (nút `File`) hoặc `{ ok: false, error }` với `error = { code, message, line, column }`. Không ném.

Văn phạm:

```
file    := stmt* EOF
block   := '{' stmt* '}'
stmt    := ident '=' value | ident block | 'include' string | 'const' ident '=' value
value   := number | string | 'true' | 'false' | 'null' | '[' (value (',' value)* ','?)? ']'
```

- `include` nhận một chuỗi **không có nội suy** (chỉ `Text`); `Include.path` là nối các `Text` (chuỗi rỗng `""` được phép, path = `""`).
- `const` chỉ hợp lệ ở cấp cao nhất của tệp (trong khối là lỗi, kể cả khi phần còn lại hợp lệ).
- `[,]`, `[1,,2]` là lỗi; `[]`, `[1,]` hợp lệ.

Mã lỗi (vị trí là token gây lỗi):
- `PARSE_UNEXPECTED_EOF` — hết tệp khi còn đợi thứ gì đó (khối/mảng chưa đóng, thiếu giá trị, thiếu `=`…). Vị trí là token `eof`.
- `PARSE_UNEXPECTED_TOKEN` — token khác với điều đang đợi (kể cả `}` thừa ở cấp cao nhất, từ khóa làm khóa, định danh làm giá trị, `a b`).
- `PARSE_BAD_INCLUDE` — `include` theo sau bởi chuỗi **có** nội suy (vị trí chuỗi). Nếu theo sau không phải chuỗi → `PARSE_UNEXPECTED_TOKEN` (hoặc `PARSE_UNEXPECTED_EOF`).
- `PARSE_CONST_NOT_TOP` — `const` trong khối (vị trí từ khóa `const`).

Lỗi cú pháp đầu tiên theo thứ tự đọc thì được báo.

### `parseProject(files, entry)`
`files` là đối tượng `{ [tênTệp]: văn bản }`. Chỉ phân tích các tệp **tới được** từ `entry` qua `include`, theo duyệt sâu tiền thứ tự:
phân tích `entry`; rồi lần lượt từng câu lệnh `include` của nó theo thứ tự xuất hiện trong văn bản (kể cả `include` nằm trong khối, theo thứ tự tài liệu); với mỗi đường dẫn có trong `files` và chưa phân tích thì phân tích nó rồi đi tiếp xuống các include của nó. Đường dẫn không có trong `files` thì bỏ qua (tầng 2 báo).

- Thành công: `{ ok: true, program }` với `program = { entry, files: { [tênTệp]: AST } }` — `files` chỉ chứa các tệp đã phân tích, **khóa theo thứ tự phân tích** (tiền thứ tự).
- Lỗi cú pháp/lexer ở một tệp: `{ ok: false, error }` với `error = { code, message, file, line, column }` — lỗi của tệp gặp **đầu tiên** theo thứ tự trên; dừng ngay.
- `entry` không có trong `files`: `{ ok: false, error: { code: 'PARSE_ENTRY_NOT_FOUND', message, file: entry, line: 1, column: 1 } }`.

---

## 5. Tầng 2 — `check(program, schema?)` (`src/check.js`)

Nhận `program` từ `parseProject`, trả **mảng** lỗi (rỗng = hợp lệ). Mỗi lỗi: `{ code, message, file, line, column }`. Không ném. Duyệt tệp tiền thứ tự theo include như mục 4, mỗi tệp một lần. Kiểm theo **ba pha liên tiếp; pha nào có lỗi thì trả lỗi của pha đó và dừng** (không chạy các pha sau).

### Pha A — cấu trúc theo từng tệp
Duyệt tệp theo thứ tự: bắt đầu từ `entry`; các `include` của tệp theo thứ tự tài liệu, đi xuống tệp chưa thăm (có trong `program.files`). Lỗi gom **theo tệp**, theo thứ tự thăm lần đầu (tiền thứ tự); trong một tệp sắp tăng dần theo `(line, column)`.

- `SEM_DUPLICATE_KEY` — hai câu lệnh `Assign`/`Block` cùng `key` trong **cùng một khối của cùng một tệp** (cấp cao nhất cũng là một khối). Báo tại lần xuất hiện thứ hai, thứ ba… (mỗi lần xuất hiện sau đều một lỗi). Một `Assign` và một `Block` cùng khóa cũng là trùng. Khóa giống nhau ở khối khác nhau, hay ở tệp khác nhau (kể cả include vào cùng khối) **không** phải trùng.
- `SEM_DUPLICATE_CONST` — hai `const` cùng `name` trong một tệp (tại lần sau).
- `SEM_INCLUDE_NOT_FOUND` — `include` trỏ tới tệp không có trong `program.files` (tại câu lệnh `include`).
- `SEM_INCLUDE_CYCLE` — `include` trỏ tới tệp đang nằm trên đường duyệt hiện tại (kể cả chính nó). Báo tại câu lệnh `include` đó, trong tệp chứa nó. Tệp được include lại sau khi đã thăm xong (không còn trên đường duyệt, kiểu hình thoi `a→b, a→c, b→d, c→d`) **không** phải vòng và không bị thăm lần hai.

### Pha B — tham chiếu
Chỉ chạy khi pha A không lỗi. Xét **mọi** `Ref` trong **mọi** chuỗi của mọi tệp tới được (kể cả chuỗi trong mảng, trong `const`, và chuỗi bị ghi đè — xem mục 6.1). Mỗi `Ref` sinh tối đa **một** lỗi, kiểm theo thứ tự dưới đây (dòng nào khớp trước thì dùng). Lỗi gom theo tệp (thứ tự mục 4), trong tệp sắp theo `(line, column)` của `Ref` (ký tự `$`), lỗi được báo **tại vị trí `Ref`** và `file` là tệp chứa chuỗi.

1. `SEM_CONST_CONFIG_REF` — `Ref` có `const: false` nằm trong giá trị của một `const` (hằng chỉ được tham chiếu hằng khác trong cùng tệp).
2. `SEM_UNDEFINED_REF` — đường dẫn không phân giải được (mục 6.1 quy tắc phân giải). `Ref` hằng: hằng phải được khai báo **ở bất kỳ đâu trong cùng tệp** (không cần khai báo trước chỗ dùng); hằng của tệp khác không thấy được.
3. `SEM_REF_CYCLE` — xem định nghĩa dưới.
4. `SEM_BAD_INTERPOLATION` — `Ref` nằm trong chuỗi **không** thuần tham chiếu (có `Text`, hoặc có từ hai `Ref` trở lên) mà giá trị đã đánh giá của đích là mảng hoặc đối tượng (chỉ số vô hướng — chuỗi, số, bool, null — được phép).

**Vòng tham chiếu.** Gọi *đích* của `Ref r` là nút giá trị mà `r` phân giải tới (một nút giá trị, một đối tượng đã hợp nhất, hoặc một mảng). Gọi `S(đích)` là tập mọi nút `String` nằm trong đích đó (chính nó nếu là chuỗi; mọi chuỗi bên trong mảng; mọi chuỗi bên trong đối tượng đã hợp nhất — chỉ tính định nghĩa **thắng**, không tính định nghĩa bị ghi đè). `r` thuộc chuỗi `s`. Từ `s` đi theo cạnh `s → S(đích của từng Ref phân giải được trong s)`. `r` bị `SEM_REF_CYCLE` nếu từ tập `S(đích của r)` đi theo các cạnh đó (đi được 0 hoặc nhiều bước) **tới được `s`**. Hệ quả: `a = "${a}"`, `a = "${b}"` + `b = "${a}"` (cả hai `Ref` đều lỗi), và `x { y = "${x}" }` (tham chiếu tới tổ tiên chứa chính nó) đều là vòng.

### Pha C — lược đồ
Chỉ chạy khi pha B không lỗi **và** có `schema`. Lược đồ là một đặc tả gốc (kiểu `object`) dạng:

```js
{ type?: 'string'|'number'|'integer'|'boolean'|'null'|'array'|'object'|'any',
  required?: boolean,        // chỉ có nghĩa khi đặc tả này là giá trị trong `fields` của cha
  enum?: [...],              // danh sách giá trị vô hướng cho phép (so sánh ===)
  fields?: { [khóa]: Spec }, // cho đối tượng
  closed?: boolean,          // đối tượng: khóa ngoài `fields` là lỗi
  items?: Spec }             // cho mảng: áp cho từng phần tử
```

Kiểm trên **giá trị đã đánh giá** của cấu hình đã hợp nhất (mục 6), duyệt theo thứ tự khóa của cấu hình hợp nhất (mục 6.2). Với mỗi cặp (giá trị, đặc tả):

1. Nếu có `type` khác `any` mà kiểu không khớp → `SEM_TYPE_MISMATCH`, **không kiểm sâu hơn** vào giá trị đó. Kiểu `number` nhận mọi số (kể cả nguyên); `integer` nhận số nguyên; `null` chỉ nhận `null`; `array`, `object` không nhận nhau, không nhận `null`.
2. Nếu có `enum` và giá trị là vô hướng không thuộc `enum` → `SEM_NOT_IN_ENUM` (và không kiểm sâu hơn).
3. Nếu giá trị là đối tượng và có `fields`: trước hết, theo thứ tự khóa trong `fields`, mỗi khóa có `required: true` mà đối tượng không có → `SEM_MISSING_REQUIRED` (tất cả báo tại vị trí của đối tượng); sau đó theo thứ tự khóa của đối tượng: khóa có trong `fields` thì đệ quy; khóa không có và `closed: true` → `SEM_UNKNOWN_KEY` (tại vị trí **khóa**).
4. Nếu giá trị là mảng và có `items`: đệ quy từng phần tử theo chỉ số.

Vị trí lỗi (`file`, `line`, `column`):
- giá trị là `Assign`: vị trí **nút giá trị** (số, chuỗi, `[`…), không phải khóa; phần tử mảng: vị trí phần tử;
- giá trị là đối tượng: vị trí của `Block` đã **khởi tạo** đối tượng đó (xem 6.2); gốc: tệp `entry`, `1:1`;
- giá trị đến từ chuỗi thuần tham chiếu `"${x}"`: vị trí **chuỗi đó** (cho cả giá trị và mọi thứ bên trong nó);
- `SEM_UNKNOWN_KEY`: vị trí `Assign`/`Block` thắng của khóa đó (token khóa).

---

## 6. Tầng 3 — `evaluate(program)` (`src/evaluate.js`)

Nhận `program` mà `check(program)` trả `[]` (hành vi với chương trình có lỗi là không xác định). Trả giá trị JSON thuần (đối tượng thường, mảng, chuỗi, số, bool, `null`) — không có `undefined`, không chia sẻ tham chiếu giữa các phần của kết quả (hai `${x}` trỏ tới mảng cho hai mảng khác nhau).

### 6.1 Hợp nhất và phân giải
Bắt đầu từ đối tượng gốc rỗng, xử lý câu lệnh của `entry` **theo thứ tự**:
- `Assign` — đặt khóa bằng giá trị này (ghi đè nếu khóa đã có, bất kể loại giá trị cũ).
- `Block` — nếu khóa đã có **và là đối tượng**: trộn sâu thân khối vào đối tượng đó; ngược lại tạo đối tượng mới (thay thế giá trị cũ nếu có) rồi xử lý thân khối vào đó.
- `Include` — xử lý các câu lệnh của tệp được include **ngay tại đây**, vào đối tượng hiện hành (cùng quy tắc). Hậu quả: khóa khai báo **sau** `include` ghi đè khóa từ tệp được include; `include` sau ghi đè `include` trước. Mảng không bao giờ được trộn: mảng sau thay hẳn mảng trước.
- `Const` — không vào kết quả.

Mọi tham chiếu `${…}` được đánh giá **sau khi hợp nhất xong toàn bộ** (kể cả tham chiếu tới khóa khai báo muộn hơn hoặc bị include ghi đè): tham chiếu thấy **giá trị cuối cùng** của đường dẫn.

Phân giải đường dẫn `a.b.c` của `Ref` cấu hình: bắt đầu từ gốc cấu hình hợp nhất; mỗi đoạn: nếu đang ở đối tượng thì lấy khóa (chỉ khóa riêng, chính xác từng ký tự); nếu đang ở **mảng** thì đoạn phải là chỉ số nguyên không âm không có số 0 đứng đầu và nằm trong mảng. Đang ở giá trị vô hướng, **hoặc ở chuỗi** (kể cả chuỗi thuần tham chiếu — đường dẫn không đi xuyên qua chuỗi) mà còn đoạn → không tồn tại. Đích có thể là bất kỳ giá trị nào (kể cả đối tượng, mảng, `null`: `a = null` rồi `${a}` là tồn tại).
`Ref` hằng `${@c.x}`: lấy hằng `c` của **tệp chứa chuỗi** rồi đi tiếp các đoạn sau như trên (chỉ qua mảng).

### 6.2 Thứ tự khóa và vị trí đối tượng
- Thứ tự khóa của mỗi đối tượng là thứ tự **xuất hiện lần đầu** trong quá trình hợp nhất; ghi đè một khóa đã có không đổi vị trí của nó (khóa bị thay bằng giá trị khác vẫn đứng chỗ cũ).
- Vị trí một đối tượng (cho mục 5, pha C) là vị trí của `Block` đã tạo ra nó: khối đầu tiên kể từ lần gần nhất khóa đó được đặt bằng một giá trị khác một khối (hoặc chưa từng có).

### 6.3 Đánh giá chuỗi
- `parts: []` → `""`.
- Chuỗi **chỉ gồm đúng một `Ref`** (không `Text`, không `Ref` nào khác) → **giá trị gốc của đích**, giữ nguyên kiểu (số, bool, `null`, mảng, đối tượng), đã đánh giá đệ quy.
- Ngược lại → nối các phần: `Text` nguyên văn; `Ref` thành chuỗi: chuỗi → chính nó; số → `JSON.stringify(số)` (`1.50` → `1.5`, `1e21` → `1e+21`); `true`/`false` → `true`/`false`; `null` → `null`.
- Nội suy lồng: nếu đích là chuỗi có nội suy thì nó được đánh giá trước (đệ quy). Mảng thì đánh giá từng phần tử.

---

## 7. Tầng 4 — `diff` (`src/diff.js`)

So sánh hai giá trị JSON `a` (cũ) và `b` (mới), đầu ra của `evaluate` hoặc JSON bất kỳ.

### JSON Pointer (RFC 6901)
- `escapePointer(seg)`: `~` → `~0` rồi `/` → `~1`. Nhận chuỗi hoặc số (`String(seg)`).
- `unescapePointer(seg)`: `~1` → `/`, rồi `~0` → `~`. `~` đứng cuối hoặc theo sau bởi ký tự khác `0`/`1` → ném `Error` có `code: 'DIFF_BAD_POINTER'`.
- `parsePointer(pointer)`: `""` → `[]`; ngược lại phải bắt đầu bằng `/`, tách theo `/` (bỏ phần rỗng đầu) rồi `unescapePointer` từng đoạn; `/` → `['']`; không bắt đầu bằng `/` hoặc có escape sai → ném `DIFF_BAD_POINTER`.
- `formatPointer(segments)`: mỗi đoạn thành `/` + `escapePointer(đoạn)`, nối lại; `[]` → `""`.

### `diff(a, b)` → mảng thao tác
Mỗi thao tác là đối tượng có **đúng** các khóa sau, **theo thứ tự khóa này**:
- `{ op: 'add', path, value }`
- `{ op: 'remove', path, oldValue }`
- `{ op: 'replace', path, oldValue, value }`

`path` là JSON Pointer. `value`/`oldValue` là bản sao sâu (đổi kết quả không ảnh hưởng đầu vào). Thuật toán đệ quy `(x, y, path)`:
1. Hai đối tượng (không phải mảng/`null`): gộp khóa của cả hai, **sắp tăng dần theo thứ tự đơn vị mã UTF-16** (`Array.prototype.sort()` mặc định). Với mỗi khóa: chỉ có ở `x` → `remove`; chỉ có ở `y` → `add`; có ở cả hai → đệ quy.
2. Hai mảng: so theo **chỉ số**: với `i` từ 0 tới `min(độ dài)-1` đệ quy; rồi các phần tử thừa của `y` → `add` với chỉ số tăng dần (`/arr/3`, `/arr/4`…; không dùng `-`); rồi các phần tử thừa của `x` → `remove` với chỉ số **giảm dần**.
3. Còn lại (khác loại, hoặc vô hướng khác nhau; `null` là loại riêng; mảng và đối tượng là hai loại khác nhau) → một `replace` tại `path` (gốc có `path: ""`). Vô hướng bằng nhau (`===`) thì không có gì.

Thao tác được xuất theo thứ tự duyệt ở trên (đối tượng theo khóa đã sắp, mảng theo chỉ số), không sắp lại toàn cục. Kết quả của hai đầu vào bằng nhau là `[]`.

### Khác
- `applyDiff(doc, ops)` → bản sao của `doc` sau khi áp lần lượt các thao tác (không đổi `doc`). `add` vào mảng chèn tại chỉ số (`≤` độ dài); `add` vào đối tượng khóa đã có, hoặc `remove`/`replace` khóa/chỉ số không có → ném `Error` có `code: 'DIFF_APPLY_FAILED'`. `path: ""` với `replace`/`add` thay cả gốc. Quy tắc bất biến: `applyDiff(a, diff(a, b))` bằng sâu `b`.
- `formatText(ops)` → chuỗi, mỗi thao tác một dòng, nối bằng `\n`, **không** có `\n` cuối:
  - `add` → `+ <path> = <JSON(value)>`
  - `remove` → `- <path> = <JSON(oldValue)>`
  - `replace` → `~ <path>: <JSON(oldValue)> -> <JSON(value)>`

  `JSON(x)` là `JSON.stringify(x)` gọn (không khoảng trắng thừa). Với `path: ""` hiển thị `(root)`. Không có thao tác → chuỗi `Không có thay đổi`.
- `formatJson(ops)` → `JSON.stringify(ops, null, 2)` (mảng rỗng → `[]`).
- `summarize(ops)` → `{ add, remove, replace }` số thao tác mỗi loại.

---

## 8. `compile(files, entry, schema?)` (`src/index.js`)

Gộp tầng 1–3:
1. `parseProject` lỗi → `{ ok: false, stage: 'parse', errors: [error] }`.
2. `check` có lỗi → `{ ok: false, stage: 'check', errors }` (đúng mảng `check` trả).
3. Ngược lại → `{ ok: true, config: evaluate(program) }`.

---

## 9. Ví dụ đầy đủ

`main`:
```
const env = "prod"
name = "svc-${@env}"
ports = [80, 443]
http { port = "${ports.0}" }
https { port = "${ports.1}" , }      # lỗi: dấu phẩy thừa → PARSE_UNEXPECTED_TOKEN tại dòng 5, cột 29
```
Sửa bỏ dấu phẩy: `evaluate` cho
`{ "name": "svc-prod", "ports": [80, 443], "http": { "port": 80 }, "https": { "port": 443 } }`.

Include và ghi đè (`files = { main, 'base.cfg' }`):
```
# base.cfg
server { host = "a"  port = 1 }
mode = "dev"

# main
include "base.cfg"
server { port = 2 }      # trộn sâu: host giữ "a"
mode = "prod"            # sau include → ghi đè
```
→ `{ "server": { "host": "a", "port": 2 }, "mode": "prod" }` (thứ tự khóa: `server`, `mode`).

`diff({a:{b:[1,2,3]},"x/y":1}, {a:{b:[1,5]},"x/y":2,c:null})` →
```
[ {op:'replace', path:'/a/b/1', oldValue:2, value:5},
  {op:'remove',  path:'/a/b/2', oldValue:3},
  {op:'add',     path:'/c',     value:null},
  {op:'replace', path:'/x~1y',  oldValue:1, value:2} ]
```
(khóa gốc sắp tăng dần: `a`, `c`, `x/y`.)
