# Log Export — Implementation Specification

Status: DRAFT for customer confirmation. Data classification of this document: internal.
Items marked **[ASSUMPTION]** are not confirmed by the customer and are listed in `## Open questions and assumptions`. All thresholds (N rows, link lifetimes, etc.) are assumptions, not customer figures. No legal citation is made here; legal bases are unverified (see Q11).

## 1. Overview and goal

A Vietnamese bank asked for a self-service "Log Export" button on the log platform so that branch managers can export their team's access logs for last month as CSV, "like the old system". The same brief asks for full client IPs and usernames for forensic use, forbids unmasked personal data leaving the platform, wants "everything they can see" exportable within 5 seconds, wants exported files kept forever, and wants personal data deleted after 12 months.

Several of these statements cannot all be true at once (see `## Open questions and assumptions`). This spec resolves them with a **two-tier design** that keeps the user experience to one button:

- **Tier 1 – Self-service export (branch manager):** masked CSV (IP masked, username pseudonymised).
- **Tier 2 – Full export (investigation / InfoSec role):** unmasked data, only through a request-and-approve flow, with audit, and delivered inside a controlled environment.

Exported files are short-lived; only audit metadata is kept long-term.

## 2. Scope and non-goals

In scope: Export button; last-calendar-month scope; team-scoped authorisation; masked CSV; approved full export; sync/async delivery; file storage and expiry; audit logging of export actions; retention and deletion of export artefacts.

Non-goals ("make it simple"):
- No complex filtering UI (no free-form query builder, no column picker). The only parameter is the fixed period "last month".
- No scheduled or recurring exports.
- No export formats other than CSV.
- No changes to how access logs are ingested or to the platform's existing retention of raw logs (except where Q6/Q11 require confirmation).
- No e-mail delivery of files.
- No legal-hold tooling (see Q6).

## 3. Actors and permissions

| Actor | Role | Can do |
|---|---|---|
| Branch manager | Self-service user | Request Tier 1 masked export for own branch and sub-branches, limited to logs they can currently view. Cannot request or see unmasked data. |
| Investigator / InfoSec | Forensic role **[ASSUMPTION]** (Q7) | Submit a Tier 2 full-export request with ticket/reason. May not approve own request. |
| Approver | A second authorised person, not the requester **[ASSUMPTION]** (Q7) | Approve or reject Tier 2 requests. |
| Platform administrator | Admin | Configure limits (N, link TTL, retention) and manage role assignment. Cannot read export content, cannot edit or delete audit records. |
| Auditor (read-only) | Audit | Read audit metadata. |

## 4. Functional requirements

### FR-1 Log Export button and entitlement
The log view shows a "Log Export" button only to users with the branch-manager (or Investigator) role. One click starts a Tier 1 export of last month for the user's scope; no further parameters are asked.

**Acceptance criteria**
- Given a user with branch-manager role, When they open the log view, Then the Log Export button is visible.
- Given a user without an export role, When they open the log view or call the export API directly, Then the button is absent and the API returns 403 and writes a denied-attempt audit record.

### FR-2 Period: "last month"
The period is the **previous calendar month** relative to the request time, from 00:00:00.000 on day 1 to 23:59:59.999 on the last day, in time zone **Asia/Ho_Chi_Minh (UTC+7)** **[ASSUMPTION]** (Q3). The event timestamp compared is the log event time, not ingestion time.

**Acceptance criteria**
- Given the request is made on 2026-11-03 10:00 (UTC+7), When the export runs, Then only events with event time from 2026-10-01 00:00:00 to 2026-10-31 23:59:59.999 (UTC+7) are included.
- Given an event at 2026-10-31 17:30 UTC (= 2026-11-01 00:30 UTC+7), When exporting in November, Then the event is excluded from the October export and included in the November-month export.
- Given a request on 2027-01-05, When exporting, Then the period is 2026-12-01 to 2026-12-31 (year rollover).

### FR-3 Authorisation scope: team versus "everything they can see"
The exported rows are the **intersection** of (a) logs the requester can currently view on the platform and (b) logs belonging to the requester's branch and its sub-branches in the organisation tree **[ASSUMPTION]** (Q2, Q9). Authorisation is evaluated on the server at request time and again when the file is generated; no scope, user or branch parameter from the client is trusted.

**Acceptance criteria**
- Given manager A of branch X (with sub-branch X1) who can view logs of X, X1 and Y, When A exports, Then rows contain only X and X1.
- Given manager A tampers with the request to add branch Y, When submitted, Then the server ignores or rejects it (403) and Y rows never appear.
- Given A's role is revoked between request and generation, When the job runs, Then the job fails with an audited "authorisation revoked" status and no file is produced.
- Given a manager who is transferred to branch Z, When they export after the org data sync, Then the scope reflects Z, not the old branch.

### FR-4 CSV format ("like the old system")
Until the customer supplies a sample of the old system's export (Q4), use this format **[ASSUMPTION]**:
- Encoding UTF-8 **with BOM** so that Excel displays Vietnamese characters correctly; line endings CRLF; RFC 4180 quoting.
- Delimiter: comma `,`.
- Header row present, English snake_case column names.
- Columns (fixed order) **[ASSUMPTION]**: `event_time` (ISO 8601 with +07:00 offset), `branch_id`, `username` (masked form per FR-5), `client_ip` (masked form per FR-5), `action`, `resource`, `result`, `session_id_hash`.
- File name: `log-export_<branch_id>_<YYYY-MM>_<request_id>.csv`.
- **Formula-injection protection:** any text cell starting with `=`, `+`, `-`, `@`, TAB or CR is prefixed with `'`.

**Acceptance criteria**
- Given a Vietnamese name such as "Nguyễn Văn A" in a resource field, When the file is opened in Excel, Then the characters display correctly (file begins with bytes EF BB BF).
- Given a cell value `=HYPERLINK("http://x")`, When exported, Then the cell is written as `'=HYPERLINK(...)` and a field containing a comma, quote or newline is correctly quoted.
- Given the export, When the header is read, Then columns match the list and order above (to be updated once the legacy sample arrives; any difference found is a change request).

### FR-5 Masking rules (Tier 1)
- **IP:** IPv4 – last octet replaced by `x` (e.g. `203.0.113.x`); IPv6 – truncated to /48 and the remainder shown as `::` **[ASSUMPTION]** (Q1).
- **Username:** replaced by a pseudonym `u_<first 12 hex chars of HMAC-SHA256(key, username)>`, deterministic within a key version so the same user can be correlated across rows and exports. The key is held in KMS/HSM, never in the application config or the file, and rotated under change control. Reverse lookup is possible only by the Investigator role through the Tier 2 flow **[ASSUMPTION]** (Q1).
- Masking happens on the server before the file is written. Unmasked values must never be present in a Tier 1 file, its temp files, or logs of the export job.
- Masking is applied to every column that may contain IP or username (including free-text `resource` fields containing IP patterns) **[ASSUMPTION]**.

**Acceptance criteria**
- Given an event with IP 198.51.100.23 and username "test.user", When a manager exports, Then the file contains `198.51.100.x` and a `u_…` pseudonym, and a text search of the whole file for the original IP and username returns zero hits.
- Given the same username in two rows, When exported, Then both rows carry the identical pseudonym.
- Given the export job's temp storage and application logs, When searched for the original values after the job, Then no hits.
- Given an IPv6 address, When exported, Then only the /48 prefix is shown.

### FR-6 Full (unmasked) export with approval — Tier 2
1. An Investigator submits a request: scope (branch/period, same period rule as FR-2), reason, ticket reference.
2. A different authorised Approver approves or rejects (requester ≠ approver). Pending requests expire after 7 days **[ASSUMPTION]**.
3. On approval the system generates the file; it is not downloadable to an end-user workstation by default but is delivered into the **controlled environment** (e.g. a secured forensic workspace or a view-only viewer on the platform) **[ASSUMPTION]** (Q1, Q7).
4. Every step (request, approval, rejection, generation, each download/view, expiry, deletion) is audited (FR-9).
5. The link is single-use, bound to the approved requester's session, and expires per NFR-4.

**Acceptance criteria**
- Given an Investigator submits a request with no ticket/reason, Then the request is rejected with a validation error.
- Given the requester tries to approve their own request, Then the system refuses and audits the attempt.
- Given an approved request, When the Investigator accesses the file, Then it contains full IP and username and an audit record links requester, approver, ticket, row count and file hash.
- Given a branch manager (no Investigator role), When calling any Tier 2 endpoint, Then 403.
- Given an approved request older than 7 days unused, Then it is expired and cannot be generated.

### FR-7 Synchronous and asynchronous delivery
- If the matching row count is ≤ **N = 100,000 rows [ASSUMPTION – no customer data on volume, Q5]**, the export runs synchronously and the file is offered immediately.
- If > N, the system answers immediately with "Export is being prepared", runs the job in the background, and notifies the user in-platform when ready (in-app notification; the download link is not sent by e-mail).
- Exports are capped at **M = 2,000,000 rows [ASSUMPTION]**; above M the user is told the export is too large and is asked to contact InfoSec (a Tier 2 request).
- A user may have at most 1 running export at a time **[ASSUMPTION]**.

**Acceptance criteria**
- Given ≤ N rows, When requested, Then see NFR-1.
- Given > N rows, When requested, Then the response is returned within 2 seconds with status "pending", and an in-app notification arrives when the file is ready.
- Given > M rows, Then no file is generated and the user sees the "too large" message; the attempt is audited.
- Given a second request while one is running, Then it is rejected with a clear message.

### FR-8 File storage and download link
Files are stored in the bank-internal object storage, encrypted at rest (KMS) and in transit (TLS), in a bucket not publicly accessible **[ASSUMPTION]** (Q10). Download is through a signed, single-use link bound to the requesting user's session, valid **15 minutes [ASSUMPTION]** for Tier 1. Files are deleted per section 6.

**Acceptance criteria**
- Given a valid link, When used by the requester within 15 minutes, Then the download succeeds once; a second use returns 410.
- Given the link is used by another user or after 15 minutes, Then 403/410 and the attempt is audited.
- Given the storage, When inspected, Then objects are encrypted and not publicly readable.

### FR-9 Audit logging of export actions
See section 7.

## 5. Non-functional requirements

### NFR-1 Performance (the 5-second target)
For a synchronous export (≤ N rows), the time from click to file ready is **≤ 5 seconds at p95** under the load profile in Q5 **[ASSUMPTION]**. The 5 seconds does not apply to async exports (> N), where the target is ready within 15 minutes at p95 **[ASSUMPTION]**.

**Acceptance criteria**
- Given a test dataset of N rows on production-like hardware, When 100 sequential exports are run, Then p95 ≤ 5 s.
- Given a dataset of 5×N rows, Then the request returns "pending" within 2 s and the file is ready within 15 minutes.

### NFR-2 Security
- Server-side authorisation on every call (FR-3); least privilege; no real personal data in DEV/UAT.
- Masking keys in KMS/HSM with rotation and access logging.
- Rate limit: max 5 export requests per user per hour **[ASSUMPTION]**.
- Formula-injection protection (FR-4), signed single-use links (FR-8), encryption at rest and in transit.
- Export file hash (SHA-256) computed and stored in the audit record.

**Acceptance criteria**
- Given a security test of broken access control (changing IDs/branch parameters), Then no cross-branch data is returned.
- Given a 6th request in an hour, Then 429 and an audit record.
- Given a static scan of the repository and configuration, Then no keys or secrets are present.
- Given DEV/UAT databases, When sampled, Then they contain only synthetic data.

### NFR-3 Audit integrity
Audit records are append-only (WORM or equivalent), time-synchronised, and not editable or deletable by any role including administrators.

**Acceptance criteria**
- Given an administrator attempts to update or delete an audit record, Then the operation is refused and itself audited.
- Given the audit store, When two records are compared with their chain/hash, Then tampering is detectable.

### NFR-4 Retention and expiry parameters
Configurable, with the defaults in section 6. Changes are audited.

**Acceptance criteria**
- Given the Tier 1 TTL setting is changed, Then new files use the new value and the change is audited with actor and old/new values.

### NFR-5 Availability and usability
The export must not degrade log search: export jobs run on a separate worker pool with a concurrency limit **[ASSUMPTION]**. UI: one button, one status message; no more than 1 click for Tier 1.

**Acceptance criteria**
- Given 20 concurrent exports, Then log search p95 latency does not increase by more than 20% versus baseline **[ASSUMPTION threshold]**.
- Given a branch manager, When exporting, Then a Tier 1 export needs exactly one click and no form fields.

## 6. Data retention and deletion

The brief says exports are "kept forever for audit" and that personal data older than 12 months must be deleted. A file containing IP and username (even masked/pseudonymised, which is still treated as personal data) cannot be both. Working resolution **[ASSUMPTION]** (Q6, Q11):

| Item | Contains personal data | Retention |
|---|---|---|
| Tier 1 export file (masked) | Yes (pseudonymised) | Download link 15 min; file deleted automatically **24 hours** after generation (well within 12 months). |
| Tier 2 export file (unmasked) | Yes | Link/viewing window per ticket, default 24 hours; file deleted automatically after that and in any case no later than 12 months from the log event date. |
| Audit metadata of each export | No raw IP/username (pseudonymous user IDs only) | Kept long-term (period to be set by the customer; see Q6) in append-only storage. |
| Raw logs on the platform | Yes | Deleted when older than 12 months from event time, unless a legal/regulatory minimum retention requires longer (Q11). |

Retention rules:
- "Audit evidence" is satisfied by the audit metadata and the SHA-256 hash of the file, not by retaining the file.
- Deletion jobs run at least daily, and each deletion is audited (object id, hash, time).
- If an investigation needs a file kept, the customer must define a legal-hold process (not in this release).

**Acceptance criteria**
- Given a Tier 1 file generated 24 h + 1 min ago, When the daily cleanup has run, Then the file no longer exists in storage and the audit record shows "deleted" with timestamp.
- Given audit metadata older than 12 months, Then it still exists and contains no raw IP or username.
- Given a raw log event older than 12 months (and no longer-retention rule applies), Then it is deleted and no export artefact contains it beyond the 12-month limit.
- Given a deletion job failure, Then an alert is raised and the failure audited.

## 7. Audit logging of export actions

Every export-related action creates an audit record, including denied and failed attempts.

Audit record schema (immutable):

| Field | Description |
|---|---|
| `audit_id` | Unique id |
| `event_time` | UTC timestamp (displayed UTC+7) |
| `action` | `export_requested`, `export_denied`, `export_started`, `export_completed`, `export_failed`, `approval_requested`, `approved`, `rejected`, `download`, `link_expired`, `file_deleted`, `config_changed` |
| `tier` | 1 or 2 |
| `requester_id` | Internal pseudonymous user id |
| `approver_id` | For Tier 2 |
| `ticket_ref` / `reason` | For Tier 2 |
| `scope` | Branch ids and period (as resolved on the server) |
| `row_count` | Rows exported |
| `file_sha256` | Hash of the generated file |
| `mode` | sync / async |
| `outcome` / `error_code` | Result |
| `source_ip_hash` | Pseudonymised IP of the requesting client |

The audit record must not contain unmasked IPs, usernames, or file contents.

**Acceptance criteria**
- Given any successful Tier 1 export, Then exactly one `export_requested`, one `export_completed` and ≥ 1 `download` record exist with the fields above filled.
- Given a failed or denied export, Then a record with `outcome` and `error_code` exists.
- Given the audit store is searched for raw IPs/usernames of exported rows, Then there are no hits.
- Given a Tier 2 export, Then the audit chain shows requester, approver, ticket and file hash.

## 8. Traceability (summary)

| Brief statement | Addressed by |
|---|---|
| Self-service Log Export button | FR-1 |
| Branch managers, team's logs | FR-3 |
| Last month | FR-2 |
| CSV like the old system | FR-4 |
| Full IP and username for forensics | FR-6 |
| No unmasked personal data leaving the platform | FR-5, FR-6, FR-8 |
| Export everything they can see | FR-3, FR-7 |
| Complete within 5 seconds | NFR-1, FR-7 |
| Kept forever / delete after 12 months | Section 6, section 7 |
| Make it simple | Section 2, FR-1, NFR-5 |

## Open questions and assumptions

The following must be confirmed with the customer before building. Each has a working assumption used in this spec until the customer answers.

### Q1. Full IP/username vs. masking
- **Question:** What does "leave the platform" mean (download to a workstation, leave the bank network, leave the log platform's UI)? Does forensic analysis run inside or outside the platform? Which IP masking pattern is acceptable, and who may reverse the username pseudonym?
- **Why it matters:** "Exports must contain full client IP addresses and usernames" contradicts "no personal data may leave the platform unmasked". A single self-service file cannot satisfy both.
- **Working assumption:** Branch managers get masked files only (FR-5). Full data is available only to the Investigator role through approval (FR-6), delivered in a controlled environment. IPv4 masked to /24, IPv6 to /48; usernames pseudonymised with keyed HMAC-SHA256.

### Q2. "Team" vs. "everything they can see"
- **Question:** Is "team" the manager's branch, department, or reporting line? Does it include sub-branches? Should a manager be able to export what they can see outside their team (for example logs of another branch visible to them)?
- **Why it matters:** "export their team's access logs" (narrower) contradicts "export everything they can see" (potentially wider), and the latter would also exceed least privilege. It also affects the 5-second target.
- **Working assumption:** Rows = intersection of the viewable logs and own branch plus sub-branches (FR-3). Anything viewable outside this is not exportable.

### Q3. Definition of "last month" and time zone
- **Question:** Is "last month" the previous calendar month or the last 30 days? Which time zone applies? Which timestamp is used (event or ingestion)?
- **Why it matters:** Different definitions give different row sets and so different forensic results; also drives the 12-month deletion boundary.
- **Working assumption:** Previous calendar month, Asia/Ho_Chi_Minh (UTC+7), event time (FR-2).

### Q4. Old system CSV format
- **Question:** Please send a sample (synthetic or anonymised) of the old system's CSV: columns, order, delimiter, encoding, date format, file name, header.
- **Why it matters:** "like the old system" is not verifiable; the old format might include unmasked IP/username columns that conflict with the masking policy, or use another delimiter or encoding that breaks Excel.
- **Working assumption:** The format in FR-4 (UTF-8 BOM, comma, fixed columns) until the sample arrives; differences become change requests.

### Q5. Five seconds vs. "everything" (volume)
- **Question:** How many log rows are produced per branch per month (typical and worst case)? Is 5 seconds p95 or maximum? Is an asynchronous export with notification acceptable for large volumes?
- **Why it matters:** "Export everything they can see" cannot be guaranteed within 5 seconds for unbounded volume; with masking, HMAC and authorisation checks, time cannot be promised without a volume figure.
- **Working assumption:** The 5 seconds applies at p95 to synchronous exports up to N = 100,000 rows; above that, async with notification; hard cap M = 2,000,000 rows (FR-7, NFR-1). N and M are placeholders, not customer figures.

### Q6. "Kept forever" vs. "delete after 12 months"
- **Question:** What is the real retention period for audit evidence? Is 12 months counted from the event date or the export date? Are masked/pseudonymised files still personal data under the bank's policy? Is there a legal-hold requirement?
- **Why it matters:** Retaining exported files "forever" directly contradicts deleting personal data older than 12 months; a file containing personal data cannot comply with both.
- **Working assumption:** Export files are short-lived (24 h, deleted automatically); only audit metadata (with the file hash, without raw personal data) is kept long-term; raw personal data is deleted at 12 months from event time (section 6).

### Q7. Who are the investigation users and who approves?
- **Question:** Which role(s) perform forensic analysis (InfoSec, SOC, Compliance)? Who approves full exports (one or two approvers, which roles)? What are the SLA and ticketing system?
- **Why it matters:** The brief names only branch managers; the full-data requirement has no actor, and without an approver the "no unmasked personal data" policy cannot be enforced.
- **Working assumption:** An Investigator/InfoSec role submits; a different person from InfoSec or Compliance approves; ticket reference required; request expires after 7 days (FR-6).

### Q8. Is an IP address personal data?
- **Question:** Does the bank's data-protection policy classify client IP addresses (and pseudonymised usernames) as personal data?
- **Why it matters:** If IP is not personal data, the contradiction between "full IP" and "no unmasked personal data" shrinks to usernames; if it is, masking applies to both.
- **Working assumption:** IP and username are both personal data; pseudonymised data is still personal data.

### Q9. Source of the organisation tree
- **Question:** Which system holds branch/team hierarchy and manager assignments (HR, IAM, Active Directory)? How often is it synchronised? How are acting managers and transfers handled?
- **Why it matters:** The team scope in FR-3 depends on this; stale data leads to over-exporting (a data leak) or under-exporting.
- **Working assumption:** The bank's IAM/HR system is the source of truth, synchronised at least daily; effective assignment at request time is used. Not yet confirmed.

### Q10. Storage location of export files and link validity
- **Question:** Where may export files be stored (on-premises object storage, region, bucket owner)? What is the allowed validity of the download link? May files be downloaded to a user workstation?
- **Why it matters:** Storage location determines whether data leaves the platform/bank boundary; link lifetime and file lifetime interact with the retention conflict (Q6).
- **Working assumption:** Bank-internal encrypted object storage; Tier 1 link valid 15 minutes, single-use; file deleted after 24 hours; Tier 1 downloads to a workstation allowed because they are masked.

### Q11. Legal basis and mandated log retention
- **Question:** Which legal and regulatory instruments apply, and what are the minimum retention periods for access logs? Candidates raised by the analysis, **not verified**: Decree 13/2023/ND-CP, the 2025 Personal Data Protection Law, and Circular 09/2020/TT-NHNN (information-system security in banking). Does the bank's legal team confirm which are in force and which prevails when a minimum retention period conflicts with deletion after 12 months?
- **Why it matters:** A mandated minimum retention longer than 12 months would directly contradict "delete personal data older than 12 months", and the bank's own policy may be stricter or looser.
- **Working assumption:** 12 months maximum for personal data in raw logs and export files; audit metadata (no raw personal data) kept longer. No legal citation is relied upon until the bank's legal team confirms.

### Q12. Consistency between UI and export masking
- **Question:** If managers can see unmasked IP/usernames in the UI today, should the export be masked more strictly than the UI? Should the UI also be masked?
- **Why it matters:** "Export everything they can see" implies parity with the UI, while FR-5 masks the export; the UI could then be a bypass of the policy (copy/paste, screenshots).
- **Working assumption:** The export is masked regardless of the UI; UI behaviour is out of scope and flagged for the customer.

### Q13. Volume/rate limits and notification channel
- **Question:** Are limits of 5 requests/hour/user and 1 concurrent export acceptable? Is in-app notification enough for async exports?
- **Why it matters:** Limits protect log search performance and reduce mass-extraction risk but constrain the "export everything" expectation.
- **Working assumption:** As stated in FR-7 and NFR-2; in-app notification only, no e-mail.
