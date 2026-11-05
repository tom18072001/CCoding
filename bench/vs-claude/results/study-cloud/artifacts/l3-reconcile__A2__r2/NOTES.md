# Method
- Parsed `transactions.csv`; deduplicated by `txn_id` (5 duplicate rows, all exact copies; none conflicting).
- Converted `created_at` from UTC to UTC+7 and kept rows dated 2026-10-01..2026-10-31 local.
- Counted only `paid` and `refunded` rows. `void` and `pending` were ignored. Refunds count in the month of the refund row, so refunds created in November (e.g. T0079, T0078, T0080, T0077) are excluded.
- USD amounts were multiplied by 25,400 using exact Decimal arithmetic. The total was rounded half-up once, at the end.
- Result: 32 paid, 2 refunds (T0075, T0076), net 97,306,916 VND.
