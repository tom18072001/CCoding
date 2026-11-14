# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for customer review. Targets Elasticsearch/Kibana/Logstash 8.x or 9.x on the **Basic (free) license**.
Units: decimal (1 TB = 10^12 B). All figures are planning estimates. Section 2 lists the assumptions to validate in a pilot.

## 0. Summary and decisions needed

| Topic | Decision |
|---|---|
| Customer suggestion "searchable snapshots for cold/frozen" | **Cannot be used.** Searchable snapshots (the ILM `searchable_snapshot` action, cold/frozen mounts) need an Enterprise license. See §1. We use ordinary snapshots plus an on-demand restore tier instead. This still meets "searchable within 24 h". |
| Interactive 30 days | Hot (days 0–7) and warm (days 8–30) tiers, 1 replica each. |
| Days 31–365 | Not kept online. Held as (a) a signed, hash-chained, WORM evidence archive and (b) an Elasticsearch snapshot repository. On request, restored into a temporary restore tier (data_cold role). |
| Provably unaltered | Elasticsearch cannot prove this by itself. Integrity is built outside it: per-event SHA-256, signed hash-chained segment manifests, RFC 3161 timestamps, S3 Object Lock (compliance mode). See §7. |
| Masking before indexing | Logstash does keyed-HMAC pseudonymisation. An Elasticsearch ingest pipeline acts as a fail-closed second guard. See §5. |
| Conflicts the customer must resolve | Masking vs "unaltered" (§9, R1). Raw PII transiting the buffer (R2). SLA scope of the 24 h restore (R4). |

Sizing result (details in §3 and §4):

- Raw volume is 1.38 TB/day and 504.6 TB/year.
- Online Elasticsearch capacity: 6 hot nodes × 4 TB, 6 warm nodes × 8 TB, plus 4 on-demand restore nodes × 8 TB.
- About 388 TB of object storage for the 400-day archive and snapshot repository.

## 1. Licensing reality check (Basic)

| Capability | Basic? | Consequence |
|---|---|---|
| Data tiers (hot/warm/cold roles), ILM, data streams, SLM, snapshot/restore to S3-compatible storage | Yes | Core of the design. |
| TLS, native/file users, RBAC, API keys | Yes | Used. |
| **Searchable snapshots** (mounted indices, cold/frozen tier) | **No (Enterprise)** | The customer suggestion is dropped. ILM would reject the action. |
| Document/field-level security, Elasticsearch audit logging, LDAP/AD realms | No (Gold+) | Access to the evidence store is logged at a reverse proxy and OS level instead (§7.6). Per-user data separation is not available. |
| SAML/OIDC SSO | No (Platinum+) | Native/file realm only, with strong password and MFA at the proxy. |
| Machine learning, advanced alerting connectors | No | Out of scope. Integrity alerts are raised by an external verifier job. |
| Cap on nodes or data volume | None | Sizing is not license-limited. |

Verify against Elastic's current subscription matrix before contract signature. If the customer later buys Enterprise, §10 shows what changes.

## 2. Assumptions

| # | Assumption | Value | Basis |
|---|---|---|---|
| A1 | Ingest | 20,000 EPS × 800 B, 24/7, flat (no peaks) | Customer input. Peak factor handled by a Kafka buffer. |
| A2 | Hot index size / raw | **0.7×** (default LZ4 codec, `_source` kept, ECS-style mapping) | Typical range for JSON logs is 0.5–1.1×. Pilot to confirm. |
| A3 | Warm/restore size / raw | **0.5×** (after `best_compression` + force-merge to 1 segment) | ~25–30 % smaller than the hot codec. |
| A4 | Replicas | 1 on hot and warm. 0 on restored indices (the snapshot is the redundancy). | Availability of the interactive window. |
| A5 | Disk headroom | Plan ≤ 70 % full. The 85 % low watermark then leaves a margin for merges and shard moves. | Elasticsearch watermark behaviour. |
| A6 | Archive gzip ratio | 5:1 on NDJSON (0.2×). Real logs often reach 8–10:1. | Conservative. |
| A7 | Object storage | Counted as usable TB. Its own redundancy (erasure coding or replication) is extra. | Platform-dependent. |
| A8 | Retention | 12 months = 365 days. 400 days are provisioned (+35 days margin for lifecycle jitter and legal slack). | |

## 3. Capacity arithmetic

### 3.1 Raw volume

```
events/day  = 20,000 × 86,400            = 1.728 × 10^9
raw/day     = 1.728e9 × 800 B            = 1.3824 × 10^12 B = 1.382 TB (1,382.4 GB)
raw/second  = 20,000 × 800 B             = 16 MB/s  (≈128 Mbit/s)
raw/30 days = 1.3824 × 30                = 41.5 TB
raw/year    = 1.3824 TB × 365            = 504.6 TB  (events/year = 5.05 × 10^11)
```

### 3.2 Per tier (Elasticsearch, including replicas)

| Tier | Window | Size factor | Per-day primary | Copies | Per-day stored | Days | Data | At 70 % fill → disk needed |
|---|---|---|---|---|---|---|---|---|
| Hot | 0–7 d | 0.7 | 1.3824 × 0.7 = 0.968 TB | 2 | 1.935 TB | 7 | **13.55 TB** | **19.4 TB** |
| Warm | 8–30 d | 0.5 | 1.3824 × 0.5 = 0.691 TB | 2 | 1.382 TB | 23 | **31.8 TB** | **45.4 TB** |
| **Online total (30 d)** | | | | | | 30 | **45.4 TB** | **64.8 TB** |
| Restore (cold role, temporary) | up to 30 days per request | 0.5 | 0.691 TB | 1 (replicas 0) | 0.691 TB | 30 | 20.7 TB | 29.6 TB |

### 3.3 Object storage (days 0–400)

| Store | Calculation | 365 d | 400 d (provision) |
|---|---|---|---|
| Evidence archive (gzip NDJSON of masked events, plus manifests) | 1.3824 TB × 0.2 = 0.276 TB/day | 100.9 TB | **110.6 TB** |
| ES snapshot repository (primaries only, 0.5×, incremental, immutable merged segments) | 0.691 TB/day | 252.3 TB | **276.5 TB** |
| **Total (before storage-system redundancy)** | | 353 TB | **≈387 TB** |

Why both stores? The archive is the evidence of record, and it is the only copy under Object Lock. The snapshot repository is the fast restore path.

Replaying the archive through Logstash at an assumed 100k EPS would take 1.728e9 / 1e5 ≈ 4.8 h per day of data, so about 144 h for 30 days. That cannot meet the 24 h SLA, so the snapshots are required.

### 3.4 Sensitivity

If the compression assumptions are wrong (hot 1.0×, warm 0.75×, i.e. +43 % and +50 %):

- Hot need becomes 27.6 TB disk against 24 TB provisioned.
- Warm need becomes 68 TB against 48 TB provisioned.

The layout below therefore leaves empty drive bays (or uses a scale-out unit of +2 nodes per tier). A 1–2 day pilot on real events must fix A2/A3 before purchase.

### 3.5 Rejected alternative: everything online, no snapshots

Keeping days 8–365 in-cluster on warm nodes with 1 replica needs:

- 1.3824 × 358 d = 494.9 TB of warm data, plus 13.5 TB hot.
- ≈726 TB of disk at 70 % fill, i.e. about 91 × 8 TB nodes.

Even with 0 replicas this is about 360 TB, and it gives up redundancy. The snapshot design needs roughly one third of the disk.

## 4. Node layout

| Role | Count | Spec (each) | Notes |
|---|---|---|---|
| Hot data (`data_hot,data_content`, ingest) | 6 | 16 vCPU, 64 GB RAM (31 GB heap), 4 TB NVMe | 24 TB raw against 19.4 TB needed. Load is only 40k docs/s (primary + replica) ≈ 6.7k docs/s per node, so disk is the sizing driver. |
| Warm data (`data_warm`) | 6 | 16 vCPU, 64 GB RAM, 8 TB SSD | 48 TB against 45.4 TB needed. Disk:RAM ≈ 125:1. |
| Restore (`data_cold`, used as a plain restore tier) | 4, on demand | 16 vCPU, 64 GB RAM, 8 TB SSD | 32 TB against 29.6 TB needed for a 30-day restore. Provisioned or powered up per request. Empty most of the time. |
| Dedicated master | 3 | 4 vCPU, 16 GB RAM | Spread across 3 failure zones. |
| Kibana | 2 | 4 vCPU, 8 GB RAM | Behind the reverse proxy / load balancer. |
| Logstash | 3 | 16 vCPU, 32 GB RAM, persistent queue on local SSD | 20k EPS with regex masking and hashing is about 7k EPS each. N+1 headroom. |
| Kafka buffer (Apache, not Elastic-licensed) | 3 brokers | 8 vCPU, 32 GB RAM, 4 TB | 48 h retention: 16 MB/s × 172,800 s = 2.76 TB, ×3 replicas = 8.3 TB across brokers. Absorbs outages and bursts. |
| Sealer / verifier / tokenisation service | 2 | 4 vCPU, 8 GB RAM | §7 and §5.3. |
| Object storage | S3-compatible with Object Lock (compliance mode) | ≈387 TB usable | Two buckets (archive, snapshots) plus a small staging bucket. |

- Hot and warm are spread over at least 2 (preferably 3) zones. Allocation awareness ensures a primary and its replica never share a zone.
- Elasticsearch node total: 6 + 6 + 3 + (4 on demand) = 15 permanent, 19 with the restore tier.
- Elasticsearch, Kibana, Logstash and Kafka all use TLS. Disks are encrypted with LUKS or the platform KMS, because Basic has no native encryption at rest.

## 5. Ingest pipeline

```
sources ─► (TLS) Kafka topic audit.raw (48 h, ACL, encrypted disks)
        ─► Logstash (3 nodes, persistent queue)
              1. parse (grok/dissect/json) → ECS fields
              2. MASK  (keyed HMAC pseudonymisation, §5.1)
              3. canonicalise + event.hash (SHA-256, §7.1)
              4. add event.kafka.partition / offset / seq (gap detection)
           ├─► Elasticsearch data stream `audit-logs` (default_pipeline `audit-guard`)
           └─► staging bucket: gzip NDJSON segments of the masked events ─► sealer (§7.2)
```

### 5.1 Masking rules (in Logstash, before any output)

| Data | Where found | Method |
|---|---|---|
| Username | Known fields (`user.name`, `source.user.name`, ...) | `HMAC-SHA256(key_v, lower(value))`, truncated to 16 hex chars, stored as `usr_<kid>_<hex>`. Deterministic, so activity of one user can still be correlated. |
| E-mail | Known fields and regex over free text (`message`, `event.original`) | Same HMAC over the whole address. Optionally keep the domain: `eml_<kid>_<hex>@example.com`. |
| Phone | Known fields and regex over free text (E.164 and national formats) | HMAC token `tel_<kid>_<hex>`. |
| Unmasked original | Never forwarded. `event.original` is rebuilt from the masked text. | |

- Keys live in KMS/HSM and are injected into Logstash at start-up.
- The key is secret, so tokens cannot be reversed by dictionary attack.
- Tokens carry a key id (`kid`). Rotation gives new tokens for new data. Old data keeps its old `kid`.
- Look-ups ("find everything for jane@x.com") go through the tokenisation service. It computes the token from the clear input, only for a role-restricted investigator, and logs every request.
- Fail closed: if a masking step raises an error, the event goes to a `audit.deadletter` topic. It is never indexed unmasked.

### 5.2 Elasticsearch `audit-guard` pipeline (defence in depth, non-mutating)

It must not change the document, otherwise `event.hash` would no longer match. It only rejects:

```json
PUT _ingest/pipeline/audit-guard
{
  "processors": [
    { "fail": {
        "if": "ctx.message instanceof String && ctx.message =~ /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/",
        "message": "unmasked e-mail pattern" } },
    { "fail": {
        "if": "ctx.message instanceof String && ctx.message =~ /\\+?[0-9][0-9 ().-]{8,}[0-9]/",
        "message": "possible unmasked phone number" } },
    { "set": { "field": "event.ingested", "value": "{{{_ingest.timestamp}}}" } }
  ],
  "on_failure": [ { "set": { "field": "error.message", "value": "{{ _ingest.on_failure_message }}" } } ]
}
```

- Rejected documents land in the data stream's failure store (or a quarantine index).
- `event.ingested` is set by Elasticsearch, so it is the only field outside the hash. The hash is defined to exclude it (§7.1).
- The phone regex can false-positive on long numeric IDs. Tune it on pilot data, because rejection is the safe side.

### 5.3 Template and access

```json
PUT _index_template/audit-logs
{
  "index_patterns": ["audit-logs"],
  "data_stream": {},
  "template": {
    "settings": {
      "index.number_of_shards": 6,
      "index.number_of_replicas": 1,
      "index.lifecycle.name": "audit-logs",
      "index.default_pipeline": "audit-guard",
      "index.routing.allocation.include._tier_preference": "data_hot"
    },
    "mappings": { "dynamic": "strict" }
  }
}
```

- `dynamic: strict` means unexpected fields cannot arrive silently. Add a field mapping before a source sends it.
- The writer role (Logstash) has only `create_doc` and `auto_configure` on `audit-logs`: no `index`, `delete`, `delete_index` or `manage`. Data streams already refuse in-place updates and deletes via the stream name.
- Analyst roles have `read` and `view_index_metadata` only.
- Admin credentials are held by a separate, break-glass group.

## 6. ILM policy

```json
PUT _ilm/policy/audit-logs
{
  "policy": { "phases": {
    "hot": {
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
        "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
        "allocate": { "number_of_replicas": 1 }
      }
    },
    "delete": {
      "min_age": "30d",
      "actions": {
        "wait_for_snapshot": { "policy": "audit-daily" },
        "delete": {}
      }
    }
  } }
}
```

```json
PUT _slm/policy/audit-daily
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-{now/d}>",
  "repository": "audit-snapshots",
  "config": { "indices": ["audit-logs"], "include_global_state": false },
  "retention": { "expire_after": "400d", "min_count": 30, "max_count": 500 }
}
```

How it works:

- 6 primary shards × 50 GB gives a rollover at about 300 GB. At 0.968 TB/day that is about 3.2 backing indices per day, or roughly 20 primary shards per day (40 with replicas). The cluster holds about 1,200 shards in total, which is small.
- `min_age` counts from rollover. Every event is therefore online for at least 30 days.
- The warm phase makes the index read-only and merges it before the daily snapshot picks it up. Days 8–30 give the snapshot many chances to run.
- `wait_for_snapshot` blocks deletion until an SLM snapshot has run. If snapshots fail, indices stay online, and disk alarms fire before data is lost.
- The `index_codec` option of `forcemerge` is only available in newer 8.x/9.x. If the target version lacks it, set `index.codec: best_compression` in the template for all tiers instead (costs ~10 % indexing CPU, and the hot factor becomes ≈0.5).
- The 400-day snapshot expiry is a lifecycle clean-up of the *convenience* copy. The evidence archive has its own retention (§7.3).
- No cold or frozen ILM phase exists, because both would need searchable snapshots. The restore tier is driven by a runbook (§8), not by ILM.

## 7. Integrity: "provably unaltered"

Elasticsearch is an index, not a tamper-evident store. An administrator can edit any `_source`, and a read-only block can be removed. So proof must not depend on Elasticsearch. The authoritative record is built before indexing and written to WORM storage.

### 7.1 Per-event hash

- After masking, Logstash serialises the event to canonical JSON (sorted keys, UTF-8, no whitespace). It excludes `event.hash` and `event.ingested`, then computes `event.hash = SHA-256(canonical_json)`.
- The event also carries `event.kafka.partition`, `event.kafka.offset` and a producer sequence number. A deleted event shows up as an offset gap.

### 7.2 Segments, manifests and the chain

1. Logstash writes masked events as gzip NDJSON segments (e.g. one per node per 5 min) to the **staging** bucket. The writer credential is write-only (no delete or overwrite).
2. The sealer picks each closed segment and computes its SHA-256. It then writes a **manifest** containing:
   - segment names and hashes;
   - event counts;
   - min/max `@timestamp`;
   - Kafka partition → offset ranges;
   - `prev_manifest_hash`.
3. The manifest is signed with an asymmetric key held in an HSM/KMS (the private key never leaves it). It is then timestamped with an **RFC 3161** authority.
4. Segments, manifest, signature and timestamp token are copied to the **archive bucket** with S3 Object Lock in *compliance* mode.
5. The chain head hash is published daily to an independent location (second site, and/or sent to the customer's auditor). Even a full compromise of the WORM bucket admin then cannot rewrite history unnoticed.

The chain is per manifest, not per event, because per-event global chaining would serialise 20k EPS. The window between event creation and sealing is about 5–10 min. It is protected by the write-only staging credential and Kafka retention.

### 7.3 Retention and legal hold

Object Lock retention is 400 days (365 plus margin), and legal hold can be applied per object or prefix. Lifecycle expiry only applies after the lock ends. Compliance mode means that no one, including root, can shorten the retention. This must be agreed with the customer's legal team.

### 7.4 Verification (continuous and on demand)

- **Daily verifier job:**
  - walks the manifest chain and verifies signatures and timestamp tokens;
  - re-hashes the segments;
  - compares per-hour event counts in Elasticsearch with the manifests;
  - checks Kafka offset continuity;
  - alerts on any difference.
- **Per-result proof:** for any exported result set, a tool recomputes `event.hash` from each `_source` and matches it to the segment and manifest. This produces an evidence bundle: events, hashes, manifests, signatures, timestamps.
- **After restore:** the same check runs before an investigator gets access, so a tampered snapshot is caught.

### 7.5 What is *not* promised

- The Elasticsearch copy and the ES snapshots are **not** WORM. The snapshot repository cannot be placed under Object Lock, because Elasticsearch rewrites and deletes repository metadata blobs (`index-N`, `index.latest`) and removes unreferenced blobs. The evidence value of those copies comes from verification against the archive (§7.4), not from their storage.
- Integrity covers the **masked** record (see R1).

### 7.6 Access logging and hardening (compensating for no ES audit log)

- Reverse proxy (nginx or similar) in front of Elasticsearch and Kibana logs every request: user, method, path, body hash. These logs are themselves ingested into a separate stream and archived with the same §7.2 process.
- Separate admin group. No shared accounts. API keys with expiry.
- OS-level `auditd` on all Elasticsearch nodes, shipped off-host.
- Time sync via authenticated NTP on all hosts. Timestamps are only defensible if clocks are.

## 8. Retrieval of data older than 30 days (SLA: 24 h)

1. Request names a time range and a request ID.
2. Operator (or a script) provisions or starts the restore nodes. Run time: minutes to hours, which is part of the 24 h budget.
3. Restore only the required daily snapshots, as plain indices, with:

```json
POST _snapshot/audit-snapshots/<snap>/_restore
{
  "indices": ".ds-audit-logs-*",
  "rename_pattern": "(.+)", "rename_replacement": "restored-<req>-$1",
  "index_settings": {
    "index.number_of_replicas": 0,
    "index.routing.allocation.include._tier_preference": "data_cold",
    "index.lifecycle.name": null
  },
  "include_global_state": false
}
```

   They are renamed, so they do not join the live data stream.
4. Raise `max_restore_bytes_per_sec` on the repository and `indices.recovery.max_bytes_per_sec`. The default 40 MB/s per node would be far too slow.
5. Run the integrity check (§7.4), then grant read access to the requester.
6. A clean-up job deletes `restored-<req>-*` after a set time (e.g. 14 days) or on request.

Timing: 4 nodes × ~125 MB/s ≈ 500 MB/s. Restoring 30 days (20.7 TB) takes about 11.5 h. One day (0.69 TB) takes about 25 min. **SLA scope proposal:** 24 h applies to requests of up to 30 days of data per request. Larger spans are done in batches, or by adding restore nodes (throughput scales roughly linearly).

## 9. Risks and conflicts in the inputs

| # | Risk / conflict | Impact | Proposed resolution |
|---|---|---|---|
| R0 | **Searchable snapshots need Enterprise; customer budget is Basic.** | The customer's own suggestion is impossible as stated. | Dropped. Snapshots + restore tier (§8). Alternatively buy Enterprise (§10). |
| R1 | **Masking vs "legal evidence, provably unaltered".** Masking alters the original, so the evidence is the masked record. Courts or regulators may expect the original. | Evidentiary weight of the masked log. | Customer's legal/DPO must decide. (a) Accept the masked record as the record, with the masking rules versioned and signed. (b) Also keep the unmasked originals in a separate encrypted, WORM, tightly access-controlled vault. That doubles the archive and keeps PII, which undoes part of the masking goal. This design implements (a) and leaves a hook for (b). |
| R2 | Raw, unmasked events exist in the Kafka buffer (48 h) before Logstash. "Masked before indexed" holds, but PII is still stored for that time. | PII exposure in the pipeline. | Prefer masking at the collection edge, if sources can. Otherwise encrypt Kafka, restrict ACLs, shorten retention (24 h), and document it as part of the DPIA. |
| R3 | Free-text usernames/phone numbers cannot be found reliably by regex. Only known fields are guaranteed. | Residual PII in `message`. | Source-side structured logging, a field inventory, guard pipeline rejection, sampling audits. Cannot be guaranteed 100 %. |
| R4 | The 24 h retrieval SLA depends on restore throughput and provisioning. | Missed SLA for large requests. | Scope per request (§8), tested restore drill each quarter. |
| R5 | Immutability vs erasure rights (e.g. GDPR Art. 17) and WORM compliance mode. | A legal erasure request may be impossible to honour. | Pseudonymised data plus destruction of the HMAC key version for an affected period is a possible mitigation, but this needs legal approval. Do not enable compliance-mode lock before this is agreed. |
| R6 | Compression ratio unknown. | ±45 % disk (§3.4). | Pilot, spare bays, scale-out unit. |
| R7 | Constant 20k EPS assumed. Real audit traffic has peaks. | Backlog or rejected events. | Kafka buffers 48 h. Hot indexing capacity is ≥ 3× average (6.7k docs/s per node used). Ask the customer for peak EPS. |
| R8 | No native Elasticsearch audit log, no DLS/FLS, no SAML/LDAP on Basic (§1). | Weaker access control and traceability. | Proxy logging, separate admin group, OS audit. If this is not acceptable, a higher license is needed. |
| R9 | Restore tier is mostly idle (cost) or must be started on demand (latency). | Cost vs. SLA. | On-demand provisioning as in §4, tested in drills. |
| R10 | Object Lock is required from the storage platform (cloud S3 or on-prem MinIO/Ceph with Object Lock). Not part of the Elastic license. | Platform choice. | Confirm early. Without it, the WORM claim needs an alternative (e.g. write-once media). |
| R11 | Key management: HMAC keys and the signing key are single points of trust. Losing the signing key means no new manifests, and losing the HMAC key means no token look-ups. | Operational and legal. | HSM/KMS with backup, dual control, documented rotation. Key ids stored in tokens and manifests. |

## 10. Option if the budget changes: Enterprise license

With Enterprise, searchable snapshots become available:

- A fully mounted *cold* tier would hold days 31–365 at one copy: 0.691 TB × 335 ≈ 231 TB of local disk (no replicas).
- A *frozen* tier would use a small local cache over the repository instead. That would be cheaper still, but with slower queries, which suits the "within 24 h" class of data.

It would make older data searchable without a restore step. It would **not** change the integrity design (§7), the masking design (§5), or the need for the WORM evidence archive: a snapshot repository still cannot be put under Object Lock. Such a design also needs Elastic's contract terms checked against the customer's budget before it is chosen.

## 11. Next steps

1. Legal/DPO decisions on R1, R2 and R5.
2. Pilot with 1–2 days of real (or realistic) events to fix compression (A2/A3) and the masking false-positive rate.
3. Confirm the object-storage platform supports Object Lock (R10) and the key-management arrangement.
4. Build, then run a restore drill (30 days of data) and an integrity-tamper drill (alter a segment and confirm the verifier alarm).
