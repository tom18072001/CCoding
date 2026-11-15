# October 2026 net revenue — method

Source: `transactions.csv`. It has 86 lines: 1 header and 85 data rows.

1. **Duplicates.** Five `txn_id`s appear twice, and in each pair the two rows are identical: T0019, T0022, T0057, T0062 and T0079. No `txn_id` has two rows that differ. I kept one row per `txn_id`, which leaves 80 unique rows. `duplicate_rows_ignored = 5`.
2. **Status filter.** I kept only `paid` (always positive) and `refunded` (always negative, with `ref_txn` filled in). I dropped `void` and `pending`, including the T0057 duplicate pair, which is `void`. That leaves 45 unique rows.
3. **Month window (UTC+7).** October 2026 in Vietnam time is `2026-09-30T17:00:00Z` ≤ `created_at` < `2026-10-31T17:00:00Z` in UTC. The rows that test the edges are:
   - Included: T0071 `09-30T17:00:00Z` (Oct 1 00:00 local), T0030 `09-30T20:22Z`, T0042 `10-30T17:06Z`, T0074 `10-31T16:59Z`, T0054 `10-31T11:09Z`.
   - Excluded: T0072 `09-30T16:59:59Z` (Sep 30 local), T0043 `09-30T15:27Z`, T0073 `10-31T17:00Z` (Nov 1 local), and the refunds T0078 and T0079, created on Nov 1 UTC.
4. **Refunds by refund date.** A refund counts in the month its own row was created. T0075 (−941,000, ref T0022) and T0076 (−1,548,500, ref T0024) were created in October, so they count. T0077, T0078, T0079 and T0080 were created in November, so they don't, even though their originals were paid in October.
5. **Currency.** I multiplied USD amounts by 25,400 using exact decimal math and rounded half-up only once, on the final total.

| Component | Rows | Amount |
|---|---|---|
| VND paid | 25 | 60,781,000 |
| USD paid (1,536.04 USD × 25,400) | 7 | 39,015,416 |
| VND refunds | 2 | −2,489,500 |
| **Net** | 32 paid + 2 refunds | **97,306,916 VND** |

The USD total converts to a whole number of dong, so the final half-up rounding doesn't change anything.

Recommended check (needs permission to run Python): read the CSV with `csv` and `decimal.Decimal`, remove duplicates by `txn_id`, add 7 hours to `created_at`, filter on status and month, then sum.
