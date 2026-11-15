# SPEC — Tính năng "Log Export" (self-service)

Phân loại: internal · Trạng thái: DRAFT chờ khách hàng xác nhận các câu hỏi CHẶN · Repo hiện trống (chưa có code/stack) nên mọi chi tiết hiện thực là gợi ý, chưa xác minh với hệ thống thật.

## 1. Mục tiêu và phạm vi

**Mục tiêu:** Branch manager tự xuất access log của nhóm mình trong tháng trước ra CSV chỉ với một nút, an toàn về dữ liệu cá nhân (DLCN), có audit.

**Trong phạm vi v1:** nút "Export logs"; xuất CSV masked; đồng bộ ≤100.000 dòng, job nền khi vượt; phân quyền theo team; audit record; hết hạn file; xóa/ẩn danh DLCN >12 tháng.

**Ngoài phạm vi v1:** xuất unmasked (quy trình forensic 4-eyes riêng); định dạng khác CSV; lịch xuất định kỳ; xuất log của nhóm khác/toàn chi nhánh ngoài quyền; chỉnh sửa log.

## 2. Mâu thuẫn trong brief và cách giải

| Mã | Mâu thuẫn | Cách giải (giả định tạm) |
|---|---|---|
| C1 | Cần IP/username đầy đủ cho forensic ↔ không DLCN nào rời nền tảng khi chưa che | Self-service **luôn masked**: IP che octet cuối (IPv6: che 80 bit cuối), username → pseudonym HMAC-SHA256 có khóa. Bản unmasked chỉ qua quy trình forensic có phê duyệt 4-eyes, **không thuộc v1**. |
| C2 | "Nhóm mình, tháng trước" ↔ "mọi thứ nhìn thấy được" | Lấy **giao** hai điều kiện: log thuộc team của manager **và** nằm trong tháng dương lịch trước. Không cho chọn rộng hơn. |
| C3 | 5 giây ↔ khối lượng không giới hạn | ≤100.000 dòng: xuất đồng bộ, p95 ≤5 s. Vượt: job nền, trả job-id, thông báo khi xong. |
| C4 | Giữ file vĩnh viễn ↔ xóa DLCN >12 tháng | File export tự hết hạn và xóa sau **30 ngày**. Chỉ **audit record không chứa DLCN** được giữ vĩnh viễn. |
| C5 | "Đơn giản" ↔ yêu cầu forensic và audit | UI chỉ một nút, không tùy chọn; mọi kiểm soát (quyền, masking, audit, giới hạn) nằm ở backend. |
| C6 | "Như hệ thống cũ" nhưng không có mẫu | Cần file CSV mẫu của hệ cũ (đã che dữ liệu). Tạm dùng schema ở mục 5. |

## 3. Yêu cầu chức năng

| Mã | Yêu cầu | Ưu tiên |
|---|---|---|
| FR-1 | Hiển thị nút "Export logs" chỉ cho vai trò branch manager. | Must |
| FR-2 | Một lần bấm xuất log của team người dùng trong tháng dương lịch trước (theo timezone ở NFR), không có tham số tùy chỉnh. | Must |
| FR-3 | Backend lọc theo team-membership của người gọi tại thời điểm xuất; từ chối (403) mọi team khác dù sửa request. | Must |
| FR-4 | Mọi DLCN trong CSV được che: IP che octet cuối; username là pseudonym HMAC ổn định (cùng user → cùng pseudonym trong cùng kỳ). Khóa HMAC lưu trong KMS/secret store, không nằm trong code. | Must |
| FR-5 | ≤100.000 dòng: trả file đồng bộ. >100.000: tạo job nền, người dùng nhận thông báo và tải qua link có hạn. | Must |
| FR-6 | Ghi audit record mỗi lần xuất: user, team, kỳ, số dòng, trạng thái, thời điểm, hash file, loại masking. Audit record không chứa IP/username thật. Giữ vĩnh viễn, append-only. | Must |
| FR-7 | File export và link tải hết hạn sau 30 ngày (link: 24 giờ, tải tối đa 3 lần); sau đó xóa file. | Must |
| FR-8 | Job định kỳ xóa hoặc ẩn danh không hồi phục DLCN trong log gốc >12 tháng (xác nhận Q3); ghi audit số bản ghi xử lý. | Must |
| FR-9 | Rate limit: tối đa 5 lần xuất/user/giờ; tối đa 1 job nền đồng thời/user. | Should |
| FR-10 | Kỳ không có dữ liệu: trả CSV chỉ có header và thông báo "Không có log". Lỗi: thông báo rõ, không lộ chi tiết nội bộ. | Should |

## 4. NFR

- **Hiệu năng:** p95 ≤5 s cho ≤100.000 dòng trên dữ liệu UAT cỡ tương đương (chưa xác minh khả thi; cần đo).
- **Bảo mật:** TLS; kiểm tra quyền phía server; file mã hóa at-rest; link tải có chữ ký, gắn user; CSV chống formula injection (tiền tố `'` cho ô bắt đầu bằng `= + - @`).
- **Tuân thủ:** chính sách ATTT của ngân hàng và Nghị định 13/2023/NĐ-CP về bảo vệ DLCN — chưa đối chiếu văn bản; xem Q7.
- **Timezone:** Asia/Ho_Chi_Minh (UTC+7) cho "tháng trước"; cột thời gian ghi ISO 8601 kèm offset.
- **Khả năng quan sát:** metric số lần xuất, thời gian, lỗi, kích thước job.
- **Mã hóa ký tự:** UTF-8 (có BOM hay không theo Q4).

## 5. Schema CSV (giả định, chờ mẫu hệ cũ)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| timestamp | ISO 8601 +07:00 | thời điểm truy cập |
| user_pseudonym | string | HMAC-SHA256 rút gọn 16 hex |
| client_ip_masked | string | `192.0.2.xxx`; IPv6 che 80 bit cuối |
| team_id | string | |
| action | string | |
| resource | string | không chứa DLCN; nếu có, che |
| result | enum | success/failure |
| status_code | int | |

Dấu phân cách `,`, quote theo RFC 4180, xuống dòng CRLF; tên file `access-logs_<team_id>_<YYYY-MM>.csv`.

## 6. Tiêu chí nghiệm thu (đo được)

- AC-1: Cho manager team A, Khi bấm nút, Thì CSV chỉ chứa dòng có team_id=A và timestamp trong tháng trước (UTC+7); 0 dòng ngoài tập này.
- AC-2: Khi gọi API với team B, Thì HTTP 403 và có audit record trạng thái denied.
- AC-3: Quét regex trên CSV: 0 IPv4 đầy đủ, 0 username gốc (so với tập dữ liệu seed giả).
- AC-4: Cùng user trong cùng file luôn cho cùng pseudonym; hai user khác nhau cho pseudonym khác nhau.
- AC-5: Với 100.000 dòng, p95 ≤5 s trong 30 lần chạy; với 100.001 dòng, phản hồi ≤2 s kèm job-id.
- AC-6: Sau 30 ngày (giả lập đồng hồ), file không còn tải được và đã bị xóa khỏi storage; audit record vẫn còn.
- AC-7: Audit record không chứa IP/username thật (quét tự động = 0 khớp).
- AC-8: Sau job retention, 0 bản ghi DLCN có timestamp >12 tháng.
- AC-9: Lần xuất thứ 6 trong 1 giờ trả HTTP 429.
- AC-10: Ô bắt đầu bằng `=`, `+`, `-`, `@` được vô hiệu hóa trong CSV.
- AC-11: Kỳ rỗng trả CSV chỉ header.

## 7. Gợi ý hiện thực (chưa ràng buộc stack)

- Endpoint `POST /api/log-exports` (trả file hoặc `202` + job-id), `GET /api/log-exports/{id}`, `GET /api/log-exports/{id}/download`.
- Streaming ghi CSV từ cursor để giới hạn bộ nhớ; đếm trước (`COUNT`) để quyết định đồng bộ/nền; index theo (team_id, timestamp).
- Masking trong tầng truy vấn/serializer duy nhất, không có đường code trả dữ liệu thô.
- Bảng `export_audit` append-only (quyền chỉ INSERT); object storage có lifecycle rule 30 ngày.
- Job retention chạy hằng ngày, idempotent.
- Bản unmasked (tương lai): quy trình riêng, người yêu cầu ≠ người duyệt, thời hạn ngắn, ghi audit đầy đủ.

## Open questions and assumptions

| # | Mức | Câu hỏi cần khách xác nhận | Giả định tạm thời | Liên quan |
|---|---|---|---|---|
| Q1 | CHẶN | Self-service xuất masked hay unmasked? Forensic có quy trình riêng không? | Luôn masked; unmasked chỉ qua quy trình 4-eyes ngoài v1 | C1 |
| Q2 | THƯỜNG | Mức che chính xác (octet cuối? username pseudonym hay cắt ký tự)? Forensic có cần tương quan được qua các lần xuất? | Che octet cuối; HMAC khóa cố định theo tổ chức | C1 |
| Q3 | CHẶN | Quy tắc lưu giữ: file "vĩnh viễn" hay DLCN xóa >12 tháng? Xóa hay ẩn danh? Áp cả bản sao/backup? | File hết hạn 30 ngày; chỉ audit record không DLCN giữ vĩnh viễn; DLCN >12 tháng bị xóa/ẩn danh | C4 |
| Q4 | THƯỜNG | Có file CSV mẫu của hệ cũ (cột, delimiter, encoding, BOM, tên file)? | Schema mục 5, UTF-8 không BOM | C6 |
| Q5 | CHẶN | Khối lượng log/team/tháng thực tế? "5 giây" là đồng bộ hay đến khi bắt đầu tải? | ≤100k dòng đồng bộ ≤5 s; vượt thì job nền | C3 |
| Q6 | CHẶN | "Team" của branch manager định nghĩa thế nào (nguồn dữ liệu, một manager nhiều team, cấp dưới chi nhánh)? | Team trong IAM/HR hiện tại; manager chỉ thấy team mình quản lý | C2 |
| Q7 | THƯỜNG | Chính sách ATTT nội bộ và Nghị định 13/2023 áp dụng thế nào (căn cứ xử lý, đánh giá tác động, lưu giữ)? | Cần pháp chế/DPO rà soát; spec theo hướng tối thiểu hóa DLCN | C1, C4 |
| Q8 | THƯỜNG | Log là của nhân viên hay khách hàng ngân hàng? (ảnh hưởng mức nhạy cảm) | Chỉ nhân viên nội bộ; không có DLCN khách hàng | C1 |
| Q9 | THƯỜNG | "Tháng trước": timezone, tháng dương lịch hay 30 ngày gần nhất? | Tháng dương lịch, Asia/Ho_Chi_Minh | C2 |
| Q10 | CHẶN | "Mọi thứ nhìn thấy được" có vượt "team + tháng trước" không (ví dụ chọn khoảng thời gian khác)? | Không; giao của hai điều kiện | C2 |
| Q11 | THƯỜNG | Rate limit, hạn link, hạn file, số lần tải | 5/giờ/user; link 24 giờ, 3 lần; file 30 ngày | C4, C5 |
| Q12 | THƯỜNG | Cần phê duyệt trước khi xuất? Ai duyệt? | Không phê duyệt cho bản masked; audit hậu kiểm | C5 |
| Q13 | THƯỜNG | Có dữ liệu UAT (giả/đã ẩn danh) với khối lượng thực tế để đo hiệu năng và kiểm masking? | Sinh dữ liệu giả; không dùng dữ liệu thật | C3 |
| Q14 | THƯỜNG | "Đơn giản" gồm những gì: có chấp nhận job nền/thông báo, không cho chọn tham số? | UI một nút, không tham số | C5 |
| Q15 | THƯỜNG | Ai được xem audit record và thời hạn tối thiểu theo quy định? | Role security/audit; giữ vĩnh viễn | C4 |

Ghi chú: mọi giả định trên là của đội phân tích, **chưa được khách xác nhận**; các câu CHẶN (Q1, Q3, Q5, Q6, Q10) phải có đáp án trước khi build.
