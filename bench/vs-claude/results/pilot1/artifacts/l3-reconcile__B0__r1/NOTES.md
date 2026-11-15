# October 2026 net revenue (Ho Chi Minh City, UTC+7)

**Result: 97,306,916 VND** (32 paid, 2 refunds, 5 duplicate rows ignored).

## Method
- Window: `created_at` (UTC) in [2026-09-30T17:00:00Z, 2026-10-31T17:00:00Z), start inclusive, end exclusive = 1 Oct 00:00 to 31 Oct 24:00 Vietnam time.
- Statuses: only `paid` and `refunded` are counted; `void` and `pending` are ignored. A refund counts in the month of the refund row itself. Refund amounts are already negative and were not sign-flipped.
- Dedup: rows identical in all columns are duplicates. 85 data rows, 80 distinct, so 5 duplicate rows (whole file, no month filter): T0062, T0019, T0057, T0079, T0022. No txn_id appears with differing content. Each txn_id is counted once.
- FX: USD x 25,400 VND. Python `Decimal` from the original strings (no float); everything summed exactly, rounded half-up to whole dong once at the end.

## Intermediate figures
- Paid VND: 60,781,000
- Paid USD: 1,536.04 (= 39,015,416 VND)
- Refunds: -2,489,500 VND (no USD refunds in window)
- Exact total before rounding: 97,306,916.00

## Boundary cases
- Excluded: T0072 (09-30T16:59:59Z), T0043 (09-30T15:27Z), T0073 (10-31T17:00:00Z); refunds T0078, T0079 (01 Nov Vietnam time), T0077, T0080 (November).
- Included: T0071 (09-30T17:00:00Z), T0030 (09-30T20:22Z), T0074 (10-31T16:59Z).

## Counted transactions
Paid (32): T0002, T0005, T0007, T0009, T0013, T0014, T0015, T0016, T0018, T0019, T0020, T0022, T0024, T0028, T0030, T0033, T0034, T0036, T0037, T0038, T0042, T0047, T0050, T0054, T0058, T0060, T0061, T0062, T0063, T0067, T0071, T0074

Refunds (2): T0075 (ref T0022), T0076 (ref T0024); both reference existing transactions.
