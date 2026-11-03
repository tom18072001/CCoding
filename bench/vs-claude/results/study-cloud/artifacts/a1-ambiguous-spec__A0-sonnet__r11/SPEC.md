# Log Export — Implementation Specification

Status: DRAFT, **not ready to build until the blocking questions below are answered**.
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service "Log Export" button lets a branch manager download their team's access logs for the previous month as a CSV file, similar to the legacy system.

The request contains several requirements that conflict with each other (section 2). This spec resolves each conflict with the most conservative assumption, so the build is safe if the customer is slow to answer. Every assumption is listed in `## Open questions and assumptions`.

## 2. Conflicts found in the request

| # | Statement A | Statement B | Conflict |
|---|---|---|---|
| C1 | Exports contain full client IPs and usernames (forensics) | No personal data may leave the platform unmasked | Direct contradiction. IPs and usernames are personal data. |
| C2 | Export "last month", "team's" logs | Export "everything they can see" | Scope is narrower in one sentence and wider in the other. |
| C3 | Export files are kept forever | Delete personal data older than 12 months | Files containing personal data would outlive the retention limit. |
| C4 | Complete within 5 seconds | Unknown volume, a full month of logs | Cannot be guaranteed for large branches with a synchronous export. |
| C5 | "Make it simple", self-service | Forensic and audit use, regulated PII | Controls (authorization, audit trail, masking) add necessary complexity. |
| C6 | "Like the old system" | Old system format is not provided | Columns, encoding and delimiter are unknown. |

## 3. Scope

In scope:
- An "Export logs" button in the platform UI, plus a backend endpoint.
- CSV generation of access logs for the previous calendar month for the requesting manager's team.
- Masking, authorization, audit logging of every export, retention and deletion of exported files.

Out of scope (unless the customer says otherwise):
- Other log types (application, system, security).
- Exports for arbitrary date ranges.
- Formats other than CSV.
- Scheduled or recurring exports.
- A separate unmasked forensic workflow (see Q1: proposed as a distinct, controlled process, not part of this button).

## 4. Functional requirements

### 4.1 Access and authorization
- FR-1. The button is visible only to users with the role `BRANCH_MANAGER`.
- FR-2. A manager may export only records of users in their own team and branch. Team membership comes from the identity or HR source of record (Q5). The server enforces this on every request. The UI is never the control.
- FR-3. The export is limited to the intersection of "what the manager can see in the UI" and "their team's logs" (Q3). Anything outside it is never returned.
- FR-4. Requests with a missing or invalid session, or without the role, return 401 or 403. The attempt is audit-logged.

### 4.2 Time window
- FR-5. "Last month" means the previous full calendar month in the `Asia/Ho_Chi_Minh` timezone (UTC+7), start inclusive and end exclusive. Example: a request on 2026-11-03 exports 2026-10-01T00:00+07:00 up to 2026-11-01T00:00+07:00.
- FR-6. The user cannot change the date range in v1.
- FR-7. Timestamps in the file are ISO-8601 with the +07:00 offset.

### 4.3 Data protection (default assumption: masked)
- FR-8. Default export is **masked**:
  - Client IPv4: last octet masked, for example `10.20.30.xxx`.
  - Client IPv6: keep the first /48, mask the rest.
  - Username: replaced with a stable pseudonym, an HMAC-SHA256 of the username under a platform-held key, truncated, for example `u_9f3a1c2e`. The same user maps to the same pseudonym across exports, so analysts can correlate activity without seeing identities.
- FR-9. The HMAC key is stored in the bank's KMS or HSM and is never in code or config. Rotation is supported and documented.
- FR-10. Unmasked export (full IP and username) is **disabled** in v1. It may be enabled only after Q1 is answered, and then only through a separate, approved flow:
  - a separate permission, not held by branch managers by default;
  - a written justification and a case or ticket ID;
  - a second approver (four-eyes);
  - encrypted output, access limited to the requester and approver, and a short expiry;
  - a full audit record.
- FR-11. Other columns that could identify a person, such as device ID, free-text fields, and URLs with query strings, are masked or dropped according to the column list (Q6). Default: drop them.

### 4.4 CSV format (assumption pending Q6)
- FR-12. UTF-8 with BOM (for Excel in Vietnamese locales), comma delimiter, CRLF line endings, a header row, RFC 4180 quoting.
- FR-13. Default columns: `timestamp, user_pseudonym, client_ip_masked, action, resource, result, branch_id`.
- FR-14. CSV-injection protection: any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- FR-15. File name: `access-logs_<branch_id>_<YYYY-MM>_<mask|full>.csv`.

### 4.5 Performance and delivery
- FR-16. Target: p95 of 5 s for an export of up to **N rows** (assumed N = 200,000; Q4) measured from click to download start. The 5 s target is met by streaming the CSV from an indexed query (index on `(branch_id, ts)`) with no full-result buffering.
- FR-17. If the estimated result exceeds the synchronous limit (more than 200,000 rows), the system does **not** time out silently. It switches to an asynchronous job:
  1. The UI shows "Preparing your export".
  2. The user is notified when it is ready.
  3. The download link works for 24 hours, requires authentication, and is single-user.
- FR-18. Hard server timeout of 60 s per job. On failure the user sees a clear error and the failure is logged.
- FR-19. Rate limit: 5 export requests per user per hour, and 2 concurrent exports per user.

### 4.6 Audit trail
- FR-20. Every export attempt, whether successful, denied, or failed, writes an immutable audit record:
  - requester, role, branch, time, source IP, and the mask or full mode;
  - the time window and row count;
  - file checksum (SHA-256) and a result code.
- FR-21. Audit records contain no raw personal data from the exported rows. They are kept for the period set by Q8.

### 4.7 Retention and deletion
- FR-22. Source logs: personal data older than 12 months is deleted or irreversibly anonymized by a daily job. Deletion is logged, with a count and no content.
- FR-23. Default assumption: exported files are **not** kept forever. Masked files are kept in platform storage for 12 months from export date, then deleted by the same job (Q2). Users who need their own copy are responsible for handling it under the bank's policy.
- FR-24. Files that contain unmasked personal data (only if Q1 allows) are stored encrypted. They are deleted at 12 months or earlier, and expire from download within 7 days. They follow the data-protection policy, not the "keep forever" rule, unless the customer's legal counsel confirms a legal basis (Q2).
- FR-25. The audit record of an export (FR-20) may be kept longer than the file. It holds no personal data, so it does not conflict with deletion.
- FR-26. Pseudonyms: once the source username is deleted at 12 months, the link between pseudonym and person must not be recoverable. When the HMAC key is rotated, keep the old key only as long as the data it protects exists.

## 5. Non-functional requirements

- NFR-1. TLS 1.2+ in transit. Exported files at rest are encrypted with keys in KMS.
- NFR-2. Data residency: all processing and storage stay inside Vietnam (Q9).
- NFR-3. The export reads from a replica or read-optimized store, so load from exports never degrades log ingestion.
- NFR-4. Accessibility and language: UI strings in Vietnamese and English.
- NFR-5. Observability: metrics for export duration, row count, failures and denials. Alert on error rate and on unusual volumes per user.

## 6. Acceptance criteria

1. A branch manager sees the button. A non-manager does not, and a direct API call returns 403.
2. A manager exporting on 2026-11-03 gets only October 2026 (UTC+7) rows for their own team. A row at 2026-10-31T23:59:59+07:00 is included and one at 2026-11-01T00:00:00+07:00 is not.
3. No exported row from the default flow contains a full IP or a raw username. A test searches the whole file for known fixture values.
4. A manager cannot obtain another branch's rows by changing a request parameter or ID.
5. A 200,000-row export starts downloading within 5 s p95 on production-like data. A larger export turns into an async job.
6. Cells beginning with `=` in test data are neutralized.
7. Every export attempt creates one audit record.
8. The retention job deletes source personal data and expired exported files older than 12 months, and logs the counts. Tests use a mocked clock.
9. Unmasked export is not reachable (flag off, endpoint refuses) until enabled per FR-10.

## 7. Delivery notes

- Suggested components: authorization check, query streamer, masking module, CSV writer, async job runner, file store, retention job, audit writer.
- Masking is implemented once, server-side, in the query path. Do not rely on UI masking.
- Feature flag for the whole feature and a separate flag for the unmasked flow.

## Open questions and assumptions

Questions marked **BLOCKING** must be answered before building the part they affect. Others can proceed on the assumption and be corrected later.

| ID | Question for the customer | Assumption used meanwhile |
|---|---|---|
| Q1 **BLOCKING** | The request asks for full IPs and usernames and also says no personal data may leave the platform unmasked. Which governs? If forensics needs real identities, who may get them, under what approval, and does a downloaded file count as "leaving the platform"? | Default export is masked (FR-8). Unmasked output is not built in v1 and is offered as a separate approved flow (FR-10). Forensic staff keep using in-platform access to raw logs. |
| Q2 **BLOCKING** | Exported files "kept forever" conflicts with deleting personal data after 12 months. Which prevails for files that contain personal data? Is there a legal or regulatory basis for permanent retention (for example a State Bank of Vietnam or audit requirement)? Please have legal and the DPO confirm. | Exported files are deleted at 12 months (FR-23). Only the personal-data-free audit record is kept long-term (FR-25). |
| Q3 | "Team's logs" or "everything they can see"? Are the two the same set? | The intersection: a manager's visible logs restricted to their own team and branch (FR-3). |
| Q4 | What are the real log volumes per branch per month, and is 5 s a hard limit for the whole export or for starting the download? What happens above the limit? | 5 s is for download start, for up to 200,000 rows. Larger exports run asynchronously (FR-16, FR-17). |
| Q5 | How is "team" defined, and which system is the source of truth (AD or LDAP, HR system, platform groups)? Can a manager manage several branches? Do deputies or acting managers qualify? | Team and branch come from the platform's synced identity groups. One manager maps to one branch. No delegation in v1. |
| Q6 | What does the old system's CSV look like? Please provide a sample, with columns, encoding, delimiter, date format and any consumers of the file. | The format in FR-12 and FR-13. |
| Q7 | Which log types does "access logs" cover (login, API, database, admin actions)? | Authentication and application-access events only. |
| Q8 | How long must the export audit records be kept, and who reviews them? | 5 years, readable by the security and compliance team. |
| Q9 | Which regulations and internal policies apply (Vietnam's personal data protection law and decree, State Bank of Vietnam information-security rules, cybersecurity law, the bank's own policy)? Is a data-protection impact assessment required? Must data stay in Vietnam? | Assume the strictest reading of each. Data stays in Vietnam. Legal compliance is for the customer to confirm, not asserted by this spec. |
| Q10 | Is "last month" the previous calendar month or the last 30 days? Which timezone? | Previous calendar month, `Asia/Ho_Chi_Minh` (FR-5). |
| Q11 | Does the 12-month deletion mean erasure or irreversible anonymization? Does it apply to backups and replicas as well, and by when? | Erasure from primary and replicas on a daily run. Backups expire on their normal cycle, documented as an exception. |
| Q12 | Do managers need to be notified, or does a second party need to approve each export? "Simple" and "self-service" suggest not, but a bank may require approval. | No approval for masked exports. Approval is required only for the unmasked flow. |
| Q13 | Can exported files be shared outside the platform, for example by email? Are there DLP controls on downloads? | The user downloads to a managed device. The platform adds a watermark column or header with requester and time. Further DLP is the customer's responsibility. |
| Q14 | Which languages should the UI support, and who accepts the work (UAT owner)? | Vietnamese and English. The customer names the UAT owner. |
