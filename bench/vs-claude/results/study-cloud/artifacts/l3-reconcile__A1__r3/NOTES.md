# October 2026 net revenue – method

- Parsed `transactions.csv`, deduplicated by `txn_id` (asserted that repeated ids are exact duplicate rows). `duplicate_rows_ignored` = total rows − distinct ids = 5 (whole file).
- Kept only `paid` and `refunded`; `void` and `pending` ignored.
- `created_at` (UTC) converted to UTC+7; kept rows whose local date is in October 2026, i.e. `2026-09-30T17:00Z` ≤ t < `2026-10-31T17:00Z`. Boundary rows (T0071, T0074) are included.
- Refunds are counted by the refund row's own timestamp, not the original's. Their amounts are already negative, so they are summed as-is. Refunds dated 1 Nov local or later (T0078, T0079, T0080) are excluded.
- USD amounts × 25,400 using `Decimal` (exact); rounded half-up to whole dong once at the end (the total happened to be an exact integer).
- Result: net revenue 97,306,916 VND; 32 paid, 2 refunds, 5 duplicate rows. Written to `answer.json`.
