# DESIGN — Nền tảng audit log trên Elastic Stack (license Basic)

> Phiên bản: 1.0 (đề xuất) · Ngày: 2026-11-03 · Phân loại tài liệu: **internal**
> Phạm vi: kiến trúc, sizing, ingest pipeline, ILM/SLM, bảo đảm toàn vẹn, rủi ro.
> Quy ước số: dấu phẩy là dấu thập phân, dấu chấm phân cách hàng nghìn. **TB/GB/MB là đơn vị thập phân** (10^12, 10^9, 10^6 byte). Giá trị TiB ghi trong ngoặc khi cần.
> Mọi con số không có trong đầu vào của khách đều là **giả định**, được đánh số `A-xx` ở mục 2.2 và cần đo lại trong PoC (mục 13).

---

## 0. Tóm tắt điều hành

- **Khối lượng thô:** 20.000 EPS × 800 B = 16 MB/s ≈ **1,38 TB/ngày** (1,26 TiB) ≈ **504,6 TB/năm** (≈ 504 TB; 458,9 TiB).
- **Kiến trúc:** Collector → Kafka (đệm 72 giờ) → (a) *Evidence Sealer* ký và lưu bản gốc mã hóa vào kho WORM, (b) Logstash mask PII bằng HMAC → Elasticsearch với hot (0–7 ngày, NVMe) và warm (8–30 ngày). Dữ liệu 31 ngày–12 tháng chỉ nằm trong **snapshot repository** trên object storage và được **restore theo yêu cầu** vào nhóm node *restore* trong SLA 24 giờ.
- **Sizing (giả định on-disk/raw = 0,7):** hot 13,55 TB, warm 44,51 TB (đã gồm 1 replica). Snapshot archive khoảng 353 TB, kho bằng chứng khoảng 76 TB. Cluster gồm 3 master, 8 hot, 7 warm, 4 restore, 2 coordinating, cùng 4 Logstash và 3 Kafka.
- **Mâu thuẫn lớn nhất:** khách đề xuất *searchable snapshots* cho cold/frozen, nhưng tính năng này **cần license Enterprise**, không có trong Basic. Tài liệu thay bằng snapshot/restore thường (ADR-01). Mâu thuẫn thứ hai là **mask trước khi index** làm dữ liệu trong ES không còn là bản gốc. Vì vậy giá trị chứng cứ được đặt ở kho bằng chứng tách biệt (hash, chữ ký và timestamp RFC 3161 trên bản gốc), không đặt ở ES (ADR-02).

---

## 1. Đầu vào của khách

| # | Yêu cầu | Diễn giải |
|---|---|---|
| R1 | 20.000 EPS liên tục, 24/7, mỗi event trung bình 800 B (raw) | Tải nền. Đỉnh (peak) không được nêu, xem A-01 |
| R2 | Lưu 12 tháng | Thời hạn lưu tối thiểu, tính từ thời điểm event |
| R3 | 30 ngày gần nhất tìm kiếm tương tác | Dữ liệu nằm trên hot/warm, truy vấn ngay trong Kibana |
| R4 | Dữ liệu cũ hơn 30 ngày tìm được trong vòng 24 giờ sau khi có yêu cầu | Restore theo yêu cầu (mục 8) |
| R5 | Log là chứng cứ pháp lý, phải chứng minh được không bị sửa | Mục 9 |
| R6 | Username, e-mail, số điện thoại phải mask trước khi index | Mục 6 |
| R7 | Chỉ dùng Elastic **Basic (free)** | Ràng buộc chi phí, mục 3 |
| R8 | Gợi ý: dùng searchable snapshots cho cold/frozen | **Không khả thi với R7**, mục 11 (C-01) |

---

## 2. Bối cảnh, NFR và giả định

### 2.1 NFR

| Nhóm | Mục tiêu đề xuất | Nguồn |
|---|---|---|
| Throughput ingest | Bền vững 20.000 EPS; chịu được đỉnh 2× (40.000 EPS) trong tối đa 1 giờ mà không mất dữ liệu | R1 + A-01 |
| Độ trễ ingest (event đến lúc tìm được) | p95 ≤ 60 giây ở tải bền vững | Giả định A-02 |
| Truy vấn tương tác (30 ngày) | p95 ≤ 10 giây cho truy vấn lọc theo thời gian/user/action trong phạm vi 24 giờ; ≤ 60 giây cho phạm vi 30 ngày | Giả định A-03, khách cần xác nhận |
| Truy vấn dữ liệu cũ | Dữ liệu sẵn sàng tìm trong ≤ 24 giờ, với phạm vi ≤ 30 ngày dữ liệu mỗi yêu cầu | R4 + A-10 |
| RPO | 0 với event đã vào Kafka (có kho bằng chứng và Kafka giữ 72 giờ); ≤ 30 phút với trạng thái index (khôi phục từ snapshot DR) | Thiết kế |
| RTO (mất cả cluster) | ≤ 24 giờ để tìm lại được 30 ngày gần nhất | Thiết kế, cần diễn tập |
| Toàn vẹn | Mỗi event chứng minh được qua hash, Merkle root, chữ ký, token RFC 3161 và bản gốc trong WORM | R5 |
| Bảo vệ dữ liệu cá nhân | Không có PII dạng rõ trong ES/Kibana, snapshot hoặc DLQ index | R6 |
| License | Elastic Basic | R7 |

### 2.2 Giả định được đặt tên (cần xác nhận hoặc đo trong PoC)

| ID | Giả định | Ảnh hưởng nếu sai |
|---|---|---|
| A-01 | Đỉnh = 2 × tải bền vững (40.000 EPS), kéo dài ≤ 1 giờ | Thiếu Logstash/hot CPU, Kafka lag tăng |
| A-02 | Độ trễ ingest p95 ≤ 60 giây là chấp nhận được (`refresh_interval` = 30s) | Muốn gần thời gian thực hơn thì tốn CPU hot hơn |
| A-03 | Mục tiêu latency truy vấn như bảng 2.1 | Warm có thể phải dùng SSD thay vì HDD |
| A-04 | **Tỷ lệ on-disk (primary) / raw = 0,5 (min) đến 0,7 (thiết kế)**, sau mapping chặt, `best_compression`, forcemerge và bỏ `event.original` khỏi index. Kịch bản bi quan là 1,0 | Toàn bộ sizing ES và snapshot |
| A-05 | Snapshot chiếm dung lượng xấp xỉ primary on-disk (snapshot chỉ chép segment primary, không chép replica) | Sizing object storage |
| A-06 | Nén bản gốc trong kho bằng chứng (zstd, theo lô) đạt tỷ lệ 0,15 (dải 0,10–0,20) | Sizing kho WORM |
| A-07 | Một hot node 16 vCPU index được ≥ 10.000 doc-op/s (event 800 B, đã parse sẵn ở Logstash) | Số hot node |
| A-08 | Một Logstash node 16 vCPU xử lý ≥ 10.000 EPS với pipeline mask (json, gsub, fingerprint HMAC, prune) | Số Logstash node |
| A-09 | Throughput restore từ object storage đạt ≥ 250 MB/s mỗi node restore (mạng ≥ 10 GbE, đã nâng throttle recovery) | SLA 24 giờ |
| A-10 | Một yêu cầu tra cứu dữ liệu cũ bao phủ ≤ 30 ngày dữ liệu | Dung lượng và thời gian restore |
| A-11 | Hạ tầng on-prem/private cloud có object storage S3-compatible hỗ trợ **Object Lock** (compliance và governance) | Thiết kế WORM |
| A-12 | Phiên bản Elastic Stack 8.x hoặc 9.x hiện hành, tự quản (self-managed) | Danh sách tính năng Basic (mục 3) |
| A-13 | Số điện thoại chủ yếu theo định dạng Việt Nam (0xxxxxxxxx / +84xxxxxxxxx) hoặc E.164 | Regex mask |
| A-14 | Nguồn log gửi JSON một dòng mỗi event và có trường cấu trúc `user.name`, `user.email`, `user.phone`; PII cũng có thể lẫn trong `message` dạng tự do | Pipeline mask |

### 2.3 Nhãn dữ liệu và cấp độ ATTT

- **Nhãn:** dữ liệu audit có chứa dữ liệu cá nhân (username, e-mail, số điện thoại), xếp mức **nhạy cảm/hạn chế**. Riêng tài liệu này được phân loại *internal*.
- **Cấp độ ATTT (NĐ 85/2016/NĐ-CP, TT 12/2022/TT-BTTTT):** **chưa xác định được**, vì không biết khách là cơ quan nhà nước hay doanh nghiệp, cũng không biết hệ thống nguồn thuộc cấp nào. *Giả định:* nền tảng log tập trung kế thừa cấp độ cao nhất trong các hệ thống nó thu log. Khách cần cung cấp hồ sơ phân loại HTTT. Thiết kế này đã có sẵn phân vùng mạng, mã hóa, RBAC, nhật ký và sao lưu, nên đáp ứng được cấp trung bình mà không phải đổi kiến trúc.
- **Pháp lý về dữ liệu cá nhân:** tại Việt Nam cần soát Luật Bảo vệ dữ liệu cá nhân 2025 và các văn bản hướng dẫn (trước đó là NĐ 13/2023/NĐ-CP). **[CHƯA KIỂM CHỨNG]**: hiệu lực và nghĩa vụ cụ thể phải do bộ phận pháp chế của khách xác nhận. Tài liệu này không đưa ra kết luận pháp lý.

---

## 3. Elastic Basic: có gì, không có gì

> **[CHƯA KIỂM CHỨNG theo phiên bản cụ thể]**: bảng dưới dựa trên hiểu biết về ma trận subscription của Elastic. Trước khi chốt phải đối chiếu với https://www.elastic.co/subscriptions cho đúng phiên bản sẽ triển khai.

| Tính năng | Basic? | Dùng trong thiết kế |
|---|---|---|
| ILM, data tiers (hot/warm/cold), rollover, shrink, forcemerge | Có | Có |
| Snapshot/restore, SLM, repository S3 | Có | Có (archive, DR) |
| Data streams, index templates, ingest pipelines | Có | Có |
| Security cơ bản: TLS, RBAC theo index/cluster privilege, native/file realm, API key | Có | Có |
| Kibana Spaces, Stack Monitoring (một cluster) | Có | Có |
| Transforms | Có (cần kiểm chứng) | Index tóm tắt `audit-summary` (mục 8.3) |
| **Searchable snapshots (cold mount / frozen tier)** | **Không, cần Enterprise** | **Không dùng** (ADR-01) |
| Field-/document-level security | Không (Platinum+) | Thay bằng tách index theo pattern |
| **Audit logging của Elasticsearch/Kibana** (ai truy cập, ai xóa) | **Không** (Platinum+) | Bù bằng kiểm soát ngoài (mục 9.5) |
| SSO: SAML/OIDC/LDAP/AD | Không (Platinum+) | Dùng native realm + chính sách mật khẩu; xem câu hỏi mở Q-07 |
| Watcher; connector alert e-mail/Slack/webhook | Không (Gold+); Basic chỉ có connector Index/Server log | Cảnh báo qua hệ thống ngoài (mục 12) |
| Cross-cluster replication | Không (Platinum+) | DR dựa trên snapshot |
| Machine learning | Không (Platinum+) | Không dùng |
| Synthetic `_source` / chế độ logsdb tiết kiệm dung lượng | Không, hoặc giới hạn (Enterprise) | Không dùng; giữ `_source` đầy đủ (cũng cần cho chứng cứ) |

---

## 4. Tính toán dung lượng

### 4.1 Khối lượng thô

```
Tốc độ  = 20.000 event/s × 800 B           = 16.000.000 B/s = 16 MB/s
Ngày    = 16 MB/s × 86.400 s               = 1.382.400.000.000 B ≈ 1,38 TB/ngày (≈ 1,26 TiB)
Năm     = 1,3824 TB × 365                  = 504,58 TB ≈ 504 TB/năm  (≈ 458,9 TiB)
Event   = 20.000 × 86.400                  = 1,728 tỷ event/ngày ≈ 630,7 tỷ event/năm
```

### 4.2 Giả định nén (A-04)

Hệ số **r = (dung lượng primary on-disk) / (raw)**:

- Yếu tố làm tăng r: inverted index, doc values, các trường bổ sung (`event.hash`, `evidence.*`, `*_hmac` 64 ký tự hex khó nén).
- Yếu tố làm giảm r: codec `best_compression` (DEFLATE) cho stored fields; `dynamic: strict` với `keyword` có `doc_values` chỉ ở trường cần thiết; không index `event.original`; forcemerge còn 1 segment.
- Dùng **r_min = 0,5** và **r_thiết kế = 0,7**, kèm kịch bản bi quan r = 1,0 để biết cần mở rộng đến đâu.
- **Đây là giả định, chưa đo.** PoC (mục 13) phải nạp ≥ 1 ngày dữ liệu mẫu đại diện, rồi đo `_cat/indices?bytes=b` sau forcemerge để chốt r.

Primary on-disk mỗi ngày:
```
r = 0,5 → 1,3824 × 0,5 = 0,691 TB/ngày
r = 0,7 → 1,3824 × 0,7 = 0,968 TB/ngày
r = 1,0 → 1,382 TB/ngày
```

### 4.3 Dung lượng theo tier

Hot = 7 ngày (0–7), warm = 23 ngày (8–30), tổng 30 ngày trên cluster. Replica = 1 nên dung lượng trên cluster bằng primary × 2. Snapshot chỉ lưu primary (A-05); object storage tự lo độ bền (erasure coding/replication) và không tính trong bảng.

| Tier | Số ngày | Raw (TB) | Primary r=0,5 | **Có replica r=0,5** | Primary r=0,7 | **Có replica r=0,7** | Có replica r=1,0 |
|---|---|---|---|---|---|---|---|
| Hot | 7 | 9,68 | 4,84 | **9,68** | 6,77 | **13,55** | 19,35 |
| Warm | 23 | 31,80 | 15,90 | **31,80** | 22,26 | **44,51** | 63,59 |
| **Cộng cluster (30 ngày)** | 30 | 41,47 | 20,74 | **41,47** | 29,03 | **58,06** | 82,94 |
| Chỉ có trong snapshot (31–365 ngày) | 335 | 463,10 | 231,55 | n/a (không replica) | 324,17 | n/a | 463,10 |
| **Archive repo, sizing 365 ngày** (¹) | 365 | 504,58 | 252,29 | n/a | **353,20** | n/a | 504,58 |
| DR repo (²) | ~30 + churn | n/a | ~26 | n/a | ~36 | n/a | ~52 |
| Kho bằng chứng (bản gốc nén, A-06 = 0,10 / **0,15** / 0,20) | 365 | 504,58 | n/a | n/a | 50,5 / **75,7** / 100,9 | n/a | n/a |

(¹) Index được snapshot vào archive ngay sau khi shrink (khoảng ngày 8) và giữ đến ngày 365. Object Lock làm object tồn tại thêm vài ngày sau khi hết hạn, nên sizing làm tròn lên đủ **365 ngày primary**.
(²) DR repo chứa snapshot 30 phút một lần của data stream (30 ngày), cộng phần segment hot bị chép lại trước khi forcemerge (khoảng 7 ngày primary): (30 + 7) × 0,968 ≈ 36 TB. Đây là ước lượng.

### 4.4 Headroom và dung lượng đĩa cần cấp

Công thức: **Disk cần = Data ÷ 0,85 (watermark high 85%) × 1,15 (dư 15% cho merge, shrink, tăng trưởng)**. Ngoài ra kiểm tra điều kiện **N−1**: mất 1 node thì phần còn lại vẫn chứa đủ dữ liệu dưới watermark.

| Tier | Data (r=0,7, có replica) | Disk cần | Cấp phát | Dung lượng dùng được (85%) | Tỷ lệ lấp đầy | Kiểm tra N−1 (85%) |
|---|---|---|---|---|---|---|
| Hot | 13,55 TB | 13,55 ÷ 0,85 × 1,15 = **18,33 TB** | 8 × 3,2 TB = 25,6 TB | 21,76 TB | 62% | 7 × 3,2 × 0,85 = 19,04 ≥ 13,55 ✓ |
| Warm | 44,51 TB | 44,51 ÷ 0,85 × 1,15 = **60,22 TB** | 7 × 12 TB = 84 TB | 71,4 TB | 62% | 6 × 12 × 0,85 = 61,2 ≥ 44,51 ✓ |
| Restore | ≤ 29,03 TB (30 ngày, 0 replica) | 29,03 ÷ 0,85 × 1,15 = 39,28 TB | 4 × 12 TB = 48 TB | 40,8 TB | 71% | n/a (dữ liệu tạm, restore lại được) |
| Object storage archive | 353,20 TB | × 1,15 = **406 TB** | ≥ 410 TB usable | n/a | n/a | n/a |
| Kho bằng chứng (WORM) | 75,7 TB (dải 50,5–100,9) | × 1,15 = **87 TB** (tối đa 116 TB) | ≥ 120 TB usable | n/a | n/a | n/a |

Kịch bản r = 0,5 thì hot cần 13,09 TB và warm 43,02 TB: cấu hình trên dư khoảng 40%. Kịch bản r = 1,0 thì hot cần 26,18 TB và warm 86,03 TB: phải tăng lên **9 hot × 3,2 TB** và **8 warm × 12 TB**. Đây là lý do bắt buộc chạy PoC trước khi mua phần cứng.

> Ghi chú đơn vị: ổ "3,2 TB" ≈ 2,91 TiB khi filesystem báo cáo. Watermark tính trên con số filesystem, mà các con số ở trên đều đã dùng TB thập phân nhất quán nên tỷ lệ không đổi.

### 4.5 Kiểm tra throughput hot

```
Doc-op/s trên cluster = 20.000 × 2 (primary + replica) = 40.000; đỉnh 2× = 80.000
Mỗi hot node (8 node)  = 5.000 doc-op/s bền vững; 10.000 lúc đỉnh  → bằng giới hạn A-07
Ghi đĩa                = 16 MB/s × 0,7 × 2 = 22,4 MB/s toàn cluster ≈ 2,8 MB/s/node (chưa tính merge 3–5×) → NVMe dư nhiều
```
CPU mới là giới hạn, đĩa thì không. Khi đỉnh vượt 2× thì Kafka hấp thụ phần dư (mục 5.3).

---

## 5. Kiến trúc và luồng dữ liệu

### 5.1 Sơ đồ

```
 Nguồn log (app, OS, DB, IAM)                   [PII rõ]
        │  JSON 1 dòng/event, TLS
        ▼
 ┌──────────────────────────┐
 │ Collector (Filebeat/Agent)│  • event.hash = SHA-256(raw line)  ← hash trên BẢN GỐC, trước mọi biến đổi
 │ + NTP/chrony              │  • collector.host, collector.seq (nếu nguồn có)
 └────────────┬─────────────┘
              │ TLS + SASL/mTLS, ACL theo topic
              ▼
 ┌──────────────────────────────────────────────┐
 │ Kafka 3 broker, topic audit-raw (24 partition)│  [PII rõ — vùng hạn chế, disk mã hóa, retention 72h]
 └───────┬───────────────────────────┬──────────┘
         │ consumer group A          │ consumer group B
         ▼                           ▼
 ┌──────────────────────┐   ┌─────────────────────────────────────────────┐
 │ Evidence Sealer ×2   │   │ Logstash ×4                                 │
 │ • lô 10s/partition   │   │ • parse JSON, prune whitelist               │
 │ • Merkle root + chain│   │ • HMAC-SHA256 user/email/phone (key từ KMS) │
 │ • ký (HSM/KMS)       │   │ • gsub regex PII trong message              │
 │ • TSA RFC 3161 /phút │   │ • xóa event.original; thêm evidence.ref     │
 │ • zstd + AES-GCM     │   │ • lỗi → topic audit-dlq (mã hóa, hạn chế)   │
 └──────────┬───────────┘   └───────────────────┬─────────────────────────┘
            ▼                                   │ HTTPS, API key create_doc
 ┌────────────────────────┐                     ▼
 │ KHO BẰNG CHỨNG (WORM)  │   ┌───────────────────────────────────────────────────────┐
 │ S3 Object Lock         │   │ Elasticsearch (Basic)          [CHỈ dữ liệu đã mask]   │
 │ COMPLIANCE 365 ngày    │   │ final_pipeline: lưới an toàn regex PII                 │
 │ bucket/tài khoản riêng │   │ master×3 │ hot×8 (0–7d) │ warm×7 (8–30d) │ restore×4  │
 │ + manifest, TSA token  │   │ coordinating×2 ── Kibana×2 (người dùng)                │
 └───────────┬────────────┘   └───────┬──────────────────────┬────────────────────────┘
             │ root hash/ngày          │ SLM 30 phút          │ SLM hằng ngày (index đã shrink)
             ▼                         ▼                      ▼
   Hệ thống độc lập (sổ          ┌───────────┐       ┌──────────────────────────────┐
   lưu root của legal/           │ dr-repo   │       │ archive-repo                  │
   ký quỹ bên thứ ba)            │ site khác │       │ Object Lock GOVERNANCE 365d   │
                                 └───────────┘       │ 31 ngày–12 tháng → restore khi│
                                                     │ có yêu cầu (≤24h) vào restore×4│
                                                     └──────────────────────────────┘
 Giám sát: Metricbeat/Agent → cluster monitoring riêng; job verify hằng ngày (mục 9.4)
```

**Chặng nhạy cảm:** từ nguồn qua Collector, Kafka `audit-raw`, Sealer đến kho bằng chứng, dữ liệu là PII dạng rõ. Từ đầu ra Logstash trở đi chỉ còn dữ liệu pseudonymized.

### 5.2 Layout node

| Thành phần | SL | vCPU | RAM (heap) | Disk | Tỷ lệ RAM:disk | Ghi chú |
|---|---|---|---|---|---|---|
| ES master (dedicated) | 3 | 4 | 16 GB (8 GB) | 200 GB SSD | n/a | Quorum 3, đặt ở 3 rack/AZ khác nhau |
| ES hot (`data_hot`, `data_content`) | 8 | 16 | 64 GB (31 GB) | 3,2 TB NVMe | 1:50 | Nhận ghi 20k EPS, giữ 0–7 ngày |
| ES warm (`data_warm`) | 7 | 8 | 64 GB (31 GB) | 12 TB (SATA SSD khuyến nghị; HDD nếu A-03 nới) | 1:188 | 8–30 ngày, chỉ đọc |
| ES restore (`data_cold`, attr `restore=true`) | 4 | 8 | 64 GB (31 GB) | 12 TB | 1:188 | Chỉ chứa index restore tạm thời. Có thể tắt hoặc thu về 2 node khi rảnh |
| ES coordinating-only | 2 | 8 | 32 GB (16 GB) | 200 GB SSD | n/a | Endpoint cho Kibana và người dùng |
| Kibana | 2 | 4 | 8 GB | 50 GB | n/a | Sau load balancer |
| Logstash | 4 | 16 | 16 GB (8 GB) | 250 GB SSD (PQ + DLQ) | n/a | N−1 = 30k EPS ≥ 20k (A-08) |
| Kafka broker (KRaft) | 3 | 8 | 32 GB | 4 TB NVMe | n/a | RF = 3, `min.insync.replicas` = 2 |
| Evidence Sealer | 2 | 4 | 8 GB | 100 GB | n/a | Active/active theo partition, ký qua HSM/KMS |
| Cluster monitoring riêng | 3 | 4 | 16 GB | 1 TB SSD | n/a | Tách khỏi cluster chính |

Tỷ lệ RAM:disk ở hot (1:50) và warm (khoảng 1:190) là *giả định vận hành*, áp dụng cho tải truy vấn thấp và vừa của audit log. Nếu PoC cho thấy latency vượt A-03 thì thêm node trước khi tăng disk.

**Kafka sizing:** 72 giờ × 1,3824 TB = 4,15 TB raw × RF 3 = 12,44 TB khi không nén, tức 4,15 TB/broker. Bật `compression.type=zstd` (giả định tỷ lệ 0,25) thì còn khoảng 1,04 TB/broker. Đặt `retention.ms` = 72 giờ và `retention.bytes` giới hạn ở 3,2 TB/broker để không tràn đĩa 4 TB khi nén kém. Khi đó retention thực tế co về khoảng 55 giờ, vẫn đủ dư để xử lý sự cố cuối tuần.

**24 partition:** chia đều cho 4 Logstash × 6 worker và 2 Sealer × 12. Partition key là `host.name` để giữ thứ tự theo nguồn.

### 5.3 Backpressure và đỉnh tải

- Kafka là bộ đệm chính. Khi ES chậm hoặc bảo trì, Logstash giảm tốc tiêu thụ, consumer lag tăng nhưng không mất dữ liệu (trong 72 giờ hoặc khoảng 55 giờ ở giới hạn bytes).
- Logstash bật **persistent queue** (`queue.type: persisted`, 8 GB/pipeline) để giữ phần đang xử lý khi node restart.
- Thời gian xả backlog ở đỉnh 2×: Logstash có năng lực 40k EPS, tải nền 20k, nên dư 20k EPS. Backlog 1 giờ ở 40k EPS là 72 triệu event, xả hết trong khoảng 1 giờ.
- Sealer không phụ thuộc ES. Kho bằng chứng vẫn đầy đủ khi ES gặp sự cố.

---

## 6. Ingest pipeline và masking

### 6.1 Thứ tự xử lý (bất biến thiết kế)

1. **Collector** tính `event.hash = SHA-256(raw line bytes)` trên bản gốc trước mọi biến đổi, rồi gửi lên Kafka nguyên dòng raw kèm hash.
2. **Sealer** lưu nguyên raw line (đúng byte), không parse.
3. **Logstash** parse, **chuẩn hóa** (lowercase e-mail, đưa số điện thoại về E.164), tính **HMAC**, xóa trường gốc, quét regex trong text tự do, chỉ giữ các trường có trong whitelist.
4. **ES `final_pipeline`** quét lại các trường text bằng regex. Nếu còn PII thì thay bằng nhãn và gắn tag `pii_residual` để cảnh báo.

### 6.2 Kỹ thuật mask

| Trường | Cách xử lý | Trường trong index | Tương quan được? |
|---|---|---|---|
| `user.name` | lowercase, rồi HMAC-SHA256(key_v) | `user.name_hmac` | Có, cùng user cho cùng HMAC (cùng key_v) |
| `user.email` | lowercase/trim, rồi HMAC; tách domain | `user.email_hmac`, `user.email_domain` (*domain giữ nếu khách đồng ý, Q-05*) | Có |
| `user.phone` | chuẩn hóa E.164 (`0912…` thành `+84912…`), rồi HMAC | `user.phone_hmac` | Có |
| PII trong `message` | regex gsub thành `[EMAIL]` hoặc `[PHONE]` | `message` | Không (chỉ che) |
| Phiên bản khóa | n/a | `hmac.key_id` | Phục vụ xoay khóa |

Dùng **HMAC có khóa**, không dùng hash trần. Không gian số điện thoại chỉ khoảng 10^9 nên hash trần SHA-256 bị dò ngược trong vài phút. Khóa HMAC được giữ trong KMS/Vault và nạp vào Logstash keystore. Người điều tra muốn tìm theo một user cụ thể sẽ dùng **công cụ tra cứu có kiểm soát**: công cụ tính HMAC của username, ghi nhật ký người tra, rồi tìm `user.name_hmac`.

### 6.3 Cấu hình mẫu Logstash

```ruby
# /etc/logstash/conf.d/audit.conf  (mẫu — hostname là placeholder)
input {
  kafka {
    bootstrap_servers => "kafka-1:9093,kafka-2:9093,kafka-3:9093"
    topics            => ["audit-raw"]
    group_id          => "logstash-audit"
    security_protocol => "SSL"
    decorate_events   => "basic"        # lấy partition/offset làm tham chiếu bằng chứng
    codec             => "plain"
  }
}

filter {
  # 1) Tách envelope của collector: {"hash":"<sha256>","raw":"<dòng gốc>"}
  json { source => "message" target => "envelope" }
  mutate {
    rename    => { "[envelope][hash]" => "[event][hash]" }
    add_field => {
      "[evidence][partition]" => "%{[@metadata][kafka][partition]}"
      "[evidence][offset]"    => "%{[@metadata][kafka][offset]}"
    }
  }
  json { source => "[envelope][raw]" target => "src" tag_on_failure => ["_parse_failure"] }

  # 2) Chuẩn hóa trước HMAC
  mutate { lowercase => ["[src][user][name]", "[src][user][email]"] strip => ["[src][user][email]"] }
  mutate { gsub => [ "[src][user][phone]", "[\s\.\-()]", "" ] }
  mutate { gsub => [ "[src][user][phone]", "^0", "+84" ] }       # A-13
  if [src][user][email] =~ /@/ {
    grok { match => { "[src][user][email]" => "@(?<[user][email_domain]>[^@]+)$" } }
  }

  # 3) HMAC-SHA256 (fingerprint có 'key' => HMAC)
  fingerprint { source => "[src][user][name]"  target => "[user][name_hmac]"  method => "SHA256" key => "${AUDIT_HMAC_KEY}" }
  fingerprint { source => "[src][user][email]" target => "[user][email_hmac]" method => "SHA256" key => "${AUDIT_HMAC_KEY}" }
  fingerprint { source => "[src][user][phone]" target => "[user][phone_hmac]" method => "SHA256" key => "${AUDIT_HMAC_KEY}" }
  mutate { add_field => { "[hmac][key_id]" => "${AUDIT_HMAC_KEY_ID}" } }

  # 4) Che PII trong text tự do
  mutate {
    copy => { "[src][message]" => "message" }
    gsub => [
      "message", "[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", "[EMAIL]",
      "message", "(?<!\d)(?:\+?84|0)(?:3|5|7|8|9)\d{8}(?!\d)", "[PHONE]",
      "message", "(?<!\d)\+\d{8,15}(?!\d)", "[PHONE]"
    ]
  }

  # 5) Đưa trường không nhạy cảm từ src lên gốc, rồi BỎ toàn bộ bản gốc
  mutate {
    copy => {
      "[src][@timestamp]"     => "@timestamp_src"
      "[src][event][action]"  => "[event][action]"
      "[src][event][outcome]" => "[event][outcome]"
      "[src][source][ip]"     => "[source][ip]"
      "[src][host][name]"     => "[host][name]"
    }
  }
  date   { match => ["@timestamp_src", "ISO8601"] target => "@timestamp" }
  mutate { remove_field => ["src", "envelope", "@timestamp_src", "[event][original]", "event.original"] }
  ruby   { code => "event.set('[event][ingested]', Time.now.utc.iso8601(3))" }

  # 6) Chỉ cho phép trường whitelist (chặn PII lọt qua trường lạ)
  prune {
    whitelist_names => [ "^@timestamp$", "^message$", "^event$", "^user$", "^hmac$",
                         "^evidence$", "^source$", "^host$", "^tags$" ]
  }
}

output {
  if "_parse_failure" in [tags] or "_jsonparsefailure" in [tags] {
    # Bản lỗi có thể còn PII → KHÔNG vào ES; đẩy sang topic hạn chế để xử lý lại
    # Một consumer nhỏ đọc audit-dlq và CHỈ ghi metadata (event.hash, evidence.*, tags, @timestamp,
    # lý do lỗi) vào index audit-dlq-meta. Không output nào từ nhánh này gửi nội dung thẳng vào ES.
    kafka { topic_id => "audit-dlq" bootstrap_servers => "kafka-1:9093" security_protocol => "SSL" codec => "json" }
  } else {
    elasticsearch {
      hosts       => ["https://es-coord:9200"]
      api_key     => "${ES_WRITER_API_KEY}"     # role: create_doc trên audit-events
      data_stream => "true"
      data_stream_type => "logs" data_stream_dataset => "audit" data_stream_namespace => "prod"
      document_id => "%{[event][hash]}-%{[evidence][partition]}-%{[evidence][offset]}"  # idempotent khi replay
      action      => "create"
      ssl_certificate_authorities => ["/etc/logstash/ca.crt"]
    }
  }
}
```

**Ghi chú triển khai** (cần kiểm chứng ở PoC):
- Template có ưu tiên cao hơn template `logs-*-*` dựng sẵn, nên data stream thực tế là `logs-audit-prod`. Các mục sau gọi tắt là "data stream audit".
- Logstash có **DLQ tích hợp** (`dead_letter_queue.enable: true`) để bắt lỗi 400/404 từ ES, ví dụ lỗi mapping với `dynamic: strict`. Ở bước này event *đã được mask*, nên một pipeline phụ đọc `dead_letter_queue` có thể đẩy vào index `audit-dlq-*` để điều tra.
- Lookbehind `(?<!\d)` dùng được với regex Ruby (Onigmo) của Logstash.
- Lỗi 409 (trùng `_id` khi replay) là **bình thường**: event đã có. Phải loại 409 khỏi cảnh báo.
- `document_id` tự đặt giúp chống trùng nhưng làm chậm indexing (ES phải tra `_id`). Cần đo trong PoC; nếu chậm quá A-07 thì bỏ và chuyển sang khử trùng ở bước đối soát.

### 6.4 ES `final_pipeline` (lưới an toàn)

```json
PUT _ingest/pipeline/audit-pii-guard
{
  "description": "Lưới an toàn: che PII còn sót, gắn tag để cảnh báo",
  "processors": [
    { "set": { "field": "_tmp.before", "copy_from": "message", "if": "ctx.message != null" } },
    { "gsub": { "field": "message", "ignore_missing": true,
        "pattern": "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}", "replacement": "[EMAIL]" } },
    { "gsub": { "field": "message", "ignore_missing": true,
        "pattern": "(?:\\+?84|0)(?:3|5|7|8|9)\\d{8}", "replacement": "[PHONE]" } },
    { "append": { "field": "tags", "value": ["pii_residual"],
        "if": "ctx._tmp?.before != null && ctx._tmp.before != ctx.message" } },
    { "remove": { "field": ["_tmp", "user.name", "user.email", "user.phone", "event.original"], "ignore_missing": true } }
  ],
  "on_failure": [
    { "remove": { "field": ["message", "_tmp"], "ignore_missing": true } },
    { "set": { "field": "error.message", "value": "{{ _ingest.on_failure_message }}" } },
    { "set": { "field": "_index", "value": "audit-dlq-meta" } }
  ]
}
```

Nhánh `on_failure` **xóa nội dung** trước khi đưa sang `audit-dlq-meta`. Index DLQ chỉ giữ `event.hash`, `evidence.*` và thông báo lỗi; nội dung gốc được tra từ kho bằng chứng khi cần.

### 6.5 Test case masking (đưa vào CI của pipeline; chạy bằng `_ingest/pipeline/_simulate` và Logstash pipeline test)

| # | Đầu vào | Kỳ vọng |
|---|---|---|
| T1 | `user.name="NguyenVanA"` | `user.name_hmac` = HMAC(key,"nguyenvana"), dài 64 hex; không còn trường `user.name` |
| T2 | `user.name="nguyenvana"` (khác hoa thường so với T1) | `user.name_hmac` **bằng** T1 |
| T3 | `user.email=" A.B@Example.COM "` | `user.email_hmac` = HMAC("a.b@example.com"); `user.email_domain="example.com"` |
| T4 | `user.phone="0912 345 678"` | chuẩn hóa thành `+84912345678`, HMAC; bằng giá trị của T5 |
| T5 | `user.phone="+84912345678"` | cùng `user.phone_hmac` với T4 |
| T6 | `message="login by x.y@corp.vn from 0987654321"` | `message="login by [EMAIL] from [PHONE]"` |
| T7 | `message="order id 1234567890123"` (13 chữ số, không phải SĐT VN) | không đổi (kiểm tra false positive) |
| T8 | trường lạ `extra.ssn="..."` | bị `prune` loại, không có trong document |
| T9 | raw không phải JSON | không vào `logs-audit-prod`; có bản ghi trong `audit-dlq-meta` (chỉ hash và offset); bản gốc nằm ở topic `audit-dlq` |
| T10 | Gửi lại cùng event (replay Kafka) | ES trả 409, chỉ 1 document |
| T11 | Bỏ qua Logstash, gửi thẳng `message` có e-mail vào ES | `final_pipeline` che thành `[EMAIL]` và gắn tag `pii_residual` |
| T12 | `event.hash` của document đem so với SHA-256 dòng raw trong kho bằng chứng | Trùng khớp |

---

## 7. Template, mapping, shard và ILM/SLM

### 7.1 Số shard

- Primary on-disk: 0,968 TB/ngày ≈ 40,3 GB/giờ (r = 0,7).
- Hot: **4 primary + 1 replica = 8 shard/index**, mỗi hot node 1 shard nên ghi được cân bằng.
- Rollover khi `max_primary_shard_size` = 25 GB, tức index khoảng 100 GB primary (khoảng 2,5 giờ), hoặc `max_age` = 1 ngày. Kết quả là khoảng 9,7 index/ngày.
- Warm: shrink với `max_primary_shard_size` = 50 GB: 100 GB còn **2 primary × 50 GB**, nằm trong dải mục tiêu 30–50 GB.
- Số shard: hot khoảng 7 × 9,7 × 8 ≈ **543 shard** (khoảng 68/node); warm khoảng 23 × 9,7 × 4 ≈ **892 shard** (khoảng 127/node). Mức này thấp so với heap 31 GB.

*Lý do không rollover thẳng ở 50 GB/shard:* 4 × 50 GB thì không shrink được nữa (4 thành 2 sẽ ra 100 GB/shard). Rollover ở 25 GB rồi shrink thì vừa phân tải ghi đều lên 8 hot node, vừa giảm số shard ở warm còn một nửa.

### 7.2 Index template và mapping

```json
PUT _component_template/audit-settings
{
  "template": {
    "settings": {
      "index.number_of_shards": 4,
      "index.number_of_replicas": 1,
      "index.codec": "best_compression",
      "index.refresh_interval": "30s",
      "index.final_pipeline": "audit-pii-guard",
      "index.lifecycle.name": "audit-ilm",
      "index.routing.allocation.include._tier_preference": "data_hot",
      "index.mapping.total_fields.limit": 200
    }
  }
}

PUT _component_template/audit-mappings
{
  "template": {
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp":  { "type": "date" },
        "message":     { "type": "match_only_text" },
        "tags":        { "type": "keyword" },
        "data_stream": { "properties": {
            "type": { "type": "constant_keyword" }, "dataset": { "type": "constant_keyword" },
            "namespace": { "type": "constant_keyword" } } },
        "event": { "properties": {
            "hash":     { "type": "keyword" },
            "action":   { "type": "keyword" },
            "outcome":  { "type": "keyword" },
            "ingested": { "type": "date" } } },
        "user": { "properties": {
            "name_hmac":    { "type": "keyword" },
            "email_hmac":   { "type": "keyword" },
            "email_domain": { "type": "keyword" },
            "phone_hmac":   { "type": "keyword" } } },
        "hmac":     { "properties": { "key_id": { "type": "keyword" } } },
        "evidence": { "properties": {
            "partition": { "type": "integer" },
            "offset":    { "type": "long" },
            "batch_id":  { "type": "keyword" } } },
        "source": { "properties": { "ip": { "type": "ip" } } },
        "host":   { "properties": { "name": { "type": "keyword" } } },
        "error":  { "properties": { "message": { "type": "keyword", "index": false } } }
      }
    }
  }
}

PUT _index_template/audit
{
  "index_patterns": ["logs-audit-*"],
  "data_stream": {},
  "priority": 300,
  "composed_of": ["audit-settings", "audit-mappings"]
}
```

`dynamic: strict` kết hợp `prune` ở Logstash tạo thành hai lớp chặn trường lạ. Trường mới phải đi qua thay đổi template có review.

### 7.3 ILM policy

```json
PUT _ilm/policy/audit-ilm
{
  "policy": {
    "_meta": { "description": "hot 0-7d, warm 8-30d, xóa sau khi đã có snapshot archive" },
    "phases": {
      "hot": {
        "actions": {
          "rollover":     { "max_primary_shard_size": "25gb", "max_age": "1d" },
          "forcemerge":   { "max_num_segments": 1 },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "readonly":     {},
          "shrink":       { "max_primary_shard_size": "50gb" },
          "allocate":     { "number_of_replicas": 1 },
          "set_priority": { "priority": 50 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "wait_for_snapshot": { "policy": "slm-archive-daily" },
          "delete": {}
        }
      }
    }
  }
}
```

- `min_age` tính từ lúc rollover, nên mỗi document ở trên cluster **≥ 30 ngày**. R3 được đáp ứng với biên dư bằng thời gian một index đang ghi (≤ 1 ngày).
- **Forcemerge đặt ở hot** (sau rollover) chứ không ở warm. Nhờ vậy index đã ở trạng thái cuối cùng trước khi shrink và snapshot archive, và segment không bị chép lại vào repo có Object Lock. Nếu chép lại thì bản cũ bị khóa 365 ngày, nhân đôi dung lượng. Đánh đổi là hot tốn thêm IO/CPU để merge khoảng 10 index/ngày, nằm trong headroom.
- `wait_for_snapshot` chặn việc xóa index cho tới khi SLM archive chạy thành công sau thời điểm index vào phase delete. **[CẦN KIỂM CHỨNG theo phiên bản]**: action này có kiểm tra snapshot *chứa đúng index đó* hay không. Job đối soát ở mục 9.4 kiểm tra độc lập điều này.

### 7.4 SLM và repository

```json
PUT _snapshot/archive-repo
{ "type": "s3", "settings": { "bucket": "audit-es-archive", "client": "archive", "base_path": "prod",
  "server_side_encryption": true, "compress": true } }

PUT _snapshot/dr-repo
{ "type": "s3", "settings": { "bucket": "audit-es-dr", "client": "dr", "base_path": "prod",
  "server_side_encryption": true, "compress": true } }

PUT _slm/policy/slm-archive-daily
{
  "schedule": "0 30 1 * * ?",
  "name": "<archive-{now/d}>",
  "repository": "archive-repo",
  "config": {
    "indices": ["shrink-*logs-audit-prod*"],
    "expand_wildcards": "all",
    "include_global_state": false,
    "ignore_unavailable": true,
    "partial": false
  },
  "retention": { "expire_after": "335d", "min_count": 30, "max_count": 400 }
}

PUT _slm/policy/slm-dr-30m
{
  "schedule": "0 0/30 * * * ?",
  "name": "<dr-{now/m}>",
  "repository": "dr-repo",
  "config": { "indices": ["logs-audit-prod"], "include_global_state": true, "partial": false },
  "retention": { "expire_after": "8d", "min_count": 10, "max_count": 500 }
}
```

- `expire_after: 335d`: lần cuối một index có mặt trong snapshot archive là khoảng ngày 30 (trước khi bị xóa khỏi cluster), cộng 335 ngày thành khoảng 365 ngày. Dữ liệu vì vậy được giữ đúng 12 tháng.
- **Pattern `shrink-*logs-audit-prod*` và `expand_wildcards`** (backing index là hidden) cần kiểm chứng trong PoC theo đúng phiên bản.
- Bucket `audit-es-archive` dùng **Object Lock chế độ GOVERNANCE, 365 ngày**, có versioning, và lifecycle `NoncurrentVersionExpiration` để dọn sau khi khóa hết hạn. **[CHƯA KIỂM CHỨNG]**: Elasticsearch ghi đè/xóa các blob metadata của repo (`index-N`, `index.latest`). Trên bucket có versioning và Object Lock, các thao tác này tạo version mới hoặc delete marker nên về lý thuyết vẫn chạy được. Tuy vậy phải chạy **Repository analysis API** (`POST _snapshot/archive-repo/_analyze`) trong PoC trước khi kết luận. Nếu không tương thích thì giữ versioning và chính sách IAM chặn xóa, bỏ Object Lock ở repo ES. Toàn vẹn chứng cứ không phụ thuộc vào repo này (ADR-02).
- Chạy `POST _snapshot/archive-repo/_verify` hằng ngày, kèm restore thử (mục 8.4).

---

## 8. Truy vấn dữ liệu cũ hơn 30 ngày (SLA 24 giờ)

### 8.1 Ước tính thời gian restore (A-09, A-10)

```
Dữ liệu 30 ngày (r=0,7)       = 30 × 0,968 = 29,03 TB (restore với 0 replica)
Throughput 4 node × 250 MB/s  = 1 GB/s = 3,6 TB/giờ
Thời gian restore 30 ngày     = 29,03 ÷ 3,6 ≈ 8,1 giờ     (1 ngày dữ liệu ≈ 16 phút)
Bi quan 100 MB/s/node         = 1,44 TB/giờ → 20,2 giờ  → VƯỢT ngân sách thời gian
Ngân sách restore (24h − 8h thủ tục/kiểm tra) = 16 giờ → cần ≥ 504 MB/s tổng ≈ 126 MB/s/node
Dung lượng tối đa nhóm restore = 40,8 TB ÷ 0,968 ≈ 42 ngày dữ liệu/lần
```

**Điều kiện bắt buộc:** nâng `indices.recovery.max_bytes_per_sec` trên node restore. Mặc định có thể chỉ 40 MB/s/node, *cần kiểm chứng theo phiên bản*; với mức đó 30 ngày mất khoảng 50 giờ. Ngoài ra cần mạng tới object storage ≥ 10 GbE và đo thực tế trong PoC.

### 8.2 Runbook restore theo yêu cầu (tóm tắt)

| Bước | Việc | Thời gian ước tính |
|---|---|---|
| 0 | Nhận yêu cầu có số vụ việc; pháp chế/DPO phê duyệt phạm vi (khoảng thời gian, hệ thống) | ≤ 2 giờ |
| 1 | Xác định các ngày cần restore qua index tóm tắt `audit-summary` (8.3) và catalog snapshot (`GET _snapshot/archive-repo/_all`) | 30 phút |
| 2 | Kiểm tra dung lượng trống của nhóm restore; bật thêm node nếu đang thu nhỏ | 0–1 giờ |
| 3 | `POST _snapshot/archive-repo/<snap>/_restore` với `indices` theo ngày, `rename_pattern` thành `restored-<case>-$1`, `index_settings`: `number_of_replicas: 0`, `index.routing.allocation.require.restore: true`, `index.blocks.write: true`, `index.lifecycle.name: null` | khoảng 16 phút/ngày dữ liệu; ≤ 8,1 giờ cho 30 ngày |
| 4 | Xác minh: số document mỗi index khớp catalog đối soát; lấy mẫu ≥ 100 event để đối chiếu `event.hash` với kho bằng chứng | 1 giờ |
| 5 | Cấp role `investigator-<case>` (đọc `restored-<case>-*`) và Kibana space riêng; ghi nhật ký cấp quyền | 30 phút |
| 6 | Bàn giao | Tổng khoảng 13 giờ, dư khoảng 11 giờ |
| 7 | Khi đóng vụ việc: xóa `restored-<case>-*`. Chỉ role `restore-admin` được xóa, và chỉ trên pattern này | n/a |

Yêu cầu vượt 42 ngày dữ liệu sẽ chia thành nhiều đợt. Khi đó SLA 24 giờ áp dụng cho từng đợt ≤ 30 ngày (**Q-02**).

### 8.3 Index tóm tắt giảm phạm vi restore

Một **transform** (Basic, *cần kiểm chứng*) tạo `audit-summary` theo khóa (ngày, `user.name_hmac`, `event.action`, `host.name`) với số đếm. Index này giữ 12 tháng trên warm, chỉ vài GB đến vài chục GB (ước lượng, phụ thuộc cardinality). Nhờ nó, câu hỏi "user X làm gì trong 12 tháng" được trả lời ngay ở mức ngày nào có hoạt động, và chỉ cần restore những ngày đó thay vì cả năm (cả năm khoảng 353 TB, không thể restore trong 24 giờ).

### 8.4 Diễn tập

Mỗi tuần restore ngẫu nhiên 1 ngày dữ liệu từ archive-repo, đo throughput, đối chiếu hash mẫu, rồi xóa. Mỗi quý diễn tập đầy đủ 30 ngày. Ghi kết quả vào báo cáo vận hành.

---

## 9. Bảo đảm toàn vẹn (giá trị chứng cứ)

### 9.1 Nguyên tắc

Elasticsearch **không** chứng minh được tính bất biến: superuser có thể xóa hoặc reindex, và Basic không có audit log của ES. Mặt khác dữ liệu trong ES đã bị mask nên không còn là bản gốc. **Bằng chứng gốc vì vậy là kho bằng chứng**, còn ES là *bản làm việc có thể đối chiếu* nhờ `event.hash` và `evidence.partition/offset`.

### 9.2 Các lớp

| Lớp | Cơ chế |
|---|---|
| L1 Hash tại nguồn | Collector tính `event.hash = SHA-256(raw bytes)` trước mọi biến đổi |
| L2 Lô và chuỗi | Sealer gom lô theo partition (10 giây hoặc 50.000 event). Lá Merkle là `SHA-256(offset ‖ event.hash ‖ raw)`. `batch_hash = SHA-256(merkle_root ‖ prev_batch_hash ‖ partition ‖ first/last offset ‖ count)` tạo thành hash chain theo partition, nên mất lô hay chèn lô đều bị phát hiện |
| L3 Chữ ký | Sealer ký `batch_hash` bằng khóa trong HSM/KMS, khóa không rời HSM. Public key và chứng thư được lưu cùng manifest |
| L4 Timestamp độc lập | Mỗi phút gom các `batch_hash` thành 1 Merkle root rồi xin token **RFC 3161** từ TSA (nội bộ hoặc bên thứ ba được pháp chế chấp nhận, Q-08). Chi phí là 1.440 token/ngày |
| L5 WORM | Lô raw được nén zstd và mã hóa AES-256-GCM (DEK theo ngày/partition, KEK trong KMS), ghi vào bucket **Object Lock COMPLIANCE 365 ngày** (A-11) ở tài khoản/tenant tách biệt. Đội vận hành ES không có quyền nào trên bucket này |
| L6 Neo ngoài | Root ngày (Merkle của các root phút) được gửi tới hệ thống độc lập: sổ của pháp chế hoặc bên ký quỹ |
| L7 Thời gian | chrony với ≥ 2 nguồn NTP tin cậy; cảnh báo khi lệch > 100 ms; `@timestamp` (nguồn) và `event.ingested` (pipeline) được giữ song song |
| L8 RBAC | Writer: `create_doc` trên `logs-audit-*`, không có `index`/`delete`/`manage`. Người dùng: `read`, `view_index_metadata`. Không ai có `delete_index`/`manage` trên `logs-audit-*` ngoài tài khoản ILM. Superuser được niêm phong (break-glass, 2 người) |
| L9 Xác minh | Job hằng ngày (mục 9.4) |

### 9.3 Chứng minh một event trước tòa (quy trình)

1. Lấy document từ ES hoặc index restore: có `event.hash`, `evidence.partition`, `evidence.offset`.
2. Lấy lô chứa offset đó từ kho WORM, giải mã, trích raw line, tính lại SHA-256 và so với `event.hash`.
3. Tính Merkle proof tới `merkle_root`, kiểm tra `batch_hash`, chuỗi `prev_batch_hash`, chữ ký và token TSA của phút tương ứng.
4. Đối chiếu root ngày với bản neo ngoài (L6).
5. Chứng minh phép mask: HMAC(key_v, chuẩn hóa(user trong raw)) bằng `user.name_hmac`. Bước này cần khóa HMAC, thực hiện có biên bản.

### 9.4 Job xác minh định kỳ

| Kiểm tra | Tần suất | Cảnh báo khi |
|---|---|---|
| Liên tục chuỗi `prev_batch_hash`, không hở offset theo partition | Mỗi giờ | Có gap hoặc chuỗi đứt |
| Chữ ký và token TSA hợp lệ | Mỗi giờ | Có lỗi |
| Đối soát số lượng: event trong kho WORM so với document ES theo giờ (trừ DLQ) | Mỗi giờ | Lệch ≠ 0 sau 2 giờ |
| Lấy mẫu ngẫu nhiên 1.000 document/ngày, đối chiếu hash với bản gốc | Hằng ngày | Bất kỳ sai khác nào |
| Mỗi index sắp bị ILM xóa phải có trong snapshot archive thành công | Hằng ngày | Thiếu |
| Object Lock còn bật, chế độ và retention đúng | Hằng ngày | Bị đổi |

### 9.5 Bù cho việc Basic không có audit log ES/Kibana

- Mọi truy cập API admin đi qua reverse proxy có ghi log (method, path, user lấy từ header xác thực). Log này được đẩy về kho bằng chứng, **không** về cluster đang bị giám sát.
- Chặn ở proxy các API phá hủy: `DELETE /logs-audit-*`, `_delete_by_query`, `_update_by_query`, `POST */_close` trên pattern audit.
- auditd ở OS các node ES và kho; thay đổi cấu hình đi qua Git và review.
- Hạn chế: thao tác qua kết nối trực tiếp node (cổng 9300, console) vẫn không được ES ghi lại. Rủi ro này được chấp nhận vì toàn vẹn dựa trên L1–L6, không dựa vào ES.

---

## 10. ADR

### ADR-01: Dùng snapshot/restore thường thay cho searchable snapshots
- **Bối cảnh:** khách gợi ý searchable snapshots (R8) trong khi chỉ được dùng Basic (R7).
- **Quyết định:** dữ liệu 31 ngày–12 tháng chỉ nằm trong archive-repo và được restore theo yêu cầu vào nhóm restore trong ≤ 24 giờ.
- **Phương án đã xét:**

| | A. Snapshot + restore theo yêu cầu (**chọn**) | B. Nâng license Enterprise, frozen tier | C. Giữ cả 12 tháng trên node (cold, 0 replica, có snapshot dự phòng) |
|---|---|---|---|
| Đáp ứng R4 | Có, ≤ 24 giờ cho ≤ 30 ngày dữ liệu | Có, vài giây đến vài phút | Có, ngay lập tức |
| License | Basic | Enterprise (giá do Elastic báo, không ước tính ở đây) | Basic |
| Phần cứng thêm | 4 node restore (48 TB) | Vài node frozen với cache cục bộ | 324,17 ÷ 0,85 × 1,15 ≈ 439 TB đĩa, khoảng 37 node × 12 TB |
| Vận hành | Có runbook, cần diễn tập | Đơn giản nhất | Nặng (nhiều node, nhiều shard) |
- **Hệ quả:** truy vấn dữ liệu cũ là thủ tục có trễ; cần index tóm tắt (8.3) và diễn tập. Nếu nghiệp vụ cần truy vấn dữ liệu cũ thường xuyên thì phương án B nên được so tổng chi phí với A + C (Q-01).

### ADR-02: Bằng chứng là kho WORM tách biệt (hash, ký, TSA trên bản gốc trước khi mask); ES là bản làm việc
- **Bối cảnh:** R5 (bất biến) và R6 (mask trước khi index) mâu thuẫn nếu coi index là bằng chứng.
- **Quyết định:** hash ở collector; Sealer ký và đóng dấu thời gian rồi lưu bản gốc mã hóa trong Object Lock COMPLIANCE; index chỉ chứa dữ liệu đã mask kèm con trỏ bằng chứng.
- **Phương án loại:** (a) Coi snapshot ES là bằng chứng: dữ liệu đã bị mask, không phải bản gốc, và ES không có audit log. (b) Ký từng event ở collector: phải phân phối khóa ra hàng loạt máy nguồn, rủi ro lộ khóa cao. Thay vào đó chỉ hash ở collector, còn ký tập trung có HSM. (c) Không giữ bản gốc: không chứng minh được nội dung trước khi mask.
- **Hệ quả:** thêm khoảng 76 TB WORM/năm và thêm thành phần Sealer cần phát triển hoặc vận hành. Bản gốc chứa PII phải được bảo vệ ở mức cao nhất.

### ADR-03: Dùng Kafka làm bộ đệm
- **Quyết định:** Kafka 3 broker, RF 3, giữ 72 giờ, giữa collector và các consumer.
- **Phương án loại:** chỉ dùng persistent queue của Logstash. Bộ đệm này nhỏ, gắn với từng node, và không cho phép hai consumer độc lập (Sealer và Logstash) cùng đọc.
- **Hệ quả:** thêm một hệ thống phải vận hành; topic `audit-raw` chứa PII rõ nên phải mã hóa và áp ACL.

### ADR-04: Pseudonymization bằng HMAC tại Logstash
- **Quyết định:** HMAC-SHA256 có khóa, chuẩn hóa trước khi băm, lưu kèm `hmac.key_id`. Che bằng regex cho text tự do; `final_pipeline` làm lưới an toàn.
- **Phương án loại:** hash không khóa (dò ngược được); che hoàn toàn (mất khả năng tương quan); tokenization có vault (thêm hệ thống và độ trễ).
- **Hệ quả:** khóa HMAC thành tài sản trọng yếu. Xoay khóa làm đứt tương quan giữa hai giai đoạn; khi tra cứu phải tính với mọi `key_id` còn hiệu lực.

### ADR-05: Data stream, chỉ ghi `create`, forcemerge ở hot
- **Quyết định:** dùng data stream (append-only), role writer chỉ có `create_doc`, `_id` xác định để replay không gây trùng, forcemerge ngay sau rollover.
- **Hệ quả:** indexing chậm hơn đôi chút vì phải tra `_id` (cần đo). Hot tốn thêm IO merge. Đổi lại snapshot archive không bị chép lại segment.

---

## 11. Rủi ro và mâu thuẫn

| ID | Loại | Mô tả | Mức | Xử lý |
|---|---|---|---|---|
| **C-01** | **Mâu thuẫn đầu vào** | **Searchable snapshots (cold/frozen) cần license Enterprise, không có trong Basic.** Gợi ý R8 xung đột với R7 | **Cao** | ADR-01: snapshot + restore ≤ 24 giờ; phương án B nâng license để khách so sánh |
| **C-02** | **Mâu thuẫn đầu vào** | Mask trước khi index (R6) làm dữ liệu index bị biến đổi, trái với yêu cầu bằng chứng không sửa đổi (R5) | **Cao** | ADR-02: bằng chứng là bản gốc đã ký trong WORM; index chỉ là bản làm việc có thể đối chiếu |
| C-03 | Mâu thuẫn đầu vào | Quyền xóa/chỉnh sửa dữ liệu cá nhân của chủ thể dữ liệu xung đột với WORM COMPLIANCE 12 tháng | Cao | Cần pháp chế xác nhận cơ sở lưu giữ (nghĩa vụ pháp lý hoặc chứng cứ) và miễn trừ (Q-04). Phương án kỹ thuật: crypto-shredding theo DEK ngày/partition, chỉ xóa được ở mức cả lô. Index ES chỉ chứa HMAC; hủy key_id sẽ cắt khả năng liên kết |
| C-04 | Mâu thuẫn ẩn | "Tìm trong 24 giờ" không khả thi với phạm vi lớn (12 tháng ≈ 353 TB) | Trung bình | Giới hạn ≤ 30 ngày/đợt (A-10, Q-02) và dùng `audit-summary` |
| R-01 | License | Basic không có audit log ES/Kibana, DLS/FLS, SSO, alert connector | Trung bình | Mục 3 và 9.5; tách index theo pattern; cảnh báo qua hệ thống ngoài |
| R-02 | Sizing | r chưa đo; nếu r = 1,0 thì thiếu khoảng 40% đĩa | Cao | PoC trước khi mua; cấu hình bi quan ở mục 4.4 |
| R-03 | Tải | Đỉnh EPS chưa rõ (A-01); bão log khi có sự cố | Trung bình | Kafka 72 giờ (giới hạn bytes khoảng 55 giờ), PQ, cảnh báo lag; mở rộng Logstash ngang |
| R-04 | Restore | Throughput object storage hoặc throttle recovery mặc định làm vượt SLA | Cao | Nâng `indices.recovery.max_bytes_per_sec`, đo PoC, diễn tập tuần/quý |
| R-05 | Mất replica | 2 hot node hỏng cùng lúc thì mất shard của index đang ghi | Trung bình | Phân rack bằng `cluster.routing.allocation.awareness`; khôi phục từ dr-repo (RPO 30 phút) rồi replay Kafka theo offset (có `_id` xác định) |
| R-06 | DR | Mất toàn site | Cao | dr-repo và archive-repo ở site khác, kho bằng chứng có replication sang site khác; diễn tập dựng lại cluster, RTO ≤ 24 giờ cho 30 ngày |
| R-07 | Khóa | Lộ khóa HMAC thì dò ngược được SĐT/username. Mất khóa HMAC thì mất khả năng tra cứu theo user. Mất khóa ký hoặc KEK thì không giải mã hay chứng minh được | Cao | KMS/HSM, phân quyền 2 người, sao lưu khóa có kiểm soát, xoay khóa hằng năm kèm `key_id`; nhật ký sử dụng khóa |
| R-08 | Lộ PII | Kafka `audit-raw`, topic DLQ và kho bằng chứng chứa PII rõ | Cao | Mã hóa ở mức đĩa và kết nối, ACL, retention ngắn, mạng tách vùng; kiểm thử T1–T12; cảnh báo `pii_residual` |
| R-09 | Tương thích | Object Lock trên archive-repo có thể không tương thích với cách ES quản lý blob | Trung bình | Chạy `_analyze` trong PoC; có phương án dự phòng ở 7.4 |
| R-10 | Thời gian | NTP lệch làm thứ tự event và chứng cứ bị nghi ngờ | Trung bình | L7 + token TSA |
| R-11 | Hành vi ILM | `wait_for_snapshot` có thể không kiểm tra snapshot chứa đúng index | Trung bình | Job đối soát 9.4 |
| R-12 | Vận hành | Sealer là thành phần tự xây hoặc tích hợp, chưa có sẵn trong Elastic | Trung bình | Đặc tả, review bảo mật, test chuỗi hash; xem xét sản phẩm WORM/ký có sẵn |

---

## 12. Giám sát

Dùng cluster monitoring riêng, Metricbeat/Elastic Agent và Kibana Stack Monitoring. Vì Basic chỉ có connector Index/Server log (*cần kiểm chứng*), cảnh báo được ghi vào index `alerts-*` rồi đẩy sang hệ thống thông báo có sẵn của khách (Q-06).

| Chỉ số | Ngưỡng cảnh báo (đề xuất) |
|---|---|
| Kafka consumer lag (Logstash, Sealer) | > 5 phút dữ liệu (> 6 triệu event) |
| Kafka dung lượng đĩa broker | > 75% |
| Logstash events in/out, PQ đầy, DLQ size | Chênh in/out > 1% trong 10 phút; DLQ > 0 |
| ES indexing rate so với 20k EPS | < 15k trong 10 phút |
| ES write thread pool rejections | > 0 |
| Disk watermark | > 75% (trước ngưỡng low 85%) |
| Heap/GC | Heap > 85% kéo dài; GC old > 1 giây |
| `_ilm/explain?only_errors=true` | Có lỗi |
| SLM `last_failure`, repo verify | Có lỗi |
| Số shard/node | > 1.000 trên warm |
| `pii_residual` count | > 0 (sự cố bảo vệ dữ liệu) |
| Sealer: gap chuỗi, lỗi ký, lỗi TSA, lỗi ghi WORM | > 0 |
| Đối soát số lượng WORM so với ES | Lệch ≠ 0 sau 2 giờ |
| NTP offset | > 100 ms |
| Throughput restore (diễn tập) | < 126 MB/s/node |

---

## 13. PoC và kế hoạch kiểm chứng

| # | Mục tiêu | Tiêu chí chấp nhận |
|---|---|---|
| P1 | Đo hệ số r (A-04) với ≥ 1 ngày dữ liệu mẫu đã mask | Chốt r; cập nhật mục 4 |
| P2 | Đo throughput hot (A-07) và Logstash (A-08), có và không có `document_id` | ≥ 40k EPS toàn hệ thống trong 1 giờ, không có rejection |
| P3 | `POST _snapshot/archive-repo/_analyze` trên bucket Object Lock | Không lỗi |
| P4 | Restore 1 ngày và 7 ngày dữ liệu | ≥ 126 MB/s/node |
| P5 | Pattern SLM `shrink-*` với backing index hidden; hành vi `wait_for_snapshot` | Snapshot chứa đúng index |
| P6 | Test T1–T12 | 100% pass |
| P7 | Đối chiếu ma trận license (mục 3) với phiên bản được chọn | Biên bản xác nhận |
| P8 | Quy trình 9.3 trên 10 event ngẫu nhiên | Tất cả xác minh được |

---

## 14. Bảng đánh đổi tổng hợp

| Quyết định | Được | Mất |
|---|---|---|
| Snapshot + restore thay searchable snapshots | Giữ được Basic | Trễ ≤ 24 giờ; cần 4 node restore và runbook |
| Kho bằng chứng tách biệt | Chứng cứ vững, độc lập với ES | Thêm khoảng 76 TB WORM, thêm Sealer, giữ PII rõ ở một nơi |
| HMAC thay cho che hoàn toàn | Tương quan và tra cứu được | Phải quản lý khóa; lộ khóa thì dò ngược được |
| 1 replica ở hot và warm | Chịu được mất 1 node | Dung lượng ×2 |
| Warm dùng HDD (nếu chọn) | Rẻ hơn | Truy vấn 30 ngày chậm hơn A-03 |
| Forcemerge ở hot | Snapshot archive gọn, không trùng segment | Thêm tải IO ở hot |
| `dynamic: strict` + `prune` | Chặn PII lọt qua trường lạ | Trường mới phải đổi template |
| `_id` xác định | Replay không tạo bản trùng | Indexing chậm hơn (cần đo) |

---

## 15. Câu hỏi mở cho khách

| ID | Câu hỏi |
|---|---|
| Q-01 | Tần suất dự kiến của yêu cầu tra cứu dữ liệu > 30 ngày? Nếu nhiều hơn vài lần mỗi tháng, có muốn báo giá Enterprise (frozen tier) để so sánh không? |
| Q-02 | SLA 24 giờ áp dụng cho phạm vi bao nhiêu ngày dữ liệu mỗi yêu cầu? Đề xuất ≤ 30 ngày |
| Q-03 | Đỉnh EPS thực tế và dự báo tăng trưởng 12–36 tháng? |
| Q-04 | Cơ sở pháp lý lưu giữ 12 tháng và chính sách với yêu cầu xóa dữ liệu cá nhân? Thời hạn giữ bằng chứng có dài hơn 12 tháng không (legal hold)? |
| Q-05 | Có được giữ domain e-mail, hoặc 2 số cuối điện thoại, dạng rõ để hỗ trợ điều tra không? |
| Q-06 | Hệ thống cảnh báo, SIEM, KMS/HSM và object storage có Object Lock nào đang sẵn có? |
| Q-07 | Yêu cầu xác thực người dùng Kibana (SSO/LDAP)? Basic không hỗ trợ |
| Q-08 | TSA nào được pháp chế chấp nhận (nội bộ hay nhà cung cấp dịch vụ tin cậy)? |
| Q-09 | Phân loại HTTT và cấp độ ATTT của các hệ thống nguồn? Khách có phải cơ quan nhà nước không? |
| Q-10 | Latency truy vấn mong muốn trên dữ liệu 30 ngày (để chọn SSD hay HDD cho warm)? |
| Q-11 | Có yêu cầu DR khác site, và RTO/RPO chính thức là bao nhiêu? |
