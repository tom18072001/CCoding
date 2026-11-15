# DESIGN — Nền tảng audit-log trên Elastic Stack (license Basic)

Phân loại: internal. Trạng thái: **đề xuất, chưa PoC**. Mọi số liệu "đo" dưới đây là kết quả **tính toán** (lệnh ở Phụ lục A); mọi số về nén, tốc độ restore, năng lực node là **giả định chưa kiểm chứng** và cần PoC.

Quy ước đơn vị: **TB = 10¹² byte** (thập phân), TiB = 2⁴⁰ byte. Mặc định dùng TB; ổ đĩa mua theo TB nên so sánh trực tiếp được.

## 0. Tóm tắt kiến trúc

```
Agent/Beats ─TLS─► Kafka (raw topic, 72h, RF3) ─┬─► Logstash "mask" ─► Elasticsearch (hot → warm) ─► SLM ─► Snapshot repo
                                                 │     (HMAC fingerprint raw, mask PII)
                                                 └─► Logstash "archive" ─► Kho WORM (raw gz + manifest chuỗi hash, ký, timestamp)
```

Quyết định chính: (1) **không dùng searchable snapshots** (cần Enterprise); (2) masking ở Logstash trước khi index, **không dùng `redact` processor** (cần license cao hơn Basic); (3) tính toàn vẹn do **hệ thống ngoài Elasticsearch** bảo đảm (WORM + chuỗi hash + chữ ký + timestamp); (4) dữ liệu 31 ngày–12 tháng: Phương án A (warm đủ 12 tháng, tìm interactive) hoặc B (warm ngắn + restore theo yêu cầu, rẻ hơn) — mục 6b.

## 1. Số học dung lượng

### 1.1 Raw

| Đại lượng | Công thức | Kết quả |
|---|---|---|
| Throughput | 20.000 EPS × 800 B | 16.000.000 B/s = **16 MB/s** |
| Event/ngày | 20.000 × 86.400 | **1.728.000.000** (1,728 tỷ) |
| Raw/ngày | 1,728×10⁹ × 800 B | **1,3824 TB/ngày** (= 1,257 TiB) |
| Raw/năm (365 ngày) | 1,3824 × 365 | **504,576 TB/năm** (= 458,9 TiB) |
| Raw 30 ngày | 1,3824 × 30 | 41,472 TB |
| Raw ngày 31–365 (335 ngày) | 1,3824 × 335 | 463,104 TB |

### 1.2 Giả định nén (GIẢ ĐỊNH CHƯA KIỂM CHỨNG — cần PoC)

Tên giả định: **`INDEX_RATIO`** = kích thước index trên đĩa (primary, đã gồm `_source`, doc values, inverted index, overhead) ÷ raw.

- Dải xét: 0,3× – 0,5×. **Chọn 0,4×** làm mức tính (trung tâm; `index.codec: best_compression` cho warm, mapping tường minh, tắt `_all`-style dynamic text, `keyword` thay `text` khi không cần full-text).
- Lý do: log có cấu trúc lặp nhiều nén tốt, nhưng thêm trường `@timestamp`, hash/fingerprint (chuỗi hex 64 ký tự, **không nén được**), metadata Kafka kéo tỉ lệ lên.
- **Cảnh báo:** nếu mapping dynamic/không tối ưu (text + keyword multi-field, lưu hash nhiều lần) thì index có thể **≥ 1,0× raw**, lớn hơn cả raw. Phải PoC với mẫu dữ liệu thật đã che và đo `_cat/indices` trước khi mua phần cứng.
- Độ nhạy (primary, 1 bản, 365 ngày): 0,3× = 151,4 TB; **0,4× = 201,8 TB**; 0,5× = 252,3 TB.

Index primary/ngày ở 0,4× = 1,3824 × 0,4 = **0,553 TB/ngày**.

### 1.3 Dung lượng từng tầng (INDEX_RATIO = 0,4)

Hệ số headroom: dự phòng 20% + watermark low 85% ⇒ đĩa cần mua = dữ liệu × 1,2 ÷ 0,85 = **× 1,412**.

| Tầng | Dữ liệu | Không replica | Có replica | + headroom/watermark (×1,412) |
|---|---|---|---|---|
| Hot, 30 ngày, 1 replica | 0,553 × 30 | 16,59 TB | **33,18 TB** (nhân đôi) | **46,84 TB** |
| Warm A, ngày 31–365 (335 ngày), 0 replica (đã có snapshot) | 0,553 × 335 | **185,24 TB** | 370,48 TB nếu giữ 1 replica | **261,5 TB** (0 replica); 523,0 TB (1 replica) |
| Warm B, ngày 31–90 (60 ngày), 0 replica | 0,553 × 60 | 33,18 TB | 66,36 TB | **46,84 TB** |
| Snapshot repo (365 ngày, chỉ primary) | 0,553 × 365 | **201,83 TB** | — (object storage tự nhân bản) | **242,2 TB** (+20%) |
| Kho WORM raw (365 ngày) | 504,576 TB raw nén gzip/zstd | giả định `RAW_GZ_RATIO` = 0,15 | — | **≈ 75,7 TB** (+20% ≈ 90,8 TB) |
| Kafka (72h, RF3, tính xấu nhất không nén) | 1,3824 × 3 × 3 | 12,44 TB | — | 3 broker × 6 TB |

Tổng ES local disk: Phương án A = 46,84 + 261,5 ≈ **308 TB**; Phương án B = 46,84 + 46,84 ≈ **94 TB**. Ghi chú: snapshot đã force-merge có thể không dedupe hoàn toàn với segment cũ nên repo có thể lớn hơn 201,8 TB — headroom 20% đã bao một phần, PoC để đo.

## 2. Node layout

| Vai trò | SL | CPU / RAM / Disk mỗi node | Ghi chú |
|---|---|---|---|
| Master (dedicated) | 3 | 4 vCPU / 16 GB (heap 8 GB) / 100 GB SSD | 3 AZ/rack khác nhau; quorum 2 |
| Hot (data_hot, data_content) | 8 | 16 vCPU / 64 GB (heap 31 GB) / 6 TB NVMe = 48 TB ≥ 46,84 TB | 1 replica; allocation awareness theo zone |
| Warm A | 9 | 8 vCPU / 64 GB (heap 31 GB) / 30 TB = 270 TB ≥ 261,5 TB | `data_warm`, disk dày (SSD SATA hoặc HDD RAID — PoC kiểm tra tốc độ search) |
| Warm B (thay A) | 4 | 8 vCPU / 64 GB / 12 TB = 48 TB ≥ 46,84 TB | + cụm restore tạm khi cần |
| Coordinating-only | 2 | 8 vCPU / 32 GB / 100 GB | Kibana & user trỏ vào đây |
| Logstash "mask" | 5 | 8 vCPU / 16 GB (heap 8 GB) / 200 GB (persistent queue) | 4 chạy + 1 dự phòng |
| Logstash "archive" | 2 | 8 vCPU / 16 GB / 500 GB (đệm cục bộ) | ghi WORM |
| Kafka | 3 | 8 vCPU / 32 GB / 6 TB | RF3, `min.insync.replicas=2`, retention 72h |
| Kibana | 2 | 4 vCPU / 8 GB | sau load balancer, TLS |

**Shard sizing.** Mục tiêu 30–50 GB/primary shard. Data stream với rollover `max_primary_shard_size: 40gb`, `max_age: 1d`, template 8 primary (1/hot node): mỗi index ≈ 320 GB, ≈ 1,73 index/ngày ⇒ 13,8 primary/ngày (0,553 TB ÷ 40 GB).
- Hot: 13,8 × 30 ≈ **415 primary** + 415 replica = 830 shard ⇒ **≈ 104 shard/node** (8 node).
- Warm A: 185.241 GB ÷ 40 GB ≈ 4.631 shard ⇒ **≈ 515 shard/node** (9 node), sát giới hạn khuyến nghị ~20 shard/GB heap (31 GB ⇒ ~620). Nếu PoC cho thấy tải heap cao: shrink về 1 shard/index ở warm hoặc thêm node.
- Warm B: 60 ngày ⇒ ≈ 829 shard / 4 node ≈ 207 shard/node.

**Kiểm tra throughput (GIẢ ĐỊNH, PoC bằng Rally).** Ingest bình thường 20k EPS (16 MB/s); thiết kế chịu **peak 2–3× = 40–60k EPS (32–48 MB/s)** và hồi phục backlog sau sự cố. Hot indexing gồm replica: 40k doc/s ở mức thường, ≈ 5k doc/s/node; ở peak 3× = 120k doc/s ≈ 15k doc/s/node — giả định 16 vCPU NVMe chịu được (cần PoC; thường 10–20k doc/s/node với doc 800 B). Logstash giả định ~15k EPS/node với filter regex nhẹ: 4 node = 60k EPS = đúng peak 3×, node thứ 5 là dự phòng.

**Buffer.** Kafka 72h làm bộ đệm chính (ES/Logstash hỏng cuối tuần không mất dữ liệu). Logstash bật `queue.type: persisted` làm đệm phụ. Consumer lag là chỉ số cảnh báo.

## 3. Ingest pipeline

Luồng: Elastic Agent/Filebeat (TLS, ack) → Kafka topic `audit.raw` (key theo nguồn, ACL chặt, retention 72h; **chứa PII chưa che** nên coi là vùng nhạy cảm) → hai consumer group độc lập:

1. **mask** (Logstash): fingerprint raw → mask → ES. Lỗi/không chắc đã che → **fail-closed**: đẩy vào topic `audit.quarantine`, không index.
2. **archive** (Logstash): ghi raw nguyên văn vào kho WORM (mục 5).

**Không dùng ingest-node `redact` processor**: cần license cao hơn Basic. Cũng không dựa vào field-level security (không có ở Basic) để "che khi đọc" — masking phải xảy ra trước index.

Chọn kỹ thuật theo nhu cầu: (a) **xóa/thay `[REDACTED]`** bằng `gsub` cho văn bản tự do; (b) **pseudonymize bằng HMAC-SHA256 có khóa** cho trường cần tương quan (cùng user ⇒ cùng token), khóa nằm trong Logstash keystore/KMS, không nằm trong repo. Hash không khóa không chấp nhận được (email/điện thoại dễ dò ngược bằng từ điển).

Mẫu cấu hình (không chứa secret; `${PII_HMAC_KEY}` lấy từ keystore):

```ruby
input { kafka { bootstrap_servers => "kafka1:9093" topics => ["audit.raw"] group_id => "ls-mask"
                security_protocol => "SSL" codec => "plain"   # plain: [message] = dòng raw NGUYÊN VĂN, chưa parse
                decorate_events => "basic" } }
filter {
  # 1) HMAC trên CHUỖI BYTE NGUYÊN VĂN của Kafka record value (trước parse/mask). Nhánh archive dùng cùng
  #    codec plain và cùng định nghĩa byte => verify job tính lại từ WORM sẽ khớp. Không dùng event.to_json
  #    (đã có @timestamp/@version, thứ tự trường không đảm bảo).
  fingerprint { source => "message" target => "[audit][raw_hmac]" method => "SHA256" key => "${INTEGRITY_HMAC_KEY}" }
  # 2) Parse JSON vào namespace riêng; lỗi parse => tag, sẽ bị cách ly (fail-closed)
  json { source => "message" target => "rec" tag_on_failure => ["pii_leak", "parse_fail"] }
  mutate { remove_field => ["message"] }

  # 3) Pseudonymize trường có cấu trúc cần tương quan (HMAC có khóa)
  if [rec][user][name] {
    fingerprint { source => "[rec][user][name]" target => "[rec][user][name_pseudo]" method => "SHA256" key => "${PII_HMAC_KEY}" }
    mutate { remove_field => ["[rec][user][name]"] }
  }
  # 4) Che MỌI trường chuỗi (đệ quy) theo regex e-mail/phone; danh sách trường PII có cấu trúc
  #    (user.email, source.phone, ...) lấy từ mục 7.8 và bị xóa/thay hẳn
  mutate { remove_field => ["[rec][user][email]", "[rec][source][phone]"] }
  ruby {
    code => '
      email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
      phone = /\+?\d[\d\s.\-()]{7,}\d/
      scrub = lambda do |v|
        case v
        when String then v.gsub(email, "[EMAIL]").gsub(phone, "[PHONE]")
        when Hash   then v.each { |k, x| v[k] = scrub.call(x) }
        when Array  then v.map! { |x| scrub.call(x) }
        else v end
      end
      rec = event.get("rec"); event.set("rec", scrub.call(rec)) if rec
    '
  }
  # 5) Fail-closed: quét lại TOÀN BỘ chuỗi sau khi che; còn dấu hiệu PII hoặc còn trường cấm => cách ly
  ruby {
    code => '
      email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
      walk = lambda { |v| v.is_a?(String) ? !!(v =~ email) : v.is_a?(Hash) ? v.values.any?(&walk) : v.is_a?(Array) ? v.any?(&walk) : false }
      event.tag("pii_leak") if walk.call(event.get("rec")) || event.get("[rec][user][name]")
    '
  }
  mutate { add_field => { "[audit][kafka_topic]" => "%{[@metadata][kafka][topic]}"
                          "[audit][kafka_partition]" => "%{[@metadata][kafka][partition]}"
                          "[audit][kafka_offset]" => "%{[@metadata][kafka][offset]}" } }
}
output {
  if "pii_leak" in [tags] { kafka { topic_id => "audit.quarantine" bootstrap_servers => "kafka1:9093" security_protocol => "SSL" codec => "json" } }
  else { elasticsearch { hosts => ["https://coord1:9200"] data_stream => true data_stream_type => "logs"
                         data_stream_dataset => "audit" data_stream_namespace => "prod"
                         ssl_certificate_authorities => "/etc/logstash/ca.pem" user => "logstash_writer" password => "${ES_PWD}" } }
}
```
(Cấu hình chưa chạy thử; PoC phải kiểm tra byte-khớp giữa HMAC ở nhánh mask và HMAC tính lại từ WORM. Quarantine chứa PII chưa che nên cùng mức nhạy cảm như `audit.raw`, retention ngắn. Lưu ý: regex điện thoại rộng có thể che nhầm số khác — tinh chỉnh bằng dữ liệu mẫu ở PoC; mapping phải tường minh, `dynamic: strict`. Kafka offset trong doc cho phép lần ngược từ ES sang raw trong WORM.)

## 4. ILM policy

Chỉ dùng hot → warm → delete. **Không có phase cold/frozen kiểu searchable snapshot.** Policy mẫu (Phương án A; B xem ghi chú):

```json
PUT _ilm/policy/audit-12m
{ "policy": { "phases": {
  "hot":  { "actions": { "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
                         "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "30d",
            "actions": { "readonly": {},
                         "forcemerge": { "max_num_segments": 1 },
                         "allocate": { "number_of_replicas": 0 },
                         "set_priority": { "priority": 50 } } },
  "delete": { "min_age": "365d",
              "actions": { "wait_for_snapshot": { "policy": "audit-daily" }, "delete": {} } }
} } }
```
- `min_age` tính từ thời điểm rollover. Bỏ replica ở warm chỉ an toàn **khi đã có snapshot**: SLM chạy hằng ngày, và cần giám sát để snapshot gần nhất hoàn tất trước khi giảm replica. Rủi ro: mất 1 warm node ⇒ shard unassigned đến khi restore từ snapshot (chấp nhận được vì không yêu cầu SLA interactive 100% cho dữ liệu cũ; nếu không chấp nhận, giữ 1 replica: warm 523 TB).
- Ranh giới: `min_age` tính từ rollover (không phải từ ngày sinh log) nên warm/delete có thể lệch tối đa khoảng 1 ngày so với "ngày sinh log"; chấp nhận được, khách xác nhận (7.3).
- Phương án B: đổi `delete.min_age` = `90d` (xóa khỏi cụm, **vẫn còn trong snapshot/WORM đến 365d**); `wait_for_snapshot` bắt buộc.
- Xóa 12 tháng: `delete` chỉ xóa khỏi ES; thời hạn hủy dữ liệu pháp lý do khách xác nhận (giữ thêm nếu có legal hold) — mục 7.
- SLM mẫu:
```json
PUT _slm/policy/audit-daily
{ "schedule": "0 30 1 * * ?", "name": "<audit-{now/d}>", "repository": "audit_s3",
  "config": { "indices": ["logs-audit-prod"], "include_global_state": false },
  "retention": { "expire_after": "365d", "min_count": 30, "max_count": 500 } }
```
**Retention SLM vs "xóa sau 12 tháng":** `expire_after` tính từ lúc tạo snapshot, nên log bị xóa khỏi ES ở ngày 90 (B) hoặc 365 (A) vẫn nằm trong snapshot đến khoảng ngày 455 hoặc 730 sau ngày sinh log. Để không vượt 12 tháng, đặt `expire_after` = 365d trừ tuổi dữ liệu tối thiểu còn cần (ví dụ snapshot hằng ngày chứa cả 365 ngày: dùng snapshot đầy đủ gần nhất cho đến khi dữ liệu cũ nhất hết hạn, rồi xóa), hoặc chấp nhận tối đa ~2× và ghi vào 7.3. Mặc định tài liệu này: `expire_after` 365d và **khách xác nhận** việc PII (đã che) còn trong snapshot tới ~24 tháng; raw WORM vẫn hết hạn đúng 12 tháng.

Repo `audit_s3` (S3-compatible, mã hóa phía server/KMS, bucket versioning). Mỗi quý **thử restore thật** và ghi biên bản.

## 5. Toàn vẹn / chứng cứ pháp lý

**Elasticsearch KHÔNG tự bảo đảm bất biến**: bất kỳ ai có quyền ghi/xóa index hoặc superuser đều sửa/xóa được document; `readonly` block chỉ là cờ cấu hình, gỡ được. Vì vậy chứng cứ nằm ở lớp ngoài ES; ES chỉ là bản để tìm kiếm.

1. **Raw gốc vào WORM trước/song song khi mask.** Logstash "archive" gom batch (5 phút hoặc 256 MB, theo từng Kafka partition), nén gzip, ghi vào bucket **S3 Object Lock chế độ Compliance** (hoặc tương đương: WORM appliance), retention ≥ 12 tháng (+ legal hold khi cần), mã hóa SSE-KMS. Quyền ghi chỉ cho role archive; không ai (kể cả root account) rút ngắn được retention ở chế độ Compliance.
2. **Chuỗi hash theo lô.** Mỗi batch `n` của một partition: `sha256_n = SHA256(file)`; `chain_n = HMAC_SHA256(K_chain, chain_{n-1} ‖ sha256_n ‖ topic ‖ partition ‖ offset_from ‖ offset_to ‖ count)`. Ghi vào manifest (JSON-lines) cũng nằm trong WORM. Chèn/xóa/sửa/đổi thứ tự lô làm gãy chuỗi.
3. **Ký và timestamp hằng ngày.** Cuối ngày (UTC) gom manifest ⇒ `daily_manifest.json` (gồm chain_tip từng partition, tổng event, đối soát offset) ⇒ ký bằng khóa riêng trong KMS/HSM (khóa ký tách khỏi `K_chain`) ⇒ xin **RFC 3161 timestamp** từ TSA độc lập bên ngoài; lưu `.sig` và `.tsr` vào WORM. Timestamp chứng minh manifest tồn tại không muộn hơn thời điểm đó.
4. **Liên kết ES ↔ raw.** Khóa liên kết **chính** là `kafka_topic/partition/offset` (tìm lại lô và dòng raw trong WORM). `audit.raw_hmac` là HMAC-SHA256 trên **chuỗi byte nguyên văn của Kafka record value** (đúng chuỗi nhánh archive ghi vào WORM, trước parse/mask), nên tái lập được từ WORM; nó chỉ chứng minh quan hệ với chuỗi byte đó, không phải với JSON đã parse.
5. **Snapshot repo immutable (bổ sung, không thay thế).** Lưu ý kỹ thuật: Elasticsearch cần ghi/xóa blob trong repo (cập nhật `index-N`, dọn snapshot) nên **Object Lock compliance trực tiếp trên repo ES có thể làm hỏng thao tác ES**; cách an toàn là bật bucket versioning + deny-delete policy + role riêng cho ES, và **sao chép định kỳ sang bucket khóa** (replication), PoC kiểm tra. Bản chứng cứ chính vẫn là WORM raw ở mục 1.
6. **Verify job (cron hằng ngày + kiểm sâu hằng tháng):** (i) tải manifest, kiểm chữ ký + timestamp; (ii) tính lại chuỗi `chain_n` từ đầu hoặc từ điểm kiểm tra đã ký; (iii) đối soát số event ES (theo partition/offset) với manifest — chênh ⇒ cảnh báo; (iv) mẫu ngẫu nhiên: lấy doc ES, lấy dòng raw theo topic/partition/offset từ WORM, tính lại HMAC trên chuỗi byte nguyên văn, so với `raw_hmac`. Kết quả ký và lưu vào WORM.
7. **Kiểm soát truy cập (Basic):** TLS cho HTTP và transport; xác thực native/file realm; **RBAC có sẵn ở Basic** (role theo index/cluster privilege). Phân quyền: `ingest_writer` (chỉ `create_doc` vào data stream), `auditor_reader` (read), `admin` tách người, không dùng `elastic` cho vận hành. 
8. **Giới hạn của Basic và biện pháp bù:**
   - Không có **field-level / document-level security** ⇒ ai đọc được index thấy mọi trường. Bù: chia index theo mức nhạy cảm, PII đã che ngay từ trước index, raw chỉ ở WORM với IAM riêng.
   - Không có **audit logging của Elastic** (ai truy vấn/sửa gì) ⇒ Bù: reverse proxy (nginx/HAProxy) trước coordinating node ghi access log đầy đủ (user, URI, body hash) gửi sang hệ thống log riêng/WORM; bật slow log và log của Kibana; CloudTrail/log truy cập bucket; cấm truy cập trực tiếp vào node ngoài proxy.
   - Kibana alerting ở Basic bị giới hạn (ít loại connector; không có đầy đủ như tier cao hơn) ⇒ cảnh báo verify job/snapshot nên gửi qua kênh ngoài (cron + mail/webhook), không dựa hoàn toàn vào Kibana.
   - Không có alerting nâng cao/kết nối LDAP-SAML ở Basic (SSO cần license cao hơn) ⇒ dùng tài khoản native + quản lý vòng đời tài khoản thủ công, hoặc proxy xác thực phía trước.

## 6. Rủi ro / mâu thuẫn trong đầu vào và xử lý

**a. "Dùng searchable snapshots cho cold/frozen" ↔ license Basic.** Searchable snapshots (cả cold và frozen tier) cần license **Enterprise**; mâu thuẫn trực tiếp với ràng buộc Basic ⇒ **KHÔNG áp dụng đề xuất của khách**. (Ghi chú: snapshot/restore thông thường và SLM có ở Basic.) Thay thế: (A) warm tier thường chứa dữ liệu cũ (bỏ replica nhờ snapshot, `best_compression`, force-merge) hoặc (B) snapshot + restore on-demand. Nếu khách vẫn muốn searchable snapshots thì phải nâng license — là thay đổi ràng buộc, cần khách quyết định.

**b. "Tìm được trong 24 giờ" cho dữ liệu cũ.** Thiết kế:
- **Phương án B (khuyến nghị tiết kiệm):** warm giữ 31–90 ngày; từ 91 ngày–12 tháng chỉ nằm trong snapshot repo. Khi có yêu cầu: restore index theo khoảng ngày vào **cụm tạm** (hoặc vào warm B nếu còn chỗ) rồi tìm.
- Thời gian restore (GIẢ ĐỊNH tốc độ tổng hợp 0,5 GB/s từ object storage vào cụm tạm, chưa đo): 1 ngày (0,553 TB) ≈ 18 phút; 7 ngày (3,87 TB) ≈ 2,2 giờ; 30 ngày (16,59 TB) ≈ 9,2 giờ; toàn bộ 335 ngày (185,2 TB) ≈ 103 giờ ≈ 4,3 ngày (**vượt 24h** nếu cần tất cả một lúc ⇒ phải giới hạn phạm vi theo khoảng ngày, hoặc dùng Phương án A). Cần cộng thời gian dựng cụm tạm (IaC sẵn, ≈ 30–60 phút giả định) và tìm kiếm.
- **Runbook:** (1) tiếp nhận yêu cầu + khoảng thời gian + người duyệt; (2) chọn snapshot, tính dung lượng/thời gian; (3) dựng cụm tạm bằng IaC (≥ dung lượng × 1,2, 0 replica, TLS, RBAC như prod, cô lập mạng); (4) đăng ký repo **read-only**; (5) `POST _snapshot/audit_s3/<snap>/_restore` chỉ các index cần (`rename_pattern` nếu restore vào cụm prod); (6) chờ `_cat/recovery` xong; (7) cấp quyền đọc cho người yêu cầu, ghi log truy cập; (8) xong thì hủy cụm và xóa dữ liệu tạm, ghi biên bản. Mục tiêu tổng ≤ 24h cho phạm vi ≤ ~30 ngày.
- **Phương án A (interactive cả 12 tháng):** warm 9 node/270 TB. Chênh so với B: **+5 node và +≈223 TB đĩa local** (308 TB vs 94 TB local; object storage 242 TB cần cả hai). Chi phí tuyệt đối tuỳ đơn giá khách (chưa có số); A đổi lại: không phụ thuộc quy trình restore, search ngay, nhưng vận hành nhiều node hơn. Nên quyết định theo tần suất truy vấn dữ liệu >90 ngày.

**c. Masking trước index ↔ "provably unaltered".** Dữ liệu trong ES đã bị biến đổi nên bản ES **không phải bản gốc**. Xử lý: tính HMAC/hash của **raw trước khi mask**, lưu **raw nguyên văn trong WORM** (mục 5) với quyền truy cập hạn chế (break-glass, có phê duyệt và log), còn bản ES là bản làm việc đã che, mang `raw_hmac` để chứng minh nguồn gốc. **Cần xác nhận pháp lý với khách**: tòa/cơ quan có chấp nhận chứng cứ là raw WORM + bản đã che, và việc giữ raw chứa PII 12 tháng có phù hợp quy định bảo vệ dữ liệu cá nhân hay không (có thể xung đột nếu luật yêu cầu không lưu PII dạng rõ).

**d. Rủi ro khác.**
- *Pseudonymize không đảo ngược:* mất khả năng điều tra từ token về người thật nếu không có raw; tra cứu cần quy trình mở WORM raw. Nếu mất `PII_HMAC_KEY` hoặc đổi khóa thì token cũ/mới không khớp ⇒ không tương quan được.
- *Quản lý khóa HMAC/ký:* khóa trong KMS/HSM hoặc Logstash keystore, xoay vòng có kế hoạch (ghi `key_id` vào doc/manifest để verify theo đúng khóa), tách khóa chain / PII / ký; sao lưu khóa có kiểm soát — mất khóa là mất khả năng verify.
- *Đồng bộ thời gian:* NTP/chrony với ≥ 3 nguồn trên mọi node; lệch giờ làm sai `@timestamp`, rollover, manifest theo ngày và giá trị timestamp pháp lý; dùng UTC; giám sát offset.
- *DR single-region:* cả cụm, Kafka, WORM nằm một region ⇒ mất region là mất dịch vụ; WORM/snapshot nên bật cross-region replication (khuyến nghị) — nếu khách chấp nhận single-region thì ghi rõ RPO/RTO. RPO tối đa ≈ 1 ngày cho ES (SLM), ≈ vài phút cho raw WORM.
- *Warm 0 replica:* mất node ⇒ shard unassigned đến khi restore; chấp nhận hoặc thêm replica (gấp đôi warm).
- *Chi phí:* tổng đĩa A ≈ 308 TB local + 242 TB object + 91 TB WORM; B ≈ 94 TB local + cụm tạm. Mapping kém có thể đẩy index lên ≥ 1× raw, nhân đôi–gấp ba các con số trên.
- *Throughput/sizing chưa kiểm chứng:* mọi năng lực node là giả định; PoC trước khi mua.
- *Basic không có field/doc security, audit log, SSO* — xem mục 5.8.

## 7. Giả định cần khách xác nhận

1. Tải 20.000 EPS **trung bình ổn định 24/7**, peak 2–3× (khách cho biết peak thật?); event 800 B là kích thước raw trung bình (JSON hay syslog?).
2. `INDEX_RATIO` = 0,4 và `RAW_GZ_RATIO` = 0,15 — **chưa kiểm chứng**, sẽ đo bằng PoC với mẫu thật.
3. "12 tháng" = 365 ngày; hết hạn thì **xóa** (hay giữ theo legal hold?). Chấp nhận snapshot ES giữ dữ liệu (đã che) lâu hơn 12 tháng tối đa ~12 tháng (mục 4) và ranh giới ILM lệch ≤ ~1 ngày?
4. "30 ngày gần nhất tìm interactive" = hot 30 ngày; chấp nhận dữ liệu 31 ngày+ chậm hơn (warm) hoặc phải restore.
5. Chọn Phương án A hay B cho dữ liệu cũ; tần suất & phạm vi truy vấn dữ liệu >90 ngày; chấp nhận restore 18 phút–9 giờ tùy phạm vi, và rằng "toàn bộ 12 tháng trong 24h" không đạt ở B.
6. Chấp nhận warm 0 replica (dựa vào snapshot); RPO ES ≈ 1 ngày.
7. Pháp lý: raw chứa PII được lưu trong WORM có được phép không; bản đã che + HMAC của raw đủ làm chứng cứ không; thời hạn và đối tượng được truy cập raw; chọn TSA.
8. Danh sách trường PII ngoài username/e-mail/điện thoại (IP? họ tên trong text?) và định dạng số điện thoại cần che.
9. Hạ tầng: cloud hay on-prem; có S3 Object Lock hoặc WORM tương đương; có KMS/HSM; single-region được chấp nhận hay cần DR cross-region.
10. Xác nhận đồng ý **bỏ searchable snapshots** và ở lại Basic; không dùng `redact`, FLS/DLS, audit log Elastic, SSO.
11. Năng lực node, tốc độ restore 0,5 GB/s và thời gian dựng cụm tạm là giả định — PoC xác nhận.
12. Quy trình xử lý sự kiện lệch giờ/event đến muộn (late events) và định nghĩa "ngày" (UTC).

## Phụ lục A — Lệnh tính (đã chạy)

```bash
python3 - <<'E'
eps=20000;b=800
d=eps*86400*b
print(eps*b/1e6, eps*86400, d/1e12, d/2**40, d*365/1e12, d*365/2**40)   # 16.0 1728000000 1.3824 1.2573 504.576 458.909
idx=d*0.4/1e12                                                          # 0.55296 TB/ngày
print(idx*30*2, idx*30*2*1.2/0.85, idx*335, idx*335*1.2/0.85, idx*365, idx*365*1.2)  # 33.18 46.84 185.24 261.5 201.83 242.2
print(idx*1000/40, idx*1000/40*30)                                       # 13.8 shard/ngày, 414.7 primary/30 ngày
# restore @0.5 GB/s: 1d 18.4 phút; 7d 2.15 giờ; 30d 9.2 giờ; 335d 102.9 giờ
E
```
