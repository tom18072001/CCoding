# Thiết kế nền tảng audit-log trên Elastic Stack (Basic license)

Phân loại: internal. Mọi hệ số nén, throughput/node và giá trị "giả định" dưới đây **chưa được đo**; phải benchmark bằng dữ liệu mẫu đã che PII trước khi mua phần cứng (xem §9).

## 0. Kết luận chính (đọc trước)

1. **Đề xuất "searchable snapshots cho cold/frozen" không thực hiện được với license Basic.** Searchable snapshots (ILM action `searchable_snapshot`, tier `data_frozen`/mount) cần license Enterprise. **Phiên bản giả định: Elastic Stack 8.x/9.x hiện hành; ma trận license tham chiếu: https://www.elastic.co/subscriptions. Tôi chưa đối chiếu trang này trong lần soạn này** — bắt buộc xác nhận với Elastic/đối tác trước khi chốt, kể cả danh sách tính năng trả phí ở §6.5. Đây là xung đột trực tiếp giữa ràng buộc ngân sách và gợi ý của khách hàng.
2. **Thay thế**: sau 30 ngày dữ liệu rời cluster (ILM delete phase; chỉ sau khi job snapshot đã xác nhận index đã vào snapshot, xem §4), chỉ còn trong (a) snapshot repository và (b) archive NDJSON bất biến. Khi có yêu cầu truy vấn dữ liệu cũ, **restore** snapshot vào nhóm node "restore" trong < 24h. Kiểu này tiết kiệm lưu trữ theo cách khác (không giữ replica, không giữ bản local của dữ liệu > 30 ngày), nhưng **không** tìm kiếm tại chỗ được.
3. **Elasticsearch không tự chứng minh được "không bị sửa"**. Bằng chứng pháp lý là **archive NDJSON đã băm chuỗi, ký, đóng dấu thời gian, lưu WORM (Object Lock)**; index chỉ là bản tiện truy vấn và được đối chiếu định kỳ với archive.
4. **Che PII trước khi index xung đột với tính nguyên vẹn gốc của bằng chứng** (bản gốc đã bị biến đổi). Cần quyết định pháp lý, xem §8 R2.

## 1. Đầu vào & số học dung lượng

Quy ước: TB = 10^12 byte (thập phân), 1 năm = 365 ngày.

| Đại lượng | Phép tính | Kết quả |
|---|---|---|
| Throughput raw | 20.000 ev/s × 800 B | 16.000.000 B/s = 16 MB/s |
| Event/ngày | 20.000 × 86.400 | 1,728 tỷ |
| **Raw/ngày** | 16 MB/s × 86.400 s | **1,382 TB** (≈ 1,257 TiB) |
| **Raw/năm** | 1,3824 TB × 365 | **504,6 TB** (≈ 458,9 TiB) |
| Raw 30 ngày | 1,3824 × 30 | 41,5 TB |

### Giả định nén (chưa kiểm chứng)

- Hot (codec mặc định LZ4, mapping chặt, `_source` giữ nguyên, doc_values + inverted index): index primary ≈ **0,70 × raw**. 
- Warm (sau `forcemerge` về 1 segment, `index_codec: best_compression` = DEFLATE): ≈ **0,50 × raw**.
- Archive NDJSON gzip/zstd: ≈ **0,15 × raw** (log JSON lặp cấu trúc nén tốt; giả định).
- Snapshot = kích thước shard primary đã merge ≈ 0,50 × raw, không replica (độ bền do object storage đảm nhiệm).
- Headroom đĩa: nhân **1,3** (low watermark 85%, chỗ cho merge/relocation/restore). 

### Dung lượng theo tier (30 ngày tìm kiếm tương tác = hot 7 ngày + warm 23 ngày)

| Tier | Mỗi ngày (primary) | Replica | Số ngày | Dữ liệu | ×1,3 headroom |
|---|---|---|---|---|---|
| Hot | 1,3824 × 0,70 = 0,968 TB | 1 → 1,935 TB | 7 | 13,5 TB | **17,6 TB** |
| Warm | 1,3824 × 0,50 = 0,691 TB | 1 → 1,382 TB | 23 | 31,8 TB | **41,3 TB** |
| Restore (theo yêu cầu) | 0,691 TB | 0 (nguồn là snapshot) | 30 (cửa sổ restore tối đa/lần) | 20,7 TB | **27,0 TB** |
| Snapshot repo (12 tháng) | 0,691 TB | không | 365 | **252,3 TB** | + dự phòng 20% ≈ 303 TB |
| Archive NDJSON WORM (12 tháng) | 0,207 TB | không | 365 | **75,7 TB** | + 20% ≈ 91 TB |

Tổng đĩa node thường trực (hot+warm) ≈ 59 TB cần (hot cấp 32 TB do chọn theo CPU/IO, dư đĩa); restore là nhóm bật theo nhu cầu. Object storage ≈ 328 TB dữ liệu (≈ 394 TB có dự phòng). Nếu có Enterprise, frozen tier sẽ thay phần restore + một phần snapshot, nhưng ngoài ngân sách.

Băng thông restore: 20,7 TB / 24 h = 240 MB/s (≈ 2 Gbps) chỉ để *đạt* 24h; kế hoạch thực tế nhắm hoàn tất trong ≤ 8 h (≈ 720 MB/s) → mạng 10 GbE tới object store, nâng `indices.recovery.max_bytes_per_sec` và `max_restore_bytes_per_sec`. Yêu cầu cụ thể thường nhỏ hơn 30 ngày; restore chỉ các index trong khoảng thời gian cần.

## 2. Node layout

Giả định tải đỉnh = 2× trung bình (40.000 ev/s) — **cần khách hàng xác nhận**. Có 1 replica nên mỗi event được lập chỉ mục 2 lần: ghi hiệu dụng toàn hot = 40k doc/s ở tải trung bình, **80k doc/s ở đỉnh**. Giả định hiệu năng (chưa đo): **mỗi hot node chịu ~10k doc/s, tính cả shard primary lẫn replica**. Do đó số hot node = 80k / 10k = **8** để chịu đỉnh 2× (ở đỉnh mỗi node chạy sát giả định; tải trung bình chỉ ~50%). Persistent queue của Logstash đệm thêm khi đỉnh kéo dài. Nếu khách bỏ yêu cầu đỉnh 2×, 4 node đủ cho tải trung bình (40k doc/s) nhưng không có dư địa.

| Vai trò | Số node | Cấu hình đề xuất | Ghi chú |
|---|---|---|---|
| Master (dedicated, `master`) | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | quorum, trải 3 AZ/rack |
| Hot (`data_hot`,`data_content`) | 8 | 16 vCPU, 64 GB RAM (heap 30 GB), 4 TB NVMe | CPU/IO quyết định: 8 × 10k doc/s = 80k doc/s (primary+replica) = đỉnh 40k ev/s; đĩa 8 × 4 = 32 TB ≥ 17,6 TB |
| Warm (`data_warm`) | 4 | 8 vCPU, 64 GB RAM, 12 TB SSD/HDD RAID | 48 TB ≥ 41,3 TB |
| Restore (`data_cold` làm nhóm restore, bật theo nhu cầu) | 3 | 8 vCPU, 64 GB RAM, 12 TB | 36 TB ≥ 27 TB; có thể là VM tạm dừng khi rảnh; `index.routing.allocation.include._tier_preference: data_cold` |
| Coordinating + Kibana | 2 | 8 vCPU, 32 GB | nằm sau LB, người dùng chỉ vào đây |
| Logstash | 3 | 8 vCPU, 16 GB, 500 GB SSD (persistent queue) | 20k ev/s = 16 MB/s là nhẹ; 3 node để HA, mỗi node chịu được 2× |
| Sealer/Verifier (service tự viết, nhỏ) | 2 (active/standby) | 4 vCPU, 8 GB | ký manifest, xác minh; khóa trong HSM/KMS |
| Object storage S3-compatible có Object Lock | 2 bucket | ≥ 394 TB | bucket `evidence` (WORM), bucket `snapshots` (thường) |

Shard: data stream `audit-*`, rollover `max_primary_shard_size: 40gb` hoặc `max_age: 1d`, 8 primary/index (16 bản shard gồm replica, chia đều 2 bản/node trên 8 hot node), ≈ 0,97 TB primary/ngày ≈ 3 index/ngày. Hot ≈ 21 index × 8 × 2 = 336 shard (≈ 42/node) (nhỏ so với giới hạn heap). Shard ~40 GB nằm trong khoảng khuyến nghị 10–50 GB.

Không dùng Kafka mặc định (tăng vận hành); persistent queue của Logstash + `filebeat` ack đủ cho 16 MB/s. Nếu nguồn không có buffer cục bộ, thêm Kafka là phương án mở rộng.

## 3. Ingest pipeline

```
Nguồn → Elastic Agent/Filebeat (TLS, ack, disk queue)
      → Logstash (HA, persistent queue)
          1. parse + chuẩn hóa ECS, ép timestamp UTC, event.original bị bỏ
          2. MASK (§3.1)
          3. canonicalize (JSON khóa sắp xếp) + event.hash = SHA-256
          4. output A: NDJSON segment (gzip) → bucket evidence (WORM)
          5. output B: Elasticsearch data stream (op_type=create) 
      → ES ingest pipeline `audit-mask-v1` (lớp phòng thủ thứ 2: regex lại email/phone, reject nếu còn sót)
```

Thứ tự bắt buộc: mask → hash → ghi archive & index. Event chỉ được ack ngược về nguồn khi cả A và B thành công (hoặc nằm trong persistent queue).

### 3.1 Che PII (trước khi index)

- Trường có tên biết trước (`user.name`, `user.email`, `client.user.*`, `user.phone`): thay bằng **pseudonym xác định** `HMAC-SHA256(key_pii, giá_trị)` cắt 16 hex, tiền tố loại (`usr_…`, `eml_…`, `tel_…`). Cùng người → cùng token, nên điều tra tương quan vẫn làm được mà không lộ danh tính. Khóa trong Logstash keystore/KMS, xoay khóa có version (`pii.key_id`).
- Văn bản tự do (`message`, `url.query`): regex email, số điện thoại (E.164 và dạng nội địa), cùng danh sách username đã biết; thay bằng `[email]`, `[phone]`. Username trong văn bản tự do **không phát hiện chắc chắn bằng regex** (xem R3).
- Ánh xạ ngược token ↔ danh tính (nếu pháp lý cần) nằm trong kho riêng, truy cập tách biệt, có phê duyệt; không nằm trong Elastic.
- Kiểm thử: bộ test với dữ liệu giả tổng hợp; job quét hàng ngày tìm pattern email/phone trong index (alert nếu > 0).

## 4. ILM policy và chiến lược snapshot

Không có `searchable_snapshot` (Enterprise) nên ILM của Basic **không có action snapshot**. Việc chụp snapshot được tách riêng thành job "snapshotter" (chạy trên node Sealer, cron mỗi giờ).

**Quyết định: chỉ snapshot index đã `forcemerge` xong (warm), không snapshot index hot.** Lý do: snapshot là incremental theo file segment; nếu SLM chụp cả index hot theo giờ với retention 400 ngày, các segment hot chưa merge (~0,70×raw) của mọi snapshot cũ vẫn bị giữ, cộng với segment đã merge (~0,50×raw) → repo lớn khoảng 1,2–1,7× ước tính (≈ 300–430 TB chỉ riêng phần dữ liệu thay vì 252 TB). Chụp một lần, sau merge, thì mỗi index chỉ được lưu một lần ở dạng ≈ 0,50×raw, nên số liệu §1 (252,3 TB, +20% = 303 TB) đúng với chiến lược này. Dữ liệu hot (≤ 7 ngày) được bảo vệ bằng replica và bằng archive WORM (có thể reindex lại từ archive nếu mất hot).

Job snapshotter, mỗi lần chạy:
1. `GET audit-*/_ilm/explain`, lấy các backing index có `phase: warm` và `action: complete`/`step: complete` (forcemerge + readonly đã xong; tên field cần kiểm trên phiên bản thực tế) và chưa có snapshot.
2. `PUT _snapshot/audit_snapshots/audit-<tên-index>` với `indices: [<backing index>]`, `include_global_state: false`, `wait_for_completion=false`; theo dõi tới `SUCCESS` và kiểm `shards.failed = 0`. Ghi tên snapshot vào index cấu hình `audit-snapshot-ledger` (hoặc custom metadata của snapshot) để audit.
3. Xóa snapshot quá 400 ngày (SLM retention không áp dụng cho snapshot do job tạo) và không có legal hold.

Chốt chặn trước khi xóa khỏi cluster: do không dùng `wait_for_snapshot` (cần SLM policy), job snapshotter đặt cảnh báo cao khi một index tuổi ≥ 20 ngày chưa có snapshot `SUCCESS`, và **tự chạy `POST _ilm/stop`** nếu index tuổi ≥ 27 ngày vẫn chưa có (ILM delete ở 30 ngày). Có 23 ngày dư địa giữa lúc index vào warm (ngày 7) và lúc bị xóa (ngày 30). Phương án thay thế cần thử trên staging: một SLM policy `audit-warm` với `indices` dùng date math loại các index hot, rồi dùng `wait_for_snapshot` trong ILM; chỉ chọn nếu staging chứng minh nó không chụp index hot.

```json
PUT _ilm/policy/audit
{ "policy": { "phases": {
  "hot":  { "actions": {
      "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "7d", "actions": {
      "set_priority": { "priority": 50 },
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "readonly": {} } },
  "delete": { "min_age": "30d", "actions": { "delete": {} } }
}}}
```

Ghi chú: `min_age` tính từ thời điểm rollover; đặt `delete.min_age` = 30d để dữ liệu ngày cũ nhất vẫn ≥ 30 ngày tìm kiếm được. Retention 12 tháng đặt thành **400 ngày** (margin năm nhuận, lệch lịch, legal hold) cho snapshot, và Object Lock archive ≥ 400 ngày. Xóa chỉ xảy ra sau khi hết hạn *và* không có legal hold. Chưa dùng `shrink`; bỏ qua cho đơn giản. Cần kiểm thử toàn bộ chuỗi ILM + snapshotter + chốt chặn ở staging (cú pháp JSON chưa chạy trên cluster thật).

## 5. Truy vấn dữ liệu cũ (SLA 24h)

1. Người dùng gửi yêu cầu (khoảng thời gian, điều kiện). 
2. Runbook: bật 3 node restore, tra ledger để lấy snapshot của các backing index trùng khoảng thời gian, rồi khôi phục **thành index thường, không thành data stream, và gỡ ILM**:
   ```json
   POST _snapshot/audit_snapshots/audit-<tên-index>/_restore
   { "indices": ".ds-audit-*-<ngày>-*", "include_global_state": false,
     "rename_pattern": "\\.ds-(.+)", "rename_replacement": "restored-$1",
     "ignore_index_settings": ["index.lifecycle.name", "index.lifecycle.rollover_alias", "index.lifecycle.indexing_complete"],
     "index_settings": { "index.number_of_replicas": 0,
                         "index.routing.allocation.include._tier_preference": "data_cold" } }
   ```
   `ignore_index_settings` bắt buộc: nếu giữ `index.lifecycle.name` thì ILM (delete `min_age` 30d, tính từ rollover cũ) sẽ xóa ngay index vừa restore. Sau restore kiểm `GET restored-audit-*/_ilm/explain` phải báo "không được quản lý". Người dùng truy vấn bằng pattern `restored-audit-*` (tạo alias `audit-restored` cho Kibana data view); không truy vấn qua `audit-*` để tránh lẫn với data stream. Chi tiết rename/restore backing index cần diễn tập trên staging.
3. **Trước khi cấp quyền tìm kiếm**: job verify so hash từng doc/segment với archive (§6); chỉ kết quả đã xác minh được dùng làm bằng chứng.
4. Dữ liệu restore xóa **thủ công/bằng job** sau N ngày (mặc định 14; không dùng ILM vì đã gỡ), rồi tắt node.

Mục tiêu nội bộ: bắt đầu ≤ 2h, restore ≤ 8h, verify ≤ 4h, dự phòng ~10h. Phải diễn tập (drill) mỗi quý bằng cách restore 30 ngày thật và đo thời gian.

## 6. Bảo đảm toàn vẹn ("provably unaltered")

Các lớp, từ mạnh nhất:

1. **Archive WORM**: Logstash ghi segment NDJSON đã mask, mỗi dòng có `event.hash` (SHA-256 của dạng canonical) và `event.seq` theo nguồn. Segment đóng mỗi 1 phút/256 MB. Bucket `evidence` bật **S3 Object Lock chế độ Compliance**, retention ≥ 400 ngày, versioning bật, khóa IAM không có quyền bypass.
2. **Chuỗi băm/Merkle**: Sealer tính Merkle root cho mỗi segment, `chain_hash_n = SHA-256(chain_hash_{n-1} ‖ root_n ‖ meta)`. Manifest `{segment, root, prev, count, min/max ts, pii.key_id}` được **ký Ed25519** (khóa trong HSM/KMS, không xuất ra) và **đóng dấu thời gian RFC 3161** bởi TSA bên ngoài; manifest + dấu thời gian cũng ghi vào WORM. Xóa/sửa/chèn một event làm hỏng root, chuỗi, hoặc dãy `event.seq`.
3. **Neo ngoài hệ thống**: mỗi ngày công bố chain hash cuối ngày tới nơi độc lập (email ký tới bộ phận pháp chế/kiểm toán, hoặc TSA).
4. **Đối chiếu index ↔ archive**: job hằng ngày tính lại hash từ `_source` của index (đã warm) và so với manifest; lệch → cảnh báo mức cao. Sau restore cũng chạy.
5. **Hạn chế trong ES**: RBAC của Basic — ghi vào data stream chỉ bằng role `audit_writer` (`create_doc`, không `delete`/`index` ghi đè); không ai có `delete_index` ngoài ILM; TLS giữa các node và client; Kibana chỉ role đọc. Lưu ý: *document/field-level security, audit log của Elasticsearch, SAML/LDAP nâng cao là tính năng trả phí* nên không dựa vào chúng; ghi log truy cập bằng reverse proxy/LB trước Kibana (theo ma trận license của Elastic 8.x/9.x tại https://www.elastic.co/subscriptions; **chưa đối chiếu trong lần soạn này**, phải xác nhận trước khi chốt).
6. Đồng bộ giờ NTP/chrony có giám sát ở mọi node; `ingest.timestamp` do Logstash gán, tách khỏi `@timestamp` của nguồn.
7. **Snapshot repo không được đặt Object Lock**: Elasticsearch cần ghi/xóa blob metadata trong repo, nên WORM sẽ làm hỏng repo. Do đó snapshot không phải bằng chứng; bằng chứng là archive. Snapshot dùng bucket riêng, khóa quyền ghi hẹp, versioning bật.

Quy trình trình tòa: lấy segment từ WORM → kiểm chữ ký manifest, dấu thời gian, chuỗi, Merkle path của từng event → báo cáo xác minh.

## 7. Bảo mật vận hành khác

TLS mọi liên kết; secret trong keystore/KMS; tách quyền quản trị cluster, quản trị khóa ký, quản trị bucket WORM (không một người nắm cả ba); sao lưu cấu hình ILM/pipeline vào git.

## 8. Rủi ro và xung đột trong đầu vào

| # | Vấn đề | Tác động | Xử lý đề xuất |
|---|---|---|---|
| R1 | Searchable snapshots/frozen cần Enterprise, trái ràng buộc Basic | Gợi ý của khách không khả thi; không tìm kiếm trực tiếp trên snapshot | Dùng restore-on-demand (§5); hoặc khách nâng Enterprise — khi đó có thể bỏ nhóm restore và giảm tier warm; cần báo giá |
| R2 | Mask trước index vs. bằng chứng pháp lý "nguyên vẹn" | Bản gốc không còn → bên đối lập có thể phản bác tính xác thực | Cần ý kiến pháp chế. Phương án: (a) chấp nhận bản đã mask là bản bằng chứng, ghi rõ trong quy trình và băm *sau* mask (đề xuất mặc định); (b) giữ thêm bản gốc mã hóa trong két riêng (envelope encryption, quyền truy cập đặc biệt) — làm tăng rủi ro PII và phải khớp với chính sách bảo vệ dữ liệu |
| R3 | Che username trong văn bản tự do không đáng tin bằng regex | Rò PII | Chuẩn hóa nguồn để username nằm ở trường có cấu trúc; danh sách username biết trước; scan hậu kiểm |
| R4 | Mask không đảo ngược làm khó điều tra | Phải tra ngược token | Pseudonym xác định + kho ánh xạ riêng có kiểm soát |
| R5 | "12 tháng" mơ hồ (365/366 ngày, từ lúc nào) và quyền xóa của chủ thể dữ liệu vs. nghĩa vụ giữ bằng chứng | Pháp lý | Retention 400 ngày, Object Lock tương ứng; xác nhận với pháp chế; legal hold quy trình riêng |
| R6 | Elasticsearch Basic không có tính năng chống sửa/audit nội tại | Index không phải bằng chứng | Kiến trúc archive WORM (§6) |
| R7 | SLA 24h phụ thuộc băng thông và tải đồng thời | Có thể trượt khi nhiều yêu cầu cùng lúc | Giới hạn 30 ngày/lần; diễn tập hằng quý; xếp hàng yêu cầu |
| R8 | Tải đỉnh, burst chưa xác định; 10k doc/s/node (gồm replica) là giả định | Thiếu hot capacity; nếu thực đo < 10k thì cần thêm node | Xác nhận peak và benchmark §9; persistent queue 500 GB ≈ 8,7 giờ ở 16 MB/s đệm sự cố |
| R9 | Hệ số nén là giả định; sai ±30% làm lệch ±30% dung lượng | Mua thiếu/thừa | Benchmark §9 |
| R10 | Basic không có hỗ trợ chính thức/SLA từ Elastic, không có alerting Watcher | Vận hành tự chịu | Dùng alert ngoài (Prometheus/Alertmanager, script) cho job verify, ILM, snapshotter |
| R11 | Single site | Mất site = mất dịch vụ | Bucket archive replicate cross-region (Object Lock hỗ trợ); cluster dựng lại từ snapshot |
| R12 | Ghi chú chưa đo | Thiết kế này chưa chạy thử | Toàn bộ số hiệu năng/nén là giả định |

## 9. Kế hoạch kiểm chứng trước khi chốt

1. Benchmark 1 ngày dữ liệu mẫu tổng hợp (800 B, đã mask) bằng Rally hoặc script: đo tỷ lệ nén hot/warm/archive, ev/s mỗi hot node.
2. Thử ILM + snapshotter + chốt chặn (`_ilm/stop`) và đường restore §5 (kể cả việc index restore không bị ILM xóa) trên staging; thử restore 1 ngày và 30 ngày, đo thời gian.
3. Thử đường xác minh: sửa 1 byte ở archive/index → hệ thống phải phát hiện.
4. Đối chiếu ma trận tính năng Basic với từng thành phần ở trên.
5. Chốt R2 với pháp chế, và peak ev/s với khách hàng.
