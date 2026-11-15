## Tóm tắt
**Chưa nghiệm thu.** `npm test` xanh (exit 0, 1/1 pass), nhưng `src/alert.js:18` dùng hàm so sánh sai: `list.sort((a, b) => a + b)`. Với timestamp dương, hàm này luôn trả về số dương, nên V8 giữ nguyên thứ tự đầu vào. Vì vậy với đầu vào **không sắp xếp**, trường hợp đề bài nêu rõ, cửa sổ trượt tính sai và cảnh báo có thể sai `ts`/`count`. Test duy nhất dùng đầu vào đã sắp xếp nên không bắt được lỗi này. Báo cáo ghi "kèm test" nhưng diff không có tệp test nào.

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| Đầu vào không sắp xếp được xử lý đúng theo thứ tự `ts` | **Không** | `src/alert.js:18` `a + b` không phải hàm so sánh hợp lệ. Lần chạy V8 nhận diện cả mảng là một "run" không giảm, nên giữ nguyên thứ tự. Ví dụ ts `[5000,1000,2000,3000,4000]`, threshold 5: code báo `ts: 4000`, đúng phải là `ts: 5000`. Kết luận này dựa trên đọc code; guard chặn vai trò CTO chạy `node` nên chưa chạy thực tế. |
| Cửa sổ nửa mở `(ts − windowMs, ts]`, chỉ tính 5xx, theo từng host | Đạt (khi mảng đã sắp xếp) | `alert.js:9` lọc 500–599, `alert.js:7-13` nhóm theo host, `alert.js:23` loại các sự kiện có `ts <= ts − windowMs` |
| Cooldown: chặn khi `ts < alert.ts + cooldownMs`, sự kiện trong cooldown vẫn được đếm; mặc định `cooldownMs = windowMs` | Đạt | `alert.js:4`, `alert.js:25` |
| Cùng `ts` xử lý theo thứ tự đầu vào; đầu ra `{host, ts, count}` sắp theo ts rồi host; không sửa đầu vào | Đạt (khi mảng đã sắp xếp) | `alert.js:12` chỉ chép `ts` sang mảng mới. Sắp xếp đầu ra ở `alert.js:32`. Thứ tự với `ts` bằng nhau chỉ đúng khi dùng sort ổn định với `a - b`. |
| Có test cho hành vi chính, `npm test` xanh | **Không** | CCoding chạy `npm test` → exit 0, 1 pass. Nhưng `git show --stat HEAD` chỉ có `src/alert.js`; `test/basic.test.js` chỉ có 1 ca với đầu vào đã sắp xếp. Chưa có test cho cooldown, ranh giới cửa sổ, nhiều host, đầu vào không sắp xếp. |

## Rủi ro & việc còn mở
- **Cao (đúng đắn):** dữ liệu log thực tế thường không sắp xếp, nên cảnh báo sẽ sai hoặc bị bỏ sót. Lỗi lại nằm ngay chỗ có comment "stable: equal ts keep input order", dễ khiến người review tưởng là đúng.
- **Quy trình:** cổng chất lượng duyệt chỉ dựa vào 1 test có sẵn. Báo cáo ghi "kèm test" không khớp với diff.

## Việc tiếp theo
**Sửa sort và bổ sung test** · Phạm vi: `src/alert.js:18` đổi thành `(a, b) => a - b`; thêm test vào `test/`: đầu vào không sắp xếp, ranh giới đúng `windowMs`, cooldown (chặn và mở lại), nhiều host với sắp xếp đầu ra, ts bằng nhau, không sửa đầu vào · @senior-swe (Phòng Phát triển) · Xong khi `npm test` xanh với các ca mới.
