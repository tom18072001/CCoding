## Tóm tắt
**Chưa nghiệm thu.** Phần logic từng host (cửa sổ nửa mở, cooldown, bằng nhau `ts`, không mutate) đúng đề bài, nhưng bước sắp xếp kết quả ở `src/alert.js:30` dùng comparator sai (`a.ts + b.ts` thay vì `a.ts - b.ts`): kết quả nhiều host **không** được sắp theo `ts` rồi `host` như đề bài yêu cầu. `npm test` xanh chỉ vì test hiển thị duy nhất có 1 host, 1 alert. Báo cáo ghi "kèm test" nhưng diff không thêm test nào.

Ghi chú: hook CCoding chặn vai trò CTO chạy `node`, nên lỗi comparator được kết luận bằng **phân tích tĩnh**, không phải chạy thử. Lỗi này đủ hiển nhiên về mặt toán học để kết luận "Không".

## Tiêu chí nghiệm thu
| Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|
| C1. Chỉ lấy 5xx, tách theo host, cửa sổ nửa mở `(ts - windowMs, ts]`, count ≥ threshold | Đạt | `src/alert.js:9` lọc 500–599. `:22` bỏ các phần tử `<= ts - windowMs`, nên biên trái là mở và biên phải là đóng. `:23` count = `i - start + 1` |
| C2. Cooldown: không alert khi `ts < alert.ts + cooldownMs`, event trong cooldown vẫn được đếm; mặc định `cooldownMs = windowMs` | Đạt | `:4` dùng `??`. `:24` cho phép alert khi `ts >= nextAllowed`. `:26` đặt `nextAllowed = ts + cooldownMs`. Con trỏ cửa sổ vẫn chạy cho mọi event |
| C3. Các event cùng `ts` của một host được đếm lần lượt theo thứ tự input | Đạt | `:17` `Array.prototype.sort` là stable (ES2019+), và count tăng theo từng chỉ số `i` |
| C4. Kết quả sắp theo `ts` tăng dần, rồi theo `host` tăng dần | **Không** | `:30` `a.ts + b.ts \|\| …`: với `ts` dương, comparator luôn trả số dương, nên đây là comparator không nhất quán và thứ tự phụ thuộc engine. Nhánh so sánh `host` gần như không bao giờ chạy (chỉ khi `a.ts + b.ts === 0`) |
| C5. Không mutate input, giữ ES module export | Đạt | `:12` chỉ chép `ts` sang mảng mới, `sort` chạy trên mảng nội bộ. `export function detectBursts` vẫn giữ nguyên |
| C6. `npm test` xanh | Đạt | CCoding tự chạy: trước khi sửa exit 1, sau khi sửa exit 0 (pass 1/1) |
| C7. Có test cho các hành vi chính (theo báo cáo "kèm test") | **Không** | `git show --stat HEAD` chỉ có `src/alert.js`. `test/basic.test.js` vẫn chỉ có 1 case gốc |

## Rủi ro & việc còn mở
- **Cao:** khi nhiều host cùng có alert, thứ tự trả về sai. Bộ test ẩn hoặc người dùng kết quả gần như chắc chắn sẽ phát hiện lỗi này.
- **Trung bình:** chưa có test cho biên cửa sổ (đúng `ts - windowMs`), cooldown, `ts` bằng nhau, input chưa sắp, status không phải 5xx, thứ tự nhiều host. Đó là lý do lỗi C4 lọt qua cổng chất lượng.
- **Quy trình:** cổng chất lượng "lệnh xanh thì không bắt buộc review" đã để lọt một lỗi logic rõ ràng khi test hiển thị quá mỏng.

## Việc tiếp theo
- **Sửa comparator và bổ sung test** · Phạm vi: `src/alert.js:30` đổi thành `a.ts - b.ts || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0)`. Thêm test vào `test/` cho: thứ tự nhiều host (cả trường hợp cùng `ts`), biên cửa sổ nửa mở, cooldown (cả mặc định lẫn tùy chỉnh), event trong cooldown vẫn được đếm cho alert sau, input chưa sắp, bỏ qua non-5xx, input không bị mutate. Tiêu chí xong: `npm test` xanh với các test mới · @senior-swe (Phòng Phát triển).
