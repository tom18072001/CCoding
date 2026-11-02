# DESIGN — Nền tảng audit log trên Elastic Stack (Basic license)

> Trạng thái: **Đề xuất (draft)** · Phân loại tài liệu: internal · Ngày: 2026-11-02
> Mọi con số trong tài liệu là **ước lượng tính từ đầu vào của khách hàng cộng với các giả định ghi rõ (A1…A10)**, chưa phải benchmark. Phải chạy PoC (mục 11) trước khi đặt mua phần cứng.

---

## 0. Tóm tắt điều hành

- Tải: 20.000 EPS × 800 B = **16 MB/s ≈ 1,38 TB raw/ngày ≈ 504,6 TB raw/năm**.
- Kiến trúc: Beats → **Kafka** (đệm, replay) → **Logstash** (mask PII + băm từng event) → Elasticsearch **hot (3 ngày) / warm (28 ngày)** để tìm kiếm tương tác trong 31 ngày. Dữ liệu cũ hơn được giữ dưới dạng **snapshot thường** trên object storage và **restore theo yêu cầu** vào một tầng cold "staging" trong vòng 24 giờ.
- Tính toàn vẹn (dùng làm chứng cứ pháp lý) **không dựa vào Elasticsearch**. Một dịch vụ *sealer* độc lập ghi bản sao đã mask vào kho **WORM** (Object Lock, compliance mode), gom theo lô, tính Merkle root, nối chuỗi hash, ký số và đóng dấu thời gian RFC 3161. Bất kỳ document nào trong ES cũng có thể kiểm chứng ngược lại với kho đó.
- **Mâu thuẫn chính trong đầu vào:**
  1. *Searchable snapshots* (cả cold fully-mounted và frozen partially-mounted) **không có trong Basic**, cần Enterprise. Gợi ý của khách hàng vì vậy mâu thuẫn với ràng buộc ngân sách.
  2. Yêu cầu "mask trước khi index" và yêu cầu "chứng minh không bị sửa" kéo theo hai hướng ngược nhau: dữ liệu đã mask thì theo định nghĩa không còn là bản gốc.
  3. Basic **không có audit logging** của Elasticsearch/Kibana, cũng không có field/document-level security. Vì vậy không ghi được nhật ký "ai đã đọc/xoá chứng cứ" ngay bên trong stack.

---

## 1. Bối cảnh & NFR

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Tốc độ ingest | 20.000 EPS liên tục, 24/7 | Khách hàng |
| Kích thước event | 800 B raw trung bình | Khách hàng |
| Đỉnh tải | **2× = 40.000 EPS** (đỉnh, và tốc độ catch-up sau sự cố) | **Giả định A1**, cần xác nhận |
| Retention | 12 tháng (tính theo 365 ngày) | Khách hàng |
| Tìm kiếm tương tác | 30 ngày gần nhất. Mục tiêu p95 < 10 s cho truy vấn 24 h | Khách hàng / mục tiêu p95 là **giả định A2** |
| Dữ liệu > 30 ngày | Tìm được trong ≤ 24 h kể từ lúc có yêu cầu | Khách hàng |
| Toàn vẹn | Chứng minh được là không bị sửa (chứng cứ pháp lý) | Khách hàng |
| PII | username, e-mail, số điện thoại phải được mask **trước khi index** | Khách hàng |
| License | Elastic **Basic** | Khách hàng |
| RPO dữ liệu đã nhận | 0 event mất sau khi Kafka đã ack (acks=all, RF=3) | Đề xuất |
| RTO tìm kiếm 30 ngày | ≤ 4 h khi mất 1 node (nhờ replica: ~0) | Đề xuất |
| Nhãn dữ liệu | Có DLCN (dữ liệu cá nhân) trước bước mask; sau mask là dữ liệu bút danh hoá (pseudonymised) | Phân tích |
| Cấp độ ATTT | **Chưa xác định.** Cần phân loại HTTT theo NĐ 85/2016 + TT 12/2022 (hoặc văn bản thay thế hiện hành) dựa trên HTTT mà log phục vụ. Tài liệu này **không mặc định** cấp độ. Các biện pháp dưới đây (phân vùng mạng, TLS, RBAC, WORM, sao lưu) tương ứng mức phổ biến cho hệ thống có DLCN và chứng cứ. | **Giả định A3**, cần chủ đầu tư xác nhận |

---

## 2. Tính toán dung lượng

### 2.1 Khối lượng raw

| Đại lượng | Phép tính | Kết quả |
|---|---|---|
| Băng thông raw | 20.000 × 800 B | **16.000.000 B/s = 16 MB/s** |
| Event/ngày | 20.000 × 86.400 | **1,728 tỷ event** |
| Raw/ngày | 16 MB/s × 86.400 s | **1,3824 TB/ngày** (≈ 1,257 TiB) |
| Raw/30 ngày | 1,3824 × 30 | 41,47 TB |
| Raw/năm | 1,3824 × 365 | **504,58 TB/năm** (≈ 458,9 TiB) |
| Event/năm | 1,728 tỷ × 365 | 630,7 tỷ event |

Đơn vị dùng TB thập phân (10¹² B), trừ chỗ ghi TiB.

### 2.2 Giả định nén / hệ số lưu trữ

| ID | Giả định | Giá trị | Lý do / cách kiểm chứng |
|---|---|---|---|
| **A4** | Hệ số on-disk/raw ở **hot** (codec mặc định LZ4, mapping ECS có cả `text` lẫn `keyword`, `_source` lưu đầy đủ, chưa forcemerge) | **1,0×** | Mức thận trọng: phần nén của LZ4 bù lại overhead của inverted index, doc_values và field băm/bút danh thêm vào. Đo bằng PoC trên 1 ngày dữ liệu mẫu đã mask. |
| **A5** | Hệ số ở **warm/snapshot** (sau `forcemerge` 1 segment + `index_codec: best_compression`) | **0,6×** | Thường gặp với log có cấu trúc. Đo bằng PoC. |
| A6 | Ngưỡng lấp đầy đĩa | **≤ 70 %** (dữ liệu/dung lượng usable) | Chừa khoảng cho watermark mặc định (85 %/90 %/95 %), merge, relocation khi mất 1 node |
| A7 | Kafka nén zstd ở producer | **4:1** | Đo khi PoC |
| A8 | Bản lưu WORM (NDJSON đã mask, gzip) | **8:1** so với raw | Đo khi PoC |

**Không dùng** LogsDB index mode / synthetic `_source` để tiết kiệm dung lượng. Lý do: (a) các tính năng này cần license trả phí (Enterprise) theo bảng subscription của Elastic, cần kiểm chứng lại lúc mua; (b) synthetic `_source` dựng lại document thay vì trả đúng bản đã gửi vào, không hợp với yêu cầu chứng cứ.

### 2.3 Dung lượng theo tầng (phương án đề xuất)

Ký hiệu: R = 1,3824 TB raw/ngày. Usable = dữ liệu / 0,7 (A6).

| Tầng | Cửa sổ | Hệ số | Primary | Replica | Tổng (gồm replica) | Usable cần | Bố trí |
|---|---|---|---|---|---|---|---|
| **Hot** | ngày 0–3 (3 ngày) | 1,0 | 3 × 1,3824 = **4,15 TB** | 1 | **8,29 TB** | 11,85 TB | 6 × 3,84 TB NVMe = 23 TB (dư cho catch-up, merge) |
| **Warm** | ngày 3–31 (28 ngày) | 0,6 | 28 × 0,8294 = **23,22 TB** | 1 | **46,45 TB** | 66,4 TB | 6 × 12 TB SSD = 72 TB |
| **Tổng online (31 ngày)** | | | 27,37 TB | | **54,74 TB** | | |
| **Archive snapshot** (object storage) | 365 ngày | 0,6 | 365 × 0,8294 = **302,7 TB** | 0 (object store tự nhân bản/erasure coding, overhead tuỳ hãng) | **302,7 TB** logic | | S3-compatible, khác site/khác vùng sự cố |
| **Cold staging** (restore theo yêu cầu) | tối đa 90 ngày dữ liệu cùng lúc | 0,6 | 90 × 0,8294 = **74,6 TB** | 0 | **74,6 TB** | 106,6 TB | 4 × 28 TB = 112 TB |
| **WORM evidence archive** | 365 ngày (+ legal hold) | 1/8 | 504,6 / 8 = **63,1 TB/năm** | (object store) | 63,1 TB | | Bucket Object Lock riêng |
| **Kafka** | masked 5 ngày + raw 1 ngày, RF=3 | 1/4 | (5 + 1) × 1,3824 × 3 / 4 = **6,22 TB** | RF=3 đã tính | 6,22 TB | 8,9 TB | 3 × 4 TB |

Ghi chú:
- Hot dùng 3 ngày (không phải 7) vì yêu cầu "tìm kiếm tương tác" thì warm SSD vẫn đáp ứng. Số hot node được quyết định bởi **tốc độ index**, không phải dung lượng (mục 3).
- Giữ online **31 ngày** (30 + 1 ngày đệm cho độ trễ rollover/ILM).
- Snapshot đặt trên object storage và **không** bật Object Lock (xem ADR-4). Tính toàn vẹn nằm ở kho WORM.

### 2.4 So sánh với phương án "cold online" (không chọn)

Nếu giữ toàn bộ 12 tháng online trên cold node (replica 0, dựa vào snapshot để phục hồi):
334 ngày × 0,8294 = **277,0 TB** primary → usable 395,8 TB → khoảng **10–11 node × 40 TB HDD**. Ở đây vẫn phải có 302,7 TB snapshot làm backup, nên phải có ~400 TB block storage thay vì 112 TB cold staging (thêm ~290 TB đĩa). Phương án này chỉ đáng chọn khi khách hàng thường xuyên cần truy vấn > 90 ngày (xem ADR-2).

### 2.5 Tính khả thi của SLA 24 h khi restore

- Thời gian dành cho restore: 24 h − ~4 h (duyệt yêu cầu, chọn index, kiểm chứng) = **20 h**.
- Một yêu cầu tối đa 90 ngày = 74,6 TB → 74,6 × 10¹² / 72.000 s ≈ **1,04 GB/s tổng**, tức ≈ **260 MB/s mỗi cold node** (4 node).
- Muốn đạt mức này phải nâng `indices.recovery.max_bytes_per_sec` và `max_restore_bytes_per_sec` của repository, đồng thời object store và mạng (≥ 10 GbE/node) phải chịu được. **Phải đo trong PoC.**
- 30 ngày (24,9 TB) → ~6,7 h ở cùng tốc độ.
- Truy vấn **> 90 ngày** cùng lúc: chia lô, mỗi lô 90 ngày, mỗi lô 24 h. **Đây là giới hạn SLA phải được khách hàng chấp thuận** (R-5).

---

## 3. Bố trí node theo tầng

Mọi node Elasticsearch: heap ≤ 50 % RAM và ≤ ~30 GB (giữ compressed oops), 10 GbE, TLS cả transport lẫn HTTP.

| Vai trò | Số lượng | Cấu hình mỗi node | Căn cứ |
|---|---|---|---|
| **Master** (dedicated, `master`) | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | Quorum, tách khỏi tải dữ liệu |
| **Hot** (`data_hot`, `data_content`) | 6 | 16 vCPU, 64 GB RAM, 3,84 TB NVMe | **Giả định A9**: ~15.000 doc-write/s/node (gồm cả replica) với mapping ECS. Đỉnh 40.000 EPS × 2 bản = 80.000 write/s → 5,3 node → **6** (N+1 ở tải sustained: 40.000 write/s / 5 node còn lại = 8.000/node). PoC bằng Rally/esrally với dữ liệu mẫu. |
| **Warm** (`data_warm`) | 6 | 8 vCPU, 64 GB RAM, 12 TB SSD | 46,45 TB / 6 = 7,7 TB/node (64 % đĩa). Tỉ lệ RAM:disk ≈ 1:190 |
| **Cold staging** (`data_cold`) | 4 | 8 vCPU, 64 GB RAM, 28 TB SSD/HDD RAID10 (≥ 260 MB/s ghi tuần tự) | Mục 2.5 |
| **Kibana** | 2 | 4 vCPU, 8 GB RAM | Sau load balancer, HA |
| **Logstash** | 5 | 8 vCPU, 16 GB RAM (heap 8 GB), 500 GB SSD cho persistent queue/DLQ (mã hoá đĩa) | **Giả định A10**: ~10.000 EPS/node cho cả pipeline mask lẫn pipeline index. Đỉnh 40.000 → 4 + 1 dự phòng |
| **Kafka** (KRaft) | 3 | 8 vCPU, 32 GB RAM, 4 TB SSD | RF=3, `min.insync.replicas=2`, mã hoá đĩa (topic raw chứa PII) |
| **Sealer** (dịch vụ ký lô) | 2 | 2 vCPU, 4 GB RAM | Active/active theo partition Kafka. Khoá ký nằm trong HSM/KMS |
| **Restore/Archive job** | 1 (+1 standby) | 2 vCPU, 4 GB | Cron/scheduler (ADR-4) |

**Tổng số node Elasticsearch: 19** (3 master, 6 hot, 6 warm, 4 cold).

Phân vùng mạng: (1) vùng thu thập (agent → Kafka, mTLS); (2) vùng xử lý (Kafka, Logstash, sealer). Đây là chặng duy nhất có PII thô; (3) vùng lưu trữ (ES, object store); (4) vùng truy cập (Kibana sau reverse proxy + SSO). Không đặt IP hay hostname thật trong tài liệu.

---

## 4. Kiến trúc & luồng dữ liệu

```
 Nguồn log (ứng dụng, OS, thiết bị)
     │  Filebeat / Elastic Agent  (TLS mTLS)          ⚠ PII thô
     ▼
 ┌────────────── Kafka (RF=3, mã hoá đĩa) ──────────────┐
 │ topic audit.raw     (retention 24 h)   ⚠ PII thô     │
 │ topic audit.masked  (retention 5 ngày) ✔ đã mask     │
 └──────────────────────────────────────────────────────┘
     │ audit.raw                          ▲ audit.masked
     ▼                                    │
 Logstash pipeline "mask"  ───────────────┘
   1 parse → 2 raw_sha256 → 3 mask/pseudonymise → 4 PII guard → 5 canonical JSON → 6 event_sha256
                                          │ audit.masked
              ┌───────────────────────────┴──────────────────────────┐
              ▼                                                      ▼
 Logstash pipeline "index"                               Sealer (độc lập với ES)
   → ES ingest pipeline "audit-guard"                      lô 60 s / partition
   → data stream logs-audit-default                        → NDJSON.gz vào WORM bucket (Object Lock COMPLIANCE)
              │                                            → manifest: Merkle root, hash lô trước,
              ▼                                              chữ ký HSM, token RFC 3161 → WORM
 ES hot (3 ngày) ──ILM──► ES warm (28 ngày, read-only, forcemerge)
                               │ archive job: snapshot sau forcemerge
                               ▼
                    Snapshot repo (S3-compatible) ── restore theo yêu cầu ──► ES cold staging
                                                                               (TTL 30 ngày)
 Kibana (SSO, RBAC) ◄── analyst
```

**Chặng nhạy cảm (⚠):** agent → Kafka `audit.raw` → Logstash "mask". PII thô không bao giờ tới Elasticsearch, snapshot hay WORM.

---

## 5. Ingest pipeline

### 5.1 Vì sao mask ở Logstash chứ không ở ES ingest pipeline

- Mask ở Logstash thì PII không đi vào ES. Nếu mask ở ES ingest node, PII vẫn đi qua bộ nhớ ES và có thể rơi vào failure store hoặc log lỗi.
- **`redact` processor** của ES (dựa trên grok) thuộc license trả phí (Platinum trở lên theo bảng subscription, cần kiểm chứng lại). Trên Basic nó không chạy, và nếu bật `skip_if_unlicensed` thì document sẽ **lọt qua mà không được mask**. Không dùng.
- Logstash (Apache 2.0/Elastic License, miễn phí) có `mutate gsub`, `fingerprint` (hỗ trợ HMAC qua `key`) và `ruby`, đủ cho việc mask.

### 5.2 Pipeline "mask" (Logstash, Kafka `audit.raw` → Kafka `audit.masked`)

| Bước | Việc | Ghi chú |
|---|---|---|
| 1 | Giữ nguyên bytes gốc vào `[@metadata][raw]`. Parse (json/dissect/grok) sang ECS | |
| 2 | `audit.raw_sha256` = SHA-256(bytes gốc) | Nối event đã index với bản gốc mà hệ thống nguồn còn giữ, nhưng không phải lưu PII. Hash bao trùm cả timestamp và nội dung nên khó dò ngược (R-9) |
| 3a | Field có cấu trúc `user.name`, `user.email`, `*.phone` → **HMAC-SHA256(key, giá trị chuẩn hoá)**, cắt 16 hex, dạng `usr_…`, `eml_…`, `tel_…` | Bút danh ổn định nên vẫn tương quan được (cùng người → cùng token). Key nằm trong KMS, xoay vòng theo năm. Lấy lại danh tính chỉ qua quy trình pháp lý có key escrow |
| 3b | Free text (`message`, `url`, `user_agent`…) → `gsub` theo regex e-mail, số điện thoại (E.164, định dạng VN `0[35789]\d{8}`, có khoảng trắng/dấu chấm), `user=…`/`login=…` | Thay bằng `<EMAIL>`, `<PHONE>`, `<USER>`. Bộ regex phải được kiểm thử bằng corpus dương/âm |
| 3c | Xoá `[@metadata][raw]`, `event.original` | `event.original` **không bao giờ** được lưu |
| 4 | **PII guard**: chạy lại regex trên toàn document. Nếu còn khớp thì đưa vào `audit.quarantine` (Kafka topic mã hoá, retention 7 ngày, chỉ nhóm DPO đọc) và **không** forward | Không làm rơi event âm thầm: event vẫn được giữ, chờ xử lý thủ công |
| 5 | Chuẩn hoá JSON theo **RFC 8785 (JCS)** trên tập field nghiệp vụ (`@timestamp`, `event.*`, `user.*`, `source.*`, `message`, `audit.raw_sha256`…) | Field do ES thêm vào sau (`event.ingested`, `_id`) nằm ngoài phạm vi băm |
| 6 | `audit.event_sha256` = SHA-256(JCS bytes). Gắn `audit.kafka.{partition,offset}` (lấy từ metadata của masked topic sau khi produce, hoặc từ raw topic) | Làm bằng `ruby` filter hoặc plugin nội bộ. Cùng thư viện JCS được dùng trong công cụ verify |

### 5.3 Pipeline "index" (Logstash `audit.masked` → ES)

- Output `elasticsearch` vào data stream `logs-audit-default`, `action => create`. Document id = `audit.event_sha256` để **idempotent**: replay Kafka không sinh bản trùng, và bản trùng bị từ chối với 409.
- DLQ bật (mã hoá đĩa). Persistent queue bật.

### 5.4 ES ingest pipeline `audit-guard` (lớp phòng thủ cuối)

```json
PUT _ingest/pipeline/audit-guard
{
  "processors": [
    { "set":  { "field": "event.ingested", "value": "{{{_ingest.timestamp}}}" } },
    { "fail": { "if": "ctx.audit?.event_sha256 == null", "message": "missing integrity hash" } },
    { "script": {
        "lang": "painless",
        "source": "def m = ctx.message; if (m != null && (m =~ /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/ || m =~ /(\\+?84|0)[35789][0-9]{8}/)) { throw new IllegalArgumentException('PII detected after masking'); }"
    } }
  ]
}
```
Lỗi → bulk item 400 → Logstash DLQ → cảnh báo. (Cần bật `script.painless.regex.enabled`; cân nhắc chi phí CPU khi PoC. Nếu đắt quá thì chỉ giữ guard ở Logstash.)

### 5.5 Index template (rút gọn)

```json
PUT _index_template/logs-audit
{
  "index_patterns": ["logs-audit-*"],
  "data_stream": {},
  "priority": 500,
  "template": {
    "settings": {
      "index.lifecycle.name": "audit-ilm",
      "index.default_pipeline": "audit-guard",
      "index.number_of_shards": 6,
      "index.number_of_replicas": 1,
      "index.refresh_interval": "10s",
      "index.routing.allocation.include._tier_preference": "data_hot"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp": { "type": "date" },
        "message":    { "type": "match_only_text" },
        "user":  { "properties": { "name": { "type": "keyword" }, "email": { "type": "keyword" } } },
        "audit": { "properties": {
          "event_sha256": { "type": "keyword" }, "raw_sha256": { "type": "keyword" },
          "kafka": { "properties": { "partition": { "type": "integer" }, "offset": { "type": "long" } } } } }
      }
    }
  }
}
```
(`dynamic: strict` để field lạ, có thể chứa PII chưa được mask, bị chặn thay vì âm thầm vào index. Mapping đầy đủ theo ECS sẽ có ở bước thiết kế chi tiết.)

---

## 6. ILM, snapshot và vòng đời

### 6.1 ILM policy

```json
PUT _ilm/policy/audit-ilm
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "2d",
        "actions": {
          "readonly": {},
          "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
          "allocate": { "number_of_replicas": 1 },
          "set_priority": { "priority": 50 }
        }
      }
    }
  }
}
```
- Rollover: 6 primary × 50 GB ≈ 300 GB/index, tức khoảng 4–5 backing index/ngày. Primary shard ở warm: 23,22 TB / 50 GB ≈ 465 primary, ~930 shard cả replica trên 6 node (~155 shard/node), chấp nhận được.
- Chuyển warm do `migrate` tự động (data tiers, có trên Basic).
- **Không có delete phase trong ILM.** Việc xoá do archive job đảm nhận và chỉ thực hiện khi snapshot đã được xác minh (6.2). Như vậy không có đường nào để index bị xoá mà chưa có bản lưu.

### 6.2 Archive job (thay cho SLM ở dữ liệu nghiệp vụ, xem ADR-4)

Chạy mỗi giờ:
1. `GET logs-audit-*/_ilm/explain` → chọn backing index đang ở `phase=warm` và đã xong forcemerge (`step=complete`) mà chưa có snapshot archive.
2. `PUT _snapshot/audit-repo/audit-archive-<index>?wait_for_completion=true` với `indices=<index>`, `include_global_state=false`.
3. Kiểm tra `state=SUCCESS`, số shard thành công. Ghi bản ghi `{index, snapshot, uuid, doc_count, min/max @timestamp}` vào ledger WORM.
4. Khi index > 31 ngày **và** đã có snapshot archive đã xác minh: `DELETE` backing index.
5. Snapshot archive > 365 ngày, không thuộc legal hold: xoá snapshot.
6. Cảnh báo khi một index ở warm > 24 h mà chưa có snapshot.

Thêm một SLM policy `config-daily`: chỉ chụp global state (templates, pipelines, ILM, security), giữ 30 ngày.

### 6.3 Vì sao không dùng SLM "nightly mọi index"

Index được snapshot lúc còn ở hot sẽ lưu segment *trước* forcemerge (hệ số 1,0). Sau forcemerge segment được viết lại, snapshot sau đó upload lại toàn bộ (0,6). Nếu giữ snapshot 12 tháng thì dung lượng repo ≈ **1,6× thay vì 0,6×**, tức thêm khoảng 504 TB. Chỉ snapshot sau khi forcemerge sẽ tránh được điều này.
Độ bền của dữ liệu ở hot (0–3 ngày) trước khi có snapshot dựa vào replica, cộng với khả năng **replay từ Kafka `audit.masked` (retention 5 ngày)** nhờ id idempotent.

### 6.4 Quy trình truy vấn dữ liệu > 31 ngày (SLA 24 h)

1. Yêu cầu có phê duyệt (ticket) → archive job tra ledger theo khoảng thời gian.
2. `POST _snapshot/audit-repo/<snap>/_restore` với `rename_pattern` → `restored-…`, `index_settings: {"index.number_of_replicas":0, "index.routing.allocation.include._tier_preference":"data_cold"}`.
3. Analyst truy vấn qua Kibana (data view `restored-*`). TTL 30 ngày rồi xoá.
4. Muốn chứng minh tính toàn vẹn thì dùng quy trình ở mục 7.3, không phụ thuộc vào việc restore.

---

## 7. Đảm bảo toàn vẹn (chứng cứ pháp lý)

### 7.1 Nguyên tắc

Elasticsearch **không phải** kho bất biến: user có quyền `manage`/superuser vẫn xoá, reindex hay update được, và trên Basic **không có audit log** cho các thao tác đó. Vì vậy:

> **ES = chỉ mục tìm kiếm. Bằng chứng = kho WORM + chuỗi hash có chữ ký và dấu thời gian.** Mỗi document ES chỉ là *bản chiếu* kiểm chứng được của bằng chứng.

### 7.2 Cơ chế

| Lớp | Biện pháp |
|---|---|
| Hash từng event | `audit.event_sha256` trên JCS của bản đã mask. `audit.raw_sha256` trên bytes gốc |
| Gom lô | Sealer đọc `audit.masked` theo partition, mỗi 60 s đóng 1 lô: file `NDJSON.gz` (đúng các bản JCS) |
| Merkle | Merkle root (SHA-256) trên danh sách `event_sha256` của lô |
| Chuỗi | Manifest lô = `{batch_id, partition, offset_from/to, count, file_sha256, merkle_root, prev_manifest_sha256}` → chuỗi hash theo partition. Xoá hay chèn lô sẽ làm đứt chuỗi |
| Ký số | Manifest ký bằng khoá trong HSM/KMS (khoá không xuất ra được), xoay vòng có log |
| Dấu thời gian | Mỗi giờ: hash của manifest cuối mọi partition → gửi **TSA RFC 3161** (bên thứ ba tin cậy) → token lưu WORM. Chứng minh được dữ liệu đã tồn tại tại thời điểm đó |
| WORM | Bucket riêng, **Object Lock COMPLIANCE**, retention 365 ngày + legal hold, versioning. Tài khoản/tenant khác với ES và đội vận hành ES. Không ai, kể cả root, rút ngắn được retention |
| Tại chỗ trong ES | Index warm `readonly` (`index.blocks.write`). RBAC: role ingest chỉ có `create_doc`. Analyst chỉ có `read`. Superuser chỉ dùng break-glass (2 người, ghi biên bản). Truy cập Kibana qua reverse proxy có access log gửi về một index/bucket riêng (bù cho việc thiếu audit logging) |
| Đối soát | Job hằng ngày: đếm event theo giờ ở ES so với ledger, lấy mẫu ngẫu nhiên N document rồi chạy verify (7.3). Lệch thì cảnh báo P1 |

### 7.3 Quy trình chứng minh một event

1. Lấy document từ ES (hoặc từ snapshot đã restore) → tính lại JCS → SHA-256 → so với `audit.event_sha256`.
2. Dùng `audit.kafka.partition/offset` tìm lô trong WORM → kiểm tra hash có trong file, file_sha256 khớp manifest, Merkle proof khớp root.
3. Kiểm tra chữ ký manifest và chuỗi `prev_manifest_sha256` liên tục.
4. Kiểm tra token RFC 3161 bao trùm manifest.
5. (Tuỳ chọn) So `audit.raw_sha256` với hash bản gốc tại hệ thống nguồn.

Công cụ verify là một CLI độc lập (mã mở cho bên thẩm định) và không cần truy cập ES.

### 7.4 Phạm vi chứng minh (phải ghi vào hợp đồng)

Chuỗi toàn vẹn **bắt đầu tại bước mask** (Logstash). Từ nguồn tới Kafka được bảo vệ bằng mTLS. Từ Kafka tới Logstash là vùng tin cậy nội bộ. Tính xác thực *trước* thời điểm thu thập thuộc trách nhiệm hệ thống nguồn.

---

## 8. Bảo mật & bảo vệ dữ liệu (trên Basic)

| Có trên Basic (dùng) | Không có trên Basic (bù bằng) |
|---|---|
| TLS transport/HTTP, native/file realm, RBAC, API key | SSO SAML/OIDC trong ES/Kibana là trả phí → đặt **reverse proxy có SSO** (OIDC) trước Kibana, map vào vài role cố định |
| ILM, data tiers, snapshot/restore, SLM | Searchable snapshots (Enterprise) → restore theo yêu cầu (ADR-2) |
| Ingest pipelines (trừ redact) | `redact` processor → mask ở Logstash |
| | Audit logging ES/Kibana (Platinum) → access log ở reverse proxy + ledger WORM |
| | Field/document-level security (Platinum) → mask từ gốc, nên không cần FLS |
| | Cross-cluster replication (Platinum) → DR bằng snapshot restore ở site 2 |

Bảng phân hạng tính năng ở trên dựa trên hiểu biết về bảng subscription của Elastic. **[CHƯA KIỂM CHỨNG trong phiên này — phải đối chiếu https://www.elastic.co/subscriptions theo đúng phiên bản sẽ triển khai trước khi chốt.]**

Bảo vệ dữ liệu theo thiết kế: tối thiểu hoá (không lưu `event.original`), bút danh hoá (HMAC), giới hạn retention (raw PII ≤ 24 h ở Kafka), mã hoá at-rest ở mọi chặng có PII, kiểm soát truy cập theo vai trò, có thể kiểm toán (ledger).

---

## 9. ADR

### ADR-1: Không dùng searchable snapshots; giữ 31 ngày online (hot + warm)
- **Bối cảnh:** khách hàng gợi ý searchable snapshots cho cold/frozen. Ràng buộc chỉ dùng Basic.
- **Quyết định:** không dùng. Tầng online gồm hot 3 ngày và warm 28 ngày.
- **Phương án loại:** (a) searchable snapshots: cần Enterprise, vi phạm ràng buộc ngân sách; (b) giữ hot toàn bộ 31 ngày: tốn NVMe mà không cần.
- **Hệ quả:** dữ liệu > 31 ngày không tìm được ngay. Nếu khách hàng chấp nhận mua Enterprise thì có thể chuyển sang tầng frozen trên chính repo snapshot, bỏ được cold staging và truy vấn 12 tháng gần như tức thì (chậm hơn hot/warm). Chi phí license phải lấy báo giá Elastic, tài liệu này không ước lượng.

### ADR-2: Dữ liệu > 31 ngày: snapshot + restore theo yêu cầu (đề xuất), thay vì cold online
- **Phương án A (chọn):** snapshot 302,7 TB trên object store cộng 4 cold staging node (112 TB). SLA 24 h cho ≤ 90 ngày dữ liệu mỗi yêu cầu.
- **Phương án B (loại):** cold online replica 0: 277 TB dữ liệu, cần ~400 TB block storage, cộng với snapshot vẫn phải có. Đáp ứng SLA vô điều kiện nhưng thêm khoảng 290 TB đĩa so với A.
- **Đánh đổi:** A rẻ hơn nhiều nhưng SLA bị giới hạn theo phạm vi yêu cầu, và phải vận hành quy trình restore. Nên đổi sang B nếu số yêu cầu tra cứu > 90 ngày nhiều hơn khoảng vài lần mỗi tháng.

### ADR-3: Mask + băm ở Logstash, kênh đệm Kafka
- **Quyết định:** Kafka (2 topic) + Logstash mask/hash. ES ingest pipeline chỉ làm guard.
- **Phương án loại:** mask bằng ES `redact` (trả phí, lọt PII khi unlicensed); Beats → ES trực tiếp (không replay được, không có kênh thứ hai cho sealer).
- **Hệ quả:** thêm Kafka vào vận hành và một chặng có PII thô phải được bảo vệ (mã hoá, retention 24 h, ACL).

### ADR-4: Archive job tự viết thay vì SLM + ILM delete
- **Quyết định:** snapshot từng index sau forcemerge, xoá index chỉ khi snapshot đã được xác minh.
- **Phương án loại:** SLM nightly toàn bộ index: repo tăng ~1,6×. ILM delete + `wait_for_snapshot`: phải gắn với SLM, gặp lại vấn đề trên.
- **Hệ quả:** thêm một thành phần nhỏ phải test và giám sát. Mục 6.2 ghi các bất biến cần kiểm thử.
- **Snapshot repo không bật Object Lock:** Elasticsearch cần ghi đè/xoá blob metadata của repository. Elastic không hỗ trợ repo bật Object Lock (cần kiểm chứng lại với phiên bản đích). Chứng cứ nằm ở bucket WORM riêng.

### ADR-5: Toàn vẹn nằm ngoài ES (WORM + Merkle + chữ ký + RFC 3161)
- **Phương án loại:** chỉ dựa vào RBAC/read-only của ES: không chứng minh được với bên thứ ba, và Basic không có audit log. Blockchain công khai: phức tạp, không cần thiết khi đã có TSA.
- **Hệ quả:** thêm khoảng 63 TB/năm WORM và dịch vụ sealer. Đổi lại, chứng minh được ngay cả khi ES bị xâm phạm.

---

## 10. Rủi ro & mâu thuẫn trong đầu vào

| ID | Mức | Rủi ro / mâu thuẫn | Đề xuất |
|---|---|---|---|
| R-1 | **Cao** | **Mâu thuẫn:** searchable snapshots ↔ Basic | Chọn: giữ Basic (ADR-1/2) **hoặc** mua Enterprise. Cần khách hàng quyết định. Lưu ý: searchable snapshots giảm *block storage*, còn tổng dung lượng snapshot (~303 TB) vẫn giữ nguyên |
| R-2 | **Cao** | **Mâu thuẫn:** mask trước khi index ↔ "chứng minh không bị sửa". Bản mask không phải bản gốc | Định nghĩa chứng cứ = bản đã mask + `raw_sha256`. Pháp chế phải xác nhận điều này được chấp nhận. Nếu cần bản gốc đầy đủ: lưu raw **mã hoá** trong WORM riêng, khoá do pháp chế giữ. Việc này lại mâu thuẫn với tối thiểu hoá DLCN, cần DPO quyết |
| R-3 | **Cao** | Mask sót PII (free text, định dạng lạ). Khi đã vào WORM compliance thì **không xoá được**, cũng không xoá được khỏi snapshot cũ một cách sạch sẽ | PII guard 2 lớp, quarantine, `dynamic: strict`, corpus kiểm thử regex, review định kỳ. Chấp nhận rủi ro tồn dư có văn bản |
| R-4 | **Cao** | Basic không có audit logging/FLS/SSO nội tại | Reverse proxy SSO + access log, quy trình break-glass, ledger đối soát |
| R-5 | Trung bình | SLA 24 h chỉ đảm bảo cho ≤ 90 ngày dữ liệu mỗi yêu cầu, và phụ thuộc throughput object store | Ghi rõ trong SLA, đo throughput restore khi PoC |
| R-6 | Trung bình | Giả định nén (A4/A5) và throughput/node (A9/A10) chưa đo. Sai 30 % thì phần cứng sai 30 % | PoC trước khi đặt hàng |
| R-7 | Trung bình | Đỉnh tải chưa biết (A1). Tính theo 2× | Khách hàng cung cấp profile tải theo giờ |
| R-8 | Trung bình | Kafka `audit.raw` chứa PII thô | Mã hoá đĩa, ACL, retention 24 h, vùng mạng riêng |
| R-9 | Thấp | `raw_sha256` của event ngắn có thể bị dò bằng từ điển | Chấp nhận (event có timestamp/nội dung entropy cao). Hoặc dùng HMAC với khoá do pháp chế giữ, đổi lại bên thứ ba không tự verify được |
| R-10 | Trung bình | "12 tháng" ↔ legal hold. Vụ việc đang tranh chấp có thể cần giữ lâu hơn | Legal hold theo khoảng thời gian/lô trên WORM và snapshot |
| R-11 | Trung bình | Xung đột giữa quyền xoá DLCN của chủ thể dữ liệu và WORM | Bút danh hoá + huỷ khoá HMAC theo kỳ (crypto-shredding mapping) nếu luật cho phép. Cần pháp chế |
| R-12 | Thấp | Sai lệch đồng hồ làm hỏng chuỗi thời gian | NTP/PTP có giám sát. Lưu cả `@timestamp` nguồn và `event.ingested` |
| R-13 | Trung bình | DR: không có CCR trên Basic | Snapshot repo nhân bản sang site 2. RTO site = thời gian restore 31 ngày (~54 TB), tính bằng giờ tới ngày, cần chấp thuận |

---

## 11. Kế hoạch PoC (trước khi chốt phần cứng)

1. 1 ngày dữ liệu mẫu (đã ẩn danh) → đo hệ số hot/warm (A4, A5), gzip (A8), zstd (A7).
2. esrally/Rally track tự tạo: index throughput/hot node với mapping thật (A9). Logstash EPS/node với pipeline mask (A10).
3. Restore 5 TB từ object store → đo MB/s/node (mục 2.5).
4. Corpus PII (dương/âm tính) → đo recall/precision của regex mask.
5. Kiểm thử end-to-end verify (mục 7.3), gồm cả case sửa 1 byte, xoá 1 lô, chèn lô.
6. Đối chiếu bảng license (mục 8) cho phiên bản đích.

---

## 12. Câu hỏi mở cho khách hàng

1. Chấp nhận searchable snapshots (Enterprise) hay giữ Basic với restore theo yêu cầu? (R-1)
2. Pháp chế có chấp nhận "bản đã mask + hash bản gốc" làm chứng cứ không? (R-2)
3. "Masked" là thay hẳn (irreversible) hay bút danh hoá được phép tái định danh theo quy trình? (5.2-3a)
4. Phạm vi lớn nhất của một yêu cầu tra cứu dữ liệu cũ, và tần suất? (R-5, ADR-2)
5. Profile tải đỉnh. Có kế hoạch tăng trưởng không? (R-7)
6. Phân loại HTTT/cấp độ ATTT, và luật DLCN áp dụng? (A3, R-11)
7. Có yêu cầu site DR và RTO cụ thể không? (R-13)
