# Log Export: Implementation Specification

Status: DRAFT. Blocked on the customer confirmations listed in "Open questions and assumptions".
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service "Log Export" button lets a branch manager download their team's access logs for the previous calendar month as CSV.

The request contains requirements that cannot all be met as written (see section 2). This spec resolves them with the safest reading. The default export is masked, and personal data is never exported unmasked through the self-service button. Each assumption is listed for the customer to confirm or overturn.

## 2. Conflicts in the request

| # | Requirement A | Requirement B | Resolution used here (until confirmed) |
|---|---------------|---------------|----------------------------------------|
| C1 | Export must contain full client IPs and usernames (forensics) | No personal data may leave the platform unmasked | The self-service export is masked. Unmasked data is available only through a separate, approval-gated forensic path (section 6), which is out of scope for v1 until the customer confirms it. |
| C2 | Export "team's access logs from last month" | Export "everything they can see" | Scope is the intersection: the manager's team, previous calendar month. Visibility never exceeds the existing authorization model. A wider range is out of scope. |
| C3 | Export completes within 5 seconds | Unbounded volume of a month of logs | The 5 s target applies to the synchronous path up to a row cap (section 5). Larger exports run asynchronously. |
| C4 | Exported files kept forever | Personal data older than 12 months must be deleted | Masked files are kept per the audit policy. Any file containing personal data is deleted at 12 months, along with its source data. |
| C5 | "Like the old system" | Old format is not provided | The old format must be supplied. Until then a documented column set is used (section 4). |
| C6 | "Make it simple" | Needs authz, masking, audit, and retention | Simple means one button and no options in the UI. The controls are not optional and sit behind the button. |

## 3. Functional requirements

### 3.1 Access and scope
- FR-1: The button is visible only to users with the `branch_manager` role. All other roles get no button, and the API returns 403.
- FR-2: Scope is fixed server-side. Log entries whose actor belongs to the requester's team, with timestamp in `[first day of previous month 00:00, first day of current month 00:00)` in `Asia/Ho_Chi_Minh`. The client cannot supply or alter the team or date range.
- FR-3: "Team" is the set of users reporting to the manager's branch in the HR/IAM source of truth, resolved at request time. A manager sees only entries of their own branch's team.
- FR-4: Every row must also pass the platform's existing per-user visibility check. The export never returns a row that the log viewer would hide.

### 3.2 Masking (default export)
- FR-5: Username is replaced by a stable pseudonym, `HMAC-SHA256(key, username)` truncated to 12 hex characters. It is stable within a month, so one actor can still be correlated across rows. The key is held in the KMS and rotated per policy. The key never leaves the platform.
- FR-6: IPv4 is masked to the first two octets (`10.20.x.x`). IPv6 is masked to the first /48. Masking happens server-side before serialization.
- FR-7: Free-text fields (URL, query string, user agent, message) are scanned for IP, username, email, phone, and national-ID patterns. Matches are redacted. If a field cannot be safely redacted, it is dropped from the export.
- FR-8: Masking is fail-closed. If masking fails for any row, the export fails and no partial file is produced.

### 3.3 CSV output
- FR-9: The output is UTF-8 with BOM (so Excel opens Vietnamese text correctly), RFC 4180 quoting, and ISO-8601 timestamps with `+07:00`.
- FR-10: CSV-injection defence: any cell starting with `= + - @ \t \r` is prefixed with `'`.
- FR-11: File name is `log-export_<branch-id>_<YYYY-MM>_<request-id>.csv`.

### 3.4 Audit
- FR-12: Each export request is logged immutably with requester, branch, period, row count, masking profile, file SHA-256, request time, and outcome. The audit record contains no raw personal data.
- FR-13: Denied attempts (wrong role, out-of-scope parameters) are also audited.

### 3.5 Retention
- FR-14: Masked exports follow the audit retention rule. The customer has requested "forever", and the actual period is to be confirmed (Q4).
- FR-15: Unmasked or re-identifiable artifacts (including any forensic exports, if approved) are deleted at 12 months from the event timestamp of the oldest contained record. This is enforced by a daily job that deletes the files and their derived copies and writes a deletion audit record.
- FR-16: Source log personal data older than 12 months is deleted or irreversibly anonymized by a daily job. Backups are covered by an expiry no later than 12 months plus the agreed backup lag (Q5).

## 4. CSV columns (assumed, pending the old-system format)

`timestamp, user_pseudonym, client_ip_masked, branch_id, action, resource, result, status_code, session_id_hash, source_system`

Raw session IDs, tokens, and cookies are never exported.

## 5. Non-functional requirements

- NFR-1 (performance): The p95 time from click to download start is at most 5 s for exports up to 50,000 rows, measured server-side under the expected load of Q6. Streaming responses with an indexed query on (`branch_id`, `timestamp`) are required.
- NFR-2: Above the row cap, the UI shows "Your export is being prepared" and runs a background job. The user is notified in-app and gets a download link. The link is single-user, authenticated, and expires after 24 h. The 5 s target does not apply to this path.
- NFR-3: The per-user rate limit is 5 exports per hour. The cap on concurrent jobs is configurable.
- NFR-4: Files are encrypted at rest (AES-256, KMS-managed keys) and in transit (TLS 1.2+). Data stays in Vietnam-region infrastructure (Q8).
- NFR-5: Downloads require an authenticated session. Step-up MFA for download is optional (Q9).

## 6. Forensic (unmasked) path: NOT in v1 scope

Held until Q1 is answered. If the customer confirms that unmasked export is legitimate, the proposed design is:
- It is a separate request flow, never the self-service button.
- Requesters are Security/Forensics-role users, not branch managers, with a case or ticket ID.
- Requests need approval from a second person (four-eyes) and from the DPO or equivalent.
- The file is encrypted, delivered only inside the platform's controlled viewer or to a named recipient, and watermarked with requester and request ID.
- It has a short validity period and falls under FR-15 deletion.
- The flow is fully audited, including each view.

## 7. Acceptance criteria

1. A non-manager sees no button, and a direct API call returns 403 and is audited.
2. A manager of branch A cannot obtain any row from branch B by changing parameters.
3. The exported CSV has no full IP and no raw username anywhere (verified with a regex scan over all cells, including free text).
4. The period covers exactly the previous calendar month in `Asia/Ho_Chi_Minh`, including the boundary rows at 00:00:00 on the first day of each month.
5. A 50,000-row export meets the p95 latency of NFR-1. A larger export takes the asynchronous path.
6. A masking failure produces no file and a failure audit record.
7. After the retention job runs, no file or record containing personal data older than 12 months remains, and a deletion audit record exists. Masked audit files remain.
8. CSV-injection test strings are neutralized.

## 8. Out of scope (v1)

Unmasked export, date-range selection, other file formats, scheduled or recurring exports, export of other teams or branches, and any change to the log viewer's authorization model.

## Open questions and assumptions

Every point below must be confirmed with the customer before building. The assumption is what this spec uses meanwhile.

| ID | Question | Assumption used meanwhile |
|----|----------|---------------------------|
| Q1 | The request says exports must have full IPs and usernames, and also that no personal data may leave the platform unmasked. Which wins? Is there a lawful, approved forensic exception (who approves, which role)? | Masked is the default. Unmasked export is not built in v1. If wanted, it is the separate approval-gated path in section 6. |
| Q2 | What exactly is "team"? Direct reports, whole branch, or a hierarchy? Where is it authoritative (HR, IAM, AD)? Can a manager have several branches? | Team is the manager's branch, taken from IAM at request time. One branch per manager. |
| Q3 | "Last month" or "everything they can see"? Calendar month, or the last 30 days? Which timezone? Are other ranges needed? | Previous calendar month, `Asia/Ho_Chi_Minh`. Visibility is capped by the existing authorization (FR-4). |
| Q4 | Exports are kept "forever" for audit, but personal data is deleted after 12 months. Which prevails? Does "forever" apply to masked files only? What is the actual audit retention period required by regulation or internal policy? | Masked files are kept for the period set by audit policy (default 10 years, configurable). Anything with personal data is deleted at 12 months. |
| Q5 | Does the 12-month deletion cover backups, replicas, SIEM copies, and data already downloaded by users? What is the acceptable lag? Is deletion or irreversible anonymization acceptable? Does any law require a minimum retention of logs (for example cybersecurity or banking IT-security rules from the State Bank of Vietnam) that conflicts with 12 months? Legal must confirm which rules apply. | Deletion or anonymization in primary storage within 24 h of the 12-month mark. Backups expire within 35 days. A downloaded masked file is outside platform control. No legal minimum above 12 months is assumed until Legal confirms. |
| Q6 | Expected volume: rows per branch per month, and concurrent users? Is 5 s a hard SLA, and for what size? | Up to 50,000 rows per export meets 5 s. Larger exports are asynchronous. A peak of 20 concurrent exports. |
| Q7 | What is the "old system" CSV format (columns, order, delimiter, encoding, date format)? Must it stay byte-compatible for downstream tools? | The column set in section 4. The format is not byte-compatible. |
| Q8 | Must data stay in Vietnam? Does the bank's data-protection policy or the Personal Data Protection law (Decree 13/2023 and the law that replaced it) require a DPIA, a cross-border-transfer assessment, or DPO sign-off? Does the policy define the accepted masking method (for example whether pseudonymization counts as masked)? | Hosting stays in Vietnam. A DPIA and DPO sign-off are required before release. Pseudonymized usernames and truncated IPs count as masked. |
| Q9 | Does download need step-up MFA or manager approval? Are branch managers allowed to save files to local devices, or must delivery stay inside the platform? | No step-up MFA. The download is authenticated and single-user. Local saving is allowed for masked files. |
| Q10 | Are the pseudonyms required to be stable across months (needed for longer investigations) or only within a month? Who may re-identify a pseudonym, and how? | Stable within a month. Re-identification is possible only by Security through the audited forensic path. |
| Q11 | Who owns the audit log of exports, and who reviews it? Should managers be notified when exports occur? | Security operations owns it. No notifications in v1. |
| Q12 | Do any log fields hold other personal data (account numbers, customer IDs, phone, national ID, URLs with tokens)? | They are redacted or dropped per FR-7. The field list is confirmed during implementation. |
| Q13 | Language and UI: Vietnamese, English, or both? | Both, with Vietnamese as the default. |
