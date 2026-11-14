## Tóm tắt
Chưa nghiệm thu. Đọc `src/alert.js:18` thấy lỗi: comparator sắp xếp viết `a + b` thay vì `a - b`. Với `ts` dương, comparator luôn trả về số dương, nên không sắp xếp đúng khi đầu vào không theo thứ tự thời gian, trong khi đề bài nói rõ `ts` không đảm bảo đã sort. `npm test` xanh, nhưng chỉ có 1 test (`test/basic.test.js`) và test này không phát hiện lỗi. Tôi chưa chạy lại mã để xác nhận hậu quả, vì vai trò của tôi chỉ đọc.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh | Đạt | Báo cáo: baseline exit 1, sau thực thi exit 0 (pass 1, fail 0). |
| Chỉ tính 5xx (500–599) và tách theo từng host | Đạt | `alert.js:9-13` nhóm theo host bằng Map. |
| Xử lý đúng khi `ts` không sắp xếp | Không | `alert.js:18` dùng `a + b` thay vì `a - b`. Thứ tự bị sai khi đầu vào lộn xộn, kéo theo `count` và alert sai. |
| Cửa sổ nửa mở `(ts-windowMs, ts]`, `count >= threshold` | Đạt (theo đọc mã) | `alert.js:23-25` dùng `<= ts - windowMs` để loại sự kiện ngoài cửa sổ. Phụ thuộc vào việc sort đúng. |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`; sự kiện trong cooldown vẫn được đếm | Đạt (theo đọc mã) | `alert.js:25` kiểm tra `ts >= lastAlert + cooldownMs`; `start` không bị reset. |
| Đầu ra `{host, ts, count}` sắp theo `ts` rồi `host`, không sửa input | Đạt | `alert.js:32` sắp xếp đúng thứ tự; không mutate `events`, chỉ sort mảng `list` cục bộ. |
| Test bao phủ unsorted, ranh giới cửa sổ, cooldown, nhiều host | Không | Chỉ có `test/basic.test.js`, 1 test. Báo cáo cũng không nêu test bổ sung. |

## Rủi ro & việc còn mở
- **Cao:** lỗi comparator ở `alert.js:18` làm sai kết quả với đầu vào không sort, và các test hidden nhiều khả năng kiểm tra đúng trường hợp này.
- **Trung bình:** review "đã duyệt" chỉ dựa vào `npm test` xanh, và chỉ có 1 test nên không đủ bảo vệ.
- **Thấp:** chưa có test cho ranh giới cửa sổ, `ts` bằng nhau, cooldown đúng biên và việc không mutate input.

## Việc tiếp theo
- **Sửa comparator và bổ sung test** · đổi `a + b` thành `a - b` ở `alert.js:18`; thêm test cho input không sort, ranh giới `(ts-windowMs, ts]`, cooldown biên, `ts` bằng nhau, nhiều host và không mutate input · dev (`@senior-swe`) · xong khi `npm test` xanh và các test mới fail trên bản cũ.
