# Audit-Log Platform on the Elastic Stack: Architecture and Sizing Proposal

Status: proposal for customer review. All sizing is arithmetic on stated assumptions and must be confirmed by the proof of concept in section 10.
Targets Elastic Stack 8.x/9.x on the **Basic (free) license**. Licensing statements are from the published subscription matrix as I know it. Re-check them against the current matrix before contract signature (section 9, R1).

---

## 1. Summary and headline decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | **Do not use searchable snapshots.** Use ordinary snapshots plus restore-on-demand for days 31-365. | Searchable snapshots (cold and frozen tiers) need an **Enterprise** license. Under Basic, the ILM `searchable_snapshot` action is unavailable. The customer's suggestion and the budget constraint conflict (section 9, R1). |
| 2 | Three storage layers: (a) a hot/warm Elasticsearch cluster holding the most recent 31 days, (b) an ES snapshot repository in object storage holding days ~8-365, (c) an independent **WORM evidence archive** (S3 Object Lock, compliance mode) holding signed, hash-chained batches of every event. | (a) meets the interactive SLA. (b) meets the "searchable within 24 h" SLA via restore. (c) is the legal-evidence copy. |
| 3 | **Integrity does not rely on Elasticsearch.** Basic has no immutability, no ES audit log and no document-level security. A superuser can delete anything. Evidence therefore lives in a WORM store, sealed with signed hash chains. ES is the *search copy*, verified against that store. | Section 7. |
| 4 | Masking happens in **Logstash, before anything is indexed or sealed**, using keyed HMAC pseudonyms. A leak check runs before sealing. | Anything sealed in a WORM store can never be removed, so masking errors must be caught before sealing (section 4). |
| 5 | Kafka buffers both stages (raw and masked). | Absorbs ES outages and bursts, and gives each event a stable (topic, partition, offset) identity for gap detection and idempotent indexing. |

Headline numbers (derivations in section 2):

- Raw volume: **1.38 TB/day, 504.6 TB/year** (decimal TB).
- Searchable in ES (31 days, 1 replica): **51.4 TB stored**, 83 TB of provisioned disk across hot and warm.
- Snapshot repository: **~296 TB** at steady state.
- WORM archive: **~84-91 TB**.
- Restore capacity: **40 TB** across 4 nodes. It restores one 31-day window in about 14 h at an assumed 0.5 GB/s.

---

## 2. Capacity arithmetic

### 2.1 Raw volume

Units are decimal (1 TB = 10^12 B) unless marked TiB.

| Quantity | Calculation | Result |
|---|---|---|
| Throughput | 20,000 ev/s x 800 B | 16,000,000 B/s = **16 MB/s** |
| Events per day | 20,000 x 86,400 | **1.728 x 10^9** |
| Raw per day | 1.728e9 x 800 B | **1.3824 TB** (1.257 TiB) |
| Raw per 31 days | 1.3824 x 31 | 42.85 TB |
| Events per year | 1.728e9 x 365 | 6.307 x 10^11 |
| **Raw per year (365 d)** | 1.3824 x 365 | **504.6 TB** (458.9 TiB, ~0.5 PB) |

### 2.2 Compression and expansion assumptions

These are the load-bearing assumptions. All three must be measured in the PoC with real events.

| Assumption | Value | Basis |
|---|---|---|
| **A1. On-disk size of an index vs raw JSON** (primary shards only, `best_compression`, force-merged to 1 segment, full `_source` retained, explicit mappings with `dynamic: false`) | **0.60 x raw** | `_source` compresses roughly 3-4:1 (~0.25-0.30 of raw). Inverted index, doc values and the offset/partition fields add ~0.30-0.35. |
| A2. Replicas | 1 replica in hot and warm, so x2 | Survives loss of any node. |
| A3. Compressed WORM batch files (gzip of NDJSON) | **6:1**, so 0.167 x raw | Typical for repetitive JSON logs. |
| A4. Kafka compression | 3:1 (lz4), replication factor 3 | |
| Disk fill ceiling | Hot <= 70%, warm/restore <= 80% (ES default low watermark is 85%) | Headroom for merges, shrinking and rebalancing after node loss. |

Derived per-day figures:

- Index primary size: 1.3824 x 0.60 = **0.8294 TB/day**
- WORM archive: 1.3824 / 6 = **0.2304 TB/day**

**Sensitivity of A1** (the number most likely to be wrong):

| A1 | Primary/day | ES hot+warm stored (31 d x 2) | Snapshot repo (357 d) |
|---|---|---|---|
| 0.45 | 0.622 TB | 38.6 TB | 222 TB |
| **0.60 (plan)** | **0.829 TB** | **51.4 TB** | **296 TB** |
| 0.80 | 1.106 TB | 68.6 TB | 395 TB |

The node counts below leave about 25-40% spare capacity, so a result up to A1 ~ 0.75 fits without re-buying hardware.

### 2.3 Storage per tier

The ILM `min_age` clock starts at rollover. A "30 day" retention in the cluster therefore means deleting at rollover + 30 d, so the cluster holds up to ~31 days of data. That keeps **every event searchable interactively for at least 30 days**. Sizing uses 31 days.

| Tier | Data age held | Days | Primary (TB) | Replicas | **Stored (TB)** | Fill ceiling | Min. provisioned (TB) | Planned raw disk (TB) |
|---|---|---|---|---|---|---|---|---|
| Hot | 0 to ~8 d (1 d writing + 7 d after rollover) | 8 | 8 x 0.8294 = 6.64 | 1 | **13.27** | 70% | 18.9 | **23.0** (6 x 3.84) |
| Warm | ~8 to 31 d | 23 | 23 x 0.8294 = 19.08 | 1 | **38.16** | 80% | 47.7 | **60** (6 x 10) |
| **ES total, interactive** | 0-31 d | 31 | 25.71 | 1 | **51.43** | | 66.6 | 83 |
| Restore ("cold" role, on demand) | any day 31-365, requested window | up to 31 per request | 25.71 | **0** (snapshot is the second copy) | 25.71 | 80% | 32.1 | **40** (4 x 10) |
| Snapshot repo (object store) | ~8 to ~365 d | 357 | 357 x 0.8294 = 296.1 | n/a (the repo stores one copy) | **296** (provision ~355 with 20% headroom) | | | |
| WORM evidence archive | 0 to 365 d, locked 395 d | 365 / 395 | | n/a | **84.1 / 91.0** | | | |
| Kafka (raw 48 h + masked 72 h) | | | | RF3 | 2.8 + 4.1 = **6.9** | 75% | 9.2 | **12** (3 x 4) |

Notes:

- Snapshots store primaries only, so there is no replica multiplier in the repository.
- Snapshots are taken only after an index has been force-merged (section 6.2). Otherwise each retained snapshot would pin pre-merge segments and roughly double the repo size.
- Fault-tolerance check: hot with one node lost runs at 13.27 / 19.2 = 69%, warm at 38.16 / 50 = 76%. Both are below the 85% watermark.

### 2.4 Comparison with the alternative that avoids restore

| Option | Stored in ES | Provisioned at 75% fill | Verdict |
|---|---|---|---|
| A. Keep all 365 d online in ES, 1 replica | 365 x 0.8294 x 2 = **605.5 TB** | ~807 TB, about 80 nodes of 10 TB | Meets "interactive for everything", which the customer did **not** ask for. Roughly 6x the disk of the proposal. |
| **B. Proposal** | 51.4 TB online + 296 TB snapshots + 91 TB WORM | 83 TB ES disk + 40 TB restore + ~446 TB object store | Cheapest option that meets both SLAs on Basic. |
| C. Enterprise searchable snapshots (frozen) | ~51 TB + cache | not available on Basic | Rejected on license, not technically. |

### 2.5 Restore-time arithmetic (the 24 h SLA)

- One request covering 31 days is 25.71 TB of primary data.
- At an assumed aggregate restore throughput of **0.5 GB/s**, that takes 25.71e12 / 0.5e9 = 51,400 s = **14.3 h**. At 1 GB/s it takes 7.1 h.
- Set `max_restore_bytes_per_sec` and the node recovery limits so the restore tier can sustain this. 4 nodes at ~125 MB/s each is realistic on a 10 GbE network.
- The 24 h clock covers approval, restore, integrity check and handover. The plan is a 14 h restore, 2 h verification, and the rest as queue and approval margin.
- **A full-year request cannot fit in 24 h on the standing tier.** The 335 d outside the cluster is 278 TB, which needs ~3.2 GB/s sustained for 24 h plus ~350 TB of disk. Such a request is served by (a) restoring in 31-day waves while the investigator starts on the first, or (b) a pre-agreed on-demand scale-out of restore nodes. The SLA must therefore be written per request window (proposal: up to 31 days within 24 h). This is an input to confirm with the customer (R7).

---

## 3. Architecture and node layout

```
 sources (apps, OS, DB, network)
        |  Elastic Agent / Filebeat (TLS, per-source sequence where available)
        v
 +---------------------+
 | Kafka  audit.raw    |  48 h, RF3, TLS + encryption at rest     <- may contain unmasked PII (R4)
 +----------+----------+
            v
 +-----------------------------------------+
 | Logstash pipeline A: "mask"             |  HMAC-pseudonymise fields, regex-scrub free text,
 |  (x4 nodes)                             |  drop event.original, leak check
 +------+-----------------------+----------+
        | clean                 | leak detected
        v                       v
 +---------------------+   +-------------------+
 | Kafka audit.masked  |   | Kafka audit.quarantine (7 d, restricted, never sealed)
 | 72 h, RF3           |   +-------------------+
 +----+----------+-----+
      |          |
      v          v
 +---------+   +----------------------------+
 | Sealer  |   | Logstash pipeline B: "index"|
 | (x2)    |   | -> ES data stream           |
 +----+----+   +--------------+-------------+
      v                       v
 S3 Object Lock (WORM)    Elasticsearch  hot(6) -> warm(6) --ILM--> delete after snapshot
 batches + signed                |                                  ^
 manifests + TSA anchors         |  archive snapshots (custom job + SLM)
                                 v
                        S3 snapshot repository  --restore on request--> restore/cold tier (4)
                                 ^
        verifier (nightly): WORM manifests <-> ES <-> snapshot inventory
```

### 3.1 Node layout

| Role | Count | Spec per node | Notes |
|---|---|---|---|
| Dedicated master | 3 | 4 vCPU, 16 GB RAM, 100 GB SSD | One per failure zone. Quorum of 2. |
| **Hot** (`data_hot`, `ingest`) | **6** | 16 vCPU, 64 GB RAM (31 GB heap), 1 x 3.84 TB NVMe | Write index has 6 primaries, one per node, so replica copies spread over the other 5. |
| **Warm** (`data_warm`) | **6** | 16 vCPU, 64 GB RAM, 10 TB SSD | Disk:RAM ~ 160:1. |
| **Restore / cold** (`data_cold`) | **4** | 16 vCPU, 64 GB RAM, 10 TB SSD | Standing but low-load. Holds restored indices only (0 replicas). Scale out for larger requests. |
| Coordinating-only | 2 | 8 vCPU, 32 GB RAM | Behind a load balancer for Kibana and API search traffic. |
| Kibana | 2 | 4 vCPU, 8 GB RAM | Behind a reverse proxy (section 8). |
| Logstash | 4 | 8 vCPU, 16 GB RAM (8 GB heap), local SSD for persistent queue | Both pipelines on the same nodes. The target is >= 10k ev/s per node, to be validated. That gives 40k ev/s total (2x peak headroom) and 30k with one node down. |
| Kafka | 3 | 8 vCPU, 32 GB RAM, 4 TB | Replication factor 3, `min.insync.replicas=2`. 12 partitions on each of `audit.raw` and `audit.masked`. |
| Sealer | 2 | 4 vCPU, 8 GB RAM | Consumer group on `audit.masked`. Signing key is in an HSM or cloud KMS. |
| Verifier / archive-selector / restore tooling | 1 (+1 standby) | 4 vCPU, 8 GB RAM | Cron or systemd timers. |
| Object storage | S3-compatible with Object Lock (AWS S3, MinIO, etc.), versioned | ~446 TB usable plus headroom | Two **separate buckets in separate accounts**: snapshots, and WORM. |

Hot-tier load check: 20k ev/s over 6 primaries is ~3.3k docs/s per node, plus the same again for replicas, so ~6.7k docs/s per node. A 16 vCPU NVMe node typically handles 10-15k docs/s of logs, which leaves headroom for a 2x burst.

Shard count: at `max_primary_shard_size 50gb` with 6 primaries, an index rolls over every ~8.7 h (~300 GB), so ~2.8 indices/day. That is 12 shards per index (6 primaries and 6 replicas), ~33 shards/day and ~1,040 shards at 31 days across 12 nodes. That is roughly 87 shards per node, far below the ~600 shards per 31 GB heap guideline.

---

## 4. Ingest pipeline

### 4.1 Stage by stage

1. **Collection.** Elastic Agent or Filebeat on sources, TLS to Kafka `audit.raw`. Collectors must not drop on back-pressure. Use disk queues on the agents.
2. **Pipeline A, "mask" (Logstash).**
   - Parse into ECS-like fields.
   - **Delete `event.original`**, the field in which agents keep the unmasked line.
   - **Field-level masking** of a maintained inventory of PII fields: `user.name`, `user.email`, `source.user.*`, `destination.user.*`, `client.user.*`, `*.phone`, and so on. Each value is replaced with a keyed pseudonym, `HMAC-SHA256(key, normalise(value))`, truncated to 128 bits (32 hex chars).
     - Normalise first: lower-case e-mails, strip whitespace, convert phone numbers to E.164.
     - Plain unsalted or fixed-salt hashes are **not** acceptable. Phone numbers and usernames are low-entropy and can be brute-forced. The HMAC key must stay secret.
     - The key lives in the Logstash keystore or Vault. The key id is recorded in `audit.mask_key_id`. Rotate rarely, because rotation breaks correlation across the boundary.
   - **Free-text scrub** of `message`, `url.query`, `process.command_line` and similar. Regexes find e-mail addresses and phone numbers and replace each with `<email:hmac>` or `<phone:hmac>`. Known `user=`/`username=`/`--user` key-value patterns are scrubbed too.
   - **Leak check.** After masking, a final pass re-applies the detection regexes to all string fields. Any residual match routes the event to `audit.quarantine`. It is alerted on, never sealed and never indexed. It is fixed by a pattern or inventory update and replayed.
   - Add `audit.kafka.partition`, `audit.kafka.offset` and `audit.mask_key_id`, and strip Logstash-only fields (`@version`, tags).
   - Output the clean event to `audit.masked`.
3. **Sealer (section 7)** consumes `audit.masked`, writes signed batches to WORM, and commits offsets only after the object is durably written.
4. **Pipeline B, "index" (Logstash).** Reads `audit.masked`, writes to the data stream `audit-logs`:
   - `action => "create"` and `document_id => "%{[audit][kafka][partition]}-%{[audit][kafka][offset]}"`.
   - Replays and retries are idempotent. Duplicate creates return 409, which the Logstash ES output ignores.
   - Use an API key bound to the `audit_writer` role.
5. **Elasticsearch ingest pipeline `audit-ingest`** (`index.default_pipeline`) only sets `event.ingested = _ingest.timestamp` from the server clock. Nothing else is rewritten, so `_source` stays equal to the sealed content apart from that field. Masking is *not* done here, because by this point the data has already crossed Kafka, Logstash and the network.

### 4.2 Illustrative masking snippet (Logstash)

This is a sketch, not a tested configuration.

```ruby
filter {
  mutate { remove_field => ["[event][original]", "@version"] }

  # field-level pseudonymisation (HMAC key from keystore)
  ruby {
    init => '
      require "openssl"
      @key = ENV["MASK_KEY"]
      @pii_fields = %w[[user][name] [user][email] [source][user][name] [client][user][email] [user][phone]]
      @email = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
      @phone = /(?<![\w.])\+?\d[\d\s().\-]{7,}\d(?![\w])/
    '
    code => '
      h = lambda { |kind, v| "<#{kind}:" + OpenSSL::HMAC.hexdigest("SHA256", @key, v.to_s.strip.downcase)[0,32] + ">" }
      @pii_fields.each { |f| v = event.get(f); event.set(f, h.call("id", v)) unless v.nil? }
      %w[message url.query process.command_line].each do |f|
        s = event.get(f); next unless s.is_a?(String)
        s = s.gsub(@email) { |m| h.call("email", m) }.gsub(@phone) { |m| h.call("phone", m.gsub(/[^\d+]/, "")) }
        event.set(f, s)
      end
      event.set("[audit][mask_key_id]", ENV["MASK_KEY_ID"])
    '
  }
}
```

Known limits:

- The phone regex can false-positive on long numeric IDs.
- A bare username in free text (for example `C:\Users\jdoe`) cannot be reliably detected by regex. See R5.

### 4.3 Investigator lookup

Because pseudonyms are deterministic, investigators need to find "everything for jdoe". A small authorised internal service computes `HMAC(key, normalise(input))` for them, and every call is logged. Kibana cannot do this.

### 4.4 Index template (data stream `audit-logs`)

```json
PUT _index_template/audit-logs
{
  "index_patterns": ["audit-logs"],
  "data_stream": {},
  "priority": 300,
  "template": {
    "settings": {
      "index.number_of_shards": 6,
      "index.number_of_replicas": 1,
      "index.codec": "best_compression",
      "index.refresh_interval": "30s",
      "index.lifecycle.name": "audit-logs",
      "index.default_pipeline": "audit-ingest",
      "index.mapping.total_fields.limit": 1000
    },
    "mappings": {
      "dynamic": false,
      "properties": {
        "@timestamp": {"type": "date"},
        "event": {"properties": {"ingested": {"type": "date"}, "action": {"type": "keyword"}, "outcome": {"type": "keyword"}}},
        "user": {"properties": {"name": {"type": "keyword"}, "email": {"type": "keyword"}}},
        "message": {"type": "match_only_text"},
        "audit": {"properties": {"kafka": {"properties": {"partition": {"type": "short"}, "offset": {"type": "long"}}}, "mask_key_id": {"type": "keyword"}}}
      }
    }
  }
}
```

- `dynamic: false` keeps unknown fields in `_source`, so no evidence is lost, while preventing mapping explosion.
- `_source` is never excluded or made synthetic.
- LogsDB / synthetic `_source` is deliberately not used. It is licensed above Basic as far as I know (verify), and it does not preserve the original `_source` bytes and key order. That would undermine evidence comparison.

---

## 5. Retention summary

| Age | Where | Searchable | Mechanism |
|---|---|---|---|
| 0 - ~8 d | Hot (NVMe), 1 replica | Interactive | Data stream, rollover |
| ~8 - 31 d | Warm (SSD), 1 replica, force-merged | Interactive | ILM warm phase |
| ~8 - 365 d | Object-store snapshots (and WORM archive) | **Within 24 h of request** | Restore to the restore tier |
| 0 - 365 d | WORM signed archive | Not searchable. Authoritative for evidence and for rebuilds. | Sealer |
| > 365 d (+ margin) | Deleted | No | SLM retention, S3 expiry after lock |

---

## 6. ILM, snapshots and restore

### 6.1 ILM policy `audit-logs`

```json
PUT _ilm/policy/audit-logs
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {"max_primary_shard_size": "50gb", "max_age": "1d"},
          "set_priority": {"priority": 100}
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "forcemerge": {"max_num_segments": 1, "index_codec": "best_compression"},
          "readonly": {},
          "set_priority": {"priority": 50}
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": {
          "wait_for_snapshot": {"policy": "audit-archive"},
          "delete": {}
        }
      }
    }
  }
}
```

- `min_age` counts from rollover. Delete at 30 d means the newest event in the index is 30 d old. So every event stays searchable for at least 30 days, and the cluster holds ~31 days (section 2.3).
- Migration hot to warm is automatic via tier preference (a Basic feature). No `searchable_snapshot` action appears anywhere.
- `wait_for_snapshot` (delete phase) is available on Basic. It blocks deletion until SLM policy `audit-archive` has completed a snapshot after the index entered that phase. **An index cannot be deleted unless it has been archived.**
- Operational gate: a verifier check confirms each index also appears in a *verified* archive snapshot (section 6.2). Alert if any index older than 14 d is not archived.

### 6.2 Snapshot (archive) policy

Plain SLM would snapshot the live write index every day. Each retained snapshot would then pin pre-merge segments for a year and about double the repo. To avoid that:

- A small **archive-selector job** runs daily at 02:30. It asks `_ilm/explain` for backing indices that are in the warm phase, finished force-merge and are not yet archived. It then updates the `audit-archive` SLM policy's `config.indices` to exactly that list.
- SLM runs at 03:00.

```json
PUT _slm/policy/audit-archive
{
  "schedule": "0 0 3 * * ?",
  "name": "<audit-archive-{now/d}>",
  "repository": "audit-archive-repo",
  "config": {"indices": ["<set by selector job>"], "include_global_state": false},
  "retention": {"expire_after": "357d", "min_count": 1, "max_count": 500}
}
```

- Snapshots are taken at an event age of ~8-9 d, so `expire_after: 357d` removes them at an event age of ~365 d.
- The repository is a normal S3 bucket (versioned, write-only IAM for ES plus a separate admin role). **Do not enable Object Lock on the snapshot repository.** ES must delete blobs during snapshot housekeeping, and locked blobs break that. The WORM archive carries the immutability requirement instead.
- Optional `audit-safety` SLM policy: daily full snapshot, 7-day retention, in a separate repository path. It protects the hot/warm data against whole-cluster loss. It costs ~6 TB extra. Without it, whole-cluster loss in the first 8 days is recovered by replaying Kafka/WORM, which at ~60k ev/s takes ~2.7 days for 8 days of data.

### 6.3 Restore runbook (data older than ~31 days)

1. An authorised requester files a ticket with a time range and a reason. A second person approves it (legal hold and chain-of-custody record).
2. The restore job maps the time range to the archive snapshots and indices, using snapshot names and `_snapshot/.../_status`.
3. It restores with these settings:
   ```json
   POST _snapshot/audit-archive-repo/<snap>/_restore
   {
     "indices": "<list>", "include_global_state": false,
     "rename_pattern": "(.+)", "rename_replacement": "restored-$1",
     "index_settings": {
       "index.number_of_replicas": 0,
       "index.routing.allocation.include._tier_preference": "data_cold",
       "index.lifecycle.name": "audit-restored"
     }
   }
   ```
4. The **integrity check** (section 7.4) compares the restored documents with the WORM manifests for that range. The report is attached to the ticket.
5. The analyst gets read access to `restored-*` via a Kibana space.
6. ILM policy `audit-restored` deletes the restored indices after 14 d (extendable).

Restored indices have no replica, but the snapshot remains the authoritative second copy. If a restore node dies mid-investigation, re-run the restore.

---

## 7. Integrity: provably unaltered logs

### 7.1 Threat model and what Basic can and cannot do

| Capability | On Basic? | Consequence |
|---|---|---|
| TLS, native RBAC, API keys, snapshot/restore, ILM, SLM | Yes | Used. |
| Elasticsearch audit log (who searched or deleted what) | **No** (Gold+) | Cannot prove from ES who accessed the data. Compensate with the proxy and Kibana-front logs (section 8). |
| Document/field-level security | **No** (Platinum) | Access control is per index only. |
| SSO (SAML/OIDC/LDAP/AD) | **No** (Gold+) | Native users only (R6). |
| Immutable indices / WORM | Not in any ES tier | Must come from outside. |

Conclusion: **the integrity proof must not depend on Elasticsearch.**

### 7.2 Sealing (the evidence chain)

The sealer reads `audit.masked`, so it seals exactly the stream that is indexed.

- **Batch unit:** one Kafka partition and a contiguous offset range, closed every 60 s or at 256 MB, whichever comes first. Roughly 17,300 objects/day (12 partitions x 1,440 min).
- **Batch object:** gzip NDJSON of the canonicalised events (RFC 8785 JSON canonical form, UTF-8), offsets contiguous and in order.
- **Per-partition hash chain:**
  `chain_n = SHA-256( chain_{n-1} || SHA-256(batch_file_n) || partition || first_offset || last_offset || count )`
  `chain_0` is a signed genesis record.
- **Manifest** per batch, signed with an **asymmetric key held in HSM/KMS** (non-exportable; ECDSA P-256 or Ed25519):
  ```json
  {"topic":"audit.masked","partition":7,"first_offset":9120400,"last_offset":9188123,"count":67724,
   "ts_first":"2026-11-02T10:00:00.003Z","ts_last":"2026-11-02T10:00:59.998Z",
   "batch_sha256":"...","prev_chain":"...","chain":"...","key_id":"seal-2026-1","sig":"..."}
  ```
- **Write order:** write the batch object, then the manifest, then commit the Kafka offsets. A crash causes a re-read and an identical rewrite (deterministic content), never a gap.
- **Daily anchor:** at 00:05 UTC, a **root manifest** lists the chain head of every partition. It is signed and sent for an **RFC 3161 trusted timestamp** from an external TSA. The token is stored in WORM and also emailed or deposited with Legal, so a third party holds an independent record.
- **WORM storage:** all objects go to a bucket with **Object Lock in Compliance mode**, retention 395 d (365 d plus a 30 d margin), versioning on, and a dedicated writer role that has no delete rights. Even the bucket owner cannot shorten the lock. Add a legal-hold flag when a case needs it.
- **Key management:** signing keys are rotated annually, with the old public keys kept permanently in a published key register. Sealing is allowed only from the sealer's workload identity. Use dual control for key administration.

### 7.3 Completeness

- Offsets within a partition must be contiguous. A missing or duplicate offset in the manifests is detectable.
- Per-source gaps (events lost before Kafka) are detectable only if sources provide a sequence number. Add `log.sequence` plus source id at the collector wherever the source allows it.
- Event timestamps come from the sources, so the sealer and the ES ingest timestamp provide independent, NTP-disciplined wall-clock times. Keep both.

### 7.4 Verification

| Check | When | How |
|---|---|---|
| Chain and signature | Nightly, plus on demand | Recompute all chains for the last N days from the WORM objects. Verify signatures against the key register, TSA tokens on daily anchors, and offset continuity. |
| ES vs WORM, counts | Nightly (hot/warm) | For each manifest, count ES docs by `audit.kafka.partition` and offset range. Any mismatch alerts. This catches deletion in ES. |
| ES vs WORM, content | Weekly 1% sample, **100% for any range handed to Legal or a restore** | Canonicalise `_source` and compare with the WORM line. The comparison excludes ES-added `event.ingested`. |
| Snapshot inventory | Daily | Every index older than 14 d must be in a snapshot recorded as verified. |
| Restore integrity | At each restore | Section 6.3, step 4. |

An external auditor needs only the public key register, the WORM bucket (read-only) and the verifier code. They never need trust in the Elasticsearch operators.

### 7.5 What this does and does not prove

- It proves that, from the moment the sealer wrote it, the event has not been altered, removed or reordered within its partition, and that it existed at the time of the TSA anchor.
- It does **not** prove that the source reported truthfully, or that nothing was altered *before* masking and sealing (R3, R4).
- The WORM store holds the masked form. If the evidential standard requires the original unmasked event, see R2.

---

## 8. Security and access (within Basic)

- TLS everywhere (transport and HTTP, Kafka, Logstash, S3). Encryption at rest on all volumes, with SSE-KMS on buckets.
- Roles:
  - `audit_writer` (Logstash API key): `create_doc` on `audit-logs` only. No `index`, `delete`, `delete_index` or `manage`.
  - `audit_reader` (analysts): `read` and `view_index_metadata` on `audit-logs` and `restored-*`.
  - `audit_ops`: ILM/SLM and cluster monitoring, with no data read.
  - Break-glass `superuser`: credentials sealed in a vault, usage requires two-person approval, and any use is itself an incident ticket.
- Because data streams accept only `create` operations on the stream name, ordinary writers cannot update or delete documents. This is a *hygiene* control, not an evidence control (section 7).
- ES audit logging is a paid feature, so access audit comes from a reverse proxy in front of Kibana and the search API. It logs user, URL and body hash to a separate WORM-sealed stream using the same sealer.
- Basic has no LDAP/SAML/OIDC. Options are native users with a strict joiner/leaver procedure, or an authenticating reverse proxy in front of Kibana with service-account access to ES. This is an open item (R6).
- Logstash persistent queues, Kafka `audit.raw` and the DLQ may hold unmasked data. They need encrypted disks and restricted access (R4).

---

## 9. Risks and conflicts in the inputs

| ID | Severity | Issue | Resolution / decision needed |
|---|---|---|---|
| **R1** | **High, direct conflict** | **"Use searchable snapshots for cold/frozen" vs "Basic license only".** Searchable snapshots (fully mounted cold, partially mounted frozen) are an Enterprise feature. On Basic they cannot be used. | Use plain snapshots plus restore-on-demand (sections 2.5 and 6). This works only because the customer accepts a 24 h latency for older data. Moving to Enterprise would shrink the restore tier and cut latency from hours to seconds. The customer must choose. Re-verify the license matrix at contract time. |
| **R2** | **High, requirements tension** | **Masking vs legal evidence.** Masking changes the event irreversibly, so the sealed artefact is not the original. Courts and auditors may want the original. Retaining originals defeats the masking requirement. | Recommended: the evidence is the **masked** event, with deterministic keyed pseudonyms so activity stays correlatable, sealed at the earliest controlled point. Legal must confirm this is admissible. If originals are required, a separately encrypted, tightly controlled vault (escrowed key, dual control) must hold them, which is a policy decision, not a technical default. |
| **R3** | High | **Basic cannot provide tamper evidence by itself.** No immutability, no ES audit log, no DLS. A superuser can delete or rewrite ES data undetectably. | Addressed by design: WORM archive, signed chains, external timestamps, and independent verification (section 7). |
| **R4** | Medium-High | **Unmasked PII exists transiently** in agents' queues, Kafka `audit.raw`, Logstash persistent queues, and any heap dumps or logs. The brief requires masking *before indexing*, which is met, but not "never stored unmasked". | Short retention (48 h), encryption, access restriction. If the customer needs masking at the source or at the collector, that is a different design (agent-side processors), at the cost of weaker central control. |
| **R5** | Medium-High | **Masking is never provably complete.** Usernames in free text cannot be regex-detected. A masking miss gets sealed into an *immutable* store and cannot be deleted. | Field inventory per source, mandatory test corpus, pre-seal leak check with quarantine, periodic scanner sampling over the archive, and SSE-KMS with per-day keys so a leaked day can be crypto-shredded. Residual risk is accepted by the customer in writing. |
| **R6** | Medium | **Basic lacks SSO/LDAP, DLS/FLS and ES audit logging.** | Native users plus a front proxy, index-level RBAC only, proxy-side access logs (section 8). Gaps stated up front. |
| **R7** | Medium | **"Searchable within 24 h" is unscoped.** A full-year request (278 TB outside the cluster) needs ~3.2 GB/s and ~350 TB of disk to restore in 24 h. | SLA defined per request window (31 days in 24 h). Larger windows by waves or on-demand scale-out. Confirm that is acceptable. |
| **R8** | Medium | **"Interactive" is undefined.** | Assumed p95 < 5 s for typical filtered queries over 30 d. Confirm; the PoC will test it. |
| **R9** | Medium | **Privacy law vs retention/immutability.** Keyed pseudonyms are still personal data under GDPR-style regimes. Right-to-erasure collides with a compliance-mode lock. | Legal needs to rule on retention basis. Crypto-shredding (R5) is the only technical path, and it may itself damage evidence. |
| **R10** | Medium | **Retention is stated as 12 months with no maximum or legal-hold rule.** Automatic deletion at 12 months can destroy evidence under a hold. | Confirm min/max. Support legal hold (S3 hold flag, skip SLM expiry for held snapshots). Deletion is otherwise automatic after lock expiry. |
| R11 | Medium | **Compression ratio (A1) is an assumption.** The real value depends on field cardinality and mappings. Error moves ES and snapshot sizes by +-30%. | PoC with a >= 1 TB real sample before purchase (section 10). The table in 2.2 shows sensitivity. |
| R12 | Medium | **Peak rate unknown.** Sizing is for 20k ev/s sustained with 2x burst headroom, the 800 B average hides large events, and 24/7 leaves no maintenance window. | Kafka absorbs up to ~48-72 h of ES downtime. Confirm peak EPS and maximum event size. |
| R13 | Low-Medium | **Single-site design.** CCR (cross-cluster replication) is not on Basic, so there is no ES-level DR. | DR is rebuild from snapshots plus WORM. A second site would need a replicated bucket and standby hardware; RTO would be hours to days. State the RTO the customer requires. |
| R14 | Low | **Operational custom code** (sealer, archive-selector, verifier) is bespoke and itself part of the evidence chain. | Treat as controlled software: code review, signed releases, tests against the manifest spec, independently runnable verifier. |

---

## 10. Proof of concept and open questions

**PoC (before commitment):**

1. Load >= 1 TB of representative masked events. Measure the actual A1 (bytes on disk per raw byte) and update section 2.
2. Run 20k ev/s sustained for 24 h plus 40k ev/s bursts against 6 hot nodes. Record indexing latency and rejections.
3. Time a 31-day restore from the object store to the restore tier. Record real GB/s and compare with the 0.5 GB/s assumption.
4. Run the masking pipeline against a labelled PII corpus and report recall and false-positive rate per field.
5. Run the full tamper drill: delete and modify documents in ES and objects in the snapshot repo, and show that the verifier detects each. Attempt to delete a locked WORM object and show it fails.
6. Measure Logstash EPS per node with HMAC masking enabled.

**Questions for the customer:**

- Is the masked event acceptable as legal evidence, or are originals required (R2)?
- Is a 24 h SLA per 31-day request window acceptable (R7)? What is the largest realistic request?
- What are the peak EPS and the maximum event size?
- Is there a legal-hold process, and what is the maximum retention (R10)?
- What RTO/RPO is required for the platform itself (R13)?
- On-premises or cloud? Is S3 Object Lock (or MinIO) and an HSM/KMS available?
- Is moving to an Enterprise license a real option if section 2.5 and the restore model turn out to be too slow?
