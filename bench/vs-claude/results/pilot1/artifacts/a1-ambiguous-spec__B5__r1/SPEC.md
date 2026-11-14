# SPEC: Self-service "Log Export"

Status: DRAFT – blocked on customer confirmation of the items in "Open questions and assumptions".
Customer: Vietnamese bank. Data classification: internal; the data exported is personal data (client IP, username).

## 1. Summary

A "Log Export" button lets a Branch Manager download their team's access logs for the previous calendar month as CSV. The customer brief contains requirements that contradict each other (see §2). This spec resolves each one with a conservative default, so that a safe version can be built while the customer decides. Nothing in §5 should be shipped to production until the "Blocking" questions in §10 are answered.

## 2. Contradictions found in the brief

| # | Statement A | Statement B | Resolution used in this spec |
|---|-------------|-------------|------------------------------|
| C1 | Export must contain full client IP and usernames (forensic use) | No personal data may leave the platform unmasked | Two export modes: **Masked (default, self-service)** and **Forensic (unmasked, gated)** – see §5. Self-service button only ever yields Masked. |
| C2 | Export "last month" of "team's" logs | Users can export "everything they can see" | Scope = intersection: the user's authorised view ∩ team ∩ previous calendar month. Anything outside is rejected, not silently truncated. |
| C3 | Complete within 5 seconds | Unknown/unbounded volume (a month, all users) | 5 s SLO applies to exports up to a row cap (default 100,000 rows, p95). Larger exports switch to asynchronous (job + notification). |
| C4 | Exported files kept forever for audit | Delete personal data older than 12 months | Retain the **export audit record** (who, when, filter, row count, hash, mode) forever – it contains no client PII. Export **files** are deleted after the retention limit (default 12 months from the date of the log data's creation, hard cap). |
| C5 | "Like the old system" | No description of the old system | Assumed column layout/encoding = to be supplied; placeholder in §6. |
| C6 | "Make it simple" | Requires roles, approval, masking, audit, retention | UI stays one button + (optional) reason box; complexity is in the backend. |

## 3. Scope

In scope: Log Export button, authorization, masking, CSV generation, sync/async delivery, export audit trail, retention/deletion of export files, tests.
Out of scope: changes to log ingestion, other export formats (XLSX/JSON), scheduled/recurring exports, cross-branch exports, deletion policy for non-export log storage (only the interaction is noted in §8).

## 4. Actors and permissions

- **Branch Manager (BM)**: can use Masked export for users in their own team/branch. Cannot see or export other branches.
- **Forensic Approver** (e.g. Information Security / Compliance officer; role name TBC): approves Forensic requests. Must not be the requester.
- **Forensic Investigator** (role TBC): may request and download unmasked export once approved.
- **Platform Admin**: configures caps/retention; cannot read export contents by that role alone.
- Authorization is enforced server-side per request, using the same row-level visibility rules that drive the log viewer ("what they can see"); the export never uses a wider query than the UI.

## 5. Functional requirements

### 5.1 Masked export (self-service, default)
- FR-1 The button is shown only to roles with `log.export.masked`. It exports the previous **calendar month** (00:00:00 on the 1st to 23:59:59.999 on the last day, Asia/Ho_Chi_Minh) for users in the requester's team.
- FR-2 Masking: IPv4 → last octet masked (`203.0.113.xxx`); IPv6 → keep the first /48, mask the rest. Username → pseudonymous stable token (`HMAC-SHA256(key, username)` truncated to 12 hex chars, prefixed `u_`) so that rows of the same user can still be correlated. The HMAC key is held in the platform secret store, never in code, and is rotated per policy.
- FR-3 Masking is applied server-side before any byte is written to a file or response. No unmasked data may exist in the generated file, temp storage, or logs.
- FR-4 If the user's visible set is larger than the month/team scope, the export is limited to the scope in FR-1; the dialog states the exact period and team before confirming.

### 5.2 Forensic export (unmasked, gated)
- FR-5 Not available via the self-service button. Flow: Investigator submits request (case ID, justification, date range, scope) → Approver approves (four-eyes) → system generates the file → Investigator downloads via a single-use, time-limited link (default 24 h).
- FR-6 File is encrypted at rest (AES-256, KMS-managed key) and every row carries a footer/header watermark with request ID and requester ID.
- FR-7 Forensic files are retained for the time the case requires but never beyond the hard cap in §8, then deleted.
- FR-8 Every download is audited.

### 5.3 CSV format
- FR-9 UTF-8 with BOM (for Excel in Vietnamese locale), RFC 4180 quoting, CRLF line endings, header row.
- FR-10 **CSV/formula injection defence**: any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- FR-11 Default columns (to be reconciled with the old system, Q6): `timestamp` (ISO-8601, +07:00), `username`, `client_ip`, `action`, `resource`, `result`, `session_id` (masked/hashed in Masked mode), `event_id`.
- FR-12 Rows sorted by `timestamp, event_id`; file name `log-export_<branch>_<YYYY-MM>_<mode>_<requestId>.csv`.

### 5.4 Performance and delivery
- FR-13 Synchronous path: streamed response; target p95 ≤ 5 s end-to-end for ≤ 100,000 rows (measured at the server, excluding the user's download bandwidth).
- FR-14 Above the cap, or if estimated time > 5 s, the API returns `202 Accepted` with a job ID; the UI shows progress and a notification when ready. Hard maximum 5,000,000 rows per export; above that, the request is rejected with a message to narrow the scope.
- FR-15 Concurrency limit: 1 running export per user, 10 platform-wide (configurable); rate limit 5 requests/user/hour.
- FR-16 Query must use an index on `(tenant/branch, timestamp)`; the query plan must be reviewed before release.

### 5.5 Audit trail
- FR-17 Each request writes an immutable audit record: request ID, requester, role, mode, scope, period, row count, file SHA-256, status, created/expired/deleted timestamps, approver (forensic), IP of requester. Audit records contain **no** client IP or username from exported rows. Kept indefinitely (append-only store).

## 6. API (outline)

- `POST /api/v1/log-exports` body `{mode: "masked", period: "previous_month"}` → `200 text/csv` (stream) or `202 {jobId}`.
- `GET /api/v1/log-exports/{id}` → status; `GET /api/v1/log-exports/{id}/file` → download (authorization re-checked).
- `POST /api/v1/log-exports/forensic` `{caseId, justification, from, to, scope}` → `202`; `POST .../{id}/approve|reject`.
- Errors: 401/403 (role/scope), 409 (concurrent export), 413 (over hard cap), 429 (rate limit). Error messages never include PII.

## 7. Non-functional requirements

- Security: TLS in transit; encryption at rest; no PII in application logs or error messages; secrets in the secret store.
- Availability: export workload must not degrade the interactive log viewer (separate worker pool / read replica where available).
- Observability: metrics for duration, rows, failures, queue depth; alert on p95 > 5 s.
- Localisation: UI in Vietnamese and English.

## 8. Data retention

- Export audit record: kept forever (§FR-17); contains no client personal data.
- Export files (Masked and Forensic): deleted by a daily job when older than the retention limit. Default: **12 months after the newest log record's timestamp contained in the file**, which guarantees no file holds personal data older than 12 months. Deletion is logged in the audit record; file hash remains for later integrity proof.
- If the customer's audit requirement demands the *content* be kept forever, that conflicts with the 12-month deletion rule; only an anonymised (fully masked, non-reversible) archive could satisfy both (Q4).
- Masked files are still treated as personal data until the customer's legal team rules otherwise (pseudonymised data is generally still personal data under Vietnamese data-protection law – to be confirmed by the bank's legal counsel).

## 9. Acceptance criteria

1. BM exports previous month for their team: CSV contains only team users, only that month, IP/username masked per FR-2. A BM from another branch gets 403 for this team.
2. A byte-level search of the Masked file, temp files and logs for a seeded known IP/username finds nothing.
3. Dataset of 100,000 rows: p95 ≤ 5 s over 20 runs; 2,000,000 rows → `202` and completes asynchronously.
4. Forensic file cannot be generated without a different-user approval; download link is single-use and expires.
5. A cell `=cmd|' /C calc'!A0` is exported as `'=cmd|...`.
6. After retention time (test with clock mock), file is deleted, audit record remains, download returns 410.
7. Month boundaries: events at 2026-10-31 23:59:59 +07:00 and 2026-11-01 00:00:00 +07:00 fall into the correct months.
8. Audit records contain no client IP/username.

## Open questions and assumptions

Priority: **B** = blocking (do not release without answer), **N** = needed before build of that part.

| # | Pri | Question for the customer | Assumption used meanwhile |
|---|-----|---------------------------|---------------------------|
| Q1 | B | Full IP/username vs "no personal data unmasked": which wins, and is there a legal basis (e.g. investigation, regulator request) for unmasked export? Who may approve? | Masked is the default for self-service; unmasked only through Forensic flow (§5.2) with four-eyes approval. BMs never get unmasked data. |
| Q2 | B | Is a masked/pseudonymised export acceptable for "forensic use", or must forensic users get full values? | Forensic users get full values via the gated flow; BMs do not. |
| Q3 | B | Which masking rule is mandated by the data-protection policy (last octet? hash? tokenisation)? | FR-2 rules (last octet / /48, keyed-hash token). |
| Q4 | B | "Kept forever" vs "delete personal data older than 12 months": which data is kept forever – the file content or just the record that an export happened? Is the 12 months measured from log creation or from export date? | Audit record forever (no PII); files deleted 12 months after newest contained log record. |
| Q5 | B | What do applicable regulations/the bank's policy require (Vietnam Law/Decree on personal data protection, State Bank IT-security rules, internal policy) – retention, cross-border, consent, DPIA? | No legal conclusion is made here; the bank's legal/compliance team confirms. Design is the strictest reading. |
| Q6 | N | What does "like the old system" mean – columns, order, encoding, delimiter, file name, date format? Can we get a sample file (synthetic)? | Layout in FR-9–FR-12. |
| Q7 | N | Who is a "Branch Manager" in the platform's role model, and how is "their team" defined (org hierarchy, group membership, branch code)? Can one BM manage several teams? | Team = users with the same branch code as the BM in the identity directory; one BM may hold several branches and exports one branch per request. |
| Q8 | N | "Last month": previous calendar month or last 30 days? Timezone? Can they pick other periods? | Previous calendar month, Asia/Ho_Chi_Minh, no period picker. |
| Q9 | N | "Export everything they can see" – does this override "team's logs / last month"? Should BMs be able to export beyond their team or period? | No: scope is the intersection (C2); broader scope would need a separate role and decision. |
| Q10 | N | "Access logs": which event types and fields (login, API, data access, admin actions)? Are there other personal fields (session ID, device, email, account number)? | Fields in FR-11; any field not listed is excluded. |
| Q11 | N | Expected volume (rows/month per branch, peak) and the infra available (read replica, worker pool)? | ≤ 100,000 rows/branch/month typical; thresholds in FR-13/14. |
| Q12 | N | Is the 5 s limit a hard SLA for all sizes? Is asynchronous delivery for large exports acceptable? | 5 s p95 for ≤ 100k rows; async above. |
| Q13 | N | Where are exported files stored (platform vs the user's machine)? Can we control the downloaded copy (user's laptop, email forwarding)? | Platform stores a copy only until retention expiry; the downloaded copy is the bank's responsibility (policy/DLP). |
| Q14 | N | Who may see the export audit trail, and should it be forwarded to the bank's SIEM? | Compliance role reads it; SIEM forwarding out of scope. |
| Q15 | N | Is "simple" a constraint on UI only, or may the approval flow for Forensic exist? | UI one button; approval flow exists but is outside the self-service button. |
| Q16 | N | Is the retention job allowed to delete data under a legal hold/ongoing investigation? | Legal-hold flag on a request pauses deletion until released, with a maximum set by Compliance. |
| Q17 | N | Languages, accessibility and browser support for the button? | Vietnamese + English; the bank's standard browsers. |

## 11. Delivery plan (suggested)

1. Masking library + CSV writer + tests (FR-2, 9–12).
2. Authorization + masked sync export endpoint + audit record (FR-1, 3, 13, 17).
3. Async path, limits (FR-14–16).
4. Retention job (§8).
5. Forensic flow (§5.2) – only after Q1–Q5 answered.
