# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for customer review. All figures are estimates until the proof-of-concept in section 11 confirms the compression assumption.

## 0. Summary and the three things the customer must decide

| Topic | Proposal |
|---|---|
| Volume | 20,000 EPS × 800 B = 16 MB/s → **1.38 TB/day**, **504.6 TB/year** raw |
| Online (interactive) | 30 days: 7 days **hot** (6 nodes) + 23 days **warm** (6 nodes), 1 replica each. About 45 TB of replicated data on 71 TB of provisioned disk. |
| Older than 30 days | Out of the cluster. Held as Elasticsearch snapshots (about 252 TB) in an object store. Restored on request into a small on-demand restore tier (**data_cold** role, regular indices) in about 8–12 h against the 24 h requirement. |
| Integrity | Hash-chained, signed, RFC 3161-timestamped blocks written to a **WORM (S3 Object Lock, compliance mode) evidence archive**, independent of Elasticsearch. Elasticsearch is never the system of record. |
| Masking | Logstash masks and pseudonymises before anything is indexed. Fail-closed: if masking can't be applied, the event is quarantined and not indexed. |
| Licence | Elastic Basic only. Every feature used below is available in Basic (section 9). |

**Decisions needed from the customer**

1. **Searchable snapshots cannot be used.** They (and the frozen tier built on them) need an Enterprise licence, not Basic. See section 8.1. The proposal reaches the same goal, cheap long retention, with ordinary snapshots plus restore-on-request. That is allowed because the 24 h SLA for older data does not require it to be online.
2. **Masking conflicts with "provably unaltered".** If the originals are discarded, what is stored is no longer the original evidence. See section 8.2. We need a legal ruling on whether the masked record is the evidence of record, or whether originals must be kept in an encrypted vault. This proposal designs for both and prices the vault as an option.
3. **Is "12 months" a minimum, or also a maximum?** A WORM lock makes early deletion impossible by design, which collides with privacy erasure rules (section 8.7).

---

## 1. Assumptions

- Sustained rate is exactly 20,000 events/s, with no peak figure given. We size for **2× burst absorbed by the Kafka buffer** and 1.0× steady-state indexing.
- 1 day = 86,400 s. 12 months = 365 days (366 in a leap year, +0.27%, inside the headroom).
- Units: decimal TB (10¹² B) unless marked TiB.
- Elastic Stack 8.15+ or 9.x, self-managed, on-premises or IaaS VMs. A three-zone (rack/AZ) layout is assumed. An S3-compatible object store with Object Lock is available (AWS S3, or MinIO/Ceph RGW on-premises).
- The 800 B average is the raw event. Indexed events gain ECS fields, `event.hash` and `event.ingested`, which is why the compression ratios below are expressed against raw size.

### Compression assumption (the biggest uncertainty)

Index size on disk is stated as a fraction of raw size. This includes `_source`, the inverted index, doc values and ECS enrichment, but excludes replicas.

| State | Ratio to raw | Basis |
|---|---|---|
| Hot (default LZ4 codec, many segments) | **0.70** | Typical for structured JSON audit logs with 10–20 keyword fields. |
| Warm (force-merged to 1 segment, `best_compression` / DEFLATE) | **0.50** | Typically 25–35% smaller than the hot form. |
| Evidence archive (NDJSON + zstd, +10% for hash/sig fields) | 1/5 of 880 B | Conservative for repetitive JSON, which often reaches 8–10×. |

Sensitivity is in section 3.4. Real audit data can range from 0.4 to 1.0, so the PoC must measure it on a day of real data before hardware is ordered.

---

## 2. Capacity arithmetic

### 2.1 Raw volume

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 × 800 B | 16,000,000 B/s = **16 MB/s** (128 Mbit/s) |
| Events/day | 20,000 × 86,400 | **1.728 × 10⁹** |
| Raw/day | 16 MB/s × 86,400 | **1.3824 TB** (1.257 TiB) |
| Events/year | 1.728 × 10⁹ × 365 | 6.307 × 10¹¹ |
| Raw/year | 1.3824 TB × 365 | **504.6 TB** (458.9 TiB) |

### 2.2 Indexed size per day (primaries only)

- Hot: 1.3824 × 0.70 = **0.9677 TB/day**
- Warm: 1.3824 × 0.50 = **0.6912 TB/day**

### 2.3 Storage per tier, including replicas (1 replica = 2 copies)

| Tier | Residency | Primary data | ×2 copies | Target fill | Disk needed | Provisioned | Resulting fill |
|---|---|---|---|---|---|---|---|
| Hot | days 0–7 (7 d) | 7 × 0.9677 = 6.774 TB | **13.55 TB** | 70% | 13.55 / 0.70 = 19.4 TB | 6 × 3.84 TB NVMe = **23.0 TB** | 59% |
| Warm | days 7–30 (23 d) | 23 × 0.6912 = 15.90 TB | **31.80 TB** | 75% | 31.80 / 0.75 = 42.4 TB | 6 × 8 TB SSD = **48 TB** | 66% |
| Online total | 30 d | | **45.35 TB** | | | **71 TB** | |
| Restore tier (data_cold role, on demand) | requested range, 0 replicas | | up to 24 TB | 85% watermark | | 3 × 8 TB = **24 TB** | holds ≈ 29 days at once (20.4 / 0.6912) |
| Snapshot repo "archive" | 365 d, primaries only (snapshots do not store replicas) | 365 × 0.6912 = **252.3 TB** | n/a | | | **≈ 280 TB** (+10% headroom) | |
| Snapshot repo "hot-safety" | rolling hot window | ≈ 7 TB + merge churn | | | | **10 TB** | |
| Evidence archive (WORM) | 365 d | 365 × 20,000 × 880 B = 555 TB raw → ÷5 = **111 TB** | | | | **≈ 125 TB** | |
| Optional PII vault (decision 2) | 365 d | est. 10–15 TB | | | | **15 TB** | |

Fill targets leave room for merges (a force-merge temporarily needs roughly one extra shard of space), the 85% low watermark, and about 6 h of index-age overshoot, because ILM ages indices from rollover.

Object storage total ≈ 280 + 10 + 125 (+15) ≈ **415–430 TB** before any cross-site replication. Note that a second copy of everything doubles this.

**Comparison with the customer's idea.** Keeping all 12 months online as ordinary replicated indices would need 365 × 0.6912 × 2 = 504.6 TB of live, performance-grade disk (about 600+ TB provisioned). The proposal keeps 71 TB of live disk and puts the remainder in cheap object storage. Searchable snapshots would have saved a bit more, but they aren't available.

### 2.4 Shard arithmetic

- Index template: 6 primary shards and 1 replica; rollover at `max_primary_shard_size: 40gb` or `max_age: 1d`.
- One hot index ≈ 6 × 40 GB = 240 GB, so 0.9677 TB / 0.24 TB ≈ **4.0 rollovers/day**, one every ≈ 6 h. A restored index therefore covers about 6 h.
- Hot shards: 7 d × 4.03 × 6 × 2 ≈ 340 shards / 6 nodes ≈ **57 per node**.
- Warm shards: 23 d × 4.03 × 6 × 2 ≈ 1,110 / 6 ≈ **185 per node**. Shard size shrinks to ≈ 40 × 0.5/0.7 ≈ 29 GB. This is well under the ~600-shards-per-31 GB-heap guideline and within the 10–50 GB shard-size guideline.
- Cluster-wide ≈ 1,450 shards, which is fine.

### 2.5 Throughput check

Hot indexing load: 20k docs/s into 6 data nodes with 2 copies is about 3,300 primary + 3,300 replica docs/s per node. That is comfortable for 16-core NVMe nodes, which typically handle 10–15k docs/s per node of this doc size. Losing one node plus a 2× burst remains inside capacity.

### 2.6 Supporting tiers

- **Kafka:** the raw topic keeps 24 h (1.38 TB × 3 RF = 4.1 TB). The masked topic keeps 72 h (1.52 TB × 3 × 3 RF = 13.7 TB). No compression credit is taken. Total ≈ 17.8 TB, so 3 brokers × 8 TB.
- **Logstash:** about 8–10k events/s per 8-vCPU node with ~15 filters (fingerprints and regexes). We need 3 nodes at steady state for the masking stage and 1 spare, so 4 nodes. Indexing consumers run on the same hosts or on 2 extra small nodes.

---

## 3. Node layout

| Role | Count | Spec per node | Purpose |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD, one per zone | Cluster state, quorum |
| Hot data (`data_hot`, `data_content`) | 6 | 16 vCPU, 64 GB RAM (31 GB heap), 3.84 TB NVMe | Indexing and recent searches |
| Warm data (`data_warm`) | 6 | 8 vCPU, 64 GB RAM (31 GB heap), 8 TB SSD (or RAID-10 SAS SSD) | Days 7–30, read-mostly |
| Restore tier (`data_cold`) | 3, **normally powered off**, started on a restore request | 8 vCPU, 64 GB RAM, 8 TB SSD | Restored older data (see 7.4). This uses the cold *role* with plain indices, not searchable snapshots. |
| Coordinating / ingest | 2 | 8 vCPU, 32 GB RAM | Query fan-out, safety-net ingest pipeline, bulk entry point behind a load balancer |
| Kibana | 2 | 4 vCPU, 8 GB RAM | UI behind an authenticating reverse proxy |
| Kafka brokers | 3 | 8 vCPU, 32 GB RAM, 8 TB | Buffers and replay |
| Logstash | 4 | 8 vCPU, 16 GB RAM (8 GB heap) | Parse, mask, hash |
| Sealer / archive controller | 2 (active-passive) | 4 vCPU, 16 GB RAM | Integrity chain, WORM writes, snapshot control, verifier |
| Object store | S3-compatible with Object Lock | ≈ 430 TB usable | Snapshots and evidence |

- Each zone holds 1 master, 2 hot nodes and 2 warm nodes. `cluster.routing.allocation.awareness.attributes: zone` places a primary and its replica in different zones. A whole-zone loss leaves the cluster serving yellow with no data loss.
- There is **no dedicated frozen tier** (it requires searchable snapshots). The cold role is only used for on-demand restore.
- Disk: XFS, `noatime`. Encryption at rest is **not** an Elastic Basic feature, so use LUKS/dm-crypt or an encrypted SAN. TLS on both the transport and HTTP layers and RBAC are available in Basic and must be enabled.
- Total always-on Elasticsearch nodes: 3 + 6 + 6 + 2 = **17**, plus 3 on-demand.

### 3.4 Sensitivity (why PoC first)

| If the real ratio is... | Effect |
|---|---|
| Hot 0.70 → 0.83 | Hot reaches the 70% fill target. Above this add hot nodes (+1 node ≈ +0.5 TB/day). |
| Hot 1.00 | Hot needs 19.35 TB × 1.0/0.7 = 27.6 TB, so add 2 hot nodes. |
| Warm 0.50 → 0.57 | Warm reaches the 75% target. At 0.64, the 85% watermark. |
| Warm 0.70 | Warm needs 44.5 TB, which exceeds the provisioned 48 TB at the watermark, so add 2 warm nodes (+16 TB). |
| Archive snapshots 0.70 | 352 TB instead of 252 TB. |

Adding a warm node costs 8 TB. Rebalancing is automatic.

---

## 4. Ingest pipeline

```
Sources (agents / syslog / app SDK)
   │  TLS, mTLS
   ▼
Filebeat / Elastic Agent (Fleet is not required)  ── at-least-once, disk queue
   ▼
Kafka  topic audit.raw        (24 h, 24 partitions, RF3, restricted ACL: contains PII)
   ▼
Logstash stage 1: parse → normalise to ECS → MASK → event.hash
   ├─ on any masking/parse failure ──► Kafka audit.quarantine (not indexed, alert raised)
   ▼
Kafka  topic audit.masked     (72 h, 24 partitions, RF3)  ← single source of truth for both consumers
   ├──► Logstash stage 2 (indexer) ──► Elasticsearch data stream `audit-logs`
   └──► Sealer (hash chain + signature + WORM write)
```

Stage 1 writes to `audit.masked` once. Both the indexer and the sealer consume identical bytes, so the index and the evidence archive cannot diverge.

### 4.1 Masking (before indexing)

Policy: **keyed pseudonymisation** for structured fields and **redaction** for free text.

- `user.name`, `user.email` and `user.phone` become `HMAC-SHA256(key, value)`, truncated to 128 bits, with prefixes (`usr_`, `eml_`, `tel_`). Using the Logstash `fingerprint` filter with `key` gives a true HMAC. Deterministic output keeps correlation possible ("the same user did X then Y") without exposing the value. The key lives in a KMS/HSM and is rotated as a versioned `mask.key_id` field.
- E-mail domain is optionally kept in `user.email_domain` (customer decision).
- Free-text fields (`message`, `event.original`, URLs, command lines) are regex-redacted: e-mail `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` → `<email>`, phone `\+?\d[\d\s().-]{7,}\d` → `<phone>`.
- `event.original` is **removed after parsing**, since it duplicates PII. Without that, it would carry the unmasked value.

```ruby
filter {
  if [user][name]  { fingerprint { source => "[user][name]"  target => "[user][name]"  method => "SHA256" key => "${MASK_KEY}" base64encode => true } }
  if [user][email] { fingerprint { source => "[user][email]" target => "[user][email]" method => "SHA256" key => "${MASK_KEY}" base64encode => true } }
  if [user][phone] { fingerprint { source => "[user][phone]" target => "[user][phone]" method => "SHA256" key => "${MASK_KEY}" base64encode => true } }
  mutate { gsub => [ "message", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "<email>",
                     "message", "\+?\d[\d\s().-]{7,}\d", "<phone>" ] remove_field => ["[event][original]"] }
  # then compute event.hash over the canonical JSON of the masked event (see 6.2)
}
```

(Illustrative; production uses a canonical-JSON `ruby` filter for `event.hash`, and the fingerprint results are truncated and prefixed.)

**Fail-closed rules:** an event that fails parsing, or carries a `_masking_failed` tag, goes to `audit.quarantine`. A quarantine alert is raised, and quarantined events are replayed once the parser is fixed. Nothing unmasked reaches Elasticsearch.

**Defence in depth in Elasticsearch:** the `final_pipeline` for `audit-logs` runs a `fail` processor if `message` still matches the e-mail pattern or any `user.*` field has no pseudonym prefix. The bulk item is rejected into the Logstash dead-letter queue and alerts fire. A scheduled query for e-mail/phone regex hits in the last hour acts as a continuous canary. A CI test corpus (including names, plus-addressing, international and extension-bearing phone formats) gates every parser change.

**Known limits:** usernames in unparsed free text cannot be found by regex; the only real fix is parsing sources properly (or dictionary matching against known usernames). The phone regex over-redacts long numeric IDs. Both are measured in the PoC against real data.

### 4.2 Elasticsearch side

- Data stream `audit-logs`, with `op_type=create` and `_id = event.hash[:32]` truncated. Replays after a failure are idempotent, since a duplicate returns 409 rather than a double-count.
- Mapping `dynamic: strict` with ECS-aligned fields; `refresh_interval: 30s`; 6 shards / 1 replica; `index.lifecycle.name: audit-logs`; allocation awareness by zone.
- Bulk size 5–10 MB, 4 workers per Logstash node.

---

## 5. ILM and snapshot policy

```json
PUT _ilm/policy/audit-logs
{ "policy": { "phases": {
  "hot":  { "actions": {
      "rollover": { "max_primary_shard_size": "40gb", "max_age": "1d" },
      "set_priority": { "priority": 100 } } },
  "warm": { "min_age": "7d", "actions": {
      "set_priority": { "priority": 50 },
      "forcemerge": { "max_num_segments": 1, "index_codec": "best_compression" },
      "readonly": {} } },
  "delete": { "min_age": "30d", "actions": {
      "wait_for_snapshot": { "policy": "audit-archive" },
      "delete": {} } }
}}}
```

- Ages are measured from rollover, so every document is retained at least 30 days (the oldest one up to ~6 h longer). Data moves to the warm nodes automatically through the default `_tier_preference`.
- There is no cold or frozen phase and no `searchable_snapshot` action.
- **Two SLM policies** (SLM is in Basic):
  - `hot-safety`: hourly, `audit-logs*`, to repo `hot-safety`, `expire_after: 3d`. This bounds data loss from losing both copies of a hot shard to ≲ 1 h. Kafka (72 h) and the WORM archive cover the rest.
  - `audit-archive`: daily, to repo `archive`, **only warm-complete indices**. The archive controller (section 6.5) verifies that each index has finished its force-merge and updates this policy's index list. This avoids storing both the hot form and the merged form of every shard in the long-term repo, which would roughly double its size (≈ +0.7 × 365 × 1.38 TB). `expire_after: 400d`, which is after the Object Lock expiry.
- `delete` waits for `audit-archive` through `wait_for_snapshot`. The controller additionally verifies snapshot `SUCCESS` and the doc count match before the index is added to the list, so no index can be deleted without a verified copy.
- Restored indices (`restored-audit-*`) have their own small ILM policy: delete 14 days after restore, extendable on request.

---

## 6. Integrity ("provably unaltered")

**Principle:** nothing inside Elasticsearch can prove integrity, because Elasticsearch admins can edit or delete data and Basic has no immutable-index feature. Proof therefore lives outside, in write-once storage, and Elasticsearch is verified against it.

### 6.1 Layers

1. **At the source:** TLS client authentication per source. Sources are asked for monotonic sequence numbers where possible, so that gaps are detectable.
2. **Per event:** `event.hash = SHA-256(canonical JSON of the masked event, minus event.hash)`. It is stored in the index and in the archive.
3. **Per block (the chain):** the sealer reads `audit.masked` per partition. For each block (e.g. 60 s or 1M events), it records `{partition, first_offset, last_offset, count, merkle_root(event hashes), prev_block_hash, key_id}`. `block_hash = SHA-256(header)`, and the header embeds the previous block's hash. It is then **signed** (ECDSA P-256 or Ed25519) with a key held in an HSM/KMS.
   - Kafka offsets are contiguous, so deleted or missing events appear as offset gaps, and reordering breaks the chain.
4. **External timestamp:** the head of each partition chain is sent hourly to an **RFC 3161 time-stamping authority**, and the receipts are stored with the blocks. This proves the data existed no later than the stamped time, even against an insider with the signing key.
5. **WORM storage:** block data (NDJSON + zstd) and the signed manifest are written to a bucket with **S3 Object Lock in compliance mode** (retention 400 days; versioning on; the write credential has no delete permission). Even the root account cannot shorten compliance-mode retention. A cross-account or off-site replica is recommended.
6. **Elasticsearch snapshots** go to a separate bucket with versioning and restricted IAM. They are an operational convenience and are not themselves the proof.
   - Elasticsearch needs to rewrite repository metadata (`index-N`, `index.latest`), and its snapshot repository is not designed to sit under Object Lock. The snapshot bucket is therefore protected by IAM and versioning, not by Object Lock. This is why the WORM evidence archive is a separate, independently written store.

### 6.2 Verification

- **Continuous:** a verifier checks every new block's signature and chain link, and alerts on a gap or a mismatch.
- **Daily:** for each index newly in warm, the verifier recomputes `event.hash` from the stored fields and compares per-block counts and Merkle roots with the manifest.
- **At restore:** every restore request runs the same check against the WORM archive and attaches the **verification report** to the evidence package.
- **Quarterly:** an audit re-verifies the full archive without Elasticsearch, using only public keys and TSA receipts.
- Public keys and the TSA certificates are escrowed with the customer's legal department. Key rotation is recorded in the chain itself.

### 6.3 What this does and doesn't prove

It proves that the masked records in the archive were not changed, deleted, inserted or reordered after sealing, and that they existed by the stamped time. It does **not** prove that a source did not send false events, nor does it prove anything about data before the collector.

### 6.4 Access control and its Basic-licence gaps

Basic has native users and RBAC (index privileges), TLS, and API keys. Plan: separate roles (`audit-reader`, `audit-admin`, `restore-operator`) and no one with delete-index rights in day-to-day use. Reader roles are index-level only, since field/document-level security is not in Basic.

### 6.5 Archive controller

Responsibilities: SLM index-list maintenance, snapshot verification, restore orchestration, retention-expiry orchestration, and the daily verification job. It runs as two instances with leader election (or a single systemd unit with a cold standby).

---

## 7. Operations

### 7.1 Failure handling

- Loss of one node: replicas promote, and the cluster is yellow, then green after rebalancing.
- Loss of a zone: data remains available from replicas, and Kafka (RF3 across zones) continues.
- Elasticsearch outage up to 72 h: Kafka absorbs it, and the indexer catches up at 2× rate. At 40k docs/s, a 1-hour outage recovers in about 1 hour.
- Loss of the whole cluster: restore from `hot-safety` (≲ 1 h old) plus replay from Kafka.

### 7.2 Monitoring

Stack Monitoring (Basic) via Metricbeat to a small separate monitoring cluster. Alerts through Kibana rules on Basic connectors (index, server log) plus the customer's own monitoring (email/webhook connectors need a paid tier, so alert from Prometheus/Alertmanager). Key alerts are the Kafka lag on `audit.masked`, quarantine rate, ILM step errors, chain gaps, the masking canary, disk watermarks, and SLM failure.

### 7.3 Upgrades

Rolling upgrades, with one zone at a time.

### 7.4 Restore on request (older than 30 days, within 24 h)

1. Requester gives a time range, reasons and approvals. The controller maps the range to snapshots/indices (≈ 6 h granularity).
2. The controller powers on the 3 restore nodes (a pre-baked image, ≈ 15 min).
3. It restores with `rename_pattern`/`rename_replacement` to `restored-audit-*`, `number_of_replicas: 0`, `index.routing.allocation.include._tier_preference: data_cold`, and raises `max_restore_bytes_per_sec`. The restored indices are **not** added to the data stream.
4. Verification against the WORM archive (6.2) is run, and the report attached.
5. The analyst queries the alias `restored-audit` in Kibana. After 14 days, ILM deletes the indices and the nodes are powered off.

Throughput estimate: 1 day of data is 0.69 TB, and the 3-node tier takes roughly 0.5–1.5 GB/s from object storage. The largest single request, 29 days (20 TB), takes about 4–12 h plus verification, so ≈ 8–14 h in total, inside 24 h. Requests larger than 29 days are done in batches or the restore tier is enlarged. Restore must be rehearsed quarterly.

---

## 8. Risks and conflicts in the inputs

### 8.1 "Use searchable snapshots for the cold/frozen tier": not possible on Basic

Searchable snapshots (the `searchable_snapshot` ILM action, mounted indices, and the cold-with-snapshot and frozen tiers) are an **Enterprise** feature. A Basic licence doesn't allow them; using them would make the cluster non-compliant, and they don't work without the licence. The budget constraint (Basic only) and the suggestion contradict each other, so the budget constraint wins.

Alternatives considered:

| Option | Verdict |
|---|---|
| Enterprise licence | Out of budget; would cut live disk for months 2–12 sharply (frozen with local cache only). Revisit if the budget changes. The design is forward-compatible: replacing the delete step with `searchable_snapshot` and a frozen phase needs no re-architecture. |
| Keep all 12 months online, 1 replica | About 505 TB of live disk: simple but expensive. |
| Keep 12 months online, 0 replicas, rely on snapshots | About 252 TB, but a node loss makes data unavailable and slows recovery. Rejected for evidentiary data. |
| **Snapshots + restore on request (chosen)** | 71 TB live + 280 TB object storage. Meets "within 24 h". |

Trade-off: data older than 30 days is not searchable until restored, so there are no ad-hoc queries over the year, and nothing like a 12-month dashboard. If the customer needs year-long aggregates, precompute daily roll-ups (e.g. counts per action/user pseudonym/day) into a small long-lived index. That's cheap (a few GB).

### 8.2 Masking vs. legal-evidence integrity

Evidence law usually wants the original record. Masking before indexing means that the indexed copy (and any archive of it) is a transformed record. Hashes prove the *masked* record is unaltered; they cannot prove it faithfully reflects the original. Mitigations:

- Record the masking-rule version and `mask.key_id` in each event, and sign the pipeline configuration into the chain (config hash in the block header), so the transformation is itself auditable.
- Option A (cheapest): the masked record is the evidence of record. This requires legal sign-off.
- Option B: also keep an **envelope-encrypted original PII vault** (fields only, key in the HSM with dual control), sealed in the same WORM chain. It enables re-identification by court order, and it re-introduces PII retention that the privacy team must approve. This costs ≈ 10–15 TB.
- Pseudonyms are keyed hashes, so low-entropy values (phone numbers) can be brute-forced by anyone holding the key. Keep the key off the Elastic cluster and restrict it.

### 8.3 Basic-licence feature gaps affecting a legal-evidence system

No Elasticsearch security audit log (who searched what is a paid feature), no field/document-level security, no SAML/OIDC/LDAP realms (paid), no encryption at rest, and no built-in WORM. Compensating controls: a reverse proxy in front of Kibana and Elasticsearch that logs all access and handles SSO (itself shipped into the audit pipeline), index-level RBAC, disk encryption, and the external WORM store. Verify the current feature matrix at elastic.co/subscriptions before signing, since tiers change between releases.

### 8.4 Compression and sizing uncertainty

The 0.7/0.5 ratios are assumptions (section 1 and 3.4). A PoC on one real day of data is mandatory.

### 8.5 Free-text masking is best-effort

Regex cannot guarantee that every username is found; masking quality is bounded by how well the sources are parsed. A masking failure after indexing is not fixable in place: the WORM data cannot be edited, and Elasticsearch would need reindexing. Hence the fail-closed design and canary checks.

### 8.6 Ordering and time

Chains follow Kafka offsets, not event time. Late-arriving events appear in later blocks but keep their own `@timestamp`. Source clocks must be NTP-synchronised, and `event.ingested` records receipt time.

### 8.7 Retention vs. erasure rules

Compliance-mode Object Lock cannot be shortened by anyone, so a 400-day lock on data that privacy law may require deleting earlier is a real conflict. Pseudonymisation (and no stored originals under option A) reduces but may not remove it. Counsel should confirm. Also decide whether 12 months is a floor or ceiling, and whether a litigation hold can extend it (extending retention is possible; shortening it isn't).

### 8.8 Operational risks

- Restore SLA depends on object-store throughput and on the restore nodes starting; rehearse quarterly. The 24 h clock presumably includes human approval, so we set an internal target of 12 h.
- The warm tier is dense (8 TB nodes with 64 GB RAM): searches over the full 30 days are slower than hot, but they stay interactive for time-bounded queries.
- A single object-store site is a single point of failure for everything older than 30 days; replicate the WORM bucket off-site.
- Sustained 20k EPS has no stated peak. If peaks exceed 2×, the Kafka buffer absorbs them (24–72 h), but hot indexing capacity (≈ 60–90k docs/s cluster-wide) is the limit.
- The signing key is a single point of trust: HSM, dual control, documented rotation, and public keys escrowed externally.
- Leap years: 366 days, +0.27%; absorbed by headroom.

---

## 9. Basic-licence feature check

| Used | In Basic? |
|---|---|
| Data tiers (hot/warm/cold roles), ILM, rollover, force-merge, `wait_for_snapshot` | Yes |
| Snapshots to S3-compatible repositories, SLM | Yes |
| Data streams, ingest pipelines | Yes |
| TLS, native RBAC, API keys | Yes |
| Logstash, Beats/Elastic Agent, Kibana, Stack Monitoring | Yes |
| Searchable snapshots, frozen tier | **No (Enterprise)** |
| Field/document-level security, ES audit logging, SAML/OIDC/LDAP | **No**, so compensating controls in 8.3 |

---

## 10. Cost drivers (relative, not priced)

Largest to smallest: object storage (≈ 430 TB), warm SSD (48 TB), hot NVMe (23 TB), Kafka disks (24 TB), compute. Up-front licence cost is zero. Enterprise searchable snapshots are the only change that would reduce the largest line items, and it isn't allowed.

## 11. Next steps

1. Receive a representative day of data (≥ 100 GB) and measure the real compression ratios, field cardinality and the PII locations.
2. Legal/privacy decisions: sections 0 (decisions 2–3), 8.2 and 8.7.
3. Build the pipeline in a lab and run the masking corpus; target 0 leaks in the test set.
4. Tamper tests: modify, delete and reorder events in Elasticsearch and in the archive; verify detection.
5. Restore rehearsal: 20 TB end-to-end timing against the 24 h requirement.
6. Load test at 40k EPS (2×) for 1 hour, then fail one node and one zone.
7. Finalise hardware order based on PoC ratios (section 3.4).
