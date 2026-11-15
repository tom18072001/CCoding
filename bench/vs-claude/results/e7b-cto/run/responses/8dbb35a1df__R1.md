## Tóm tắt
Chưa nghiệm thu. Tôi đọc mã `src/parse.js`, `src/query.js`, `src/agg.js` và `bin/logq.js` và đối chiếu từng quy tắc với `SPEC.md`. Không thấy chỗ nào sai rõ ràng, và `npm test` do CCoding chạy là 36/36 xanh. Tôi không chạy được CLI thật, vì hook chặn lệnh có chuyển hướng ghi tệp. Vì vậy hành vi CLI thật và kiểm tra thực nghiệm vị trí lỗi mới chỉ dừng ở mức đọc mã, chưa có bằng chứng chạy. Còn một điểm lệch nhỏ với đặc tả: tùy chọn một gạch lạ như `-x` bị coi là tên tệp, nên ra mã 1 thay vì 2.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh, có test cho các module | Đạt | Báo cáo CCoding sau thực thi: exit 0, 36 pass, 0 fail. Có `test/{parse,query,agg,cli}.test.js`. Baseline trước khi sửa là exit 1. |
| `parseLine` đúng đặc tả (JSON làm phẳng, logfmt, thoát, key trùng, `@t` lấy trường đầu tiên có mặt) | Đạt (đọc mã) | `src/parse.js:12-23` làm phẳng và bỏ object rỗng. `:25-84` xử lý logfmt, thoát và kiểm tra ký tự sau ngoặc kép đóng. `:86-97` chọn trường thời gian đầu tiên có mặt rồi `return`. |
| `compile`: ngữ pháp, ưu tiên NOT > AND > OR, AND ngầm, từ khóa chỉ khi viết HOA, ký tự đại diện, so sánh số | Đạt (đọc mã) | `src/query.js:150-210` đúng thứ tự ưu tiên và AND ngầm. `:72-80` xử lý `*` và `?`. `:110-130` xử lý so sánh. `:88-101` xử lý `msg` rồi `message`. |
| Vị trí `QuerySyntaxError` đúng từng trường hợp | Đạt (đọc mã) | Đã dò từng trường hợp trong `query.js`: thiếu `)` và thiếu toán hạng cuối → `q.length` (`:191,196`). Thừa `)` và `()` → vị trí `)` (`:192,208`). `AND`/`OR` đặt sai chỗ → vị trí từ khóa (`:200`). So sánh sai → ngay sau toán tử (`:116`). `field:` rỗng → sau `:` (`:136`). Ngoặc kép không đóng → vị trí `"` mở (`:33`). Chưa chạy thật. |
| `aggregate`: các loại spec, thứ tự bucket, nearest-rank, histogram điền mốc trống, lỗi `invalid aggregation` | Đạt (đọc mã) | `src/agg.js:15-26` sắp bucket giảm dần theo count rồi tăng dần theo `String(key)`. `:70-76` dùng `Math.ceil(p/100×n)`. `:77-95` điền mốc trống và trả `[]` khi không có bản ghi. `:7-9` tạo lỗi có message `invalid aggregation`. |
| CLI: mã thoát 0/1/2, `--stats` ra stderr, định dạng table, stdout rỗng khi lỗi | Chưa kiểm được bằng chạy thật | Đọc `bin/logq.js`: lỗi truy vấn và spec → 2 (`:59-61,91`). Không đọc được tệp → 1 và có `cannot read` (`:71-72`). `--format table` thiếu `--agg` → 2 (`:31`). Table căn cột ở `:42-49`. Stats ở `:94`. Tôi không chạy được CLI để xác nhận. Điểm lệch: `-x` đi vào danh sách tệp (`:15`), nên ra mã 1 thay vì 2. |
| Không thêm thư viện ngoài | Đạt | `package.json` không có dependency. Các `require` trong `src` và `bin` chỉ gồm `fs` và `../src/index.js`. |

## Rủi ro & việc còn mở
- Chưa có bằng chứng chạy CLI thật với stdin, nhiều tệp, và table với `null`. Test CLI nội bộ có thể chưa phủ hết các trường hợp trên.
- Tùy chọn một gạch lạ (`-x`) bị coi là tên tệp, nên ra mã 1 thay vì 2. Mức độ thấp, nhưng bộ nghiệm thu ẩn có thể kiểm.
- `src/parse.js:5` (`ISO_RE`) bắt buộc có chữ `T`. Chuỗi ngày giờ dạng `2024-01-01 10:00:00` sẽ không có `@t`. Đặc tả nói "ISO 8601 có ngày và giờ" nên chưa rõ có phải lỗi không.
- `bin/logq.js:95` dùng `fs.writeSync(1, …)` cho toàn bộ đầu ra. Với pipe và đầu ra lớn có thể gặp `EAGAIN`.

## Việc tiếp theo
- **Chạy kiểm thử CLI thật** · chạy `bin/logq.js` với stdin, nhiều tệp, `-`, các mã thoát 0/1/2, `--stats`, table với `null`, và các vị trí lỗi truy vấn bằng script ngoài hook chặn · dev (`@qa-tester`).
- **Sửa tùy chọn một gạch lạ** · coi `-x` (khác `-`) là tùy chọn lạ, ra mã 2, kèm test · dev (`@senior-swe`), cần giám đốc xác nhận cách hiểu đặc tả.
