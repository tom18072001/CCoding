# Log Export — Implementation Specification

Status: Draft for customer confirmation. Data classification: internal. No real personal data appears in this document; all examples are fictitious.
Items marked **(Qn)** depend on an open question in [Open questions and assumptions](#open-questions-and-assumptions). Legal statements are assumptions until the bank's DPO / Legal confirm them.

## 1. Overview and goal

Provide a self-service **Log Export** button so that branch managers can export their team's access logs for last month as CSV. Default exports are **masked**. Unmasked exports (full client IP and username, needed for forensics) are an exception flow with a second-person approval, pending DPO confirmation (Q1).

The repository is empty; there is no existing system to extend. Platform, stack and the log schema are unknown (Q8).

### Scope
**In:** Export button and flow; masking; CSV generation; sync/async delivery; access control; retention and deletion of exports; audit trail of every export; forensic unmasked request/approval flow (gated by Q1).
**Out:** Changes to log collection or to how logs are viewed; export formats other than CSV; scheduled/recurring exports; bulk export across the whole bank; SIEM integration; ISMS level classification (Q16).

## 2. Actors and roles

| Role | Can do |
|---|---|
| Branch Manager | Export masked logs of own team only (Q6, Q3). |
| Forensic Investigator (new role) | Request unmasked export with reason and case ID; download after approval (Q1, Q6). |
| Forensic Approver (new role) | Approve/reject unmasked requests. Must not be the requester (Q6). |
| Auditor | Read export audit records; download retained files if permitted (Q10). |
| Platform Admin | Manage roles and retention config. Cannot read export content. |

Authorization is deny-by-default (RBAC) and checked on the server for every request and download.

## 3. User stories and acceptance criteria

**US-1 Masked export.** As a branch manager, I want to export my team's last-month access logs as CSV, so that I can review team activity.
- AC-1.1 Given a branch manager with a team, when they click Log Export and confirm, then a CSV containing only that team's events for last month (FR-2, FR-3) is delivered.
- AC-1.2 Given the CSV, when opened, then IP and username columns are masked per section 6 and contain no raw values.
- AC-1.3 Given a user without the branch manager role, when they call the export endpoint directly, then the server returns 403 and no file is created.
- AC-1.4 Given a request that names a team other than the user's own, when submitted, then it is rejected with 403 (IDOR test).

**US-2 Scope never exceeds visibility.** As a branch manager, I want to export what I can see, so that export matches my screen.
- AC-2.1 Given any filter, when exporting, then every row is within the user's viewing permission; rows outside it never appear.
- AC-2.2 Given the default request, then the date range is last month (FR-2); a custom range, if enabled (Q4), is capped at 31 days.

**US-3 Fast result.** As a branch manager, I want the export within 5 seconds, so that I'm not blocked.
- AC-3.1 Given ≤ 50,000 matching rows, when exporting, then the file is ready within 5 s at p95 on the agreed load profile (NFR-1).
- AC-3.2 Given > 50,000 rows, when exporting, then the UI responds within 2 s with a "job queued" state, and the user can download when ready (FR-8).

**US-4 Unmasked forensic export.** As a forensic investigator, I want full IP and username for a case, so that I can investigate. *(Blocked until DPO confirms Q1.)*
- AC-4.1 Given a normal user or branch manager, when they request unmasked data by any route (UI, API, parameter tampering), then the server refuses and no unmasked file exists. (automated API test)
- AC-4.2 Given a forensic request with reason and case ID, when the approver (a different person) approves within 24 h, then the unmasked file is generated; if the requester approves their own request, then it is rejected.
- AC-4.3 Given an approved file, when downloaded, then MFA is required, the link is single-use, and the file is deleted at TTL (NFR-3).

**US-5 Auditability.** As an auditor, I want a record of every export, so that I can answer who exported what.
- AC-5.1 Given any export attempt (success, failure, denied), then exactly one audit record is written (FR-9).
- AC-5.2 Given the audit store, when any record is edited or deleted through the application, then the operation is refused.

**US-6 Retention.** As a DPO, I want exports to expire, so that personal data is not kept beyond policy.
- AC-6.1 Given an export file past its TTL (NFR-3), when the retention job runs, then the file is not retrievable and a deletion record exists.

## 4. Functional requirements

| ID | Requirement | Refs |
|---|---|---|
| FR-1 | Show a "Log Export" button to users with export permission. Click opens a confirm dialog showing team, date range, masking level. | Q6 |
| FR-2 | Default range = previous calendar month, 00:00:00 on day 1 to 23:59:59 on the last day, timezone Asia/Ho_Chi_Minh (UTC+7). Computed on the server. | Q3 |
| FR-3 | "Team" = users in the requester's branch/org unit, taken server-side from the authoritative identity/org source, never from a client parameter. Sub-units are included only if Q4 says so (assumed: not included). | Q4, Q5 |
| FR-4 | Export contains access logs of the platform's access-log source (assumed: authentication and application access events of platform users). | Q7, Q8 |
| FR-5 | CSV: UTF-8 with BOM, comma delimiter, CRLF, header row, RFC 4180 quoting, ISO 8601 timestamps with +07:00 offset. Columns per section 6. Cells starting with `=`, `+`, `-`, `@` are prefixed with `'` (CSV injection). | Q9 |
| FR-6 | Masking is applied on the server by default. No client option can disable it. | Q1, Q2 |
| FR-7 | Unmasked flow: request (reason, case ID) → approval by a different Forensic Approver → generation → single-use download with MFA. Disabled by feature flag until Q1 is confirmed in writing. | Q1, Q6 |
| FR-8 | Delivery: ≤ 50,000 rows synchronous; above that, asynchronous job with in-app notification and download link. Hard cap 1,000,000 rows per export (user is told to narrow the filter). Rate limit 10 exports per user per day. | Q11 |
| FR-9 | Write one immutable audit record per export attempt: requester, role, time, filters, team, row count, masking level, file hash, reason/case ID/approver (unmasked), outcome, download events. No raw IP/username in the audit record. | Q13 |
| FR-10 | Files are stored server-side in encrypted storage; download only via authenticated, short-lived link (15 min). No file is e-mailed or pushed outside the platform. | Q12, Q14 |
| FR-11 | Retention job deletes expired files and writes a deletion record (NFR-3). | Q2, Q15 |

## 5. Non-functional requirements

| ID | Requirement | Refs |
|---|---|---|
| NFR-1 | Performance: "within 5 seconds" means the file is complete and downloadable in ≤ 5 s at p95 for ≤ 50,000 rows (threshold to be set by measurement). Beyond that, response ≤ 2 s and async completion; target async ≤ 5 min for 1,000,000 rows. | Q11 |
| NFR-2 | Security: server-side RBAC and object-level checks; TLS in transit; AES-256 at rest with a dedicated key; HMAC key in KMS/HSM, never in code or config; no real data in DEV/UAT; application logs never contain raw IP/username from exports. | Q16 |
| NFR-3 | Retention (proposal, needs DPO/Legal approval): unmasked files — 7 days then deleted. Masked files — 12 months then deleted (pseudonymized data still counts as personal data). Audit records and file hashes (no raw log content) — kept indefinitely. This reconciles "kept forever for audit" with "delete personal data older than 12 months": what is kept forever is evidence of the export, not personal data. | Q2, Q15 |
| NFR-4 | Audit: audit records immutable (append-only, hash chained or WORM); alert on unusual volume or out-of-hours export. | Q13 |
| NFR-5 | Data residency: storage inside Vietnam (assumed). | Q12 |
| NFR-6 | Availability and capacity targets: not specified; follow the platform's existing SLA. | Q8 |

## 6. Data fields and masking rules

Field names are assumptions (Q8, Q9). Examples are fictitious.

| Column | Masked (default) | Unmasked (forensic only) |
|---|---|---|
| timestamp | ISO 8601 +07:00 | same |
| username | `u_` + first 12 hex chars of HMAC-SHA-256(key, username), stable across exports; e.g. `u_3fa91c07b2d4` | full username |
| client_ip | IPv4: last octet replaced by `x` (`203.0.113.x`); IPv6: first 48 bits kept, rest `x` | full IP |
| branch / team | as is | as is |
| action | as is | as is |
| resource | path only, query string removed | path only (query removed; may hold tokens) |
| status | as is | as is |
| user_agent | browser family and major version | as is |

Rotating the HMAC key changes all pseudonyms; the rotation policy must be agreed with the bank (Q1).

## 7. Error and edge cases

| Case | Behavior |
|---|---|
| No data for last month | Do not create a file; show "No log events for <month>"; write an audit record with row count 0. |
| Above hard cap | Reject with a message to narrow the filter; audit record outcome `rejected_cap`. |
| Permission lost during async job | Re-check permission at generation and at download; if lost, the job is cancelled or the download refused (403); audit record written. |
| Approval expired or rejected | No file generated; requester notified. |
| Link expired / already used | 410; user may re-request (counts to rate limit). |
| Generation failure | Partial file is discarded; user sees a retriable error; audit outcome `failed`. |
| Rate limit exceeded | 429 with message; audit record written. |
| User in several teams | Export is per team; user picks one (Q5). |

## 8. Conflict resolution

| # | Brief says | Conflict | Interim handling in this spec |
|---|---|---|---|
| a | "Exports must contain full client IP addresses and usernames" vs "no personal data may leave the platform unmasked" | Full values are unmasked personal data in a file that leaves the screen. | Masked by default (FR-6). Unmasked only via approved forensic exception (FR-7), disabled until DPO confirms (Q1). |
| b | "team's access logs from last month" vs "export everything they can see" | Fixed scope vs open scope. | Default = team + last calendar month; any wider scope is capped by viewing permission and 31 days (FR-2, FR-3, Q3, Q4). |
| c | "complete within 5 seconds" vs "everything" | Unbounded volume cannot meet a fixed time. | Hybrid: sync ≤ 50,000 rows within 5 s, async above, hard cap (FR-8, NFR-1, Q11). |
| d | "kept forever for audit" vs "delete personal data older than 12 months" | Cannot keep personal data forever and delete it at 12 months. | Keep audit records and hashes forever; delete files with personal data by TTL (NFR-3, Q2, Q15). |
| e | "Branch managers" vs "Users should be able to export everything they can see" | Who may export is unclear. | Branch manager: masked, own team. Unmasked: separate Forensic role with a separate approver (Q6). |
| f | "Make it simple" vs controls above | Simplicity vs security. | One button and one dialog for the manager; complexity (masking, audit, approval) is server-side or limited to the forensic flow. |

## Open questions and assumptions

Every item must be confirmed with the customer before building. "Impact" is what changes if the assumption is wrong.

| ID | Question | Why (conflict / ambiguity) | Assumption meanwhile | Impact if wrong |
|---|---|---|---|---|
| Q1 | May unmasked IP/username be exported for forensics, and does that comply with the data-protection policy? Who approves (DPO/Legal)? Pseudonym key rotation? | Conflict (a): "full client IP addresses and usernames" vs "no personal data may leave the platform unmasked". | Masked by default; unmasked only via approved forensic exception (FR-7), feature-flagged off until written DPO/Legal approval. HMAC pseudonyms with an annual key rotation. | If exception refused: remove FR-7 and US-4. If masking is not acceptable for managers: redesign and re-run the policy review. |
| Q2 | Does "kept forever" mean keeping the files or only evidence of the exports? Retention for masked and unmasked files? | Conflict (d): kept forever vs delete personal data after 12 months. | Keep audit records and file hashes forever; masked files 12 months; unmasked files 7 days; then delete. | If files must be kept forever: storage and legal design change; may conflict with policy. If shorter retention: change TTLs only. |
| Q3 | What is "last month"? Which timezone? | Ambiguity: calendar month vs last 30 days. | Previous calendar month, Asia/Ho_Chi_Minh. | Date-range logic and test data change (low effort). |
| Q4 | Can users choose a custom range beyond last month? Are sub-branches included in "team"? | Conflict (b): "team's logs from last month" vs "everything they can see". | Default last month; custom range allowed up to 31 days, always within view permission; sub-units excluded. | Scope rules, volume estimates and the cap change. |
| Q5 | What is a "team"? Which system is the source of the org tree? Can a manager belong to several teams? | Ambiguity: team not defined. | Team = branch/org unit from the authoritative identity/HR source, resolved on the server; one team per export. | Authorization model and integration effort change. |
| Q6 | Who may export, who may request unmasked, who approves? | Conflict (e): "Branch managers" vs "Users". | Branch Manager = masked own team; new Forensic Investigator and Forensic Approver roles; no self-approval; approval valid 24 h. | Role model and the approval flow change. |
| Q7 | Which "access logs"? Which applications and event types? | Ambiguity: "access logs" not defined. | Authentication and application access events of platform users, from the platform's access-log store. | Source integration, fields and volume change. |
| Q8 | What platform, log schema and existing log viewer exist? What ISMS/availability targets apply? | Ambiguity: the repo is empty. | Fields as in section 6; existing platform SLA. | Field list, performance numbers and effort change. |
| Q9 | What is the "old system" CSV format (columns, order, encoding, delimiter, header)? Must it be byte-compatible? | Ambiguity: "like the old system" with no sample. | Format per FR-5 (UTF-8 BOM, comma, header, columns per section 6); not byte-compatible. | Downstream tools that read the old file may break; re-mapping needed. |
| Q10 | Who may access stored exports and audit records (auditors)? | Ambiguity: "kept for audit" with no access rule. | Requester, plus Auditor role for masked files and audit records; Admin cannot read content. | Access-control and audit-log changes. |
| Q11 | What does "within 5 seconds" cover, and for how many rows? What volume is normal? | Conflict (c): 5 s vs "everything". | Sync up to 50,000 rows at p95 ≤ 5 s; async above; hard cap 1,000,000; 10 exports/user/day. Thresholds to be set by measurement. | Architecture (sync only vs job queue) and capacity cost change. |
| Q12 | Where are files stored? Must storage be in-country? Is cloud allowed? | Ambiguity: "kept forever" with no storage location. | Server-side encrypted object storage inside Vietnam; no external service. | Hosting and compliance work change. |
| Q13 | What must the export audit record contain, and for how long is it kept? Is there an existing audit system to integrate? | Gap (f): the brief does not mention an audit trail. | Immutable record per attempt with fields in FR-9, kept indefinitely; no raw personal data inside. | Missing fields cannot be recovered later; integration effort changes. |
| Q14 | May users download directly to their own computer, or must files stay inside the platform? | Conflict (a): "leave the platform". | Download to the user's machine is allowed for masked files via an authenticated short-lived link; unmasked files single-use with MFA. | If no download allowed: in-platform viewer only, a bigger change. |
| Q15 | What retention duty applies to bank logs generally, and what is the legal basis? Is a DPIA needed? | Conflict (d). Legal references unverified. | 12 months for masked files per policy; DPIA status unknown. | Retention periods, and possibly release timing, change. |
| Q16 | What is the system's ISMS classification level, and what incident-notification process applies? | Ambiguity: customer classification not provided. | No fixed level; controls in NFR-2 apply; incident notification within 72 h (internal target). | Controls may need raising to match the level. |
| Q17 | Who in the bank (DPO / Legal / Security) signs off this spec? | Ambiguity: the approver of legal requirements is not named. | DPO and Legal sign off Q1, Q2, Q15; Security signs off NFR-2. | Release is blocked until sign-off. |

## 9. Traceability

| Story | FR / NFR | Questions |
|---|---|---|
| US-1 | FR-1..FR-6 | Q3, Q5, Q7, Q9 |
| US-2 | FR-2, FR-3 | Q3, Q4 |
| US-3 | FR-8, NFR-1 | Q11 |
| US-4 | FR-7, FR-10 | Q1, Q6, Q14 |
| US-5 | FR-9, NFR-4 | Q13, Q10 |
| US-6 | FR-11, NFR-3 | Q2, Q15 |
