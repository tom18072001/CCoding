# SPEC: Tính năng "Log Export" cho log platform

Phân loại tài liệu: internal. Tài liệu độc lập công nghệ (repo trống, chưa biết stack). Mọi dữ liệu ví dụ là dữ liệu giả.
Trạng thái: DRAFT chờ khách hàng xác nhận mục `## Open questions and assumptions`.

## 1. Mục tiêu và phạm vi

**Mục tiêu.** Cho Branch Manager tự xuất access log của team mình trong tháng lịch trước ra CSV bằng một nút "Log Export". Dữ liệu cá nhân (IP, username) mặc định luôn được che phía server. Nhu cầu forensic cần dữ liệu đầy đủ được đáp ứng bằng một luồng riêng, có phê duyệt và kiểm soát.

**Trong phạm vi**
- Nút Log Export, API tạo, theo dõi, tải export (đồng bộ và chạy nền).
- Masking phía server, CSV an toàn, retention, audit metadata.
- Luồng "export không che" (unmasked) cho Forensic Officer, cần Approver thứ hai.

**Ngoài phạm vi**
- Thay đổi cách thu thập hay lưu trữ access log gốc.
- Export định dạng khác CSV; lập lịch export định kỳ.
- Di chuyển dữ liệu từ hệ thống cũ.
- Lựa chọn công nghệ (stack) cụ thể.

**Nguyên tắc "Make it simple".** Chỉ áp dụng cho UI (một nút, mặc định hợp lý, ít lựa chọn). Không được dùng để bỏ kiểm soát truy cập, masking, phê duyệt hay audit.

## 2. Bảng mâu thuẫn trong yêu cầu khách hàng

| ID | Mâu thuẫn | Cách xử lý trong spec (giả định) | Xác nhận bởi |
|---|---|---|---|
| C1 | "IP đầy đủ và username cho forensic" và "không dữ liệu cá nhân nào rời platform khi chưa che" | Mặc định luôn che phía server. Bản không che chỉ qua luồng riêng của Forensic Officer: có lý do, Approver thứ hai, mã hoá, link hết hạn. Branch Manager không bao giờ nhận bản không che. | CISO, DPO, khách hàng |
| C2 | "Export mọi thứ user nhìn thấy" và "log của team, tháng trước" | Phạm vi = giao của (log user được quyền xem) ∩ (team của user) ∩ (tháng lịch trước theo Asia/Ho_Chi_Minh). | Khách hàng (business owner) |
| C3 | "Giữ file vĩnh viễn để audit" và "xoá dữ liệu cá nhân quá 12 tháng" | File export chứa dữ liệu cá nhân bị xoá trong tối đa 12 tháng. Chỉ audit metadata không chứa dữ liệu cá nhân (exportId, người yêu cầu, team, kỳ, số dòng, SHA-256, người duyệt) được giữ lâu dài. | Pháp chế/DPO |
| C4 | "Xong trong 5 giây" và "export mọi thứ" khi khối lượng chưa biết | Đồng bộ tới N = 100.000 dòng với p95 ≤ 5 s. Vượt N chạy nền: trả 202 kèm trạng thái, SLA 5 s không áp dụng cho tổng thời gian. | Khách hàng, kiến trúc sư |

## 3. Vai trò

| Vai trò | Mô tả | Quyền |
|---|---|---|
| Branch Manager (BM) | Quản lý chi nhánh | Tạo export masked cho team của mình, kỳ tháng lịch trước. Tải file của chính mình. Không nhận bản unmasked. |
| Forensic Officer (FO) | Điều tra an ninh | Tạo yêu cầu export unmasked kèm lý do (mã vụ việc). Chỉ tải được sau khi được duyệt. |
| Approver | Người duyệt thứ hai (ví dụ trưởng bộ phận ATTT) | Duyệt hoặc từ chối yêu cầu unmasked. Không được trùng người yêu cầu (four-eyes). |
| Auditor | Kiểm toán nội bộ | Chỉ đọc audit metadata. Không đọc nội dung file và không đọc dữ liệu cá nhân. |

## 4. User story và tiêu chí nghiệm thu

**US-01 (Must).** Là BM, tôi muốn bấm "Log Export" để tải CSV access log của team tháng trước, để báo cáo mà không cần nhờ IT.
- Cho BM có team T, Khi bấm Log Export, Thì hệ thống tạo export với kỳ = tháng lịch trước theo Asia/Ho_Chi_Minh và team = T, không cần chọn tham số nào khác.
- Cho tập ≤ 100.000 dòng, Khi gọi `POST /api/exports`, Thì p95 thời gian trả file ≤ 5 s trên dữ liệu kiểm thử đã định (xem mục 7).
- Cho file tải về, Thì không ô nào chứa IP đầy đủ hay username đầy đủ (kiểm bằng script quét regex).

**US-02 (Must).** Là BM, tôi chỉ muốn thấy và xuất log trong quyền của mình, để không lộ dữ liệu của team khác.
- Cho BM của team A, Khi gửi `teamId` của team B, Thì nhận 403 và có bản ghi audit từ chối.
- Cho log mà BM không có quyền xem, Thì không có dòng đó trong file (kiểm bằng so sánh tập dòng).
- Cho bản ghi nằm ngoài tháng lịch trước (tính theo +07:00, gồm 00:00:00 ngày đầu và 23:59:59.999 ngày cuối), Thì không xuất hiện.

**US-03 (Must).** Là BM, khi dữ liệu lớn tôi muốn export chạy nền và báo trạng thái, để không bị treo màn hình.
- Cho kết quả > 100.000 dòng, Khi gọi `POST /api/exports`, Thì nhận 202 kèm `exportId` và trạng thái `QUEUED`, phản hồi ≤ 1 s.
- Cho export chạy nền, Khi gọi `GET /api/exports/{id}`, Thì trả `status` ∈ {QUEUED, RUNNING, READY, FAILED, EXPIRED} kèm `rowCount` khi READY.
- Cho export FAILED, Thì trả mã lỗi và thông điệp không chứa dữ liệu cá nhân.

**US-04 (Must).** Là FO, tôi muốn yêu cầu bản không che có lý do, để phục vụ điều tra mà vẫn tuân thủ chính sách.
- Cho yêu cầu unmasked thiếu `reason` hoặc `caseId`, Thì trả 400.
- Cho yêu cầu hợp lệ, Thì trạng thái `PENDING_APPROVAL` và chưa có file nào được tạo hay tải.
- Cho người yêu cầu cũng là Approver, Khi duyệt, Thì bị từ chối (403).
- Cho BM (không có vai trò FO) gọi tạo unmasked, Thì nhận 403.

**US-05 (Must).** Là Approver, tôi muốn duyệt hoặc từ chối yêu cầu unmasked, để có kiểm soát hai người.
- Cho yêu cầu PENDING_APPROVAL, Khi duyệt, Thì file được tạo, mã hoá at-rest, và link tải có TTL (giả định 24 giờ).
- Cho link quá TTL, Khi tải, Thì nhận 410 và trạng thái `EXPIRED`.
- Cho yêu cầu bị từ chối, Thì không bao giờ có file và có audit entry kèm người duyệt.

**US-06 (Must).** Là Auditor, tôi muốn xem audit metadata, để kiểm tra mà không chạm dữ liệu cá nhân.
- Cho mỗi export, Thì có bản ghi gồm exportId, người yêu cầu, team, kỳ, mode (masked/unmasked), số dòng, SHA-256, người duyệt, thời điểm tạo, thời điểm tải.
- Cho bản ghi audit, Thì quét tự động không tìm thấy IP hay username dạng đầy đủ.
- Cho Auditor gọi `/download`, Thì nhận 403.

**US-07 (Must).** Là DPO, tôi muốn file chứa dữ liệu cá nhân bị xoá đúng hạn, để tuân thủ retention.
- Cho file masked/unmasked quá hạn, Khi job retention chạy, Thì file bị xoá và status = `EXPIRED`/`DELETED`, còn audit metadata được giữ.
- Cho job chạy, Thì mọi file có tuổi > ngưỡng đã cấu hình (tối đa 12 tháng) đều bị xoá; có báo cáo số file xoá mỗi lần chạy.

**US-08 (Should).** Là BM, tôi muốn CSV mở được trong Excel mà không bị lỗi, để dùng ngay.
- Cho file CSV, Thì có UTF-8 BOM, thời gian theo ISO 8601 +07:00, tiếng Việt có dấu hiển thị đúng.
- Cho ô bắt đầu bằng `=`, `+`, `-`, `@`, Thì được thêm tiền tố `'`.

## 5. Yêu cầu chức năng

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-01 | Nút Log Export hiển thị cho BM và FO có quyền. Một click tạo export masked mặc định. | Must |
| FR-02 | `POST /api/exports`: body `{ "mode": "MASKED" \| "UNMASKED", "teamId"?, "reason"?, "caseId"? }`. Kỳ luôn do server tính (tháng lịch trước), client không gửi được. MASKED ≤ N dòng: 200 kèm `exportId` và `downloadUrl`. > N dòng: 202. UNMASKED: 202 kèm status PENDING_APPROVAL. | Must |
| FR-03 | `GET /api/exports/{id}`: trả `status`, `mode`, `rowCount`, `period`, `expiresAt`. Chỉ người yêu cầu, Approver liên quan và Auditor (metadata) được gọi. | Must |
| FR-04 | `GET /api/exports/{id}/download`: stream CSV khi READY. Kiểm lại quyền ở mỗi lần gọi. Ghi audit mỗi lần tải. Unmasked: link dùng một lần hoặc TTL ngắn. | Must |
| FR-05 | `POST /api/exports/{id}/approve` và `/reject` (Approver, bắt buộc `comment` khi reject). Four-eyes. | Must |
| FR-06 | Phạm vi dữ liệu do server tính: log được quyền xem ∩ team của user ∩ tháng lịch trước (Asia/Ho_Chi_Minh). Không tin tham số từ client. | Must |
| FR-07 | Masking phía server trước khi ghi file. Không có đường nào để client yêu cầu bỏ che mà không qua luồng phê duyệt. | Must |
| FR-08 | Job retention xoá file theo TTL, giữ audit metadata. | Must |
| FR-09 | Audit mọi hành động: tạo, duyệt, từ chối, tải, xoá, bị từ chối quyền. | Must |
| FR-10 | Giới hạn tần suất (rate limit) theo user, ví dụ 10 export/giờ (giả định, xem Q11). | Should |
| FR-11 | Thông báo cho người yêu cầu khi nền xong hoặc khi được duyệt. | Could |

## 6. Yêu cầu phi chức năng

**NFR-01 Masking (mặc định, server-side).**
- IPv4: che octet cuối (ví dụ `203.0.113.xxx`).
- IPv6: giữ prefix /48, phần còn lại che.
- Username: giữ 2 ký tự đầu cộng pseudonym HMAC (ví dụ `ab***_7f3a9c`). HMAC-SHA-256 với khoá bí mật do KMS quản lý, ổn định trong một kỳ để đối chiếu nhưng không đảo ngược được.
- Các trường khác có thể chứa dữ liệu cá nhân (URL query, user-agent, message) cần rà soát (Q8). Đến khi xác nhận, không đưa các trường này vào export.

**NFR-02 Hiệu năng.** p95 ≤ 5 s tới N = 100.000 dòng (đồng bộ), N cấu hình được. Vượt N chạy nền, có progress và trạng thái. Streaming, không nạp toàn bộ vào bộ nhớ.

**NFR-03 Định dạng CSV.**
- UTF-8 với BOM; phân tách bằng dấu phẩy; xuống dòng CRLF; quote theo RFC 4180.
- Thời gian ISO 8601 có offset `+07:00`.
- Chống CSV injection: ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm tiền tố `'`.
- Tên cột và thứ tự theo mẫu hệ thống cũ (đang chờ mẫu, Q1). Tạm dùng: `timestamp,username,client_ip,method,resource,status,team`.

**NFR-04 Retention.**
- File chứa dữ liệu cá nhân: xoá tối đa 12 tháng kể từ ngày tạo; mặc định đề xuất ngắn hơn (masked 30 ngày, unmasked 7 ngày kể từ khi duyệt), cấu hình được.
- Audit metadata giữ dài hạn, không chứa dữ liệu cá nhân.
- Xoá an toàn (kể cả bản sao và backup theo chu kỳ của backup, Q10).

**NFR-05 Bảo mật.**
- RBAC theo mục 3; kiểm quyền phía server ở mọi endpoint (chống IDOR trên `{id}`).
- Mã hoá in-transit (TLS) và at-rest cho file; unmasked dùng khoá riêng.
- Link tải ký số, hết hạn, gắn với người dùng đã xác thực.
- Không log dữ liệu cá nhân thô trong application log.
- Audit log chống sửa (append-only).

**NFR-06 Khả dụng và truy vết.** Mọi export có `exportId` duy nhất, tính SHA-256 của file để kiểm toàn vẹn.

## 7. Kế hoạch kiểm thử

| ID | Loại | Nội dung | Kết quả mong đợi |
|---|---|---|---|
| T-01 | Chức năng | BM tạo export mặc định | File đúng kỳ và team, đã che |
| T-02 | Phân quyền | BM gửi teamId khác; gọi `{id}` của người khác | 403, có audit |
| T-03 | Phạm vi | Dữ liệu biên 00:00:00 ngày 1 và 23:59:59 ngày cuối tháng (+07:00); dữ liệu UTC lệch ngày | Đúng biên theo múi giờ |
| T-04 | Masking | Quét file bằng regex IPv4/IPv6 đầy đủ và username đầy đủ (dữ liệu giả) | 0 kết quả |
| T-05 | Masking | Cùng username trong cùng kỳ | Cùng pseudonym; khác kỳ/khoá: khác |
| T-06 | CSV | Ô `=1+1`, `+x`, `-x`, `@x`; tiếng Việt có dấu; BOM; quote/xuống dòng trong ô | Có tiền tố `'`, mở đúng trong Excel |
| T-07 | Hiệu năng | 100.000 dòng, chạy lặp ≥ 30 lần | p95 ≤ 5 s |
| T-08 | Chạy nền | 100.001 dòng và lớn hơn | 202; trạng thái chuyển QUEUED → RUNNING → READY |
| T-09 | Unmasked | Thiếu lý do; tự duyệt; BM gọi; chưa duyệt mà tải | 400/403/403/403 |
| T-10 | Unmasked | Duyệt, tải trong TTL, tải sau TTL | 200, 410 |
| T-11 | Retention | Giả lập đồng hồ tiến quá hạn, chạy job | File xoá, audit còn |
| T-12 | Audit | Mọi hành động có bản ghi; quét audit không có dữ liệu cá nhân | Đạt |
| T-13 | Auditor | Auditor đọc metadata; gọi `/download` | 200; 403 |
| T-14 | Bảo mật | Thử tham số `period`/`mode` giả mạo từ client; IDOR | Bị bỏ qua hoặc 403 |

Lệnh/chạy kiểm thử cụ thể sẽ định sau khi chọn stack (Q12).

## Open questions and assumptions

| ID | Câu hỏi | Giả định tạm |
|---|---|---|
| Q1 | "Như hệ thống cũ": mẫu CSV hệ cũ (cột, thứ tự, phân tách, encoding) là gì? | Dùng bộ cột ở NFR-03 theo UTF-8 BOM; thay bằng mẫu thật khi khách gửi. |
| Q2 | Định nghĩa "team" của Branch Manager: theo chi nhánh, phòng ban hay nhóm quản lý trực tiếp? Một BM có thể quản nhiều team không? | Team = tập user thuộc chi nhánh của BM theo danh bạ/IAM; BM nhiều team chỉ xuất từng team được gán, mỗi lần một team. |
| Q3 | "Tháng trước" là tháng lịch hay 30 ngày gần nhất? Múi giờ nào? | Tháng lịch trước, 00:00:00 ngày 1 đến hết ngày cuối, theo Asia/Ho_Chi_Minh (+07:00). |
| Q4 | "Rời platform" nghĩa là gì: tải về trình duyệt, gửi email, lưu ra thiết bị người dùng, hay chỉ ra ngoài mạng nội bộ? | Mọi file tải về hoặc gửi ra khỏi hệ thống đều là "rời platform"; nên phải che hết trừ luồng phê duyệt. |
| Q5 | Quy tắc che nào được chấp nhận (C1)? | IPv4 che octet cuối; IPv6 giữ /48; username giữ 2 ký tự đầu + pseudonym HMAC-SHA-256 (khoá KMS). |
| Q6 | (C1) Bản không che có thực sự cần không, và ai là FO và Approver? Có chấp nhận luồng riêng với Approver thứ hai, lý do, mã hoá, link hết hạn không? | Có luồng riêng đó; BM không bao giờ nhận bản unmasked; Approver ≠ người yêu cầu; TTL link 24 giờ. |
| Q7 | (C2) "Mọi thứ user nhìn thấy" có vượt quá team và tháng trước không (ví dụ BM muốn kỳ khác, nhiều tháng)? | Không; phạm vi = log được quyền xem ∩ team ∩ tháng lịch trước. Kỳ khác là yêu cầu thay đổi riêng. |
| Q8 | Log có những trường nào (URL, user-agent, message…) và trường nào là dữ liệu cá nhân cần che? | Chỉ xuất 7 cột ở NFR-03; trường khác loại bỏ cho tới khi rà soát. |
| Q9 | (C3) File export giữ bao lâu? Pháp chế/DPO xác nhận khoảng giữ file và việc giữ audit metadata lâu dài? | File chứa dữ liệu cá nhân xoá tối đa 12 tháng (mặc định masked 30 ngày, unmasked 7 ngày); audit metadata không chứa dữ liệu cá nhân giữ dài hạn. |
| Q10 | Mốc 12 tháng tính từ đâu: từ thời điểm sinh log hay từ lúc tạo export? Backup có phải xoá không? | Tính từ ngày tạo file (và log gốc theo chính sách riêng); backup hết hạn theo chu kỳ, tối đa 12 tháng. |
| Q11 | Cần duyệt trước và giới hạn số lần export cho BM masked không? | Masked không cần duyệt; rate limit 10 export/giờ/user; unmasked luôn cần duyệt. |
| Q12 | Stack công nghệ và nguồn IAM/danh bạ team (AD, IAM nội bộ, HR)? | Spec độc lập công nghệ; IAM cung cấp vai trò và team qua API/claim; stack chốt ở giai đoạn thiết kế. |
| Q13 | Cơ sở pháp lý áp dụng: Luật Bảo vệ dữ liệu cá nhân, Nghị định 13/2023/NĐ-CP, quy định NHNN về lưu log/an toàn thông tin. Điều khoản cụ thể nào? | Chưa xác minh điều khoản; thiết kế theo nguyên tắc tối thiểu hoá dữ liệu, mục đích rõ, hạn lưu giới hạn; pháp chế rà soát trước khi build. |
| Q14 | Mã hoá và nơi lưu dữ liệu (trong nước, on-prem/cloud), cấp độ an toàn hệ thống thông tin của platform? | Lưu trong hạ tầng của ngân hàng tại Việt Nam, AES-256 at-rest, TLS 1.2+; cấp độ ATTT chờ khách xác nhận. |
| Q15 | (C4) Khối lượng log tháng thực tế của một team? Ngưỡng N đồng bộ? Mốc 5 giây tính đến khi nào? | N = 100.000 dòng, p95 ≤ 5 s từ lúc gửi request đến byte đầu tiên của file hoàn chỉnh; vượt N thì chạy nền (202). |
| Q16 | "Make it simple" có nghĩa bỏ phê duyệt, masking hay audit không? | Không; chỉ áp dụng cho UI (một nút, không tuỳ chọn thừa); kiểm soát giữ nguyên. |
| Q17 | Auditor được xem gì? Có cần xem nội dung file không? | Chỉ audit metadata, không xem nội dung file hay dữ liệu cá nhân. |

Ghi chú truy vết: C1 → Q4, Q5, Q6, Q8; C2 → Q2, Q3, Q7; C3 → Q9, Q10, Q13; C4 → Q15.

## Phụ lục: ví dụ CSV (dữ liệu giả)

```
timestamp,username,client_ip,method,resource,status,team
2026-10-05T09:15:02+07:00,ab***_7f3a9c,203.0.113.xxx,GET,/portal/home,200,TEAM-DEMO
```
