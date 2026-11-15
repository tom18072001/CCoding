# Method
- Parsed transactions.csv; deduplicated by `txn_id` (duplicates verified to be exact copies; each extra row counts in `duplicate_rows_ignored`, whole file).
- Converted `created_at` (UTC) to UTC+7 and kept only October 2026 local time (2026-09-30T17:00Z up to 2026-10-31T16:59:59Z).
- Kept `paid` and `refunded` only (void/pending ignored). Refunds count in the month of their own row, regardless of the original.
- USD x 25,400 using Decimal (exact); summed, rounded half-up to whole dong once at the end.
