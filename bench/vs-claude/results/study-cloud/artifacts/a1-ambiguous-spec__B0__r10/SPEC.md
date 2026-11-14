# SPEC: Log Export (self-service access-log export)

Status: DRAFT v0.1 for customer confirmation. Language: English (technical terms unchanged).
Data classification of this document: internal. It contains no real data; all examples are fictitious.

> The repository contains no code. Every technical choice below (columns, limits, storage, roles) is an **assumption (A-n)** listed in `## Open questions and assumptions`, not a description of an existing system. "Old system" behaviour is **not verified** (no sample was provided).

## 1. Purpose and scope

**Purpose.** Let branch managers self-serve a CSV export of their team's access logs for the previous month, without a ticket to IT, while honouring the bank's data-protection policy.

**In scope**
- A "Log Export" button and its export flow (request, generate, download).
- Default export with masked personal data (IP address, username).
- A separate, approval-gated forensic path that can release unmasked IP/username.
- Audit logging of every export (and every forensic request).
- Retention and deletion rules for exported files and for personal data in logs.

**Out of scope**
- Changing how logs are collected, parsed or stored (beyond the deletion rule in section 6).
- Migrating or reproducing the old system's other features; bulk/scheduled exports; export formats other than CSV.
- Choosing the technology stack, architecture, API names, deployment (not part of a specification at this stage).
- Legal interpretation of Decree 13/2023/ND-CP or State Bank of Vietnam rules (to be confirmed by the customer's legal/compliance team; see Q10).

## 2. Actors and permissions

| Actor | Definition | Permission (assumed) |
|---|---|---|
| Branch Manager (BM) | User holding the branch-manager role | Export masked logs of **their own team** for the previous calendar month (FR-01..FR-06) |
| Other user ("users") | Any other platform user | **No** export button unless a role grants it. "Everything they can see" is not accepted as an export right (see Q2, A-2) |
| Forensic Requester | User with the separate forensic role (A-8) | May file an unmasked-export request with a reason; cannot approve their own |
| Forensic Approver | Security/Compliance officer, different person from the requester (A-8) | Approves or rejects forensic requests |
| Auditor | Compliance/internal audit | Reads export audit records; no access to raw personal data by this role |

**"Team" (assumption A-2):** the set of platform accounts assigned to the manager's branch and its sub-units, taken from the organisation/branch attribute of the account at export time. Logs of accounts outside the manager's team are never included, even if the manager can view them elsewhere in the platform. Whether the source of this mapping exists is unverified.

## 3. User stories and acceptance criteria

Priority: M = Must, S = Should.

### FR-01 Export button (M)
As a branch manager, I want a "Log Export" button, so that I get last month's team logs myself.
- Given I hold the BM role, When I open the log screen, Then the button is visible and enabled.
- Given I do not hold the BM role (or any export role), When I open the screen, Then the button is not shown, and a direct call to the export function returns "forbidden" (HTTP 403 or equivalent) and is audit-logged.
- Given I click the button, When no further input is required, Then one click starts an export with the default scope (FR-02) and masked data (DP-01); no mandatory form fields (A-12 "simple").
- Given an export is running, When I click again, Then no duplicate job is created (one active export per user).

### FR-02 Data scope: "last month" and "team" (M)
As a BM, I want exactly last month's logs of my team, so that the file is relevant and bounded.
- Given today is any date, When I export, Then the period is `[first day of previous calendar month 00:00:00, first day of current month 00:00:00)` in Asia/Ho_Chi_Minh (UTC+07:00) (A-3).
- Given today is 2026-11-03, Then the period is 2026-10-01 00:00 to 2026-11-01 00:00 (+07:00); an event at 2026-10-31 23:59:59 is included and one at 2026-11-01 00:00:00 is not.
- Given the manager's team contains accounts A and B and account C belongs to another branch, When exporting, Then no row of C appears (test with fixture data).
- Given a log older than the retention limit has been deleted (section 6), Then it is absent from the export and the file header comment/audit record does not claim completeness for it.
- Given the previous month has no events, Then a file with header row only is produced and the screen says "no records".
- "Access logs" covers the log sources listed in A-4 only; others are excluded.

### FR-03 CSV format (M)
As a BM, I want a file that opens correctly in common spreadsheet tools, so that I can use it like the old system's output.
- Encoding UTF-8 with BOM; delimiter comma (A-5); line ending CRLF; fields quoted per RFC 4180 when they contain delimiter, quote or line break; quotes doubled.
- First row is a header with these columns (A-5, to be replaced by the old-system sample, Q5): `event_time` (ISO 8601 with +07:00), `source_system`, `username` (masked, DP-01), `client_ip` (masked, DP-01), `action`, `resource`, `result`, `branch_code`.
- Given a text cell starts with `=`, `+`, `-`, `@`, TAB or CR, When the file is generated, Then the cell is prefixed with a single quote `'` (and quoted), so no spreadsheet executes it as a formula. Test: username `=HYPERLINK("http://x","y")` appears as text and does not evaluate in Excel/LibreOffice.
- The injection rule applies to **every** text column, including `user_ref`, `resource`, `action` and any value derived from user input (not only `username`); numeric/date columns are generated by the platform, not from raw strings. Given a value that starts with whitespace followed by `=`, `+`, `-`, `@`, Then it is also neutralised (check after trimming leading spaces). Test fixtures cover each of these cases in each text column.
- Given a value with Vietnamese diacritics, When the file is opened in Excel, Then characters render correctly (BOM present).
- File name: `log-export_<branch_code>_<YYYY-MM>_<request_id>.csv` (A-5); contains no personal data.

### FR-04 Row limit (M)
As the platform owner, I want a bounded export, so that the 5 s target is achievable and bulk exfiltration is limited.
- Given the result set is at most **100,000 rows** (A-6), When exporting, Then all rows are exported.
- Given the result set exceeds the limit, When exporting, Then no silent truncation occurs: the user sees "result has N rows, over the limit" and is offered the asynchronous path (FR-05) or narrower filters per day range (S, A-6).
- Given a file is produced, Then the audit record row count equals the number of data rows in the file (checked by test).

### FR-05 Behaviour when 5 s is exceeded (M)
As a BM, I want a clear outcome when the export is slow, so that I am never left with a hung screen or a partial file.
- Given the synchronous export has not finished 5.0 s after the click (A-7), When the time elapses, Then the screen switches to "export is being prepared" with a request ID, and the job continues asynchronously.
- Given an asynchronous job completes, Then the user sees a notification/entry in "My exports" with the download link, valid for the file lifetime (RET-02).
- Given a job fails or is cancelled, Then no partial file is offered, the user sees an error with the request ID, and the failure is audit-logged.
- Given the system is under the p95 target (NFR-01), Then the user gets the download directly without the async step.

### FR-06 Download (M)
- Given a completed export, When the owner clicks download, Then the platform issues a **signed, time-limited link** (default validity 10 minutes, A-14) bound to the requester's session/user ID and the request ID; it is served over TLS only.
- Given the link is expired, tampered with, or used by another user (including another BM or a copy of the URL pasted into another session), Then the response is "forbidden"/"expired", no file bytes are returned, and the attempt is audit-logged.
- Given the file lifetime has passed (RET-02/RET-03), Then no new link can be issued even by the owner.
- The link or its token never appears in logs, audit records or the CSV (checked by log scan in test).
- Each download is audit-logged (NFR-03).
- **Least-privilege check at export time (A-2, A-14):** the team scope is resolved **server-side** from the caller's identity at the moment of the request; any branch/team/user identifier sent by the client is ignored or rejected. The BM role is re-checked at request time, at job start (async) and at link issue. Given a BM whose role or team assignment was removed after clicking, Then the job is cancelled / the link is refused. Test: request with another branch's ID in the payload returns "forbidden" and no rows of that branch (IDOR test).

## 4. Personal data requirements (IP address, username)

Data types: client IP address; username (account identifier). Purpose: branch oversight (default) and forensic investigation (exception). Assumed to be personal data (Q10).

### DP-01 Default masked export (M)
- **IPv4** is masked to /24: first three octets kept, last octet replaced by `xxx` (e.g. `192.0.2.xxx`, documentation range). **IPv6** keeps the first 48 bits, the rest masked (A-1). Rationale: a /24 still supports "which office/network" review by a manager but not identifying a single device.
- **Username** is **not shown in clear and not partially shown** (first characters leak identity for short names). The `username` column holds `user_ref` = first 12 hex characters of HMAC-SHA-256(key, username), where the key is a secret held by the platform (never exported, not in the audit record, rotated per customer policy, A-1/A-15). The same user gives the same `user_ref` **within a file** so a manager can count and correlate events per person; across files the value may differ (per-export key derived from the master key and the request ID) so files cannot be joined to each other. Pseudonymised data remains personal data (Q10, Q13).
- Given any default export, When the file is scanned, Then no full IP and no full username appears in any column, including free-text fields such as `resource` (test with fixtures embedding an IP or username in a URL or query string; such values are masked/removed by the same rules).
- Given the same user appears twice in one file, Then `user_ref` is identical; given two exports of the same user, Then the values differ (A-15) — if the customer prefers stable-across-files, see Q1.
- Given a manager with a known test account, Then the account's `user_ref` cannot be reversed without the key (review of the design; no key in repository/config samples).
- Proportionality: this is the only control on the default path, no approval, no reason field, no extra click (NFR-05).

### DP-02 Forensic unmasked export (proposal, M if the customer confirms the need)
- A Forensic Requester files a request: case/ticket reference, written reason, scope (accounts, period, max rows), and the lawful basis field (A-8).
- A Forensic Approver (a different person) approves or rejects; approval is time-limited (A-8: valid 24 h).
- Given approval, When the requester downloads, Then the file contains full IP and username, is encrypted at rest (and, if the customer requires it, as an encrypted archive with the key delivered out-of-band, A-8), is downloadable **once** through a signed, time-limited link (FR-06; validity 10 minutes), and expires after a short lifetime (RET-03).
- Scope is the minimum for the case: only the accounts, period and columns named in the approved request; the approver may narrow but not widen it. Given a download whose scope differs from the approved one, Then it is refused.
- Controls are deliberately limited to those above (separate role, four-eyes, reason, encryption, expiry, audit); no additional steps (e.g. multi-level approval, hardware tokens) are specified without a basis from the customer (Q8, Q11).
- Given requester = approver, or no approval, or approval expired, Then unmasked data is never produced.
- The BM button never produces unmasked data (a BM without forensic role cannot reach DP-02).
- Every step (request, approval, rejection, download, expiry) is audit-logged with the reason.

### DP-03 Export audit record (M)
- Audit records (NFR-03) contain: request ID, requester user ID, time, mode (masked/unmasked), filter (period, branch), row count, SHA-256 of the file, outcome, and for forensic requests the case reference and approver ID. They **never** contain full IP, subject usernames, file content, signed-link tokens or free-text reason copied from log data.
- Given any export, Then exactly one request record exists and one record per download attempt (success and refusal); records are append-only (no update/delete by application roles) and readable only by the Auditor role (A-13).
- Given an attempt to modify or delete an audit record through the application, Then it is refused and itself logged.
- Acceptance scan: a fixture export with known IP/username is run, then the audit store is searched for those values and tokens: zero hits.
- **Staff user IDs in audit records are personal data of employees.** Interim rule (A-16): they are kept as internal user IDs for the audit retention period in RET-04; whether they must be pseudonymised after 12 months is Q14.

## 5. Non-functional requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| NFR-01 Performance | The 5 s target is measured **from the click (server receipt of the request) to the first byte of the download**, for results up to the row limit (100,000 rows, A-6/A-7), at **p95 ≤ 5 s** over a rolling day on production-like data. Time to render in the user's browser/network is excluded. | Load test with 100,000-row fixture, at the expected concurrency (to be confirmed, Q3): p95 ≤ 5 s; requests above that follow FR-05. |
| NFR-02 Availability of other functions | An export must not degrade interactive log search noticeably (limits: one active export per user, concurrency cap; numbers to be set after sizing, not yet known). | Load test shows search latency within the existing baseline (baseline not yet measured). |
| NFR-03 Audit logging | Every export request (default and forensic), approval, download, failure and deletion writes an audit record: who (user ID), when (timestamp +07:00), filter (period, team/branch, mode masked/unmasked), row count, SHA-256 file hash, request ID, outcome. | Given any export, Then exactly one request record plus one record per download exist; the hash equals the hash of the stored file; records are append-only and kept per RET-04. |
| NFR-04 Security | Authenticated access; role and team checks server-side at request, job start and link issue (FR-06); TLS in transit; encryption at rest for stored files; signed time-limited download links; CSV formula neutralisation (FR-03); secrets (HMAC key, signing key) held outside code and exports; no real personal data in DEV/UAT test environments (fixtures are synthetic). | Verified by security review and tests: IDOR test, expired/tampered link test, CSV-injection fixtures, secret scan of the repository, check that test environments contain only synthetic data. Cipher/KMS choices deferred. |
| NFR-05 Simplicity (UX) | Default flow = one click, no mandatory input; complexity (approval, reasons) lives only on the forensic path. | Usability check: BM obtains the default file in one click. |
| NFR-06 Accessibility of errors | Messages in Vietnamese (A-12), contain request ID, no personal data. | Review of message list. |

## 6. Retention and deletion

**Conflict:** "exported files are kept forever for audit" versus "the platform must delete personal data older than 12 months". An exported file containing personal data kept forever would breach the deletion rule.

**Proposed resolution (assumption A-9, to be confirmed by the customer, Q4):**
- **RET-01 Source logs:** personal data (IP, username) in logs older than 12 months from the event date is deleted or irreversibly anonymised by a scheduled job; each run is audit-logged (counts only). Acceptance: after the run, a query for events older than 12 months returns no full IP/username.
- **RET-02 Default (masked) export files:** stored at most **30 days** (A-9) then deleted; the audit trail, not the file, is the "kept forever" artefact. Acceptance: file absent after day 30 and a deletion audit record exists.
- **RET-03 Forensic (unmasked) files:** stored at most **7 days** (A-9), downloadable once, and in no case beyond 12 months from the earliest event they contain.
- **RET-04 Export audit record kept indefinitely** (or for the period the customer's policy names, Q4): contains no subject personal data (DP-03), so it does not conflict with deletion; it does contain staff user IDs (A-16, Q14). Acceptance: record exists for an export older than 12 months and the scan of DP-03 still yields zero IP/subject-username hits. It lets auditors prove what was exported, by whom, with which hash, without keeping the file.
- **RET-05 Already exported files:** files that exist before this feature or were downloaded by users are outside the platform's technical control; whether they fall under the 12-month rule, and who is responsible, is Q4 (A-9: files held by the platform are in scope; downloaded copies are covered by a user-handling policy).
- **RET-06 Derived copies:** deletion (RET-01) also covers exports in temporary storage, caches and search indexes of the platform; backups are deleted on their normal rotation, which must not exceed an agreed period (A-17, Q15). Acceptance: after RET-01/RET-02 runs, no object older than its lifetime exists in file storage (listing check), and the backup rotation period is documented.
- **Interaction with a possible minimum retention rule:** if a banking regulation requires logs to be kept longer than 12 months, that rule may override the 12-month deletion for the source logs; until the legal team confirms (Q10), 12-month deletion applies and the job has a configurable period (A-11).
- If the customer insists files be kept forever: the files must be masked/pseudonymised so they hold no personal data (stronger masking than DP-01, Q1/Q4) or the customer's compliance team must approve an explicit exception.

## Open questions and assumptions

| # | Question to confirm with the customer | Why it matters / conflict | Interim assumption | Impact if the answer differs |
|---|---|---|---|---|
| Q1 | Do exports contain full IP/username (forensic), or is everything masked ("no personal data may leave unmasked")? Is there a defined masking standard? | Direct conflict between sentences 3 and 4 of the request. | **A-1:** default export is masked (DP-01); full values only via the separate approval-gated forensic path (DP-02). | If full data for all BMs: DP-01 dropped, retention and approval rework, compliance sign-off required. If all masked always: DP-02 removed. Masking pattern change is small. |
| Q2 | "Their team's logs" vs "users should export everything they can see": which prevails? How is "team" defined and where does the mapping come from? Do non-managers get an export? | Two different scopes; "see" may be wider than "team". | **A-2:** team scope only, BM role only; team = accounts of the manager's branch/sub-units. | If "everything visible": row volume and personal-data exposure grow, 5 s and limit are affected; permission model rework. |
| Q3 | "Everything" within 5 s: expected maximum rows per export, concurrent users, and where is 5 s measured? | Unbounded volume cannot be guaranteed in 5 s. | **A-6/A-7:** 100,000-row limit; p95 ≤ 5 s from request receipt to first byte; beyond that async (FR-05). | Larger volume: async becomes the main path or the limit rises (capacity cost). Strict hard 5 s for all: only feasible with a limit. |
| Q4 | Which wins: "kept forever" or "delete after 12 months"? Does it apply to files already exported (on the platform and downloaded copies)? How long should the audit record be kept? | Files with personal data kept forever violate deletion. | **A-9:** masked files expire in 30 days, forensic in 7 days; only the personal-data-free audit record is kept indefinitely; downloaded copies governed by user policy. | If files must live forever: files must hold no personal data (stronger anonymisation) or a documented exception; storage cost and design change. |
| Q5 | What does "like the old system" mean: columns, order, header names, delimiter, encoding, file name? Please provide an anonymised sample. | Format is unknown; compatibility with downstream tools. | **A-5:** columns in FR-03, comma, UTF-8 BOM, CRLF. | Different columns/delimiter (e.g. semicolon for local Excel): FR-03 and tests change; low cost. |
| Q6 | "Last month": previous calendar month or rolling 30 days? Which time zone for boundaries and timestamps? | Different data sets and totals. | **A-3:** previous calendar month, Asia/Ho_Chi_Minh (UTC+07:00), end exclusive. | Rolling 30 days: change of FR-02 date logic only. |
| Q7 | What do "access logs" cover: which systems/log types/fields? Are logs of other branches' staff or customers included? | Defines sources, fields and personal data in scope. | **A-4:** platform user-access events (login, resource access, result) from the log platform's own sources; other systems excluded. | More sources: more columns, volume and personal-data fields. |
| Q8 | "Forensic": who may request, who approves, which cases qualify, must a ticket/reason be recorded? Is unmasked data allowed to leave the platform (download) at all? | Defines DP-02 and whether it is needed. | **A-8:** separate forensic role; approver a different person from Security/Compliance; reason + case reference mandatory; 24 h approval validity; single download; viewing in platform preferred if the customer forbids download. | If no approval needed: faster but non-compliant risk; if view-only: DP-02 becomes an in-platform view, no file. |
| Q9 | Where are files stored and how are they downloaded (in-platform storage, browser download, email)? Does "leave the platform" mean any download? | "No personal data may leave unmasked" depends on this boundary. | **A-10:** platform-side encrypted storage, authenticated browser download only; no email; a download of masked data is allowed. | If any download counts as leaving: even masked files need compliance sign-off; if email is wanted: more controls. |
| Q10 | Which legal basis and policy apply? Decree 13/2023/ND-CP on personal data protection and applicable State Bank of Vietnam regulations (e.g. on information-system security and log retention) | Retention periods, masking, consent/purpose must follow the law and the bank's policy; **provisions have not been checked here and are not quoted**. | **A-11:** the customer's legal/compliance team confirms the applicable provisions; until then the spec uses the stricter reading (masked by default, 12-month deletion). | A different retention minimum (e.g. a regulation requiring longer log retention) would change RET-01 and may contradict the 12-month rule. |
| Q11 | "Make it simple": which security controls may not be traded for simplicity (approval, masking, audit)? | Simplicity conflicts with approval, masking and audit. | **A-12:** simplicity applies to the BM default path (one click, Vietnamese UI); controls for personal data stay mandatory. | If controls are dropped, the product breaches Q1/Q4 requirements. |
| Q12 | Is the audit record's content (user ID, filter, row count, hash) acceptable and who reads it? | The audit record itself holds user IDs. | **A-13:** auditors/compliance only; contains no full IP/username. | Wider access or more fields: classification of audit records changes. |
| Q13 | Roles under Decree 13/2023/ND-CP: is the bank the data controller and the platform operator a processor (or joint)? Who is the data subject for the logs (employees, customers)? Is a data-processing agreement in place? | Decides who may decide purposes, who answers data-subject requests and who reports incidents. **Not checked here; no article quoted.** | **A-18:** bank = controller, platform operator = processor; no new purposes beyond oversight and forensics; to be confirmed by the customer's legal team. | If roles differ: contract and responsibility clauses for DP-02, RET-* change. |
| Q14 | Legal basis for processing logs and for forensic disclosure; is an impact assessment or filing to the authority required for this processing? Must staff user IDs in audit records be pseudonymised after 12 months? | Needed before go-live; basis may differ for oversight vs investigation. **Not checked here.** | **A-16:** legal team confirms; meanwhile only the masked default is released and DP-02 is built but disabled until sign-off; staff IDs in audit records kept for RET-04. | If no basis for forensic: DP-02 removed. If staff IDs must expire: audit records pseudonymised after 12 months. |
| Q15 | State Bank of Vietnam information-system security requirements: minimum log retention, required log protection, incident reporting, backup retention, any rule on exporting logs. | May set a minimum retention that conflicts with 12-month deletion or add controls. **Not checked here; no provision quoted.** | **A-17:** customer's compliance team identifies the provisions; meanwhile 12-month deletion (configurable), backups rotated within an agreed period (placeholder 35 days), audit of exports as in NFR-03. | A longer minimum retention changes RET-01/RET-06; more controls add scope. |
| Q16 | Signed link and file protection: acceptable validity (10 min assumed), must forensic files also be password-encrypted, may links be used from outside the bank network? | Defines FR-06 and DP-02 effort vs "simple". | **A-14/A-8:** 10-minute single-user link, TLS, forensic file encrypted at rest; extra file-level encryption only if the customer requires. | Longer links raise leak risk; extra encryption adds user steps. |

## 8. Traceability matrix (every sentence of the request)

| Ref | Sentence of the customer request | Requirement ID | Acceptance criterion / open question |
|---|---|---|---|
| R1 | "We need a self-service "Log Export" button." | FR-01, FR-06 | FR-01 criteria 1-4; Q11 |
| R2 | "Branch managers can export their team's access logs from last month as CSV like the old system." | FR-01, FR-02, FR-03, section 2 | FR-02 (period, team), FR-03 (CSV); Q2, Q5, Q6, Q7 |
| R3 | "Exports must contain full client IP addresses and usernames for forensic use." | DP-02 | DP-02 criteria; Q1, Q8 |
| R4 | "In line with our data-protection policy, no personal data may leave the platform unmasked." | DP-01, DP-03, NFR-04 | DP-01 scan criterion; Q1, Q9, Q10 |
| R5 | "Users should be able to export everything they can see;" | Section 2, FR-02, FR-04 | Team-only restriction FR-02; Q2 |
| R6 | "the export must complete within 5 seconds." | NFR-01, FR-04, FR-05 | NFR-01 p95 criterion; FR-05; Q3 |
| R7 | "Exported files are kept forever for audit," | RET-02, RET-04, NFR-03 | Audit record kept (RET-04); files expire (RET-02); Q4 |
| R8 | "and the platform must delete personal data older than 12 months." | RET-01, RET-03, RET-05 | RET-01 query criterion; Q4, Q10 |
| R9 | "Make it simple." | NFR-05, FR-01 | One-click default flow; Q11 |

## Assumption register

A-1 masking default; A-2 team scope and BM-only; A-3 calendar month in Asia/Ho_Chi_Minh; A-4 access-log sources; A-5 CSV columns/delimiter/name; A-6 100,000-row limit; A-7 5 s from request receipt to first byte, p95, async beyond; A-8 forensic roles and approval; A-9 retention values (30 days / 7 days / audit kept); A-10 storage and download; A-11 legal confirmation pending; A-12 simplicity limited to default path, Vietnamese UI; A-13 audit access; A-14 signed link 10 min, server-side team scope and role re-check; A-15 per-export HMAC key for `user_ref`, IPv4 /24 mask; A-16 staff IDs kept in audit records, legal basis pending; A-17 SBV requirements pending, backups rotated ≤ 35 days (placeholder); A-18 bank = controller, operator = processor (unconfirmed). All numeric values are placeholders for the customer to confirm, not derived from measurements.
