## Tóm tắt

**Không nghiệm thu.** Logic cửa sổ trượt và cooldown đúng, nhưng bước sắp xếp kết quả ở `src/alert.js:30` có lỗi. Comparator viết `a.ts + b.ts` thay vì `a.ts - b.ts`. Báo cáo của phòng và `npm test` xanh, nhưng chỉ có 1 test hiển thị, nên chưa phát hiện được lỗi này.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Chỉ tính sự kiện 5xx (500–599), tách theo từng host | Đạt | `src/alert.js:9-13` lọc theo status và gom theo host. |
| Cửa sổ nửa mở `(ts - windowMs, ts]` và ngưỡng `>= threshold` | Đạt | Dòng 22 loại các sự kiện có `ts <= ts - windowMs`. Dòng 24 so `count >= threshold`. |
| Cooldown: chặn alert khi `ts < alert.ts + cooldownMs`, sự kiện trong cooldown vẫn được tính vào cửa sổ sau | Đạt | `nextAllowed = ts + cooldownMs` (dòng 26) và điều kiện `ts >= nextAllowed` (dòng 24). Con trỏ `start` không bị ảnh hưởng bởi cooldown. Mặc định `cooldownMs = windowMs` ở dòng 4. |
| Cùng `ts` thì xử lý theo thứ tự nhập, mỗi sự kiện tính dần vào cửa sổ | Đạt | `list.sort` ổn định (dòng 17), `count = i - start + 1`. |
| Không làm thay đổi input | Đạt | Chỉ đọc `events`, danh sách `ts` được tạo mới và sắp xếp trên bản sao (dòng 8-17). |
| Kết quả sắp theo `ts` rồi `host` tăng dần | **Không** | Dòng 30 dùng `a.ts + b.ts`, đáng lẽ phải là `a.ts - b.ts`. Tổng của hai `ts` dương luôn khác 0, nên phần so sánh `host` không bao giờ chạy. Comparator cũng không nhất quán nên thứ tự đầu ra không đáng tin khi có từ hai alert trở lên. Với nhiều host, kết quả sai thứ tự. |
| `npm test` xanh | Đạt, nhưng yếu | Theo báo cáo, trước khi sửa là exit 1 với 1 fail, sau khi sửa là exit 0 với 1 pass. Chỉ có 1 test (`test/basic.test.js`), nên không bao phủ sắp xếp nhiều alert, nhiều host, cooldown hay `ts` bằng nhau. Tôi không chạy lại lệnh này. |

## Việc còn mở

Sửa dòng 30 thành `a.ts - b.ts ||` rồi bổ sung test cho các trường hợp trên.

```json
{"accepted": false, "summary": "Logic cửa sổ, cooldown, lọc 5xx và không đổi input đều đúng, nhưng comparator sắp xếp ở src/alert.js:30 dùng `a.ts + b.ts` thay vì `a.ts - b.ts`, nên thứ tự đầu ra sai khi có nhiều alert. Chỉ có 1 test hiển thị nên lỗi không bị phát hiện.", "criteria": [{"name": "Chỉ tính 5xx, tách theo host", "result": "pass", "evidence": "src/alert.js:9-13"}, {"name": "Cửa sổ nửa mở (ts-windowMs, ts] và ngưỡng >= threshold", "result": "pass", "evidence": "src/alert.js:22-24"}, {"name": "Cooldown đúng, sự kiện trong cooldown vẫn được tính", "result": "pass", "evidence": "src/alert.js:4, 24, 26"}, {"name": "Cùng ts xử lý theo thứ tự nhập", "result": "pass", "evidence": "src/alert.js:17, 23 (sort ổn định, count tăng dần)"}, {"name": "Không mutate input", "result": "pass", "evidence": "src/alert.js:8-17 chỉ đọc events, sort trên bản sao"}, {"name": "Sắp xếp kết quả theo ts rồi host tăng dần", "result": "fail", "evidence": "src/alert.js:30 dùng a.ts + b.ts thay vì a.ts - b.ts; tie-break theo host không bao giờ chạy và comparator không nhất quán"}, {"name": "npm test xanh", "result": "pass", "evidence": "Báo cáo: baseline exit 1, sau thực thi exit 0 (1 pass). Chỉ có 1 test, độ phủ yếu; tôi không chạy lại"}], "risks": ["Thứ tự đầu ra sai khi có từ hai alert trở lên, nhất là khi có nhiều host.", "Bộ test chỉ có 1 test, không bao phủ sắp xếp, cooldown, ts bằng nhau và biên cửa sổ.", "Cổng chất lượng của phòng đã duyệt dù có lỗi này."], "followUps": [{"title": "Sửa comparator và bổ sung test", "brief": "Trong src/alert.js dòng 30, đổi `a.ts + b.ts` thành `a.ts - b.ts`. Thêm test trong test/ cho: nhiều host có alert xen kẽ ts, hai host cùng ts (host tăng dần), cooldown (alert bị chặn rồi lại bắn sau cooldown), biên cửa sổ nửa mở, ts bằng nhau theo thứ tự nhập, input không sắp xếp và không bị mutate. Chạy npm test.", "department": "dev"}]}
```