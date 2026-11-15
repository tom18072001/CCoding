# Log Export — Implementation Specification

Status: DRAFT v0.1 (pending customer confirmation of the items in "Open questions and assumptions")
Data classification of this document: internal. All example data is fictitious (IPs from RFC 5737 documentation ranges, e.g. 192.0.2.x; usernames are invented).

## 1. Purpose and scope

### 1.1 Purpose
Give branch managers of a Vietnamese bank a self-service "Log Export" button on the log platform to download their team's access logs for the previous month as a CSV file, similar to the legacy system, **without personal data leaving the platform unmasked**.

### 1.2 In scope (MVP)
- "Log Export" button, period selection, CSV generation, download.
- Masked export (default and only mode in MVP) of access logs.
- Scope limited by the requester's team and by the requester's existing view permissions.
- Synchronous export under a row threshold; asynchronous export above it.
- Audit logging of every export action; time-limited storage of export files.

### 1.3 Out of scope (MVP)
- Unmasked (full IP / real username) export for forensics. Treated as a separate, approved process (see OQ-1); not built until the customer confirms.
- Exports of non-access logs (application, system, transaction logs).
- Scheduled/recurring exports, e-mail delivery, API export.
- Migration of historical files from the legacy system.
- Changing how logs are collected or how the organisation tree is maintained.
- No technology stack is assumed; none exists in the repository.

## 2. Actors and permissions

| Actor | Description | Permission (assumed) |
|---|---|---|
| Branch Manager (BM) | Manages one or more teams | May export masked access logs of events within their team(s) AND within what they can already view. |
| Other platform users | Analysts, auditors, etc. | No export in MVP (OQ-8). |
| Forensic/Security Investigator | Needs full IP and username | Out of MVP; separate approved process (OQ-1). |
| Auditor | Reviews export audit records | Read-only access to export audit metadata. |
| Platform Admin | Operates platform | Configures thresholds/retention; cannot read export contents by role alone. |

Permission rule: exportable set = (events of the requester's team members) ∩ (events the requester may view in the platform). The export never exceeds the on-screen view permission.

## 3. User stories and acceptance criteria

**US-1 Export last month (masked).** As a branch manager, I want to export my team's access logs for last month as CSV, so that I can review team activity without raising a ticket.
- Given a BM with a team and view permission, When they click "Log Export" and confirm the default period, Then a CSV with only their team's events from the previous calendar month (Asia/Ho_Chi_Minh) is delivered and every row has masked IP and pseudonymised username.
- Given a BM, When the export finishes, Then exactly one audit record exists for it (NFR-3).

**US-2 No leakage of unmasked data.** As a data-protection officer, I want exports to be masked by default, so that personal data does not leave the platform unmasked.
- Given any export, When the file is inspected, Then no IPv4 has a non-zero last octet, no IPv6 has bits beyond /48 non-zero, and no raw username appears in any column.

**US-3 Scope safety.** As a security officer, I want the export limited to what the user can see, so that export is not a privilege escalation path.
- Given a BM who can view events of teams A and B but manages only team A, When they export, Then only team A events appear (OQ-2).
- Given a user without a team, When they open the page, Then the button is hidden/disabled and a direct request returns 403.

**US-4 Large exports.** As a BM, I want large exports not to time out, so that I still get my file.
- Given the result exceeds the row threshold, When I request export, Then I see "export is being prepared", and get an in-platform notification with a download link when ready.

**US-5 Expiry.** As a compliance officer, I want export files to expire, so that personal data is not retained beyond policy.
- Given an export file whose expiry has passed, When anyone requests it, Then it is not downloadable and the stored file is deleted within 24 h of expiry.

## 4. Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1 | **Button**: "Log Export" is shown only to users with the export permission and at least one team. | Given a user with the permission, the button is visible; without it, hidden and the endpoint returns 403 (tested for both). |
| FR-2 | **Period filter**: default = previous calendar month, from 00:00:00.000 on day 1 to 23:59:59.999 on the last day, Asia/Ho_Chi_Minh (UTC+7). User may pick a custom range within the last 12 months, max span 31 days (OQ-6). | Given today is 2026-11-03, default range is 2026-10-01T00:00+07:00 to 2026-10-31T23:59:59.999+07:00; events at both boundaries are included, events 1 ms outside are excluded. Ranges > 31 days or older than 12 months are rejected with ERR-2. |
| FR-3 | **Data scope**: rows = access-log events where actor ∈ requester's team(s) AND requester has view permission for the event. | Test with team A/B fixtures: zero rows from outside scope; row count equals the count shown by the on-screen view under the same filter. |
| FR-4 | **Team resolution**: team membership comes from the organisation hierarchy as of the event time if available, else current membership (OQ-7). Includes direct members only (no sub-teams) unless confirmed. | Fixture with a member moved teams: result matches the chosen rule; documented in the file's footer metadata (not in data rows). |
| FR-5 | **CSV format**: UTF-8 with BOM (EF BB BF), delimiter `,` (OQ-5), quoting per RFC 4180, CRLF line endings, one header row, timestamps in ISO 8601 with offset `+07:00`. Every text cell whose first character is `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'` (applies to all string columns, including pseudonym and `resource`; not to numeric/timestamp columns) to prevent CSV/formula injection. | A file parser (RFC 4180) reads it back with the same row count; first 3 bytes are EF BB BF; cell values `=1+1`, `@SUM(A1)`, `-2+3` and `\t=1` in `resource` are stored with the `'` prefix; Excel opens Vietnamese text without garbling (manual check). |
| FR-6 | **Columns** (assumed; legacy columns unconfirmed, OQ-4): `event_id`, `timestamp` (Asia/Ho_Chi_Minh), `user_pseudonym`, `client_ip_masked`, `action`, `resource`, `result` (success/failure), `team_id`. | Header equals this list in this order; each column has no empty value except where the source has none. |
| FR-7 | **File name**: `log-export_<teamId>_<YYYYMM or YYYYMMDD-YYYYMMDD>_<exportId>.csv`, ASCII only, no username/IP inside. | Regex `^log-export_[A-Za-z0-9-]+_\d{6}(\d{2}-\d{8})?_[A-Za-z0-9-]+\.csv$` matches; no personal data in the name. |
| FR-8 | **Sync/async**: if estimated rows ≤ threshold (default 50,000, configurable) generate synchronously; otherwise create an async job and notify in-platform on completion. | 50,000-row fixture returns directly; 50,001-row fixture returns job id and later a notification. Threshold changeable without redeploy. |
| FR-9 | **Download**: file available only to the requester (and no one else) until expiry (OQ-9). Download requires an authenticated session; the server checks `requester == file owner` on every request (no reliance on the link alone). `exportId` is a random, non-sequential identifier (≥ 128 bits). Download links are short-lived (default 15 min, re-issued on demand while the file is valid). | A second user, even with the URL or a guessed/incremented ID, gets the same response as for a non-existent file (404); requester succeeds before expiry and gets 410 after; a link older than 15 min is refused. |
| FR-10 | **Empty result**: produce a CSV with only the header and show "no events for this period". | Zero-row fixture gives header-only file and the message. |

## 5. Data handling and masking

- **Data categories**: access-log events contain client IP and username (personal data in the banking context; legal basis to be confirmed, OQ-11). Purpose: managerial review of team access. Accessors: requester only; auditors see metadata only.
- **Masking rules (default, mandatory in MVP)**:
  - IPv4 → truncate to /24 (last octet set to 0), e.g. `192.0.2.57` → `192.0.2.0`.
  - IPv6 → truncate to /48, e.g. `2001:db8:abcd:12::5` → `2001:db8:abcd::`.
  - Username → pseudonym `u_` + first 12 hex chars of HMAC-SHA-256(key, username). Key is a secret held in a key store/HSM (never in the file, the repo or logs), at least 256 bits. A plain or unsalted hash is forbidden: usernames are guessable and a dictionary would reverse it. Default: per-export key derived from a master key and `exportId` (pseudonyms not comparable across exports, no per-export key list to store); alternative: platform-wide key (comparable, but allows linking a person across files) (OQ-1). Rotating or destroying the master key is the revocation path.
  - Masked is not anonymous: truncated IPs and pseudonyms remain personal data and the files are handled as such (access control, encryption, retention in section 6). Whether /24 and /48 satisfy the customer's policy is open (OQ-1).
  - Acceptance: masking is done server-side before writing; unit tests over IPv4/IPv6 edge cases (IPv4-mapped IPv6, `::`, malformed values → ERR-5 or the value is blanked, never emitted raw).
- **No re-identification column**: the file must not contain a mapping from pseudonym to username. Re-identification, if ever needed, goes through the approved forensic process.
- **Free-text fields** (`resource`, e.g. URL paths with query strings) may contain usernames/IPs: query strings are stripped or scanned and masked. Acceptance: fixture with `?user=alice&ip=192.0.2.57` yields no raw values.
- **File path**: generated server-side into restricted, encrypted-at-rest storage (no world-readable temp dir; temp/partial files deleted on completion or failure, ERR-6); served only over HTTPS with `Content-Disposition: attachment` and `Cache-Control: no-store`; no copy to email or third-party services. Files are access-controlled per requester (FR-9). Application logs and error messages must not contain row content, IPs or usernames.
- **Unmasked export**: not available in MVP. Any future version requires distinct role, approval, justification, and audit (OQ-1).

## 6. Retention

Two different things are retained, and the brief conflates them (OQ-3):
1. **Export audit metadata** (who, when, scope, row count, file hash, status; no personal data of data subjects): kept indefinitely. Requester ID is an internal employee ID; confirm employee data retention (OQ-3).
2. **Export files** (contain pseudonymised/masked personal data): auto-expire after at most 30 days from creation (assumed default; configurable) and in all cases no later than 12 months after the timestamp of the oldest event in the file. The earlier date wins.

Acceptance:
- A job runs at least daily; a file past expiry is deleted from primary storage within 24 h and the audit record is updated to `deleted`. Backups: export files are excluded from backup where possible; otherwise copies age out with the backup cycle, so effective deletion = expiry + backup cycle (length to be confirmed, OQ-3, OQ-14). The 12-month rule applies to backups too.
- Copies already downloaded by the requester are outside platform control; the download page states that the file is personal data and must be deleted per policy (OQ-9).
- Given a file whose oldest event is 12 months old today, it is deleted in the next run regardless of creation date.
- Audit metadata rows are never deleted by this job and contain no IP/username of data subjects (checked by schema review and a test scanning the table for IP/username patterns).
- Source log retention (platform deletes personal data older than 12 months) is a platform requirement outside this feature; export must not resurrect deleted data (it reads only live data).

## 7. Non-functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| NFR-1 | **Performance**: synchronous exports (≤ threshold rows) complete in ≤ 5 s at p95 measured server-side from request to first byte of complete file, under 10 concurrent exporters. Async exports: ≥ 95 % complete within 5 min for up to 5 million rows (assumption; volume unknown, OQ-10). | Load test with 50,000 rows, 10 concurrent users: p95 ≤ 5 s over ≥ 200 runs. Async test with 5 M-row dataset records completion time. |
| NFR-2 | **Size limits**: max 5,000,000 rows and 1 GiB per file; beyond that the request is rejected with ERR-3 asking to narrow the range. | 5,000,001-row fixture is rejected, with no partial file stored. |
| NFR-3 | **Audit of the export action**: every request (success, failure, denied) writes an immutable audit record: exportId, requester ID, team(s), period, filter, row count, masking mode, file SHA-256, start/end time, status, expiry, downloads (who/when). The record holds only IDs and fixed enumerated filter values: no data-subject IP or username, no free-text filter, no requester IP (OQ-3). | One record per outcome; a test attempts update/delete by an application role and fails; denied attempts are recorded; a test scanning the audit store for IP/username patterns finds none. |
| NFR-4 | **Security**: authentication via the platform's existing mechanism; authorisation checked server-side on every request and download; per-user rate limit of 5 exports/hour (configurable). | 6th request in an hour returns 429; tampered team ID is rejected with 403. |
| NFR-5 | **Availability/Resource safety**: exports must not degrade log search; async jobs run with bounded concurrency (default 4). | During a load run search p95 degrades ≤ 10 % versus baseline. |
| NFR-6 | **Simplicity of UX**: BM completes the default export in ≤ 3 clicks with no mandatory form fields. | Usability check with 3 users: default export done in ≤ 3 clicks. |
| NFR-7 | **Observability**: metrics for export count, latency, failures, expiry deletions; alerts on deletion job failure. | Metrics visible; killing the deletion job triggers an alert within 1 h. |

## 8. Error states

| Code | Condition | Behaviour |
|---|---|---|
| ERR-1 | User lacks permission/team | 403, message "You are not allowed to export logs"; audited. |
| ERR-2 | Invalid period (span > 31 d, older than 12 months, future, start > end) | 400 with the reason; nothing generated. |
| ERR-3 | Result exceeds size limit (NFR-2) | 422 asking to narrow the range. |
| ERR-4 | Sync generation exceeds 5 s | Automatically switch to async with notice; no error to the user. |
| ERR-5 | Masking failure (unparseable IP, missing key) | Fail closed: no file produced, error "Export failed", audited, alert raised. Never emit raw value. |
| ERR-6 | Async job fails | In-platform notification with reference ID; may retry; no partial file kept. |
| ERR-7 | File expired/deleted | 410 Gone with message to re-export. |
| ERR-8 | Rate limit exceeded | 429 with retry-after. |
| ERR-9 | Source data unavailable | 503; audited. |
| ERR-10 | Empty result | Not an error; see FR-10. |

## Open questions and assumptions

Each item: question, why it is a problem (verbatim from the brief), assumption in the meantime, impact if the assumption is wrong. Section 1–8 follow these assumptions.

### OQ-1 Full IP/username vs. masking (contradiction a)
- **Question**: Which prevails — full IP and username for forensics, or masking? Is a separate approved forensic process wanted, with which roles and approvers?
- **Why a problem**: "Exports must contain full client IP addresses and usernames for forensic use" vs. "no personal data may leave the platform unmasked".
- **Assumption**: Export is masked by default (IPv4 /24, IPv6 /48, username as keyed-HMAC pseudonym, per-export derived key); masked data is still treated as personal data. Unmasked export is a separate, approved, audited process with its own role, out of MVP.
- **Impact if wrong**: If the customer needs unmasked data in the BM button, a role/approval workflow, extra controls and a policy exception are needed; the masking design and columns change (rework of FR-6, section 5). Forensic users cannot use the MVP.

### OQ-2 "Team's logs of last month" vs. "everything they can see" (contradiction b)
- **Question**: Is the export limited to the team and last month, or to the user's whole view permission and any period?
- **Why**: "export their team's access logs from last month" vs. "Users should be able to export everything they can see".
- **Assumption**: Scope = intersection of the user's team and the user's view permission; period default last month, custom range ≤ 31 days within 12 months.
- **Impact if wrong**: If "everything they can see" wins, volume grows, NFR-1/NFR-2 and authorisation testing widen, and risk of bulk leakage rises.

### OQ-3 Retain files forever vs. delete personal data older than 12 months (contradiction d)
- **Question**: What exactly is kept forever (files or records)? Is a legal-hold/audit exception to the 12-month deletion approved? Backup retention? Is the requester's employee ID in audit records acceptable indefinitely?
- **Why**: "Exported files are kept forever for audit, and the platform must delete personal data older than 12 months."
- **Assumption**: Only audit metadata (no data-subject personal data) is kept forever. Export files expire in ≤ 30 days and never later than 12 months after the oldest event in the file.
- **Impact if wrong**: If the files themselves must be kept, a policy exception, archive with restricted access, and legal sign-off are required and section 6 changes.

### OQ-4 "Like the old system" (e)
- **Question**: Provide a sample file and column list from the old system. Which fields are mandatory? Same column order, header language, delimiter?
- **Why**: "export ... as CSV like the old system" — no definition.
- **Assumption**: Columns as in FR-6, English headers, comma delimiter.
- **Impact if wrong**: Downstream consumers or macros of the old files break; rework of FR-5/FR-6 and possible re-masking of extra fields.

### OQ-5 CSV conventions
- **Question**: Delimiter `,` or `;` (Vietnamese Excel locales often use `;`)? Is BOM required for their Excel?
- **Why**: Brief says only "CSV".
- **Assumption**: UTF-8 with BOM, comma, RFC 4180 quoting.
- **Impact if wrong**: Files open as a single column or garbled in Excel; small change.

### OQ-6 Meaning of "last month" (f)
- **Question**: Previous calendar month or last 30 days? Which time zone? Can users choose other ranges?
- **Why**: "access logs from last month".
- **Assumption**: Previous calendar month in Asia/Ho_Chi_Minh (UTC+7); custom ranges ≤ 31 days, ≤ 12 months back.
- **Impact if wrong**: Wrong date window in the file; audit disputes about boundary events.

### OQ-7 Definition of "team" and source of the organisation tree (g)
- **Question**: What is a team (branch, department, reporting line)? Which system is the source of truth (HR, AD/LDAP, platform)? Are sub-teams included? Historic or current membership? A manager of several teams?
- **Why**: "their team's access logs" — team is undefined, and the repository has no organisation data.
- **Assumption**: Team = direct reports of the BM from the platform's organisation data; membership as of event time if available else current; sub-teams excluded. Source system: not verified.
- **Impact if wrong**: Wrong people's logs exported (privacy breach) or missing data; integration work with the org source.

### OQ-8 Who may export; approval for "self-service" (h)
- **Question**: Besides branch managers, which roles (deputy, auditors, security)? Does self-service require approval (e.g. second-person) for any export?
- **Why**: "self-service ... Branch managers can export" vs. a bank's control requirements.
- **Assumption**: Only branch managers with the export permission; no pre-approval for masked exports; every export is audited and reviewable.
- **Impact if wrong**: Missing approval workflow (control gap) or extra roles to model; permission matrix changes.

### OQ-9 Where files are stored and who may re-download (i)
- **Question**: Storage location (platform storage, file share, user's laptop only)? Can the requester re-download until expiry? Can auditors open contents?
- **Why**: "Exported files are kept forever for audit" gives no location or access rule; also files leave the platform when downloaded.
- **Assumption**: Platform object storage, encrypted, accessible only to the requester until expiry; auditors see metadata only. Control of files after download is the customer's responsibility (DLP on endpoints).
- **Impact if wrong**: Storage design, access control and the "does not leave the platform" claim change; downloaded copies may breach policy.

### OQ-10 5 seconds vs. "everything" (c)
- **Question**: Typical and peak number of log rows per team-month? Is 5 s a hard limit for all sizes? Is asynchronous delivery acceptable?
- **Why**: "export everything they can see; the export must complete within 5 seconds" with unknown volume.
- **Assumption**: 5 s at p95 applies to sync exports up to 50,000 rows; larger ones run asynchronously with notification; hard cap 5 M rows / 1 GiB.
- **Impact if wrong**: If volumes are far larger and sync is mandatory, pre-aggregated or indexed storage is required (architecture and cost); if smaller, async can be dropped.

### OQ-11 Applicable legal and regulatory texts (k)
- **Question**: Which laws, regulations and internal policies apply? For example Decree 13/2023/NĐ-CP on personal data protection and the State Bank of Vietnam's information-security regulations — please confirm which apply, their relevant requirements for masking, retention, purpose limitation and logging, and the name of the internal "data-protection policy".
- **Why**: "In line with our data-protection policy" — not identified. This spec does not state the content of any provision; this is not verified.
- **Assumption**: The internal policy as paraphrased in the brief governs; masking and retention rules above are conservative; legal review will map them to the actual texts.
- **Impact if wrong**: Compliance gaps (e.g. consent/impact assessment, data localisation, log retention minimums) and rework of sections 5–6.

### OQ-12 "Make it simple" vs. controls (j)
- **Question**: Which takes priority when simplicity conflicts with controls (approval, masking, audit, limits)?
- **Why**: "Make it simple" vs. forensic, masking, retention and audit demands.
- **Assumption**: Simple for the user (one button, sensible defaults, ≤ 3 clicks); controls are non-negotiable and invisible to the user.
- **Impact if wrong**: If controls must be relaxed for simplicity, risk acceptance must be signed off by the customer; if the opposite, the UX needs extra steps.

### OQ-13 Audit access, notification and language
- **Question**: Who reviews export audit records and how long are they queryable? Notification channel (in-platform, e-mail)? UI language (Vietnamese/English)?
- **Why**: Brief mentions audit but not reviewers or channels.
- **Assumption**: Auditor role, in-platform notification, bilingual UI strings (vi/en).
- **Impact if wrong**: Small rework of notification and UI strings.

### OQ-14 Mandatory log retention vs. 12-month deletion
- **Question**: Do any banking or other sector rules require access logs (or their exports) to be kept longer than 12 months, or set a minimum retention? If so, which, and does it override the 12-month deletion for source logs, exports and backups? What is the backup retention cycle? This spec cites no provision; please name the applicable text.
- **Why**: "the platform must delete personal data older than 12 months" may conflict with external retention duties and with "kept forever for audit".
- **Assumption**: 12 months is the maximum for personal data in logs and exports; audit metadata (no data-subject data) is kept indefinitely; backups age out within a cycle assumed ≤ 35 days.
- **Impact if wrong**: Deletion jobs, backup design and the legal-hold exception change (section 6).

### Summary of assumptions to confirm first (priority)
OQ-1, OQ-3, OQ-2, OQ-7, OQ-11, OQ-14 block the design; OQ-10, OQ-4, OQ-8, OQ-9 affect architecture or rework; OQ-5, OQ-6, OQ-12, OQ-13 are low-impact.

## Review notes (security)

- FR-5: formula-injection escape extended to TAB/CR and all text columns, with test cases (the original list missed these starters).
- Section 5: HMAC key requirements (secret, ≥ 256 bits, no unsalted hash, per-export derivation) so pseudonyms cannot be reversed by dictionary; masked data declared still personal data; /24 adequacy added to OQ-1.
- FR-9: owner check on every download, random exportId, short-lived links, uniform 404 to prevent IDOR/enumeration.
- Section 5 file path: encrypted restricted storage, temp cleanup, no-store headers, no personal data in app logs.
- NFR-3: removed requester IP and free-text filters from the audit record so it holds no personal data and can be kept indefinitely; added scan test.
- Section 6: backups and downloaded copies covered, so the 12-month rule is consistent; OQ-14 added for external retention duties (no provision cited, to be confirmed).
- Not added (over-engineering for "make it simple"): approval workflow, DLP, watermarking, HSM-specific design beyond key-store requirement.
