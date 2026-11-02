# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for customer review. Classification: internal.
All figures marked **(A)** are assumptions that must be confirmed in a proof of concept (PoC) with real events before purchasing hardware.

## 1. Summary and key decisions

| Topic | Decision |
|---|---|
| Customer suggestion "searchable snapshots for cold/frozen" | **Not possible under the Basic license.** Searchable snapshots (cold and frozen tiers) are an Enterprise feature (see §9, verify against the current Elastic subscription matrix before signing). We replace it with **ordinary snapshots plus restore-on-demand** into a pool of "restore" nodes. This still meets "older data searchable within 24 h". |
| Interactive window | 30 days in a hot tier (NVMe, 1 replica). |
| 30 days to 12 months | Stored only as snapshots in an S3-compatible object store (no live indices). Restored on request. |
| Evidence / "provably unaltered" | Elasticsearch is **not** the evidence store (admins can alter indices, and Basic has no ES audit logging). Evidence = signed, hash-chained, time-stamped batch files in a WORM (S3 Object Lock, compliance mode) bucket, plus a per-event hash inside each document. |
| PII masking | Done in Logstash before data reaches Elasticsearch (keyed HMAC pseudonymization), with an Elasticsearch `final_pipeline` as safety net. |
| Conflict to resolve | Masking changes the event, so "unaltered" can only be proven for the **masked** form unless the original is also retained. Needs a legal decision (§8, R1). |

## 2. Inputs and capacity arithmetic

### 2.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 ev/s x 800 B | 16,000,000 B/s = 16 MB/s (about 128 Mbit/s) |
| Events per day | 20,000 x 86,400 | 1.728 x 10^9 |
| **Raw per day** | 1.728 x 10^9 x 800 B | **1.3824 TB** (1.257 TiB) |
| Raw per 30 days | 1.3824 x 30 | 41.47 TB |
| **Raw per year (365 d)** | 1.3824 x 365 | **504.6 TB** (458.9 TiB); 1.728e9 x 365 = 6.31e11 events |

(TB = 10^12 B. A leap year adds 0.27 %.)

### 2.2 Compression assumption (A)

Index size / raw size, with `index.codec: best_compression`, explicit mappings (keyword for IDs, no dynamic text duplication), `_source` kept in full (needed for evidence re-verification), 1 primary copy, no replica: **ratio r = 0.6** (index includes `_source`, doc values, inverted index and the per-event hash field of 64 hex chars). Typical log indices land between 0.4 and 1.0 depending on cardinality; sensitivity is shown below. The PoC must measure r on 1 day of real data.

| r | Primary per day | Hot, 30 d x 2 copies | Snapshot repo, 365 d |
|---|---|---|---|
| 0.4 | 0.553 TB | 33.2 TB | 201.8 TB |
| **0.6 (plan)** | **0.829 TB** | **49.8 TB** | **302.7 TB** |
| 0.8 | 1.106 TB | 66.4 TB | 403.7 TB |
| 1.0 | 1.382 TB | 82.9 TB | 504.6 TB |

### 2.3 Storage per tier (r = 0.6)

| Tier | Content | Copies | Net data | Provisioned disk and rationale |
|---|---|---|---|---|
| **Hot** (NVMe) | last 30 d (plus about 1 d currently being written) | primary + 1 replica | 0.829 x 30 x 2 = **49.8 TB** | 10 nodes x 8 TB = **80 TB** raw; 62 % full at plan, ceiling 70 % by design (below the 85 % low watermark). Survives loss of 1 node: 9 x 8 x 0.85 = 61 TB >= 49.8 TB. Tolerates up to r about 0.67 before adding nodes. |
| **Archive** (S3-compatible object store) | ES snapshots of every day, kept 365 d (31-365 d only here; the last 30 d also exist as hot indices) | snapshots have no replica; durability from object-store erasure coding | 0.829 x 365 = **302.7 TB** (of which 277.7 TB are older than 30 d) | about **360 TB** usable (about 20 % headroom). A second site/copy for DR doubles it (about 720 TB). |
| **Restore pool** (HDD) | indices restored on demand | 0 replicas during restore | up to 25 TB per 30 d of history | 6 nodes x 16 TB = 96 TB raw, 67 TB at 70 %: about 80 days of history per request. Powered off or scaled to zero when idle. |
| **Evidence store** (S3 Object Lock bucket) | masked events as NDJSON.zst plus manifests | per object-store durability | 504.6 TB / 8 (A: zstd on JSON) = **about 63 TB** for 12 months | 80 TB usable, and the same again for a second copy. |
| Kafka buffer | 72 h of masked or unmasked stream | RF 3 | 1.3824 x 3 x 3 (assume 1:1 on disk) = 12.4 TB | 3 brokers x 6 TB. |

If the customer prefers always-online data for all 12 months (no restore step), the only Basic-compatible way is a plain warm/cold HDD tier with real shards: 277.7 TB primary, 555 TB with 1 replica, or 278 TB with 0 replicas relying on snapshots. That is about 18-35 data nodes (16 TB each at 70 %). This is **Option B**, not recommended on cost; the restore design is Option A (chosen).

## 3. Node layout

| Role | Count | Spec (each) | Notes |
|---|---|---|---|
| Hot data (`data_hot`, `data_content`, `ingest`) | 10 | 16 vCPU, 64 GB RAM (31 GB heap), 8 TB NVMe | Indexing load is small per node (2,000 primary ev/s, about 4,000 incl. replica); disk is the sizing driver. |
| Dedicated master | 3 | 4 vCPU, 16 GB | Quorum of 3, across 3 failure zones. |
| Coordinating | 2 | 8 vCPU, 32 GB | Behind load balancer, used by Kibana and search clients. |
| Restore pool (`data_cold`) | 6 | 16 vCPU, 64 GB, 16 TB HDD | On demand. Restore speed (A): about 1.5 GB/s aggregate from object store, so 25 TB (30 d) takes about 4.6 h, well inside 24 h including approval and verification. |
| Kibana | 2 | 4 vCPU, 8 GB | TLS, RBAC. |
| Logstash | 4 | 16 vCPU, 32 GB | 20k ev/s needs about 5k ev/s per node for regex masking plus hashing (A, PoC) with 1 node spare. |
| Kafka | 3 | 8 vCPU, 32 GB, 6 TB | Decouples collectors from ES; absorbs 72 h outage. Kafka is free. |
| Monitoring cluster | 1 small | 4 vCPU, 16 GB | Stack monitoring on a separate cluster (Basic). |
| Signer / evidence writer | 2 (active/standby) | 4 vCPU, 8 GB | Holds signing key in HSM or KMS. |

Zones: 3 failure zones with `cluster.routing.allocation.awareness.attributes: zone`, so primary and replica are never in the same zone.

## 4. Ingest pipeline

```
Sources -> Elastic Agent/Filebeat (TLS) -> Kafka (topic audit-raw, 24 partitions)
        -> Logstash (parse, HMAC-mask, canonicalise, hash)
             |-> output 1: Elasticsearch data stream audit-logs (bulk, _id = event hash)
             |-> output 2: Evidence writer (batch files -> WORM bucket)
```

Logstash steps, in order:

1. **Parse** to ECS-like fields; drop nothing silently (failed parse goes to `audit-deadletter`, tagged, still hashed).
2. **Capture original timestamp and source** (`event.original_ts`, `log.source`, `event.seq` from the collector).
3. **Mask** (before anything is indexed or written to output 1):
   - Known fields (`user.name`, `user.email`, `client.phone`): replaced by `HMAC-SHA256(key, normalised value)` truncated to 16 hex chars with a type prefix (`usr_`, `eml_`, `tel_`). The same user maps to the same token, so investigations can still correlate activity; the original cannot be recovered without the key. The key lives in the Logstash keystore/KMS, never in config files or in the cluster; rotation is versioned (`mask.key_id`).
   - Free text (`message`, `event.original`, URL/query strings): regex passes for e-mail (`[\w.+-]+@[\w-]+\.[\w.-]+`), phone (E.164 and common national formats) and known usernames from a lookup list; matched text replaced by the same token scheme.
   - **Do not keep `event.original`** unmasked in `_source`.
4. **Canonicalise and hash**: serialise the masked event as JSON with sorted keys, UTF-8, no whitespace; `event.hash = SHA-256(canonical bytes without the hash field)`. This is stored in the document and used as `_id` (also gives idempotent retries and duplicate protection).
5. **Output** to Elasticsearch (bulk, 5 MB batches, retries) and in parallel to the evidence writer (§6).

Elasticsearch side:

- Index template for data stream `audit-logs`: explicit mappings (`dynamic: strict` on the core, `dynamic: false` for the free-form object), `index.codec: best_compression`, `number_of_shards: 16`, `number_of_replicas: 1`, `index.refresh_interval: 30s`, `index.lifecycle.name: audit-ilm`, `_source` enabled (no synthetic source, so the document remains verifiable).
- `index.final_pipeline: audit-pii-guard`: a safety net with `gsub`/`pattern` processors that **rejects** (fail processor, event goes to dead letter) any document still matching an e-mail or phone regex. This protects against a Logstash misconfiguration.
- Roles: ingest user may only `create` on `audit-logs*` (no update/delete); analysts are read-only. Role-based access control and TLS are in Basic. Field/document-level security is **not** (see §9), so masked and non-masked data must never share an index.

## 5. ILM and snapshot policy

Shard sizing: 0.829 TB/day / 16 primaries = **about 52 GB per primary shard** (target 30-60 GB). 16 primaries x 2 copies x 30 d = about 960 shards over 10 nodes (about 96 per node; fine).

```json
PUT _ilm/policy/audit-ilm
{ "policy": { "phases": {
  "hot":    { "actions": { "rollover": { "max_age": "1d", "max_primary_shard_size": "60gb" } } },
  "warm":   { "min_age": "2d",
              "actions": { "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
                           "readonly": {} } },
  "delete": { "min_age": "31d",
              "actions": { "wait_for_snapshot": { "policy": "audit-daily" }, "delete": {} } }
} } }
```

(`min_age` counts from rollover. The "warm" phase runs on the same hot nodes; there is no separate warm hardware. Final syntax must be validated on the target stack version in the PoC.)

SLM (snapshot lifecycle management, available in Basic):

```json
PUT _slm/policy/audit-daily
{ "schedule": "0 30 0 * * ?", "name": "<audit-{now/d}>",
  "repository": "audit-s3", "config": { "indices": ["audit-logs"], "include_global_state": false },
  "retention": { "expire_after": "366d", "min_count": 366, "max_count": 400 } }
```

- Every index is snapshotted before ILM may delete it (`wait_for_snapshot`); a failed snapshot blocks deletion, so hot disk would fill: alert on SLM failure and on hot disk above 75 %.
- Snapshot repository `audit-s3` is a normal bucket (ES must be able to delete and rewrite its metadata, so it **cannot** be under Object Lock). Its role is searchability, not evidence.
- No `searchable_snapshot` action is used anywhere.

**Restore on request (the 24 h path)**: ticket approved, then script restores the needed day range as `restored-audit-YYYY.MM.DD` with `number_of_replicas: 0`, allocation pinned to the `data_cold` restore pool, then the data is verified (§6) and opened to the requester through a read-only alias. Restored indices are deleted after the request closes (default 30 d).

## 6. Integrity guarantees ("provably unaltered")

Layers, from the event to the archive:

1. **Per-event hash** (`event.hash`, §4) computed in Logstash on the canonical masked event. Any later change to a stored document changes its recomputed hash.
2. **Batch files**: the evidence writer groups events by source and hour into `NDJSON.zst` files, writes a manifest with file name, event count, first/last `event.seq` per source, SHA-256 of the file and **the hash of the previous manifest** (hash chain, so a deleted or inserted batch breaks the chain). Per-batch rather than per-event chaining avoids a serial bottleneck at 20k ev/s.
3. **Signature**: each manifest is signed (Ed25519 or RSA-3072) with a key held in an HSM/KMS; the key is not reachable from the Elastic cluster or admins of the cluster.
4. **Trusted timestamp**: each manifest (or each daily chain head) is time-stamped with an RFC 3161 TSA, which proves the data existed at that time.
5. **WORM storage**: files and manifests are written to an S3 bucket with **Object Lock, compliance mode**, retention 366 d (plus legal-hold capability), in a second site as well. Nobody, including root, can shorten the retention.
6. **Gap detection**: `event.seq` per source plus the manifest counts reveal missing events (e.g. dropped before ingestion).
7. **Verification procedure**: after any restore or on a schedule (weekly sample, 100 % before any evidence export), a job re-exports documents, recomputes `event.hash`, compares counts and hashes with the signed manifests, verifies the chain and signatures. The result is itself logged and signed.

What this does and does not prove: it proves that the stored masked events are identical to what the pipeline emitted. It does not prove authenticity before the collector (source-side tampering) unless sources sign events or use trusted agents; see R3.

## 7. Operations notes

- Security (TLS everywhere, RBAC, API keys) is available in Basic. Separate roles: ingest (create only), analyst (read), restore operator, platform admin. Admin actions are not logged by Elasticsearch in Basic, so place a reverse proxy in front of the API and Kibana that logs requests to the WORM store.
- Monitoring: Metricbeat to the monitoring cluster; alerts on SLM failures, restore job failures, hot disk, Kafka lag, dead-letter rate, PII-guard rejections, chain-verification failures. Rule alerts in Basic are limited in connectors (e.g. log, index, e-mail via external tooling); confirm needs.
- Disaster recovery: Cross-cluster replication is not in Basic; DR is the second-site snapshot/evidence copy plus rebuild from Kafka/restore. RPO is bounded by the snapshot interval for ES, but evidence files are near-continuous.

## 8. Risks and conflicts in the inputs

| ID | Risk / conflict | Impact | Proposed handling |
|---|---|---|---|
| **R0** | **"Searchable snapshots" vs Basic license**: the feature is Enterprise-only, so the customer's suggestion and the budget constraint contradict each other. | Suggested design is not licensable. | Use snapshots plus restore-on-demand (Option A). If instant search of all 12 months is wanted, either pay for Enterprise (frozen tier would cut hot-class storage drastically) or build Option B. Customer decision. |
| **R1** | **Masking vs legal evidence**: masking irreversibly alters the data, while evidence must be unaltered. A court might ask for the original. | Evidence may be challenged or incomplete. | Get legal sign-off that the masked, hash-chained record is the record of evidence **or** also retain the original, encrypted (per-batch key in KMS) in a separate WORM bucket outside the search path, accessible only through a break-glass procedure. This adds about 63-100 TB (A) per copy and reintroduces PII storage and GDPR-type obligations. Not included in the sizes above. |
| R2 | Pseudonymization is not anonymization: HMAC tokens are personal data if the key is held. Free-text regex masking can miss variants (e.g. obfuscated e-mail, local phone formats). | Residual PII in the index. | Final-pipeline guard, regular PII scans on samples, test corpus in the PoC, key governance. |
| R3 | Trust in sources: integrity starts at the collector. | Tampering upstream is undetected. | Signed agent configuration, TLS client certificates, optional source-side signing. |
| R4 | Compression ratio unknown (r 0.4-1.0). | Hot tier +-60 % in size (33-83 TB). | Measure in PoC; the layout can grow by adding hot nodes. Over 0.67, plan 12+ nodes. |
| R5 | 24 h SLA depends on restore throughput, approvals and object-store bandwidth; requests spanning more than about 80 days exceed the restore pool. | SLA miss on large requests. | Chunked restores; define maximum request size in SLA; test restore time in PoC with a full 30-day set. |
| R6 | No Elasticsearch audit log, no field/document-level security, no CCR on Basic. | Weaker admin accountability; no in-index PII separation; no live DR. | Compensating controls above (proxy log, separate indices, snapshot DR). |
| R7 | Snapshot repository is mutable by design; it is not WORM. | Snapshot data can be deleted by an admin. | Evidence copy is in a separate WORM bucket, the repository is only a convenience copy; restrict bucket credentials. |
| R8 | A blocked snapshot blocks ILM delete and fills the hot tier. | Ingest outage. | Alerting at 75 % disk; Kafka 72 h buffer. |
| R9 | Hardware figures and throughput of Logstash are estimates, not benchmarks. | Under- or over-sizing. | PoC benchmark at 20k ev/s sustained for 24 h before purchase. |
| R10 | Retention of exactly 12 months versus data-protection deletion duties (right to erasure vs legal hold). | Legal conflict. | Define the legal basis and retention in writing; deletion happens only via object-lock expiry. |

## 9. License notes (Basic) to confirm at contract time

Used and believed available in Basic: Elasticsearch, Kibana, Logstash, Beats/Elastic Agent, TLS and RBAC security, ILM, SLM, snapshot to S3-compatible repository, stack monitoring, `wait_for_snapshot`. Believed **not** in Basic: searchable snapshots (Enterprise), cross-cluster replication, field/document-level security, Elasticsearch audit logging, machine learning, advanced alerting connectors. These statements come from the author's knowledge of the Elastic subscription matrix and were **not** re-checked against the live matrix for this document; verify the exact version before ordering.

## 10. Next steps

1. PoC: one day of real data, measure r, Logstash throughput, masking misses, restore time.
2. Legal decision on R0 and R1.
3. Finalise hardware by PoC results; build and run the verification job and a tamper test (modify a document, delete a batch) as acceptance tests.
