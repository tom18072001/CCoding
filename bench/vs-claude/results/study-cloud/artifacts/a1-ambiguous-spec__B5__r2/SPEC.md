# SPEC: Self-service "Log Export" (Log Platform)

Status: DRAFT, pending customer confirmation of the items in "Open questions and assumptions".
Customer: Vietnamese bank. Data classification: personal data (client IP, username) is in scope.

## 1. Summary

A "Log Export" button lets a branch manager download their team's access logs for the previous calendar month as a CSV file. The customer brief contains requirements that cannot all be true at once (see section 2). This spec resolves each conflict with the most conservative reading so that nothing unsafe is built before the customer decides. Where the customer later picks another option, only the marked configuration or scope changes.

## 2. Conflicts in the brief and how this spec resolves them

| # | Conflict | Resolution used in this spec (default) |
|---|----------|------------------------------------------|
| C1 | "Full client IP and usernames" vs "no personal data may leave the platform unmasked" | Default export is **masked**. Unmasked export is a separate, **disabled-by-default** capability (feature flag `export.unmasked.enabled=false`), see 5.3. |
| C2 | "Team's logs, last month" vs "export everything they can see" | Scope = the **intersection**: logs of the manager's own team AND within the allowed period. Anything outside is not exportable, even if visible on screen. |
| C3 | "Complete within 5 seconds" vs unknown volume | 5 s is a target for up to **N = 100,000 rows** (assumption). Larger exports run asynchronously (5.5). |
| C4 | "Kept forever" vs "delete personal data older than 12 months" | Export **files** follow the 12-month rule (deleted when they contain data older than 12 months, see 5.6). What is kept forever is a **metadata audit record** with no personal data (who, when, filter, row count, file SHA-256). |
| C5 | "Make it simple" vs audit, masking, authorization needs | Simple for the user (one button, one choice: none). Controls are built behind it, and no extra options are exposed. |
| C6 | "Like the old system" | Undefined. Assumed to mean CSV with the same column set; not reproducible until a sample is supplied. |

## 3. Scope

In scope: export button, authorization, masking, CSV generation, async path for large exports, export audit record, retention job for export files.
Out of scope: other formats (XLSX, JSON), scheduled/recurring exports, exports for roles other than branch manager (except the optional forensic role in 5.3), changes to log ingestion, changes to the 12-month retention of the underlying logs beyond what C4 states.

## 4. Roles

- **Branch manager (BM)**: may export logs of users in their own team/branch only.
- **Forensic officer (FO)** (conditional, only if the customer confirms unmasked export): may request an unmasked export, subject to approval.
- **Auditor**: read-only access to the export audit record (not to file contents).

## 5. Functional requirements

### 5.1 Button and request
- FR-1: The button "Log Export" is shown only to users holding the BM role. It is hidden for everyone else, and the API also enforces this (403).
- FR-2: There are no user-selectable parameters in v1. The period is fixed to the **previous calendar month** in timezone `Asia/Ho_Chi_Minh` (00:00:00 on day 1 inclusive to 00:00:00 on day 1 of the current month exclusive).
- FR-3: Scope is resolved server-side from the authenticated user's team membership. The client never sends a team id or user ids; any such parameter is ignored.
- FR-4: Max one running export per user, counting both paths: a synchronous stream in progress and an asynchronous job in state queued/running each occupy the slot. A second request while the slot is taken returns 409 with the id of the running export (for a sync stream, the request id).

### 5.2 CSV format (assumed from "old system"; confirm with sample)
- UTF-8 with BOM, comma delimiter, CRLF line ends, header row, RFC 4180 quoting.
- Columns: `timestamp` (ISO 8601 with +07:00), `username`, `client_ip`, `action`, `resource`, `result`, `branch_id`.
- CSV injection defense: any cell starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- File name: `access-logs_<branch_id>_<YYYY-MM>_<export_id>.csv`.

### 5.3 Masking
- FR-5 (default, mandatory): `client_ip` IPv4 masked to `a.b.*.*` (last two octets); IPv6 keeps first 48 bits (`/48`), rest replaced by `*`. `username` is replaced by a stable pseudonym `u_<first 16 hex (64 bits) of HMAC-SHA256(key, username)>`, so the same user is correlatable within the file and across exports, with the HMAC key held in the platform secret store and never exported.
- FR-6 (conditional, off by default): unmasked export for FO only, requires all of: flag enabled; a written ticket reference entered by the requester; approval by a second person (four-eyes); file encrypted (AES-256, key managed by the platform, delivered through the platform only); download link valid 24 h and single use; the audit record notes `unmasked=true`. Not implemented until the customer answers Q1 and Q2.
- FR-7: BM never gets unmasked data, whatever the flag.

### 5.4 Authorization and data scope
- FR-8: Every row is filtered by `branch/team` of the requester at query time, in the query itself (not filtered after fetching).
- FR-9: Deny by default: a user with no team resolves to an empty export (not "all logs").
- FR-10: Download is available only to the requester, through an authenticated endpoint. No public or guessable URL.

### 5.5 Performance and execution
- FR-11: Synchronous path: if the row count (cheap `COUNT` with the same filter) is ≤ N (default 100,000), stream the CSV directly. Target p95 ≤ 5 s end to end, measured at server side with reference data of N rows.
- FR-12: Otherwise the request becomes an asynchronous job: the response is 202 with an export id; the UI shows status (queued, running, ready, failed, expired); the file is ready for download in the platform. The 5 s promise does not apply here, and the UI says so.
- FR-13: Streaming (no whole file in memory); the query must be supported by an index on `(team_id, timestamp)`.
- FR-14: Hard cap of 5,000,000 rows per export; above that the export fails with a clear message to contact the platform team.

### 5.6 Retention and deletion
- FR-15: Exported file = copy of personal data (even masked pseudonyms are personal data until confirmed otherwise). Therefore each file is deleted at the earlier of: 30 days after creation (assumption, download window), or when its oldest row would pass the 12-month age limit.
- FR-16: A daily job deletes expired files, including all storage copies and backups according to the backup rotation, and writes a deletion record.
- FR-17: The platform's own logs older than 12 months have their personal fields (client IP, username) deleted or irreversibly anonymized by the existing/new retention job. Since the export period is only last month, an export never contains data older than 2 months.
- FR-18: The **export audit record** is kept forever (or per the bank's audit policy): `export_id, requester_id, role, team_id, period, row_count, masked(bool), file_sha256, created_at, status, downloaded_at[], deleted_at`. It must contain no client IP or username of log subjects.

### 5.7 Audit and monitoring
- FR-19: Each request, download, denial, and deletion is written to the audit record. Records are append-only.
- FR-20: Metrics: export duration, row count, failures. Alert when the sync path p95 exceeds 5 s for a day.

## 6. Non-functional requirements
- Security: TLS in transit; encryption at rest for stored files; HMAC key rotated at least yearly (rotation changes pseudonyms; documented).
- Availability: the export must not degrade log ingestion or search; run on a read replica or with a statement timeout of 60 s and concurrency limit of 5 exports platform-wide.
- Privacy: no personal data in application logs or error messages (log only export id and counts).
- Language: UI text in Vietnamese and English.

## 7. Acceptance criteria
1. BM of team A exports; the file contains only team A rows from the previous calendar month; no row from team B or from other months.
2. In the file, no `client_ip` has more than its first two octets and no real username appears (test with seeded data).
3. A non-BM user cannot see the button, and a direct API call returns 403.
4. Request with a forged team id still yields only the caller's team.
5. Month boundary at 00:00 +07:00: rows at 23:59:59 on the last day included, 00:00:00 on day 1 of the current month excluded.
6. Fixture of 100,000 rows exports in ≤ 5 s p95; 100,001 rows goes to the async path.
7. A cell with `=cmd|...` is neutralized in the CSV.
8. After the retention job runs, an expired file is not downloadable (410), and the audit record remains with no personal data.
9. Unmasked export is impossible while the flag is off, even for FO.
10. Empty period returns a valid CSV with only the header.

## Open questions and assumptions

Each point must be confirmed with the customer before building; the assumption is what is used meanwhile.

| # | Question | Assumption used meanwhile |
|---|----------|----------------------------|
| Q1 | Contradiction: forensics needs full IP and username, but policy says no unmasked personal data may leave the platform. Which prevails? Does "leave the platform" include a download to a manager's PC? | Masked by default for all exports. Unmasked is off; if confirmed, only for FO with ticket, four-eyes approval, encrypted file (FR-6). |
| Q2 | Who needs forensic (unmasked) data: branch managers, or a security/forensic team? Can forensic work be done inside the platform (view, no download) instead? | Not branch managers. A separate FO role, and in-platform viewing is preferred over file export. |
| Q3 | Exact masking rule acceptable to the bank's data-protection officer (last two octets? hash? partial username?). Is a pseudonym still "personal data" in the bank's policy? | Rules in FR-5; pseudonyms treated as personal data (so they follow retention). |
| Q4 | "Everything they can see" vs "their team's last month": which wins? What does a BM see in the UI today (other branches? older months)? | Team + previous month only (intersection). |
| Q5 | Definition of "team": direct reports only, whole branch, or hierarchy below? Where does the membership data come from (HR system, IdP group, platform)? How are managers of several branches or deputies handled? | Team = users assigned to the manager's single branch in the platform user directory; one branch per BM. |
| Q6 | "Last month": previous calendar month or last 30 days? Timezone? Can the manager choose other periods? | Previous calendar month, Asia/Ho_Chi_Minh, no choice. |
| Q7 | Does "access logs" mean logs of users' access to the log platform, or of access to bank systems in general? Which log sources and fields? | Access events already stored in the platform, with the columns in 5.2. |
| Q8 | What is "like the old system"? Can we get a sample file, columns, encoding, delimiter, date format? | Columns and format of 5.2. |
| Q9 | "Within 5 seconds": for what data volume, which load, measured where (server or incl. browser download)? What is the real monthly row count per branch? | 5 s server-side for ≤ 100,000 rows; larger are asynchronous. |
| Q10 | Is async delivery for large exports acceptable, or must every export be synchronous (then a volume cap or pre-computed exports are needed)? | Async acceptable above the threshold. |
| Q11 | "Kept forever" vs "delete personal data older than 12 months": which applies to exported files? Which legal/audit retention period applies to the bank (regulator)? | Files deleted per FR-15; forever applies only to the personal-data-free audit record. |
| Q12 | Does the 12-month deletion mean deleting whole log rows or only anonymizing IP/username? Does it apply to backups and archives? Does a deletion job already exist? | Anonymize personal fields (keep the rest), backups expire by rotation, new job if none exists. |
| Q13 | Where may an exported file be stored and sent (platform only, email, shared drive)? Where do downloads land (managed devices)? | Platform download only; no email, no shared drive. |
| Q14 | Required approvals/legal basis: does the bank's data-protection impact assessment, and applicable Vietnamese personal-data regulation (to be named by the bank's legal team), require anything beyond this spec (consent notices, cross-border limits, regulator reporting)? | No additional obligations beyond this spec; legal review is a gate before release. |
| Q15 | Audit requirements: who reviews export records, in which format, is SIEM forwarding needed? | Auditor read-only view in the platform; no SIEM forwarding in v1. |
| Q16 | Authentication: is the platform behind the bank's SSO, and is MFA required for exports? | Existing SSO session; no extra MFA in v1. |
| Q17 | Is "simple" a hard limit on features (no filters, no approvals, no async UI), or just the user experience? | Simple UX; required controls are not removed. |
| Q18 | Expected number of branch managers and concurrent exports; any peak (month start)? | ≤ 500 BMs, ≤ 5 concurrent exports, peak at start of month. |
| Q19 | Languages and UI placement of the button? | Vietnamese + English, on the existing log search page. |

## 9. Delivery notes
- **First point to confirm with the customer: Q11.** FR-15 deletes export files (default 30 days) and keeps only a personal-data-free audit record, which directly contradicts "kept forever" in the brief. The legal audit-retention period for the bank is a blocking question: no release until Q11 is answered in writing.
- Do not start FR-6 (unmasked export) before Q1/Q2 are answered in writing.
- Release gate: written sign-off by the bank's data-protection officer on masking (Q3) and retention (Q11, Q12).
