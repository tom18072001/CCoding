# Log Export — Implementation Specification

Status: DRAFT, blocked on customer confirmation of the items in [Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

Add a self-service **Log Export** button that lets a branch manager download their team's access logs for the previous calendar month as CSV, similar to the legacy system.

## 2. Requirement conflicts

The request contains requirements that cannot all be met as written. The design below resolves each with a default, and each default is listed as a question in section 9.

| # | Statement A | Statement B | Conflict |
|---|---|---|---|
| C1 | Exports must contain full client IPs and usernames | No personal data may leave the platform unmasked | An export that satisfies A violates B. |
| C2 | Export "everything they can see" | Export "their team's access logs from last month" | The scope is either last month or everything visible. |
| C3 | Exported files are kept forever | Platform must delete personal data older than 12 months | Retained export files would hold personal data past 12 months. |
| C4 | Must complete within 5 seconds | Unbounded data volume ("everything") | Not guaranteed for large exports unless a size cap or an asynchronous mode applies. |
| C5 | "Like the old system" | The old system's format is not specified | The CSV schema cannot be built. |
| C6 | "Make it simple" | Roles, audit, masking, retention and a performance target | Simple for the user, but not trivial to build. Section 4 keeps the UI to one button. |

## 3. Scope

In scope:
- An export button and endpoint for the role "Branch Manager".
- CSV generation.
- Masking policy enforcement.
- Audit logging of exports.
- Retention handling for log data and export artifacts.

Out of scope until confirmed:
- Other roles, such as auditors and forensic staff. Their unmasked access is the subject of Q1.
- Formats other than CSV.
- Scheduled or recurring exports.

## 4. Functional requirements

**FR-1 Entry point.** Branch managers see an "Export logs" button on the access-log view. A single click exports the default scope (previous calendar month, the manager's team, the current filters). There are no other required inputs.

**FR-2 Authorization.** The server authorizes every request.
- A manager may export only logs of users in their own team and branch, as defined by the organization hierarchy.
- The button is never the only control.
- Requests for other teams are rejected with 403 and audited.

**FR-3 Time window.** The default is the previous calendar month, in Asia/Ho_Chi_Minh (UTC+7) time. The start is inclusive and the end is exclusive.

**FR-4 Visible-data rule.** The export contains only rows the user could see in the UI under the same filters. It never contains more rows or fields than the UI would show that user.

**FR-5 Masking (default policy).** The default export is **masked**.
- IPv4 is masked to /24, for example `203.0.113.x`.
- IPv6 is masked to /48.
- The username is replaced with a stable pseudonym, `HMAC-SHA256(key, username)` truncated, so that rows for the same user can still be correlated within and across exports.
- The key is held in the platform KMS and rotated under policy.
- Other free-text fields are scanned and masked, for example account numbers, phone numbers and national IDs (CCCD) in URLs or query strings.

**FR-6 Unmasked export (conditional).** Unmasked export is **disabled by default** and is built only if Q1 is answered "yes".
- It is available only to a separate, explicitly granted role, such as Forensics.
- Each request needs a case or ticket ID and a stated purpose.
- It may require approval by a second person.
- It is delivered only through a controlled, platform-internal channel. Plain download to an arbitrary device is not allowed.
- It is encrypted at rest and on the wire.
- It carries an expiry.

**FR-7 CSV format.**
- UTF-8 with BOM, if the old system used it for Excel (Q5).
- RFC 4180 quoting and CRLF line endings.
- ISO 8601 timestamps with the +07:00 offset.
- Cells beginning with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` to prevent CSV/formula injection.
- Header row is always present.
- Filename: `access-logs_<team>_<YYYY-MM>_<masked|unmasked>_<exportId>.csv`.
- Column set is TBD pending Q5. Assumed minimum: `timestamp, user (masked), client_ip (masked), action, resource, result, branch, request_id`.

**FR-8 Size and performance.**
- Synchronous path: for up to **50,000 rows** the response is streamed and completes within 5 s at p95 (NFR-1).
- Above the cap, the system does not silently truncate. The UI offers to run the export as a background job, with a notification and download link when it completes. The 5 s target does not apply to it.
- A hard maximum applies, assumed at 2,000,000 rows. Beyond it the user is asked to narrow the filters.
- Exports include a trailer row or an `X-Row-Count` header and the UI shows the number of rows exported, so truncation is never invisible.

**FR-9 Audit trail.** Every attempt, whether success, denial or failure, writes an immutable audit event.
- Fields: actor, role, timestamp, team scope, time window, filters, masked/unmasked, row count, file hash (SHA-256), purpose/ticket, outcome, client IP of the requester.
- Audit events must themselves contain no unmasked personal data of log subjects. The actor is identified by employee ID.
- They are retained per Q4.

**FR-10 Rate limiting.** At most 5 exports per user per hour and 2 concurrent, to protect the platform and slow bulk exfiltration. Values are configurable.

**FR-11 Retention enforcement.**
- Source log data containing personal data is deleted or irreversibly anonymized once older than 12 months. The job runs daily, and deletions are logged.
- Export files are **not** kept forever by default. The export file store applies the same 12-month ceiling, and the files are deleted with the data they were derived from.
- Masked exports (pseudonymized IPs and usernames) may be kept longer only if the customer's DPO confirms they are anonymous enough under law (Q3).
- The audit record of an export (FR-9) is kept longer, because it holds no log-subject personal data.
- A legal-hold flag may suspend deletion for specific cases or tickets.

**FR-12 Deliverable file handling.**
- Generated files are stored encrypted in object storage, with a short-lived signed URL (assumed 15 minutes) for download.
- Background-job files expire after 7 days (assumed), then are deleted.
- Files carry the same 12-month ceiling as FR-11.

## 5. Non-functional requirements

- **NFR-1 Performance.** p95 ≤ 5 s end to end for the synchronous path (≤ 50,000 rows), measured at the server from request to the last byte, under the agreed load of N concurrent managers (assumed 20). The target needs an index on (team/branch, timestamp), or a precomputed per-team monthly partition.
- **NFR-2 Security.**
  - TLS 1.2 or higher.
  - Server-side masking only. The client never receives unmasked data in the masked path.
  - No personal data in application logs or error messages.
  - Download links are bound to the requesting session.
- **NFR-3 Compliance.** Design to Vietnam's personal-data framework and the State Bank of Vietnam's information-security rules. The exact instruments must be confirmed by the bank's legal and compliance team (Q2). Examples to check: Decree 13/2023/ND-CP and the Law on Personal Data Protection that supersedes it, the Law on Cybersecurity, and SBV circulars on IT system safety. This spec does not assert specific legal obligations.
- **NFR-4 Data residency.** Files and keys stay in the customer-approved environment in Vietnam (Q2).
- **NFR-5 Availability and observability.** Metrics: export count, duration, rows, failures, rate-limit hits. Alert on spikes in export volume per user.
- **NFR-6 Accessibility and i18n.** UI text in Vietnamese and English.

## 6. Design outline

1. `POST /api/v1/log-exports` takes `{scope, window, filters}` and the authenticated session. It resolves the user's team via the org service, then authorizes.
2. A query layer applies the visibility rule (FR-4), counts rows, and chooses the sync or async path.
3. A masking layer applies FR-5 to the row stream. It is applied before the CSV serializer, not after, and it is the only path to output.
4. The CSV serializer streams to the HTTP response or to object storage.
5. The audit writer records the event. A failed audit write fails the export (fail closed).
6. A retention job covers log tables, the export bucket (via lifecycle rules) and derived caches.

## 7. Acceptance criteria

- AC-1: A manager from team A cannot export team B's logs (403, audited).
- AC-2: The default export contains no full IP and no raw username, verified by a scan of a fixture dataset.
- AC-3: A synchronous export of 50,000 rows completes in ≤ 5 s at p95 in the performance environment.
- AC-4: An export over the cap prompts for a background job and never silently truncates.
- AC-5: CSV injection fixtures are neutralized.
- AC-6: Every attempt produces an audit event.
- AC-7: Data and export files older than 12 months are deleted by the job, with a test using a clock fixture.
- AC-8: The unmasked path is unreachable without the dedicated role and ticket (if Q1 is "yes").
- AC-9: A rate-limited request returns 429.

## 8. Delivery

Phase 1: masked export, authorization, audit, CSV, sync path, retention job.
Phase 2: async path for large exports.
Phase 3: the controlled unmasked flow, only if approved under Q1.

## 9. Open questions and assumptions

Each point must be confirmed with the customer before building. Until then we use the stated assumption.

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | **Masked vs full data (C1).** The request wants full IPs and usernames for forensics, but also says no personal data may leave the platform unmasked. Which one governs? Is there a forensic role allowed to see unmasked data, and under what approval? Does "leave the platform" mean download to a user's device? | Branch managers get **masked** exports only. Unmasked data is built only if the customer approves it, and then only for a separate Forensics role, with a ticket and a second approver, inside a controlled channel (FR-6). Forensic work otherwise happens inside the platform. |
| Q2 | **Legal basis and regulation.** Which regulations and internal policies apply (personal-data law, SBV rules, the bank's own policy)? Does the bank's DPO classify IP address and username as personal data? Must data stay in Vietnam? | Both are personal data. Data residency in Vietnam. Legal to confirm specifics. |
| Q3 | **Forever vs 12 months (C3).** Which wins for export files? Are masked or pseudonymized files exempt from the 12-month deletion? Does the audit-retention requirement apply to the export file or only to a record of the export? Is there a legal-hold process? Does deletion mean hard delete or irreversible anonymization? | Export files are deleted at 12 months along with source data. Only the audit metadata (no personal data) is kept longer. Legal-hold flag supported. Deletion is hard delete from primary stores. |
| Q4 | **Audit-record retention period** (e.g., 5, 7, 10 years or forever) and who may read it. | 10 years, read-only for the audit and compliance roles. |
| Q5 | **"Like the old system."** Provide a sample file and the old system's behavior: columns, order, delimiter (comma or semicolon), encoding and BOM, date format, filename, header language. | Columns as in FR-7, comma delimiter, UTF-8 with BOM, ISO 8601 timestamps. |
| Q6 | **Scope (C2).** "Their team's logs from last month" or "everything they can see"? Is the window the previous calendar month (in UTC+7) or the last 30 days? Can a manager choose other ranges or filters? What defines "team" (direct reports, whole branch, a subtree)? Can a manager have several branches? | Previous calendar month, fixed. Team = the manager's branch hierarchy subtree from the org service. Current UI filters narrow the export but never widen it. No custom ranges in v1. |
| Q7 | **Who gets the button.** Only branch managers? What about deputies, regional managers, auditors, admins? How is the role-to-team mapping sourced and kept current? Do managers see their own logs? | Role "Branch Manager" only, mapped from the identity provider and HR org data. Their own logs are included. |
| Q8 | **Performance (C4).** Does the 5 s target apply to the whole export, or to starting the download? What is the largest expected export (rows per team per month), the peak concurrency, and the acceptable behavior beyond the limit? | End to end for up to 50,000 rows; above that, a background job. Hard cap 2,000,000 rows. 20 concurrent users. |
| Q9 | **Masking rules.** Exact masking for IPv4/IPv6 (/24? last octet?) and usernames (pseudonym, partial mask, or hash)? Must the pseudonym be consistent across exports and months? Other fields to mask (URLs, account numbers, device IDs)? | /24 for IPv4, /48 for IPv6, keyed HMAC pseudonym stable across exports, free text scanned for account, phone and CCCD patterns. |
| Q10 | **Delivery channel.** Direct browser download, email, or in-platform inbox? Are downloads to personal or unmanaged devices acceptable? Is file encryption or a password required? | Authenticated browser download over a short-lived signed link. No email delivery. |
| Q11 | **Approval and controls.** Is maker-checker approval required for any export? Are rate limits acceptable? Should exports raise alerts to security operations? | No approval for masked exports. Rate limit 5 per hour. Alerts on anomalies. |
| Q12 | **Existing platform facts.** What is the log schema and volume, the storage engine, the identity provider, and the existing roles? Is there an existing masking or retention capability to reuse? | Relational or search store with an index on team and time can be added. IdP via OIDC. Nothing to reuse until shown otherwise. |
| Q13 | **"Make it simple."** Does it mean a single button with no options, or less engineering effort? May we phase the work (section 8)? | One button with no dialogs in the common case. The controls above are still required. Phased delivery accepted. |
| Q14 | **Retention of source logs vs. other consumers.** Do other systems (SIEM, backups, archives) hold copies that the 12-month deletion must also reach? | The 12-month job covers platform stores and backups on their normal rotation, with backup lifetime ≤ 12 months plus 35 days. Downstream systems are out of scope. |
| Q15 | **Language and branding of the UI.** Vietnamese, English, or both? | Both. |
