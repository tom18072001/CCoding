## Tóm tắt

Không nghiệm thu. `src/alert.js:21` có lỗi sắp xếp: `list.sort((a, b) => a + b)` dùng phép cộng thay vì phép trừ. Comparator này không hợp lệ, nên với đầu vào không được sắp xếp theo `ts` (đề bài nói rõ điều này) kết quả sẽ sai hoặc không xác định. `npm test` xanh chỉ vì bộ test hiện có (1 test) không phủ trường hợp này. Tôi đã đọc mã nhưng chưa chạy được lệnh kiểm chứng thực tế (lệnh bị chặn chờ duyệt).

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Chỉ tính sự kiện 5xx (500–599), tách theo từng host | Đạt | `src/alert.js:8-15`: lọc `status >= 500 && <= 599`, gom theo `Map` host |
| Xử lý được `events` không sắp xếp theo `ts` | Không | `src/alert.js:21`: comparator `a + b` luôn dương với ts dương, không phải thứ tự hợp lệ. Cần là `a - b` |
| Cửa sổ nửa mở `(ts - windowMs, ts]` | Đạt (có điều kiện) | `src/alert.js:25`: `while (list[start] <= ts - windowMs) start++`. Đúng nếu danh sách đã sắp xếp đúng |
| Cooldown: không báo trong `ts < alert.ts + cooldownMs`, sự kiện trong cooldown vẫn được đếm | Đạt (có điều kiện) | `src/alert.js:27`: điều kiện `ts >= lastAlert + cooldownMs`. Cửa sổ trượt độc lập với cooldown. Mặc định `cooldownMs = windowMs` ở dòng 4 |
| Cùng `ts` giữ thứ tự input, mỗi sự kiện đếm khi được xử lý | Chưa kiểm được | Sort ổn định của Node chỉ có ý nghĩa khi comparator đúng. Với `a + b`, thứ tự không được đảm bảo. Với cùng host các `ts` bằng nhau thì không phân biệt được, nên ảnh hưởng thực tế nhỏ |
| Đầu ra `{host, ts, count}` sắp theo `ts` rồi `host` tăng dần | Đạt | `src/alert.js:35` |
| Không mutate input | Đạt | Chỉ sort mảng `list` cục bộ (`src/alert.js:21`); `events` không bị sửa |
| Test bao phủ, `npm test` xanh | Chưa kiểm được | Báo cáo ghi baseline đỏ và sau thực thi xanh, nhưng chỉ có 1 test. Diff không thêm test cho input không sắp xếp, cooldown, hay biên cửa sổ |

## Rủi ro / việc còn mở

- Lỗi comparator ở `src/alert.js:21` là lỗi đúng đắn thực sự. Báo cáo phòng và reviewer ghi "đạt" mà không bắt được lỗi này.
- Thiếu test cho: input chưa sắp xếp, biên cửa sổ, cooldown, nhiều host, `ts` trùng nhau.

```json
{"accepted": false, "summary": "Mã lọc 5xx, cửa sổ trượt, cooldown và sắp xếp đầu ra đều đúng hướng, nhưng comparator sort `a + b` ở src/alert.js:21 làm sai với input không sắp xếp ts. Test hiện có quá ít nên không bắt được lỗi này.", "criteria": [{"name": "Chỉ tính 5xx, tách theo host", "result": "pass", "evidence": "src/alert.js:8-15"}, {"name": "Xử lý input không sắp xếp theo ts", "result": "fail", "evidence": "src/alert.js:21 dùng sort((a,b)=>a+b) thay vì a-b"}, {"name": "Cửa sổ nửa mở (ts-windowMs, ts]", "result": "pass", "evidence": "src/alert.js:25, đúng khi danh sách đã sắp xếp đúng"}, {"name": "Cooldown và sự kiện trong cooldown vẫn được đếm", "result": "pass", "evidence": "src/alert.js:27 và cửa sổ trượt độc lập"}, {"name": "Cùng ts giữ thứ tự input", "result": "unknown", "evidence": "Phụ thuộc comparator đúng; chưa có test hay lần chạy thực tế"}, {"name": "Đầu ra sắp theo ts rồi host", "result": "pass", "evidence": "src/alert.js:35"}, {"name": "Không mutate input", "result": "pass", "evidence": "Chỉ sort mảng cục bộ list"}, {"name": "Test bao phủ đủ hành vi và npm test xanh", "result": "unknown", "evidence": "Báo cáo ghi npm test exit 0 nhưng chỉ có 1 test; diff không thêm test mới"}], "risks": ["Comparator sort sai (a + b) gây kết quả sai với input chưa sắp xếp", "Thiếu test cho input chưa sắp xếp, biên cửa sổ, cooldown, nhiều host, ts trùng nhau", "Review của phòng ban không phát hiện lỗi"], "followUps": [{"title": "Sửa comparator và bổ sung test", "brief": "Trong src/alert.js đổi list.sort((a,b)=>a+b) thành list.sort((a,b)=>a-b). Thêm test trong test/ cho: input chưa sắp xếp theo ts, biên cửa sổ nửa mở (ts đúng bằng event.ts - windowMs không được tính), cooldown (sự kiện trong cooldown vẫn đếm cho cửa sổ sau), nhiều host độc lập, ts trùng nhau, sắp xếp đầu ra theo ts rồi host, và không mutate input. Chạy npm test.", "department": "dev"}]}
```