#!/usr/bin/env python3
"""Tổng hợp kết quả benchmark: python3 report.py RUN [RUN ...] [--json out.json]"""
import json, sys, os, statistics as st, glob

BENCH = os.environ.get('BENCH_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
runs = [a for a in args if a != out_json]

rows = []
for run in runs:
    for f in glob.glob(f'{BENCH}/results/{run}/*/result.json'):
        r = json.load(open(f))
        g = r.get('grade') or {}
        h = g.get('hidden') or {}
        rows.append({
            'run': run, 'task': r['task'], 'system': r['system'], 'rep': r['rep'],
            'status': r['run'].get('status'), 'wall': r['run'].get('wallSec') or 0,
            'cost': r['run'].get('costUsd') or 0,
            'pass': h.get('pass', 0), 'total': h.get('total', 0),
            'perf': g.get('perfMs'), 'visible': (g.get('visible') or {}).get('total', 0),
            'failed': h.get('failed', []), 'audit': len(r.get('audit') or []),
            'tokens': r['run'].get('tokens') or {},
        })

def agg(rs):
    n = len(rs)
    return {
        'n': n,
        'hidden_pct': round(100 * sum(r['pass'] for r in rs) / max(1, sum(r['total'] for r in rs)), 2),
        'full': sum(1 for r in rs if r['total'] and r['pass'] == r['total']),
        'wall_mean': round(st.mean(r['wall'] for r in rs)) if rs else 0,
        'wall_min': min(r['wall'] for r in rs) if rs else 0,
        'wall_max': max(r['wall'] for r in rs) if rs else 0,
        'cost_mean': round(st.mean(r['cost'] for r in rs), 3) if rs else 0,
        'perf': [r['perf'] for r in rs if r['perf']],
        'tests_written': round(st.mean(r['visible'] for r in rs), 1) if rs else 0,
        'failed': sorted({f for r in rs for f in r['failed']})[:8],
        'audit': sum(r['audit'] for r in rs),
        'not_done': sum(1 for r in rs if r['status'] != 'done'),
    }

tasks = sorted({r['task'] for r in rows})
systems = sorted({r['system'] for r in rows}, key=lambda s: (s != 'claude', s))
table = {}
print(f"{'task':12s} {'system':16s} n  hidden%  full  wall(mean/min-max)   cost$   perf(ms)  tests  fails")
for t in tasks:
    for s in systems:
        rs = [r for r in rows if r['task'] == t and r['system'] == s]
        if not rs: continue
        a = agg(rs); table[f'{t}|{s}'] = a
        print(f"{t:12s} {s:16s} {a['n']}  {a['hidden_pct']:6.2f}  {a['full']}/{a['n']}  {a['wall_mean']:4d} ({a['wall_min']}-{a['wall_max']})   {a['cost_mean']:6.3f}  {a['perf']}  {a['tests_written']}  {a['failed'][:3]}")
print()
print(f"{'system':16s} n  hidden%  full   wall_sum_mean  cost_mean  tasks")
overall = {}
for s in systems:
    rs = [r for r in rows if r['system'] == s]
    a = agg(rs)
    # trung bình theo bài để không lệch do số lượt khác nhau
    per_task = [agg([r for r in rs if r['task'] == t]) for t in tasks if any(r['task'] == t for r in rs)]
    overall[s] = {**a, 'wall_task_mean': round(st.mean(p['wall_mean'] for p in per_task)), 'cost_task_mean': round(st.mean(p['cost_mean'] for p in per_task), 3), 'tasks': len(per_task)}
    o = overall[s]
    print(f"{s:16s} {a['n']:2d} {a['hidden_pct']:6.2f}  {a['full']:2d}/{a['n']:<2d}  {o['wall_task_mean']:6d}        {o['cost_task_mean']:6.3f}   {o['tasks']}")
print('\ntổng chi phí các lượt: $%.2f' % sum(r['cost'] for r in rows))
if out_json:
    json.dump({'rows': rows, 'table': table, 'overall': overall}, open(out_json, 'w'), ensure_ascii=False, indent=1)
