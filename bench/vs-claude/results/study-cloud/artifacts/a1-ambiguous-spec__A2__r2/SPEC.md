# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer answers in "Open questions and assumptions". Do not start building the items marked **[BLOCKED]** until they are confirmed.

## 1. Summary

A self-service "Log Export" button lets a branch manager download their team's access logs for the previous calendar month as a CSV file. The customer is a Vietnamese bank.

The request as written contains requirements that contradict each other (see section 2). This spec resolves each one with a conservative default so that development can proceed. Each default is repeated in the open-questions section for customer sign-off.

## 2. Contradictions in the request

| # | Statement A | Statement B | Conflict |
|---|---|---|---|
| C1 | Exports contain **full** client IPs and usernames | **No personal data may leave the platform unmasked** | An export file is data leaving the platform. IPs and usernames are personal data, so both cannot hold. |
| C2 | Export "their team's" logs from "last month" | Export "**everything they can see**" | The scope is either fixed (team, last month) or whatever the viewer's permissions allow. |
| C3 | Complete within **5 seconds** | Everything visible, with no stated size limit | The time limit is only achievable up to some volume. |
| C4 | Exported files kept **forever** | Platform must **delete personal data older than 12 months** | A retained file containing personal data will eventually be older than 12 months. |
| C5 | "Like the old system" | The old system is not described | The CSV format is unknown. |
| C6 | "Make it simple" | Forensic use, masking, audit and retention | The controls needed are not simple. Keep the UI simple and put the complexity in the backend. |

## 3. Scope

### In scope
- An "Export logs" button for users with the Branch Manager role.
- Synchronous CSV export, up to a size cap (section 5.3).
- Masking by default, and an audited, approval-gated path to unmasked data for forensic use (section 5.2).
- Audit logging of every export.
- Retention and deletion rules for platform data and for export files.

### Out of scope (v1)
- Formats other than CSV.
- Scheduled or recurring exports.
- Exports for roles other than Branch Manager.
- Cross-branch exports.
- Changes to the log ingestion pipeline.

## 4. Users and permissions

- **Branch Manager**: may export logs for users in their own team and branch only.
- **Forensic Approver** (new role, assumed): approves requests for unmasked exports. Must not be the requester.
- **Auditor**: read-only access to the export audit trail.
- Authorization is enforced server-side on every request. The UI hides the button for other roles, but that is not the control.
- "Everything they can see" is bounded by the export scope in 5.1. A manager cannot export data outside their team, even if some other screen shows it.

## 5. Functional requirements

### 5.1 Scope of an export
- FR-1: The default period is the previous calendar month, in Asia/Ho_Chi_Minh (UTC+7). Boundaries are 00:00:00 on the first day (inclusive) to 00:00:00 on the first day of the next month (exclusive).
- FR-2: The records are the access logs whose actor is a member of the requester's team. Team membership is resolved server-side from the requester's identity, never from a client-supplied parameter.
- FR-3: The UI offers no date picker or team picker in v1.
- FR-4: If there are no records, return a CSV containing only the header row and tell the user that nothing matched.

### 5.2 Personal data handling
- FR-5 (default export, masked):
  - IPv4 `a.b.c.d` becomes `a.b.x.x`. IPv6 keeps the first /48, with the rest replaced by `x`.
  - Username becomes a stable pseudonym, `u_` followed by the first 12 hex characters of HMAC-SHA256(username, key). The key is held in the KMS and is rotated only by a documented process. The same user maps to the same pseudonym across exports, so activity can still be correlated.
  - Every other column that contains personal data (for example full names, emails, device IDs, and free-text fields such as URLs with identifiers) is masked or dropped. The column list is confirmed under Q6.
- FR-6 (forensic export, unmasked) **[BLOCKED on Q1]**:
  - Available only through a request, a reason and a case/ticket ID, and approval by a Forensic Approver who is not the requester.
  - The file is produced inside the platform and delivered through a controlled channel (see Q1 for the delivery mechanism). It is not downloaded to an arbitrary browser.
  - The file is encrypted at rest, its download link is single-use and expires in 24 hours, and the file is watermarked with the requester ID and the export ID in a header or footer row.
  - Until Q1 is answered, the "Request forensic export" action is not built. The UI shows no such option.
- FR-7: Masking is applied on the server, before the file is written. It is never done in the browser.
- FR-8: CSV injection defence. Any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.

### 5.3 Size and time limits
- FR-9: The target is that exports of up to **50,000 rows** finish within **5 seconds** at the 95th percentile, measured from request to the first byte of the download, under normal load. The row cap and the 5-second target apply to the synchronous path.
- FR-10: If the estimated row count exceeds the cap, the button does not run the export. It shows a message asking the user to narrow the scope. v1 does not provide an asynchronous export. If Q3 shows that volumes are larger, add an asynchronous job as a follow-up. This is not part of v1.
- FR-11: The export streams rows so memory use stays flat. There is a hard server timeout of 30 seconds, after which the request fails with an error and an audit entry.

### 5.4 CSV format
- FR-12: UTF-8 with BOM (so Excel shows Vietnamese characters correctly), comma delimiter, RFC 4180 quoting, CRLF line endings, a header row, and ISO 8601 timestamps with the +07:00 offset. **[BLOCKED on Q5]**: align the columns with the old system once a sample is provided. The default columns are: `timestamp, user_pseudonym, client_ip_masked, action, resource, result, branch_code`.
- FR-13: The file name is `log-export_<branch>_<YYYY-MM>_<exportId>.csv`.

### 5.5 Audit
- FR-14: Every export attempt, whether it succeeds, fails or is denied, writes an immutable audit record: export ID, requester ID, role, branch, period, masked or unmasked, row count, file SHA-256, result, timestamp, source IP, and for forensic exports the reason, case ID and approver.
- FR-15: Audit records contain no raw personal data from the logs. They reference the requester only.
- FR-16: Auditors can view and search the audit trail. Nobody can edit or delete entries through the product.

## 6. Retention and deletion

This section resolves C4. The requirement "keep exported files forever" and the requirement "delete personal data older than 12 months" cannot both apply to a file containing personal data.

- RR-1: Platform log data containing personal data (raw IP, username) is deleted or irreversibly anonymised once it is older than 12 months. A daily job does this, and each run is logged with counts.
- RR-2: **Masked export files** (FR-5) are retained for as long as the audit policy requires. They are treated as pseudonymised data, so Q2 asks the customer and their DPO to confirm that they fall outside the 12-month deletion rule. Assumption: they do.
- RR-3: **Unmasked forensic export files** contain personal data, so they follow the 12-month rule, counted from the date of the **logged event**, not the export date. Assumption: the file is deleted when the oldest record in it reaches 12 months, or when the case is closed, whichever comes first. The file's metadata and SHA-256 stay in the audit record forever, so the fact and integrity of the export remain provable.
- RR-4: The HMAC key for pseudonyms is retained as long as masked exports are retained. Destroying the key would irreversibly anonymise those files. Any key destruction is a decision of the DPO.
- RR-5: A legal hold or a regulator's request may suspend deletion. The platform supports a per-case hold flag that blocks RR-1 and RR-3 for the flagged records. Setting it requires the Forensic Approver role and is audited.
- RR-6: Deletion covers backups and replicas within a stated lag (assumed 35 days). Q8 asks the customer to confirm this.

## 7. Non-functional requirements

- NFR-1 Security: TLS 1.2 or later, encryption at rest, CSRF protection, per-user rate limit of 5 exports per hour (configurable), and no personal data in application logs, URLs or error messages.
- NFR-2 Availability: the export must not degrade ingestion or search. Use a read replica or a query timeout and a concurrency cap of 10 simultaneous exports.
- NFR-3 Compliance: design to the customer's data-protection policy and to the Vietnamese data-protection rules that apply to them (Decree 13/2023/ND-CP, and the Personal Data Protection Law if it is in force for them), plus State Bank of Vietnam information-security requirements. Legal review is required (Q9). This spec makes no legal conclusions.
- NFR-4 Data residency: all processing, storage and delivery stay in Vietnam, and no export data is sent to external services.
- NFR-5 Usability: one button, one confirmation dialog stating what will be exported (period, team, masked), a progress state, and clear error messages. Vietnamese and English UI strings.
- NFR-6 Accessibility and localisation: the button is keyboard-accessible and strings are externalised.

## 8. API sketch

- `POST /api/v1/log-exports` with an empty body or `{"mode":"masked"}`. The team and period are derived server-side. Returns `200 text/csv` as an attachment, `413` if over the row cap, `403` if not permitted, and `429` if rate-limited.
- `POST /api/v1/log-exports/forensic-requests` with `{reason, caseId}`. **[BLOCKED on Q1]**
- `POST /api/v1/log-exports/forensic-requests/{id}/approve` **[BLOCKED on Q1]**
- `GET /api/v1/log-exports/audit`, for Auditors.

## 9. Acceptance criteria

1. A Branch Manager from branch A cannot obtain any row from branch B, including by editing request parameters.
2. A default export contains no full IP and no raw username in any column. An automated scan for IP patterns and known usernames over sample exports finds none.
3. The same user has the same pseudonym across two exports.
4. A 50,000-row export completes in 5 seconds or less at p95 in the performance environment. A request over the cap returns 413 with a message and no partial file.
5. Cells beginning with `=`, `+`, `-` or `@` are neutralised.
6. Every attempt, successful or not, produces an audit record.
7. The retention job removes raw personal data older than 12 months in the test environment, and the audit records survive.
8. An unmasked export cannot be requested, approved or downloaded without the controls in FR-6. **[BLOCKED on Q1]**
9. The CSV opens correctly in Excel with Vietnamese characters.

## 10. Test notes

- Unit: masking functions (IPv4, IPv6, edge cases, invalid input), pseudonym stability, CSV escaping and injection.
- Integration: authorization matrix by role and branch, row cap, timeout, audit writing.
- Performance: 50,000 rows at p95 of 5 seconds or less, with 10 concurrent exports.
- Security: IDOR attempts on team and branch, rate limiting, link expiry.
- Retention: time-travel tests of the deletion job, legal hold and backup lag.

## Open questions and assumptions

Each item must be confirmed with the customer before building. "Assumption" is what this spec uses until then.

| # | Question | Assumption used meanwhile | Blocks |
|---|---|---|---|
| Q1 | **Full IP and username vs. no unmasked personal data (C1).** Which one wins? Is there a policy-approved exception for forensic use, and who approves it? What is the allowed delivery channel for unmasked data (in-platform viewer, encrypted file, secure share), given that "leaving the platform" is prohibited? | Masked by default. Unmasked data only via a four-eyes forensic path (FR-6), with the delivery channel to be decided by the customer. The unmasked path is not built until this is answered. | FR-6, API forensic endpoints, acceptance criterion 8 |
| Q2 | **Retention of exports vs. 12-month deletion (C4).** Do masked or pseudonymised exports count as personal data? Which "forever" applies: the audit record, or the file itself? Is there a legal maximum or minimum retention for audit data? | Masked files are retained under the audit policy. Unmasked files are deleted at 12 months from the event date. Audit metadata and hash are kept forever. | RR-2, RR-3 |
| Q3 | **Volumes and the 5-second limit (C3).** What is the typical and the maximum number of rows for a team for one month? Does 5 seconds mean time to first byte or time to the complete download? Under what load? Is a row cap with a "narrow the scope" message acceptable? | 50,000 rows per export, 5 seconds at p95 to the first byte, 10 concurrent exports, and no async export in v1. | FR-9 to FR-11 |
| Q4 | **"Everything they can see" vs. "team's last month" (C2).** Is the export scope fixed (own team, previous month) or does it follow the viewer's permissions, with a choice of dates? Can a manager see other teams or branches? | Fixed scope: own team, own branch, previous calendar month, no pickers. | FR-1 to FR-3, section 4 |
| Q5 | **"Like the old system" (C5).** Please provide a sample CSV, the column list, encoding, delimiter, date format and the old behaviour. Should the new export be column-compatible with downstream tools? | Default columns and format as in FR-12. | FR-12 |
| Q6 | **Which fields are personal data?** Beyond IP and username, which log fields are (user agent, device ID, URLs, free text, account numbers)? | IP, username, and any identifier-like free text are masked. The remaining fields are listed by the customer. | FR-5 |
| Q7 | **Who is a "branch manager" and what is a "team"?** How is the role assigned, and where does team membership come from (HR system, IdP group, platform setting)? Are acting managers or deputies covered? Is the "last month" boundary calendar-based and in Vietnam time? | Role and teams come from the platform's existing identity data. The calendar month in UTC+7. No deputies. | Section 4, FR-1, FR-2 |
| Q8 | **Deletion mechanics.** Is deletion hard delete or anonymisation? Does it include backups and replicas, and with what lag? Who is the evidence of deletion for? | Hard delete or irreversible anonymisation, backups purged within 35 days, and each run logged. | RR-1, RR-6 |
| Q9 | **Legal and regulatory basis.** Which regulations and bank policies apply (Decree 13/2023, the Personal Data Protection Law, State Bank of Vietnam rules, the bank's own policy)? Does the DPO or the legal team need to review, and is a data-protection impact assessment needed? Is cross-border transfer a concern? | All processing is in Vietnam. Legal sign-off is needed before go-live. | NFR-3, NFR-4 |
| Q10 | **Audit and approval roles.** Does the Forensic Approver role exist? Who are the Auditors? Should the audit trail be sent to the bank's SIEM? | New roles, with the audit trail inside the platform. | Section 4, FR-14 to FR-16 |
| Q11 | **Rate limits and abuse.** Is a limit of 5 exports per hour per user acceptable? Should managers be notified, or their own manager, when an export is made? | 5 per hour, with no notifications. | NFR-1 |
| Q12 | **"Make it simple."** Confirm that this means a simple UI (one button, no options), and that the controls above (masking, audit, approvals) are not to be dropped to achieve simplicity. | The UI stays simple. The controls remain. | Section 5 |
| Q13 | **Languages and Excel.** Is Vietnamese and English UI needed? Are exports opened in Excel (UTF-8 BOM)? | Both languages, with the BOM. | NFR-5, FR-12 |
