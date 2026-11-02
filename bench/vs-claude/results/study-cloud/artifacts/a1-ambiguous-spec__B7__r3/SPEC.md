# SPEC: Self-service "Log Export" (Log Platform, Vietnamese bank)

Status: DRAFT for customer confirmation · Data classification: Internal (spec); the data handled is personal data (IP, username) of bank staff/customers and is treated as **Restricted** until the customer says otherwise.

## 1. Summary

A "Log Export" button lets a Branch Manager download a CSV of access logs for their team for the previous calendar month. The customer brief contains several requirements that cannot all be true at once (see section 2). This spec resolves each with a conservative default (privacy-first, safest to build) and lists every point to be confirmed in `## Open questions and assumptions`. Nothing in the "assumed" column should be built as final until confirmed, but the default design is implementable now.

## 2. Contradictions found in the brief

| # | Statement A | Statement B | Resolution used in this spec |
|---|---|---|---|
| C1 | Export must contain **full** client IP and usernames | **No personal data may leave the platform unmasked** | Default export is **masked**. Unmasked data only via a separate, restricted "Forensic Export" (section 5.3), which needs customer sign-off that this is a permitted exception. |
| C2 | Export "everything they can see" | Only "their team's" logs, "last month" | Scope = intersection of the user's existing authorization and team + previous-month limit. "Everything they can see" is **not** a scope override. |
| C3 | Complete within **5 s** | No volume bound, plus masking and audit | 5 s is a p95 target for exports up to a row cap (5.4); larger exports run asynchronously. |
| C4 | Exported files kept **forever** | Delete personal data older than **12 months** | Files containing personal data expire at 12 months. Only a PII-free audit record is kept long term. |
| C5 | "Like the old system" | Old system is not described | Unknown format; assume column set in 5.2 and confirm. |
| C6 | "Make it simple" | Bank-grade controls (authz, audit, masking, retention) | Simple for the user (one button, no options), not for the backend. Controls are not dropped. |

## 3. Scope

In scope: export button, authorization, CSV generation, masking, export audit trail, file retention/deletion, async fallback, forensic export (restricted variant).
Out of scope: changing log ingestion, changing the platform-wide 12-month deletion job (only its interaction with exports), other export formats, scheduled/recurring exports.

## 4. Actors and roles

- **Branch Manager (BM):** exports masked CSV for own team, previous month.
- **Security/Forensics Analyst (FA):** (new role, assumed) may request an unmasked export; needs approval (5.3).
- **Approver (second person, e.g. Head of Security/DPO delegate):** approves forensic exports.
- **Platform Admin:** no access to export content; manages retention config only.
- **Auditor:** read-only access to export audit records.

## 5. Functional requirements

### 5.1 Button and flow
- FR-1 The "Log Export" button is visible only to users with the BM role and a non-empty team mapping.
- FR-2 One click exports the previous full calendar month (timezone Asia/Ho_Chi_Minh, UTC+7: 00:00 on the 1st to 24:00 on the last day) for the BM's team. No filters in v1.
- FR-3 Success: browser download of `log-export_<teamId>_<YYYY-MM>_<timestamp>.csv`. Async: message "Your export is being prepared", then in-app notification and a download link (authenticated, expires per 5.5).
- FR-4 Empty result still produces a CSV with a header row and a notice, and is audited.

### 5.2 CSV content (assumed; confirm with C5)
Columns: `event_time` (ISO 8601 with offset), `username_masked`, `client_ip_masked`, `team_id`, `system/resource`, `action`, `result`, `event_id`.
- Encoding UTF-8 with BOM (for Excel), comma delimiter, RFC 4180 quoting, CRLF.
- **CSV injection protection:** any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`.
- Masking (default): IPv4 → last octet replaced (`10.20.30.xxx`); IPv6 → keep /48, rest masked. Username → first 2 characters + `***`, or a stable per-export pseudonym (`user_0017`) so that the same user can still be correlated within one file. Choice is open question Q3.

### 5.3 Forensic Export (unmasked) – restricted variant
Only built if the customer confirms it is a lawful, policy-approved exception (Q1).
- FR-5 Requested by an FA with: case/ticket ID, written justification, time range and subject scope (not "everything").
- FR-6 Requires approval by a different person (four-eyes); requester cannot approve own request.
- FR-7 File is encrypted at rest and delivered only through the platform (no e-mail), download link single-use, expires in 72 h, watermarked via filename and a trailer row containing requester ID and request ID.
- FR-8 Every request, approval, download is audited (5.6). Files deleted at the earlier of case close + retention rule or 12 months from event date (C4).
- BMs never get unmasked data through the button.

### 5.4 Performance (C3)
- NFR-1 Sync path: p95 ≤ 5 s end-to-end (click to first byte of download complete) for result sets up to **100,000 rows** on the reference dataset and load (assumed: ≤ 20 concurrent exports).
- NFR-2 Above the cap, or if generation exceeds 4 s, the request automatically switches to async (FR-3). The 5 s is not promised for async jobs; async target is ≤ 10 min (assumed).
- NFR-3 Streaming generation (no full in-memory build); per-user rate limit 5 exports/hour; global concurrency limit with queueing.
- NFR-4 Verification: load test with the cap-size dataset reporting p50/p95; result attached to release gate.

### 5.5 Retention and deletion (C4)
- FR-9 Exported files containing personal data (masked data is still personal data when pseudonymised) are stored encrypted, accessible to the requester only, and are hard-deleted on the **earlier** of: 30 days after creation (assumed convenience window for BM downloads) or when any contained event reaches 12 months of age. Forensic files follow FR-8.
- FR-10 The platform-wide deletion job must also cover export files, backups (via expiry of backup generation or crypto-shredding), and search indices; deletion is logged.
- FR-11 "Kept forever for audit" is satisfied by the **export audit record** (5.6), which contains no raw IP or username, and therefore may be retained indefinitely/per bank record-retention rule (Q5).
- FR-12 Legal hold: a case-tagged forensic file may be held beyond the limit only with written DPO/legal approval recorded in the audit record (Q5).

### 5.6 Export audit record (kept long term, PII-free)
`export_id, requester_id, role, team_id, period, type (masked|forensic), row_count, sha256 of file, parameters, request/approval IDs, created_at, downloaded_at[], deleted_at, result/error`. Append-only, tamper-evident (hash chain or WORM storage). Requester IDs are internal staff identifiers; confirm they may be retained (Q5).

## 6. Security requirements
- SR-1 Server-side authorization on every request (no trust in UI). Team scope derived from the identity/HR mapping server-side; request parameters cannot carry team IDs (prevents IDOR).
- SR-2 Download endpoint checks owner = authenticated requester; link tokens unguessable, short-lived.
- SR-3 TLS 1.2+ in transit; AES-256 (or bank standard) at rest; keys in KMS/HSM.
- SR-4 No personal data in application logs, error messages or URLs; masking is applied server-side before data is written to the file.
- SR-5 Masking is a property of the export function, not of the UI; test that no unmasked value appears for the BM path (automated test with seeded synthetic data).
- SR-6 Non-prod environments use synthetic data only.
- SR-7 Alerts on anomalies: repeated exports, off-hours exports, export of team the user changed into recently.
- SR-8 Legal basis check: processing of personal data is subject to the Vietnamese personal data protection law and banking IT-safety rules; exact instruments and articles **cần soát lại** by the bank's legal/DPO before release. No article numbers are asserted here.

## 7. Acceptance criteria (testable)
1. BM of team A cannot obtain any row of team B by any parameter manipulation (negative test passes).
2. BM export contains zero strings matching a full IPv4/IPv6 pattern and zero raw usernames (automated scan on seeded data).
3. Cell starting with `=`/`+`/`-`/`@` is neutralised in CSV.
4. Export for cap-size dataset: p95 ≤ 5 s; above cap switches to async.
5. A file past its expiry is not downloadable and is physically deleted; deletion job report shows it.
6. Audit record exists for every request, contains no raw IP/username, and cannot be modified by any application role.
7. Forensic export cannot be downloaded without a second-person approval.
8. Previous-month boundaries correct at UTC+7 (test with events at 23:59:59 and 00:00:00 around month edges, and in January for year rollover).

## 8. Open questions and assumptions

| # | Question to confirm with the customer | Assumption used meanwhile |
|---|---|---|
| Q1 | C1: Which wins, "full IP/usernames for forensics" or "no unmasked personal data leaves the platform"? Is "leaves the platform" = download to a user's device? Is a forensic exception allowed by the bank's policy and law? Who may receive unmasked data? | BM gets masked data only. Unmasked only via the Forensic Export (4-eyes, audited, case-bound), built behind a feature flag that stays OFF until written approval. |
| Q2 | What exactly is "masked"? (Which IP octets, which username characters, pseudonym vs partial mask; does forensic use need reversible tokens?) | IPv4 last octet masked, IPv6 /48 kept; username pseudonym per file. Reversible mapping not provided. |
| Q3 | Is a pseudonymised value acceptable under the data-protection policy (it is still personal data)? | Yes for BM export, treated as personal data for retention and access control. |
| Q4 | Who are "branch managers" and what is "their team" (source of the mapping: HR system, IAM group; handling of transfers, deputies, multi-branch managers)? | Team = members of IAM group mapped to the BM's branch, as of export time; one BM = one team; transferred users appear per the current mapping. |
| Q5 | C4: Which retention applies to what? Do "kept forever" files include personal data? What do banking record-keeping rules and the bank's DPO say about the audit records and legal holds? Which age counts for 12 months (event time or export time)? | Event age. Files with personal data deleted at ≤ 12 months of event age (and ≤ 30 days after creation); PII-free audit record kept indefinitely; legal hold only via DPO written approval. |
| Q6 | C2: Does "everything they can see" mean wider than team/last month (e.g. other systems, other months, log types)? | No. Scope is team + previous month ∩ the user's existing view permissions. Wider ranges are a later change request. |
| Q7 | "Last month": calendar month or last 30 days? Timezone? | Previous calendar month, Asia/Ho_Chi_Minh. |
| Q8 | "Access logs": which log sources and fields? What does "like the old system" mean (column order, names, delimiter, encoding, file naming)? Can we get a sample (synthetic) of the old file? | Columns in 5.2; UTF-8 BOM, comma. |
| Q9 | C3: Expected volume per team-month (rows)? Does 5 s include browser download and masking? Is async acceptable above the cap? | Up to 100,000 rows within 5 s p95 on sync path; async above; 5 s measured server-side-start to download complete on bank LAN. |
| Q10 | Does the export need a second approval or only a notification to the manager's superior/security? ("self-service" suggests none.) | No approval for masked BM export; notification-free but audited. Approval only for forensic. |
| Q11 | Is the export of log data a processing activity needing a data-protection impact assessment, and is cross-border processing or cloud storage involved? | DPIA required before release; no cross-border storage; on-prem/in-country only. |
| Q12 | Which system classification level (information-system security level) applies to the log platform? | Unknown; treated as high-sensitivity until the bank provides its classification file. |
| Q13 | Roles: does a Security/Forensics role exist, who approves, and who is the DPO contact? | Roles as in section 4 are created. |
| Q14 | Can exported files be e-mailed, or stored on endpoints/shared drives? Is endpoint DLP in place? | Download through the platform only; no e-mail; the bank handles endpoint controls. |
| Q15 | Does the platform currently have a deletion job for the 12-month rule, and does it cover backups and indices? | Not assumed to exist; scoped in FR-10. |
| Q16 | Languages and UI text (Vietnamese/English)? Accessibility needs? | Vietnamese primary, English secondary; i18n keys used. |
| Q17 | "Make it simple": confirm that no filters or format options are wanted in v1. | One button, no options. |
| Q18 | Is the audit record allowed to include the requester's staff ID forever? | Yes (internal staff ID, no PII of end customers). |

## 9. Risks
- Building the forensic export without Q1 resolved could breach the bank's own policy: mitigated by the OFF flag.
- 5 s target unverifiable without volume data (Q9).
- "Forever" retention conflicts with deletion duty; if the customer insists on keeping files with personal data forever, that requires a legal ruling and a different design (anonymisation instead of masking).

## 10. Delivery notes
Suggested order: authorization + scope → masking + CSV → audit record → retention job → async path → load test → forensic variant (flagged). Release gate: acceptance criteria 1–8 pass, DPIA done, Q1/Q5 answered in writing.
