# October 2026 net revenue — method

- Deduplicated by `txn_id` (5 extra rows were exact copies; verified identical).
- Converted `created_at` from UTC to UTC+7 and kept rows falling in 2026-10-01..2026-10-31 local time (so e.g. 2026-10-31T17:00Z onward is November, and 2026-09-30T17:00Z onward is October).
- Kept only `paid` and `refunded`; ignored `void` and `pending`. Refunds count in the month of the refund row itself.
- USD amounts × 25,400 using exact decimals; summed, then rounded half-up to whole VND once at the end.
- Result: 97,306,916 VND from 32 paid and 2 refund transactions; 5 duplicate rows ignored.
