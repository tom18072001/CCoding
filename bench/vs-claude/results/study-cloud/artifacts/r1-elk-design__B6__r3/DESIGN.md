# DESIGN — Nền tảng audit-log trên Elastic Stack (giấy phép Basic)

> Trạng thái: **Đề xuất (draft v1)**, cần PoC để đo lại các giả định được đánh số `A-xx`.
> Đơn vị: **TB = 10¹² byte** và **GB = 10⁹ byte**, dùng thống nhất trong toàn bộ tài liệu. TiB (2⁴⁰) chỉ ghi trong ngoặc để đối chiếu.
> Không có tên máy, IP hay khóa thật trong tài liệu. Biến dạng `${...}` là tham chiếu tới keystore hoặc secret store.

---

## 0. Tóm tắt

- **Kiến trúc:** Filebeat/Elastic Agent → **Kafka** (đệm, fan-out) → hai nhánh độc lập:
  - (a) **Raw archiver + sealer:** lưu bản gốc chưa che vào object storage **WORM (Object Lock)**, có hash chain, chữ ký số và timestamp RFC 3161 neo ra ngoài. Đây là **bằng chứng pháp lý gốc**.
  - (b) **Logstash:** băm bản gốc, che PII theo cơ chế fail-closed, rồi ghi vào Elasticsearch.
- **Các tầng lưu trữ:**
  - Elasticsearch giữ **30 ngày** để tìm kiếm tương tác: hot 7 ngày trên NVMe, warm 23 ngày.
  - Dữ liệu 12 tháng nằm trong **snapshot thường (SLM)** trên object storage có Object Lock.
  - Dữ liệu cũ được **restore theo yêu cầu** vào một "restore pool" trên các node warm, cam kết xong trong 24 giờ cho phạm vi ≤ 30 ngày dữ liệu mỗi yêu cầu.
- **Xung đột lớn nhất:** khách gợi ý dùng *searchable snapshots* cho cold/frozen, nhưng tính năng này **cần giấy phép Enterprise**, không có trong Basic. Ngoài ra, yêu cầu "che PII trước khi index" mâu thuẫn với "bằng chứng nguyên vẹn" nếu không giữ bản gốc. Thiết kế này giải quyết bằng kho raw WORM tách biệt, nhưng khách và bộ phận pháp chế phải phê duyệt chính sách này (xem §7, §8).
- **Quy mô phần cứng ở hệ số nén giả định 0,6:**
  - Elasticsearch: 3 master + 6 hot + 7 warm node, tổng ≈ 136 TB đĩa.
  - Object storage: ≈ 1.123 TB nếu chép sang 2 site, gồm snapshot và raw archive.

---

## 1. Bối cảnh, NFR và giả định

### 1.1 Yêu cầu đầu vào (từ khách)

| ID | Yêu cầu |
|---|---|
| R1 | Ingest liên tục 20.000 event/s, kích thước raw trung bình 800 B, chạy 24/7 |
| R2 | Lưu 12 tháng |
| R3 | 30 ngày gần nhất phải tìm kiếm tương tác được |
| R4 | Dữ liệu cũ hơn phải tìm được trong vòng 24 giờ kể từ khi có yêu cầu |
| R5 | Log là bằng chứng pháp lý, phải chứng minh được là chưa bị sửa |
| R6 | Che username, e-mail, số điện thoại trước khi index |
| R7 | Chỉ dùng giấy phép Elastic Basic (miễn phí) |
| R8 | Gợi ý của khách: dùng searchable snapshots cho tầng cold/frozen |

### 1.2 Giả định có tên (phải kiểm chứng)

| ID | Giả định | Cách kiểm chứng |
|---|---|---|
| A-01 | **Hệ số chỉ mục trên đĩa k = 0,6 × raw** cho mỗi bản primary, khoảng tin cậy **0,5–0,7**. Hệ số này đã gồm `_source` nén `best_compression`, doc_values, inverted index, cộng các trường thêm vào (hash, pseudonym, metadata Kafka). | PoC: index ≥ 1 ngày dữ liệu thật (đã che), sau forcemerge thì đo `_cat/indices?v&h=pri.store.size` chia cho raw |
| A-02 | Raw archive nén zstd đạt **0,2 × raw** (khoảng 0,15–0,25) | PoC trên mẫu log thật |
| A-03 | Headroom tăng trưởng/đỉnh **25 %**. Mức lấp đầy tối đa bằng watermark low **85 %** (mặc định của Elasticsearch). Hệ số cấp phát **H = 1,25 / 0,85 = 1,4706** | Chính sách vận hành |
| A-04 | Mỗi node Logstash xử lý ≈ **7.000 eps** với pipeline che PII trên 8 vCPU | PoC benchmark |
| A-05 | Mỗi node warm restore được ≈ **150 MB/s**. Điều kiện: đã nâng `indices.recovery.max_bytes_per_sec` (mặc định 40mb), object storage cấp ≥ 1,05 GB/s, mạng ≥ 10 GbE | PoC restore 1 ngày dữ liệu |
| A-06 | Overhead của kho snapshot là **15 %**, đến từ repo vận hành 35 ngày giữ các segment chưa forcemerge, cộng metadata | Đo sau 60 ngày chạy |
| A-07 | Tải đều 24/7, không có hệ số đỉnh. Khách chưa cung cấp đỉnh, nên ở §7 giả định đỉnh 2× kéo dài 1 giờ | Xin số liệu đỉnh từ khách |
| A-08 | Dùng Elasticsearch/Logstash/Kibana 8.x hoặc 9.x bản hiện hành, tất cả cùng một phiên bản | Chốt khi PoC |
| A-09 | Có object storage S3-compatible hỗ trợ **Object Lock** (versioning) tại 2 site | Xác nhận hạ tầng khách |

### 1.3 NFR rút ra

- **Thông lượng:** 16 MB/s raw ổn định. Thiết kế chịu được mất 1 node ở mỗi tầng (N-1).
- **Độ trễ:** event phải tìm được trên Kibana trong ≤ 60 s (mục tiêu, cần xác nhận).
- **RPO:**
  - Ingest: 0 event mất kể từ khi Kafka ack (`acks=all`, RF=3).
  - Bằng chứng: raw archive niêm phong theo segment 5 phút.
- **RTO cho dữ liệu cũ:** ≤ 24 giờ với phạm vi ≤ 30 ngày dữ liệu mỗi yêu cầu (xem §3.5).
- **Nhãn dữ liệu:** audit log có chứa dữ liệu cá nhân (PII).
  - Raw archive và Kafka: **Hạn chế**.
  - Chỉ mục Elasticsearch đã che: **Nội bộ**.
- **Cấp độ ATTT:** chưa có căn cứ, vì brief không nêu chủ quản, loại HTTT hay pháp quyền áp dụng.
  - **Giả định:** đây là hệ thống doanh nghiệp, áp dụng luật bảo vệ dữ liệu cá nhân hiện hành. Pháp chế của khách cần xác nhận.
  - Nếu chủ quản là cơ quan nhà nước Việt Nam, phải lập hồ sơ đề xuất cấp độ theo NĐ 85/2016/NĐ-CP và TT 12/2022/TT-BTTTT (cần soát văn bản thay thế). Phân vùng mạng và nhật ký điều chỉnh theo cấp được duyệt.

---

## 2. Số học dung lượng

### 2.1 Khối lượng raw

| Đại lượng | Phép tính | Kết quả |
|---|---|---|
| Băng thông raw | 20.000 eps × 800 B | **16.000.000 B/s = 16 MB/s** (≈ 15,26 MiB/s) |
| Event/ngày | 20.000 × 86.400 s | **1.728.000.000 event (1,728 tỷ)** |
| Raw/ngày | 16 MB/s × 86.400 s = 1,3824 × 10¹² B | **1,3824 TB** (≈ 1,257 TiB) |
| Raw 7 ngày (hot) | 1,3824 × 7 | 9,6768 TB |
| Raw 23 ngày (warm) | 1,3824 × 23 | 31,7952 TB |
| Raw 30 ngày | 1,3824 × 30 | **41,472 TB** |
| Raw 335 ngày (11 tháng còn lại) | 1,3824 × 335 | 463,104 TB |
| Raw 1 năm (365 ngày) | 1,3824 × 365 | **504,576 TB** (≈ 458,9 TiB) |

Kiểm tra chéo: 41,472 + 463,104 = 504,576 TB ✔. Đổi đơn vị: 1,3824 × 10¹² / 2⁴⁰ = 1,2573 TiB và 504,576 × 10¹² / 2⁴⁰ = 458,91 TiB ✔.

### 2.2 Giả định nén (A-01)

- **Primary trên đĩa = k × raw, với k = 0,6.** Khoảng tin cậy 0,5–0,7. Mỗi ngày tạo 1,3824 × 0,6 = **0,82944 TB primary**.
- Template đặt `index.codec: best_compression` ngay từ khi tạo index. Cách này tốn thêm CPU ở hot nhưng giảm đĩa. Pha warm forcemerge về 1 segment.
- Hệ số k là **giả định, chưa đo**. Audit log JSON có nhiều trường lặp nên thường nén tốt, nhưng các trường hash và pseudonym có entropy cao, nén kém. Phải đo lại bằng PoC trước khi đặt mua phần cứng.

### 2.3 Hệ số cấp phát

`Đĩa cần = dữ liệu × 1,25 (headroom) / 0,85 (watermark low) = dữ liệu × 1,4706`

- Watermark: low 85 %, high 90 %, flood_stage 95 % (giữ mặc định).
- Sau khi mất 1 node, mức lấp đầy vẫn phải < 85 %. Mục 2.5 kiểm tra điều này.

### 2.4 Dung lượng theo tầng (k = 0,6)

| Tầng | Dữ liệu raw | Primary (× 0,6) | Có replica/bản sao (× 2) | Cấp phát (× 1,4706) | Ghi chú |
|---|---|---|---|---|---|
| **Hot**, ngày 0–7 | 9,6768 TB | 5,8061 TB | 11,6122 TB | **17,08 TB** | NVMe, 1 replica |
| **Warm**, ngày 8–30 | 31,7952 TB | 19,0771 TB | 38,1542 TB | **56,11 TB** | 1 replica |
| *Cộng 30 ngày tương tác* | 41,472 TB | 24,8832 TB | 49,7664 TB | **73,19 TB** | |
| **Restore pool** trên node warm, chứa tối đa 30 ngày dữ liệu cũ | 41,472 TB | 24,8832 TB | — (replica 0, vì nguồn là snapshot) | **36,59 TB** | Chỉ dùng khi có yêu cầu |
| *Tổng node warm* (56,11 + 36,59) | | | | **92,70 TB** | |
| *Phương án A bị loại:* giữ online 11 tháng | 463,104 TB | 277,8624 TB | 555,7248 TB | **817,24 TB** | Xem ADR-2 |
| **Kho snapshot**, 12 tháng, chỉ lưu primary | 504,576 TB | 302,7456 TB, × 1,15 overhead (A-06) = 348,1574 TB | — | × 1,25 = **435,20 TB/site**. Hai site (bản sao thứ 2): **870,39 TB** | Object storage, không tính watermark |
| **Raw archive** (bằng chứng gốc) | 504,576 TB | × 0,2 (A-02) = 100,9152 TB | — | × 1,25 = **126,14 TB/site**. Hai site: **252,29 TB** | Object Lock, mã hóa |
| **Kafka**, giữ 72 giờ | 4,1472 TB | không nén (cách tính thận trọng) | × RF3 = 12,4416 TB | **18,30 TB** | |

**Tổng cấp phát:**
- Elasticsearch: 17,08 + 92,70 = **109,78 TB** cần, so với **136 TB** lắp đặt (§3).
- Object storage: 870,39 + 252,29 = **1.122,68 TB** cho 2 site, hoặc 561,34 TB nếu chỉ 1 site.

**Độ nhạy theo k** (cộng hot + node warm, gồm restore pool):

| k | Hot cấp phát | Node warm cấp phát | Kho snapshot/site | Tác động |
|---|---|---|---|---|
| 0,5 | 14,23 TB | 77,25 TB | 362,66 TB | Thừa dung lượng |
| 0,6 | 17,08 TB | 92,70 TB | 435,20 TB | Phương án cơ sở |
| 0,7 | 19,92 TB | 108,15 TB | 507,73 TB | **Cần thêm 1 node warm** (lên 8) |

### 2.5 Kiểm tra N-1

- **Hot:** 6 × 4 TB = 24 TB, cần 17,08 TB. Dữ liệu thực 11,61 TB chiếm 48 %. Mất 1 node còn 20 TB, mức lấp đầy 58 % < 85 % ✔.
- **Warm:** 7 × 16 TB = 112 TB, cần 92,70 TB. Dữ liệu thực tối đa 38,15 + 24,88 = 63,04 TB chiếm 56 %. Mất 1 node còn 96 TB, mức lấp đầy 66 % < 85 % ✔.

---

## 3. Kiến trúc và bố trí node

### 3.1 Sơ đồ luồng dữ liệu

```
 Nguồn log ──TLS──► Filebeat / Elastic Agent (disk queue, at-least-once)
                         │ Kafka output, acks=all, TLS+SASL
                         ▼
               ┌───────────────────┐  topic audit-raw (RF=3, 72h, ACL)   ◄── [NHẠY CẢM: chứa PII]
               │  Kafka (3 broker) │  topic audit-quarantine (14 ngày, ACL chặt)
               └─────┬────────┬────┘
   consumer group A  │        │ consumer group B
                     ▼        ▼
   ┌──────────────────────┐  ┌─────────────────────────────────────────────┐
   │ Raw archiver+Sealer  │  │ Logstash ×4: hash raw → che PII → kiểm dư   │
   │ segment 5' NDJSON.zst│  │ → hash bản đã che → output                  │
   │ Merkle + hash chain  │  │   ├─ OK  → Elasticsearch (create_doc)       │
   │ ký (HSM/KMS) + TSA   │  │   └─ lỗi → Kafka audit-quarantine (không index)│
   └─────────┬────────────┘  └──────────────────┬──────────────────────────┘
             ▼                                  ▼
  Object storage bucket            ┌──────────── Elasticsearch ─────────────┐
  raw-archive (Object Lock         │ master ×3 │ hot ×6 (0–7d) │ warm ×7    │
  COMPLIANCE, SSE-KMS)  [PII]      │           │               │ (8–30d +   │
  + chain head → bên thứ 3         │           │               │ restore pool)│
                                   └─────┬──────────────────────────────────┘
                                         │ SLM (snapshot thường)
                                         ▼
                      Object storage: repo audit-archive (Object Lock 366d)
                                      repo audit-ops (35d)
  Kibana ×2 ◄── reverse proxy có ghi log truy cập (thay cho audit log mà Basic không có)
```

### 3.2 Bố trí node

| Tầng/vai trò | Số node | vCPU | RAM (heap) | Đĩa | Ghi chú |
|---|---|---|---|---|---|
| ES master (chuyên dụng) | **3** | 4 | 16 GB (8 GB) | 100 GB SSD | Đặt ở 3 rack/AZ khác nhau. `node.roles: [master]` |
| ES **hot** (`data_hot`, `data_content`, `ingest`) | **6** | 16 | 64 GB (31 GB) | **4 TB NVMe** | Mỗi node nhận ≈ 6.700 doc/s, gồm cả replica (40.000 / 6). Cần kiểm chứng bằng PoC |
| ES **warm** (`data_warm`) | **7** (8 nếu k = 0,7) | 8 | 64 GB (31 GB) | **16 TB** SSD SATA (hoặc HDD, chọn theo kết quả PoC restore) | Giữ ngày 8–30 và restore pool. Tỷ lệ RAM:đĩa 1:250 |
| ES coordinating-only | 2 | 8 | 32 GB (16 GB) | 100 GB | Phục vụ Kibana và truy vấn nặng |
| Kibana | 2 | 4 | 8 GB | — | Nằm sau reverse proxy có log truy cập |
| Logstash | **4** (N+1) | 8 | 16 GB (8 GB) | 200 GB SSD | 3 node × 7.000 eps (A-04) ≥ 20.000 eps |
| Kafka broker (KRaft) | **3** | 8 | 32 GB | 8 TB SSD | 24 TB ≥ 18,30 TB. Controller KRaft chạy kết hợp hoặc 3 node nhỏ riêng |
| Raw archiver + sealer | 2 (active/standby theo partition) | 4 | 8 GB | 200 GB | Ứng dụng nhỏ: Kafka consumer, S3 SDK, ký qua HSM/KMS |
| **Nơi lưu snapshot** | Object storage S3-compatible, 2 site | — | — | 435,20 TB/site | Repo `audit-archive` (Object Lock 366 ngày) và repo `audit-ops` (35 ngày) |
| **Raw archive** | Cùng hạ tầng object storage, **tách bucket và tài khoản** | — | — | 126,14 TB/site | Object Lock COMPLIANCE |

**Phân định tầng:**
- **Hot** là 6 node NVMe, giữ 0–7 ngày.
- **Warm** là 7 node đĩa dung lượng lớn, giữ 8–30 ngày, đồng thời làm restore pool.
- **Không có tầng cold/frozen chạy trên searchable snapshot.** Dữ liệu từ tháng 2 đến tháng 12 **chỉ nằm ở object storage** dưới dạng snapshot thường.

### 3.3 Shard sizing

- Mỗi data stream `audit-events` dùng index template với **6 primary** (1 primary/node hot) và 1 replica.
- Rollover khi `max_primary_shard_size: 25gb` hoặc `max_age: 1d`:
  - Mỗi index tối đa 6 × 25 = 150 GB primary.
  - Mỗi ngày có 829,44 GB primary / 150 GB ≈ **5,5 lần rollover**, tức khoảng 4,3 giờ một lần.
- Pha warm **shrink 6 → 3 shard**, mỗi shard ≈ 50 GB (nằm trong dải 30–50 GB), rồi forcemerge về 1 segment.
- Số shard ổn định:
  - Hot: 7 × 5,5 × 6 × 2 ≈ 462.
  - Warm: 23 × 5,5 × 3 × 2 ≈ 759.
  - Tổng ≈ 1.220 shard, cộng shard restore. Con số này thấp so với giới hạn khuyến nghị.

### 3.4 Index template (trích)

```json
PUT _index_template/audit-events
{
  "index_patterns": ["audit-events*"],
  "data_stream": {},
  "priority": 500,
  "template": {
    "settings": {
      "number_of_shards": 6,
      "number_of_replicas": 1,
      "index.codec": "best_compression",
      "index.lifecycle.name": "audit-events-ilm",
      "index.routing.allocation.include._tier_preference": "data_hot",
      "index.refresh_interval": "30s"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":            { "type": "date" },
        "event":   { "properties": { "created": { "type": "date" }, "ingested": { "type": "date" } } },
        "user":    { "properties": { "name": { "type": "keyword" }, "email": { "type": "keyword" } } },
        "message_masked":        { "type": "match_only_text" },
        "integrity": { "properties": {
          "raw_sha256":    { "type": "keyword", "index": false },
          "masked_sha256": { "type": "keyword", "index": false },
          "kafka_partition": { "type": "integer" },
          "kafka_offset":    { "type": "long" },
          "mask_key_id":     { "type": "keyword" }
        } }
      }
    }
  }
}
```

- `dynamic: strict` buộc mọi trường mới phải được khai báo trước. Trường lạ sẽ làm event bị từ chối và đi vào DLQ, nên PII mới không lọt vào chỉ mục một cách âm thầm.
- Mapping đầy đủ được chốt theo các nguồn log thực tế.

### 3.5 Truy xuất dữ liệu cũ trong 24 giờ (restore theo yêu cầu)

Quy trình:
1. Tiếp nhận yêu cầu và phê duyệt (≤ 2 giờ).
2. Tra **catalog** (index `audit-catalog`, do job hằng ngày ghi: tên index → min/max `@timestamp` → tên snapshot) để chọn đúng index.
3. Restore vào node warm:

```json
POST _snapshot/audit-archive/<snapshot>/_restore
{
  "indices": "shrink-*audit-events-2026.03.*",
  "include_global_state": false,
  "rename_pattern": "(.+)", "rename_replacement": "restored-$1",
  "index_settings": {
    "index.number_of_replicas": 0,
    "index.routing.allocation.include._tier_preference": "data_warm",
    "index.lifecycle.name": "audit-restored-ilm",
    "index.lifecycle.origination_date": <epoch_ms_thời_điểm_restore>,
    "index.blocks.write": true
  }
}
```

4. Người dùng tìm kiếm trên Kibana qua data view `restored-*`.
5. ILM `audit-restored-ilm` tự xóa index restore sau 14 ngày, tính từ `origination_date`.

**Ước lượng thời gian restore** (A-05: 7 node × 150 MB/s = 1,05 GB/s ≈ **3,78 TB/giờ**):

| Phạm vi | Dữ liệu primary cần restore | Thời gian ước lượng |
|---|---|---|
| 1 ngày | 0,8294 TB | ≈ 0,22 giờ (13 phút) |
| 30 ngày (dung lượng restore pool) | 24,8832 TB | **≈ 6,6 giờ** |
| Toàn bộ 11 tháng (≈ 463 TB raw) | 277,8624 TB | **≈ 73,5 giờ (≈ 3,1 ngày)** và **không vừa** restore pool |
| Cả năm (≈ 504,6 TB raw) | 302,7456 TB | ≈ 80,1 giờ |
| 30 ngày ở throttle **mặc định** 40 MB/s/node (280 MB/s ≈ 1,008 TB/giờ) | 24,8832 TB | **≈ 24,7 giờ, vượt SLA** |

Hệ quả:
- **Phải nâng throttle recovery và băng thông object storage.**
- SLA 24 giờ chỉ giữ được khi mỗi yêu cầu giới hạn ở **≤ 30 ngày dữ liệu**.
- Nếu một yêu cầu cần cả năm, phải tạm thêm node warm (ví dụ thuê 6–8 node trong 1 tuần) và chấp nhận thời gian khoảng 3–4 ngày. Đây là câu hỏi mở Q3.

---

## 4. Ingest pipeline và che PII

### 4.1 Collector

- Dùng **Filebeat** (hoặc Elastic Agent nếu phiên bản được chọn hỗ trợ Kafka output) với `output.kafka`.
  - `required_acks: -1` (tương đương `acks=all`).
  - Nén `lz4`.
  - TLS và SASL/SCRAM.
- **Disk queue** trên collector giữ event khi Kafka không sẵn sàng.
- Registry đảm bảo ngữ nghĩa *at-least-once*.
- Collector **không** thực hiện việc che dữ liệu. Có hai lý do:
  - để giữ bản gốc phục vụ chuỗi bằng chứng;
  - để quy tắc che được quản lý tập trung một chỗ.

### 4.2 Đệm: Kafka (ADR-1)

- Topic `audit-raw`:
  - 24 partition, RF = 3, `min.insync.replicas = 2`, retention 72 giờ.
  - ACL: collector chỉ có quyền *write*, archiver và Logstash chỉ có quyền *read*.
- Kafka cho phép:
  - **fan-out** tới 2 consumer độc lập (archive và index);
  - **replay** khi sửa quy tắc che;
  - hấp thụ đỉnh tải. Ví dụ: đỉnh 2× (40.000 eps) kéo dài 1 giờ tạo backlog 72 triệu event. Logstash có năng lực 28.000 eps, dư 8.000 eps so với tải nền, nên xả hết backlog trong ≈ 2,5 giờ.
- Logstash vẫn bật **persistent queue** (`queue.type: persisted`, 4 GB) để không mất batch khi Logstash khởi động lại giữa chừng.

### 4.3 Pipeline Logstash (minh họa, phải kiểm thử bằng bộ mẫu PII)

```ruby
input {
  kafka {
    bootstrap_servers => "${KAFKA_BOOTSTRAP}"
    topics            => ["audit-raw"]
    group_id          => "ls-index"
    codec             => plain { charset => "UTF-8" }
    decorate_events   => "basic"
    security_protocol => "SASL_SSL"
    sasl_mechanism    => "SCRAM-SHA-512"
    sasl_jaas_config  => "${KAFKA_JAAS}"
  }
}

filter {
  # (1) Băm bản GỐC trước mọi biến đổi; dùng chung thuật toán với raw archiver
  fingerprint { source => "message" target => "[integrity][raw_sha256]" method => "SHA256" }
  mutate {
    copy => {
      "[@metadata][kafka][partition]" => "[integrity][kafka_partition]"
      "[@metadata][kafka][offset]"    => "[integrity][kafka_offset]"
    }
  }

  # (2) Parse; lỗi parse => _mask_error (fail-closed)
  json { source => "message" tag_on_failure => ["_mask_error"] }

  # (3) Trường đã biết: pseudonym HMAC-SHA256 có khóa (correlate được, không đảo ngược nếu không có khóa)
  fingerprint { source => "[user][name]"  target => "[user][name]"  method => "SHA256" key => "${MASK_KEY_V1}" }
  fingerprint { source => "[user][email]" target => "[user][email]" method => "SHA256" key => "${MASK_KEY_V1}" }
  fingerprint { source => "[user][phone]" target => "[user][phone]" method => "SHA256" key => "${MASK_KEY_V1}" }
  mutate { add_field => { "[integrity][mask_key_id]" => "v1" } }

  # (4) Nội dung tự do và TÊN trường: redact bằng regex, rồi kiểm tra PII còn sót
  ruby {
    path => "/etc/logstash/ruby/mask_walk.rb"   # duyệt đệ quy toàn bộ event
    # - tên trường khớp regex e-mail/điện thoại → đổi tên thành "redacted_key_<hmac8>"
    # - giá trị chuỗi ở trường free-text (message, *.description, url.query, ...) → gsub:
    #     e-mail       /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/       → "[EMAIL]"
    #     điện thoại   /(?<!\d)(\+?\d{1,3}[\s.-]?)?(\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}(?!\d)/ → "[PHONE]"
    #     username     các mẫu đã biết: user=, login=, "for user X", uid=   → "[USER]"
    # - quét lại toàn bộ chuỗi; còn khớp regex → tag "_mask_residual"
    # - mọi exception → tag "_mask_error"
  }

  # (5) Gỡ bản gốc khỏi document index (gồm event.original do một số integration tự thêm)
  mutate { remove_field => ["message", "[event][original]"] }

  # (6) Băm bản ĐÃ CHE (serialize canonical, sắp xếp khóa) để phát hiện sửa đổi trong ES
  fingerprint {
    concatenate_all_fields => true
    target => "[integrity][masked_sha256]"
    method => "SHA256"
  }
}

output {
  if "_mask_error" in [tags] or "_mask_residual" in [tags] {
    # FAIL-CLOSED: không index; đẩy sang topic cách ly (ACL chặt, retention 14 ngày) + metric cảnh báo
    kafka { topic_id => "audit-quarantine" bootstrap_servers => "${KAFKA_BOOTSTRAP}" security_protocol => "SASL_SSL" }
  } else {
    elasticsearch {
      hosts       => ["${ES_HOSTS}"]
      index       => "audit-events"
      action      => "create"
      document_id => "%{[integrity][raw_sha256]}"   # chống trùng khi at-least-once
      api_key     => "${ES_WRITER_API_KEY}"          # role chỉ có create_doc
      ssl_enabled => true
      ssl_certificate_authorities => ["/etc/logstash/certs/ca.crt"]
    }
  }
}
```

**Nguyên tắc che dữ liệu:**

- **Trường có cấu trúc** (username, e-mail, điện thoại) được thay bằng **HMAC-SHA256 có khóa**. Analyst vẫn tương quan được hành vi của cùng một người mà không thấy giá trị thật.
  - Khóa nằm trong Logstash keystore và được nạp từ KMS. Khóa có phiên bản (`mask_key_id`) và xoay vòng hằng năm. Khóa cũ phải được giữ lại để xác minh (§5.3).
  - Việc tái định danh chỉ được làm qua quy trình pháp chế, với hai người cùng phê duyệt.
  - Dữ liệu đã pseudonym hóa **vẫn là dữ liệu cá nhân** về mặt pháp lý (cần pháp chế xác nhận).
- **Nội dung tự do** được **redact** hẳn bằng nhãn `[EMAIL]`, `[PHONE]`, `[USER]`. Lý do: regex không đủ tin cậy để pseudonym hóa chính xác, nên chọn cách an toàn hơn.
- **Tên trường** chứa PII (ví dụ JSON có khóa là địa chỉ e-mail) được đổi tên. Ngoài ra, `dynamic: strict` chặn mọi trường chưa khai báo.
- **Khi che thất bại:**
  - Event **không bao giờ** được index và được đưa vào `audit-quarantine`.
  - Bản gốc vẫn an toàn trong raw archive, nên **không mất bằng chứng**.
  - Có cảnh báo khi tỷ lệ quarantine vượt 0,01 %.
  - Sau khi sửa quy tắc, event được replay từ quarantine.
- **DLQ của Logstash** chỉ bắt lỗi 400/404 từ Elasticsearch (ví dụ vi phạm mapping strict). Khi đó event đã được che xong.
- **Kiểm thử:** bộ mẫu PII tổng hợp (không dùng dữ liệu thật) chạy trong CI cho mỗi lần đổi quy tắc. Tiêu chí: tỷ lệ lọt (false negative) = 0 trên bộ mẫu.

### 4.4 Raw archiver và sealer (nhánh bằng chứng)

- Đọc `audit-raw` theo thứ tự trong từng partition và ghi **segment 5 phút cho mỗi partition** dưới dạng NDJSON, nén zstd.
- Mỗi event được băm SHA-256 trên **đúng byte value của bản ghi Kafka**, cùng thuật toán với `integrity.raw_sha256` phía Logstash.
- Mỗi segment có một **manifest** gồm:
  - partition, offset đầu/cuối, số event, `merkle_root` của các hash event, `sha256(file)`;
  - `prev_chain_hash` và `chain_hash = SHA256(prev_chain_hash ‖ manifest_canonical)`.
- Manifest được **ký** bằng khóa không xuất được, đặt trong HSM/KMS, thuật toán Ed25519 hoặc ECDSA P-256.
- Định kỳ neo chuỗi ra ngoài (§5):
  - **mỗi giờ:** lấy timestamp **RFC 3161** từ TSA độc lập cho các *chain head*;
  - **mỗi ngày:** gửi bản tóm tắt chain head cho bên thứ ba, ví dụ bộ phận pháp chế hoặc bucket ở tài khoản khác do đơn vị độc lập quản lý.

---

## 5. Toàn vẹn và bằng chứng pháp lý

### 5.1 Nguyên tắc

1. **Bản thân Elasticsearch không chống sửa đổi.** Người có quyền admin có thể xóa index, reindex hoặc update document, và restore một snapshot đã chỉnh sửa. Vì vậy ES chỉ là **lớp tìm kiếm**, không phải nơi giữ bằng chứng.
2. **Bằng chứng gốc là raw archive.** Bản này có hash chain và chữ ký, được neo thời gian ra ngoài và nằm trên WORM.
3. Hash được tính trên **dữ liệu gốc trước khi che** (`raw_sha256`). Ngoài ra có thêm hash của bản đã che (`masked_sha256`), để chứng minh document trong ES được **dẫn xuất xác định** từ bản gốc.

### 5.2 Các lớp kiểm soát

| Lớp | Biện pháp |
|---|---|
| Phát hiện sửa đổi | Hash từng event, Merkle root theo segment, hash chain theo partition, chữ ký HSM/KMS, timestamp RFC 3161 và chain head gửi bên thứ ba |
| Ngăn sửa hoặc xóa | Bucket `raw-archive` bật **Object Lock COMPLIANCE**, retention 12 tháng (đề xuất 13 tháng để dư), có hỗ trợ legal hold. Repo snapshot `audit-archive` bật Object Lock 366 ngày. Bucket thuộc **tài khoản riêng**, quản trị viên ES không có quyền vào |
| Append-only trong ES | Role `audit_writer` chỉ có quyền `create_doc` trên `audit-events*`, không có `index`, `delete` hay `manage`. Analyst có role `read` và `view_index_metadata`. Tài khoản superuser là break-glass, phải có 2 người cùng thao tác. Giữ `action.destructive_requires_name: true` |
| Mã hóa đường truyền | TLS cho mọi chặng: Beats→Kafka, Kafka→Logstash, Logstash→ES, transport ES, Kibana. Security của Basic hỗ trợ TLS và RBAC |
| Mã hóa lưu trữ | ES không có mã hóa at-rest gốc, nên dùng mã hóa đĩa (LUKS/dm-crypt). Object storage dùng SSE-KMS. Kafka dùng mã hóa đĩa |
| Thời gian | chrony/NTP trên mọi host, dùng ≥ 3 nguồn. Cảnh báo khi lệch > 100 ms. Lưu cả `event.created` (nguồn) và `event.ingested` (ingest). TSA cung cấp mốc thời gian độc lập |
| Truy vết truy cập | Basic **không có** audit log của ES, nên mọi truy cập ES/Kibana phải đi qua **reverse proxy ghi log** (người dùng, truy vấn, thời điểm). Log này đẩy vào chính raw archive |

### 5.3 Job xác minh định kỳ

- **Hằng ngày:**
  - Tính lại `sha256(file)`, Merkle root, chuỗi `chain_hash`.
  - Xác minh chữ ký và token TSA của các segment trong 24 giờ qua.
  - Kiểm tra liên tục offset (không có khoảng trống) cho mọi partition.
- **Hằng ngày (lấy mẫu):**
  - Chọn ngẫu nhiên N document trong ES, lấy bản gốc theo `kafka_partition/offset` từ archive.
  - So `sha256(raw)` với `raw_sha256`.
  - Chạy lại quy trình che với khóa `mask_key_id` trên bản gốc, so kết quả với `masked_sha256`.
- **Hằng tuần:** `POST _snapshot/<repo>/_verify`, đồng thời restore thử 1 ngày dữ liệu ngẫu nhiên và đối chiếu số document với manifest.
- **Hằng tháng:** chạy toàn bộ chuỗi một năm (chỉ đọc manifest).
- **Báo cáo:** kết quả được ghi vào raw archive, lỗi thì gửi cảnh báo.

### 5.4 Bản raw gốc chứa PII: lưu ở đâu và bảo vệ thế nào

- **Nơi lưu:** chỉ ở hai chỗ:
  - Kafka, 72 giờ;
  - bucket `raw-archive` (Object Lock COMPLIANCE, SSE-KMS với khóa riêng).
- **Truy cập:**
  - Không ai có quyền đọc thường trực.
  - Khi cần, quy trình là: yêu cầu pháp lý → hai người cùng phê duyệt → cấp quyền tạm qua IAM, có thời hạn → mọi lệnh GET được ghi log.
- **Xóa:** hết hạn retention thì lifecycle rule xóa. Legal hold có thể giữ lâu hơn cho từng vụ việc.
- **Xung đột cần pháp chế quyết định:**
  - Object Lock COMPLIANCE **không cho xóa sớm**, kể cả khi chủ thể dữ liệu yêu cầu xóa (xem R-04).
  - Nếu khách **không** cho phép giữ bản raw có PII, xem phương án ở §7, mục C2.

---

## 6. ILM và SLM (chỉ dùng tính năng có trong Basic)

Mọi action dùng ở đây đều có trong Basic: rollover, readonly, shrink, forcemerge, migrate/allocate theo tier, wait_for_snapshot, delete, SLM. **Không dùng** action `searchable_snapshot` và pha `frozen`, vì cả hai cần Enterprise.

### 6.1 ILM cho dữ liệu đang ghi

```json
PUT _ilm/policy/audit-events-ilm
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_primary_shard_size": "25gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "readonly": {},
          "shrink": { "number_of_shards": 3 },
          "forcemerge": { "max_num_segments": 1 },
          "allocate": { "number_of_replicas": 1 },
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

- Pha warm tự động *migrate* sang `data_warm`.
- `min_age` tính từ lúc rollover. Event cũ nhất trong một index lớn hơn tuổi index tối đa ≈ 4,3 giờ, nên mọi event được giữ **≥ 30 ngày** trong ES.
- `wait_for_snapshot` bảo đảm index chỉ bị xóa khỏi cluster sau khi đã có trong snapshot archive.

### 6.2 ILM cho index restore

```json
PUT _ilm/policy/audit-restored-ilm
{ "policy": { "phases": {
    "warm":   { "min_age": "0ms", "actions": { "readonly": {} } },
    "delete": { "min_age": "14d", "actions": { "delete": {} } }
} } }
```

Policy này dùng cùng `index.lifecycle.origination_date` = thời điểm restore (§3.5), để không bị xóa ngay do ngày tạo gốc đã cũ.

### 6.3 SLM: hai repository, hai policy

```json
PUT _snapshot/audit-archive
{ "type": "s3", "settings": { "bucket": "<bucket-archive>", "client": "archive", "compress": true,
  "max_restore_bytes_per_sec": "0", "max_snapshot_bytes_per_sec": "500mb" } }

PUT _slm/policy/audit-archive-nightly
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-archive-{now/d}>",
  "repository": "audit-archive",
  "config": { "indices": ["shrink-*audit-events-*"], "include_global_state": false },
  "retention": { "expire_after": "366d", "min_count": 30, "max_count": 500 }
}

PUT _slm/policy/audit-ops-nightly
{
  "schedule": "0 0 2 * * ?",
  "name": "<audit-ops-{now/d}>",
  "repository": "audit-ops",
  "config": { "indices": ["audit-events*"], "include_global_state": true },
  "retention": { "expire_after": "35d", "min_count": 7, "max_count": 60 }
}
```

**Policy `audit-archive-nightly`:**
- Chỉ snapshot các index **đã shrink và forcemerge** (bất biến). Mỗi segment vì vậy chỉ upload một lần, tránh nhân đôi dung lượng trong 12 tháng.
- Tiền tố `shrink-` là cách ILM đặt tên index sau khi shrink. Cần **xác nhận mẫu tên theo phiên bản cụ thể khi PoC**.
- Với `expire_after: 366d`: event của ngày *d* nằm trong các snapshot từ *d+7* đến *d+30*. Snapshot cuối hết hạn vào *d+396*. Như vậy mọi event có trong kho **≥ 12 tháng** và tối đa ≈ 13 tháng.
- Nếu khách cần cắt cứng đúng 12 tháng (nguyên tắc tối thiểu hóa dữ liệu), giảm `expire_after` xuống 335d. Khi đó event ngày *d* vẫn còn đến *d+365*.

**Policy `audit-ops-nightly`:**
- Dùng cho khôi phục vận hành, bao phủ cả dữ liệu hot và cấu hình cluster.
- Ghi vào repo riêng có lock ngắn. Overhead của repo này được tính trong A-06.

**Object Lock và S3 repository:**
- Bucket có Object Lock bắt buộc bật versioning. Khi ES xóa hoặc ghi đè blob metadata, bucket chỉ tạo phiên bản hoặc delete marker mới; bản bị khóa vẫn còn đến hết hạn.
- Cấu hình này **phải được kiểm chứng** bằng repository analysis API (`POST _snapshot/<repo>/_analyze`) và thử nghiệm xóa snapshot trong PoC. Elastic yêu cầu repository hoàn toàn tương thích S3. Đây là rủi ro R-07.
- Lifecycle rule dọn các phiên bản không còn hiện hành (noncurrent version) sau khi hết lock.

---

## 7. Rủi ro và xung đột trong đầu vào

### 7.1 Xung đột

| # | Xung đột | Mức | Phân tích | Đề xuất |
|---|---|---|---|---|
| **C1** | **Khách gợi ý "searchable snapshots cho cold/frozen"** nhưng chỉ có **giấy phép Basic** | **Cao** | Searchable snapshots (dùng cho cold tier dạng *fully mounted* và frozen tier dạng *partially mounted*) là tính năng **Enterprise**. Action ILM `searchable_snapshot` và pha frozen vì vậy **không dùng được** trên Basic. Gợi ý này mâu thuẫn trực tiếp với ràng buộc ngân sách. Nguồn: bảng so sánh Elastic subscriptions, https://www.elastic.co/subscriptions, và tài liệu https://www.elastic.co/guide/en/elasticsearch/reference/current/searchable-snapshots.html. **[CHƯA KIỂM CHỨNG trong phiên này:** môi trường làm việc không cho truy cập mạng, nên kết luận dựa trên hiểu biết về ma trận giấy phép. Cần mở hai URL trên để xác nhận trước khi gửi khách.] | **Thay thế (đã chọn):** snapshot thường qua SLM lên object storage, khi có yêu cầu thì restore vào restore pool trên node warm. Cách này đạt 30 ngày dữ liệu trong ≈ 6,6 giờ, < 24 giờ (§3.5). Nếu khách mua Enterprise, có thể chuyển sang frozen tier và bỏ restore pool. Cần so chi phí giấy phép với phần cứng warm |
| **C2** | **Che PII trước khi index** và **bằng chứng nguyên vẹn** | **Cao** | Bản đã che không còn là bản gốc. Chỉ bằng hash của bản đã che thì không chứng minh được nội dung gốc | **Chính sách đề xuất (P1):** giữ bản gốc trong raw archive WORM có kiểm soát truy cập chặt (§5.4). Bằng chứng = bản gốc + chuỗi hash, còn ES chỉ phục vụ điều tra. **P2** (nếu pháp chế không cho giữ PII thô): che ngay ở collector, chỉ chứng minh toàn vẹn của **bản đã che**, chấp nhận mất khả năng chứng minh nội dung gốc. **P3:** mã hóa riêng từng trường PII trong archive (crypto-shredding), xóa khóa khi phải xóa dữ liệu. Phức tạp hơn nhưng giải quyết được C4. Khách và pháp chế **phải chọn** |
| **C3** | "Chứng minh không bị sửa" nhưng Basic **thiếu audit log của ES** và **thiếu field/document-level security** | Trung bình | Security audit logging và FLS/DLS **không có trong Basic** (thuộc các bậc trả phí). Nguồn: https://www.elastic.co/subscriptions **[CHƯA KIỂM CHỨNG trong phiên này, cần xác nhận bậc cụ thể]**. Không biết ai đã truy vấn hay xóa gì. Không giấu được trường theo vai trò | Reverse proxy ghi log truy cập. Bằng chứng nằm ngoài ES (§5). PII bị che hẳn trước khi index, nên không cần FLS. Tách index theo nhóm quyền nếu cần |
| **C4** | Lưu 12 tháng trên WORM COMPLIANCE và quyền xóa dữ liệu cá nhân | Trung bình | Object Lock COMPLIANCE không cho xóa sớm | Pháp chế xác nhận cơ sở pháp lý để giữ (nghĩa vụ lưu bằng chứng), hoặc chọn P3 |
| **C5** | "Searchable trong 24 giờ" và khối lượng 11 tháng (≈ 463 TB raw, 277,86 TB primary) | Trung bình | Restore toàn bộ mất ≈ 73,5 giờ và không vừa restore pool. Ở throttle mặc định, chỉ 30 ngày cũng mất ≈ 24,7 giờ | SLA ghi rõ "≤ 30 ngày dữ liệu cho mỗi yêu cầu trong 24 giờ". Nâng throttle. Phạm vi lớn hơn thì mở rộng pool tạm thời |
| **C6** | Alerting trên Basic | Thấp | **Watcher không có trong Basic.** Kibana alerting rules có trong Basic nhưng chỉ có các connector cơ bản (Index, Server log) **[CHƯA KIỂM CHỨNG trong phiên này]** | Dùng Prometheus + Alertmanager (elasticsearch-exporter, kafka-exporter, Logstash monitoring API) cho cảnh báo vận hành và cảnh báo toàn vẹn. Stack Monitoring của Basic dùng để quan sát |

### 7.2 Rủi ro vận hành

| # | Rủi ro | Hệ quả | Giảm thiểu |
|---|---|---|---|
| R-01 | Tải đỉnh vượt 20.000 eps (A-07) | Dữ liệu trên ES trễ, đầy Kafka | Kafka 72 giờ, đỉnh 2× xả hết trong ≈ 2,5 giờ. Logstash N+1. Cảnh báo consumer lag > 5 phút |
| R-02 | Collector hoặc host nguồn lỗi | Mất event chưa gửi | Disk queue của Filebeat, `acks=all`, giám sát heartbeat từng nguồn. Hash chain phát hiện **khoảng trống offset** sau Kafka, nhưng **không** phát hiện được mất mát trước Kafka. Cần nguồn có sequence number (câu hỏi Q7) |
| R-03 | Lệch đồng hồ | Sai thứ tự thời gian, yếu về pháp lý | chrony, cảnh báo lệch, TSA độc lập |
| R-04 | PII lọt qua regex | Vi phạm R6 | Fail-closed, `dynamic: strict`, bộ test PII, quét hằng tuần trên ES bằng regex để phát hiện lọt |
| R-05 | Hệ số nén sai (A-01) | Thiếu đĩa | PoC. Với k = 0,7 cần 8 node warm. Theo dõi dung lượng mỗi tuần |
| R-06 | Mất hoặc lộ khóa HMAC, khóa ký | Không xác minh được, hoặc tái định danh được | Lưu khóa trong HSM/KMS, có backup escrow, xoay vòng có phiên bản, hai người cùng truy cập |
| R-07 | ES S3 repository chạy chưa ổn với Object Lock/versioning | Lỗi SLM, phình dung lượng | Chạy `_analyze` trong PoC. Phương án dự phòng: repo không lock, rồi sao chép sang bucket WORM bằng tính năng replication của object storage |
| R-08 | Byte value Kafka không phải UTF-8 hợp lệ | `raw_sha256` phía Logstash lệch với archiver | Chuẩn hóa ở collector, job xác minh lấy mẫu phát hiện lệch |
| R-09 | Chi phí: ≈ 1.123 TB object storage (2 site) và 29 máy chủ (13 data, 3 master, 2 coordinating, 4 Logstash, 3 Kafka, 2 archiver, 2 Kibana) | Vượt ngân sách hạ tầng | Một site cho snapshot ops, cân nhắc giữ 1 bản sao cho kho snapshot (vì bằng chứng gốc nằm ở raw archive). So sánh với giá Enterprise (C1). **Chưa có báo giá, không ước lượng tiền** |
| R-10 | Trùng event do at-least-once | Đếm sai | `_id` = `raw_sha256` với `create`. Trùng nằm khác backing index vẫn có thể còn: xử lý khi truy vấn hoặc chấp nhận, ghi trong quy trình |

---

## 8. ADR

**ADR-1: Dùng Kafka làm đệm và fan-out.**
- **Bối cảnh:** tải 16 MB/s, cần hai đích độc lập (archive và index) và khả năng replay.
- **Quyết định:** dùng Kafka 3 broker.
- **Phương án bị loại:** chỉ dùng persistent queue của Logstash. Lý do loại: không fan-out an toàn, không replay sau khi sửa quy tắc che, PQ gắn với từng node.
- **Đánh đổi:** thêm một hệ thống phải vận hành.
- **Hệ quả:** Kafka giữ PII trong 72 giờ, phải bật ACL và mã hóa.

**ADR-2: Dữ liệu ngoài 30 ngày nằm ở snapshot và restore theo yêu cầu.**
- **Quyết định:** dùng snapshot thường kết hợp restore pool.
- **Phương án bị loại:**
  - (A) Giữ warm online 11 tháng: cần 817,24 TB đĩa cấp phát, khoảng 52 node 16 TB, tốn kém dù không mất phí giấy phép.
  - (B) Searchable snapshots: cần Enterprise, vi phạm R7.
- **Đánh đổi:** truy vấn dữ liệu cũ có độ trễ hàng giờ, và phạm vi mỗi lần bị giới hạn.
- **Hệ quả:** cần catalog, runbook restore và throttle phù hợp.

**ADR-3: Che PII bằng HMAC cho trường có cấu trúc và redact cho văn bản tự do, theo kiểu fail-closed.**
- **Phương án bị loại:**
  - Redact toàn bộ: mất khả năng tương quan.
  - Mã hóa thuận nghịch trong ES: khóa phải nằm gần ES, rủi ro lộ cao.
- **Hệ quả:** phải quản lý khóa có phiên bản. Quarantine cần có người xử lý.

**ADR-4: Bằng chứng nằm ngoài ES (raw WORM, hash chain, chữ ký, TSA).**
- **Phương án bị loại:** chỉ dựa vào snapshot ES trên WORM. Lý do loại: snapshot là bản đã che và đã qua biến đổi, có thể bị sửa trước khi chụp, và không có chuỗi chứng minh.
- **Hệ quả:** phải giữ PII thô, cần quyết định C2.

**ADR-5: Tách hot 7 ngày (NVMe) và warm 23 ngày.**
- **Phương án bị loại:** giữ hot 30 ngày toàn NVMe, cần 73,19 TB NVMe.
- **Đánh đổi:** truy vấn trên dữ liệu 8–30 ngày chậm hơn.
- **Hệ quả:** shrink/forcemerge tại thời điểm chuyển sang warm, và index chỉ snapshot sau khi đã bất biến.

---

## 9. Bảng truy vết yêu cầu → thiết kế

| Yêu cầu | Thiết kế | Mục |
|---|---|---|
| R1: 20.000 eps × 800 B, 24/7 | Kafka, 4 Logstash (N+1), 6 node hot, sizing 16 MB/s | §2.1, §3.2, §4.2 |
| R2: Lưu 12 tháng | SLM archive `expire_after 366d`, raw archive Object Lock 12–13 tháng | §6.3, §5.2 |
| R3: 30 ngày tương tác | hot 7 ngày + warm 23 ngày, ILM xóa ở 30 ngày | §2.4, §6.1 |
| R4: Dữ liệu cũ trong 24 giờ | Restore theo yêu cầu vào restore pool, ≈ 6,6 giờ cho 30 ngày, SLA có giới hạn phạm vi | §3.5, C5 |
| R5: Chứng minh không bị sửa | Raw WORM, hash chain, chữ ký, RFC 3161, job xác minh, role `create_doc` | §4.4, §5 |
| R6: Che PII trước khi index | Logstash HMAC/redact, fail-closed, quarantine, `dynamic: strict` | §4.3 |
| R7: Chỉ Basic | Chỉ dùng ILM/SLM/TLS/RBAC có trong Basic. Kafka, proxy, Prometheus là phần mềm ngoài Elastic | §6, C1, C3, C6 |
| R8: Searchable snapshots | **Không dùng được trên Basic.** Thay bằng snapshot + restore | C1, ADR-2 |

---

## 10. Câu hỏi mở cho khách (kèm đề xuất)

| # | Câu hỏi | Đề xuất của kiến trúc sư |
|---|---|---|
| Q1 | Có cho phép giữ bản raw chưa che (chứa PII) trong kho WORM có kiểm soát truy cập không? | Có (P1). Nếu không, chọn P3 (crypto-shredding) thay vì P2 |
| Q2 | Chấp nhận Basic với restore theo yêu cầu, hay cân nhắc mua Enterprise để dùng frozen tier? | Giữ Basic. Đánh giá lại sau 6 tháng vận hành dựa trên tần suất yêu cầu dữ liệu cũ |
| Q3 | SLA 24 giờ áp dụng cho phạm vi bao nhiêu? | ≤ 30 ngày dữ liệu mỗi yêu cầu. Phạm vi lớn hơn thì 3–4 ngày, có mở rộng tạm thời |
| Q4 | Tải đỉnh và tăng trưởng hằng năm là bao nhiêu? | Cung cấp số liệu p99 eps. Headroom 25 % hiện tại chỉ đủ cho khoảng 1 năm tăng trưởng vừa phải |
| Q5 | Retention 12 tháng là mức **tối thiểu** hay **tối đa**? | Hiểu là tối thiểu, xóa ở khoảng 13 tháng. Nếu là tối đa, dùng `expire_after 335d` |
| Q6 | Có cần giữ domain e-mail (ví dụ `eml_<hmac>@example.org`) để phân tích không? | Không giữ, trừ khi có nhu cầu nghiệp vụ rõ ràng |
| Q7 | Nguồn log có sequence number hoặc khả năng tự ký không? | Nếu có thì đưa vào hash chain để phát hiện mất mát trước Kafka |
| Q8 | Có TSA và HSM/KMS sẵn không? Có bên thứ ba nào nhận chain head? | Dùng TSA tuân RFC 3161 được pháp luật nơi xét xử công nhận. Pháp chế xác nhận |
| Q9 | Pháp quyền và loại hệ thống (có phải HTTT của cơ quan nhà nước không)? | Cần để xác định cấp độ ATTT và yêu cầu lưu nhật ký tương ứng |
| Q10 | Có hạ tầng object storage 2 site hỗ trợ Object Lock không? | Bắt buộc với kho raw. Kho snapshot có thể chỉ cần 1 site |

---

## 11. Kế hoạch PoC (để đóng các giả định)

1. **Đo k (A-01):** dùng 1–3 ngày log mẫu đã che, đo trước và sau forcemerge.
2. **Benchmark Logstash (A-04):** thử cả với bộ test PII.
3. **Restore 1 ngày và 7 ngày** từ object storage (A-05), cho từng mức `indices.recovery.max_bytes_per_sec`.
4. **Repository với Object Lock:** chạy `_analyze`, xóa snapshot, kiểm tra noncurrent version (R-07).
5. **Xác minh end-to-end:** sửa 1 byte trong archive và trong ES, job xác minh phải phát hiện cả hai.

Lệnh kiểm tra tài liệu này: `test -s DESIGN.md && grep -n 'searchable snapshot' DESIGN.md`
