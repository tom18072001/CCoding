## Tóm tắt
Tôi đã đọc `src/alert.js` và logic khớp đề bài ở mọi điểm tôi kiểm được. `npm test` chuyển từ đỏ sang xanh theo log CCoding. Tôi đề nghị nghiệm thu. Điều kiện kèm theo là bộ test hiển thị chỉ có 1 ca. Các biên khó (cooldown, cửa sổ nửa mở, ts bằng nhau) mới được kiểm bằng đọc mã, chưa có test chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh sau khi sửa | Đạt | Log CCoding: baseline exit 1 (fail 1), sau thực thi exit 0 (pass 1, fail 0). |
| Chỉ tính 5xx (500–599), tách theo host | Đạt | `src/alert.js:9-12` lọc status và gom theo `Map` host. `src/alert.js:16` xử lý từng host riêng. |
| Cửa sổ nửa mở `(ts-windowMs, ts]` và alert khi count >= threshold | Đạt (đọc mã) | `src/alert.js:21` bỏ các event có `ts <= ts-windowMs`. `src/alert.js:22-23` tính count rồi so với threshold. |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`, event trong cooldown vẫn được đếm. Mặc định `cooldownMs = windowMs` | Đạt (đọc mã) | `src/alert.js:4` đặt mặc định. `src/alert.js:23` kiểm `ts >= lastAlert + cooldownMs`. Con trỏ `start` không bị đặt lại khi cooldown. |
| Input chưa sắp xếp, `ts` bằng nhau giữ thứ tự input, không mutate input | Đạt (đọc mã) | `src/alert.js:8` sort trên bản sao `[...events]`. Sort ổn định giữ thứ tự input với `ts` bằng nhau. |
| Kết quả sắp theo `ts` rồi `host` tăng dần, dạng `{host, ts, count}` | Đạt (đọc mã) | `src/alert.js:24` tạo object. `src/alert.js:30` sắp xếp theo `ts` rồi `host`. |
| Test bao phủ các biên | Chưa kiểm được | `test/basic.test.js` chỉ có 1 ca (5 event, 1 host). Không có test cho cooldown, biên cửa sổ, nhiều host hay input chưa sắp xếp. Tôi không chạy được code mới nên các điểm trên chưa có bằng chứng chạy. |

## Rủi ro & việc còn mở
- Các biên khó chỉ được kiểm bằng đọc mã. Test ẩn của giám đốc có thể bắt lỗi mà tôi chưa thấy.
- `e.status` không phải số (ví dụ chuỗi) được coi là so sánh số của JS. Đề bài nói status là số nên rủi ro thấp.
- Báo cáo phòng ghi "đã chạy `npm test`" nhưng không nêu test mới nào được thêm. Bộ test chỉ có 1 ca.

## Việc tiếp theo
- **Bổ sung test biên cho `detectBursts`** · Viết test cho: biên `ts-windowMs` (loại trừ), cooldown (alert tại `alert.ts + cooldownMs` được phép, trước đó thì không), event trong cooldown vẫn được đếm, hai host xen kẽ, input không sắp xếp, `ts` bằng nhau, input không bị mutate, status không phải 5xx · Phòng Phát triển (`@senior-swe`) · Xong khi `npm test` xanh với các ca trên.
