# SPEC: Log Export (self-service CSV export of access logs)

Status: DRAFT for customer confirmation. Not ready to build until the "Open questions and assumptions" section is answered or its assumptions are accepted.
Data classification of this document: internal. All examples use fake usernames and IPs from the documentation range 192.0.2.0/24.

Source sentences from the customer brief are referenced as **[B1]..[B8]**:

| Ref | Brief sentence |
|---|---|
| B1 | "We need a self-service 'Log Export' button." |
| B2 | "Branch managers can export their team's access logs from last month as CSV like the old system." |
| B3 | "Exports must contain full client IP addresses and usernames for forensic use." |
| B4 | "In line with our data-protection policy, no personal data may leave the platform unmasked." |
| B5 | "Users should be able to export everything they can see;" |
| B6 | "the export must complete within 5 seconds." |
| B7 | "Exported files are kept forever for audit, and the platform must delete personal data older than 12 months." |
| B8 | "Make it simple." |

## 1. Context and goal

A bank's branch managers need to get their team's access logs out of the log platform as a CSV file without raising a ticket. The brief contains several contradictions (B3 vs B4, B2 vs B5, B5 vs B6, B7 internal conflict). Per B8 ("Make it simple") this spec defines an **MVP only**: one button, one CSV format, one default behaviour (masked), strict scoping, full audit. Anything beyond that is out of scope (section 3).

Goal: a branch manager can export a masked CSV of their own team's access logs for the previous period in one click, with every export audited, and with no personal data retained beyond the allowed period.

## 2. Actors and roles

| Actor | Description | Source of definition |
|---|---|---|
| Branch Manager (BM) | Requests exports for own team only. | Role from IAM/HR, see OQ-3 |
| Forensic Requester | Needs unmasked IP/username (B3). Assumed to be Security/Audit staff, not BMs. | OQ-1, OQ-10 |
| Forensic Approver | Approves unmasked exports. Assumed to be Security/Audit lead. | OQ-10 |
| Auditor | Reads the export audit trail. Read-only. | OQ-10 |
| Platform Admin | Operates the platform. Cannot read export contents or edit audit records. | assumption |
| Log Export service | Builds files, applies masking, writes audit, runs retention. | this spec |

## 3. Scope and out of scope

In scope (MVP):
- Export button for BMs; masked CSV of the BM's team access logs for the previous period.
- Synchronous path for small results, asynchronous job for large ones.
- Approval-gated unmasked export for forensic use (FR-8), assumed to be requestable only by Security/Audit.
- Audit of every export action; retention and deletion of export files.

Out of scope:
- Other formats (XLSX, JSON), scheduled/recurring exports, email delivery of files.
- Ad hoc date ranges beyond the allowed window, free-form search or filter builders.
- Exporting logs of other teams, other branches or the whole bank.
- Changes to log ingestion, log retention in the source platform, SIEM integration.
- Migration of historic files from the old system.
- Encryption, watermarking and download-count limits beyond the assumptions in OQ-11 (confirm before adding).
- Legal-hold workflow tooling, crypto-shredding of per-file keys, and tamper-evident audit storage beyond what the platform already provides (see sections 8 and 10); flagged for a later phase if the customer requires them.

## 4. Functional requirements

Priority: M = must, S = should. Thresholds in brackets are **assumptions**, not customer facts.

### FR-1 Export button and request (B1, B2, B8) M
The Log Export button is visible only to users holding the BM role with a resolvable team.
- Given a BM with a team, When they open the logs page, Then a "Log Export" button is shown.
- Given a user without the BM role, When they open the logs page, Then no button is shown and a direct API call returns 403 (see FR-3).
- Given a BM clicks the button, When the dialog opens, Then it shows only the fixed period (FR-2), the scope "My team", and the format "CSV (masked)", with one Confirm action and no other inputs.

### FR-2 Period: "last month" (B2; OQ-4) M
Assumption: the previous full calendar month, evaluated in Asia/Ho_Chi_Minh (UTC+7), from 00:00:00 on the 1st inclusive to 00:00:00 on the 1st of the current month exclusive.
- Given today is 2026-11-02 in Asia/Ho_Chi_Minh, When a BM exports, Then events with timestamp >= 2026-10-01T00:00:00+07:00 and < 2026-11-01T00:00:00+07:00 are included and no others.
- Given an event at 2026-10-31T23:59:59+07:00 (2026-10-31T16:59:59Z), When exported, Then it is included; an event at 2026-11-01T00:00:00+07:00 is not.
- Given a BM supplies any date parameter via API, When it differs from the allowed window, Then the request is rejected with 400 (ERR-4).

### FR-3 Authorization and team scoping (B2 vs B5; OQ-2, OQ-3) M
The export contains only logs of members of the requesting BM's own team, and only records the BM is already permitted to see in the platform (intersection of "team's logs" and "visible to BM").
- Given BM-A of team T1, When exporting, Then every row has a username belonging to T1 at event time (assumption: membership as of the export request time, OQ-3).
- Given BM-A requests team T2 by changing a parameter, When the API processes it, Then it returns 403 and an audit record with outcome "denied" is written.
- Given the team membership source is unavailable, When a BM exports, Then the export fails closed (ERR-6).
- Given any request body or query string, When it contains team, branch or user identifiers, Then they are never used for scoping (scope always comes from the session identity); if they differ from the caller's own scope the request is denied and audited (IDOR protection).
- Given BM-A uses the `file_id` or job ID of an export owned by BM-B, When requested, Then the response is the same 403 as for any unauthorized access, with no hint whether the object exists; IDs are random (>= 128 bits), not sequential.

### FR-4 Masked by default (B4; OQ-1, OQ-8) M
All exports are masked unless FR-8 applies. Masking rules in section 7.
- Given any BM export, When the file is generated, Then no cell contains a full IPv4 address or a full username.
- Given a masked export, When validated by an automated test over a fixture, Then 100% of IP cells match the masked pattern.

### FR-5 CSV generation (B2 "like the old system"; OQ-6) M
Format per section 5.
- Given the export finishes, When the file is opened in Excel on Windows, Then Vietnamese characters display correctly and the timestamp column is in +07:00.
- Given a field starting with `=`, `+`, `-`, `@`, TAB or CR (also after leading spaces), When written in masked or unmasked mode, Then it is prefixed with `'` (section 5.4).

### FR-6 Sync/async execution (B6; OQ-5) M
- Given the result has <= N rows [assumed N = 50,000], When the BM confirms, Then the file is delivered within 5 seconds at the 95th percentile (target to be validated; see NFR).
- Given the result has > N rows, When the BM confirms, Then the UI replies within 2 seconds with "Export queued" and a job ID, and the BM is notified in-app when the file is ready.
- Given the result exceeds the hard cap M [assumed 1,000,000 rows], When requested, Then it is rejected with ERR-5 and the BM is told to contact Security/Audit.

### FR-7 Download and file lifetime (B7; OQ-7, OQ-9, OQ-11) M
- Given a ready export, When the requesting BM downloads it, Then it is served over HTTPS only to that BM, through an authenticated link that expires after 24 hours [assumed]; every download request re-checks session, role and file ownership (the link alone is not a credential).
- Given another user opens the link, When it is processed, Then 403 is returned and a denied audit record is written.
- Given the file has passed its retention deadline (section 8), When anyone requests it, Then 410 Gone is returned.

### FR-8 Unmasked forensic export (B3; OQ-1, OQ-10) M
Assumption: full IP and username are available only through a separate approved request, not the BM button.
- Given a Forensic Requester submits a request with a case/ticket reference (ID format only, validated, no free text), scope (one team or one user, within the allowed period), and a purpose chosen from a fixed list, When it is submitted, Then it stays "pending" until a Forensic Approver (a different person) approves. Pending requests expire after 3 days [assumed].
- Given the requester equals the approver, When approving, Then the system rejects it (four-eyes rule).
- Given approval, When the file is generated, Then it has the same CSV format but full values and is stored in a separate restricted store (readable only by the Requester, encrypted at rest, not reachable by BMs or Platform Admins); the audit record shows approver, case reference and purpose code.
- Given an approved unmasked file, When the Requester downloads it, Then the link is valid for 24 hours [assumed], one active link, every download audited; afterwards a new approved request is needed.
- Given an unmasked file, When 7 days [assumed] pass since creation, Then it is deleted (stricter than masked; OQ-7), unless a Legal hold is recorded.

### FR-9 Audit of every export action (B7; OQ-7) M
Per section 10. Given any export attempt (success, denied, failed), When it ends, Then exactly one audit record exists with all mandatory fields and without personal data of the exported subjects.

### FR-10 Retention and deletion job (B7; OQ-7) M
Per section 8.
- Given a file containing personal data past its limit, When the daily job runs, Then the file is deleted and a deletion audit record is written.
- Given the job fails, When it ends, Then an alert is raised and the job is retried; unresolved after 24h escalates to Security.
- Given data is restored from backup, When the restore completes, Then the deletion job runs before the restored files become accessible.

### FR-11 Error handling (B8) S
Per section 11: clear, non-technical messages in Vietnamese and English, no internal details.

## 5. CSV format (OQ-6)

The "old system" sample was not provided. Until it is, this spec defines the format below; matching the old layout is open (OQ-6).

### 5.1 File
- Encoding: UTF-8 **with BOM** (Vietnamese text, Excel compatibility).
- Delimiter: comma `,`; quote `"`; escape by doubling `""`; line ending CRLF; header row always present.
- Filename: `log-export_<team-code>_<YYYY-MM>_<masked|full>_<UTC-request-timestamp>.csv`. No usernames in filenames.
- Time zone: Asia/Ho_Chi_Minh; timestamps in ISO 8601 with offset, e.g. `2026-10-15T09:30:12+07:00`.

### 5.2 Columns (assumed; "access log" type per OQ-12 = application login/access events)

| # | Column | Masked value (default) | Unmasked value (FR-8) |
|---|---|---|---|
| 1 | event_time | as is | as is |
| 2 | team_code | as is | as is |
| 3 | username | pseudonym, e.g. `u_3f9a1c2b` (see 7.2) | `nguyen.test01` (fake) |
| 4 | client_ip | `192.0.2.xxx` (last octet masked; IPv6: keep first 48 bits, rest `xxxx`) | `192.0.2.17` (fake) |
| 5 | event_type | login_success, login_failure, logout, access_denied (assumed list) | same |
| 6 | target_system | as is | as is |
| 7 | result | success / failure | same |
| 8 | failure_reason | as is | as is |
| 9 | session_id | omitted | omitted (not needed; reduces exposure) |

### 5.3 Example (masked, fake data)
```
event_time,team_code,username,client_ip,event_type,target_system,result,failure_reason
2026-10-15T09:30:12+07:00,HN01-T3,u_3f9a1c2b,192.0.2.xxx,login_success,core-portal,success,
2026-10-15T09:31:40+07:00,HN01-T3,u_77b2e0d4,192.0.2.xxx,login_failure,core-portal,failure,bad_password
```

### 5.4 CSV/formula injection
Any text cell whose first non-space character is `=`, `+`, `-`, `@`, TAB (0x09), CR (0x0D) or LF (0x0A) is prefixed with a single quote `'`, then standard CSV quoting applied. Applies to every text column in masked and unmasked files, including user-controlled fields (failure_reason, target_system, and username in unmasked files). The check runs on the final value after masking, as the last step before writing. Verified with a fixture containing payloads such as `=HYPERLINK("http://example.invalid")` and `-2+3` in both modes. Limitation: the prefix changes the visible value of such cells; accepted for safety.

## 6. Access control

| Capability | BM | Forensic Requester | Forensic Approver | Auditor | Admin |
|---|---|---|---|---|---|
| Request masked export, own team | Yes | No (assumed) | No | No | No |
| Download own masked export | Yes | n/a | n/a | No | No |
| Request unmasked export | No | Yes | No | No | No |
| Approve unmasked export | No | No | Yes (not own request) | No | No |
| Download approved unmasked file | No | Yes (own request only) | No | No | No |
| Read export audit trail | Own records only | Own records | Yes | Yes (all) | No |
| Edit/delete audit records | No | No | No | No | No |

Rules: deny by default; authorization checked server-side on every request and every download; team scope derived from the identity source (OQ-3), never from client parameters; object-level check (owner = caller) on every file/job ID; all access decisions audited. Requester and Approver are different people, and neither role is combined with BM or Platform Admin on the same account (assumption). Whether BM-to-team mapping and role come from HR or IAM is open (OQ-3); role assignment owner is open (OQ-10).

## 7. Personal data handling

### 7.1 Data and purpose
Personal data in scope (assumed personal data under bank policy and Vietnamese law, to be confirmed by Legal/DPO, OQ-9): username, client IP address, and the combination with timestamps/target system.
Purposes: (a) masked export for team supervision/operations review (purpose to be confirmed by DPO, OQ-8); (b) unmasked export only for approved forensic investigation. No other purpose.

### 7.2 Masking
- IP: IPv4 last octet masked (truncation); IPv6 truncated to the first 48 bits (assumed). Why: stateless, no key to manage, keeps subnet context useful for supervision. Limits: a truncated IP can still be personal data in combination with other fields (a /24 may identify one small branch network); it is not anonymization. Alternative: keyed HMAC of the IP (consistent per address, but no network context).
- Username: keyed pseudonym `u_` + 8 hex chars from HMAC-SHA-256 with a secret key held in the platform's key store (not accessible to BMs or Admins), consistent across the same team's exports so a BM can spot repeated activity; not reversible without the key. Key rotation on a schedule set by Security [assumed yearly; rotation intentionally breaks linkage across periods]. Alternative: partial masking such as `ng***01` (OQ-1).
- Limits of pseudonymization: a pseudonym is **still personal data** (re-identifiable by the key holder, or by a BM who knows their team members; short hex values can collide in large teams, so a pseudonym alone must not be used as evidence against a person; use FR-8 for that). Masked files are therefore treated as personal data for retention (section 8), access control and audit. Whether this meets the bank's definition of "masked" is for the DPO to confirm (OQ-1, OQ-8).
- Masking is applied server-side before the file is written; unmasked values never reach the BM's browser in the masked flow, and the masked pipeline has no code path that reads the unmasked store.

### 7.3 "Leave the platform" (B4; OQ-2/OQ-8 related, see OQ-8)
Assumption: downloading to a user's device counts as leaving the platform. Hence the BM flow is masked always; unmasked values leave only through FR-8.

### 7.4 Legal basis
Applicable instruments to be confirmed by Legal/DPO, not asserted here: Vietnam's Personal Data Protection Law (2025), Decree 13/2023/ND-CP on personal data protection, State Bank of Vietnam information-security regulations, and the bank's own data-protection policy (OQ-9). This spec cites no specific articles. Whether a data-protection impact assessment is needed is also for Legal/DPO to confirm.

## 8. Retention and deletion (B7; OQ-7)

The brief demands both "kept forever" and "delete personal data older than 12 months". Proposed resolution (needs Legal/DPO sign-off):

| Object | Retention | Notes |
|---|---|---|
| Export audit record (who, when, filters, rows, hash) | Indefinite (per "forever for audit") | No IP of exported subjects, no usernames of exported subjects, no export contents; actor IDs are staff pseudonymous IDs, themselves personal data, retention to be confirmed (OQ-7) |
| Export file metadata (name, size, SHA-256, row count) | Indefinite | No content |
| Masked export file (still personal data, see 7.2) | Deleted when its oldest event reaches 12 months of age, i.e. 12 months after the first day of the exported period (so never later than 12 months after any event date; at most about 11 months after file creation) | Daily job. Anchored to event age, not file creation, so no personal data in a file exceeds 12 months |
| Unmasked forensic file | 7 days after creation [assumed], unless Legal hold (OQ-7) | Never longer than the masked rule |
| Source logs | Governed by source platform; the 12-month deletion applies there too, if the platform holds them | Out of scope to change, confirm OQ-7 |

"Kept forever for audit" is met only by the audit record and file metadata/hash, which hold no personal data of exported subjects. Files containing personal data are never kept forever.

Deletion = removal from primary storage and the download store, including caches and temp areas. Backups: files in backups expire within [assumed 35 days] (to be confirmed by Security), so a deleted file may persist in backups up to that period beyond the 12-month limit; the DPO must accept this exception, otherwise a shorter backup cycle or crypto-shredding is needed (out of MVP). Any restore from backup must re-run the deletion job before restored data is used (FR-10). After deletion the audit record keeps the file hash, proving what was exported without keeping the content.

## 9. Non-functional requirements

All numbers are assumptions until the customer confirms (OQ-5).

| Area | Requirement |
|---|---|
| Performance | Sync path (<= N = 50,000 rows): p95 <= 5 s from click to download-ready, on production-like data. Async path: queued within 2 s; ready within [assumed 10 min] for up to the hard cap. |
| Size limit | Hard cap 1,000,000 rows or [assumed 250 MB] per file, whichever first, then ERR-5. |
| Concurrency | Max 1 running export per user, [assumed 20] concurrent exports system-wide, queue beyond. |
| Streaming | Files streamed to storage; memory use does not grow with row count. |
| Security | TLS in transit; files encrypted at rest [assumed, OQ-11]; no personal data in application logs. |
| Availability | Same as the log platform; export failure must not affect log ingestion. |
| Accessibility/i18n | UI in Vietnamese with English fallback. |
| Time | All times computed in Asia/Ho_Chi_Minh; stored in UTC. |

The 5-second target cannot be guaranteed for "everything" (B5 vs B6); see OQ-5.

## 10. Audit of export actions

One immutable (append-only) record per attempt (request, approval, download, deletion):

| Field | Content |
|---|---|
| audit_id, event_time (UTC and +07:00) | |
| actor_id, actor_role | who exported (internal pseudonymous ID) |
| team_code | scope |
| action | request / approve / deny / download / delete |
| filters | period start/end, team, masking mode |
| row_count | rows in file |
| file_sha256, file_size, file_id | hash of the final file bytes |
| mode | sync / async; job_id |
| purpose_code, case_ref, approver_id | for FR-8; purpose is a code from a fixed list, case_ref is an ID only, never free text |
| outcome, error_code | success / denied / failed |
| source_ip of the request | stored masked (same rule as 7.2) unless Security says otherwise (OQ-1) |

Data-minimization rules for audit and logs: no usernames or IPs of the people whose events were exported, no file contents, no free-text fields, no raw request payloads, no unmasked source IP. The same applies to application logs, error messages, in-app notifications and filenames. A denied request records only the category of the attempt (e.g. "other team requested"), not data about the other team's members. Actor IDs are resolvable to a person only by Security.

Audit store is append-only; readable by Auditor; reviewed per bank policy (frequency: OQ-10). Tamper-evidence (hash chaining or WORM) is assumed to come from the platform; if not available it is a follow-up outside MVP.

## 11. Error cases

| Code | Situation | Behaviour |
|---|---|---|
| ERR-1 | Not authenticated / session expired | 401, redirect to login; audit denied |
| ERR-2 | Not a BM, or other team requested | 403; audit denied |
| ERR-3 | No rows in period | Empty CSV with header returned and the UI says "No events"; audit success with 0 rows |
| ERR-4 | Invalid parameter (period) | 400; audit denied |
| ERR-5 | Over hard cap | 413-style message; no job created; audit failed |
| ERR-6 | Team/role source unavailable | Fail closed, 503, try later; audit failed |
| ERR-7 | Async job fails or times out | Job marked failed, in-app notification, partial file deleted; audit failed |
| ERR-8 | Link expired / file deleted | 410 Gone |
| ERR-9 | Too many concurrent exports | 429 with retry hint |
| ERR-10 | Masking failure (e.g. unparseable IP) | Value replaced by `[masked]`; never output raw; counter alerted |
| ERR-11 | Approval rule violation (self-approval, missing case reference) | 422, audit denied |

## Open questions and assumptions

Answer owner: Business, DPO, Legal or Security. Until answered, the stated assumption is used in this spec. For every question touching personal data the default is **deny / mask**: if no answer arrives, nothing unmasked is released.

### OQ-1 Full IP/username vs "no personal data unmasked"
- **Ambiguity**: "Exports must contain full client IP addresses and usernames for forensic use" vs "no personal data may leave the platform unmasked." [B3, B4]
- **Why ask**: Both cannot hold for the same file; it decides whether masking is default. Also whether pseudonymized/truncated values (still personal data, section 7.2) count as "masked" for the bank.
- **Assumption (safe default: mask)**: Masked by default (IP truncated, username keyed pseudonym); full values only via approved four-eyes forensic request with audit (FR-8).
- **Impact if different**: If full values are always required, masking is dropped and FR-4/FR-8 collapse into one flow with much heavier controls; if never allowed, FR-8 is removed and forensics uses an in-platform view; if stronger masking is required, use HMAC for IP and drop subnet context.
- **Owner**: DPO, Business, Security.

### OQ-2 "Team's logs" vs "everything they can see"
- **Ambiguity**: "export their team's access logs from last month" vs "export everything they can see". [B2, B5]
- **Why ask**: A BM may be able to see more than their team (e.g. other teams, older months); "everything" widens scope and volume.
- **Assumption (safe default: narrowest scope)**: Only own-team logs, within the fixed previous-month window; the intersection with what they can see.
- **Impact if different**: Wider scope means new filters, larger volumes (more async), and a broader review of visibility rules and of purpose limitation.
- **Owner**: Business, Security.

### OQ-3 Definition and source of "team" and "branch manager"
- **Ambiguity**: "Branch managers", "their team" are undefined. [B2]
- **Why ask**: Scope enforcement depends on an authoritative source and on handling transfers and multi-team managers.
- **Assumption (safe default: deny when unknown)**: BM role from IAM; team membership from HR master data synced to IAM; membership as of request time; a BM with several teams must pick one of their own teams per export; unresolved team or role means no export (fail closed).
- **Impact if different**: Different source requires a new integration; point-in-time membership requires history and changes the query.
- **Owner**: Business, Security.

### OQ-4 Meaning and time zone of "last month"
- **Ambiguity**: "from last month" could mean previous calendar month or last 30 days; time zone not stated. [B2]
- **Why ask**: Changes the data window and boundary events.
- **Assumption**: Previous full calendar month in Asia/Ho_Chi_Minh.
- **Impact if different**: Rolling 30 days changes the query and file naming; UTC changes boundary rows by 7 hours.
- **Owner**: Business.

### OQ-5 5-second limit vs unbounded "everything"
- **Ambiguity**: "export everything they can see" vs "must complete within 5 seconds". [B5, B6]
- **Why ask**: Unbounded volume cannot guarantee a time; the limit's meaning (click to download? UI response?) is unclear.
- **Assumption**: Sync if <= N = 50,000 rows (N is an assumption, to be set from real volumes); above N async job; hard cap 1,000,000 rows.
- **Impact if different**: A strict 5 s for all sizes requires caps or pre-computed exports (pre-computed files would add stored personal data); a higher N or cap changes infrastructure sizing.
- **Owner**: Business, Security.

### OQ-6 "CSV like the old system"
- **Ambiguity**: No column list, delimiter, encoding or sample. [B2]
- **Why ask**: Downstream tools may depend on the old layout.
- **Assumption (safe default: minimal columns, masked)**: Section 5 format (UTF-8 BOM, comma, CRLF, columns as listed, +07:00 ISO timestamps). Old-system columns holding extra personal data are not added without DPO approval.
- **Impact if different**: Column set, delimiter (e.g. `;`), encoding or date format change; old-system columns containing more personal data would extend OQ-1.
- **Owner**: Business, DPO.

### OQ-7 "Kept forever" vs "delete personal data older than 12 months"
- **Ambiguity**: "Exported files are kept forever for audit, and the platform must delete personal data older than 12 months." [B7]
- **Why ask**: A kept file containing IP/username violates the 12-month rule; also unclear whether 12 months counts from event date or file creation, what "audit" requires, whether backups are covered, and whether staff actor IDs in audit may be kept forever.
- **Assumption (safe default: delete)**: Keep audit records and file metadata/hash forever (no exported-subject personal data in them); delete masked files at 12 months after the start of the exported period (event-age based); unmasked files after 7 days; Legal hold overrides; backups expire within 35 days and restores re-run deletion (needs DPO acceptance); source logs follow the source platform's rules.
- **Impact if different**: If files must be kept, they must be anonymized and Legal must accept it; if backups must also meet 12 months, shorter backup cycle or crypto-shredding is needed; the retention clock and job change.
- **Owner**: Legal, DPO.

### OQ-8 What does "leave the platform" mean
- **Ambiguity**: "no personal data may leave the platform unmasked." [B4]
- **Why ask**: If download to a personal device counts, masking is mandatory for any download; if only external transfer counts, an in-platform unmasked view may be acceptable.
- **Assumption (safe default: strictest reading)**: Any download to a user's device counts as leaving.
- **Impact if different**: A narrower reading could allow unmasked download to managed bank endpoints; a wider one could also restrict screen display.
- **Owner**: DPO, Security.

### OQ-9 Applicable legal and policy basis
- **Ambiguity**: "in line with our data-protection policy" names no policy. [B4]
- **Why ask**: Masking rules, purpose limitation, retention and cross-border rules depend on it.
- **Assumption (safe default: IP and username treated as personal data)**: Bank internal data-protection policy plus the Personal Data Protection Law (2025), Decree 13/2023/ND-CP and State Bank of Vietnam information-security regulations may apply; **Legal/DPO confirmation needed**. No article is asserted in this spec. Whether IP/username are personal data, and whether an impact assessment is needed, are also to be confirmed.
- **Impact if different**: Changes retention periods, consent/purpose records and possibly impact-assessment obligations.
- **Owner**: Legal, DPO.

### OQ-10 Who owns forensic use and approval
- **Ambiguity**: Forensic use is stated, but not by whom or who approves. [B3]
- **Why ask**: A branch manager is unlikely to be the right forensic actor and cannot approve their own access.
- **Assumption (safe default: deny unmasked)**: Security/Audit performs forensic requests; a different Security/Audit lead approves (four-eyes); BMs get masked only; until roles are assigned nobody can obtain unmasked data; audit reviewed by Auditor.
- **Impact if different**: If BMs need unmasked data, the approval chain (e.g. regional head + DPO) and BM access rights change.
- **Owner**: Security, Business.

### OQ-11 Encryption, watermark, download limits
- **Ambiguity**: Not mentioned; "Make it simple" argues against extras. [B8]
- **Why ask**: Files with personal data leave the system; the bank may require extra controls.
- **Assumption**: Encryption at rest and in transit, 24 h link expiry with per-download authorization, no watermark, no password-protected files, no download limit beyond one active link per file (re-download allowed within the 24 h).
- **Impact if different**: Watermarking and per-file encryption add processing time (affecting OQ-5) and key management.
- **Owner**: Security.

### OQ-12 What are "access logs"
- **Ambiguity**: "access logs" could be application login, VPN, or physical entry logs. [B2]
- **Why ask**: Determines source systems, columns and sensitivity.
- **Assumption**: Application login/access events already held by the log platform; VPN and physical access are out of scope.
- **Impact if different**: Extra sources require new columns, parsers and possibly separate owners.
- **Owner**: Business.

### Additional assumptions (no customer decision required unless objected)
- A-1: Single-tenant platform; one bank.
- A-2: Audit actor IDs are internal pseudonymous IDs (see OQ-7).
- A-3: Thresholds N = 50,000, hard cap 1,000,000 rows / 250 MB, link 24 h, 7-day unmasked retention, 3-day pending approval, yearly pseudonym key rotation, 35-day backup expiry are placeholders to be validated by load tests and policy; none come from the customer.

## Traceability

| Brief ref | Requirements | OQ |
|---|---|---|
| B1 | FR-1 | |
| B2 | FR-1, FR-2, FR-3, FR-5 | OQ-2, 3, 4, 6, 12 |
| B3 | FR-8 | OQ-1, 10 |
| B4 | FR-4, FR-8 | OQ-1, 8, 9 |
| B5 | FR-3 | OQ-2, 5 |
| B6 | FR-6 | OQ-5 |
| B7 | FR-7, FR-9, FR-10 | OQ-7, 9, 11 |
| B8 | FR-1, FR-11, scope | OQ-11 |
