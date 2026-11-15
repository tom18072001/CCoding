# Log Export: Implementation Specification

Status: DRAFT, blocked on the customer confirmations in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Add a self-service **Log Export** button. A branch manager clicks it and downloads a CSV of their team's access logs for last month. The default export is **masked**. Full IP addresses and usernames are available only through a separate, approved forensic path (section 5.2). This is because the request asks for both full identifiers and "no unmasked personal data leaves the platform", and the two cannot both hold for one file (see section 9).

## 2. Goals and non-goals

Goals
- One-click CSV export of last month's access logs for the manager's team, in the old system's column layout.
- No unmasked personal data in any file a branch manager downloads.
- Every export is audited.
- Personal data is purged at 12 months, while an audit trail is kept for as long as the bank requires.
- Typical exports finish in 5 seconds or less.

Non-goals
- Ad-hoc filters, custom date ranges and formats other than CSV (a later phase if wanted).
- A new forensic investigation tool. Section 5.2 only defines the gate.

## 3. Definitions

| Term | Definition (assumed, see section 9) |
|---|---|
| Branch manager | A user holding the role `branch_manager`, assigned to one or more branches. |
| Team | All users whose primary branch is one of the manager's branches. Subordinate branches are not included. |
| Access log | Platform records of authentication and access events (see the schema in 4.3). |
| Last month | The previous full calendar month in `Asia/Ho_Chi_Minh` (UTC+7), from 00:00:00 on the 1st up to but excluding 00:00:00 on the 1st of the current month. |
| Personal data | Username, full client IP, and any other field that identifies a person. |

## 4. Functional requirements

### 4.1 Trigger and authorisation
- FR-1. The button appears only for users with `branch_manager` (or an equivalent role). Authorisation is enforced server side, and hiding the button is not a control.
- FR-2. Scope is `visible_logs(user) ∩ team(user) ∩ last_month`. "Everything they can see" is capped by the team and last-month limits. The server derives the scope from the session and ignores any client-supplied branch or date parameters.
- FR-3. A manager with no branch assignment gets a 403 with a clear message.

### 4.2 Behaviour
- FR-4. Clicking the button starts a streamed download. The file is named `access-logs_<branch-code>_<YYYY-MM>.csv`. A manager with several branches gets a single file with a `branch_code` column.
- FR-5. Only one export per user may run at a time. A second click while one is running returns 409 and does not start another.
- FR-6. If the result has zero rows, the file contains only the header row and the UI says "No events for last month".
- FR-7. If the row count exceeds the cap (assumed 200,000 rows), the export is refused with HTTP 413 and the message "Too many events to export instantly". Files are never truncated silently.
- FR-8. Each export writes an audit record (section 7) before the first byte is sent. If the audit write fails, the export fails.

### 4.3 CSV format
- Encoding is UTF-8 with BOM, so Excel renders Vietnamese correctly. Lines end in CRLF. The delimiter is a comma, with RFC 4180 quoting.
- Columns follow the old system's layout. This is unconfirmed (A1). The assumed baseline is:

| Column | Content in a manager export |
|---|---|
| `timestamp` | ISO 8601 with +07:00 offset |
| `branch_code` | Branch code |
| `username` | Masked (section 5.1) |
| `client_ip` | Masked (section 5.1) |
| `event_type` | login, logout, access, denied |
| `resource` | Resource accessed |
| `result` | success or failure |

- FR-9. CSV formula injection defence: any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`. This applies to every text field, because usernames and resources are attacker-controllable.

## 5. Data protection

### 5.1 Masking rules for the manager export (assumed, A2)
- IPv4: keep the first two octets, mask the rest, e.g. `10.20.x.x`.
- IPv6: keep the first /48 and mask the rest.
- Username: replace with a stable pseudonym `u_<first 8 hex of HMAC-SHA256(username, key)>`. The pseudonym is the same within an export, so a manager can still see "the same person did X, Y, Z". The HMAC key is held in the platform's secret store and rotated per policy. Pseudonyms are not reversible by the manager.
- Masking is applied server side, in the query or streaming layer, before serialisation. No unmasked value may reach the response buffer.
- A masking failure on any row aborts the export. It is never allowed to fall back to unmasked output.

### 5.2 Forensic path (unmasked data, assumed, A3)
The brief requires full IPs and usernames "for forensic use" but also bans unmasked personal data from leaving the platform. The assumed reconciliation:
- FR-10. The branch manager's button never produces unmasked data.
- FR-11. Unmasked records can be viewed only inside the platform, by a distinct `forensic_analyst` role. Access requires a recorded case reference and a second-person approval, and every access is audited.
- FR-12. If the customer's policy allows an unmasked file to be released to a named forensic recipient, that is a separate approved workflow (encrypted, time-limited, dual-approved). It is out of scope for this release until confirmed.
- FR-13. A forensic analyst can re-identify a masked pseudonym by looking up the HMAC mapping inside the platform. Re-identification is done by recomputing the HMAC over the in-platform logs for the export's period (the audit record holds the period, branch scope and key version, and no subject identifiers).

### 5.3 Retention and deletion (assumed, A4)
The brief says exports are "kept forever" and also that personal data older than 12 months must be deleted. The assumed reconciliation:
- FR-14. An export is stored for re-download and audit. The stored file contains personal data (masked identifiers are still personal data under common readings of the law), so it is **deleted when its oldest row reaches 12 months of age** (that is, 12 months after the first day of the exported month), not kept forever. This matches the deletion of the source rows, so no personal data in the file outlives the 12-month limit.
- FR-15. A daily job deletes expired exported files and expired source log rows containing personal data. It also deletes them from backups and replicas, on a schedule the customer confirms (A5). Each deletion run is audited.
- FR-16. The **export audit record is kept forever** (or for the bank's statutory period). It holds: export ID, actor ID, role, timestamp, branch scope, period, row count, SHA-256 of the file, masking policy version, HMAC key version, and result. It holds no usernames or IPs of log subjects. This is what satisfies "kept for audit" without keeping personal data.
- FR-17. If a legal hold is placed on an export, deletion is suspended for that item only. The hold is recorded in the audit trail.

## 6. Non-functional requirements

- NFR-1. Performance: p95 under 5 seconds from click to the last byte, for exports up to the 200,000-row cap, measured at the server under the reference load (A6). The first byte is sent within 1 second.
- NFR-2. Streaming: rows are streamed from a cursor. Memory per export is bounded (assumed under 50 MB).
- NFR-3. The index covers `(branch_code, timestamp)` so the last-month scan does not table-scan. A 200,000-row query against a realistic data volume must be benchmarked before release.
- NFR-4. Rate limit: at most 5 exports per user per hour.
- NFR-5. Transport is TLS only. The response carries `Cache-Control: no-store` and `Content-Disposition: attachment`.
- NFR-6. Stored export files are encrypted at rest.
- NFR-7. Data residency: all storage and processing stay in Vietnam, or wherever the customer's policy requires (A7).

## 7. Audit and logging

- Audit events: export requested, export refused (with reason), export completed, file deleted by retention, forensic access.
- Audit records are append-only and tamper-evident (hash-chained or written to WORM storage).
- Application logs must not contain row data, masked or unmasked.

## 8. Acceptance criteria

1. A branch manager of branch X exports. The file contains only branch X events from the previous calendar month, and rows near the month boundaries (23:59:59 and 00:00:00 +07:00) land in the right month.
2. No row in a manager export contains a full IP or a real username. An automated test greps the output for the seeded real values.
3. A manager cannot get another branch's data by changing request parameters (tested for IDOR).
4. An empty month gives a header-only file. Over 200,000 rows gives a 413. A second concurrent click gives a 409.
5. A cell containing `=cmd|...` is prefixed with `'`.
6. The Vietnamese name "Nguyễn" opens correctly in Excel.
7. A 200,000-row export meets NFR-1 in the performance environment.
8. Retention job: a file whose oldest event is 12 months old is deleted. The audit record survives and contains no personal data. A legal-held file is skipped.
9. The audit record is written before streaming starts, and the export fails if the audit write fails.
10. The forensic path is unreachable for `branch_manager`.

## 9. Contradictions in the request and how this spec resolves them

| # | Request says | Conflict | Resolution used |
|---|---|---|---|
| C1 | Full IPs and usernames in the export | "No personal data may leave the platform unmasked" | The manager export is masked. Unmasked data is viewable only inside the platform by an approved forensic role (5.2). |
| C2 | "Export everything they can see" | "Their team's logs from last month" | Export = visible ∩ team ∩ last month. |
| C3 | Complete within 5 seconds | Volume is unbounded | Row cap, streaming, 413 above the cap. |
| C4 | Kept forever | Delete personal data older than 12 months | Files with personal data are purged at 12 months. A personal-data-free audit record is kept forever (5.3). |
| C5 | "Make it simple" | The controls above need real engineering | The user-facing flow is one click with no options. The complexity sits server side. |

## 10. Open questions and assumptions

Each item must be confirmed with the customer before building. "Assumption" is what this spec uses until then.

| ID | Question | Assumption used meanwhile |
|---|---|---|
| Q1 / A1 | What exactly is the "old system" CSV format (columns, order, delimiter, encoding, date format, file name)? Please send a sample file. | The columns in 4.3, UTF-8 with BOM, comma delimiter, ISO 8601 timestamps. |
| Q2 / A2 | What masking is acceptable? Is a masked IP or a pseudonymous username still "personal data" under the bank's policy and Vietnamese law? | IPv4 keeps two octets, IPv6 keeps /48, usernames are HMAC pseudonyms (5.1). Masked data is still treated as personal data for retention. |
| Q3 / A3 | How do "full IP and username for forensic use" and "no unmasked personal data leaves the platform" fit together? Who may see unmasked data, under what approval, and may a file ever be released externally? | The branch manager never gets unmasked data. A `forensic_analyst` role views it in-platform with a case reference and second approval. No unmasked file export (5.2). |
| Q4 / A4 | Does "kept forever" apply to the exported files, or only to a record that the export happened? Which clock starts the 12 months: the event date, the export date or the file creation date? | The audit record is kept forever, the file is deleted when its oldest event reaches 12 months (5.3). |
| Q5 / A5 | Is deletion required in backups, replicas, archives and SIEM copies, and within what time limit? Do statutory retention duties (for example State Bank of Vietnam rules on log or transaction records) override the 12-month limit? | Deletion covers primary storage and backups within 35 days. A legal or regulatory retention requirement would take precedence and needs the bank's compliance team's sign-off. |
| Q6 / A6 | How much data do the largest teams produce in a month? What is the reference hardware and load for the 5-second target? Is the target per request, or at p95? | A cap of 200,000 rows, p95 of 5 seconds, with the NFR-1 reference load to be set after a benchmark. |
| Q7 / A7 | Are there data residency or cross-border transfer requirements? Is a data-protection impact assessment filed with the authority (Decree 13/2023/ND-CP and its successors) needed for this feature? | All processing is in Vietnam. The bank's DPO owns any assessment filing. |
| Q8 | What does "team" mean: the branch only, sub-branches, or direct reports? Can a manager cover several branches? | Users whose primary branch is one of the manager's branches, with no sub-branches. Multiple branches give one file. |
| Q9 | Is "last month" the previous calendar month, or the last 30 days? Which timezone? | The previous calendar month in `Asia/Ho_Chi_Minh`. |
| Q10 | What happens when a team has more events than the cap? Is an asynchronous export (email or a notification when ready) acceptable? | Refuse with 413 and offer no async path in this release. |
| Q11 | Which events count as "access logs" (login, resource access, admin actions, failures)? Are any excluded? | The event types in 4.3. |
| Q12 | Do other roles (auditors, security staff) also need the button? Is the manager export also used for their own reporting? | Only `branch_manager` in this release. |
| Q13 | Is a manager allowed to re-download a past export, or only to generate it again? | A regenerated export is a new audit entry. Past files are re-downloadable until purged. |
| Q14 | Are the pseudonym mapping key and its rotation owned by security? Does a rotation break cross-month correlation? | Security owns the key. Rotation is annual, and pseudonyms are not comparable across rotations. |
| Q15 | Who approves forensic access, and what is the service-level target for it? | The security manager approves. No service-level target in this release. |

## 11. Risks

- If the customer insists on unmasked files going to branch managers, that contradicts their own data-protection policy and must be resolved in writing before any build. Do not implement it on an unconfirmed reading.
- If the old system's format has quirks, downstream tools may depend on them. This is a priority for Q1.
- The 5-second target may force a narrower cap, or an asynchronous path, than the customer expects.
