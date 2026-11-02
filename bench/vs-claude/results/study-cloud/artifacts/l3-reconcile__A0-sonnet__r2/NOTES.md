# Method
- Parsed `transactions.csv`; deduplicated by `txn_id` (5 duplicate rows, all exact copies; no conflicting duplicates).
- Kept only `paid` and `refunded` rows; ignored `void`/`pending`.
- Converted `created_at` from UTC to UTC+7 and kept rows falling in 2026-10 (so e.g. 17:00Z on Sep 30 counts as Oct 1, and 17:00Z on Oct 31 falls in Nov).
- Refunds count by their own row date, not the original's.
- USD amounts x 25,400 using exact decimals; summed exactly, rounded half-up once at the end.
- Result: 32 paid + 2 refunds, net 97,306,916 VND.
