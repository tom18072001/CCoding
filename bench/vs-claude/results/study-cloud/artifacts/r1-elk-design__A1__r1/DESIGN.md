# Audit-Log Platform on the Elastic Stack (Basic license) — Architecture & Sizing Proposal

Status: proposal for review. Every figure marked **[assumption]** is an estimate that must be confirmed
by a proof of concept (PoC) with real customer events before hardware is ordered.
Licence and feature statements reflect the Elastic subscription matrix as I understand it; **confirm
them against elastic.co/subscriptions for the exact version you deploy** before signing anything.

## 1. Summary and the headline conflict

| Topic | Decision |
|---|---|
| Ingest | 20,000 EPS × 800 B = 16 MB/s = **1.38 TB/day**, **504.6 TB raw / 365 days** |
| Online storage | Hot 8 d → Warm 23 d → Cold 335 d, all on regular indices (no searchable snapshots) |
| Disk to buy (Elasticsearch) | ~24 TB NVMe hot, ~40 TB SSD warm, ~288 TB HDD cold (see §3) |
| Integrity | Masked events sealed outside Elasticsearch: hash chain + signed daily root + RFC 3161 timestamp + S3 Object Lock (compliance mode) archive |
| Masking | Keyed HMAC pseudonymisation in Logstash, before Kafka and before any index; Elasticsearch ingest pipeline as a fail-closed backstop |
| Licence | Everything below uses Basic-licensed features or non-Elastic open-source components |

**The customer's suggestion cannot be followed as stated.** Searchable snapshots (and the frozen tier,
which is built on them) require an **Enterprise** licence. On Basic, an ILM policy containing the
`searchable_snapshot` action fails its license check and the index gets stuck in ILM error state.
The need behind the suggestion (do not pay for two full copies on expensive disk) is met differently:
cold-tier indices run with **0 replicas**, and a second copy lives in a snapshot repository on object
storage (regular snapshot/restore and SLM are Basic features). That gives a similar "one online copy +
one cheap copy" economy without the Enterprise licence (§3.4, §8).

## 2. Requirements checklist, assumptions and ambiguities

| # | Requirement / ambiguity | Assumption / resolution |
|---|---|---|
| R1 | 20k EPS sustained, 800 B, 24/7 | Taken as the average including any fields we add (event hash, pipeline version, offsets). No burst figure given → design for **2× burst (40k EPS) for ingest tiers** and 25 % growth headroom on disk. |
| R2 | 12-month retention | 365 days. ILM ages count from *rollover*, and an index spans up to 24 h, so data lives up to ~366 days. Every event is kept at least 365 d. For a legal retention that must cover 366 d (leap year), set the delete `min_age` to `366d`; cold is only ~64 % full at 365 d, so the extra day fits. |
| R3 | Last 30 days interactive | Hot (8 d) + warm (23 d) = 31 days of data on SSD/NVMe, so 30 d is met despite the rollover offset. |
| R4 | Older data searchable within 24 h | Met trivially if data stays online on cold HDD. **Recommended**, since it is simple and needs no restore procedure. Cheaper offline alternative in §3.5. |
| R5 | Provably unaltered | Elasticsearch on Basic cannot provide this (indices are mutable by any superuser; no ES audit log). Integrity is therefore provided **outside** Elasticsearch (§7). |
| R6 | Mask username, e-mail, phone before indexing | Applied in Logstash; the unmasked value never reaches Kafka, Elasticsearch, the archive or snapshots. |
| R6a | **Conflict R5 vs R6**: masking changes the event, so "unaltered" can only mean "unaltered since masking". | The *masked* event is the evidential record. The pipeline version/hash is stamped on each event and the masking rules are version-controlled and sealed. Counsel must confirm this is acceptable (§9). An encrypted raw-escrow copy is possible but is a legal/policy decision, not assumed here. |
| R7 | Basic licence only | No Enterprise/Platinum features: no searchable snapshots, no frozen tier, no document/field-level security, no ES audit logging, no SAML/OIDC/LDAP, no `redact` processor reliance. |
| R8 | Searchable snapshots | Infeasible on Basic (§1). Replaced as above. |
| R9 | Replicas not specified | 1 replica on hot/warm (HA for live search); 0 on cold with snapshot + WORM copies (decision D1, §9). |
| R10 | Clock/ordering | All sources NTP-synced; `@timestamp` is the event time, `event.ingested` the pipeline time. Late events are accepted (land in the current index with an old `@timestamp`). |

## 3. Capacity arithmetic

Units: decimal (1 TB = 10¹² B) unless marked TiB.

### 3.1 Raw volume

```
Throughput  = 20,000 ev/s × 800 B                = 16,000,000 B/s = 16 MB/s (≈128 Mbit/s)
Events/day  = 20,000 × 86,400                    = 1.728 × 10⁹
Raw / day   = 16,000,000 B/s × 86,400 s          = 1.3824 × 10¹² B = 1.382 TB = 1.257 TiB
Events/year = 1.728 × 10⁹ × 365                  = 6.307 × 10¹¹
Raw / year  = 1.3824 TB × 365                    = 504.6 TB = 458.9 TiB
```

### 3.2 Compression assumption **[assumption — validate in PoC]**

On-disk size of *primary* shards relative to raw bytes (includes `_source`, doc values, inverted index,
added fields, custom `_id`):

| Stage | Ratio to raw | Reason |
|---|---|---|
| Hot (default LZ4 codec) | **0.50** | typical range for JSON audit logs with ECS-style keyword mapping is 0.4–0.7 |
| Warm/cold (force-merged to 1 segment, `best_compression`/DEFLATE) | **0.40** | ~20 % saving over hot |
| WORM archive (NDJSON + zstd) | **0.125** (8:1) | repetitive keys compress well; range 6:1–12:1 |

Sensitivity: if the real hot ratio is 0.7 instead of 0.5, all Elasticsearch disk figures scale ×1.4
(cold ≈ 400 TB HDD). Hence the PoC gate.

Per-day footprint:

```
Hot  primary  = 1.3824 × 0.50 = 0.6912 TB/day   (with 1 replica: 1.3824 TB/day)
Warm primary  = 1.3824 × 0.40 = 0.5530 TB/day   (with 1 replica: 1.1059 TB/day)
Archive       = 1.3824 × 0.125 = 0.1728 TB/day
```

### 3.3 Storage per tier (replicas included)

Ages are from rollover. Residency: hot 8 d (7 d min_age + the day being written), warm 23 d, cold 335 d.
8 + 23 + 335 = 366 d (matches R2).

| Tier | Days resident | Primary | Replicas | Total data | Fill target | Disk to provision (min) | Chosen |
|---|---|---|---|---|---|---|---|
| Hot (NVMe) | 8 | 8 × 0.6912 = 5.53 TB | 1 | **11.06 TB** | ≤70 % | 11.06 / 0.70 = 15.8 TB | 6 × 4 TB = **24 TB** (46 % used; reaches the 70 % mark after ~12 days of data, so ~4 days of slack if ILM stalls) |
| Warm (SSD) | 23 | 23 × 0.5530 = 12.72 TB | 1 | **25.44 TB** | ≤75 % | 25.44 / 0.75 = 33.9 TB | 5 × 8 TB = **40 TB** (64 %) |
| Cold (HDD) | 335 | 335 × 0.5530 = 185.24 TB | **0** | **185.24 TB** | ≤80 % | 185.24 / 0.80 = 231.6 TB | 12 × 24 TB = **288 TB** (64 %) |
| **Online total** | 366 | 203.5 TB primary | | **221.7 TB** | | | **352 TB** |

If cold had 1 replica (decision D1 alternative): 370.5 TB data, 463 TB at 80 %.

### 3.4 Object storage (outside the cluster)

| Item | Calculation | Size |
|---|---|---|
| WORM evidence archive | 0.1728 TB/d × 365 d = 63.1 TB; with a 400-day lock 0.1728 × 400 | **63 TB (69 TB at steady state with lock margin)** |
| Elasticsearch snapshot repo (DR + cold second copy) | 365 d × 0.553 + ~7 d of not-yet-merged data (7 × 0.6912) | **≈207 TB** |
| Kafka (masked topic, 72 h, RF 3) | 3 × 1.3824 = 4.15 TB × 3 (uncompressed worst case) | 12.4 TB across 3 brokers |

Snapshot SLM retention is kept short (§6.2) so that old pre-merge segments are not pinned.
Total object storage ≈ **276 TB** (207 + 69). Cross-site replication of the WORM bucket doubles its 69 TB.

### 3.5 Offline alternative for >30-day data (cost option, not recommended by default)

Delete indices from the cluster at day 30 and restore from the snapshot repo on request. This saves the
cold tier (12 nodes, 288 TB HDD) but needs a restore procedure and spare restore capacity. Restore
by snapshot is fast (segment copy); **re-ingesting from the WORM archive is not**: 1 day = 1.73 × 10⁹
events ≈ 4.8 h at 100k EPS, so a month ≈ 6 days, which violates the 24 h SLA for anything beyond a few days.
So the restore path must be snapshots, and the archive is the evidence source, not the query source.

## 4. Node layout

Reference hardware **[assumption]**; sizes should be validated by PoC. Shard target 30–50 GB; heap ≤ 31 GB (compressed oops).

| Tier / role | Nodes | Per node | Notes |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB | quorum of 3; no data |
| Coordinating-only | 2 | 8 vCPU, 32 GB | Kibana and API entry; fan-out across ~4,700 cold shards needs memory away from data nodes |
| **Hot** (`data_hot`, `ingest`) | 6 | 16 vCPU, 64 GB (31 GB heap), 4 TB NVMe | 24 shards (12 primary + 12 replica) per index ≈ 4 per node; 40k shard-level indexing ops/s (20k primary + 20k replica) ≈ 6.7k/node; ~8k/node with one node down; 2× burst ≈ 16k/node degraded. Must be confirmed by PoC benchmark **[assumption]** |
| **Warm** (`data_warm`) | 5 | 16 vCPU, 64 GB, 8 TB SSD | read-only, force-merged, 1 replica |
| **Cold** (`data_cold`) | 12 | 8 vCPU, 64 GB (31 GB heap), 24 TB HDD (JBOD/RAID-6) | ~4,700 shards / 12 ≈ 390 per node (<20 shards per GB heap ≈ 620); disk:RAM ≈ 375:1 is high, so cold queries are slower, which is acceptable under the 24 h requirement |
| Kibana | 2 | 4 vCPU, 8 GB | behind LB, TLS |
| Logstash **mask tier** | 5 | 8 vCPU, 16 GB, 100 GB SSD (persistent queue) | needs ≥6k EPS/node **[assumption, benchmark]** so 4 nodes (one down) = 24k ≥ 20k |
| Logstash **index tier** | 3 | 4 vCPU, 8 GB | Kafka → Elasticsearch bulk; light |
| Kafka (KRaft) | 3 | 8 vCPU, 32 GB, 8 TB NVMe | RF 3, `min.insync.replicas=2`, 24 partitions, 72 h retention (~4.15 TB per broker) |
| Sealer/archiver | 2 | 8 vCPU, 16 GB | consumer group; one owner per partition chain (§7) |
| **Total** | **28 ES + 2 Kibana + 8 Logstash + 3 Kafka + 2 sealer** | | |

All traffic uses TLS (node-to-node and HTTP are included in Basic). 10 GbE between tiers.
Shard counts: hot ≈ 14 primaries/day × 8 d × 2 ≈ 225; warm ≈ 320 × 2 ≈ 640 (23 d); cold ≈ 4,700.

Index sizing: template with **12 primary shards**, rollover at `max_primary_shard_size: 50gb` or
`max_age: 1d`. At 0.6912 TB/day ≈ 14 primaries/day ≈ 1.15 indices/day.

## 5. Ingest pipeline

```
Sources ─TLS─▶ Elastic Agent / Filebeat
        ─▶ Logstash MASK tier (parse, mask, stamp, persistent queue)
        ─▶ Kafka topic audit-masked  (only masked data ever lands here)
              ├─▶ Logstash INDEX tier ─▶ Elasticsearch data stream `audit-logs` (+ backstop pipeline)
              └─▶ Sealer/archiver ─▶ S3 Object Lock bucket (evidence archive)
        (parse/mask failure) ─▶ Kafka topic audit-quarantine (restricted ACL, 7 d TTL, alert)
```

Why Kafka: absorbs bursts/ES outages (72 h), gives deterministic offsets for the integrity chain, and
lets index and archive consume independently. Placing it *after* masking keeps PII out of it.

### 5.1 Masking rules (Logstash mask tier)

- **Structured fields** (`user.name`, `user.email`, `source.user.*`, `user.phone`, plus any mapped aliases):
  replace with keyed pseudonym `HMAC-SHA256(key_vN, normalised_value)` truncated to 128 bits, hex.
  - username → `u_<hex>`; phone (normalised to E.164 first) → `p_<hex>`;
  - e-mail → `e_<hex>@<domain>`; the domain is kept for analytics **[assumption; drop it if the domain can identify a person]**.
  - Deterministic: the same user yields the same token, so "everything this user did" is still searchable.
    An investigator re-identifies by computing the token for a *suspected* identity (key under dual control in KMS/Vault); no reverse mapping is stored.
  - Key id (`pii.key_version`) is stamped on the event; rotating the key splits correlation across versions, so rotate rarely and keep old keys for the retention period.
- **Free text** (`message`, `url.query`, command lines): regex scrub of e-mail and phone patterns
  (E.164 and common national formats), plus known `user=`/`uid=`/`login ` token patterns. Usernames in arbitrary prose cannot be reliably detected; this is a **residual risk** (§9) that needs a per-source audit of where usernames occur.
- `event.original` / raw line is **dropped** (it contains unmasked data).
- Stamps: `pii.masked: true`, `pii.key_version`, `pipeline.version` (git hash of the pipeline config), `event.ingested`, Kafka `partition`/`offset`.
- `event.hash` and `_id`: SHA-256 over the canonical (sorted-key, no-whitespace) JSON of the masked event; used as `_id` so redelivery is idempotent (`op_type=create`). Cost: custom `_id` slightly slows indexing and adds ~32 B/doc (inside the 0.5 ratio).
- **Fail closed**: any exception or missing `pii.masked` routes the event to `audit-quarantine`, never to the index path. Quarantine retains unmasked data, so it has its own ACL and 7-day TTL and a pager alert. Counsel/DPO must approve that exception.

### 5.2 Elasticsearch backstop (default_pipeline on the data stream, Basic processors only)

1. `fail` if `pii.masked != true` → unmasked documents are rejected at the cluster.
2. `gsub` on `message` and other text fields for e-mail/phone regexes (second line of defence).
3. `set` `event.ingested` from `_ingest.timestamp`.

Mapping: `dynamic: false` (unknown fields stay in `_source`, not indexed; no mapping explosion), keyword for identifiers, `index.refresh_interval: 30s`.

### 5.3 Continuous PII verification

A canary generator injects synthetic events with known e-mails/phones/usernames per source; a scheduled job
queries Elasticsearch (and samples the archive) for e-mail/phone regex hits and for the canary values,
and alerts on any hit. Alert delivery uses an external system (Prometheus Alertmanager or scripts), because Basic Kibana alerting is limited to index and server-log connectors.

## 6. Lifecycle (ILM and SLM)

Data stream `audit-logs`, ILM policy `audit-12m`. Ages are from rollover.

```json
PUT _ilm/policy/audit-12m
{ "policy": { "phases": {
  "hot":  { "actions": {
      "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "7d", "actions": {
      "set_priority": { "priority": 50 },
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "readonly": {} } },
  "cold": { "min_age": "30d", "actions": {
      "set_priority": { "priority": 0 },
      "allocate": { "number_of_replicas": 0 } } },
  "delete": { "min_age": "365d", "actions": {
      "wait_for_snapshot": { "policy": "audit-daily" },
      "delete": {} } } } } }
```

Tier movement uses the automatic `migrate` action (`_tier_preference`). No `searchable_snapshot` action anywhere.

### 6.1 Notes

- Indices move to warm at 7 d, so they sit in hot ≤ 8 d. They move to cold at 30 d. Interactive coverage is ≥ 31 d.
- Delete only fires after `wait_for_snapshot` sees a completed run of the `audit-daily` SLM policy; the data is also already in the WORM archive.
- **Legal hold**: ILM has no hold feature. To hold an index, remove its policy (`POST <index>/_ilm/remove`) and apply an S3 Object Lock *legal hold* to the corresponding archive objects. Document this as a runbook step.

### 6.2 Snapshot policy (SLM)

```json
PUT _slm/policy/audit-daily
{ "schedule": "0 30 1 * * ?", "name": "<audit-{now/d}>", "repository": "audit-dr",
  "config": { "indices": ["audit-logs"], "include_global_state": false },
  "retention": { "expire_after": "8d", "min_count": 3, "max_count": 10 } }
```

Each snapshot is incremental and contains all current indices, so the newest snapshot is a full restore point.
Keeping only recent snapshots prevents old pre-merge segments from being pinned, which is what keeps the repo at ~207 TB (§3.4).
**Dependency**: reducing replicas to 0 at day 30 relies on a successful snapshot of that index. Alert if the last successful SLM run is older than 26 h; pause cold transitions if it is.
The `audit-dr` repository is deliberately **not** Object Lock: Elasticsearch must rewrite repository metadata and delete unreferenced blobs, which Object Lock breaks. It is a DR copy, not evidence.

## 7. Integrity: how "provably unaltered" is achieved

Elasticsearch on Basic is not tamper-evident: a superuser can edit or delete documents, and the free
licence has no ES audit log. So the **evidence of record is the sealed archive**; Elasticsearch is the
query copy, and it is continuously reconciled against the archive.

1. **Per-event hash** (`event.hash`) computed at the mask tier over the canonical masked event (§5.1).
2. **Segments**: the sealer consumes `audit-masked` per Kafka partition and writes immutable files
   `audit/<yyyy>/<mm>/<dd>/p<partition>-<firstOffset>-<lastOffset>.ndjson.zst`, cutting every 60 s or 256 MB. Each file's SHA-256 is recorded.
3. **Hash chain per partition**: `chain_n = SHA-256(chain_{n-1} ‖ file_sha256 ‖ first_offset ‖ last_offset ‖ event_count ‖ pipeline.version)`. Removing, reordering or modifying any segment breaks all later links. A manifest entry per segment is written next to it. Chain state is recoverable from the last manifest in the bucket, so a standby sealer can take over a partition after failover without a gap.
4. **Daily seal**: at 00:10 UTC, compute a Merkle root over the previous day's 24 partition chain heads, sign it with an asymmetric key held in an HSM/cloud KMS (key never exported; signing logged), and obtain an **RFC 3161 timestamp** from an external timestamp authority, so the date is proven independent of our own clocks.
5. **WORM storage**: archive and seals go to an S3-compatible bucket with **Object Lock in compliance mode**, retention 400 days (12 months + margin), versioning on, separate account/credentials from the platform operators. Nobody, including root, can delete or overwrite within the lock. Daily roots are also copied to an independent location (second account/site, and handed to the legal custodian) to defend against loss of the primary bucket.
6. **Elasticsearch-side hardening** (defence in depth, not proof): TLS everywhere; native RBAC (Basic) with write only for the Logstash index role, no `delete_index`/`write` for humans; ILM `readonly` in warm; analyst role read-only on `audit-*`. No field/document-level security on Basic, which is why masking happens at ingest.
7. **Verification**:
   - *Daily reconciliation*: per segment, count documents in Elasticsearch by `kafka.partition` + offset range and compare with the manifest `event_count`; mismatches alert. Also catches deletions.
   - *Random content check*: recompute `event.hash` for a sample of ES docs and compare with archive.
   - *Weekly full archive check*: re-hash every file added that week and re-verify chain + signatures; quarterly full-bucket re-verification (63 TB read).
   - *On demand (legal request)*: export the segments for the period, re-hash, replay the chain, verify the signature and the RFC 3161 token with standard tools (`openssl ts -verify`), and publish the procedure so a third party can reproduce it without our software.
8. **Access auditing without ES audit logging**: put a reverse proxy in front of Kibana/ES that logs every request (user, query, time); ship those logs into the same sealed pipeline as a separate source. Add OS `auditd` on all nodes.

What this proves: the masked events in the archive are exactly those received at the stated time, in order, with no gaps.
What it does not prove: the integrity of data *before* the mask tier (source systems) or of the unmasked originals (§9).

## 8. Why not searchable snapshots, and what we do instead

| | Customer proposal | This design |
|---|---|---|
| Needs | Enterprise licence (searchable snapshots; frozen tier) | Basic |
| ILM result on Basic | `searchable_snapshot` action fails the licence check; indices stall in ERROR | works |
| Online copy | 1 (cached) + snapshot | 1 (cold HDD, 0 replicas) + snapshot |
| Cold search latency | slower on cache miss (object-store reads) | HDD, consistently moderate |
| Extra cost | licence uplift | ~207 TB object storage (needed for DR anyway) |

Savings vs a naive cold tier with 1 replica: 185 TB of HDD (~40 % of the 463 TB that would be needed at 80 % fill).
If the customer can later afford Enterprise, the cold phase can swap to `searchable_snapshot` with no data model change.

## 9. Risks, conflicts and decisions needed

| # | Risk / conflict | Impact | Mitigation / decision |
|---|---|---|---|
| X1 | **Searchable snapshots need Enterprise** | Customer suggestion not deliverable on Basic | §1, §8. Explain to the customer; offer the alternative. |
| X2 | **Masking vs "unaltered evidence"** | Masked record may be weaker evidence; identities cannot be recovered from stored data | Seal the masked form; pseudonyms are re-derivable under dual control; version the masking rules. **Counsel decision**: is masked evidence acceptable, or is an encrypted raw escrow (separate key, WORM) required? Escrow would reintroduce PII storage, and needs DPO sign-off. |
| X3 | **Immutability vs GDPR erasure / retention limits** | Object Lock prevents deletion for 400 days | Pseudonymised data may still be personal data. Get a legal basis and documented retention. Compliance-mode lock cannot be shortened, so choose the period deliberately. |
| X4 | Basic lacks ES audit log, document/field security, SSO (SAML/OIDC/LDAP) | Weaker access control/audit | Native users/roles, reverse-proxy logging, auditd; document as accepted gap. |
| X5 | Basic Kibana alerting has only index/server-log connectors | No native e-mail/Slack alerts | External alerting (Alertmanager). |
| X6 | **Compression ratio 0.5/0.4 is an estimate** | Disk could be ±40 % off | PoC with 1 week of real events before purchase; cold tier is the sensitive one (288 TB). |
| X7 | No burst figure; "sustained" only | Ingest backlog | Kafka absorbs 72 h; 40k EPS headroom in Logstash/hot nodes; clarify peaks with customer. |
| X8 | **Cold tier has 0 replicas** (D1) | Node/disk loss makes indices unavailable until restore from snapshot; restore of one node's ~20 TB can take hours | Acceptable under a 24 h SLA, but only if SLM is healthy (monitor). Alternative: 1 replica = +185 TB HDD. **Customer decision.** |
| X9 | PII in free text, especially usernames in prose | Unmasked PII could be indexed | Per-source field inventory, regex scrub, ES backstop, canaries, quarantine. Cannot be guaranteed 100 % for arbitrary text. |
| X10 | Key compromise / loss (HMAC key, signing key) | Re-identification (HMAC key); loss of seal ability (signing key) | KMS/HSM, dual control, key versioning, archive old keys/public certs for verification. |
| X11 | Legal hold vs ILM delete | Evidence deleted during a dispute | Runbook in §6.1; Object Lock legal hold. |
| X12 | Quarantine topic holds unmasked data | Contradicts "masked before indexed" in spirit (not indexed, but stored) | Short TTL, ACL, alerts; or drop-and-count instead, if legal prefers. |
| X13 | Pre-mask data and source integrity are out of scope of the seal | Defence could challenge the source | Sign/ship from sources over mutual TLS; document chain of custody. |
| X14 | Cold HDD nodes at 375:1 disk:RAM | Slow queries on year-old data | Accepted for 24 h SLA; use time-range filters; consider 128 GB RAM if PoC shows heap pressure. |
| X15 | Licence statements are from my knowledge of the subscription matrix | Wrong tier assumption | Verify on elastic.co/subscriptions for the target version before commitment. |

## 10. Open questions for the customer

1. Peak vs average EPS and expected growth.
2. Acceptable cold-tier replica count (X8).
3. Legal: is masked evidence acceptable (X2); required lock period; erasure obligations (X3).
4. Which fields can carry usernames/e-mails/phones per source system (X9)?
5. On-prem or cloud (affects object storage, KMS/HSM, TSA choice).
6. Typical query pattern for >30-day data (rare lookups vs large scans) to confirm cold HDD vs offline option (§3.5).
