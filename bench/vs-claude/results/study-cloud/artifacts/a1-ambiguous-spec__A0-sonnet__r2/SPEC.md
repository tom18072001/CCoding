# Log Export: Implementation Specification

Status: draft, pending customer confirmation of the items in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Add a self-service **Log Export** button. A branch manager exports their team's access logs for the previous calendar month as a CSV file. The feature must be simple: one button, one fixed scope, one file format.

## 2. Contradictions in the request

The request contains requirements that cannot all be met as written. The design below resolves each with a conservative default (see section 9). The customer must confirm each resolution.

| # | Requirement A | Requirement B | Conflict |
|---|---------------|---------------|----------|
| C1 | Exports contain full client IPs and usernames for forensic use | No personal data may leave the platform unmasked | An export is a file that leaves the platform. IPs and usernames are personal data. Both cannot hold for the same file. |
| C2 | Export the team's logs from last month | Export everything the user can see | "Everything visible" may be wider than "team, last month". A user may see other teams, other periods, or other fields. |
| C3 | Exported files kept forever for audit | Delete personal data older than 12 months | A retained file containing personal data breaks the 12-month deletion rule. |
| C4 | Complete within 5 seconds | Unbounded scope ("everything") | Duration depends on row count, which is not given. |
| C5 | Same as old system | Masking and audit requirements | The old CSV format and behavior are unspecified. They may not be compliant. |

## 3. Scope

In scope:
- An Export button and API endpoint for branch managers.
- CSV generation of access logs for the previous calendar month for the manager's team.
- Masking of personal data in the file by default.
- An audit record for every export.
- Retention and deletion of exported files.

Out of scope for v1 (until confirmed):
- Unmasked (forensic) export. See Q1.
- Exports for roles other than branch manager.
- Custom date ranges, filters, or formats other than CSV.
- Scheduled or emailed exports.

## 4. Functional requirements

**FR-1 Access.** Only authenticated users with the `branch_manager` role see the button. The server enforces this and never relies on the UI alone.

**FR-2 Scope.** The export contains access-log events where:
- the actor belongs to the requesting manager's team, as resolved server-side from the org hierarchy (never from client parameters);
- the event time falls in the previous calendar month, in Asia/Ho_Chi_Minh (UTC+7), from 00:00:00 on day 1 to 23:59:59.999 on the last day.

The request takes no scope parameters. A manager cannot widen the scope. "Everything they can see" is interpreted as the intersection of the team scope and the user's existing view permissions. The export never exceeds either.

**FR-3 Format.** The file is UTF-8 with BOM, RFC 4180 CSV, CRLF line endings, and a header row.
- Timestamps are ISO 8601 with the +07:00 offset.
- The filename is `access-logs_<team-id>_<YYYY-MM>_<export-id>.csv`.
- Columns (assumed, to be reconciled with the old system, Q5): `event_time`, `event_id`, `user_pseudonym`, `client_ip_masked`, `action`, `resource`, `result`, `branch_id`.

**FR-4 Masking (default and only mode in v1).**
- `client_ip_masked`: IPv4 has the last octet replaced with `x` (`10.20.30.x`). IPv6 keeps the first /48 and masks the rest.
- `user_pseudonym`: a keyed HMAC-SHA256 of the username, truncated to 12 hex characters. The key is held in a KMS/HSM and is not accessible to exporting users. The same user maps to the same pseudonym across exports, so activity can be correlated.
- Masking is applied server-side before any byte is written to the file. No unmasked value is ever written to disk or cache outside the platform's log store.
- Other free-text fields that may hold personal data (user agent, URL query strings, message text) are excluded or scrubbed. Q8 covers the field list.

**FR-5 CSV injection.** Any cell beginning with `=`, `+`, `-`, `@`, tab, or CR is prefixed with `'`.

**FR-6 Performance.** For up to 100,000 rows the file is returned synchronously with p95 ≤ 5 s measured server-side from request to last byte (excluding network transfer). If the row count is above 100,000, the UI says so and the export becomes an asynchronous job. The user is notified in-app, and the download link expires after 24 hours. The 5-second target is not guaranteed above the cap. Q4 covers volumes.

**FR-7 Audit.** Every export attempt, successful or denied, writes an audit event: `export_id`, requester ID, team ID, period, row count, masking mode, file SHA-256, outcome, timestamp, and source IP of the requester. The audit event contains no exported log content. Audit events are append-only and kept for the audit period the bank defines (Q3).

**FR-8 Retention of exported files.**
- A generated file is stored only if needed for the audit commitment (Q3). Default: the file is stored encrypted at rest (AES-256, KMS-managed key) for at most 12 months from the event date of the oldest row it contains, then securely deleted. The SHA-256 and metadata in the audit event remain after the file is deleted.
- The file is not kept "forever" while it contains personal data.

**FR-9 Platform retention.** A daily job deletes personal data (full IP, username, and other direct identifiers) from log records older than 12 months. The job is idempotent, logs counts only, and applies to backups on their normal rotation. The deletion mechanism must not conflict with a legal hold (Q3).

**FR-10 Rate limiting.** One export per user per team per period every 5 minutes, and a maximum of 5 concurrent exports platform-wide. Excess requests return 429.

## 5. API

`POST /api/v1/log-exports`: no body. The scope is derived from the session.
- 200 `text/csv` with `Content-Disposition: attachment` (sync path).
- 202 `{ "export_id": "...", "status": "queued" }` (async path, over the row cap).
- 401, 403 (not a branch manager or no team), 429.

`GET /api/v1/log-exports/{export_id}`: status and download. Only the requesting user can access it. The link expires after 24 hours.

Responses carry `Cache-Control: no-store`.

## 6. UI

A single "Export last month's logs (CSV)" button on the access-log page. It shows a confirmation text before download: "This file contains pseudonymised data. Handle under the bank's data-protection policy." The UI shows a progress state, and an error state that gives a request ID.

## 7. Non-functional requirements

- Security: TLS 1.2+, role check server-side, generated files are not world-readable, no personal data in application logs.
- Data residency: all processing and storage stay in-country, in the bank's approved environment (Q7).
- Observability: metrics for export duration, row counts, and failures (no personal data).
- Capacity: exports run on a read replica or a bounded query pool so they do not degrade log ingestion.

## 8. Acceptance criteria

1. A branch manager sees the button. Other roles do not, and a direct API call by them returns 403.
2. In the generated file, every row belongs to the manager's team and to the previous calendar month in UTC+7. Events at 23:59:59 on the last day and 00:00:00 on the first day are placed correctly.
3. No cell contains a full IP address or a plain username. A scan of 100% of the output finds no match against the unmasked values.
4. Cells starting with `=`, `+`, `-`, `@` are neutralised.
5. A 100,000-row export meets p95 ≤ 5 s in the performance environment. A larger export goes to the async path.
6. Every attempt creates one audit event with the SHA-256 of the file.
7. A file older than its retention limit is deleted by the job. The audit event remains.
8. The daily job removes direct identifiers from records older than 12 months.
9. Changing the team or period in the request has no effect on the scope.

## 9. Open questions and assumptions

Each item must be confirmed with the customer before building. The assumption is what we use until then.

| # | Question | Assumption used meanwhile |
|---|----------|---------------------------|
| Q1 | **Masking vs forensic need (C1).** Do forensics really need unmasked IPs and usernames in an exported file? Who is allowed to see them, and under which approval? Does "leave the platform" mean any download, or only transfer outside the bank's network? | The default export is masked. Unmasked export is not built in v1. Forensic users query unmasked data inside the platform under their existing access, or through a separate, approved, audited process that is specified later. |
| Q2 | **Scope (C2).** Does "everything they can see" mean the team's last month, or all data their permissions allow? Who counts as "team" (direct reports, whole branch, nested units)? Can one manager lead several teams? | Scope is the team's last calendar month, intersected with the user's view permissions. "Team" is the manager's branch and its sub-units from the org hierarchy. A manager with several teams gets one export per team. |
| Q3 | **Retention conflict (C3).** What exactly must be kept forever: the file, or evidence that an export happened? What is the legal basis and the audit retention period? Do regulator holds override the 12-month deletion? | Only the audit metadata and file hash are kept long term, for a period the bank sets (default: 10 years). The file is deleted within 12 months. No legal hold applies. |
| Q4 | **Performance (C4).** What is the typical and the largest row count per team-month? Is the 5 seconds measured at the server or the user's browser? Is an async fallback acceptable above the cap? | Typical volume is ≤ 100,000 rows. The cap is 100,000, measured server-side. Above the cap the export is async. |
| Q5 | **"Like the old system" (C5).** Provide a sample of the old CSV: columns, order, encoding, delimiter (comma or semicolon for Excel in Vietnam?), date format, locale. | The columns and format in FR-3. Comma delimiter, UTF-8 with BOM. |
| Q6 | **"Last month".** Calendar month or the last 30 days? Which timezone? Which date counts, event time or ingestion time? | Previous calendar month, Asia/Ho_Chi_Minh, event time. |
| Q7 | **Legal and policy basis.** Which data-protection policy and laws apply (e.g. Vietnam's personal-data protection law and decrees, State Bank of Vietnam information-security rules)? Is pseudonymised data still "personal data" under the bank's policy? Are there data-residency or encryption requirements for exported files? Who is the data owner or DPO approver? | Pseudonymised data is still treated as personal data for retention and security. In-country storage, encryption at rest and in transit. The bank's DPO reviews before go-live. Counsel has not reviewed this spec. |
| Q8 | **Fields.** Which log fields are exported? Do other fields (user agent, URL, device ID, free text) carry personal data? | The eight columns in FR-3 only. Everything else is excluded. |
| Q9 | **Pseudonym design.** Must pseudonyms be stable across months and exports? Must they be reversible by anyone, and by whom? | Stable keyed HMAC, not reversible by exporting users. Re-identification only inside the platform by authorised security staff. |
| Q10 | **Who may export.** Only the `branch_manager` role? Do deputies, auditors, or security teams need it? Is approval (four-eyes) needed? | Branch managers only. No approval step. |
| Q11 | **Audit consumers.** Who reads the export audit events, and in what system? Must they alert on large or repeated exports? | Events go to the platform audit log. No alerting in v1. |
| Q12 | **Retention job.** Which data does "personal data older than 12 months" cover (all logs, or only access logs)? Delete the record or anonymise the fields? Does it apply to backups and to the audit events? | Anonymise direct identifiers on access-log records and keep non-personal fields. Backups follow normal rotation. Audit events hold no personal data. |
| Q13 | **Delivery.** Is browser download enough, or do users want email or SFTP? | Browser download only. |
| Q14 | **Size and file handling.** Are there maximum file size limits, or a requirement for a password-protected or signed file? | No password. SHA-256 recorded in the audit event. |

## 10. Risks

- If the customer insists on unmasked exports to individual managers, v1 would breach their own stated policy. Escalate to the DPO before any build of that path.
- The 5-second target can fail if volumes exceed the cap. Resolve with Q4.
- "Keep forever" and "delete after 12 months" cannot both be true for a file with personal data. Release is blocked until Q3 is answered.
