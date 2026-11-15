# Audit-Log Platform on the Elastic Stack — Architecture & Sizing Proposal

Status: **DRAFT for final review (S1 + S2 + S3)**. Sections 5 (ingest pipeline), 6 (integrity) and 7 (risks and open decisions) are complete. All capacity numbers were recomputed by a script (see §8).
Licence target: **Elastic Basic (free) only.**

Notation: `[ASSUMPTION]` = not measured, must be validated before go-live.
`[LICENCE – to verify]` = licence-tier claim, to be verified against the current Elastic subscription matrix for the exact version deployed.

---

## 1. Inputs & named assumptions

### 1.1 Customer inputs (verbatim intent)

| ID | Input |
|----|-------|
| I1 | Sustained ingest 20,000 events/s, average raw event 800 B, 24/7 |
| I2 | Retention 12 months |
| I3 | Last 30 days searchable interactively; older data searchable within 24 h of a request |
| I4 | Logs are legal evidence: must be provably unaltered |
| I5 | Usernames, e-mails, phone numbers masked **before** indexing |
| I6 | Elastic **Basic** licence only |
| I7 | Customer suggestion: searchable snapshots for cold/frozen tier |

### 1.2 Named assumptions

| ID | Assumption | Used where |
|----|------------|------------|
| A1 | Document language is English. | whole document |
| A2 | Decimal units: 1 KB = 10^3 B, 1 MB = 10^6 B, 1 GB = 10^9 B, 1 TB = 10^12 B. 1 year = 365 days; "12 months" = 365 days. | §2 |
| A3 | Indexed-on-disk size / raw size ratio `r` (one primary copy, `index.codec: best_compression`, lean explicit mapping, no `_source` disabling, includes the extra hash fields added by the pipeline): **low 0.4 / expected 0.6 / high 1.0**. `[ASSUMPTION]` — must be benchmarked on a real sample (≥ 1 day) before hardware is ordered. Sizing uses **expected**; low/high shown for range. | §2, §3 |
| A4 | Ingest rate is flat (20,000 eps is both average and design rate). Peak factor unknown → see Open decision OD5. `[ASSUMPTION]` | §2, §3 |
| A5 | Growth buffer `G = 1.2` (+20 % volume over the contract year). `[ASSUMPTION]` | §2 |
| A6 | Disk fill target = 85 % (= Elasticsearch default *low* disk watermark; high = 90 %, flood-stage = 95 %). Usable fraction `WM = 0.85`. | §2 |
| A7 | ILM ages are measured from rollover. With daily rollover an index sits up to 1 day as write index before its 30-day clock starts, so it resides **31 days** on hot; the cold phase then holds it for **335 days** (31 + 335 = 366 days total residency). | §2, §4 |
| A8 | Snapshot repository overhead factor `S = 1.1` (+10 % for segments captured before force-merge, metadata, and overlap of snapshot retention). `[ASSUMPTION]` | §2.5 |
| A9 | Aggregate restore throughput from the snapshot repository `R`: **200 / 500 / 1,000 MB/s** (pessimistic / expected / optimistic). Depends on repository backend, network, `indices.recovery.max_bytes_per_sec`, and number of receiving nodes. `[ASSUMPTION]` — no benchmark exists; measure during PoC. | §4.4 |

---

## 2. Capacity arithmetic

### 2.1 Raw volume

```
Ingest rate  = 20,000 events/s × 800 B          = 16,000,000 B/s   = 16 MB/s
Daily raw    = 16 MB/s × 86,400 s/day           = 1,382,400 MB     = 1.3824 TB/day
Yearly raw   = 1.3824 TB/day × 365 days         = 504.576 TB/year
```

### 2.2 Indexed (primary) volume per day — compression assumption A3

```
Daily primary = 1.3824 TB × r
  low      (r = 0.4) = 0.55296 TB/day  =   552.96 GB/day
  expected (r = 0.6) = 0.82944 TB/day  =   829.44 GB/day
  high     (r = 1.0) = 1.3824  TB/day  = 1,382.40 GB/day
```

### 2.3 Hot tier (31 days resident, 1 primary + 1 replica = 2 copies)

```
Hot raw          = 31 days × 1.3824 TB                 = 42.8544 TB
Hot primary      = 42.8544 TB × r
Hot with replica = Hot primary × 2
Hot provisioned  = Hot with replica × G / WM = × 1.2 / 0.85
```

| Case | Hot primary | × 2 copies | × 1.2 / 0.85 = provisioned |
|------|------------:|-----------:|---------------------------:|
| low (0.4)      | 17.14176 TB | 34.28352 TB | 48.400 TB |
| **expected (0.6)** | **25.71264 TB** | **51.42528 TB** | **72.600 TB** |
| high (1.0)     | 42.85440 TB | 85.70880 TB | 121.001 TB |

Why 1 replica on hot: the hot tier is the only copy of data that has not yet been snapshotted (up to ~24 h, see §4.3) and must stay interactively searchable through a node loss.

### 2.4 Cold tier (335 days resident, replicas = 0)

```
Cold raw          = 335 days × 1.3824 TB               = 463.104 TB
Cold primary      = 463.104 TB × r
Cold provisioned  = Cold primary × replicas_factor × 1.2 / 0.85
```

| Case | Cold primary | replicas = 0 → provisioned | (alt.) replicas = 1 → provisioned |
|------|-------------:|---------------------------:|----------------------------------:|
| low (0.4)      | 185.2416 TB | 261.518 TB | 523.035 TB |
| **expected (0.6)** | **277.8624 TB** | **392.276 TB** | 784.553 TB |
| high (1.0)     | 463.1040 TB | 653.794 TB | 1,307.588 TB |

**Replica decision for cold: 0 replicas (recommended).**
- Every cold index is already in the snapshot repository (force-merged and snapshotted while still on hot, §4) — the snapshot is the redundancy layer, not a replica.
- Requirement I3 for data older than 30 days is "searchable within 24 h", not "always available". Losing a cold node turns its shards red; they are restored from snapshot in ≈ 9 h (expected case, §4.4), which is inside the 24 h window.
- 1 replica would double cold disk (392.276 → 784.553 TB provisioned, expected) for an availability level the requirement does not ask for.
- Consequence: the snapshot repository becomes a **hard dependency for durability**; it must be on separate, durable storage (see §2.5 and §6.4).

### 2.5 Snapshot repository

Daily SLM snapshots with 30-day snapshot retention; an index is deleted from the cluster after 366 days of residency (A7), and the last snapshot referencing it expires 30 days later. Repository holds primaries only (no replicas).

```
Repository window = 366 + 30                       = 396 days
Repository raw    = 396 days × 1.3824 TB           = 547.4304 TB
Repository size   = 547.4304 TB × r × S (1.1)
  low      (0.4) = 240.869 TB
  expected (0.6) = 361.304 TB
  high     (1.0) = 602.173 TB
```

The repository is external to Elasticsearch (S3-compatible object store or shared filesystem). Its immutability (Object Lock) is part of the integrity design in §6.4.

### 2.6 Summary (expected case)

| Item | Value |
|------|------:|
| Raw ingest | 16 MB/s · 1.3824 TB/day · 504.576 TB/year |
| Hot data (2 copies) | 51.42528 TB |
| Hot provisioned (G, WM) | 72.600 TB |
| Cold data (0 replicas) | 277.8624 TB |
| Cold provisioned (G, WM) | 392.276 TB |
| **Cluster provisioned total** | **464.877 TB** (72.600 + 392.276 = 464.876 from rounded parts; 464.877 from unrounded values, script output) |
| Snapshot repository | 361.304 TB |

---

## 3. Node layout

### 3.1 Shard sizing

```
Primaries per daily index P = 24
Expected per-shard size     = 829.44 GB/day / 24 = 34.56 GB   (target 10–50 GB ✔)
Low                         = 552.96 GB / 24     = 23.04 GB   ✔
High                        = 1,382.40 GB / 24   = 57.60 GB   → rollover on max_primary_shard_size = 50 GB fires first (~1.15 indices/day) ✔
```

P = 24 = 2 × hot node count, so each hot node carries 2 primaries + 2 replicas of the write index → even indexing load.

```
Hot shards  = 31 days × 24 primaries × 2 copies = 1,488   → 1,488 / 12 nodes = 124 per node
Cold shards = 335 days × 24 primaries × 1 copy  = 8,040   → 8,040 / 17 nodes ≈ 473 per node
Cluster total                                   = 9,528 shards
```
Both below the default `cluster.max_shards_per_node` = 1,000. No shrink on cold (shrinking 24 → 12 would give 69.12 GB shards, above the 50 GB target).

### 3.2 Node table (expected case)

| Role | Count | vCPU | RAM | JVM heap | Disk per node | Disk:RAM | Derivation |
|------|------:|-----:|----:|---------:|--------------|---------:|-----------|
| Dedicated master (`master`) | 3 | 4 | 16 GB | 8 GB | 100 GB SSD | — | quorum of 3; ~9.5k shards cluster state |
| Hot + ingest (`data_hot`, `data_content`, `ingest`) | **12** | 16 | 64 GB | 30 GB | 6.4 TB NVMe usable | 100:1 | ⌈72.600 / 6.4⌉ = ⌈11.34⌉ = 12 |
| Cold (`data_cold`) | **17** | 8 | 64 GB | 30 GB | 24 TB HDD/SATA usable | 375:1 | ⌈392.276 / 24⌉ = ⌈16.34⌉ = 17 |
| Kibana | 2 | 4 | 8 GB | — | 50 GB | — | HA behind a load balancer |
| Logstash | 4 | 8 | 16 GB | 8 GB | 250 GB SSD (persistent queue) | — | 3 for load + 1 for N+1 (§3.4) |
| **Total** | **38** | | | | | | |

Heap is capped at 30 GB (below the compressed-oops threshold); the rest of RAM is filesystem cache. Disk:RAM ratios (100:1 hot, 375:1 cold) are `[ASSUMPTION]` for a low-query-rate audit workload and must be validated in the PoC with representative search queries.

Range (same node shapes):

| Case | Hot nodes | Cold nodes |
|------|----------:|-----------:|
| low (0.4)  | ⌈48.400 / 6.4⌉ = 8   | ⌈261.518 / 24⌉ = 11 |
| expected (0.6) | 12 | 17 |
| high (1.0) | ⌈121.001 / 6.4⌉ = 19 | ⌈653.794 / 24⌉ = 28 |

### 3.3 Failure tolerance checks

- **Hot, N-1:** data at end of year with growth = 51.42528 × 1.2 = 61.710 TB; on 11 nodes = 5.610 TB/node = 87.7 % of 6.4 TB → above low watermark (85 %) but below high watermark (90 %), so replicas re-allocate and the cluster stays green. Without growth: 51.42528 / 11 = 4.675 TB/node = 73.0 %.
- **Cold, node loss:** expected data per cold node = 277.8624 / 17 = 16.345 TB; restore from snapshot at R = 500 MB/s → 16.345 × 10^12 / (500 × 10^6) = 32,690 s ≈ 9.08 h `[ASSUMPTION A9]`. This sets the upper bound on cold node density: data per node must restore within half the 24 h SLA (≤ 21.6 TB at 500 MB/s).

### 3.4 Ingest throughput

- Elasticsearch indexing load = 20,000 docs/s × 2 copies = 40,000 docs/s ÷ 12 hot nodes ≈ 3,333 docs/s per node `[ASSUMPTION: well within single-node capacity; verify with Rally/PoC]`.
- Logstash: masking/hashing (S2) is CPU-bound; assumed ~8,000 eps per 8-vCPU instance `[ASSUMPTION]` → ⌈20,000 / 8,000⌉ = 3 instances + 1 spare = 4.
- Persistent queue sized for a 4 h Elasticsearch outage: 16 MB/s × 14,400 s = 230.4 GB raw × 1.5 serialization overhead `[ASSUMPTION]` = 345.6 GB ÷ 4 instances = 86.4 GB/instance (115.2 GB if one instance is down) → 250 GB SSD per instance.

### 3.5 Topology notes

- Two failure domains (racks/zones) with shard allocation awareness; a third domain for the third master (tie-breaker) if available.
- Separate small monitoring cluster (Stack Monitoring, Basic `[LICENCE – to verify]`) so that monitoring survives production cluster incidents.
- No secrets, real hostnames or IPs appear in this document; all credentials live in the Elasticsearch/Logstash keystores or an external secret store.

---

## 4. Index lifecycle (ILM), snapshots (SLM) and the 24 h search SLA

### 4.1 Index template (essentials)

```json
{
  "index_patterns": ["audit-*"],
  "data_stream": {},
  "template": {
    "settings": {
      "number_of_shards": 24,
      "number_of_replicas": 1,
      "index.codec": "best_compression",
      "index.lifecycle.name": "audit-ilm",
      "index.routing.allocation.include._tier_preference": "data_hot"
    }
  }
}
```

### 4.2 ILM policy `audit-ilm`

```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": { "max_primary_shard_size": "50gb", "max_age": "1d" },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 100 }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "allocate": { "number_of_replicas": 0 },
          "readonly": {},
          "set_priority": { "priority": 0 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "wait_for_snapshot": { "policy": "audit-daily" },
          "delete": {}
        }
      }
    }
  }
}
```

- The cold phase uses the implicit `migrate` action to `data_cold` nodes. **No `searchable_snapshot` action** — it requires Enterprise (§6, R1).
- Force-merge runs on hot right after rollover, *before* the first snapshot of the rolled-over index, so the snapshot captures the final segments once and cold/snapshot files are never rewritten.
- `readonly` sets a write block. It is an operational guard, **not** an integrity proof (an admin can remove it) — see §6.
- `wait_for_snapshot` prevents deletion of an index that is not in the repository.
- Basic availability of ILM, SLM, data tiers (`data_hot`/`data_cold`), `wait_for_snapshot`: `[LICENCE – to verify]` (believed Basic).

### 4.3 SLM policy `audit-daily`

```json
{
  "schedule": "0 30 1 * * ?",
  "name": "<audit-daily-{now/d}>",
  "repository": "audit-repo",
  "config": { "indices": ["audit-*"], "include_global_state": false },
  "retention": { "expire_after": "30d", "min_count": 7, "max_count": 60 }
}
```

- Daily at 01:30 UTC; snapshots are incremental, so each day uploads only new segments (≈ 1 day of primaries, 829.44 GB expected).
- RPO for not-yet-snapshotted data ≈ 24 h, covered by the hot replica. A higher SLM frequency (e.g. every 4 h) can shorten it at the cost of more repository overhead (A8).
- Cluster/security configuration is snapshotted separately (`include_global_state: true`, weekly) — the config snapshot goes to the same protected repository (§6.4).

### 4.4 Meeting "older data searchable within 24 h": options compared

**Restore time estimate** (`t = data / R`, expected r = 0.6, `[ASSUMPTION A9]` — no benchmark exists):

| Scope | Data (primaries) | R = 200 MB/s | R = 500 MB/s | R = 1,000 MB/s |
|-------|-----------------:|-------------:|-------------:|---------------:|
| 1 day   | 829.44 GB (0.82944 TB) | 4,147.2 s ≈ 69.1 min | 1,658.88 s ≈ 27.6 min | 829.44 s ≈ 13.8 min |
| 1 month (30 d) | 24.8832 TB | 124,416 s ≈ 34.56 h ✗ | 49,766.4 s ≈ 13.82 h | 24,883.2 s ≈ 6.91 h |
| 1 month, high r = 1.0 | 41.472 TB | 207,360 s ≈ 57.6 h ✗ | 82,944 s ≈ 23.04 h (borderline) | 41,472 s ≈ 11.52 h |

Restore time excludes request triage and query execution; restored indices land with 0 replicas.

| | **Option A — keep indices on cold nodes (recommended)** | **Option B — delete after 30 d, restore from snapshot on request** |
|---|---|---|
| Searchability of 31–365 d data | Always online (slower disks); SLA met in minutes | Only after restore; SLA depends on request scope and `R` |
| Cluster disk (expected) | 392.276 TB cold provisioned, 17 nodes | Restore landing zone, e.g. 30 d: 24.8832 × 1.2 / 0.85 = 35.129 TB → 2 cold nodes |
| SLA risk | Low; on node loss, ≈ 9.08 h restore (§3.3) | 1 month restore 13.82 h (expected) but 34.56 h at 200 MB/s; any request > ~1 month fails the SLA |
| Snapshot role | DR copy | **Only** copy of 31–365 d data; repository retention must be ≥ 365 d |
| Ops effort | ILM only | Manual/scripted restore runbook, landing-zone capacity management |
| Licence | Basic `[LICENCE – to verify]` | Basic `[LICENCE – to verify]` |

**Recommendation: Option A.** It meets the 24 h SLA deterministically for any request scope, keeps all data under one ILM policy, and the restore path (≈ 9 h per lost node) is used only for disaster recovery. Option B saves ~15 cold nodes but makes the SLA dependent on an unbenchmarked restore throughput and on how much history a legal request covers; keep it as a documented fallback if the customer rejects the cold-node cost (OD1). A hybrid (e.g. 6 months on cold + restore for the rest) is possible but inherits Option B's SLA risk for the oldest data.

---

## 5. Ingest pipeline & masking

### 5.1 Flow and sensitivity labels

```
Sources (label)                 Logstash (4 nodes, PQ)                         Elasticsearch
Elastic Agent / Beats  ──TLS──▶ [1 canonicalize] ─▶ [2 hmac_original] ─▶ [3 mask] ─▶ [4 hash_masked] ─▶ data stream audit-*
 (RAW: contains PII)             in memory only; unmasked data never leaves this process        (MASKED only)
                                      │ failure at any step
                                      ▼
                               DLQ / error index `audit-errors` — written from the MASKED-or-dropped copy (§5.5)
```

| Hop | Data label | Note |
|-----|-----------|------|
| Agent/Beats → Logstash | **RAW (PII)** | TLS required; Logstash is the only place raw data is processed. Host disk holds raw data only in the persistent queue (PQ, §3.4). |
| Logstash PQ (disk) | **RAW (PII)** | PQ is **before** masking, so it holds unmasked events for up to ~4 h of outage. Mitigation: encrypted volume (OS/LUKS level, outside Elastic), restricted OS access, PQ is transient. Putting the PQ after masking would need two Logstash tiers (mask tier → PQ tier); recommended only if the customer treats the PQ as in-scope of I5 (OD7). |
| Logstash → Elasticsearch | MASKED | No raw field is present; a final `prune`/whitelist step (5.3, step 3e) drops anything not in the schema. |
| DLQ / error index | MASKED or dropped | 5.5. |

Choice: **Logstash**, not ingest-node pipelines — the keyed HMAC needs a secret store (Logstash keystore) and a keyed `fingerprint`, and masking must happen **before** the data reaches the Elasticsearch process at all (I5). An ingest-node variant exists (`gsub`, `script`, `fingerprint` processors) but then raw data reaches the ES nodes' memory and the keyed HMAC secret must live in the ES keystore; not recommended.

### 5.2 Canonical form (exact rules)

Both hashes depend on a byte-exact canonical serialisation, so it is defined once and implemented identically in the pipeline and in the auditor's verifier (§6):

1. Encoding UTF-8, Unicode NFC; timestamp `@timestamp` normalised to UTC ISO-8601 with milliseconds and `Z`.
2. `user.name`: trimmed and lower-cased (so the same user always yields the same pseudonym).
3. Serialisation = JSON, object keys **sorted lexicographically at every level**, no whitespace (`separators , :`), non-ASCII not escaped, arrays keep order.
4. Excluded from both hashes: `@metadata.*`, `event.ingested`, `event.hash_masked` (itself), `tags` added by the pipeline.
5. `event.hmac_original` = `HMAC-SHA256(HMAC_KEY, canonical(original event after rule 2))`, hex-encoded. Computed **before** masking.
6. `event.hash_masked` = `SHA-256(canonical(masked event incl. event.hmac_original, excl. event.hash_masked))`, hex-encoded. Computed **after** masking. Anyone can recompute it from the indexed `_source` without a key.

Why two fields (plan D2/D3): `hash_masked` is the primary evidence anchor (§6 leaf), verifiable by a court expert without any secret. `hmac_original` binds the masked record to the unmasked original so that, if the original is ever produced (OD3), it can be proven to match — by the key custodian only. It is **keyed** because phone numbers and usernames are low-entropy: a plain SHA-256 of the original could be reversed by dictionary and would defeat masking.

### 5.3 Masking rules

| Field | Rule | Example (fake) |
|-------|------|----------------|
| `user.name` | Pseudonymise: `"u_" + hex(HMAC-SHA256(PSEUDO_KEY, name))[0:16]`. Deterministic → events of one user stay correlatable. Separate key from `HMAC_KEY` (key separation). | `Alice.Example` → `u_f9c0a55b21836c9a` |
| `user.email` | Keep first character and the domain: `a***@example.org` | `alice.example@example.org` → `a***@example.org` |
| `user.phone` | Keep last 2 digits, mask the rest (`*`), separators dropped | `+84 912 345 678` → `*********78` |
| `message` (free text) | Same e-mail and phone regexes applied; the original user name is replaced by its pseudonym | see 5.7 |
| any other field | Allow-list: only fields declared in the mapping survive (step 3e) | — |

Residual risk: regex masking of free text is best-effort — unknown formats (e.g. names in free text, phone numbers split by unusual separators) can leak. Mitigation: free-text fields should be minimised at the source, plus a periodic PII scan of a sample of indexed data (QA) `[ASSUMPTION]`. A 16-hex-digit (64-bit) pseudonym truncation is adequate against collisions at this scale but `[ASSUMPTION]`; security review (S3): acceptable for correlation, but the pseudonym stays personal data (pseudonymised, not anonymous) and `PSEUDO_KEY` must be protected like `HMAC_KEY`.

### 5.4 Logstash pipeline (sample, fake data, no secrets)

Secrets are referenced from the Logstash keystore (`bin/logstash-keystore add HMAC_KEY PSEUDO_KEY`) and appear only as `${HMAC_KEY}` / `${PSEUDO_KEY}`. Not executed in this environment (no Logstash available) — logic is mirrored by the reference script whose output is in 5.7. `[ASSUMPTION — validate in PoC with the pinned Logstash version]`

```ruby
input  { beats { port => 5044  ssl_enabled => true
                 ssl_certificate => "/etc/logstash/tls/ls.crt"  ssl_key => "/etc/logstash/tls/ls.key" } }

filter {
  ruby {                                   # steps 1-4; one ruby filter keeps raw data in-process
    init => '
      require "json"; require "openssl"; require "digest"
      @hk = ENV["HMAC_KEY"]; @pk = ENV["PSEUDO_KEY"]          # populated from ${...} below
      def canon(o)
        case o
        when Hash  then "{" + o.keys.sort.map { |k| k.to_s.to_json + ":" + canon(o[k]) }.join(",") + "}"
        when Array then "[" + o.map { |v| canon(v) }.join(",") + "]"
        else o.to_json end
      end
    '
    code => '
      h = event.to_hash.reject { |k,_| k == "@metadata" || k == "@version" }
      (h["event"] ||= {}).delete("ingested"); h["event"].delete("hash_masked")
      h["user"]["name"] = h["user"]["name"].to_s.strip.downcase.unicode_normalize(:nfc)   # (1)
      h["event"]["hmac_original"] = OpenSSL::HMAC.hexdigest("SHA256", @hk, canon(h))      # (2)
      raw = h["user"]["name"]
      pseudo = "u_" + OpenSSL::HMAC.hexdigest("SHA256", @pk, raw)[0,16]                   # (3)
      mail  = ->(s){ s.gsub(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/, "\\1***@\\2") }
      phone = ->(s){ s.gsub(/(?<![\w.])\+?\d(?:[ -]?\d){7,14}(?![\w.])/) { |m| d = m.gsub(/\D/,""); "*"*(d.size-2) + d[-2,2] } }
      h["user"]["name"]  = pseudo
      h["user"]["email"] = mail.(h["user"]["email"].to_s)
      h["user"]["phone"] = phone.(h["user"]["phone"].to_s)
      h["message"] = phone.(mail.(h["message"].to_s)).gsub(Regexp.new(Regexp.escape(raw), Regexp::IGNORECASE), pseudo)
      masked_hash = Digest::SHA256.hexdigest(canon(h))                                    # (4)
      h["event"]["hash_masked"] = masked_hash
      event.set("[@metadata][masked]", h)
    '
  }
  # (3e) replace the whole event by the masked, allow-listed copy; raw fields no longer exist
  ruby { code => 'm = event.get("[@metadata][masked]"); event.to_hash.keys.each { |k| event.remove(k) unless k.start_with?("@") }
                  m.each { |k,v| event.set(k, v) }' }
  mutate { remove_field => ["[@metadata][masked]", "[agent]", "[host][ip]"] }  # example drops; real allow-list per mapping
}

output {
  elasticsearch {
    hosts => ["https://es-hot.example.internal:9200"]  data_stream => true
    data_stream_type => "logs"  data_stream_dataset => "audit"  data_stream_namespace => "prod"
    user => "${ES_WRITER_USER}"  password => "${ES_WRITER_PASS}"  ssl_certificate_authorities => ["/etc/logstash/tls/ca.crt"]
    action => "create"                                    # idempotent: a replayed event with the same _id is rejected, not duplicated
    document_id => "%{[event][hash_masked]}"
  }
  # optional (default OFF), see 5.6:  if [@metadata][archive_originals] { ... }
}
```

Notes:
- `action => "create"` with `document_id = event.hash_masked` makes re-delivery (PQ replay, agent retry) idempotent: a duplicate returns 409 and is counted, not indexed twice. Caveat: two genuinely identical events at the same millisecond collapse into one; include a source sequence number/`event.id` in the event if this matters to the customer `[ASSUMPTION]`.
- `ruby` filter cost is the CPU bottleneck assumed in §3.4 (≈ 8,000 eps per 8-vCPU node, `[ASSUMPTION]` — benchmark; two HMACs + SHA-256 + regex per event).
- Persistent queue: `queue.type: persisted`, `queue.max_bytes: 200gb` per node (inside the 250 GB disk in §3.2), PQ volume encrypted at OS level.
- Keystore on every Logstash node; keys generated by the key custodian, never stored in the repository, rotated by versioning the key (`event.hmac_key_id` can be added; old events keep verifying with the old key held by the custodian).

### 5.5 Error handling (dead-letter path)

1. **Parse/mask failure** (invalid JSON, missing `user`, ruby exception): the ruby filter is wrapped with `tag_on_exception`/`rescue`, the event gets tag `_mask_failed`. A conditional route sends it to index `audit-errors` containing **only**: timestamp, pipeline step, error class, source id/offset, and a `reason` — **the raw `message` and user fields are dropped**, never copied into the error record. Raw payload stays in the source (Agent/Beats registry, source file) for replay after the fix.
2. **Elasticsearch rejects the masked doc** (mapping conflict, 400/409): Logstash DLQ (`dead_letter_queue.enable: true`) stores the already-masked event; this is safe because masking precedes output. Retention: ≤ 30 days `[ASSUMPTION]`, with alert on DLQ growth; 409 duplicates from 5.4 are filtered from DLQ (expected, counted only).
3. **ES unavailable**: back-pressure into the PQ (4 h, §3.4); Agent/Beats retry beyond that.
4. Reconciliation: daily count of `events received (Logstash stats) = indexed + duplicates(409) + error records` per source; mismatch raises an alert. Lineage: `event.hmac_original`/`hash_masked`, plus `agent.id` and the source offset (kept) identify each record to its source.

### 5.6 Optional encrypted archive of originals (default OFF)

Config flag `archive_originals: false` (pipeline env/`@metadata` switch). When enabled by the customer/legal decision (OD3), the **raw canonical event** is encrypted in the same ruby step with an envelope scheme (per-batch data key, wrapped by a public key whose private key is held by legal/custodian offline) and written to external object storage with Object Lock — never to Elasticsearch, never to the DLQ. Consequences if ON: that store becomes a PII store in scope of data-protection duties (retention, access, deletion rights) and doubles the integrity surface; if OFF, only `hmac_original` remains and originals cannot be reproduced from the platform. Recommendation is in §6 / OD3.

### 5.7 Verified sample (fake data, fake keys)

The reference implementation `scratchpad/pipeline_ref.py` (same rules as 5.2–5.3, Python) was run on a fake event with fake demo keys (not real secrets). Input → output:

```
IN : user.name=" Alice.Example ", email=alice.example@example.org, phone="+84 912 345 678",
     message="login by Alice.Example from 192.0.2.10, contact alice.example@example.org or +84 912 345 678"
OUT: user.name=u_f9c0a55b21836c9a  email=a***@example.org  phone=*********78
     message="login by u_f9c0a55b21836c9a from 192.0.2.10, contact a***@example.org or *********78"
     event.hmac_original=a00b2d44777c156a897367e5dbbdc939a64bda9b5d9a93b9b0774cb549758437   (fake key)
     event.hash_masked  =eb358019a5b9b9836c089e0609a10bd649617ebf7d26db2d19cc15de01e1233f
```
An independent verifier recomputed `hash_masked` from the output without any key (`verify hash_masked OK`). The IP address `192.0.2.10` is correctly not treated as a phone number.

### 5.8 Licence mapping `[LICENCE – to verify]`

All items are `assumption / to be verified against the current Elastic subscription matrix` for the deployed version.

| Component | Used for | Licence (assumed) |
|-----------|----------|-------------------|
| Elastic Agent / Beats | collection | Free (Elastic License 2.0 / open source) |
| Logstash core, `beats` input, `ruby`, `mutate`, `fingerprint` (keyed HMAC alternative), DLQ, persistent queue, keystore | pipeline | Free / Basic |
| Elasticsearch output plugin, data streams, ILM | indexing | Basic |
| Ingest `gsub`/`script`/`fingerprint` processors (alternative path, not recommended) | masking in ES | Basic |
| TLS for transport/HTTP, RBAC, API keys | secure transport/auth | Basic (since 6.8/7.1) |
| Logstash keystore | secrets | Free; an external secret manager (outside Elastic) is an alternative |
| OS-level volume encryption, Object Lock storage, signing/HSM | PQ encryption, §5.6, §6 | **Outside Elastic** (customer budget, OD4) |

Not available on Basic and **not relied on**: searchable snapshots, field/document-level security, ES audit logging (R1, R4).

---

## 6. Integrity (legal evidence)

Goal (I4): a third party must be able to prove that the audit records of a period are **complete and unaltered**, even if an Elasticsearch administrator is hostile. Elasticsearch itself offers no WORM guarantee (R3), so the proof is built **outside** the cluster; Elasticsearch only stores the records and the per-event hash. Components outside Elastic are marked **[EXT]**.

### 6.1 Threat model and what each layer proves

| Threat | Detected / prevented by |
|--------|-------------------------|
| Edit of an indexed event | Recomputed `hash_masked` ≠ stored value (§5.2); and Merkle root of its batch ≠ signed root |
| Deletion or insertion of events in a sealed batch | Batch `count` and root differ from the signed batch header |
| Deletion/reordering of a whole batch | Hash chain (`prev` link) breaks; gap visible in the signed series |
| Rewrite of the digest store | Digests are in WORM storage **[EXT]** (Object Lock, compliance mode) and/or RFC 3161 timestamped **[EXT]**; signature needs the signing key, which ES admins do not hold |
| Backdating (digest created later than claimed) | RFC 3161 timestamp token from a trusted TSA **[EXT]** `[ASSUMPTION — TSA choice is a customer decision]` |
| Forged events **before** sealing (inside the ≤ 1 h + grace window), or from a compromised Logstash host | **Not** detected by hashing: `hash_masked` is unkeyed. Limited by: only the Logstash writer role can write (6.5), Logstash host hardening, short sealing window, reconciliation counts (§5.5). Residual risk, stated in R12 |

### 6.2 Batches, Merkle tree and chain

1. **Batch** = all events of one data stream whose `event.ingested` falls in one UTC hour (ingest time, not event time, so late-arriving events land in a *later* batch instead of changing a sealed one). A batch is **sealed** at hour end + 15 min grace `[ASSUMPTION]`. Rate check: 20,000 eps × 3,600 s = 72,000,000 leaves per hour (same input as §2.1).
2. **Leaf** = `SHA-256(0x00 ‖ bytes(hash_masked))` (the 32-byte value of the hex field). Leaves are sorted by `hash_masked` (ascending), so the tree is deterministic and independent of read order.
3. **Inner node** = `SHA-256(0x01 ‖ left ‖ right)`; an odd node at a level is promoted unchanged (not duplicated). Domain separation prefixes (0x00/0x01) prevent leaf/node confusion.
4. **Batch header** (canonical JSON, sorted keys, no whitespace): `{stream, hour, count, root, prev}`. `prev` = `chain_digest` of the previous batch of the same stream (all-zero for the first). `chain_digest = SHA-256(header bytes)`.
5. **Signature**: the sealing service signs the header with an asymmetric key (Ed25519 assumed; any algorithm accepted by the customer's PKI) held in an HSM / smart card **[EXT]** by a role that is not an Elasticsearch administrator. The public key (and its fingerprint) is published to the WORM bucket and in the evidence handbook; key rotation = new `key_id` in the header, old public keys retained.
6. **Publication**: header + signature are written to an object store with **Object Lock, compliance mode** **[EXT]**, retention ≥ the evidence retention of the customer (legal to set; digests hold no PII, so they may outlive the 12-month data). Once per day the day's last `chain_digest` is additionally sent to an RFC 3161 TSA **[EXT]** and the token stored beside the headers.
7. **Where it runs**: a small *sealer* job **[EXT to Elastic]** on a separate host reads sealed hours via the Search API (point-in-time + `search_after`, reading `_id` = `hash_masked` and re-computing it from `_source`, §5.2) with a **read-only** API key. Cost of re-hashing and sorting 72 M events/hour is not benchmarked `[ASSUMPTION — to measure in PoC; no capacity figure in §2–§3 changes]`.

Reference check: `scratchpad/merkle_ref.py` implements steps 1–5 (Python, fake hashes, throw-away key) and was run: a clean series verifies; a modified event, a deleted event, an inserted event each fail exactly the affected batch; a removed batch is shown as a chain gap; an inclusion proof verifies for a real leaf and rejects a wrong one (log `scratchpad/merkle_ref.log`). It does **not** test real Elasticsearch, HSM, Object Lock or a TSA.

### 6.3 Periodic self-check (detective control)

A scheduled job re-reads a sample and re-computes roots against the signed headers and alerts on mismatch: last 30 days daily, older data on a rolling cycle so that every batch is fully re-verified at least once per quarter `[ASSUMPTION — frequency to be set from PoC cost]`. This catches tampering without waiting for an audit.

### 6.4 Snapshot repository and retention

- Snapshots (§2.5) are the redundancy for 0-replica cold data (R6) and a second source for verification: a restored index must reproduce the signed roots.
- Protection of the repository (object store **[EXT]**): versioning on; the Elasticsearch credential may write but **not** delete/overwrite-with-lifecycle outside ES; bucket admin is a different person from the ES admin.
- **Caveat:** Elasticsearch must rewrite/delete repository metadata blobs and deletes old snapshots on SLM retention, so a *live* repository placed directly under compliance-mode Object Lock may break snapshotting `[ASSUMPTION — verify with the chosen object store and ES version in PoC]`. Recommended design: live repository (versioned, delete-restricted IAM) **plus** a periodic copy of the repository files to a second bucket with compliance-mode Object Lock ("vault copy", retention ≥ 13 months). The vault copy is what proves the data existed; the live repository is what ES restores from.
- Retention end: ILM `delete` after 12 months (§4.2) removes data; signed digests are kept longer (6.2 step 6). Deleting expired data is a documented, ILM-driven act; manual deletion of any audit index is not allowed (6.5).

### 6.5 Access control under Basic

Under Basic, **RBAC, API keys and TLS are available** `[LICENCE – to verify]`; **field/document-level security and Elasticsearch audit logging are not** (R4).

| Role / principal | Privileges (summary) | Purpose |
|------------------|----------------------|---------|
| `audit_writer` (Logstash) | `create_doc` + `auto_configure` on `logs-audit-*` (data stream name from §5.4: dataset `audit`, namespace `prod`); cluster `monitor`; **no** `index` (overwrite), `delete`, `delete_index`, `manage` | ingest only, `action => "create"` (§5.4) |
| `audit_reader` (analysts, Kibana) | `read`, `view_index_metadata` on `logs-audit-*` | interactive search; **no write/delete** |
| `audit_sealer` (6.2) | `read` on `logs-audit-*` only | build digests |
| `audit_ops` (ILM/SLM operators) | `manage_ilm`, `manage_slm`, `monitor` — no data-index privileges | lifecycle maintenance; changes reviewed in change control |
| `superuser` / `elastic` built-in | **Break-glass only**: password sealed in a vault, use requires two people and a ticket; never used by services | the only principal able to delete indices or change roles |

Further rules: `action.destructive_requires_name: true` (no wildcard deletes); no user other than break-glass holds `delete_index`, `manage` or `all` on audit indices; `manage_ilm` only for `audit_ops`; ordinary users get no index-level write, so they cannot "unlock" indices; TLS 1.2+ on transport and HTTP with certificates from the customer CA; API keys with expiry for services; Logstash/Kibana secrets from keystores (D4). Whether ILM actions run with the privileges of the user who last saved the policy must be checked in PoC `[ASSUMPTION]` — the policy must be saved by `audit_ops`, not by `superuser`.

**Compensating controls for no ES audit logging and no FLS/DLS:**
1. Put a **reverse proxy [EXT]** in front of the HTTP API and Kibana; log method, path, authenticated user and status to a separate log pipeline whose store is itself WORM or forwarded off-host; only the proxy may reach port 9200 from user networks.
2. OS-level `auditd`/shell logging on all ES, Logstash and sealer hosts **[EXT]**, forwarded off-host; changes to `elasticsearch.yml`, roles and keystores are alerts.
3. **No FLS/DLS needed by design**: all indexed data is already masked (§5.3); audiences needing different visibility get separate data streams/indices and roles per index pattern rather than field filtering.
4. Periodic export of roles/users (`_security/role`, `_security/user`) into the WORM digest store and a diff alert; the sealer's self-check (6.3) detects data tampering even if an unlogged admin action occurred.
5. Separation of duties: ES admin ≠ object-store admin ≠ signing-key holder ≠ HMAC key custodian.

### 6.6 Auditor verification procedure

Inputs from the auditor's side: the published public key(s), the Object-Lock bucket (read access), the TSA CA certificate, and the canonical-form spec (§5.2). No secret is required.

1. **Pick the scope**: stream and time range (e.g. 2026-11-02 10:00–12:00 UTC), mapped to ingest-hour batches.
2. **Fetch signed headers** from the WORM bucket for the range **plus the preceding header**. Check the bucket's Object Lock retention/mode on those objects (compliance) and the object versions.
3. **Verify signatures** of each header with the published public key; verify the RFC 3161 token(s) covering the days in scope against the TSA certificate (`openssl ts -verify`, or the TSA's tool) `[ASSUMPTION — procedure depends on TSA]`.
4. **Verify the chain**: for each header, `prev` equals the previous `chain_digest`, `chain_digest = SHA-256(header)`, and no hour is missing (compare with expected hour list).
5. **Export events** from Elasticsearch (read-only account, point-in-time search of `event.ingested` in each hour) — or from a restored snapshot (6.4) — with `_source` untouched. Record the export command and the exporter's identity.
6. **Recompute `hash_masked`** for every event with the canonical form of §5.2 (the sealer ships an open reference verifier; the auditor may write their own from the spec). Compare with the stored `event.hash_masked` and with `_id`.
7. **Rebuild the tree** per batch (sorted leaves, 6.2 rules), compare `count` and `root` with the signed header.
8. **Conclude**: all batches match → the records are exactly those sealed at the time; any mismatch names the batch, and with an inclusion proof / diff the altered, missing or extra events.
9. **Record** the result: tool versions, hashes of the export, signer key id, date, auditor — in a signed report.

**Using `event.hmac_original` (comparing against an original):** when a party produces an *original* (unmasked) event — from the optional encrypted archive (OD3), a source system or a seized log — the key custodian recomputes `HMAC-SHA256(HMAC_KEY, canonical(original))` (§5.2 rule 5) and compares it with `event.hmac_original` of the indexed record; equality, together with step 6, binds the original to the sealed masked record. Procedure: (a) the key is held by a custodian (e.g. security officer) with an escrow copy under a second custodian; operational copies also sit in Logstash keystores, so the **escrow copy** is the one used for verification and the Logstash copy is rotated if a host is compromised; (b) **two-person rule**: the computation runs on an isolated machine with both custodians present, one holding the key share/escrow, the other operating and witnessing; (c) the original is only ever supplied by the requesting party, the key is never handed over, and each run is logged and signed; (d) old keys are retained per `hmac_key_id` (§5.4 note). Without the key nobody can test guesses against `hmac_original`, which is why it is keyed (D3). A match does not prove the *content was true*, only that it is what the pipeline received.

### 6.7 Masking versus evidence — recommendation (customer / legal decide, OD3)

Conflict R2: I5 requires masking before indexing; I4 requires evidence that is provably unaltered. Positions:

| Option | Evidence value | Cost / risk |
|--------|----------------|-------------|
| **A. Masked record + `hmac_original` only** (`archive_originals: false`, default) | Proves integrity of what is indexed and, via HMAC, that a later-produced original matches. Originals cannot be produced by the platform. | Cheapest; no new PII store. Weak if a court demands the unmasked content from the platform. |
| **B. A + encrypted original archive for *designated evidence classes* only** (flag on for selected sources) | Platform can reproduce unmasked originals for those classes under dual control; the archive is itself under Object Lock and bound by `hmac_original`. | New external PII store (retention, access, erasure duties, DPIA `[cần soát lại — legal basis]`); volume is **not** in §2–§3 and must be sized separately; archive key custody. |
| **C. Archive all originals** | Maximum evidential value. | Doubles storage (up to ~1.38 TB/day raw, before compression, outside the sized cluster), largest PII surface; hard to justify against I5. Not recommended. |

**Recommendation: A as default, and decide in writing with legal counsel whether B is needed for named event classes.** Switching A → B is a configuration flag (plan D2), not a redesign, so it need not block the project; events indexed before the switch are covered only by `hmac_original`. **The decision belongs to the customer and legal counsel**, not to this document.

### 6.8 Control-to-licence mapping `[LICENCE – to verify]`

Everything is `assumption / to be verified against the current Elastic subscription matrix` for the deployed version.

| Control | Provided by | Basic or external |
|---------|-------------|-------------------|
| Masking, `hmac_original`, `hash_masked` (Logstash ruby/keystore) | §5 | Basic (Logstash free/Basic) |
| Merkle tree, hash chain, sealing, self-check, verifier | sealer job + reference verifier | **External** (custom code, not an Elastic feature) |
| Signing key, signatures | HSM / smart card | **External** |
| WORM digest store (Object Lock, compliance) | object storage | **External** |
| RFC 3161 timestamp | TSA | **External** |
| Snapshot repository, vault copy with Object Lock | object storage; snapshot/restore and SLM in ES | Snapshot/restore and SLM: Basic; Object Lock: **External** |
| ILM (rollover, delete, force-merge) and data tiers incl. cold tier on normal nodes | Elasticsearch | Basic |
| Searchable snapshots (mounted cold/frozen) | — | **Not used** (Enterprise, R1) |
| RBAC, API keys | Elasticsearch/Kibana security | Basic |
| TLS transport + HTTP | Elasticsearch/Logstash/Kibana | Basic |
| Field/document-level security | — | **Not available** (Platinum) — replaced by separate indices (6.5) |
| ES audit logging | — | **Not available** (Gold+) — replaced by reverse-proxy and OS logs **[EXT]** |
| Reverse proxy access log, `auditd`, off-host log forwarding | proxy, OS | **External** |
| PQ volume encryption, vault for break-glass password, HMAC escrow | OS / vault / procedure | **External** |
| Dual-control, change control, key custody | process | **External** (organisational) |

---

## 7. Risks, conflicts and open decisions

### 7.1 Conflicts in the inputs

| ID | Conflict | Impact | Resolution / proposal |
|----|----------|--------|-----------------------|
| R1 | **I7 vs I6:** searchable snapshots (cold mounted / frozen tier) require an **Enterprise** licence `[LICENCE – to verify]`; the budget is Basic only. | Customer suggestion cannot be implemented as stated. | Use regular `data_cold` nodes with cheap disks, 0 replicas, best_compression, force-merge; snapshot repository as redundancy; restore-from-snapshot as DR/fallback (§2.4, §4.4 Option A). Saving vs. a 1-replica cold tier: 784.553 − 392.276 = 392.277 TB provisioned (expected). |
| R2 | **I5 vs I4:** masking alters the event before indexing, so the indexed record is not the original the evidence refers to. | Courts may ask for the original content. | Plan D2: `event.hash_masked` proves the indexed (masked) record is unaltered; `event.hmac_original` binds it to the original without storing PII; optional encrypted original store (default OFF). Final choice: customer/legal (OD3); options and recommendation in §6.7. |

### 7.2 Risks

| ID | Risk | Severity | Mitigation |
|----|------|----------|-----------|
| R3 | Elasticsearch has **no WORM** guarantee: a superuser can delete indices, remove `readonly`, or rewrite documents. | High | External signed digests + Object Lock storage (§6.2, §6.4); RBAC (§6.5); separation of duties for superuser credentials. |
| R4 | Basic has **no Elasticsearch audit logging** and **no field/document-level security (FLS/DLS)** `[LICENCE – to verify]` (Platinum features). | High | Compensating controls in §6.5: separate indices/aliases per audience, reverse-proxy/Kibana access logging, OS-level logging of admin actions, restricted superuser use. |
| R5 | Compression ratio `r` is assumed (A3). At r = 1.0 the cluster needs 19 hot + 28 cold nodes instead of 12 + 17. | High (cost) | Benchmark ≥ 1 day of representative data in PoC before ordering hardware; buy for expected, keep rack space for high. |
| R6 | Snapshot repository is the only redundancy for cold data (0 replicas). | Medium | Durable object storage with versioning/Object Lock; regular test restores (monthly) to measure real `R`. |
| R7 | Restore throughput `R` and node throughput figures are unbenchmarked (A9, §3.4). | Medium | Measure in PoC; re-check §3.3 cold node density bound (≤ 12 h restore per node). |
| R8 | Peak ingest unknown (A4). Bursts above 20,000 eps queue in Logstash PQ. | Medium | PQ sized for 4 h; obtain peak factor (OD5). |
| R9 | Hot N-1 at +20 % growth reaches 87.7 % (above low watermark). | Low | Acceptable (below 90 % high watermark); add a 13th hot node if growth exceeds A5. |
| R10 | Licence claims in this document may change between Elastic versions. | Low | Verify every `[LICENCE – to verify]` item against the subscription matrix of the deployed version. |
| R11 | A snapshot repository placed directly under compliance-mode Object Lock may break Elasticsearch snapshots/SLM retention (ES rewrites and deletes repository blobs) `[ASSUMPTION — verify]`. | Medium | Versioned, delete-restricted live repository plus a locked "vault copy" (§6.4); prove in PoC. |
| R12 | `hash_masked` is unkeyed and the HMAC key sits on Logstash hosts: forged events injected **before sealing** (or via a compromised Logstash) are not detectable by hashing; sealing proves integrity from the seal onward. | Medium | Writer-only role, host hardening, 1 h + 15 min sealing window, reconciliation (§5.5), escrow key for verification (§6.6). |
| R13 | Sealer, signing key, TSA and Object-Lock storage are **outside Elastic**; they need budget, build and operation (custom code, key custody). | Medium | OD4, OD8; PoC of the sealer; reference check in §6.2. |
| R14 | Reverse-proxy/OS logs replace ES audit logging; weaker than native and only as good as their own protection. | Medium | Off-host/WORM forwarding (§6.5); consider a paid tier only if the customer's regulator requires native audit logging. |

### 7.3 Open decisions (non-blocking; recommendation given)

| ID | Question for customer | Recommendation |
|----|----------------------|----------------|
| OD1 | Accept a cold tier on regular nodes (no mounted searchable snapshots) instead of the suggested searchable snapshots? | **Yes** — only Basic-compliant option; Option A (§4.4). |
| OD2 | Does the 24 h SLA for older data include restore time (i.e. is Option B acceptable for any part of the year)? | Treat as **inclusive**; with Option A no restore is needed except DR. |
| OD3 | Keep an encrypted copy of original (unmasked) events outside the cluster? | Decided by customer/legal; default OFF. Recommendation: A by default, B (archive for named evidence classes) only on written legal advice (§6.7). |
| OD4 | Budget for object storage with Object Lock (component outside Elastic) for the snapshot repository and signed digests? | **Yes** — required for R3/R6 mitigations. |
| OD5 | What is the peak-to-average ingest factor? | Provide 1 week of rate metrics; if > 1.5×, re-size Logstash and hot nodes. |
| OD7 | Must the persistent queue (raw, pre-masking) be treated as in scope of I5? | Encrypt the PQ volume (default); split into a mask tier + PQ tier only if required (§5.1). |
| OD8 | Who is the RFC 3161 TSA / signing-key custodian and what is the retention of signed digests (legal period)? | Use an accredited TSA if one is required for admissibility `[cần soát lại]`; keep digests ≥ the legal evidence period (they hold no PII). |
| OD9 | Accept that integrity (Merkle sealing, WORM, signing) is delivered by components outside Elastic Basic, and that RBAC + proxy/OS logs compensate for missing FLS/DLS and ES audit logging? | **Yes** — only way to meet I4 within Basic; otherwise a higher licence is needed. |
| OD6 | Approve a PoC to benchmark `r` (A3) and restore throughput `R` (A9)? | **Yes**, before hardware purchase. |

---

## 8. Verification of the arithmetic

Every number in §2–§4 (daily/yearly raw, per-tier × replica, headroom G/WM, node counts, shards, snapshot repository, N-1 checks, restore times, PQ sizing) is recomputed by a Python script run in this session: `/tmp/claude-0/-tmp-vb-r1-elk-design--B0--r3/d1e1e9dd-fe0c-5909-9d1d-01fccf35645d/scratchpad/verify_capacity.py`, log `.../scratchpad/verify_capacity.log`. One discrepancy was found and corrected: cluster total 464.876 → 464.877 TB (rounding of parts). All other figures matched. Compression ratio `r` and restore throughput `R` remain assumptions (A3, A9), not measured.
