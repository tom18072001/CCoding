# Method
- Parsed `transactions.csv`; dropped exact duplicate rows by `txn_id` (5 duplicate rows in the file, none conflicting).
- Converted `created_at` (UTC) to UTC+7 and kept rows in October 2026 local time (so e.g. 2026-10-31T17:00Z is already November).
- Counted only `paid` and `refunded` rows; `void`/`pending` ignored. Refunds count in the month of the refund row.
- USD x 25,400 using Decimal (exact), summed, rounded half-up at the end.
- Result: 32 paid, 2 refunds (T0075, T0076), net 97,306,916 VND. Refunds dated in November (T0077-T0080) are excluded.
