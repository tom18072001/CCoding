# Method
- Parsed `transactions.csv`; dropped exact duplicate rows by `txn_id` (5 duplicate rows in the whole file; none conflicted with the first occurrence).
- Kept only `paid` and `refunded` rows; ignored `void` and `pending`.
- Converted `created_at` from UTC to UTC+7 and kept rows dated October 2026 local time. Rows near the month boundaries shift accordingly. For example, refunds created 2026-11-01T11:09Z and 13:40Z fall on 1 Nov local, so they are excluded.
- USD amounts were multiplied by 25,400 using exact decimals. The total was rounded half-up to whole dong at the end (the exact sum was already an integer).
- Result: 32 paid + 2 refunds (T0075, T0076) = 97,306,916 VND. Refunds count in the month the refund row was created, regardless of when the original was paid.
