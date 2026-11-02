#!/usr/bin/env python3
"""Xuất dữ liệu benchtest cho phân tích: runs.csv (mỗi lượt), phases.csv (CCoding: theo nhiệm vụ × pha × agent), summary.json.
calls.csv (CCoding: từng lượt gọi agent — token, thời gian, kích thước prompt, lệnh công cụ),
claude_turns.csv (Claude Code: từng lượt mô hình trong phiên — token, công cụ gọi; rút từ claude.jsonl, không chép transcript).
python3 export.py OUT_DIR RUN [RUN ...] --ledger DATA_DIR [--ledger DATA_DIR ...]
DATA_DIR = thư mục data/ của server CCoding đã chạy (usage/ledger.jsonl, runs/<task>/calls.jsonl).
Thư mục kết quả: $BENCH_ROOT/results (mặc định: thư mục cha của harness/)."""
import csv, glob, json, os, sys, statistics as st

BENCH = os.environ.get('BENCH_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
argv = sys.argv[1:]
out = argv[0]
ledgers = [argv[i + 1] for i, a in enumerate(argv) if a == '--ledger']
runs = [a for i, a in enumerate(argv[1:], 1) if not a.startswith('--') and argv[i - 1] != '--ledger']
os.makedirs(out, exist_ok=True)

LABEL = {
    'C1': 'cloud 1/11 tối · CCoding gốc (14e2ec6) · chạy theo cặp',
    'C2': 'cloud 2/11 sáng · bài 5 (CCoding gốc + Claude) và biến thể fast/sonlead 1/11 trước khi chạm hạn mức',
    'C3': 'cloud 2/11 · CCoding cải tiến bước 1 (họp song song, 1 hạng mục cho việc nhỏ, tổng hợp Sonnet)',
    'C4': 'cloud 2/11 · làn nhanh lần 1 — 2 nhiệm vụ CCoding cùng lúc (tranh agent, số đo thời gian nhiễu)',
    'C5': 'cloud 2/11 · làn nhanh + điều phối song song (+ hook stdin từ giữa vòng) vs Claude, mỗi hệ tuần tự · t3 lượt 1 của CCoding bị lỗi treo stdin (579 s)',
    'C6': 'cloud 2/11 · kiểm chứng d7600f6: làn nhanh chạy cùng lúc tối đa 4 hạng mục độc lập (t3, t5)',
}

ledger_rows = {}
for d in ledgers:
    f = os.path.join(d, 'usage', 'ledger.jsonl')
    if os.path.exists(f):
        for line in open(f):
            try:
                r = json.loads(line)
            except Exception:
                continue
            ledger_rows.setdefault(r['taskId'], []).append(r)

def load_calls(tid):
    for d in ledgers:
        f = os.path.join(d, 'runs', tid, 'calls.jsonl')
        if os.path.exists(f):
            out = []
            for line in open(f):
                try:
                    out.append(json.loads(line))
                except Exception:
                    pass
            return out
    return []

def claude_turns(run_dir):
    f = os.path.join(run_dir, 'claude.jsonl')
    if not os.path.exists(f):
        return []
    seen, out = {}, []
    for line in open(f, errors='replace'):
        try:
            m = json.loads(line)
        except Exception:
            continue
        if m.get('type') != 'assistant':
            continue
        msg = m.get('message') or {}
        mid = msg.get('id') or len(out)
        u = msg.get('usage') or {}
        tools = [c.get('name') for c in msg.get('content') or [] if c.get('type') == 'tool_use']
        if mid in seen:  # stream-json tách một lượt thành nhiều dòng theo khối nội dung — gộp lại
            t = out[seen[mid]]
            t['tools'] = '+'.join(x for x in [t['tools'], *tools] if x)
            continue
        seen[mid] = len(out)
        cc = u.get('cache_creation') or {}
        # output_tokens trong dòng stream-json là số lúc bắt đầu luồng, không phải tổng → đặt tên output_partial; tổng đầu ra lấy ở runs.csv
        out.append({'turn': len(out) + 1, 'model': msg.get('model'), 'input': u.get('input_tokens'), 'output_partial': u.get('output_tokens'),
                    'cache_read': u.get('cache_read_input_tokens'), 'cache_write': u.get('cache_creation_input_tokens'),
                    'cache_write_1h': cc.get('ephemeral_1h_input_tokens'), 'cache_write_5m': cc.get('ephemeral_5m_input_tokens'),
                    'tools': '+'.join(t for t in tools if t), 'parent_tool': m.get('parent_tool_use_id') or ''})
    return out

rows, phases, calls, cturns = [], [], [], []
for run in runs:
    for f in sorted(glob.glob(f'{BENCH}/results/{run}/*/result.json')):
        r = json.load(open(f))
        g = r.get('grade') or {}
        h = g.get('hidden') or {}
        t = r['run'].get('tokens') or {}
        row = {
            'run': run, 'run_note': LABEL.get(run, ''), 'task': r['task'], 'system': r['system'], 'rep': r['rep'],
            'status': r['run'].get('status'), 'wall_s': r['run'].get('wallSec'), 'cost_usd': round(r['run'].get('costUsd') or 0, 4),
            'hidden_pass': h.get('pass'), 'hidden_total': h.get('total'), 'visible_tests': (g.get('visible') or {}).get('total'),
            'perf_ms': g.get('perfMs'), 'input': t.get('input'), 'output': t.get('output'), 'cache_read': t.get('cacheRead'),
            'cache_write': t.get('cacheWrite'), 'task_id': r['run'].get('taskId', ''), 'failed_hidden': ' | '.join(h.get('failed', [])[:5]),
            'audit_hits': len(r.get('audit') or []), 'started': r.get('startedAt'),
        }
        rows.append(row)
        if r['system'] == 'claude':
            for t in claude_turns(os.path.dirname(f)):
                cturns.append({'run': run, 'task': r['task'], 'rep': r['rep'], **t})
        tid = r['run'].get('taskId')
        if tid and tid in ledger_rows:
            agg = {}
            for x in ledger_rows[tid]:
                k = (x['phase'], x['agentId'], x.get('model', ''))
                a = agg.setdefault(k, {'calls': 0, 'sec': 0.0, 'input': 0, 'output': 0, 'cache_read': 0, 'cache_write': 0, 'cost_usd': 0.0})
                a['calls'] += 1
                a['sec'] += (x.get('durationMs') or 0) / 1000
                a['input'] += x.get('input') or 0
                a['output'] += x.get('output') or 0
                a['cache_read'] += x.get('cacheRead') or 0
                a['cache_write'] += x.get('cacheWrite') or 0
                a['cost_usd'] += x.get('costUsd') or 0
            for c in load_calls(tid):
                sz = c.get('sizes') or {}
                tools = c.get('tools') or []
                calls.append({'run': run, 'task': r['task'], 'system': r['system'], 'rep': r['rep'], 'task_id': tid, 'seq': c.get('seq'),
                              'ts': c.get('ts'), 'phase': c.get('phase'), 'agent': c.get('agentId'), 'subtask': c.get('subtaskId', ''),
                              'model': c.get('model'), 'requested_model': c.get('requestedModel'), 'input': c.get('input'), 'output': c.get('output'),
                              'cache_read': c.get('cacheRead'), 'cache_write': c.get('cacheWrite'), 'cost_usd': round(c.get('costUsd') or 0, 5),
                              'duration_s': round((c.get('durationMs') or 0) / 1000, 1), 'tool_calls': c.get('toolCalls', len(tools)),
                              'system_chars': sz.get('system'), 'context_chars': sz.get('context'), 'prompt_chars': sz.get('prompt'),
                              'tool_output_chars': sum(t.get('outputChars') or 0 for t in tools), 'max_tokens': c.get('maxTokens'),
                              'retries': len(c.get('attempts') or []), 'text_chars': len(c.get('text') or '')})
            for (ph, ag, model), a in agg.items():
                phases.append({'run': run, 'task': r['task'], 'system': r['system'], 'rep': r['rep'], 'task_id': tid, 'phase': ph, 'agent': ag, 'model': model,
                               **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in a.items()}})

with open(os.path.join(out, 'runs.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator='\n')
    w.writeheader(); w.writerows(rows)
with open(os.path.join(out, 'phases.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(phases[0].keys()), lineterminator='\n')
    w.writeheader(); w.writerows(phases)

with open(os.path.join(out, 'calls.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(calls[0].keys()), lineterminator='\n')
    w.writeheader(); w.writerows(calls)

if cturns:
    with open(os.path.join(out, 'claude_turns.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(cturns[0].keys()), lineterminator='\n')
        w.writeheader(); w.writerows(cturns)

def agg(rs):
    rs = [r for r in rs if r['status'] in ('done', 'failed') and r['hidden_total']]
    if not rs: return None
    return {'n': len(rs), 'hidden_pct': round(100 * sum(r['hidden_pass'] for r in rs) / sum(r['hidden_total'] for r in rs), 2),
            'full_pass': sum(1 for r in rs if r['hidden_pass'] == r['hidden_total']),
            'wall_mean_s': round(st.mean(r['wall_s'] for r in rs), 1), 'wall_min_s': min(r['wall_s'] for r in rs), 'wall_max_s': max(r['wall_s'] for r in rs),
            'cost_mean_usd': round(st.mean(r['cost_usd'] for r in rs), 3),
            'tokens_mean': {k: round(st.mean((r[k] or 0) for r in rs)) for k in ('input', 'output', 'cache_read', 'cache_write')}}
summary = {}
for run in runs:
    for task in sorted({r['task'] for r in rows if r['run'] == run}):
        for system in sorted({r['system'] for r in rows if r['run'] == run and r['task'] == task}):
            a = agg([r for r in rows if r['run'] == run and r['task'] == task and r['system'] == system])
            if a: summary.setdefault(run, {}).setdefault(task, {})[system] = a
json.dump({'labels': {k: v for k, v in LABEL.items() if k in runs}, 'summary': summary}, open(os.path.join(out, 'summary.json'), 'w'), ensure_ascii=False, indent=1)
def fmt_k(x): return f'{x/1000:.0f}k' if x >= 1000 else str(x)
md = ['# Kết quả benchtest CCoding vs Claude Code thuần', '', 'Sinh tự động bởi `harness/export.py` — số trung bình theo lượt; thời gian = từ lúc bắt đầu tới lúc xong (giây);',
      'chi phí = giá niêm yết quy đổi do Claude Code báo (gói Max không trả theo token); token = trung bình mỗi lượt.', '']
for run in runs:
    if run not in summary: continue
    md += [f'## {run} — {LABEL.get(run, "")}', '', '| Bài | Hệ | n | Test ẩn | Đạt trọn | Thời gian TB (min–max) | Chi phí TB | Đầu ra | Đọc cache | Ghi cache |', '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|']
    for task, v in summary[run].items():
        for system, a in sorted(v.items(), key=lambda x: (x[0] != 'claude', x[0])):
            tk = a['tokens_mean']
            md.append(f"| {task} | {system} | {a['n']} | {a['hidden_pct']}% | {a['full_pass']}/{a['n']} | {a['wall_mean_s']:.0f} ({a['wall_min_s']:.0f}–{a['wall_max_s']:.0f}) s | ${a['cost_mean_usd']:.2f} | {fmt_k(tk['output'])} | {fmt_k(tk['cache_read'])} | {fmt_k(tk['cache_write'])} |")
    md.append('')
md += ['## Từng lượt', '', '| Vòng | Bài | Hệ | Lượt | Trạng thái | Thời gian | Chi phí | Test ẩn | perf (ms) | Nhiệm vụ CCoding |', '|---|---|---|--:|---|--:|--:|--:|--:|---|']
for r in rows:
    md.append(f"| {r['run']} | {r['task']} | {r['system']} | {r['rep']} | {r['status']} | {r['wall_s']} s | ${r['cost_usd']:.2f} | {r['hidden_pass']}/{r['hidden_total']} | {r['perf_ms'] or ''} | {r['task_id']} |")
open(os.path.join(out, 'REPORT.md'), 'w').write('\n'.join(md) + '\n')
print(f'{len(rows)} lượt, {len(phases)} dòng pha, {len(calls)} lượt gọi agent, {len(cturns)} lượt mô hình Claude Code → {out}')
