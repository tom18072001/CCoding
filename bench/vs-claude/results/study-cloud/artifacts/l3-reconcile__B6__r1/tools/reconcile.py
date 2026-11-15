import csv,json,sys
from decimal import Decimal,ROUND_HALF_UP
from datetime import datetime,timedelta,timezone
rows=list(csv.DictReader(open('transactions.csv',newline='')))
seen={};dup=0;conf=0
for r in rows:
    r={k:(v or '').strip() for k,v in r.items()}
    if r['txn_id'] in seen:
        dup+=1
        if seen[r['txn_id']]!=r: conf+=1
    else: seen[r['txn_id']]=r
tz=timezone(timedelta(hours=7));tot=Decimal(0);p=rf=0
for r in seen.values():
    t=datetime.strptime(r['created_at'],'%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).astimezone(tz)
    if not(t.year==2026 and t.month==10): continue
    s=r['status'].lower();a=Decimal(r['amount'])
    if r['currency'].upper()=='USD': a*=Decimal(25400)
    if s=='paid': assert a>0;p+=1
    elif s=='refunded': assert a<0;rf+=1
    else: continue
    tot+=a
out={"net_revenue_vnd":int(tot.quantize(Decimal(1),ROUND_HALF_UP)),"paid_count":p,"refund_count":rf,"duplicate_rows_ignored":dup}
json.dump(out,open('answer.json','w'));print(out,"exact",tot,"conflicting dups",conf,"rows",len(rows))
