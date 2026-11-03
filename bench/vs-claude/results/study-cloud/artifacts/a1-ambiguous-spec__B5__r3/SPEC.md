# SPEC: Log Export (self-service) — Log Platform

Trạng thái: DRAFT chờ khách hàng xác nhận các mục ở phần "Open questions and assumptions". Repo hiện trống (chưa có stack), nên spec trung lập về công nghệ.

## 1. Mục tiêu
Nút "Log Export" cho phép Branch Manager tự xuất access log của nhóm (team) mình trong **tháng lịch trước** ra CSV, phục vụ forensic/audit, mà vẫn tuân thủ chính sách bảo vệ dữ liệu cá nhân của ngân hàng.

**Lưu ý quan trọng:** v1 (masked) **chưa đáp ứng nhu cầu forensic** của khách hàng (cần IP và username đầy đủ). Nhu cầu đó chỉ được đáp ứng ở v1.1 sau khi khách hàng/DPO xác nhận Q1. Khách hàng cần biết điều này trước khi chấp nhận phạm vi v1.

## 2. Các mâu thuẫn trong brief (phải giải quyết)
| # | Mâu thuẫn | Hướng giải quyết tạm thời (assumption) |
|---|---|---|
| C1 | "Full IP + username" vs "không PII nào rời platform khi chưa mask" | Mặc định export **masked**. Bản **unmasked** là quyền riêng (role `Forensic`), cần phê duyệt, mã hóa, ghi audit; chỉ bật khi khách hàng/DPO xác nhận (Q1). |
| C2 | "Export mọi thứ user thấy được" vs "chỉ team, tháng trước" | Phạm vi = giao của (quyền xem hiện có) ∩ (team của manager) ∩ (tháng trước). Mọi thứ ngoài đó từ chối. |
| C3 | "Giữ file mãi mãi" vs "xóa PII > 12 tháng" | Giả định an toàn: bản masked/pseudonym **vẫn có thể là dữ liệu cá nhân** (Q4a). Vì vậy **mọi file export, kể cả masked**, bị xóa sau 12 tháng kể từ ngày sự kiện cũ nhất trong file. Chỉ metadata audit không chứa PII (user, thời điểm, team, số dòng, hash) được giữ lâu hơn ("kept forever" áp dụng cho metadata này). Cần quyết định pháp lý (Q4). |
| C4 | "Xong trong 5 giây" vs "mọi thứ user thấy" | SLA 5s áp dụng cho tới P95 ≤ 100.000 dòng; vượt ngưỡng chuyển sang export bất đồng bộ (Q5). |
| C5 | "Như hệ thống cũ" vs không có tài liệu hệ thống cũ | Giả định: CSV UTF-8 có BOM, dấu phẩy, header một dòng (Q7). |
| C6 | "Make it simple" vs yêu cầu kiểm soát/audit | Giữ UI một nút; độ phức tạp nằm ở backend. Không thêm tùy chọn lọc trong v1. |

## 3. Phạm vi
**Trong phạm vi (v1):** nút Export, kiểm tra quyền, sinh CSV, masking, audit trail của hành động export, retention/xóa file, giới hạn tốc độ.
**Ngoài phạm vi:** định dạng khác CSV, lên lịch export, lọc tùy biến, gửi qua email, di chuyển dữ liệu từ hệ thống cũ.

## 4. Vai trò & quyền
- `BranchManager`: export log của team mình (tập user thuộc chi nhánh/team do manager quản lý theo danh mục tổ chức hiện có), chỉ tháng trước.
- `Forensic` (tùy chọn, theo Q1): được phép lấy bản unmasked, cần lý do + (giả định) duyệt bởi người thứ hai (four-eyes).
- Mọi user khác: không thấy nút; API trả 403.
- Quyền kiểm tra **phía server**, theo user trong session; không tin tham số client.

## 5. Yêu cầu chức năng
- FR1. Nút "Log Export" hiển thị cho BranchManager. Một click → tải file `access-logs_<teamId>_<YYYY-MM>.csv`. Khoảng thời gian cố định = tháng lịch trước theo múi giờ Asia/Ho_Chi_Minh (UTC+7), `[00:00 ngày 1, 00:00 ngày 1 tháng sau)`.
- FR2. Dữ liệu = access log của các user thuộc team của người gọi, lọc thêm theo quyền xem hiện có của người gọi (row-level permission không bị bỏ qua).
- FR3. Cột CSV (giả định, Q7): `timestamp_utc7, username, client_ip, action, resource, result, source_system`.
- FR4. **Masking mặc định:**
  - `username`: pseudonym HMAC với khóa **riêng cho từng export** (cùng user → cùng token trong một file để điều tra trong file đó; khác export → token khác, không tương quan chéo file; khóa sinh ngẫu nhiên, giữ trong KMS và hủy cùng lúc file bị xóa). Không dùng khóa HMAC ổn định toàn hệ thống.
  - `client_ip`: IPv4 che octet cuối (`10.20.30.x`); IPv6 giữ /48.
  - Không PII nào khác trong cột tự do (`resource`, URL query) — quét và che email, số điện thoại, số tài khoản/CCCD bằng regex.
- FR5. Chống CSV/formula injection: ô bắt đầu bằng `= + - @ \t \r` được thêm tiền tố `'`. Escape theo RFC 4180.
- FR6. Bản unmasked (chỉ nếu Q1 = có): yêu cầu role `Forensic`, nhập lý do, duyệt người thứ hai, file mã hóa at-rest, link tải một lần hết hạn sau 15 phút, ghi audit đầy đủ.
- FR7. Mỗi lần export ghi audit event bất biến: user, thời điểm, team, khoảng thời gian, masked/unmasked, số dòng, hash SHA-256 của file, kết quả. Audit event **không** chứa PII thô.
- FR8. Rate limit: tối đa 5 export/giờ/user; một export đồng thời/user.
- FR9. Thông báo lỗi không lộ PII hay chi tiết nội bộ.
- FR10. Tháng trước không có dữ liệu → file chỉ có header, thông báo "Không có dữ liệu".

## 6. Yêu cầu phi chức năng
- NFR1. Hiệu năng: ≤ 100.000 dòng → hoàn tất ≤ 5 giây (P95, đo từ click đến byte đầu/hoàn tất tải — Q5). Streaming, không nạp cả file vào RAM. Cần index theo `(team_id, timestamp)`.
- NFR2. Vượt 100.000 dòng: trả 202 + job bất đồng bộ, thông báo khi xong; vẫn áp dụng masking/audit/retention.
- NFR3. Bảo mật: TLS, file tạm lưu mã hóa, file export được lưu mã hóa tại platform (để phục vụ audit) và xóa theo quy tắc duy nhất ở mục 7; bản sao tạm ở bước sinh/job async xóa sau khi hoàn tất hoặc tối đa 24 giờ.
- NFR4. Tuân thủ: tuân thủ Luật Bảo vệ dữ liệu cá nhân / Nghị định 13/2023/NĐ-CP và quy định an toàn thông tin ngân hàng (đối chiếu pháp chế, Q4); dữ liệu lưu tại Việt Nam (Q9).
- NFR5. Khả năng quan sát: metric thời lượng, số dòng, tỉ lệ lỗi, số lần bị từ chối quyền.

## 7. Retention
- Log nguồn chứa PII: xóa/ẩn danh hóa PII khi > 12 tháng (job hằng ngày, idempotent, ghi audit số bản ghi xử lý).
- **Quy tắc duy nhất cho file export (masked và unmasked):** platform lưu bản file đã sinh (mã hóa) để phục vụ audit; xóa an toàn sau 12 tháng kể từ ngày sự kiện cũ nhất trong file; khóa HMAC/mã hóa của file bị hủy cùng lúc.
- Metadata audit (user, thời điểm, team, khoảng thời gian, chế độ, số dòng, hash SHA-256, kết quả) không chứa PII → giữ lâu dài (giả định 7 năm, Q4). Đây là nội dung của "giữ mãi để audit".
- Chỉ khi DPO xác nhận bản masked không phải dữ liệu cá nhân (Q4a) mới được kéo dài retention file masked.
- Vì chỉ export tháng trước (≤ ~2 tháng tuổi), file luôn hợp lệ lúc tạo; việc xóa là để tuân thủ hậu kỳ.
- Legal hold (Q4) có thể tạm hoãn xóa theo quyết định có văn bản.

## 8. API (đề xuất)
- `POST /api/v1/log-exports` body `{ "teamId": "..."}` (period cố định phía server) → 200 stream CSV `Content-Disposition: attachment` hoặc 202 `{jobId}`.
- `GET /api/v1/log-exports/{jobId}` → trạng thái / link tải.
- Lỗi: 401, 403 (không đủ quyền/không phải team của mình), 429 (rate limit), 422 (yêu cầu unmasked thiếu điều kiện).

## 9. Tiêu chí chấp nhận
1. BranchManager team A export → chỉ có log team A, tháng trước, không có team B (test cả khi sửa `teamId`).
2. Không file nào ở chế độ mặc định chứa IP đầy đủ hoặc username đầy đủ (test quét regex).
3. User không phải manager nhận 403, không có nút.
4. 100.000 dòng xong ≤ 5s P95 trên dữ liệu kiểm thử tổng hợp.
5. Ô `=cmd|...` được vô hiệu hóa trong CSV.
6. Job retention xóa/ẩn PII > 12 tháng; chạy lại không gây lỗi.
7. Mỗi export có đúng một audit event, không chứa PII.
8. Ranh giới tháng đúng theo UTC+7 (log 23:59 ngày cuối tháng, 00:00 ngày 1).

## 10. Open questions and assumptions
| # | Câu hỏi cần khách hàng xác nhận | Assumption tạm thời |
|---|---|---|
| Q1 | Mâu thuẫn "full IP/username cho forensic" vs "không PII rời platform khi chưa mask": có ngoại lệ forensic được duyệt không? Ai được phép, cơ chế duyệt? | Mặc định luôn masked; unmasked chỉ cho role `Forensic` + lý do + duyệt người thứ hai, mã hóa; **tắt** bằng feature flag cho đến khi xác nhận. |
| Q2 | "Rời platform" nghĩa là gì: tải về máy người dùng có tính là rời không? | Có — tải về là rời platform, nên phải masked. |
| Q3 | "Team" của branch manager được xác định thế nào (chi nhánh, cây tổ chức, nhóm AD)? Manager nhiều chi nhánh? Cấp dưới nhiều tầng? | Team = các user trực thuộc chi nhánh mà manager được gán trong danh mục tổ chức hiện có, gồm cả tầng dưới; manager nhiều chi nhánh chọn từng chi nhánh. |
| Q4 | Mâu thuẫn "giữ file mãi mãi" vs "xóa PII > 12 tháng": ý định đúng? Thời hạn lưu theo luật/quy định NHNN cho audit? Có legal hold? | Mọi file export xóa sau 12 tháng; chỉ metadata audit không PII giữ lâu (giả định 7 năm). Pháp chế quyết định. |
| Q4a | DPO có coi bản masked/pseudonym (IP che octet cuối, username pseudonym) là dữ liệu cá nhân không (Nghị định 13/2023)? | Có, coi là dữ liệu cá nhân cho đến khi DPO xác nhận ngược lại. |
| Q4b | "File giữ mãi" nghĩa là lưu bản file đã sinh, hay chỉ lưu bản ghi việc đã xuất (metadata/hash)? | Lưu bản file tối đa 12 tháng + metadata lâu dài (mục 7). |
| Q5a | "Mọi thứ user thấy được" có nghĩa là mở rộng ra ngoài team của manager hoặc ngoài tháng trước không? | Không; export = giao của quyền xem hiện có ∩ team ∩ tháng trước (C2). |
| Q5 | "Mọi thứ user thấy được" vs "tháng trước" vs 5 giây: ưu tiên cái nào? Khối lượng tối đa mỗi tháng/team? 5s đo ở đâu (server hay đến khi tải xong)? | Phạm vi = tháng trước ∩ team ∩ quyền xem; SLA 5s P95 ≤ 100k dòng, vượt thì async; đo đến hoàn tất phản hồi trong mạng nội bộ. |
| Q6 | "Tháng trước" = tháng lịch hay 30 ngày gần nhất? Múi giờ? Có cho chọn tháng khác không? | Tháng lịch trước, Asia/Ho_Chi_Minh, không cho chọn khác (v1). |
| Q7 | "Như hệ thống cũ": cần mẫu CSV cũ (cột, thứ tự, encoding, dấu phân cách, định dạng thời gian) và có hệ thống khác parse file không? | Cột ở FR3, UTF-8 BOM, dấu phẩy, ISO-8601 +07:00. |
| Q8 | Chuẩn masking cụ thể (số ký tự, IPv6, pseudonym có cần tương quan được)? DPO phê duyệt? | Như FR4 (IPv4 che octet cuối, IPv6 /48, username pseudonym HMAC khóa riêng mỗi export). |
| Q9 | Yêu cầu nội địa hóa dữ liệu, mã hóa, SIEM/lưu trữ audit bên ngoài? | Dữ liệu và khóa ở Việt Nam, mã hóa at-rest/in-transit, audit đẩy về kho audit nội bộ của platform. |
| Q10 | Log nguồn đã có thuộc tính nhạy cảm khác (số tài khoản, CCCD trong URL/tham số)? | Có thể có; áp dụng quét regex FR4 và che. |
| Q11 | Rate limit/số người dùng đồng thời dự kiến, giờ cao điểm? | 5 export/giờ/user, 1 đồng thời; ~50 export đồng thời toàn hệ thống. |
| Q12 | Xóa PII > 12 tháng: xóa hẳn bản ghi hay ẩn danh hóa (giữ bản ghi, bỏ định danh)? Áp dụng cả backup? | Ẩn danh hóa trường username/IP, giữ phần còn lại; backup hết vòng đời theo chính sách sao lưu (cần xác nhận). |
| Q13 | Ai được xem audit trail export và thông báo cho DPO/security khi xuất unmasked? | Role `Auditor` đọc; unmasked gửi thông báo tới security mailbox. |
| Q14 | "Make it simple": có chấp nhận quy trình duyệt/lý do cho bản unmasked, và giới hạn async với export lớn, không? | Có, vì bắt buộc bởi tuân thủ; UI vẫn là một nút cho luồng mặc định. |

## 11. Giai đoạn đề xuất
1. v1: export masked, quyền, audit, rate limit, retention job (không phụ thuộc Q1). **Chưa đáp ứng nhu cầu forensic** (cần IP/username đầy đủ).
2. v1.1: unmasked forensic (sau khi Q1/Q4 được xác nhận), async cho khối lượng lớn.
