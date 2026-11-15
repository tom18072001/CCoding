# Audit-Log Platform on the Elastic Stack – Architecture and Sizing Proposal

Status: proposal for review. Self-managed Elastic Stack under the **Basic (free) license**.
All sizing is arithmetic on stated assumptions; the compression ratio (section 2.2) must be confirmed by a proof of concept before hardware is ordered.

---

## 1. Summary and decisions

| Topic | Decision |
|---|---|
| Customer suggestion: searchable snapshots for cold/frozen | **Not possible on Basic.** Searchable snapshots (and the `data_frozen` tier built on them) require an Enterprise license. We meet the same goal (cheap 12-month retention) with *regular snapshots* in object storage plus an on-demand restore tier (sections 5 and 6). |
| Searchable window | Days 0–30 online (hot 0–8 d, warm 8–31 d), 1 replica each. |
| Days 31–365 | Not held in the cluster. Held as ordinary Elasticsearch snapshots in an S3-compatible repository. Restored on request into a small `data_cold` tier; target ≤ 12 h, SLA 24 h. |
| Masking | In the ingest layer (Logstash), before Kafka and before Elasticsearch, using keyed HMAC pseudonyms. ES-side check is reject-only. |
| Integrity | Elasticsearch is **not** the evidence store. Evidence is a signed, hash-chained, WORM (object-lock) archive of the masked events. ES contents are verified against it continuously. |
| Sizing result | 20,000 ev/s × 800 B = **1.38 TB/day, 504.6 TB/year raw**. Online 31 days = **42.9 TB** on disk with replicas. Snapshot repo ≈ **252 TB** (provision 275 TB). WORM archive ≈ **63 TB**. |

---

## 2. Capacity arithmetic

All figures use decimal units (1 TB = 10^12 B) unless marked TiB. 1 year = 365 days.

### 2.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Events per day | 20,000 × 86,400 s | **1.728 × 10^9** (1.728 billion) |
| Raw bytes per second | 20,000 × 800 B | 16 MB/s (≈128 Mbit/s) |
| **Raw per day** | 1.728 × 10^9 × 800 B | **1.3824 TB** (1.257 TiB) |
| Raw per 30 days | 1.3824 × 30 | 41.47 TB |
| Events per year | 1.728 × 10^9 × 365 | 630.72 × 10^9 |
| **Raw per year** | 1.3824 TB × 365 | **504.58 TB** (458.9 TiB) |

### 2.2 Compression / expansion assumption

An 800 B raw event becomes an ECS-structured JSON document that carries extra fields we add (`event.hash`, masking metadata, `event.ingested`, seal info; ≈150–200 B). Elasticsearch stores `_source`, an inverted index, doc values and `_id`. With `index.codec: best_compression` (applied at force-merge) and a strict mapping, structured audit logs typically land near 0.4–0.7 × the raw size.

**Assumption used throughout: indexed primary size = 0.5 × raw.**

- Primary on disk per day = 1.3824 TB × 0.5 = **0.6912 TB/day** (≈ 432 B per document).
- Snapshots copy segment files, so snapshot size ≈ primary size (no further compression, but incremental/deduplicated).
- Archive (gzip/zstd NDJSON) assumed 8:1 on raw: 1.3824 / 8 = 0.1728 TB/day.

Sensitivity of the 31-day online footprint (with 1 replica) to this assumption:

| Ratio (indexed/raw) | Primary/day | 31 d with replica |
|---|---|---|
| 0.35 | 0.484 TB | 30.0 TB |
| **0.50 (plan)** | **0.691 TB** | **42.9 TB** |
| 0.70 | 0.968 TB | 60.0 TB |

The node layout has ≥ 45 % spare disk at the plan ratio, which absorbs the 0.7 case on warm and (just) on hot. PoC task: index 24 h of real, masked, hashed data with the final mapping and measure the real ratio.

### 2.3 Storage per tier

ILM `min_age` counts from **rollover**, and an index holds up to 1 day of events, so a tier holds up to one extra day. Online data is therefore sized for **31 days**, not 30.

| Tier | Data age | Days of data | Primary | Replicas | **On disk (primary + replica)** |
|---|---|---|---|---|---|
| Hot | 0–8 d | 8 | 8 × 0.6912 = 5.53 TB | 1 | **11.06 TB** |
| Warm | 8–31 d | 23 | 23 × 0.6912 = 15.90 TB | 1 | **31.80 TB** |
| *Online total* | | 31 | 21.43 TB | | **42.85 TB** |
| Restore (`data_cold`, on demand) | 31–365 d | up to 30 d per request | 20.74 TB | 0 | 20.74 TB |
| Snapshot repository | 0–365 d | 365 | 365 × 0.6912 = **252.3 TB** | n/a (store does durability) | provision **275 TB** (+≈9 % for unreferenced-segment overlap and growth). With 8+4 erasure coding (1.5×) ≈ 410 TB raw disk |
| WORM evidence archive | 0–366 d | 365 | 365 × 0.1728 = **63.1 TB** | n/a | ≈ 95 TB raw with 8+4 EC |
| Kafka buffer (72 h) | – | 3 | 3 × 1.3824 = 4.15 TB, ×RF 3 | | **12.4 TB** cluster-wide (uncompressed worst case) |

Why replicas on warm: the snapshot gives durability, but the 30-day window must be *interactively* searchable, so we keep a replica for availability and node-loss tolerance.

Why we do not keep days 31–365 online: as regular indices with 0 replicas that is 335 × 0.6912 = 231.6 TB, i.e. ≈ 330 TB of disk at 70 % fill – about 28 × 12 TB nodes running permanently for data that is rarely read. The snapshot-only approach holds the same data on cheap object storage and satisfies the "searchable within 24 h" requirement.

### 2.4 Shard sizing

- Target primary shard ≈ 50 GB. 0.6912 TB/day ÷ 50 GB ≈ 13.8 primaries/day.
- Index template: 6 primary shards, 1 replica; ILM rolls over at 50 GB per primary shard (≈ 300 GB/index, ≈ 2.3 indices/day), or 1 day.
- Cluster shard count at steady state ≈ 31 d × 13.8 × 2 ≈ **860 shards** – far below limits (≈ 20 shards per GB heap). Hot node: ≈ 40 shards. A 30-day restore adds ≈ 415 primaries over 3 nodes (≈ 140/node), still fine.
- Indexing load: 20,000 docs/s primary + 20,000 replica = 40,000 doc-writes/s over 6 hot nodes ≈ 6.7k/s/node – comfortable for 16 vCPU NVMe nodes (headroom ≈ 2–3× for catch-up after an outage).

---

## 3. Node layout

Self-managed, Elasticsearch 8.x/9.x (confirm the exact version against the subscription matrix before purchase). Two availability zones for data nodes with `cluster.routing.allocation.awareness.attributes: zone`; the third master-eligible node sits in a third location.

| Role | Count | Spec (per node) | Capacity / utilisation |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB RAM (8 GB heap), 100 GB SSD | – |
| **Hot** (`data_hot,data_content`) | **6** | 16 vCPU, 64 GB RAM (30 GB heap), 4 TB NVMe | 24 TB raw; 11.06 TB = **46 %**; with one node lost 55 % |
| **Warm** (`data_warm`) | **6** | 8 vCPU, 64 GB RAM (30 GB heap), 10 TB SSD (enterprise HDD only if PoC shows searches meet the interactive target) | 60 TB raw; 31.8 TB = **53 %**; one node lost 64 % |
| **Restore / cold** (`data_cold`) | **3**, powered on for requests | 8 vCPU, 64 GB RAM, 12 TB SSD | 36 TB; 20.74 TB (30 d, 0 replicas) = 58 % |
| Coordinating | 2 | 8 vCPU, 32 GB RAM | – |
| Kibana | 2 behind a load balancer | 4 vCPU, 16 GB | – |
| Logstash stage A (mask) | 4 | 8 vCPU, 16 GB (8 GB heap), persistent queue | ≈ 5k ev/s each at 20k total → ~4× headroom |
| Kafka | 3 brokers | 8 vCPU, 32 GB, 8 TB SSD | 4.15 TB per broker at RF 3 / 72 h; 52 % |
| Sealer | 3 (consumer group) | 4 vCPU, 8 GB | 16 MB/s total – trivial |
| Logstash stage B (ES writer) | 2 | 8 vCPU, 16 GB | |
| Monitoring cluster | 1–3 small | Stack Monitoring is included in Basic; keep it on a **separate** cluster | |

Disk watermarks: plan ≤ 70 % fill; ES defaults are 85 % low / 90 % high / 95 % flood. Hot and warm tiers are sized so losing a node stays below 70 %.

Restore throughput (section 6): defaults throttle recovery to 40 MB/s per node, so `indices.recovery.max_bytes_per_sec` and the repository's `max_restore_bytes_per_sec` are raised to ≈ 200 MB/s. 3 nodes × 200 MB/s = 600 MB/s = 2.16 TB/h → **20.7 TB (30 days) restores in ≈ 9.6 h**. A single request is capped by default at 30 days; larger windows need more `data_cold` nodes (≈ 12 days of data per 12 TB node at 70 %) and about 75 days is the maximum that 3 nodes' bandwidth can restore in 24 h (24 h × 2.16 TB/h = 51.8 TB ÷ 0.6912).

---

## 4. Ingest pipeline

```
Sources ──► Filebeat / Elastic Agent (disk queue, TLS)
        ──► Logstash A  (parse → ECS → MASK)             [persistent queue]
        ──► Kafka  topic audit.masked  (24 partitions, RF 3, 72 h)
        ──► Sealer (custom service): canonical JSON, event.hash,
                    batch Merkle manifest, sign ─► WORM bucket
                    ─► only after manifest+data are durable ─► Kafka audit.sealed
        ──► Logstash B ─► Elasticsearch data stream  audit-logs   (op_type=create)
```

Design points:

1. **Masking before anything shared is durable.** PII never reaches Kafka, the Logstash DLQ, Elasticsearch, snapshots or the archive. Only the agents' local queues and Logstash A's in-memory/persistent queue (encrypted volumes, short-lived) see raw values.
2. **Masking rules** (Logstash A, config-as-code, unit-tested with a corpus):
   - `user.name` and all other configured user-name fields → `u_` + first 16 chars of base32(HMAC-SHA256(key, lowercase(name))).
   - e-mail → `<hmac token>@masked.invalid`; the domain is kept only if it is on a corporate allow-list (a personal domain such as a public webmail provider is itself identifying).
   - phone → normalise to E.164, keep the country calling code, HMAC the remainder.
   - Free-text fields (`message`, `event.original`-like) are scanned with e-mail and phone regexes and a dictionary of known usernames; matches are replaced with the same tokens. `event.original` is **not** stored unless masked.
   - **Keyed HMAC is mandatory.** Phone numbers and many usernames have tiny key spaces, so a plain SHA-256 can be brute-forced in seconds. Key in Vault/KMS, versioned (`mask.key_id` on every event), custodian separate from Elasticsearch administrators. Tokens are deterministic, so one user is still correlatable across events.
3. **Sealer** (small custom service; Logstash cannot build Merkle manifests). Uses `(topic, partition, offset)` as the gap-free sequence number. Details in section 7.
4. **ES-side guard (reject-only).** A default ingest pipeline on `audit-logs` fails documents lacking `mask.applied: true` or matching an e-mail/phone regex in any string field (Painless `script` processor, allowed on Basic). Failed documents are rerouted to `audit-quarantine` carrying **metadata only** (Kafka coordinates, error), never the offending content. The pipeline **must not modify** the document: any mutation after sealing would invalidate `event.hash`. (The ES `redact` processor is licence-gated and would mutate; not used.)
5. **Idempotent writes.** `_id` = base64url of the first 16 bytes of the SHA-256 event hash; Logstash B uses `action => create`, and HTTP 409 is treated as success. This makes Kafka at-least-once replays safe. (Cost: a larger `_id` field and a version lookup per write; within the 0.5 ratio and the headroom above.)
6. **Mapping:** `dynamic: strict`, ECS fields, `event.hash` keyword. `refresh_interval: 30s`, bulk 5–10 MB, `index.codec: default` on hot, `best_compression` via force-merge in warm. Do not rely on `logsdb`/synthetic `_source`; these are license-gated – the sizing is for standard mode.
7. **Back-pressure and outages:** agents' disk queues, Logstash A persistent queue and 72 h of Kafka allow ES or the sealer to be down over a weekend. Catch-up headroom is 2–3×.
8. **Time:** all hosts on chrony/NTP. Keep both source `@timestamp` and `event.ingested`/`seal.time`; source time is untrusted for evidence, seal time is trusted.

---

## 5. ILM, SLM and tiering (Basic-compatible only)

Index template for data stream `audit-logs`: `number_of_shards: 6`, `number_of_replicas: 1`, `lifecycle.name: audit-logs`, `default_pipeline: audit-guard`.

```jsonc
PUT _ilm/policy/audit-logs
{ "policy": { "phases": {
  "hot":  { "actions": {
      "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "7d", "actions": {
      "readonly": {},
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "set_priority": { "priority": 50 } } },
  "delete": { "min_age": "30d", "actions": {
      "wait_for_snapshot": { "policy": "audit-daily" },
      "delete": {} } }
}}}
```

```jsonc
PUT _slm/policy/audit-daily
{ "schedule": "0 30 1 * * ?",
  "name": "<audit-{now/d}>",
  "repository": "audit-snap",            // S3-compatible, NOT object-locked (see 7.5)
  "config": { "indices": ["audit-logs"], "include_global_state": false },
  "retention": { "expire_after": "335d", "min_count": 30 } }
```

- **No `searchable_snapshot` action anywhere.** Tier movement hot→warm uses the automatic data-tier migration (`_tier_preference`).
- `wait_for_snapshot` guarantees an index is deleted from the cluster only after a snapshot that includes it has completed. If snapshots fail, indices pile up on warm (47 % free headroom ≈ 20 days); alert on SLM failure within one day.
- **Why `expire_after` is 335 d, not 365 d:** each daily snapshot contains every index still in the cluster (≈ 31 days). An index's *last* referencing snapshot is taken about 30 days after rollover, so snapshot age 335 d ⇒ data age ≈ 365 d. Using 365 d would silently retain data for ~395 days (and `min_count` protects against a stalled SLM deleting everything).
- Hot is not snapshotted separately: the write-ahead copy in the WORM archive and Kafka covers the gap between snapshots.
- Legal hold: SLM retention would delete snapshots under hold. Holds are enforced on the WORM archive (object-lock legal hold); on hold, disable the SLM retention for the affected period and copy the needed snapshots.

---

## 6. Retrieving data older than 30 days (24 h SLA)

1. Requester submits case ID, time range, justification (ticket). Range capped at ~75 days per request, else split or add nodes.
2. Operator powers on the 3 `data_cold` nodes, runs the runbook script: find snapshots covering the range, restore the matching backing indices with `rename_pattern`/`rename_replacement` to `restored-<case>-…`, `index_settings: {number_of_replicas: 0, index.lifecycle.name: null, index.routing.allocation.include._tier_preference: data_cold}`, `include_global_state: false`.
3. **Verify** the restored indices against the signed manifests (section 7.4) before analysts get access. Budget ≈ 1–2 h.
4. Analysts query via a Kibana space bound to `restored-*`. Close the case → delete the restored indices → power nodes off.

Time budget: approval ≤ 1 h + restore ≈ 10 h (30 d) + verification ≈ 2 h ⇒ ≈ 13 h, leaving ≈ 11 h margin. Run a **restore drill every quarter** and record the timing; the SLA is only credible if rehearsed.

Fallback if the snapshot repository is lost: rebuild from the WORM archive by replaying via Logstash. At ≈ 100k ev/s that is 1.728 × 10^9 / 10^5 ≈ 4.8 h per day of data – far too slow for the SLA, so the archive is a disaster-recovery and evidence source, not the primary retrieval path.

---

## 7. Integrity ("provably unaltered")

Elasticsearch on Basic has no write-once capability, and a superuser can always delete or rewrite documents. Therefore **evidence = archive + manifests; Elasticsearch = a searchable copy that is continuously proven equal to the evidence.**

### 7.1 Sealing (Sealer service)
- For every masked event: canonical JSON (sorted keys, UTF-8, no whitespace) → `event.hash` = SHA-256. Stamp `seal.partition`, `seal.offset`, `seal.time`, `mask.key_id`.
- Per Kafka partition, every ≤ 60 s or 50,000 events, produce an archive object `yyyy/mm/dd/hh/p<N>-<firstOffset>-<lastOffset>.ndjson.zst` and a **manifest**: `{partition, first_offset, last_offset, count, merkle_root(event hashes), object_sha256, prev_manifest_hash, seal_time}`.
- `prev_manifest_hash` chains manifests per partition, and the manifest is signed with Ed25519. The private key is non-exportable (HSM/KMS). Deleting, inserting or reordering any batch breaks the chain; offsets make missing events detectable as gaps.
- Hourly, the head of all chains is hashed and sent to an **RFC 3161 timestamp authority** (external, or an internal TSA with its own audit), giving independent proof of *when* the chain existed. Store the token next to the manifests.
- The sealer writes data object and manifest to the WORM bucket **before** publishing to `audit.sealed`; nothing becomes searchable that is not already archived.

### 7.2 WORM storage
- S3-compatible store with **Object Lock in Compliance mode**, retention 366 days from write (12 months + margin), versioning on, separate credentials that the Elasticsearch admins do not hold. Legal holds applied per case.
- Writer credentials have `PutObject` only; no delete, no lifecycle edit.

### 7.3 Elasticsearch hardening (what Basic does offer)
- TLS everywhere, native/file realm users, RBAC, API keys. The Logstash B role: `create_doc` and `auto_configure` on `audit-logs` only (no `index`, `delete`, `manage`). Analysts: `read`/`view_index_metadata`. No human holds `delete_index` on `audit-*`; the ILM/SLM system performs deletion.
- `readonly` action in warm blocks writes after 7 days; restored indices are also read-only.
- Basic has **no** ES security audit log, no document/field-level security, no SAML/LDAP/OIDC (see risks). Compensation: front ES/Kibana with a reverse proxy that logs every request to a separate append-only sink, OS `auditd` on nodes, and ship those to the WORM bucket through the same sealer path.

### 7.4 Continuous verification
- **Daily:** for yesterday's data, recompute `event.hash` from `_source` for every document, compare counts and Merkle roots per partition range to the manifests, check chain continuity, signatures and TSA tokens. Output a signed verification report to the WORM bucket. Any mismatch pages the security on-call.
- **Monthly:** full check of the archive objects (object SHA-256 vs manifest); sample-restore one snapshot and verify.
- **On every restore (section 6):** mandatory verification before access.
- Manifest-only checks are cheap (manifests are tiny); full-document recompute of one day is ≈ 1.7 billion hashes ≈ minutes of CPU on a few cores – scheduled off-peak.

### 7.5 Things that must not be done
- Do **not** put the Elasticsearch snapshot repository in an Object-Lock bucket: Elasticsearch must update `index-N` and delete obsolete blobs, which locks break. Use a separate, ordinary bucket for snapshots; the WORM bucket is for the evidence archive only.
- Snapshots are not tamper-evident by themselves; their trust comes from verification against the manifests.

### 7.6 Evidence export
A tool produces an evidence package for a case: events, their manifests, signatures, TSA tokens, the verification report, and the chain-of-custody log (who restored/queried what).

---

## 8. Risks, conflicts and open points

1. **Customer's searchable-snapshots suggestion conflicts with the Basic license.** Searchable snapshots and the frozen tier need Enterprise. A 30-day trial license would enable them, but when the trial lapses mounted indices stop working, so the trial must not be used to "demo" the architecture. If the customer later buys Enterprise, the frozen tier could replace the restore tier and the 24 h restore with interactive search of the full year on a handful of nodes; the design is forward-compatible (the same SLM repository is used).
2. **Masking vs. evidential value (needs legal decision).** Pseudonymised events are not the original events: the hash proves the *masked* record is unaltered, not that it matches the source. Options: (A, baseline) the masked event is the official record, documented in the evidence policy; (B) additionally archive the **unmasked** original, envelope-encrypted with a key held by legal/compliance, in a second WORM bucket (+≈ 63 TB). B reintroduces PII storage and must be justified under data-protection law. Also settle who may re-identify a token and how (key-custodian procedure).
3. **Immutability vs. erasure rights (e.g. GDPR).** Compliance-mode locks cannot be shortened. Pseudonymisation reduces exposure; destroying a key version is a possible crypto-shredding route but breaks correlation for that key. Legal sign-off needed; the retention period must be the maximum, not just minimum, required.
4. **Free-text PII leakage.** Regexes find e-mails and phones reliably, usernames in free text only via a dictionary. Residual risk; mitigate with structured logging at sources, the ES reject-only guard, and sampling audits.
5. **Basic license limits that affect the requirements:** no ES security audit log, no DLS/FLS (all-or-nothing read per index), no SAML/OIDC/LDAP/AD SSO (native users or reverse-proxy auth), no cross-cluster replication (no active DR cluster), no searchable snapshots, `redact` processor, or `logsdb` mode, and **no vendor support/SLA**. Check the current Elastic subscription comparison for the chosen version before sign-off.
6. **Disaster recovery.** No CCR on Basic. DR = replicate the snapshot bucket and WORM bucket to a second site (store-level replication) and rebuild ES from them. RPO: ≈ 0 for evidence (WORM), ≤ 24 h for ES snapshots (hot data is rebuilt from Kafka/archive). RTO for a full 30-day online rebuild ≈ 10–20 h from snapshots. Single-site operation is a stated risk until the second site is funded.
7. **Compression assumption** is the largest sizing uncertainty (±40 % on storage, section 2.2). PoC before purchase.
8. **Restore SLA depends on throttles and the object store throughput.** Defaults (40 MB/s/node) would make a 30-day restore ≈ 49 h and miss the SLA. Throughput needs verifying on the real store; request scope is capped.
9. **Burst ingest.** The brief states 20,000 ev/s sustained; real audit traffic is bursty. Design headroom is ≈ 2–3× on Logstash and the hot tier; confirm peak and growth (a +50 % growth case adds ≈ 21 TB online and ≈ 126 TB snapshot storage).
10. **Retention precision.** "12 months" is implemented as 365 days (+ ≤ 1 day rollover skew, WORM lock 366 days). Confirm whether the legal minimum is calendar-based.
11. **Operational dependencies not in Elastic:** the custom Sealer, the HSM/KMS, the TSA and Kafka add components to run. They are small, but must be built, tested and owned.
12. **Source timestamps** can be wrong or forged; sealing time and offsets are the trusted ordering. Document this in the evidence policy.

---

## 9. Assumptions and items to confirm

- 20,000 ev/s is sustained average, 800 B average raw JSON, 365-day year.
- Hardware figures are per-node targets, not a vendor BOM; object storage is on-premises S3-compatible with Object Lock support (e.g. MinIO or equivalent) or a public-cloud equivalent.
- Elasticsearch version and the Basic feature matrix confirmed against Elastic's current subscription page before procurement.
- Legal decisions in risks 2 and 3 are required before build.
