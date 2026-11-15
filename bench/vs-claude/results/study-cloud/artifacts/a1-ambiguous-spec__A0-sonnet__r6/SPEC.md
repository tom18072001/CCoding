# Log Export: Implementation Specification

Status: DRAFT, blocked on the customer confirmations in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform, self-service "Log Export".

## 1. Summary

Branch managers get a "Log Export" button that exports their team's access logs for the previous month as CSV. The customer request contains requirements that conflict with each other (section 2). This spec resolves each conflict with the **safest** reading, so the build can start. Every such choice is listed in section 9 and must be confirmed before release.

## 2. Conflicts in the request

| # | Request says | ...but also says | Resolution used in this spec |
|---|---|---|---|
| C1 | Exports contain **full** client IPs and usernames | **No personal data may leave the platform unmasked** | Self-service export is **masked by default**. Unmasked data is available only through a separate, approval-gated forensic path (FR-6), never the plain button. |
| C2 | Export **everything they can see** | Export **their team's** logs from **last month** | The export is bounded by the intersection of the user's authorization scope, their team, and the period. It never exceeds what they can see, and it is narrower than "everything". |
| C3 | Complete within **5 seconds** | No limit on volume | 5 s is a latency target for a bounded size (NFR-1). Larger exports run asynchronously. |
| C4 | Exported files kept **forever** | Platform must **delete personal data older than 12 months** | Export files are **not** kept forever. A permanent **audit record** of each export (no personal data) is kept forever instead (FR-8, FR-9). |
| C5 | "Like the old system" | Old system format is not provided | Format is unknown; see Q9. |
| C6 | "Make it simple" | Needs authorization, masking, audit, and retention | The UI stays simple (one button). Controls are server-side and invisible to the user. |

## 3. Scope

In scope:
- Export button, authorization, masking, CSV generation, delivery, audit trail, retention and deletion of export artifacts.
- The approval-gated forensic export path (FR-6), specified as a separate flow.

Out of scope (until confirmed):
- Formats other than CSV.
- Scheduled or recurring exports.
- Changes to the platform's own log retention policy (see Q5).

## 4. Actors

- **Branch manager**: exports their own team's logs.
- **Forensic approver**: person with authority to approve an unmasked export (role to be named by the customer, e.g. security or compliance officer).
- **Auditor**: read-only access to the export audit trail.
- **Platform admin**: operates the system. Admins have no access to export content.

## 5. Functional requirements

**FR-1 Entry point.** A "Log Export" button is visible only to users with the Branch Manager role. Clicking it exports the previous calendar month with no other input needed.

**FR-2 Period.** "Last month" means the previous full calendar month in `Asia/Ho_Chi_Minh` (UTC+7). The range is `[first day 00:00:00, first day of the current month 00:00:00)`. Timestamps in the CSV are ISO 8601 with the `+07:00` offset.

**FR-3 Scope and authorization.** Row-level filtering is enforced server-side on every request. A row is exported only if all of these hold:
1. It belongs to the requester's team(s) or branch, from the authoritative org mapping.
2. The requester can already see it in the platform UI (existing permissions apply).
3. It falls in the FR-2 period.

The client never supplies the team or scope. A request for another team's data returns 403 and is audited.

**FR-4 Masking (default export).**
- Client IPv4: last octet replaced, `203.0.113.xxx`. IPv6: keep the first /48, mask the rest.
- Username: replaced by a stable pseudonym, `user_<first 8 hex of HMAC-SHA256(key, username)>`. The same user maps to the same pseudonym within the export, so activity can still be correlated.
- The HMAC key is held in a KMS/HSM and is never in the export or logs. Key rotation policy is in Q4.
- Other fields that can identify a person (free-text messages, URLs with query strings, user agent, account or card numbers, national ID, phone, email) are scrubbed by an allowlist: **only listed columns are exported** (FR-5). Free-text columns are excluded unless the customer approves them.
- Masking is done server-side before the file is written. There is no client-side masking and no "show unmasked" toggle in the self-service flow.

**FR-5 CSV format.** UTF-8 with BOM (for Excel in Vietnamese locales), RFC 4180 quoting, header row, `\r\n` line endings. The column allowlist is a placeholder until Q9 is answered:
`timestamp, event_type, outcome, masked_username, masked_client_ip, resource, branch_id, team_id, request_id`.
Cells beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with `'` to prevent CSV/formula injection.

**FR-6 Forensic export (unmasked), separate flow.**
- Not reachable from the plain button. A manager can submit a request with a case ID and a reason.
- Requires approval by a forensic approver who is a different person than the requester (four-eyes). Self-approval is blocked.
- Scope is narrowed to the case: bounded time range and subject, not a bulk dump.
- Delivery stays inside the bank's controlled environment: encrypted file, download over the internal network only, expiring link, per-file key. "Leaves the platform" is interpreted in Q1.
- Unmasked files get the shortest retention (FR-8) and are marked in the audit trail.
- Until Q1 is confirmed, FR-6 is built behind a feature flag and disabled by default.

**FR-7 Delivery and size.** If the estimated result is within the NFR-1 limit, the CSV streams directly. Otherwise the user sees "Your export is being prepared" and is notified in-platform when it is ready. Notifications never contain personal data. The file is downloaded through an authenticated, single-use or user-bound link that expires (FR-8).

**FR-8 Export file retention.** Generated export files are deleted automatically after **7 days** (assumption, Q4/Q5), or sooner once downloaded and confirmed. Unmasked forensic files are deleted after **24 hours**, or on case closure if that is earlier. Deletion is cryptographic where possible (per-file key destroyed) and is logged.

**FR-9 Export audit trail.** Every export attempt (success, failure, denial) writes an immutable audit record: export ID, requester, role, scope (team/branch), period, masked or unmasked, row count, file hash, file expiry and deletion time, approver (FR-6), and result. The audit record **contains no exported personal data**, so it can be kept forever without breaching the 12-month rule. It is append-only and visible to Auditors.

**FR-10 12-month personal data deletion.** The platform deletes or irreversibly anonymizes personal data (username, full IP) in logs older than 12 months. A scheduled job runs daily, is idempotent, and reports counts to the audit trail. Because exports are covered by FR-8, no personal data older than 12 months persists in export files. The HMAC key used for pseudonyms must not allow re-identification of deleted data: pseudonyms in logs older than 12 months are removed with them (Q4).

**FR-11 Rate and abuse limits.** At most 5 exports per user per day and 1 concurrent export per user (assumption). Excess requests receive 429 and are audited. Unusual volume raises an alert to security.

## 6. Non-functional requirements

**NFR-1 Performance.** A synchronous export of up to **100,000 rows** (assumption, Q3) completes in **≤ 5 s at p95**, measured from request to the last byte, under the expected concurrent load (Q3). Beyond that, FR-7 asynchronous mode applies, with a target of ≤ 5 minutes. The 5 s requirement is not applied to unbounded volumes. The log store needs an index on `(team_id, event_time)` to support it.

**NFR-2 Security.**
- TLS 1.2+ in transit; files encrypted at rest with per-file keys.
- No personal data in application logs, URLs, error messages, or notifications.
- The server enforces the Branch Manager role on every call. UI hiding is cosmetic only.
- Download links are authenticated and expire.

**NFR-3 Auditability.** Audit records are tamper-evident (hash-chained or WORM storage).

**NFR-4 Availability.** Export must not degrade log ingestion or search. Exports run against a read replica or with resource quotas.

**NFR-5 Localization.** Vietnamese and English UI strings. Vietnamese text is exported correctly (UTF-8).

## 7. Acceptance criteria

1. A branch manager clicks the button and receives last month's CSV for their team only, with masked IPs and pseudonymized usernames.
2. A branch manager cannot obtain another team's rows by changing parameters (403, audited).
3. A scan of every exported masked file finds no full IP, no raw username, and no other personal data outside the allowlist.
4. A 100,000-row export finishes in ≤ 5 s at p95 in the load test. A larger export switches to asynchronous mode.
5. Export files are removed at the retention limit, and a deletion record exists.
6. Every export attempt has an audit record containing no personal data.
7. After the 12-month job runs, no username or full IP exists in logs, in exports, or in backups past their rotation window.
8. A CSV cell starting with `=` is neutralized.
9. An unmasked export cannot be approved by its own requester, and is impossible with the FR-6 flag off.

## 8. Dependencies

- Authoritative mapping of users to teams and branches.
- Identity/role source for Branch Manager, Forensic approver, and Auditor.
- KMS/HSM for the HMAC and file keys.
- In-platform notification service.

## 9. Open questions and assumptions

Each item must be confirmed with the customer before building. "Assumption" is what this spec uses meanwhile.

| ID | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | **Masking vs full data (C1).** The request requires full IPs and usernames for forensics but forbids unmasked personal data leaving the platform. Which wins, and what does "leave the platform" mean (any download, or only transfer outside the bank's environment)? Which legal basis and policy clause allow unmasked exports? | Self-service export is always masked. Unmasked data is only available through the approval-gated, internal-only forensic flow (FR-6), disabled until the customer confirms. |
| Q2 | **Who may export unmasked, and who approves?** Is the branch manager even allowed to request it, or only security/compliance? What case or evidence is required? | Managers may request, a separate approver must approve, a case ID is mandatory. |
| Q3 | **Volume and load.** What are the typical and peak rows per team per month, and how many concurrent exporters? Is the 5 s limit a hard SLA or a target? | Up to 100,000 rows synchronous, p95 ≤ 5 s. Larger runs asynchronously. 5 s is not guaranteed for unbounded volume. |
| Q4 | **Pseudonym design.** Is a stable HMAC pseudonym acceptable as "masked", or must usernames be fully redacted? Key owner and rotation period? Is partial IP masking (last octet) enough, or must the IP be fully removed or truncated further? Is a masked IP still personal data under the bank's policy? | Last-octet IPv4 / first /48 IPv6 and HMAC pseudonyms are treated as masked. Key rotated yearly and destroyed with the 12-month data. |
| Q5 | **Retention conflict (C4).** "Keep exports forever" conflicts with "delete personal data older than 12 months". Which governs? Do any regulations (for example State Bank of Vietnam IT security rules or Cybersecurity Law log-retention duties) require logs to be kept longer than 12 months, which would conflict with the deletion rule? Does "delete" mean erase or anonymize, and does it include backups? | The 12-month rule governs. Export files expire after 7 days (24 h for unmasked). A personal-data-free audit record of each export is kept forever. Anonymization is acceptable and backups are purged at normal rotation. Legal must verify this against applicable Vietnamese law (for example Decree 13/2023 and the Personal Data Protection Law) before release. |
| Q6 | **Meaning of "everything they can see" (C2).** Is a manager's export limited to the team and last month, or can they export any period or scope that they can view? | Limited to team, last month, and what they can already view. No other periods in v1. |
| Q7 | **"Last month" and "team".** Previous calendar month or trailing 30 days? Which time zone? How is "team" defined (branch, department, reporting line), and what about managers of several teams or staff who moved teams during the month? | Previous calendar month in `Asia/Ho_Chi_Minh`. Team comes from the authoritative org mapping as of the event time. Managers of several teams export each team separately. |
| Q8 | **Branch manager role.** Which existing role or group identifies a branch manager? Can deputies or delegates export? | One existing role, no delegation. |
| Q9 | **"Like the old system".** We need a sample of the old CSV: columns, order, delimiter, encoding, date format, file naming. Which columns are required, and which contain personal data? Is free text needed? | Column allowlist in FR-5, UTF-8 BOM, comma delimiter, ISO 8601 dates. Free-text columns are excluded. |
| Q10 | **Which logs?** What counts as "access logs" (authentication, application access, data access, admin actions)? Do they include customer personal data as well as staff usernames? | Staff access logs only. Events about customer data are exported without customer identifiers. |
| Q11 | **Audit and monitoring.** Who reviews export audit trails and how often? Should exports trigger alerts to security? Are the FR-11 limits acceptable? | Auditor role has read access. Alerts on unusual volume. Limits of 5 exports per day and 1 concurrent. |
| Q12 | **Delivery channel.** Browser download only, or e-mail and shared folders as well? May exports go to local devices, where the bank cannot enforce deletion? | Browser download from the platform only. No e-mail delivery. |
| Q13 | **Data residency and hosting.** Must all data, keys, and exports stay in Vietnam or the bank's own environment? | Yes, in-country and within the bank's environment. |
| Q14 | **Old system parity.** Does the old system's behavior (for example unmasked output) need to be retained for any reason, or is this a deliberate change? Are managers informed of the change? | This is a deliberate change. A short notice is shown to managers on first use. |
| Q15 | **Approval and sign-off.** Who in the bank (data protection officer, security, legal) signs off on this spec and on the masking and retention rules? | The DPO and Security sign off before development begins. |

## 10. Delivery notes

- Start with: authorization and scoping (FR-3), masking (FR-4), CSV (FR-5), audit (FR-9), and retention jobs (FR-8, FR-10). These are unaffected by most open questions.
- Blocked or flagged: FR-6 (Q1, Q2), final columns (Q9, Q10), and retention periods (Q5).
