# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer answers listed in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service "Log Export" button lets a branch manager download a CSV of their team's access logs for the previous calendar month. The request contains several requirements that conflict with each other (section 2). The design below resolves each conflict with a default that errs toward data protection. Each default is listed in section 9 and must be confirmed before building.

## 2. Conflicts in the request

| # | Requirement A | Requirement B | Default resolution |
|---|---|---|---|
| C1 | Export contains full client IPs and usernames (forensic use) | No personal data leaves the platform unmasked | Two export modes. **Masked** is the default and is self-service. **Unmasked** is a separate, gated, audited flow (4.3). |
| C2 | Files kept forever for audit | Personal data older than 12 months must be deleted | Retain the **audit record** of each export forever (who, when, scope, hash). Do **not** retain exported files containing personal data beyond 12 months. Files are deleted at the retention limit, and the audit record stays. |
| C3 | "Export everything they can see" | Branch managers export only their team's logs for last month | Scope is the intersection of what the user is authorised to view and their team. Period is the previous calendar month. Wider access needs a different role (see Q5). |
| C4 | Complete within 5 seconds | Unbounded volume | 5 s is a target for up to a row cap at p95. Larger exports run asynchronously (4.5). |
| C5 | "Like the old system" | Old format not provided | Assume a column set and format (4.4) until a sample is supplied. |
| C6 | "Make it simple" | Controls needed for C1 to C4 | Keep the UI to one button and one confirmation. Put complexity in the backend. |

## 3. Scope

In scope:
- Export button and API.
- Masking.
- Authorisation.
- Audit trail.
- Retention and deletion jobs.
- Async path for large exports.

Out of scope:
- Ad-hoc date ranges.
- Formats other than CSV.
- Scheduled or recurring exports.
- Exports for roles other than branch manager.
- Migration of old-system exports.

## 4. Functional requirements

### 4.1 Eligibility and scope
- FR-1: Only users with the `branch_manager` role see the button.
- FR-2: Each request is authorised server-side. The set of exportable rows is `rows the user may view` ∩ `rows for users in the manager's own team(s)` ∩ `previous calendar month` in Asia/Ho_Chi_Minh time (UTC+7). Hiding the button is not sufficient.
- FR-3: Team membership is resolved at export time from the identity source (Q4).
- FR-4: The client cannot send filters or scope parameters other than the export mode. The server derives scope from the session.

### 4.2 Masked export (default)
- FR-5: Usernames are replaced by a stable pseudonym. The pseudonym is HMAC-SHA256 of the username under a per-tenant key, truncated, and prefixed `u_`. The same user gets the same pseudonym across exports, so analysis is still possible.
- FR-6: IPv4 addresses are masked to /24 (`203.0.113.x`). IPv6 addresses are masked to /48.
- FR-7: Free-text columns that may contain personal data (user agent, URL query strings, message fields) are dropped or scrubbed. The exact list depends on the log schema (Q10).
- FR-8: Masking is applied server-side before the file is written. Unmasked values must not reach the file, the temp storage or the response.

### 4.3 Unmasked export (forensic, gated)
This mode exists only if the customer confirms it is lawful under their data-protection policy (Q1).
- FR-9: It is separate from the self-service button. It needs a recorded justification (case or ticket ID) and approval by a second person, such as the data-protection officer or security officer. A branch manager cannot self-approve.
- FR-10: The file is encrypted at rest. It is delivered only through an authenticated download inside the platform, never by email. The link expires after 24 hours and works once.
- FR-11: The file is deleted at its retention limit (FR-19). Each download is logged.
- FR-12: A scope limit applies (team, last month) and the request needs a stated purpose. The policy question of whether this counts as "leaving the platform" is Q1.

### 4.4 CSV format (assumed, to confirm in Q6)
- UTF-8 with BOM (for Excel), comma separator, RFC 4180 quoting, header row, ISO 8601 timestamps with `+07:00` offset.
- Columns: `timestamp, user (masked or raw), client_ip (masked or raw), branch_id, resource, action, result`.
- FR-13: Cells that begin with `=`, `+`, `-` or `@` are prefixed with `'` to prevent CSV formula injection.
- FR-14: Filename is `access-logs_<branch>_<YYYY-MM>_<mode>.csv`.

### 4.5 Performance
- NFR-1: Synchronous exports of up to **50,000 rows** return within 5 s at p95 under normal load. The row cap is an assumption (Q7).
- FR-15: Above the cap, the request becomes an async job. The user sees "Your export is being prepared". The file appears under "My exports" and a notification is sent when it is ready. Nothing is silently truncated.
- FR-16: Stream rows to the response. Do not build the file in memory. The query must be served by an index on `(branch_id, timestamp)`.
- FR-17: Limit each user to 1 concurrent and 5 per hour exports. Over the limit returns 429.

### 4.6 Audit
- FR-18: Every attempt is recorded in an append-only audit log, whether it is allowed, denied or failed. The record holds: requester ID, role, timestamp, mode, scope (branch, period), row count, SHA-256 of the file, approver and justification (unmasked only), and outcome. The audit record contains no exported personal data, so it can be kept forever (C2).
- FR-19: See section 5 for retention.

## 5. Retention and deletion

| Data | Retention | Basis |
|---|---|---|
| Export audit record (FR-18) | Indefinite | Audit requirement; contains no raw personal data. Pseudonymous requester ID only. |
| Masked export files | 12 months from creation, then hard-deleted | Pseudonymised data; treated conservatively as personal data (Q2) |
| Unmasked export files | 12 months from creation maximum, or shorter if the customer says so (Q3), then hard-deleted | Contains personal data |
| Source access logs | Personal data fields deleted or irreversibly anonymised once older than 12 months | Customer policy |

- FR-20: A daily job deletes expired files and checks that none remain. It writes a deletion record (file ID, hash, time) to the audit log.
- FR-21: Deletion covers replicas, temp files and backups. Backups are handled by encryption key expiry or by expiry within a stated window (Q3).
- FR-22: Pseudonymisation keys are not rotated within the retention window, so exports stay comparable. After 12 months the key for expired data may be destroyed.
- Note: the request "kept forever" and "delete after 12 months" cannot both apply to the same personal data. If the customer insists on forever-retained exports, the files must be fully anonymised, meaning no reversible pseudonyms and no full IPs. That would defeat the forensic purpose.

## 6. Security

- Transport: TLS 1.2 or later. Files at rest are encrypted with AES-256, using keys in the bank's KMS or HSM.
- Authentication through the bank's SSO with MFA. Session timeout per bank policy.
- Authorisation checks are server-side on both create and download. Download links are bound to the requesting user.
- Rate limiting as in FR-17.
- Logs and error messages never contain exported personal data.
- Data stays in Vietnam: the platform, storage and backups must be hosted in-country (Q9).

## 7. Compliance notes (to validate with the bank's legal and compliance team, not legal advice)

The platform likely falls under Vietnam's personal data protection rules (Decree 13/2023/ND-CP and the Law on Personal Data Protection that took effect in 2026) and State Bank of Vietnam information-security requirements. The following needs confirmation: legal basis and purpose for processing IPs and usernames in logs, whether pseudonymised data still counts as personal data, retention minimums that apply to bank logs (which may conflict with the 12-month deletion rule), and cross-border transfer rules. Exact legal references and any minimum log-retention rule must be confirmed by the bank (Q2, Q3).

## 8. Acceptance criteria

1. A branch manager clicks the button and receives a masked CSV with only their team's rows for the previous calendar month. No full IP or raw username appears anywhere in the file.
2. A manager of branch A cannot obtain branch B rows by changing the request. The server returns 403 and logs the attempt.
3. A masked export of 50,000 rows completes in 5 s or less at p95 in the performance environment. An export above the cap runs asynchronously and is complete (no truncation).
4. Unmasked mode is not reachable from the self-service button. It cannot complete without a second approver and a justification.
5. Every attempt has an audit record. The audit record contains no raw personal data.
6. A file older than 12 months is gone from primary storage, replicas and temp storage within 24 hours of expiry, and a deletion record exists.
7. Source log personal data older than 12 months is deleted or anonymised.
8. A cell beginning with `=` opens as text in Excel.
9. In a manager's month with no rows, the CSV contains only the header row and the audit record shows 0 rows.

## 9. Open questions and assumptions

Each point must be confirmed with the customer before building. The assumption is what the build will use until then.

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | The request needs full IPs and usernames for forensics but also says no personal data leaves the platform unmasked. Which governs? Does "leave the platform" mean download to a user's machine, or only transfer outside the bank? | Masked is the default for the self-service button. Unmasked is a separate gated flow (4.3), built only after written confirmation. Until then, unmasked is not built. |
| Q2 | Does the bank treat pseudonymised usernames and /24-masked IPs as non-personal (acceptable "masked")? What masking standard do they require? | The masking in FR-5 to FR-7 is acceptable. Masked files are still handled as sensitive and deleted at 12 months. |
| Q3 | "Kept forever" versus "delete at 12 months". Which wins for exported files and for backups? Is there any regulatory minimum retention for logs? | The 12-month deletion wins for files that contain personal data. Audit records without raw personal data are kept forever. Backups expire within 35 days of deletion. |
| Q4 | What is "team" and where does membership come from (HR system, directory, platform groups)? Can a manager have several teams or branches? Do deputies or acting managers count? | Team = the users assigned to the manager's branch in the platform's identity source. Several branches are allowed. No delegation. |
| Q5 | "Everything they can see" versus "team, last month". Which scope is intended? Do other roles (auditors, security staff) need the button? | Scope is last calendar month for the manager's team only. Only the `branch_manager` role has the button. |
| Q6 | "Like the old system": we need a sample CSV and the column definitions. Do downstream tools depend on the format? | The format in 4.4. A sample file is requested. |
| Q7 | Realistic row volume for a team-month, and the load profile. Is 5 s end-to-end including browser download? Is async acceptable above the cap? | Up to 50,000 rows synchronous within 5 s, server time. Async above that. |
| Q8 | Is "last month" the previous calendar month, or the last 30 days? Which time zone? | Previous calendar month in Asia/Ho_Chi_Minh (UTC+7). |
| Q9 | Where must the data be hosted, and which regulator or internal policy sets retention, residency and encryption rules (SBV circulars, Decree 13, the 2026 data protection law)? | In-country hosting, AES-256 at rest, TLS 1.2 or later. Legal review pending. |
| Q10 | What fields does the access log hold? Which hold personal data beyond IP and username (user agent, URLs, device ID, customer account numbers)? | Only the 7 columns in 4.4 are exported. Free-text fields are dropped. |
| Q11 | Who approves unmasked exports (DPO, security officer), and what is the approval SLA? Must unmasked exports be handled by someone other than branch managers? | The DPO or security officer approves. A branch manager can request but not approve. |
| Q12 | Who owns the deletion obligation and the evidence for it (auditors may ask for proof)? Is a deletion record in the audit log enough? | Yes, the platform audit log with a daily verification job. |
| Q13 | Does 12-month deletion apply to source logs as well as exports? If source logs are anonymised rather than deleted, is that acceptable? | Source log personal data is deleted or irreversibly anonymised after 12 months. |
| Q14 | Language and localisation of the UI and CSV headers (Vietnamese, English)? | Both supported in the UI. CSV headers in English. |
| Q15 | Is "simple" a constraint on the UI only, or does it also mean no approval workflow? | UI only. Controls stay in the backend. |

## 10. Delivery notes

- Build order: masking and scope enforcement, then audit and retention jobs, then the UI, then the async path. The gated unmasked flow is built last and only after Q1 is answered in writing.
- Test data must be synthetic. Real log data is not used in non-production environments.
