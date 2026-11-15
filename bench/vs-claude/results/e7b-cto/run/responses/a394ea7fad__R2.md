## Tóm tắt
**Nghiệm thu.** `detectBursts` trong `src/alert.js` làm đúng mọi yêu cầu của đề bài. Lệnh `npm test` do CCoding tự chạy trả exit 0 (1/1 pass), trong khi baseline trước khi sửa là exit 1. Riêng các trường hợp biên mới được kiểm bằng cách đọc code: guard chặn mọi lệnh chạy (`npm`, `node`) nên tôi không tự chạy được. Báo cáo ghi "sửa mã nguồn và test", nhưng diff chỉ chạm `src/alert.js` (`git show --stat HEAD`). Thực tế không có test mới nào được thêm.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Chỉ tính 5xx (500–599), mỗi host xét riêng | Đạt | `src/alert.js:9` lọc `status >= 500 && status <= 599`; dòng 7–14 gom theo `host` vào `Map` |
| Cửa sổ nửa mở `(ts - windowMs, ts]`, chấp nhận input chưa sắp xếp | Đạt | Dòng 8 sắp xếp bản sao theo `ts`. Dòng 21 bỏ phần tử khi `times[start] <= ts - windowMs`, nên điểm `ts - windowMs` bị loại và `ts` được giữ |
| `ts` trùng nhau xử lý theo thứ tự input, mỗi event được đếm ngay khi xử lý | Đạt | `Array.prototype.sort` ổn định nên giữ thứ tự input. `count = i - start + 1` tăng dần theo từng event (dòng 22) |
| Cooldown chặn alert khi `ts < alert.ts + cooldownMs`; event trong cooldown vẫn được đếm; mặc định `cooldownMs = windowMs` | Đạt | Dòng 23 có `ts >= lastAlert + cooldownMs`. `lastAlert` chỉ đổi khi có alert, còn cửa sổ trượt không phụ thuộc cooldown. Mặc định nằm ở dòng 3–4 |
| Đầu ra `{host, ts, count}` sắp theo `ts` rồi `host`; không mutate input; giữ ES export | Đạt | Dòng 24 và 30. Code sắp xếp trên bản sao `[...events]` và không gán vào object event. `export function` vẫn giữ nguyên |
| `npm test` xanh | Đạt | CCoding tự chạy: baseline exit 1, sau khi thực thi exit 0, `pass 1 · fail 0` |

## Rủi ro & việc còn mở
- **Thiếu test (trung bình):** chỉ có 1 test có sẵn (`test/basic.test.js`), là ca 5 event / 1 host. Biên cửa sổ, `ts` trùng, cooldown, nhiều host, input chưa sắp xếp, các status 499/600 và việc không mutate input đều chưa có test hồi quy. Báo cáo ghi "kèm test" nhưng diff không có test nào.
- **Ca biên `cooldownMs: Infinity` (thấp):** `-Infinity + Infinity = NaN`, nên điều kiện ở dòng 23 luôn sai và hàm không bao giờ alert, kể cả lần đầu. Ý đúng của giá trị này là "chỉ alert một lần". Có thể sửa bằng cờ `hasAlerted` thay cho `-Infinity`. Đề bài không nêu ca này.
- **Kiểm chứng:** các tiêu chí hành vi dựa trên đọc code, chưa có lệnh chạy độc lập cho từng ca biên.

## Việc tiếp theo
- **Bổ sung test hồi quy cho detectBursts** · thêm test vào `test/` cho từng ca biên ở trên, cộng thêm ca `cooldownMs: Infinity`. Nếu ca đó lỗi thì sửa `src/alert.js` bằng cờ `hasAlerted`. Xong khi `npm test` xanh · @senior-swe (Phòng Phát triển)
