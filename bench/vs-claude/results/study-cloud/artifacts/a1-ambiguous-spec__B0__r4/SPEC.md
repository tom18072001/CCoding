# SPEC: Log Export (self-service access-log export)

Status: Draft for customer confirmation. Version 0.1. Data classification: internal.
All numbers below are **assumptions**, not measurements of any real system. The repository is empty, so there is no legacy system to reference.

## 1. Context, goals, non-goals

### 1.1 Context
A Vietnamese bank uses the log platform. Branch managers want a self-service **Log Export** button to download their team's access logs from last month as CSV, "like the old system". The brief contains contradictions (unmasked IP vs. no unmasked personal data; keep forever vs. delete after 12 months; "team" vs. "everything they can see"; 5 seconds vs. unknown volume). The section "Open questions and assumptions" resolves each with a named assumption. Defaults are chosen to be the safer option; every assumption needs customer confirmation before build.

### 1.2 Goals
- G1. A Branch Manager can export access logs of their own team for the previous period as CSV in one click, with no ticket.
- G2. The default export contains **no unmasked personal data**.
- G3. A separate, approval-gated, fully audited path serves forensic needs (full IP and username).
- G4. Every export is audited; retention of files and logs is consistent with the 12-month personal-data deletion rule.
- G5. Exports finish within the time budget in NFR-1, or fall back to an asynchronous job.

### 1.3 Non-goals (MVP)
- Architecture, storage technology, or implementation design.
- Formats other than CSV (no XLSX, JSON, PDF).
- Ad-hoc filters/search UI beyond date period and the fixed scope (see Q-i).
- Scheduled or recurring exports; email delivery of files.
- Changing how logs are ingested or how the 12-month deletion of source logs is implemented (only its interaction with exports is specified).
- Exporting data other than access logs.

## 2. Actors and roles

| Role | Description | Export rights |
|---|---|---|
| Branch Manager (BM) | Manages one or more branches; has team members | Masked export of team members' access logs, within their own visibility (FR-2) |
| Forensic Investigator (FI) | Security/forensic staff, separate role, not granted to BM by default | May **request** unmasked export (FR-8); cannot self-approve |
| Export Approver | Second person (e.g. Security Officer / DPO delegate); never the requester | Approves/rejects unmasked requests (FR-8) |
| DPO | Data Protection Officer | Confirms the legal basis before the unmasked path is enabled; read access to export audit |
| Auditor | Internal audit | Read-only access to export audit records (FR-9) |
| Platform Admin | Operates platform | No export of content by role alone; configures limits |

Authorization uses RBAC. Roles are granted by the bank's identity system (Q-g).

## 3. Data definition

### 3.1 Access log record (assumed fields; to confirm, Q-f)
| Field | Type | Personal data (Decree 13/2023/NĐ-CP)? | Default export form |
|---|---|---|---|
| event_id | string (opaque) | No | as is |
| event_time | timestamp (stored UTC) | No (but linked to a person via other fields) | ISO 8601 with +07:00 offset (Asia/Ho_Chi_Minh) |
| username | string | **Yes** – identifies a natural person | pseudonymized (FR-6) |
| client_ip | IPv4/IPv6 | **Yes** – treated as personal data (online identifier) | masked (FR-5) |
| branch_id | string | No | as is |
| resource / target system | string | No | as is |
| action | enum (login, logout, read, ...) | No | as is |
| result | enum (success, failure) | No | as is |
| user_agent | string | Potentially | **excluded** from MVP |

Assumption: client IP and username are classed as personal data under Decree 13/2023/NĐ-CP (basic personal data). The DPO must confirm classification (Q-a).

### 3.2 Export metadata record (no personal data)
export_id, requester_user_pseudonym_id, role, branch scope id, period start/end, mask mode (masked/unmasked), row count, status, created/finished time, file checksum (SHA-256), approval references, file expiry time. The requester is referenced by a stable internal ID, not by name or IP (Q-e).

## 4. Functional requirements

**FR-1 Export button.** An "Export logs" button is shown to users holding the BM role on the access-log screen. Clicking it opens a minimal dialog: period (default = previous period, FR-3) and a Confirm button. No other required input. Users without the role do not see it, and the endpoint rejects them (HTTP 403).

**FR-2 Data scope.** Exported rows = access-log events where the actor is a member of the requester's team **AND** the event is within data the requester is permitted to see (intersection of "my team" and "everything I can see", RBAC). Rows outside the intersection are never included. The team membership is resolved at export time from the identity source (Q-g). **Scope is enforced server-side only**: the backend derives requester, team, branch and role from the authenticated session; any scope, branch, user or role parameter sent by the client is ignored (or rejected if it differs). An export_id or download link of another user must return 404/403 (no IDOR). The export dialog shows the resolved scope (branch names/team size, not personal data) before confirm.

**FR-3 Period.** Default period: the previous **calendar month** in Asia/Ho_Chi_Minh, 00:00:00 inclusive to first day of current month 00:00:00 exclusive (Q-c). The period is fixed in MVP; no custom range. Only periods within the 12-month personal-data retention window can be exported.

**FR-4 CSV format.**
- RFC 4180: CRLF line ends, header row, fields containing comma, quote, CR or LF are double-quoted; quotes doubled.
- UTF-8 **with BOM** (for Excel in Vietnamese locale).
- Timestamps ISO 8601 with +07:00.
- Proposed columns, in order: `event_id, event_time, username_pseudo, client_ip_masked, branch_id, resource, action, result`. For approved unmasked exports (FR-8): `username, client_ip` replace the two masked columns, other columns unchanged.
- **Formula-injection protection**: any text cell starting with `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'` (applies to all string columns, after quoting rules are determined). Verified by test with such values.
- File name: `access-logs_<branch-or-team-id>_<YYYY-MM>_<masked|unmasked>_<export_id>.csv`.
- "Like the old system" is unverifiable (Q-f); the columns above are the assumed substitute.

**FR-5 IP masking (default).** IPv4: zero the last octet (`203.0.113.0/24` style, shown as `203.0.113.0`). IPv6: keep first /48, zero the rest. Masking is applied server-side before any byte of the file is written. Alternative (if customer needs per-address correlation): keyed hash (HMAC-SHA-256 with a secret key held in a key store, truncated to 12 hex chars). **A plain or unsalted hash of an IP must never be used**: the IPv4 space (about 4.3 billion values) can be brute-forced in minutes, so it does not hide identity. Truncated /24 values are still treated as personal data (see section 6). MVP default is /24 masking.

**FR-6 Username pseudonymization (default).** `username_pseudo` = `u_` + first 12 hex chars of HMAC-SHA-256(secret key, username). Same user gives the same pseudonym within and across exports while the key is unchanged, so the manager can see patterns; the manager cannot reverse it. The key is at least 256 bits, generated in the bank's key store, never stored in code, config or exports, and not accessible to BM role. The output is truncated to 12 hex chars (48 bits); collisions are acceptable for pattern-viewing but the value must not be used as an identifier for disciplinary action. Re-identification is only possible through the FR-8 path. Key rotation policy: Q-a/Q-e.

**FR-7 Delivery and size handling.** The file is delivered as a download through the platform after authentication (see Q-h). If the estimated row count ≤ the sync limit (NFR-2), the file is produced synchronously; otherwise an asynchronous job is created (FR-7a).
- **FR-7a** Async: user sees "Export is being prepared" with export_id; on completion the requester gets an in-platform notification and the file is downloadable only by the requester for 7 days (assumption), then removed (FR-10). Download requires an authenticated session and ownership check on every request.
- **FR-7c Rate limit.** Per user: max 2 concurrent and 10 export requests per day (assumption); platform-wide limits per NFR-4. Excess returns HTTP 429 and writes an audit record. Repeated denials or unusual volume raise an alert to Security.
- **FR-7b** Hard cap: if rows exceed the max limit (NFR-2), the request is rejected with a clear message and a suggestion to narrow scope; no partial file is silently produced. A truncated file is never delivered without a visible "TRUNCATED" indication (not planned for MVP).

**FR-8 Unmasked export (restricted path).** Disabled by a feature flag until the DPO confirms in writing (Q-a). When enabled:
1. Only users with the FI role can request, with a mandatory justification and a valid **case ID** from the bank's case/ticket system (format-checked; existence check if the integration exists, else Q-j). The justification field is short (max 500 chars) and carries a warning not to type personal data.
2. Approval by **DPO or Security Officer (or delegate)**, a different person from the requester (four-eyes); self-approval is blocked even if one user holds both roles. Approval expires after 24 hours (assumption).
3. Scope is limited to the requester's permitted scope (FR-2) and the period in FR-3; a maximum of 31 days per request.
4. The file is encrypted at rest. The download link is **single-use and expires in 24 h at most** (assumption), bound to the requester's session, and requires re-authentication (step-up). After the first successful download or expiry the file is deleted (section 6). The file cannot be sent by email or any channel outside the platform.
5. The file name and every page of the UI mark it "UNMASKED – CONFIDENTIAL"; the footer in the dialog shows the retention rule (FR-10).
6. BM role can never request unmasked exports.

**FR-9 Audit of export actions.** Every export attempt (success, failure, rejected, approved, denied, downloaded, expired, purged) writes an immutable audit record: export_id, actor internal ID, role, action, timestamp (UTC and +07:00 displayed), scope id, period, mask mode, row count, outcome, approval chain, justification reference, checksum. **Audit records contain no client IP and no username** in cleartext (only internal IDs; these are pseudonymous and treated as personal data of staff, see section 6 and Q-e). Audit storage is append-only/WORM or hash-chained so that records cannot be altered or deleted by any role including Platform Admin; unmasked-path records additionally include requester, approver, case ID and justification reference. Audit is retained at least as long as the platform's log-retention rule requires (Q-n). Audit is append-only, readable by Auditor/DPO; BMs can see only their own export history list (metadata, no file content).

**FR-10 Retention and purge of export files.** See section 6.

## 5. Non-functional requirements (all values are assumptions)

| ID | Requirement | Measurable target (assumed) |
|---|---|---|
| NFR-1 | Time to complete | For a synchronous export: from click on Confirm to the first byte of the download ≤ 2 s and to a complete file ≤ **5 s** at p95, for ≤ **50,000 rows** on a platform under normal load (Q-d). |
| NFR-2 | Row limits | Sync limit 50,000 rows; async limit up to 2,000,000 rows (≈ assumed ≤ 15 min, p95); above 2,000,000 rows: rejected (FR-7b). All three are placeholders pending real volumes. |
| NFR-3 | Time zone | All user-visible dates, period boundaries, file names and CSV timestamps use Asia/Ho_Chi_Minh (UTC+7, no DST); storage in UTC. |
| NFR-4 | Concurrency | At most 2 concurrent exports per user and 20 platform-wide (assumption); excess returns HTTP 429 "try later" (FR-7c). |
| NFR-5 | Security | TLS in transit; files encrypted at rest; download links not guessable (≥128-bit random), bound to the requester session, with server-side authorization on each request. Whether users need file-level encryption is Q-p. |
| NFR-6 | Availability of audit | Export fails closed: if the audit record cannot be written, no file is produced. |
| NFR-7 | Accessibility/Language | UI in Vietnamese and English; CSV headers in English. |
| NFR-8 | Integrity | SHA-256 recorded for each file; verified on download. |

## 6. Retention

| Item | Contains personal data? | Retention (assumed) | Action at end |
|---|---|---|---|
| Source access logs | Yes | 12 months from event time | Delete (existing platform duty; out of scope to build here) |
| Masked export file (IP /24, pseudonymized user) | Treated as **still personal data** until the DPO says otherwise (pseudonymization is reversible with the key; /24 may still be identifying in small ranges) | Available for download 7 days (same as FR-7a), then purged; absolutely no later than 12 months after the oldest event inside it | Secure delete; export files are stored outside backup scope (see below) |
| Unmasked export file | Yes | Deleted at first successful download or after 24 h, whichever is first; never beyond 12 months from oldest event | Secure delete; outside backup scope |
| Export audit metadata (FR-9, section 3.2) | Contains no IP or username, but internal user IDs are pseudonymous, so treated as personal data until the DPO decides otherwise (Q-e) | Kept indefinitely **only if the DPO confirms**; otherwise the user ID is replaced by an irreversible token at 12 months and the rest is kept | Remove or irreversibly tokenise the user ID per DPO decision; the record stays as the "kept forever for audit" evidence |
| Pseudonymization key | n/a | Kept while any pseudonymized export file exists (max 12 months of data age plus 7 days) | Destroying the key irreversibly anonymizes old pseudonyms; key is not backed up together with the data it protects |

This resolves "kept forever" vs. "delete personal data older than 12 months": the **permanent audit trail is the metadata + checksums**, not the personal-data files. Customer must confirm (Q-e); if they require the files themselves kept for audit, a legal basis and an exception to the 12-month rule must be documented by DPO.

**Backups.** Export files are excluded from backups (they can be regenerated within the 12-month window). Backups of source logs and of the audit store must expire so that personal data older than 12 months is gone from backups within a maximum of 35 days after the 12-month point (assumption; backup cycle to confirm, Q-p). A restore from backup must re-run the deletion jobs before the data is made available.

**FR-10 (purge).** A scheduled job deletes export files per the table, writes a `purged` audit record for each, and reports failures to Platform Admin. Purge must complete within 24 h of the due time.

## 7. Acceptance criteria (Given / When / Then)

**FR-1**
- AC-1.1 Given a user with BM role, When they open the access-log screen, Then the Export button is visible.
- AC-1.2 Given a user without BM/FI role, When they open the screen or call the export endpoint directly, Then no button is shown and the endpoint returns 403 and writes a denied audit record.
- AC-1.3 Given a BM, When they click Export and Confirm with default values, Then no further input is required to start the export.

**FR-2**
- AC-2.1 Given BM A of team X and an event by a member of team Y, When A exports, Then the file has no rows for team Y.
- AC-2.2 Given a team member whose events are in a resource A cannot see under RBAC, When A exports, Then those rows are absent.
- AC-2.3 Given a member who left the team during the period, When A exports, Then the behaviour matches the Q-g assumption (membership as of export time) and is shown in the scope summary.

**FR-3**
- AC-3.1 Given today is 2026-12-02 in Asia/Ho_Chi_Minh, When BM exports with default, Then rows have event_time ≥ 2026-11-01T00:00:00+07:00 and < 2026-12-01T00:00:00+07:00.
- AC-3.2 Given an event at 2026-11-30T23:59:59+07:00 (stored as 16:59:59Z), When exporting, Then it is included; an event at 2026-12-01T00:00:00+07:00 is excluded.
- AC-3.3 Given a period older than 12 months, When requested, Then it is rejected with a message.

**FR-4**
- AC-4.1 Given any export, When the file is opened as bytes, Then it starts with EF BB BF, uses CRLF, and has the header from FR-4.
- AC-4.2 Given a username `=cmd|' /C calc'!A0` or a resource containing commas, quotes, and newlines, When exported, Then the cell is prefixed with `'` / correctly quoted, and a RFC 4180 parser round-trips the row.
- AC-4.3 Given a Vietnamese string with diacritics, When exported and opened in Excel, Then characters display correctly.
- AC-4.4 Given a period with zero rows, When exported, Then a file with only the header is delivered.

**FR-5**
- AC-5.1 Given client_ip 198.51.100.77, When exported masked, Then the value is 198.51.100.0.
- AC-5.2 Given an IPv6 address, When exported masked, Then bits beyond /48 are zero.
- AC-5.3 Given a masked export, When the file is scanned for any full IP address from the source set, Then there are zero matches.

**FR-6**
- AC-6.1 Given user "test.user01" (fake), When exported masked in two different exports under the same key, Then both show the same `u_...` value and never the plain username.
- AC-6.2 Given a masked export, When scanned for any source username, Then zero matches.

**FR-7**
- AC-7.1 Given ≤ 50,000 matching rows, When Confirm is clicked, Then a complete file is available per NFR-1.
- AC-7.2 Given 50,001–2,000,000 rows, When Confirm is clicked, Then an async job starts, the UI shows its status, and on completion only the requester can download.
- AC-7.3 Given > 2,000,000 rows, When Confirm is clicked, Then the request is rejected, no file is produced, and the message tells the user to narrow scope.
- AC-7.4 Given an async file older than 7 days, When download is attempted, Then it is refused as expired.

**FR-8**
- AC-8.1 Given the feature flag is off, When anyone requests unmasked, Then the option is not offered and the API returns 403.
- AC-8.2 Given flag on and a BM, When they request unmasked, Then 403.
- AC-8.3 Given an FI submits a request without justification, Then it is rejected.
- AC-8.4 Given an FI who is also an Approver, When they try to approve their own request, Then it is blocked.
- AC-8.5 Given a valid approved request, When the FI downloads after re-authentication, Then the file has full username and client_ip, the "unmasked" name, and a second download or a download after 24 h fails.
- AC-8.6 Given a rejected or expired approval, Then no file is generated.

**FR-9**
- AC-9.1 Given any export event type in FR-9, When it occurs, Then exactly one audit record exists with all listed fields.
- AC-9.2 Given audit records, When scanned for IP patterns and known usernames, Then there are none.
- AC-9.3 Given the audit store is unavailable, When a user exports, Then no file is produced and the user sees an error.
- AC-9.4 Given any user, When they try to modify or delete an audit record, Then it is refused.
- AC-9.5 Given a BM, When they open export history, Then they see only their own exports' metadata.

**FR-10**
- AC-10.1 Given a masked file 7 days + 1 h old, When the purge job runs, Then the file is gone, a `purged` audit record exists, and the audit metadata remains.
- AC-10.2 Given an unmasked file downloaded once or older than 24 h, Then same as AC-10.1.
- AC-10.3 Given a file whose oldest event reaches 12 months, Then it is purged regardless of the other windows.
- AC-10.4 Given purge failure, Then Platform Admin is alerted within 1 h.

**Security (added in S2)**
- AC-S.1 Given a BM who edits the request to add another branch or user ID, When the request is sent, Then the file still contains only the session-derived scope and the attempt is audited.
- AC-S.2 Given BM A knows the export_id or link of BM B, When A calls the download, Then the response is 403/404.
- AC-S.3 Given a user who exceeds the rate limit, When they export again, Then HTTP 429 is returned and an audit record exists.
- AC-S.4 Given an unmasked request where requester and approver are the same person, or the case ID is missing/invalid, Then it is rejected.
- AC-S.5 Given an unmasked link already used once, or older than 24 h, When opened, Then it fails and the file is deleted.
- AC-S.6 Given a restore of a backup holding data older than 12 months, When the restore finishes, Then the deletion job runs before the data is accessible.
- AC-S.7 Given a review of the masking code, Then no unkeyed hash of IP or username is used.

**NFR (selected)**
- AC-N.1 Given a test dataset of 50,000 rows, When 30 consecutive sync exports run, Then ≥ 95% complete in ≤ 5 s (NFR-1).
- AC-N.2 Given a user in a different time zone setting, When exporting, Then boundaries and timestamps remain +07:00.

## 8. MVP scope ("make it simple")
In MVP: FR-1 to FR-7, FR-9, FR-10 (masked-only), one button, fixed period, fixed columns, no filters. FR-8 is specified but **ships disabled** and is built only after DPO confirmation. Simplicity is for the user (one click, safe defaults), not for omitting audit or masking (Q-i).

## Open questions and assumptions

| # | Question | Contradiction / ambiguity in the brief | Assumption used meanwhile | Impact if assumption is wrong |
|---|---|---|---|---|
| Q-a | Can full IP and username leave the platform for forensics, and under what legal basis? | "Full IP and usernames for forensic use" vs. "no personal data may leave the platform unmasked." Both cannot hold for one file. | Default export is masked (FR-5, FR-6). Unmasked only via FR-8: FI role, approval by a second person, full audit, and **disabled until the DPO confirms in writing**. IP and username treated as personal data under Decree 13/2023/NĐ-CP. | If unmasked is needed for BMs: re-do role model and a DPO impact assessment. If masking is rejected as too weak (e.g. /24): switch to keyed hash, minor change. If forensic need is dropped: FR-8 removed. |
| Q-b | "Their team's" logs, or "everything they can see"? | "Export their team's" vs. "export everything they can see": visibility may be wider than the team. | Intersection of team and RBAC-visible data (FR-2). | If "everything visible": scope widens and mass-disclosure risk rises, needs DPO sign-off; if team only: no change. Row volumes and NFR-2 change either way. |
| Q-c | What is "last month"? | Calendar month vs. rolling 30 days. | Previous calendar month in Asia/Ho_Chi_Minh, fixed (FR-3). | If rolling 30 days: change period logic and AC-3.x; file naming changes. Custom ranges would be a new FR. |
| Q-d | What does "within 5 seconds" cover, and for how many rows? | No volume given; no definition of start/end; async not mentioned. | p95, click to complete download, up to 50,000 rows sync; 50,001–2,000,000 async; above rejected (NFR-1, NFR-2). All numbers are placeholders. | If real volumes are larger: more async, or precomputed/materialized exports; if 5 s is mandatory for all sizes: scope must be cut (smaller period/branch) or the requirement renegotiated. |
| Q-e | Are export files kept forever, or deleted at 12 months? (also: may audit metadata with internal user IDs be kept forever?) | "Kept forever for audit" vs. "delete personal data older than 12 months". | Files containing personal data (masked and unmasked) are purged (30 days, never beyond 12 months of data age). Audit metadata with no IP or username is kept forever, with the internal user ID tokenised at 12 months unless the DPO allows otherwise (section 6). Masked files are still treated as personal data. | If files must be kept forever: needs a documented legal exception, or storing truly anonymized data only; storage cost rises and compliance risk with Decree 13/2023/NĐ-CP. If audit must show content: store checksums and row counts only (already planned). |
| Q-f | What does "like the old system" mean? | No sample, column list or encoding provided; repo is empty. | Columns and format in FR-4. | If a legacy layout is required: column order/names/delimiter/encoding change; any downstream consumer breaks. Need a sample file (fake data). |
| Q-g | What is the identity source and how is "team member" defined? | Brief does not say who is on a manager's team (org chart, HR, group in IdP/AD, branch code). | Team = users mapped to the manager's branch(es) in the bank's identity system; membership taken at export time. | If time-of-event membership is needed: history of org data required. If team spans branches: scope rules change. Wrong mapping = over- or under-disclosure. |
| Q-h | What does "leave the platform" mean – does downloading to the user's PC count? | "No personal data may leave the platform unmasked" vs. "export as CSV". | Any download to a user device counts as leaving; so all downloads are masked by default, unmasked only per FR-8. In-platform viewing is not covered by this spec. | If download is not "leaving": masked-by-default could be relaxed, which we do not recommend. If viewing screen must also be masked: separate requirement. |
| Q-i | What does "make it simple" mean? | Subjective; conflicts with approval flow, audit, and async. | Simple = one-click for BM with safe defaults; no filters, one format, one period (section 8). Complexity is on the back end and in the restricted path. | If simple = no approval/audit: not acceptable on compliance grounds. If more filters needed: add FRs. |
| Q-j | Who can approve unmasked exports, who is the FI, and what is the SLA? | Brief names no investigator role or approver. | FI and Approver as in section 2; approval within 24 h validity. | Different approval chain changes FR-8 and the audit flow. |
| Q-k | Is the pseudonymization key policy acceptable (rotation, who holds it)? | Not mentioned. | Keyed HMAC (never an unkeyed hash) held in the bank's key store, not rotated in MVP; BM cannot access. | Rotation would break cross-export correlation; leaked key would allow re-identification. |
| Q-l | Is email/Excel opening a requirement (BOM) and which client software is used? | "CSV" only. | UTF-8 with BOM for Excel (FR-4). | Non-Excel pipelines may need no BOM; trivial change. |
| Q-m | Are the volumes, concurrency limits and retention windows (30 days, 7 days, 24 h) acceptable? | No numbers provided. | Values in NFR-2, NFR-4, section 6. | Adjust configuration; no redesign unless volume is orders of magnitude different. |
| Q-n | Does the State Bank of Vietnam (NHNN) or another sector rule set a minimum retention or content requirement for access logs? **Customer must confirm; no article is cited because none was verified.** | "Delete after 12 months" may conflict with sector-specific minimum retention. | Only the 12-month rule in the brief applies. | Longer minimum retention would change section 6 and Q-e. |
| Q-o | What is the legal basis under Decree 13/2023/NĐ-CP for processing staff IP/usernames for export, is an impact assessment on file, and who is the DPO contact? | Brief cites a policy but no legal basis or assessment. | Basis = internal security/audit purpose, to be confirmed by DPO; impact assessment done before FR-8 is enabled; staff informed via internal policy. | Without a basis, even masked exports may be blocked. |
| Q-p | Backup lifetime, and do users need file-level encryption (password/PGP), or is platform encryption plus a single-use link enough? | Not mentioned. | Backups age out within 35 days after the 12-month point (section 6); no user-side file encryption in MVP, only encryption at rest and TLS. | Longer backup cycles break the 12-month rule; user-side encryption adds key distribution work. |

## 10. Traceability (brief → requirement)

| Brief statement | Requirement |
|---|---|
| Self-service Export button | FR-1 |
| Branch managers, team's logs | FR-2, Q-b, Q-g |
| Last month | FR-3, Q-c |
| CSV like old system | FR-4, Q-f |
| Full IP and usernames for forensics | FR-8, Q-a |
| No personal data unmasked | FR-5, FR-6, FR-8, Q-a, Q-h |
| Export everything they can see | FR-2, Q-b |
| Complete within 5 seconds | NFR-1, NFR-2, FR-7, Q-d |
| Files kept forever for audit | FR-9, section 6, Q-e |
| Delete personal data older than 12 months | Section 6, FR-10, Q-e |
| Make it simple | Section 8, Q-i |
