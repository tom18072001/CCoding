# Net revenue, October 2026 (Vietnam time)

Result: 97,306,916 VND from 32 paid and 2 refund transactions. 5 duplicate rows were ignored (see `answer.json`).

Method (Python, `decimal`, no floats):
1. Dropped repeated `txn_id` rows. All 5 repeats were exact copies, and none conflicted. 85 data rows gave 80 distinct transactions.
2. Shifted `created_at` (UTC) by +7h and kept rows dated 2026-10 in that local time. Rows from 2026-09-30 17:00Z through 2026-10-31 16:59:59Z qualify. For example, 2026-09-30T16:59:59Z is still September locally.
3. Kept only `paid` (amount > 0) and `refunded` (amount < 0). Ignored `void` and `pending`.
4. Refunds count in the month of the refund row, so refunds of October payments made in November are excluded (T0078, T0079, T0077, T0080). Refunds are not matched to their originals.
5. Converted USD at 25,400 VND per USD, summed exactly, and rounded half-up once at the end. The exact sum was 97,306,916.00, so no rounding was needed.

Assumptions: `duplicate_rows_ignored` is the number of surplus rows over the whole file (rows minus distinct `txn_id`s). Amounts are taken as signed as given, and the script asserts paid > 0 and refunded < 0.
