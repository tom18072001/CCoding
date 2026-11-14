# DESIGN — Nền tảng nhật ký kiểm toán (audit log) trên Elastic Stack

> Trạng thái: đề xuất kiến trúc & sizing (v1). Mọi con số không lấy trực tiếp từ đầu vào của khách hàng đều là **giả định** (ký hiệu **[GĐ]**) và phải được kiểm chứng bằng PoC trên dữ liệu thật trước khi mua phần cứng.

## 0. Tóm tắt

- **Kiến trúc**: Nguồn → Filebeat/Elastic Agent → **Kafka** (đệm, phát lại) → hai làn song song:
  1. **Làn chứng cứ**: dịch vụ *sealer* ghi bản gốc (chưa che) đã mã hóa vào **object storage WORM** (S3 Object Lock, chế độ *compliance*), băm SHA-256 theo lô, xâu chuỗi băm theo giờ, ký số và đóng dấu thời gian RFC 3161.
  2. **Làn tra cứu**: **Logstash** che dữ liệu cá nhân (pseudonymise bằng HMAC + regex trên văn bản tự do) **trước khi** gửi vào Elasticsearch.
- **Elasticsearch (Basic, tự vận hành)**: 3 master, **12 node hot** (NVMe, 0–30 ngày, 1 replica), **14 node warm** (HDD RAID6, 31–365 ngày, 0 replica, phục hồi từ snapshot khi hỏng node), snapshot hằng đêm vào S3. ILM: rollover → forcemerge + `best_compression` → warm sau 30 ngày → xóa sau 365 ngày.
- **Gợi ý "searchable snapshots cho cold/frozen" bị bác**: tính năng này cần giấy phép **Enterprise**, xung đột trực tiếp với ràng buộc "chỉ Basic". Thay bằng tier warm trên đĩa thường (khuyến nghị) hoặc snapshot + restore theo yêu cầu (phương án rẻ hơn, có giới hạn SLA).
- **Rủi ro lớn nhất**: (1) mâu thuẫn "chứng cứ pháp lý chưa bị sửa" ↔ "che PII trước khi index" — giải bằng tách làn chứng cứ, cần DPO/pháp chế xác nhận việc lưu bản gốc có PII; (2) giả định tỷ lệ nén chi phối toàn bộ sizing (±50% số node).

---

## 1. Đầu vào và yêu cầu phi chức năng (NFR)

| # | Yêu cầu | Nguồn | Diễn giải thiết kế |
|---|---|---|---|
| R1 | 20.000 sự kiện/giây liên tục, 800 B/sự kiện, 24/7 | Khách hàng | Thiết kế cho mức này **+ đệm đột biến** qua Kafka; hệ số đỉnh chưa biết → câu hỏi mở Q1 |
| R2 | Lưu 12 tháng | Khách hàng | 365 ngày; xóa ở 365 ngày tính từ rollover (dữ liệu tồn tại 365–366 ngày) |
| R3 | 30 ngày gần nhất tra cứu tương tác | Khách hàng | Tier hot NVMe, 1 replica; mục tiêu [GĐ] truy vấn lọc theo thời gian/trường < 10 s |
| R4 | Dữ liệu cũ hơn tra cứu được trong vòng 24 giờ từ khi yêu cầu | Khách hàng | Tier warm (luôn tra cứu được, chậm) — đáp ứng mọi phạm vi; phục hồi node hỏng < 24 h |
| R5 | Bằng chứng pháp lý, chứng minh được chưa bị sửa | Khách hàng | Làn chứng cứ WORM + chuỗi băm + chữ ký + TSA; ES không phải nguồn chứng cứ |
| R6 | Che username, e-mail, số điện thoại trước khi index | Khách hàng | Che tại Logstash, không dùng ES ingest pipeline; không có PII thô trong ES |
| R7 | Chỉ giấy phép Elastic Basic (miễn phí) | Khách hàng | Tự vận hành (Elastic Cloud không có gói Basic); loại mọi tính năng trả phí — xem §8 |
| R8 | "Dùng searchable snapshots cho cold/frozen" | Gợi ý KH | **Xung đột với R7** — bác, xem ADR-2 |

- **Phân loại dữ liệu**: nhật ký kiểm toán chứa dữ liệu cá nhân (PII) ở dạng thô trước khi che → làn Kafka và kho chứng cứ là **chặng nhạy cảm**.
- **Cấp độ ATTT (NĐ 85/2016, TT 12/2022)**: chưa có thông tin phân loại HTTT của chủ quản → **giả định** nền tảng log kế thừa cấp độ của hệ thống cao nhất mà nó thu log; cần chủ đầu tư xác nhận (Q7). Thiết kế dưới đây (phân vùng mạng, mã hóa, phân quyền, WORM) không phụ thuộc vào cấp cụ thể.
- **RPO/RTO [GĐ]**: RPO ≈ 0 sự kiện cho làn chứng cứ (Kafka RF=3, `acks=all`); RTO tra cứu hot ≤ 1 h (mất 1 node không gián đoạn nhờ replica); RTO dữ liệu warm ≤ 24 h (khớp R4).

---

## 2. Tính toán dung lượng

### 2.1 Khối lượng thô

| Đại lượng | Phép tính | Kết quả |
|---|---|---|
| Thông lượng | 20.000 ev/s × 800 B | **16 MB/s** (16.000.000 B/s) |
| Sự kiện/ngày | 20.000 × 86.400 | **1,728 tỷ** sự kiện |
| Thô/ngày | 16 MB/s × 86.400 s | **1,3824 TB/ngày** (≈ 1,257 TiB) |
| Thô/30 ngày | 1,3824 × 30 | 41,47 TB |
| Thô/năm | 1,3824 × 365 | **504,58 TB/năm** (≈ 630,7 tỷ sự kiện) |

(Đơn vị thập phân: 1 TB = 10¹² B.)

### 2.2 Giả định nén / phình chỉ mục

Hệ số **f = dung lượng trên đĩa của 1 bản primary / dung lượng thô** (đã gồm `_source`, inverted index, doc values, trường bổ sung như `event.id`, `event.hash` ≈ +100 B/sự kiện).

- **[GĐ] f = 1,0** cho segment mới ghi (codec mặc định LZ4) — chỉ áp dụng cho write index đang ghi (vài trăm GB).
- **[GĐ] f = 0,75** sau `forcemerge` với `index_codec: best_compression` (DEFLATE), với mapping ECS đã tinh chỉnh (trường định danh là `keyword`, chỉ `message` là `text`, tắt `dynamic`/multi-field thừa).
- Không dùng `logsdb`/synthetic `_source` để giảm thêm vì synthetic source thuộc gói trả phí (xem §8) — trên Basic nó quay về stored source.
- Tỷ lệ thực tế phụ thuộc mạnh vào cấu trúc log; **phải đo trong PoC** (nạp ≥ 1 ngày dữ liệu thật, đo `_cat/indices` trước/sau forcemerge). Xem bảng độ nhạy §2.6.

### 2.3 Tier hot (0–30 ngày, NVMe, 1 replica)

| Hạng mục | Phép tính | TB |
|---|---|---|
| Primary sau forcemerge | 41,47 TB × 0,75 | 31,10 |
| + 1 replica | × 2 | **62,21** |
| Write index + index chờ merge + không gian merge tạm | ≈ 3 index × 300 GB × 2 bản | ≈ 1,8 |
| **Tổng dữ liệu hot** | | **≈ 64** |
| Dung lượng đĩa cần (lấp đầy tối đa 75%, dưới low watermark 85%) | 64 / 0,75 | **≈ 85,3** |

### 2.4 Tier warm (31–365 ngày = 335 ngày, HDD, 0 replica)

| Hạng mục | Phép tính | TB |
|---|---|---|
| Thô 335 ngày | 1,3824 × 335 | 463,10 |
| Primary sau nén | × 0,75 | **347,33** |
| Replica | 0 (bảo vệ bằng snapshot + RAID6, xem ADR-3) | 0 |
| Dung lượng đĩa cần (lấp 75%) | 347,33 / 0,75 | **≈ 463,1** |

### 2.5 Ngoài Elasticsearch

| Kho | Phép tính | TB |
|---|---|---|
| Kho snapshot (S3) | 365 ngày × 1,3824 × 0,75 = 378,4 + index đã xóa còn trong snapshot 30 ngày (≈ 31,1) + segment chưa merge bị chụp (≈ 9) | **≈ 420** (chưa tính hệ số dự phòng của object storage, vd. erasure coding) |
| Kho chứng cứ WORM | [GĐ] nén zstd JSON còn 15% thô: 1,3824 × 0,15 = 0,207 TB/ngày × 365 = 75,7; + 1 tháng biên giữ | **≈ 82** |
| Kafka (giữ 72 h, RF=3, không tính nén) | 16 MB/s × 259.200 s = 4,15 TB × 3 | **≈ 12,4** |

### 2.6 Độ nhạy theo hệ số nén f

Quy tắc: hot nodes = ⌈(hot×2 + 1,8) / (0,75 × 7,68)⌉ và kiểm tra khi mất 1 node vẫn < 85%; warm nodes = ⌈warm / (0,75 × 36)⌉ + 1.

| f | Hot (2 bản) TB | Số node hot | Warm TB | Số node warm | Snapshot TB |
|---|---|---|---|---|---|
| 0,5 | 41,5 | 8 | 231,6 | 10 | ≈ 280 |
| **0,75 (cơ sở)** | **62,2** | **12** | **347,3** | **14** | **≈ 420** |
| 1,0 | 82,9 | 15 | 463,1 | 19 | ≈ 560 |
| 1,2 | 99,5 | 18 | 555,7 | 22 | ≈ 670 |

→ Mua phần cứng theo giai đoạn: đợt 1 đủ hot + 3 tháng warm, đo f thật, rồi mua phần warm còn lại.

---

## 3. Bố trí node theo tier

Phần cứng là **[GĐ]** (on-prem, máy chủ phổ thông); thay đổi được miễn giữ tỷ lệ.

| Thành phần | Số lượng | Cấu hình [GĐ] | Vai trò ES / ghi chú |
|---|---|---|---|
| Master | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | `master` riêng, 3 vùng sự cố (rack/phòng) khác nhau |
| Hot | **12** | 16 vCPU, 64 GB RAM (heap 31 GB), 2 × 3,84 TB NVMe RAID0 = 7,68 TB | `data_hot`, `data_content`. Tải: 64 TB / 12 = 5,33 TB/node = **69%**; mất 1 node → 5,82 TB = **76%** (< 85%) |
| Warm | **14** | 8–16 vCPU, 64 GB RAM (heap 31 GB), 12 × 4 TB HDD RAID6 ≈ 36 TB dùng được | `data_warm`. 347,3 / 14 = 24,8 TB/node = **69%**; mất 1 node, phục hồi shard từ snapshot sang 13 node → **74%**. Tỷ lệ đĩa:RAM ≈ 1:560 — chấp nhận vì truy cập hiếm, SLA 24 h |
| Coordinating | 2 | 8 vCPU, 32 GB RAM | Nhận truy vấn từ Kibana, giảm tải merge kết quả cho data node |
| Kibana | 2 | 4 vCPU, 8 GB | Sau reverse proxy (TLS, SSO, ghi log truy cập) |
| Logstash | 6 | 8 vCPU, 16 GB (heap 8 GB) | [GĐ] ~4.000–5.000 ev/s/node với regex che PII → cần 5, +1 dự phòng/đỉnh. Phải đo PoC |
| Kafka | 3 broker (+3 KRaft controller nhỏ hoặc chế độ kết hợp) | 8 vCPU, 32 GB, 2 × 3,84 TB SSD | Topic `audit-raw` 24 partition, RF=3, `min.insync.replicas=2`, giữ 72 h, **mã hóa đĩa** (chứa PII thô) |
| Sealer | 3 | 4 vCPU, 8 GB, không trạng thái | Consumer group riêng trên `audit-raw` |
| Monitoring cluster | 3 | nhỏ | Stack Monitoring (Basic) tách khỏi cluster chính |
| Object storage S3-compatible | 2 bucket, 2 miền quản trị tách biệt | ≈ 420 TB + ≈ 82 TB dùng được | `es-snapshots` (sao lưu) và `audit-evidence` (WORM, Object Lock compliance) |

**Shard** (hot 12 node): mỗi backing index 6 primary + 6 replica = 12 shard (1 shard/node). Rollover ở `max_primary_shard_size: 50gb` → index ≈ 300 GB primary, 16 MB/s ≈ 57,6 GB/h → rollover ≈ 5,2 h/lần ≈ 4,6 index/ngày ≈ 27,6 primary shard/ngày; sau nén ≈ 37,5 GB/shard.
- Hot: 30 × 27,6 × 2 ≈ 1.660 shard → ≈ 140/node.
- Warm: 335 × 27,6 ≈ 9.250 shard → ≈ 660/node (< giới hạn mặc định `cluster.max_shards_per_node` = 1000). Nếu heap warm căng: thêm `shrink` 6→3 ở warm (shard ≈ 75 GB, ≈ 330/node).

**Tải ghi**: 20.000 ev/s × 2 bản = 40.000 doc/s trên 12 node hot ≈ 3.300 doc/s/node — thấp so với khả năng NVMe [GĐ].

---

## 4. Luồng dữ liệu và ingest pipeline

```
 Nguồn (app, OS, DB, thiết bị)
   │  Filebeat / Elastic Agent standalone, TLS + mTLS
   ▼
 ┌──────────────── Kafka  topic audit-raw  (PII THÔ — vùng nhạy cảm, mã hóa đĩa, ACL) ────────────────┐
 │                                                                                                    │
 ▼ consumer group "sealer"                                          consumer group "logstash" ▼
 SEALER (làn chứng cứ)                                              LOGSTASH (làn tra cứu)
  1. gom lô / partition / 60 s                                       1. parse JSON, gán event.id = topic/partition/offset
  2. object = raw bytes nguyên văn, zstd,                            2. che PII (HMAC token + regex văn bản tự do)
     mã hóa envelope (KMS, khóa do pháp chế giữ)                     3. chặn rò rỉ: regex kiểm tra lại → nghi ngờ thì
  3. SHA-256(object) + dải offset                                       chuyển topic audit-quarantine (KHÔNG index)
  4. manifest/giờ: danh sách hash lô + hash manifest trước          4. event.hash = SHA-256(bản đã che, chuẩn hóa)
     → ký (HSM) → token RFC 3161 (TSA)                               5. raw_ref = khóa object chứng cứ + offset
  5. PUT vào bucket audit-evidence (Object Lock compliance, 13 th)   6. output elasticsearch: data stream, op_type create,
  6. ghi metadata manifest (không PII) vào index audit-integrity        document_id = event.id
   ▼                                                                   ▼
 audit-evidence (WORM)                                   Elasticsearch: hot (0–30 d) → warm (31–365 d) → delete
                                                                        │ SLM hằng đêm
                                                                        ▼
                                                               es-snapshots (S3, sao lưu — không phải chứng cứ)
```

### 4.1 Vì sao Kafka
- Tách nguồn khỏi ES: bảo trì/rolling upgrade ES, sự cố Logstash không làm mất sự kiện (đệm 72 h ≈ 4,15 TB/bản).
- Cho phép **hai consumer độc lập** đọc cùng một luồng thô → làn chứng cứ không phụ thuộc vào làn che.
- Offset liên tục theo partition (producer không dùng transaction, topic không compaction) → phát hiện **mất/xóa** sự kiện bằng khoảng trống offset trong chuỗi manifest. Cần kiểm chứng trong PoC.

### 4.2 Che PII (Logstash, trước khi index)
Đặt ở Logstash, không ở ES ingest pipeline, vì: (a) PII thô không bao giờ chạm vào node ES (kể cả bộ nhớ, slowlog, lỗi mapping); (b) không phụ thuộc processor có thể không thuộc Basic (vd. `redact` — **chưa kiểm chứng** giấy phép); (c) thất bại che → không index.

| Trường | Cách che | Ví dụ |
|---|---|---|
| `user.name`, `user.email`, `user.phone` (và alias theo nguồn) | **Pseudonymise**: `k1_` + 16 hex đầu của HMAC-SHA256(khóa K1, giá trị chuẩn hóa: lowercase/trim, điện thoại về E.164). Plugin `fingerprint` với `key` (HMAC) | `alice@x.vn` → `k1_9f2c…` |
| `message` và trường text tự do | `mutate.gsub` regex e-mail, số điện thoại (E.164 + định dạng nội địa [GĐ]) → thay bằng token HMAC | "login by alice@x.vn" → "login by k1_9f2c…" |
| Kiểm tra lại | Regex phát hiện còn sót → tag `pii_suspect` → chuyển `audit-quarantine` (Kafka, quyền hạn chế), cảnh báo | |

- Token HMAC **xác định** → điều tra viên vẫn tương quan được hành vi của cùng một người, và tra theo người cụ thể qua công cụ "tra token" có phân quyền (nhập username → token → tìm trong Kibana) mà không lưu PII trong ES.
- Khóa K1 trong KMS/vault, Logstash đọc qua keystore; xoay khóa → tiền tố phiên bản `k2_`; bản đồ phiên bản khóa ghi trong tài liệu vận hành.
- Không dùng hash **không khóa** (SHA-256 thuần) vì username/e-mail/điện thoại có entropy thấp → dò từ điển ra ngược được.
- Quy tắc che có **phiên bản** (`audit.mask_version`) để tái lập được bản đã che từ bản gốc khi giám định (§6).

### 4.3 Phác thảo cấu hình Logstash (rút gọn)

```ruby
input  { kafka { topics => ["audit-raw"] group_id => "logstash" decorate_events => "basic"
                 security_protocol => "SSL" codec => "json" } }
filter {
  mutate { add_field => { "[event][id]" => "%{[@metadata][kafka][topic]}-%{[@metadata][kafka][partition]}-%{[@metadata][kafka][offset]}"
                          "[audit][mask_version]" => "m1" } }
  fingerprint { source => "[user][name]"  target => "[user][name]"  method => "SHA256" key => "${PII_HMAC_K1}" }
  fingerprint { source => "[user][email]" target => "[user][email]" method => "SHA256" key => "${PII_HMAC_K1}" }
  fingerprint { source => "[user][phone]" target => "[user][phone]" method => "SHA256" key => "${PII_HMAC_K1}" }
  # ruby: chuẩn hóa trước khi HMAC, thay regex e-mail/điện thoại trong message, thêm tiền tố k1_,
  #       kiểm tra rò rỉ (tag pii_suspect), tính event.hash = SHA-256(JSON chuẩn hóa, khóa sắp xếp)
}
output {
  if "pii_suspect" in [tags] or "_mask_failure" in [tags] { kafka { topic_id => "audit-quarantine" } }
  else { elasticsearch { data_stream => true data_stream_type => "logs" data_stream_dataset => "audit"
                         action => "create" document_id => "%{[event][id]}" ssl_enabled => true } }
}
```

Lưu ý: `_id` cố định giúp phát lại từ Kafka không tạo trùng **trong cùng backing index**; nếu phát lại vượt qua mốc rollover, có thể trùng — phát hiện bằng truy vấn trùng `event.id` sau phát lại (rủi ro thấp, ghi nhận).

---

## 5. ILM, index template, SLM

### 5.1 ILM policy `audit-ilm`

```json
PUT _ilm/policy/audit-ilm
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "set_priority": { "priority": 100 },
          "rollover":     { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "readonly":     {},
          "forcemerge":   { "max_num_segments": 1, "index_codec": "best_compression" }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "set_priority": { "priority": 50 },
          "allocate":     { "number_of_replicas": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-nightly" },
          "delete": {}
        }
      }
    }
  }
}
```

- `forcemerge` + `best_compression` ngay trong hot (sau rollover) trên NVMe: giảm ~25% dung lượng hot [GĐ], đỡ merge trên HDD. Hành động `migrate` sang `data_warm` được ILM tự thêm ở pha warm.
- `readonly` sau rollover: index cũ chặn ghi (lớp phòng thủ, không phải bằng chứng).
- `min_age` tính từ rollover → dữ liệu ở hot ~30–31 ngày (≥ 30 ngày tương tác), bị xóa ở 365–366 ngày.
- **Legal hold**: khi có vụ việc, gỡ policy khỏi index liên quan (`POST <index>/_ilm/remove`) hoặc gán policy không có pha delete, đồng thời đặt legal hold trên object chứng cứ tương ứng.

### 5.2 Index template (rút gọn)

```json
PUT _index_template/logs-audit
{
  "index_patterns": ["logs-audit-*"],
  "data_stream": {},
  "priority": 500,
  "template": {
    "settings": {
      "index.lifecycle.name": "audit-ilm",
      "index.number_of_shards": 6,
      "index.number_of_replicas": 1,
      "index.routing.allocation.include._tier_preference": "data_hot",
      "index.refresh_interval": "5s"
    },
    "mappings": { "dynamic": "strict", "properties": { "...": "ECS tối thiểu; event.id/event.hash/audit.* là keyword" } }
  }
}
```

`dynamic: strict` chặn trường lạ (có thể chứa PII chưa che) — tài liệu không khớp sẽ bị từ chối và vào DLQ của Logstash (chứa bản **đã che**).

### 5.3 SLM

```json
PUT _slm/policy/audit-nightly
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-nightly-{now/d}>",
  "repository": "es-snapshots",
  "config": { "indices": ["logs-audit-*", "audit-integrity*"], "include_global_state": false },
  "retention": { "expire_after": "30d", "min_count": 7, "max_count": 40 }
}
```

Snapshot tăng dần theo segment: snapshot mới nhất luôn chứa toàn bộ 365 ngày đang có trong cluster; index đã xóa còn trong repo thêm ≤ 30 ngày (đã tính ở §2.5). Kiểm tra repo định kỳ bằng `POST _snapshot/es-snapshots/_verify` và (trước khi đưa vào dùng) `_analyze`.

---

## 6. Đảm bảo toàn vẹn (chứng minh chưa bị sửa)

Nguyên tắc: **Elasticsearch là bản làm việc, không phải bằng chứng.** Trên Basic không có security audit logging của ES, quản trị viên có quyền cao vẫn có thể sửa/xóa tài liệu; do đó chứng minh toàn vẹn dựa trên làn chứng cứ độc lập.

| Lớp | Cơ chế | Chứng minh được gì |
|---|---|---|
| L1 – Tiếp nhận | TLS/mTLS từ agent → Kafka; `acks=all`, RF=3 | Không mất/sửa trên đường truyền trong phạm vi nền tảng |
| L2 – Bất biến lưu trữ | Bucket `audit-evidence` bật **Object Lock compliance**, retention 13 tháng (≥ 12 tháng + biên); miền quản trị tách khỏi đội vận hành ES | Không ai (kể cả admin storage) xóa/ghi đè trước hạn |
| L3 – Băm theo lô | SHA-256 của từng object lô + dải offset Kafka | Mỗi lô chưa bị sửa |
| L4 – Chuỗi băm | Manifest theo giờ chứa hash các lô và `prev_manifest_hash` | Không chèn/xóa/đảo lô; offset liên tục → không mất sự kiện |
| L5 – Chữ ký + thời gian | Manifest ký bằng khóa trong HSM; token RFC 3161 từ TSA độc lập | Manifest tồn tại ở thời điểm T và do hệ thống phát hành |
| L6 – Liên kết bản tra cứu | Mỗi tài liệu ES có `event.id`, `raw_ref`, `event.hash`, `audit.mask_version` | Tái lập bản đã che từ bản gốc và đối chiếu với ES |
| L7 – Kiểm tra liên tục | Job hằng ngày: lấy mẫu N tài liệu ES, tái lập từ bản gốc, so `event.hash`; kiểm chuỗi manifest; kiểm khoảng trống offset; cảnh báo khi lệch | Phát hiện sớm sửa đổi trên ES |
| L8 – Phòng thủ ES | Role ghi chỉ `create_doc`; không ai có `index`/`delete` trên `logs-audit-*` trừ tài khoản break-glass; index readonly sau rollover; reverse proxy trước ES/Kibana ghi log mọi request (bù cho việc Basic không có audit log ES) | Giảm khả năng sửa; có vết truy cập |

**Quy trình giám định (cho tòa/thanh tra)**: (1) lấy object lô theo `raw_ref`; (2) tính SHA-256, so với manifest; (3) xác minh chữ ký manifest và token TSA; (4) xác minh chuỗi `prev_manifest_hash` và tính liên tục offset quanh sự kiện; (5) giải mã bản gốc (cần hai người giữ khóa — dual control); (6) nếu cần, áp quy tắc che phiên bản `mask_version` để chỉ ra bản ES trùng khớp.

Giới hạn: nền tảng chỉ chứng minh toàn vẹn **kể từ khi tiếp nhận vào Kafka**. Toàn vẹn từ nguồn đến agent (vd. ký tại nguồn) nằm ngoài phạm vi — Q4.

---

## 7. ADR

### ADR-1: Kafka + hai làn (chứng cứ / tra cứu)
- **Bối cảnh**: R5 (bằng chứng) và R6 (che trước khi index) kéo hai hướng ngược nhau; ES Basic không chứng minh được toàn vẹn.
- **Quyết định**: Kafka làm điểm tiếp nhận duy nhất; sealer ghi bản gốc WORM có chuỗi băm/ký/TSA; Logstash che và index.
- **Phương án loại**: (a) Agent → Logstash → ES trực tiếp, băm trong ES — không có bằng chứng ngoài ES, mất dữ liệu khi ES bảo trì; (b) chỉ lưu bản **đã che** làm chứng cứ — đơn giản, không lưu PII thô, nhưng không chứng minh được nội dung gốc (vd. ai thật sự đăng nhập). Giữ (b) làm **phương án dự phòng** nếu DPO không cho lưu bản gốc (Q2).
- **Hệ quả**: thêm Kafka (3 broker) và một dịch vụ sealer tự viết cần bảo trì; PII thô tồn tại ở Kafka 72 h và trong kho chứng cứ (mã hóa, dual control).

### ADR-2: Không dùng searchable snapshots; tier warm trên đĩa
- **Bối cảnh**: KH gợi ý searchable snapshots (cold/frozen); R7 chỉ cho Basic; R4 cho phép trễ 24 h.
- **Quyết định**: **Phương án A** — warm HDD, 0 replica, 31–365 ngày, luôn tra cứu được.
- **Phương án xét**:

| | A. Warm HDD (chọn) | B. Snapshot-only + restore theo yêu cầu | C. Searchable snapshots (gợi ý KH) |
|---|---|---|---|
| Giấy phép | Basic | Basic | **Enterprise — vi phạm R7** |
| Node ES cho dữ liệu cũ | 14 warm | ~4 node "restore" (≈ 100 TB) | ít |
| Đáp ứng R4 | Mọi phạm vi, mọi lúc | Chỉ khi phạm vi yêu cầu ≲ 1 tháng dữ liệu: [GĐ] restore 500 MB/s × 18 h hữu dụng ≈ 32 TB ≈ 31 ngày dữ liệu; yêu cầu cả năm (≈ 347 TB) **không** kịp 24 h | Có |
| Chi phí | Cao nhất (≈ 463 TB đĩa server) | Thấp (dữ liệu chỉ ở object storage) | — |

- **Hệ quả**: chi phí phần cứng warm lớn nhưng SLA chắc chắn; nếu KH xác nhận yêu cầu cũ luôn hẹp (Q3), chuyển sang B để tiết kiệm ~10 node. Nếu sau này mua Enterprise, C thay A trực tiếp (cùng repo snapshot).

### ADR-3: Warm 0 replica, bảo vệ bằng RAID6 + snapshot
- **Quyết định**: replica 0 ở warm; RAID6 chịu 2 đĩa hỏng/node; mất cả node → restore shard từ snapshot (≈ 25 TB, [GĐ] ≈ 14 h ở 500 MB/s) — trong SLA 24 h.
- **Phương án loại**: 1 replica (gấp đôi ≈ 347 TB, +13 node); RAID0 (mỗi lần hỏng 1 trong 168 đĩa phải restore).
- **Hệ quả**: trong lúc restore, một phần dữ liệu cũ tạm không tra được; cluster health `red` với index warm đó — runbook phải phân biệt cảnh báo.

### ADR-4: Che PII bằng HMAC xác định tại Logstash
- **Quyết định**: token HMAC-SHA256 có khóa, có phiên bản; regex cho văn bản tự do; cách ly khi nghi rò rỉ.
- **Phương án loại**: xóa trắng (`***`) — mất khả năng tương quan; mã hóa thuận nghịch trong ES — ES vẫn chứa PII (giải mã được) và Basic không có FLS để giới hạn; hash không khóa — dò ngược được.
- **Hệ quả**: dữ liệu bút danh hóa có thể vẫn được coi là dữ liệu cá nhân theo quy định bảo vệ DLCN — cần DPO xác nhận (Q2); khóa K1 là tài sản then chốt.

---

## 8. Ràng buộc giấy phép Basic

Đối chiếu tại https://www.elastic.co/subscriptions trước khi triển khai — bảng dưới theo hiểu biết hiện tại, **chưa kiểm chứng lại ở phiên bản đích**.

| Tính năng | Basic? | Tác động thiết kế |
|---|---|---|
| Security (TLS, xác thực native/file, RBAC) | Có | Dùng đầy đủ |
| ILM, SLM, data streams, data tiers, snapshot/restore S3 | Có | Nền tảng của thiết kế |
| Stack Monitoring | Có | Cluster giám sát riêng |
| **Searchable snapshots** (cold/frozen) | **Không (Enterprise)** | ADR-2 |
| **Security audit logging** của ES | **Không** | Bù bằng log reverse proxy; toàn vẹn không dựa vào ES |
| Field/Document-level security | Không | Lý do phải che PII trước khi index |
| SSO SAML/OIDC trực tiếp trong Kibana | Không | SSO ở reverse proxy, hoặc tài khoản native |
| Synthetic `_source` / tối ưu lưu trữ `logsdb` | Không (chưa kiểm chứng ở bản đích) | Không tính vào nén |
| Kibana connectors ngoài Index/Server log | Hạn chế | Cảnh báo qua hệ thống giám sát ngoài |
| Processor `redact` | Chưa kiểm chứng | Không dùng; che ở Logstash |

---

## 9. Rủi ro và xung đột trong đầu vào

| # | Rủi ro / xung đột | Mức | Xử lý |
|---|---|---|---|
| X1 | Gợi ý searchable snapshots **xung đột** với "chỉ Basic" | Cao | Bác (ADR-2); nêu rõ với KH |
| X2 | "Bằng chứng chưa bị sửa" ↔ "che trước khi index": bản trong ES đã bị biến đổi nên tự nó không phải bản gốc | Cao | Làn chứng cứ tách riêng (ADR-1); cần pháp chế/DPO chấp thuận lưu bản gốc có PII (Q2) |
| X3 | Hash bản gốc lưu cạnh bản đã che → dò ngược PII | Cao | Không lưu hash bản gốc trong ES; hash bản gốc chỉ ở manifest WORM; token PII dùng HMAC có khóa |
| X4 | Basic không có audit log ES, FLS/DLS | Trung bình | Reverse proxy log; RBAC chặt; chứng cứ ngoài ES |
| X5 | "Tra cứu được trong 24 h" mơ hồ về phạm vi | Trung bình | Phương án A đáp ứng mọi phạm vi; B chỉ phạm vi hẹp (Q3) |
| X6 | Hệ số nén chưa đo → sai số ±50% số node | Cao | PoC; mua theo giai đoạn (§2.6) |
| X7 | Không biết hệ số đỉnh; 20k là trung bình hay đỉnh | Trung bình | Kafka đệm 72 h; Logstash/hot có dư ~50% [GĐ] (Q1) |
| X8 | Regex bỏ sót PII trong văn bản tự do | Trung bình | Kiểm tra lại + cách ly; danh mục định dạng do KH cung cấp; kiểm thử với mẫu thật |
| X9 | PII thô trong Kafka và kho chứng cứ | Trung bình | Mã hóa đĩa/envelope, ACL, mạng riêng, dual control giải mã |
| X10 | Warm 0 replica: mất node → dữ liệu cũ tạm không tra được tới ~14 h | Thấp | Trong SLA 24 h; RAID6 giảm tần suất |
| X11 | Repo snapshot không đặt Object Lock (ES cần xóa blob) → snapshot không phải chứng cứ | Thấp | Đúng thiết kế; bảo vệ bằng tài khoản riêng, versioning nếu `_analyze` cho phép |
| X12 | Trùng tài liệu khi phát lại vượt mốc rollover | Thấp | Truy vấn phát hiện trùng `event.id` |
| X13 | Sealer là mã tự viết — rủi ro lỗi/bảo trì | Trung bình | Mã nhỏ, kiểm thử, rà soát độc lập; job xác minh L7 phát hiện lỗi |
| X14 | Giữ 12 tháng có thể ngắn hơn nghĩa vụ lưu chứng cứ khi có tranh chấp | Trung bình | Quy trình legal hold (§5.1) |
| X15 | Chuỗi chứng cứ chỉ bắt đầu từ Kafka | Trung bình | Q4: ký tại nguồn nếu cần |

---

## 10. Câu hỏi mở cho khách hàng

- **Q1**: 20.000 ev/s là trung bình hay đỉnh? Hệ số đỉnh, tăng trưởng/năm?
- **Q2**: DPO/pháp chế có chấp thuận lưu bản gốc (có PII, mã hóa, WORM) 12 tháng? Nếu không → chứng cứ chỉ là bản đã che (ADR-1 dự phòng). Ai giữ khóa giải mã?
- **Q3**: Yêu cầu tra dữ liệu cũ thường phủ bao nhiêu ngày? (quyết định A hay B ở ADR-2)
- **Q4**: Có yêu cầu chứng minh toàn vẹn từ chính hệ thống nguồn không?
- **Q5**: Định dạng username/số điện thoại (nội địa, quốc tế) và danh sách trường chứa PII theo từng nguồn.
- **Q6**: Hạ tầng: on-prem hay cloud tự quản? Object storage S3-compatible có Object Lock compliance sẵn chưa? Có TSA và HSM?
- **Q7**: Phân loại HTTT/cấp độ ATTT của các hệ thống nguồn.

## 11. Kế hoạch kiểm chứng (PoC)

1. Nạp ≥ 24 h dữ liệu thật (đã che) vào 3 node hot → đo f trước/sau forcemerge, cập nhật §2.6.
2. Đo thông lượng Logstash/node với bộ regex che thật.
3. Đo tốc độ restore từ repo S3 (quyết định ADR-2/ADR-3).
4. Kiểm thử sealer: tiêm lỗi (xóa/sửa object, bỏ offset) → job xác minh phải phát hiện.
5. Chạy `POST _snapshot/es-snapshots/_analyze` với cấu hình bucket thực.
