# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for customer review.
Target: Elasticsearch 8.19 LTS or 9.x, **Basic (free) license only**.

## 0. Summary and decisions needed

1. **The customer's searchable-snapshots suggestion cannot be implemented on Basic.** Mounting searchable snapshots, which is what the cold and frozen tiers use, needs an Enterprise subscription. The mount call fails with a license error on Basic. This design reaches the same goal (cheap storage for months 2–12) with plain snapshots on object storage, plus a dedicated restore tier that rehydrates data on request. That fits the "searchable within 24 hours" requirement exactly. Section 4 has the trade-off and the fallback.
2. **"Mask PII before indexing" conflicts with "provably unaltered".** Masking changes the event. The design keeps a sealed, encrypted, access-controlled raw original in WORM storage. The masked copy in Elasticsearch carries cryptographic pointers back to it. The customer's legal counsel must confirm this model (Section 8, R1).
3. **Basic has no tamper-evidence in Elasticsearch itself.** Integrity is built outside Elasticsearch: hash chaining, signed blocks, S3 Object Lock and RFC 3161 timestamps (Section 6).

Headline numbers (derivations in Section 1):

| Item | Value |
|---|---|
| Raw volume | 1.38 TB/day, 504.6 TB/year |
| Interactive tiers (hot + warm, with replicas) | ≈ 51 TB of data on 96 TB of provisioned disk |
| Snapshot repository (12 months, 1 copy) | ≈ 252 TB |
| WORM evidence archive (12 months) | ≈ 126 TB |
| Restore tier (on-demand, 0 replicas) | 60 TB provisioned |

## 1. Capacity arithmetic

### 1.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 ev/s × 800 B | 16.0 MB/s |
| Events per day | 20,000 × 86,400 | 1.728 × 10⁹ |
| **Raw per day** | 16.0 MB/s × 86,400 s | **1.3824 TB (1.257 TiB)** |
| Events per year | 1.728 × 10⁹ × 365 | 6.31 × 10¹¹ |
| **Raw per year** | 1.3824 TB × 365 | **504.6 TB (458.9 TiB)** |
| Raw per 30 days | 1.3824 × 30 | 41.5 TB |

Sizing basis: 800 B average, constant, 24/7, and no headroom in the customer figure. I size the ingest path for 2× (40k ev/s) to absorb bursts and catch-up after outages.

### 1.2 Compression and index-size assumptions

These are assumptions, not measurements. A proof of concept with 1–2 days of real data must confirm them before procurement. Section 1.5 shows the sensitivity.

| Stage | Ratio (stored ÷ raw) | Reason |
|---|---|---|
| Hot, default LZ4 codec | **0.8** | Parsed ECS-style document, `_source` + doc values + inverted index. The structured fields add overhead that LZ4 offsets only partly. |
| Warm / snapshot, after `forcemerge` to 1 segment with `best_compression` | **0.5** | Fewer segments and a stronger codec. |
| WORM evidence archive (raw + hashes, compressed) | see 1.4 | Hashes do not compress. |

Replica policy: 1 replica in hot and warm, so storage is ×2. The restore tier uses 0 replicas because the data is disposable and re-restorable. Snapshot repositories hold 1 logical copy, because the object store provides durability.

The online tiers are sized slightly longer than 30 days. ILM ages indices from **rollover**, not from document time, so an index can hold documents up to about 1 day older than its age implies. Deleting at 31 days after rollover guarantees that at least 30 days of events are online. Hot holds about 8 days and warm holds about 24 days, 32 in total.

### 1.3 Storage per tier

| Tier | Data held | Raw equivalent | × ratio | × replicas | Data on disk |
|---|---|---|---|---|---|
| **Hot** (days 0–8) | 8 d | 8 × 1.3824 = 11.06 TB | × 0.8 = 8.85 TB | ×2 | **17.7 TB** |
| **Warm** (days 8–32) | 24 d | 24 × 1.3824 = 33.18 TB | × 0.5 = 16.59 TB | ×2 | **33.2 TB** |
| **Interactive subtotal** | 32 d | | | | **50.9 TB** |
| **Snapshot repo** (full 12 months, 1 copy) | 365 d | 504.6 TB | × 0.5 = 252.3 TB | ×1 | **≈ 252 TB** |
| **Restore tier** (on-demand) | up to 2 × 30 d | 83 TB | × 0.5 = 41.5 TB | ×1 (0 replicas) | **41.5 TB** |
| Kafka buffer (72 h, raw, RF 3) | 3 d | 4.15 TB | × 1.0 | ×3 | 12.4 TB |

Provisioned disk targets about 50–70% utilisation. Utilisation must stay below the 85% low watermark even with one node lost (N-1). Disk figures are usable capacity after RAID and filesystem overhead.

| Tier | Nodes × usable disk | Provisioned | Fill (normal / N-1) |
|---|---|---|---|
| Hot | 6 × 6 TB NVMe | 36 TB | 49% / 59% |
| Warm | 6 × 10 TB (SSD or fast HDD) | 60 TB | 55% / 66% |
| Restore | 5 × 12 TB HDD | 60 TB | 69% (at max 2 concurrent 30-day restores) |
| Kafka | 3 × 6 TB | 18 TB | 69% |

### 1.4 Evidence archive (WORM)

Per event, about 800 B of raw JSON compresses to roughly 130 B at an assumed 6:1. Add two SHA-256 values (raw and masked, 64 B in binary, which do not compress) plus framing. That gives about 200 B/event.

- 200 B × 1.728 × 10⁹ = 0.346 TB/day
- × 365 = **≈ 126 TB/year**

The archive is encrypted after compression. The compression ratio is again an assumption to validate.

### 1.5 Sensitivity of the hot/warm sizing to the index ratio

| Hot ratio / warm ratio | Hot data (×2) | Warm data (×2) | Snapshot repo |
|---|---|---|---|
| 0.6 / 0.4 (optimistic) | 13.3 TB | 26.5 TB | 202 TB |
| **0.8 / 0.5 (plan)** | **17.7 TB** | **33.2 TB** | **252 TB** |
| 1.1 / 0.7 (pessimistic, e.g. many keyword fields) | 24.3 TB | 46.5 TB | 353 TB |

The pessimistic case still fits on the provisioned hot and warm disks (36 TB and 60 TB). The snapshot repository is elastic object storage, so it only affects cost.

### 1.6 Shard arithmetic

- Data stream `audit-logs`, 6 primary shards and 1 replica per backing index. Rollover at 50 GB per primary shard or 1 day, whichever comes first.
- Hot primary data is about 8.85 TB / 8 d = 1.1 TB/day. That is about 3.7 rollovers/day of 300 GB each. At 8 days that is about 30 indices and about 360 shards, or 60 per node.
- Warm shards shrink to about 50 GB × 0.5/0.8 ≈ 31 GB after merge. Warm holds about 530 primaries and 1,060 shards in total, or about 177 per node. That is well under the roughly 20 shards per GB of heap guideline (about 600 per 31 GB heap).
- Indexing load: 20k ev/s ≈ 16 MB/s across 6 primaries, plus replica writes. This is light for NVMe nodes, with large headroom for the 2× design target.

## 2. Architecture overview

```
 sources ──► Filebeat / Elastic Agent (TLS, disk queue)
                │
                ▼
        Kafka (3 brokers, topic audit.raw, 24+ partitions, RF3, 72 h)
         │  event_id = <partition>-<offset>  (immutable sequence authority)
         │
         ├──► SEALER  (consumer group A) ─► WORM bucket: signed, chained,
         │             raw + hashes, encrypted, S3 Object Lock (compliance)
         │
         └──► LOGSTASH (consumer group B): parse → MASK → hash → route
                   │            └─ failures → audit.quarantine topic (never indexed)
                   ▼
        Elasticsearch  hot (6) ──ILM──► warm (6) ──snapshotter──► object store
                                                                    │
        Restore tier (5, on demand) ◄── restore runbook (24 h SLA) ◄┘
        Kibana (2) ◄── coordinating nodes (2) ;  master nodes (3)
        VERIFIER: continuous re-hash of ES/restored data against sealed manifests
```

Design points:

- **Kafka is the sequence authority.** Both the sealer and Logstash derive `audit.event_id = partition-offset` from the same raw topic. Indexing with `_id = event_id` through `op_type=create` makes writes idempotent. The (partition, offset-range) ↔ block mapping gives a **completeness proof**: no gaps in the sealed chain, and the indexed count per range equals the sealed count.
- Kafka holds raw PII for up to 72 h. It is covered by TLS, ACLs, volume encryption and short retention. If this is unacceptable, move masking into the collector tier (Option B in Section 8, R1).
- Masking is in Logstash, not in an Elasticsearch ingest pipeline. This keeps raw data out of the Elasticsearch process and lets the DLQ and retries contain only masked events.

## 3. Node layout per tier

All sizes are starting points to be validated by the PoC. Nodes are spread over 3 availability zones (AZs) with `cluster.routing.allocation.awareness.attributes: zone`. Roles use the standard data tiers, which are free in Basic.

| Role | Count | Spec (each) | Notes |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB, 100 GB SSD | 1 per AZ. |
| **Hot** `data_hot,data_content` | 6 | 16 vCPU, 64 GB RAM (31 GB heap), 6 TB NVMe | 2 per AZ. Handles indexing and recent search. |
| **Warm** `data_warm` | 6 | 16 vCPU, 64 GB RAM, 10 TB SSD or fast HDD | 2 per AZ. Interactive search of days 8–32. |
| **Restore (cold)** `data_cold` | 5 | 16 vCPU, 64 GB RAM, 12 TB HDD, 10 GbE | Can stay powered off or scaled to zero until a request. No searchable snapshots involved. |
| Coordinating | 2 | 8 vCPU, 32 GB | Fronts Kibana and API search. |
| Kibana | 2 | 4 vCPU, 8 GB | Behind a load balancer. |
| Logstash | 4 | 8 vCPU, 16 GB (8 GB heap) | Each ≈ 10k ev/s with grok, masking and hashing, so 3 survivors give ≥ 30k ev/s. |
| Sealer | 3 | 4 vCPU, 8 GB | One per partition subset. A custom component, see Section 6. |
| Kafka | 3 | 8 vCPU, 32 GB, 6 TB | RF 3, `min.insync.replicas=2`, 72 h retention. |
| Orchestrator / verifier | 2 | 4 vCPU, 8 GB | Snapshot, delete, restore and verification jobs. |

Hardware notes:

- Memory-to-disk ratios are about 1:94 (hot), 1:160 (warm) and 1:190 (restore), within normal practice for time-series logs.
- Use volume encryption (LUKS or cloud-managed) on all data nodes, since Basic has no encryption at rest.
- Enable TLS node-to-node and client-to-node. TLS and RBAC are included in Basic.

## 4. Searchable snapshots: why not, and what instead

**Finding.** The customer asked for searchable snapshots on the cold/frozen tier. Searchable snapshots (full-copy and partially mounted) are an **Enterprise** feature, so on Basic the `_mount` API and the ILM `searchable_snapshot` action are rejected. The Elastic subscription matrix should be re-checked at contract time, since licensing can change.

**What Basic does include and what this design uses.** These are:

- Plain snapshot and restore, including S3, GCS and Azure repositories.
- Data tiers and ILM (rollover, forcemerge, shrink, allocate, readonly, delete).
- SLM and TLS.
- Native and file user realms, plus RBAC at index level.

**Design for months 2–12.**

1. After an index reaches the warm phase and is force-merged (about day 8), the **snapshotter** snapshots it to the repository.
2. The snapshotter verifies the snapshot (status `SUCCESS`, shard counts equal).
3. At 31 days after rollover the snapshotter deletes the backing index from warm.
4. On request, the **restore runbook** restores the needed indices to the restore tier and removes ILM management from them. They are then searchable like any other index. They are deleted after the investigation, with a default 14-day TTL.

**Why a custom snapshotter instead of SLM plus ILM.** An SLM policy takes snapshots on a schedule and cannot select indices by lifecycle phase. A daily SLM policy over the whole data stream would also capture each index once in its unmerged hot form (ratio 0.8) and again after forcemerge (ratio 0.5). Both would be retained for 12 months, and repository size would grow by roughly 60%, from 252 TB to about 400 TB. The snapshotter snapshots each backing index once, after forcemerge. ILM's delete phase is deliberately **not** used for the warm to delete step. The snapshotter deletes only after a verified snapshot exists, so if it is down the data stays on warm and an alert fires. ILM never deletes unsnapshotted evidence.

**Restore time budget (24 h SLA).** Restoring a 30-day window means 20.7 TB. The repository setting `max_restore_bytes_per_sec` must be raised from its 40 MB/s default to about 250 MB/s per node. Five nodes at 200 MB/s give about 1 GB/s, so 20.7 TB takes about 5.8 h. The budget is: up to 4 h for triage, approval and node start-up, up to 12 h for restore, and an 8 h margin, 24 h in total. The SLA is for **a restore window of at most 30 days per request**. Larger windows need proportionally more time or more restore nodes, and should be agreed in advance. A quarterly restore drill is mandatory.

**Fallback if a faster tier is wanted.** Keep all 12 months online on warm-class nodes, with no restore step. That costs 335 d × 1.3824 TB × 0.5 × 2 = **463 TB** of disk (231 TB with no replicas, which is risky). It is much more expensive than the 252 TB of object storage plus 60 TB of restore disk, and it is not required by the brief. Alternatively, an Enterprise license would enable true searchable snapshots, but it breaks the stated budget constraint.

## 5. Ingest pipeline

### 5.1 Stages

1. **Collect.** Filebeat or Elastic Agent with TLS, a persistent disk queue and at-least-once delivery. Sources add `host`, `source`, and a source-side sequence where possible.
2. **Buffer.** Kafka topic `audit.raw`, key = source id, so per-source order is preserved within a partition.
3. **Logstash**, in this order:
   1. Compute `raw_sha256` over the **unparsed** `message` bytes.
   2. Set `event_id` from the Kafka partition and offset.
   3. Parse (JSON, or grok for legacy formats) and map to ECS.
   4. **Mask**: usernames, e-mails, phones (5.2).
   5. Verify masking: a post-check regex over all string fields. If anything looks like an e-mail or phone, or the parse failed, send to `audit.quarantine` with `mask_status=failed` and do **not** index.
   6. Compute `masked_sha256` over the canonical masked document, and set `audit.block_ref` to the sealer block for this offset range.
   7. Output to Elasticsearch data stream `audit-logs`, `action => "create"`, `document_id => event_id`.

Logstash sketch (abbreviated):

```ruby
input { kafka {
  topics => ["audit.raw"]  group_id => "indexer"
  decorate_events => "basic"   # exposes [@metadata][kafka][partition] / [offset]
  codec => plain
} }
filter {
  fingerprint { source => "message" method => "SHA256" target => "[audit][raw_sha256]" }
  mutate { add_field => { "[audit][event_id]" =>
      "%{[@metadata][kafka][partition]}-%{[@metadata][kafka][offset]}" } }
  json { source => "message" target => "evt" }        # or grok for legacy formats
  # --- masking: keyed HMAC pseudonyms, key from Logstash keystore / KMS ---
  mutate { lowercase => ["[evt][user][email]"] }
  mutate { gsub => ["[evt][user][phone]", "[^0-9+]", ""] }   # normalise before HMAC
  fingerprint { source => "[evt][user][name]"  target => "[user][name]"
                method => "SHA256" key => "${MASK_KEY}" }
  fingerprint { source => "[evt][user][email]" target => "[user][email]"
                method => "SHA256" key => "${MASK_KEY}" }
  fingerprint { source => "[evt][user][phone]" target => "[user][phone]"
                method => "SHA256" key => "${MASK_KEY}" }
  mutate { gsub => [ "[evt][message]",
      "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "<email>",
      "\+?[0-9][0-9 ()-]{7,}[0-9]", "<phone>" ] }
  # ... phone regex for free text, canonical-JSON ruby filter -> masked_sha256,
  #     post-check -> quarantine routing
}
output { elasticsearch { data_stream => true  action => "create"
                         document_id => "%{[audit][event_id]}" ssl_enabled => true } }
```

The listing is a sketch for review, not a deployable config. The phone-number regex and the field list depend on the real log formats.

### 5.2 Masking method

- **Deterministic keyed pseudonymisation (HMAC-SHA-256, truncated to 16 bytes, prefixed `usr_`, `eml_` or `tel_`).** The same user always maps to the same token, so per-user investigation and correlation still work. It is irreversible without the key and the raw archive.
- E-mails are lowercased and phone numbers normalised to E.164 before hashing. Retaining the e-mail domain in a separate field (`user.email_domain`) is optional and needs a privacy decision.
- A small **pseudonym lookup service** lets authorised investigators turn a known username into its token to search for it. Wildcard or prefix search on masked fields is deliberately impossible.
- Key handling: the HMAC key lives in a KMS or HSM and is versioned (`audit.mask_key_id`). Rotation produces new tokens for the same user, so correlation across a key change needs the old key kept until retention ends. Losing the key means losing correlation but not the evidence.
- **Free-text fields are the weak point.** E-mails and phones can be caught by regex, but usernames in free text cannot be detected reliably. The answer is to log usernames in structured fields, and to run canary tests with seeded fake PII at every release.
- Nothing raw may reach logs, the DLQ, Kibana or Logstash debug output. The Logstash DLQ stores events after filtering, so it holds masked data.

### 5.3 Index template and mapping

- Mappings are strict ECS-based. Use `keyword` for IDs and tokens.
- `index.codec` is `default` in hot. The warm phase switches it to `best_compression` via the forcemerge action.
- **Keep stored `_source` unmodified. Do not use synthetic `_source` or `logsdb` mode** for this stream. Synthetic source reconstructs documents, which can reorder fields and arrays, and would break byte-level re-hashing. Hashes are computed over canonical JSON (sorted keys) of parsed values, and the `audit.*` fields are excluded from the hash input.
- Writer privilege is `create_doc` and `auto_configure` only, so the ingest user cannot update or delete documents. Human roles are read-only per data stream. Basic has no field-level or document-level security, so access control is at index and data-stream granularity.

## 6. Integrity: how "provably unaltered" is achieved

Elasticsearch Basic cannot prove immutability by itself. Anyone with enough privilege can edit or delete documents, and Basic has no audit logging of such actions. So proof lives in a separate, write-once layer, and Elasticsearch is verified **against** it.

### 6.1 Sealing

The **sealer** consumes `audit.raw` independently of the indexing path. Per partition it cuts blocks of contiguous offsets, either 5 minutes or 256 MB, whichever comes first.

Each block object contains:

- Records `{event_id, raw bytes, raw_sha256, masked_sha256}`. Because masking runs in a different component, the sealer receives `masked_sha256` through a second topic, `audit.masked-hash`, published by Logstash. A block is closed only when both are present, and a mismatch alerts.
- A header with partition, first and last offset, event count, `block_hash = SHA-256(prev_block_hash ‖ SHA-256(block body) ‖ header)`, and an **Ed25519 signature** made with a key in an HSM or KMS.

Block hashes form a **per-partition hash chain**. Offsets are contiguous, so a missing, inserted or reordered event or block breaks either the offset continuity or the chain.

### 6.2 Write-once storage

Blocks go to an object store bucket with **S3 Object Lock in compliance mode** (or equivalent immutable storage on other platforms). The lock period is 12 months plus a 30-day margin. Versioning is on, and the bucket is in a **separate account or security domain** from the Elasticsearch operators. Even an administrator cannot shorten a compliance lock. Legal holds can extend retention for investigations.

The Elasticsearch **snapshot repository is not the evidence store**. Elasticsearch itself writes and deletes blobs in a snapshot repository, which is incompatible with Object Lock. The snapshot repository is an operational copy, and its contents are verified against the sealed manifests.

### 6.3 External time anchoring

Once per day, and optionally hourly, the sealer builds a Merkle root over the latest `block_hash` of every partition and requests an **RFC 3161 timestamp** from an external time-stamping authority (a qualified one if eIDAS applies). Only the hash is sent. The timestamp token is stored in the WORM bucket. This proves the chain existed at a given time, so even a compromised sealer key cannot rewrite history older than the last anchor.

### 6.4 Linking Elasticsearch documents to the proof

Every indexed document carries `audit.event_id`, `audit.raw_sha256`, `audit.masked_sha256`, `audit.block_ref` and `audit.mask_key_id`. These are convenient but **not authoritative**. They could be altered in Elasticsearch. The authoritative copies are the signed block records.

### 6.5 Verification

| Check | Frequency | Method |
|---|---|---|
| Chain and signature check | Continuous, plus full pass weekly | Recompute hash chain, verify Ed25519 signatures and RFC 3161 tokens, check offset contiguity. |
| Index content vs sealed hashes | Every backing index once, after forcemerge and before snapshot deletion eligibility. 1% random sample daily on the online tiers | Page through with PIT and `search_after`, recompute `masked_sha256` from stored `_source`, compare to the sealed record. |
| Completeness | Hourly | Per partition and offset range, sealed count equals indexed count. |
| Restored data | At every restore | Same content check, against the sealed block records, before data is released to investigators. |
| Raw to masked reproducibility | On demand, for legal proceedings | Re-run the versioned masking code over the sealed raw bytes with the escrowed key, and compare to the indexed `masked_sha256`. |

For a legal case the evidence package is: the event, its block, the chain from that block to the nearest RFC 3161 anchor, the signing public keys, and the verifier output.

### 6.6 Operational controls

- Separation of duties: Elasticsearch admins cannot access the signing key, the WORM account or the masking key. Key custodians use dual control.
- `chrony` or PTP on all hosts. `event.ingested` is set server-side, so a source clock skew cannot hide ingest time.
- Elasticsearch itself does not log administrative actions on Basic. Compensate with OS-level auditd, proxy or API gateway logging in front of Elasticsearch, and shipping those logs into the same sealed pipeline.
- Access to raw archives is logged, needs approval, and is time-limited.

## 7. ILM policy

Applies to data stream `audit-logs`. There is no cold phase (there is no searchable-snapshot action in Basic) and **no delete phase**. The snapshotter removes indices only after verification (Section 4).

```json
PUT _ilm/policy/audit-logs
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
          "readonly": {},
          "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" }
        }
      }
    }
  }
}
```

`min_age` counts from rollover. The data stream template sets `index.lifecycle.name: audit-logs`, 6 shards, 1 replica, `index.routing.allocation.require._tier_preference: data_hot` (ILM migrates between tiers automatically).

Related jobs and settings:

- **Snapshotter**, run hourly. It selects backing indices with `_ilm/explain` showing phase `warm`, step `complete` and no snapshot yet. It snapshots each as `audit-<index>` to repository `audit-repo`, verifies it, and records it in a catalog.
- **Deleter** (part of the snapshotter), which removes a backing index 31 days after rollover **only** if a verified snapshot and a passing content check (Section 6.5) exist.
- **Snapshot retention.** Snapshots are deleted at 12 months (365 days) after the index's last document timestamp, and only when no legal hold applies. Each deletion is recorded in a signed deletion log, since proving that data was removed on schedule can matter as much as proving it was kept.
- **Restore indices** are named `restored-<index>`, restored with `index_settings` `index.lifecycle.name: null`, `number_of_replicas: 0` and `_tier_preference: data_cold`, and expire after 14 days unless extended.
- Alerts: warm disk above 75%, any index older than 10 days without a snapshot, any ILM step error, any verification failure.

## 8. Risks and conflicts in the inputs

| # | Item | Severity | Issue and mitigation |
|---|---|---|---|
| R1 | **Masking vs. evidence integrity** | High | If the original is masked and discarded, the stored event is no longer what the system emitted, and "unaltered" can only mean "unaltered since masking". Chosen design (**Option A**): keep the raw event sealed in WORM storage, encrypted and tightly access-controlled, and hash both forms, so the masked copy is provably derived from a provably unaltered original. This retains PII for 12 months, which needs privacy review (data minimisation, purpose limitation, erasure requests vs legal retention). **Option B**: mask at the collector, and the evidence is the masked event. This is simpler for privacy and means there is no raw PII in Kafka or the archive, but it is weaker as evidence and the original can never be recovered. **Legal counsel must choose.** |
| R2 | **Searchable snapshots need Enterprise** | High | Not available on Basic. Replaced with snapshot and restore (Section 4). Cost: months 2–12 are not interactively searchable and need up to 24 h to restore. |
| R3 | **Basic lacks audit logging, DLS/FLS, SSO (SAML/OIDC/LDAP), Watcher and CCR** | Medium | Native realm users only, so identity lifecycle is manual or scripted. No field-level hiding, so separate data streams for different sensitivity levels if required. No cross-cluster replication, so DR is via the object store and a standby cluster rebuilt from snapshots. Verify against the current subscription matrix before sign-off. |
| R4 | **Elasticsearch is mutable** | High | No native WORM in any license tier for live indices. Mitigated by the external sealed layer (Section 6), least-privilege writers and continuous verification. Tampering is **detectable**, not impossible. |
| R5 | **Object Lock vs snapshot repository** | Medium | Elasticsearch must delete blobs in its repository, so it cannot sit under compliance-mode lock. Separate evidence archive (Section 6.2) and operational snapshots. This costs a second copy of the data, about 126 TB of archive on top of the 252 TB snapshot repository. |
| R6 | **24 h search of old data is a human-in-the-loop SLA** | Medium | It depends on the runbook, on-call and restore capacity. Restore window per request is limited to 30 days, and larger windows need agreement. Run quarterly drills. |
| R7 | **Compression and index ratios are assumptions** | Medium | Plan uses 0.8 hot, 0.5 warm, 6:1 archive. Sensitivity in 1.5. Run a PoC on 1–2 days of real traffic. Procurement must not be finalised before this. |
| R8 | **Free-text PII leakage** | High | Regex cannot reliably find usernames in free text. Require structured fields, run canary tests, use the quarantine path for anything suspicious. Residual risk remains. |
| R9 | **Kafka holds raw PII for 72 h** | Medium | TLS, ACLs, encryption at rest, short retention. Option B removes it. |
| R10 | **Data loss window in hot** | Medium | Data is not snapshotted until about day 8. Two simultaneous node failures in different AZs could lose both copies of some shards. Rebuild is possible from Kafka (72 h) or from the sealed archive (slower). Accept, or take an additional interim snapshot of hot indices at the cost of repository size. |
| R11 | **Key management** | High | Loss of the signing key blocks new seals. Loss of the HMAC key breaks tokenisation. Compromise of the signing key is limited by RFC 3161 anchoring. Needs a KMS or HSM, rotation procedure and escrow. |
| R12 | **24/7 operation** | Low | No maintenance window. Use rolling upgrades, `min_insync_replicas=2` and the Kafka buffer to ride out node restarts. |
| R13 | **Deletion at end of retention** | Low | The customer's 12 months is both a minimum for evidence and, typically, a maximum for privacy. Deletions are logged and signed. Legal holds suspend deletion. |
| R14 | **Source-side completeness** | Medium | The platform can prove that it lost nothing after Kafka, but not that sources emitted everything or that Filebeat did not drop on its own. Source heartbeats and per-source sequence numbers are recommended. |

## 9. Open questions for the customer

1. Legal sign-off on R1: is a sealed raw archive acceptable, or must masking happen at the source (Option B)?
2. Required maximum restore window per request, and peak concurrent requests, to confirm the restore tier size.
3. Hosting model (on-premises or cloud). It decides S3 Object Lock vs an on-premises WORM appliance, and whether restore nodes can be scale-to-zero.
4. Jurisdiction and required time-stamping authority class (for example eIDAS-qualified).
5. Log formats and structured-field coverage, which decide how much PII hides in free text.
6. Whether a DR site is required. A second-region copy of the archive and snapshots roughly doubles the 378 TB of object storage.
7. Who may re-identify pseudonyms, under what approval flow.

## Appendix: numbers at a glance

| | Daily | 30 d | 365 d |
|---|---|---|---|
| Events | 1.728 × 10⁹ | 5.18 × 10¹⁰ | 6.31 × 10¹¹ |
| Raw | 1.382 TB | 41.5 TB | 504.6 TB |
| Indexed, hot form (×0.8, 1 copy) | 1.106 TB | 33.2 TB | n/a |
| Indexed, compressed (×0.5, 1 copy) | 0.691 TB | 20.7 TB | 252.3 TB |
| Sealed archive (≈ 200 B/event) | 0.346 TB | 10.4 TB | 126.1 TB |
