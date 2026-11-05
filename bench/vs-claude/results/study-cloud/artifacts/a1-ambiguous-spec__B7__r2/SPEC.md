# SPEC — Self-service "Log Export" (Log Platform)

Status: DRAFT for customer confirmation · Customer: Vietnamese bank · Data classification of this document: internal

## 1. Summary

A "Log Export" button lets a branch manager download a CSV of their team's access logs for the previous month. The brief contains several requirements that contradict each other (see §2). This spec resolves each one with a safe default so that building can start, and lists every point the customer must confirm in `## Open questions and assumptions`. Where a default is chosen, the more protective option wins.

## 2. Contradictions found in the brief and how this spec resolves them

| # | Brief says | Conflicts with | Resolution used in this spec (pending confirmation) |
|---|-----------|----------------|------------------------------------------------------|
| C1 | Export must contain **full IP and usernames** | **No personal data may leave the platform unmasked** | Two tiers. Tier 1 (self-service button, default): masked/pseudonymised. Tier 2 (forensic export): full values, but not self-service — requires a role, justification, second-person approval, and is delivered only inside the platform (no email/removable download), encrypted, audited. |
| C2 | Export **team's** logs | Export **everything they can see** | Scope = intersection: rows of the manager's own team/branch only, within the visible-to-user rule. "Everything they can see" is not honoured beyond team scope. |
| C3 | Complete **within 5 s** | Unknown volume; masking, authorization and audit add cost | 5 s applies to responses up to a row cap (default 100,000 rows) and p95. Larger requests run asynchronously (job + notification) or are rejected with a prompt to narrow the filter. |
| C4 | Exported files kept **forever** | Delete personal data **older than 12 months** | Files containing personal data expire and are deleted at 12 months from the log event time at the latest (default: file TTL 30 days). What is kept forever is an **export audit record** with no personal data (who, when, filter, row count, SHA-256, approver). |
| C5 | "Last month" | Ambiguous (calendar vs rolling 30 days; time zone) | Previous full calendar month, Asia/Ho_Chi_Minh (UTC+7). |
| C6 | "Like the old system" | Old format is not provided | Cannot be built exactly; a documented CSV schema (§6) is proposed; a sample of the old file is needed. |
| C7 | "Make it simple" | Controls required for C1–C4 | Simple UX (one button, one confirmation), complexity kept server-side. |

## 3. Scope

In scope: export button and API; role-based authorization; masking; CSV generation; sync/async jobs; temporary file storage and expiry; export audit trail; retention purge job; forensic (Tier 2) approval workflow.
Out of scope: changes to log ingestion; the old system's migration; non-CSV formats; scheduled/recurring exports; cross-branch exports.

## 4. Actors and permissions

- **Branch manager** (`log_export_branch`): may run Tier 1 export for the team(s) mapped to them in the org directory (source of truth: customer HR/IAM — to confirm).
- **Forensic requester** (`log_export_forensic_request`): security/investigation staff; may request Tier 2.
- **Forensic approver** (`log_export_forensic_approve`): different person from requester; Tier 2 cannot be self-approved.
- **Auditor** (`log_export_audit_read`): reads export audit records; cannot read export contents.
- Authorization is enforced server-side on every request, derived from the session identity, never from client-supplied team/user ids (prevents IDOR). Default deny.

## 5. Functional requirements

- **FR-1** Button "Log Export" shown only to users with `log_export_branch`. Dialog shows: period (previous month, fixed), team, masking notice, Confirm.
- **FR-2** Tier 1 export covers access-log events of the previous calendar month for the user's team only. Period and team are not editable in v1 (keeps it simple, limits abuse).
- **FR-3** Masking in Tier 1:
  - client IP: IPv4 last octet replaced by `x` (e.g. `10.20.30.x`); IPv6 truncated to /48 — to confirm, as masked IPs limit forensics.
  - username: replaced by a stable pseudonym `u_<first 12 hex of HMAC-SHA256(key, username)>`; key held in KMS/HSM, rotated per customer policy. Same user → same pseudonym within the export, so behaviour can be correlated. Pseudonymised data is still personal data and is handled as such.
  - Free-text fields (URL, user agent, message) pass through a PII scrubber (account numbers, phone, national ID, email patterns) — to confirm field list.
- **FR-4** Tier 2 flow: request (purpose, case id, period, scope) → approval by a different authorised person → generation → download only through authenticated platform session, file encrypted at rest (AES-256), single download or short TTL (default 24 h), then deleted. Full IP and username appear only here.
- **FR-5** Response time: Tier 1 up to 100,000 rows returns the file within 5 s (p95), measured from click to download start, under the load profile in NFR-1. Above the cap: asynchronous job, in-app notification when ready; or reject with "narrow your request". Never silently truncate; if truncated, say so in the UI and in the file footer/audit.
- **FR-6** CSV: UTF-8 with BOM (for Excel in vi-VN; confirm), `,` separator, RFC 4180 quoting, header row, ISO-8601 timestamps with +07:00 offset. **CSV/formula injection defence**: any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- **FR-7** File name carries no personal data: `logexport_<team-code>_<YYYY-MM>_<jobid>.csv`.
- **FR-8** Every export attempt (success, denied, failure) writes an audit record: export id, requester id, tier, team, period, filter, row count, truncated flag, masking profile version, SHA-256 of file, approver (Tier 2), timestamps, outcome, source IP of requester. Audit record contains no exported personal data; it is append-only/immutable and kept per customer audit policy (default: indefinitely, since it holds no personal data).
- **FR-9** Retention: a daily purge job deletes (a) export files at TTL; (b) any file or log row containing personal data older than 12 months, whichever is earlier; the purge writes an audit record. Backups/replicas must follow the same limit or be documented as exceptions.
- **FR-10** Rate limit: max 5 Tier 1 exports per user per day, 1 concurrent job (defaults).
- **FR-11** Users are notified (and the team owner informed) in the audit view that Tier 2 exports happened; no content included.

## 6. CSV schema (proposed — replace with old-system schema once received)

`event_time, team_code, user_pseudonym, client_ip_masked, action, resource, result, http_status, session_id_hash`
Tier 2 replaces `user_pseudonym` with `username` and `client_ip_masked` with `client_ip`.

## 7. Non-functional and security requirements

- **NFR-1** Performance: dataset size and concurrency unknown; assumption: ≤ 5 M log rows per team-month, ≤ 20 concurrent exports. Query uses time-partitioned index on (team, event_time); streaming output, no full buffering in memory. Performance test must demonstrate the 5 s target at the cap before release.
- **NFR-2** Transport TLS 1.2+; files encrypted at rest; keys in KMS; no PII in application logs, URLs or error messages.
- **NFR-3** No real customer data in DEV/UAT; synthetic data only.
- **NFR-4** Data stays in Vietnam region/customer-approved infrastructure (to confirm; cross-border transfer needs separate assessment).
- **NFR-5** Audit integrity: tamper-evident (hash chain or WORM storage).
- **NFR-6** Availability of export must not degrade log search: separate resource pool/quota.
- **NFR-7** Compliance: Vietnamese personal-data protection law and decrees, State Bank of Vietnam information-security/IT-risk regulations, and the bank's own policy apply. Exact instruments, retention minimums for access logs, and whether a data-protection impact assessment must be filed: **need re-checking against current text with the customer's legal/compliance team** (this spec cites no clause numbers on purpose). Note: a legal minimum retention for system-access logs may exceed or conflict with 12 months — see Q4.

## 8. Acceptance criteria

1. A branch manager of team A cannot export team B (tampered team id → 403, audit record written).
2. Tier 1 file contains no full IP and no raw username (automated scan over a synthetic dataset with planted values; zero hits).
3. Tier 2 cannot be approved by its requester; unapproved request produces no file.
4. 100,000-row export completes ≤ 5 s p95 in the load test; a larger one goes async or is rejected, never truncated silently.
5. Cell starting with `=cmd` appears escaped in CSV.
6. After TTL the file is gone (download → 404/410); purge job audit record exists; records with personal data older than 12 months are absent from primary store.
7. Export audit record exists for every attempt and contains no personal data.
8. Previous-month boundaries correct at 00:00 and 23:59:59 +07:00, including month/year rollover.

## 9. Delivery notes

Suggested order: authorization and audit → Tier 1 query/mask/CSV → file store + purge → async path → Tier 2 workflow → load and security tests. Security review (design gate) required before build start; release gate before go-live.

## Open questions and assumptions

| # | Question to confirm with the customer | Assumption used meanwhile |
|---|---------------------------------------|---------------------------|
| Q1 | Brief demands full IP/usernames **and** no unmasked personal data. Which wins, and is any unmasked export permitted? | Default masked. Unmasked only through Tier 2 (approved, audited, in-platform delivery). The self-service button never gives unmasked data. |
| Q2 | Does "leave the platform" include a download to a manager's workstation? Does masking mean redaction, partial masking, or pseudonymisation? | Yes, a download counts as leaving. Partial masking for IP, keyed pseudonym for username. |
| Q3 | Who may approve Tier 2, and what legal basis/purpose records are required (case id, legal request)? | Security officer approves; requester ≠ approver; case id mandatory. |
| Q4 | Retention: which regulation/policy sets "12 months", and is there a longer legal minimum for access logs or audit evidence? Do logs for forensics fall under deletion? | 12 months is a maximum for personal data; export files expire in 30 days; only PII-free audit records are kept forever. Needs legal confirmation. |
| Q5 | "Kept forever for audit": what exactly must be kept — the file, or proof of the export? | Proof (metadata + SHA-256), not the file. |
| Q6 | Do backups and archives fall under the 12-month deletion? | Yes, backups rotate out within 12 months + a stated grace period (30 days). |
| Q7 | "Team": how is membership defined and where does it come from (HR system, IAM group, branch code)? Can a manager manage several branches? | Team = IAM group mapped to the manager; multiple teams exported one at a time. |
| Q8 | "Everything they can see" vs "their team's": which is intended? | Team scope only (the narrower). |
| Q9 | "Last month": calendar month or last 30 days? Time zone? Can a manager choose another period? | Previous calendar month, UTC+7, fixed period. |
| Q10 | "Access logs": which log sources and fields count? Do they include customer (end-user) data or only staff access? | Staff access to the platform/applications; fields in §6. |
| Q11 | Old system CSV: provide a sample/specification (columns, encoding, delimiter, date format). Is bug-for-bug compatibility needed? | Schema in §6; UTF-8 BOM, comma, ISO-8601. |
| Q12 | Expected volume per team-month and concurrent users? Is 5 s a hard SLA or a target? Does it cover generation only or generation plus download? | ≤ 5 M rows source, 100k-row export cap, p95 ≤ 5 s end-to-end; larger goes async. |
| Q13 | Is the 12-month limit measured from event time or export time? | Event time. |
| Q14 | Should the manager's own activity or other managers' activity be in the export? Can managers see the log of people outside their team? | Only the team's members' events. |
| Q15 | Delivery channels allowed (browser only, email, shared drive)? | Browser download over authenticated session only; no email. |
| Q16 | Hosting location and any cross-border processing (cloud, vendor support)? | Customer-approved infrastructure in Vietnam, no cross-border. |
| Q17 | Is a data-protection impact assessment or regulator notification needed for this new processing? | Yes, assumed required; compliance team to run it before release. |
| Q18 | IPv6 / NAT / proxies: is a masked IP still useful for forensics? Should the IP mask be /24 or something else? | Mask last octet (IPv4) and truncate to /48 (IPv6). |
| Q19 | Rate limits and export quotas acceptable? | 5/day/user, 1 concurrent. |
| Q20 | "Make it simple": is it acceptable that the forensic path is a separate, approval-based flow instead of the button? | Yes. |
| Q21 | Excel locale (vi-VN uses `;` in some setups): which delimiter and encoding for users' Excel? | Comma, UTF-8 BOM. |
