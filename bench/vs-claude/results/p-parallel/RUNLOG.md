# Sổ chạy V4-3f-P: song song trong vận hành thật (server chính 7420)

Mốc khóa đăng ký trước: `f5a31dc` (§9 "Đăng ký trước V4-3f").

Phân loại dữ liệu: **Nội bộ**. **Repo này công khai, nên tệp từng lượt (`prod-parallel.json`) không commit.** Tệp nằm trên máy giám đốc, ngoài repo (đường dẫn không công bố); sha256 ghi ở bảng dưới để đối chiếu. Ở đây chỉ có số tổng hợp. Tệp chỉ có metadata: mốc thời gian, trạng thái, phụ thuộc, cờ gộp/xung đột, số lệnh đỏ, và số đếm ba mẫu tin nhắn hệ thống. Không có đề bài, tiêu đề, đầu ra hay nội dung tin nhắn. Mã nhiệm vụ băm kèm muối ngẫu nhiên không lưu; mã dự án đổi thành P1–P6. Đã kiểm danh sách khóa của tệp: chỉ có các trường trên.

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
| Đơn vị | 54 lượt phòng có ≥ 2 hạng mục đủ mốc thời gian, thuộc 53 nhiệm vụ; 269 hạng mục. Các lượt thuộc 5 dự án, cộng 1 lượt không thuộc dự án nào (cột `isolation = null`). 53/54 lượt ở dự án `isolation: worktree`. Phòng Dev 33 lượt, Phòng Nghiên cứu 21 lượt |
| P-1: lượt có ≥ 2 hạng mục chạy cùng lúc | **42/54 = 77,8 %** (Clopper–Pearson 95 % [64,4; 88,0]); tối đa 4 hạng mục cùng lúc |
| P-1: hệ số chồng Σ thời lượng / thời gian thực | trung vị **1,32** (IQR 1,17–1,63; lớn nhất 2,39) |
| P-2: thời gian pha thực thi tiết kiệm (cận trên) | 1366 phút làm việc trong 990 phút thực: **375 phút, 27,5 %** |
| P-2: so với đường găng | ở các lượt có chạy chồng, thời gian thực gần bằng đường găng theo phụ thuộc (vd. 15,3 so với 12,2; 18,7 so với 18,6 phút): lợi ích còn lại bị giới hạn bởi phụ thuộc, không bởi lịch chạy |
| P-3: gộp worktree con | 207 lần gộp xong; **6 lần xung đột khi gộp = 2,8 %** trên 213 lần gộp (CI [1,0; 6,0]); 0 hạng mục còn xung đột; 0 hạng mục phải làm lại lần lượt |
| P-3: lệnh kiểm tra đỏ lúc kết thúc | 11/47 nhiệm vụ có lệnh đỏ; 12 nhiệm vụ đỏ từ trước khi sửa; **đỏ mới do nhiệm vụ: 2/47 = 4,3 %** (CI [0,5; 14,5]) |
| Lượt không chạy chồng | 12/54: 8 lượt chỉ có chuỗi phụ thuộc; 4 lượt có hạng mục độc lập (tính phụ thuộc bắc cầu) mà vẫn lần lượt. Có 4 tin "làm lần lượt" ở 3 nhiệm vụ |
| Theo phòng | **Phòng Dev** (agent chạy lệnh, mỗi hạng mục một worktree con): 25/33 lượt chạy chồng, trung vị 1,34, tiết kiệm 27,2 %, cả 6 xung đột đều ở đây. **Phòng Nghiên cứu** (phần lớn agent không có quyền chạy lệnh, nên chạy song song được cả khi không có worktree): 17/21, trung vị 1,31, tiết kiệm 28,0 % |

**Cách đọc:**
- Đây là dữ liệu quan sát từ 53 nhiệm vụ của 6 dự án trên server chính, không ngẫu nhiên hóa.
- 27,5 % là cận trên, vì hạng mục chạy chồng có thể chậm hơn khi chạy một mình. Con số chưa so với chạy đơn; phần so sánh đó là E8.

## Sửa sau phản biện độc lập (4/11 lúc 20:55)

- **P-c:** cờ `independentPairs` của `p-analyze.mjs` lúc đầu chỉ xét phụ thuộc trực tiếp, nên chuỗi S1→S2→S3 bị coi là có cặp độc lập. Đã sửa thành phụ thuộc bắc cầu và thêm test. Đã sửa cả nhãn: "4 tin ở 3 nhiệm vụ", không phải "4 nhiệm vụ". `p-analyze.mjs` sau khi sửa: sha256 `c336213db8cfdffa15c6753073b03c86adeda99394bb9c85e7284c6e5ecfd921`. P-1, P-2, P-3 không đổi.
- **P-b (sai lệch quy trình):**
  - §9 đòi ghi sha256 script vào RUNLOG **trước** khi chạy. Thực tế người điều phối trích lúc 19:32 và 19:34, rồi mới viết RUNLOG; RUNLOG commit lần đầu ở `f9ed4ed` (19:49).
  - Hash của `p-extract.mjs` ở bảng trên khớp bản trên máy giám đốc lúc chạy, nhưng không có mốc git trước lần chạy.
- **Ẩn danh:** câu "nhãn không đảo ngược được" ở §9 **sai**. Tệp từng lượt còn `createdAt`; theo người phản biện, 33/57 nhãn băm nối ngược được về mã `T-YYYYMMDD-HHMMSS` có trong git log công khai. Đây là thêm một lý do để tệp từng lượt chỉ ở máy giám đốc. Nếu cần chia sẻ, phải bỏ hoặc làm mờ mốc giờ trước.
- **"Đỏ mới 2/47"** là chỉ số thêm sau khi thấy 11/47 (P-a). Nó đo lúc kết thúc nhiệm vụ, không phải ngay sau mỗi lần gộp. Khi báo phải nêu cả hai số.
- **Phạm vi diễn giải:**
  - P không có số token và không so với chạy đơn.
  - 21/54 lượt là Phòng Nghiên cứu, nơi song song không cần worktree. Bằng chứng gần nhất cho "song song có worktree" là 25/33 lượt của Phòng Dev, nhưng không có đối chứng.

## Chạy lại bằng `p-analyze.mjs` sau BRIEF-19 (13/11/2026, người điều phối)

- **Lý do:** Phòng Nghiên cứu sửa `p-analyze.mjs` ở `5c48f44` (BRIEF-19 S1: đếm lệnh đỏ theo nhiệm vụ, CP 95 %, theo phòng, đường găng) nhưng không chạy được trên dữ liệu thật, vì tệp từng lượt chỉ có trên máy giám đốc.
- **Chạy:** người điều phối chạy trên bản sao của tệp dùng để báo (sha256 `4aec47f0a5b6481c…`, khớp bảng trên), bằng `p-analyze.mjs` sha256 `afced0cf1b5cd22c…`. Chỉ ghi số tổng hợp; tệp từng lượt vẫn không vào repo.
- **Kết quả:** P-1, P-2 và P-3 **trùng với bảng trên**: 42/54 [64,4; 88,0]; trung vị 1,32 (IQR 1,17–1,63); 375 phút, 27,5 %; xung đột 6/213 [1,0; 6,0]; đỏ mới 2/47 [0,5; 14,5]; theo phòng Dev 25/33, 27,2 % và Nghiên cứu 17/21, 28,0 %.
- **Số mới, mô tả, ngoài đăng ký:** ở các lượt có chạy chồng, thời gian thực pha thực thi so với đường găng theo phụ thuộc là:
  - tất cả: **771 so với 717 phút** (42 lượt);
  - Phòng Dev: 516 so với 463;
  - Phòng Nghiên cứu: 254 so với 253.
  Thời gian thực đã sát cận dưới của song song không giới hạn (+7,5 % tổng). Phần lợi ích còn lại bị giới hạn bởi phụ thuộc giữa hạng mục, không bởi lịch chạy. Câu ở dòng P-2 của bảng trên (ví dụ từng lượt) giữ nguyên; số gộp này thay cho ví dụ khi báo.
