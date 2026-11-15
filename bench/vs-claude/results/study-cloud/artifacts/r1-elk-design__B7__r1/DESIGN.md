# DESIGN — Nền tảng audit log trên Elastic Stack (license Basic)

> Phiên bản: 1.0 (đề xuất) · Ngày: 2026-11-02 · Phân loại: internal
> Phạm vi: kiến trúc, sizing, ingest pipeline, ILM, cơ chế bảo toàn tính toàn vẹn, rủi ro/xung đột trong đầu vào.
> Quy ước: **[GĐ]** = giả định cần xác nhận/PoC; **[XM]** = điều khoản license/tính năng cần xác minh lại với ma trận subscription Elastic của đúng phiên bản triển khai trước khi ký thiết kế (tài liệu này soạn không truy cập được trang elastic.co/subscriptions).

---

## 0. Tóm tắt điều hành

1. **Đề xuất của khách hàng "dùng searchable snapshots cho cold/frozen" không thực hiện được trên license Basic.** Searchable snapshots (cả mount kiểu cold "fully mounted" lẫn frozen "partially mounted") là tính năng **Enterprise** [XM]. Đây là xung đột trực tiếp giữa hai đầu vào; tài liệu chọn phương án Basic và nêu chi phí của phương án thay thế.
2. Kiến trúc đề xuất: **hot (7 ngày) + warm (23 ngày) online có replica** cho 30 ngày tìm kiếm tương tác; **ngày 31–365 nằm trong snapshot repository (object storage)** và được **restore theo yêu cầu** vào nhóm node "restore" — đáp ứng SLA "tìm được trong 24 giờ" cho một cửa sổ tối đa ~31 ngày dữ liệu mỗi yêu cầu (xem §7, xung đột C3).
3. **Bằng chứng pháp lý không nằm trong Elasticsearch.** Elasticsearch không phải WORM (superuser xóa/sửa được). Bằng chứng là **kho raw archive bất biến** (Object Lock compliance mode) với hash SHA-256 từng event, Merkle root theo block, manifest ký số + timestamp RFC 3161 và chuỗi hash nối manifest. Bản trong Elasticsearch là **bản dẫn xuất đã mask**, chứng minh được là trung thực bằng cách tái lập hash.
4. **Xung đột "mask trước khi index" ↔ "chứng minh không bị sửa đổi"**: bản đã mask *chính là* bản bị biến đổi. Giải quyết bằng tách hai vai trò: raw (có PII, mã hóa, truy cập hai người) là bằng chứng; bản mask là bản tra cứu.
5. Dung lượng (giả định nén cơ sở): raw **1,38 TB/ngày, 504,6 TB/năm**; online 30 ngày **53,6 TB** (kể cả replica); snapshot repository **~363 TB**; raw archive nén **~76 TB/năm**. Tổng đĩa data Elasticsearch đề xuất: **119 TB** trên 15 data node.

---

## 1. Bối cảnh & NFR

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Tốc độ ingest | 20.000 events/s, liên tục 24/7 | Khách hàng |
| Kích thước event | 800 byte trung bình (raw) | Khách hàng |
| Đỉnh tải | Không được cung cấp → thiết kế headroom 1,5× (30.000 eps) ở tầng xử lý; Kafka hấp thụ burst lớn hơn | [GĐ] |
| Retention | 12 tháng (365 ngày) | Khách hàng |
| Tìm kiếm tương tác | 30 ngày gần nhất; mục tiêu p95 < 10 s cho truy vấn lọc theo thời gian + trường keyword | [GĐ] về con số latency |
| Tìm kiếm dữ liệu cũ | ≤ 24 h kể từ yêu cầu | Khách hàng (phạm vi thời gian mỗi yêu cầu chưa rõ — C3) |
| Toàn vẹn | Chứng minh được không bị thay đổi (bằng chứng pháp lý) | Khách hàng |
| Dữ liệu cá nhân | Username, e-mail, số điện thoại phải được mask trước khi index | Khách hàng |
| License | Elastic Basic (miễn phí) | Khách hàng |
| Độ trễ ingest → tìm thấy | ≤ 60 s ở trạng thái bình thường | [GĐ] |
| RPO dữ liệu đã nhận | 0 cho bằng chứng (event chỉ được ack khi Kafka ghi RF=3, min.insync=2) | Thiết kế |
| RTO tìm kiếm tương tác | ≤ 4 h khi mất 1 node/1 zone (cụm vẫn chạy, chỉ giảm hiệu năng) | [GĐ] |
| Nhãn dữ liệu | Nhật ký kiểm toán có DLCN (định danh người dùng) → nhạy cảm nội bộ | Suy từ đầu vào |
| Cấp độ ATTT | Chưa có phân loại HTTT. **Giả định cấp 3** (NĐ 85/2016, TT 12/2022 — cần soát văn bản thay thế hiện hành) vì là hệ thống lưu bằng chứng, chứa DLCN, phục vụ nội bộ tổ chức. Cần chủ đầu tư xác nhận. | [GĐ] |
| Khung pháp lý DLCN | Phụ thuộc pháp quyền của khách hàng; nếu tại Việt Nam: NĐ 13/2023/NĐ-CP và Luật Bảo vệ DLCN 2025 — cần bộ phận pháp chế xác nhận hiệu lực/điều khoản áp dụng | [GĐ] |

Hệ thống hiện có: repository trống (chỉ có `.gitkeep`), không có cấu hình/stack hiện hữu để tham chiếu — mọi thành phần dưới đây là thiết kế mới.

---

## 2. Tính toán dung lượng

### 2.1 Volume raw

```
Tốc độ raw     = 20.000 ev/s × 800 B          = 16.000.000 B/s = 16 MB/s  (≈ 128 Mbit/s)
Event/ngày     = 20.000 × 86.400              = 1.728.000.000 event
Raw/ngày       = 16 MB/s × 86.400 s           = 1.382.400.000.000 B = 1,3824 TB  (≈ 1,257 TiB)
Raw/30 ngày    = 1,3824 × 30                  = 41,472 TB
Raw/năm        = 1,3824 × 365                 = 504,576 TB  (≈ 458,9 TiB)
```
(TB = 10^12 byte; TiB = 2^40 byte.)

### 2.2 Giả định nén (tỷ lệ dung lượng trên đĩa / raw, **chưa tính replica**)

| Ký hiệu | Trạng thái index | Cơ sở | Bi quan | Lạc quan |
|---|---|---|---|---|
| r_hot | Đang ghi, codec mặc định (LZ4), nhiều segment | **0,8** | 1,2 | 0,6 |
| r_merged | Sau force-merge 1 segment + `best_compression` (DEFLATE) | **0,6** | 1,0 | 0,4 |
| r_gzip | Raw archive NDJSON gzip | **0,15** | 0,25 | 0,10 |

Căn cứ và giới hạn của giả định:
- Trên Basic **không có** `logsdb` index mode / synthetic `_source` (Enterprise [XM]) — vốn là cách giảm mạnh dung lượng log. Vì vậy tỷ lệ phụ thuộc chủ yếu vào mapping: phải dùng mapping tường minh (`dynamic: strict` hoặc `false`), không sinh cặp `text`+`keyword` cho mọi chuỗi, `message` dùng `match_only_text`, tắt `norms`/`doc_values` ở trường không cần.
- `_source` (bản JSON đã mask) vẫn lưu đầy đủ → tỷ lệ khó xuống dưới ~0,4.
- **Con số phải được đo lại trong PoC** bằng dữ liệu mẫu thật (đã mask) với API `POST <index>/_disk_usage?run_expensive_tasks=true` và `GET _cat/indices?v&h=index,pri.store.size,docs.count`. Bảng độ nhạy ở §2.5.

### 2.3 Dung lượng theo tier (kịch bản cơ sở)

Mức lấp đầy mục tiêu cho đĩa data: **≤ 75%** (dưới watermark low 85% mặc định, chừa chỗ cho merge và tái phân bổ khi mất node).

| Tier | Tuổi dữ liệu | Công thức | Lưu trữ (kể cả replica) | Dung lượng cần (÷0,75) |
|---|---|---|---|---|
| Hot | 0–7 ngày | 7 × 1,3824 × 0,8 × **2** (1 primary + 1 replica) | **15,48 TB** | 20,64 TB |
| Warm | 8–30 ngày | 23 × 1,3824 × 0,6 × **2** | **38,15 TB** | 50,87 TB |
| **Online (30 ngày)** | | | **53,64 TB** | 71,51 TB |
| Snapshot repo (object storage) | 0–365 ngày | 365 × 1,3824 × 0,6 × **1** = 302,75 TB; **+20%** overhead (segment của write index bị chụp trước khi force-merge, xem §5.3) | **≈ 363 TB** (logic) | + overhead bảo vệ của object storage (vd. erasure coding 1,5× → ~545 TB raw disk) [GĐ] |
| Restore (on-demand) | cửa sổ ≤ 31 ngày | 31 × 1,3824 × 0,6 × **0 replica** | **25,71 TB** | 34,28 TB |
| Raw evidence archive (WORM) | 0–365 ngày | 365 × 1,3824 × 0,15 | **≈ 75,7 TB** | ×2 nếu nhân bản sang site thứ hai |
| Kafka buffer | 72 h | 3 × 1,3824 × RF **3** (không tính nén producer) | **12,44 TB** | ~17,8 TB (÷0,7) |

Ghi chú về replica:
- Hot/warm: 1 replica — chịu được mất 1 node mà không mất dữ liệu tìm kiếm tương tác.
- Restore: 0 replica — dữ liệu tạm thời, nguồn gốc là snapshot; mất node thì restore lại.
- Snapshot repo: 1 bản logic; độ bền do object storage đảm bảo (EC/replication), không phải Elasticsearch.

### 2.4 Kiểm tra thông lượng

```
Ghi index (hot):  20.000 doc/s × 2 (primary + replica) = 40.000 doc/s ghi trên 6 hot node ≈ 6.700 doc/s/node
Ghi đĩa hot:      16 MB/s × 0,8 × 2 = 25,6 MB/s bền vững (+ merge, translog ⇒ thiết kế cho ~150 MB/s/node NVMe)
Mạng ingest:      ~128 Mbit/s raw vào; Kafka RF3 ⇒ ~384 Mbit/s replication — 10 GbE dư
Restore 31 ngày:  25,71 TB ÷ 1 GB/s  ≈ 7,1 h;  ÷ 0,5 GB/s ≈ 14,3 h   (thông lượng tổng hợp [GĐ], đo trong PoC)
Restore 365 ngày: 302,75 TB ÷ 1 GB/s ≈ 84 h  → KHÔNG đạt 24 h (xem C3)
```
6.700 doc/s/node với document ~800 B là mức vừa phải cho node 16 vCPU [GĐ] — phải đo bằng `esrally` với track tùy biến từ dữ liệu mẫu.

### 2.5 Độ nhạy theo tỷ lệ nén

| Kịch bản (r_hot / r_merged) | Hot 7 ngày ×2 | Warm 23 ngày ×2 | Snapshot 365 ngày (chưa +20%) | Restore 31 ngày |
|---|---|---|---|---|
| Lạc quan (0,6 / 0,4) | 11,61 TB | 25,44 TB | 201,8 TB | 17,1 TB |
| **Cơ sở (0,8 / 0,6)** | **15,48 TB** | **38,15 TB** | **302,7 TB** | **25,7 TB** |
| Bi quan (1,2 / 1,0) | 23,22 TB | 63,59 TB | 504,6 TB | 42,9 TB |

Nếu PoC cho kết quả gần kịch bản bi quan: thêm 2 hot node và 2 warm node; snapshot repo cần ~605 TB logic.

---

## 3. Kiến trúc & luồng dữ liệu

### 3.1 Sơ đồ tổng thể

```
 Nguồn log (ứng dụng, OS, thiết bị)
   │  Elastic Agent / Filebeat / syslog-TLS (mTLS)                     ◄── chặng NHẠY CẢM: có PII
   ▼
 ┌───────────────────────────────┐
 │ Kafka (3 broker, RF=3, 72 h)  │  topic: audit-raw (PII, mã hóa đĩa, ACL chặt)
 └──────┬─────────────────┬──────┘
        │ consumer group A │ consumer group B
        ▼                  ▼
 ┌──────────────────┐  ┌──────────────────────────────────────────────┐
 │ Integrity        │  │ Logstash (4 node)                            │
 │ Archiver (2, HA) │  │ hash raw → parse → MASK (HMAC) → kiểm PII dư │
 │ hash/Merkle/ký/  │  │ → hash bản mask → bulk create                │
 │ TSA RFC 3161     │  └──────────────┬───────────────────────────────┘
 └───────┬──────────┘                 │ (đã mask — từ đây KHÔNG còn PII thô)
         ▼                            ▼
 ┌──────────────────────┐   ┌──────────────────────────────────────────┐
 │ Object storage       │   │ Elasticsearch cluster (Basic)            │
 │ bucket EVIDENCE      │   │ 3 master │ 6 hot │ 6 warm │ 3 restore    │
 │ Object Lock          │   │ 2 coordinating                           │
 │ COMPLIANCE, mã hóa   │   └───────┬──────────────────────┬───────────┘
 │ (raw + manifest ký)  │           │ SLM nightly           │ restore khi có yêu cầu
 └──────────────────────┘           ▼                       │
                            ┌──────────────────────┐        │
                            │ bucket SNAPSHOTS     │────────┘
                            │ (versioning, ACL)    │
                            └──────────────────────┘
 Kibana (2) ◄── reverse proxy (TLS, ghi access log) ◄── điều tra viên / kiểm toán viên
 Cụm monitoring riêng (Metricbeat → 1–3 node) — Stack Monitoring có trên Basic [XM]
```

### 3.2 Bố trí node (3 zone/rack/phòng máy; mỗi tier chia đều qua zone, bật `cluster.routing.allocation.awareness.attributes: zone`)

| Vai trò | Số lượng | Cấu hình mỗi node [GĐ — chốt sau PoC] | Tổng đĩa | Ghi chú |
|---|---|---|---|---|
| Master (dedicated) | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | — | 1/zone, quorum |
| Hot (`data_hot`, `data_content`) | 6 | 16 vCPU, 64 GB RAM (heap 31 GB), 3,84 TB NVMe | 23,04 TB | Cần 20,64 TB. Mất 1 node: 15,48/19,2 = 81% (< 85% low watermark) |
| Warm (`data_warm`) | 6 | 8 vCPU, 64 GB RAM (heap 31 GB), 10 TB SSD | 60 TB | Cần 50,87 TB. Mất 1 node: 38,15/50 = 76% |
| Restore (`data_cold`) | 3 | 8 vCPU, 64 GB RAM, 12 TB SSD/HDD | 36 TB | Cần 34,28 TB cho 31 ngày; bình thường gần trống. Vai trò `data_cold` dùng được trên Basic, chỉ *mount searchable snapshot* là Enterprise [XM] |
| Coordinating-only | 2 | 8 vCPU, 32 GB RAM | — | Đích của Kibana và API tìm kiếm |
| Kibana | 2 | 4 vCPU, 8 GB RAM | — | Sau load balancer/reverse proxy |
| Logstash | 4 | 16 vCPU, 32 GB RAM, 200 GB SSD (persistent queue nhỏ) | — | N+1: 3 node phải chịu ≥ 20.000 eps (~7.000 eps/node) [GĐ] |
| Kafka broker | 3 | 8 vCPU, 32 GB RAM, 8 TB SSD | 24 TB | Cần ~17,8 TB; KRaft controller đồng vị hoặc 3 VM nhỏ |
| Integrity Archiver | 2 | 4 vCPU, 8 GB RAM | — | Active/standby theo consumer group; khóa ký trong HSM/KMS |
| Monitoring cluster | 1–3 | 4 vCPU, 16 GB RAM, 1 TB | — | Tách khỏi cụm chính |
| Object storage S3-compatible | 1 hệ | Hỗ trợ Object Lock (compliance) + versioning | ~363 TB + ~76 TB logic | Có thể là S3-compatible on-prem; nên nhân bản sang site thứ hai |

**Tổng đĩa data Elasticsearch: 23,04 + 60 + 36 = 119 TB (15 data node).**

### 3.3 Sharding

- Một data stream `logs-audit-default`, template `number_of_shards: 6` (1 primary/hot node), `number_of_replicas: 1`.
- Rollover theo `max_primary_shard_size: 50gb` hoặc `max_age: 1d`. Một ngày ≈ 1,106 TB primary (r_hot) ⇒ ~3,7 lần rollover/ngày, ~22 primary shard/ngày.
- 30 ngày online ≈ 660 primary + 660 replica = ~1.320 shard — xa ngưỡng khuyến nghị. Shard sau force-merge ≈ 37 GB (0,6/0,8 × 50 GB).

---

## 4. Ingest pipeline

### 4.1 Thu thập và đệm
- Agent/Filebeat gửi sang Kafka qua TLS (mTLS), `acks=all`, broker `min.insync.replicas=2`, topic `audit-raw` (không compaction, retention 72 h), mỗi event mang `source.id` và thời điểm nhận.
- Kafka ACL: chỉ principal của shipper được `WRITE`; chỉ hai consumer group (Archiver, Logstash) được `READ`. Đĩa broker mã hóa (LUKS) vì topic chứa PII.
- Kafka tạo **địa chỉ bất biến của event**: `(topic, partition, offset)` — nền tảng cho chứng minh *đầy đủ* (không mất, không chèn) ở §6.

### 4.2 Logstash pipeline (thứ tự xử lý)

| Bước | Xử lý | Plugin (Logstash, miễn phí) |
|---|---|---|
| 1 | Đọc `audit-raw`, gắn metadata partition/offset | `kafka` input, `decorate_events => basic` |
| 2 | `audit.event_id` = SHA-256(`topic|partition|offset`); `audit.raw_sha256` = SHA-256(bytes raw) — **cùng thuật toán với Archiver** | `fingerprint` (SHA256) |
| 3 | Parse JSON/định dạng nguồn → ECS (`user.name`, `user.email`, `user.phone`…, `@timestamp` = thời điểm sự kiện) | `json`, `dissect`/`grok`, `date` |
| 4 | **Mask trường cấu trúc**: tính `HMAC-SHA256(key_vN, giá_trị_chuẩn_hóa)` → `user.name_hash`…; thay giá trị gốc bằng chuỗi mask (vd. `usr_3f9a1c…` 12 hex đầu, e-mail giữ domain `***@example.org` nếu khách hàng chấp nhận, điện thoại `********123`) | `fingerprint` (có `key` ⇒ HMAC), `mutate` |
| 5 | **Mask văn bản tự do** (`message`, `url.query`, các trường chuỗi khác): regex e-mail, số điện thoại (E.164 và mẫu nội địa), mẫu `user=…/login=…` → thay bằng token | `mutate gsub` / `ruby` |
| 6 | **Kiểm PII còn sót**: chạy lại bộ regex; nếu khớp → đưa sang topic `audit-quarantine` (mã hóa, retention ngắn, cảnh báo) và **không** gửi Elasticsearch | điều kiện `if`, `kafka` output |
| 7 | `audit.doc_sha256` = SHA-256 của bản đã mask chuẩn hóa (thứ tự trường cố định); `audit.mask_key_version` | `fingerprint` (`concatenate_all_fields` hoặc `ruby` canonical JSON — chọn trong PoC sao cho tái lập được) |
| 8 | Gửi `_bulk` **op_type create**, `document_id => audit.event_id` vào data stream | `elasticsearch` output |

Đặc tính quan trọng:
- **PII thô không bao giờ đến Elasticsearch** (không đi qua bộ nhớ node ES, không vào translog/snapshot).
- `document_id` xác định từ offset ⇒ Logstash/Kafka replay **idempotent**: bản trùng nhận 409 và bị bỏ qua, không tạo bản sao; hai event hợp lệ có nội dung giống nhau vẫn khác offset nên không bị gộp nhầm. Đánh đổi: `_id` tự đặt làm chậm indexing (phải kiểm tra tồn tại) — đo trong PoC.
- HMAC có khóa (không phải hash trần) ⇒ không đảo ngược bằng từ điển username/số điện thoại; cùng một người cho cùng token ⇒ điều tra viên vẫn tương quan được hành vi. Khóa nằm trong Vault/KMS, xoay vòng theo `mask_key_version`. **Bản mask vẫn là dữ liệu đã giả danh hóa (pseudonymised), vẫn là DLCN** — không được coi là ẩn danh.
- Elasticsearch ingest pipeline (tầng phòng thủ thứ hai, `index.final_pipeline`): chỉ `set event.ingested` và `fail` nếu `user.email`/`user.phone` không khớp mẫu đã mask. Không dựa vào `redact` processor của ES vì license của processor này cần xác minh [XM] và vì muốn PII không đi vào ES.
- Thời gian: NTP/chrony bắt buộc trên mọi node; giữ cả `@timestamp` (sự kiện), thời điểm Kafka nhận, `event.ingested`.

### 4.3 Index template (rút gọn)

```json
PUT _index_template/logs-audit
{
  "index_patterns": ["logs-audit-*"],
  "data_stream": {},
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 6,
      "number_of_replicas": 1,
      "index.lifecycle.name": "audit-30d-online",
      "index.refresh_interval": "10s",
      "index.final_pipeline": "audit-guard",
      "index.routing.allocation.include._tier_preference": "data_hot"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":  { "type": "date" },
        "event":   { "properties": { "ingested": { "type": "date" }, "action": { "type": "keyword" }, "outcome": { "type": "keyword" } } },
        "message": { "type": "match_only_text" },
        "user":    { "properties": {
          "name": { "type": "keyword" }, "name_hash": { "type": "keyword" },
          "email": { "type": "keyword" }, "email_hash": { "type": "keyword" },
          "phone": { "type": "keyword" }, "phone_hash": { "type": "keyword" } } },
        "audit":   { "properties": {
          "event_id": { "type": "keyword" }, "raw_sha256": { "type": "keyword", "index": false },
          "doc_sha256": { "type": "keyword", "index": false }, "mask_key_version": { "type": "keyword" },
          "kafka": { "properties": { "partition": { "type": "integer" }, "offset": { "type": "long" } } },
          "block_id": { "type": "keyword" } } }
      }
    }
  }
}
```
(Danh sách trường nghiệp vụ đầy đủ chốt khi có mẫu log; `dynamic: strict` buộc mọi trường mới phải qua review — tránh rò PII qua trường lạ.)

---

## 5. ILM, SLM và truy xuất dữ liệu cũ

### 5.1 ILM policy

```json
PUT _ilm/policy/audit-30d-online
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover":   { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
          "readonly":   {},
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "allocate":     { "number_of_replicas": 1 },
          "readonly":     {},
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-archive-nightly" },
          "delete": {}
        }
      }
    }
  }
}
```
- `min_age` tính từ lúc rollover ⇒ index bị xóa khỏi cụm ở ~30 ngày + ≤ 1 ngày: luôn thỏa "30 ngày gần nhất tìm kiếm tương tác".
- Force-merge + `best_compression` đặt ở hot (sau rollover) để snapshot chụp phần lớn segment đã nén — giảm dung lượng repo; đánh đổi là tải I/O merge trên NVMe hot (đã tính vào cấu hình).
- Migrate hot → warm do ILM tự thêm (`migrate` mặc định theo `_tier_preference`).
- `wait_for_snapshot` bảo đảm **không xóa index nào chưa nằm trong snapshot thành công**.
- Không có phase cold/frozen: cả hai trên Basic chỉ có ý nghĩa nếu giữ index thường online (phương án B ở ADR-1) — searchable_snapshot action là Enterprise [XM].

### 5.2 SLM policy

```json
PUT _slm/policy/audit-archive-nightly
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-{now/d}>",
  "repository": "audit-snapshots",
  "config": { "indices": ["logs-audit-*"], "include_global_state": false },
  "retention": { "expire_after": "380d", "min_count": 30 }
}
```
Thêm policy `cluster-config-daily` (`include_global_state: true`, chỉ trạng thái cụm, giữ 30 bản) để dựng lại cụm. Repository loại `s3` trỏ bucket `SNAPSHOTS` (versioning bật; credential ES chỉ có quyền trên bucket này). Chạy `POST _snapshot/audit-snapshots/_verify` và `_snapshot/audit-snapshots/_verify_integrity` [XM về phiên bản hỗ trợ] định kỳ.

### 5.3 Vì sao +20% overhead repo
Snapshot nightly chụp cả write index đang ghi (chưa force-merge, r_hot). Sau force-merge các segment này bị thay, nhưng bản cũ còn trong repo tới khi snapshot chứa chúng hết hạn (380 ngày). Trung bình write index lúc 01:30 ≈ một nửa rollover (~150 GB nén) so với ~830 GB/ngày đã merge ⇒ ~18%, làm tròn **20%** [GĐ, đo thực tế bằng `GET _snapshot/audit-snapshots/_status`/thống kê bucket].

### 5.4 Quy trình "tìm dữ liệu cũ trong 24 h"

1. Yêu cầu (có số phiếu, khoảng thời gian, người phê duyệt) → vận hành xác định snapshot chứa các backing index theo thời gian (`GET _snapshot/audit-snapshots/_all` + tên index có ngày).
2. `POST _snapshot/audit-snapshots/<snap>/_restore` với `rename_pattern` → `restored-…`, `index_settings: { "index.number_of_replicas": 0, "index.routing.allocation.include._tier_preference": "data_cold" }`.
3. Chạy kiểm chứng mẫu (§6.4) trên index đã restore; mở quyền đọc cho người yêu cầu qua role riêng (`restored-<phiếu>-*`).
4. Hết hạn điều tra (mặc định 14 ngày [GĐ]) → xóa index restore.

Năng lực: ≤ 31 ngày dữ liệu/yêu cầu trong ~7–14 h truyền tải (§2.4) + thời gian thủ tục ⇒ đạt 24 h. Yêu cầu lớn hơn: chia đợt (mỗi 24 h thêm ~31 ngày) hoặc tăng restore node. Tinh chỉnh `indices.recovery.max_bytes_per_sec` và `max_restore_bytes_per_sec` cho node restore khi PoC.

---

## 6. Bảo đảm tính toàn vẹn (bằng chứng pháp lý)

### 6.1 Nguyên tắc
Elasticsearch **không** chống sửa đổi: người có quyền superuser/`manage` có thể xóa index, sửa document, restore đè; Basic cũng không có audit logging của Elasticsearch/Kibana (Platinum [XM]). Vì vậy tính toàn vẹn được chứng minh **bên ngoài** Elasticsearch, bằng mật mã và lưu trữ bất biến, và Elasticsearch chỉ cần *có thể kiểm chứng được* so với bằng chứng.

### 6.2 Integrity Archiver (consumer group B, độc lập với Logstash)
1. Đọc bytes raw từ `audit-raw` theo từng partition, tính `raw_sha256` cho từng event.
2. Gom theo **block** (mỗi partition, mỗi 5 phút [GĐ]): tệp NDJSON gzip gồm `{partition, offset, kafka_ts, raw_b64, raw_sha256}`.
3. Tính **Merkle root** trên các `raw_sha256` theo thứ tự offset và `file_sha256` của tệp.
4. Lập **manifest**: `{block_id, topic, partition, offset_start, offset_end, count, file_sha256, merkle_root, prev_manifest_sha256, created_at, archiver_version}` — `prev_manifest_sha256` tạo **chuỗi hash** theo partition.
5. **Ký** manifest bằng khóa trong HSM/KMS (ECDSA P-256 hoặc Ed25519; khóa không xuất được) và lấy **timestamp RFC 3161** từ một TSA độc lập (đơn vị cấp dấu thời gian hợp lệ theo pháp quyền của khách hàng [GĐ]).
6. Ghi tệp + manifest + chữ ký + token TSA vào bucket `EVIDENCE` với **S3 Object Lock chế độ COMPLIANCE**, retention = 12 tháng (hoặc dài hơn theo pháp chế), hỗ trợ **legal hold** cho vụ việc đang xử lý. Dữ liệu mã hóa bằng envelope key (KMS); vì chứa PII thô, quyền giải mã theo **nguyên tắc hai người** và mọi lần giải mã được ghi log.
7. Chỉ commit offset Kafka **sau** khi ghi WORM thành công ⇒ không mất event (at-least-once; block trùng được phát hiện qua offset range).
8. Mỗi giờ xuất bản *checkpoint* (Merkle root của các manifest trong giờ) ra một kênh ngoài (vd. ghi vào hệ thống của bộ phận pháp chế/kiểm toán, hoặc e-mail có ký) — chống kịch bản kẻ tấn công kiểm soát cả bucket lẫn khóa.

### 6.3 Những gì chứng minh được
| Thuộc tính | Cơ chế |
|---|---|
| Event không bị sửa | `raw_sha256` ∈ Merkle tree ↔ `merkle_root` trong manifest đã ký + timestamp |
| Không bị xóa/chèn | Offset range liên tục, `count` khớp, chuỗi `prev_manifest_sha256` không đứt |
| Tồn tại tại thời điểm | Token RFC 3161 |
| Lưu trữ không sửa được | Object Lock COMPLIANCE (kể cả root của storage không rút ngắn retention) |
| Bản trong ES trung thực với bản gốc | `audit.raw_sha256` khớp manifest; chạy lại pipeline mask (cùng `mask_key_version`) trên raw ⇒ tái lập đúng `audit.doc_sha256` và nội dung document |

### 6.4 Kiểm chứng định kỳ
- Hằng ngày: kiểm toàn bộ chuỗi manifest (chữ ký, TSA, liên tục offset); lấy mẫu ngẫu nhiên ≥ 10.000 document trong ES/ngày [GĐ] → so `raw_sha256`/`doc_sha256` với archive; đối soát số đếm document ES theo partition/offset với manifest (phát hiện mất hoặc thêm trong ES).
- Lệch bất kỳ ⇒ cảnh báo mức cao, mở sự cố an ninh.
- Quy trình trình bằng chứng: xuất block + manifest + chữ ký + token + chứng thư khóa công khai + công cụ kiểm chứng mã nguồn mở hóa nội bộ, kèm hồ sơ chuỗi lưu giữ (chain of custody).

### 6.5 Kiểm soát trong Elasticsearch (phòng ngừa, không phải bằng chứng)
- Security bật (TLS transport + HTTP, RBAC, native realm — có trên Basic [XM]; SAML/OIDC/LDAP là gói trả phí [XM]).
- Role `audit_ingest`: chỉ `create_doc` trên `logs-audit-*`. Role `audit_reader`: chỉ `read`/`view_index_metadata`. Không người dùng thường nào có `delete`/`index`/`manage`. Tài khoản `elastic` niêm phong (break-glass, hai người).
- Index `readonly` sau rollover; đĩa mã hóa LUKS (ES không mã hóa at-rest).
- Vì thiếu audit log của ES/Kibana trên Basic: đặt **reverse proxy** trước Kibana và API, ghi access log (người dùng, thời điểm, endpoint, nội dung truy vấn) → đưa vào một data stream riêng và cũng qua Archiver vào WORM.
- Cụm monitoring riêng; cảnh báo bằng Kibana alerting với connector có trên Basic (index/server log) [XM] hoặc công cụ ngoài (Prometheus/Alertmanager).

---

## 7. Rủi ro và xung đột trong đầu vào

| # | Mức | Xung đột / rủi ro | Xử lý đề xuất |
|---|---|---|---|
| C1 | **Nghiêm trọng** | "Searchable snapshots cho cold/frozen" **mâu thuẫn** với "chỉ Basic": searchable snapshots, frozen tier là Enterprise [XM]. | Không dùng. Snapshot + restore theo yêu cầu (ADR-1). Nếu khách hàng muốn truy vấn dữ liệu cũ không chờ, phải mua Enterprise hoặc chấp nhận cold online (phương án B, ~347 TB). |
| C2 | **Cao** | "Mask trước khi index" ↔ "chứng minh không bị sửa": dữ liệu được index đã bị biến đổi có chủ đích, không tự nó là bằng chứng nguyên vẹn. | Bằng chứng = raw archive WORM đã ký; bản ES là bản dẫn xuất kiểm chứng được (ADR-2). Cần pháp chế chấp thuận mô hình này. |
| C3 | **Cao** | "Tìm được trong 24 h" không nói phạm vi. Restore cả 12 tháng ≈ 303 TB không thể trong 24 h với ngân sách hợp lý (~84 h ở 1 GB/s, cần ~400 TB đĩa). | Cam kết SLA: ≤ 31 ngày dữ liệu/yêu cầu/24 h; thêm đợt cho khoảng dài hơn. Khách hàng xác nhận. |
| C4 | Cao | Giữ raw có PII 12 tháng (để làm bằng chứng) ↔ yêu cầu tối thiểu hóa DLCN. | Mã hóa, truy cập hai người, log mọi lần giải mã; pháp chế xác định cơ sở pháp lý và thời hạn. |
| C5 | Trung bình | Retention 12 tháng ↔ bằng chứng pháp lý thường cần giữ lâu hơn khi có tranh chấp. | Legal hold trên Object Lock; snapshot liên quan được giữ ngoài SLM retention (đổi tên/sao chép). |
| C6 | Trung bình | Basic không có audit log ES/Kibana, không có field/document-level security, không SSO doanh nghiệp [XM]. | Reverse proxy ghi access log; tách quyền theo index; native users quản lý tập trung bằng quy trình. |
| C7 | Trung bình | Basic không có hỗ trợ kỹ thuật từ Elastic. | Đội vận hành có chứng chỉ/kinh nghiệm; runbook; môi trường staging. |
| C8 | Trung bình | Tỷ lệ nén chưa đo; chỉ có số "800 byte trung bình", không có số trường/độ dài message. | PoC bắt buộc (§9); bảng độ nhạy §2.5. |
| C9 | Trung bình | Không có số đỉnh tải; "sustained" có thể che burst (vd. đăng nhập đầu giờ). | Kafka 72 h hấp thụ; Logstash headroom 1,5×; theo dõi consumer lag. |
| C10 | Trung bình | Toàn vẹn chỉ chứng minh được **từ điểm Kafka nhận**; đoạn nguồn → shipper chưa được bảo vệ mật mã. | mTLS; nếu cần mạnh hơn: nguồn tự ký log hoặc shipper ký tại máy nguồn. |
| C11 | Thấp | Mask bằng regex có thể sót PII trong văn bản tự do hoặc mask nhầm (vd. chuỗi số giống điện thoại). | Bước kiểm PII dư + quarantine; bộ test regex từ dữ liệu mẫu; review định kỳ. |
| C12 | Thấp | Snapshot repo không đặt trên Object Lock: Elasticsearch cần ghi đè/xóa metadata repository và SLM retention cần xóa snapshot — đặt WORM có thể làm hỏng repository [GĐ/XM]. | Repo dùng versioning + quyền hẹp; tính bất biến do bucket EVIDENCE đảm nhận. |

---

## 8. ADR

### ADR-1 — Lưu trữ ngày 31–365 bằng snapshot + restore theo yêu cầu (không searchable snapshots)
- **Bối cảnh:** Basic license; dữ liệu cũ chỉ cần tìm được trong 24 h; ~303 TB/năm sau nén.
- **Quyết định:** Hot 7 ngày + warm 23 ngày online; snapshot hằng đêm (SLM) lên object storage, giữ 380 ngày; xóa khỏi cụm ở ngày 30 sau khi chắc chắn đã có snapshot; restore vào 3 node `data_cold` khi có yêu cầu.
- **Phương án đã loại:**
  - A. *Searchable snapshots (cold/frozen) — đề xuất của khách hàng:* cần Enterprise [XM] → vi phạm ràng buộc ngân sách. Về kỹ thuật là phương án tốt nhất (truy vấn trực tiếp từ repo, frozen chỉ cần cache cục bộ). Nên báo giá để khách hàng so sánh.
  - B. *Cold tier online bằng index thường, 0 replica (Basic):* 335 × 0,829 = 277,9 TB → ~347 TB đĩa (÷0,8), ~18 node × 20 TB HDD; tìm kiếm tức thì nhưng chi phí phần cứng ~3× tổng các tier còn lại và mất node = mất tìm kiếm phần đó cho tới khi restore. Chỉ chọn nếu C3 được giải thích là "bất kỳ khoảng nào trong 24 h".
- **Hệ quả:** Chi phí thấp nhất; dữ liệu cũ không tìm được ngay; cần quy trình restore có runbook và diễn tập hằng quý; SLA giới hạn theo cửa sổ 31 ngày.

### ADR-2 — Bằng chứng pháp lý là raw archive WORM có ký số, ngoài Elasticsearch
- **Bối cảnh:** Yêu cầu "chứng minh không bị sửa"; ES có thể bị sửa bởi quản trị viên; dữ liệu trong ES đã mask.
- **Quyết định:** Integrity Archiver độc lập ghi raw + SHA-256 từng event + Merkle root + manifest ký HSM + timestamp RFC 3161 + chuỗi hash vào Object Lock COMPLIANCE. ES lưu `raw_sha256`/`doc_sha256`/offset để đối chiếu.
- **Phương án đã loại:** (1) Chỉ lưu hash trong document ES — người sửa document sửa được cả hash. (2) Đặt snapshot repo lên Object Lock — xung đột với cơ chế repository/SLM (C12), và snapshot chứa bản đã mask nên không phải bản gốc. (3) Ký từng event — chi phí 20.000 chữ ký/s không cần thiết; Merkle tree cho cùng sức chứng minh.
- **Hệ quả:** Thêm ~76 TB lưu trữ WORM, một dịch vụ cần vận hành (HA, quản lý khóa); có khả năng chứng minh cả *không sửa*, *không mất*, *thời điểm tồn tại*.

### ADR-3 — Mask trong Logstash bằng HMAC có khóa, trước Elasticsearch
- **Bối cảnh:** PII phải được mask trước khi index; Basic.
- **Quyết định:** Mask ở Logstash (structured + regex văn bản tự do + kiểm PII dư + quarantine); HMAC-SHA256 với khóa trong Vault/KMS để giữ khả năng tương quan.
- **Phương án đã loại:** (1) ES ingest pipeline (`redact`/`gsub`/`script`) — PII thô vẫn đi vào node ES, license `redact` cần xác minh [XM]; giữ ES pipeline chỉ làm lớp kiểm cuối. (2) Hash trần SHA-256 — đảo ngược được bằng từ điển username/điện thoại. (3) Xóa hẳn giá trị — mất khả năng điều tra theo người dùng.
- **Hệ quả:** Logstash là điểm xử lý PII → phải hardening; quản lý vòng đời khóa HMAC (đổi khóa làm token mới không tương quan với token cũ — lưu `mask_key_version`).

### ADR-4 — Kafka làm bộ đệm và nguồn địa chỉ bất biến
- **Bối cảnh:** Cần hai consumer độc lập (Archiver, Logstash), chịu burst, replay khi ES bảo trì, và bằng chứng đầy đủ.
- **Quyết định:** Kafka 3 broker, RF 3, retention 72 h.
- **Phương án đã loại:** Logstash persistent queue — không có hai consumer độc lập, không có offset toàn cục để chứng minh liên tục, mất node là mất hàng đợi.
- **Hệ quả:** Thêm một hệ thống (Apache Kafka, mã nguồn mở, không phát sinh license) cần vận hành; Kafka chứa PII thô ⇒ mã hóa đĩa và ACL.

---

## 9. PoC và kiểm chứng trước khi chốt sizing

| Hạng mục | Cách đo | Tiêu chí đạt |
|---|---|---|
| Tỷ lệ nén thật | Index 1 ngày dữ liệu mẫu (đã mask); `_disk_usage`, `_cat/indices` trước/sau force-merge | r_hot ≤ 0,8; r_merged ≤ 0,6 (nếu không, dùng hàng bi quan §2.5) |
| Thông lượng index | `esrally` track tùy biến, 6 hot node, `_id` tự đặt | ≥ 30.000 eps bền vững 4 h |
| Thông lượng Logstash | Pipeline đầy đủ bước 1–8 | ≥ 7.000 eps/node |
| Restore | Restore 7 ngày từ object storage | Thông lượng tổng ≥ 0,5 GB/s ⇒ ngoại suy 31 ngày ≤ 15 h |
| Toàn vẹn | Sửa 1 byte trong ES và 1 object trong bucket thử nghiệm; xóa 1 document | Bộ kiểm chứng phát hiện cả 3 |
| Mask | Bộ mẫu chứa PII cố ý trong mọi trường | 0 PII thô trong ES; mẫu nghi ngờ vào quarantine |
| License | Đối chiếu từng tính năng dùng ở đây với ma trận subscription của phiên bản triển khai | Không dùng tính năng ngoài Basic |

---

## 10. Câu hỏi mở cho khách hàng

1. "Tìm được trong 24 h" áp dụng cho khoảng thời gian tối đa bao nhiêu mỗi yêu cầu? (quyết định ADR-1 A/B)
2. Khách hàng có chấp nhận báo giá Enterprise để dùng searchable snapshots không, hay Basic là ràng buộc cứng?
3. Pháp chế có chấp nhận mô hình "raw WORM có ký là bằng chứng, bản mask là bản tra cứu"? Thời hạn giữ raw có PII và cơ sở pháp lý?
4. Mức mask mong muốn: token hoàn toàn, hay giữ domain e-mail / 3 số cuối điện thoại?
5. Đỉnh tải và tăng trưởng hằng năm dự kiến?
6. Có yêu cầu site DR (nhân bản EVIDENCE/SNAPSHOTS sang site thứ hai) không?
7. Phân loại HTTT và cấp độ ATTT chính thức; TSA nào được công nhận?
8. Hạ tầng: on-prem hay cloud; object storage hiện có hỗ trợ Object Lock compliance mode không?
