# Method
- Parsed `transactions.csv`; deduplicated by `txn_id` (5 exact duplicate rows ignored; no conflicting duplicates found).
- Converted `created_at` (UTC) to UTC+7 and kept October 2026 (local) rows only.
- Kept `paid` and `refunded` rows only (`void`/`pending` ignored). Refunds count in their own creation month, using their negative amounts as given.
- USD x 25,400 VND using exact Decimal arithmetic; rounded half-up once at the end (the total was already a whole number).
- Result: 32 paid, 2 refunds, net 97,306,916 VND.
