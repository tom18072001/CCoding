## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (1/1), nhưng `src/alert.js:18` có lỗi comparator: `list.sort((a, b) => a + b)` thay vì `a - b`. Với `ts` dương, comparator này luôn trả về số dương và không phải thứ tự hợp lệ. Vì vậy input không sắp xếp sẵn, mà đề bài nói rõ là có thể xảy ra, sẽ cho kết quả sai. Test hiển thị chỉ có 1 test nên không bắt được lỗi này. Phần còn lại của logic (cửa sổ nửa mở, cooldown, sắp xếp đầu ra) đúng theo đọc mã.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` chạy xanh | Đạt | Báo cáo: sau thực thi exit 0, pass 1, fail 0 (baseline exit 1) |
| Chỉ tính 5xx (500–599), tách theo host | Đạt | `src/alert.js:8-14` lọc status và gom theo `Map` host |
| Xử lý đúng input chưa sắp xếp theo `ts` (equal `ts` giữ thứ tự input) | Không | `src/alert.js:18` dùng `a + b` thay vì `a - b`, nên thứ tự sau sort không đáng tin cậy |
| Cửa sổ nửa mở `(ts - windowMs, ts]` và `count` đúng | Đạt (có điều kiện) | `src/alert.js:23-24`: `list[start] <= ts - windowMs` loại biên dưới. Điều kiện là dữ liệu đã sort đúng, mà tiêu chí trên đang Không. |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`, sự kiện trong cooldown vẫn tính vào cửa sổ sau | Đạt | `src/alert.js:25` dùng `ts >= lastAlert + cooldownMs`. `lastAlert` chỉ đổi khi có alert, còn `start` không bị reset. |
| Đầu ra sắp theo `ts` rồi `host` tăng dần; không mutate input | Đạt | `src/alert.js:32` sắp xếp đầu ra; chỉ đọc `events`, sort trên mảng mới |
| Test phủ các trường hợp biên (unsorted, cooldown, equal ts, nhiều host) | Chưa kiểm được | Chỉ thấy `test/basic.test.js`, tôi không đọc nội dung. Báo cáo nói 1 test pass, nên độ phủ rất mỏng. |

## Rủi ro & việc còn mở
- **Cao:** lỗi comparator ở `src/alert.js:18` làm sai kết quả với input không sắp xếp. Reviewer đã "duyệt" và `npm test` xanh, nên có nguy cơ nhận nhầm là đạt.
- **Trung bình:** bộ test hiển thị quá ít, không bảo vệ chống hồi quy.
- **Thấp:** tôi chưa tự chạy lại lệnh nào, nên các kết luận về logic dựa trên đọc mã cộng báo cáo.

## Việc tiếp theo
- **Sửa comparator và bổ sung test biên** · Đổi `a + b` thành `a - b` ở `src/alert.js:18`. Thêm test cho input đảo thứ tự, `ts` bằng nhau, biên cửa sổ `(ts - windowMs, ts]`, cooldown (sự kiện trong cooldown vẫn tính vào cửa sổ sau), nhiều host và thứ tự đầu ra. Xong khi `npm test` xanh và test unsorted fail trước khi sửa. · `@senior-swe`.
