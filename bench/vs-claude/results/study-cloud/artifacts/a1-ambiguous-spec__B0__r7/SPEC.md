# Log Export — Implementation Specification

Status: Draft v0.1 for customer confirmation. Data classification: internal.
Nothing about the legacy system is known to the author (the repository is empty); every statement about it is an assumption and is flagged as such.

## 1. Context and goal

A Vietnamese bank asked for a self-service "Log Export" button on the log platform so that branch managers can export their team's access logs for last month as CSV, "like the old system".

The brief contradicts itself in several places (details in the Open questions section):

| # | Brief says | Brief also says | Conflict |
|---|-----------|-----------------|----------|
| C1 | Full client IP and username in export (forensic use) | No personal data may leave the platform unmasked | IP and username are personal data (Decree 13/2023/ND-CP, assumed; legal confirmation needed) |
| C2 | Export everything the user can see | Export their team's access logs from last month | Visibility scope vs. team + month scope |
| C3 | Export files kept forever for audit | Delete personal data older than 12 months | Files contain personal data |
| C4 | Must complete within 5 seconds | Export "everything" | Unbounded volume vs. fixed latency |
| C5 | Make it simple | Forensic needs, masking, approval, retention | Simplicity vs. compliance |

Goal: deliver a safe-by-default export. The default export is masked; an unmasked forensic export does NOT exist until the customer explicitly confirms it (OQ-1, OQ-10).

## 2. Scope and out of scope

In scope:
- "Log Export" button and export flow for branch managers.
- Time filter, CSV generation, masking, sync/async execution, download.
- Audit record of every export action.
- Retention rules for the three data objects (section 6).
- Specification of a separate, approval-gated forensic flow (built only after customer confirmation).

Out of scope (this phase):
- Changes to log ingestion or log collection.
- Export formats other than CSV (XLSX, JSON, PDF).
- Scheduled or recurring exports.
- Cross-bank or external sharing of exports (email, SFTP push).
- Migration of files from the old system.
- Implementation of the forensic unmasked flow until OQ-1 and OQ-10 are answered.

## 3. Actors and permissions

| Actor | Definition (assumed) | Permission |
|-------|----------------------|------------|
| Branch manager | A user holding role `BRANCH_MANAGER` for one or more branches, as assigned in the bank's identity source | Export masked access logs of members of their branch team |
| Delegate | A user holding a time-boxed delegation from a branch manager, recorded in the identity source | Same as the delegator, only for the delegated branches and delegation period |
| Security officer / approver | Role `LOG_EXPORT_APPROVER`, never the requester | Approves or rejects forensic requests (section 5.4) |
| Auditor | Role `AUDITOR` | Reads the export audit records; does not read exported files unless granted |
| Platform admin | Operates the platform | Cannot export on behalf of others; no access to HMAC key material beyond key custody procedure |

Team definition (assumption A-TEAM): "team" = all users whose primary branch code in the HR master system equals a branch the manager manages. The AD/directory is used only for authentication and role lookup, not for team membership, because AD groups are often not maintained per branch. HR vs. AD is an open question (OQ-2).

Rules:
- A manager of several branches sees a branch selector listing only managed branches; an export covers exactly one branch at a time in v1 (multi-branch selection is an enhancement).
- Delegation is honoured only while active; expiry is checked at request time and again at download time.
- Authorization is enforced server-side on every request; UI hiding alone is not sufficient.
- A user with no managed branch does not see the button.

## 4. Functional requirements

**FR-1 Log Export button.** Users with the branch manager (or delegate) role see a "Log Export" button on the access-log view. Others do not, and the API returns 403 to them.

**FR-2 Branch selection.** If the user manages more than one branch, the user must select exactly one branch before export. If only one, it is preselected.

**FR-3 Time filter.** Default range is the previous calendar month, from 00:00:00.000 on the first day to 23:59:59.999 on the last day, timezone Asia/Ho_Chi_Minh (UTC+7, no DST). The user may change the range to any range within the last 12 months, maximum span 31 days per export (assumption; keeps volume bounded). Event time (not ingest time) is the filter field.

**FR-4 Scope enforcement.** The export contains only access-log events whose subject user belongs to the selected branch's team (A-TEAM) and which fall in the selected range. "Everything the user can see" is NOT honoured beyond this scope (assumption for C2).

**FR-5 CSV format.**
- Encoding UTF-8 with BOM (so Excel on Vietnamese Windows reads diacritics).
- Delimiter comma; quote character `"`; escaping by doubling; line ending CRLF.
- First row is a header.
- Timestamps in ISO 8601 with offset, e.g. `2026-10-05T08:15:30+07:00`.
- File name: `log-export_<branchCode>_<YYYYMMDD>-<YYYYMMDD>_<exportId>.csv`.
- Columns, in order (assumed; the legacy column set is unknown, OQ-6):
  1. `event_time`
  2. `event_id`
  3. `user_pseudonym`
  4. `client_ip_masked`
  5. `branch_code`
  6. `log_source`
  7. `action`
  8. `result`
  9. `resource`
  
**FR-6 CSV/formula injection protection.** Any text cell beginning with `=`, `+`, `-`, `@`, TAB or CR is prefixed with a single quote `'` before quoting. Applied to every text column, including values derived from log content such as `resource`. Numeric columns are not text and are not prefixed.

**FR-7 Masking by default.** Every export applies section 5 masking. There is no option in the UI or API to disable it for branch managers.

**FR-8 Sync/async execution.** If the estimated row count is at or below the threshold (default 50,000 rows, configurable), the file is generated synchronously and the download starts in the same request. Above it, an asynchronous job is created; the user sees a job status and is notified in-app when the file is ready (NFR-1).

**FR-9 Download and access.** The user who requested the export (or an active delegate of the same branch) can download it through an authenticated, expiring link (assumed 24 hours, OQ-8). Links are not shareable without authentication. The server re-checks identity, role/delegation and branch scope on every download, not only at request time.

**FR-10 Empty result.** When no rows match, the user gets a clear message and no file; an audit record is still written.

**FR-11 Limits.** Maximum 1,000,000 rows per export (assumption); beyond this the user is asked to narrow the range. Maximum 3 concurrent export jobs per user and 20 exports per user per day (assumed, OQ-12); excess requests get HTTP 429 and an audit record.

**FR-12 Forensic flow (gated).** A separate request type "Forensic export (unmasked)" is specified in 5.4 but is disabled by feature flag and not built until the customer confirms OQ-1 and OQ-10.

## 5. Data protection and masking

### 5.1 Classification
Client IP address and username are treated as personal data (assumed to fall under Decree 13/2023/ND-CP on personal data protection; no specific article is relied on here, and the legal basis, purpose limitation and any impact-assessment duty must be confirmed by the bank's legal/DPO, OQ-1). Exports are therefore classed as containing personal data even after masking, because pseudonymised data is still personal data. Masking reduces risk; it does not make the file anonymous.

### 5.2 Masking rules (default)
- IPv4: truncate to /24, last octet replaced by `0`, e.g. `192.0.2.0/24` shown as `192.0.2.0`. Documentation addresses are used in examples.
- IPv6: truncate to /48, remaining bits zeroed.
- Username: replaced by `HMAC-SHA-256(key, normalised_username)`, hex, truncated to the first 16 bytes (32 hex characters), prefixed `u_`. The normalised username is lower-cased and trimmed.
- The HMAC key is held in the bank's key management system/HSM, never in code or config files, rotated on a schedule (assumed yearly). Within one key version the pseudonym is stable, so a manager can count activity per person. Key version is not shown in the file but recorded in the audit record.
- Pseudonym-to-username lookup is not available to branch managers. Re-identification is possible only through the forensic flow.
- Why these choices (re-identification review): a plain hash of a username is reversible by dictionary because usernames are guessable, so only a keyed HMAC is allowed; the key never leaves KMS/HSM, so a file leak alone does not allow reversal. Truncating to 16 bytes keeps collisions negligible at this scale. A /24 IPv4 prefix is typically an office or ISP segment and, for a stable pseudonym, still lets a recipient infer location/branch patterns; it is accepted as a proportionate default, and OQ-1 asks whether the bank wants a coarser or finer prefix. The stable pseudonym is deliberately linkable within one key version (needed to count activity per person) and is therefore still personal data.
- Free-text columns (`resource`, and any other value derived from log content) can embed usernames, full IPs, e-mail or customer identifiers (for example in URLs or query strings). Before writing, these values pass a redaction step: query strings are dropped, and any substring matching an IPv4/IPv6 address, e-mail address or a username present in the source set is replaced by `[redacted]`. If redaction cannot be applied reliably for a log source, that field is left out of the export (OQ-7).

### 5.3 Other protections
- Files are encrypted at rest and transferred over TLS 1.2+.
- No personal data in application logs or in the audit record of export (only IDs, counts, parameters).
- Exports are generated server-side; masking occurs before data reaches the file writer, so no unmasked intermediate file is persisted.
- Export files and stored copies are covered by the same retention and deletion rules as in section 6, including backups.
- Access control: a user can export only branches they currently manage or are delegated (server-side check on request and download; a requested branch outside that set returns 403 regardless of UI). Rate and size limits are in FR-11.
- No personal data is written to the audit record of export (section 6, NFR-2).

### 5.4 Forensic flow (only after customer confirmation)
This is the ONLY path that can produce unmasked IP or username. It is off by default (feature flag), is not built or enabled until OQ-1 and OQ-10 are answered, and is not available to the standard branch-manager role. No other endpoint, parameter or role may produce unmasked values.
1. The requester files a request with a case/ticket ID, a stated purpose (forensic investigation), justification, branch, range, and the minimum fields needed (data minimisation: unmasked IP and username only if both are needed).
2. An approver (OQ-10) different from the requester approves or rejects; four-eyes rule. Requester and approver must both hold a current role.
3. Approval is time-boxed (assumed 72 hours) and single-use.
4. The unmasked file is delivered only to the requester over TLS through the authenticated platform download (no e-mail or chat attachment), encrypted at rest, with a watermark column `export_id`. It expires after the first download or 7 days, whichever comes first (section 6).
5. Every step (request, approval/rejection, generation, download, deletion) is audited with ticket ID, requester, approver, purpose and timestamps, but without personal data values.
6. Approval authority, legal basis and secure delivery channel must be confirmed by the bank before enabling (OQ-10, OQ-14).

## 6. Retention

Three separate objects with separate rules (all values are assumptions until confirmed, OQ-5, OQ-9):

| Object | Contains personal data? | Rule (assumed) |
|--------|-------------------------|----------------|
| Source log | Yes (full IP, username) | Event timestamp + 12 months, then hard delete (or irreversible anonymisation if the customer chooses, OQ-9). Deleted by a scheduled job, which is itself audited. |
| Export file (masked) | Yes (pseudonymised) | Stored on platform for 30 days after generation, then hard deleted. "Kept forever" is NOT implemented, because it conflicts with the 12-month deletion rule. Within the 12-month window, a user may regenerate an export from source logs. The 30-day file never outlives the 12-month source-log limit: file expiry = min(generation + 30 days, source event time + 12 months), enforced by a scheduled deletion job that also deletes files containing events that have just reached 12 months. |
| Export file (forensic, unmasked) | Yes | Deleted after first download or 7 days, whichever first, and in any case not later than source log retention. Exists only if OQ-1/OQ-10 enable the forensic flow. |
| Backups / replicas of the above | Yes | Expire with the backup cycle (assumed 35 days, OQ-9); restored data is re-purged by the retention job. |
| Export audit record | Metadata only: opaque internal requester ID, branch, range, row count, masking mode, key version, timestamps, outcome. Never IP, username, file content or the pseudonym mapping. | Kept for the audit period required by the bank (assumed 5 years, OQ-5). Because it holds no IP/username values, it can outlive the 12-month rule. The opaque requester ID identifies a staff member and may itself be personal data; OQ-14 asks the bank to confirm this is acceptable. |

"Audit forever" is reinterpreted as: the audit of the action is kept long term; the personal data is not.

## 7. Non-functional requirements

**NFR-1 Performance.** Time from click to first byte of the download (synchronous path), measured server-side at p95, is at most 5 seconds for up to 50,000 rows on the reference load (assumed: 20 concurrent users, platform in normal operation). Above the threshold, the job must be accepted and acknowledged to the user within 2 seconds, and the file is delivered asynchronously; the 5-second target does not apply to the file completion. Asynchronous target (assumed): up to 1,000,000 rows in 10 minutes. These figures are not derived from measured data and need a benchmark on production-like volume.

**NFR-2 Audit of the export action.** Every export attempt (success, failure, denied, empty, download) writes an immutable audit record with: exportId, opaque requester ID, delegator if any, branch, range, mode (masked/forensic), row count, status, key version, UTC timestamp, outcome. The record holds no IP address, username or exported content. Records are append-only (tamper-evidence level per the bank's standard, OQ-14).

**NFR-3 Security.** Server-side authorization on each call (request and download), including rate and size limits; masking cannot be bypassed by parameters; HMAC key is not exposed to application logs; files are encrypted at rest.

**NFR-4 Availability.** Export being unavailable must not affect log ingestion or search. Target: 99.5% monthly for the export function (assumption).

**NFR-5 Simplicity of use.** A manager reaches a downloadable masked file in at most 3 interactions (click button, confirm default range, download). Simplicity never overrides masking, authorization, or audit (OQ-11).

**NFR-6 Localisation.** UI messages in Vietnamese and English; dates in the file in ISO 8601.

## 8. Acceptance criteria

**FR-1**
- Given a user with BRANCH_MANAGER role, when the access-log view opens, then the "Log Export" button is visible.
- Given a user without the role, when they call the export API, then the response is 403 and an audit record "denied" is written.

**FR-2**
- Given a manager of branches A and B, when they click export, then they must pick A or B and only A and B are offered.
- Given a manager of one branch, when they click export, then the branch is preselected.

**FR-3**
- Given today is 2026-11-03 (Asia/Ho_Chi_Minh), when the dialog opens, then the range is 2026-10-01T00:00:00+07:00 to 2026-10-31T23:59:59.999+07:00.
- Given an event at 2026-10-31T23:30:00+07:00 (2026-10-31T16:30:00Z), when exporting the default range, then it is included; given an event at 2026-11-01T00:00:01+07:00, then it is excluded.
- Given a range of 40 days, when submitted, then it is rejected with a validation message.

**FR-4**
- Given a manager of branch A, when exporting, then no row of a user whose HR branch is B appears.
- Given the manager requests a branch they do not manage by editing the request, then the response is 403.

**FR-5**
- Given a successful export, when the file is opened, then it starts with bytes EF BB BF, uses commas and CRLF, has the header columns in the order in FR-5, and all timestamps match ISO 8601 with +07:00.
- Given a resource value containing a comma, quote or newline, then it is quoted and escaped so a standard CSV parser round-trips it.

**FR-6**
- Given a cell value `=HYPERLINK("http://x","y")`, when exported, then the cell content begins with `'`.
- Given values starting with `+`, `-`, `@`, TAB, then each begins with `'`.

**FR-7**
- Given any branch manager export, when the file is scanned, then no value matches a full IPv4 with non-zero last octet, no IPv6 beyond /48, and no raw username from the source set.
- Given an API request containing `masked=false`, then it is ignored or rejected and the output remains masked.

**FR-8**
- Given a request estimated at 10,000 rows, when submitted, then the file is returned in the same response.
- Given a request estimated at 200,000 rows, when submitted, then a job id is returned in under 2 seconds, status moves queued, running, ready, and the user is notified in-app.

**FR-9**
- Given a ready file, when another user opens the link, then access is denied.
- Given a link older than 24 hours, then the response is 410 Gone.
- Given a delegation that expired, when the delegate tries to download, then access is denied.

**FR-10**
- Given a range with no events, when exporting, then no file is created, the user sees a message, and an audit record with row count 0 exists.

**FR-11**
- Given a result above 1,000,000 rows, then the request is refused with a message to narrow the range.
- Given a user with 3 running jobs, when starting a fourth, then it is refused.

**FR-12**
- Given the forensic feature flag is off, when anyone calls the forensic endpoint, then the response is 404/disabled.
- Given the flag is on, when the requester is also the approver, then approval is refused.
- Given an approval older than 72 hours or already used, then the download is refused.

**NFR-1**
- Given a dataset of 50,000 matching rows, when 20 users export concurrently, then p95 time to first byte is at most 5 s (benchmark script and result stored with the test report).
- Given 1,000,000 rows, then the job acknowledgement is under 2 s and the file is ready within 10 min.

**NFR-2**
- Given any export outcome (success, failure, denied, empty, download), then exactly one audit record per event exists with the fields listed in NFR-2.
- Given an attempt to update or delete an audit record through the application, then it is rejected.

**NFR-3**
- Given a penetration test of the export API, then masking can't be disabled by manipulating parameters and the HMAC key never appears in logs or responses.

**NFR-4**
- Given the export service is stopped, when users search logs, then search and ingestion continue to work.

**NFR-5**
- Given a usability test with a branch manager, when asked to export last month, then the file is downloaded in at most 3 interactions with default settings.

**NFR-6**
- Given the user language is Vietnamese, then labels and errors are in Vietnamese with correct diacritics, and the CSV remains readable in Excel.

**Retention (section 6)**
- Given a source log with event time older than 12 months plus one day, when the retention job runs, then it no longer exists (or is irreversibly anonymised per OQ-9) and the job run is audited.
- Given a masked export older than 30 days, then the file is deleted and its audit record remains.
- Given an audit record, then it contains no IP, username, pseudonym or file content.
- Given a masked file whose newest event reaches 12 months of age before day 30, then the file is deleted at that moment, not at day 30.
- Given a restore from backup older than the retention limits, then the retention job removes expired personal data before the data is served.

**Data protection (sections 5.2, 5.4)**
- Given a `resource` value containing a full IP, an e-mail address or a query string, then the exported cell contains none of them.
- Given the forensic flag is on and a request without ticket ID or purpose, then it is refused; given approval by the requester, then it is refused.
- Given a forensic file downloaded once or older than 7 days, then it is deleted and further download fails.
- Given a manager requests more than 20 exports in a day, then the 21st returns 429.

## Open questions and assumptions

Until the customer answers, build as if every assumption below holds. All assumptions follow the safe direction: mask by default, no unmasked export.

**OQ-1 — Full IP/username vs. no unmasked personal data (point a).**
- Question: The brief demands full client IP and username and also forbids unmasked personal data. Which wins? Does the bank's legal/DPO confirm that IP and username are personal data under Decree 13/2023/ND-CP?
- Reason: direct contradiction (C1). IP address and username identifying a person are treated as personal data.
- Assumption: Both are personal data. Standard export is masked (IP /24 or /48, username HMAC pseudonym). No unmasked export is built or enabled.
- Impact if wrong: If the bank truly needs full values for all managers, the masking layer and the forensic flow must be reworked, and a legal basis and DPO sign-off are needed. If the bank says they are not personal data, masking could be dropped, but we would still keep it as defence in depth.

**OQ-2 — "Everything they can see" vs. "their team's logs" (point b), and team source.**
- Question: Is the scope the manager's team (as HR/AD defines it) or all logs the user may view in the platform? Is the team taken from HR or from AD? How are multi-branch managers and delegates handled?
- Reason: conflict C2; team source undefined.
- Assumption: Scope = branch team from HR primary branch code; one branch per export; delegation honoured only when active; nothing beyond team scope.
- Impact if wrong: Different authorization query and possibly a larger data volume; wider scope would increase privacy risk and require new approval.

**OQ-3 — Meaning of "last month" and timezone (point c).**
- Question: Previous calendar month or rolling 30 days? Which timezone?
- Reason: ambiguous wording.
- Assumption: Previous calendar month, Asia/Ho_Chi_Minh (UTC+7); filter on event time; user may adjust within 12 months, maximum 31 days.
- Impact if wrong: Row boundaries differ; reconciliation with old system reports may fail; filter default and tests change.

**OQ-4 — Which volume the 5 seconds applies to; async allowed? (point d).**
- Question: What is the expected maximum row count for a team-month? Is the 5 s a hard limit on file completion, or may large exports run as async jobs with notification?
- Reason: C4, volume unknown (no measured data).
- Assumption: 5 s p95 time to first byte up to 50,000 rows; above that an async job is started, acknowledged in under 2 s. Numbers are unverified.
- Impact if wrong: If the 5 s must hold for all volumes, we would need pre-aggregated or pre-computed exports (more storage, more cost) or hard row caps that truncate data.

**OQ-5 — Export files kept forever vs. delete personal data after 12 months (point e).**
- Question: Which rule prevails for exported files? Which audit period applies to the record of the action?
- Reason: C3; files contain personal data even after pseudonymisation.
- Assumption: Masked files kept 30 days, then deleted; source logs deleted at 12 months; audit record of the action (no personal data) kept 5 years. Nothing stored "forever".
- Impact if wrong: If files must be kept forever, they must be fully anonymised (no stable pseudonym, coarser IP) or the 12-month rule needs a legal exception; storage and compliance cost grow.

**OQ-6 — "Like the old system": columns, order, encoding, delimiter (point f).**
- Question: Please provide a sample file (with fake data) or the specification of the old export: column names, order, encoding, delimiter, line endings, date format.
- Reason: no legacy system or sample is available; legacy details are not verified.
- Assumption: Columns in FR-5, UTF-8 with BOM, comma, CRLF, ISO 8601 with +07:00.
- Impact if wrong: Downstream tools or macros that read the old file may break; changing column order and format is a small but breaking change.

**OQ-7 — Which "access logs" (point g).**
- Question: Which log types are in scope: application login/access, VPN, door/physical access, database access, others?
- Reason: "access logs" is generic.
- Assumption: Application authentication and access events of the platform's monitored systems only (field `log_source` identifies the source); no door or VPN logs.
- Impact if wrong: Different schemas, joins and volume; physical access logs may bring additional personal data (e.g. staff ID cards).

**OQ-8 — Stored on the platform or download only; who can view again (point h).**
- Question: Is the generated file stored on the platform (so it can be re-downloaded) or streamed once? Who may view it again: the requester, the delegate, auditors, security?
- Reason: "kept forever for audit" implies storage, but the access model is not stated.
- Assumption: Stored encrypted for 30 days; re-download only by the requester or an active delegate via a 24-hour authenticated link; auditors see audit records, not files.
- Impact if wrong: If download-only, we drop storage and simplify retention; if auditors need the files, a new role and access logging are required.

**OQ-9 — 12-month clock and deletion method (point i).**
- Question: Is the 12 months counted from event time or from ingest time? Is data hard deleted or anonymised?
- Reason: not stated; changes both timing and legal outcome.
- Assumption: Counted from event time; hard delete of personal fields (and the row); backups expire within an agreed period (assumed 35 days) and are listed in the deletion procedure.
- Impact if wrong: Ingest-time counting retains late-arriving events longer; anonymisation requires proof that re-identification is not possible, which is harder.

**OQ-10 — Who approves an unmasked forensic export (point j).**
- Question: Is an unmasked forensic export needed at all? If yes, who approves (security officer, DPO, compliance head), what legal basis applies, and what SLA?
- Reason: forensic use is the only stated reason for full values, but no process is given.
- Assumption: Not needed until confirmed; the flow in 5.4 is specified but disabled. Approver would be a role distinct from the requester (four-eyes).
- Impact if wrong: If approval must be faster or by different roles, workflow and role mapping change; if forensic access is needed immediately, the bank must provide an interim manual process outside this feature.

**OQ-11 — Meaning of "Make it simple" and priority in conflicts (point k).**
- Question: Does "simple" mean a one-click UI, minimal configuration, or minimal implementation? In a conflict, which ranks higher: simplicity, compliance (masking, retention), or delivery speed?
- Reason: C5; the term is subjective.
- Assumption: Simple = few UI steps with safe defaults (NFR-5). Priority order: data protection and legal compliance, then audit, then performance, then simplicity.
- Impact if wrong: If simplicity must win, we would drop things like branch selector, async jobs, or limits, which raises privacy and reliability risk.

**OQ-12 — Export of non-last-month ranges and maximum size.**
- Question: Are these caps acceptable: ranges at 31 days and 1,000,000 rows, and to allow only one branch per export?
- Reason: the brief says only "last month"; limits are needed to keep the 5 s/async design feasible.
- Assumption: Caps as in FR-3 and FR-11, including 3 concurrent jobs and 20 exports per user per day.
- Impact if wrong: Managers may need several exports; limits can be raised after benchmarking.

**OQ-14 — Audit identity, tamper-evidence and secure delivery.**
- Question: May the 5-year audit record keep an opaque internal requester ID (a staff identifier)? What tamper-evidence level does the bank require (append-only table, WORM storage, external SIEM)? What is the approved secure channel for any forensic file?
- Reason: even metadata can identify staff; the brief does not state audit standards.
- Assumption: Opaque internal ID only; append-only store with restricted write access; forensic delivery only via the authenticated platform download over TLS.
- Impact if wrong: A different identifier scheme, storage type or delivery channel; no change to the masking rules.

**OQ-13 — Authentication and HMAC key custody.**
- Question: Which identity provider and key management system does the bank use? Who owns key rotation?
- Reason: not specified; needed for role lookup and pseudonymisation.
- Assumption: Existing bank SSO supplies roles; keys live in the bank's KMS/HSM, rotated yearly, owned by the security team.
- Impact if wrong: Integration effort changes; with no KMS available, pseudonymisation would need an alternative key store.

### Security review notes

Review of sections 5, 6, NFR-2/3, Open questions (design gate, not a release gate). Changes made:
- 5.2: documented why keyed HMAC is required (plain hash is reversible by dictionary), why /24 is accepted and still personal data; added redaction of free-text columns (`resource`), a previously unaddressed leak path.
- 5.1: legal basis worded at the level of Decree 13/2023/ND-CP only, no articles cited; needs legal/DPO confirmation.
- 5.4: forensic flow is now the only unmasked path, off by default, behind OQ-1/OQ-10/OQ-14; added purpose, minimum fields, secure channel, first-download/7-day expiry and audit of each step.
- 6: removed the contradiction with 5.3/NFR-2 (audit record previously included a masked requester IP; now metadata only, no pseudonym or IP); added file expiry capped by the 12-month source limit and backup handling; added forensic row dependency on OQ.
- Access control: server-side checks on download, per-user daily limit (20) and 429 behaviour (FR-9, FR-11, NFR-3, OQ-12).
- Acceptance criteria added for retention timing, redaction, forensic gating and rate limit; OQ-14 added.
- Kept as is, not added: no DPIA process, DLP tooling or extra approval layers in the standard flow (proportionate to an internal-classified, masked-by-default feature). The 5-year audit period, 30-day file period, 20/day limit and 35-day backup are unverified assumptions.
