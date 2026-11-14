## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (exit 0), nhưng bộ test hiện có chỉ có 1 ca với `ts` đã sắp xếp sẵn. Trong `src/alert.js:18`, hàm so sánh dùng để sắp xếp là `(a, b) => a + b`, không phải `a - b`. Hàm này trả về số dương cho mọi cặp `ts` dương, nên danh sách sự kiện thực chất không được sắp xếp. Đề bài nói rõ `ts` "not guaranteed sorted", vậy với input không theo thứ tự, kết quả sai. Ngoài ra, báo cáo ghi "kèm test" nhưng diff chỉ sửa `src/alert.js` và không thêm test nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| 1. `npm test` xanh | Đạt | CCoding tự chạy: trước khi sửa exit 1, sau khi sửa exit 0, pass 1/1 |
| 2. Xử lý đúng khi `events` không được sắp xếp theo `ts` | **Không** | `src/alert.js:18` dùng `list.sort((a, b) => a + b)`, hàm so sánh không hợp lệ. Lần theo code (không chạy được vì vai trò CTO bị chặn lệnh `node`): với V8, binary insertion sort gặp kết quả luôn > 0 thì giữ nguyên thứ tự input. Ví dụ input `ts` = [100000, 1000, 2000, 3000, 4000, 5000] (cùng host, 5xx, threshold 5): code báo alert `{ts: 4000, count: 5}` vì đếm cả sự kiện 100000 vào cửa sổ. Kết quả đúng phải là `{ts: 5000, count: 5}` |
| 3. Sự kiện cùng `ts` xử lý theo thứ tự input, mỗi sự kiện được đếm ngay khi xử lý | Chưa kiểm được | Logic đếm từng sự kiện (`count = i - start + 1`) đúng ý đề bài, nhưng phụ thuộc vào việc sắp xếp ổn định, mà bước sắp xếp đang hỏng (tiêu chí 2). Không có test cho ca này |
| 4. Cửa sổ nửa mở `(ts - windowMs, ts]`, chỉ tính 5xx, cooldown đúng (`ts < alert.ts + cooldownMs` bị chặn, sự kiện trong cooldown vẫn được đếm), mặc định `cooldownMs = windowMs` | Đạt (đọc code) | `src/alert.js:9`: lọc 500–599. `:23`: `<= ts - windowMs` loại biên trái. `:25`: `ts >= lastAlert + cooldownMs`. `:4`: giá trị mặc định đúng. Chưa có test chạy thật cho các ca này |
| 5. Không mutate input; kết quả sắp xếp theo `ts` rồi `host` | Đạt (đọc code) | `:8–14` chỉ đọc `events` và tạo mảng `list` mới. `:32` sắp xếp theo `ts` rồi so sánh chuỗi `host` |
| 6. Có test bao phủ yêu cầu của đề bài | **Không** | `git show --stat HEAD` cho thấy chỉ `src/alert.js` thay đổi. `test/basic.test.js` vẫn chỉ có 1 ca gốc |

## Rủi ro & việc còn mở
- **Cao:** khi log đến không theo thứ tự (điều này phổ biến trong thực tế), alert có thể sai thời điểm, sai `count`, hoặc báo nhầm/bỏ sót burst. Kết quả còn tùy vào engine JS vì hàm so sánh không hợp lệ.
- **Trung bình:** cổng chất lượng cho qua chỉ nhờ một test duy nhất, và báo cáo "kèm test" không khớp với diff. Cần siết điều kiện để gắn nhãn "Đã duyệt".
- Các tiêu chí 4 và 5 mới được kiểm bằng cách đọc code, chưa có bằng chứng chạy thật.

## Việc tiếp theo
- **Sửa comparator và bổ sung test cho detectBursts** · Phạm vi: `src/alert.js:18` và `test/` · Ai làm: Phòng Phát triển (@senior-swe), sau đó @qa-tester review.
