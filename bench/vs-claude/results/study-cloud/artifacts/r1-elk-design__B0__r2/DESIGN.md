# Elastic Stack Audit-Log Platform — Architecture and Sizing Proposal

Status: design proposal (pre-PoC). Classification: internal.
All figures in this document are copied verbatim from the output of the capacity script (Appendix A). Nothing has been recalculated by hand. Decimal units throughout: 1 TB = 10^12 B, 1 GB = 10^9 B.
All statements about what the Elastic **Basic** licence includes or excludes are marked *[verify against current Elastic subscription page]*. They were not checked against the live subscription page while this document was written.

---

## 1. Overview and inputs

### 1.1 Customer inputs

| # | Input | Value |
|---|---|---|
| IN-1 | Sustained ingest | 20,000 events/s, 24/7 |
| IN-2 | Average raw event size | 800 bytes |
| IN-3 | Retention | 12 months |
| IN-4 | Interactive search | most recent 30 days |
| IN-5 | Older data | searchable within 24 hours of a request |
| IN-6 | Legal evidence | logs must be provably unaltered |
| IN-7 | Privacy | usernames, e-mails and phone numbers masked **before** indexing |
| IN-8 | Licence | Elastic Basic (free) only |
| IN-9 | Customer suggestion | "use searchable snapshots for the cold/frozen tier to save storage" |

### 1.2 Proposed architecture in one paragraph

Beats agents send events over mTLS to a dedicated **Logstash** tier. Logstash first hashes each raw event (SHA-256 over `event.original`), then fans the event out to two parallel branches. One branch writes the **complete, unmasked event as received** to an encrypted **WORM object store** (S3 Object Lock, compliance mode). The other masks usernames, e-mails and phone numbers with a **keyed HMAC-SHA256** and indexes only the masked copy into Elasticsearch. The two branches are not serialised, so an event can appear in Elasticsearch a few minutes before its raw copy is committed to WORM; §5.2 explains this and the compensating controls. Elasticsearch keeps **30 days** of data on regular indices (hot for 0–7 days, warm for 7–30 days). After 30 days an index exists only in a daily **snapshot repository**, and it is **restored on request** into a fixed **restore pool** within the 24-hour budget. A separate **seal service** signs per-minute Merkle digests of the event hashes with a customer KMS/HSM key. The WORM raw store plus the signed digests are the legal evidence. Elasticsearch and its snapshots are the search copy only.

The customer's searchable-snapshot suggestion is **not adopted**, because it requires a paid licence (§9 R-a).

### 1.3 Traceability (every component maps to an input; nothing else is added)

| Component | Required by |
|---|---|
| Logstash tier (hash, mask, fan-out, persistent queue) | IN-1, IN-6, IN-7 |
| Hot + warm Elasticsearch tiers | IN-1, IN-4 |
| Snapshot repository (SLM) + restore pool | IN-3, IN-5, IN-8 |
| WORM raw store + seal service + digest store | IN-3, IN-6 |
| Customer KMS/HSM (HMAC key, signing key, envelope encryption) | IN-6, IN-7 |
| Reverse proxy with access logging in front of ES/Kibana | IN-6 + IN-8 (Basic has no ES audit log) |
| Kibana | IN-4, IN-5 |

The following are deliberately **out of scope**: multi-site/DR, machine learning, frozen tier, cross-cluster replication.

---

## 2. Assumptions

Every assumption below must be confirmed during a PoC or by the customer. The capacity results depend on all of them.

| ID | Assumption | Value | Status |
|---|---|---|---|
| A-UNITS | Units | decimal, 1 TB = 10^12 B | fixed |
| A-RATIO | Index size / raw size (primary, on disk) | two scenarios: **0.7×** (`best_compression`) and **1.1×** (default codec) | **PoC: measure ≥ 1 day of real logs** |
| A-HEADROOM | Disk watermark headroom | 20 % (usable = 80 %) | fixed |
| A-REPL | Replicas | 1 on hot and warm; 0 on the restore pool | fixed |
| A-LAYOUT | Tier ages | hot 0–7 d, warm 7–30 d, delete from cluster at 30 d (snapshot kept) | design decision |
| A-DISK | Max data disk per node | hot NVMe ≤ 6 TB, warm SSD/HDD ≤ 20 TB | fixed |
| A-RAM | Max RAM per ES data node; RAM:disk ratio | 128 GB; hot 1:30 → 3.84 TB/node, warm 1:160 → 20 TB/node | assumption |
| A-PEAK | Peak load | 1.5 × sustained = 30,000 EPS | assumption |
| A-LS | Logstash throughput per node (SHA-256 + HMAC + regex + persistent queue) | 8,000 EPS, N+1 | **PoC** |
| A-PQ | Persistent-queue on-disk size / raw size; outage to absorb | 1.5×; 4 h at sustained rate | **PoC** |
| A-WORM | WORM record envelope; gzip ratio | 100 B/event; gzip to 0.15× | **PoC** |
| A-BW | Effective bandwidth to the snapshot repository | 10 Gbit/s link at 70 % = 0.875 GB/s | **customer to confirm** |
| A-RN | Restore throughput per restore node | 200 MB/s | **PoC** |
| A-SLA | Time inside the 24 h SLA **not** spent copying data (approval, start-up, hash verification, hand-over) | 6 h → 18 h restore window | assumption |
| A-SHARD | Target primary shard size | 50 GB | best practice |
| A-ROLES | Key custodians | Legal/Compliance officer + DPO/Security Officer, neither is a cluster admin | **customer to confirm** |

**Sizing recommendation:** provision for the **1.1×** column until the PoC measures the real ratio. If the PoC confirms 0.7×, scale down to the 0.7× column.

**Codec vs. sizing column (why the template says `best_compression` but we provision 1.1×).** The index template (§5.4) always uses `best_compression`; we never plan to run the default codec. The script labels its two scenarios by codec, but in this document the **1.1× column is used as a conservative upper bound for the unmeasured ratio**, not as a codec choice. The real ratio with `best_compression` on these logs is unknown: `message` is indexed as `text` and every other string is a `keyword` (§5.4), HMAC tokens (32 hex characters) compress poorly, and `event.hash` adds 64 high-entropy characters per event. Together these can push the ratio well above the 0.7× often quoted for `best_compression`. The PoC (§11) measures the ratio **with `best_compression` and the final mapping**, and the sizing then moves to whichever column (or interpolation between them) matches the measurement.

Additional assumption introduced by the ingest design (§5.2):

| ID | Assumption | Value | Status |
|---|---|---|---|
| A-RAWMSG | Agents ship each record unparsed in `message`; no Beats module/processor rewrites `message`; all structured fields are derived in Logstash from `event.original` | required for `event.hash` to cover the full record (§5.2) | **customer to confirm per source** |

---

## 3. Capacity calculation

All lines quoted in `monospace` blocks are verbatim script output (full script and output in Appendix A).

### 3.1 Raw volume

```
bytes/s = 20000 x 800 = 16,000,000 B/s = 16.0 MB/s
raw/day = 16,000,000 x 86400 = 1,382,400,000,000 B = 1.38 TB
raw 30 d  = 41.47 TB
raw 365 d = 504.58 TB
peak EPS = 20000x1.5 = 30,000; peak MB/s = 24.0
```

| Metric | Formula | Value |
|---|---|---|
| Ingest rate | 20,000 EPS × 800 B | 16.0 MB/s |
| Raw per day | 16,000,000 B/s × 86,400 s | 1,382,400,000,000 B = **1.38 TB** |
| Raw 30 days | raw/day × 30 | **41.47 TB** |
| Raw 365 days | raw/day × 365 | **504.58 TB** |
| Peak | 20,000 × 1.5 | 30,000 EPS = 24.0 MB/s |

### 3.2 Elasticsearch tiers (including replicas and headroom)

Formula per tier: `provisioned = index_primary_per_day × days × (replicas + 1) / (1 − 0.20)`, where `index_primary_per_day = raw/day × A-RATIO`.

| Metric | 0.7× (`best_compression`) | 1.1× (default) |
|---|---|---|
| Index primary / day | 1.38 TB × 0.7 = **0.97 TB** | 1.38 TB × 1.1 = **1.52 TB** |
| HOT 7 d: primary → ×2 replicas → /(1−0.2) | 6.77 TB → 13.55 TB → **16.93 TB** | 10.64 TB → 21.29 TB → **26.61 TB** |
| WARM 23 d: primary → ×2 replicas → /(1−0.2) | 22.26 TB → 44.51 TB → **55.64 TB** | 34.97 TB → 69.95 TB → **87.44 TB** |
| HOT+WARM provisioned, 30 d | **72.58 TB** | **114.05 TB** |
| HOT+WARM provisioned, 31 d (+1 d rollover lag) | 75.00 TB | 117.85 TB |
| Primary shards/day at 50 GB target | ceil(968 GB / 50) = 20 | ceil(1,521 GB / 50) = 31 |
| Total shards in 30 d (×2 replicas) | 1200 | 1860 |
| Hot shards/node; warm shards/node | 56; 307 | 62; 285 |

The 31-day line matters because ILM `min_age` counts from rollover, so an index can live up to about 31 days. The node counts in §4 are sized for 30 days, so the PoC must confirm that 31 days still fits within the watermark.

### 3.3 Snapshot repository (object storage, primaries only)

| Metric | Formula | 0.7× | 1.1× |
|---|---|---|---|
| SLM repository, 365 d | idx/day × 365 | **353.20 TB** | **555.03 TB** |
| Realistic, 395 d (a day-D snapshot is taken up to D+30 and expires 365 d later) | idx/day × 395 | 382.23 TB | 600.65 TB |
| Sensitivity: ×1.3 segment duplication (pre- and post-forcemerge segments both kept; illustrative only) | 395 d × 1.3 | 496.90 TB | 780.85 TB |

### 3.4 Raw WORM evidence store (365 days)

| Metric | Formula | Value |
|---|---|---|
| Payload only, uncompressed | raw/day × 365 | 504.58 TB |
| With 100 B envelope per event | 900 B × 20000 × 86400 = 1.56 TB/day; × 365 | 567.65 TB |
| gzip × 0.15 (assumption, PoC) | 0.23 TB/day; × 365 | **85.15 TB** |

The WORM size does not depend on A-RATIO. It does depend on A-WORM: Bucket A keeps the full agent envelope (`@timestamp`, `host.*`, `agent.*`, `log.*`, `event.hash`), not only the message (§5.3), and Beats envelopes can exceed the assumed 100 B per event before gzip. The envelope size is measured in the PoC together with the gzip ratio, and Bucket A is re-sized from that measurement.

### 3.5 Logstash and backlog after an outage

```
peak 30,000 EPS / 8,000 EPS per node (assumption) = ceil(3.75) = 4; +1 spare = 5 nodes
sustained load per node with 5 nodes = 4,000 EPS
events backlog = 20,000 x 14,400 s = 288,000,000; raw = 230.4 GB
x1.5 on-disk factor = 345.6 GB; /(1-0.2) = 432.0 GB total; per Logstash node (5) = 86.4 GB
if worm-path queue also fills (both outages at once): x2 = 172.8 GB per node -> provision this
drain rate = capacity 30,000 - sustained 20,000 = 10,000 EPS; drain time = 288,000,000/10,000 = 8.0 h
(if ES+LS only sustain 1.25x: drain = 16.0 h; at 1.0x never drains -> why 1.5x capacity is required)
```

- After a 4-hour Elasticsearch outage, the backlog is 288,000,000 events (230.4 GB raw). On disk that becomes **86.4 GB per Logstash node**, or 172.8 GB per node if the ES and WORM paths are blocked at the same time. Persistent queues are therefore provisioned at 2 × 90 GB (`worm`, `mask`) + 40 GB (`intake`) per node on an encrypted volume.
- Draining the backlog takes **8.0 h**, and only if Logstash **and** the hot tier sustain 1.5× (30,000 EPS). At 1.25× it takes 16.0 h, and at 1.0× the backlog never drains.

### 3.6 Restore time against the 24-hour SLA

```
repo bandwidth = 10 Gbit/s / 8 x 0.7 = 0.875 GB/s; restore node ingest = 200 MB/s each
```

The restore pool has 5 nodes, `restore-01..restore-05`. Effective throughput = min(0.875 GB/s, 5 × 200 MB/s) = 0.875 GB/s.

| Metric | 0.7× | 1.1× |
|---|---|---|
| 30 d restored, replica = 0, with headroom | 29.03 TB /0.8 = 36.29 TB → disk nodes 2, bandwidth nodes 5 → **5 nodes** | 45.62 TB /0.8 = 57.02 TB → disk nodes 3, bandwidth nodes 5 → **5 nodes** |
| Restore 1 d | 0.97 TB / 0.875 GB/s = 0.3 h (+6 h fixed = **6.3 h**) | 1.52 TB / 0.875 GB/s = 0.5 h (+6 h fixed = **6.5 h**) |
| Restore 30 d | 29.03 TB / 0.875 GB/s = 9.2 h (+6 h fixed = **15.2 h**) | 45.62 TB / 0.875 GB/s = 14.5 h (+6 h fixed = **20.5 h**) |
| Restore 365 d | 353.20 TB / 0.875 GB/s = 112.1 h (out of SLA) | 555.03 TB / 0.875 GB/s = 176.2 h (out of SLA) |
| **Max days per 24 h request** at 10 Gbit/s | floor((24−6) h × 0.875 GB/s / 0.9677 TB/day) = **58 d** | floor((24−6) h × 0.875 GB/s / 1.5206 TB/day) = **37 d** |
| Link 2.5 Gbit/s: effective → 30 d time; max days/request | 0.219 GB/s → 36.9 h; 14 | 0.219 GB/s → 57.9 h; 9 |
| Link 1 Gbit/s: effective → 30 d time; max days/request | 0.087 GB/s → 92.2 h; 5 | 0.087 GB/s → 144.8 h; 3 |

**Conclusion.** The 24-hour SLA is met **conditionally**:
- the effective repository bandwidth must be about 0.875 GB/s (A-BW), **and**
- each request must be scoped to at most **37 days** of data (1.1× sizing; 58 days at 0.7×).

A request covering all 12 months cannot be served within 24 hours (112.1–176.2 h of copying alone). At 2.5 Gbit/s the per-request limit falls to 9 days (1.1×), and at 1 Gbit/s to 3 days. Hash verification of restored data must fit inside the 6 h fixed budget (A-SLA). The proposed **service definition** is: "data older than 30 days is searchable within 24 h for a request of up to N days, where N is taken from the table above for the confirmed bandwidth and measured ratio."

---

## 4. Node layout per tier

| Tier | Role(s) | Count 0.7× / **1.1× (provision)** | Per-node spec | Basis |
|---|---|---|---|---|
| Master | `master` (dedicated) | 3 / **3** | small; not volume-driven (sizing assumption: 4–8 vCPU, 16 GB RAM, to confirm in PoC) | quorum |
| Hot | `data_hot`, `data_content`, `ingest` (unused) | 5 / **7** | NVMe, 128 GB RAM, **3.84 TB usable** (RAM-capped at 1:30; disk alone would allow 6 TB, which would need 200 GB RAM) | §3.2: disk-only needs 3 / 5 nodes; RAM-capped needs 5 / 7 |
| Warm | `data_warm` | 3 / **5** | SSD/HDD, 128 GB RAM, 20 TB (1:160) | §3.2 |
| Restore pool | `data_cold` (target of manual restores only; no ILM cold phase) | 5 / **5** (`restore-01..restore-05`) | warm node spec (≤ 20 TB, 128 GB RAM), replica 0 | §3.6: disk needs 2 / 3 nodes, bandwidth needs 5 |
| **Data nodes in ILM path (hot + warm)** | | **8 / 12** | | excludes masters and restore pool |
| Logstash | `intake`, `worm`, `mask` pipelines | **5** (4 + 1 spare) | CPU-bound; encrypted local disk for PQ: 2 × 90 GB + 40 GB | §3.5: 30,000 / 8,000 = 3.75 → 4, +1 |
| Kibana | UI | 2 (HA), behind the reverse proxy | not volume-driven (assumption) | IN-4, IN-5 |
| Reverse proxy | HTTP access log → WORM log bucket; the only path to ES :9200 and Kibana | 2 (HA) | not volume-driven (assumption) | Basic has no ES audit log (§7.4) |
| Seal service | builds per-minute Merkle digests and signs them via KMS/HSM | 2 (active/standby) | small (assumption) | IN-6 |

Object storage (outside the cluster):

| Bucket | Content | Object Lock | Size (1.1×) |
|---|---|---|---|
| A — raw WORM | complete events as received (`event.original` + agent envelope fields) + `event.hash`, unmasked, gzip, SSE-KMS | **compliance mode**, retention ≥ 12 months (13 months recommended as a verification buffer) | 85.15 TB / 365 d |
| B — digest WORM | signed Merkle roots, custody ledger, proxy/KMS access logs (separate account) | compliance mode | small |
| C — ES snapshots | SLM repository | **none** (see §9 R-g) | 555.03 TB (365 d) to 600.65 TB (395 d) |
| Q — quarantine | masking failures (hash + tags only, no PII) | none | small |

Shard plan: the template sets **primaries per backing index = number of hot nodes** (7 in the 1.1× layout, 5 in the 0.7× layout), so each hot node receives exactly one primary and one replica of every index and indexing load is even. Rollover is at 50 GB per primary shard (A-SHARD) or 1 day. The two numbers are consistent with the script: the script's "primary shards/day at 50 GB target" (31 at 1.1×, 20 at 0.7×) is a daily total, and with 7 primaries per index the size-based rollover simply happens several times a day until the daily total approaches that figure, because rollover is driven by shard size, not by the primary count. Shard counts are well within what 128 GB nodes normally handle. If the PoC changes the hot node count, `index.number_of_shards` changes with it.

---

## 5. Ingest pipeline

### 5.1 Data flow

```
 Beats agents ──mTLS:5044──►  LOGSTASH (x5, persistent queues on encrypted disk)
                              ┌──────────────────────────────────────────────────────────┐
                              │ intake:  copy message -> event.original                  │
                              │          event.hash = SHA-256(event.original) (1) HASH   │
                              │          fan-out (parallel, ensure_delivery)             │
                              │                    ├───────────────────────┐             │
                              │                    ▼                       ▼             │
                              │ worm:   full event as received,  mask: parse original,   │
                              │         + hash, gzip, SSE-KMS         HMAC-SHA256 on     │
                              │         (2) EVIDENCE                  user.name/email/   │
                              │                    │                  phone + regex in   │
                              │                    │                  message (3) MASK   │
                              │                    │                  event.ingested (4) │
                              │                    │                  drop event.original│
                              └────────────────────┼───────────────────────┬─────────────┘
                                                   ▼                       ▼ (create-only)
                       [PII] Bucket A raw WORM (Object Lock)     Elasticsearch data stream
                                   │                              logs-audit-prod (masked)
                                   ▼                                 hot 0–7 d → warm 7–30 d
                           Seal service: per-minute                      │ SLM daily
                           Merkle root, KMS/HSM sign                     ▼
                                   ▼                              Bucket C snapshots (365 d)
                           Bucket B digest WORM                          │ on request
                                                                         ▼
                                                                  restore-01..05 → Kibana
   Users ──► Reverse proxy (authN, access log → Bucket B) ──► Kibana / ES :9200 (no direct access)
```

Sensitive hops (unmasked PII): the agent → Logstash link, the Logstash persistent queues, the S3 output temp directory, and Bucket A. All of them are encrypted (mTLS, LUKS/volume encryption, SSE-KMS), and reading Bucket A requires two-person approval (§7.3).

### 5.2 Why Logstash and not an Elasticsearch ingest pipeline

Masking needs a **keyed** HMAC so that tokens cannot be brute-forced from low-entropy values such as phone numbers. The Logstash `fingerprint` filter supports `key`. The ES `fingerprint` ingest processor only offers a salt. Running the pipeline in Logstash also keeps the HMAC key off the ES data nodes, and the persistent queues absorb peaks and outages (§3.5).

**Processing order, as actually implemented.** The only strict ordering is **hash before any transformation**: `event.hash = SHA-256(event.original)` is computed in `intake` before the event is copied to either branch. After that, the `worm` and `mask` branches run **in parallel**:

```
intake: copy message → event.original → SHA-256 → event.hash
          ├──► worm: full event → persistent queue → s3 temp file (encrypted disk) → upload to Bucket A (≤ 5 min batches)
          └──► mask: parse → HMAC mask → event.ingested → drop event.original → Elasticsearch
```

This is a **deliberate deviation from design decision D4**, which listed "raw to WORM" before "mask → ES". The deviation exists because Logstash cannot make indexing conditional on a WORM acknowledgement. Even a serial chain (`worm` → `mask`) would not provide that guarantee, because the `s3` output acknowledges an event when it reaches the local temp file, not when the object is committed to Bucket A (R-s3ack). Consequences and controls:

- **No silent loss under back-pressure.** The `intake` output uses `ensure_delivery => true` (the default, set explicitly). If either downstream queue is full or the pipeline is not running, `intake` blocks rather than dropping the event, and back-pressure propagates to its persistent queue and then to the agents. Both downstream pipelines have persisted queues (§5.3), so a slow Bucket A path stalls ingest instead of losing raw events. The trade-off: a Bucket A outage longer than the queue capacity (§3.5) also stops indexing. This is intentional: an event is never indexed without its raw copy at least on Logstash's durable encrypted disk.
- **Window of exposure.** An event can be searchable in Elasticsearch up to about 5 minutes (`time_file`), plus upload time, before its raw copy is committed to Bucket A. During that window the raw copy exists only in the Logstash PQ or the s3 temp directory.
- **Detection (I5 + reconciliation).** The seal service builds digests only from objects committed to Bucket A. A reconciliation job (§7.2 I10) compares, per minute window, the ES document count and `event.hash` set with the signed digest. An ES document with no matching hash in Bucket A after 30 minutes raises an alert, and a sequence gap (I3) raises an alert.
- **Strict alternative (not proposed, available on request).** If the customer requires that nothing is searchable before the evidence copy is committed, a second Logstash stage can read *from* Bucket A (S3 event notification → queue → `s3`/`sqs` input) and index only committed objects. This adds roughly 5–10 minutes of search latency and one more component. It is not proposed by default because IN-4 is satisfied without it and the controls above detect any divergence.

**Hash scope (what `event.hash` proves).** `event.hash` is SHA-256 over the UTF-8 bytes of the `message` field **as delivered by the Beats agent**, copied unchanged into `event.original`. It is not a hash of the bytes on the source disk: Beats strips the line terminator and may transcode the file encoding. For this to cover the whole record, the agents must ship each record **unparsed** in `message` (no Beats modules or processors that rewrite or split `message`), and all structured fields such as `user.*` are derived in Logstash from `event.original` (§5.3, `mask` pipeline). This is assumption A-RAWMSG (§2). Fields that Beats adds around the message (`@timestamp`, `host.*`, `agent.*`, `log.file.path`, `log.offset`) are stored unmodified in Bucket A but are **not** inside `event.hash`. They are covered at object level: the seal service records the SHA-256 of every Bucket A object in a signed object manifest (I1b). The `event.hash` stored in Elasticsearch is the hash of the raw message, not of the masked document.

### 5.3 Pipeline configuration (draft, not yet validated with `logstash -t`)

`pipelines.yml`:
```yaml
- pipeline.id: intake
  path.config: "/etc/logstash/conf.d/10-intake.conf"
  queue.type: persisted
  queue.max_bytes: 40gb
  queue.checkpoint.writes: 1024
  pipeline.workers: 8
- pipeline.id: worm
  path.config: "/etc/logstash/conf.d/20-worm.conf"
  queue.type: persisted
  queue.max_bytes: 90gb        # 86.4 GB/node for a 4 h outage (section 3.5)
  pipeline.workers: 4
- pipeline.id: mask
  path.config: "/etc/logstash/conf.d/30-mask-es.conf"
  queue.type: persisted
  queue.max_bytes: 90gb        # 86.4 GB/node for a 4 h ES outage; encrypted volume
  pipeline.workers: 8
  pipeline.batch.size: 1000
```

`10-intake.conf` (hash first):
```ruby
input {
  beats {
    port => 5044
    ssl_enabled => true
    ssl_certificate => "/etc/logstash/tls/ls.crt"
    ssl_key => "/etc/logstash/tls/ls.key"
    ssl_client_authentication => "required"
    ssl_certificate_authorities => ["/etc/logstash/tls/ca.crt"]
  }
}
filter {
  mutate { copy => { "message" => "[event][original]" } }
  fingerprint {
    source => "[event][original]"
    method => "SHA256"            # no key => plain SHA-256 of the raw event
    target => "[event][hash]"
    base64encode => false
  }
  mutate { add_field => { "[event][hash_algorithm]" => "sha256" } }
  # No parsing here: the event is copied to both branches exactly as received plus event.original/event.hash.
}
output {
  # Parallel fan-out. ensure_delivery => true: block (never drop) if either downstream queue is full or down.
  pipeline { send_to => ["worm", "mask"] ensure_delivery => true }
}
```

`20-worm.conf` (complete unmasked event as received → Bucket A). There is deliberately **no** `prune` filter: every field the agent sent, including any structured field, is kept in the evidence copy. The only field dropped is `message`, because `intake` made `event.original` a byte-identical copy of it; keeping both would double the payload. Verification (§7.5) uses `event.original`.
```ruby
input { pipeline { address => "worm" } }
filter { mutate { remove_field => ["message"] } }   # identical to event.original (copied in intake)
output {
  s3 {
    region => "${WORM_S3_REGION}"
    bucket => "${WORM_S3_BUCKET}"
    prefix => "raw/%{+YYYY}/%{+MM}/%{+dd}/%{+HH}/ls-${HOSTNAME}"
    encoding => "gzip"
    codec => json_lines
    size_file => 268435456            # 256 MiB, or
    time_file => 5                    # every 5 minutes
    server_side_encryption => true
    server_side_encryption_algorithm => "aws:kms"
    ssekms_key_id => "${WORM_KMS_KEY_ARN}"
    temporary_directory => "/var/lib/logstash/s3-tmp"   # persistent, encrypted disk
    restore => true                   # re-upload leftover temp files after a crash
  }
}
```

`30-mask-es.conf` (keyed HMAC, separate key per field type, fail-closed):
```ruby
input { pipeline { address => "mask" } }
filter {
  # Structured fields (user.name, user.email, user.phone, event.action, ...) are derived HERE from
  # event.original, never on the agent (assumption A-RAWMSG). Parser is source-specific (json/dissect/grok),
  # defined per log format in the PoC. Example for JSON-formatted sources:
  json { source => "[event][original]" skip_on_invalid_json => true }
  # Normalise so the same person always maps to the same token (searchable, countable).
  if [user][name]  { mutate { lowercase => ["[user][name]"] } }
  if [user][email] { mutate { lowercase => ["[user][email]"] } }
  if [user][phone] { mutate { gsub => ["[user][phone]", "[^0-9+]", ""] } }
  # Domain separation: one derived key per field type (keys come from the Logstash keystore, derived from KMS/HSM).
  if [user][name]  { fingerprint { source => "[user][name]"  target => "[user][name]"  method => "SHA256" key => "${PII_HMAC_KEY_USER}" } }
  if [user][email] { fingerprint { source => "[user][email]" target => "[user][email]" method => "SHA256" key => "${PII_HMAC_KEY_EMAIL}" } }
  if [user][phone] { fingerprint { source => "[user][phone]" target => "[user][phone]" method => "SHA256" key => "${PII_HMAC_KEY_PHONE}" } }

  # Free text: e-mails, phone numbers and key=value usernames inside message.
  ruby {
    init => "require 'openssl'"
    script_params => { "ku" => "${PII_HMAC_KEY_USER}", "ke" => "${PII_HMAC_KEY_EMAIL}", "kp" => "${PII_HMAC_KEY_PHONE}", "key_id" => "${PII_HMAC_KEY_ID}" }
    code => '
      begin
        tok = lambda { |kind, k, v| "<#{kind}:" + OpenSSL::HMAC.hexdigest("SHA256", k, v)[0, 32] + ">" }
        email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
        phone = /(?<![\w.])\+?\d[\d\s().\-]{7,}\d(?![\w.])/
        uname = /\b((?:user(?:name)?|usr|login|account)\s*[=:]\s*"?)([^\s",;]+)/i
        s = event.get("message")
        if s.is_a?(String)
          s = s.gsub(email) { |m| tok.call("email", params["ke"], m.downcase) }
          s = s.gsub(uname) { "#{$1}" + tok.call("user", params["ku"], $2.downcase) }
          s = s.gsub(phone) { |m| tok.call("phone", params["kp"], m.gsub(/[^0-9+]/, "")) }
          event.set("message", s)
        end
        event.set("[labels][pii_key_id]", params["key_id"])
      rescue => e
        event.tag("_pii_mask_failure")
        event.set("[labels][pii_error]", e.class.name)
      end
    '
  }
  ruby { code => "event.set('[event][ingested]', Time.now.utc.strftime('%Y-%m-%dT%H:%M:%S.%LZ'))" }
  mutate { remove_field => ["[event][original]"] }
  # Fail-closed: a document that could not be masked is never indexed.
  if "_pii_mask_failure" in [tags] { mutate { remove_field => ["message", "user"] } }
}
output {
  if "_pii_mask_failure" in [tags] {
    s3 { region => "${QUARANTINE_S3_REGION}" bucket => "${QUARANTINE_S3_BUCKET}"
         prefix => "mask-failures/%{+YYYY}/%{+MM}/%{+dd}" encoding => "gzip" codec => json_lines
         time_file => 5 restore => true }
  } else {
    elasticsearch {
      hosts => ["https://es-hot-01:9200", "https://es-hot-02:9200", "https://es-hot-03:9200"]  # placeholders
      ssl_enabled => true
      ssl_certificate_authorities => ["/etc/logstash/tls/ca.crt"]
      user => "${ES_WRITER_USER}"
      password => "${ES_WRITER_PASSWORD}"
      data_stream => true
      data_stream_type => "logs"
      data_stream_dataset => "audit"
      data_stream_namespace => "prod"
      action => "create"
      document_id => "%{[event][hash]}"   # retry-safe within one backing index (see R-dup)
    }
  }
}
```

Masking notes:
- Tokens are 128-bit (32 hex characters, truncated HMAC-SHA256). This is **pseudonymisation, not anonymisation**, so the index is still personal data and must be protected as such.
- The regex catches e-mails, phone-like numbers and usernames in `user=` or `login:` style. A **bare username in free text is not caught**, and long numeric IDs may be over-masked. The regex set must be tuned against real log samples in the PoC. It is verified with a synthetic test corpus (acceptance: 0 clear-text e-mails or phones in the test index) plus a periodic scan query.
- Masked events with a failure are routed to quarantine without PII and can be re-processed from Bucket A by `event.hash`.
- Each document carries `labels.pii_key_id` so that tokens remain interpretable across key rotations.

### 5.4 Index template and writer role

```json
{
  "index_patterns": ["logs-audit-prod"],
  "priority": 500,
  "data_stream": {},
  "template": {
    "settings": {
      "index.number_of_shards": 7,
      "index.number_of_replicas": 1,
      "index.codec": "best_compression",
      "index.refresh_interval": "30s",
      "index.lifecycle.name": "audit-30d",
      "index.mapping.total_fields.limit": 1000
    },
    "mappings": {
      "dynamic": true,
      "dynamic_templates": [
        { "strings_as_keyword": { "match_mapping_type": "string", "mapping": { "type": "keyword", "ignore_above": 1024 } } }
      ],
      "properties": {
        "@timestamp": { "type": "date" },
        "message": { "type": "text" },
        "event": { "properties": {
          "hash": { "type": "keyword" },
          "hash_algorithm": { "type": "keyword" },
          "ingested": { "type": "date" },
          "action": { "type": "keyword" },
          "outcome": { "type": "keyword" }
        } },
        "user": { "properties": {
          "name": { "type": "keyword" },
          "email": { "type": "keyword" },
          "phone": { "type": "keyword" }
        } },
        "labels": { "properties": { "pii_key_id": { "type": "keyword" } } },
        "host": { "properties": { "name": { "type": "keyword" } } },
        "source": { "properties": { "ip": { "type": "ip" } } }
      }
    }
  }
}
```

Writer role for Logstash. It can create documents only, with no `index`, `write`, `delete` or update privileges:
```json
{
  "cluster": ["monitor"],
  "indices": [
    { "names": ["logs-audit-prod"], "privileges": ["create_doc", "auto_configure", "view_index_metadata"] }
  ]
}
```
Reader roles get only `read` and `view_index_metadata`. No role other than the writer has any write privilege on the audit data stream.

---

## 6. ILM and SLM

ILM policy `audit-30d`. It uses Basic features only *[verify against current Elastic subscription page]*:
```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "set_priority": { "priority": 50 },
          "forcemerge": { "max_num_segments": 1 },
          "readonly": {}
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-daily" },
          "delete": {}
        }
      }
    }
  }
}
```

Snapshot repository (Bucket C, no Object Lock) and SLM policy `audit-daily`:
```json
{
  "type": "s3",
  "settings": {
    "bucket": "audit-es-snapshots",
    "base_path": "prod",
    "max_snapshot_bytes_per_sec": "200mb",
    "max_restore_bytes_per_sec": "1gb",
    "server_side_encryption": true
  }
}
```
```json
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-daily-{now/d}>",
  "repository": "audit_snapshots",
  "config": {
    "indices": ["logs-audit-prod"],
    "include_global_state": false,
    "feature_states": []
  },
  "retention": {
    "expire_after": "365d",
    "min_count": 5,
    "max_count": 400
  }
}
```

Restore on request (example: one day). Indices are restored to the restore pool under a new name, with no ILM policy and replica 0. Without the rename and the ILM removal, ILM would immediately delete the restored index. The ILM policy is removed with the restore API's `ignore_index_settings` parameter rather than by setting `index.lifecycle.name` to `null` in `index_settings`, because the restore API documents `ignore_index_settings` as the way to drop a setting from the snapshot. The PoC must confirm that a restored index (a) has no `index.lifecycle.name` (`GET restored-audit-*/_ilm/explain` shows `"managed": false`) and (b) is not attached to the live data stream.
```json
{
  "indices": ".ds-logs-audit-prod-2026.01.05-*",
  "include_global_state": false,
  "include_aliases": false,
  "rename_pattern": "\\.ds-logs-audit-prod-(.+)",
  "rename_replacement": "restored-audit-$1",
  "ignore_index_settings": ["index.lifecycle.name"],
  "index_settings": {
    "index.number_of_replicas": 0,
    "index.routing.allocation.include._tier_preference": "data_cold"
  }
}
```
```yaml
# elasticsearch.yml on restore-01 .. restore-05 (node.name differs)
node.name: restore-01
node.roles: [ data_cold ]
indices.recovery.max_bytes_per_sec: 200mb
cluster.routing.allocation.node_concurrent_recoveries: 8
```
The restored indices are deleted manually when the case is closed, and the deletion is recorded in the custody ledger.

ILM is consistent with the evidence model. Deleting an index at 30 days does not touch the evidence, which lives in Bucket A and Bucket B for at least 12 months. The `wait_for_snapshot` step ensures the search copy exists in Bucket C before the index is deleted. Its exact behaviour must be verified in the PoC.

---

## 7. Integrity and evidence

### 7.1 Evidence model

| Copy | Content | Purpose |
|---|---|---|
| **Bucket A (raw WORM)** | the complete event exactly as received from the agent (no fields removed), unmasked, encrypted; each record carries `event.original` and `event.hash` | **primary legal evidence** |
| **Bucket B (digest WORM)** | per-minute Merkle roots chained with `prev_root`, signed by the KMS/HSM | proof that A is complete and unaltered |
| Elasticsearch + Bucket C | masked copy carrying `event.hash` of the raw event | search only (secondary) |

A superuser can still delete or modify Elasticsearch indices, because RBAC does not restrain superusers. **Elasticsearch is therefore never the evidence source.** Every evidential statement is reconciled back to Bucket A and Bucket B.

### 7.2 Integrity controls

| # | Control | Detail |
|---|---|---|
| I1 | Per-event hash | SHA-256 over the UTF-8 bytes of `event.original` (= `message` exactly as delivered by the Beats agent, before any Logstash transformation), stored as `event.hash` in both Bucket A and the ES document. Scope and limits: §5.2 "Hash scope"; full-record coverage depends on A-RAWMSG |
| I1b | Object manifest | For every object committed to Bucket A, the seal service records `{key, VersionId, SHA-256 of the object, first/last (node, seq)}` in a signed hourly manifest in Bucket B. This covers the envelope fields (`@timestamp`, `host.*`, `agent.*`, `log.*`) that are stored in Bucket A but are outside `event.hash` |
| I2 | WORM raw | S3 Object Lock **compliance mode** (or an equivalent on-prem product), retention ≥ 12 months (13 months recommended); versioning on; only the Logstash identity may `PutObject`; nobody may delete or change lock configuration except a logged break-glass account |
| I3 | Window digest | Every minute, a Merkle root over the `event.hash` values ordered by `(Logstash node, sequence)`, chained with `prev_root`, recorded as `{window, count, root, prev_root, first_seq, last_seq}`. Empty windows still produce a digest, so a deleted window is detectable. *Implementation note:* a per-node monotonically increasing sequence field must be added in the `intake` pipeline (PoC item) |
| I4 | Signing | The seal service signs each digest with a non-exportable KMS/HSM key (ECDSA P-256 or RSA-PSS 3072, an assumption) and writes it to Bucket B, which is in a separate account under separate administration. Hourly and daily roots are produced as well; the daily root can optionally carry an external RFC 3161 timestamp if the customer has a TSA |
| I5 | Gap detection | A sequence gap or a `prev_root` mismatch raises an alert. Alerting runs outside ES (Prometheus/Alertmanager), because Basic alerting is limited *[verify against current Elastic subscription page]* |
| I6 | RBAC | Create-only writer role (§5.4); readers get read only; after rollover, ILM sets `readonly`. Cluster admins have no rights on the KMS |
| I7 | Time | Chrony on all nodes with ≥ 3 trusted sources and an offset alert (100 ms proposed, an assumption). Both `event.created` (from the source) and `event.ingested` (from Logstash) are stored |
| I8 | Transport | TLS/mTLS between all components. Basic includes TLS *[verify against current Elastic subscription page]* |
| I9 | Access logging | Reverse-proxy, Kibana, S3 access/CloudTrail and KMS (`Decrypt`, `Sign`) logs are written to the WORM log bucket (§7.4) |
| I10 | ES ↔ WORM reconciliation | Because `worm` and `mask` run in parallel (§5.2), a scheduled job (part of the seal service) compares, per minute window older than 30 minutes, the ES document count and `event.hash` set with the signed digest built from Bucket A. ES hashes missing from Bucket A (evidence gap) and Bucket A hashes missing from ES (search gap, e.g. quarantine) both raise alerts outside ES; results are appended to the custody ledger |

### 7.3 Keys and two-person control

- The **root keys** (HMAC key derivation, envelope encryption of Bucket A, signing) live in the **customer's KMS/HSM** and never on ES data nodes. Logstash receives period-derived HMAC keys through its keystore at start-up (file mode 0600, encrypted disk). Logstash admins operate the service but cannot read root keys, and ES cluster admins have no KMS permissions.
- Decrypting Bucket A or re-identifying a token requires **two people**: a **Legal/Compliance officer** and a **DPO/Security Officer**, neither of them a cluster admin. *These role names are assumptions for the customer to confirm.* The two-person rule is enforced with a KMS key policy that requires both principals, or with a 2-of-2 / 2-of-3 Shamir split of the wrapping key.
- Re-identification procedure:
  1. A request is filed with a legal basis, case ID and minimal scope.
  2. Both approvers approve independently, and each approval is logged.
  3. The KMS grants short-lived access (4 h proposed, an assumption) to an operator who is neither approver.
  4. The operator either decrypts the objects in scope or recomputes the HMAC of a candidate value and compares tokens.
  5. A weekly reconciliation compares KMS logs with the approval ledger.
- Key rotation: 12 months proposed (an assumption). Old and new tokens differ, so `labels.pii_key_id` must be used to map between key versions.

### 7.4 Compensating for features missing from Basic *[verify against current Elastic subscription page]*

| Feature | Assumed on Basic | Compensation |
|---|---|---|
| ES security audit log | not included | Reverse proxy (nginx/HAProxy) in front of ES and Kibana logs user, method, path, status and a body hash for write requests, and ships the log to the WORM log bucket. A **firewall allows only the proxy to reach :9200**, which is mandatory because direct access would otherwise go unlogged |
| Field/document-level security | not included | Mask before indexing (§5). Nothing relies on FLS |
| Searchable snapshots | paid tier | Not used; restore from regular snapshots instead (D1, §9 R-a) |
| SAML/OIDC/LDAP realms | likely not included | Authenticate at the reverse proxy (OIDC/SAML + MFA) or use native users |
| RBAC, TLS, API keys, ILM, SLM | included | Used |

### 7.5 Verification procedure (independent of Elasticsearch)

1. Register the request (case ID, time range, legal reason) in the custody ledger.
2. Fetch the raw objects for the window from Bucket A with a **read-only** identity. Record the key, `VersionId`, `ETag` and retain-until date.
3. Decrypt after two-person approval (§7.3) into a read-only work area. Never work on the original.
4. Recompute the SHA-256 of each Bucket A object and compare it with the signed object manifest (I1b). Then recompute SHA-256 over `event.original` for every event, check it equals the stored `event.hash`, and rebuild the Merkle tree in `(node, seq)` order to get `root'`.
5. Fetch the signed digests from Bucket B and check that `root' == root`, that `count` matches, and that the `prev_root` chain is unbroken back to the previous window.
6. Verify the signature with the public key held outside the cluster, recording its fingerprint in the report, and confirm the key was valid at signing time.
7. Issue a PASS / FAIL / INCONCLUSIVE report signed by the verifier. The report includes its own hash and the hash of the versioned verification script.
8. To link Elasticsearch results (live or restored from Bucket C) to the evidence, match the document's `event.hash` (or `_id`) to the hashes from step 4. The hash **cannot** be recomputed from the masked document. A document whose `event.hash` has no match in Bucket A is treated as altered.

### 7.6 Chain of custody

Every step (who, when in UTC, what object/root/signature, where it is stored, each hand-over with signatures of giver and receiver and the hash of the package) is appended to a custody ledger in a WORM bucket. Each ledger line contains the hash of the previous line. Exports are always copies plus their hashes.

---

## 8. Data classification

The raw audit log (Bucket A) contains personal data and has evidential value: **Confidential**. The masked index is pseudonymised and is still personal data: **Internal–Confidential** (treat it as Confidential if in doubt). Digests and signatures: **Internal**. The regulatory security level of the system depends on the customer's information-system classification and is **not assumed** here. The applicable data-protection rules need legal review by the customer.

---

## 9. Risks and input conflicts

| ID | Risk / conflict | Impact | Mitigation / decision |
|---|---|---|---|
| **R-a** | **Searchable snapshots vs. Basic licence.** The customer suggests searchable snapshots for cold/frozen, but this feature requires a paid (Enterprise-level) subscription *[verify against current Elastic subscription page]*. This conflicts with IN-8 | The suggestion cannot be adopted on Basic | **Alternative (D1, adopted):** 30 days on regular indices, then snapshot only, restored on request to the 5-node restore pool. Comparison below. Licence upgrade cost: **requires an Elastic quote** (no price is assumed here) |
| R-b | **PII masking vs. legal evidence.** Masking changes the content, so the indexed document is not the original | Evidence cannot be the ES document | Two copies with separate roles: the raw original in WORM (evidence) and the masked index (search), linked by `event.hash` (§7.1, §7.5 step 8). The customer must accept that ES document hashes are not recomputable. Bucket A holds personal data that cannot be deleted during the lock period; data-subject erasure requests and crypto-shredding conflict with evidence retention and need a **legal decision** |
| R-c | **No ES audit log on Basic** *[verify against current Elastic subscription page]* | Read access to evidence is not logged by ES itself | Reverse-proxy logging to WORM + firewall so that only the proxy reaches :9200 (§7.4). Superuser actions remain detectable only through reconciliation with WORM, not preventable |
| R-d | **Compression ratio unmeasured** | ES size ranges from 72.58 TB to 114.05 TB (hot+warm) and the repository from 353.20 TB to 555.03 TB; hot nodes range from 5 to 7 | Provision 1.1× until a PoC on ≥ 1 day of real logs. Masking tokens and the `keyword` dynamic mapping both affect the ratio |
| R-e | **Peak load and backlog drain** | A 4 h outage creates 288,000,000 events of backlog; draining takes 8.0 h at 1.5×, 16.0 h at 1.25×, and never at 1.0× | Logstash (5 nodes) and the hot tier must sustain 30,000 EPS. Load-test in the PoC. PQ sized at 2 × 90 GB + 40 GB per Logstash node. Longer outages push back-pressure to the agents, which need local buffering |
| R-f | **365 days on disk vs. restore within 24 h** | See comparison below. Restore meets 24 h only for ≤ 37 days per request (1.1×, 10 Gbit/s); 365 days takes 176.2 h | Adopt D1 with a **per-request scope limit** in the SLA (§3.6). Larger investigations are served as several consecutive requests, or the customer chooses the on-disk option |
| R-g | **Object Lock vs. snapshot repository.** ES rewrites and deletes repository metadata blobs (`index-N`, `index.latest`) and deletes blobs when snapshots expire, so a bucket-wide compliance-mode Object Lock is generally incompatible with an ES snapshot repository *[not verified; PoC required]* | Snapshots cannot be the WORM evidence | Bucket C has no Object Lock: versioning on, deletion restricted to the ES identity, MFA-delete/anti-deletion policy, and a lifecycle rule expiring noncurrent versions (otherwise versioning keeps every SLM-deleted blob and the 555.03–600.65 TB estimate grows). Restored data is verified against Bucket A and Bucket B hashes (§7.5 step 8). Evidence = Bucket A. If the PoC shows object-level governance-mode retention works, the principle still holds |
| R-h | **Assumptions needing customer confirmation** | Sizing and SLA conclusions change | Key custodians (A-ROLES), repository bandwidth (A-BW, the whole 24 h conclusion depends on it), the 6 h non-copy budget (A-SLA), signing algorithm, NTP threshold, key-rotation period |
| R-slm | SLM keeps snapshots 365 days after they are taken, so day-D data is restorable until about D+395 (repository 382.23–600.65 TB) | Data is retained longer than 12 months, and storage grows | If deletion at exactly 12 months is a legal requirement, set `expire_after` to about 335 d, or confirm with Legal. Also decide whether WORM retention is 12 or 13 months |
| R-dup | `document_id = event.hash` deduplicates retries only within one backing index; two byte-identical raw events collapse into one ES document (WORM keeps both) | Counts in ES may differ slightly from WORM | Customer to accept, or add the per-node sequence (I3) to the ID |
| R-pii | Regex masking is incomplete (bare usernames) and may over-mask numeric IDs | Residual PII leakage | Synthetic test corpus, periodic scan query, fail-closed quarantine; tune on real samples in the PoC |
| R-s3ack | The Logstash `s3` output acknowledges events before upload; a crash before upload relies on `restore => true` and a durable temp disk | Potential evidence gap | Detected by I5 (sequence gaps) and I10 (ES ↔ WORM reconciliation). Failure test in the PoC |
| R-order | **Index before evidence commit (deviation from D4).** `worm` and `mask` run in parallel (§5.2); an event can be searchable up to about 5 min before its raw copy is committed to Bucket A | If a Logstash node and its disk are lost in that window, ES holds a document with no evidence copy | `ensure_delivery => true` + persisted queues (no drop under back-pressure); encrypted durable disk; I10 flags any ES hash without a Bucket A match, and such a document is never presented as evidence (§7.5 step 8). Strict "index only after commit" variant available at the cost of 5–10 min search latency (§5.2); customer to choose |
| R-rawmsg | **Hash scope depends on agent configuration.** If an agent parses or rewrites `message` (Beats modules/processors), fields outside `message` are not in `event.hash` | Weaker per-event proof for those sources | A-RAWMSG: agents ship unparsed; parsing only in Logstash. Envelope fields are covered by the object manifest (I1b). Agent configurations are reviewed per source in the PoC |
| R-day31 | Indices live up to 31 days (75.00 / 117.85 TB vs. 72.58 / 114.05 TB) | About 3.3 % more disk than sized | Confirm headroom in the PoC |

**Comparison for R-a / R-f: data older than 30 days (days 31–365, 335 days, 20 TB warm-class nodes)**

| Option | 0.7× | 1.1× |
|---|---|---|
| **D1 (proposed):** ES data nodes (hot + warm) | **8** | **12** |
| D1: plus restore pool | 5 nodes | 5 nodes |
| D1: plus snapshot repository (object storage) | 353.20 TB (365 d) | 555.03 TB (365 d) |
| On disk, replica = 1: provisioned / extra nodes / total data nodes | 810.43 TB / 41 / 49 | 1,273.54 TB / 64 / 76 |
| On disk, replica = 0: provisioned / extra nodes / total data nodes | 405.22 TB / 21 / 29 | 636.77 TB / 32 / 44 |
| Searchable snapshots (not allowed on Basic) | licence price: **requires an Elastic quote**; node count not modelled | same |

The on-disk option makes all 12 months interactively searchable on Basic, but needs 29–49 data nodes instead of 8 (0.7×), or 44–76 instead of 12 (1.1×). D1 meets the 24-hour requirement within the per-request scope limit, at the cost of object storage and a 5-node restore pool.

---

## 10. Open questions for the customer

1. **Bandwidth:** what is the effective throughput between the cluster and the snapshot object store? 10 Gbit/s at 70 % is assumed. At 2.5 Gbit/s the per-request limit drops to 9 days (1.1×).
2. **SLA scope:** is "≤ 37 days of data per 24-hour request" (1.1×, 10 Gbit/s) acceptable for older data? If not, is the on-disk option (44–76 data nodes) or a paid licence preferred?
3. **Licence:** will you request an Elastic quote for searchable snapshots, for comparison with D1? *[verify against current Elastic subscription page]*
4. **Key custodians:** who are the two approvers for decryption and re-identification? Legal/Compliance and DPO/Security Officer are assumed.
5. **KMS/HSM:** which product will be used, and can it enforce two-principal approval or hold a Shamir-split wrapping key?
6. **Retention end:** must data be deleted at exactly 12 months, or is 13 months acceptable (WORM verification buffer, SLM tail up to 395 days)?
7. **Data-subject rights:** how should erasure requests be handled against WORM evidence that cannot be erased?
8. **Object storage:** is it AWS S3 or an on-prem S3-compatible store? Does it support Object Lock compliance mode? This is a PoC with the ES repository (R-g).
9. **Log formats:** can you provide representative (synthetic or approved) samples so the PII regex set and the compression ratio can be measured?
10. **Agent buffering:** how long can sources buffer locally if Logstash applies back-pressure for more than 4 h?
11. **TSA:** is an external RFC 3161 timestamp authority available for the daily seal?
12. **Duplicates:** is collapsing byte-identical events in the search index acceptable (R-dup)?
13. **Ordering:** is it acceptable that an event may be searchable up to about 5 minutes before its evidence copy is committed to WORM (R-order), or do you require the strict "index only after commit" variant with 5–10 minutes of extra search latency?
14. **Agent configuration:** can every source ship its records unparsed in `message`, with parsing done centrally in Logstash (A-RAWMSG)? Which sources already use Beats modules or processors?

## 11. PoC exit criteria (before final sizing)

- Measured index/raw ratio on ≥ 1 day of real logs (A-RATIO), using `best_compression` and the final mapping.
- Fault test for R-order/R-s3ack: kill a Logstash node and block Bucket A during load; confirm no event is dropped, `intake` blocks when a downstream queue is full, and I10 reports every divergence.
- Restored index is unmanaged by ILM (`_ilm/explain` → `"managed": false`) and detached from the live data stream.
- Logstash throughput per node with hashing, HMAC, regex and PQ ≥ 8,000 EPS (A-LS); 30,000 EPS sustained end-to-end.
- Restore throughput per node and from the repository (A-RN, A-BW); a 1-day restore plus hash verification within the 6 h fixed budget.
- Snapshot repository behaviour with the intended bucket configuration (R-g) and the `wait_for_snapshot` behaviour.
- Synthetic PII corpus: 0 clear-text e-mails or phones in the index.
- `logstash -t` on all pipeline files; ILM, SLM and template applied on a test cluster.

---

## Appendix A — Capacity script output (verbatim)

The script is `capacity.py` (Python 3, standard library only). It was run as `python3 -I capacity.py` with exit 0. The script file will be delivered alongside this document so the figures can be re-run (handover item for the data engineer; it is not yet in this repository). Until then, every line below can be reproduced by hand from the parameters and formulas in Appendix B.

```text
== 1. Rates and raw volume ==
bytes/s = 20000 x 800 = 16,000,000 B/s = 16.0 MB/s
raw/day = 16,000,000 x 86400 = 1,382,400,000,000 B = 1.38 TB
raw 30 d  = 41.47 TB
raw 365 d = 504.58 TB
peak EPS = 20000x1.5 = 30,000; peak MB/s = 24.0

== 2. Tiers, index/raw = best_compression (0.7x) ==
index primary/day = 1.38 TB x 0.7 = 0.97 TB
HOT  7 d: primary 6.77 TB; x2 replicas = 13.55 TB; /(1-0.2) = 16.93 TB
WARM 23 d: primary 22.26 TB; x2 replicas = 44.51 TB; /(1-0.2) = 55.64 TB
HOT+WARM (30 d) provisioned = 72.58 TB; with +1 d rollover lag (31 d) = 75.00 TB
hot nodes : disk-only (<= 6.0 TB/node) = 3; RAM-capped (128 GB x 1:30 -> 3.84 TB/node) = 5
   RAM needed at 6.0 TB/node by 1:30 = 200 GB
warm nodes: disk-only (<= 20.0 TB/node) = 3; RAM-capped (128 GB x 1:160 -> 20.00 TB/node) = 3
=> layout used: hot 5, warm 3, master 3 dedicated
primary shards/day at 50 GB target = ceil(968 GB / 50) = 20; total shards in 30 d (x2 replicas) = 1200
hot shards/node = 56; warm shards/node = 307
SLM repo 365 d (primaries only, no replicas) = 0.97 TB x 365 = 353.20 TB
   +30 d because last snapshot containing day D expires at D+30+365 -> 395 d = 382.23 TB
   sensitivity x1.3 segment duplication (illustrative, PoC) on 395 d = 496.90 TB
OPTION 'cold 365 d on disk' replica=1: days 31-365 = 335 d, primary 324.17 TB, provisioned 810.43 TB -> 41 extra nodes (20.0 TB each); total data nodes = 5+3+41 = 49 vs 8 (D1)
OPTION 'cold 365 d on disk' replica=0: days 31-365 = 335 d, primary 324.17 TB, provisioned 405.22 TB -> 21 extra nodes (20.0 TB each); total data nodes = 5+3+21 = 29 vs 8 (D1)

== 2. Tiers, index/raw = default (1.1x) ==
index primary/day = 1.38 TB x 1.1 = 1.52 TB
HOT  7 d: primary 10.64 TB; x2 replicas = 21.29 TB; /(1-0.2) = 26.61 TB
WARM 23 d: primary 34.97 TB; x2 replicas = 69.95 TB; /(1-0.2) = 87.44 TB
HOT+WARM (30 d) provisioned = 114.05 TB; with +1 d rollover lag (31 d) = 117.85 TB
hot nodes : disk-only (<= 6.0 TB/node) = 5; RAM-capped (128 GB x 1:30 -> 3.84 TB/node) = 7
   RAM needed at 6.0 TB/node by 1:30 = 200 GB
warm nodes: disk-only (<= 20.0 TB/node) = 5; RAM-capped (128 GB x 1:160 -> 20.00 TB/node) = 5
=> layout used: hot 7, warm 5, master 3 dedicated
primary shards/day at 50 GB target = ceil(1,521 GB / 50) = 31; total shards in 30 d (x2 replicas) = 1860
hot shards/node = 62; warm shards/node = 285
SLM repo 365 d (primaries only, no replicas) = 1.52 TB x 365 = 555.03 TB
   +30 d because last snapshot containing day D expires at D+30+365 -> 395 d = 600.65 TB
   sensitivity x1.3 segment duplication (illustrative, PoC) on 395 d = 780.85 TB
OPTION 'cold 365 d on disk' replica=1: days 31-365 = 335 d, primary 509.41 TB, provisioned 1,273.54 TB -> 64 extra nodes (20.0 TB each); total data nodes = 7+5+64 = 76 vs 12 (D1)
OPTION 'cold 365 d on disk' replica=0: days 31-365 = 335 d, primary 509.41 TB, provisioned 636.77 TB -> 32 extra nodes (20.0 TB each); total data nodes = 7+5+32 = 44 vs 12 (D1)

== 3. Raw WORM store 365 d ==
payload only uncompressed = 504.58 TB
with 100 B envelope/event: 900 B x 20000 x 86400 = 1.56 TB/day; 365 d = 567.65 TB
gzip x 0.15: 0.23 TB/day; 365 d = 85.15 TB  (gzip ratio = assumption, PoC)

== 4. Logstash ==
peak 30,000 EPS / 8,000 EPS per node (assumption) = ceil(3.75) = 4; +1 spare = 5 nodes
sustained load per node with 5 nodes = 4,000 EPS

== 5. Backlog / persistent queue (ES-side outage 4 h at sustained rate) ==
events backlog = 20,000 x 14,400 s = 288,000,000; raw = 230.4 GB
x1.5 on-disk factor = 345.6 GB; /(1-0.2) = 432.0 GB total; per Logstash node (5) = 86.4 GB
if worm-path queue also fills (both outages at once): x2 = 172.8 GB per node -> provision this
drain rate = capacity 30,000 - sustained 20,000 = 10,000 EPS; drain time = 288,000,000/10,000 = 8.0 h
(if ES+LS only sustain 1.25x: drain = 16.0 h; at 1.0x never drains -> why 1.5x capacity is required)

== 6. Restore pool and SLA 24 h (D3) ==
repo bandwidth = 10 Gbit/s / 8 x 0.7 = 0.875 GB/s; restore node ingest = 200 MB/s each
[best_compression (0.7x)] 30 d restored replica=0: 29.03 TB /0.8 = 36.29 TB -> disk nodes 2, bandwidth nodes 5 -> restore-01..restore-05 (5 nodes); effective 0.875 GB/s
   restore   1 d = 0.97 TB / 0.875 GB/s = 0.3 h  (+6 h fixed = 6.3 h)
   restore  30 d = 29.03 TB / 0.875 GB/s = 9.2 h  (+6 h fixed = 15.2 h)
   restore 365 d = 353.20 TB / 0.875 GB/s = 112.1 h  (out of SLA, shown for information)
   max days per 24 h request = floor((24-6) h x 0.875 GB/s / 0.9677 TB/day) = 58 d
   sensitivity 1 Gbit/s link: effective 0.087 GB/s -> 30 d = 92.2 h; max days/request = 5
   sensitivity 2.5 Gbit/s link: effective 0.219 GB/s -> 30 d = 36.9 h; max days/request = 14
[default (1.1x)] 30 d restored replica=0: 45.62 TB /0.8 = 57.02 TB -> disk nodes 3, bandwidth nodes 5 -> restore-01..restore-05 (5 nodes); effective 0.875 GB/s
   restore   1 d = 1.52 TB / 0.875 GB/s = 0.5 h  (+6 h fixed = 6.5 h)
   restore  30 d = 45.62 TB / 0.875 GB/s = 14.5 h  (+6 h fixed = 20.5 h)
   restore 365 d = 555.03 TB / 0.875 GB/s = 176.2 h  (out of SLA, shown for information)
   max days per 24 h request = floor((24-6) h x 0.875 GB/s / 1.5206 TB/day) = 37 d
   sensitivity 1 Gbit/s link: effective 0.087 GB/s -> 30 d = 144.8 h; max days/request = 3
   sensitivity 2.5 Gbit/s link: effective 0.219 GB/s -> 30 d = 57.9 h; max days/request = 9
```

## Appendix B — Calculation method (to reproduce Appendix A without the script)

Parameters are those of §2: EPS = 20,000; S = 800 B; R ∈ {0.7, 1.1} (A-RATIO); H = 0.20 (A-HEADROOM); replicas = 1; hot 7 d, warm 23 d; hot node capacity = 128 GB × 30, warm = min(20 TB, 128 GB × 160); envelope = 100 B; gzip = 0.15; Logstash = 8,000 EPS/node; peak = 1.5×; PQ factor = 1.5; outage = 4 h; link 10 Gbit/s at 70 %; restore node = 200 MB/s; fixed non-copy time = 6 h; shard target = 50 GB. Units are decimal; values are rounded only for display.

| Output line | Formula |
|---|---|
| raw/day | EPS × S × 86,400 |
| index primary/day | raw/day × R |
| tier provisioned | primary/day × days × (replicas + 1) / (1 − H) |
| hot / warm nodes | ceil(tier provisioned / per-node capacity) |
| primary shards/day | ceil(primary/day / 50 GB) |
| SLM repository | primary/day × 365 (and × 395 for the SLM tail) |
| on-disk option (days 31–365) | primary/day × 335 × (replicas + 1) / (1 − H); extra nodes = ceil(… / 20 TB) |
| WORM | (S + envelope) × EPS × 86,400 × 365 × gzip |
| Logstash nodes | ceil(EPS × 1.5 / 8,000) + 1 |
| backlog | EPS × 4 h × 3,600; PQ per node = backlog × S × 1.5 / (1 − H) / 5 nodes |
| drain time | backlog / (EPS × 1.5 − EPS) |
| repo bandwidth | link Gbit/s / 8 × 0.7 |
| effective restore rate | min(repo bandwidth, restore nodes × 200 MB/s) |
| restore N days | primary/day × N / effective rate (+ 6 h) |
| max days per request | floor((24 − 6) h × effective rate / primary/day) |
