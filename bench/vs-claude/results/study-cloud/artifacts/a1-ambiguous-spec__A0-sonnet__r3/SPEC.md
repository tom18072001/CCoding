# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer confirmations in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Add a self-service "Log Export" button that lets a branch manager download their team's access logs for the previous calendar month as a CSV file.

The request has four internal conflicts, covered in section 2. They are not implementation details. Each one changes the design, and two of them (C1, C4) are compliance matters. Section 8 states the assumption used for each so work can start, and what changes if the customer answers differently.

## 2. Conflicts in the request

| # | Requirement A | Requirement B | Why they conflict |
|---|---|---|---|
| C1 | Export must contain full client IPs and usernames, for forensic use | No personal data may leave the platform unmasked | A file with full IPs and usernames is unmasked personal data once downloaded. |
| C2 | Export "last month" of "their team's" logs | "Export everything they can see" | The UI may show more than last month or more than the team. These are different scopes. |
| C3 | Export must complete within 5 seconds | Unspecified volume, and a CSV of a full month | Latency depends on row count. A fixed 5 s cannot be guaranteed for an unbounded export. |
| C4 | Exported files are kept forever | Delete personal data older than 12 months | A retained export containing personal data is personal data older than 12 months. |

## 3. Scope

In scope:
- An "Export logs" button and a server-side export endpoint.
- Role-based access, scope enforcement, masking, CSV generation, audit logging of every export, and retention handling.

Out of scope:
- Export formats other than CSV.
- Scheduled or recurring exports.
- Exports for roles other than branch manager (until C2 is confirmed).
- Changing how the platform ingests logs.

## 4. Functional requirements

Requirement IDs are stable, so tests and tickets can reference them.

**Access and scope**
- FR-1. Only users with the `branch_manager` role see the button and may call the endpoint. The server enforces this; hiding the button is not a control.
- FR-2. The export covers only log records of users in the requesting manager's own team or branch. The server derives this from the authenticated identity. A client-supplied team or branch identifier must never widen the scope.
- FR-3. The export covers the previous calendar month, in the Asia/Ho_Chi_Minh time zone (UTC+7). The server computes the date range. The client does not choose it.
- FR-4. The exported set is the intersection of FR-2, FR-3, and what the manager is allowed to see in the log viewer. The export never includes a row the manager could not view.

**Export content**
- FR-5. The format is CSV, UTF-8 with a BOM so Excel on Vietnamese systems displays diacritics correctly. Line endings are CRLF. Fields follow RFC 4180 quoting.
- FR-6. Columns and order match the legacy system's export. The legacy column list is not yet available (Q8). Until it is, use: `timestamp_iso8601, username, client_ip, user_agent, resource, action, result`.
- FR-7. Defence against CSV injection: any text cell starting with `=`, `+`, `-`, `@`, tab, or CR is prefixed with `'`. This must not alter IPs or timestamps.
- FR-8. Personal-data fields (`username`, `client_ip`) are handled per the policy in section 5. The default is masked.

**Delivery and performance**
- FR-9. Small exports (at or below the synchronous threshold, default 50,000 rows) stream back directly in the HTTP response. They must finish within 5 s at p95 (NFR-1).
- FR-10. Larger exports run as a background job. The UI shows "Preparing", then offers a download link when the file is ready. The 5 s target applies to the job being accepted (the response returns in under 1 s). It does not apply to the file being ready. See C3 and Q5.
- FR-11. The download link is single-use or short-lived (default 15 minutes). It is bound to the requesting user's session and expires after use.
- FR-12. Rate limit: at most 5 exports per user per hour, and at most 1 concurrent job per user. This protects the 5 s target and limits bulk extraction.

**Audit**
- FR-13. Every export request creates an audit record: who, when, scope, date range, row count, masking mode, file checksum, and outcome (success, denied, failed). The audit record contains no personal data from the export itself.
- FR-14. Audit records are tamper-evident (append-only) and are kept for the period the customer confirms in Q4.

## 5. Personal data handling (C1, C4)

Default behavior, used until Q1 and Q2 are answered:

1. Default export is masked.
   - `client_ip`: IPv4 last octet replaced (`10.20.30.xxx`). IPv6 is truncated to the /48 prefix.
   - `username`: replaced by a stable pseudonym, an HMAC of the username with a platform-held key. The same user maps to the same token within the file and across exports, so activity can still be correlated without exposing identity.
2. Full-value export ("forensic mode") is not part of the self-service button in the default design. It is a separate, restricted capability. If Q1 approves it, it would be built as:
   - a distinct role (for example `forensic_exporter`), not held by default by branch managers;
   - a second approver (four-eyes) and a mandatory reason field;
   - the file encrypted (AES-256 via a per-file key) and watermarked with the requester and request ID;
   - the file stored only inside the platform and downloaded over TLS, with a full audit record.
   An alternative that avoids the unmasked file entirely: forensic users query full values inside the platform, and only masked data is ever exported.
3. Because a file downloaded to a laptop is outside the platform's control, the platform cannot enforce deletion of copies. The policy answer to C4 must account for that (Q3).

## 6. Retention (C4)

- R-1. Source log retention: personal data in the platform's logs older than 12 months is deleted or irreversibly anonymized by a daily job. The job reports its counts. The 12 months are measured from the event timestamp.
- R-2. Generated export files are not kept forever if they contain personal data. Default: server-side copies of export files are deleted after 30 days. Only the audit record from FR-13 (no personal data) is kept long-term.
- R-3. If the customer needs "forever" audit retention of exports, the retained artifact must be the masked export, or the audit record with checksum and metadata. It must not be an unmasked file (Q3).
- R-4. Deletion from backups and replicas is in scope. Q9 asks for the backup retention period.
- R-5. Legal hold: records under investigation may be exempted from R-1. A hold requires an authorized actor, a reason, and an audit entry (Q10).

## 7. Non-functional requirements

- NFR-1. Synchronous exports at or below 50,000 rows: p95 ≤ 5 s measured server side at the expected concurrency (Q5). The export streams, with no full-file buffering in memory.
- NFR-2. The query uses an indexed time-range and team filter. Add an index or partition if the log store lacks one.
- NFR-3. TLS is required in transit. Files at rest are encrypted.
- NFR-4. Exports must not degrade log ingestion or the main viewer. Use a read replica or a resource-limited query path where available.
- NFR-5. Accessibility and language: UI label and messages in Vietnamese and English (Q11).

## 8. Open questions and assumptions

Each item must be confirmed with the customer before building. The right-hand column is the assumption used meanwhile.

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | **(C1)** Which requirement wins: full IPs and usernames for forensics, or no unmasked personal data leaving the platform? If both are needed, who may get unmasked data, and does the data-protection policy allow it with approval? | Masked by default (section 5). The unmasked path is not built in the self-service button. It is designed as a restricted, approved capability and gated behind a feature flag that stays off. |
| Q2 | Does "leave the platform" mean any download to a user's device, or only transfer outside the bank's network? Is a download by a branch manager inside the bank "leaving"? | Any download to a user's device counts as leaving. |
| Q3 | **(C4)** "Kept forever" and "delete personal data older than 12 months": which governs exported files? Is a masked or pseudonymized file still personal data under the bank's policy? | Exports containing personal data are deleted after 30 days. Only audit metadata (no personal data) is kept forever. Masked exports are treated as pseudonymized, so personal data under the policy, and follow the same 30-day rule. |
| Q4 | How long must audit records of exports be kept, and who may read them? | Audit records are kept 5 years and readable by the security and compliance roles. Confirm against State Bank of Vietnam and bank policy requirements. |
| Q5 | **(C3)** What is the expected volume (rows per team per month, peak concurrent exports)? Is 5 s required for the file to be ready, or is a "preparing, then download" flow acceptable above a size limit? | Sync path up to 50,000 rows with a p95 of 5 s. Above that, an async job. This needs a measured row count to validate. |
| Q6 | **(C2)** "Their team's access logs from last month" or "everything they can see"? Should managers be able to pick a different period or see more than their team? | Strict intersection: the team, the previous month, and only visible rows (FR-4). No custom date range. |
| Q7 | Who is a "branch manager", and how is team membership defined and sourced (HR system, directory group, platform table)? What about managers with multiple branches, deputies, or acting managers? | A role `branch_manager` in the platform's identity provider, with team membership read from the existing platform access model. One branch per manager. No deputies. |
| Q8 | What exactly does "like the old system" mean? Please provide a sample file of the legacy export: columns, order, header names, delimiter, encoding, date format. | The column list in FR-6. UTF-8 with BOM, comma delimiter, ISO 8601 timestamps. |
| Q9 | What is the retention period for backups and replicas of logs, and can personal data in backups be deleted or only expire? | Backups expire within 35 days. The R-1 deletion is considered done for backups once they roll off. |
| Q10 | Is there a legal-hold or investigation exemption from the 12-month deletion, and who authorizes it? | Yes. Held records are exempt from R-1, and the hold requires an authorized actor and an audit entry (R-5). |
| Q11 | What languages does the UI require, and which time zone applies to "last month"? | Vietnamese and English. Time zone Asia/Ho_Chi_Minh. Calendar month boundaries, not a rolling 30 days. |
| Q12 | Which legal and regulatory instruments apply, and has the bank's DPO reviewed the request? Candidates: Decree 13/2023/ND-CP and the newer Personal Data Protection Law, SBV circulars on information security, and the bank's internal data-protection policy. | Treat the bank's internal policy as the binding rule. Legal references need confirmation by the customer's DPO. We do not give legal advice. |
| Q13 | Are IP addresses and usernames pseudonymized by hashing acceptable, or must the masked form be human-readable (partial IP)? Is correlation across exports allowed? | Partial IP plus a keyed pseudonym for username (section 5). Correlation allowed within the platform's key lifetime. |
| Q14 | Is the delivery channel limited to browser download, or are e-mail and shared-folder delivery also expected? | Browser download only. No e-mail delivery. |
| Q15 | Is there a maximum acceptable export size or a cap on rows? What happens to a month that exceeds it? | A hard cap of 2,000,000 rows. Above it the job fails with a clear message and the audit record notes this. |

## 9. Acceptance criteria

1. A non-manager calling the endpoint directly receives 403 and an audit record with outcome `denied`.
2. A manager of team A who sends team B's identifier still receives only team A's rows (FR-2).
3. The exported date range is exactly the previous calendar month in UTC+7, including rows at 00:00:00 and 23:59:59 on the boundary days.
4. By default, no row in the file contains an unmasked IPv4 last octet or a raw username. This is checked by an automated test over generated fixtures.
5. A cell beginning with `=` is exported as `'=...` (FR-7).
6. A sync export of 50,000 rows finishes in 5 s at p95 in the performance test environment. A 500,000-row export returns a job ID in under 1 s.
7. The retention job deletes or anonymizes personal data with an event timestamp older than 12 months, skips held records, and logs counts. The test uses a frozen clock.
8. Export files are deleted after the R-2 period, and the audit record remains.
9. Every export attempt, whether successful or not, creates exactly one audit record with no personal data in it.
10. The sixth export within an hour by one user is rejected (FR-12).

## 10. Suggested delivery order

1. Get answers to Q1, Q3, Q5, Q6, and Q8. These block design. The rest can proceed on the stated assumptions.
2. Endpoint, authorization, and scope enforcement (FR-1 to FR-4), with audit (FR-13).
3. CSV writer with masking and injection defence (FR-5 to FR-8).
4. Sync path, then async job and expiring links (FR-9 to FR-12).
5. Retention and deletion jobs (section 6).
6. UI button and states.
