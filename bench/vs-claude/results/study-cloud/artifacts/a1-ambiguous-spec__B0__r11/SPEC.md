# SPEC — Self-service "Log Export" for the Log Platform

Status: DRAFT v0.1 — implementation-ready **under the assumptions** in the final section. Data classification: internal. Stack is not specified (repo is empty); any technology named here is an assumption.
Conventions: items marked **[ASSUMPTION]** are provisional values pending customer confirmation (see the last section, reference `OQ-x`). No threshold in this document is a customer-confirmed figure.

---

## 1. Purpose, scope, out of scope

### 1.1 Purpose
Let authorised branch managers export access logs of their own team/branch for the previous period as a CSV file, self-service, without an operator. Personal data (client IP, username) is **masked by default**; unmasked export is a separate, exceptional, approved and audited flow for forensics.

### 1.2 In scope
- "Log Export" button and export dialog for branch managers (masked export).
- Masked CSV generation, synchronous for small results, asynchronous for large ones.
- Exceptional unmasked export for a dedicated Forensic role with approval workflow.
- Audit trail of every export action; retention/deletion of exported files.
- Scope enforcement (team/branch), CSV format and CSV-injection protection.

### 1.3 Out of scope
- Changing how access logs are collected, parsed or stored.
- Export formats other than CSV (XLSX, JSON, PDF).
- Scheduled/recurring exports, e-mail delivery of the file itself.
- Controlling copies of the file after download (see OQ-f).
- Migration of files produced by the old system.
- Ad-hoc date ranges other than "previous period" (see OQ-c; may be a later release).

### 1.4 Glossary
- **Masked export**: IP and username replaced per FR-05/FR-06.
- **Unmasked export**: full IP and username; Forensic flow only.
- **Sync / async export**: file produced within the request vs. produced by a background job.
- **Period**: previous calendar month in Asia/Ho_Chi_Minh **[ASSUMPTION OQ-c]**.

## 2. Actors and roles

| Role | Description | Permissions |
|---|---|---|
| Branch Manager (BM) | Manages one branch/team | Request masked export for own branch/team scope; download own files |
| Forensic Analyst (FA) | Dedicated investigation role | Request unmasked export with justification; download after approval |
| Export Approver (AP) | Security/compliance officer, never the requester | Approve/reject unmasked requests |
| Platform Admin | Operates platform | Configure thresholds; **no** access to export content by virtue of the role |
| Auditor | Internal audit | Read-only access to the export audit trail (FR-12), no file content |
| Other platform users | Can view logs in UI | **No** export button (OQ-b) |

## 3. Functional requirements

Priority: M = Must, S = Should. "Verify" criteria are Given/When/Then or measurable conditions.

### 3.1 Access and scope

**FR-01 (M) Button visibility.** The "Log Export" button is shown only to users holding the BM or FA role.
- Given a user without BM/FA role, When they open the log page, Then no export button is rendered AND a direct call to the export API returns 403 and is audited (FR-12).
- Given a BM, When they open the log page, Then the button is visible.

**FR-02 (M) Scope limited to own team/branch.** A BM can export only log records whose subject belongs to the team/branch they manage, as resolved from the organisation source of truth **[ASSUMPTION OQ-i]**.
- Given BM of branch A, When exporting, Then 0 rows belonging to branch B appear in the file (checked on a test dataset with ≥2 branches).
- Given a request that tampers with a branch/team identifier of another branch, Then the server returns 403 and audits it.
- Given a BM whose team membership changed during the period, Then membership is evaluated per OQ-i's assumption (membership at event time).

**FR-03 (M) Period selection.** The export covers the previous calendar month, 00:00:00 of day 1 to 23:59:59.999 of the last day, Asia/Ho_Chi_Minh **[ASSUMPTION OQ-c]**.
- Given today is 2026-11-03 (ICT), When a BM exports, Then included events have timestamps from 2026-10-01T00:00:00+07:00 to 2026-10-31T23:59:59.999+07:00 inclusive and no others.
- Given an event at 2026-10-31T23:30:00Z (= 2026-11-01 06:30 ICT), Then it is excluded.
- The dialog displays the exact period before confirming.

**FR-04 (M) Log types.** The export includes the event types in the access-log definition **[ASSUMPTION OQ-h]**: authentication events (login success/failure, logout) and resource-access events (action on a resource). Other log types (admin/config change, system) are excluded.
- Given a dataset containing all types, Then the CSV contains only included types, and every row has a non-empty `event_type`.

### 3.2 Masking

**FR-05 (M) Masked IP.** Client IP is personal data (see 8.1). In masked exports it is masked **[ASSUMPTION OQ-a]**: IPv4 → last octet replaced by `x`; IPv6 → only the first 48 bits (3 hextets) kept, the rest replaced by `x`. Masking is done server-side before the row is written; the unmasked value never reaches the masked file's buffer or the browser.
- Given IP `192.0.2.45` (documentation range), Then CSV shows `192.0.2.x`.
- Given IPv6 `2001:db8:abcd:12::7` (documentation range), Then CSV shows `2001:db8:abcd:x:x:x:x:x`.
- Given any masked file, When all `client_ip` values are scanned, Then none matches a full IPv4 `\d+\.\d+\.\d+\.\d+` (4 numeric octets) or a full IPv6 address.
- Given a malformed or empty IP value, Then the cell is `x` (fail closed), never the raw value.

**FR-06 (M) Masked username.** In masked exports username is replaced by a pseudonym: `u_` + first 12 hex chars of HMAC-SHA-256(secret key, username) **[ASSUMPTION OQ-a]**. The key is generated and held by the platform (secret store/KMS, access limited to the export service; never in code, config files, logs or exports). The same user gets the same pseudonym across exports while the key version is unchanged, so BMs can correlate activity; the key version is recorded in the audit record, not in the CSV. Rotation: at least yearly and on suspected compromise **[ASSUMPTION OQ-a]**. Plain unsalted hashes of username are not allowed (dictionary-reversible).
- Given two rows of one user in one export, Then pseudonyms are identical; given two different users, Then different; given the key is not available, Then the export fails (no fallback to raw or unkeyed hash).
- Given the masked file, Then no original username appears in any column (automated string search over a test dataset).

**FR-07 (M) No other direct personal identifiers.** Free-text columns (e.g. resource path, user agent) are scanned and any value matching username or full IP of the record is masked using the same rules.
- Given a resource path containing a full IP in a test record, Then the CSV contains it masked.

### 3.3 Unmasked (forensic) export

**FR-08 (M) Unmasked export only through approved forensic flow.**
- Given a user with FA role, When they request unmasked export, Then they must supply: a free-text justification (min 20 characters) and a case/ticket reference **[ASSUMPTION OQ-a]**; the request is created in state `PENDING_APPROVAL`; no file is generated.
- Given a request in `PENDING_APPROVAL`, When an AP (≠ requester) approves, Then the job runs asynchronously; When the requester tries to approve own request, Then it is rejected (403, audited).
- Given a BM without FA role, Then unmasked export is not offered.
- Approval expires if not decided within 3 days **[ASSUMPTION]**. The approver sees scope, period, justification and case reference, and can approve only exactly that scope (no edits).
- Given any FA or AP action in this flow, Then an audit record per section 6 exists (request, approval/rejection, download), including the justification.
- Given a request whose scope exceeds the FA's authorised branches, Then it is rejected at request time (403), not left to the approver.

**FR-09 (M) Unmasked file protection.** Unmasked files are stored encrypted with a platform-managed key (no password sent by e-mail or chat) **[ASSUMPTION OQ-j]**, downloadable only by the requesting FA through an authenticated, single-use link that expires in 1 hour after approval-and-generation, and deleted per NFR-07 (30 days).
- Given an unmasked link used once, When used again, Then it returns 410/403.
- Given a masked file, encryption is not mandatory in the baseline (OQ-j).

### 3.4 Delivery

**FR-10 (M) Sync/async by size.** The platform counts matching rows first.
- Given count ≤ **50,000 rows** **[ASSUMPTION OQ-d]**, Then the file is generated within the request and the download starts (NFR-01).
- Given count > threshold, Then a background job is created, UI shows "Your export is being prepared", the user receives an in-platform notification (and e-mail without attachment, if OQ-j allows) with a download link when ready.
- Given async job failure, Then the user is notified with a reason category and an audit entry with status `FAILED` exists.
- Unmasked exports are always async (FR-08).

**FR-11 (M) Download link.** Links require authenticated session of the requester, are bound to the requester, and expire after 24 hours **[ASSUMPTION OQ-j]** (1 hour for unmasked, FR-09).
- Given a different authenticated user opens the link, Then 403 and audit entry.
- Given a link older than expiry, Then 410 and the file is not served.

**FR-11a (S) Simple UX.** The masked flow is: click button → dialog showing period, scope (branch name) and "personal data is masked" notice → single "Export" confirm. No other mandatory fields (OQ-k).
- Given a BM, When doing a masked export, Then the number of required user inputs is 0 beyond the confirm click (usability test with ≥3 BMs, completion without help).
- Empty result: Given 0 matching rows, Then no file is generated; a message "No records for this period" is shown; an audit entry with 0 rows is written.

### 3.5 Audit of exports

**FR-12 (M)** Every export action produces an audit record per section 6.

**FR-13 (M) Lifecycle of exported files.** The conflict "kept forever for audit" vs. "delete personal data after 12 months" is resolved as: *evidence is kept, personal data is not*. The exported file (which contains personal data, including pseudonyms **[ASSUMPTION OQ-e]**) is deleted per NFR-07; what is kept for audit is the metadata record with SHA-256, row count, scope and approver (section 6), which proves what was exported without holding the data.
- Given a file past its retention, Then the file is gone, the audit record remains with `DELETED`, and the hash still identifies the former file.
- Given a legal hold declared by the customer for a specific export, Then deletion of that file is suspended, the hold is audited and reviewed at a fixed interval **[ASSUMPTION OQ-e]**.

## 4. Non-functional requirements

**NFR-01 Performance.** For sync exports (≤ threshold), time from click on "Export" to first byte of download ≤ 5 s at p95 and ≤ 10 s at p99, measured server-side from request received to response headers sent, plus browser-side RUM for confirmation, on a load profile of 20 concurrent exports against a dataset of exactly threshold rows. Test environment sizing: to be agreed (OQ-d). Async exports: ready within 15 min for up to 5,000,000 rows at p95 **[ASSUMPTION OQ-d]**; UI shows progress state within 5 s.
- Verify: load test report with p95/p99 values.

**NFR-02 Scalability bound.** A single export is capped at 5,000,000 rows **[ASSUMPTION OQ-d]**; above that the user is told to narrow scope (e.g., by team). Export jobs must not degrade interactive log search latency by more than 10 % **[ASSUMPTION]** (measured with/without a concurrent export).

**NFR-03 Security — transport/storage.** TLS 1.2+ in transit; files at rest encrypted with platform-managed keys; file storage not publicly reachable; no personal data (including pseudonyms) written to application logs or e-mail bodies.
- Verify: config review + grep of application logs after test runs shows 0 full IPs/usernames.

**NFR-04 Authorization (server-side scope).** All checks (role, scope, ownership of link) are enforced server-side, deny-by-default. The branch/team scope is derived on the server from the authenticated identity; any client-supplied branch/team/user/date/mode parameter is validated against it or ignored, never trusted. The scope filter is applied inside the data query (not by filtering in the UI or after export).
- Verify (negative tests, all must pass in CI):
  1. BM of branch A sends export with branch B's code (body, query, or modified ID) → 403, audited, no file.
  2. BM sends `mode=unmasked` or a forged FA/AP role claim → 403, audited.
  3. BM requests a period other than the allowed one (e.g. two months ago) via direct API call → 400/403.
  4. BM A opens/downloads the link or `export_id` of BM B (IDOR) → 403, not 404-with-different-timing leaks; audited.
  5. Expired or revoked session/token → 401, no file.
  6. Result of a multi-branch test dataset contains 0 rows outside scope (compared against an independent query).

**NFR-05 Integrity.** SHA-256 hash of every produced file is stored in the audit record and shown to the requester. Verify: recomputed hash of downloaded file equals stored hash.

**NFR-06 Audit completeness.** 100 % of export requests, approvals, denials, downloads, failures and deletions appear in the audit trail within 5 s of the event. Audit records are append-only and not editable by Admin roles.

**NFR-07 Retention and deletion.** Files containing personal data are deleted by a daily job: masked files **12 months** after creation (clock runs from file creation), unmasked files **30 days** after creation **[ASSUMPTION OQ-e]**. The 12-month rule applies to the exported copies; the source log data's own retention is out of scope. After deletion, the audit record stays with hash and metadata (no personal data) **[ASSUMPTION OQ-e]**.
- Given a file created 12 months + 1 day ago, When the daily job has run, Then the file is not retrievable from storage and backups are purged per backup policy (OQ-e); audit record shows `DELETED` with timestamp.
- The job reports counts; failure alerts to Admin.

**NFR-08 Availability.** Export feature availability ≥ the platform SLA **[SLA value: chưa xác minh]**; async jobs resume after restart without duplicate files.

**NFR-09 Accessibility/Language.** UI in Vietnamese and English **[ASSUMPTION]**; CSV headers in English (section 5).

**NFR-10 Data protection compliance.** Design is mapped to the customer's data-protection policy and applicable Vietnamese law (e.g. personal data protection regulations) — specific clauses **[chưa xác minh; to be provided by customer's compliance]**.

## 5. CSV format

- **Encoding**: UTF-8 **with BOM** (`EF BB BF`) so Excel shows Vietnamese diacritics correctly. Verify: first 3 bytes of file; a row with "Nguyễn Văn A" in a free-text field opens correctly in Excel (manual test).
- **Delimiter** `,` ; quote `"` per RFC 4180; line ending CRLF; header row always present. Fields containing `,`, `"`, CR/LF are quoted, `"` doubled.
- **Time zone**: `timestamp_ict` in ISO-8601 with offset, e.g. `2026-10-15T08:30:12+07:00` (Asia/Ho_Chi_Minh). A second column `timestamp_utc` is included **[ASSUMPTION OQ-g]**.
- **File name**: `access-logs_<branchCode>_<YYYY-MM>_<masked|unmasked>_<exportId>.csv`. No personal data in the name.
- **Columns** (provisional, to be aligned with the old system's file, OQ-g):

| # | Column | Description |
|---|---|---|
| 1 | `event_id` | Unique event ID |
| 2 | `timestamp_ict` | Event time, ICT |
| 3 | `timestamp_utc` | Event time, UTC |
| 4 | `event_type` | login_success, login_failure, logout, resource_access |
| 5 | `username` | Pseudonym (masked) / full username (unmasked) |
| 6 | `client_ip` | Masked / full |
| 7 | `branch_code` | Branch of the user |
| 8 | `team_code` | Team of the user |
| 9 | `resource` | Target resource/action |
| 10 | `result` | success / failure / denied |
| 11 | `masking` | `masked` or `unmasked` |

- **CSV / formula injection**: any text cell whose first character is `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'` (after which standard CSV quoting applies); applies to all text columns incl. usernames, pseudonyms and resource, in masked and unmasked files, and also to cells that start with these characters after leading whitespace. Unmasked usernames are never altered other than this prefix, so forensic users must be told (in the dialog and the README of the export) that a leading `'` is a protection marker. Verify: test records with `=HYPERLINK("http://x","y")`, `+1+1`, `@SUM(A1)`, `-2+3` produce cells beginning with `'` and Excel/LibreOffice does not evaluate them.
- **Sorting**: ascending by `timestamp_utc`, then `event_id`. Last line of file is not a summary row (keep data-only).
- Each file carries no embedded metadata other than the columns above; export metadata is in the audit trail.

## 6. Audit trail of the exports themselves

One immutable record per event, with fields:

| Field | Note |
|---|---|
| `export_id` | UUID |
| `event` | REQUESTED, APPROVED, REJECTED, GENERATED, DOWNLOADED, DENIED, FAILED, EXPIRED, DELETED |
| `timestamp` | ICT with offset |
| `requester_id` | Internal user ID (not a display name in masked contexts) |
| `approver_id` | For unmasked only |
| `role` | Role used |
| `scope` | Branch/team code, period start/end |
| `mode` | masked / unmasked |
| `justification`, `case_ref` | Unmasked only |
| `row_count`, `file_size`, `sha256` | After generation |
| `delivery` | sync / async |
| `source_ip_of_requester` | Stored masked per FR-05 (full value only if the platform's own security-log policy requires it; then it follows that policy's retention) [OQ-a, OQ-e] |
| `pseudonym_key_version` | For masked exports; no key material |
| `status`, `failure_reason_category` | |

- **Retention**: audit records kept **7 years** **[ASSUMPTION OQ-e; value chưa xác minh]**; they hold no exported log content and no log-subject IP/username. They do contain staff identifiers (`requester_id`, `approver_id`, justification free text), which are personal data of employees; the justification must not contain client data (UI hint) and 7-year retention of these fields needs DPO confirmation (OQ-e).
- **Access**: Auditor and Security read-only; export by Auditors is itself audited. Records tamper-evident (append-only store or hash chain). Verify: attempt to update/delete an audit record via API and DB role used by app fails.
- **Alerting**: any denied attempt on out-of-scope data, and any unmasked request, raises a notification to Security **[ASSUMPTION]**.

## 7. Traceability (summary)

| Brief statement | Requirements |
|---|---|
| "Log Export" button, self-service | FR-01, FR-11a |
| Branch managers, team's logs | FR-02, OQ-b, OQ-i |
| Last month | FR-03 |
| CSV like old system | Section 5, OQ-g |
| Full IP and username for forensics | FR-08, FR-09 |
| No personal data unmasked | FR-05–07, FR-08 |
| Export everything they can see | FR-02, OQ-b |
| Within 5 seconds | FR-10, NFR-01, NFR-02 |
| Kept forever / delete after 12 months | FR-13, NFR-07, section 6 |
| Make it simple | FR-11a, OQ-k |

## 8. Data protection and legal basis (security review)

### 8.1 Data classification
| Data set | Personal data? | Label (proposed) |
|---|---|---|
| Client IP address, username in logs (unmasked) | Yes — identifies or can be linked to a person | Restricted (highest in use; unclear → higher) |
| Masked IP (IPv4 /24, IPv6 /48 kept) and HMAC pseudonym | Treat as personal data (pseudonymisation is not anonymisation) | Confidential |
| Export audit metadata (staff IDs, justification) | Yes — employees | Confidential |
| Hash, row count, scope | No | Internal |

### 8.2 Applicable framework — **cần pháp chế/DPO của khách hàng xác nhận**
No article numbers are cited because they have not been verified. To be confirmed by the customer's legal/DPO: (1) Vietnam's personal-data-protection regulation in force at go-live (decree/law on personal data protection; check the current text and any replacement), including processing basis, impact assessment duties and breach notification timelines; (2) banking-sector information-security rules and the SBV's requirements for information systems of credit institutions, including log retention; (3) the national information-system security level rules (levels per system classification); (4) the customer's own data-protection and retention policies. The spec treats these as inputs to OQ-a, OQ-e and OQ-l.

### 8.3 Requirements
**FR-14 (M) Data minimisation.** The CSV contains only the columns in section 5; no extra personal attributes (full name, national ID, phone).
- Verify: header row equals the defined list; a test record with extra attributes yields none of them.

**NFR-11 (M) No personal data in non-production.** DEV/UAT use synthetic data only; masking tests use documentation IPs (192.0.2.0/24, 2001:db8::/32) and fake usernames.
- Verify: test-data review; no production dump in CI.

**NFR-12 (S) Breach readiness.** A suspected leak of an export file or pseudonym key triggers the customer's incident process; key rotation (FR-06) and link revocation are possible within the incident SLA **[ASSUMPTION; legal notification deadline: chưa xác minh, to be provided by DPO]**.

## Open questions and assumptions

Impact: H = rework of core design or compliance breach; M = rework of a feature part; L = parameter change.

### OQ-a — Full IP/username for forensics vs. "no personal data leaves unmasked"
- **Question**: Which is the governing rule? May any role receive unmasked data? If yes, which role, which approval, what masking format is acceptable for the default (IP octets kept, pseudonym vs. hash vs. initials)?
- **Assumption**: Default export is masked (FR-05/06). Unmasked is only for a separate Forensic role with justification, case reference, approval by a different person, encryption, short-lived link, and full audit (FR-08, FR-09, section 6). Masking format as in FR-05/06.
- **Also confirm (DPO)**: whether full IP/username is personal data under the customer's policy (assumed yes), whether pseudonymised data may leave the platform, and who may approve unmasked release (assumed Security/Compliance, never the requester).
- **Affects**: FR-05–FR-09, FR-12, NFR-03, NFR-07, section 5/6, 8.
- **Impact if wrong**: H — if no unmasked export is allowed at all, FR-08/09 are removed; if BMs must get unmasked data, the compliance position changes and legal sign-off is needed.

### OQ-b — "Branch managers export" vs. "users export everything they can see"
- **Question**: Who may export: only branch managers, or every user for what they can see?
- **Assumption**: Only Branch Managers (and Forensic Analysts for the forensic flow) can export; scope is their own team/branch, not everything a user can view. Viewing rights do not imply export rights.
- **Also confirm**: whether "everything they can see" must be capped to the BM's own scope even for users with wider viewing rights (assumed yes: export scope is narrower than or equal to view scope).
- **Affects**: FR-01, FR-02, NFR-04, section 2.
- **Impact if wrong**: H — adds many roles and requires per-role scope rules; may enlarge the personal-data exposure.

### OQ-c — Meaning of "last month"
- **Question**: Previous calendar month, or the last 30 days? Which time zone? Is a custom range needed? Is the previous month available on day 1 (log delay)?
- **Assumption**: Previous calendar month, Asia/Ho_Chi_Minh (UTC+7); fixed, no custom range; available from day 1 at 00:00 ICT, with logs arriving late flagged as a known limitation.
- **Affects**: FR-03, section 5.
- **Impact if wrong**: M — query logic and UI change; wrong period would produce incorrect audit evidence.

### OQ-d — 5 s limit vs. "export everything" (unbounded volume)
- **Question**: What is the maximum realistic row count per branch-month? Is 5 s a hard limit for all sizes? How is it measured (server time, end-to-end, which percentile, which environment)? Are async exports with notification acceptable above a size?
- **Assumption**: Sync ≤ 50,000 rows with ≤ 5 s at p95 (measured server-side, request received → first byte, against production-like data), above that an async job with notification; async target ≤ 15 min up to 5,000,000 rows; hard cap 5,000,000 rows. All values are placeholders, not measured.
- **Affects**: FR-10, FR-11, NFR-01, NFR-02.
- **Impact if wrong**: M–H — if the 5 s is a hard limit for any size, a different architecture (pre-computed monthly exports) is needed.

### OQ-e — "Kept forever" vs. "delete personal data older than 12 months"
- **Question**: Which obligation prevails for the exported files? Does the 12 months run from log event date or from export creation? Is the pseudonymised file still personal data? Are backups included? What is the legal retention of audit metadata?
- **Assumption**: The export metadata record (who/when/scope/hash/row count) is kept long-term (7 years) without personal log content; the file itself is deleted at 12 months after creation (30 days for unmasked), or alternatively anonymised so it no longer identifies anyone. Pseudonymised files are treated as personal data. Backups follow the platform backup retention (deleted data may remain in backups until they expire; customer to confirm acceptability). Audit staff fields (requester/approver IDs) kept 7 years pending DPO confirmation.
- **Affects**: FR-13, NFR-07, section 6.
- **Impact if wrong**: H — legal/audit exposure; a "keep forever" outcome would require anonymisation instead of deletion.

### OQ-f — Files already downloaded to user machines
- **Question**: Who is responsible for retention of downloaded copies? Is DLP/endpoint control available?
- **Assumption**: The platform cannot delete downloaded copies. Mitigations: masked default, encryption for unmasked, user acknowledgement text in the dialog, audit of downloads; deletion duty for local copies is placed on the user via policy (customer to confirm). No DLP/DRM is specified, to avoid control beyond the stated risk.
- **Affects**: FR-09, FR-11a, NFR-07, out-of-scope 1.3.
- **Impact if wrong**: M — compliance gap remains documented; may require DRM/viewer-only delivery.

### OQ-g — "Like the old system"
- **Question**: Provide a sample (synthetic) old-system file: column names/order, delimiter, encoding, date format, header language, file naming.
- **Assumption**: Columns as in section 5; comma delimiter, UTF-8 BOM, ISO-8601 time. Old-system format is **not verified**.
- **Affects**: Section 5, FR-04.
- **Impact if wrong**: M — downstream consumers (scripts, Excel macros) may break.

### OQ-h — What "access logs" include
- **Question**: Which log sources/event types (login, resource access, admin actions, API calls, failed attempts, system logs)?
- **Assumption**: Authentication events and resource-access events only (FR-04).
- **Affects**: FR-04, section 5, NFR-01 sizing.
- **Impact if wrong**: M — volume and columns change.

### OQ-i — Definition of "team"
- **Question**: Which system defines teams and manager-to-team mapping (AD groups, HR system, platform's own groups)? How are transfers within the month treated?
- **Assumption**: Mapping comes from the customer's directory/HR source synced to the platform; membership evaluated at event time; a BM sees only their direct team/branch (no hierarchy roll-up).
- **Affects**: FR-02, section 2.
- **Impact if wrong**: H — incorrect scope means data leakage across branches.

### OQ-j — Delivery of the file
- **Question**: Direct download only, or link by notification? Link expiry? Mandatory file encryption? Is e-mail allowed (without attachment)?
- **Assumption**: Authenticated download link bound to requester, expires 24 h (masked) / 1 h single-use (unmasked); unmasked files encrypted at rest with platform-managed keys (no shared password); masked not separately encrypted; in-platform notification, e-mail contains no data. Times are placeholders.
- **Affects**: FR-09, FR-10, FR-11, NFR-03.
- **Impact if wrong**: M.

### OQ-k — "Make it simple"
- **Question**: What does simple mean: UI (one click, no options) or implementation (minimal controls)? Which controls are non-negotiable?
- **Assumption**: Simplicity applies to the BM's masked flow only (one click + confirm, fixed period and scope). It does **not** waive masking, scope checks, audit or retention controls; the forensic flow is intentionally more complex.
- **Affects**: FR-11a, FR-01, FR-08.
- **Impact if wrong**: M — removing controls to simplify would reintroduce the conflicts in OQ-a/OQ-e.

### OQ-l — Additional points
- **Language of UI/notifications, SLA of the platform, applicable regulation clauses (NFR-08, NFR-09, NFR-10)**: Assumed bilingual UI; SLA and clause references not verified; customer compliance to supply. Impact: L–M.
- **Approver identity (FR-08)**: Assumed the customer's Security/Compliance team; 3-day approval expiry. Impact: M.

---

## Security review notes

Reviewer: @security (S2), design gate. Changes made to this document:
- FR-05: IPv4 mask now last octet (was last two); added IPv6 documentation example and fail-closed rule. Examples use only 192.0.2.0/24 and 2001:db8::/32.
- FR-06: key managed by the platform, versioned, rotation and no-fallback rule; unkeyed hashes prohibited.
- FR-08/FR-09: scope check at request time, audit of each step; replaced "password-protected archive" by platform-managed encryption (no password distribution); link single-use, 1 h.
- NFR-04: server-side scope derivation and six negative tests (cross-branch, mode/role forgery, period, IDOR, session, dataset check).
- Section 5: CSV-injection rule extended to pseudonyms, unmasked data and leading whitespace; forensic note about the `'` prefix.
- FR-13/NFR-07: "kept forever" vs. 12 months resolved as "keep evidence (metadata + hash), delete personal data"; legal-hold exception; clock defined.
- Section 6: requester IP masked in audit; staff identifiers flagged as personal data; alerting simplified; per-user concurrency limit removed from FR-11 as unjustified by risk.
- New section 8: classification, legal framework (to be confirmed by customer legal/DPO, no clauses cited), FR-14, NFR-11, NFR-12.
- OQ-a, b, e, f, j: added DPO confirmation points; OQ-f states no DLP/DRM by design.
- Not verified: legal texts, SLA, retention periods, performance figures. No commands beyond file checks were run.
