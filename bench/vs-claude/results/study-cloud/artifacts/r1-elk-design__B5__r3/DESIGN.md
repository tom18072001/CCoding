# Thiết kế nền tảng Audit Log trên Elastic Stack (Basic license)

Trạng thái: đề xuất thiết kế (chưa PoC). Mọi con số đánh dấu **[GĐ]** là giả định cần đo trong PoC; không phải số đo thật.

## 1. Tóm tắt quyết định

| Chủ đề | Quyết định |
|---|---|
| Đề xuất "searchable snapshots cho cold/frozen" | **Không dùng được**: searchable snapshots (và frozen tier) cần license **Enterprise**, không có trong Basic. Thay bằng: snapshot thường (SLM) + restore theo yêu cầu vào cold nodes (đáp ứng "trong 24 giờ"). Mục đích tiết kiệm (không giữ replica cho dữ liệu cũ) vẫn đạt được. |
| Tier | Hot 7 ngày → Warm ngày 8–30 → (ngày 31–365 chỉ là snapshot trong object store) ; cold nodes dùng làm vùng restore. |
| Masking | Tại Logstash (vùng tin cậy) trước khi vào Elasticsearch; ES `final_pipeline` làm lưới an toàn thứ hai. |
| Toàn vẹn | Hash chain/Merkle theo khối, ký bằng khóa trong KMS/HSM, đóng dấu thời gian RFC 3161, lưu manifest + bản raw mã hóa ở kho **WORM** ngoài Elasticsearch. Elasticsearch Basic không tự chứng minh được tính bất biến. |

## 2. Số học dung lượng

### 2.1 Khối lượng raw
- Tốc độ: 20.000 events/s × 800 B = **16.000.000 B/s = 16 MB/s**.
- Mỗi ngày: 16.000.000 × 86.400 = 1,3824×10¹² B = **1,382 TB/ngày** (≈ 1,257 TiB).
- Mỗi năm (365 ngày): 1,3824 TB × 365 = **504,6 TB/năm** (≈ 458,9 TiB); năm nhuận 506,0 TB.
- Số event/ngày: 1,728 tỉ; /năm: 630,7 tỉ.
- 30 ngày: 41,5 TB raw.

### 2.2 Giả định nén / index
- **[GĐ] Kích thước index primary ≈ 1,0 × raw** (`index.codec: best_compression`, mapping chặt, `_source` giữ nguyên, thêm các trường hash/ECS ≈ +100 B/event được bù bằng nén). Dải thường gặp cho log JSON là 0,6–1,3×; chọn 1,0× làm trị bảo thủ ở giữa. Nếu PoC đo được 0,7× thì mọi số tier ES giảm ~30%; nếu 1,3× tăng ~30%.
- Replica = 1 cho dữ liệu searchable online (hot, warm); restore cold dùng 0 replica (nguồn thật là snapshot).
- Hệ số vận hành disk: hot dùng tối đa 70% (watermark 85% + merge/forcemerge/shrink tạm), warm 80%.
- Snapshot lưu theo segment, không có replica; **[GĐ]** kích thước ≈ primary size (nén repository chỉ áp dụng cho metadata).

### 2.3 Dung lượng theo tier

| Tier | Phạm vi | Dữ liệu primary | Tổng gồm replica (cold: 0 replica nên bằng primary) | Disk cần (÷ hệ số) |
|---|---|---|---|---|
| Hot | ngày 0–7 (7 ngày) | 9,68 TB | 19,35 TB | 19,35/0,70 = **27,6 TB** |
| Warm | ngày 8–30 (23 ngày) | 31,80 TB | 63,59 TB | 63,59/0,80 = **79,5 TB** |
| Cold (vùng restore) | cửa sổ restore ≈ 43 ngày dữ liệu, 0 replica | 60 TB | 60 TB (không replica) | 60/0,85 = 70,6 TB → cấp **96 TB** (8 node × 12 TB) để có dư ~27% |
| Snapshot repo (cả 365 ngày) | ngày 0–365 | 504,6 TB | n/a | **504,6 TB** logical; nếu MinIO on-prem erasure coding 12+4 (×1,33) ≈ **673 TB** disk vật lý; nếu S3 dịch vụ thì theo bill 504,6 TB |
| Kho raw WORM (bản gốc chưa mask, nén) | 365 ngày | — | — | 504,6 / 6 **[GĐ nén gzip/zstd 6:1]** ≈ **84 TB** (+ độ dư của object store) |
| Bản sao WORM thứ hai của snapshot (khác site) | khuyến nghị | 504,6 TB | | nhân đôi chi phí repo |

Tổng online ES (hot+warm, có replica) = 83 TB dữ liệu / ~107 TB disk cần; cold 70 TB; object store ≈ 505–673 TB + 84 TB raw.

Đối chiếu phương án "giữ cả 335 ngày cũ online": 463 TB primary, 926 TB với replica → đắt gấp ~2 lần chỉ riêng ES, chưa tính số node/shard. Vì yêu cầu cho dữ liệu cũ là "trong 24 giờ" nên snapshot+restore đủ.

### 2.4 Thời gian restore (kiểm tra yêu cầu 24 giờ)
- Một ngày dữ liệu = 1,38 TB; một tháng = 41,5 TB.
- **[GĐ]** thông lượng restore tổng hợp 0,5–1,5 GB/s (8 cold nodes, `indices.recovery.max_bytes_per_sec` nâng lên ~250 MB/s/node, mạng 10 GbE): 41,5 TB mất 7,7–23 giờ; 60 TB mất 11–33 giờ. Tức là **24 giờ chỉ đảm bảo được khi phạm vi yêu cầu ≲ 40 TB (~1 tháng) và băng thông đạt ≥ 0,5 GB/s**. Cần SLA nêu rõ: yêu cầu lớn hơn thì chia đợt. Phải đo trong PoC; thời gian tính từ lúc nhận yêu cầu cần cộng thời gian phê duyệt.

## 3. Bố trí node

| Vai trò | Số lượng | Cấu hình (đề xuất) | Ghi chú |
|---|---|---|---|
| Master-eligible dedicated | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | quorum 2/3, 3 AZ/rack khác nhau |
| Hot (`data_hot`) | 6 | 16 vCPU, 64 GB RAM (heap 30 GB), 6 TB NVMe | 36 TB tổng ≥ 27,6 TB cần. Tải ghi: 40k doc/s (kể replica) / 6 ≈ 6,7k/s/node, thoải mái; dư để chịu mất 1 node + peak **[GĐ peak 1,5×]** |
| Warm (`data_warm`) | 8 | 8 vCPU, 64 GB RAM, 12 TB SSD/HDD nhanh | 96 TB ≥ 79,5 TB |
| Cold (`data_cold`, vùng restore) | 8 | 8 vCPU, 64 GB, 12 TB HDD | 96 TB ≥ 70,6 TB cần (trước đây 72 TB là quá sát); có thể scale-in khi không dùng |
| Coordinating/Kibana | 2 + 2 Kibana | 8 vCPU, 32 GB | truy vấn tương tác |
| Logstash | 3 | 8 vCPU, 16 GB, persistent queue SSD | 20k eps ≈ 6,7k eps/node, dư lớn |
| Kafka (đệm, mã nguồn mở) | 3 | 8 vCPU, 32 GB, 8 TB, giữ 72 giờ | 16 MB/s × 3 replica × 72h ≈ 12,44 TB tổng; chia 3 = 4,15 TB/broker; với hệ số vận hành 70% cần 12,44/0,70 = 17,8 TB tổng ≈ 5,9 TB/broker ≤ 8 TB cấp (còn dư ~26%) |
| Object store | S3 / MinIO ≥ 4 node | theo §2.3 | có Object Lock |

Shard: data stream, rollover khi primary shard đạt 50 GB hoặc 1 ngày; mỗi backing index 6 primary (≈300 GB) → ~4,6 index/ngày, ~194 primary + 194 replica trong hot (~65 shard/node) — thấp hơn nhiều so với giới hạn khuyến nghị. Warm: forcemerge về 1 segment, giữ nguyên số shard (không cần shrink nếu shard ≈ 50 GB).

## 4. Ingest pipeline

```
Nguồn → Elastic Agent/Beats (TLS) → Kafka (topic audit-raw, 72h)
      → Logstash: (1) canonicalize + seq/hash  (2) mask  (3) ký khối
      → Elasticsearch data stream audit-logs (TLS, bulk)
      ↘ song song: bản raw gốc (nén, mã hóa) → kho WORM
```

1. **Thu thập**: mỗi event gán `event.original` (nguyên văn), `collector.id`, `collector.seq` (tăng đơn điệu theo từng nguồn/partition). Đồng hồ NTP/chrony, `event.ingested` đặt ở Logstash.
2. **Hash gốc** (trước mask): `audit.raw_sha256 = SHA-256(event.original)`. Một consumer riêng `raw-archiver` (consumer group độc lập với Logstash, cùng topic `audit-raw`) nén và ghi raw vào kho WORM, chỉ commit offset của nó sau khi object ghi thành công; Logstash chỉ làm một output (ES) và không giữ raw (at-least-once; khóa `_id` = hash(collector.id, seq) để dedupe).
3. **Masking** (Logstash, trước khi tới ES):
   - Trường có cấu trúc (`user.name`, `user.email`, `user.phone`, …): thay bằng token `HMAC-SHA256(khóa mask, giá trị chuẩn hóa)` cắt 16 hex, tiền tố loại (`usr_`, `eml_`, `tel_`). Cùng giá trị → cùng token nên vẫn truy vết được hành vi của một người mà không lộ danh tính. Khóa HMAC ở KMS, không nằm trong cấu hình repo.
   - Trường tự do (`message`, `event.original` bản index): regex email (RFC-lite), số điện thoại (E.164 và dạng quốc gia VN/quốc tế), và username theo mẫu `user=…`, `for user …` rồi thay bằng token như trên. **Regex trên văn bản tự do không đảm bảo 100% recall** → xem rủi ro R4.
   - Trường `event.original` đưa vào ES là bản đã mask; bản chưa mask chỉ có trong kho WORM.
4. **Hash đã mask**: `audit.doc_sha256 = SHA-256(canonical JSON của doc đã mask, không gồm trường audit.*)`.
5. **Ký khối**: gom theo (collector, phút); Merkle tree trên `doc_sha256`; `block_root` nối chuỗi `prev_block_root` → ký (Ed25519/RSA, khóa trong HSM/KMS) → manifest JSON (block id, dải seq, số event, root, raw_root, prev, chữ ký) → gửi TSA RFC 3161 → ghi WORM.
6. **Elasticsearch**: `default_pipeline` đặt `event.ingested`, ECS chuẩn hóa nhẹ; `final_pipeline` là lưới an toàn: processor `script/grok` phát hiện email/số điện thoại còn sót trong các trường → `fail`/chuyển vào index `audit-quarantine` (không phục vụ truy vấn thường) và tạo cảnh báo. Mapping `dynamic: strict`, `keyword` cho định danh, `message` là `text` + `match_only_text` để giảm kích thước.
7. Lỗi/đầy: Logstash persistent queue + Kafka giữ 72 giờ; DLQ cho doc bị từ chối (không mất dữ liệu).

## 5. ILM và vòng đời

`index.number_of_replicas: 1`, `index.codec: best_compression` áp dụng ngay từ hot (template), để dung lượng hot 27,6 TB nhất quán với hệ số 1,0× ở §2.2. **[GĐ]** CPU ghi chấp nhận được với 16 vCPU/node; nếu PoC cho thấy thiếu CPU thì đổi hot sang `default` và tính lại hot (+~10–15% **[GĐ]**, chưa đo).

| Phase | Điều kiện | Hành động |
|---|---|---|
| hot | min_age 0 | `rollover` max_primary_shard_size 50gb hoặc max_age 1d; `set_priority` 100 |
| warm | min_age 7d (từ rollover) | `forcemerge` 1 segment + codec best_compression; `allocate` về data_warm; `readonly`; `set_priority` 50 |
| (không có cold/frozen phase tự động) | | Không dùng `searchable_snapshot` (Enterprise). |
| delete | min_age 30d | `wait_for_snapshot` policy `audit-daily` rồi `delete` (chỉ xóa khi đã có snapshot thành công, đã sao chép WORM và đã xác minh manifest) |

- **SLM `audit-daily`**: snapshot hằng ngày (và mỗi giờ cho index đang hot nếu muốn RPO thấp) vào repository `audit-repo`; **không đặt `retention` xóa tự động**; xóa snapshot > 365 ngày bằng quy trình có phê duyệt (xem R6).
- **Restore theo yêu cầu**: quy trình có ticket → `POST _snapshot/audit-repo/<snap>/_restore` các index trong phạm vi, `index_settings: {number_of_replicas: 0, index.routing.allocation.include._tier_preference: data_cold}`, đặt tên `restored-*`; ILM policy `audit-restored` xóa sau 14 ngày. Trước khi trả kết quả cho điều tra viên, chạy bước xác minh (§6.3).
- Dùng dữ liệu >30 ngày không tương tác tức thời; phù hợp yêu cầu.

## 6. Bảo đảm toàn vẹn (bằng chứng pháp lý)

### 6.1 Nguyên tắc
Elasticsearch Basic không có tính bất biến: người có quyền superuser có thể sửa/xóa doc hoặc index, và audit log của chính ES (security audit logging) là tính năng Gold+. Do đó chứng cứ dựa vào **bằng chứng mật mã bên ngoài ES**, ES chỉ là chỉ mục để tìm kiếm.

### 6.2 Cơ chế
1. Hash chain/Merkle + chữ ký + TSA như §4.5; manifest và raw lưu ở **bucket WORM** (S3 Object Lock chế độ *compliance*, retention ≥ 12 tháng + dự phòng, hoặc tương đương on-prem); khóa ký tách quyền với quản trị ES; xoay khóa có lưu chứng chỉ cũ.
2. Bản sao snapshot sang bucket WORM thứ hai (khác tài khoản/site). Lưu ý: Elastic không hỗ trợ ghi trực tiếp snapshot repo lên bucket có Object Lock (ES cần ghi đè/xóa blob nội bộ) **[cần xác nhận khi PoC]** → ghi vào bucket thường rồi sao chép/replicate sang bucket WORM; restore từ bản sao đăng ký read-only.
3. Giảm bề mặt tấn công trong ES: index đã rollover `index.blocks.write: true`; role native RBAC (có trong Basic) — ứng dụng chỉ có `create_doc`/`auto_configure` trên `audit-logs*`, không `delete`, `index` (ghi đè), `delete_index`; điều tra viên chỉ `read`; admin tách người; TLS giữa mọi thành phần; không dùng DLS/FLS (không có trong Basic).
4. Giám sát tính liên tục: cảnh báo khi thiếu `collector.seq` (khoảng trống), manifest thiếu, hoặc lệch số lượng ES so với manifest (Kibana rules/Watcher-thay thế bằng job ngoài vì Watcher là Gold+; Kibana alerting: **[cần xác nhận với Elastic]** rule type và connector nào có trong Basic — một số connector (vd. email, index, server log) được cho là có ở Basic, còn lại chưa kiểm chứng; phương án dự phòng chắc chắn là cron script ngoài ES).

### 6.3 Xác minh
Job định kỳ (hằng ngày, mẫu ngẫu nhiên 1% + toàn bộ khi có yêu cầu pháp lý hoặc sau mỗi restore): đọc doc theo dải seq, tính lại `doc_sha256`, dựng Merkle root, so với manifest, kiểm chữ ký + dấu thời gian + chuỗi `prev_block_root`. Kết quả lưu vào WORM. Để chứng minh với tòa: xuất doc + đường dẫn Merkle + manifest + chứng chỉ + (khi có lệnh) bản raw tương ứng.

### 6.4 Mâu thuẫn mask vs bất biến
Masking làm doc trong ES **khác nguyên văn**. Giải quyết: (a) hash và lưu bản gốc chưa mask ở WORM mã hóa (khóa riêng, truy cập 2 người, ghi log), (b) chuỗi chữ ký phủ cả `raw_sha256` và `doc_sha256`, nên chứng minh được "doc đã mask này được suy ra từ event gốc có hash X vào thời điểm T". Cần pháp chế xác nhận rằng giữ bản gốc ngoài ES có thỏa yêu cầu "masked before indexed" (ý định có vẻ là không lộ PII trong chỉ mục) — nếu không được phép giữ bản gốc, chỉ còn chứng minh được toàn vẹn của bản đã mask.

## 7. Rủi ro và mâu thuẫn trong đầu vào

| # | Vấn đề | Mức | Xử lý |
|---|---|---|---|
| R1 | **Searchable snapshots / frozen cần Enterprise, trái ràng buộc Basic.** Cũng không dùng được: DLS/FLS, security audit log của ES, SAML/OIDC/LDAP (Gold+/Platinum), Watcher (Gold+) — **[xác nhận lại trên trang subscriptions hiện hành]**. | Cao | Snapshot thường + restore (§5). Nếu muốn truy vấn tức thời 12 tháng: cần nâng license Enterprise hoặc giữ online (đắt gấp đôi). |
| R2 | "Bất biến/chứng cứ pháp lý" không đạt được chỉ bằng Elasticsearch. | Cao | §6, WORM + chữ ký + TSA; cần pháp chế duyệt quy trình chuỗi lưu giữ (chain of custody). |
| R3 | Mask trước khi index xung đột với "không bị sửa" (§6.4). Mask một chiều làm mất khả năng điều tra danh tính; HMAC tạo token có thể tái định danh nếu lộ khóa/đoán được giá trị (email dễ đoán). | Cao | Giữ bản gốc ở vault; khóa HMAC trong KMS; chính sách ai được tra ngược token. |
| R4 | Regex mask trên văn bản tự do có thể bỏ sót PII (tên không có nhãn, số điện thoại định dạng lạ). | Trung bình | Chuẩn hóa schema nguồn để PII nằm ở trường có tên; `final_pipeline` quarantine; test bộ dữ liệu tổng hợp; đo recall trước go-live. |
| R5 | Hệ số nén 1,0× là giả định; sai ±30% làm lệch toàn bộ dự toán ES. Peak > 20k eps chưa được khách nêu. | Trung bình | PoC với dữ liệu mẫu 1 ngày, chốt hệ số; thiết kế dư 1,5× về ingest, theo dõi disk watermark. |
| R6 | "Giữ 12 tháng" mơ hồ: 365 hay 366 ngày, tối đa hay tối thiểu; xóa dữ liệu có thể xung đột với *legal hold* của vụ việc đang xảy ra; xóa snapshot trong bucket Object Lock không thể xảy ra sớm. | Trung bình | Chốt 365 ngày + dự phòng 7 ngày; quy trình legal hold; xóa theo lô có phê duyệt, lưu bằng chứng xóa. |
| R7 | SLA 24 giờ restore phụ thuộc phạm vi/băng thông (§2.4); >40 TB trong 24 giờ có thể không đạt. | Trung bình | Nêu SLA theo khối lượng; PoC đo; có thể mở rộng cold nodes. |
| R8 | Hot 6 node chịu mất 1 node: disk 19,35 TB data / 5 node vẫn trong ngưỡng (3,9 TB/node < 6 TB) nhưng ngưỡng 70% sát. | Thấp | Cho phép mở rộng thêm 1–2 node; cảnh báo disk 75%. |
| R9 | Object store là điểm cực kỳ quan trọng (505–673 TB); mất bucket = mất toàn bộ >30 ngày. | Cao | Bản sao thứ hai khác site; kiểm tra restore định kỳ hằng quý. |
| R10 | Dữ liệu audit chứa thông tin nhạy cảm kể cả sau mask (IP, hành vi). | Thấp | Mã hóa at-rest (disk/object store), TLS, RBAC. |

## 8. Việc cần làm tiếp
1. PoC 1 ngày dữ liệu mẫu tổng hợp (không dùng dữ liệu thật): đo hệ số nén, tốc độ ingest, tốc độ restore.
2. Xác nhận với pháp chế: chuỗi lưu giữ, giữ bản gốc chưa mask, thời hạn.
3. Xác nhận bảng tính năng Basic với Elastic trước khi mua/đặt cấu hình.
4. Quyết định object store (S3 dịch vụ hay MinIO on-prem) và vị trí bản sao thứ hai.
