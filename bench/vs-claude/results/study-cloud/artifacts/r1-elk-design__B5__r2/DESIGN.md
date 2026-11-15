# Audit-Log Platform on the Elastic Stack (Basic license) — Architecture & Sizing Proposal

Status: proposal for customer review. All sizing figures marked **(A)** are assumptions that must be validated by a proof-of-concept (Rally benchmark + real sample data) before procurement. Units: decimal TB (1 TB = 10^12 B) unless "TiB" is written.

## 1. Executive summary and the three things the customer must know

1. **The customer suggestion cannot be implemented as stated.** Searchable snapshots (both the fully-mounted "cold" and partially-mounted "frozen" tier) require an **Enterprise** license. With **Basic** the `searchable_snapshot` ILM action is rejected. This design achieves the same goal (cheap storage for days 31–365, retrievable within 24 h) with ordinary snapshots on object storage that are **restored on request** into a small, elastic "restore" tier (§6, §9).
2. **"Provably unaltered" cannot be delivered by Elasticsearch itself**, on any license: an admin with superuser can edit or delete indices, and Basic has no document-level security and no Elasticsearch audit log (Gold+). The legal evidence of record is therefore a separate **WORM archive** (S3 Object Lock, compliance mode) with a signed hash chain and trusted timestamps; Elasticsearch is the *search copy* that can be verified against it (§8).
3. **Two requirements pull against each other**: evidence must be unaltered, but PII must be masked before indexing. The design treats the *masked* event as the record, and keeps a keyed hash of the original so the link to the source system can still be proven. Whether re-identification of a user is ever needed (e.g. a court asks "who is `u_9f3a…`?") is a decision for the customer's legal team (§7.4, §12).

## 2. Capacity arithmetic

### 2.1 Raw volume

| Item | Calculation | Result |
|---|---|---|
| Throughput | 20,000 ev/s × 800 B | 16,000,000 B/s = **16 MB/s** |
| Events / day | 20,000 × 86,400 | **1.728 × 10^9** |
| **Raw / day** | 16 MB/s × 86,400 s | **1.3824 TB/day** (1.257 TiB) |
| Events / year | 1.728e9 × 365 | 6.307 × 10^11 |
| **Raw / year (365 d)** | 1.3824 TB × 365 | **504.6 TB** (458.9 TiB); +0.3 % in a leap year |

Peak assumption **(A)**: 2× sustained (40,000 ev/s, 32 MB/s) for bursts/catch-up after outages. The customer gave only a sustained figure; please confirm the peak.

### 2.2 Compression / expansion assumptions (A)

Audit events are JSON with repetitive keys and many keyword fields. Elasticsearch index size = _source + inverted indices + doc values, minus LZ4/DEFLATE compression.

| Stage | Index size ÷ raw | Why |
|---|---|---|
| Hot (default codec, 1 primary) | **0.80** | ECS-style mapping, `_source` kept, doc values on; conservative |
| Warm (after `forcemerge` to 1 segment + `best_compression`) | **0.55** | DEFLATE on stored fields, merged segments |
| Snapshot in object store | **≈ primary size of warm index** (0.55) | Snapshots copy segment files; no further compression assumed |
| Evidence archive (NDJSON + gzip) | **0.15** (≈ 6.7:1) | gzip on repetitive JSON; typically 8–10:1, 0.15 is conservative |

If the PoC shows e.g. 1.0 hot / 0.7 warm, every figure below scales linearly (+25 % / +27 %).

### 2.3 Per-day sizes

| | Formula | TB / day (1 copy) |
|---|---|---|
| Hot primary | 1.3824 × 0.80 | **1.106** |
| Warm primary | 1.3824 × 0.55 | **0.760** |
| Archive | 1.3824 × 0.15 | **0.207** |

### 2.4 Storage per tier (including replicas and headroom)

Retention layout: day 0–7 hot, day 7–30 warm (together = the 30 days searchable interactively), day 30–365 snapshot-only (restore on request).

| Tier | Data held | Primary | With replica (×2) | Headroom rule | **Provisioned** |
|---|---|---|---|---|---|
| Hot | 8 d (7 d + 1 d ILM lag) × 1.106 | 8.85 TB | 17.69 TB | ≤ 70 % full (merge/rollover room, watermark 85 %) → ÷ 0.70 | **25.3 TB** |
| Warm | 23 d × 0.760 | 17.49 TB | 34.97 TB | ≤ 80 % full → ÷ 0.80 | **43.7 TB** |
| Snapshot repo (object store) | 365 d × 0.760 | 277.5 TB | n/a (durability by object store, e.g. erasure coding / 2 sites) | +10 % margin | **305 TB** |
| Evidence archive (WORM) | 365 d × 0.207 | 75.7 TB | n/a (object store durability) | +10 % | **≈ 83 TB** |
| Restore tier (on demand) | up to 60 d × 0.760 = 45.6 TB, 0 replicas | 45.6 TB | — | ≤ 75 % full | **≈ 61 TB → 64 TB** |
| Kafka (3 topics) | `audit.raw` 24 h: 1.3824 × 1 d × RF3 = 4.15 TB; `audit.masked` 72 h: 1.3824 × 3 d × RF3 = 12.44 TB (masked ≈ raw size, no compression assumed); `audit.quarantine` 7 d, assumed ≤ 1 % of events: 0.0138 × 7 × 3 = 0.29 TB | — | 16.9 TB | ≤ 70 % full → ÷ 0.70 = 24.1 TB → **30 TB** (3 brokers × 10 TB) |

Kafka producer compression (lz4/zstd) would typically cut the Kafka figure by 2–3×; it is not counted here (A), so 30 TB is conservative and also absorbs a 2× catch-up burst on the 24 h/72 h windows.

Where 31–365 d = 335 d × 0.760 = **254.7 TB** of data that is *not* on Elasticsearch disks at rest — this is the saving the customer wanted from searchable snapshots, obtained without the Enterprise license.

Total Elasticsearch disk actually purchased: hot 36 TB + warm 60 TB + restore 64 TB = 160 TB (vs. 1.3824 × 0.8 × 2 × 365 ≈ 807 TB if all 12 months were kept online with a replica).

## 3. Architecture

```
 sources (apps, OS, DB audit)
   │  Filebeat / Elastic Agent (Fleet-less, Basic ok), mTLS, disk queue
   ▼
 Kafka "audit.raw"  (3 brokers, TLS+ACL, retention 24 h, disk-encrypted)   ← unmasked PII exists only here, in the Logstash PQ and in quarantine (§5 step 5)
   ▼
 Logstash cluster (mask → canonicalize → hash → route; persistent queue on disk)
   ├── failures ──► Kafka "audit.quarantine" (never indexed; 7 d, restricted ACL; alert)
   ├── Elasticsearch bulk (data stream audit-logs, _id = event.hash, op_type=create)
   └── Kafka "audit.masked" (retention 72 h)
                    ▼
            Archiver/Sealer service (2 instances, consumer group)
              → NDJSON.gz objects ─► S3 bucket "audit-evidence" (Object Lock, compliance)
              → signed manifest + hash chain + RFC 3161 timestamp
   Elasticsearch: hot ─ILM→ warm ─ILM(wait_for_snapshot)→ delete
                          └── SLM nightly ─► S3 bucket "audit-snapshots" (site B copy)
   restore on request ─► restore tier (cold-role nodes) ─► Kibana
```

Why Kafka: durability and replay when ES/Logstash is down, and it separates raw-PII handling from everything downstream. Kafka is Apache-licensed, so it does not touch the Elastic license question. Logstash is free under Basic.

## 4. Node layout per tier

Reference hardware **(A)**; validate with Rally against the real mapping.

| Role | Count | Spec per node | Notes |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB RAM (8 GB heap), 100 GB SSD | quorum 2; spread over 3 zones/racks |
| Hot data (`data_hot`,`data_content`) | **6** | 16 vCPU, 64 GB RAM (31 GB heap), **6 TB NVMe** | 36 TB total vs 25.3 TB required; indexing load at 2× peak: 40k ev/s × 2 copies / 6 = ~13k doc-writes/s per node; losing one node → 16k/s — at the edge, benchmark; add a 7th node if PoC < 16k/s |
| Warm data (`data_warm`) | **5** | 16 vCPU, 64 GB RAM, **12 TB SSD** | 60 TB vs 43.7 TB required; with 1 node lost the remaining 48 TB hold 35 TB (73 %) |
| Restore tier (`data_cold` role, plain indices, **not** searchable snapshots) | **4** (can be ephemeral VMs, scaled 0→4 on request) | 16 vCPU, 64 GB, 16 TB SSD/NVMe | 64 TB for up to ~60 days restored; 0 replicas (source of truth is the snapshot) |
| Coordinating / ingest-less | 2 | 8 vCPU, 32 GB | behind LB; Kibana points here |
| Kibana | 2 | 4 vCPU, 8 GB | behind LB, TLS |
| Logstash | **5** | 8 vCPU, 16 GB (6 GB heap), 200 GB SSD for persistent queue | ~10k ev/s each **(A)** → 4 carry 40k peak, 1 spare |
| Kafka | 3 | 8 vCPU, 32 GB, 10 TB each | RF 3, min.insync 2; sizing in §2.4 (16.9 TB data, 30 TB provisioned) |
| Archiver | 2 | 4 vCPU, 8 GB | stateless; sealing key in HSM/KMS |

Shards: target 30–50 GB per primary. Data stream backing indices roll over at `max_primary_shard_size: 40gb` or `max_age: 1d`; the 1.106 TB/day hot volume gives ≈ 28 primary shards/day (≈ 56 incl. replicas) → ≈ 450 shards on hot nodes, ≈ 75 per node (well below the 20 shards/GB-heap guidance). Template: 6 primary shards per index, 1 replica; primaries are spread across the 6 hot nodes.

## 5. Ingest pipeline

All masking happens in **Logstash**, before any write to Elasticsearch or the archive. We deliberately do not use Elasticsearch ingest pipelines for masking: the `redact` processor needs a higher-than-Basic license (verify against the current subscription matrix) and ES-side masking would mean PII crosses into the cluster first.

Stages (Logstash pipeline, in order):

1. **Input**: Kafka `audit.raw` (consumer group `mask`), TLS + SASL. Persistent queue enabled (`queue.type: persisted`, 100 GB) and `pipeline.ordered: false`.
2. **Parse/normalize** to ECS-like schema (`json`/`dissect`/`grok`), set `@timestamp` from the source event time; set `event.source_id` (see step 6). Pipeline-added fields (`event.ingested`, `event.original_size`, `event.hash`, `event.original_hmac`, `mask.*`) go under a `_pipeline` namespace that is excluded from the hash.
3. **Mask structured fields** (`user.name`, `user.email`, `source.user.*`, `*.phone`): replace with keyed pseudonym `HMAC-SHA256(key_vN, normalized_value)` via the `fingerprint` filter (`method => "SHA256"`, `key` from Logstash keystore). Keyed HMAC, not a bare hash, because e-mails and phone numbers have a small guessable space and could be dictionary-reversed from a plain SHA-256. Values are normalized first (lower-case, trimmed, phones to E.164) so the same person always maps to the same pseudonym and searches/aggregations by "user" still work. Add `mask.key_id`.
4. **Mask free text** (`message`, `event.original`, any unknown string field): `ruby` filter applies (a) regex for e-mail and phone patterns (international and local formats) and (b) literal replacement of every known username/e-mail/phone value found in the structured fields. Output tokens `[email:u_<8 hex>]`, `[phone:…]`, `[user:…]`.
5. **Fail closed**: if parsing or masking raises an error, the event is tagged `_mask_failure` and routed to `audit.quarantine` only — it is never indexed or archived; alert on any non-zero rate. Unmasked `event.original` is dropped from every event that goes to Elasticsearch, the archive or `audit.masked`. The quarantine record is the one exception, because the event cannot be safely stripped: it carries the original payload and therefore **is PII**. Controls: topic `audit.quarantine` has its own ACL (only the on-call security group), retention 7 d, disk encryption, no consumers other than a manual-review tool; on review the event is either fixed in the masking rules and replayed into `audit.raw`, or discarded; every action is logged. Alternative if the customer prefers no PII at rest in quarantine: store only error code, source id and field names, and have the source re-send.
6. **Canonicalize + hash**: the source/shipper must supply a unique, stable `event.source_id` (`agent.id` + per-source sequence number or file offset). Serialize the masked event **including `event.source_id` but excluding the `_pipeline` namespace** as canonical JSON (sorted keys, UTF-8, no whitespace) and compute `event.hash = SHA-256(canonical)`. Result: replaying the same source event gives the same hash even if ingest time differs, and two genuinely distinct events with identical content have different `source_id`s and are never merged. Sources that cannot provide a sequence are flagged in onboarding; for them Kafka `audit.raw` partition+offset is used as fallback (stable only within one raw-topic replay); also store `event.original_hmac = HMAC(key_integrity, original line)` so the masked record can later be tied to the source line without storing it.
7. **Outputs**: (a) Elasticsearch bulk to data stream `audit-logs`, `action => "create"`, `document_id => event.hash` — a replay after a crash is deduplicated by `_id` (409 on duplicate is ignored) **within one backing index only**. Uniqueness of `_id` in a data stream is per backing index, so a replay that straddles a rollover can create a duplicate. This is a known limit: the archive is deduplicated by `event.hash` at write time (Archiver keeps a recent-hash window and the verify job checks globally), and the daily reconciliation (§8.5) reports ES duplicates by `event.hash` aggregation so they can be removed from the (non-evidentiary) search copy; (b) Kafka `audit.masked` for the archiver.

Elasticsearch side: component/index templates fix explicit mappings (`dynamic: strict` for the `user`, `source`, `mask` objects; `keyword` for IDs; `_source` retained because it is the evidence copy), `index.lifecycle.name: audit-ilm`, `index.codec: default`, `number_of_replicas: 1`.

## 6. ILM and snapshot policy

Features used — ILM, data tiers (node roles), SLM, S3 snapshot repository, data streams — are all included in Basic. Only the `searchable_snapshot` action is not and is not used.

```json
PUT _ilm/policy/audit-ilm
{ "policy": { "phases": {
  "hot":  { "actions": {
      "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "7d", "actions": {
      "readonly": {},
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "set_priority": { "priority": 50 } } },
  "delete": { "min_age": "30d", "actions": {
      "wait_for_snapshot": { "policy": "audit-nightly" },
      "delete": { "delete_searchable_snapshot": false } } }
} } }
```

(`min_age` is measured from rollover, so every event is online ≥ 30 days; the extra up-to-1-day is covered by the headroom in §2.4.)

```json
PUT _slm/policy/audit-nightly
{ "schedule": "0 30 1 * * ?",
  "name": "<audit-{now/d}>",
  "repository": "audit-snapshots",
  "config": { "indices": ["audit-logs"], "include_global_state": false },
  "retention": { "expire_after": "365d", "min_count": 30, "max_count": 400 } }
```

Mechanics and consequences:

- `wait_for_snapshot` requires that the SLM policy has *run after the index's phase time reached the delete `min_age`*, i.e. an index leaves the cluster only after the next nightly snapshot that contains it has completed (this is why the 1-day lag exists in §2.4). It stops ILM from deleting an index until the SLM policy has run after the index became read-only, so no index leaves the cluster without a snapshot.
- Snapshots are incremental; each nightly snapshot lists the ≈30 days of indices then on the cluster. An index is restorable from any snapshot that contains it, so keeping every nightly snapshot for 365 d means a given day's data is recoverable for up to ≈ 395 d (365 + 30). Treat 365 d as the **minimum**; if the customer needs a hard maximum, see §12 item 8.
- The snapshot bucket is **not** Object-Locked (Elasticsearch must delete expired segments); it is protected by versioning, a restricted IAM role and a replica in a second site. Object Lock lives on the evidence archive instead.
- Repository settings: raise `max_restore_bytes_per_sec` (default 40 MB/s per node) and `max_snapshot_bytes_per_sec` to match the network.

### 6.1 Restore on request (older than 30 days, SLA 24 h)

1. Request names a date range (or case ID). 2. Operator scales up the restore tier (automation/IaC, ~30 min). 3. `POST _snapshot/audit-snapshots/<snap>/_restore` with `indices` for the range, `rename_pattern/rename_replacement` → `restored-audit-*`, `index_settings: {"index.number_of_replicas":0, "index.routing.allocation.include._tier_preference":"data_cold"}`, `index_settings` also removes the ILM policy. 4. Analyst searches via Kibana data view `restored-audit-*` (role with read-only access). 5. Indices deleted after the case.

Required aggregate restore throughput to finish in a 12 h working target (half the SLA, leaving time for access and search):

| Requested range | Data restored | Required rate | Feasible on 4 restore nodes? |
|---|---|---|---|
| 7 days | 5.3 TB | 123 MB/s | yes |
| 30 days | 22.8 TB | 528 MB/s (4.2 Gbit/s) | yes with ≥ 10 GbE per node |
| 60 days | 45.6 TB | 1.06 GB/s | borderline; use 24 h window |
| 90 days | 68.4 TB | 1.58 GB/s | no — scale restore tier / network |
| all 335 days | 254.7 TB | 5.9 GB/s | no — not meaningful on this sizing |

**The 24 h requirement therefore holds for requests up to ~30–60 days of data**; larger scopes need a pre-agreed scope-narrowing step (date range, source system) or a larger restore tier. Fallback for any range: the evidence archive can be scanned directly (`zgrep`/`jq`) without Elasticsearch.

## 7. Masking details and limits

### 7.1 What is masked
Usernames, e-mails, phone numbers, in structured fields and free text (§5, steps 3–4).

### 7.2 Key management
HMAC key `key_vN` in Logstash keystore, source from an external secrets store (KMS/Vault); never in git. Rotation creates `key_v(N+1)`; pseudonyms for the same person differ between key versions, so cross-period correlation needs the old key or a mapping job. Recommendation: rotate only on compromise.

### 7.3 Known limits
Regex masking of free text cannot be proven complete (names embedded in unusual formats, phone numbers with typos). Mitigations: (a) fail-closed on errors, (b) a daily "PII canary" job that searches the last 24 h of `audit-logs` for e-mail/phone regexes and pages on any hit, (c) request source teams to emit PII only in structured fields.

### 7.4 Re-identification (decision required)
Pseudonyms are one-way. If legal proceedings require naming the person, either (a) the source systems still hold the user directory and one recomputes `HMAC(key, value)` for the suspect values (needs the key under dual control), or (b) a token vault *outside* Elasticsearch (write-only from Logstash, break-glass read) stores `pseudonym → encrypted value`. Option (a) is the default here; (b) is recommended only if the customer needs reverse lookup without knowing the candidate.

## 8. Integrity ("provably unaltered")

Threat model: an administrator, an attacker with ES credentials, or the operator changing/deleting events after ingestion. Out of scope: forgery *before* the event reaches the platform (agents use mTLS with per-source certificates to limit this, but source authenticity is only as good as the source).

Layers:

1. **Per-event hash** `event.hash` (SHA-256 of the canonical masked event) stored in every document and used as `_id` (inputs defined in §5 step 6).
2. **Evidence archive (record of truth)**: the Archiver consumes `audit.masked`, writes NDJSON.gz objects, one per Kafka partition per ≤ 5 min or ≤ 256 MB, to bucket `audit-evidence` with **Object Lock compliance mode**, retention 12 months + 30 d (extend via legal hold when a case is open). Compliance mode means even the root account cannot delete or shorten retention. Object key includes partition and offset range, making gaps visible.
3. **Hash-chained signed manifests**: per object the manifest has `{object_key, sha256, event_count, first/last offset, prev_manifest_sha256}` per partition; manifests are signed (algorithm per the chosen KMS/HSM: Ed25519 or ECDSA P-256; key in HSM/KMS, signing only by the Archiver identity) and also locked. Any removal, reordering or edit breaks the chain or a signature.
4. **Trusted time**: once per hour the Archiver computes a Merkle root over that hour's manifest hashes and obtains an **RFC 3161 timestamp** from an external TSA; token stored (locked) beside the manifest. This proves existence not later than that time, independent of the customer's own clocks.
5. **Verification job** (daily, separate identity, read-only): re-hash all objects of the previous day against manifests; verify signatures, chain continuity and TSA tokens; sample ≥ 0.1 % of ES documents and compare `event.hash` against recomputation from `_source` and against the archive line; reconcile counts per hour (Kafka offsets = archive events = ES docs, ±quarantine). Mismatch → page. A full verify of any range is a documented runbook for court production: output is the object, its manifest, the signature chain and the TSA tokens.
6. **Hardening of the search copy** (best effort on Basic): indices set `readonly` in the warm phase; `audit-logs` write role only for the Logstash service account; no human role has `delete_index`, `manage`, or `write` on `audit-*`; native user realm over TLS; ES and Kibana reverse-proxy access logs shipped to a separate, locked log store (Elasticsearch's own audit log is Gold+); snapshots in a separate account.

What this gives: any alteration of the Elasticsearch copy is *detectable* and the original is *recoverable*; the unalterability of the record itself comes from Object Lock + signatures + TSA, not from Elasticsearch.

## 9. Evaluation of the "searchable snapshots" suggestion

| Question | Answer |
|---|---|
| Available under Basic? | **No.** Searchable snapshots (cold and frozen) are Enterprise features. |
| What would it have saved? | Cold tier: no replica on disk. Frozen: only a local cache. Roughly the 254.7 TB × 2 (≈ 509 TB with replicas) otherwise needed online for days 31–365. |
| What replaces it here? | Ordinary SLM snapshots on object storage, restored on request into an elastic restore tier (§6.1). Saving obtained: the same ~509 TB of replicated disk is replaced by 305 TB of object storage plus 64 TB of on-demand restore disk. |
| Cost of the replacement | Older data is **not** interactively searchable until restored (hours, not seconds); this matches the stated "within 24 hours" requirement. |
| Integrity impact | None either way: searchable snapshots do not make data tamper-evident. |
| Alternative if the customer later wants instant search of old data | Buy Enterprise (re-evaluate cost) or keep an online cold tier: 254.7 TB, 0 replicas ≈ 335 d × 0.76 ÷ 0.8 ≈ 318 TB provisioned on ~20 HDD nodes with snapshots as the safety net. |

## 10. Basic-license feature check

| Needed | Basic? | Used how |
|---|---|---|
| TLS, RBAC, native users, Kibana spaces | Yes | transport/HTTP TLS, least-privilege roles |
| ILM, data tiers, data streams, SLM, S3 repository | Yes | §6 |
| Logstash, Beats | Yes | §5 |
| Searchable snapshots | **No (Enterprise)** | replaced, §9 |
| Field/document-level security | No (higher tier than Basic; Gold vs Platinum **unverified**) | not used; separate indices/spaces if tenant separation is needed |
| Elasticsearch security audit log | No (Gold) | compensating controls, §8.6 |
| SAML/OIDC/LDAP SSO | No (Gold/Platinum) | native users; SSO only via reverse-proxy auth in front of Kibana, if the customer insists |
| Cross-cluster replication (DR) | No (Platinum) | DR through snapshots to a second site and Kafka mirroring |
| `redact` ingest processor | Not in Basic (verify) | masking in Logstash |
| Vendor support / SLA | No | operational risk, see §11 |

Please have the customer confirm the entitlements against Elastic's current subscription page before signature; this table reflects the matrix as known to the author and is not a contractual statement.

## 11. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Compression/expansion ratios are assumptions | Hot/warm disks ±25 % | PoC with 1 TB of real data before buying; ratios in §2.2 are the single input to re-compute |
| R2 | Peak rate unknown; hot indexing capacity unproven | Backlog, Kafka fills | Kafka buffer 24 h raw / 72 h masked (30 TB, §2.4); if the ES side is down longer than 24 h the raw topic expires, so alert at 12 h lag; Rally benchmark, 7th hot node as option |
| R3 | Basic = no vendor support, no SLA | Longer outage recovery | Tested runbooks, spares, snapshot restore drills quarterly |
| R4 | Regex masking misses PII | GDPR/privacy breach | Fail-closed, canary job, structured-field policy for sources (§7.3) |
| R5 | Unmasked PII lives in Kafka `audit.raw` (≤ 24 h), in the Logstash PQ and in `audit.quarantine` (≤ 7 d) | Exposure window | Disk encryption, ACLs, fixed retention on all three, separate admin group, no ES access to these topics; quarantine handling per §5 step 5 |
| R6 | Restoring large ranges breaks the 24 h SLA | SLA breach | Scope limits in §6.1, scalable restore tier, archive fallback |
| R7 | Compromise of signing key or HMAC key | Forged manifests / reversal of pseudonyms | HSM/KMS, dual control, key IDs in records, rotation runbook |
| R8 | Single-site failure | Loss of search availability | Second-site replica of both buckets; Kafka MirrorMaker; documented rebuild from archive + snapshots (RTO to be agreed) |
| R9 | Object Lock compliance mode is irreversible | Data cannot be deleted early (e.g. mistaken PII leak that bypassed masking) | Ensure masking tested before enabling lock; use a short-retention staging bucket during PoC |
| R10 | Clock skew corrupts ordering/time evidence | Weak evidential value | Chrony to ≥ 2 authenticated NTP sources on all hosts; TSA tokens |

## 12. Conflicts in the inputs and decisions needed from the customer

1. **Searchable snapshots vs Basic license** — not possible; alternative in §9. *Decision*: accept restore-on-request, or fund Enterprise.
2. **"Unaltered" vs "masked before indexing"** — the record is the masked form; original not retained. *Decision*: confirm legal acceptability, and choose re-identification option §7.4.
3. **"Provably unaltered" vs Basic** — no Elastic feature provides it; delivered by external WORM + signatures + TSA (§8). Adds components (Archiver, object store with Object Lock, TSA, HSM/KMS) the customer did not mention.
4. **Interactive 30 days** — no latency target given. Assumed p95 < 5 s for a 24 h window over the 30-day set, < 30 s for a 30-day range. *Decision*: confirm.
5. **"Within 24 hours of a request"** — scope of a request is undefined; only ≤ 30–60 days is realistic (§6.1). *Decision*: agree maximum scope.
6. **Peak and growth** — only a sustained rate was given; sized for 2× peak and no growth. Every +10 % events adds roughly +10 % to all storage rows.
7. **Access control** — Basic lacks SSO and field-level security; if analysts must be restricted to subsets of fields/documents, this is not achievable on Basic.
8. **12-month retention precision** — snapshot-based design keeps Elastic copies up to ≈ 395 d (§6); the Object-Locked archive expires at 12 months + 30 d. If a hard maximum of 365 d is a privacy requirement, change snapshotting to monthly dedicated snapshots per index group, at the price of more snapshot storage.
9. **Legal hold** — no way to suspend deletion for a case other than Object Lock legal hold on the archive and manual snapshot retention; define the process with the legal team.

## 13. Summary of totals

| Item | Value |
|---|---|
| Raw per day / year | 1.3824 TB / 504.6 TB |
| Hot (8 d, replica 1) | 25.3 TB provisioned on 6 nodes × 6 TB NVMe |
| Warm (23 d, replica 1) | 43.7 TB provisioned on 5 nodes × 12 TB SSD |
| Restore tier | 4 nodes × 16 TB, elastic |
| Snapshot repo | 305 TB object storage (+ second-site copy) |
| Evidence archive | ≈ 83 TB object storage with Object Lock (+ second-site copy) |
| Kafka | 30 TB provisioned (3 × 10 TB) for raw 24 h + masked 72 h + quarantine 7 d, RF3 |
| Other | 3 masters, 2 coordinating, 2 Kibana, 5 Logstash, 3 Kafka, 2 Archiver |
| License | Elastic Basic; no Enterprise feature required |
