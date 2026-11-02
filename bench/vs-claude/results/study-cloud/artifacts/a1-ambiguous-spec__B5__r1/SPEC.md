# SPEC: Log Export (self-service access-log CSV export)

Status: DRAFT for customer confirmation · Classification: internal · Date: 2026-11-02

## 1. Summary

A "Log Export" button lets a branch manager download a CSV of their team's access logs for the previous calendar month. The customer brief contains four direct contradictions (see section 2). This spec resolves each with the **safest, most reversible default** and lists every point needing customer confirmation in `## Open questions and assumptions`. Nothing in the "assumption" column should be built as final until the customer answers; items marked **BLOCKER** change the design.

## 2. Contradictions in the brief and how this spec resolves them

| # | Brief says | ...but also says | Resolution used in this spec |
|---|-----------|------------------|------------------------------|
| C1 | Exports contain full client IP + usernames (forensics) | No personal data may leave the platform unmasked | Default export is **masked**. Unmasked export is a separate, restricted, audited capability (forensic role + justification + second approval), disabled until legal/DPO signs off. |
| C2 | Branch managers export "their team's logs from last month" | Users can export "everything they can see" | Scope is the **intersection**: rows the user may see in the UI AND within their team AND within the allowed period. Never wider than the on-screen permission. |
| C3 | Export completes within 5 seconds | Volume, "everything", unspecified | 5 s is a target for up to **50,000 rows** (synchronous). Larger exports run as an **async job** with a download notification. |
| C4 | Exported files kept forever for audit | Platform must delete personal data older than 12 months | **Retention of PII wins**: export files are deleted at the latest 12 months after the *newest log row date inside them* is exceeded (simplified: 12 months after creation). What is kept "forever" is the **audit record of the export** (who, when, filter, row count, SHA-256), which contains no log PII. |
| C5 | "Make it simple" | Needs RBAC, masking, approval, audit, retention | Simple UX (one button, one confirmation); the controls live in the backend and are non-optional. |

## 3. Scope

In scope: export button, permission check, masking, CSV generation, download, audit of exports, retention/purge of export files.
Out of scope: changing log ingestion, other formats (JSON/XLSX), scheduled/recurring exports, cross-branch/admin-wide exports, SIEM integration, rebuilding the "old system".

## 4. Actors and permissions

- **Branch manager** (role `branch_manager`): may export masked logs of users in their own team, previous calendar month.
- **Forensic investigator** (role `forensic_export`, new; only if C1 is approved): may request unmasked export with justification and approval.
- **Approver** (security/DPO officer; must differ from requester): approves unmasked requests.
- **Auditor** (read-only): views export audit records.

Authorization is enforced server-side on every request. The row filter reuses the same query/permission layer as the log viewer so "what the user can see" is identical (no second implementation). Team membership is resolved from the identity source at request time (see Q3).

## 5. Functional requirements

FR-1 The Log Export button appears only to users with an export permission. Clicking opens a dialog: period (default = previous calendar month, fixed in v1), format CSV (fixed), a confirmation text stating data is personal data and subject to the policy.
FR-2 Period "last month" = previous full calendar month in **Asia/Ho_Chi_Minh (UTC+7)**, `[first day 00:00:00, first day of current month 00:00:00)`. Timestamps in the CSV are ISO-8601 with `+07:00` offset.
FR-3 Rows = access logs where `actor.team = requester's team` AND within the period AND visible to the requester under normal viewer permissions. Anything outside is silently excluded and the count of excluded rows is not revealed.
FR-4 Masked mode (default) transforms:
  - `client_ip`: IPv4 last octet replaced (`203.0.113.xxx`); IPv6 keep first /48, rest `xxxx`.
  - `username`: replaced with a stable pseudonym `u_<first 12 hex of HMAC-SHA256(key, username)>`; the key is per-environment, held in the secret store, rotated per policy. Same user -> same pseudonym within and across exports, so patterns remain traceable by the bank internally via a lookup performed under approval.
  - Other columns pass through (timestamp, action, resource, result, status code, session id hashed the same way as username).
FR-5 Unmasked mode: only for `forensic_export` role, with mandatory free-text justification (case/ticket id) and approval by a different user; the file is encrypted (AES-256, key delivered separately / downloaded through authenticated session only), single download link valid 24 h, then file purged. Disabled by feature flag until Q1 is answered.
FR-6 CSV format: UTF-8 with BOM (Excel on Vietnamese Windows), delimiter `,`, RFC 4180 quoting, header row, CRLF line endings. Cells beginning with `= + - @ \t \r` are prefixed with `'` (CSV/formula injection defence). Column order is fixed and documented (section 7).
FR-7 Performance: exports up to 50,000 rows stream synchronously and must finish in <= 5 s at p95 (measured server-side, from request to last byte, on production-sized data). Above 50,000 rows, or if the estimated time exceeds 5 s, return `202` with a job id; UI shows progress and a notification when ready. Hard cap 2,000,000 rows per export; above it the user is asked to narrow the filter (team members) — v1 does not allow narrowing the period.
FR-8 Rate limit: 5 exports per user per hour, 1 concurrent export per user.
FR-9 Every attempt (success, denied, failed) writes an audit record (section 8).
FR-10 Download is through an authenticated endpoint only; no public/pre-signed permanent URLs; `Cache-Control: no-store`, `Content-Disposition: attachment`.
FR-11 Retention: export files are stored encrypted at rest and are deleted automatically by a daily purge job once older than the retention limit (12 months max, default 30 days for masked files, 24 h for unmasked ones — see Q6). Source log PII older than 12 months is deleted/anonymized by the platform's retention job, which this feature must not block; the purge job also deletes any export file containing rows past 12 months.

## 6. API (proposed)

- `POST /api/v1/log-exports` body `{period: "previous_month", mode: "masked"|"unmasked", justification?: string}` -> `200` streamed CSV (small) or `202 {job_id}`; `403` no permission; `409` concurrent export; `429` rate limit; `422` invalid.
- `GET /api/v1/log-exports/{job_id}` -> status `queued|running|ready|failed|expired`.
- `GET /api/v1/log-exports/{job_id}/download` -> file (owner only, or approver for unmasked review metadata only, never content).
- `POST /api/v1/log-exports/{id}/approve|reject` (unmasked only).
Errors never include row data or PII.

## 7. CSV columns (assumed, to confirm in Q4)

`timestamp, pseudonym_or_username, client_ip_masked_or_full, action, resource, result, http_status, session_ref, branch_code`

## 8. Audit record (kept per Q6; contains no log PII)

`export_id, requester_id, requester_team, mode, justification_ref, approver_id, period_start, period_end, row_count, file_sha256, created_at, completed_at, downloaded_at[], purged_at, outcome`. Append-only, tamper-evident (hash chain or write-once store). Retention: 5 years assumed (Q6).

## 9. Non-functional requirements

- Security: TLS; files encrypted at rest; no PII in application logs or error messages; secrets in secret store; masking is applied in the query/serialization layer so unmasked values never reach the web tier in masked mode.
- Privacy: purpose limitation (forensic/audit), data minimization (masked default), documented DPIA/impact assessment by the bank's DPO before unmasked mode is enabled.
- Availability: exports must not degrade the log viewer; run on a read replica or with query timeout 30 s and a resource cap.
- Observability: metrics for duration, rows, failures, denied attempts; alert on > N exports/user/day.

## 10. Acceptance criteria

1. A branch manager of team A exporting in March gets only team A's February rows; a manager of team B gets none of team A's rows (automated test with two teams).
2. Default export contains no full IP and no raw username (test greps output against fixture values).
3. The same user yields the same pseudonym across two exports; different users differ.
4. A user without the role receives `403` and an audit record is created.
5. A cell `=cmd|' /C calc'!A0` is exported as `'=cmd...`.
6. 50,000-row fixture exports in <= 5 s p95 over 20 runs on the agreed test environment; 50,001 rows returns `202`.
7. Period boundaries are correct for UTC+7 including January -> December rollover and 00:00 boundary rows.
8. Purge job deletes export files past retention and leaves audit records; file download after purge returns `410`.
9. Unmasked mode is unavailable (404/403) while feature flag is off; when on, it requires justification and a different approver.
10. No PII appears in application logs or error responses (test).

## Open questions and assumptions

Confirm with the customer before building. "BLOCKER" = changes architecture or legality.

| # | Question | Assumption used meanwhile |
|---|----------|---------------------------|
| Q1 **BLOCKER** | Contradiction C1: do forensic users really need unmasked IP/username? Does the data-protection policy (and DPO/legal, incl. Vietnam's personal-data decree/law and State Bank rules) permit unmasked export, to whom, and under what approval? Is "masked" a reversible pseudonym (internal lookup) or irreversible? | Default export is masked with stable pseudonyms; unmasked is a separate approved, encrypted, time-limited flow behind a feature flag, off by default. |
| Q2 **BLOCKER** | Contradiction C4: should export files really be kept forever, given the 12-month personal-data deletion rule? Which rule has precedence, and does the audit retention requirement come from a regulator (which period)? | Files containing PII are purged (max 12 months; defaults in Q6). Only the PII-free audit record is kept long-term. |
| Q3 | What is a "team"? Source of truth (HR/IdP/AD group), can a manager manage multiple teams or sub-branches, is manager-of-managers included, what happens when someone changes team mid-month? | Team = direct group in the identity provider at request time; a manager sees only members currently in the team; log rows are matched by user id, not by historic team. |
| Q4 | What does "like the old system" mean: exact columns, order, header names (Vietnamese/English), date format, encoding, delimiter? Can we get a sample of an old export (synthetic)? | Columns in section 7, English headers, ISO-8601 +07:00, UTF-8 BOM, comma delimiter. |
| Q5 | "Last month": previous calendar month or last 30 days? Time zone? Can users choose other periods later? | Previous full calendar month, Asia/Ho_Chi_Minh, no other period in v1. |
| Q6 | Retention values: how long do export files live, and how long are export audit records kept? Is there a regulatory minimum for audit evidence? | Masked files 30 days; unmasked files 24 h; audit records 5 years. |
| Q7 | Contradiction C2: "everything they can see" vs "their team, last month": which wins? Should users with wider view rights (e.g. several branches) be able to export all of it? Are there log types the viewer shows but that must not be exported? | Export = intersection of viewer permission, team, previous month. All viewer-visible log types included for the team. |
| Q8 | Contradiction C3: what is the real data volume (rows per team per month, largest team), and is 5 s measured to first byte, last byte, or including browser download? Is async delivery acceptable above the limit? | 5 s server-side to last byte, up to 50,000 rows; async job above; 2,000,000-row hard cap. |
| Q9 | Does the export need a second-person approval for masked exports too, or is pure self-service acceptable? Is notification to the DPO/security team required per export? | Masked exports are pure self-service; only unmasked needs approval; no per-export notification (weekly summary to security). |
| Q10 | Which roles exist today (are branch managers a role in the platform), and who may be a forensic investigator / approver? Is MFA step-up required before export? | Roles `branch_manager`, `forensic_export`, approver = security officer; step-up MFA required for unmasked mode only. |
| Q11 | Where may downloaded files live (managers' laptops, email)? Is DLP/watermarking required? Does the bank accept responsibility for the file after download? | Out of platform control; the file carries a footer-free CSV, but the UI shows a warning; no watermark in v1. |
| Q12 | Platform constraints: tech stack, existing RBAC/identity, storage, log store (technology and size), deployment (on-prem?), data residency. This repository contains no code. | Greenfield-neutral: REST API + background worker + encrypted object storage + read replica; stack to follow existing platform once known. |
| Q13 | Language of UI and messages (Vietnamese, English, both)? | Vietnamese and English strings, Vietnamese default. |
| Q14 | Is "Make it simple" a constraint to omit controls (approval, audit)? | No: the UI stays minimal, but audit, masking and permission controls are mandatory. |
| Q15 | Should export of an empty period return an empty CSV with headers or an error? | Empty CSV with header only, plus UI message "no data". |
| Q16 | Who accepts the spec on the customer side (business owner, DPO, security) and what is the target date? | Business owner + DPO jointly; date unknown. |

## Decision log

- 2026-11-02: Safe-default policy: when the brief contradicts itself on personal data, choose the more protective reading and gate the other behind approval and a feature flag.
