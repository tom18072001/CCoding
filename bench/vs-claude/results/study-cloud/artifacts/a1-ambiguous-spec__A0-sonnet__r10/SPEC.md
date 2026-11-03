# Log Export: Implementation Specification

Status: DRAFT. Blocked on customer confirmation of the items in [Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service **Log Export** button lets a branch manager download their team's access logs for the previous calendar month as a CSV file.

The request contains requirements that conflict with each other. They are listed in section 2. Section 3 gives the design this spec proposes, built on the assumptions in the final section. If the customer answers differently, the affected sections change.

## 2. Conflicts in the request

| # | Statement A | Statement B | Why they conflict |
|---|---|---|---|
| C1 | Exports contain **full client IPs and usernames** (forensic use). | **No personal data may leave the platform unmasked.** | IPs and usernames are personal data. An export cannot be both full and masked. |
| C2 | Export is **the team's logs from last month**. | Users can export **everything they can see**. | The scope is either a fixed (team, previous month) set or the user's whole visibility. |
| C3 | Exported files are **kept forever** for audit. | The platform must **delete personal data older than 12 months**. | A retained export containing personal data is personal data that outlives 12 months. |
| C4 | Export completes **within 5 seconds**. | Volume is unspecified, and the scope may be a whole month or everything visible. | A fixed time limit cannot be guaranteed for unbounded data. |
| C5 | "Make it simple." | Needs access control, audit, masking, retention and legal basis. | Simplicity applies to the UX. The back end has to enforce the controls. |

Applicable regulation also matters. Vietnam has Law on Personal Data Protection (2025) and Decree 13/2023/ND-CP, and the State Bank of Vietnam has information-security rules for banks. The customer's legal and compliance team must confirm the retention periods and whether forensic access is a permitted purpose. This spec does not assume that answer.

## 3. Proposed design (based on the assumptions)

### 3.1 Roles and access
- Only users with the role `BRANCH_MANAGER` see the button.
- Authorization is checked on the server for every request. Hiding the button is not a control.
- A manager can export only logs of users assigned to **their own branch/team**, as defined in the org directory. A manager cannot export other branches.
- Two export modes:
  - **Standard export** (default): masked.
  - **Forensic export**: unmasked. Available only to the role `SECURITY_FORENSICS`, not to branch managers. It needs a case/ticket ID and a second-person approval (see Q1).

### 3.2 Scope
- Default period: previous calendar month, in Asia/Ho_Chi_Minh time (UTC+7). The period is the full month from 00:00:00 on the 1st to 23:59:59 on the last day.
- The period is selectable only within the data still retained (see 3.5).
- Scope is limited to the manager's team (see Q3). "Everything they can see" is interpreted as: everything in the manager's team scope, within the retained period, not just last month.

### 3.3 Masking (standard export)
- IPv4: last octet masked, e.g. `10.20.30.xxx`. IPv6: keep the first /48, mask the rest.
- Username: replaced with a stable pseudonym, a keyed HMAC-SHA-256 token (key held in KMS/HSM, rotated per policy). The same user maps to the same token within an export, so patterns remain analyzable. Managers can still see who is who in the platform UI under their existing permissions.
- Any other personal data fields in the log (e.g. device ID, free-text fields) are masked or dropped per the field table, which is to be agreed (Q6).

### 3.4 CSV format
- UTF-8 with BOM (for Excel in Vietnamese locales), RFC 4180 quoting, header row, CRLF line endings.
- Columns (assumed to match the old system, see Q5): `timestamp_utc, timestamp_local, user_id (pseudonym), client_ip (masked), action, resource, result, branch_id`.
- Defend against CSV/formula injection: any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- File name: `logs_<branch>_<YYYY-MM>_<exportId>.csv`.

### 3.5 Retention (resolving C3)
- Source logs containing personal data are deleted at 12 months. A daily job does this, and each run is itself audit-logged.
- **Exported files are not kept forever.** Standard (masked) exports are pseudonymized, and the file itself is not stored (see 3.6). A forensic export that is retained as evidence is stored in a restricted, encrypted evidence store. It follows the legal-hold process, and the customer's legal team sets its retention (Q4).
- What is kept forever is the **export audit record** (3.7), which contains no personal data of the subjects.

### 3.6 Delivery and performance (resolving C4)
- Target: p95 < 5 s from click to download start for exports up to **100,000 rows** (assumed typical monthly team volume, Q7).
- Exports are streamed from the server: no full-file buffering, with the query running on an indexed (branch_id, timestamp) path.
- If the export is estimated to exceed 100,000 rows or runs past 4 s, the request switches to an **asynchronous job**. The user sees "Your export is being prepared" and gets a notification and download link when it completes. The 5 s guarantee applies to the in-limit case only.
- Hard cap: 2,000,000 rows per export. Above it, the user must narrow the period.
- Download links are single-use, tied to the requesting user's session, and expire after 24 hours. Generated files are deleted after download or expiry.
- Rate limit: 5 export requests per user per hour.

### 3.7 Audit of exports
Each export request writes an immutable audit record: export ID, user ID, role, mode (standard/forensic), branch, period, filters, row count, file SHA-256, requested-at, completed-at, outcome, and for forensic exports, the case ID and approver. The audit records are append-only and retained as the audit policy requires (assumed: permanently, Q4). They contain no subject IPs or usernames.

### 3.8 UI (simple)
- One "Export logs" button on the team logs page. A confirmation dialog shows period (default last month), team, and the note "Personal data is masked".
- States: preparing, ready (download), failed (with reason and retry), forbidden.
- Vietnamese and English strings.

### 3.9 Security
- TLS in transit. Files at rest encrypted (AES-256) with keys in KMS.
- Logs of the export feature must never contain unmasked values.
- The unmasking key is not available to the export service in standard mode.

## 4. Acceptance criteria
1. A branch manager of branch A gets only branch A data. A request for branch B returns 403 and creates an audit record.
2. A standard export contains no full IP and no raw username (automated check on a fixture dataset).
3. A user with a role other than `BRANCH_MANAGER` or `SECURITY_FORENSICS` gets 403.
4. A forensic export without a case ID or approval is rejected.
5. An export of 100,000 rows downloads in under 5 s at p95 in the performance environment.
6. An export above the threshold becomes an async job, and the link expires after 24 h.
7. The retention job removes source records older than 12 months, and a test confirms no personal data remains.
8. Formula-injection test strings are neutralised in the CSV.
9. Every export, success or failure, has exactly one audit record.

## 5. Out of scope
Other formats (XLSX, JSON), scheduled exports, export of other log types, cross-branch reporting, changes to the logging pipeline.

## Open questions and assumptions

| # | Question to confirm with customer | Assumption used meanwhile |
|---|---|---|
| Q1 | **(C1)** Which wins: full IP/username for forensics, or no unmasked personal data leaving the platform? Does "leave the platform" include a download to a manager's laptop? Is forensic use an approved purpose under their data-protection policy and the law? Who may see unmasked data, and who approves it? | Standard export is always masked. Unmasked data is available only through a separate forensic mode, for `SECURITY_FORENSICS` only, with a case ID and a second approver, and the data stays within the platform's controlled environment or an approved secure channel. Branch managers never get unmasked data. |
| Q2 | Is the masking format acceptable (IPv4 last octet, IPv6 /48 kept, HMAC pseudonym for usernames)? Is the pseudonym enough for investigations, and who holds the key? | As described in 3.3. The bank's security team holds the key in its KMS. |
| Q3 | **(C2)** What exactly is "their team"? Branch, department or reporting line? From which source (HR/org directory, platform groups)? Is the scope limited to last month, or may the user export any period they can see? | Team = users assigned to the manager's branch in the org directory. The period is selectable within retained data, and the default is last month. |
| Q4 | **(C3)** What are the actual retention rules? Are exports "kept forever" meaning the files, or the audit record of the export? Can the legal team accept that deleted source data may still sit in old files? Which legal basis and which law prevail (Decree 13, the 2025 PDP Law, banking-secrecy and SBV retention rules)? | Masked exports are not stored. The export audit record (no personal data) is kept permanently. Forensic evidence files are stored encrypted under legal hold and reviewed on a schedule the customer sets. No file with unmasked personal data lives past 12 months unless a legal hold is recorded. |
| Q5 | What does "like the old system" mean? We need a sample CSV from the old system (columns, delimiter, encoding, date format, file naming). | Columns and format as in 3.4. |
| Q6 | Which log fields count as personal data (IP, username, device ID, session ID, free-text, account numbers)? Are logs allowed to contain customer (not staff) data? | IP and username are personal data, and the other columns in 3.4 contain none. Anything unknown is dropped from the export. |
| Q7 | **(C4)** What is the real volume (rows per team per month, peak and largest branch)? Does 5 s mean the whole file, or the first byte? Is async delivery acceptable above the limit? | 100,000 rows typical, 2,000,000 hard cap. 5 s applies to click-to-download-start under the 100,000-row limit. Async above it. |
| Q8 | Does "12 months" run from the log event time or from the ingestion time? Does deletion apply to backups and archives as well? Is deletion hard delete or anonymisation? | Event time, hard delete from the primary store, and backups expire within 35 days. Anonymising instead of deleting is acceptable only if the customer approves it. |
| Q9 | Who exactly is a "branch manager" in the identity system (role/group name)? Do deputies or regional managers need access? Is MFA required to export? | Role `BRANCH_MANAGER`, no deputies, existing login with MFA required for export. |
| Q10 | Time zone and month boundaries: Vietnam time (UTC+7) or UTC? | Asia/Ho_Chi_Minh. |
| Q11 | Are download and storage restricted to the bank's own infrastructure and Vietnam-resident data? Do any cloud or cross-border transfers occur (Decree 13 transfer rules)? | Everything runs in-country in the bank's approved environment. No cross-border transfer. |
| Q12 | Should managers be notified, or the security team alerted, on unusual exports (volume, repeated attempts)? Who reviews the audit records? | Rate limit of 5 per hour, and alerts to the security team above the 2,000,000-row cap or after 3 forbidden attempts. Review owner to be named by the customer. |
| Q13 | Languages and accessibility for the UI. | Vietnamese and English. |
| Q14 | Does "make it simple" allow the extra controls above (confirmation dialog, audit, rate limit, forensic approval)? | Yes. Simplicity applies to the manager's UX, which is one button and one confirmation. The controls are required for compliance and are not optional. |
