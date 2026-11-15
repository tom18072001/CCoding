import csv, json
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
rows = list(csv.DictReader(open('transactions.csv', newline='')))
seen = {}; dup = 0; conflicts = []
for r in rows:
    r = {k: (v or '').strip() for k, v in r.items()}
    t = r['txn_id']
    if t in seen:
        dup += 1
        if seen[t] != r: conflicts.append((seen[t], r))
        continue
    seen[t] = r
lo, hi = datetime(2026,10,1), datetime(2026,11,1)
tot = Decimal(0); pc = rc = 0; anomalies = []
for r in seen.values():
    d = datetime.strptime(r['created_at'], '%Y-%m-%dT%H:%M:%SZ') + timedelta(hours=7)
    if not lo <= d < hi: continue
    s = r['status']
    if s not in ('paid', 'refunded'): continue
    a = Decimal(r['amount'])
    if s == 'paid' and a < 0 or s == 'refunded' and a > 0:
        anomalies.append(r)
        a = abs(a) if s == 'paid' else -abs(a)
    if r['currency'] == 'USD': a *= 25400
    elif r['currency'] != 'VND': raise SystemExit('currency ' + r['currency'])
    tot += a
    if s == 'paid': pc += 1
    else: rc += 1
net = int(tot.quantize(Decimal(1), rounding=ROUND_HALF_UP))
print(tot, 'conflicts', conflicts, 'anomalies', anomalies)
json.dump({"net_revenue_vnd": net, "paid_count": pc, "refund_count": rc, "duplicate_rows_ignored": dup}, open('answer.json', 'w'))
