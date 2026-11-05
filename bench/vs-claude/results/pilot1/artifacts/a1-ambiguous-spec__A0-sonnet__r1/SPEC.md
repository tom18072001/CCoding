# SPEC: Log Export (self-service CSV export of access logs)

Status: DRAFT, blocked on customer confirmation of the items in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Branch managers get a "Log Export" button that exports their team's access logs for the previous calendar month as CSV, matching the legacy system's output.

The request contains requirements that conflict with each other (section 2). Several cannot be satisfied at the same time as written. This spec therefore defines a **safe default behaviour** that can be built now, plus **gated features** that stay disabled until the customer resolves the conflicts. Nothing in the gated set may ship enabled without written customer confirmation.

## 2. Conflicts in the request

| # | Statement A | Statement B | Why it conflicts |
|---|---|---|---|
| C1 | "Exports must contain full client IP addresses and usernames" | "No personal data may leave the platform unmasked" | IP addresses and usernames are personal data. An unmasked export contradicts the policy. |
| C2 | "Exported files are kept forever for audit" | "Delete personal data older than 12 months" | Exported files contain personal data, so a file kept forever eventually holds personal data older than 12 months. |
| C3 | "Export everything they can see" | "Team's access logs from last month" | The scope is either the manager's visibility or the team's last month. These differ. |
| C4 | "Everything they can see" (unbounded volume) | "Must complete within 5 seconds" | A fixed time limit cannot hold for unbounded data when the export runs synchronously. |
| C5 | "Make it simple" | Masking, approval, audit, retention and access control | Compliance controls add necessary complexity. "Simple" applies to the manager's UX, not to the backend controls. |
| C6 | "Like the old system" | No description of the old system | The output format is unspecified. |

## 3. Scope

### In scope (default, buildable now)
- "Log Export" button and export flow for users with the Branch Manager role.
- CSV export of access logs of the manager's team for the previous calendar month, with personal data masked (3.1).
- Audit trail of every export request.
- Storage, retention and deletion rules for export files (section 7).

### Gated (built behind a disabled feature flag; enabled only after the answers to Q1, Q2, Q3)
- Unmasked ("forensic") export, section 6.
- Asynchronous export for large volumes, section 5.2.

### Out of scope
- Exports for roles other than Branch Manager (see Q7).
- Formats other than CSV.
- Changing how logs are collected or stored.
- Scheduled or recurring exports.

### 3.1 Default masking rules (assumption A1)
- IPv4: mask the last octet and keep the first three, for example `10.20.30.xxx`. IPv6: keep the first /48 and mask the rest.
- Username: keep the first 2 characters and mask the rest with `*`, for example `ng*****`. A stable pseudonymous token column (`user_ref`, a keyed HMAC of the username, key held in the platform KMS) is added so the same user can be correlated across rows without exposing the username.
- Masking is applied **server-side before the file is generated**. Masking is never done in the browser and is never a client-selectable option.

## 4. Functional requirements

IDs are for traceability into tests.

### 4.1 Access and scope
- **FR-1** The button is visible only to users with role `branch_manager`. The server enforces the same check; hiding the button is not authorisation.
- **FR-2** The export covers only log records of users in the requesting manager's team at the time of the request. "Team" is defined in Q5 (assumed: users whose `branch_id` equals the manager's own branch).
- **FR-3** The period is the previous calendar month in `Asia/Ho_Chi_Minh` (UTC+7): from the first day 00:00:00 to the last day 23:59:59.999 local time. It is computed by the server, not accepted from the client (assumption A4).
- **FR-4** A manager cannot export another branch's data by changing request parameters. The request carries no branch or user filter; the server derives them from the session.
- **FR-5** If the manager's visibility is wider or narrower than the team's records, the narrower of the two applies (assumption A3, see Q4).

### 4.2 Export behaviour
- **FR-6** One click produces one CSV download. No wizard, no form fields in v1.
- **FR-7** Row count and size limits are in section 5. If a limit is exceeded, the export switches to the asynchronous path (5.2) or fails with an explicit message. It never silently truncates.
- **FR-8** If there are no records, the file contains the header row only and the UI says "No log records for this period".
- **FR-9** Concurrent export requests by the same manager are limited to 1 in progress; further clicks return a clear "export already running" message.

### 4.3 CSV format (assumption A5, to be replaced by the legacy format once Q6 is answered)
- UTF-8 with BOM (so Excel shows Vietnamese characters correctly), comma separator, RFC 4180 quoting, CRLF line endings, one header row.
- Columns: `timestamp_iso8601_utc7`, `user_ref`, `username_masked`, `client_ip_masked`, `action`, `resource`, `result`, `branch_id`.
- **FR-10** CSV injection defence: any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- **FR-11** File name: `access-logs_<branch_id>_<YYYY-MM>_<export_id>.csv`. It contains no personal data.

### 4.4 Audit
- **FR-12** Every export attempt (success, failure, denied) writes an audit record containing: export_id, requester id, role, branch_id, period, masked/unmasked flag, row count, file SHA-256, outcome, timestamp, source IP of the requester.
- **FR-13** Audit records are append-only and tamper-evident, and are held separately from the exported files and from the retention rules for logs (see Q3 and section 7).
- **FR-14** Audit records contain no exported personal data other than the requester's own identifier.

## 5. Performance (the 5-second requirement)

### 5.1 Interpretation (assumption A6, see Q8)
"Within 5 seconds" is measured from the button click to the start of the file download, for the p95 of requests where the result is at most **100,000 rows**, under normal load, on the bank's production infrastructure. Generation streams rows to the response so download starts early.

- **NFR-1** p95 time to first byte is at most 2 s and p95 time to complete is at most 5 s for exports of up to 100,000 rows.
- **NFR-2** Above 100,000 rows (or 25 MB) the export switches to the asynchronous path (5.2). A hard guarantee of 5 seconds is impossible for unbounded volume.

### 5.2 Asynchronous path (gated until Q8 is answered)
- The click returns immediately with "Your export is being prepared"; the manager is notified in the UI when it is ready and downloads it from "My exports".
- Download links require an authenticated session of the same requester and expire after 24 hours (assumption).
- Maximum export size: 2,000,000 rows. Above that, the request is rejected with a message to narrow the scope.

### 5.3 Performance design notes
- Query by `(branch_id, timestamp)` using an index or partition on month; confirm one exists for the log store.
- Stream results; do not buffer the whole result in memory.
- A load test with the agreed volume is an acceptance criterion (section 9).

## 6. Unmasked forensic export (gated feature, disabled by default)

The customer states forensic need for full IPs and usernames, and also states a policy forbidding unmasked personal data leaving the platform. Until Q1 is answered, **unmasked export is not available** and all exports are masked.

If the customer confirms that unmasked export is permitted, the assumed design is (assumption A2):
- It is a separate action, not the default button, available only to a distinct role `forensic_investigator` (not Branch Manager, unless Q1 says otherwise).
- It requires a case or ticket reference and a second-person approval (four-eyes), recorded in the audit trail.
- The data never leaves the platform's controlled environment: it is delivered to a restricted, access-controlled store inside the bank, not downloaded to a personal workstation. Whether this satisfies "leave the platform" is a question for the customer's DPO (Q1).
- The file is encrypted at rest, access is logged, and it follows the retention rule in section 7 for unmasked files.
- It is a one-time and time-boxed download, for example 7 days, after which the file is moved to the retention store or deleted per section 7.

## 7. Retention and deletion

Conflict C2 means the default has to be explicit. Assumption A7:

| Data | Retention | Basis |
|---|---|---|
| Source access logs containing personal data | Deleted or irreversibly anonymised after 12 months | Customer policy |
| Masked export files | Kept up to 5 years (assumption; customer to confirm period) because they contain masked data only | Audit need |
| Unmasked export files (gated) | Deleted at 12 months after the log date of the oldest record in the file, or at 12 months after creation, whichever is earlier (Q2 decides) | Policy: personal data older than 12 months |
| Audit records of exports (section 4.4) | Kept 5 years (assumption); contain no exported personal data | Audit need |

- **FR-15** A daily job deletes expired data and writes a deletion record (what, when, why) to the audit trail.
- **FR-16** Deletion covers backups and replicas within a stated lag (assumption: 35 days). Q2 must confirm that lag is acceptable.
- **FR-17** "Kept forever" is **not** implemented. Every stored file has an explicit expiry date set at creation.
- **FR-18** Legal hold: an authorised administrator can place a hold on a specific export or case, suspending deletion until released. This is the sanctioned way to satisfy "kept for audit" if a case needs it. Holds are audited. Whether this is acceptable is Q2.

## 8. Security and compliance requirements

- **NFR-3** Authentication through the platform's existing SSO; session must be active and not expired when the download starts.
- **NFR-4** TLS 1.2+ in transit, AES-256 at rest for stored exports, keys in the platform KMS.
- **NFR-5** Rate limit: at most 5 export requests per manager per hour (assumption).
- **NFR-6** Download endpoints return `Cache-Control: no-store` and `Content-Disposition: attachment`.
- **NFR-7** No personal data in application logs, error messages or URLs.
- **NFR-8** Applicable regulation to be confirmed by the customer's legal and compliance team. Candidates to check: Decree 13/2023/ND-CP on personal data protection and the Law on Personal Data Protection (in force from 2026), State Bank of Vietnam rules on information-system safety and log retention, and the bank's internal data-protection policy. This spec does not assert legal conclusions.
- **NFR-9** Exports are covered by the bank's data-protection impact assessment; the DPO signs off before enabling any gated feature.

## 9. Acceptance criteria

1. A Branch Manager of branch X clicks the button and receives a CSV with only branch X records for the previous calendar month (UTC+7 boundaries tested at month edges, including 31 and 28/29-day months and January).
2. The file contains no unmasked IP or username anywhere (automated scan on the test data set, including the `resource` and `action` fields).
3. A non-manager, and a manager of another branch, cannot obtain the file by any request (direct URL, parameter tampering, expired session) and the attempts appear in the audit trail.
4. p95 complete time is at most 5 s for a 100,000-row test export under the agreed load; above the threshold the async path engages and nothing is truncated silently.
5. Cells starting with `=`, `+`, `-`, `@` are neutralised.
6. Vietnamese characters in `resource` or `action` display correctly in Excel.
7. The expiry job removes a file whose expiry date has passed, produces a deletion record, and leaves the audit record.
8. With the forensic flag off, no code path produces an unmasked file (tested by negative test).

## 10. Implementation notes

- Masking and expiry are enforced in one server-side module, covered by unit tests; no other component builds export files.
- Feature flags: `export.masked` (on), `export.async` (off until Q8), `export.unmasked_forensic` (off until Q1, Q2, Q9).
- Migration: add `expires_at`, `masked`, `legal_hold` to the export metadata table. Exports have no delete-never option in the schema.

## Open questions and assumptions

Each item must be confirmed with the customer before building the affected part. "Assumption" is what this spec uses until then.

| # | Question | Assumption used meanwhile | Blocks |
|---|---|---|---|
| Q1 | **C1.** Policy says no personal data may leave the platform unmasked, yet forensic use needs full IPs and usernames. Which wins? Is delivery to a controlled internal store and a restricted role acceptable as "not leaving the platform"? Who may receive unmasked data, and who approves (DPO)? | A1/A2: All exports are masked by default. Unmasked export is disabled and, if later enabled, is a separate four-eyes-approved flow for a forensic role inside the bank's environment. Branch managers never get unmasked data. | Section 3.1, section 6 |
| Q2 | **C2.** Exported files are "kept forever" but personal data must be deleted after 12 months. Which prevails for export files? Is masked data in files still personal data under the bank's policy? Is a legal hold acceptable? What backup deletion lag is allowed? | A7: Nothing is kept forever. Masked files and audit records kept 5 years; unmasked files deleted at 12 months; legal hold available; backup lag 35 days. | Section 7 |
| Q3 | Must audit records of exports themselves (who exported what) be kept beyond 12 months? What retention period and legal basis? | Audit records kept 5 years and contain no exported personal data beyond the requester's id. | FR-13, section 7 |
| Q4 | **C3.** Is the scope "the team's last month" or "everything the manager can see"? If the manager can see more than the team (other branches, other periods), may it be exported? | A3: The narrower of the two: only the manager's team records for last month. | FR-2, FR-5 |
| Q5 | How is "team" defined (same branch, reporting line, explicit group)? Do deactivated users and users who moved branches during the month count? | Team = users with the same `branch_id` as the manager at request time; users who moved are included under the branch where the event occurred. | FR-2 |
| Q6 | **C6.** What is the exact format of the old system's CSV (columns, order, encoding, delimiter, date format, header language)? Must it be byte-compatible with downstream tools? | A5: The column set in 4.3, UTF-8 with BOM, comma separated. | 4.3 |
| Q7 | Which roles may export (branch managers only, deputies, regional managers, audit)? Does a manager need approval? | Branch Manager only, self-service, no approval for the masked export. | FR-1 |
| Q8 | **C4.** What is the expected data volume per branch per month, and does "within 5 seconds" mean the whole download or acceptance of the request? Is an async path acceptable for large exports? | A6: 5 s p95 for up to 100,000 rows from click to complete; larger exports run asynchronously. | Section 5 |
| Q9 | Who signs off the gated features (DPO, CISO, legal), and what regulations and internal policies apply (e.g. Decree 13/2023, State Bank of Vietnam requirements)? Is a DPIA required? | Sign-off by the DPO before enabling any gated flag; compliance basis to be confirmed by the customer's legal team. | NFR-8, NFR-9 |
| Q10 | "Last month": is it the previous calendar month or the last 30 days? Which time zone and what cut-off? | Previous calendar month, `Asia/Ho_Chi_Minh`, computed server-side. | FR-3 |
| Q11 | Where may an export be downloaded (bank network only, managed devices only)? Are downloads to personal devices or email forbidden? | Download through the authenticated platform UI only; no email delivery; device restrictions left to the bank's endpoint policy. | NFR-3, section 5.2 |
| Q12 | "Make it simple": confirm that a single button with no filters is what is wanted, and that the compliance controls above (masking, audit, limits) are accepted as invisible complexity. | Single button, no user-selectable options in v1. | FR-6 |
| Q13 | Are the proposed limits acceptable: one concurrent export, 5 per hour per manager, 100,000-row sync threshold, 2,000,000-row maximum, 24-hour async link expiry? | Values as stated in sections 4 and 5. | FR-9, NFR-5, section 5 |
| Q14 | How should the masking style be set (last octet, username prefix length) and is a pseudonymous `user_ref` column acceptable as personal data under the policy? | A1: rules in 3.1, with `user_ref` as a keyed HMAC. | Section 3.1 |
