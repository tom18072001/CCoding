# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for review. Every figure marked **(assumption)** must be confirmed in a proof of concept (PoC) before hardware is ordered.

## 1. Summary

| Topic | Decision |
|---|---|
| Licence | Elastic **Basic** only. The design uses only Basic features: data streams, ILM, snapshot/restore, TLS and RBAC. |
| Customer suggestion: searchable snapshots | **Not possible on Basic.** Searchable snapshots, and therefore the ILM `searchable_snapshot` action and the frozen tier, need an **Enterprise** licence. Section 2 gives an alternative that meets the retention requirement without them. |
| Online tiers | Hot (days 0–7, NVMe) and warm (days 7–35, large SSD or HDD), both with 1 replica. Together they cover the 30-day interactive requirement. |
| 12-month retention | Per-index snapshots in an object-store repository, taken after the index is merged. Data older than the online window is **restored on request** into an on-demand restore tier, which fits the 24-hour requirement. |
| Integrity | Elasticsearch cannot prove immutability. The evidence of record is a **WORM vault** (object store with Object Lock in compliance mode). It holds the original events, with hash-chained, signed and timestamped manifests. Elasticsearch holds a searchable copy that can be verified against the vault. |
| Masking | Done in Logstash, so unmasked data never reaches Elasticsearch. Elasticsearch has a second regex pass as a safety net. Masking changes the event, which conflicts with "unaltered"; see section 2. |
| Online data size | About 46 TB (hot 11.6 TB plus warm 34.8 TB, replicas included). |
| Archive size | About 227 TB of snapshots plus about 76 TB of WORM raw vault, from 505 TB of yearly raw volume. |

## 2. Conflicts and risks in the inputs

### 2.1 Searchable snapshots are not available on Basic (blocking)
- Mounting snapshots as cold or frozen indices needs an **Enterprise** licence. On Basic, the ILM `searchable_snapshot` action fails with a licence error and the frozen tier cannot be used.
- Snapshot/restore, SLM, ILM (other than the action above) and the hot, warm and cold data tiers are Basic features.
- **Alternative proposed.** The 24-hour requirement does not need old data to be online.
  - Keep only 35 days online as ordinary indices.
  - Hold the rest as ordinary snapshots in an object store, and restore them into a restore tier on request.
  - This reaches the customer's goal, low storage cost for old data, and is cheaper than mounted snapshots. The archive holds one copy at about 0.45× raw size, and only about 46 TB of cluster disk is needed.
  - Cost: old data is not searchable until restored, which is acceptable under the stated 24-hour rule.
- Do not start the PoC on a trial licence. A trial enables paid features that vanish on downgrade to Basic. Run Basic from day 1.

### 2.2 "Provably unaltered" versus "masked before indexing"
- Masking alters the event. If the masked copy is the only copy, it cannot be proven equal to what the source emitted.
- **Resolution.**
  - The original event is hashed **before** masking and stored unmodified in the WORM vault, with restricted access and encryption.
  - Each indexed document carries `event.hash` (of the original) and `event.original_ref` (vault object key and line).
  - The masked document is therefore a derivation that is verifiable, and it can be unmasked only through the vault under legal process.
- Customer and legal decisions needed:
  - May unmasked data exist in the vault at all? Masking must happen "before indexing", and the vault is not an index. If the answer is no, the evidence value of the logs is limited to the masked form, and the design must change to hash and sign at the source.
  - Data-protection erasure requests conflict with compliance-mode WORM, which cannot be shortened by anyone, including the root account. Legal must decide retention and holds up front.

### 2.3 Other Basic-licence gaps
- **No Elasticsearch security audit log** (a paid feature). Who searched the evidence cannot be recorded natively.
  - Mitigation: put all access behind a reverse proxy that logs requests to the WORM vault.
  - Mitigation: restrict direct API access with network controls.
- **No field-level or document-level security, and no SAML/OIDC SSO** (paid features). Basic has TLS, native and file realms, RBAC and API keys.
  - Roles must therefore be coarse, at index level.
  - Analysts see only masked data by design.
  - Confirm this against the current subscription matrix before contract.
- **No cross-cluster replication** (paid). Disaster recovery relies on a second-region copy of the snapshot repository and the vault.
- **Kibana alerting connectors** other than index and server-log are paid. Operational alerting goes through an external tool.
- **No vendor support** on Basic. The operational SLA risk sits with the customer.
- **No encryption at rest** in Elasticsearch. Use LUKS or cloud-volume encryption, and SSE-KMS on the object store.

### 2.4 Risks and open questions
| # | Risk / open question | Impact | Handling |
|---|---|---|---|
| R1 | Compression ratio is an assumption (0.6 hot, 0.45 warm). | Disk may be wrong by ±30–60 %. | Section 3.4 gives a sensitivity table. PoC with 1 day of real data before purchase. |
| R2 | 24-hour restore: the default recovery throttle of about 40 MB/s per node makes a 30-day restore take about 32 h, which misses the SLA. | SLA breach. | Raise `indices.recovery.max_bytes_per_sec` and the repository `max_restore_bytes_per_sec`. With 4 nodes at about 200 MB/s each, 30 days restores in about 6.5 h (section 3.6). Rehearse quarterly. |
| R3 | A snapshot taken before force-merge leaves unmerged segments in the repository for a year. | Archive grows about 2.3×. | The archiver job snapshots **only** indices that have completed the warm phase (section 6). |
| R4 | Snapshot compatibility: a snapshot restores only to the same or a newer version. | Old snapshots may be unreadable after an upgrade. | The restore cluster must be at least the snapshot version. Test restores before each upgrade. Keep the Elasticsearch version recorded per snapshot. |
| R5 | Restored indices still carry the ILM policy name. | ILM could delete them mid-investigation. | Restore with `index.lifecycle.name: null` and a TTL set by the archiver. |
| R6 | Kafka holds **unmasked** events. | PII exposure. | TLS, ACLs, encryption at rest, 72 h retention, restricted to the Logstash and archiver service accounts. |
| R7 | Integrity starts at Kafka ingest. Tampering before collection is not covered. | Evidence gap. | Forward immediately from the source, over TLS. Where possible, sign at the source (customer decision). |
| R8 | Event time comes from the source. | Skewed or forged timestamps. | Record `event.ingested` at Logstash. Require NTP on sources. External RFC 3161 timestamps on manifests prove when data existed. |
| R9 | Peak load is assumed to be 2× sustained, which is 40k EPS. | Customer figure is "sustained" only. | Kafka absorbs bursts. Logstash is sized with N+2 (section 4). Confirm the real peak. |
| R10 | "Interactive" is undefined. | Cannot size or accept. | Assumed target: p95 under 5 s for a 24 h range filtered by user or host on hot, and under 15 s on warm. Customer to confirm. |
| R11 | Single region. No RPO or RTO were given. | Site loss destroys the cluster. | Replicate the snapshot repository and vault to a second region. RPO is the replication lag, up to 15 min. Customer to confirm. |
| R12 | "12 months" is interpreted as 365 days. | Under- or over-retention. | Confirm. Provide a legal-hold flag that suspends expiry. |
| R13 | Masking misses PII in free text or novel formats. | PII indexed. | Regex pass on the whole message, a final-pipeline safety net, and a scheduled leak-scan query (section 5). Unparseable events are quarantined, never indexed. |

## 3. Capacity arithmetic

### 3.1 Raw volume
All volumes use SI units (1 TB = 10¹² bytes). A year is 365 days.

| Quantity | Calculation | Result |
|---|---|---|
| Events per second | given | 20,000 |
| Bytes per second | 20,000 × 800 B | 16 MB/s (128 Mbit/s) |
| Events per day | 20,000 × 86,400 | 1.728 × 10⁹ |
| **Raw per day** | 16 MB/s × 86,400 s | **1.3824 TB** (1.257 TiB) |
| Events per year | 1.728 × 10⁹ × 365 | 6.307 × 10¹¹ |
| **Raw per year** | 1.3824 TB × 365 | **504.6 TB** (458.9 TiB) |
| Raw, 7 days | 1.3824 × 7 | 9.68 TB |
| Raw, 28 days (warm window) | 1.3824 × 28 | 38.71 TB |
| Raw, 30 days | 1.3824 × 30 | 41.47 TB |

### 3.2 Compression assumptions
All ratios are indexed size on disk (primary copy only) divided by raw event size, and are **(assumption)**.
- **Hot, 0.6×.**
  - Default LZ4 codec.
  - Includes `_source`, doc values, the inverted index and the added fields (hash, ECS enrichment, pipeline metadata).
  - Typical structured JSON audit events land between 0.5× and 0.8×.
- **Warm and archive, 0.45×.**
  - After force-merge to 1 segment with `index.codec: best_compression` (DEFLATE), about 25 % smaller than hot.
- **WORM raw vault, 0.15×.**
  - gzip or zstd NDJSON at about 6.7:1, conservative for repetitive audit logs.
- **Kafka, 1.0×.**
  - Producer compression is ignored, as a worst case.

### 3.3 Storage per tier (replicas included)
| Tier | Window | Raw | Ratio | Primary | Copies | Stored | Provisioned disk | Fill |
|---|---|---|---|---|---|---|---|---|
| Hot | days 0–7 | 9.68 TB | 0.60 | 5.81 TB | ×2 (1 replica) | **11.61 TB** | 6 × 4 TB = 24 TB | 48 % (72 % with a zone down) |
| Warm | days 7–35 (30 days interactive plus 5 days of margin for archive verification) | 38.71 TB | 0.45 | 17.42 TB | ×2 | **34.84 TB** | 6 × 12 TB = 72 TB | 48 % (73 % with a zone down) |
| **Online total** | 35 days | | | | | **46.45 TB** | 96 TB | |
| Archive (snapshots) | 12 months | 504.58 TB | 0.45 | 227.06 TB | ×1 (the object store provides durability) | **227.1 TB** | object store | |
| WORM raw vault | 12 months | 504.58 TB | 0.15 | 75.69 TB | ×1 | **75.7 TB** | object store | |
| Object storage total | | | | | | **about 303 TB** | | |
| Kafka | 72 h | 4.15 TB | 1.0 | 4.15 TB | ×3 (RF 3) | **12.4 TB** | 3 × 8 TB = 24 TB | 52 % |
| Restore tier (transient) | up to 58 days per request | 80.2 TB | 0.45 | 36.1 TB | ×0 (the snapshot is the copy) | 36.1 TB | 4 × 12 TB = 48 TB | 75 % |

Notes:
- Hot and warm fill targets stay below the 85 % low watermark, even with one zone down.
- The restore-tier capacity of 58 days is 48 TB × 0.75 ÷ 0.622 TB/day, where 0.622 TB/day is 1.3824 × 0.45.
- Object-store totals exclude the optional second-region copy, which doubles them to about 606 TB.

### 3.4 Sensitivity to the compression assumption
Warm ratio is held at 0.75 × the hot ratio. Sizes are in TB.

| Hot ratio | Hot stored (7 d × 2) | Warm stored (28 d × 2) | Archive (12 months) | Hot fill (24 TB, all nodes up / zone down) | Warm fill (72 TB, all nodes up / zone down) |
|---|---|---|---|---|---|
| 0.40 | 7.7 | 23.2 | 151.4 | 32 % / 48 % | 32 % / 48 % |
| **0.60** | **11.6** | **34.8** | **227.1** | **48 % / 73 %** | **48 % / 73 %** |
| 0.80 | 15.5 | 46.5 | 302.7 | 65 % / 97 % | 65 % / 97 % |
| 1.00 | 19.4 | 58.1 | 378.4 | 81 % / over | 81 % / over |

The hardware tolerates up to about 0.7 with a zone down, and about 1.0 with all nodes up, before crossing the 85 % watermark. Above that, add nodes. Disks can be bought in the last procurement step, after the PoC.

### 3.5 Shard sizing
- Hot daily primary volume is 1.3824 × 0.6 = 0.83 TB. At a 50 GB target primary shard that is about **17 primary shards per day**.
- Index template: 6 primaries and 1 replica. Rollover at `max_primary_shard_size` 50 GB, giving about 2.8 indices per day.
- After warm force-merge, shards are about 37 GB (50 × 0.45 / 0.6).
- Total online shards: 17 × 35 days × 2 = about 1,200, which is about 100 per data node. That is well under the roughly 20 shards per GB of heap guideline.

### 3.6 Restore time (24-hour requirement)
- 30 days of archive is 30 × 0.622 = 18.7 TB.
- Default throttle, 4 nodes × 40 MB/s = 160 MB/s: 18.7 TB ÷ 160 MB/s = 117,000 s, or **about 32 h. This misses the SLA.**
- Tuned throttle, 4 nodes × 200 MB/s = 800 MB/s: 18.7 TB ÷ 0.8 GB/s = 23,400 s, or **about 6.5 h**.
- Provisioning (1–2 h) and hash verification (2–4 h) are added. Total budget is about 12 h, leaving slack inside 24 h.
- Repository read throughput must sustain 800 MB/s (assumption, to be tested in the PoC).

## 4. Node layout

Assumed per-node specs are indicative; the cloud or on-prem equivalent is to be chosen. Three availability zones, with data nodes spread evenly and `cluster.routing.allocation.awareness.attributes: zone`.

| Role | Count | Spec (per node) | Purpose / notes |
|---|---|---|---|
| Collection agents | at sources | Elastic Agent or Filebeat | TLS to Kafka, disk-backed queue. |
| Kafka brokers | 3 (1 per zone) | 8 vCPU, 32 GB, 8 TB SSD | Raw topic, RF 3, 72 h. Not an Elastic product. If the customer cannot add it, replace with Logstash persistent queues and lose the independent replay buffer. |
| Logstash | 6 | 8 vCPU, 16 GB | N+2. Assume about 5k EPS each with regex masking, so 4 nodes carry the 20k average and 6 carry the 2× peak of 40k EPS. |
| Raw archiver | 2 | 4 vCPU, 8 GB | Kafka consumer group, writes the WORM vault (section 6). |
| Dedicated master | 3 (1 per zone) | 4 vCPU, 16 GB | `master` only. |
| **Hot** (`data_hot,data_content`) | 6 (2 per zone) | 16 vCPU, 64 GB (30 GB heap), 4 TB NVMe | Indexing and days 0–7. |
| **Warm** (`data_warm`) | 6 (2 per zone) | 16 vCPU, 64 GB (30 GB heap), 12 TB SSD or RAID-10 HDD | Days 7–35. Memory-to-disk about 1:190, acceptable for read-mostly data. |
| **Restore** (`data_cold`) | 4, off by default | 16 vCPU, 64 GB, 12 TB | Provisioned by infrastructure-as-code on request. The name `data_cold` is reused for tier routing only. 0 replicas. Torn down after the case TTL. |
| Coordinating | 2 | 8 vCPU, 32 GB | Query fan-out, behind the logging reverse proxy. |
| Kibana | 2 | 4 vCPU, 8 GB | Behind the same proxy. |
| Object stores | 2 buckets | S3-compatible | (a) snapshot repository (normal bucket, written by Elasticsearch); (b) WORM vault (Object Lock, compliance mode). Separate credentials and ideally separate accounts. |

Hot indexing check: 20k docs/s × 2 copies spread over 6 nodes is about 6.7k docs/s per node, which is comfortable.

## 5. Ingest pipeline

```
sources ──TLS──▶ Kafka (topic audit.raw, 72 h) ─┬─▶ Logstash ×6 ──▶ Elasticsearch data stream  logs-audit-prod
                                                 │    1 parse   2 hash   3 mask   4 route
                                                 └─▶ Raw archiver ──▶ WORM vault (signed manifests)
```

1. **Collect.** Agents ship to Kafka over TLS with a disk-backed queue (at-least-once delivery).
2. **Parse and normalise (Logstash).** Map to ECS fields. Set `event.ingested` to the Logstash time.
3. **Hash (before any change).** `fingerprint` filter, `method => SHA256`, with a key from the Logstash keystore, over the raw message. The result goes to `event.hash`. The Kafka coordinates go to `event.original_ref` (topic, partition, offset), and the archiver resolves them to a vault key.
4. **Mask.**
   - `user.name`, `user.email` and phone fields are replaced by deterministic keyed pseudonyms: `usr_` + first 16 hex characters of HMAC-SHA256(key, normalised value). The same user maps to the same token, so analysts can still correlate and count.
     - A keyed HMAC is mandatory. A plain hash of a phone number can be brute-forced in minutes.
     - The key lives in KMS and the Logstash keystore, and is versioned (`mask_key_id` is stored per document).
     - To search for a known user, the analyst tool calls a small lookup service that computes the token, and that service is logged. Kibana users never see the key.
   - E-mail keeps only the domain: `<token>@example.com`. Phone numbers keep only the country code and the last two digits.
   - A regex pass over `message` and all `*.original`-style free-text fields catches e-mails and phone numbers that appear outside the named fields.
   - Any event that fails to parse is **not indexed**. It goes to a quarantine topic (restricted, 72 h) and raises an alert.
5. **Index.** Write only to the data stream `logs-audit-prod` using `op_type: create`. The Logstash role has only `create_doc` and `auto_configure`. It has no `delete`, `index` or `write` rights on existing documents.
6. **Elasticsearch safety net.** The template sets `index.final_pipeline: audit-final`, which applies the e-mail and phone regexes with `gsub` to every string field. The ingest pipeline is a backstop only, because anything done in Elasticsearch happens after the data has arrived there. The `redact` processor is not used, since it may need a paid licence.
7. **Template.** `dynamic: strict` mappings. `_source` is kept in full. `index.codec` is default on hot.
8. **Leak detector.** A scheduled job runs regex queries for e-mail and phone patterns over the last hour and alerts on any hit. A weekly synthetic canary event with fake PII must appear masked.

## 6. Integrity design

Principle: **Elasticsearch is not the evidence; the WORM vault is.** Elasticsearch is a searchable derivation that can be verified against the vault.

### 6.1 Evidence chain
1. The **raw archiver** consumes the same Kafka topic with its own consumer group. It writes batches (one per partition per 5 minutes, or 128 MB) as `raw/YYYY/MM/DD/HH/<partition>-<firstOffset>-<lastOffset>.ndjson.gz`. The first and last offsets make gaps detectable.
2. For each object it computes SHA-256.
3. Each hour it builds a **manifest** listing every object (key, SHA-256, offset range, event count) plus the **SHA-256 of the previous manifest**. This forms a hash chain, so removing or altering any past hour invalidates every later manifest.
4. The manifest is **signed** with an asymmetric key held in an HSM or KMS (non-exportable). The archiver can sign but cannot read the private key.
5. The manifest is **timestamped** with an external RFC 3161 time-stamp authority. Once a day, the chain head is also sent to an independent party (the legal department's separate account).
6. Objects are written to a bucket with **Object Lock in compliance mode**. Retention is 12 months plus a margin. A legal-hold flag can extend it. Nobody, including account root, can delete or shorten it. The writer role has no delete or lock-modify rights. The signing key is outside the cloud account that holds the bucket.

### 6.2 Verification
- **Daily job.**
  - Recompute object hashes and walk the manifest chain.
  - Compare per-hour event counts in the manifests against `count(event.ingested in hour)` in Elasticsearch.
  - Alert on any mismatch, and write the result to the vault.
- **On demand.** For a document, re-hash the vault object and compare with `event.hash`. A search hit can be proven against the vault line named in `event.original_ref`.
- **After a restore.** Run the same count and hash comparison before the data is released to investigators.

### 6.3 Hardening inside Elasticsearch
- Backing indices go `read_only` after rollover. Warm indices are additionally force-merged and set read-only.
- Application roles are read-only on `logs-audit-*`. Only a break-glass superuser can delete, and its use is logged at the proxy (Elasticsearch audit logging is not available on Basic, see 2.3).
- TLS on all transport and HTTP links, with certificate-based node authentication.
- Snapshot repository credentials are separate from vault credentials. The restore cluster mounts the repository read-only.

### 6.4 What this does not prove
Events altered **before** they reach Kafka are not detectable (R7). Snapshot checksums detect corruption, but not deliberate replacement by someone with repository write access. That is why the vault, not the snapshot, is the legal proof.

## 7. ILM and lifecycle

### 7.1 Policy `audit-ilm`
There is deliberately **no delete phase** (see 7.2).

```json
PUT _ilm/policy/audit-ilm
{
  "policy": { "phases": {
    "hot": { "min_age": "0ms", "actions": {
      "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
    "warm": { "min_age": "7d", "actions": {
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "readonly": {},
      "set_priority": { "priority": 50 } } }
  } }
}
```

- Data tiers move indices automatically (`_tier_preference`). No `allocate` action is needed.
- There is no `searchable_snapshot` action anywhere, because it is Enterprise-only.
- Index template: 6 primaries, 1 replica, zone awareness, `dynamic: strict`.

### 7.2 Archiver job (cron or Kubernetes CronJob, every 30 minutes)
A native ILM delete is unsafe here. Without `searchable_snapshot`, ILM cannot tell whether a snapshot exists. An SLM policy cannot be used for the snapshots either, because it would snapshot hot indices and cause R3. The job therefore does the following.
1. Find backing indices where `_ilm/explain` reports `phase: warm` and `step: complete` and which are not yet archived.
2. Create the snapshot `audit-<index-name>` in repository `audit-archive`, with `include_global_state: false`. Wait for `SUCCESS`.
3. Verify snapshot shard counts, and that document counts equal the index.
4. Check the vault for the corresponding hours, using the daily verification result.
5. Only then delete the index. This happens at about day 35, and the index is already a read-only warm index.
6. Delete snapshots older than 12 months, unless a legal-hold flag is set.
7. Alert if any index is older than 40 days and still online, or if any step fails.

### 7.3 Restore procedure
1. Request logged and approved (ticket reference stored in the vault).
2. Bring up the 4 restore nodes through infrastructure-as-code. Set the raised recovery throttles.
3. Restore the requested snapshots with `index_settings: { "index.number_of_replicas": 0, "index.lifecycle.name": null }`, routed to the restore tier (R5).
4. Run the integrity verification (section 6.2), then grant read-only access to the investigators.
5. Delete the restored indices at the case TTL (default 14 days) and shut the nodes down.

## 8. Operations and validation plan
- **PoC (2 weeks, Basic licence from the start):**
  - 1 day of real masked data, to measure the compression ratio, EPS per Logstash node and query p95.
  - Restore of 1 day, extrapolated to 30 days.
  - Verify that all licence-dependent features work on Basic.
- **Monitoring:** Metricbeat to a small separate monitoring cluster. Key alerts are Kafka consumer lag above 5 minutes, ILM errors, archiver failures, indices still online after 40 days, a failed vault verification, any leak-detector hit, and disk watermark warnings at 75 %.
- **Drills:** quarterly restore of 30 days timed against the 24-hour SLA. Quarterly vault-verification drill, including a deliberately tampered test object.
- **Upgrade policy:** test restoring the oldest snapshots on the target version before every upgrade (R4).

## 9. Decisions needed from the customer
1. Accept that searchable snapshots are replaced by archive plus restore (section 2.1), or buy an Enterprise licence.
2. Confirm that the unmasked original may be held in the WORM vault, and set the retention and legal-hold policy (section 2.2).
3. Define "interactive" and the real peak EPS (R9, R10).
4. Define RPO and RTO, and approve a second region (R11).
5. Approve Kafka as an additional (non-Elastic) component.
6. Confirm 12 months equals 365 days (R12).
