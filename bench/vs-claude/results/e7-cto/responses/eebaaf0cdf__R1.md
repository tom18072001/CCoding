## Tóm tắt
Chưa nghiệm thu. Logic cửa sổ trượt, cooldown và việc không mutate input đúng. Nhưng bước sắp xếp kết quả ở `src/alert.js:30` có lỗi: comparator dùng `a.ts + b.ts` thay vì `a.ts - b.ts`. Với epoch ms dương, tổng luôn khác 0 và dương, nên comparator không bao giờ trả về 0 hay âm. Thứ tự đầu ra khi có nhiều alert (nhiều host hoặc nhiều thời điểm) vì thế không đáng tin và không theo `ts` rồi `host`. Test hiện có chỉ có 1 case và pass, nên không phát hiện lỗi này. Tôi chỉ đọc mã, chưa chạy lại lệnh nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Chỉ tính 5xx (500–599), tách riêng từng host | Đạt | `alert.js:9-13` lọc status và nhóm theo host bằng Map |
| Cửa sổ nửa mở `(ts-windowMs, ts]`, count >= threshold, events cùng `ts` tính theo thứ tự input | Đạt | `alert.js:17-24`: sort ổn định, `while list[start] <= ts - windowMs` loại biên trái, `count = i-start+1` |
| Cooldown: không alert khi `ts < alert.ts + cooldownMs`, event trong cooldown vẫn được tính cho cửa sổ sau; `cooldownMs` mặc định = `windowMs` | Đạt | `alert.js:4,24,26`: `ts >= nextAllowed`, `start` không bị reset |
| Không mutate input | Đạt | `alert.js:12,17`: chỉ sort mảng `ts` mới tạo, không đụng `events` |
| Kết quả sắp xếp theo `ts` rồi `host` tăng dần | Không | `alert.js:30`: `a.ts + b.ts` sai, phải là `a.ts - b.ts`. Với `ts` dương comparator luôn trả dương nên không bao giờ ra thứ tự đúng |
| `npm test` xanh | Đạt (nhưng độ phủ yếu) | Báo cáo: baseline exit 1, sau thực thi exit 0 (1 test pass). Chỉ có `test/basic.test.js`, 1 test, không kiểm thứ tự nhiều alert |
| Test bao phủ biên, cooldown, nhiều host, input không sort | Không | Chỉ có 1 test trong repo (kết quả Glob) |

## Rủi ro & việc còn mở
- **Cao:** lỗi comparator ở `alert.js:30` làm sai đầu ra khi có từ 2 alert trở lên, tức là kịch bản hidden test chắc chắn sẽ kiểm.
- **Trung bình:** báo cáo review "Đã duyệt" dựa trên `npm test` xanh, trong khi test quá ít. Cổng chất lượng đã bỏ sót lỗi.
- **Thấp:** `ts` hoặc `status` không phải số, hay `windowMs` không hợp lệ, chưa được xử lý. Đề bài không yêu cầu.

## Việc tiếp theo
- **Sửa comparator và bổ sung test.** Phạm vi: đổi `a.ts + b.ts` thành `a.ts - b.ts` ở `src/alert.js:30`. Thêm test cho các trường hợp: nhiều host cùng `ts` (host tăng dần), input không sort, biên cửa sổ `ts - windowMs` bị loại, cooldown biên `ts == alert.ts + cooldownMs` thì được alert, event cùng `ts`, input không bị mutate. Người làm: `@senior-swe` (dev). Xong khi các test mới pass và `npm test` exit 0.
