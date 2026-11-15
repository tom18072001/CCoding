# Net revenue, October 2026 (Vietnam time)

Result: 97,306,916 VND from 32 paid and 2 refund transactions. 5 duplicate rows were ignored. See `answer.json`.

Method:
- Parsed `transactions.csv` and de-duplicated by `txn_id`. Every repeated `txn_id` was an exact duplicate row; the script asserts this. 5 extra rows were dropped (counted over the whole file).
- Kept only `paid` and `refunded` rows. `void` and `pending` are ignored.
- Converted `created_at` from UTC to UTC+7 and kept rows dated 2026-10-01 to 2026-10-31 local.
  - 2026-09-30T17:00Z to 2026-09-30T23:59Z counts as October. Example: T0071 and T0030.
  - 2026-10-31T17:00Z counts as November. Example: T0073.
- Refunds count in the month of the refund row, whatever the month of the original payment. Refunds dated in November are excluded.
- USD amounts were multiplied by 25,400 using exact `Decimal` arithmetic. The total was rounded half-up to whole dong once, at the end.
- Refund amounts are already negative and were summed as given. `ref_txn` is not needed for the total.
