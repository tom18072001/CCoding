# Log Export – Implementation Specification

Status: DRAFT, pending customer confirmation of the items in
[Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Feature: self-service "Log Export" button on the log platform.

## 1. Summary

Branch managers get a "Log Export" button that exports their team's access logs for the
previous month as CSV. The customer request contains requirements that conflict with each
other (full IP/usernames vs. no unmasked personal data; keep exports forever vs. delete
personal data after 12 months; "everything they can see" vs. "team, last month"; 5-second
completion vs. unbounded volume). This spec resolves each conflict with the **most
restrictive, compliance-safe default** and lists it for confirmation. Nothing in section 5
may be built in its unsafe form before the customer answers.

## 2. Customer requirements and how this spec treats them

| # | Customer statement | Treatment |
|---|---|---|
| R1 | Self-service "Log Export" button | In scope (FR-1). |
| R2 | Branch managers export their team's access logs from last month | In scope (FR-2, FR-3). Scope conflicts with R6, see Q3. |
| R3 | CSV "like the old system" | Format unknown; assumed (FR-6), see Q5. |
| R4 | Full client IP and usernames, for forensic use | Conflicts with R5. Split into two tiers (FR-4, FR-5). |
| R5 | No personal data leaves the platform unmasked | Default tier is masked. Unmasked only via the controlled forensic path. |
| R6 | Export everything the user can see | Bounded by R2 and by the row-level permissions (FR-3). |
| R7 | Complete within 5 s | Applies to a sized synchronous tier; larger exports are asynchronous (NFR-1). |
| R8 | Exported files kept forever | Conflicts with R9. Only personal-data-free artefacts are kept forever (FR-9). |
| R9 | Delete personal data older than 12 months | Applies to the logs and to every export file containing it (FR-8). |
| R10 | Make it simple | Honoured in UX (one button, no options by default). Does not remove the controls above. |

## 3. Functional requirements

**FR-1 Button.** A "Log Export" button appears on the log view for users with the
`BRANCH_MANAGER` role. One click starts an export of the default scope (FR-2) in the masked
tier. No wizard.

**FR-2 Default scope.** Access-log records for the manager's team whose event timestamp is
in the previous calendar month, evaluated in `Asia/Ho_Chi_Minh` (UTC+7), start inclusive and
end exclusive. Example: on 2026-11-03 the range is `2026-10-01T00:00+07:00` ≤ t <
`2026-11-01T00:00+07:00`. Timestamps are stored in UTC and emitted in ISO-8601 with offset.

**FR-3 Authorization (server-side, never UI-only).**
- "Team" = users who report to the manager in the HR/IdP org tree as of the *event time*
  (assumption, Q2). The manager's own records are included.
- The export query is built from the same row-level permission filter as the log viewer, then
  intersected with the default scope. A manager can never export rows they cannot view.
- A manager with zero team members or zero matching rows gets a valid CSV with only the
  header row and a notice, not an error.
- A manager of several branches chooses one branch per export; one export never mixes
  branches (assumption, Q2).
- Requests for another user's team, or a tampered date range, return 403 and are audited.

**FR-4 Masked tier (default, self-service).**
- Username: replaced by a stable pseudonym `u_<first 12 hex of HMAC-SHA256(key, username)>`.
  The key is held in a KMS/HSM and rotated per policy (Q4). The same user gets the same
  pseudonym within one export, so patterns remain analysable.
- IPv4: last octet masked (`203.0.113.x`). IPv6: truncated to /48 (`2001:db8:1234::/48`).
  Exact masking rule is to be confirmed (Q4).
- Any other personal field (full name, employee ID, email, device ID, free-text messages
  containing such values) is masked or dropped. Free text is dropped unless proven clean (Q5).

**FR-5 Forensic tier (unmasked, controlled).** Contains full IP and real username.
- Requires the separate permission `LOG_EXPORT_FORENSIC`, not granted to branch managers by
  default. Assumption: held by Security/Fraud/Compliance staff.
- Requires a written justification (case/ticket ID, free text) and approval by a second
  person (four-eyes) before generation (Q1).
- Output is an encrypted file (AES-256, key managed by the platform) delivered only through
  an authenticated download link: single use, expires in 24 h, bound to the requester.
  No e-mail attachments, no public links.
- Download remains inside the bank's controlled environment (managed devices / VDI, Q1).
- The file is auto-deleted after 30 days (configurable, Q6) and always at the 12-month
  personal-data limit, whichever is earlier.
- Each file carries a visible footer row or metadata stating "CONFIDENTIAL – contains
  personal data – requester, ticket, expiry".

**FR-6 CSV format (assumed pending Q5).**
UTF-8 with BOM (so Excel shows Vietnamese characters correctly), RFC 4180, CRLF line ends,
comma delimiter, header row, ISO-8601 timestamps. Columns:
`event_time, user, client_ip, action, resource, result, branch_id, session_id`.
`user` and `client_ip` follow the tier. File name:
`log-export_<branch>_<YYYY-MM>_<tier>_<export_id>.csv`.
**CSV-injection protection:** any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed
with `'`. Fields containing commas, quotes or newlines are quoted per RFC 4180.

**FR-7 Delivery and limits.**
- Sync path: if the estimated row count ≤ **100,000** (assumption, Q7), the file is generated
  in streaming mode and downloaded directly.
- Async path: above that, a job is queued, the UI shows progress, and the user is notified
  in-app when the file is ready (download link valid 24 h). No hard truncation. If a cap
  applies (assumption: 5,000,000 rows), the user is told and the file is split into parts.
- One concurrent export per user; a rate limit of 10 exports per user per hour.
  Repeated clicks return the same job.

**FR-8 Retention of personal data.**
- Log personal data older than 12 months is deleted or irreversibly anonymised by a daily job
  (Q8: delete vs. anonymise, and whether 12 months counts from event time).
- Every export file that contains personal data (both tiers, since pseudonyms are
  re-linkable with the key, so they are treated as personal data) is deleted when its oldest
  record reaches 12 months, or at its own shorter expiry (FR-5), whichever is earlier.
- Deletion covers primary storage, replicas, caches, temp files and backups on a documented
  schedule (backup purge window to be confirmed, Q8). A deletion log entry is written
  (no personal data inside it).

**FR-9 "Kept forever" – audit artefacts.** The customer's wish to keep exports forever
is met only by artefacts that contain no personal data:
- an immutable, append-only **export audit record**, kept indefinitely (or per the bank's
  legal retention, Q8): export ID, requester ID (see note), tier, scope, date range, row
  count, SHA-256 of the file, justification/ticket ID, approver, timestamps of
  request/generation/download/deletion.
- Note: the requester ID is itself personal data of staff. Assumption: staff identifiers
  in the audit record are kept under the bank's employment/audit legal basis (Q8).
- The file itself is not kept beyond FR-8. If the bank needs a forensic copy for an ongoing
  investigation, a **legal hold** flag, set by Compliance, suspends deletion for the files
  under it (Q8).

**FR-10 Audit and monitoring.** Every request, approval, denial, generation, download and
deletion is logged to the tamper-evident audit store. Alerts fire on: forensic export
outside business hours, more than 3 forensic exports per user per day, or repeated 403s.

## 4. Non-functional requirements

**NFR-1 Performance.** The "5 seconds" is interpreted as: for sync-path exports (≤ 100,000
rows), p95 from click to the first byte ≤ 2 s and to completion ≤ 5 s, measured on a
production-sized dataset, at 20 concurrent exporters. For the async path, the target is
job start ≤ 5 s and completion ≤ 5 min for 1,000,000 rows (Q7). The log store needs an index
on `(branch_id, event_time)` to meet this.

**NFR-2 Security.** TLS 1.2+ in transit, encryption at rest, no export content in
application logs or error messages, no personal data in URLs, download endpoints
authorized per request, files stored in a dedicated bucket with no public access.
The masking key is never stored with the exports.

**NFR-3 Compliance (to be validated by the bank's DPO/legal; not legal advice).**
Design is intended to align with Vietnam's personal-data rules (Decree 13/2023/ND-CP and
the Personal Data Protection Law taking effect in 2026), SBV information-security
requirements (e.g. Circular 09/2020/TT-NHNN), and the bank's own policy. Which of these
make IP addresses and usernames "personal data", and the log-retention periods required
of banks, must be confirmed by the customer (Q8, Q9). No claim of compliance is made
by this document.

**NFR-4 Availability and usability.** Export must not degrade the log-ingest path
(read from a replica or low-priority pool). UI strings in Vietnamese and English. Errors
are actionable ("No logs found for 10/2026", "Export too large, preparing in background").

**NFR-5 Data residency.** All export files and keys stay within the bank's Vietnamese
environment (assumption, Q9).

## 5. Open questions and assumptions

Each item must be confirmed before building. "Assumption" is what this spec uses meanwhile.

| ID | Question for the customer | Assumption used meanwhile |
|---|---|---|
| Q1 | **Core contradiction:** forensic use needs full IP and username, yet "no personal data may leave the platform unmasked". Which applies? What counts as "leaving the platform" (file download, display on screen, e-mail, a managed laptop)? Who may see unmasked data and under what approval? | Two tiers. Default export is masked. Unmasked export only for a separate forensic role, with justification, four-eyes approval, encrypted file, expiring single-use link, and managed devices only. Branch managers never get unmasked data. |
| Q2 | Definition of "their team": direct reports only or the whole subtree? Source of truth (HR system, IdP, log platform groups)? Which org snapshot (at event time or now)? Do managers see their own logs? Do they cover branches they temporarily cover? | Whole reporting subtree, from the IdP/HR org tree as of the event time. Own records included. No delegation without an explicit grant. |
| Q3 | "Export everything they can see" vs. "team's logs from last month": is the default scope the limit, or may managers pick other ranges and all visible data? | Scope is limited to the previous calendar month for their team. A wider range is not offered to branch managers, and the existing viewer permissions are only an upper bound. |
| Q4 | Which masking is acceptable to the DPO (partial IP vs. hash vs. removal)? Is a keyed pseudonym acceptable, who owns the key, rotation period? Is analytic value of consistent pseudonyms across exports needed? | Last IPv4 octet masked, IPv6 /48; usernames as HMAC-SHA256 pseudonyms with a KMS key rotated yearly (a pseudonym is stable within one export, and across exports until the key rotates). Pseudonyms are treated as personal data. |
| Q5 | What exactly is the "old system" CSV: columns, order, header language, encoding, delimiter, date format, line endings, free-text fields? Sample files needed. Do any columns contain personal data beyond IP and username? | The format in FR-6. Free-text fields are dropped from the masked tier. |
| Q6 | Is a time limit for unmasked forensic files and links acceptable? Maximum acceptable lifetime on the requester's device? | 24 h link, 30 days file lifetime, single download. |
| Q7 | Data volume: logs/month per branch, peak and p95; hardware allowed; "5 seconds" for what: click to download start, or to complete file, for how many rows? Is background export acceptable for large sets? | 5 s applies to ≤ 100,000 rows (sync). Larger exports are asynchronous with notification, 5,000,000 row cap with file splitting. |
| Q8 | **Retention contradiction:** "kept forever" vs. "delete personal data older than 12 months". Which wins? Is deletion physical or anonymisation? 12 months from event time or export time? Backups? Does the bank's regulatory obligation to retain logs (e.g. for AML/IT-security audit) require longer retention, and where? Legal-hold procedure? Is keeping staff identifiers in the audit record acceptable? | The 12-month deletion wins for anything containing personal data, including export files. Forever applies only to the personal-data-free audit record. Event-time based, physical deletion, backups purged within 35 days, legal hold available via Compliance. |
| Q9 | Which legal and policy texts apply and who signs off (DPO, security, SBV filing, cross-border rules)? Are IP addresses and usernames classed as personal data by the bank's policy? Must exports stay in Vietnam? | Both are treated as personal data. Data stays in the Vietnamese environment. Sign-off by DPO and CISO is required before release. |
| Q10 | Who holds which roles (branch manager, forensic, approver, Compliance) and how are they provisioned? Are there other users (auditors, deputies) who need the button? | Roles from the IdP groups. Only `BRANCH_MANAGER` sees the button. |
| Q11 | "Last month": calendar month or last 30 days? Time zone for the cut-off? Is a mid-month request allowed to include the current month? | Previous calendar month, `Asia/Ho_Chi_Minh`. The current month is never included. |
| Q12 | "Access logs": which event types and sources (login, API, admin actions)? Include failed events and system accounts? How are non-user IPs (NAT, proxy, VPN) treated? | All access-event types from the platform's access-log index, including failures and service accounts. |
| Q13 | "Simple": is a one-click flow with no choices acceptable given the approval flow for forensic exports? Is extra friction acceptable for the forensic tier only? | Yes. Managers' flow is one click. The forensic tier carries the approval step. |
| Q14 | Alerting/audit: who receives anomaly alerts and what SLA applies? Are manager exports reviewed periodically? | Alerts go to the Security Operations team. Quarterly review of the audit record. |

## 6. Acceptance criteria

1. A branch manager on 2026-11-03 clicks the button and receives a CSV containing only
   records from `2026-10-01T00:00+07:00` up to but not including `2026-11-01T00:00+07:00`
   for their own team, and no other team.
2. That CSV contains no raw username and no full IP address (checked by automated scan with
   regexes over a seeded dataset, zero hits).
3. The same manager cannot obtain the forensic tier by any parameter change; the API returns 403
   and an audit event exists.
4. A forensic export without an approved second person is not generated. After approval, the
   file is encrypted, the link works once, and both expire as specified.
5. A sync-path export of 100,000 rows completes in ≤ 5 s at p95 in the performance test
   (NFR-1); a 1,000,000-row export runs asynchronously and completes.
6. A record whose event time is 12 months old is absent from the logs and from all
   non-held export files after the retention job; the audit record for the export still
   exists and contains no username or IP.
7. Cells starting with `=`, `+`, `-`, `@` are neutralised in the output; Vietnamese
   diacritics open correctly in Excel; commas, quotes and newlines are escaped correctly.
8. Edge cases pass: no rows (header only), manager with no team, month boundaries around
   UTC+7 midnight, 28/29/30/31-day months, December→January year rollover, double click,
   and user losing the role during an async job (download re-authorised, denied).

## 7. Out of scope

Other formats (XLSX, JSON), scheduled exports, exports for non-managers, changes to log
ingestion, and legal sign-off itself.

## 8. Delivery notes

Build the masked tier first, using the assumptions in section 5. The forensic tier and the
retention job must not ship until Q1, Q6, Q8 and Q9 are confirmed in writing by the customer.
