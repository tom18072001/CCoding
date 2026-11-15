# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer confirmations in [Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Add a self-service **Log Export** button. A branch manager exports their team's access logs for the previous month as CSV. Output should resemble the legacy system's export.

## 2. The request contradicts itself

Five requirements cannot all be met as written. The design below resolves each with a default, and each default is listed in the open questions.

| # | Conflict | Resolution in this spec (pending confirmation) |
|---|----------|------------------------------------------------|
| C1 | "Full client IPs and usernames" vs. "no personal data may leave the platform unmasked" | Two export modes. **Masked** is the default and available to branch managers. **Unmasked (forensic)** is a separate, approval-gated capability, delivered only through a controlled channel, and is off until the customer's DPO and security team sign off (Q1). |
| C2 | "Export everything they can see" vs. "their team's logs, last month" | Export scope = the intersection of what the user can see (RBAC and data scope) and the selected period, defaulting to the team and the previous calendar month (Q3, Q4). Manager-visible data outside the team or period is out of scope for v1. |
| C3 | "Complete within 5 seconds" vs. unbounded volume | The 5 s target applies to the synchronous path for up to N rows (default 100,000). Larger exports run asynchronously with a notification. There is no hard 5 s guarantee at any volume (Q6). |
| C4 | "Keep exported files forever" vs. "delete personal data older than 12 months" | Cannot both hold for files containing personal data. Default: exported files are retained as audit evidence for the 12-month window, and all personal data in them is then purged. An **export audit record** (metadata only, no personal data) is kept indefinitely (Q8). |
| C5 | "Make it simple" vs. the controls above | The UI stays one button and one confirmation. Controls (masking, audit, expiry) happen server-side and are not user options. |

## 3. Scope

### In scope
- Export button, available to users with the `log.export` permission (branch managers).
- Server-side CSV generation of access logs, scoped by the user's data-scope.
- Masking of personal data by default.
- An audit trail for every export.
- Retention and purge of personal data in logs and in stored export files.

### Out of scope (v1)
- Formats other than CSV.
- Scheduled or recurring exports.
- Cross-branch exports and exports by non-managers.
- Real-time or streaming export.
- Changes to log ingestion.

## 4. Users and permissions

- **Branch manager** can export Masked CSV for their branch/team.
- **Forensic / security investigator** (role TBC, Q2) can request an Unmasked export, which needs a second approver (the four-eyes rule) and a stated case reference.
- Authorization is enforced server-side on every request, never only by hiding the button. Data scope is resolved from the authenticated identity, not from request parameters. Client-supplied team or branch IDs are validated against that scope. Cross-scope requests return 403 and are audited.

## 5. Functional requirements

### FR-1 Export action
- The button opens a confirmation showing: team, period (default previous calendar month, `Asia/Ho_Chi_Minh`), estimated row count, and mode (Masked).
- On confirm, the server returns the file directly (sync path) or a job ID (async path, FR-6).

### FR-2 Scope
- Rows = access-log events where `team = user's team` and `timestamp` is within the period, further filtered by the user's data-scope permissions.
- Period default: the previous full calendar month, from 00:00:00 on the 1st to 00:00:00 on the 1st of the next month, `Asia/Ho_Chi_Minh` (UTC+7). Timestamps are exported in ISO 8601 with offset.

### FR-3 CSV format
- UTF-8 with BOM (for Excel on Vietnamese locales, TBC in Q5). Header row, comma delimiter, RFC 4180 quoting.
- **CSV/formula injection defence:** any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`. Usernames and user agents are attacker-influenced.
- Columns (placeholder until the legacy format is supplied, Q5): `timestamp, username, client_ip, action, resource, result, source_system, event_id`.
- Rows are ordered by `timestamp, event_id`. The file name is `log-export_<team>_<YYYY-MM>_<mode>_<jobid>.csv`.

### FR-4 Masking (default mode)
- `username`: replaced by a **stable pseudonym**, an HMAC-SHA-256 token under a platform-held key (for example `u_9f3a1c…`). The same user maps to the same token across the export, so analysts can still correlate activity.
- `client_ip`: IPv4 masked to /24 (`203.0.113.xxx`), IPv6 to /48. This is the default pending Q1.
- Masking is applied **in the query/serialization layer** before any bytes are written. There is no "mask afterwards" step and no unmasked intermediate file in the masked path.
- Free-text columns (resource paths, user agents, query strings) are scanned for emails, phone numbers and national ID patterns, which are redacted (Q7).

### FR-5 Unmasked forensic export (gated)
- Disabled by default behind a feature flag until Q1 is resolved.
- Requires: the forensic role, a case reference, a documented justification, and approval by a second authorised person.
- Delivered only through an encrypted channel inside the bank's controlled environment (download over mTLS/SSO, AES-256 at rest, file-level encryption with a per-export key). Never by email or to a user-chosen location.
- Each file is watermarked (requester ID and job ID in a header row). Files have a short expiry (default 7 days) and are purged afterwards.
- Every unmasked row count and requester is logged in the audit trail.

### FR-6 Performance and async path
- Target: p95 ≤ 5 s end-to-end for ≤ 100,000 rows, measured at the application, excluding client network time. This assumes an indexed query on `(team_id, timestamp)` and streamed CSV serialization with no full in-memory buffering.
- Above the threshold, or if the sync path exceeds a 4 s internal deadline, the system converts to an async job. The user sees "Preparing export" and gets an in-app notification with a download link. The link is authenticated and tied to the requester, expires after 24 hours, and the file stays available to the requester only.
- A hard cap applies (default 5 million rows per export). Above it the user must narrow the period or filters.
- Limits: 1 concurrent export per user, 10 per user per day. Exceeding them returns 429.

### FR-7 Audit
Each export request creates an immutable audit record: `export_id, requester, role, team, period, mode, row_count, columns, status, approver (if any), case_ref (if any), request_time, completion_time, source IP of requester, file_sha256, expiry_time, purge_time`. Denied and failed requests are also recorded. The audit record contains **no exported personal data** and is retained indefinitely (Q8). It is append-only, with restricted access and tamper-evidence (hash chaining or WORM storage).

### FR-8 Retention and purge
- A scheduled job (daily) deletes or irreversibly anonymises personal data (`username`, `client_ip`, free-text identifiers) in log records older than 12 months, measured from event timestamp.
- Stored export files that contain personal data are purged by the same rule, no later than 12 months after the **earliest event** they contain. Masked files that contain only pseudonyms count as personal data if the key is retained (Q7), so purge also covers them.
- Backups and replicas are included. The maximum time for purge to reach backups is documented (Q9).
- Each purge run writes a record (counts, time range, success or failure), and alerts on failure.
- Legal hold: records flagged by a legal or forensic hold are excluded from purge until released, if the customer confirms this is allowed (Q9).

## 6. Non-functional requirements

- **Security:** TLS 1.2+. Files encrypted at rest. The HMAC masking key is held in the KMS/HSM and rotated per policy. No personal data in application logs, URLs or error messages.
- **Compliance:** to be confirmed by the bank's legal and DPO team (Q10). Likely relevant: Vietnam's personal-data-protection regime (Decree 13/2023/ND-CP and the Law on Personal Data Protection), State Bank of Vietnam information-security rules for banks, and the cybersecurity-law log-retention requirements. This spec makes no legal claim about which retention period applies.
- **Availability and isolation:** exports run on a worker pool with query timeouts, so they cannot starve interactive log search.
- **Accessibility and i18n:** Vietnamese and English UI labels.
- **Observability:** metrics for export latency, size, mode, failures and purge lag. Alert if sync p95 exceeds 5 s.

## 7. Acceptance criteria

1. A branch manager exports last month's team logs. The file is Masked, contains only their team's rows, and has no raw username or full IP.
2. A manager cannot obtain another team's rows by tampering with request parameters (403, audited).
3. A 100,000-row export completes in ≤ 5 s at p95 in the performance environment. A larger export becomes an async job with a notification.
4. Cells beginning with `=`, `+`, `-`, `@` are neutralised.
5. Without the approval flow, no user can obtain an Unmasked file.
6. Every export, successful or not, has an audit record with no personal data.
7. After the purge job runs, no personal data older than 12 months exists in the log store or in export files. A test fixture verifies this, including the file store.
8. Export files are removed at expiry and the audit record is retained.

## 8. Test notes

- Property tests for the masking function (determinism, no raw value in the output, injection payloads).
- Authorization matrix tests (role × team × mode).
- Load test at 100k and 5M rows.
- Boundary tests for the month at the UTC+7 midnight edge, and for 29/30/31-day months and year rollover (January exports December of the prior year).
- Purge tests at the 12-month boundary, with legal hold, and with backups.

## Open questions and assumptions

Each item must be confirmed with the customer before building. Until then the assumption stated is used.

| # | Question | Assumption used meanwhile |
|---|----------|---------------------------|
| Q1 | The request requires both full IPs and usernames (forensic use) and that no personal data leave the platform unmasked. Which governs? Is a forensic export, delivered inside a controlled environment to authorised staff, considered "leaving the platform"? Has the DPO signed off? | Masked by default for everyone. Unmasked is a separate gated, audited, four-eyes flow, **disabled by feature flag** until written DPO and security sign-off. IPs are masked to /24 and usernames are pseudonymised. |
| Q2 | Who may do forensic (unmasked) exports? Branch managers, or a separate security/investigation team? Who approves? | Not branch managers. A separate forensic role with a second approver. |
| Q3 | "Export everything they can see" vs. "their team's logs from last month": which is meant? Can a manager see more than their team (for example the whole branch, or sub-teams)? | Export is limited to the intersection of the user's data-scope and the chosen period, defaulting to their team. No cross-branch export. |
| Q4 | Define "last month": previous calendar month or the last 30 days? Which time zone? Can the manager choose a different period? | The previous calendar month, `Asia/Ho_Chi_Minh`. No custom period in v1 (can be added later within the retention window). |
| Q5 | What does "like the old system" mean? We need a sample file: columns, order, headers (Vietnamese or English), encoding, delimiter, date format, and any consumers parsing it. | Columns and format as in FR-3, UTF-8 with BOM, ISO 8601 timestamps. Compatibility with the legacy format is **not** guaranteed. |
| Q6 | What is the real expected volume per team per month? Is "within 5 seconds" a hard requirement at any size, and measured where? | 5 s p95 for up to 100,000 rows. Larger exports are asynchronous. Cap of 5M rows. Measured server-side. |
| Q7 | Is a pseudonymised username (HMAC token) or a /24-truncated IP acceptable as "masked" under the bank's policy? What masking style is wanted (partial display, hashing, full removal)? Is a pseudonym still personal data (it is if the key is retained)? | HMAC pseudonym, /24 IPv4 and /48 IPv6, free-text PII redaction. Pseudonyms are treated as personal data for retention purposes. |
| Q8 | "Kept forever" vs. "delete personal data older than 12 months". Which wins for exported files? Is metadata-only (no personal data) retention indefinitely acceptable for audit? Is there a regulatory retention period for audit evidence? | Export files with personal data are purged within the 12-month rule. The audit record (metadata only) is kept indefinitely. Masked and unmasked files get the same purge rule. |
| Q9 | Retention details: does 12 months run from the event time or the time of export? Does it apply to backups, with what lag? Is there a legal-hold exception? Does a different law require retaining raw logs longer (cybersecurity/banking rules)? | From event time. Backups are purged within 35 days of primary purge. Legal hold supported. A longer statutory minimum, if one is found, overrides this and the 12-month figure changes. |
| Q10 | Which regulations and internal policies apply (personal-data decree and law, SBV rules, the bank's own policy), and does legal require a DPIA or notification to the authority? | Compliance review by the bank's legal and DPO team before release. The spec asserts no legal conclusion. |
| Q11 | Where may exported files be stored and downloaded (bank workstation, VPN-only, DLP controls)? Is email or removable media prohibited? Should downloads be blocked outside bank networks? | Download only through the authenticated platform session. Files are encrypted at rest. No email delivery. |
| Q12 | Are there other file consumers (SIEM, auditors) who need automated access, or is this strictly manual download by a person? | Manual download by the requesting user only. |
| Q13 | "Make it simple": is a single button with no filters acceptable, with the controls (approval flow, masking) invisible to branch managers? | Yes. One button, one confirmation, no user-set filters in v1. |
| Q14 | Can access logs themselves contain customer (client) personal data beyond username and IP (account numbers, names in URLs)? | Possibly yes. Free-text fields are redacted, and unknown columns are excluded unless allow-listed. |
| Q15 | Should managers be notified or re-authenticated (step-up MFA) before export? | Step-up MFA is required for any export. |
