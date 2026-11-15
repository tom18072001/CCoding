## Tóm tắt
**Chưa nghiệm thu.** Đọc `src/alert.js` thấy một lỗi chắc chắn ở bước sắp xếp kết quả: comparator dùng `a.ts + b.ts` thay vì `a.ts - b.ts`. Phần lọc 5xx, cửa sổ trượt và cooldown trông đúng. Tuy vậy `npm test` xanh chỉ có 1 test, nên lỗi này không bị bắt. Tôi định chạy thử bằng script để xác nhận nhưng hook chặn lệnh ghi tệp, nên kết luận dựa trên đọc code, chưa có kết quả chạy.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `npm test` xanh | Đạt | Báo cáo: sau thực thi exit 0, pass 1, fail 0 (baseline exit 1). Chỉ có 1 test trong `test/basic.test.js`. |
| Chỉ tính 5xx (500–599), tách riêng từng host | Đạt | `src/alert.js`: lọc `e.status >= 500 && <= 599`, gom bằng `Map` theo host. Đọc code, chưa chạy. |
| Cửa sổ nửa mở `(ts - windowMs, ts]`, `count >= threshold`, `count` là số event trong cửa sổ | Đạt | `while (list[start] <= ts - windowMs) start++` loại event ở mốc biên. `count = i - start + 1`. Đọc code, chưa chạy. |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`, event trong cooldown vẫn được đếm cho cửa sổ sau | Đạt | `nextAllowed = ts + cooldownMs`, điều kiện `ts >= nextAllowed`. Cửa sổ tính trên toàn bộ `list`. `cooldownMs` mặc định bằng `windowMs`. |
| Event input không sắp xếp, `ts` bằng nhau giữ thứ tự input, không mutate input | Đạt (đọc code) | `list` là mảng mới, sort ổn định theo `ts`, `events` không bị sửa. |
| Kết quả sắp theo `ts` rồi `host` tăng dần | **Không** | `src/alert.js`, dòng sort cuối: `a.ts + b.ts || (...)`. Tổng hai `ts` dương luôn dương và khác 0, nên comparator không nhất quán và nhánh so sánh `host` không bao giờ chạy. Alert nhiều host hoặc nhiều thời điểm sẽ sai thứ tự. Phải là `a.ts - b.ts`. |
| Test phủ các hành vi chính (biên cửa sổ, cooldown, nhiều host, thứ tự) | Không | Chỉ có 1 test. Review "không bắt buộc" nên lỗi sort lọt qua. |

## Rủi ro & việc còn mở
- **Lỗi sắp xếp** làm sai đầu ra cho mọi trường hợp có từ 2 alert trở lên. Hidden test sẽ trượt ở đây. Phòng tự sửa được: scope in.
- Test quá mỏng nên "xanh" không chứng minh đúng. Cần thêm test cho từng quy tắc trong đề.
- Các tiêu chí còn lại mới được xác nhận qua đọc code, chưa có lần chạy nào chứng minh.
- Dữ liệu `internal`, không có PII, không phát sinh rủi ro bảo mật.

## Việc tiếp theo
- **Sửa comparator sort và bổ sung test**
  - Phạm vi: đổi `a.ts + b.ts` thành `a.ts - b.ts` trong `src/alert.js`. Thêm test cho thứ tự `ts` rồi `host`, biên cửa sổ nửa mở, cooldown, `ts` trùng nhau, input không sắp xếp và không mutate.
  - Ai làm: dev (`@senior-swe`).
  - Xong khi: `npm test` xanh với các test mới.
