# Log Export: Implementation Specification

Status: DRAFT, blocked on customer confirmation of the items in [Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service **Log Export** button that lets a branch manager download their team's access logs for the previous calendar month as a CSV file.

The request contains requirements that conflict with each other. They are listed in section 2. Nothing in sections 3 to 9 should be built until the customer resolves them. Where the spec has to proceed, it uses the **default assumptions** from the open-questions table, which are chosen to be the safest option (privacy-preserving, least privilege, fail closed).

## 2. Conflicts in the request

| # | Statement A | Statement B | Why they cannot both hold |
|---|---|---|---|
| C1 | "Exports must contain full client IP addresses and usernames" | "No personal data may leave the platform unmasked" | An export file is a data egress. Full IPs and usernames are personal data. Either the export is masked or it is not. |
| C2 | "Export everything they can see" | "Export their team's access logs from last month" | The first is unbounded (any time range, any scope visible in the UI). The second is a fixed scope. |
| C3 | "Exported files are kept forever for audit" | "Delete personal data older than 12 months" | A retained file that holds personal data older than 12 months violates the deletion rule. |
| C4 | "Complete within 5 seconds" | "Export everything they can see" | A bounded time cannot be guaranteed for unbounded volume. |
| C5 | "Make it simple" | Masking exceptions, approvals, audit, retention | The compliant version needs controls that are not simple. "Simple" is read as simple for the user (one button), not as fewer controls. |

Default resolution (used unless the customer says otherwise):
- C1: the default export is **masked**. Unmasked export is a separate, gated capability (section 5.3), available only if the customer confirms it is legally permitted.
- C2: scope is the manager's **own team, previous calendar month**. Other ranges are out of scope for v1.
- C3: the **export file** is deleted on a short schedule. The **audit record of the export** (who, when, what scope, row count, hash) is kept long term and contains no client IP or username values.
- C4: 5 seconds applies to the interactive path up to a row cap. Larger exports become asynchronous (section 6).

## 3. Scope

In scope:
- UI button and confirmation dialog for branch managers.
- Authorization, scoping, masking, CSV generation, download.
- Audit trail of exports.
- Retention and deletion of exported files and of personal data in logs.

Out of scope for v1:
- Arbitrary date ranges, other log types, other formats (JSON, XLSX).
- Scheduled or recurring exports.
- Export by roles other than branch manager.
- Changes to the log ingestion pipeline, except where needed for retention.

## 4. Users and authorization

- Actor: a user with the `branch_manager` role.
- A manager may export only logs of users in teams they manage, as defined by the organization hierarchy source (see Q4). The scope is computed server-side. The client never supplies team or user IDs for the filter.
- Every request is authorized on the server. Visibility in the UI is not authorization.
- Requests from users without the role return 403 and are audited.
- A manager cannot export their own activity as "team" unless the hierarchy includes them (see Q4).

## 5. Functional requirements

### 5.1 Trigger
- FR-1: The log view shows a "Export last month" button, enabled only for authorized users.
- FR-2: A confirmation dialog states the period (e.g. "01/10/2026 to 31/10/2026, Asia/Ho_Chi_Minh"), the scope (team name), the masking level, and that the export is audited.
- FR-3: The period is the previous calendar month in `Asia/Ho_Chi_Minh` time, computed server-side from the server clock.

### 5.2 Content (masked default)
- FR-4: One row per access log event in scope. The column list is fixed and documented. The "old system" column set is unknown (Q6). Assumed columns:

| Column | Source | Masked default |
|---|---|---|
| `timestamp` | event time | ISO 8601 with +07:00 offset |
| `user_ref` | username | pseudonym: keyed HMAC-SHA-256 of username, truncated to 12 hex chars. Stable within the platform so rows correlate. |
| `client_ip` | client IP | IPv4: last octet replaced with `xxx` (`203.0.113.xxx`). IPv6: keep first /48, rest masked. |
| `action` | event type | as is |
| `resource` | target resource | as is |
| `result` | success or failure | as is |
| `branch_id` | branch | as is |

- FR-5: CSV format: UTF-8 with BOM (for Excel in Vietnamese locales; confirm in Q6), comma delimiter, RFC 4180 quoting, `\r\n` line endings, header row.
- FR-6: **CSV injection protection**: any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`. Log content may be attacker-controlled.
- FR-7: Filename: `access-logs_<branch_id>_<YYYY-MM>_<export_id>.csv`. The filename must not contain personal data.

### 5.3 Unmasked export (conditional, off by default)
Built only if the customer confirms in Q1 that it is permitted. If built:
- FR-8: Requires a separate permission (`log_export_unmasked`), not held by branch managers by default.
- FR-9: Requires a written reason and a second-person approval (for example the security or compliance officer) before the file is generated.
- FR-10: Output is encrypted at rest and delivered only through the platform's authenticated download. The file does not leave the platform in the clear.
- FR-11: The file has a short expiry (default 7 days) and is then deleted.
- FR-12: Forensic use cases are served preferably by a forensics role working inside the platform, not by a file sent out.

### 5.4 Download
- FR-13: The file is delivered via an authenticated, single-use or short-lived (15 minutes) link bound to the requesting user. No public URLs.
- FR-14: Response headers: `Content-Disposition: attachment`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

### 5.5 Audit
- FR-15: Every attempt (allowed, denied, failed) writes an audit record: export id, actor, role, scope (team id), period, masking level, row count, SHA-256 of the file, start and end time, outcome, approver and reason if unmasked.
- FR-16: Audit records contain no raw client IP or username values. They are append-only and tamper-evident.
- FR-17: Audit records are kept for the period in Q3 (assumed 5 years).

## 6. Non-functional requirements

- NFR-1 Performance: for exports up to **50,000 rows** (assumption, Q5), the time from click to the download starting is at most 5 seconds at p95 under the load in Q5. Measure server-side time-to-first-byte plus stream.
- NFR-2 Large exports: above the cap, the request is accepted, a job is queued, and the user is notified in the UI when the file is ready (the 5 seconds then applies only to acknowledging the request, within 1 second). The cap and behavior are configurable. No silent truncation. If the cap is hit and async is disabled, the user gets an explicit error.
- NFR-3 Streaming: the CSV is streamed from a bounded-memory query. Do not load all rows in memory.
- NFR-4 Rate limit: at most 5 exports per user per hour, and 1 concurrent export per user.
- NFR-5 Security: TLS only, files encrypted at rest (AES-256), keys managed by the bank's KMS or HSM. The HMAC key for pseudonyms is stored in KMS and rotated per policy (rotation breaks correlation across periods; see Q8).
- NFR-6 Availability: export failure must not affect log ingestion or search.
- NFR-7 Localization: UI in Vietnamese and English.

## 7. Data retention and deletion

Defaults, pending Q2 and Q3:

| Data | Retention | Mechanism |
|---|---|---|
| Raw logs with full client IP and username | 12 months, then personal fields deleted or irreversibly anonymized | Daily job. Records older than 12 months have `username` and `client_ip` nulled or replaced by an irreversible hash. |
| Export files (masked) | 30 days | Scheduled deletion, with a deletion record in the audit trail. |
| Export files (unmasked, if built) | 7 days | Same. |
| Export audit records (no raw personal data) | 5 years | Kept. This is the "kept forever for audit" requirement, satisfied by metadata and not by the data. |
| Backups and replicas | Deletion applies within 35 days (assumption) | Documented backup expiry. |

- FR-18: The retention job is idempotent, logs counts of records processed, and alerts on failure or when more than 24 hours late.
- FR-19: Legal hold (Q3) pauses deletion for a specific case, requires an authorized approver, and is audited.
- FR-20: A file containing personal data must never outlive the 12-month rule. Because exports are limited to last month, a file generated in month M contains data at most about 2 months old when created, so the 30-day file retention keeps it within the rule. This must be re-checked if the range is widened.

## 8. Compliance notes (to be validated by the bank's legal and compliance team)

This spec is not legal advice. The expected applicable instruments include Vietnam's Decree 13/2023/ND-CP on personal data protection, the Law on Personal Data Protection (in force from 1 January 2026), the Law on Cybersecurity, and State Bank of Vietnam regulations on information-system security and record retention. Some of these may require retention periods that differ from "12 months" for transaction records. Whether access logs count as such records is Q2. Data minimization, purpose limitation, and the cross-border transfer rules are relevant if the platform or exports are outside Vietnam (Q9).

## 9. Acceptance criteria

1. A branch manager sees the button. A non-manager does not, and a direct API call by a non-manager returns 403 and creates an audit record.
2. Manager A cannot obtain any row of team B, including by editing request parameters.
3. The default export contains no raw username or full client IP. A test greps the output for known fixtures.
4. A cell starting with `=cmd|...` is exported neutralized.
5. A 50,000-row export meets the 5-second p95 target in the performance environment. A 500,000-row request takes the async path and produces a complete file with a matching row count and hash in the audit record.
6. After 30 days the file is gone and the deletion is audited. The audit record is still present.
7. A log record 12 months and 1 day old has no username or client IP after the retention job runs.
8. Download links expire and are not usable by another user.
9. If unmasked export is built: it cannot run without a reason and an approval, and the approver differs from the requester.

## Open questions and assumptions

Each item must be confirmed with the customer before building. "Assumption" is what this spec uses until then.

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | **Masking vs full data (C1).** Does "no personal data may leave the platform unmasked" apply to exports? If yes, how can forensic use require full IPs and usernames? Is there a legal basis and an approved process that permits unmasked export? Who may approve? | Default export is masked (pseudonymized username, IP last octet masked). Unmasked export is not built in v1. Forensic users work on full data inside the platform under a separate role. FR-8 to FR-12 are built only after written approval from compliance. |
| Q2 | **Retention vs forever (C3).** Which rule prevails for personal data: delete after 12 months, or keep forever? Does any SBV or other regulation require a longer retention of access logs? Does "12 months" count from event time or ingestion time? What does "delete" mean: removal of the row or anonymization of the fields? | The 12-month rule prevails for personal fields. Time counts from event time. Delete means irreversible anonymization of `username` and `client_ip`, keeping the rest of the row. |
| Q3 | **What exactly is kept "forever"?** The exported files, or only a record that the export happened? Is there a legal hold process? What is the audit retention period? | Only the audit metadata is kept, for 5 years. Files expire after 30 days (7 days if unmasked). Legal hold exists and is manual. |
| Q4 | **Team and "can see" definition.** What is a "team" and where is the hierarchy sourced (HR system, IdP, platform groups)? Are sub-teams included? Is a manager's own activity included? Can a manager manage several branches? What does a manager currently see in the UI? | Team = users directly or indirectly reporting to the manager in the platform's group model, including sub-teams, excluding the manager. Multiple branches are allowed, one export per branch. |
| Q5 | **Volume and the 5-second target.** How many log events per team per month (typical and worst case)? Is 5 seconds measured to the first byte or to a complete download? Under what concurrent load? Is the target a hard limit or a goal at p95? | Cap of 50,000 rows for the synchronous path, p95, measured to the end of the stream, up to 20 concurrent exporters. Above the cap the export is async. |
| Q6 | **"Like the old system".** Which system? Provide a sample file: columns, order, delimiter, encoding, date format, filename, header language. Is Excel-compatibility (BOM) required? | Columns as in FR-4, UTF-8 with BOM, comma delimiter, ISO 8601 dates. To be replaced by the old system's format when a sample is provided, with the exception of the privacy rules. |
| Q7 | **"Everything they can see" vs "last month" (C2).** Is the intent a fixed last-month report, or any range or filter the user has on screen? Other log types? | Fixed previous calendar month for the manager's team only. Custom ranges are deferred to v2. |
| Q8 | **Masking method.** Is pseudonymization (consistent HMAC) acceptable, or must usernames be fully hidden or partially shown (e.g. `ng***en`)? IP masking level (last octet, /24, hash)? Must the pseudonym be stable across months? Who holds the key and the re-identification process? | Keyed HMAC, stable while the key is not rotated. Re-identification only by the security team via the key custodian, audited. IP masking as in FR-4. |
| Q9 | **Hosting and transfer.** Where is the platform hosted (on-premises in Vietnam, cloud, region)? Can the downloaded file be stored on managers' own devices? Is DLP or endpoint control in place? | Hosted in Vietnam. Download to the manager's managed device is acceptable for masked files. The platform cannot control the file after download. |
| Q10 | **Authentication and approvals.** Does the bank require MFA or step-up authentication on export? Does the bank want manager-level approval workflow, or notification to compliance, for each export? | Step-up MFA at export time. No approval for masked exports. Compliance receives a daily export summary. |
| Q11 | **Failure and limits.** What should happen when an export exceeds the cap: async, split into several files, or refuse? Rate limits acceptable? Notification channel when async completes? | Async job, in-app notification, rate limit as in NFR-4. |
| Q12 | **Time zone and "last month".** Calendar month in Vietnam time (UTC+7)? On the 1st of the month, is data for the last day complete (ingestion lag)? | Asia/Ho_Chi_Minh. Export is allowed from the 2nd day of the month, to allow ingestion to finish. |
| Q13 | **Scope of "simple".** Does the customer accept the controls (confirmation, audit, rate limits, masking) as part of "simple"? Does it mean no configuration screens? | Yes. One button, one dialog, no settings UI. Parameters are configured by administrators in the platform configuration. |
| Q14 | **Who signs off** on the final resolution of Q1, Q2, Q3 (legal, DPO, CISO), and by when? | The bank's DPO and CISO, in writing, before the build starts. |

### Blocking order
Q1, Q2, Q3 and Q7 are blocking: they change the data model and what gets built. Q4, Q5, Q6 and Q8 affect the design but have workable defaults. The rest can be settled during implementation.
