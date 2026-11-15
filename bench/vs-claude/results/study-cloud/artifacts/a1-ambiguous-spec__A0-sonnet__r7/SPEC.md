# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer answers in "Open questions and assumptions". The request contains four direct contradictions (C1–C4). Each has a provisional resolution in this spec, and the safest option is the default.

## 1. Summary

Add a self-service "Log Export" button. A branch manager uses it to download their team's access logs for the previous calendar month as a CSV file. The export is audited, scoped by role, and handled according to the bank's data-protection policy.

## 2. Contradictions in the request

| ID | Statement A | Statement B | Provisional resolution |
|----|-------------|-------------|------------------------|
| C1 | Exports must contain full client IPs and usernames (forensic use) | No personal data may leave the platform unmasked | **Default export is masked.** A separate, more tightly controlled "forensic export" returns unmasked data (see 4.3). It is disabled until the customer approves it in writing. |
| C2 | Users can export everything they can see | Branch managers export their *team's* logs | **Export scope = the team scope the manager is authorised for.** It is never wider than the manager's own authorisation and is enforced server-side. |
| C3 | Exported files are kept forever | Personal data older than 12 months must be deleted | **Stored export files are retained for 12 months and then deleted.** A permanent audit record holds metadata only, with no personal data (see 6). |
| C4 | Export must finish within 5 seconds | Arbitrary volume, with no row limit | **Synchronous download up to a row cap, and asynchronous above it.** The 5 s target applies to the synchronous path at the p95 (see 5). |

## 3. Scope

In scope:
- An export button in the log UI, with a backend endpoint.
- CSV generation, masking, authorisation, audit logging, and retention.

Out of scope:
- Other formats (JSON, XLSX).
- Exports for roles other than branch manager.
- Scheduled exports.
- Changes to log ingestion.

## 4. Functional requirements

### 4.1 Eligibility and authorisation
- FR-1: Only users with the `branch_manager` role see the button.
- FR-2: The server derives the scope (branches and team members) from the authenticated identity. It ignores any scope sent by the client.
- FR-3: A request for data outside the user's scope returns 403 and writes an audit event.

### 4.2 Period
- FR-4: The period is the previous full calendar month in the Asia/Ho_Chi_Minh timezone. It runs from 00:00:00 on the 1st, inclusive, to 00:00:00 on the 1st of the following month, exclusive.
- FR-5: Example: an export on 2026-11-03 covers 2026-10-01 to 2026-10-31.
- FR-6: There is no user-selectable range in v1. This is what "simple" means here: one button and one fixed period.

### 4.3 Masking (default export)
- FR-7: The IP address is masked. IPv4 keeps the first two octets (`10.20.x.x`). IPv6 keeps the first /48.
- FR-8: The username is replaced by a stable pseudonym. It is an HMAC-SHA256 of the username with a platform key, truncated to 12 hex characters. The same user maps to the same value across exports, so activity can be correlated without revealing identity.
- FR-9: Any other personal data fields (for example full name, email, device ID) are masked or omitted. The final field list is to be confirmed (Q6).
- FR-10: Masking happens server-side before the data is written to the file. Nothing unmasked is ever sent to the browser or written to disk or cache in the default flow.

### 4.4 Forensic export (unmasked), conditional
Build this only after Q1 is answered. If it is approved:
- FR-11: A separate action, available only to a distinct role (for example `security_investigator`), requires a case or ticket ID and a stated reason.
- FR-12: A second approver must authorise each export (four-eyes).
- FR-13: The file is encrypted (AES-256) and the download link is single-use and expires in 24 hours.
- FR-14: The file is deleted within the 12-month retention limit, or sooner if the customer chooses.
- FR-15: Every use is recorded in the audit log.
- FR-16: Data leaves the platform only to a recipient the data-protection officer has approved.

### 4.5 CSV format
- FR-17: UTF-8 with BOM, so Excel opens Vietnamese characters correctly. The delimiter is a comma, line endings are CRLF, and the first row is a header.
- FR-18: Columns: `timestamp_utc7` (ISO-8601), `masked_user`, `masked_client_ip`, `branch_id`, `action`, `resource`, `result`, `event_id`. The final list depends on the old-system format (Q5).
- FR-19: CSV injection protection. Any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`. Fields are quoted per RFC 4180.
- FR-20: File name: `access-logs_<branch>_<YYYY-MM>_<exportId>.csv`.

### 4.6 UX
- FR-21: One button. On click, a confirmation dialog states the period, the scope, and that the data is masked.
- FR-22: Sync path: the browser downloads the file. Async path: the UI shows "Preparing" and then a download link, with an in-app notification when it is ready.
- FR-23: Empty result: the user sees "No logs for this period" and no file is created.

## 5. Non-functional requirements

- NFR-1 (performance): The synchronous path returns the first byte within 2 s and the complete file within 5 s at p95, for up to N rows. The provisional N is 200,000 (Q8). The server streams the file, with no full in-memory buffer.
- NFR-2: Above N rows, the export becomes an async job. The job finishes in a target of 5 minutes at p95, and the user is notified. The 5 s guarantee cannot apply to unbounded volume.
- NFR-3: Rate limit of 5 exports per user per hour, and at most 2 concurrent exports per user.
- NFR-4: The export queries use a read replica or the index on (branch_id, timestamp). They must not degrade log ingestion.
- NFR-5 (security): TLS is required. Download links are authenticated, tied to the requesting user, and expire in 24 hours. Files at rest are encrypted.
- NFR-6: Availability follows the platform SLA. No new SLA is introduced.

## 6. Audit and retention

- FR-24: Every export request writes an audit event: user, role, scope, period, masked or unmasked, row count, outcome, timestamp, and a SHA-256 of the file.
- FR-25: The audit record holds **no personal data**. It uses internal user IDs only, and it is retained as the bank's audit policy requires (provisionally 5 years, Q4).
- FR-26: Source logs containing personal data and generated export files are deleted 12 months after the log event time.
- FR-27: A daily job performs the deletion and writes a deletion audit event with counts. Deletion covers primary storage, replicas, caches, and backups, with backups on a defined cycle of at most 35 days (Q3).
- FR-28: The audit record includes the file's SHA-256, so the integrity of an exported file can still be shown after the file itself is deleted.
- FR-29: An export file's deletion date is 12 months after the oldest log event it contains (not after file creation), so no personal data in a file outlives the 12-month limit. Under the default scope, a file created in November covering October is deleted at the end of October of the next year.

## 7. Architecture notes

- Endpoint: `POST /api/v1/log-exports` creates the export. It returns `200` with a stream (sync) or `202` with an `exportId` (async). `GET /api/v1/log-exports/{id}` returns status, and `GET /api/v1/log-exports/{id}/download` returns the file.
- The masking function is a single shared module. Unit tests include golden files.
- The HMAC key is held in the bank's KMS or HSM and rotated. A rotation changes the pseudonyms, and this is documented (Q9).
- Configuration (feature flags): `logExport.enabled`, `logExport.forensic.enabled` (default false), `logExport.syncRowCap`.

## 8. Acceptance criteria

1. A branch manager exports last month's logs, and every IP and username in the file is masked per FR-7 and FR-8.
2. A manager of branch A cannot obtain rows of branch B, either through the UI or by editing the request (403 plus an audit event).
3. A synchronous export of 200,000 rows completes in 5 s or less at p95 on production-size data.
4. An export above the cap is processed asynchronously and the user is notified.
5. A file containing `=cmd|...` in any cell is neutralised.
6. After the retention period, the personal data, the file, and the backups are gone, while the audit record remains without personal data.
7. The forensic export is not reachable while `logExport.forensic.enabled=false`.
8. Every export, successful or failed, has an audit event.

## 9. Testing

- Unit: masking (IPv4, IPv6, edge cases), the period calculation (month boundaries, timezone, 31-day and February months), CSV escaping.
- Integration: authorisation matrix, the sync/async switch, retention job.
- Performance: load test at the cap with production-like data.
- Security: IDOR attempts, link expiry, CSV injection.

## Open questions and assumptions

Each point must be confirmed with the customer before building. The assumption is what we use until they answer.

| # | Question | Assumption used meanwhile |
|---|----------|---------------------------|
| Q1 | **(C1)** Which requirement wins: full IP and usernames for forensics, or no unmasked personal data leaving the platform? Is there a legal basis and DPO approval for an unmasked export under the Vietnamese Law on Personal Data Protection (2025) and Decree 13/2023, and for Circular 09/2020 or SBV rules on information security? Who may receive unmasked data, and does "leave the platform" include a download to a manager's laptop? | All exports are masked. The unmasked forensic flow in 4.4 is designed but disabled and is not built until written approval is received. |
| Q2 | **(C2)** Does "everything they can see" mean the manager's team only, or also other branches or higher-level data they can see in the UI? Who defines a "team" (org hierarchy, HR system, or a group in the platform)? Do managers see sub-branch hierarchies? | Scope is the manager's own branch team, taken from the platform's existing org mapping. Never wider than the existing view permissions. |
| Q3 | **(C3)** Is "kept forever" about the exported files or about audit evidence? Does the 12-month deletion win over it, and does it apply to backups and to files already downloaded to a user's machine? Which law or policy sets the 12 months? | Export files and personal data are deleted at 12 months, including backups (within 35 days). Metadata-only audit records without personal data are kept. We cannot delete a copy a user has saved locally, so the user is told this at download. |
| Q4 | How long must the audit metadata (who exported what, when) be kept? | 5 years. |
| Q5 | **"Like the old system"**: what exactly does that mean? We need a sample file with the columns, order, headers, language (Vietnamese or English), date format, encoding, delimiter, and any totals or footer lines. | The format in 4.5. We may change the columns to match once a sample arrives. |
| Q6 | Which log fields count as personal data (IP, username, full name, email, device ID, session ID, free-text fields such as URLs with IDs)? What masking level is acceptable for each, for example last-octet only versus the first two octets? Is pseudonymisation acceptable for usernames? | Mask IPs to the first two octets (IPv6 /48), pseudonymise usernames with an HMAC, and drop other direct identifiers. |
| Q7 | **"Last month"**: previous calendar month, or the last 30 days? Which timezone? Can managers pick a different month? | Previous full calendar month in Asia/Ho_Chi_Minh, with no choice of period in v1. |
| Q8 | **(C4)** What are the real log volumes per branch per month (rows and size)? Does the 5 seconds cover only generation, or also the download over the bank's network? Is an asynchronous export acceptable above a threshold, or must every export finish in 5 s? | The 5 s target applies to exports up to 200,000 rows (p95). Larger exports are asynchronous with a notification. |
| Q9 | Where must the pseudonymisation key be held (the bank's HSM or KMS), and must pseudonyms stay stable across months, or may they rotate? | A KMS-held key, rotated yearly. Pseudonyms are stable within a key period. |
| Q10 | Which role performs forensic investigations, and who is the second approver? Is the sign-off flow in 4.4 acceptable, and can the file go to external parties such as the police or regulators? | Role `security_investigator`, with approval by the security officer. No external transfer without DPO sign-off. |
| Q11 | Where must data be stored and processed (in Vietnam only, or is a cross-border transfer allowed)? Does the bank need a data-localisation or cross-border impact assessment? | All storage and processing stay in Vietnam, in the customer's existing deployment region. |
| Q12 | Should an export file be encrypted or password-protected, and how is the password shared? | The download is authenticated. Files are encrypted at rest only, with no password on the CSV. |
| Q13 | Are there limits on who may export, such as a time window, an approval step, or a notification to the security team? | No limits beyond the rate limit (5 per hour per user). The security team gets a daily summary of exports. |
| Q14 | What counts as "simple"? Is the single fixed-period button acceptable, or do the users expect filters (date, user, action)? | A single button with no filters in v1. |
| Q15 | Is the audit record of the export itself (user ID, scope, timestamp) allowed to be kept longer than 12 months, given it identifies the manager? | Yes, using internal IDs only. If the customer says no, the retention period for the audit record becomes 12 months. |
| Q16 | Are there accessibility, language (Vietnamese UI), or browser-support requirements? | Vietnamese and English UI strings, and the browsers already supported by the platform. |
