# Sổ chạy V4-3f-P: song song trong vận hành thật (server chính 7420)

Mốc khóa đăng ký trước: `f5a31dc` (§9 "Đăng ký trước V4-3f").

Phân loại dữ liệu: **Nội bộ**. **Repo này công khai, nên tệp từng lượt (`prod-parallel.json`) không commit.** Tệp nằm trên máy giám đốc ở `C:\Users\admin\ccoding-vs-claude\ops\prod-parallel-b.json`; sha256 ghi ở bảng dưới để đối chiếu. Ở đây chỉ có số tổng hợp. Tệp chỉ có metadata: mốc thời gian, trạng thái, phụ thuộc, cờ gộp/xung đột, số lệnh đỏ, và số đếm ba mẫu tin nhắn hệ thống. Không có đề bài, tiêu đề, đầu ra hay nội dung tin nhắn. Mã nhiệm vụ băm kèm muối ngẫu nhiên không lưu; mã dự án đổi thành P1–P6. Đã kiểm danh sách khóa của tệp: chỉ có các trường trên.

| Mục | Giá trị |
|---|---|
| `p-extract.mjs` | sha256 `fc7b7f36efdaa2be62d754f1ebf9df680db3f6446139e298a01e17bd165b8839` (bản trên máy giám đốc khớp hash) |
| `p-analyze.mjs` | sha256 `706e3a7ff9b2178b13d033662d60cca4a3dffbfbff57b69d749d3edf4da0052c` |
| Trích | 4/11/2026 khoảng 19:33 giờ VN, `node ops\p-extract.mjs http://127.0.0.1:7420`, chỉ GET; 57 nhiệm vụ, 6 dự án |
| Tệp lần 1 (đã thay) | `prod-parallel.json` lần trích 19:32, sha256 `6828b6e420113981544f0ebbf0a2c8061587830b6290bc8fd8f7f31ef7a6576d` |
| Tệp dùng để báo | `prod-parallel.json` lần trích 19:34 bằng `p-extract.mjs` bản sai lệch P-a (sha256 `6a52aac91bc1bd89105b9c502b3aec1e60ffc2b628f498692f5d3b31d0395a41`, chạy dưới tên `ops\p-extract-b.mjs`), sha256 `4aec47f0a5b6481ce4d4bd7150c08b06137725d27b708bdfe201c3e447050d49`; `p-analyze.mjs` bản P-a sha256 `211ee572b2d8755f7930bb60fd005167ca1af7d2fbbf5a59b52e1bb24a3e5fe1` |

## Sai lệch P-a (ghi 4/11 lúc 19:34, sau khi thấy kết quả lần 1)

Lần 1 báo "kết thúc còn lệnh kiểm tra đỏ: 11/47" nhưng không tách được đỏ do nhiệm vụ gây ra khỏi đỏ có sẵn trước khi sửa. Đã thêm ba trường vào `p-extract.mjs`: số lệnh đỏ ở baseline, số lệnh đỏ mới (đỏ ở `latest` mà cùng lệnh không đỏ ở `baseline`), số lệnh bị chặn theo chính sách. Rồi trích lại. Các thước đo P-1, P-2, P-3 khác không đổi; số liệu P-1/P-2 hai lần trích trùng nhau.

## Kết quả (chỉ mô tả, theo §9 V4-3f khối P)

Đầu ra của `node docs/research/analysis/p-analyze.mjs <tệp trên máy giám đốc>`.

| Thước đo | Giá trị |
|---|---|
| Đơn vị | 54 lượt phòng có ≥ 2 hạng mục đủ mốc thời gian, thuộc 53 nhiệm vụ, 6 dự án; 269 hạng mục. 53/54 lượt ở dự án `isolation: worktree` |
| P-1: lượt có ≥ 2 hạng mục chạy cùng lúc | **42/54 = 77,8 %** (Clopper–Pearson 95 % [64,4; 88,0]); tối đa 4 hạng mục cùng lúc |
| P-1: hệ số chồng Σ thời lượng / thời gian thực | trung vị **1,32** (IQR 1,17–1,63; lớn nhất 2,39) |
| P-2: thời gian pha thực thi tiết kiệm (cận trên) | 1366 phút làm việc trong 990 phút thực: **375 phút, 27,5 %** |
| P-2: so với đường găng | ở các lượt có chạy chồng, thời gian thực gần bằng đường găng theo phụ thuộc (vd. 15,3 so với 12,2; 18,7 so với 18,6 phút): lợi ích còn lại bị giới hạn bởi phụ thuộc, không bởi lịch chạy |
| P-3: gộp worktree con | 207 lần gộp xong; **6 lần xung đột khi gộp = 2,8 %** trên 213 lần gộp (CI [1,0; 6,0]); 0 hạng mục còn xung đột; 0 hạng mục phải làm lại lần lượt |
| P-3: lệnh kiểm tra đỏ lúc kết thúc | 11/47 nhiệm vụ có lệnh đỏ; 12 nhiệm vụ đỏ từ trước khi sửa; **đỏ mới do nhiệm vụ: 2/47 = 4,3 %** (CI [0,5; 14,5]) |
| Lượt không chạy chồng | 12/54: 6 lượt chỉ có chuỗi phụ thuộc; 6 lượt có hạng mục độc lập nhưng vẫn lần lượt; 4 nhiệm vụ có tin "làm lần lượt" |

**Cách đọc:**
- Đây là dữ liệu quan sát từ 53 nhiệm vụ của 6 dự án trên server chính, không ngẫu nhiên hóa.
- 27,5 % là cận trên, vì hạng mục chạy chồng có thể chậm hơn khi chạy một mình. Con số chưa so với chạy đơn; phần so sánh đó là E8.
