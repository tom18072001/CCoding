## Tóm tắt

**Không nghiệm thu.** Báo cáo ghi "xong" và `npm test` xanh, nhưng `src/iis.js:49` có lỗi đổi đơn vị. `time-taken` tính bằng mili giây phải đổi sang nano giây, tức nhân với 1e6. Code lại chia cho 1e6, nên `event.duration` sai rất nhiều. Bài test hiện có không bắt được lỗi này. Các quy tắc còn lại đều đúng khi đọc code. Tôi chưa chạy lại code.

## Tiêu chí nghiệm thu

| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| `#Fields:` có thể xuất hiện nhiều lần, mỗi dòng áp dụng đến dòng `#Fields:` kế tiếp. Directive khác và dòng trống bị bỏ qua. | Đạt | `src/iis.js:26-31` |
| Dòng trước `#Fields:` hoặc có số cột không khớp thì bị bỏ qua. | Đạt | `src/iis.js:32-34` |
| Giá trị `-` thì bỏ hẳn key, đầu ra là object lồng nhau. | Đạt | `src/iis.js:40` và hàm `setPath` |
| `date`+`time` thành `@timestamp` ISO UTC có mili giây. | Đạt | `src/iis.js:54-57`. `toISOString` luôn ra `.000Z`. |
| Các trường chuỗi và số (`s-ip`, `c-ip`, method, path, query, status, port, username) được ánh xạ đúng, status và port là number. | Đạt | `src/iis.js:8-19, 43-46` |
| `user_agent.original` thay mọi `+` bằng khoảng trắng. | Đạt | `src/iis.js:50-51`, dùng regex `/\+/g` |
| `time-taken` (ms) thành `event.duration` (ns). | **Không** | `src/iis.js:49` dùng `n / 1e6`, đúng phải là `n * 1e6`. Ví dụ 1500 ms phải ra 1500000000 mà code ra 0.0015. |
| Test bao phủ đủ hành vi. | Không đủ | `test/basic.test.js` chỉ có 1 test và báo cáo không nói test thêm. Lỗi trên vẫn qua được `npm test` (exit 0, pass 1). |

## Rủi ro và việc còn mở

- Dữ liệu `event.duration` sai nặng nếu dùng trong thực tế.
- Lệnh reviewer chạy chỉ là `npm test`, mà bộ test quá mỏng nên "đã duyệt" không có giá trị bảo chứng.
- Chưa có test cho các trường hợp: nhiều `#Fields:`, giá trị `-`, số cột lệch, và dấu `+` trong User-Agent.

## Đề xuất việc tiếp theo

- Sửa `n / 1e6` thành `n * 1e6` và thêm test cho `event.duration`.
- Bổ sung test cho các trường hợp còn thiếu ở trên.

```json
{"accepted": false, "summary": "Hầu hết quy tắc phân tích đúng, nhưng event.duration đổi đơn vị ngược (chia 1e6 thay vì nhân) tại src/iis.js:49. Test hiện có chỉ 1 bài nên không bắt được lỗi.", "criteria": [{"name": "Xử lý #Fields nhiều lần, directive khác, dòng trống", "result": "pass", "evidence": "src/iis.js:26-31"}, {"name": "Bỏ dòng trước #Fields hoặc lệch số cột", "result": "pass", "evidence": "src/iis.js:32-34"}, {"name": "Giá trị '-' bỏ key, đầu ra lồng nhau", "result": "pass", "evidence": "src/iis.js:40 và setPath"}, {"name": "@timestamp ISO UTC có mili giây", "result": "pass", "evidence": "src/iis.js:54-57"}, {"name": "Ánh xạ trường chuỗi/số (status, port là number)", "result": "pass", "evidence": "src/iis.js:8-19, 43-46"}, {"name": "user_agent.original thay + bằng khoảng trắng", "result": "pass", "evidence": "src/iis.js:50-51"}, {"name": "time-taken ms -> event.duration ns", "result": "fail", "evidence": "src/iis.js:49 dùng n / 1e6; phải là n * 1e6"}, {"name": "Test bao phủ đủ hành vi", "result": "fail", "evidence": "test/basic.test.js chỉ 1 test; lỗi duration vẫn qua npm test (exit 0)"}], "risks": ["event.duration sai nặng nếu dùng trong thực tế", "Bộ test mỏng nên review 'đã duyệt' không bảo chứng được", "Chưa có test cho nhiều #Fields, giá trị '-', lệch số cột, '+' trong User-Agent"], "followUps": [{"title": "Sửa đổi đơn vị event.duration", "brief": "Trong src/iis.js dòng 49, đổi n / 1e6 thành n * 1e6 để time-taken (ms) thành event.duration (ns). Thêm test xác nhận 1500 ms ra 1500000000. Chạy npm test.", "department": "dev"}, {"title": "Bổ sung test cho parseIisLog", "brief": "Thêm test trong test/basic.test.js cho: nhiều dòng #Fields: với thứ tự cột khác nhau, giá trị '-' bị bỏ key, dòng lệch số cột bị bỏ, dòng trước #Fields: bị bỏ, '+' trong cs(User-Agent) thành khoảng trắng, @timestamp có .000Z, status và port là number. Chạy npm test.", "department": "dev"}]}
```