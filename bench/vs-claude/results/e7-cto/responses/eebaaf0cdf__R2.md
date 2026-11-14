## Tóm tắt
**Chưa nghiệm thu.** Phần phát hiện burst cho từng host đúng với đề bài: cửa sổ nửa mở, cooldown, các event trùng `ts` và việc không sửa input đều ổn. Nhưng bước sắp xếp kết quả cuối có lỗi: `src/alert.js:29` dùng comparator `a.ts + b.ts` thay vì `a.ts - b.ts`. Vì vậy khi có từ 2 alert trở lên, thứ tự trả về không theo `ts` rồi `host` như đề bài yêu cầu. Test hiện có chỉ có 1 alert nên vẫn xanh và không bắt được lỗi này. Phòng không thêm test nào, dù báo cáo ghi "kèm test".

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` chạy xanh | Đạt | CCoding tự chạy: trước khi sửa exit 1, sau khi sửa exit 0, pass 1, fail 0 |
| Mỗi host xét riêng, chỉ tính 5xx (500–599), cửa sổ nửa mở `(ts - windowMs, ts]` | Đạt | Đọc code: `src/alert.js:9` lọc 5xx, gom theo host. `src/alert.js:22` bỏ event có `<= ts - windowMs`, nên event đúng ở mép `ts - windowMs` bị loại, đúng nửa mở |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`; event trong cooldown vẫn được đếm; mặc định `cooldownMs = windowMs` | Đạt | Đọc code: `src/alert.js:4` lấy mặc định bằng `??`. `src/alert.js:24-26` kiểm `ts >= nextAllowed`; vòng lặp vẫn đếm mọi event |
| Event cùng `ts` của một host xử lý theo thứ tự input, đếm dần từng cái | Đạt | Đọc code: `src/alert.js:18` dùng sort ổn định trên mảng mới, `count = i - start + 1` tính lũy tiến |
| Không sửa input | Đạt | Đọc code: chỉ tạo mảng `ts` mới cho từng host, sort trên mảng đó; không ghi vào `events` |
| Kết quả sắp theo `ts` tăng dần, rồi `host` tăng dần | **Không** | `src/alert.js:29`: `a.ts + b.ts` gần như luôn dương, nên kết quả không theo `ts`. Thứ tự với nhiều alert sẽ sai. Tôi kết luận bằng đọc code; vai trò CTO bị guard chặn chạy `node` nên chưa chạy ví dụ thật |
| Có test cho các trường hợp biên | Không | `git show --stat HEAD` chỉ có `src/alert.js`; `test/basic.test.js` vẫn là 1 test gốc |

## Rủi ro & việc còn mở
- **Cao:** mọi tình huống có từ 2 alert trở lên (nhiều host, hoặc một host vượt ngưỡng lại sau cooldown) đều có thể trả sai thứ tự. Test ẩn gần như chắc chắn sẽ bắt lỗi này.
- **Trung bình:** chưa có test cho mép cửa sổ, cooldown, `ts` trùng nhau, input không sắp xếp, nhiều host, và việc không sửa input. Báo cáo ghi "kèm test" nhưng không khớp với diff.
- **Thấp:** cổng chất lượng cho qua chỉ vì "lệnh kiểm tra xanh", trong khi test hiện có quá mỏng.

## Việc tiếp theo
- **Sửa comparator và bổ sung test** · Phạm vi: sửa `src/alert.js:29` thành `a.ts - b.ts || (host compare)`. Thêm test vào `test/` cho: nhiều host xen kẽ (kiểm thứ tự `ts` rồi `host`), hai host alert cùng `ts`, event ở mép `ts - windowMs` không được tính, alert lại sau cooldown, event trong cooldown vẫn được đếm, input không sắp xếp, `ts` trùng nhau, input không bị sửa · Ai làm: `@senior-swe` (dev) · Xong khi: `npm test` xanh với các test mới.
