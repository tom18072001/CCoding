# SPEC: Log Export (self-service access-log export)

Status: DRAFT v0.2 for customer review. Data classification: internal (applies to this specification document only; the log data it describes is treated at a higher level, see section 6).
All numbers not given by the customer are **assumptions** (marked `[A-n]`, see the last section). Nothing here has been verified against the real platform, which is unknown to us (repository is empty).

## 1. Purpose & scope

**Purpose.** Let a Branch Manager export their own team's access logs for a defined period as CSV, self-service, without a ticket to IT, while meeting the bank's data-protection rules.

**In scope (MVP).**
- A "Log Export" button in the log platform UI.
- Export of access logs of the requesting manager's own team, for the previous calendar month [A-3].
- CSV output, personal data **pseudonymised** by default [A-1]. Note: pseudonymised data is still personal data (see section 6); whether it satisfies "no personal data may leave the platform unmasked" is a DPO decision (Q-a).
- Audit record of every export.
- Retention handling of exported files.

**Out of scope (MVP).**
- Unmasked export for Branch Managers. Unmasked access is a separate, approval-gated forensic flow (section 2, US-4), described only at requirement level and to be built after customer confirmation [A-2].
- Formats other than CSV (XLSX, JSON, PDF).
- Scheduled or recurring exports, email delivery, export to external systems.
- Custom column selection, free-form filters beyond the period.
- Changes to log ingestion, to the source retention mechanism, or to IAM/HR systems.
- Exporting logs of other teams or branches (including child teams) [A-4].

## 2. Actors / roles

| Role | Description | Rights |
|---|---|---|
| Branch Manager (BM) | Manages one team; identity and team membership come from the source of truth in Q-g [A-7] | Export masked access logs of own team only |
| Forensic / Security Analyst (FSA) | Separate role in security/investigation function [A-2] | Request unmasked export; only after approval; file stays inside the platform |
| Approver | Second person (e.g. Security/DPO delegate) [A-2] | Approve or reject unmasked requests; cannot approve own request |
| Auditor | Internal audit | Read-only access to export audit trail |
| Platform Admin | Operates platform | No access to export content; manages configuration |

## 3. User stories and acceptance criteria

**US-1 (Must). As a Branch Manager, I want to export my team's access logs for last month as CSV, so that I can review team activity without asking IT.**
- Given I am a BM with a team, when I open the log view, then a "Log Export" button is visible; for users without the BM role it is not shown and the API rejects the call with 403.
- Given I click Log Export with default settings, when the export is small enough for sync mode (FR-6), then a CSV file downloads within 5 s at p95 (p95 is our assumption [A-5], not in the brief) and contains only rows of my team within the previous calendar month.
- Given the CSV, when I open it, then personal fields are pseudonymised per FR-9 and no raw IP or username appears anywhere in the file.

**US-2 (Must). As a BM, I want large exports to still work, so that I am not blocked by the 5-second limit.**
- Given the result exceeds the sync threshold [A-5], when I click Export, then within 2 s I see a message "export is being prepared" and a job id, and the UI does not block.
- Given an async job completes, when I return to the platform, then I see a notification in-app with a download link valid for the TTL in FR-11.
- Given the result exceeds the hard cap [A-6], when I click Export, then the request is rejected with a message asking me to narrow the period; no partial file is produced.

**US-3 (Must). As an Auditor, I want every export recorded, so that I can answer who exported what and when.**
- Given any export attempt (success, failure, denied), when it ends, then an audit record exists with fields in section 7 within 5 s.
- Given an audit record, while the file still exists (before purge), when an auditor recomputes SHA-256 of the stored file, then it equals the recorded checksum. After purge, the checksum in the audit record is only used to verify a copy that a recipient still holds.

**US-4 (Should, pending Q-a). As a Forensic Analyst, I want unmasked IP and username for an investigation, so that I can trace an incident.**
- Given I am an FSA, when I submit a request with case id, justification, scope and period, then it is routed to an Approver and nothing is exported yet.
- Given an Approver approves (not the requester, different person, holding the Approver role; approval re-checked at run time), when the export runs, then the file contains full IP and username, is stored only inside the platform, and is never downloadable to a local device unless the customer's DPO allows it [Q-a]. Viewing is in-platform only (see FR-12).
- Given the request is rejected or expires after 7 days [A-2], then no file is generated and the outcome is audited.

**US-5 (Must). As the bank, I want exported personal data not to outlive its allowed retention, so that we comply with policy.**
- Given a stored export file contains personal data (even pseudonymised) and its **oldest** source record is older than 12 months [A-8], or the file is older than its own max age (FR-11), when the daily purge job runs, then the file content, all copies and cache are deleted and only the audit metadata remains.

## 4. Functional requirements

Each FR has acceptance criteria (AC).

**FR-1 Export button (Must).** A "Log Export" button on the log view, shown only to authorised roles.
- AC: BM sees it; non-BM does not; direct API call by non-BM returns 403 and is audited. One click with defaults starts an export (no mandatory dialog) to honour "make it simple".

**FR-2 Time filter (Must).** Default = previous calendar month in Asia/Ho_Chi_Minh (UTC+7), from the 1st 00:00:00 inclusive to 1st of next month 00:00:00 exclusive [A-3]. BM may choose another period only within the maximum span of 31 days and within the 12-month data window [A-3].
- AC: On 3 Nov 2026 the default is 2026-10-01 00:00 to 2026-11-01 00:00 +07:00. A period over 31 days is rejected with a clear error. A period older than 12 months is rejected. Boundary rows at 00:00:00 exactly are assigned to the correct month (tested).

**FR-3 Team scoping (Must).** Server-side filter: only logs of users who are members of the requester's team at the time of the event [A-4]. The scope is derived on the server from identity, never from client parameters.
- AC: A BM calling the API with another team's id gets 403. Result contains zero rows of users outside the team (test with fixture of 2 teams). Team with 0 members yields a header-only CSV and an audited "empty" result.

**FR-4 CSV format (Must).**
- Encoding UTF-8 with BOM; delimiter comma; RFC 4180 quoting; line ending CRLF; header row always present.
- Columns (placeholder pending Q-f) [A-9]: `event_time`, `user_pseudonym`, `client_ip_masked`, `action`, `resource`, `result`, `team_id`, `source_system`.
- `event_time`: ISO 8601 with offset, e.g. `2026-10-15T14:03:22+07:00` (Asia/Ho_Chi_Minh).
- AC: File starts with bytes EF BB BF; opens in Excel with Vietnamese text (e.g. "Nguyễn") intact; a quoted field containing comma, quote, and newline round-trips through an RFC 4180 parser; timestamps parse with +07:00; row order is ascending by event_time then event id.

**FR-5 CSV/formula-injection protection (Must).** Any text cell beginning with `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'` (and quoted).
- AC: Fixture rows with values `=1+1`, `+cmd`, `-2`, `@SUM(A1)`, `\t=x` appear in the CSV as text starting with `'`; opening in Excel/LibreOffice executes no formula. Applies to every column.

**FR-6 Sync/async mode (Must).** Row count is estimated first. If ≤ sync threshold [A-5] (assumed 50,000 rows), generate and stream synchronously. If above, run async (US-2). If above hard cap [A-6] (assumed 1,000,000 rows), reject.
- AC: Fixture of 50,000 rows completes ≤ 5 s p95 in the reference environment; 50,001 rows triggers async; cap+1 rows rejected. Thresholds are configuration values, not code constants.

**FR-7 Filename (Should).** `logexport_<team_id>_<YYYYMM or from-to>_<export_id>.csv`, no personal data in the name.
- AC: Name matches pattern; contains no username or IP.

**FR-8 Concurrency limits (Should).** Max 2 concurrent export jobs per user, 20 platform-wide [A-6].
- AC: The 3rd concurrent request from one user is refused with a clear message.

**FR-9 Pseudonymisation (Must, default for BM) [A-1].**
- Honest classification: the output is **pseudonymised, not anonymised**. It remains personal data; it is acceptable for "masked" only if the DPO confirms (Q-a).
- Unkeyed hashes (plain SHA-256 of an IP or username) are **forbidden**: the IPv4 space (2^32) can be brute-forced in minutes, and usernames are guessable from a dictionary.
- IP (v4 and v6): `HMAC-SHA-256(key_ip, canonical_ip)`, truncated to 16 hex chars (64 bits), prefixed `ip_`. A /24 truncation alone is **not** used as the only measure, because it still discloses network location of an individual host group and is not keyed. Optionally the column `client_net` may add the /24 (IPv4) or /48 (IPv6) prefix if Business needs network context; this requires DPO confirmation [A-1].
- Username: `HMAC-SHA-256(key_user, canonical_username)`, truncated to 16 hex chars, prefixed `u_`.
- Keys: separate keys for IP and username, generated and held by the platform in KMS/HSM, never exposed to BM, Admin or developers; versioned, stored with a key id. The same value maps to the same pseudonym within one key version, so a manager can see patterns. Rotation: at least yearly and on suspected compromise [A-12]; old key versions are kept only as long as needed to reverse-look-up data still within retention, then destroyed (this also makes older pseudonyms irreversible).
- Controlled reverse lookup (forensics, inside the platform only): no mapping table is stored. An approved FSA enters a pseudonym (or an IP/username they already have), the platform recomputes HMAC over the source logs still within retention and returns matches. Every lookup needs case id, justification and the same four-eyes approval as FR-12, is rate limited, and is audited.
- AC: No row contains a full IPv4/IPv6 address or a raw username (regex scan over the output in test); the same user gives the same pseudonym in two exports; a test confirms the pseudonym is NOT equal to an unkeyed SHA-256 of the same value; the key is not in the repo, logs or the file; BM/Admin API calls to lookup return 403.

**FR-10 Download (Must).** Download via authenticated HTTPS only, by the requester only. Authorization (role, team scope, file ownership) is checked **on the server on every request**; hiding the button or a signed URL alone is not sufficient (prevents IDOR: file/export ids are random, unguessable and always checked against the requester).
- AC: Another user, even another BM, opening the link gets 403; unauthenticated gets 401.

**FR-11 Storage and link expiry (Must) [A-10].** Files are stored encrypted at rest (platform storage, not on a shared drive). The download link is bound to the requester's session/user, valid for at most 24 h [A-10] (async) or 5 minutes (sync), and expires after first successful download if the customer agrees. The file is not kept longer than 30 days after creation for BM exports [A-13] and in any case per section 6 retention. Files must never be placed on shared drives, e-mail or non-encrypted storage.
- AC: After link expiry it returns 410; the audit record remains; the stored file is encrypted at rest (key managed by the platform, separate from the pseudonymisation keys); a file past max age is purged.

**FR-12 Unmasked (forensic) export controls (Should, pending Q-a) [A-2].**
- Request needs: case id (format `CASE-<digits>`, validated; no free text with names/IPs in the id), justification, scope, period, requested columns. Free-text justification is limited and scanned/rejected if it matches an IP or e-mail pattern, because it goes into the audit trail.
- Four-eyes: Approver is a different person with a different account, holds the Approver role, is not in the requester's reporting line [A-2]; self-approval and approval via shared accounts are blocked by the server. Request expires after 7 days. Minimum scope: only rows and columns the case needs.
- Output: stays in platform storage; viewed or processed in an in-platform viewer/analysis space; **download to local device, e-mail and copy to external systems are disabled** unless the DPO allows it (Q-a). If allowed later, it must be a separate, additionally approved action with watermark per file (export id) and short link.
- Access to the unmasked file is logged per open/read. Unmasked files have max age equal to case duration, hard limit 90 days unless re-approved [A-13], and never beyond the 12-month source rule.
- AC: Requester approving own request returns 403; an FSA without approval gets no file; unmasked download endpoint returns 403 for all roles; each approval, read and lookup produces an audit record.

**FR-13 Rate limiting and abuse control (Must).** Per-user limit of 10 export requests/hour and 30/day, plus FR-8 concurrency; failed/denied attempts above 5 in 10 minutes trigger an alert to Security and temporary block [A-6].
- AC: The 11th request in an hour returns 429 and is audited; repeated denied attempts raise an alert event.

## 5. Non-functional requirements

All values are assumptions [A-5], [A-6] until confirmed with real volumes.
- **Performance:** sync export ≤ 5 s p95 for ≤ 50,000 rows (p95 and 50,000 are assumptions [A-5], to be confirmed in Q-d); the 5 s is measured from click to the first byte of the complete download, excluding the user's network; async job ≤ 15 min p95 for ≤ 1,000,000 rows.
- **Size limits:** hard cap 1,000,000 rows and ~250 MB per file (assumption); beyond that, reject.
- **Memory:** streaming generation; no full result set in memory.
- **Availability:** same as the log platform; export failure must not affect log ingestion or search.
- **Security (minimum, proportionate to internal-classified project with personal data):** TLS 1.2+, RBAC enforced server-side on every call (UI hiding is not control), encryption at rest, secrets and HMAC keys in KMS, CSV injection protection (FR-5), expiring links (FR-11), rate limit (FR-13), no personal data in application logs, URLs or error messages, no real data in DEV/UAT (synthetic only). Not required for MVP: DLP agents, per-row encryption, HSM-backed signing of every file.
- **Localisation:** UI messages in Vietnamese and English.
- **Observability:** metrics on export count, duration, failures. Application logs must not contain personal data.

## 6. Data protection & retention

Data types: client IP address and username (personal data); event time, action, resource (may be linked to a person). Purpose: team activity review (BM) or forensic investigation (FSA). Access: BM masked, own team; FSA unmasked after approval.

- Principles: data minimisation (masked default), purpose limitation (case id for unmasked), least privilege.
- Legal basis and the applicable internal policy and Vietnamese regulation: **to be confirmed by the bank's DPO / legal.** This spec cites no specific law or document number as fact.
- Retention [A-8]: source personal data older than 12 months is deleted by the platform. Export files containing personal data (including pseudonymised, since pseudonyms are still linkable) are deleted **when their oldest source record passes 12 months** (not the newest: otherwise records older than 12 months would survive), or earlier by max age (FR-11). The purge covers all copies: primary storage, caches, temp files and replicas; backups must expire within a period agreed with DPO (Q-m) and restored data must be re-purged.
- "Kept forever for audit" is satisfied **only for the audit record** (section 7), which contains no raw or pseudonymised IP/username content. It cannot be satisfied for row-level files without violating the 12-month rule; this is a design decision, not an open option, unless the DPO documents an exception (Q-e).
- Unmasked files (FSA) never leave the platform, are retained at most for the case duration (hard limit FR-12) and never beyond 12 months of source data age [A-2].
- Pseudonym keys: destroying old key versions (FR-9) is part of the retention control.
- Data classification of datasets: access logs with IP/username = restricted/personal data (treated as higher than the project label "internal", because the project label does not cover the content); pseudonymised export = personal data; audit record = internal, with pseudonymous ids. Proposed ATTT level: to be determined from the bank's HTTT classification (to be confirmed by customer; none is assumed).
- Deletion must be verifiable: the purge job writes an audit event with file id, time and count.
- AC: A test file with source data 12 months + 1 day old is purged by the next daily run, its checksum and metadata remain, the content is not recoverable via the API; a file within 12 months is untouched.

## 7. Audit trail of the export action

One immutable record per attempt (append-only, tamper-evident store, access limited to Auditors):
`export_id`, `requested_at` (UTC and +07:00), `requester_id` (opaque internal id, not display name or e-mail; pseudonymous personal data, handled per Q-i/Q-m), `requester_role`, `team_id`, `period_from`, `period_to`, `mode` (masked / unmasked), `case_id` and `approver_id` (unmasked only), `row_count`, `file_name`, `sha256` of the file, `status` (success / failed / denied / rejected_too_large / purged), `request_ip_token` (HMAC token of the requester's IP with the FR-9 key; **raw IP is not stored**), `session_id`, `downloaded_at` list, `purged_at`. The audit record must **never contain** raw or masked IP/username of data subjects in the exported logs, CSV content, justification free text, or row samples; error messages are stored as codes only. `case_id` is validated format (FR-12).
- Also audited: approvals/rejections, unmasked file reads, pseudonym lookups, purge events, key rotations, and blocked attempts. Records are shipped to a write-once (WORM) or hash-chained store; auditors' reads are audited too.
- AC: A scan over the audit store with IP/e-mail regexes finds no match; each of the 4 outcomes produces a record; a record cannot be modified or deleted by BM or Admin through the application; the sha256 matches the file; retention of records is per Q-e [A-11].

## 8. Error and edge cases

| Case | Expected behaviour |
|---|---|
| No rows in period | Header-only CSV, message "no data", audited with row_count 0 |
| User has no team or several teams | Export denied with message (single team assumed [A-4]); audited |
| Team membership changed during the month | Membership as of event time [A-4] |
| Period crosses the 12-month data horizon | Rejected with message |
| Over sync threshold | Async (US-2) |
| Over hard cap | Rejected, ask to narrow |
| Generation fails midway | No partial file is delivered; status failed; user can retry |
| User double-clicks | Idempotent within 10 s: one job |
| Session expires during async | Job continues; the link requires re-login |
| Source data purged during the export | Job uses a snapshot at start |
| Clock/DST | Asia/Ho_Chi_Minh has no DST; store UTC, display +07:00 |
| Audit store unavailable | Export is refused (fail closed) |
| Malformed log values (long strings, control chars, invalid UTF-8) | Replace invalid bytes with U+FFFD; truncate fields at 4,096 chars |

## Open questions and assumptions

Each item: contradiction/ambiguity, question for the customer, assumption used meanwhile, impact if wrong.

**Q-a. Full IP + username "for forensic use" vs "no personal data may leave the platform unmasked".**
- Question (for DPO/legal): Does a keyed-pseudonymised IP and username count as "masked" under the policy, or must data be fully anonymised/redacted? Who may see unmasked data, under what approval, and does "leave the platform" include a download to a laptop?
- Assumption [A-1][A-2]: Default BM export is pseudonymised with keyed HMAC for IP and username (IPv4 /24 truncation only if DPO confirms); treated as personal data. Unmasked export only for the separate FSA role, with case id and second-person approval, and the file stays inside the platform (viewed/stored in platform, no download).
- Impact if wrong: if BM must receive full data, FR-9 is removed for BM and a policy exception must be documented by DPO; if forensic must download, a controlled-download design is needed (rework of US-4, FR-10, ~medium).

**Q-b. "their team's logs from last month" vs "export everything they can see".**
- Question: Is the scope the own team only, or all that the BM's view permits (other teams, sub-teams, branch)? Is "last month" the only period?
- Assumption [A-3][A-4]: Own team (one team, no child teams), one period at most 31 days within the 12-month window; "everything" is limited to those rows.
- Impact: a wider scope increases volume (affects Q-d) and the authorisation model.

**Q-c. Definition of "last month".**
- Question: Previous calendar month, or the last 30 days? Which timezone?
- Assumption [A-3]: Previous calendar month, in Asia/Ho_Chi_Minh (UTC+7); timestamps in the file carry +07:00.
- Impact: different row sets and tests; low rework.

**Q-d. "Within 5 seconds" vs "everything".**
- Question: Typical and peak rows per team per month? Is 5 s a hard requirement for any size? Is async acceptable? Is "5 seconds" a hard limit for every request, or a target (the spec assumes a p95 target)?
- Assumption [A-5][A-6]: the customer's brief gives no percentile; "p95" is **our assumption**, not a customer requirement. 5 s applies to sync exports up to 50,000 rows; larger ones are async up to 1,000,000 rows; beyond that rejected. **These thresholds are guesses and must be re-validated with real volume data and a load test.**
- Impact: if volumes are far larger, async becomes the norm and the "button" UX changes; if far smaller, async can be dropped (simpler).

**Q-e. "Kept forever for audit" vs "delete personal data older than 12 months".**
- Question: What exactly is kept forever: the file, or the fact of the export? Does the 12 months apply to exported copies and to pseudonymised data?
- Assumption [A-8][A-11]: The audit record (metadata + checksum, no personal data except an opaque internal id) is kept long-term. Export files with personal data, even pseudonymised, are deleted when their oldest record passes 12 months. If audit evidence of content is needed, only aggregates (counts, checksum) are kept, no row-level data.
- Impact: if files must truly be kept forever, the data-protection policy needs a documented exception, or row-level data must be anonymised irreversibly (not pseudonymised).

**Q-f. "Like the old system" format.**
- Question: Provide a sample CSV or column list, delimiter, encoding, date format of the old system.
- Assumption [A-9]: Columns as in FR-4, comma delimiter, UTF-8 BOM. The old format is not known to us (not verified).
- Impact: downstream scripts of the bank may break; column mapping rework (low-medium).

**Q-g. Source of team and role.**
- Question: Which system is authoritative for "Branch Manager" and team membership: IAM, HR, Active Directory, or the platform's own table? Is there a history of membership?
- Assumption [A-7]: One IAM/AD-based source exposes role and team id via the platform's authentication; historical membership exists, otherwise current membership is used.
- Impact: wrong scoping is a data leak risk; this is the highest-impact integration unknown.

**Q-h. Storage and download.**
- Question: Where do files reside, who can download, how long is the link valid, may they be sent by email?
- Assumption [A-10]: Platform encrypted storage; HTTPS download by requester only; link valid 24 h; no email.
- Impact: security review and storage sizing.

**Q-i. Legal basis and policy.**
- Question: Which data-protection policy, Vietnamese law and State Bank regulations apply (including data localisation, the status of pseudonymised data, whether the exporter's own IP in audit records is personal data)?
- Assumption: **Needs confirmation by the bank's DPO / legal; this spec states no law or document number as fact.** Meanwhile, we treat IP and username, masked or not, as personal data.
- Impact: may change masking, retention and audit contents.

**Q-j. "Make it simple" for the MVP.**
- Question: Which of the following is the MVP: one button, one default period, masked CSV only?
- Assumption: MVP = FR-1 to FR-6, FR-9, FR-10, FR-11, FR-13 (rate limiting, Must, also listed in the section 5 minimum security set), audit (section 7) and purge (section 6). Phase 2 = FR-7, FR-8, FR-12 (unmasked forensic export controls), the forensic reverse lookup in FR-9 and US-4 (forensic flow), unless the customer says otherwise. FR-8 concurrency limits are referenced by FR-13; in the MVP FR-13 applies only its per-user request limits and alerting. Simple for the user means no mandatory dialog; it does not mean skipping the audit or masking.
- Impact: scope and timeline.

**Q-k. Who is "Branch Manager" if a person manages several teams, and is a delegate allowed?**
- Assumption [A-4]: One team per BM; no delegation.

**Q-m. DPO / legal questions (all legal references: to be confirmed by customer legal/DPO; none is assumed as fact here).**
1. Legal basis and purpose for exports by BM and for forensic use. Assumption: internal legitimate/security purpose documented by the bank; the DPO records it.
2. Is a data-protection impact assessment (or equivalent filing) required for this processing, and is there any cross-border transfer (cloud, support staff, SaaS)? Assumption: required to be checked; no cross-border transfer; all storage in Vietnam.
3. Is pseudonymised data still personal data under the bank's policy? Assumption: yes.
4. Does the 12-month deletion apply to backups, replicas and audit records, and what grace period for backups? Assumption: applies to all except the audit record without content; backups expire within 35 days [A-14].
5. May an audit record keep an opaque requester id and approver id indefinitely, or does it also expire (or become anonymised) after 12 months? Assumption: opaque ids kept, mapping to the person is held by HR/IAM and is deleted by their rules.
6. Retention of the audit trail itself: period required by regulators and internal audit. Assumption: long-term (period set by Audit) with no content.
7. Is unmasked forensic access allowed at all for this platform, who may approve (names/roles), and may anything leave the platform (laptop, e-mail, regulator submissions)? Assumption: allowed only to FSA with a different Approver; nothing leaves.
8. Incident notification duty and who is notified if an export leaks. Assumption: follows the bank's incident process; the export design supports it via audit.
9. Is the old system's practice (exports without masking) an accepted risk to be terminated, or must this feature still allow it? Assumption: not carried over.
- Impact if wrong: masking design (FR-9), retention (section 6) and audit contents (section 7) may change.

### Assumption register

| ID | Assumption | Confirms with |
|---|---|---|
| A-1 | Masking: keyed HMAC-SHA-256 for IP and username, truncated to 16 hex; /24 or /48 prefix only if DPO confirms | DPO, Security |
| A-2 | Separate FSA role, second-person approval, 7-day request expiry, no download of unmasked files | Security, DPO |
| A-3 | Last month = previous calendar month, Asia/Ho_Chi_Minh; max span 31 days | Business |
| A-4 | Own team only, membership at event time, one team per BM | Business, IAM |
| A-5 | Sync ≤ 50,000 rows and ≤ 5 s p95 | Business, Ops (real volumes) |
| A-6 | Hard cap 1,000,000 rows / ~250 MB; concurrency 2 per user, 20 total | Ops |
| A-7 | Role/team from IAM/AD | IAM owner |
| A-8 | 12 months counted from event time of the source record | DPO |
| A-9 | Column list in FR-4 | Business (old-system sample) |
| A-10 | Storage encrypted in platform; link 24 h | Security |
| A-11 | Audit metadata kept long-term (period to be set by Audit/Legal), contains no personal content | Audit, DPO |
| A-12 | HMAC keys: separate for IP/username, KMS, yearly rotation | Security |
| A-13 | BM file max age 30 days; unmasked max 90 days | Security, DPO |
| A-14 | Backups expire within 35 days | Ops, DPO |

## 9. Verification

Acceptance tests are derived from the AC above. Suggested checks once built: `grep -n '^## Open questions and assumptions' SPEC.md` (spec structure), plus automated tests for FR-2, FR-3, FR-4, FR-5, FR-9 and the purge job using synthetic data only.
