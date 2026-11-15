# SPEC: Self-service "Log Export" (CSV) for the Log Platform

Status: DRAFT v0.1 for customer confirmation. Data classification of this document: internal.
All numeric thresholds are **working assumptions** (marked `[ASSUMPTION A-xx]`) and must be confirmed. All legal references are **to be confirmed by the bank's legal/compliance team**; this spec cites no specific regulation number and does not claim compliance with one.
All example values in this document are synthetic.

## 1. Context and goals

A Vietnamese bank uses the log platform to store access logs. Branch managers want a self-service **Log Export** button that produces last month's access logs for their team as CSV, "like the old system".

The brief contains conflicting requirements (full IP/username vs. no unmasked personal data; keep files forever vs. delete personal data after 12 months; "their team" vs. "everything they can see"; 5 seconds vs. everything). Each conflict is resolved here with a conservative working assumption and listed in section 13 for customer confirmation.

Goals (v1):
- G1. A branch manager can export last calendar month's access logs for their own branch/team in one click.
- G2. The CSV never contains raw (unmasked) client IP or raw username (see section 8).
- G3. Every export is audited; personal data is retained no longer than the configured limit.
- G4. Small exports finish within the 5-second target; large exports run asynchronously with a notification.

## 2. Non-goals (v1, applying "Make it simple")

- NG1. No unmasked export (no forensic role, no dual-approval workflow). Added later only if the customer confirms the need (OQ-01, OQ-02).
- NG2. No custom date range, filters, column picker, scheduling or recurring exports. Fixed scope: previous calendar month.
- NG3. No export formats other than CSV (no XLSX, JSON, PDF).
- NG4. No export for roles other than branch manager (OQ-04).
- NG5. No "legal hold" storage that is exempt from deletion.
- NG6. No e-mail delivery of the file. Download happens only through the platform.
- NG7. No migration of old-system exports or reproduction of old-system quirks beyond the agreed column layout (OQ-06).
- NG8. No new log-collection or log-parsing capability; the feature reads logs already in the platform.

## 3. Actors and permission model

| Actor | Description | Rights in v1 |
|---|---|---|
| Branch manager | Authenticated platform user holding the branch-manager role for one or more branches | May export the previous month's logs for the branch(es)/team they manage and can currently view |
| Other platform users | Any other role | Cannot see the Export button; direct API calls are rejected (HTTP 403) |
| Compliance/Audit | Internal audit function [ASSUMPTION A-12] | Read access to the export audit log and to stored export files within retention; no export rights |
| Platform administrator | Operates the platform | Configures thresholds and retention; cannot read export files by default |
| Forensic investigator | Mentioned only as a possible future role | Out of v1 (NG1) |

Authorization rule (server-side, deny by default):
`export scope = (logs the user is currently allowed to view) ∩ (branch(es)/team the user manages per the identity source) ∩ (previous calendar month, Asia/Ho_Chi_Minh)`.
Role and branch membership are read from the bank's identity source (assumed IAM/AD, OQ-09). The client never supplies the scope; any client-supplied branch/team/date parameter is ignored or rejected. "Everything they can see" is interpreted as "never more than this intersection".

## 4. Definitions

- **Last month / previous month**: the previous full calendar month in time zone `Asia/Ho_Chi_Minh` (UTC+07:00): from the 1st day 00:00:00.000 inclusive to the 1st day of the current month 00:00:00.000 exclusive. Example: a request made on 2026-11-02 covers 2026-10-01T00:00:00+07:00 up to but excluding 2026-11-01T00:00:00+07:00. (OQ-05)
- **Team**: all users belonging to the branch(es) the manager manages in the identity source; to be confirmed (OQ-03).
- **Sync export**: result produced within the HTTP request. **Async export**: job run in the background, user notified.
- **Masked IP**: IPv4 truncated to /24 (last octet replaced by `0`), IPv6 truncated to /48.
- **Pseudonymised username**: keyed hash of the username (section 8).

## 5. User stories and acceptance criteria

**US-1 Export last month (Must).** As a branch manager, I want to click "Log Export" to get last month's access logs for my team as CSV, so that I can review team activity without asking IT.
- AC-1.1 Given I am a branch manager of branch B and logs exist, when I click Export, then I receive a CSV containing only events of branch B dated within the previous calendar month (Asia/Ho_Chi_Minh).
- AC-1.2 Given the row count is at or below the sync limit (A-01), when I click Export, then the download starts within 5 seconds at the agreed reference load (A-03).
- AC-1.3 Given the previous month has zero events for my scope, when I click Export, then I get a CSV with only the header row and a message "No events in the period".

**US-2 Large export (Must).** As a branch manager, I want large exports to run in the background, so that I am not blocked or timed out.
- AC-2.1 Given the matching row count exceeds the sync limit (A-01) and is at or below the hard cap (A-02), when I click Export, then I see "Export in progress", the job is queued, and I am notified in the platform when ready.
- AC-2.2 Given the row count exceeds the hard cap, when I click Export, then no file is created and I see an error explaining the cap and who to contact (FR-13).
- AC-2.3 Given an async job finished, when I open the notification, then I can download the file once, within the link lifetime (A-05).

**US-3 Privacy by default (Must).** As the bank's data-protection owner, I want no raw IP or username in exported files, so that no unmasked personal data leaves the platform.
- AC-3.1 Given any export, when I inspect every row, then no IP has a non-zero host part (IPv4 last octet is `0`; IPv6 bits beyond /48 are zero) and no raw username appears.
- AC-3.2 Given two rows of the same user in the same export, then both show the same pseudonym; given the same user in a different month, then the pseudonym differs (A-08).

**US-4 Scope enforcement (Must).** As a security officer, I want exports restricted to the requester's scope, so that no manager can read another branch's logs.
- AC-4.1 Given I manage branch A, when I call the export endpoint with branch B's identifier, then the request is rejected (403) and the attempt is audited.
- AC-4.2 Given I lose the branch-manager role, when I request an export, then it is rejected, and an in-flight async job for me is cancelled or its file made undownloadable.

**US-5 Audit (Must).** As an auditor, I want a record of every export, so that I can prove who exported what and when.
- AC-5.1 Given any export request (success, failure, or denied), then an audit record exists with the fields in section 11.
- AC-5.2 Given a stored file, when I recompute its SHA-256, then it matches the audit record.

**US-6 Safe opening in Excel (Must).** As a branch manager, I want the CSV to open correctly in Excel with Vietnamese text and no code execution.
- AC-6.1 Given a field value `=1+1`, `+x`, `-x`, `@x`, or starting with tab/CR, when exported, then the cell is neutralised per FR-9.
- AC-6.2 Given Vietnamese text (e.g. "Chi nhánh Hà Nội"), when the file is opened in Excel, then diacritics display correctly.

**US-7 Retention (Must).** As compliance, I want export files deleted on schedule while the audit evidence is kept.
- AC-7.1 Given a file older than the file retention limit (A-06), then a scheduled job deletes it and writes a deletion record.
- AC-7.2 Given a file deleted, then the audit record remains and contains no raw personal data.

## 6. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | The UI shall show an "Export logs (last month)" button to users holding the branch-manager role; other users do not see it. | Must |
| FR-2 | The server shall compute the export scope per section 3 and period per section 4; client input for scope/period is ignored. | Must |
| FR-3 | The server shall authorise every export and download request (deny by default), including cross-branch (IDOR) checks. | Must |
| FR-4 | The server shall count matching rows before generating; ≤ sync limit → sync path; > sync limit and ≤ hard cap → async path; > hard cap → reject. | Must |
| FR-5 | Async jobs shall run in the background, survive page reload, and notify the requester in the platform on completion or failure. | Must |
| FR-6 | The CSV shall follow section 7. | Must |
| FR-7 | IP and username shall be masked per section 8 before leaving the data store layer; raw values must not be written to the file, temp files, or logs. | Must |
| FR-8 | Files shall be written UTF-8 with BOM, CRLF line endings, RFC 4180 quoting. | Must |
| FR-9 | Formula-injection protection: any text cell whose first character is `=`, `+`, `-`, `@`, TAB or CR shall be prefixed with a single quote `'` and then quoted per RFC 4180. | Must |
| FR-10 | Download links shall be single-use, expire after the link lifetime (A-05), bound to the requesting user's authenticated session. | Must |
| FR-11 | Files shall be encrypted at rest and transferred over TLS. | Must |
| FR-12 | The system shall limit exports per user (A-04) and reject excess with a clear message. | Should |
| FR-13 | Error states per section 10 shall be shown. | Must |
| FR-14 | Each export attempt shall be audited per section 11. | Must |
| FR-15 | Retention and deletion jobs shall follow section 9; limits shall be configuration, not code. | Must |
| FR-16 | The platform shall prevent concurrent exports by the same user beyond one active job (A-04). | Should |
| FR-17 | Test/UAT environments shall use synthetic or masked data only. | Must |

## 7. CSV specification

Old-system sample file is **not yet provided**; the layout below is a working assumption until we receive it (OQ-06).

- Encoding: UTF-8 with BOM. Delimiter: comma. Line ending: CRLF. Header row: always present. Quote: `"`, doubled to escape; fields containing comma, quote, CR/LF are quoted.
- File name: `log-export_<branchCode>_<YYYY-MM>_<requestId>.csv` (month in Asia/Ho_Chi_Minh). Branch code is not personal data.
- Timestamps: ISO 8601 with offset, e.g. `2026-10-15T09:30:12+07:00`.
- Columns (order fixed), source field names are assumptions pending the log schema (OQ-06):

| # | Column | Content |
|---|---|---|
| 1 | event_time | ISO 8601 `+07:00` |
| 2 | branch_code | Branch identifier |
| 3 | user_pseudonym | Keyed hash of username (section 8) |
| 4 | client_ip_masked | IPv4 /24 or IPv6 /48 form |
| 5 | action | e.g. login, view, search (as stored) |
| 6 | resource | Target resource/path as stored |
| 7 | result | success / failure |
| 8 | source_system | Originating application |

- Free-text columns (action, resource, source_system) are untrusted: apply FR-9 and strip control characters other than TAB/CR/LF inside quoted text (those leading characters handled by FR-9).
- Free-text columns may themselves contain personal data (e.g. usernames inside a URL). Assumption: such content is in scope for masking; if discovered, the column is excluded from v1 until a rule is agreed (OQ-01).
- Row order: `event_time` ascending, ties by event id.

## 8. Masking and pseudonymisation rules (default, v1)

| Field | Rule | Notes |
|---|---|---|
| Client IP | IPv4 → /24 (`203.0.113.57` → `203.0.113.0`); IPv6 → /48 | Loses host-level precision; may be insufficient for forensics (OQ-01) |
| Username | HMAC-SHA-256 with a secret key held in the platform's KMS/HSM; output hex truncated to 16 chars [ASSUMPTION A-07]; key never exported | Still personal data (pseudonymised), not anonymised |
| Key scope | Key (or salt) rotates per export month [ASSUMPTION A-08] so pseudonyms are stable within a month for a user but not linkable across months | Confirm whether cross-month linkage is required |

The platform can re-identify a pseudonym internally for an authorised investigation through its own tooling (outside this feature). Unmasked export is **out of v1**; if the customer requires it, it will be specified as a separate feature (forensic role, dual approval with ticket/reason, encrypted file, short-lived link, full audit).

## 9. Retention and deletion

Separate three data sets:

| Data set | Content | Retention (working assumption) |
|---|---|---|
| Source access logs | Original IP/username | Personal data deleted at 12 months from event time [ASSUMPTION A-09]; the customer must confirm if this applies to source logs, export files, or both (OQ-08) |
| Export files | Masked CSV (still personal data) | Stored encrypted in the platform; deleted at the earlier of 12 months after export and deletion of the source data they derive from [ASSUMPTION A-06]; configurable. Not kept "forever". Users cannot keep the platform copy; downloaded copies are the user's responsibility (OQ-07) |
| Export audit log | Who, when, scope, row count, SHA-256, result | Kept long-term (assumed "forever" or per banking audit rules, A-10), append-only; contains no raw IP/username; user ID is an employee code |

This reconciles "kept forever for audit" (audit log + hash, which proves what was exported) with "delete personal data older than 12 months" (file content). Deletion jobs run daily, write a deletion record, and are idempotent. Backups follow the same retention (OQ-08).

## 10. UI and error states (minimal)

One button, "Export logs (last month)", with these states:

| State | Display |
|---|---|
| Idle | Button enabled, helper text showing the period, e.g. "01/10/2026 – 31/10/2026" |
| Working (sync) | Button disabled, spinner |
| Queued/running (async) | "Export in progress, we will notify you"; button disabled while a job is active |
| Ready | Notification with a Download link and its expiry time |
| Empty | "No events in the period" (header-only file offered or not, see AC-1.3) |
| Too large | "Too many rows (over cap). Contact the platform team" |
| Rate limited | "Daily export limit reached" |
| Forbidden | "You do not have permission" (and audit) |
| Link expired/used | "Link expired. Request a new export" |
| Failed | "Export failed. Reference: <requestId>" without internal details |

UI language: Vietnamese primary with English fallback [ASSUMPTION A-11] (OQ-10). Strings are externalised.

## 11. Audit logging

Every request (success, failure, denied, download, expiry, deletion) writes an append-only record with: requestId, UTC timestamp, requester employee code, role, branch/team scope, period, sync/async, row count, file SHA-256, file size, outcome/error code, download events (time, outcome), deletion event. No raw IP/username and no file content. Records are tamper-evident (access restricted; write-only for the application). Retention per A-10 (OQ-11).

## 12. Non-functional requirements

| ID | Requirement | Threshold |
|---|---|---|
| NFR-1 | Sync export completes (click to download start) within 5 seconds at p95 | ≤ **50,000 rows** [A-01], reference load **10 concurrent exports** [A-03] |
| NFR-2 | Hard row cap per export | **1,000,000 rows** [A-02] |
| NFR-3 | Async export completes | within **15 minutes** at p95 for ≤ cap [A-13] |
| NFR-4 | Rate limit | **5 exports/user/day**, 1 active job per user [A-04] |
| NFR-5 | Download link lifetime | **15 minutes**, single use [A-05] |
| NFR-6 | Security | Encryption at rest and TLS; server-side authz; no raw personal data in app logs |
| NFR-7 | Availability | Same as the log platform; the export must not degrade log ingestion or search (job isolation/low priority) |
| NFR-8 | Memory | Stream rows; no full in-memory result set |
| NFR-9 | Test data | Synthetic only (FR-17) |

How "5 seconds" and "export everything" are reconciled: the 5-second target is guaranteed only up to the sync limit; beyond it the system goes async rather than missing the target or truncating data silently. The sync limit is derived from the unknown data volume and must be validated by a performance test (OQ-07 in the "Open questions and assumptions" section).

## Open questions and assumptions

| ID | Question to confirm with customer | Why it matters / conflict | Working assumption |
|---|---|---|---|
| OQ-01 | Must the export contain full client IP and username ("forensic use"), or masked? Is masked IP/username acceptable? Are IP and username personal data under the bank's policy? | Direct conflict: "full client IP addresses and usernames" vs. "no personal data may leave the platform unmasked". Defines the whole data design. | IP and username are personal data. Export is always masked: IPv4 /24, IPv6 /48, username HMAC pseudonym (A-07, A-08). No unmasked export in v1. |
| OQ-02 | If forensic users need unmasked data: who, what approval, which channel, can the file leave the platform? | Needed only if OQ-01 answer is "full". Affects roles, approval, storage. | Out of v1. Would be a separate feature (forensic role + dual approval + encrypted short-lived file). Alternative: view-in-platform only. |
| OQ-03 | What is a "team": branch, department, reporting line, or group in the identity source? Does a manager manage one or several branches? | "Their team's logs" vs. "everything they can see". Wrong scope means a data leak or an empty export. | Team = all users of the branch(es) the manager manages in IAM/AD. |
| OQ-04 | Who else may export ("Users should be able to export everything they can see")? Only branch managers, or every role? | Brief says both "branch managers" and "users". Over-broad rights breach least privilege. | Only branch managers. Export scope is the intersection in section 3, so "everything they can see" never exceeds team + last month. Other roles: no access. |
| OQ-05 | "Last month": previous calendar month or last 30 days? Which time zone for month boundaries and for timestamps in the file? | Changes row set and file content; stored timestamps may be UTC. | Previous calendar month, Asia/Ho_Chi_Minh (UTC+07:00), timestamps ISO 8601 `+07:00` (section 4). |
| OQ-06 | Please provide a sample of the old system's CSV: columns, order, delimiter, encoding, date format, header language. Are there downstream tools reading it? | "Like the old system" is undefined; the layout in section 7 is invented. Also, fields in the platform log schema are not yet confirmed. | Layout of section 7; UTF-8 BOM, comma, ISO 8601. Final layout adjusted after receiving the sample. |
| OQ-07 | What data volume must the 5-second limit apply to (rows per month per branch, concurrent users, peak time)? Does "within 5 seconds" mean time to first byte or complete file? Is async acceptable for large exports? | "Complete within 5 seconds" conflicts with "export everything". Unknown volume makes the target unverifiable. | 5 s applies to ≤ 50,000 rows at 10 concurrent exports (A-01, A-03); above that async with notification; hard cap 1,000,000 rows (A-02). Thresholds are placeholders to be validated by a performance test. |
| OQ-08 | Where are export files stored, who keeps them, and for how long ("kept forever for audit") versus "delete personal data older than 12 months"? Does the 12-month deletion apply to source logs, export files, or both (and backups)? | Direct conflict: files holding personal data kept forever vs. mandatory deletion. | Audit log (metadata + SHA-256, no raw personal data) kept long-term (A-10); export files kept encrypted in the platform for at most 12 months from export and no longer than their source data (A-06); 12-month deletion applies to source logs and export files, including backups on their normal cycle (A-09). Retention periods are configuration. |
| OQ-09 | What is the source of roles and branch membership (IAM/AD/HR system), how is a user identified (employee code, login), and how fresh is the mapping? | Authorisation correctness and audit identity. | IAM/AD is the source of truth, read on each request; users identified by employee code. |
| OQ-10 | UI language and notification channel (Vietnamese, English; in-platform only or also e-mail)? | UI strings, accessibility, and risk of files/data links being e-mailed. | Vietnamese primary with English fallback (A-11); in-platform notification only (NG6). |
| OQ-11 | Audit requirements for export: required fields, retention period, who reads it, whether it must go to the bank's SIEM? | Brief only says "kept for audit"; the evidence required is undefined. | Section 11 fields, append-only, no raw personal data, retained per A-10, readable by Compliance/Audit. |
| OQ-12 | Which legal basis and internal policies apply (personal data protection law and decree, State Bank information-security rules, the bank's own data-protection policy, ATTT level of the system)? Is a data-protection impact assessment required? Is storage/processing in Vietnam only? | Determines masking level, retention, incident reporting. We cite no specific regulation in this spec. | Most conservative reading: logs are personal data; masking and retention are configurable; processing stays within Vietnam; no compliance claim until legal confirms in writing. |
| OQ-13 | Is a rate limit and a max file size acceptable for self-service export, and who is notified of unusual export patterns? | Mass export is a leakage channel; not in the brief. | 5 exports/user/day, 1 active job (A-04); unusual patterns are visible in the audit log only (no alerting in v1). |
| OQ-14 | "Make it simple": does the customer accept the fixed scope (no filters, no date picker, no unmasked variant) for v1? | Simplicity conflicts with forensic and "export everything" needs. | Yes; v1 non-goals NG1–NG8 apply. |

### Named assumptions (thresholds and parameters)

| ID | Assumption | Value |
|---|---|---|
| A-01 | Sync export row limit | 50,000 rows |
| A-02 | Hard cap per export | 1,000,000 rows |
| A-03 | Reference load for the 5-second target | 10 concurrent exports, normal production hardware (unverified) |
| A-04 | Rate limit | 5 exports/user/day; 1 active job per user |
| A-05 | Download link lifetime | 15 minutes, single use |
| A-06 | Export file retention | ≤ 12 months from export and ≤ source data lifetime |
| A-07 | Username pseudonym | HMAC-SHA-256, key in KMS/HSM, 16 hex chars |
| A-08 | Pseudonym key scope | Rotates monthly |
| A-09 | Personal data deletion | 12 months from event time, for source logs and export files |
| A-10 | Audit log retention | Long-term/indefinite, subject to confirmation |
| A-11 | UI language | Vietnamese primary, English fallback |
| A-12 | Audit/compliance function exists and can own export-file custody | Yes |
| A-13 | Async completion target | 15 minutes at p95 |

## 14. Traceability: brief sentence → requirement → open question

| Brief sentence | FR / NFR | Open question |
|---|---|---|
| "self-service 'Log Export' button" | FR-1, FR-4, FR-5, UI section 10 | OQ-14 |
| "Branch managers can export their team's access logs" | FR-1, FR-2, FR-3, section 3 | OQ-03, OQ-04, OQ-09 |
| "from last month" | FR-2, section 4 | OQ-05 |
| "as CSV like the old system" | FR-6, FR-8, FR-9, section 7 | OQ-06 |
| "full client IP addresses and usernames for forensic use" | FR-7, section 8 (masked by assumption) | OQ-01, OQ-02 |
| "no personal data may leave the platform unmasked" | FR-7, FR-10, FR-11, section 8 | OQ-01, OQ-12 |
| "export everything they can see" | FR-2, FR-3, FR-4 | OQ-04, OQ-03 |
| "must complete within 5 seconds" | FR-4, FR-5, NFR-1, NFR-2, NFR-3 | OQ-07 |
| "files are kept forever for audit" | FR-14, FR-15, section 9, section 11 | OQ-08, OQ-11 |
| "delete personal data older than 12 months" | FR-15, section 9, AC-7.1 | OQ-08, OQ-12 |
| "Make it simple" | Section 2 (non-goals), section 10 | OQ-14 |
| (implicit) abuse and leakage controls | FR-3, FR-10, FR-11, FR-12, FR-16, NFR-4 | OQ-13 |

## 15. Acceptance and verification plan (summary)

Controls to be tested with real results before release: formula injection (payload set `=`, `+`, `-`, `@`, TAB, CR); masking correctness; cross-branch authorisation (IDOR); link expiry and single use; audit record completeness; encryption at rest; rate limit; sync timing at A-01/A-03; retention job behaviour. Legal confirmation of OQ-01, OQ-08 and OQ-12 is a precondition for release.
