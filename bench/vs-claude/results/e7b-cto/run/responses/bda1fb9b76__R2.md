## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (11/11, do CCoding tự chạy), không thêm thư viện ngoài, và gần hết các quy tắc trong SPEC đã được cài đúng. Nhưng phép tổng hợp `max` cho **kết quả sai**: nó trả về giá trị nhỏ nhất thay vì lớn nhất. Đây là quy tắc ở mục §3 của SPEC, và bộ nghiệm thu ẩn sẽ kiểm nó qua cả API lẫn CLI. Test hiện có chỉ kiểm `max` trên trường không tồn tại (kết quả `null`), nên không bắt được lỗi.

Hook của CCoding chặn vai trò CTO chạy `node`/`npm`. Vì vậy mọi kết luận dưới đây (trừ `npm test`) đến từ việc đọc mã và tự lần từng bước bằng tay, không có lần chạy thật nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh | Đạt | Mục "Lệnh kiểm tra của dự án" (CCoding tự chạy): exit 0, pass 11, fail 0 |
| Không thêm thư viện ngoài | Đạt | `package.json` không có `dependencies`. Mã nguồn chỉ `require('fs')` và các module trong `src` |
| `parseLine` đúng §1 (JSON làm phẳng, logfmt, thoát ký tự, `@t`) | Đạt (đọc mã) | `src/parse.js`: hàm `flatten` bỏ object rỗng và giữ nguyên mảng. Quy tắc giá trị trần/số/bool/null đúng. Quy tắc thoát ký tự đúng (thoát lạ giữ nguyên cả `\`). Sau ngoặc kép đóng bắt buộc là khoảng trắng. `addTime` chỉ xét trường **đầu tiên có mặt** |
| `compile` đúng ngữ pháp, ngữ nghĩa và vị trí lỗi §2 | Đạt (đọc mã) | `src/query.js`: đã lần tay các vị trí lỗi `a AND`, `(a`, `a)`, `()`, `AND a`, `a OR OR b`, `NOT AND a`, `status>=`, `msg:`, `"abc` không đóng, `msg:"abc` không đóng; tất cả khớp SPEC. Ký tự đại diện `*`/`?` và so khớp không phân biệt hoa/thường đúng. Các ca này có test ở `test/logq.test.js:40-80` |
| `aggregate` đúng §3 cho mọi spec | **Không** | Ở `src/agg.js`, nhánh `max` dùng `v.reduce((a, b) => (!(b > a) ? b : a))`. Lần tay với [3,10,1]: (3,10) giữ 3, (3,1) chọn 1, kết quả là **1** (giá trị nhỏ nhất). `count by`/`top` (thứ tự và kiểu key), `sum`, `avg`, `min`, `pXX` nearest-rank, `histogram` có điền mốc trống, và lỗi `invalid aggregation` đều đúng khi đọc mã |
| CLI đúng §4 (đầu ra, table, `--stats`, mã thoát 0/1/2, stdout rỗng khi lỗi) | Không (vì kéo theo lỗi trên) | `bin/logq.js`: các nhánh tùy chọn và mã thoát đúng (spec tổng hợp được kiểm trước khi đọc tệp, nên lỗi spec ra mã 2 chứ không phải 1). Table căn cột đúng, bỏ `@t` khi in, dòng `--stats` đúng. Nhưng `--agg "max f"` in ra giá trị nhỏ nhất |
| Test bao phủ các quy tắc của module | Không | `test/logq.test.js:95` chỉ kiểm `max zz` → `null`. Chưa có test `max`/`min` trên dữ liệu thật |

## Rủi ro & việc còn mở
- **Cao:** `max` sai, sẽ trượt bộ nghiệm thu ẩn ở cả API và CLI.
- **Thấp:** `parse.js` chỉ nhận chuỗi thời gian khớp `YYYY-MM-DDTHH:MM`, tức là có chữ `T`. Các chuỗi như `2024-01-01 10:00:00` (dùng dấu cách) bị bỏ qua. SPEC nói "ISO 8601 có ngày và giờ" nên cách hiểu này chấp nhận được, nhưng vẫn là một giả định cần lưu ý.
- **Quy trình:** cổng chất lượng đã bỏ qua review vì "lệnh xanh", trong khi test không đủ sâu để phát hiện lỗi logic. Không có lần chạy CLI thật nào ngoài các test có sẵn.

## Việc tiếp theo
- **Sửa `max` trong aggregate và bổ sung test.** Phạm vi: `src/agg.js` và `test/logq.test.js`. Người làm: `@senior-swe` (Phòng Phát triển). Xong khi `max` trả giá trị lớn nhất, có test `max`/`min` trên dữ liệu trộn số và chuỗi số (qua cả API và CLI `--format table`), và `npm test` xanh.
