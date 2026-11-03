# Log Export: Implementation Specification

Status: DRAFT, blocked on customer confirmation of the items under "Open questions and assumptions".
Customer: Vietnamese bank. Feature: self-service "Log Export" button on the log platform.

## 1. Summary

Branch managers get a "Log Export" button. It exports their team's access logs for the previous calendar month as CSV, in the format of the legacy system.

The customer's request contains requirements that conflict with each other (section 2). This spec resolves each conflict with a conservative default so that building can start on the non-contentious parts. Every default is listed in section 10 and must be confirmed. The conflicts around masking, retention and the legal basis must be settled **before** any code that handles personal data ships.

## 2. Conflicts in the request

| # | Statement A | Statement B | Resolution used in this spec |
|---|---|---|---|
| C1 | Exports must contain full client IPs and usernames (forensic use) | No personal data may leave the platform unmasked | Two export modes. **Masked** is the default for self-service. **Unmasked** is a separate, approval-gated forensic export that is not part of the self-service button (see 5.2). |
| C2 | Export "last month" | Export "everything they can see" | Self-service scope is previous calendar month, limited to the manager's team. "Everything they can see" is treated as an upper bound on authorization, not as a request for unlimited scope. |
| C3 | Export "their team's" logs | Export "everything they can see" | The authorization filter is the source of truth. A manager never exports rows they cannot see in the UI. |
| C4 | Complete within 5 seconds | Everything they can see, with no size limit | Synchronous export only up to a row cap. Larger exports run asynchronously (see 6). The 5 s target applies to the synchronous path only. |
| C5 | Exported files kept forever for audit | Platform deletes personal data older than 12 months | Exported files that contain personal data are retained 12 months (unmasked) and deleted after that. Forever applies to the audit record of the export, which contains no log content (see 7). |
| C6 | "Make it simple" | Items C1–C5, audit, authorization | Simple for the user (one button, one file). Server side is not simplified where compliance requires otherwise. |

## 3. Goals and non-goals

Goals
- One-click CSV export of a branch manager's team's access logs for the previous calendar month.
- Masked output by default.
- Every export attempt is audited.
- Retention rules enforced by the platform, not by the user.

Non-goals (this release)
- Arbitrary date ranges or free-form filters (see Q4).
- Formats other than CSV.
- Scheduled or recurring exports.
- Export for roles other than branch manager (see Q6).

## 4. Users and authorization

- Actor: authenticated user with the role `branch_manager`.
- Scope: log records whose actor belongs to the manager's team(s) as defined in the identity system, in the manager's branch. The server computes the scope from the session. The client never supplies team or branch identifiers.
- The export query reuses the same row-level access filter as the log viewer. There must be one implementation of that filter, not a copy.
- Users without the role do not see the button, and the endpoint returns 403.
- Manager without a team, or with an empty result: return a CSV with only the header row and record the export as successful with 0 rows.

## 5. Functional requirements

### 5.1 Self-service export (masked)

- FR-1: A "Log Export" button appears in the log viewer for authorized users. Clicking it exports the **previous calendar month** (Asia/Ho_Chi_Minh, UTC+7, from 00:00:00 on the 1st to 23:59:59.999 on the last day).
- FR-2: Output is CSV, UTF-8 with BOM (for Excel in Vietnamese locales), RFC 4180 quoting, header row, `\r\n` line endings. The column set and order match the legacy export (Q3). Until the legacy format is supplied, use the columns in section 8.
- FR-3: Masking is applied **server-side** before bytes leave the service. No client-side masking.
  - Client IP: IPv4 keeps the first two octets (`10.20.x.x`). IPv6 keeps the first /48. Alternatively a keyed pseudonym (Q2).
  - Username: replaced by a keyed, stable pseudonym (HMAC-SHA-256 of the username with a platform-held key, truncated and prefixed `u_`), so a manager can still count and correlate one user's events within an export without learning identity.
  - Other free-text fields that may contain personal data (user agent, request path or query string, message) are scrubbed or excluded (Q2).
- FR-4: CSV injection protection: any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- FR-5: The file is named `access-logs_<branch>_<YYYY-MM>_masked.csv`.
- FR-6: Every attempt (success, denial, failure) writes an audit record (section 7).

### 5.2 Unmasked forensic export (separate, gated)

Needed because the customer states that forensic use requires full IPs and usernames. Because policy forbids unmasked personal data leaving the platform, this is not exposed through the self-service button.

- FR-7: A separate action available only to a distinct role (`forensic_analyst`, Q1/Q5), never to `branch_manager` by default.
- FR-8: Requires a written justification (free text plus case or ticket ID) and approval by a second person (four-eyes) before generation.
- FR-9: "Leaving the platform" is interpreted as leaving the bank's controlled environment. The unmasked file is delivered only into an access-controlled in-platform location (or the bank's designated forensic store), is encrypted at rest, and is not sent by email or to a personal download. If the customer actually means that no download of unmasked data is allowed at all, FR-7 to FR-9 become "view in platform only" (Q1).
- FR-10: Retention of the unmasked file is capped at 12 months from the log record date (section 7).

## 6. Performance and size

- NFR-1: The target is the 5 s requirement, measured server-side from request received to last byte sent, at p95, for exports up to **50,000 rows** (Q7: the assumed cap, to be validated against real monthly volume).
- NFR-2: Exports are streamed (cursor-based, no full in-memory buffering). Memory per export is bounded.
- NFR-3: If the result exceeds the cap, or the estimated time exceeds 5 s, the export is switched to **asynchronous**: the UI shows "Your export is being prepared", and the user is notified in-app and can download it from an "My exports" list. The 5 s requirement is explicitly not applicable to asynchronous exports.
- NFR-4: Rate limit: at most 5 exports per user per hour and 2 concurrent per user (Q7). Excess requests get 429.
- NFR-5: Queries use indexes on (`branch_id`, `team_id`, `event_time`). A load test with a realistic month of data is an acceptance criterion.

## 7. Data protection, retention, and audit

- DP-1: The platform deletes personal data older than **12 months** (measured from the log event time). This covers primary log storage, replicas and backups (backup expiry may lag per Q9), search indexes, and exported files.
- DP-2: Exported files are stored (if stored at all) in an encrypted store with an `expires_at` of the earliest of (a) 30 days from creation for masked self-service downloads (Q8), and (b) 12 months after the oldest log record included, for unmasked files. A scheduled job deletes expired files daily and records the deletion.
- DP-3: "Kept forever for audit" is satisfied by the **export audit record**, which holds metadata only and no log content or personal data beyond the requesting user's ID. It is kept indefinitely (or per the bank's records policy, Q8).
- DP-4: Audit record fields: export ID, requester user ID and role, timestamp, scope (branch, team IDs, period), mode (masked/unmasked), row count, file checksum (SHA-256), outcome, justification and approver (unmasked only), deletion time of the file.
- DP-5: Audit records are append-only and tamper-evident (write-once storage or hash chaining).
- DP-6: Masked data that is truly anonymized is outside personal-data rules, but pseudonymized data is still personal data. The keyed-pseudonym approach in FR-3 is therefore treated as personal data for retention, so the 12-month rule applies to all exports (Q2).
- DP-7: Legal basis and applicable rules (the Vietnamese personal data law and decree in force, SBV information-security regulation, any data-localization requirement) are to be confirmed by the bank's compliance and DPO. Data stays in Vietnam-hosted infrastructure (Q9). This spec does not give legal advice.
- DP-8: The HMAC pseudonymization key is held in the platform's KMS or HSM, rotated per policy. Rotation changes the pseudonyms, so rotation is not done within a month's export window without notice.

## 8. Default CSV columns (replace with the legacy format when received)

`event_time` (ISO 8601 with +07:00), `branch_id`, `team_id`, `user_pseudonym`, `client_ip_masked`, `action`, `resource`, `result`, `session_id_pseudonym`.

The unmasked variant replaces `user_pseudonym` with `username` and `client_ip_masked` with `client_ip`.

## 9. Acceptance criteria

1. A branch manager sees the button, a manager of another branch cannot export this branch's rows (negative test), and other roles get no button and a 403.
2. The export covers exactly the previous calendar month in UTC+7, with inclusive start and end boundaries, including a month-end event at 23:59:59 local time.
3. No unmasked IP or username appears in any self-service export, verified by an automated scan of generated files and by tests on every free-text column.
4. The same user has the same pseudonym within and across exports (while the key is unchanged).
5. p95 ≤ 5 s for ≤ 50,000 rows under load testing; a larger export goes asynchronous, with no timeout error to the user.
6. Every attempt, including denied ones, creates an audit record, and audit records cannot be modified or deleted via the app.
7. The retention job deletes data and exported files older than 12 months, and a test with a time-shifted clock proves it, including exports and replicas.
8. The CSV opens correctly in Excel with Vietnamese diacritics, and formula-injection test strings are neutralized.
9. The unmasked flow is unavailable to `branch_manager`, and cannot produce a file without justification and a second approver.

## 10. Open questions and assumptions

Each point must be confirmed with the customer before building. The assumption applies in the meantime.

| ID | Question to confirm | Assumption used meanwhile |
|---|---|---|
| Q1 | The request says exports must contain full IPs and usernames, and also that no personal data may leave the platform unmasked. Which governs? What does "leave the platform" mean (any download, or leaving the bank's network)? | The data-protection policy governs the self-service button: masked output only. Full data is available only through the gated forensic flow (5.2), delivered inside the bank's controlled environment. Unmasked data is never downloadable by branch managers. |
| Q2 | What masking is acceptable (truncation, keyed pseudonym, hash, full redaction)? Which fields count as personal data (IP, username, user agent, URL, session ID, free text)? Is pseudonymized data treated as personal data under the bank's policy? | IP truncated to /16 (IPv4) or /48 (IPv6); username as a keyed HMAC pseudonym; free text and user agent scrubbed or dropped; pseudonymized data treated as personal data. |
| Q3 | Which exact CSV format did the old system use (columns, order, delimiter, encoding, date format, file naming)? Is byte-compatibility required, e.g. because downstream tools parse it? | The default columns in section 8, UTF-8 with BOM, comma delimiter, ISO 8601 timestamps. Column parity is not guaranteed until the legacy sample is supplied. |
| Q4 | Does "last month" mean the previous calendar month, or the last 30 days? Should users be able to choose a range? Does "export everything they can see" override the month limit? | Previous calendar month in UTC+7, no range selector. "Everything they can see" is treated as an authorization limit only. |
| Q5 | Who may do forensic exports, who approves, and is a four-eyes process needed? Is there an existing incident or ticket system to reference? | New `forensic_analyst` role, mandatory justification with ticket ID, one approver from the security team who is not the requester. |
| Q6 | Who counts as a branch manager and what is "their team"? Where is the team and branch membership held (HR system, IAM, LDAP)? Do deputies, regional managers or auditors need access? Can one manager have several teams? | Membership comes from IAM groups. A manager exports only teams they manage directly. One or many teams are supported. No other roles in this release. |
| Q7 | What are the real monthly log volumes per team and per branch? Is the 5 s limit a hard SLA or a target? Does it include browser download time? Is an asynchronous path acceptable for large exports? | 5 s is a server-side p95 target for ≤ 50,000 rows; larger exports go asynchronous. Rate limits as in NFR-4. |
| Q8 | "Kept forever" versus the 12-month deletion rule: which wins for exported files that contain personal data? What is the audit retention period in the bank's records policy? Which regulator or auditor requires the "forever" retention? | The 12-month rule wins for any file containing personal data. Only the metadata audit record is kept indefinitely. Masked self-service files expire 30 days after creation. |
| Q9 | What are the 12-month deletion details: measured from event time or ingestion time? Do backups, replicas, search indexes and archives count, and what is the allowed backup deletion lag? Is data residency in Vietnam mandatory? Are there legal holds or investigations that suspend deletion? | Measured from event time. Deletion covers all copies except backups, which expire within 35 days after the primary deletion. Data stays in Vietnam. Legal-hold support is out of scope, but deletion has a per-case hold flag that is disabled by default. |
| Q10 | Do the bank's compliance team and DPO accept the legal basis and the DPIA (personal data protection impact assessment) for this feature? Has the regulator (e.g. SBV) any log-retention minimum (some rules can require retaining logs longer than 12 months) that would conflict with the 12-month deletion? | Compliance sign-off is a release gate. The 12-month rule is used as stated by the customer. If a longer legal minimum exists, deletion applies only to the personal-data fields while the anonymized logs remain. |
| Q11 | What is the expected download experience: browser download, email link, or in-app inbox? Is e-mail delivery of masked files allowed? | In-browser download for the synchronous path, in-app "My exports" for the asynchronous path. No email delivery. |
| Q12 | Which authentication and session policy applies (SSO, MFA, step-up before export)? | The existing SSO session. Step-up MFA is required for the unmasked flow only. |
| Q13 | Which languages and locales does the UI need (Vietnamese, English)? | Vietnamese and English, with Vietnamese as default. |
| Q14 | "Make it simple": is simplicity limited to the user interface, or is the customer expecting that audit, approval and asynchronous handling be dropped? | Simplicity is for the UI only. Audit, authorization, masking and retention are not optional. |

## 11. Implementation notes (non-binding)

- API: `POST /api/v1/log-exports` (no request body for self-service; scope derived from the session). Response `200` with `text/csv` (synchronous), or `202` with an export ID and `GET /api/v1/log-exports/{id}` for status and download.
- Unmasked: `POST /api/v1/forensic-exports` and `POST /api/v1/forensic-exports/{id}/approve`.
- Set `Cache-Control: no-store` and `Content-Disposition: attachment` on downloads. Download links are authenticated and single-user.
- Do not log row contents, IPs or usernames in application logs. Log export IDs only.
- Retention job: idempotent, daily, with a dry-run mode and metrics (rows and files deleted, oldest remaining record age) and an alert if the oldest personal data exceeds 12 months + 1 day.
