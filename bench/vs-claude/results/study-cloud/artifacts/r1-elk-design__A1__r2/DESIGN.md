# Audit-Log Platform on Elastic Stack (Basic license): Architecture and Sizing Proposal

Status: proposal for customer review. Units are **decimal** (1 TB = 10^12 B) unless marked TiB.
Figures marked **[A]** are assumptions that must be validated in a proof of concept (PoC) before purchase.

## 1. Summary and decisions that need customer sign-off

| # | Finding | Consequence |
|---|---------|-------------|
| 1 | **Searchable snapshots (and the frozen tier) require an Enterprise license.** The `searchable_snapshot` ILM action is not available on Basic. | The suggestion cannot be adopted as stated. We use *regular* snapshots to an object store plus on-demand restore into a "restore pool". See §4 and §9. |
| 2 | Elasticsearch on Basic has no tamper-evidence. Admins can delete or alter indices, and Elasticsearch audit logging is a paid feature. | "Provably unaltered" is delivered by an **external, signed, hash-chained WORM archive** (§7). Elasticsearch is the *search copy*, not the evidence copy. |
| 3 | "Masked before indexing" and "unaltered evidence" pull in opposite directions. | Masking is deterministic keyed pseudonymisation. The unmasked original is kept only in the encrypted WORM archive. **Legal must confirm this** (§9, R3). |
| 4 | "Older data searchable within 24 h" cannot be met for *all 11 months at once* with a sensible restore pool. | Design point: **90 contiguous days per request in ≤ 18.4 h**. Larger requests run in waves, or the customer buys Option B (§4.4). |
| 5 | Total footprint is ~505 TB of snapshot repository, ~110 TB of WORM archive and ~250 TB of installed node-local disk (28 + 80 + 140 TB), before redundancy of the object stores. | See §3. |

## 2. Requirements checklist, assumptions and conflicts

1. 20,000 EPS sustained, 800 B average raw event, 24/7 → volumes in §3.
2. Retention = 12 months. **[A]** 365 days. Leap years add 0.27 %, which is inside the headroom.
3. 0–30 days must be interactively searchable (target p95 < 5 s for typical filtered queries **[A]**). >30 days to 12 months must be searchable within 24 h of a request. **[A]** The clock starts when an authorised request is logged. Approval time is outside the 24 h and needs contractual definition.
4. Legal evidence → tamper-evidence, integrity verification, provenance, time-attestation, access control.
5. Usernames, e-mails and phone numbers masked **before indexing**. **[A]** "Masked" = irreversible without a secret key. Pseudonyms are consistent so investigators can still correlate by user.
6. Basic license only. **[A]** Self-managed, on-prem or IaaS. Elastic Cloud hosted tiers are paid subscriptions.
7. Customer suggestion on searchable snapshots → evaluated and rejected (§4.3).
8. 20,000 EPS is sustained, but real traffic has peaks. **[A]** Headroom for 2× (40,000 EPS) at ingest and a catch-up capability after outages.
9. **[A]** "800 B raw" is the payload as received by the collector. Parsing, ECS fields and hashes expand it before compression (accounted for in the compression ratio).

## 3. Capacity arithmetic

### 3.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 EPS × 800 B | 16.0 MB/s |
| Events per day | 20,000 × 86,400 | 1.728 × 10⁹ |
| **Raw per day** | 16 MB/s × 86,400 s | **1.3824 TB** (1.257 TiB) |
| Events per year | 1.728 × 10⁹ × 365 | 6.307 × 10¹¹ |
| **Raw per year** | 1.3824 TB × 365 | **504.6 TB** (458.9 TiB) |

### 3.2 Compression assumption

**[A] On-disk Elasticsearch primary size = 0.80 × raw**, using `index.codec: best_compression`, ECS-mapped fields, `_source` retained, and the per-event hash/ID fields (≈ 100 B/event of poorly compressible data).

- Rationale: JSON logs typically index at about 0.6–1.0× raw with best_compression. We take the middle-to-conservative value because the evidence fields do not compress and `_source` must stay on for reindexing and verification.
- We do **not** rely on synthetic `_source` / LogsDB index mode. Treat these as licence-gated (Enterprise) unless confirmed otherwise for the chosen version.
- **Must be measured** in the PoC with 1 day of representative, masked data. Sensitivity is in §3.5.

Primary indexed size per day = 1.3824 TB × 0.80 = **1.106 TB**. Per year (365 d) = **403.7 TB**.
Replicas: hot and warm use 1 replica (×2). The restore pool uses 0 replicas.

### 3.3 Storage per tier

Disks are planned to ≤ 70 % full (≤ 75 % in the restore pool). This sits well below the 85 % low watermark and leaves room for merges and node loss.

| Tier | Days held | Primary | With replicas | Provisioned @ target fill | Installed |
|---|---|---|---|---|---|
| Hot (NVMe) | 8 (7 d ILM age + current write index) | 8 × 1.106 = 8.85 TB | ×2 = 17.69 TB | ÷0.70 = 25.3 TB | 7 × 4 TB = **28 TB** |
| Warm (SSD) | 23 (days 8–31) | 25.44 TB | 50.87 TB | ÷0.70 = 72.7 TB | 8 × 10 TB = **80 TB** |
| *In-cluster total* | 31 | 34.28 TB | 68.57 TB | 98.0 TB | 108 TB |
| Restore pool (HDD, 0 replicas) | design point 90 d | 99.53 TB | 99.53 TB | ÷0.75 = 132.7 TB | 10 × 14 TB = **140 TB** |
| Snapshot repository (object store) | 365 d | 403.7 TB | n/a | × 1.25 overhead = **504.6 TB** | provision ≈ 550 TB usable |
| WORM evidence archive (object store) | 396 d (12 mo + 31 d lock margin) | n/a | n/a | see §3.4 | ≈ 110 TB logical |
| Kafka buffer | 48 h × RF 3 | n/a | 2 × 1.3824 × 3 = 8.3 TB | ÷0.70 over 3 brokers | 3 × 4 TB |

Notes:
- The hot tier holds 8 days because ILM `min_age` counts from rollover, so the active index adds up to a day.
- The warm tier holds up to day 31 because the delete phase waits for the next daily snapshot (§6).
- Snapshot-repo overhead (×1.25 **[A]**): a snapshot taken while an index is still receiving writes captures segments that are later merged away, and the repository keeps them as long as any snapshot references them. Hot-phase force-merge after rollover (§6) limits this to roughly the active index at snapshot time. Measure it in the PoC. The object store provides its own durability; a second-site copy doubles the figure.
- Node-loss check, hot: 6 × 4 TB = 24 TB vs. 17.7 TB data = 74 %. Warm: 7 × 10 = 70 TB vs. 50.9 TB = 73 %. Both are below the low watermark.
- Shard count: 7 primaries per index, rollover at 50 GB per primary shard (≈ 350 GB per index) gives ≈ 3.2 indices/day. 31 days × 3.2 × 14 shards (7p + 7r) ≈ **1,370 shards** over 15 data nodes (≈ 91 per node). The restore pool at 90 d holds ≈ 284 indices × 7 = 1,990 shards over 10 nodes (≈ 199 per node), well under the 1,000-shard/node default limit.

### 3.4 WORM archive size

The archive stores the original record as NDJSON, zstd-compressed, then encrypted. **[A]** zstd gives 5:1 on JSON logs (conservative; 6–10:1 is common). 1.3824 TB × 0.20 = 0.276 TB/day × 396 days ≈ **109.5 TB logical**. Erasure-coded storage (e.g. 8+4 = 1.5×) means ≈ 164 TB raw disk.

### 3.5 Sensitivity to the compression assumption

| Ratio (index / raw) | In-cluster, 31 d with replicas | Snapshot repo (×1.25) |
|---|---|---|
| 0.6 | 51.4 TB | 378 TB |
| **0.8 (plan)** | **68.6 TB** | **505 TB** |
| 1.0 | 85.7 TB | 631 TB |

At 1.0 the plan still fits the installed hot/warm disks only if we accept ≈ 79 % fill after growth. Plan a 10 % hardware reserve and re-run this table after the PoC.

## 4. Tiering strategy and the searchable-snapshot question

### 4.1 Tiers

- **Hot**: days 0–7, NVMe, 1 replica. Takes all indexing.
- **Warm**: days 7–31, SSD, 1 replica. Read-only, force-merged.
- **Archive (not in the cluster)**: day 31 to month 12. Data lives in the snapshot repository and is **deleted from the cluster** after a snapshot exists.
- **Restore pool**: `data_cold` role nodes, empty until a request arrives.

### 4.2 On-demand restore (the 24 h path)

1. A request (case ID, time range) is logged and approved.
2. The operator restores the matching indices from the snapshot repository with `index.number_of_replicas: 0`, `index.routing.allocation.include._tier_preference: data_cold`, and `index.lifecycle.name` overridden to `audit-restored`, a policy that deletes after 14 days, with `index.lifecycle.origination_date` set to the restore time.
3. Verify (§7.4), search, then let ILM delete.

Restore throughput:
- Defaults are too low (recovery throttling ≈ 40 MB/s per node). Raise `indices.recovery.max_bytes_per_sec` and the repository's `max_restore_bytes_per_sec` to ≥ 150 MB/s per node, and use ≥ 10 GbE.
- **Target 150 MB/s × 10 nodes = 1.5 GB/s.**
- 90 days (99.5 TB): 99.5 TB ÷ 1.5 GB/s = **18.4 h**, which leaves 5.6 h of margin. The minimum throughput for 24 h is 1.15 GB/s.
- 7 days (7.7 TB): 1.4 h.
- All 335 archived days (370.5 TB): 68.6 h. Not achievable in 24 h on this pool. See Option B.

Restores are by index. A date range maps to indices through the naming and a catalogue (§6), so a request does not restore more than needed.

Re-ingesting from the WORM archive instead of snapshot restore is **not** a viable 24 h path. 90 days = 155 × 10⁹ events, which is ≈ 18 days at 100k EPS.

### 4.3 Why not searchable snapshots?

- `searchable_snapshot` ILM action, mounted indices and the frozen tier are **Enterprise** features. They are not available on Basic. A 30-day trial license is not valid for production.
- Even if licensed, the evidence design still needs the WORM archive, because Elasticsearch snapshot repositories need write and delete access and so cannot sit on Object Lock.
- What the customer wants (cheap storage for old data) is delivered here by the snapshot repository, which already holds the data at the same ≈ 1× cost. The extra cost on Basic is the restore pool (140 TB) and the restore delay.
- The design is forward-compatible. If the customer buys Enterprise later, the delete phase is replaced with a `cold`/`frozen` `searchable_snapshot` action and the restore pool shrinks to a cache tier.

### 4.4 Option B: keep everything online (no restore)

Cold-role nodes with the full 335 archived days, 0 replicas, snapshots as backup: 335 × 1.106 = 370.5 TB ÷ 0.80 fill = **463 TB HDD** (≈ 34 × 14 TB nodes). It meets the 24 h requirement trivially for any range, but costs ≈ 3.3× the restore pool. The risk is that a node loss makes ~3 % of archive indices unavailable until restored from snapshot. **Recommendation: Option A (restore pool)**, unless the customer expects frequent whole-year queries.

## 5. Node layout

| Role | Count | Spec (per node) | Notes |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB, 100 GB SSD | One per zone. |
| Hot data (`data_hot`, `ingest` off) | 7 | 16 vCPU, 64 GB RAM (30 GB heap), 4 TB NVMe | Indexing load ≈ 40k docs/s incl. replicas ≈ 5.7k/s/node, well within capacity **[A]**. |
| Warm data (`data_warm`) | 8 | 16 vCPU, 64 GB, 10 TB SSD | Disk:RAM ≈ 160:1. |
| Restore pool (`data_cold`) | 10 | 8 vCPU, 64 GB, 14 TB HDD, 10 GbE | Mostly idle. Sized for restore throughput as well as space. |
| Coordinating | 2 | 8 vCPU, 32 GB | Kibana and API entry point. |
| Kibana | 2 | 4 vCPU, 8 GB | Behind a logging reverse proxy. |
| Logstash | 5 | 8 vCPU, 16 GB | ≈ 10k EPS/node **[A, benchmark]**, so 4 carry 40k EPS and one is spare. |
| Kafka | 3 | 8 vCPU, 32 GB, 4 TB NVMe | RF 3, `min.insync.replicas=2`, 48 h retention, 24 partitions. |
| Sealer | 2 | 4 vCPU, 8 GB | Part of the Kafka consumer group; HSM/KMS-backed signing. |
| Object stores | 2 buckets, separate credentials | S3-compatible | (a) WORM evidence archive with Object Lock *compliance mode*. (b) Snapshot repo, no lock. |

Cluster settings:
- Allocation awareness by zone (`node.attr.zone`).
- `action.destructive_requires_name: true`.
- TLS on the HTTP and transport layers.
- Use a single Elasticsearch/Kibana/Logstash version: the current supported major release (confirm at build time).
- Disaster recovery cannot use cross-cluster replication, which needs a paid license. DR is the snapshot repo and WORM bucket replicated to a second site at the storage layer, plus rebuild via restore.

## 6. Ingest pipeline and ILM

### 6.1 Data flow

```
Sources ─ Elastic Agent/Filebeat (TLS) ─▶ Kafka  audit.raw  (RF3, 48h)
                                            │
                  ┌─────────────────────────┴───────────────────────┐
                  ▼                                                 ▼
          Sealer (group "sealer")                        Logstash x5 (group "indexer")
   batch → zstd → encrypt → hash → sign →           parse → normalise → MASK → fingerprint
   S3 Object Lock bucket + signed manifest          → data stream audit-logs (Elasticsearch)
                                                      └ quarantine topic on any failure
```

Kafka is not part of the Elastic Stack but is free and provides outage buffering and a stable event identity (topic, partition, offset).

### 6.2 Logstash stages

1. **Input**: Kafka consumer, `decorate_events => extended` to capture topic/partition/offset.
2. **Fingerprint of the raw bytes**: `[event][original_sha256]` = SHA-256 of the message exactly as consumed, computed **before** any change.
3. **Parse**: `json`/`dissect`/`grok` into ECS fields.
4. **Timestamp checks**: `@timestamp` from the source is never rewritten. `event.ingested` is set at ingest. If `@timestamp` is more than 5 min in the future or earlier than the retention window, add tag `audit.timestamp_anomaly`.
5. **Masking** (§6.3).
6. **Drop `event.original` and the unparsed `message` if it contains anything unmasked.** The raw is in the archive.
7. **Identity**: `_id = <topic>-<partition>-<offset>` so retries are idempotent (`op_type=create`). Duplicates across a rollover boundary are possible but harmless; the identity is recorded for dedupe at query time.
8. **Output**: bulk to the `audit-logs` data stream over TLS with an API key limited to `create_doc`/`auto_configure` on that stream.
9. **Failure**: any parse, mask or bulk error is sent to a Kafka `audit.quarantine` topic, **never** indexed. The Logstash DLQ is disabled for this pipeline, and the quarantine topic is ACL-restricted because it may hold unmasked data.

### 6.3 Masking

- **Usernames**: `u_` + first 16 chars of base32(HMAC-SHA256(key_vN, lower(username))). Deterministic, so the same user maps to the same token, with ~80-bit collision space.
- **E-mails**: `e_<token>@<domain>` where the token is the HMAC of the lower-cased local part. The domain is kept by default and is configurable.
- **Phones**: normalise to E.164 digits, then `p_<token>`.
- Applied to **known fields** (`user.name`, `user.email`, `source.user.*`, etc.) and by **regex over free text** (`message`, any `*.text`). Implemented in a Logstash `ruby` filter using `OpenSSL::HMAC`; keys live in the Logstash keystore or KMS, with a key ID recorded in `audit.mask.key_id` and a version in `audit.mask.version`.
- Defence in depth: `index.final_pipeline` on the data stream runs an Elasticsearch ingest pipeline that rejects any document whose string fields still match the e-mail or phone regex. The rejected event goes to quarantine.
- Phone regex is restricted to recognisable formats (leading `+`, or separators, or a known field) to avoid corrupting evidence by masking order numbers or epoch values. Tune on real data in the PoC.
- Pseudonyms are still personal data under many privacy regimes. Treat the key as a secret and rotate with documented overlap.

### 6.4 Index template

- Data stream `audit-logs`; `number_of_shards: 7`, `number_of_replicas: 1`, `codec: best_compression`, `refresh_interval: 10s`.
- `index.lifecycle.name: audit-logs`, `index.final_pipeline: audit-final`.
- Dynamic mapping `strict` for the audit namespace, `total_fields.limit` 1000. Hash fields mapped `keyword` with `index: false`.
- Read access via RBAC role `audit_reader` (read on `audit-logs*`). Native and file realms only on Basic.

### 6.5 ILM policy `audit-logs`

| Phase | min_age | Actions |
|---|---|---|
| hot | 0 | `rollover` (`max_primary_shard_size: 50gb`, `max_age: 1d`); after rollover: `readonly`, `forcemerge` (`max_num_segments: 1`, `index_codec: best_compression`); `set_priority: 100` |
| warm | 7d (from rollover) | `set_priority: 50` (data migrates to `data_warm` automatically) |
| delete | 30d (from rollover) | `delete` with `wait_for_snapshot: audit-archive` |

- Whether force-merge/read-only run inside the hot phase after rollover is supported in current releases. **Confirm on the chosen version**; if not, run them in warm and accept a larger snapshot overhead.
- Data stream rollover is at ≤ 1 day, so each index covers ≤ 1 day of ingest and the 30-day minimum is met: no event is deleted before it is 30 days old.
- The ILM `audit-restored` policy is a single delete phase at 14 d.

### 6.6 SLM and catalogue

- SLM policy `audit-archive`: daily 02:00, `indices: audit-logs`, `include_global_state: false`, repository `audit-snap` (S3, no Object Lock, separate credentials, bucket versioning on).
- Retention: `expire_after: 365d` plus a time buffer, `min_count: 7`. After expiry the delete is gated by the legal-hold procedure (§7.5).
- Because a snapshot does not name its time range, a nightly job writes a **catalogue** (index name → min/max `@timestamp`, doc count, snapshot name) to a small `audit-catalogue` index and to the WORM bucket. It maps a date range to the indices to restore.

## 7. Integrity: how "provably unaltered" is achieved

Basic provides no built-in tamper-evidence, and an administrator can delete or edit any index. Therefore the evidentiary record is **outside** Elasticsearch.

### 7.1 Evidence chain

1. **Capture**: the Sealer reads `audit.raw` and, for every event, records its position (topic, partition, offset) and SHA-256.
2. **Batch objects**: every 5 min or 256 MB per partition, events are written as NDJSON, zstd-compressed, encrypted with a per-day data key (envelope encryption by KMS/HSM), and uploaded to the **Object Lock bucket in compliance mode**, retention = 12 months + 31 days (≈ 396 d), versioning on.
3. **Manifest chain** per partition: each manifest entry holds `{object key, sha256(object), first/last offset, event count, prev_manifest_hash, signer_time}`. `manifest_hash = SHA-256(canonical JSON)` and the entry is **signed with Ed25519 using a non-exportable key in an HSM/KMS**. Entries are also stored with Object Lock.
4. **Daily anchor**: a Merkle root of all manifest hashes of the day is sent to an **RFC 3161 time-stamp authority** (the customer's, or a public one). The token is stored in the WORM bucket and a copy is sent to the legal/compliance department out-of-band.
5. **Search copy**: every Elasticsearch doc carries `event.original_sha256`, `audit.kafka.{topic,partition,offset}`, `audit.mask.version`. A masked document can be re-derived from the archived raw record.

### 7.2 What this proves and its limits

- Any change, deletion, reordering or insertion in the archive is detectable: the object hash, the manifest chain, the signature and the TSA anchor all need to be defeated, and Object Lock in compliance mode prevents deletion or shortening of retention even by the root account within the lock period.
- It proves integrity **from the point of capture on Kafka**. It does not prove the source host did not tamper with logs before shipping. Mitigation (recommended, outside this scope): forward-secure signing or remote sealing at the source (e.g. auditd/journald sealing), and a restricted network path from sources to Kafka.

### 7.3 Protecting the Elasticsearch copy

- Every document in Elasticsearch is a derived copy. Verification runs against the archive.
- RBAC: `delete_index`/`manage` privileges only for the ILM, SLM and archiver service accounts. The `elastic` superuser password is sealed (break-glass) and every use is investigated.
- Indices are read-only after rollover.
- Elasticsearch's own security audit logging is **not available on Basic**, so all access to Elasticsearch and Kibana goes through reverse proxies whose access logs are themselves shipped to the WORM archive.
- Node clocks are synchronised with chrony from two sources. Deviations > 1 s alert.

### 7.4 Verification

- **Continuous (daily)**: per partition and day, compare the event count in the archive with the count in Elasticsearch (via the catalogue). Verify the manifest chain and signatures for the day. Alert on any gap.
- **Weekly**: walk the full manifest chain from the oldest unexpired entry and validate every TSA token. Hash-check a random 1 % sample of archive objects against their manifest.
- **After every restore**: reconcile document counts per index against the catalogue, and sample-verify 1 % of documents by re-deriving them from archive records (100 % on request from legal). Sample verification of the whole 99.5 TB restore would be too costly to run by default.
- **Evidence export**: for a legal case, export the original objects, the manifests, the signatures and the TSA tokens, and the verification script. Elasticsearch results are used for discovery only.

### 7.5 Retention, deletion and legal hold

- Archive objects expire only after the Object Lock period (≈ 13 months). Snapshots expire at 12 months through SLM.
- A **legal hold** is applied to archive objects (S3 legal-hold flag). Snapshots under a hold must be cloned into a separate "hold" repository **before** SLM retention runs, because SLM would delete them. This is a runbook step.
- The encryption keys of expired days are destroyed (crypto-shredding), which satisfies erasure for the raw PII at the end of retention.

## 8. Operations and security summary

- TLS everywhere, with API keys per component. The Logstash user cannot read or delete.
- Monitoring: Stack Monitoring (Basic) plus external alerting (e.g. Prometheus), because Kibana alert connectors beyond index/server log are, to our knowledge, paid (verify).
- Alerts: Kafka consumer lag > 10 min, quarantine topic non-empty, count mismatch, snapshot failure, disk > 75 %, manifest gap, TSA failure, ILM errors.
- Catch-up: after a 4 h outage backlog = 288 M events. with all 5 Logstash nodes up (≈ 50k EPS) the 30k EPS surplus drains it in ≈ 2.7 h; Kafka retention of 48 h tolerates outages of well over a day.
- Backups: snapshot repo and archive replicated to a second site; the cluster is otherwise rebuildable from the repo.
- Regular drills: a restore of 7 days must complete in < 2 h; a 90-day restore drill each quarter, with the measured throughput compared with the 1.15 GB/s minimum.

## 9. Risks and conflicts

| ID | Risk / conflict | Impact | Mitigation / assumption |
|---|---|---|---|
| R1 | Searchable snapshots/frozen tier are Enterprise-only. | Customer's cost-saving idea is unavailable. | Regular snapshots plus restore pool (§4). Enterprise would be a separate budget decision. Verify against the current subscription matrix before purchase. |
| R2 | 24 h SLA vs. scope. A request for all 335 archived days needs 4.29 GB/s (370.5 TB in 24 h). The pool gives 1.5 GB/s. | Whole-archive queries miss the SLA. | Design point 90 d. Larger requests in waves (68.6 h for all), or Option B (463 TB, §4.4). Contractual definition of the 24 h clock. |
| R3 | Masking changes the data that evidence is based on. The raw WORM copy holds PII for ~13 months, and pseudonyms are still personal data. | Privacy-law and discovery conflict. | Legal sign-off required. Fallback: archive only the masked form plus the raw hash (weaker evidence). Crypto-shredding gives erasure. |
| R4 | ES snapshot repos cannot use Object Lock, so snapshots are mutable by whoever holds repo credentials. | Snapshot repo is not evidence. | Separate WORM archive (§7). Repo credentials are held only by the snapshot service. |
| R5 | Basic lacks ES audit logging, document/field-level security, SAML/OIDC/LDAP realms, cross-cluster replication, ML and most alert connectors. | Weaker access-audit, SSO and DR options. Feature list is from memory of the subscription matrix: re-verify each item against Elastic's current matrix. | Reverse-proxy logs to WORM, index-level RBAC, native users, storage-level replication, external alerting. Confirm the gaps are acceptable. |
| R6 | Compression ratio is an assumption. | ±25 % on storage (§3.5). | PoC measurement, 10 % hardware reserve. |
| R7 | Integrity starts at Kafka, not at the source host. | A compromised source can submit false events. | Source-side sealing recommended; document the trust boundary. |
| R8 | Masking misses (free text, formats) or false positives (numbers masked wrongly). | PII in index, or evidence corrupted. | Final-pipeline guard, quarantine topic, test corpus, tuned phone regex. PII in Kafka raw topic and quarantine is ACL-restricted and encrypted at rest. |
| R9 | Restore defaults throttle at ≈ 40 MB/s per node. | SLA missed if untuned. | Raise limits, 10 GbE, drill quarterly. |
| R10 | Snapshot overhead (×1.25) is an estimate. | Repo may be 380–630 TB. | Measure in PoC. Hot-phase force-merge. |
| R11 | Hot-phase force-merge/read-only after rollover relies on version support. | Higher snapshot overhead if unsupported. | Confirm on chosen version, fall back to warm. |
| R12 | Late/future-dated events, clock skew. | Misleading time ranges in the catalogue. | `@timestamp` never rewritten; anomalies tagged; catalogue uses actual min/max. |
| R13 | Restore pool idle most of the time. | Cost for rarely used capacity. | Accepted for the 24 h SLA; Option B or Enterprise are alternatives. |
| R14 | Key loss or compromise (HMAC, signing, archive data keys). | Loss of correlation, or loss of evidentiary value. | HSM/KMS, key IDs recorded per event, dual control, rotation with overlap, backup of key material. |
| R15 | Single-site failure. | Loss of availability or the search copy. | Second-site replication of both buckets; cluster rebuilt from snapshots. |
| R16 | Peak load above 2× sustained. | Lag, not loss. | Kafka buffer (48 h). Scale Logstash horizontally. |

## 10. Open questions for the customer

1. Is pseudonymisation acceptable as "masking", and may the raw record be retained encrypted in the WORM archive (R3)?
2. Is the 90-day design point adequate, or must the whole 12 months be searchable in 24 h (Option B)? When does the 24 h clock start?
3. Is the 12-month retention a minimum or also a maximum (affects deletion and the 31-day lock margin)?
4. Which jurisdiction, regulator or court standard applies (e.g. time-stamping requirements)?
5. Are on-prem S3-compatible stores with Object Lock available, or will a public cloud region be used?
6. Are sources able to do source-side sealing?
7. Is a second site available for DR?
