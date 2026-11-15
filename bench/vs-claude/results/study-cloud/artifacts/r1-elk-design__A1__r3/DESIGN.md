# Audit-Log Platform on the Elastic Stack (Basic License) — Architecture & Sizing Proposal

Status: proposal for review. All sizing figures are **estimates derived from stated assumptions**; they must be
validated by a proof-of-concept (PoC) with real, masked sample events before hardware is ordered (see §10).
Units: TB = 10^12 bytes unless stated. Feature/license statements reflect the Elastic subscription matrix as I know it
and **must be re-checked against the matrix for the exact version pinned** (§9, R1).

## 0. Executive summary

* Raw volume is **16 MB/s = 1.38 TB/day = 505 TB/year** (1.73 billion events/day).
* **Searchable snapshots (the customer's suggestion) cannot be used: they require an Enterprise license**, as does the
  frozen tier. On Basic we use plain snapshots to an object store and **restore on demand** into a small, dedicated
  restore tier. The 24-hour requirement is exactly what makes this acceptable.
* Online layout: **hot 7 days (8 nodes) → warm days 8–30 (8 nodes)** = interactive 30 days, 1 replica; days 8–365 live
  as incremental snapshots (~346 TB) in the object store; **restore tier** (10 nodes, 0 replicas) is populated on request.
* **Integrity cannot be delivered by Elasticsearch on Basic** (no immutability, no ES audit log). It is delivered by an
  independent, signed, hash-chained, timestamped archive in **WORM (object-lock) storage**, fed in parallel from the
  same Kafka stream. Elasticsearch is the *search copy*; the archive is the *evidence copy*.
* **Masking happens in the first pipeline stage, before Kafka, archive and Elasticsearch**, with keyed-HMAC
  pseudonyms so events stay correlatable. This conflicts with "unaltered" and needs a legal ruling (§9, R2).

## 1. Requirements, assumptions and conflicts (PLAN)

| # | Requirement / input | Interpretation & assumption |
|---|---|---|
| 1 | 20,000 events/s sustained, 800 B average, 24/7 | Treated as the *average*. Design headroom: **2× burst (40k eps)** for ingest tier and Kafka; ES hot sized for ≥1.5× via CPU headroom. No seasonality or growth assumed; **+25 % growth** is covered only by the headroom listed in §3 (flagged R7). |
| 2 | Retention 12 months | **365 days rolling from ingest time**. Calendar-month or leap-year reading differs by ≤1 day (0.3 %). Over-retention is also a risk (privacy), so deletion is automated and exact to ±1 day. A **legal-hold** mechanism must be able to suspend deletion (§7.5). |
| 3 | Newest 30 days searchable interactively | Days 0–30 are on local, replicated SSD (hot + warm). "Interactive" = seconds-level dashboards/queries; assumed target p95 < 5 s on a 7-day range. |
| 4 | Older data searchable within 24 h of a request | Ambiguous (request → first query possible, or → full result?). Assumption: **within 24 h of the request, the requested time range is online and queryable interactively**. Request scope **≤ 31 days of data per request, up to 2 concurrent**; larger spans are phased. |
| 5 | Provably unaltered (legal evidence) | Need tamper-*evidence* and tamper-*resistance* outside ES: WORM storage, signed hash chain, trusted timestamps, periodic verification, chain-of-custody export procedure. |
| 6 | Mask usernames, e-mails, phone numbers **before indexing** | Applied to structured fields **and** free text. Irreversible in the stored copies (keyed HMAC pseudonym / partial mask). Fail-closed: an event that cannot be masked is never indexed or archived. |
| 7 | Basic (free) license only | Allowed: hot/warm/cold node roles, ILM, SLM, snapshots, TLS, RBAC (native/file users), ingest pipelines, Logstash, Kibana, Beats/Agent, stack monitoring. **Not allowed:** searchable snapshots, frozen tier, ES audit logging, DLS/FLS, SAML/LDAP/OIDC SSO, CCR, ML, Kibana connectors beyond basic ones. |
| 8 | Customer suggestion: searchable snapshots for cold/frozen | **Rejected — license conflict** (§9 R1). Replaced by snapshot + restore-on-demand. |
| 9 | Show arithmetic, tiers, node layout, pipeline, ILM, integrity, risks | §2–§9. |

**Contradictions found:** (a) searchable snapshots vs Basic; (b) "masked before indexing" vs "provably unaltered";
(c) "provably unaltered" vs a platform (ES on Basic) that has no immutability or audit features; (d) masked usernames vs
the evidential need to identify a person. Resolutions are in §6 and §9.

## 2. Capacity arithmetic

### 2.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 ev/s × 800 B | 16,000,000 B/s = **16 MB/s** (128 Mbit/s) |
| Events/day | 20,000 × 86,400 | **1.728 × 10^9** |
| **Raw per day** | 16,000,000 × 86,400 | 1.3824 × 10^12 B = **1.38 TB** (1.257 TiB) |
| **Raw per year** | 1.3824 TB × 365 | **504.6 TB** (≈ 459 TiB; 6.31 × 10^11 events) |
| 30 days raw | 1.3824 × 30 | 41.5 TB |

### 2.2 Compression / expansion assumptions (**the key uncertainty**)

| Form | Factor vs. raw 800 B | Rationale |
|---|---|---|
| ES primary data, freshly indexed (hot, default LZ4 codec) | **1.0×** | JSON `_source` + inverted index + doc values + our added ECS/hash metadata (~150–250 B/event) roughly cancels LZ4 savings. Typical audit/ECS logs fall in 0.8–1.4×. |
| ES primary data after force-merge, `best_compression` (warm and snapshots) | **0.7×** | Segment merge + DEFLATE on stored fields; typical gain 25–35 % over hot. |
| WORM evidence archive (NDJSON of masked canonical event + hashes, gzip/zstd) | **0.17×** | Record ≈ 1.2× raw (metadata) compressed ~7:1 (repetitive audit JSON). Expect 5–10:1. |
| Replicas | primary × (1 + replicas) | Hot and warm: 1 replica. Restore tier: 0 (source of truth is the snapshot). Snapshots store one copy. |

Sensitivity: if the true hot factor is 1.4× / warm 1.0×, online storage grows ≈ 40 % (hot 27 TB, warm 64 TB). The PoC
must measure this on at least 24 h of real data and the node counts below scale linearly with it.

### 2.3 Storage per tier

Per-day primary sizes: hot **1.3824 TB**, warm/snapshot **1.3824 × 0.7 = 0.9677 TB**, archive **1.3824 × 0.17 = 0.2350 TB**.

| Tier | Data age | Days | Calculation | Data (with replicas) | Provisioned disk (headroom) |
|---|---|---|---|---|---|
| **Hot** | 0–7 d | 7 | 7 × 1.3824 = 9.68 TB primary × 2 | **19.35 TB** | 27.6 TB needed at ≤70 % fill; **30.7 TB** installed (8 × 3.84 TB) |
| **Warm** | 8–30 d | 23 | 23 × 0.9677 = 22.26 TB primary × 2 | **44.51 TB** | 59.4 TB needed at ≤75 % fill; **64 TB** installed (8 × 8 TB) |
| *Online subtotal (interactive 30 d)* | | 30 | | **63.9 TB** | **94.7 TB** installed |
| **Snapshot repo (ES format)** | 8–365 d | 358 | 358 × 0.9677 | **346.4 TB** (one copy, no replicas) | object store, ≥ 400 TB usable incl. ~15 % overhead/erasure-coding slack |
| **Restore tier** | on demand | ≤ 62 | 62 × 0.9677 = 60.0 TB, 0 replicas | **60.0 TB** | 75 TB at ≤80 % fill; **80 TB** installed (10 × 8 TB) |
| **WORM evidence archive** | 0–395 d (365 + 30 d grace) | 395 | 395 × 0.2350 | **92.8 TB per copy; 185.7 TB for 2 sites** | object store with Object Lock |
| Kafka buffer | 48 h, RF 3 | 2 | 2 × 1.3824 × 3 | 8.3 TB | 16 TB (4 × 4 TB; 52 % fill) |
| ES DR for days 0–7 | — | — | not snapshotted; covered by replica in the other zone **and** by the WORM archive/Kafka | — | — |

**Why days 0–7 are not in the snapshot repo:** snapshotting only after force-merge (day ≥ 8) avoids storing every
segment twice (unmerged 1.0× and merged 0.7×), which would inflate the repo from 346 TB to ≈ 590 TB.

Comparison with the rejected/alternative options (same 0.7× assumption):

| Option | Data > 30 d | Cost driver |
|---|---|---|
| **Recommended: snapshot + restore on demand** | 346 TB in object store + 80 TB restore tier (can be powered off when idle) | smallest local disk |
| A: always-on cold tier, 0 replicas, snapshot as backup (allowed on Basic, no searchable snapshots) | 335 d × 0.9677 = **324 TB local** (≈ 432 TB provisioned at 75 %) **plus** the same snapshots | +≈ 350 TB of local disk (dozens of high-density nodes); no 24 h wait |
| B: always-on cold tier with 1 replica (no snapshots) | **648 TB local** (335 d × 0.9677 × 2) | the baseline the customer wanted to avoid; searchable snapshots would have shrunk it to one copy, which on Basic we approximate with the restore model |

Option A is the fallback if the business wants old data online without a request.

## 3. Node layout per tier

All Elasticsearch nodes: two-zone-aware layout for data nodes, masters spread over three locations (`cluster.routing.allocation.awareness.attributes: zone`), JVM
heap ≤ 31 GB (≤ 50 % RAM), TLS on transport and HTTP (included in Basic), swap off, disk encryption at OS level (LUKS —
ES has no encryption-at-rest on Basic).

| Tier / role | Count | Spec (per node) | Justification |
|---|---|---|---|
| Dedicated master | **3** | 4 vCPU, 16 GB RAM, 100 GB SSD; one per zone | Quorum of 3; cluster state includes ~2,000–3,000 shards. |
| **Hot** (`data_hot`, `data_content`) | **8** (4 + 4 in zones A/B) | 16 vCPU, 64 GB RAM (31 GB heap), 3.84 TB NVMe | Disk-driven: 19.35 TB / 30.7 TB = 63 % fill; with 1 node lost 72 % (< 85 % low watermark). Indexing load: 20k eps × 2 copies / 8 = 5k docs/s per node, ~30–40 % CPU, leaving ≥ 1.5× burst headroom. |
| **Warm** (`data_warm`) | **8** (4 + 4) | 16 vCPU, 64 GB RAM, 8 TB SSD (SATA/NVMe) | 44.5 / 64 TB = 70 % fill; with 1 node lost 79 % (< 85 %). RAM:disk ≈ 1:125. |
| **Restore** (`data_cold`) | **10** | 8 vCPU, 64 GB RAM, 8 TB SSD, 10 GbE | 60 TB at 75 % of 80 TB. May be kept stopped and started on request (VMs). Role name `data_cold` is used only to scope allocation; **no searchable snapshots involved**. |
| Coordinating | **2** | 8 vCPU, 32 GB RAM | Behind the load balancer for Kibana/API search traffic. |
| Kibana | 2 | 4 vCPU, 8 GB | Behind LB; RBAC users managed natively (no SSO on Basic). |
| Logstash stage 1 (mask/hash) | **6** | 8 vCPU, 16 GB | Assumes ~7k eps per node with regex+HMAC (an unmeasured assumption). 20k eps needs 3 nodes; 6 gives 2× burst and N+1 headroom. Re-size after the PoC benchmark. |
| Kafka | **4 brokers** | 8 vCPU, 32 GB, 4 TB each | 48 h at RF 3 (8.3 TB), 24 partitions per topic, `min.insync.replicas=2`, `acks=all`. |
| Logstash stage 2 (indexers) | **3** | 8 vCPU, 16 GB | Kafka → ES bulk. |
| Archiver | **2** (one consumer group, active/active by partition) | 4 vCPU, 8 GB, local SSD scratch | Writes signed batches to WORM (§6). |
| Utility host | 1 (+1 standby) | 2 vCPU, 4 GB | Snapshot/gate job, integrity verifier, monitoring. |
| Monitoring cluster | 1 small separate ES + Metricbeat | 3 vCPU, 16 GB, 500 GB | Stack monitoring of the production cluster. |

Shard budget (heap guideline ≤ ~20 shards/GB heap ⇒ ≤ 600/node): hot 8 primaries + 8 replicas per index, rollover at
50 GB per primary shard ⇒ ≈ 400 GB/index ≈ 3.5 indices/day ⇒ 7 d × 3.5 × 16 = **≈ 390 shards** (≈ 49/node). Warm:
23 d × 3.5 × 16 = **≈ 1,290 shards** (≈ 160/node, merged shard ≈ 35 GB). Both well inside limits.

## 4. Ingest pipeline

```
 sources (syslog, Elastic Agent / Filebeat, app audit APIs)
        │  TLS (mutual where supported), per-source ack
        ▼
 [Stage 1] Logstash: parse → canonicalise → hash original → MASK → hash masked → route
        │  (memory queue only; no unmasked data on disk; masked JSON only beyond this point)
        ▼
 Kafka topic audit.masked (RF3, acks=all, 48 h)
   ├──► consumer group "indexer"  → [Stage 2] Logstash → Elasticsearch data stream  audit-events
   │                                   (+ ES ingest pipeline = second-line PII check)
   └──► consumer group "archiver" → signed, hash-chained batches → WORM object store (2 sites)
   DLQ topic audit.rejected (restricted, encrypted volume, 7 d TTL, alert on any message)
```

**Stage 1 steps (in order):**
1. Parse into ECS-style fields; require `@timestamp`, `event.id`/source, `event.original`. Reject if missing → DLQ.
2. `event.original_sha256` = SHA-256 of the **original bytes** as received (before any change). The original itself is not retained (see R2 for the optional escrow).
3. **Masking** (deterministic, no raw value leaves this stage):
   * `user.name`, `user.email`, `source.user.*`, `client.user.*`, phone fields: replaced with `HMAC-SHA256(key_v, normalised_value)` truncated to 128 bit, prefixed with the key version (`u1:ab12…`) so the same user correlates across events but cannot be reversed without the key.
   * Display-friendly partial mask in a separate keyword (e.g. `j***@example.com` domain kept, phone `+49 ***** 1234`) only where the customer's privacy officer permits; the domain/country-code kept is a policy decision.
   * **Free text** (`message`, URLs, query strings, command lines): regexes for e-mail, E.164/national phone formats, and known username fields (value-based replacement using the extracted user value as well, to catch the username in text). Replaced with the same HMAC token.
   * Normalisation before HMAC (lower-case e-mail, strip spaces/dashes from phone, trim) so the pseudonym is stable.
   * HMAC key is in a secrets manager/HSM, versioned; never in pipeline config in clear text; rotation creates a new key version (old tokens remain valid to look up; correlation across versions needs a mapping — decide before go-live, R3).
4. Canonical JSON serialisation (sorted keys, UTF-8, no insignificant whitespace) → `event.hash` = SHA-256 over the **masked** canonical event.
5. Assign `_id` = `event.hash` (first 128 bits, base64url). Kafka is at-least-once, so redelivered events overwrite/are rejected idempotently (`op_type=create`; duplicates return 409 and are counted, not errors). Cost: ES cannot use auto-id append optimisation (~10–15 % indexing overhead, accepted; included in headroom).
6. Fail-closed: any exception in masking → DLQ, **never** forwarded. Metric `masking_failures_total` alerts at > 0.

**Stage 2 / Elasticsearch:** bulk to data stream `audit-events` (index template: explicit mappings, `dynamic: strict` for core fields, `runtime`/`flattened` for unknown attributes to avoid mapping explosion, `index.codec` default in hot, `index.number_of_shards: 8`, `index.number_of_replicas: 1`, `index.refresh_interval: 30s` (a 30 s search delay is acceptable for audit analytics; reduces merge load), `index.lifecycle.name: audit-ilm`, `index.routing.allocation.require` unset). An ES **ingest pipeline** (`audit-pii-guard`) runs a regex check for residual e-mail/phone patterns in all string fields; a hit routes the doc to the `audit-quarantine` index (restricted role, 7 d ILM delete) and raises an alert. This is defence in depth, not the primary control.

**Edge cases handled:** out-of-order/late events (stored by ingest order; retention clock is *ingest* time, so an event can be stored up to the lateness bound longer/shorter than 365 d of *event* time; events with `@timestamp` older than 7 d or > 5 min in the future are flagged `event.ingest_anomaly` and counted); bursts (Kafka absorbs 48 h); ES back-pressure (indexers pause consumption, offsets retained); duplicate delivery (idempotent `_id`); schema drift (flattened bucket + alert on mapping-conflict rejects → DLQ).

## 5. ILM, SLM and snapshot policy

Data stream `audit-events`; ILM policy `audit-ilm`. **No `searchable_snapshot` action anywhere** (would be rejected on Basic).

| Phase | min_age | Actions |
|---|---|---|
| Hot | 0 | `rollover`: `max_primary_shard_size: 50gb`, `max_age: 1d` (whichever first); `set_priority: 100` |
| Warm | 7d (from rollover) | `set_priority: 50`; `allocate` → `data_warm` (automatic via tier migration); `forcemerge`: `max_num_segments: 1`, `index_codec: best_compression`; `readonly`; replicas stay 1. Shrink is intentionally **not** used (merged shards ≈ 35 GB already). |
| (no cold phase) | — | Data > 30 d is not kept on cluster. |
| Delete | 30d | `delete` (local index only). Snapshot copy persists in the repo. |

**Snapshot of aged data ("archive snapshots"):** daily job `es-archive-snapshot` on the utility host (cron/systemd,
Snapshot API; works on Basic):
1. Select backing indices whose ILM step is `complete` in warm (i.e. force-merged, read-only) and not yet snapshotted.
2. `PUT _snapshot/audit-repo/arch-YYYY.MM.DD` with that explicit index list, `include_global_state: false`.
3. Verify `state: SUCCESS`, shard failures 0, index count matches; record in a ledger index (and in the WORM ledger).
4. **Gate alert:** any index older than 20 days without a successful archive snapshot raises a P1 alert — 10 days before ILM would delete it at day 30. (Hardening to test in PoC: replace the alert by ILM `wait_for_snapshot` bound to an SLM policy that this job executes; if it proves reliable on Basic it makes deletion safe by construction.)
5. Retention: the same job deletes `arch-*` snapshots when the newest data in them is older than 365 days (snapshots created at day ≈ 8 ⇒ expire at snapshot age ≈ 357 d). SLM's `expire_after` is **not** used because it counts from snapshot time, not data time. Snapshots are incremental over shared segments, but each `arch-` snapshot holds disjoint indices, so deletion frees storage deterministically.
6. Repository access: the ES nodes hold write credentials; no human holds delete rights on the bucket outside break-glass.

**Restore policy (`audit-restored`)** for indices restored from snapshots: allocation pinned to `data_cold` nodes, `number_of_replicas: 0`, ILM `delete` at 14 days after restore (extendable by an explicit hold); they are *copies*, so deletion loses nothing.

**Restore runbook (24 h SLA):**
1. Request logged (ticket, requester, time range, justification) — T+0.
2. Power on restore nodes if stopped (≤ 30 min) and resolve `arch-*` snapshots covering the range.
3. `POST _snapshot/audit-repo/<snap>/_restore` with `rename_pattern` → `restored-…`, `index_settings` replicas 0 + routing to `data_cold`; `max_restore_bytes_per_sec` and `indices.recovery.max_bytes_per_sec` raised to the network capability.
4. Throughput check: 31 days = 30.0 TB; at **1 GB/s ≈ 8.3 h, at 0.5 GB/s ≈ 16.7 h** — within 24 h only if the object store sustains ≥ 0.5 GB/s to the 10 restore nodes (10 GbE each). **To be proven in the PoC**; if it fails, reduce the per-request scope to 15 days or add nodes.
5. Run integrity verification (§6.4) of the restored range against the WORM manifests; hand over to the requester; ILM removes the copy after 14 days.

## 6. Integrity ("provably unaltered")

### 6.1 Principles
* Elasticsearch on Basic can **detect and limit** but not **prevent** alteration by an administrator. Therefore the
  evidential record is the WORM archive; ES contents are verifiable *against* it.
* Evidence definition: the *masked canonical event* plus `event.original_sha256` (hash of the original bytes at the
  point of collection). Anyone can prove (a) the stored record has not changed since archiving; (b) it was archived at
  a certain time; (c) with the escrowed original (if the customer decides to keep one), that masking was the only change.

### 6.2 Archive chain
1. The **archiver** consumes the same Kafka topic; for each (partition, offset-range) it builds a batch file `audit-<topic>-<partition>-<firstOffset>-<lastOffset>.ndjson.zst` (target 5 min or 256 MB, whichever first), containing events in canonical form.
2. A **manifest** per batch: file SHA-256, event count, first/last offset, first/last `@timestamp`, **hash of the previous manifest of the same partition** (chain), archiver build version, key id.
3. Manifest signed with an asymmetric key (Ed25519/ECDSA) held in an HSM/KMS; the signing key never leaves it. Offsets must be contiguous → missing batch or gap = detected.
4. Batch + manifest are written to an S3-compatible bucket with **Object Lock in compliance mode**, retention = 395 days (365 + 30 d grace), versioning on; a second site receives a replica (bucket replication with its own lock). A write is acknowledged to Kafka offsets only after both objects are durable on site 1.
5. **Daily seal:** a Merkle root over that UTC day's manifests, signed and sent to a trusted **RFC 3161 time-stamp authority** (external TSA, or a customer-operated TSA if no external call is allowed); the timestamp token is stored in the same locked bucket and printed/registered with the legal custodian monthly (optional).
6. Bucket policy: write-only service account for archiver, read-only for verifier, no bypass/delete permissions for anyone; compliance-mode locks cannot be shortened, even by the account root. Legal hold flag can be added per object to extend beyond 395 d.

### 6.3 ES-side controls (detective / hardening)
* RBAC (Basic): ingest service accounts have `create_doc`/`auto_configure` only; **no human has `delete`, `delete_index`, `write`, or `manage` on `audit-*`**; `read`-only analyst roles; a break-glass admin account sealed in a vault with dual control.
* Basic has **no ES audit log**; compensating control: all API access goes through a reverse proxy/LB that logs every request (method, path, user, body hash) to a separate syslog path that flows into the **same WORM archive**. Direct access to port 9200 (HTTP API) is blocked by firewall except from LB, Logstash, and the utility host.
* `event.hash` is stored in each ES document, so a document can be re-canonicalised and compared with the archive.
* Time sync: chrony to two internal stratum sources; skew alert at > 1 s; the TSA token supplies independent time proof.

### 6.4 Verification
| Check | Frequency | Method |
|---|---|---|
| Chain/gap check | continuous + hourly | manifests contiguous per partition; signatures valid |
| Reconciliation ES ↔ archive | hourly for last 48 h, daily for 30 d | per-hour doc counts in ES vs manifest event counts; mismatch alert (detects deletes/ingest loss) |
| Content spot-check | daily | random 0.1 % of ES docs: recompute `event.hash`, compare with archive record |
| Full archive re-hash | monthly (rolling, 1/12 of archive per month) and after every restore | recompute file SHA-256 against manifest and signature; verify TSA tokens |
| Restore of archive sample | quarterly | end-to-end evidence export drill |

### 6.5 Evidence export (chain of custody)
For a dispute: export the events, their batch files, manifests, signatures, TSA tokens, public keys/certificates and a
verification report produced by an independent open-source script; log the export itself in the archive.

## 7. Security and operations

1. TLS everywhere (included in Basic); mutual TLS Beats/Agent→Logstash→Kafka; service-account API keys.
2. Native-realm users only (no LDAP/SAML on Basic): enforce strong passwords/MFA at the reverse proxy in front of Kibana (e.g. an OIDC-capable proxy), and disable shared accounts.
3. Kibana saved objects/dashboards stored in the system indices; back up with the same snapshot mechanism (separate non-evidence snapshots, 30-day retention, include `kibana` feature state).
4. Monitoring: Metricbeat → separate monitoring cluster; alerts on disk watermark, JVM, rejected bulk, Kafka lag > 10 min, masking failures, ILM errors, snapshot failures, archive lag, reconciliation mismatch.
5. **Legal hold:** a flagged range disables ILM delete (detach the held indices from the policy with `POST <index>/_ilm/remove`), stops snapshot expiry in the job, and adds object-lock legal hold on affected archive objects. Must be a documented dual-control procedure.
6. DR: a single-site cluster loses the search copy on site failure; recovery = restore from snapshots (days 8–30 and older) and **re-index the last 7 days from the WORM archive**. RTO for search is hours-to-days; evidence RPO is ~0 thanks to the second archive site. CCR (cross-cluster replication) is not available on Basic.

## 8. Ingest-tier sizing check

* Bandwidth: 16 MB/s raw; into ES ×2 (replicas) ≈ 32 MB/s plus ~1.3× JSON expansion; Kafka RF3 write ≈ 48 MB/s: negligible on 10 GbE.
* Hot-node indexing: 20k eps × 2 copies / 8 nodes = 5k docs/s per node. Assumption (to verify in the PoC): a 16-vCPU NVMe node sustains ≥ 10k docs/s of this document shape, which gives ≈ 2× burst headroom.
* Merge/force-merge I/O in warm: 0.97 TB/day rewritten — ≈ 11 MB/s sustained, negligible.

## 9. Risks, conflicts and decisions required

| ID | Risk / conflict | Impact | Mitigation / decision |
|---|---|---|---|
| **R1** | **Searchable snapshots (and frozen tier) require an Enterprise license**; Basic cannot mount them, and ILM would reject the `searchable_snapshot` action. The customer's cost-saving suggestion is therefore not implementable under the stated budget. | Plan assumed by customer fails. | Replaced by plain snapshots + restore-on-demand (this document). Savings vs always-on replicated cold: 648 TB → 346 TB object store + 80 TB restore tier. Alternative if the saving is essential: buy Enterprise (out of the stated budget) — then days 31–365 could be a frozen tier with a partially mounted cache. Re-verify the license matrix for the pinned version. |
| **R2** | **Masking vs. "provably unaltered".** Masking changes evidence. Courts may ask for the unmasked original. | Evidential weight; privacy law. | Define evidence as masked canonical record + original-hash; get legal sign-off. **Decision for customer:** keep an encrypted, separately-keyed, dual-control *escrow* of unmasked originals in WORM (compressed ≈ 0.2× raw ⇒ ≈ +110 TB for 395 d; not in this sizing) — this would allow proving the masking is the only change but re-creates a PII store. |
| **R3** | Pseudonyms are irreversible without the key; **investigators cannot identify "who"**. Key loss = permanent loss of linkage; key rotation breaks correlation. | Operational/legal. | Keyed HMAC with versioned keys; key escrow/backup in HSM with dual control; a separate token vault (outside this stack) for authorised re-identification if the customer wants one; decide rotation policy up front. |
| **R4** | Elasticsearch on Basic cannot enforce immutability or log its own admin access (no audit log, no DLS/FLS). | Admin could alter ES data undetected *within ES*. | Evidence lives in WORM archive; ES is the search copy; reconciliation + hash spot-checks + proxy access logs + dual-control break-glass. Residual risk accepted: detection, not prevention, inside ES. |
| **R5** | Compression assumption unverified (1.0× hot / 0.7× warm / 0.17× archive). | Hardware under/over-sized by ±40 %. | PoC on ≥ 24 h of real masked data before purchase; node counts scale linearly; leave rack/slot headroom (+25 %). |
| **R6** | 24 h restore SLA depends on object-store throughput (≥ 0.5 GB/s) and request size. Full-year restore (≈ 346 TB) is **not** supported within 24 h. | SLA breach on large requests. | Scope ≤ 31 days/request, 2 concurrent; larger requests phased; document in the SLA. PoC measures throughput; Option A (always-on cold) is the fallback. |
| **R7** | Sustained 20k eps / 800 B treated as average; peaks, growth and larger events are unknown. | Under-sizing, back-pressure. | Kafka absorbs 48 h; hot sized for ≈ 1.5–2× bursts; capacity review at 70 % disk; +25 % growth would need +2 hot, +2 warm nodes and +~90 TB object store. |
| **R8** | Only one copy of ES-format data for days 31–365 (snapshot repo). | Corrupt repo ⇒ slower recovery. | Erasure-coded object store; periodic `_verify` + test restore; evidence still safe in the 2-site WORM archive and re-indexable (slow: 1.7 B events/day). |
| **R9** | Residual PII leakage by regex in free text (false negatives). | Privacy breach; wrong "masked" claim. | Value-based replacement plus patterns; ES-side PII guard; red-team sample audits; fail-closed DLQ; periodic review of new fields. |
| **R10** | Retention ambiguity (365 d vs calendar; ingest vs event time) and over-retention in WORM (395 d lock cannot be undone). | Legal/privacy. | Confirm with counsel; the 30-day archive grace is a decision (set 0 to retain exactly 365 d; saves ~7 TB per copy). |
| **R11** | No SSO/LDAP, no ES audit, limited alerting on Basic. | Weaker operations/security tooling. | Proxy with MFA in front of Kibana; external monitoring/alerting. Verify the matrix. |
| **R12** | Stage-1 Logstash is a single point of "plaintext" PII processing and the masking throughput is unmeasured. | Capacity/security. | Hardened hosts, memory queues only, no debug logging, benchmark in PoC. |
| **R13** | Custom `_id` for idempotency lowers ingest rate ~10–15 %. | Slightly more hot capacity. | Included in headroom; fall back to at-least-once duplicates with downstream de-dup if the PoC shows a problem. |
| **R14** | Single-site design, no CCR on Basic. | Site loss = search outage. | §7.6; second site optional for standby cluster restored from snapshots. |

## 10. Next steps (PoC acceptance criteria)

1. Measure real index/compression factors (hot, warm, archive) on ≥ 24 h of masked data; update §2.
2. Benchmark Stage-1 masking throughput (≥ 7k eps/node) and the PII guard false-negative rate on a labelled sample.
3. Prove restore of 30 TB-equivalent within ≤ 16 h (scaled test), and ILM/forcemerge behaviour at 20k eps.
4. Prove ILM + `arch-` job + gate alert, and test ILM `wait_for_snapshot` on Basic.
5. Prove integrity: tamper with an ES document and an archive copy; show detection and independent verification of an evidence export.
6. Obtain legal decisions on R2, R3, R10 and written confirmation of the license matrix for the pinned Elastic version.
