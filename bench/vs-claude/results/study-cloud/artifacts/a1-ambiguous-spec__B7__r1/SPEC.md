# SPEC — Log Export (self-service CSV export of access logs)

Status: DRAFT for customer confirmation · Data classification of this document: internal
Customer: Vietnamese bank · Component: log platform

## 1. Summary

A "Log Export" button lets a Branch Manager export the **access logs of their own team for the previous calendar month** as CSV. Because the brief contradicts itself (full IP/username vs. no unmasked personal data; keep exports forever vs. delete personal data after 12 months; "everything they can see" vs. "team's logs, last month"; 5 s limit vs. unbounded volume), this spec defines a **safe default** for each conflict (Section 9) and lists each as a question to confirm. Build must not start on the items marked **BLOCKER** until answered.

## 2. Goals / Non-goals

Goals
- G1. Branch Manager self-service export of team access logs, previous calendar month, CSV.
- G2. Usable for forensic work (identifiable data) *only under a controlled, audited path*.
- G3. Compliant with the bank's data-protection policy and retention rules.

Non-goals
- Export of other teams/branches, arbitrary date ranges, other log types (app/audit/system logs), JSON/XLSX formats, scheduled exports, API for bulk export (all v2 candidates).
- Replicating every quirk of the "old system" (format unknown, see Q12).

## 3. Actors and roles

| Actor | Capability |
|---|---|
| Branch Manager (BM) | Export **masked** CSV for own team, previous calendar month. |
| Forensic Officer (FO) — assumed role, e.g. ATTT/security | Export **unmasked** CSV after approval (Section 5.3). Not a BM capability. |
| Approver (assumed: Head of Information Security / DPO delegate; must differ from requester) | Approves unmasked exports. |
| Auditor | Read-only access to export audit trail and retained evidence exports. |
| Platform admin | Operates the platform; cannot view export contents by default. |

"Team" = the set of users reporting to the BM in the bank's org directory/IdP at the moment of export (see Q6).

## 4. Functional requirements

FR-1. Button "Log Export" is shown only to users holding role `branch_manager` (or `forensic_officer`); hidden/denied for others. Authorization is enforced server-side on every request (no reliance on UI hiding).
FR-2. Scope is fixed server-side: `actor.team == BM's team` AND `event_time` in the previous calendar month, in timezone Asia/Ho_Chi_Minh (UTC+7), [first day 00:00:00, first day of current month 00:00:00). The client cannot supply team or date range (prevents IDOR / scope widening).
FR-3. Event type: access logs only (authentication/session/resource-access events recorded by the platform).
FR-4. Output: CSV, UTF-8 **with BOM** (opens correctly in Excel for Vietnamese), RFC 4180 quoting, header row, ISO-8601 timestamps with offset, one file per export. Filename: `access-logs_<team-id>_<YYYY-MM>_<masked|unmasked>_<export-id>.csv`.
FR-5. Columns (assumed, see Q12): `event_time, event_id, username, client_ip, action, resource, result, source_system`.
FR-6. **CSV/formula injection defence**: any cell starting with `= + - @ TAB CR` is prefixed with `'`.
FR-7. Masking in default (BM) export: see 5.1.
FR-8. Delivery: synchronous download if ≤ 100,000 rows (target ≤ 5 s, Section 7); otherwise asynchronous job with in-app notification and a download link (single-use, expires in 24 h, bound to the requester session). Row cap per export: 1,000,000 rows; above it the request is refused with a message to contact ATTT.
FR-9. Every export request (allowed or denied) writes an audit record: export-id, requester, role, team, period, masked/unmasked, row count, SHA-256 of file, approver (if any), start/end time, result, source IP of requester. Audit records are immutable (append-only/WORM) and contain no exported personal data beyond requester identity.
FR-10. Rate limit: max 5 exports/user/hour; max 2 concurrent per user.
FR-11. Empty result returns a header-only CSV with a notice, not an error.

## 5. Data protection design (resolves the core contradiction)

### 5.1 Default export (Branch Manager) — masked
- `username`: replaced by a **stable pseudonym** per export-month per team using HMAC-SHA-256 with a platform-held key (e.g. `u_7f3a9c`), so the BM can still count/correlate activity of the same user. Assumption: BM does not need real names in the CSV (Q2).
- `client_ip`: IPv4 last octet masked (`203.0.113.xxx`); IPv6 truncated to /48. 
- Note: pseudonymised data remains personal data (Vietnamese PDP rules and general practice); the file is still handled as confidential.
- Real identity recoverable only via the unmasked path (5.3).

### 5.2 Why not full data for BMs
The brief requires both "full IP and username" and "no personal data unmasked". These cannot both hold for a self-service BM export. The spec treats "no unmasked personal data leaves the platform" as the **policy constraint** and "full IP/username for forensics" as a **controlled exception**.

### 5.3 Forensic (unmasked) export — controlled exception
- Available only to `forensic_officer` role, with a case/ticket ID and written justification (mandatory fields).
- Requires **four-eyes approval** by an Approver before generation; approval expires after 24 h.
- Unmasked file is encrypted (AES-256, per-file key) and downloadable only inside the platform session; it must not be e-mailed or sent to external services. Watermark: footer/first-row metadata with export-id and requester.
- Retention of the unmasked file: see 6. Alerts to the security team on each unmasked export.
- "Leave the platform": assumed to mean leaving the platform *boundary* into user hands/endpoints; the bank's DLP/endpoint policy then applies (Q3).

## 6. Retention (resolves "keep forever" vs. "delete >12 months")

- Source logs: personal data (username, full IP) in the platform is deleted or irreversibly anonymised after **12 months** from event time (daily job; deletion logged).
- Exported files containing personal data are **not** kept forever. Assumption: 
  - Masked BM exports: file removed from platform storage after 7 days (user already downloaded it); metadata stays.
  - Unmasked forensic exports: kept up to the case closure, max 12 months from the *event time of the oldest record* — i.e. never beyond the 12-month personal-data limit — unless a documented **legal hold** (case ID, owner, expiry) applies; legal holds are reviewed every 6 months.
- "Kept forever for audit" is satisfied by the **audit trail record** (FR-9: metadata + file hash, no personal data), retained indefinitely/per bank record-keeping rule (Q4), plus the ability to prove which content was exported via hash. Where an audit needs content, anonymised aggregates or a legal hold are used.
- Files downloaded by users to their own devices are outside platform control; the user acknowledgement screen states the retention/handling duty (Q4).
- Backups: expire within 35 days after source deletion (assumption; Q5).
- Note: the log retention minimum for systems of the information-system class may require ≥12 months of system-access logs; whether the 12-month deletion collides with a legal minimum retention must be checked by the bank's legal team (**cần soát lại** the applicable regulations; none are cited here on purpose).

## 7. Non-functional requirements

- NFR-1 Performance: p95 ≤ 5 s for exports up to 100,000 rows measured from click to first byte of file complete download on a 10 Mbps link; streaming CSV generation (no full in-memory load). Larger exports are async (FR-8) — the 5 s requirement cannot be guaranteed for them. Platform must be indexed by (team, event_time).
  Q: whether "5 seconds" is acceptable as p95 with row cap (Q7).
- NFR-2 Security: TLS 1.2+; authN via the bank's SSO with MFA; session-bound download tokens; least privilege for the export service account (read-only on logs); keys in KMS/HSM; no personal data in application logs of the export feature; exports written to encrypted storage.
- NFR-3 Availability: export must not degrade log ingestion/search (use read replica or resource quota; export queries have a timeout of 60 s).
- NFR-4 Auditability: see FR-9; audit retention per Q4; time sync via NTP.
- NFR-5 Usability ("simple"): one button, one confirmation dialog (shows scope: team, month, masked status, handling notice), no options for BMs. Forensic path is a separate screen.
- NFR-6 Accessibility/Localisation: UI in Vietnamese and English; CSV headers in English.
- NFR-7 Non-prod environments (DEV/UAT) use synthetic data only.

## 8. Acceptance criteria (testable)

1. BM of team A requests export → file contains only team A events from the previous calendar month (boundary events at 00:00:00 +07:00 on both edges tested).
2. BM cannot obtain team B data by altering request parameters/IDs (HTTP 403, audited).
3. BM export contains no full IP and no real username (automated scan over file: no match of full IPv4 pattern or any directory username).
4. User without role: button absent and API returns 403.
5. Forensic export without approval → refused; with approval by a different person → generated; same person approving own request → refused.
6. Cell `=HYPERLINK(...)` in a username-like field is neutralised.
7. 100,000-row export completes ≤ 5 s p95 on reference environment (load test with report); 1,000,001 rows → refused.
8. Each request, allowed or denied, produces an immutable audit record with SHA-256 matching the delivered file.
9. Retention job: records > 12 months have username/IP removed/anonymised; masked exports gone after 7 days; unmasked exports gone at limit unless legal hold; verified by test with clock injection.
10. Download link works once, expires after 24 h, fails from another session.
11. Empty month returns header-only CSV.
12. Export requests rate limited per FR-10.

## 9. Contradictions found in the brief and resolution

| # | Brief says | Conflict | Resolution in this spec |
|---|---|---|---|
| C1 | Full client IP + usernames **and** no personal data unmasked | Direct contradiction | Masked by default; unmasked via controlled forensic path (5.3) |
| C2 | Kept forever **and** delete personal data > 12 months | Direct contradiction | Files with PD time-limited; audit metadata+hash kept long-term (Section 6) |
| C3 | Team's logs, last month **and** "everything they can see" | Scope mismatch (and "see" may be wider) | Fixed scope FR-2; wider visibility out of scope |
| C4 | Complete in 5 s | Volume unknown | ≤100k rows sync; larger async |
| C5 | "Make it simple" | Conflicts with approvals/controls | Simple for BM (one button); complexity only in forensic path |
| C6 | "Like the old system" | Old format unspecified | Assumed columns, Q12 |

## 10. Open questions and assumptions

Every item must be confirmed before building. "BLOCKER" = do not build that area until answered.

| # | Question for customer | Assumption used meanwhile |
|---|---|---|
| Q1 **BLOCKER** | Who may receive **unmasked** username/full IP, and does a BM ever need it? Which of the two statements (full data for forensics vs. nothing unmasked) takes priority? | Policy wins: BM gets masked; only `forensic_officer` with four-eyes approval gets unmasked (5.3). |
| Q2 | What masking is acceptable: pseudonym of username, IPv4 last octet, IPv6 /48? Is a stable pseudonym (still personal data) acceptable? | As in 5.1. |
| Q3 | What does "leave the platform" mean (download, e-mail, screen)? Does the bank's DLP/endpoint policy cover downloaded files? | Any download to a user's device counts; unmasked files are encrypted and watermarked. |
| Q4 **BLOCKER** | "Kept forever": which legal/audit rule requires it, for which content (file with PD, or evidence of the export)? Who owns the legal-hold decision? Is there a legal minimum/maximum retention for access logs and audit records? | Forever applies to audit metadata + hash only; PD files follow Section 6; legal hold available. |
| Q5 | Do backups/archives/SIEM copies fall under the 12-month deletion? Is deletion vs. irreversible anonymisation acceptable? | Yes, both in scope; anonymisation acceptable; backups expire ≤ 35 days. |
| Q6 | Definition of "team": source of truth (HR/IdP/directory), does a BM have several teams or delegates, what about users who changed team in the month? | Team from IdP at export time; membership of the month not reconstructed; one BM role per team. |
| Q7 | Is "5 seconds" a hard SLA? Typical/maximum rows per team-month? Measured how and in which environment? | p95 ≤ 5 s up to 100k rows; async above; cap 1M. |
| Q8 | "Everything they can see" — which screens/log types/time ranges does it mean? Is it a requirement for broader export than team + last month? | Ignored; scope = team access logs, previous calendar month only. |
| Q9 | "Last month": previous calendar month or last 30 days? Timezone? | Previous calendar month, Asia/Ho_Chi_Minh. |
| Q10 | Which events count as "access logs" and which log sources? | Authentication/session/resource-access events from the platform. |
| Q11 | Are BMs allowed to export on behalf of delegates or deputies; may BMs export their own activity? | No delegation; own activity included as part of team. |
| Q12 | What is the exact format of the old system's CSV (columns, delimiter, encoding, date format)? Must it stay byte-compatible with downstream tools? | Columns in FR-5, comma, UTF-8 BOM, ISO-8601. |
| Q13 | Who is the Approver and what is the SLA for forensic approval? Should the forensic role exist at all, or use an existing process? | Head of ATTT or DPO delegate; approval within 1 business day. |
| Q14 | Legal basis/notice: does exporting personal data require DPIA/impact assessment, internal notification to data subjects (employees), or regulator filing? Which regulations apply (decree/circular numbers)? | Impact assessment done before go-live; regulation references **cần soát lại** by bank legal — none are asserted here. |
| Q15 | Is cross-border processing or hosting of the platform or its backups involved? | No; all in-country. |
| Q16 | Data volume and retention in the log platform today; does ingestion already mask PII? | Logs stored unmasked internally with access control; masking at export time. |
| Q17 | Authentication/MFA and SSO provider; session timeouts; classification of log data (label) in bank scheme. | Bank SSO with MFA; log data labelled "Confidential" (the higher of options when unknown). |
| Q18 | Notification, rate limits, approval screens and languages (VN/EN) acceptable? Is "simple" satisfied by one button for BM? | Yes as in FR-10, NFR-5/6. |
| Q19 | Test data: can synthetic data be used for UAT? | Yes, mandatory. |

## 11. Out-of-scope risks to flag
- Downloaded CSV on end-user devices is uncontrolled; mitigated only by policy, watermarking and (if available) DLP.
- Pseudonymised data is still personal data; the masked export must still be handled as confidential.
- Legal citations were deliberately omitted; they need verification by the bank's legal/compliance team.
