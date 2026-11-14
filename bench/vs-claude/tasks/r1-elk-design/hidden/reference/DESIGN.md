# Reference design (grader self-test only)
Daily raw volume: 20,000 EPS x 800 B x 86,400 s = 1.38 TB/day. Yearly raw: about 505 TB.
Hot tier holds 30 days with 1 replica (x2).
Ingest: 20,000 EPS spread over 4 Logstash nodes at ~8k EPS bulk each with headroom.
Masking of usernames, e-mails and phones happens in the Logstash pipeline before indexing.
ILM: rollover daily, hot 30 days, then snapshot and delete; total 12 months.
Searchable snapshots require an Enterprise license, which conflicts with Basic; alternative: snapshot + restore on request within 24h.
Integrity: SHA-256 hash chain over batches, signed, stored in WORM storage with S3 Object Lock.
