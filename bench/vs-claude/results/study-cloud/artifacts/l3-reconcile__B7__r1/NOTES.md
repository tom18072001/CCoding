# October 2026 net revenue — method

**Result:** 97,306,916 VND net · 32 paid · 2 refunds · 5 duplicate rows ignored.

## Steps
1. **De-duplicate.** The file has 85 data rows. 5 are exact copies of an earlier row
   (T0019, T0022, T0057, T0062, T0079), which leaves 80 distinct `txn_id`s (T0001–T0080).
   Each `txn_id` is counted once.
2. **Month window (Vietnam time, UTC+7).** October 2026 local time is
   `2026-09-30T17:00:00Z` ≤ `created_at` < `2026-10-31T17:00:00Z` in UTC.
   Edge cases:
   - T0071 `09-30T17:00:00Z` = 1 Oct 00:00 local → **in**
   - T0030 `09-30T20:22Z` → **in**
   - T0072 `09-30T16:59:59Z` and T0043 `09-30T15:27Z` → still 30 Sep local → **out**
   - T0074 `10-31T16:59Z` = 31 Oct 23:59 local → **in**
   - T0073 `10-31T17:00Z` = 1 Nov 00:00 local → **out**
   - T0042, T0007, T0014 are on an earlier UTC date but already the next local day. They are still in October either way.
3. **Statuses.** Only `paid` and `refunded` rows are kept. `void` and `pending` rows are dropped.
   A refund counts in the month its own row was created. Its original's date does not matter.
   - In October: T0075 (−941,000 VND, refunds T0022) and T0076 (−1,548,500 VND, refunds T0024).
   - Out (created in November local time): T0077, T0078, T0079, T0080. T0079 refunds T0020 and T0080 refunds T0074. Those originals were paid in October, but the refunds still fall in November.
4. **Currency.** All USD amounts are added first: 1,536.04 USD from 7 October paid rows. That total is then
   multiplied by 25,400, which gives exactly 39,015,416 VND. Rounding half-up to whole dong happens only at the
   end, and this total needs none.

## Totals
| Component | VND |
|---|---|
| Paid, VND currency (25 txns) | 60,781,000 |
| Paid, USD currency (7 txns, 1,536.04 USD × 25,400) | 39,015,416 |
| Refunds (2 txns) | −2,489,500 |
| **Net** | **97,306,916** |
