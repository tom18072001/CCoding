# logq — lọc và tổng hợp log từ dòng lệnh

Node thuần (CommonJS), không thư viện ngoài. Ba module + CLI:

- `src/parse.js` → `parseLine(line)`
- `src/query.js` → `compile(query)`, lớp `QuerySyntaxError`
- `src/agg.js` → `aggregate(records, spec)`
- `src/index.js` (đã có) export lại cả ba · `bin/logq.js` là CLI

## 1. `parseLine(line) → { ok: true, record } | { ok: false }`

- Bỏ `\r` cuối dòng. Dòng rỗng hoặc chỉ có khoảng trắng → `{ ok: false }`.
- **JSON**: ký tự khác khoảng trắng đầu tiên là `{` → `JSON.parse` cả dòng. Lỗi cú pháp, hoặc kết quả không phải đối tượng → `{ ok: false }`. Đối tượng lồng nhau được **làm phẳng** bằng dấu chấm: `{"http":{"status":500,"req":{"m":"GET"}}}` → `{ "http.status": 500, "http.req.m": "GET" }`. Mảng giữ nguyên làm giá trị (không làm phẳng). Đối tượng rỗng lồng bên trong bị bỏ.
- **logfmt** (mọi trường hợp còn lại): các cặp `key=value` cách nhau bởi khoảng trắng (một hoặc nhiều dấu cách/tab).
  - `key` khớp `[A-Za-z_][A-Za-z0-9_.-]*`.
  - `value` trần: chuỗi ký tự không có khoảng trắng và không có `"`; có thể rỗng (`key=` → chuỗi rỗng). Giá trị trần khớp `^-?\d+(\.\d+)?$` → số; `true`/`false` → boolean; `null` → `null`; còn lại → chuỗi.
  - `value` trong ngoặc kép: `"…"` với thoát `\"`, `\\`, `\n`, `\t` (thoát khác giữ nguyên cả `\` và ký tự). Luôn là chuỗi (kể cả `"42"`). Sau ngoặc kép đóng phải là khoảng trắng hoặc hết dòng.
  - Bất kỳ phần nào không đúng dạng (từ không có `=`, key sai dạng, ngoặc kép không đóng, ký tự liền sau ngoặc kép đóng…) → cả dòng `{ ok: false }`.
  - Key trùng: giá trị sau thắng.
- **Thời gian**: sau khi phân tích, nếu bản ghi có trường `@timestamp`, `ts` hoặc `time` (xét theo thứ tự này, lấy trường **đầu tiên có mặt**) là chuỗi ISO 8601 có ngày và giờ mà `Date.parse` hiểu được → thêm `record["@t"]` = số mili giây epoch. Trường đầu tiên có mặt mà không phân tích được → không có `@t` (không xét trường sau).

## 2. `compile(query) → (record) => boolean`

Ngữ pháp (khoảng trắng phân tách token; `(` và `)` luôn là token riêng):

```
expr    := orExpr
orExpr  := andExpr ( "OR" andExpr )*
andExpr := notExpr ( ["AND"] notExpr )*          ← hai điều kiện đứng cạnh nhau = AND ngầm
notExpr := "NOT" notExpr | primary
primary := "(" expr ")" | term
term    := FIELD ":" VALUE | FIELD CMP NUMBER | "_exists_:" FIELD | WORD | QUOTED
```

- `AND`, `OR`, `NOT` chỉ là từ khóa khi viết **HOA** và đứng thành token riêng; `and`/`or` thường là từ tìm kiếm. Ưu tiên: `NOT` > `AND` > `OR`.
- `FIELD` khớp `[A-Za-z_@][A-Za-z0-9_.@-]*`. `CMP` ∈ `>=`, `<=`, `>`, `<` (không có khoảng trắng hai bên: `status>=500`). `NUMBER` khớp `-?\d+(\.\d+)?`.
- `QUOTED` là chuỗi trong `"…"` (thoát `\"`, `\\`), có thể chứa khoảng trắng và ngoặc. Có thể đứng sau `FIELD:` (`msg:"connection reset"`) hoặc đứng một mình.
- Ngữ nghĩa:
  - `field:value` — bản ghi có trường `field` (khác `null`) và `String(giá trị)` khớp `value` **không phân biệt hoa/thường**, khớp **toàn bộ** chuỗi. Với value trần: `*` = chuỗi bất kỳ (kể cả rỗng), `?` = đúng một ký tự. Với value trong ngoặc kép: so khớp chính xác (không có ký tự đại diện). Ví dụ `status:500` khớp số `500` và chuỗi `"500"`; `path:/api/*` khớp `/api/users`.
  - `field CMP n` — giá trị là số, hoặc chuỗi khớp `^-?\d+(\.\d+)?$` (đổi sang số); khác đi (thiếu, boolean, chuỗi khác) → `false`.
  - `_exists_:field` — trường có mặt và khác `null`.
  - `WORD`/`QUOTED` đứng một mình — tìm chuỗi con không phân biệt hoa/thường trong trường `msg`, hoặc `message` nếu không có `msg`; không có cả hai → `false`. Không có ký tự đại diện. `WORD` là token không phải từ khóa, không phải `(`/`)`, không chứa `:` và không phải dạng so sánh.
  - Truy vấn rỗng (hoặc chỉ khoảng trắng) → khớp mọi bản ghi.
- **Lỗi cú pháp** → ném `QuerySyntaxError` (kế thừa `Error`, `name = "QuerySyntaxError"`), có thuộc tính `position` (chỉ số ký tự, đếm từ 0) và `message` bắt đầu bằng `syntax error at position <position>`. Vị trí:
  - thiếu `)` → `query.length`; thừa `)` → vị trí của `)` đó; `()` rỗng → vị trí của `)`;
  - thiếu toán hạng sau `AND`/`OR`/`NOT` ở cuối → `query.length`; `AND`/`OR` ở đầu biểu thức hoặc ngay sau `(` hoặc sau một `AND`/`OR`/`NOT` khác → vị trí của từ khóa đó;
  - so sánh mà vế phải không phải `NUMBER` (`status>=abc`, `status>=`) → vị trí ngay sau toán tử so sánh;
  - `field:` không có giá trị → vị trí ngay sau `:`;
  - ngoặc kép không đóng → vị trí của `"` mở.

## 3. `aggregate(records, spec) → object`

`spec` là chuỗi (khoảng trắng thừa được bỏ qua, từ khóa viết thường):

| spec | kết quả |
|---|---|
| `count` | `{ type: "count", value: n }` |
| `count by <f>` | `{ type: "count_by", field: f, buckets: [{ key, count }] }` — bỏ bản ghi thiếu `f` hoặc `null`; `key` giữ nguyên kiểu giá trị (số vẫn là số); sắp `count` giảm dần, hòa thì theo `String(key)` tăng dần (so sánh chuỗi thường `<`) |
| `top <n> <f>` | như `count by` nhưng `type: "top"`, chỉ `n` bucket đầu (`n` nguyên ≥ 1) |
| `sum\|avg\|min\|max <f>` | `{ type, field, value }` — trên các giá trị số (số, hoặc chuỗi khớp `^-?\d+(\.\d+)?$`); không có giá trị nào → `value: null`; `avg` làm tròn 4 chữ số thập phân (`Math.round(x * 1e4) / 1e4`) |
| `p50\|p90\|p95\|p99 <f>` | `{ type: "p95", field, value }` — percentile **nearest-rank**: sắp tăng dần, hạng = `Math.ceil(p / 100 × n)`, giá trị = phần tử thứ hạng đó (đếm từ 1); không có giá trị → `null` |
| `histogram <k><u>` | `u` ∈ `s`, `m`, `h`, `d`, `k` nguyên ≥ 1 — `{ type: "histogram", interval: "<k><u>", buckets: [{ key, count }] }`: chỉ bản ghi có `@t`; mốc = `Math.floor(@t / khoảng) × khoảng`, `key` = `new Date(mốc).toISOString()`; sắp theo thời gian tăng dần và **điền các mốc trống** (count 0) giữa mốc đầu và mốc cuối; không có bản ghi nào → `buckets: []` |

Spec không hợp lệ → ném `Error` có message bắt đầu bằng `invalid aggregation`.

## 4. CLI `bin/logq.js`

```
node bin/logq.js [--query <q>] [--agg <spec>] [--format json|table] [--stats] [file …]
```

- Đọc lần lượt các tệp (hoặc stdin nếu không có tệp, hoặc tệp là `-`), từng dòng, `parseLine`; dòng `ok: false` là dòng lỗi (bỏ qua, đếm). Tùy chọn có thể đứng trước hoặc sau tệp; tùy chọn lạ → lỗi dùng sai (mã 2).
- Không có `--agg`: in mỗi bản ghi khớp một dòng JSON (`JSON.stringify` bản ghi **không có `@t`**), theo thứ tự đọc. `--format table` mà không có `--agg` → lỗi dùng sai (mã 2).
- Có `--agg`: tổng hợp trên các bản ghi khớp. `--format json` (mặc định) → một dòng `JSON.stringify(kết quả)`. `--format table`:
  - `count`/`sum`/`avg`/`min`/`max`/`pXX` → in đúng một dòng là giá trị (`null` in là `null`);
  - `count_by`/`top`/`histogram` → dòng đầu `key  count`, sau đó mỗi bucket một dòng: cột key căn trái, đệm dấu cách tới độ rộng lớn nhất của cột key (tính cả chữ `key`), rồi **hai dấu cách**, rồi count.
- `--stats` → in ra **stderr** một dòng `lines=<tổng số dòng đọc, kể cả dòng rỗng> matched=<số bản ghi khớp> malformed=<số dòng lỗi>`.
- Mã thoát: `0` thành công (kể cả không khớp gì); `2` lỗi cú pháp truy vấn (stderr chứa message của `QuerySyntaxError`), spec tổng hợp sai, hoặc dùng sai tùy chọn; `1` không đọc được tệp (stderr chứa `cannot read <tệp>`). Khi lỗi, stdout không in gì.
- Mỗi dòng xuất kết thúc bằng `\n`.
