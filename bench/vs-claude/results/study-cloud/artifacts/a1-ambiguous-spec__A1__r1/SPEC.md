# Log Export – Implementation Specification

Status: DRAFT, blocked on the customer confirmations in [Open questions and assumptions](#open-questions-and-assumptions).
Customer: Vietnamese bank. Component: log platform.

## 1. Summary

A self-service **Log Export** button lets a branch manager download access logs as CSV. The customer's request contains requirements that cannot all be satisfied literally (see §2). This spec resolves them with a **masked-by-default** export plus a separate, controlled in-platform path for forensic access to unmasked values. Every resolution is listed in "Open questions and assumptions" and must be confirmed before building.

## 2. Conflicts in the request and how this spec resolves them

| # | Request says | Conflicts with | Resolution used here (pending confirmation) |
|---|---|---|---|
| C1 | Exports contain full client IP and usernames | No personal data may leave the platform unmasked | Downloadable CSV is **masked/pseudonymised**. Unmasked values are shown only in an in-platform Forensic View behind approval (§7). |
| C2 | "Team's logs from last month" | "Export everything they can see" | Export = (user's authorised scope) ∩ (filters on screen). Defaults: previous calendar month, the manager's team. Never beyond the user's existing read permissions. |
| C3 | Files kept forever | Delete personal data older than 12 months | Export **file** is purged 12 months after the oldest event it contains. A PII-free **audit manifest** is kept forever (§9). |
| C4 | Done within 5 s | Unknown/unbounded data volume | Streamed download with a row cap sized to the 5 s budget. Over the cap, the export is refused with guidance to narrow filters (§8). |
| C5 | "Like the old system" | Old format undocumented | Column set and format must be supplied by the customer (Q3). Placeholder schema in §6. |
| C6 | "Make it simple" | Controls above | UI stays one button; complexity lives in the backend. |

## 3. Scope

In scope: export button and endpoint, authorisation, masking, CSV generation, export audit trail, retention/purge job, Forensic View gate, metrics and tests.
Out of scope: changes to log ingestion, new log sources, scheduled/recurring exports, formats other than CSV, deletion of data on end-user devices after download.

## 4. Roles and authorisation

- **Branch manager**: may export logs for users/hosts in their own team/branch. Scope is resolved server-side from the org hierarchy, never from client parameters.
- **Other roles** (auditor, security officer, admin): may export only what their existing role already lets them read, and only if they hold the `log.export` permission (default: branch manager only; see Q5).
- Requests for a team or branch outside the caller's scope return **403** and are audited.
- A manager who changes branch loses access to the old team at once. Scope is evaluated per request.
- A team with no records in the period yields a CSV with header only (HTTP 200) and an on-screen notice. It is not an error.

## 5. Functional requirements

- **FR-1** The Log Export button is shown on the access-log view to users holding `log.export`. It is disabled with a tooltip when the result is empty or over the cap.
- **FR-2** Default period: the previous calendar month, `Asia/Ho_Chi_Minh`, from 00:00:00 on the 1st (inclusive) to 00:00:00 on the 1st of the current month (exclusive). The user may narrow the period but cannot exceed the 12-month retention window (§9).
- **FR-3** The export honours the filters currently applied on screen. The UI shows "N rows will be exported" before download.
- **FR-4** The server re-checks authorisation, applies masking, writes the audit record, and streams the CSV. Masking is performed server-side only.
- **FR-5** A file is never produced if masking fails. Failures abort the export (fail closed) with an error and an audit entry.
- **FR-6** Concurrent exports per user: max 2. Rate limit: 10 exports per user per hour (configurable).
- **FR-7** Filename: `access-logs_<scope-id>_<YYYY-MM>_<exportId>.csv`. The filename must not contain usernames or IPs.

## 6. CSV format (placeholder until Q3 is answered)

- Encoding UTF-8 with BOM (so Excel renders Vietnamese diacritics), RFC 4180 quoting, CRLF line endings, header row.
- Timestamps ISO-8601 with `+07:00` offset.
- **CSV/formula injection:** any cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'`. This applies to every text field, since log content is attacker-influenced.

| Column | Content in downloadable (masked) export |
|---|---|
| `timestamp` | event time |
| `user_pseudonym` | `u_` + first 12 hex of HMAC-SHA256(key, username). Stable within a key epoch, so one user's activity can be correlated but not identified. |
| `client_ip_masked` | IPv4: last octet replaced, e.g. `10.20.30.xxx`. IPv6: truncated to /48 and suffixed `::xxxx`. |
| `action`, `resource`, `result` | as in the log |
| `branch_id`, `source_system` | as in the log |

Free-text fields (URLs, user agents, messages) may embed usernames or IPs. They are passed through a PII scrubber (regexes for IPv4/IPv6/emails/known usernames, replaced by the same masks). Any field the scrubber cannot safely handle is dropped. This is a known risk area and needs dedicated tests (§11).

## 7. Forensic access to full values

The customer needs full IP and username for investigations. To honour the "nothing unmasked leaves the platform" policy:

1. A user holding `log.forensic.request` raises a request from the export screen with a free-text justification, an incident/ticket ID and a time/scope window.
2. A second person (security officer, never the requester) approves. Approval expires after 24 h.
3. Approved data opens in an **in-platform Forensic View** (no CSV, no copy-all, view watermarked with the viewer's ID). Each view and each record revealed is audited.
4. If the customer decides the forensic view must be downloadable (Q1), it requires a separate decision. At minimum it would need: dual approval, an encrypted file, a 7-day auto-expiry, and a legal sign-off that this is not "leaving the platform". It is **not** built under this spec.

## 8. Performance (5 seconds)

- Target: p95 ≤ 5 s from click to the last byte, for results up to **100,000 rows** (assumed cap, Q7), measured server-side at the load balancer, under normal load.
- Method: server-side cursor/streaming from an indexed query on (`branch_id`, `timestamp`). No full in-memory buffering. Chunked response with gzip.
- Over the cap: the request is refused with a message telling the user to narrow the period or filters. It is never silently truncated.
- Performance test: seeded dataset of 100k rows (plus 10M background rows), asserting p95 ≤ 5 s over 50 runs. This is a release gate.
- If the real volume exceeds the cap (Q7), the alternative is an asynchronous job with notification. That would change the "within 5 seconds" semantics and needs customer agreement.

## 9. Retention and deletion

- **Source logs:** personal data (username, full IP) older than 12 months is deleted or irreversibly anonymised by a daily job. Cutoff = event time < now − 12 months. Job runs in `Asia/Ho_Chi_Minh`, is idempotent, restartable and reports counts to monitoring. It alerts if it has not completed within 36 h.
- **Export files:** stored encrypted at rest (AES-256, key per environment in the bank's KMS/HSM). A file expires **12 months after the oldest event it contains**, then is deleted by the same job. Because exports are masked/pseudonymised, they are treated as personal data (pseudonymisation is reversible with the key).
- **Pseudonym key:** rotated at a defined interval (Q9). Retired keys are destroyed once no retained file depends on them, which makes older pseudonyms irreversible.
- **Audit manifest (kept forever, contains no personal data):** `exportId`, requesting user ID (staff ID, see Q10), timestamp, scope ID, filters, period, row count, SHA-256 of the file, masking-policy version, outcome. It is append-only and tamper-evident (hash chain). Because the file is deleted but its hash and manifest stay, auditors can prove what was exported without keeping personal data.
- **Backups and replicas:** deletion must propagate within the backup rotation period (Q8). Until then, backups are encrypted and access-restricted.
- **Limit:** once a user downloads a file, the platform cannot delete the local copy. Customer policy (endpoint controls, user attestation) must cover this.

## 10. Non-functional requirements

- **Security:** TLS 1.2+; downloads require an authenticated session; `Cache-Control: no-store`; `Content-Disposition: attachment`; no exports via GET with PII in the URL; CSRF protection on the export action.
- **Audit:** every attempt (success, denial, failure, cap refusal) is logged with a request ID. Audit logs themselves avoid raw PII.
- **Observability:** metrics for export count, duration, row count, denials and purge-job lag. Alert on p95 > 4 s.
- **Compliance mapping** (to be validated by the bank's legal/DPO, Q11): Vietnam Decree 13/2023/ND-CP and the Personal Data Protection Law, the Cybersecurity Law and its implementing decrees on log retention, and State Bank of Vietnam IT-security circulars. This spec makes no legal claim about which retention period governs.
- **Accessibility/i18n:** UI labels in Vietnamese and English.

## 11. Acceptance criteria and tests

1. A manager of team A exports last month: all rows are in team A, none from team B; the period boundaries are correct, including month-end at 23:59:59+07 and the Jan/Dec year rollover.
2. A manager requesting team B gets 403 and an audit entry.
3. No downloadable CSV contains any full IPv4/IPv6 address or any raw username. This is checked by a scanner test over every column, including free-text fields, with seeded adversarial data.
4. Cells starting with `=`, `+`, `-`, `@` are neutralised.
5. Vietnamese diacritics survive the round trip into Excel (BOM test).
6. Empty period gives header-only CSV. A result over the cap is refused, not truncated.
7. Masking failure gives no file and an audit entry.
8. p95 ≤ 5 s at 100k rows (release gate).
9. Purge job: records at 12 months − 1 day are kept, and those at 12 months + 1 day have PII removed. Re-running changes nothing. An expired export file is gone while its manifest remains and its hash verifies the retained records.
10. The Forensic View requires an approver who is not the requester; an expired approval is rejected.
11. The 11th export in an hour is rejected with 429.

## Open questions and assumptions

Each item must be confirmed with the customer before building. The assumption is what the spec uses meanwhile.

| # | Question | Assumption used meanwhile |
|---|---|---|
| Q1 | The request needs **full IP/username** and also **no unmasked personal data leaving the platform**. Which wins? Does "leave the platform" include a download to a manager's laptop? | Downloaded CSV is always masked/pseudonymised. Full values are available only in an approved in-platform Forensic View (§7). Yes, a download to a laptop counts as leaving the platform. |
| Q2 | What exactly counts as "masked" (e.g. last octet, hashed, tokenised)? Is pseudonymisation acceptable, or must data be irreversibly anonymised? | IPv4 last octet masked, IPv6 truncated to /48, usernames replaced by keyed-HMAC pseudonyms (§6). |
| Q3 | What is the format of the "old system" CSV (columns, order, delimiter, encoding, date format)? Must it stay byte-compatible with downstream tooling? | Schema in §6; UTF-8+BOM, comma-delimited, ISO-8601 dates. Column compatibility is not guaranteed. |
| Q4 | "Last month": previous calendar month or the last 30 days? Which timezone? | Previous calendar month, `Asia/Ho_Chi_Minh`, narrowable but never wider than 12 months. |
| Q5 | Who may export besides branch managers (deputies, auditors, security, admins)? How is "their team" defined (org hierarchy source, sub-branches, delegates)? | Only branch managers get `log.export`. Team = the manager's own branch plus direct sub-units from the HR/org directory. Scope is enforced server-side. |
| Q6 | "Export everything they can see" vs "their team's logs": is the intent to allow anything within the user's existing read permissions? | Yes. The export is the intersection of the user's read scope and the on-screen filters. No new data access is granted. |
| Q7 | Expected log volume per team per month and peak concurrency? Must 5 s hold at any size, or is an asynchronous export acceptable above a limit? | 5 s applies up to 100,000 rows. Above that the export is refused with guidance to narrow the filters; no async mode. |
| Q8 | Retention: which rule governs the 12-month deletion (legal basis, per-field or per-record, backups included)? Does "delete" allow irreversible anonymisation that keeps non-personal fields? | Delete or irreversibly anonymise PII fields at event time + 12 months, keep non-PII fields, propagate to backups within the rotation period (assumed ≤ 35 days). |
| Q9 | "Exported files kept forever" vs the 12-month deletion: which takes precedence? Can only the audit metadata be kept forever? | The 12-month deletion takes precedence. Files are purged at 12 months; a PII-free manifest with hash is kept forever (§9). Pseudonym key rotation is annual. |
| Q10 | May the forever-retained audit record contain the exporting **staff member's** identity? (Staff are also data subjects.) | Yes, staff ID only (no name). Legal/DPO to confirm. |
| Q11 | Which regulations and internal policy documents must the design be checked against, and who signs off (DPO, legal, security)? Is a data-protection impact assessment required? | Decree 13/2023/ND-CP, the Personal Data Protection Law, Cybersecurity Law decrees, SBV circulars. Sign-off by the bank's DPO and security officer before go-live. |
| Q12 | Who approves forensic access, what SLA applies, and must the unmasked data be downloadable in exceptional cases? | Security officer approves, 24 h expiry. View-only, no download (§7). |
| Q13 | Is the log data stored on-premises in Vietnam? Any data-localisation or cross-border constraints on where export files and keys live? | All storage and KMS are in the bank's Vietnam environment. |
| Q14 | Rate and concurrency limits, and the required availability of the feature? | 2 concurrent / 10 per hour per user; no separate SLA beyond platform availability. |
| Q15 | What does "simple" mean to the customer: a single click with no dialogs, or is a confirm step for justification acceptable? | One button plus a row-count confirmation. No justification is needed for masked export; justification is needed only for forensic access. |
| Q16 | Is the customer aware that data already downloaded cannot be recalled or deleted by the platform? Is there an endpoint policy to cover it? | Yes, and out of scope for the platform; stated in §9. |

## 12. Delivery notes

- Do not start implementation of §6–§9 until Q1, Q3, Q7 and Q9 are answered; they change the data model and the architecture.
- Suggested order: authorisation and scope, masking library with the PII scanner tests, streaming export, audit manifest, purge job, Forensic View.
