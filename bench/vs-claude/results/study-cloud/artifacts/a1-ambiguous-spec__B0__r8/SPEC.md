# SPEC — Log Export (self-service CSV export of access logs)

Status: DRAFT for customer confirmation. Data classification of this document: internal. All examples use fake usernames and IPs from the documentation range 192.0.2.0/24. No real personal data appears here.

## 1. Overview and goals

The customer (a Vietnamese bank) wants a self-service "Log Export" button so branch managers can export their team's access logs for last month as CSV, "like the old system", without filing a request to IT.

Goals:
- G1. One-click export of the previous calendar month for the manager's own team.
- G2. Personal data (client IP, username) is masked by default in every file that is downloaded.
- G3. Every export attempt is audited; the audit record is kept permanently and contains no personal data.
- G4. Files containing personal data are deleted by the 12-month rule.
- G5. Fast: synchronous within 5 seconds for normal volumes; asynchronous job beyond a threshold.

"Make it simple" is applied to the UI (one button, safe defaults), not to the controls. MVP only: no features beyond the brief.

### 1.1 Contradictions found in the brief

The brief cannot be built as written. The following are resolved by temporary assumptions listed in "Open questions and assumptions" (Q1–Q5 correspond to C1–C5).

| ID | Brief says | Conflicts with | Temporary resolution |
|---|---|---|---|
| C1 | "must contain full client IP addresses and usernames for forensic use" | "no personal data may leave the platform unmasked" | Masked by default. Unmasked only via a separate, two-person-approved forensic flow. Downloading to a user's device counts as "leaving the platform". |
| C2 | "export their team's access logs from last month" (branch managers) | "Users should be able to export everything they can see" | Export = intersection of the caller's view permission, the caller's team, and the previous calendar month. Branch Manager role only. |
| C3 | "must complete within 5 seconds" | Unbounded data volume, masking and audit overhead | Hybrid: synchronous up to N rows (N = 50,000, assumed) with p95 ≤ 5 s; above N an asynchronous job with notification. |
| C4 | "Exported files are kept forever for audit" | "delete personal data older than 12 months" | Keep forever the audit record (metadata + file hash, no personal data). Files containing personal data are deleted at 12 months. |
| C5 | "older than 12 months" | Reference point is undefined (event time vs file creation time) | Earlier of: 12 months after the oldest event in the file, or 12 months after file creation. |

Further ambiguities: "like the old system" (format unknown), "access logs" (which log source), "team" (hierarchy source unknown), "last month" (time zone), "Make it simple" vs required controls. See the open questions section.

## 2. Scope

In scope (MVP):
- Export button and flow for the Branch Manager (masked CSV, previous calendar month, own team).
- Asynchronous fallback for large exports with in-app notification.
- Forensic unmasked export flow with request, reason, second-person approval, short-lived single-use link.
- Audit logging of every export attempt and download; retention and deletion jobs.

Out of scope:
- Other formats (XLSX, JSON), custom date ranges, scheduled/recurring exports, e-mail delivery of files.
- Export by roles other than Branch Manager (except the forensic and auditor flows defined here).
- Cross-team or cross-branch export, bulk export of the full platform.
- Changing how access logs are collected or the log source's own retention.
- Redesign of the existing permission model; building the organization hierarchy (only consumed).

## 3. Actors and roles

| Actor | Description | Rights |
|---|---|---|
| Branch Manager (BM) | Manages one team/branch | See Export button; export masked CSV of own team, previous month. Cannot see unmasked data. |
| Forensic/Security Investigator (FI) | Dedicated `forensic` role, never assigned to a BM | Request an unmasked export with reason and case number. Cannot approve own request. |
| Approver | A second person with the `export_approver` role (assumed), different from the requester | Approve or reject unmasked requests. |
| Auditor | Internal audit/compliance | Read-only access to audit records and file hashes. Cannot download files containing personal data. |
| System | Export service, retention job | Generates files, applies masking, runs deletion. |

## 4. Functional requirements

### 4.1 Button and scope

- FR-1. The Export button is shown only to users with the Branch Manager role. For other roles the button is hidden and the endpoint rejects the call (403).
- FR-2. The default filter is the previous calendar month in Asia/Ho_Chi_Minh (UTC+7): from 00:00:00 on the 1st to 23:59:59.999 on the last day of that month, evaluated at request time. The user cannot change it in the MVP. Example: a request on 2026-11-03 exports 2026-10-01 00:00 to 2026-10-31 23:59:59.999 (UTC+7).
- FR-3. Data scope is enforced on the server: rows = access logs the caller is permitted to view AND belonging to the caller's team AND inside the FR-2 range. Team and range are never taken from client parameters. Tampering with a team ID returns 403 and is audited.
- FR-4. A user may run at most 5 export requests per hour and have 1 active asynchronous job at a time (assumed limits, configurable).

### 4.2 CSV format

Final column list depends on the old system's sample (Q7). Assumed columns:

| # | Column | Notes |
|---|---|---|
| 1 | `event_time` | ISO 8601 with +07:00 offset |
| 2 | `username` | masked per FR-9 (default) |
| 3 | `client_ip` | masked per FR-8 (default) |
| 4 | `action` | e.g. LOGIN, VIEW |
| 5 | `resource` | accessed resource/path, sanitized per FR-7 |
| 6 | `result` | SUCCESS / FAILURE |
| 7 | `source_system` | log source name |
| 8 | `export_id` | watermark, same value on every row |

- FR-5. File format: UTF-8 with BOM, delimiter `,`, row terminator CRLF, quoting per RFC 4180 (fields containing `,`, `"`, CR or LF are quoted; `"` doubled), one header row with the exact column names above, no footer. File name: `access-log_<team-code>_<YYYY-MM>_<export_id>.csv`.
- FR-6. Download is served with `Content-Disposition: attachment`, `Content-Type: text/csv; charset=utf-8`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- FR-7. Formula-injection protection: any text field whose first character is `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'` before CSV quoting. Applies to every text column, including masked values and the header-independent `resource`. Pseudonyms (FR-9) must not start with those characters.
- FR-11. Every row carries `export_id` (watermark) so a leaked file can be traced to the export and the requester through the audit record. The requester's identity is not written in the file.

### 4.3 Masking

- FR-8. IP masking (default): IPv4 keeps the first three octets and replaces the last with `xxx` (192.0.2.57 becomes `192.0.2.xxx`). IPv6 keeps the first 48 bits (assumed) and replaces the rest with `xxxx`.
- FR-9. Username masking (default): replaced by a stable pseudonym `u_` + first 12 hex chars of HMAC-SHA256(key, lower-cased username). The key is held in a KMS/HSM, never in the file, code or logs, and is rotated per the bank's policy. Same user gives the same pseudonym within a key version so patterns remain analysable. The key version is recorded in the audit record.
- FR-10. Unmasked export (forensic flow): FI submits a request with case number and reason; a different Approver approves; the system generates the file (full IP, full username); a single-use download link valid for 24 hours (assumed) is issued to the FI only; the file is encrypted at rest. Both steps are audited. A BM can never request or download an unmasked file.

### 4.4 Sync / async execution

- FR-12. On request the service estimates the row count. If ≤ N (N = 50,000, assumed) it generates and streams the file synchronously. If > N it creates an asynchronous job, returns the job ID immediately (≤ 1 s) and shows "Export is being prepared".
- FR-13. When an asynchronous job finishes, the user gets an in-app notification (e-mail only if the customer confirms, Q13) with a download link usable only by the same user. Jobs are rejected if the estimate exceeds the hard cap of 1,000,000 rows (assumed), with a message to contact the platform administrator; the file is never silently truncated.
- FR-14. The UI shows status: Preparing, Ready, Failed, Expired.

### 4.5 Audit logging

- FR-15. Every export attempt creates an audit record, including rejected, failed, approval, rejection and download events. Fields: `audit_id`, `export_id`, event type, requester ID (internal user ID, not name), role, team ID, period, mask mode, row count, key version, SHA-256 of the file, approver ID (if any), case number and reason (forensic flow), outcome/error code, timestamps, and the requester's IP in masked form.
- FR-16. Audit records are append-only (WORM or equivalent), contain no client IP or username from the exported data, and are retained permanently (subject to Q20). Raw personal data is never written to application logs.

### 4.6 Retention and deletion

- FR-17. Two tiers: (a) the file containing personal data is deleted at the earlier of 12 months after the oldest event in the file or 12 months after file creation; (b) the audit record is permanent.
- FR-18. A daily deletion job removes expired files and every copy under the platform's control (object store, cache, temp files), and writes a deletion-evidence audit record (file hash, time, job ID). Backup copies expire per the backup cycle (Q10).
- FR-19. Expired unmasked links are invalidated at expiry; their files are deleted 7 days after creation unless the customer says otherwise (assumed).

## 5. Data protection and masking rules

- DP-1. Client IP and username are personal data; pseudonymised values remain personal data and are handled as such, including deletion at 12 months.
- DP-2. Assumed definition: downloading a file to a user's device counts as "leaving the platform" (Q8). Therefore every file delivered to a browser is masked by default.
- DP-3. Unmasked data is limited to the forensic flow (FR-10): purpose-bound, two-person approval, audited, short-lived.
- DP-4. Data minimisation: only the columns in 4.2 are exported.
- DP-5. Files are encrypted in transit (TLS) and at rest (AES-256 or the bank's approved equivalent), stored on platform storage in Vietnam (assumed, Q12).
- DP-6. DEV/UAT use synthetic data only.
- DP-7. Legal basis is pending confirmation (Q11). The design follows the strictest reading: mask by default, delete at 12 months, immutable audit.

## 6. Non-functional requirements

- NFR-1. Performance: for synchronous exports (≤ N rows) p95 time from click to first byte ≤ 2 s and to completion ≤ 5 s, measured on an environment representative of production with 50,000 rows including masking and audit write. Asynchronous request acknowledgement ≤ 1 s. Asynchronous completion target: ≤ 5 minutes for 1,000,000 rows (target, unverified).
- NFR-2. "5 seconds" is interpreted as the synchronous path's completion time, not a guarantee for all volumes (Q3).
- NFR-3. Security: server-side authorization on every call, no IDOR, CSRF protection, rate limits per FR-4.
- NFR-4. Availability and capacity of the export service: not specified; assumed same as the host platform (Q22).
- NFR-5. Streaming generation so memory use is bounded and independent of row count.
- NFR-6. Accessibility/Localization: UI labels in Vietnamese and English (assumed).

## 7. Error states

| ID | Condition | Behaviour |
|---|---|---|
| E-1 | User lacks Branch Manager role | 403, button hidden, attempt audited |
| E-2 | Team ID in request does not match caller's team | 403, audited |
| E-3 | No rows in previous month | 200 with header-only CSV and message "No records for the period"; audited with row count 0 |
| E-4 | Estimate exceeds hard cap | Request rejected with clear message, nothing truncated, audited |
| E-5 | Rate limit or concurrent job limit hit | 429 with retry time |
| E-6 | Generation fails or exceeds the timeout (e.g. 60 s sync) | Sync switches to an async job; if the job fails, status Failed, no partial file kept, audited |
| E-7 | Log source or org hierarchy source unavailable | 503, "Export is temporarily unavailable"; audited |
| E-8 | Masking key unavailable | Fail closed: no export is produced, never fall back to unmasked |
| E-9 | Link expired or already used | 410 with guidance to request again |
| E-10 | Approver equals requester | Rejected, audited |
| E-11 | Download by a different user than the owner | 403, audited |

## 8. Acceptance criteria

| AC | Traces to | Given / When / Then |
|---|---|---|
| AC-1 | FR-1, E-1 | Given a user without Branch Manager role, When they open the page, Then no Export button is shown; and When they call the endpoint directly, Then they get 403 and an audit record is created. |
| AC-2 | FR-2 | Given the current date 2026-11-03 10:00 (UTC+7), When a BM exports, Then all rows have event_time between 2026-10-01T00:00:00+07:00 and 2026-10-31T23:59:59.999+07:00 and no others. |
| AC-3 | FR-2 | Given an event at 2026-10-31T23:30:00+07:00 (16:30 UTC) and one at 2026-11-01T00:30:00+07:00, When a BM exports on 2026-11-03, Then the first is included and the second is not. |
| AC-4 | FR-3, E-2 | Given a BM of team A and logs of teams A and B, When the BM exports, Then the file contains only team A rows; and When the request is altered to team B, Then the response is 403 and audited. |
| AC-5 | FR-3 | Given a BM who lacks view permission on a source in team A, When they export, Then rows from that source are absent. |
| AC-6 | FR-5 | Given an export, When the file bytes are inspected, Then the first 3 bytes are EF BB BF, delimiter is `,`, line endings CRLF, row 1 is the exact header, and a parser using RFC 4180 reads every row with the header's column count. |
| AC-7 | FR-5 | Given a resource value `a,"b"` and a line break inside a field, When exported, Then the field is quoted with doubled quotes and parses back to the original. |
| AC-8 | FR-6 | Given a download response, Then headers match FR-6. |
| AC-9 | FR-7 | Given log rows whose resource/username start with `=`, `+`, `-`, `@`, TAB or CR (e.g. `=HYPERLINK("http://example.invalid")`), When exported, Then each cell begins with `'`; an automated test over all 6 prefixes passes, and the value is not evaluated as a formula when opened in a spreadsheet. |
| AC-10 | FR-8 | Given client IP 192.0.2.57, When exported by a BM, Then client_ip is `192.0.2.xxx`; no full IPv4 address appears anywhere in the file (regex check returns zero matches for `\b\d+\.\d+\.\d+\.(?!xxx)\d+\b`). |
| AC-11 | FR-9 | Given username `fake.user01`, When exported twice in the same key version, Then both files show the same `u_<12 hex>` pseudonym, the raw username does not appear in the file, and after key rotation the pseudonym differs. |
| AC-12 | FR-10, E-10 | Given an FI request, When the same user tries to approve it, Then it is rejected; When a different Approver approves, Then a single-use link valid ≤ 24 h is issued to the FI only and the file has full values. |
| AC-13 | FR-10 | Given a BM, When they try to request or download an unmasked file, Then 403 and audit. |
| AC-14 | FR-11 | Given an export with `export_id` X, Then every row contains X and the audit record for X identifies the requester. |
| AC-15 | FR-12, NFR-1 | Given a team with 50,000 rows in the period, When a BM exports in the test environment, Then p95 over 20 runs is ≤ 5 s to completion. |
| AC-16 | FR-12, FR-13, FR-14 | Given a team with 200,000 rows, When a BM exports, Then the response arrives ≤ 1 s with a job ID, status goes Preparing then Ready, a notification is delivered, and only that user can download. |
| AC-17 | FR-13, E-4 | Given an estimate of 1,000,001 rows, When requested, Then the request is rejected with a message and no file is produced. |
| AC-18 | FR-4, E-5 | Given a user who made 5 requests in an hour, When they make a 6th, Then they get 429. |
| AC-19 | FR-15, FR-16 | Given any attempt (success, failure, rejection, download, approval), Then exactly one audit record with the FR-15 fields is written; a search of audit records and application logs for the test IP/username strings returns no matches. |
| AC-20 | FR-16 | Given an audit record, When an update or delete is attempted by any application account, Then it is refused. |
| AC-21 | FR-17 | Given a file created 2026-11-03 whose oldest event is 2026-10-01, Then its deletion date is 2027-10-01 (earlier of 2027-10-01 and 2027-11-03); the audit record remains after deletion. |
| AC-22 | FR-18 | Given a file past its deletion date, When the daily job runs, Then the file and platform-held copies are gone, the download returns 410, and a deletion-evidence record exists. |
| AC-23 | E-3 | Given a month with no rows, Then the CSV contains only the header and the UI shows the message. |
| AC-24 | E-6, E-7, E-8 | Given log source down, masking key unavailable, or generation failure, Then no file with unmasked or partial data is delivered, the user sees the matching message, and the failure is audited. |
| AC-25 | E-9, E-11 | Given an expired or used link, or a different user, Then 410 or 403 respectively. |
| AC-26 | FR-19 | Given a forensic link not downloaded within 24 h, Then it is invalid and the file is deleted by day 7. |
| AC-27 | DP-5 | Given stored files, Then they are encrypted at rest and served only over TLS. |

Traceability: FR-1→AC-1; FR-2→AC-2,3; FR-3→AC-4,5; FR-4→AC-18; FR-5→AC-6,7; FR-6→AC-8; FR-7→AC-9; FR-8→AC-10; FR-9→AC-11; FR-10→AC-12,13; FR-11→AC-14; FR-12→AC-15,16; FR-13→AC-16,17; FR-14→AC-16; FR-15→AC-19; FR-16→AC-19,20; FR-17→AC-21; FR-18→AC-22; FR-19→AC-26; E-1…E-11→AC-1,4,12,17,18,23,24,25.

## 9. Priorities (MoSCoW)

- Must: FR-1 to FR-9, FR-11 to FR-18, error states E-1 to E-9, E-11.
- Should: FR-10 forensic flow in MVP if the customer confirms it is needed now (Q1); FR-19.
- Won't (MVP): other formats, custom ranges, e-mail delivery, scheduled exports.

## Open questions and assumptions

Each item must be confirmed with the customer before building. "Impact" is what changes if the assumption is wrong.

**Q1. (C1) Full IP/username vs masking.**
- Question: Which applies when they conflict? Who may receive unmasked data?
- Reason: "Exports must contain full client IP addresses and usernames for forensic use" vs "no personal data may leave the platform unmasked".
- Assumption: Masked by default for all; unmasked only through the forensic flow (FR-10).
- Impact: If full data is required for BMs, the data-protection policy is violated and the design needs a legal exception; if masking alone suffices, FR-10 and the approval workflow can be dropped (less work).

**Q2. (C2) Scope: "team's logs" vs "everything they can see".**
- Question: Is scope the team only, or all data the user can view? Which roles besides Branch Manager ("Users")?
- Reason: "Branch managers can export their team's access logs" vs "Users should be able to export everything they can see".
- Assumption: Intersection of view permission, own team and last month; Branch Manager only.
- Impact: Wider scope increases exposure and requires per-role rules; narrower scope could miss real use cases.

**Q3. (C3) The 5-second requirement.**
- Question: Is 5 s a hard limit for all volumes, or for typical volumes only? Is asynchronous delivery acceptable?
- Reason: "the export must complete within 5 seconds" with no volume stated.
- Assumption: Synchronous to 50,000 rows with p95 ≤ 5 s; async job above that; hard cap 1,000,000 rows.
- Impact: If a hard 5 s for all sizes is mandatory, a row cap or pre-computed exports is needed; if N is far too low or high, thresholds and infrastructure sizing change.

**Q4. (C4) Files kept "forever" vs deletion at 12 months.**
- Question: Which must hold for files that contain personal data? What exactly must be kept for audit?
- Reason: "Exported files are kept forever for audit, and the platform must delete personal data older than 12 months".
- Assumption: Audit record (metadata + SHA-256, no personal data) kept forever; files with personal data deleted at 12 months.
- Impact: If the bank needs the files themselves for audit beyond 12 months, a legal basis, an archive with stricter access, or masked-only archival is needed; if the audit record itself is personal data (requester ID), its permanent retention needs a basis (Q11).

**Q5. (C5) The 12-month reference point.**
- Question: Is 12 months counted from the event time or from the file creation time?
- Reason: "delete personal data older than 12 months" does not say what it is older than.
- Assumption: The earlier of 12 months after the oldest event in the file or 12 months after creation.
- Impact: Using only creation time keeps data longer than the policy; using only event time may delete files earlier than audit expects. The source logs' own retention must be consistent.

**Q6. Expected data volume per branch.**
- Question: Typical and maximum access-log rows per team per month; number of concurrent exporters; platform load.
- Reason: "the export must complete within 5 seconds" and "export everything they can see".
- Assumption: Typical ≤ 50,000 rows per team per month; max 1,000,000; ≤ 20 concurrent exports.
- Impact: Determines N, the hard cap, rate limits and sizing. Larger real volumes mean most exports are asynchronous.

**Q7. Format "like the old system".**
- Question: Please supply a sample file (synthetic) or the exact column list, order, header language, date format, delimiter, encoding and line endings of the old system.
- Reason: "export ... as CSV like the old system".
- Assumption: The column list and format in section 4.2 (UTF-8 BOM, comma, CRLF, ISO 8601 +07:00).
- Impact: Downstream tools or macros that consume the old format may break; column changes need regression of those consumers.

**Q8. Does downloading count as "leave the platform"?**
- Question: What exactly is "leaving the platform": download to a browser, e-mail, transfer to another system?
- Reason: "no personal data may leave the platform unmasked".
- Assumption: Any download to a user's device counts as leaving.
- Impact: If only transfers to third-party systems count, BMs could receive unmasked data inside the platform's controlled view, simplifying Q1; the assumption is the safer one.

**Q9. Who may view unmasked data, and the approval process.**
- Question: Which roles/people may request and approve unmasked exports? Is two-person approval acceptable? Link validity? Who is the owner of the audit records and who may read them?
- Reason: "full client IP addresses and usernames for forensic use".
- Assumption: Dedicated `forensic` role requests with case number and reason; a different `export_approver` approves; single-use link valid 24 h; Auditor read-only on audit records.
- Impact: A looser process raises leak risk; a stricter one (e.g. security head approval) adds workflow work.

**Q10. Backups and copies.**
- Question: What is the backup cycle and can backups be purged selectively?
- Reason: "the platform must delete personal data older than 12 months".
- Assumption: Backups expire by the existing cycle; backups older than the cycle are not restored without re-applying deletion.
- Impact: A long backup cycle means personal data persists beyond 12 months and may need a documented exception.

**Q11. Legal basis and internal policy.**
- Question: Which legal documents and internal policies apply (personal data protection decree, State Bank of Vietnam information-security rules, internal data-protection and log-retention policy)? Is any log-retention duration mandated longer than 12 months? Are IP and username personal data per the bank's policy? Is a DPIA required, and what incident-notification timeframe applies?
- Reason: "In line with our data-protection policy" (policy not provided).
- Assumption: Strictest reading (mask by default, delete at 12 months, immutable audit). Legal references (for example Decree 13/2023/ND-CP) are unverified and must be re-checked for current validity; no article numbers are cited.
- Impact: A mandated longer log retention would conflict with the 12-month deletion and change FR-17/18.

**Q12. File storage location and encryption.**
- Question: Where are generated files stored (platform object storage, region, cross-border?), which encryption and key management standard applies?
- Reason: "Exported files are kept forever" implies storage, which is unspecified.
- Assumption: Platform storage in Vietnam, AES-256 at rest, TLS in transit, keys in the bank's KMS/HSM.
- Impact: Off-shore or unencrypted storage would trigger additional compliance steps.

**Q13. Notification channel for async jobs.**
- Question: In-app only, or also e-mail (without attachment)?
- Reason: "Make it simple" and no notification requirement in the brief.
- Assumption: In-app notification only.
- Impact: E-mail adds integration and a data-leak channel to review.

**Q14. Definition of "team" and the organization hierarchy source.**
- Question: What is a "team"? Where is the team/branch hierarchy mastered (HR system, directory, platform table) and how often is it synchronised? Can a manager manage several teams or sub-teams? What about transfers mid-month?
- Reason: "Branch managers can export their team's access logs".
- Assumption: One team code per BM from the platform's user-to-team mapping, evaluated at request time; sub-teams included; no transfer history.
- Impact: Wrong hierarchy data exports the wrong people's logs (unauthorised disclosure) or misses members.

**Q15. Definition of "access logs".**
- Question: Which logs: end-user logins to the platform, accesses to bank applications, or logs the platform ingests from other systems? Which fields exist?
- Reason: "export their team's access logs" – the log platform ingests many sources.
- Assumption: Authentication and resource-access events of team members, from the platform's central log store.
- Impact: A different source changes columns, volume and which personal fields need masking.

**Q16. "Last month" and time zone.**
- Question: Previous calendar month, or the last 30 days / a rolling month? Which time zone, and which timestamp (event time or ingestion time)?
- Reason: "from last month".
- Assumption: Previous calendar month, Asia/Ho_Chi_Minh, event time.
- Impact: A rolling window changes FR-2 and the retention reference; time zone errors drop or add boundary events.

**Q17. Additional personal data in other fields.**
- Question: Do other columns (resource path, user agent, device ID, branch code) contain personal data requiring masking?
- Reason: "no personal data may leave the platform unmasked".
- Assumption: Only IP and username are masked; resource is sanitised for formula injection only.
- Impact: Unmasked personal data in other columns would breach the policy.

**Q18. Watermarking and traceability.**
- Question: Is a visible `export_id` column acceptable to the customer and to the downstream tools?
- Reason: The brief does not mention leak tracing; forensic and audit use implies it.
- Assumption: `export_id` column on every row; the requester is not named in the file.
- Impact: If an extra column breaks consumers, move the watermark to a header comment or a sidecar file.

**Q19. Spreadsheet and encoding compatibility.**
- Question: Will files be opened in Excel (Vietnamese diacritics) and do users accept the leading `'` on neutralised cells?
- Reason: "CSV like the old system".
- Assumption: Yes to both; UTF-8 BOM.
- Impact: If files are machine-consumed, the quote prefix can corrupt values; a different neutralisation or no-BOM variant may be required.

**Q20. Audit retention of requester identity.**
- Question: Is permanent retention of internal user IDs in the audit record acceptable under the policy?
- Reason: "kept forever for audit" vs "delete personal data older than 12 months".
- Assumption: Internal user ID (not name) kept permanently; no client IP or username from the exported data.
- Impact: If not acceptable, pseudonymise the requester ID after 12 months, which weakens traceability.

**Q21. Quotas and role scope for "Users".**
- Question: Are the rate limits (5 per hour, 1 active job) and the 1,000,000-row cap acceptable?
- Reason: "Users should be able to export everything they can see".
- Assumption: Those limits apply.
- Impact: Stricter limits annoy users; looser limits raise abuse and load risk.

**Q22. Non-functional targets.**
- Question: Required availability, supported browsers and target environments?
- Reason: Not stated in the brief.
- Assumption: Same as the host platform.
- Impact: Higher availability targets add redundancy work.

## 10. Verification commands (to be run by the reviewer)

- `ls SPEC.md` → file exists at repository root.
- `grep -n '^## Open questions and assumptions' SPEC.md` → exactly one line.
- `grep -c '^\*\*Q[0-9]*\.' SPEC.md` → number of numbered open questions (22 expected).
