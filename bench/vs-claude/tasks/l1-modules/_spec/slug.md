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
