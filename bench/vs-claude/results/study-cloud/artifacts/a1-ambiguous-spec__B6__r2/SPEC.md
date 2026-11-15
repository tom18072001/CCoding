# SPEC — Tính năng "Log Export" (nền tảng log, khách hàng: ngân hàng Việt Nam)

Phân loại tài liệu: internal. Trạng thái: **bản nháp chờ khách xác nhận**. Mọi con số ghi "giả định" là ước lượng của ta, chưa được khách xác nhận. Không dẫn điều luật nào; việc đối chiếu pháp lý giao cho pháp chế ngân hàng (xem Q12).

Yêu cầu gốc của khách (nguyên văn):
> We need a self-service "Log Export" button. Branch managers can export their team's access logs from last month as CSV like the old system. Exports must contain full client IP addresses and usernames for forensic use. In line with our data-protection policy, no personal data may leave the platform unmasked. Users should be able to export everything they can see; the export must complete within 5 seconds. Exported files are kept forever for audit, and the platform must delete personal data older than 12 months. Make it simple.

---

## 1. Mục tiêu và phạm vi

**Mục tiêu**: Branch Manager tự xuất access log của team mình trong tháng trước ra CSV, không cần nhờ IT, mà không làm dữ liệu cá nhân rời nền tảng ở dạng chưa che.

**Trong phạm vi**
- Nút "Log Export" trên UI cho Branch Manager (một nút, không form tuỳ chọn).
- API export đồng bộ (tập nhỏ) và bất đồng bộ (tập lớn).
- Masking dữ liệu cá nhân mặc định; luồng unmasked tách riêng cho vai trò forensic, có duyệt 4-eyes, **mặc định tắt**.
- Audit record cho mọi lượt xuất, kể cả bị từ chối; không lưu file xuất; user ID trong audit được ẩn danh hoá sau 12 tháng (Q4).
- Chống CSV injection, UTF-8 BOM, rate limit.

**Ngoài phạm vi (bản này)**
- Xuất ngoài "team" và ngoài "tháng trước" (xem C2).
- Lưu trữ file xuất lâu dài (xem C3).
- Lịch xuất định kỳ, định dạng khác CSV, gửi file qua email/kênh ngoài.
- Thay đổi cơ chế retention của log gốc ngoài việc tôn trọng quy tắc xóa 12 tháng.
- Tích hợp hệ thống cũ; chỉ tái hiện định dạng CSV (chờ mẫu — Q5).

---

## 2. Bảng mâu thuẫn và quyết định tạm

| ID | Mâu thuẫn trong brief | Quyết định tạm (assumption) | Hệ quả thiết kế |
|---|---|---|---|
| C1 | "Full client IP + username cho forensic" **với** "không dữ liệu cá nhân nào rời nền tảng chưa che". | Nút của Branch Manager **luôn masked**. Luồng unmasked chỉ cho vai trò forensic riêng, có duyệt 4-eyes (người yêu cầu ≠ người duyệt), **mặc định tắt** (feature flag) tới khi khách xác nhận. | Hai endpoint/quyền tách biệt; unmasked có approval workflow, audit riêng. |
| C2 | "Xuất mọi thứ user thấy" **với** "log của team, tháng trước". | Phạm vi = **giao** của (quyền xem của user) ∩ (team của user) ∩ (tháng trước). Không mở rộng hơn giao này. | Truy vấn luôn ép 3 bộ lọc phía server; client không truyền được phạm vi rộng hơn. |
| C3 | "Giữ file mãi mãi cho audit" **với** "xóa dữ liệu cá nhân quá 12 tháng". | **Không lưu file xuất.** Chỉ giữ audit record (metadata + hash của file). Record **không chứa dữ liệu cá nhân của dữ liệu xuất** (IP/username trong log) nhưng **có chứa định danh nội bộ của người xuất/người duyệt (user ID)**, vốn là dữ liệu cá nhân của nhân viên; sau 12 tháng user ID được ẩn danh hoá (token không đảo ngược), metadata và hash giữ lại. | File sinh ra, stream cho người dùng, không persist (async: lưu tạm có TTL ngắn, xóa sau tải/hết hạn). |
| C4 | "Hoàn thành trong 5 giây" **với** khối lượng dữ liệu không rõ. | p95 ≤ 5 giây tới **200.000 dòng** (giả định); vượt ngưỡng thì chuyển **async** (job + tải khi sẵn sàng). | Đếm trước/ước lượng; nhánh sync/async theo ngưỡng cấu hình. |
| C5 | "Make it simple" **với** các kiểm soát cần có (masking, audit, rate limit, approval). | UI chỉ **một nút**; mọi kiểm soát nằm ở backend, người dùng không phải cấu hình. | Không có tuỳ chọn trên UI; từ chối trả thông báo rõ nhưng ngắn. |

---

## 3. Yêu cầu chức năng

- **FR-1** (Must): Branch Manager thấy nút "Log Export"; bấm một lần sẽ xuất access log của team mình trong tháng trước ra CSV masked.
- **FR-2** (Must): Server tự xác định phạm vi = quyền xem ∩ team ∩ tháng trước; bỏ qua mọi tham số phạm vi từ client.
- **FR-3** (Must): Masking mặc định áp dụng cho IP, username và các trường cá nhân khác đã xác định (xem mục 4.3). Quy tắc masking cụ thể chờ Q1; mặc định dùng giả định ở đó.
- **FR-4** (Must): Nếu số dòng ≤ ngưỡng đồng bộ (giả định 200.000) thì stream CSV trực tiếp; nếu vượt thì tạo job async và thông báo khi sẵn sàng.
- **FR-5** (Must): File CSV: UTF-8 có BOM, dấu phân cách và cột theo giả định ở Q5, header cố định.
- **FR-6** (Must): Chống CSV injection: ô bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc CR được tiền tố `'` và quote đúng chuẩn RFC 4180.
- **FR-7** (Must): Ghi audit record cho **mọi** lượt xuất: thành công, thất bại, **bị từ chối** (không quyền, vượt rate limit, không duyệt, flag tắt).
- **FR-8** (Must): Không persist file xuất sau khi giao; file async có TTL và bị xóa sau khi tải hoặc hết hạn (TTL giả định, Q6).
- **FR-9** (Must): Rate limit theo user; vượt thì từ chối và audit.
- **FR-10** (Should): Luồng unmasked cho vai trò forensic: yêu cầu kèm lý do → người duyệt khác → xuất một lần → audit. Mặc định tắt bằng flag.
- **FR-11** (Should): Cảnh báo (alert) tới bộ phận an ninh khi có yêu cầu/xuất unmasked hoặc nhiều lượt bị từ chối bất thường (ngưỡng chờ Q9).
- **FR-12** (Could): Hiển thị trạng thái job async và trạng thái "đang xuất" trên cùng một nút (không thêm màn hình).
- **FR-13** (Must): Dữ liệu log gốc cũ hơn 12 tháng không được đưa vào export. Job xóa/ẩn danh dữ liệu cá nhân quá 12 tháng của log gốc là **điều kiện tiên quyết, không xây mới trong bản này**: phạm vi chỉ gồm xác nhận job đã tồn tại và chạy; nếu chưa có thì là hạng mục riêng cần khách quyết (Q4) và Giai đoạn 3 chỉ kiểm tra. Thuộc phạm vi: bước ẩn danh hoá user ID trong audit record sau 12 tháng.

---

## 4. Thiết kế

### 4.1 API (đề xuất)

| Method & path | Mục đích | Ghi chú |
|---|---|---|
| `POST /api/v1/log-exports` | Tạo yêu cầu export masked cho team của người gọi, tháng trước | Body rỗng/không chứa tham số phạm vi. `200` + stream CSV nếu sync; `202` + `jobId` nếu async; `403` không quyền; `429` rate limit |
| `GET /api/v1/log-exports/{jobId}` | Trạng thái job | Chỉ chủ job |
| `GET /api/v1/log-exports/{jobId}/download` | Tải file async | Xác thực lại, một lần, theo TTL |
| `POST /api/v1/forensic-exports` | Yêu cầu export unmasked | Cần quyền forensic + flag bật; tạo yêu cầu chờ duyệt |
| `POST /api/v1/forensic-exports/{id}/approve` | Duyệt/từ chối | Người duyệt ≠ người yêu cầu |

Server lấy `team` và quyền từ phiên xác thực, không từ request.

### 4.2 Truy vấn stream
- Truy vấn theo khoảng thời gian bán mở `[đầu tháng trước, đầu tháng này)` ở múi giờ đã chốt (giả định Q3), kèm bộ lọc team và quyền xem.
- Đọc bằng cursor/streaming, ghi CSV theo từng khối; không nạp toàn bộ vào bộ nhớ; áp masking trên từng dòng trước khi ghi ra.
- Có `COUNT`/ước lượng trước để chọn sync/async; giới hạn cứng số dòng tối đa mỗi export (giả định ở Q7).

### 4.3 Masking
Giả định tạm (Q1): IP v4 giữ 2 octet đầu, che phần còn lại (ví dụ `10.20.x.x`); IPv6 giữ tiền tố đầu và che phần còn lại; username thay bằng pseudonym ổn định trong một lượt xuất (hash có muối theo lượt xuất) để vẫn đếm/tương quan được trong file. Đánh đổi có chủ đích: pseudonym không tương quan được giữa các lượt xuất (giảm nguy cơ tái định danh, nhưng cản đối chiếu forensic xuyên kỳ; nhu cầu đó thuộc luồng unmasked — Q1, Q2). Các trường cá nhân khác (tài khoản, query string, user agent — Q10): query string loại bỏ giá trị tham số, user agent giữ họ trình duyệt, tài khoản che. Masking thực hiện **ở server trước khi ghi**, không dựa vào client.

### 4.4 Audit
Mỗi lượt (kể cả bị từ chối) ghi: thời điểm, user ID nội bộ của người xuất (**là dữ liệu cá nhân của nhân viên**), vai trò, loại (masked/unmasked), phạm vi (team ID, kỳ), kết quả (thành công/lỗi/từ chối + mã lý do), số dòng, hash SHA-256 của file (nếu có sinh), jobId, người duyệt (nếu có, cũng là user ID). **Không** ghi IP/username của dữ liệu xuất, không ghi nội dung file. Audit record append-only về nội dung; riêng trường user ID/người duyệt được thay bằng token ẩn danh không đảo ngược sau 12 tháng (giả định Q4), phần còn lại giữ nguyên. Thời hạn giữ metadata và hash: giả định Q4.

### 4.5 Retention
- File xuất: không giữ (C3).
- Log gốc chứa dữ liệu cá nhân quá 12 tháng: xóa hoặc ẩn danh theo Q4 (giả định: ẩn danh/xóa vật lý trên kho chính, backup hết vòng đời theo chính sách backup hiện có; legal hold có thể tạm dừng).
- Export không được lấy dữ liệu đã quá hạn.

### 4.6 Async
Job queue; worker chạy với quyền của người yêu cầu (đã chụp lại phạm vi lúc tạo); file ghi vào kho tạm mã hoá, TTL, xóa sau tải; thông báo trong ứng dụng khi sẵn sàng. Giới hạn số job đồng thời mỗi user (giả định 1).

### 4.7 Rate limit
Giả định: mỗi user tối đa 5 yêu cầu/giờ và 1 job async đang chạy; con số có thể cấu hình, chờ khách xác nhận (Q9). Vượt → `429`, ghi audit.

---

## 5. Yêu cầu phi chức năng

- **NFR-1 Hiệu năng**: p95 ≤ 5 giây đo từ lúc server nhận request tới khi byte cuối được gửi đi (định nghĩa theo giả định Q7; thời gian mạng phía client không tính), với tập ≤ 200.000 dòng (giả định).
- **NFR-2 Bảo mật**: TLS khi truyền; kho tạm mã hoá khi lưu; kiểm tra quyền phía server mọi request; không log dữ liệu cá nhân trong application log của tính năng.
- **NFR-3 Tác động hệ thống**: p95 độ trễ của truy vấn log thông thường khi có export chạy song song không tăng quá X% so với khi không có export; X **chưa xác định** (Q16, giả định tạm 20%). Đề xuất dùng replica/ưu tiên thấp.
- **NFR-4 Toàn vẹn**: audit record append-only, hash file tính trên đúng byte gửi cho người dùng.
- **NFR-5 Khả năng quan sát**: metric số export, tỷ lệ từ chối, thời gian, kích thước (không chứa dữ liệu cá nhân).
- **NFR-6 Tính khả dụng của UI**: một nút, thông báo lỗi bằng tiếng Việt, không form.

---

## 6. Tiêu chí nghiệm thu (đo được)

| ID | Cho / Khi / Thì | Liên quan |
|---|---|---|
| AC-1 | Cho Branch Manager của team A, khi bấm nút, thì CSV chỉ chứa dòng của team A trong tháng trước; 0 dòng ngoài phạm vi (kiểm bằng bộ dữ liệu giả có nhiều team/tháng). | FR-1, FR-2, C2 |
| AC-2 | Khi client gửi tham số team/khoảng thời gian khác, thì tham số bị bỏ qua hoặc bị từ chối `403/400`, và có audit. | FR-2 |
| AC-3 | Mọi file masked: 0 giá trị khớp mẫu IP đầy đủ hoặc username gốc (quét tự động trên dữ liệu giả). | FR-3, C1 |
| AC-4 | Với 200.000 dòng dữ liệu giả, p95 ≤ 5 giây trong 30 lần chạy ở môi trường kiểm thử đã chốt cấu hình. | NFR-1, C4 |
| AC-5 | Với > 200.000 dòng, API trả `202` + `jobId`; file tải được sau khi job xong; sau tải/TTL, tải lại trả `404/410`. | FR-4, FR-8 |
| AC-6 | File bắt đầu bằng BOM `EF BB BF`; mở đúng tiếng Việt có dấu; header đúng mẫu. | FR-5 |
| AC-7 | Ô chứa `=cmd`, `+1`, `-1`, `@x`, bắt đầu bằng tab/CR đều được vô hiệu hoá (tiền tố `'`). | FR-6 |
| AC-8 | Lượt xuất thành công, lỗi, và mỗi loại từ chối (không quyền, rate limit, flag tắt, không duyệt) đều tạo đúng 1 audit record; record không chứa IP/username từ dữ liệu xuất; user ID trong record quá 12 tháng được thay bằng token ẩn danh (kiểm bằng giả lập thời gian). | FR-7, C3 |
| AC-9 | Sau lượt xuất, không còn file xuất ở kho bền vững (kiểm tra kho/đĩa); chỉ còn audit record. | FR-8, C3 |
| AC-10 | Yêu cầu thứ N+1 vượt giới hạn cấu hình trả `429` và có audit. | FR-9 |
| AC-11 | Với flag forensic tắt, mọi endpoint unmasked trả `403`. Khi bật: người duyệt = người yêu cầu bị từ chối; chỉ sau duyệt mới sinh file, dùng được một lần. | FR-10, C1 |
| AC-12 | Dữ liệu quá 12 tháng không xuất hiện trong export; job xóa/ẩn danh có bằng chứng chạy theo kế hoạch đã chốt. | FR-13 |
| AC-13 | UI chỉ có một nút export, không có trường nhập. | C5 |

---

## 7. Kế hoạch triển khai

1. **Giai đoạn 0 – Xác nhận**: gửi mục 8 cho khách; chốt các câu [Chặn] (Q1–Q5, Q12) trước khi code.
2. **Giai đoạn 1 – Lõi masked sync**: truy vấn ép phạm vi, masking, CSV (BOM, injection), audit, rate limit, nút UI.
3. **Giai đoạn 2 – Async** cho tập lớn, kho tạm có TTL, thông báo.
4. **Giai đoạn 3 – Retention**: job xóa/ẩn danh >12 tháng (hoặc xác nhận đã có), kiểm tra backup.
5. **Giai đoạn 4 – Forensic unmasked** (flag tắt): yêu cầu/duyệt 4-eyes, MFA, cảnh báo — chỉ bật sau khi khách và pháp chế đồng ý.
6. **Giai đoạn 5 – Nghiệm thu**: chạy AC-1…AC-13, đo hiệu năng, review bảo mật.

Rủi ro chính: khách muốn unmasked cho Branch Manager (xung đột chính sách); khối lượng thực lớn hơn giả định; yêu cầu lưu file vĩnh viễn từ kiểm toán.

---

## Open questions and assumptions

Mức: **[Chặn]** = phải có câu trả lời trước khi build phần liên quan; **[Sớm]** = nên có trước khi hoàn thiện, có thể build theo assumption.

| ID | Mức | Câu hỏi cần khách xác nhận | Assumption tạm dùng |
|---|---|---|---|
| Q1 | [Chặn] | "Masked" nghĩa là gì chính xác với IP và username (che bao nhiêu octet, hash hay pseudonym, có cần tương quan được không)? (liên quan C1) | IPv4 giữ 2 octet đầu; IPv6 giữ tiền tố đầu; username thành pseudonym ổn định trong một lượt xuất. Nút của Branch Manager luôn masked. Pseudonym không tương quan giữa các lượt xuất (đánh đổi có chủ đích, mục 4.3); cần tương quan xuyên kỳ thì dùng luồng forensic. |
| Q2 | [Chặn] | Nhu cầu forensic có cần IP/username đầy đủ ngoài nền tảng không? Ai là vai trò forensic, quy trình duyệt 4-eyes thế nào? (C1) | Luồng unmasked chỉ cho vai trò forensic riêng, có duyệt 4-eyes, mặc định tắt; Branch Manager không bao giờ có. |
| Q3 | [Chặn] | "Team" được định nghĩa thế nào (theo chi nhánh, phòng, cây tổ chức, nhóm trong IdP)? Có team con/nhiều team/thay đổi giữa kỳ? "Tháng trước" là tháng dương lịch hay 30 ngày gần nhất, theo múi giờ nào? (C2) | Team = nhóm người dùng gán trực tiếp cho chi nhánh của manager, không gồm team con. Tháng trước = tháng dương lịch trước đó, múi giờ Asia/Ho_Chi_Minh (UTC+7), `[00:00 ngày 1, 00:00 ngày 1 tháng sau)`. |
| Q4 | [Chặn] | Audit record giữ bao lâu, và user ID người xuất/người duyệt trong audit (dữ liệu cá nhân nhân viên) giữ bao lâu hoặc có ẩn danh hoá sau 12 tháng không? Có legal hold không? "Xóa dữ liệu cá nhân" là xóa vật lý hay ẩn danh? Backup xử lý thế nào? Có chấp nhận không lưu file xuất không? (C3) | Không lưu file. Audit record (metadata + hash) giữ lâu dài; không chứa IP/username của dữ liệu xuất nhưng có user ID nội bộ, nên user ID được ẩn danh hoá không đảo ngược sau 12 tháng, metadata và hash giữ lại; legal hold có thể tạm dừng xóa; log gốc quá 12 tháng bị xóa vật lý hoặc ẩn danh không đảo ngược trên kho chính; backup hết vòng đời theo chính sách hiện có. |
| Q5 | [Chặn] | Mẫu file hệ thống cũ: danh sách cột, thứ tự, encoding, dấu phân cách, định dạng thời gian, tên file? | Header cố định gồm: thời điểm (ISO 8601 + offset), username masked, IP masked, hành động, tài nguyên, kết quả; UTF-8 có BOM; dấu phẩy; CRLF; tên `log-export_<team>_<yyyy-mm>.csv`. Chưa xác minh khớp hệ thống cũ. |
| Q6 | [Sớm] | File async cần sẵn sàng bao lâu và tải được mấy lần? | TTL 24 giờ giả định, tải một lần, mã hoá khi lưu tạm, xóa sau tải hoặc hết hạn. |
| Q7 | [Sớm] | 5 giây đo từ đâu tới đâu (bấm → byte đầu hay byte cuối), trên môi trường nào, mạng nào? Khối lượng dòng tối đa/team/tháng? (C4) | Đo từ lúc server nhận request tới byte cuối được gửi, trong môi trường kiểm thử đã chốt; p95 ≤ 5 giây tới 200.000 dòng; vượt thì async; trần cứng mỗi export là tham số cấu hình (chưa có giá trị). |
| Q8 | [Sớm] | Vai trò nào khác Branch Manager được xuất (admin, auditor, giám đốc vùng)? Có ủy quyền/người thay thế không? | Chỉ Branch Manager (masked) và forensic (unmasked, flag tắt). Không ủy quyền; người được ủy quyền chưa hỗ trợ. |
| Q9 | [Sớm] | Có yêu cầu MFA/step-up, ai duyệt, cảnh báo gửi tới đâu và ngưỡng nào? Rate limit mong muốn? | MFA step-up bắt buộc cho luồng unmasked, không cho masked; cảnh báo tới bộ phận an ninh khi có yêu cầu unmasked hoặc từ chối lặp lại; rate limit 5 yêu cầu/giờ/user, 1 job async đồng thời (cấu hình được). |
| Q10 | [Sớm] | Log còn dữ liệu cá nhân nào khác (tài khoản, query string, user agent, referrer, tên thiết bị)? Xử lý ra sao? | Coi các trường đó là dữ liệu cá nhân tiềm năng: che tài khoản, bỏ giá trị query string, giữ họ trình duyệt của user agent. |
| Q11 | [Sớm] | Khách chấp nhận các kiểm soát (masking, audit, rate limit, async, duyệt) khiến chậm/phiền hơn hệ thống cũ không? (C5) | Chấp nhận; UI vẫn một nút, kiểm soát ở backend. |
| Q12 | [Chặn] | Chính sách bảo vệ dữ liệu và điều khoản pháp lý cụ thể nào áp dụng cho masking, retention, audit? Nhờ pháp chế ngân hàng xác nhận (ta không tự trích điều luật). | Chưa có điều luật nào được dẫn; spec chỉ bám nội dung brief (masked mặc định, xóa dữ liệu cá nhân >12 tháng). Mọi con số/thời hạn có thể đổi sau xác nhận của pháp chế. Cần pháp chế xác nhận riêng: việc giữ audit có user ID nhân viên và ẩn danh hoá sau 12 tháng có đủ hay không. |
| Q13 | [Sớm] | Kiểm toán có chấp nhận audit record (metadata + hash) thay cho việc giữ file nguyên bản không? Nếu cần tái tạo, có thể chạy lại truy vấn trong 12 tháng? (C3) | Chấp nhận; tái tạo nội dung trong 12 tháng bằng truy vấn lại, ngoài 12 tháng thì không tái tạo được. |
| Q14 | [Sớm] | Export bị từ chối/lỗi có cần thông báo cho quản lý trực tiếp hay bộ phận an ninh không? | Chỉ audit và metric; cảnh báo theo Q9. |
| Q15 | [Sớm] | Nếu chưa có dữ liệu tháng trước (team mới, tháng rỗng), hành vi mong muốn? | Trả CSV chỉ có header, vẫn audit với số dòng = 0. |
| Q16 | [Sớm] | Mức suy giảm tối đa chấp nhận được cho truy vấn log thông thường khi export chạy (NFR-3)? Có replica đọc riêng không? | Tăng p95 tối đa 20% (giả định, chưa xác minh); chạy trên replica nếu có, nếu không thì ưu tiên thấp và giới hạn đồng thời. |
