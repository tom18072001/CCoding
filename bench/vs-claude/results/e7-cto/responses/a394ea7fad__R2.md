## Tóm tắt
**Đạt, nghiệm thu.** `detectBursts` trong `src/alert.js` làm đúng mọi yêu cầu bắt buộc của đề bài. Bằng chứng gồm hai phần: lần chạy `npm test` do CCoding tự chạy (exit 0, pass 1/1) và việc tôi đọc mã theo từng quy tắc của đề bài. Hook chặn lệnh chạy nên tôi không tự chạy được thử nghiệm biên nào, các kết luận về trường hợp biên đều dựa trên đọc mã. Có một điểm báo cáo nói sai: báo cáo ghi "kèm test", nhưng diff chỉ sửa `src/alert.js` và không thêm test nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Bộ test hiển thị chạy xanh | Đạt | CCoding tự chạy `npm test`: trước khi sửa exit 1, sau khi sửa exit 0 (pass 1, fail 0) |
| Mỗi host xét riêng và chỉ tính status 500–599 | Đạt | `src/alert.js`: lọc `e.status >= 500 && e.status <= 599`, rồi gom thời điểm theo `host` vào `Map` |
| Cửa sổ nửa mở `(ts - windowMs, ts]`, ts cùng giá trị xử lý theo thứ tự đầu vào và cộng dần | Đạt (đọc mã) | `while (times[start] <= ts - windowMs) start++` loại đúng mốc biên. `count = i - start + 1` chỉ tính các sự kiện đã xử lý. Phép sort ổn định trên bản sao giữ nguyên thứ tự đầu vào khi ts bằng nhau |
| Cooldown chặn khi `ts < alert.ts + cooldownMs`; sự kiện trong cooldown vẫn được đếm; mặc định `cooldownMs = windowMs` | Đạt (đọc mã) | Chỉ báo khi `ts >= lastAlert + cooldownMs`. Con trỏ cửa sổ vẫn chạy với mọi sự kiện. `opts.cooldownMs ?? windowMs` cho đúng giá trị mặc định |
| Đầu ra `{host, ts, count}` xếp theo ts rồi host tăng dần; không sửa đầu vào; giữ nguyên ES export | Đạt (đọc mã) | Sort cuối dùng `a.ts - b.ts` rồi mới so `host`. Chỉ sort trên bản sao `[...events]`, không ghi vào phần tử nào. `export function detectBursts` được giữ nguyên |

## Rủi ro & việc còn mở
- **Thiếu test hồi quy (trung bình):** chỉ có một test cơ bản (`test/basic.test.js`). Các trường hợp biên của cửa sổ, cooldown, ts trùng nhau, nhiều host và kiểm tra không sửa đầu vào chưa được test nào khoá lại. Báo cáo ghi "kèm test" là không khớp với diff.
- **Chưa chạy thử trường hợp biên (thấp):** kết luận ở các dòng ghi "đọc mã" chưa có lần chạy thật xác nhận.
- **Đầu vào lạ (thấp):** `cooldownMs: null` sẽ rơi về giá trị mặc định do `??`. Mã không kiểm tra `ts` là NaN hay `status` là chuỗi. Đề bài không yêu cầu xử lý các trường hợp này.

## Việc tiếp theo
- **Bổ sung test biên cho detectBursts** · thêm test vào `test/` cho các trường hợp: mốc biên `ts - windowMs` không được tính, cooldown đúng tại `alert.ts + cooldownMs`, ts trùng nhau, nhiều host xếp theo ts rồi host, đầu vào chưa sắp xếp có lẫn non-5xx, đầu vào không bị sửa, mảng rỗng · giao cho `@senior-swe` (phòng dev) · xong khi `npm test` xanh với các case mới.
