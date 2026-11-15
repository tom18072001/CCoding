# Audit-Log Platform on the Elastic Stack (Basic licence): Architecture and Sizing Proposal

Data classification of this document: internal.
Status: design proposal. It has been through a design-level security review but not a release gate. No component has been benchmarked yet, so every figure below comes from a stated assumption.

---

## 1. Summary & key decisions

The proposal is a single Elasticsearch cluster with a **hot tier** that holds the last 30 days on NVMe with one replica, and a **warm tier** that holds days 31 to 365 on HDD with no replica, force-merged and read-only. Snapshots go to object storage and serve only as disaster recovery. A Logstash layer masks PII before anything is indexed. In parallel it writes the **unmasked raw event** and its SHA-256 to a separate WORM object store (S3 Object Lock, compliance mode). A small "sealer" service builds a Merkle tree over those hashes every minute, signs the root and gets an RFC 3161 timestamp for it. **The WORM copy is the legal original. The Elasticsearch index is a derived, masked working copy.**

The cluster needs 3 master, 9 hot and 12 warm nodes, plus 6 Logstash and 2 Kibana servers (32 servers in total). It stores 411.6096 TB of cluster disk and 345.752064 TB of snapshot repository. The WORM store adds 127.0963942272 TB.

| # | Decision | Rationale |
|---|---|---|
| K1 | **Decline the customer's searchable-snapshots suggestion.** Searchable snapshots, and the frozen tier that depends on them, require an Enterprise subscription. They are not in Basic. | Hard budget constraint: Basic only (§8, C1). |
| K2 | **Plan A (recommended):** data older than 30 days stays online on a warm HDD tier with replica 0 and snapshots for recovery. **Plan B (alternative):** older data exists only as snapshots and is restored on request. | Plan A meets the 24 h requirement for any scope. Plan B meets it only for about one month of data per request and depends on an unmeasured restore throughput (§3.6). |
| K3 | Mask PII in **Logstash**: HMAC-SHA256 pseudonyms via `fingerprint` with `key`, plus `gsub` for free text. The Elasticsearch ingest pipeline is only a final safety net. | The `redact` ingest processor requires Platinum (§8, C2). |
| K4 | The legal original is the **unmasked raw event as received by Logstash**. It is stored encrypted in WORM and protected by SHA-256, a per-minute Merkle root, a signature and an RFC 3161 timestamp. | Masking before indexing means the index cannot be the evidence (§8, C3). |
| K5 | Access accountability comes from reverse-proxy access logs and OS `auditd`, both shipped to WORM. RBAC, TLS and index read-only blocks are secondary controls. | Elasticsearch audit logging and field/document-level security are not in Basic (§8, C4). |

Biggest risks:
1. Every compression and throughput figure is an assumption until a benchmark is run on representative logs (A3, A12, A13, A15).
2. Compliance-mode WORM conflicts with personal-data erasure rights (C5).
3. Losing the WORM encryption key means losing the evidence (R3).

---

## 2. Inputs & named assumptions

### 2.1 Customer inputs
- 20,000 events/s sustained, 24/7. Average raw event size is 800 bytes.
- Retention is 12 months. The last 30 days must be interactively searchable. Older data must be searchable within 24 h of a request.
- Logs are legal evidence and must be provably unaltered.
- Usernames, e-mail addresses and phone numbers must be masked before indexing.
- Elastic **Basic** licence only.
- Customer suggestion: use searchable snapshots for the cold/frozen tier.

### 2.2 Assumptions
Units: TB = 10^12 B, GB = 10^9 B and MB = 10^6 B (all decimal). TiB is shown only for reference. Figures are exact outputs of the sizing calculation and are not rounded by hand.

| ID | Assumption | Status |
|---|---|---|
| A1 | EPS = 20000 events/s, sustained 24/7 | customer input |
| A2 | Average raw event = 800 B (decimal) | customer input |
| A3 | Index size / raw size = **0.6** with `best_compression`, a minimal strict mapping, masked fields and `match_only_text` for `message`. Sensitivity: 0.4 / 0.6 / 0.8 | **to benchmark** on sample logs |
| A4 | Hot phase: ILM moves to warm at `min_age 30d` counted from rollover, so up to 31 days of events sit in hot. Hot replicas = 1 | design |
| A5 | Delete at `min_age 365d` from rollover, so up to 366 days are in the cluster. Warm holds 335 days with replicas = 0 | design |
| A6 | Disk headroom for the disk watermarks = 0.20 (0.15 shown as sensitivity). Disk needed = data / (1 − headroom) | design |
| A7 | Target primary shard size (`max_primary_shard_size`) = 40 GB | design |
| A8 | Hot node: 128 GB RAM, 30 GB heap, 7.68 TB usable NVMe | hardware assumption |
| A9 | Warm / restore-pool node: 128 GB RAM, 30 GB heap, 32 TB usable HDD | hardware assumption |
| A10 | Maximum shards per node = 20 × heap GB (conservative) | design |
| A11 | Snapshot repository = primaries × 1.0 × 1.05. Plan A adds 31 days of pre-force-merge segment churn. Plan B adds none | assumption |
| A12 | Restore SLA budget: 4 h approval + 2 h open/verify inside the 24 h. Default scope is 30 days. Per-node restore rate is 40 / 100 / 200 MB/s, with **100 MB/s selected** | **UNVERIFIED, must be benchmarked** |
| A13 | WORM: compressed/raw = **0.15** (sensitivity 0.10 / 0.25), overhead 0.01, hash line 65 B per event (hex SHA-256 + LF), retention 395 days (365 + margin for ILM lag) | **to benchmark** |
| A14 | Merkle sealing: 1440 batches/day × 6544 B (root 32 + signature 512 + RFC 3161 token 5000 + manifest 1000) | assumption |
| A15 | Logstash: peak factor 2, 8000 EPS per node, N+1 spare, persistent-queue buffer of 4 h × 1.5 | **UNVERIFIED, benchmark** |
| A16 | Masters ×3: 8 GB RAM / 4 GB heap / 100 GB SSD. Kibana ×2: 8 GB RAM / 2 vCPU | assumption |
| A17 | Elastic Stack 8.x (≥ 8.8, needed for the `reroute` processor) or 9.x, self-managed | assumption |
| A18 | An S3-compatible object store that supports Object Lock **compliance mode** is available for both the snapshot repository and WORM. Provider and region are not yet decided (Q3) | open question |
| A19 | "Searchable within 24 h" runs from the customer's request until the data is searchable in Kibana (see Q1) | working assumption, to confirm |
| A20 | Sources deliver structured fields (`user.name`, `user.email`, `user.phone`) where those values exist | to confirm (Q6) |

---

## 3. Capacity arithmetic

### 3.1 Raw volume
Formula: raw/s = 20000 × 800 B. raw/day = raw/s × 86400.

| Quantity | Value |
|---|---|
| Raw per second | 16000000 B/s = 16 MB/s = 15.2587890625 MiB/s |
| Events per day | 1728000000 |
| Events per year | 630720000000 |
| **Raw per day** | **1.3824 TB** (1.25728547573089599609375 TiB) |
| **Raw per year (365 d)** | **504.576 TB** (458.90919864177703857421875 TiB) |
| Raw for 366 d (maximum held in cluster, A5) | 505.9584 TB (460.1664841175079345703125 TiB) |

### 3.2 Compression assumption (A3) and sensitivity
Index primaries/day = raw/day × ratio. The selected ratio is **0.6**. That figure assumes several things:
- the masked document replaces each PII value with a 64-hex HMAC;
- `event.original` is dropped;
- the mapping is `dynamic: strict` and keeps doc values only where needed;
- `best_compression` is applied at force-merge.

Audit logs often compress better than this, but HMAC tokens and the hash field do not compress. The ratio must be replaced by a measured value from a 24 h sample before ordering hardware.

All rows below use headroom 0.20.

| A3 ratio | Primaries/day | Primary shards/day | Hot data (31 d, ×2) | Hot disk | Hot nodes | Warm data (335 d, ×1) | Warm disk | Warm nodes | Snapshot repo (plan A) |
|---|---|---|---|---|---|---|---|---|---|
| 0.4 | 0.55296 TB | 14 | 34.28352 TB | 42.8544 TB | 6 | 185.2416 TB | 231.552 TB | 8 | 230.501376 TB |
| **0.6 (selected)** | **0.82944 TB** | **21** | **51.42528 TB** | **64.2816 TB** | **9** | **277.8624 TB** | **347.328 TB** | **12** | **345.752064 TB** |
| 0.8 | 1.10592 TB | 28 | 68.56704 TB | 85.7088 TB | 12 | 370.4832 TB | 463.104 TB | 16 | 461.002752 TB |

Headroom sensitivity at ratio 0.6 and headroom 0.15:
- Hot disk is 60.50032941176470588235294118 TB, which needs 8 hot nodes.
- Warm disk is 326.8969411764705882352941176 TB, which needs 11 nodes by capacity but still 12 by shard count.

### 3.3 Storage per tier, including replicas (selected: A3 = 0.6, headroom 0.20)

| Tier | Contents | Replicas | Data | Disk incl. headroom | Shards |
|---|---|---|---|---|---|
| Hot (NVMe) | last 31 days | 1 (primary + 1 replica) | 51.42528 TB (46.7710196971893310546875 TiB) | 64.2816 TB (58.463774621486663818359375 TiB) | 1302 (pri+rep) |
| Warm (HDD), plan A | days 31–366 (335 d) | 0 (recovery comes from snapshot) | 277.8624 TB (252.71438062191009521484375 TiB) | 347.328 TB (315.8929757773876190185546875 TiB) | 7035 |
| Restore pool (HDD), plan B | one 30-day request | 0 | 24.8832 TB (22.6311385631561279296875 TiB) | 31.104 TB (28.288923203945159912109375 TiB) | 630 |

The average primary shard is 39.49714285714285714285714286 GB, with 21 primary shards per day.

**Why there is no separate cold tier.** Without searchable snapshots, a Basic "cold" tier is just another set of HDD nodes holding normal indices. That is exactly what warm with replica 0 already provides. A separate phase would add allocation moves but save no storage. The ILM policy therefore uses the hot, warm and delete phases only.

**Why warm has replica 0.** Data older than 30 days only has to be searchable within 24 h. If a warm node is lost, its shards are restored from the latest snapshot inside that window (runbook R5). This halves warm storage compared with replica 1.

### 3.4 Snapshot repository (object storage, not the evidence store)

| Plan | Basis | Size |
|---|---|---|
| A | (366 d of primaries + 31 d of pre-merge churn) × 1.05 | 345.752064 TB (314.4596703350543975830078125 TiB) |
| B | 366 d of primaries × 1.05 | 318.753792 TB (289.904884994029998779296875 TiB) |

### 3.5 Totals and plan comparison

| | Plan A: warm HDD, replica 0 + snapshot DR (**recommended**) | Plan B: snapshot-only, restore on request |
|---|---|---|
| ES nodes | 24 (3 master + 9 hot + 12 warm) | 16 (3 master + 9 hot + 4 restore pool) |
| Servers incl. 6 Logstash + 2 Kibana | 32 | 24 |
| Cluster disk required | 411.6096 TB (374.3567503988742828369140625 TiB) | 95.3856 TB (86.75269782543182373046875 TiB) |
| Snapshot repository | 345.752064 TB | 318.753792 TB |
| ES side + repo (excluding WORM) | 757.361664 TB (688.816420733928680419921875 TiB) | 414.139392 TB (376.657582819461822509765625 TiB) |
| Online shards | 8337 | 1932 |
| Data older than 30 days | searchable immediately, any range | searchable only after a restore |

Plan B saves 343.222272 TB of disk and 8 servers. The price is a bounded scope per request and an SLA that rests on an unmeasured number (§3.6).

### 3.6 Plan B restore arithmetic (24 h requirement, A12, A19)
- Restore window = 24 h − 4 h approval − 2 h open/verify = 18 h = 64800 s.
- Restoring 30 days (replica 0) means 24.8832 TB, which requires an aggregate 384.0 MB/s = 3.072 Gbit/s.
- Nodes needed by per-node throughput:
  - 40 MB/s: 10 nodes
  - **100 MB/s (selected): 4 nodes**
  - 200 MB/s: 2 nodes
- With 4 nodes at 100 MB/s, a 30-day restore takes 17.28 h, plus 4 h approval and 2 h verification. That leaves 0.72 h of slack.
- The maximum restorable inside the window with a 4-node pool at 100 MB/s is 31.25 days.
- Scope sensitivity (a legal request may cover more than a month):

| Scope | Volume | Aggregate rate | Nodes @100 MB/s | Nodes @40 MB/s |
|---|---|---|---|---|
| 30 d | 24.8832 TB | 384.0 MB/s | 4 | 10 |
| 90 d | 74.6496 TB | 1152.0 MB/s | 12 | 29 |
| 180 d | 149.2992 TB | 2304.0 MB/s | 24 | 58 |
| 335 d | 277.8624 TB | 4288.0 MB/s | 43 | 108 |

**Conclusion.** The requirement does not limit the scope of a request, and Plan B cannot guarantee 24 h beyond about one month of data. Plan A is therefore recommended. Plan B is acceptable only if the customer contractually caps request scope (Q2) **and** a restore benchmark meets at least 100 MB/s per node.

### 3.7 WORM evidence store (unmasked raw, encrypted; A13, A14)
WORM per day = raw/day × 0.15 × 1.01 (compressed and encrypted raw), plus events/day × 65 B (hash list), plus 1440 × 6544 B (Merkle seals).

| Item | Value (selected ratio 0.15) |
|---|---|
| Raw, compressed and encrypted, per day | 0.2094336 TB (0.190478749573230743408203125 TiB) |
| Hash list per day | 0.11232 TB (0.1021544449031352996826171875 TiB) |
| Merkle roots, signatures, timestamps and manifests per day | 9423360 B = 9.42336 MB |
| **WORM total per day** | **0.32176302336 TB** (0.2926417649723589420318603516 TiB) |
| WORM total, 365 d | 117.4435035264 TB (106.8142442149110138416290283 TiB) |
| **WORM total, 395 d (retention incl. margin)** | **127.0963942272 TB** (115.5934971640817821025848389 TiB) |

Sensitivity at 395 days:

| Compressed/raw ratio | WORM total |
|---|---|
| 0.10 | 99.5209702272 TB |
| 0.25 | 182.2472422272 TB |

The hash list cannot be compressed. A later optimisation is to store only raw objects plus Merkle seals, because leaf hashes can be recomputed from the raw data (R9).

### 3.8 Logstash tier (A15)
- Peak EPS = 40000. That needs 5 nodes, plus 1 spare, so **6 nodes**.
- The persistent-queue buffer is 4 h at the sustained rate × 1.5 = 345.6 GB in total. Spread over N−1 nodes that is 69.12 GB per node.
- WORM raw objects per day (1-minute rotation × 6 nodes) = 8640.

---

## 4. Node layout per tier

| Role | Count | RAM / heap | Disk per node | Node roles / notes |
|---|---|---|---|---|
| Dedicated master | 3 | 8 GB / 4 GB | 100 GB SSD | `master` only (voting). Spread across 3 failure domains |
| Hot | 9 | 128 GB / 30 GB | 7.68 TB NVMe | `data_hot`, `data_content`, `ingest`. `number_of_shards` = 9, replicas 1. An index rolls over at 9 × 40 GB = 360 GB, which is 2.304 rollovers/day (plus `max_age 1d`) |
| Warm, **plan A** | 12 | 128 GB / 30 GB | 32 TB HDD | `data_warm`. Replica 0, force-merged to 1 segment, read-only. Node count is driven by **shard count** (12) rather than capacity (11) |
| Restore pool, **plan B only** | 4 | 128 GB / 30 GB | 32 TB HDD | `data_cold`, used only as the restore target. Idle or stopped between requests. Count is driven by restore throughput |
| Logstash | 6 | 16 GB / 8 GB heap, 8 vCPU | 200 GB SSD, encrypted (persistent queue + S3 temp files) | 5 for peak + 1 spare. Holds unmasked data in transit, so it is hardened (§5.4) |
| Kibana | 2 | 8 GB, 2 vCPU | — | Reached only through the reverse proxy |
| Reverse proxy (TLS, access log) | 2 (assumption, not sized by the calculation) | small | small | Single entry point to the ES and Kibana APIs. Access logs go to WORM (D5) |
| Sealer service | 2, active/passive (assumption, not sized) | small | small | Builds the Merkle tree, signs the root and gets the RFC 3161 timestamp each minute |

Shard limits: at A10 a node may hold 600 shards. Warm holds 7035 shards on 12 nodes. If the shard target is raised from 40 GB toward 50 GB, the warm count could drop to the capacity bound. That variant has not been calculated.

Network zones:
1. Ingest zone (Logstash).
2. Cluster zone (ES nodes). It accepts connections only from Logstash, the proxy and the snapshot endpoint.
3. Access zone (proxy, Kibana).
4. Evidence zone (WORM bucket, KMS/HSM, sealer). This zone runs under a separate cloud account or administrative boundary, and ES administrators hold no credentials for it.

---

## 5. Ingest pipeline and PII masking

### 5.1 Data flow
```
source hosts ──TLS──▶ Elastic Agent / Filebeat ──TLS──▶ Logstash (×6, persistent queue, DLQ, encrypted disk)
                                                         │ 1 copy raw → [@metadata][raw]   (legal original, never sent to ES)
                                                         │ 2 SHA-256(raw) → event.hash.raw_sha256
                                                         │ 3 drop event.original
                                                         │ 4 normalise + HMAC-SHA256 user.name / email / phone
                                                         │ 5 gsub e-mail / phone in free text
                                                         ├──▶ WORM bucket: raw objects (gzip, SSE-KMS, 1-min rotation)   ◀─ evidence
                                                         ├──▶ WORM bucket: hash list (one SHA-256 per line)              ◀─ evidence
                                                         └──▶ Elasticsearch data stream audit-events-prod
                                                                (_id = raw hash; ingest pipeline audit-final-check)
sealer (every minute): hash lists ─▶ Merkle root ─▶ sign (HSM/KMS) ─▶ RFC 3161 TSA ─▶ WORM (seal + manifest, chained)
Elasticsearch ──SLM──▶ snapshot repository bucket (DR only)
users ─▶ reverse proxy (access log → WORM) ─▶ Kibana / ES API
```
Sensitive hops are the source → Logstash leg, Logstash disk and Logstash → WORM, because they carry unmasked raw data. Every hop after the Elasticsearch output carries masked data only.

### 5.2 Masking design
Field PII is pseudonymised with a keyed hash:
- **Structured fields** (`user.name`, `user.email`, `user.phone`) are normalised first. E-mail is lower-cased. Phone numbers have separators stripped and are converted to E.164; for example a national `0…` prefix becomes `+84…` (the country code is an assumption, Q4). The normalised value is then replaced by **HMAC-SHA256** using Logstash `fingerprint` with `key`, and the original field is removed. The same person always maps to the same token, so investigators can correlate events. To search for a known user, they compute the HMAC of the value (an approved tool does this) and query the `*_hmac` field.
- **Free text** (`message`) gets `gsub` that replaces e-mail and phone patterns with `[EMAIL]` / `[PHONE]`. This is hard redaction. No correlation is needed there, and over-masking is preferred to under-masking.
- `pii.key_version` records which HMAC key produced the tokens.

HMAC keys:
- They live outside the cluster (Vault / KMS / HSM) and reach Logstash through its keystore. They are never stored in pipeline files or Git.
- The HMAC key custodian is a different person from the ES admin and from the WORM-key custodian.
- Keys rotate yearly (assumption) or on suspected compromise. Old keys are kept in derive-only mode for the retention period plus any litigation hold, so that old tokens remain searchable. To find a user, compute tokens with every live key version.
- Documents are never re-indexed to change tokens.

Pseudonymised data is still personal data. The key must stay secret because phone numbers are easy to brute-force if the key leaks.

### 5.3 Logstash pipeline (reference configuration)
```
# logstash.yml
queue.type: persisted
queue.max_bytes: 200gb
dead_letter_queue.enable: true
```
```
input {
  beats { port => 5044 ssl_enabled => true
          ssl_certificate => "/etc/logstash/tls/ls.crt" ssl_key => "/etc/logstash/tls/ls.key" }
}
filter {
  # 1. Legal original: unmasked bytes as received, kept only in @metadata (never indexed)
  mutate { copy => { "message" => "[@metadata][raw]" } }
  # 2. Integrity hash of the legal original
  fingerprint { source => "[@metadata][raw]" target => "[event][hash][raw_sha256]" method => "SHA256" }
  # 3. Never forward a second unmasked copy; drop shipper noise not in the strict mapping
  mutate { remove_field => ["[event][original]", "@version", "agent", "ecs", "input", "log"] }

  # 4. Normalise, then pseudonymise structured PII with HMAC-SHA256 (key from keystore/Vault)
  if [user][email] { mutate { lowercase => ["[user][email]"] } }
  if [user][phone] {
    mutate { gsub => [ "[user][phone]", "[ ().-]", "", "[user][phone]", "^0", "+84" ] }   # country code: Q4
  }
  if [user][name] {
    fingerprint { source => "[user][name]"  target => "[user][name_hmac]"  method => "SHA256" key => "${PII_HMAC_KEY}" }
    mutate { remove_field => ["[user][name]"] }
  }
  if [user][email] {
    fingerprint { source => "[user][email]" target => "[user][email_hmac]" method => "SHA256" key => "${PII_HMAC_KEY}" }
    mutate { remove_field => ["[user][email]"] }
  }
  if [user][phone] {
    fingerprint { source => "[user][phone]" target => "[user][phone_hmac]" method => "SHA256" key => "${PII_HMAC_KEY}" }
    mutate { remove_field => ["[user][phone]"] }
  }
  mutate { add_field => { "[pii][key_version]" => "${PII_HMAC_KEY_VERSION}" } }

  # 5. Hard-redact PII patterns in free text
  mutate { gsub => [
    "message", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[EMAIL]",
    "message", "\+[0-9][0-9 .-]{7,16}[0-9]",                     "[PHONE]",
    "message", "\b0[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{3,4}\b",    "[PHONE]"
  ] }
}
output {
  # Evidence: unmasked raw, compressed, KMS-encrypted, 1-minute objects, Object Lock bucket
  s3 { bucket => "audit-worm-raw" region => "REGION"
       prefix => "raw/${LS_NODE_ID}/%{+YYYY/MM/dd/HH}/"
       rotation_strategy => "time" time_file => 1 encoding => "gzip"
       restore => true temporary_directory => "/var/lib/logstash/s3tmp"
       server_side_encryption => true server_side_encryption_algorithm => "aws:kms"
       ssekms_key_id => "${WORM_KMS_KEY_ID}"
       codec => line { format => "%{[@metadata][raw]}" } }
  # Evidence: hash list (input to the sealer)
  s3 { bucket => "audit-worm-hash" region => "REGION"
       prefix => "hash/${LS_NODE_ID}/%{+YYYY/MM/dd/HH}/"
       rotation_strategy => "time" time_file => 1
       restore => true temporary_directory => "/var/lib/logstash/s3tmp-hash"
       server_side_encryption => true server_side_encryption_algorithm => "aws:kms"
       ssekms_key_id => "${WORM_KMS_KEY_ID}"
       codec => line { format => "%{[event][hash][raw_sha256]}" } }
  # Working copy: masked, idempotent on retry (_id = raw hash)
  elasticsearch { hosts => ["https://es-hot.example.internal:9200"]
       index => "audit-events-prod" action => "create" data_stream => false
       document_id => "%{[event][hash][raw_sha256]}"
       ssl_enabled => true api_key => "${ES_WRITER_API_KEY}" }
}
```
The hostnames, bucket names and `REGION` are placeholders. Secrets come only from the Logstash keystore.

### 5.4 Index template and final-check ingest pipeline (Elasticsearch)
The ingest pipeline is a **safety net, not the masking mechanism**. It does three things:
- rejects documents that have no lineage hash;
- strips any `event.original`;
- reroutes documents in which a PII pattern survived masking to a restricted quarantine data stream, tagged `pii_suspect`. Only the security role can read that stream. It has its own short ILM policy and is reviewed daily.

`dynamic: strict` ensures an unexpected field is rejected (it ends up in the Logstash DLQ) instead of being indexed unmasked.

```json
PUT _index_template/audit-events
{
  "index_patterns": ["audit-events-*"],
  "data_stream": {},
  "priority": 300,
  "template": {
    "settings": {
      "number_of_shards": 9,
      "number_of_replicas": 1,
      "codec": "best_compression",
      "refresh_interval": "30s",
      "index.lifecycle.name": "audit-ilm-a",
      "index.default_pipeline": "audit-final-check"
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "@timestamp": { "type": "date" },
        "message":    { "type": "match_only_text" },
        "tags":       { "type": "keyword" },
        "event": { "properties": {
          "action":   { "type": "keyword" },
          "outcome":  { "type": "keyword" },
          "category": { "type": "keyword" },
          "ingested": { "type": "date" },
          "hash": { "properties": { "raw_sha256": { "type": "keyword" } } } } },
        "user": { "properties": {
          "id":         { "type": "keyword" },
          "name_hmac":  { "type": "keyword" },
          "email_hmac": { "type": "keyword" },
          "phone_hmac": { "type": "keyword" } } },
        "pii":     { "properties": { "key_version": { "type": "keyword" } } },
        "source":  { "properties": { "ip": { "type": "ip" } } },
        "host":    { "properties": { "name": { "type": "keyword" } } },
        "service": { "properties": { "name": { "type": "keyword" } } }
      }
    }
  }
}
```
```json
PUT _ingest/pipeline/audit-final-check
{
  "description": "Final PII safety net; primary masking is done in Logstash",
  "processors": [
    { "fail":   { "if": "ctx.event?.hash?.raw_sha256 == null", "message": "missing raw hash (lineage)" } },
    { "remove": { "field": "event.original", "ignore_missing": true } },
    { "set":    { "field": "event.ingested", "value": "{{{_ingest.timestamp}}}" } },
    { "append": { "if": "ctx.message instanceof String && (ctx.message =~ /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/ || ctx.message =~ /\\+[0-9][0-9 .-]{7,16}[0-9]/ || ctx.message =~ /\\b0[0-9]{2}[ .-]?[0-9]{3}[ .-]?[0-9]{3,4}\\b/)",
                  "field": "tags", "value": "pii_suspect" } },
    { "reroute": { "if": "ctx.tags != null && ctx.tags.contains('pii_suspect')",
                   "destination": "audit-quarantine-prod" } }
  ]
}
```
Notes:
- The quarantine data stream needs its own index template (`audit-quarantine-*`).
- Painless regex runs under the default `script.painless.regex.enabled: limited`.
- If `reroute` is not wanted, the alternative is to replace it with `fail`, which sends the event to the Logstash DLQ for review.
- Both variants must be proven in the PoC.

The regexes were checked on synthetic samples only: 5 positive samples were masked and 2 negatives (timestamp, IP, numeric id) were left unchanged. They have not yet been run inside Logstash or Elasticsearch.

**Hardening of Logstash.** The persistent queue, the DLQ and the S3 temp directory contain unmasked data. They need:
- encrypted disks;
- an OS account that only the Logstash service can use;
- scheduled purge of the DLQ.

These hosts belong to the evidence zone's trust boundary.

---

## 6. ILM policy

### 6.1 Plan A (recommended): `audit-ilm-a`
```json
PUT _ilm/policy/audit-ilm-a
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "set_priority": { "priority": 50 },
          "readonly": {},
          "allocate": { "number_of_replicas": 0 },
          "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-daily-a" },
          "delete": {}
        }
      }
    }
  }
}
```
The warm phase migrates indices to `data_warm` nodes automatically through ILM's implicit `migrate` action. No `searchable_snapshot` action and no `frozen` or `cold` phase are used.

SLM for plan A keeps 35 days of daily snapshots, which matches the 31-day churn in A11. Snapshots are incremental, so every index still in the cluster is always present in the latest snapshot.
```json
PUT _slm/policy/audit-daily-a
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-daily-{now/d}>",
  "repository": "audit-snap-repo",
  "config": { "indices": ["audit-events-prod"], "include_global_state": false },
  "retention": { "expire_after": "35d", "min_count": 7, "max_count": 40 }
}
```

### 6.2 Plan B (alternative): `audit-ilm-b`
```json
PUT _ilm/policy/audit-ilm-b
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-daily-b" },
          "delete": {}
        }
      }
    }
  }
}
```
Plan B's SLM is the same as `audit-daily-a` except for retention: `"expire_after": "400d", "min_count": 30, "max_count": 450`. Each index then survives only in snapshots after deletion.

To serve a request, restore the needed backing indices with `index_settings` that set `number_of_replicas: 0` and `index.routing.allocation.include._tier_preference: data_cold`, so they land on the restore pool. Delete them when the case closes.

### 6.3 Snapshot repository
- The repository is an S3-compatible bucket that is **separate from the WORM buckets**. It has versioning and its own credentials, which only the ES cluster holds.
- **Compliance-mode Object Lock is deliberately not applied** to the snapshot bucket. Elasticsearch must be able to delete and overwrite repository blobs during SLM retention and cleanup, and a locked bucket could break the repository.
- Snapshots are **not** evidence; they are disaster recovery for the derived index.
- The PoC may evaluate an alternative: one repository per month with a short default lock (R7).

---

## 7. Integrity & chain of custody

### 7.1 Legal original (definition)
The legal original is **the unmasked raw event, byte-for-byte as received at the collection point (the Logstash input), before any parsing or masking**. Its integrity is protected by:
- its SHA-256;
- a per-minute Merkle tree over those hashes;
- a signature on the Merkle root;
- an RFC 3161 timestamp on the root.

All of these are stored in a WORM store (S3 Object Lock, **compliance mode**, retention ≥ 12 months; 395 days are provisioned). Access to that store is separated from the cluster.

The Elasticsearch index is a **derived, masked working copy**. Each document carries `event.hash.raw_sha256`, which links it back to its original. Integrity is never argued from Elasticsearch itself. Basic RBAC, TLS and `index.blocks.write` (read-only) are secondary controls, because a cluster administrator can still modify or delete indices.

### 7.2 Write path
1. **Collection**: Logstash copies the raw bytes and computes `SHA-256(raw)`. Hosts use NTP-synchronised clocks.
2. **Store**: the raw line goes to a gzip, SSE-KMS-encrypted 1-minute object per Logstash node. The hash goes to a parallel hash-list object. Both buckets use Object Lock compliance mode with a default retention of 395 days and versioning. Client-side envelope encryption before upload is recommended in addition to SSE-KMS. The writer role may only `PutObject`; it has no delete permission and no bypass right, and compliance mode cannot be bypassed even by the account root.
3. **Seal (every minute)**: the sealer collects all hash lists for that minute and orders the leaves by (node, object, line). It builds a Merkle tree with domain separation (`0x00` prefix for leaves, `0x01` for interior nodes) to prevent second-preimage attacks.

   It then writes a `manifest.json` containing:
   - batch id;
   - time range;
   - event count per node;
   - list of hash-list objects;
   - the root;
   - **the previous batch's root**, which forms a hash chain so that a missing or inserted batch can be detected.

   Finally it signs the root with a non-exportable HSM/KMS key, obtains an RFC 3161 token from a trusted TSA (only the hash is sent), and writes the manifest, signature and token to WORM. That gives 1440 batches per day.
4. **Index**: the masked copy goes to Elasticsearch with `_id` = raw hash.

The tamper-evidence window between receipt and sealing is about 1–2 minutes plus upload time. During that window integrity rests on Logstash host hardening (R6).

### 7.3 Verification procedure (for an auditor or court)
1. From the ES document, take `event.hash.raw_sha256` and `@timestamp`. Open a ticket that states the reason and the scope.
2. With the `forensic-reader` role, under two-person approval (Legal + Security Officer), retrieve the following from WORM:
   - the raw and hash-list objects for the relevant node and minute(s);
   - the manifest, signature and token.

   Record each object's `VersionId`, ETag and Object Lock retention metadata.
3. Decrypt and decompress the raw data. Recompute SHA-256 for each line and find the line whose hash equals `raw_sha256`. It must also appear in the hash list.
4. Compute the Merkle inclusion proof from that leaf to the root and compare it with the root in the manifest.
5. Verify the root signature against the archived public certificate (chain, validity and revocation at signing time).
6. Verify the RFC 3161 token (`openssl ts -verify` with the TSA CA). Check that `messageImprint` matches the root/manifest hash, and read the timestamp.
7. Verify the chain: `prev_root` must match the previous batch, and there must be no gaps in the per-minute sequence.
8. (Optional) Re-apply the masking rules for the recorded `pii.key_version` to the raw event and compare the result with the ES document. Differences must be explainable, since the index is only a working copy.
9. Write a signed verification report recording people, times, object versions, tool versions and hashes, and store it in a WORM forensic-log bucket.

If any step fails, the event is treated as **not provably intact** and an incident is opened.

### 7.4 Chain of custody and key separation

| Asset / activity | Holder | Control |
|---|---|---|
| Root-signing key | Security Officer; HSM/KMS. The sealer holds `Sign` permission only | Non-exportable. Rotated, with old certificates archived for verification |
| WORM encryption key (KMS CMK) | Key Custodian (not the Security Officer, not an ES admin) | Separate key policy, dual control for `Decrypt`, long deletion window, backed up |
| HMAC masking key | HMAC key custodian | Vault/KMS, rotation with old versions kept (§5.2) |
| ES / Kibana administration | Platform team | **No** access to WORM buckets or keys |
| Writing to WORM | `worm-writer` role (Logstash, sealer) | `PutObject` only |
| Evidence extraction | Forensic Officer (`forensic-reader`) | Two-person approval (Legal + SO), ticket, scope, hash of the extracted package |
| Access accountability (D5) | Reverse-proxy access logs, OS `auditd`, object-store access/CloudTrail logs | Shipped to WORM and reviewed periodically. ES/Kibana APIs are reachable only through the proxy (network-enforced) |

---

## 8. Risks & conflicts

### 8.1 Conflicts in the inputs

| # | Conflict | Resolution | In Basic? |
|---|---|---|---|
| **C1** | **Customer suggestion: "use searchable snapshots for the cold/frozen tier".** Searchable snapshots are an **Enterprise** feature. The frozen tier works only with partially mounted searchable snapshots, so it is unavailable too. Adopting the suggestion would break the Basic-only budget constraint. | **Declined.** The replacement uses only Basic features: data tiers, ILM, `forcemerge` + `best_compression`, `readonly`, replica 0, and snapshot/restore. Plan A keeps older data on a warm HDD tier with replica 0 (757.361664 TB ES side + repo). Plan B keeps it only in snapshots and restores on request (414.139392 TB, scope-limited). Storage cost is therefore higher than with searchable snapshots. The customer's choices are to accept it, to cap request scope (enables Plan B), or to buy Enterprise. | Searchable snapshots / frozen: **No**. Tiers, ILM, snapshot/restore, force-merge: Yes |
| **C2** | Masking is required "before indexing", but the Elasticsearch `redact` ingest processor needs **Platinum**. | Masking is done in Logstash (`fingerprint` HMAC + `gsub`). The ES ingest pipeline is only a regex safety net that tags and quarantines suspect events (§5.4). | `redact`: **No**. Logstash filters, `fail`/`append`/`reroute` processors: Yes (verify `reroute` on the target version, A17) |
| **C3** | **Masking vs evidence.** Masked documents are by definition altered, so they cannot be "provably unaltered". | The legal original is the unmasked raw event in WORM. The index is derived and linked by `raw_sha256` (§7). Consequence: unmasked personal data is retained, which must be protected (encryption, dual control, separate account) and justified legally (Q5). | Independent of the Elastic licence |
| **C4** | Proving who accessed or changed what requires audit logging. **Elasticsearch audit logging and field/document-level security are not in Basic** (Platinum and above). | Reverse-proxy access logs + `auditd` + object-store logs go to WORM, and direct API access is blocked at the network level (D5). Residual risk: a proxy log does not show internal cluster actions by an administrator with shell access; this is mitigated by role separation and break-glass procedures. | ES audit log, FLS/DLS: **No**. TLS, RBAC, API keys: Yes |
| **C5** | **12-month compliance-mode WORM vs data-subject erasure/rectification rights.** Compliance mode cannot delete anything before expiry, not even as root. | A legal basis (evidence or log-retention obligation) is needed to refuse erasure during retention. Data is deleted at expiry. Governance mode is rejected because it weakens the evidential value. Crypto-shredding of a batch key is possible but destroys provability. The masked index can still be deleted through ILM or reindex. | N/A |
| **C6** | "Older data searchable within 24 h" has no scope limit, while snapshot-only restore scales linearly with scope (43 nodes for 335 days at 100 MB/s). | Plan A is recommended. Plan B is acceptable only with a contractual scope cap and a successful benchmark (§3.6). | Snapshot/restore: Yes |

### 8.2 Technical and operational risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | The A3 / A13 compression ratios are assumptions. A worse ratio adds nodes: 0.8 means 12 hot and 16 warm | High | Benchmark on a 24 h representative sample before procurement. Re-run the sizing |
| R2 | The Plan B restore rate of 100 MB/s per node is unmeasured. The 30-day slack is only 0.72 h, and at 40 MB/s, 10 nodes are needed | High | Benchmark the restore. If it falls short, use Plan A |
| R3 | **Loss of the WORM KMS key means loss of the evidence** | High | Key backup in 2 locations, long deletion window, key policy that denies deletion, dual control |
| R4 | Loss of the HMAC key breaks correlation of old tokens (evidence survives in WORM). A leaked key allows brute-forcing phone numbers | Medium | Vault/HSM, backup, separated custodians, rotation with derive-only old keys |
| R5 | Warm replica 0: a failed warm node makes its shards unsearchable until restored | Medium | Tested restore runbook. The restore stays within the 24 h requirement |
| R6 | Logstash holds unmasked data in the persistent queue, DLQ and S3 temp files. The S3 output acknowledges from its local temp file, so a node lost before upload can lose up to about 1 minute of raw data. Data is not yet sealed during the ~1–2 minute window | Medium | Encrypted disks, `restore => true`, durable temp directory, host hardening, monitoring of seal lag |
| R7 | An Object Lock on the snapshot repository could break ES cleanup | Medium | Kept unlocked (§6.3). Monthly locked repositories only after a PoC |
| R8 | Regexes miss usernames in free text, which have no recognisable pattern. Phone regexes produce false positives and negatives | Medium | Structured source schema (A20), optional dictionary of usernames from the IdP, monthly sampling audit of indexed data with results stored in WORM, quarantine stream |
| R9 | The hash list is a large share of WORM (0.11232 TB/day) | Low | Optionally store only raw objects + seals, since leaves can be recomputed |
| R10 | Raw events that contain newlines break the line-framed raw objects, so they cannot be re-hashed unambiguously | Medium | Frame each raw record unambiguously (e.g. base64 per line through a small Logstash `ruby` filter). Prove in the PoC |
| R11 | `_id` = raw hash deduplicates retries only within one backing index | Low | Accept. Duplicates are visible and resolvable through the hash |
| R12 | The TSA or signing service is unavailable | Low | Queue and retry. Seal late and record the delay. Long-term validity of TSA tokens (re-timestamping) is covered in Q7 |
| R13 | Basic feature boundaries can change between versions (alerting connectors, repository types, `reroute`) | Low | Check against the Elastic subscription matrix for the exact version at contract time |

---

## 9. Open questions for the customer

| # | Question | Why it matters |
|---|---|---|
| Q1 | **Definition of the 24 h deadline.** Does it run from the request until the data is *searchable in Kibana* (our assumption), until it is restored, or until results are delivered? Does it include approval time? | Drives Plan B restore throughput and node count (§3.6) |
| Q2 | What is the maximum time range of a single request for data older than 30 days? Can it be capped contractually (for example ≤ 1 month)? | Decides whether Plan B (414.139392 TB vs 757.361664 TB) is viable |
| Q3 | **Which copy is the legal evidence?** Do your counsel and court accept "unmasked raw in WORM + hash/Merkle/RFC 3161 proof" as the original and the masked index as a derived copy? | Foundation of §7 (C3) |
| Q4 | **Object storage provider and region.** Which S3-compatible store (cloud or on-premises) provides Object Lock compliance mode, and in which jurisdiction? Is data allowed to leave the country? Which KMS or HSM will be used? | WORM and repo placement, data residency, key custody |
| Q5 | **Phone number formats** in your logs: national (`0…`), `+84`, other country codes, extensions? Please provide masked samples | Normalisation before HMAC, regex coverage (R8) |
| Q6 | Which log sources exist, and do they emit structured `user.*` fields? Can we get 24 h of representative (sanitised) samples? | Masking coverage and compression benchmarks (A3, A13, A20) |
| Q7 | Which TSA is legally acceptable, and does evidence need validity beyond 12 months (litigation hold, re-timestamping)? | Sealing design and WORM retention |
| Q8 | What legal basis applies to keeping unmasked personal data in WORM, and how should erasure requests during retention be handled? (Counsel/DPO review required) | Conflict C5 |
| Q9 | Does 12-month retention start from event time or from ingest time? Is a legal-hold extension required? | ILM `min_age`, Object Lock retention (395 days provisioned) |
| Q10 | What is the infrastructure budget? Is the Plan A footprint (32 servers) acceptable, or would an Enterprise licence be evaluated against it? | Final choice between Plan A, Plan B and a licence upgrade |

---

### Appendix: validation still required before go-live
- Compression benchmark on real sample logs (A3, A13), then re-run the sizing.
- Logstash throughput per node (A15) and the Plan B restore rate (A12).
- PoC of the masking pipeline:
  - regex and HMAC normalisation on sample data;
  - `reroute`/`fail` behaviour;
  - `dynamic: strict` rejection into the DLQ.
- PoC of Object Lock compliance-mode retention, the sealer and the verification procedure in §7.3, run end to end.
- Restore runbook for a lost warm node (R5).
- Personal-data processing impact assessment for the unmasked WORM copy.
