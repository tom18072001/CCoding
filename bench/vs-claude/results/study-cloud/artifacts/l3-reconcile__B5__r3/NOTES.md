# Method
- Deduplicated by `txn_id` (5 duplicate rows; all were exact copies, verified).
- Converted `created_at` (UTC) to UTC+7, kept 2026-10-01..2026-10-31 local (boundary rows shift by the offset).
- Kept `paid` and `refunded` only; ignored `void`/`pending`. Refunds counted by their own row date, not the original's.
- USD x 25,400 using exact Decimal arithmetic; round half-up only at the end.
- Result: 32 paid, 2 refunds, net 97,306,916 VND.
