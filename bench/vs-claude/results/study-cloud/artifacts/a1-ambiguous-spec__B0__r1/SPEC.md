# SPEC: Log Export (self-service access-log export)

Status: DRAFT for customer confirmation. Classification: internal.
All numbers marked **(A)** are assumptions, not measurements. Requirements that depend on an assumption cite the OQ-xx code. Legal references are **not verified** and must be confirmed by the bank's legal/compliance team (see OQ-11).

## 1. Overview and goals

The customer (a Vietnamese bank) asked for a self-service "Log Export" button so branch managers can export their team's access logs from last month as CSV.

The brief contains contradictions that cannot all be satisfied at once (see Section 11 and `## Open questions and assumptions`):

- Full IP and username, versus "no personal data may leave the platform unmasked".
- Files kept forever, versus deleting personal data older than 12 months.
- "Team's logs", versus "everything they can see".
- A 5-second limit, versus unbounded volume.

**Goal:** a simple, safe export that works by default for branch managers (masked, bounded) and provides a separate, approved path for forensic users who need unmasked data. That path keeps the data inside the platform.

**Design resolution used until the customer answers (assumptions):**

1. Self-service export is **masked (pseudonymized)** by default.
2. **Unmasked** data is available only through an approved forensic workflow and never downloads through self-service.
3. Only **audit metadata** of an export is kept forever. Export files containing personal data are deleted within the retention window.

## 2. Scope and out-of-scope

**In scope (MVP, OQ-12):**
- "Log Export" button.
- Default filter "last month".
- Role-based data scope.
- Masked CSV export.
- Forensic unmasked request/approval flow.
- Audit of every export.
- Retention and deletion of export files.

**Out of scope:**
- Real-time streaming or scheduled/recurring exports.
- Formats other than CSV (XLSX, JSON).
- Custom column pickers and ad-hoc query builders.
- Exports of non-access log types (OQ-7).
- Changes to log ingestion.
- Migrating or reproducing other behaviour of the old system beyond the CSV layout (OQ-6).
- Implementation design (API, jobs). It is split into separate tasks after the open questions are answered.

## 3. Actors and roles

| Role | Description | Permissions (assumed, OQ-8) |
|---|---|---|
| Branch manager (trưởng chi nhánh) | Manager of one branch/team | Export masked logs of own team/branch only |
| Forensic / security team | Investigators | Raise unmasked requests; view unmasked data in-platform after approval (OQ-9) |
| Approver | Security lead or equivalent, different from the requester | Approve/reject unmasked requests |
| Auditor | Internal/external audit | Read-only access to export audit metadata; no access to personal data (OQ-2) |
| Platform admin | Operates the platform | Configures retention and keys; cannot approve own requests |

## 4. Functional requirements

| ID | Requirement | Depends on |
|---|---|---|
| FR-01 | The UI shows a "Log Export" button to users with role Branch manager, Forensic, or Admin (RBAC checked server-side). Other users do not see it, and direct API calls return 403. | OQ-8 |
| FR-02 | Clicking the button opens a minimal dialog with the filter defaulted to "last month". One confirm click starts the export. No other mandatory input. | OQ-12 |
| FR-03 | "Last month" = the previous **calendar month**, 00:00:00 on day 1 to 23:59:59.999 on the last day, in **Asia/Ho_Chi_Minh (UTC+7)**. | OQ-5 |
| FR-04 | Data scope is enforced server-side: a Branch manager gets only the access logs of users in their own team/branch, as determined by the platform role/team mapping. "Everything they can see" is interpreted as "within their team scope"; records outside it are never exported. | OQ-3, OQ-8 |
| FR-05 | Log type: application access (login/authentication) logs only. | OQ-7 |
| FR-06 | CSV format: UTF-8 **with BOM**, comma separator, RFC 4180 quoting, CRLF line endings, header row, one row per log event, ordered by timestamp ascending. Timestamps are ISO 8601 with +07:00 offset. | OQ-6, OQ-5 |
| FR-07 | CSV columns (assumed, pending the old-system sample): `timestamp`, `user_pseudonym`, `client_ip_masked`, `event_type`, `result`, `source_system`, `branch_code`. Column names/order are configurable in one place so they can be aligned to the old system. | OQ-6 |
| FR-08 | **Default masking (server-side):** username is replaced with a keyed-HMAC pseudonym, stable within a retention period so activity can be correlated. IPv4 is masked to /24 (last octet zeroed); IPv6 to /48. The key is held in a secrets store; the key is never exported. Masking is applied before any file is written. | OQ-1, OQ-11 |
| FR-09 | **Forensic unmasked flow:** a Forensic user submits a request (case ID, justification, scope, period). A different Approver approves or rejects. After approval the data is viewable/exportable **only inside the platform's controlled forensic workspace**. It is not downloadable to a personal device by default. The approval is time-boxed (assumed 7 days **(A)**). | OQ-1, OQ-9, OQ-10 |
| FR-10 | Self-service never offers an unmasked option, for any role. | OQ-1 |
| FR-11 | Delivery: after the job completes, the user gets a download link that is single-user, authenticated, and expires after 24 hours **(A)**. If the export is queued, the UI shows its status. | OQ-4, OQ-10 |
| FR-12 | Every export attempt (success, failure, denied) writes an audit record: who, when, role, scope, filter, masking mode, row count, file hash (SHA-256), file ID, outcome, and approval ID if any. | OQ-2 |
| FR-13 | CSV-injection defence: any cell starting with `=`, `+`, `-`, `@`, tab, or CR is prefixed with a single quote `'`. | OQ-6 |
| FR-14 | Rate limit: at most 5 export requests per user per hour **(A)** and 1 concurrent export per user. | OQ-12 |
| FR-15 | Empty result: the export completes with a header-only file and a clear message "No records for this period". | none |
| FR-16 | Over-limit result: if the result exceeds the row cap (NFR-02) the export is **not truncated silently**. The user is told to narrow the filter or raise a forensic request. | OQ-4 |

## 5. Non-functional requirements

| ID | Requirement | Depends on |
|---|---|---|
| NFR-01 | **Performance:** for results up to 50,000 rows **(A)** the file is ready within 5 seconds, measured from confirm click to download link shown (server processing time, excluding the user's network download). The 95th percentile target holds on production-like data; no measurement exists yet, so this must be validated in a performance test. | OQ-4 |
| NFR-02 | **Size limit:** the synchronous path is capped at 50,000 rows **(A)**. Above that, up to 1,000,000 rows **(A)** run as an asynchronous job with status and notification, with no 5-second guarantee. Above 1,000,000 rows the request is rejected (FR-16). | OQ-4 |
| NFR-03 | **Security:** TLS in transit. Export files are encrypted at rest. Pseudonymization key rotation is documented. Non-production environments use synthetic data only. | OQ-11 |
| NFR-04 | **Access control:** RBAC with least privilege. Separation of duties (requester is never the approver). Scope is enforced server-side, never in the UI only. | OQ-3, OQ-8, OQ-9 |
| NFR-05 | **Audit:** audit records are append-only, tamper-evident, and exclude personal data (only pseudonymous IDs and hashes). Audit metadata is kept indefinitely **(A)**. | OQ-2 |
| NFR-06 | **Retention:** export files containing personal data are deleted automatically, no later than 30 days after creation **(A)**, and in any case within the 12-month limit. Deletion is logged. | OQ-2, OQ-11 |
| NFR-07 | **Simplicity/usability:** one button, one confirm, no mandatory fields for the default flow (at most 2 clicks). | OQ-12 |
| NFR-08 | **Availability/robustness:** a failed export reports an error and writes an audit record. No partial file is made downloadable. | none |

## 6. Data retention and deletion

| Data | Contains personal data? | Retention (assumed) | Basis |
|---|---|---|---|
| Source access logs | Yes (IP, username) | Deleted/anonymized at 12 months from event time | OQ-2, OQ-11 |
| Self-service masked export file | Pseudonymized (treated as personal data until legal confirms) | Link 24 h; file deleted at 30 days **(A)** | OQ-2, OQ-10 |
| Forensic unmasked export or workspace data | Yes | Deleted when case closes or at approval expiry; no later than 12 months from log event | OQ-2, OQ-9 |
| Export audit metadata (who/when/scope/hash) | No direct personal data | Kept indefinitely **(A)** | OQ-2 |

The retention clock (12 months from event time vs from export time) is assumed to run from **event time** (OQ-2). A daily deletion job removes expired files and records its run. "Forever for audit" is satisfied by audit metadata plus the file hash, not by the file itself.

## 7. Acceptance criteria (Given/When/Then)

| ID | Criterion | Covers |
|---|---|---|
| AC-01 | Given a Branch manager, When they open the log page, Then the "Log Export" button is visible. Given a user without an allowed role, Then the button is hidden and a direct API call returns 403 and is audited. | FR-01 |
| AC-02 | Given the date is 2026-11-15, When the manager opens the dialog, Then the filter is 2026-10-01 00:00 to 2026-10-31 23:59:59 (+07:00). One click starts the export. | FR-02, FR-03 |
| AC-03 | Given the logs have events at 2026-10-31 23:30 +07:00 (16:30 UTC) and 2026-11-01 00:10 +07:00, When exporting "last month" on 2026-11-02, Then only the first event is included. | FR-03 |
| AC-04 | Given manager A of branch X and logs of branches X and Y, When A exports, Then no row from branch Y appears. Given A tampers with a branch parameter in the request, Then the server ignores it or returns 403. | FR-04, NFR-04 |
| AC-05 | Given VPN or door-access events exist, When exporting, Then only application-access events appear. | FR-05 |
| AC-06 | Given an export, When the file is opened, Then it starts with the UTF-8 BOM, has the header from FR-07 in that order, comma-separated, CRLF line endings, timestamps with +07:00, and Vietnamese characters in text display correctly in Excel. | FR-06, FR-07 |
| AC-07 | Given the source IP 203.0.113.45 and username "nguyen.van.a" (fake data), When exported, Then the file shows 203.0.113.0 and a pseudonym, and the same username gets the same pseudonym within the file. The raw values appear nowhere in the file. | FR-08 |
| AC-08 | Given a Forensic user, When they submit a request, Then no data is visible until a different user approves. The requester approving their own request is rejected. After approval data is shown in the forensic workspace with no download button for the unmasked file (unless OQ-10 is answered otherwise). The approval expires at the configured time. | FR-09 |
| AC-09 | Given any role, When using self-service export, Then no option or parameter yields unmasked data. A request with `mask=false` returns 400/403. | FR-10 |
| AC-10 | Given a completed export, When the link is used by another user or after 24 hours, Then access is denied. | FR-11 |
| AC-11 | Given any export attempt (success, failure, denied), When it ends, Then exactly one audit record exists with the FR-12 fields, and it contains no raw IP or username. | FR-12, NFR-05 |
| AC-12 | Given a username `=cmd|' /C calc'!A0`, When exported, Then the cell starts with `'`. | FR-13 |
| AC-13 | Given a user who made 5 exports in an hour, When they request a 6th, Then it is rejected with 429. A second concurrent export is also rejected. | FR-14 |
| AC-14 | Given a month with no events, When exporting, Then a header-only file is produced and the message is shown. | FR-15 |
| AC-15 | Given a result above 1,000,000 rows, When exporting, Then no file is produced and the user is told to narrow the filter. Given a result of 50,001 to 1,000,000 rows, Then an async job runs and the user is notified. | FR-16, NFR-02 |
| AC-16 | Given a production-like dataset of 50,000 rows, When 20 test exports run, Then the 95th percentile is at most 5 s from confirm to link. The test report states the measured value. | NFR-01 |
| AC-17 | Given a failure mid-export, When it occurs, Then no partial file is downloadable and the failure is audited. | NFR-08 |
| AC-18 | Given a stored export file, When inspected at rest, Then it is encrypted. Given a non-production environment, Then no real logs are present. | NFR-03 |
| AC-19 | Given a file older than 30 days, When the deletion job runs, Then the file is gone, the audit metadata remains, and the deletion is logged. Given a source log older than 12 months, Then it is deleted or anonymized. | NFR-06, Section 6 |
| AC-20 | Given a manager on the default flow, When they export, Then it takes at most 2 clicks and no mandatory field. | NFR-07, FR-02 |
| AC-21 | Given an Auditor, When they query audit records, Then they see metadata and hashes but no personal data and no file contents. Audit records cannot be edited or deleted by any role. | NFR-05, NFR-04 |

## 8. Traceability: brief sentence → requirements

| Brief sentence | FR / NFR | OQ |
|---|---|---|
| "self-service 'Log Export' button" | FR-01, FR-02, NFR-07 | OQ-9, OQ-12 |
| "Branch managers can export their team's access logs" | FR-01, FR-04, FR-05 | OQ-3, OQ-7, OQ-8 |
| "from last month" | FR-02, FR-03 | OQ-5 |
| "as CSV like the old system" | FR-06, FR-07, FR-13 | OQ-6 |
| "full client IP addresses and usernames for forensic use" | FR-09, FR-10 | OQ-1, OQ-9 |
| "no personal data may leave the platform unmasked" | FR-08, FR-09, FR-10, NFR-03 | OQ-1, OQ-10, OQ-11 |
| "export everything they can see" | FR-04, FR-16 | OQ-3 |
| "complete within 5 seconds" | NFR-01, NFR-02, FR-11, FR-16 | OQ-4 |
| "files are kept forever for audit" | FR-12, NFR-05, Section 6 | OQ-2 |
| "delete personal data older than 12 months" | NFR-06, Section 6 | OQ-2, OQ-11 |
| "Make it simple" | FR-02, NFR-07, FR-14 | OQ-12 |
| (not in brief; security baseline from S1) | FR-12, FR-13, FR-14, NFR-03, NFR-04, NFR-05 | OQ-11 |

## 9. Dependencies and constraints

- The platform must hold a reliable user-to-team/branch mapping (OQ-8). Without it, FR-04 cannot be implemented.
- A secrets store for the pseudonymization key is needed.
- A performance-test dataset is needed. Production-like data volume is currently unknown (OQ-4).

## 10. Data classification (assumption)

Logs with IP and username are treated as **Restricted/Confidential**. The information-system security level must be checked against the bank's classification records (OQ-11). Data types: client IP, username, timestamps. Purposes: branch oversight and forensics. Access: per Section 3.

## 11. Contradictions in the brief and how this spec resolves them

1. **Full IP/username vs no unmasked personal data.** Masked self-service, plus an approved forensic in-platform flow (FR-08 to FR-10).
2. **Keep forever vs delete after 12 months.** Keep audit metadata only (Section 6).
3. **Team's logs vs everything they can see.** Team scope (FR-04).
4. **5 seconds vs unlimited volume.** Row caps with sync/async split (NFR-01, NFR-02).

## Open questions and assumptions

| ID | Question | Reason (brief quote) | Assumption used meanwhile | Impact if assumption is wrong |
|---|---|---|---|---|
| OQ-1 | Which wins: full IP/username, or masking? May any unmasked data leave the platform, and under which approval? | "must contain full client IP addresses and usernames" vs "no personal data may leave the platform unmasked" | Self-service is masked (HMAC pseudonym, IP /24 or /48). Unmasked data only via approved forensic flow, kept inside the platform. | If the bank requires unmasked CSV in self-service, FR-08, FR-10 and AC-07, AC-09 are redone, and a compliance exception is needed. If masking is too strict for forensics, FR-09 is extended. |
| OQ-2 | How can files be kept forever while personal data is deleted after 12 months? Does the 12-month clock run from log event time or export time? Which data does "kept forever" cover? | "kept forever for audit" vs "delete personal data older than 12 months" | Keep audit metadata and file hash forever. Delete files with personal data at 30 days, and in any case within 12 months from event time. | If whole files must be kept forever, the design must be anonymized-only or legally exempted, and Section 6 and NFR-06 are redone. Storage cost rises. |
| OQ-3 | Is scope the manager's team only, or everything they can see in the platform? | "export their team's access logs" vs "export everything they can see" | Team/branch scope only, enforced server-side. | If a wider scope is intended, FR-04, AC-04 and the volume assumptions (NFR-02) change. Risk of over-exposure. |
| OQ-4 | What does "within 5 seconds" measure, on what volume? What is the row threshold and is async allowed? | "must complete within 5 seconds" with no volume stated | Server time from confirm to link, for up to 50,000 rows (A) sync. Up to 1,000,000 rows (A) async. Above that, rejected. No measurement exists. | If larger volumes need 5 s, a pre-aggregation or index design is needed, and cost rises. If async is not accepted, the row cap must drop. |
| OQ-5 | Is "last month" the previous calendar month or a rolling 30 days? Which time zone? | "from last month" | Previous calendar month, Asia/Ho_Chi_Minh (UTC+7). | Boundary rows are wrong. FR-03, AC-02, AC-03 change. |
| OQ-6 | Which format is "the old system's" CSV? Name of the system, columns, order, delimiter, encoding, date format. Can the customer provide a sample file with fake data? | "as CSV like the old system" | Columns per FR-07; UTF-8 BOM, comma, CRLF, ISO 8601 +07:00. | Downstream tools or scripts may break. FR-06 and FR-07 and AC-06 are rework. |
| OQ-7 | What are "access logs": application login, VPN, door access, database access, other? | "access logs" | Application access (login/authentication) logs only. | Wrong data source. FR-05 and column set change. More types mean more scope. |
| OQ-8 | Who is a "branch manager"? What is a "team"? Where does the role/team data come from (AD, HR system, platform)? | "Branch managers", "their team's" | The platform holds a role and team/branch mapping; one manager has one branch. | If the mapping is missing or in AD/HR, an integration is needed. FR-04 is blocked. A manager with several branches needs rule changes. |
| OQ-9 | Is a self-service button right for forensic use? Do we need approval, chain of custody, case ID? Who approves? | "self-service" and "for forensic use" | Forensic use goes through a separate request/approval flow with case ID and a different approver. Self-service is for branch managers. | If forensic users expect self-service unmasked, FR-09 and FR-10 conflict (see OQ-1). If chain of custody is required, more steps (hashing, sealing). |
| OQ-10 | Where are exports stored, and can users download them to personal devices? | "Exported files are kept forever", "leave the platform" | Files stored in platform storage, encrypted. Masked files download via a 24-hour authenticated link. Unmasked files do not download. | If no download is allowed at all, FR-11 changes to in-platform viewing. If unmasked download is required, see OQ-1. |
| OQ-11 | Which legal and policy bases apply (not verified)? Candidates: Decree 13/2023/NĐ-CP, the Personal Data Protection Law, Circular 09/2020/TT-NHNN, Decree 85/2016, Circular 12/2022, the bank's own policy. Are IP and username personal data? What are the required retention periods for logs? | "In line with our data-protection policy" (policy not provided) | IP and username are personal data. Pseudonymized data is still treated as personal data. All legal references need legal confirmation. | The retention periods, masking level and approval needs may change. Possible non-compliance. |
| OQ-12 | What does "Make it simple" mean? Which controls are mandatory? What is the MVP? | "Make it simple" | MVP is the scope in Section 2: one button, default filter, masked CSV, audit, retention, forensic request flow. No extra options. | If simplicity means dropping controls (approval, audit), that conflicts with the security baseline and needs a risk acceptance. |
| OQ-13 | Who may see export audit records, and who is the Auditor in practice? | "kept forever for audit" | The Auditor role has read-only access to audit metadata. | Section 3 and AC-21 change. |
| OQ-14 | What are the rate limits and concurrent-export limits the bank accepts? | "Users should be able to export everything they can see" (no limit stated) | 5 exports per user per hour (A), 1 concurrent. | FR-14 and AC-13 change. |
| OQ-15 | How long should a forensic approval last, and what happens to data after a case closes? | "for forensic use" | 7 days (A). Data deleted at case close or approval expiry. | FR-09 and retention in Section 6 change. |

## 12. Handover and next steps

1. Send the open questions to the customer. OQ-1, OQ-2, OQ-4 and OQ-6 block building and have priority.
2. After the answers, update this spec and split implementation into separate tasks (export API, masking, deletion job, forensic workflow).
3. Run a performance test to validate NFR-01 with real volumes. No measurement exists today.
