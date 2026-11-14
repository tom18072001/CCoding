// [B-13] app: tỉ lệ trúng cache theo lượt gọi, pha, runtime + trường mới trong KPI v2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheHit, cacheReport, computeKpi, type CallRow } from '../src/kpi.js';
import { testApp } from './helpers.js';

const row = (p: Partial<CallRow>): CallRow => ({ ts: '', callId: `c${Math.random()}`, taskId: 'T1', department: 'dev', agentId: 'backend-dev', phase: 'execute', runtime: 'claude-cli', model: 'claude-x', input: 0, output: 10, cacheRead: 0, cacheWrite: 0, durationMs: 1, ...p });

// calls.jsonl giả: tính tay
//  execute/claude-cli: (read 900, write 100, input 0) và (read 500, write 0, input 500) → 1400/2000 = 70%
//  review/ollama: (read 0, write 0, input 300) → 0%
//  plan/ollama: toàn 0 → null
const calls: CallRow[] = [
  row({ cacheRead: 900, cacheWrite: 100, input: 0 }),
  row({ cacheRead: 500, cacheWrite: 0, input: 500 }),
  row({ phase: 'review', runtime: 'ollama', model: 'qwen', input: 300 }),
  row({ phase: 'plan', runtime: 'ollama', model: 'qwen', input: 0 }),
];

test('cacheHit: mẫu số 0 trả null, ca thường đúng công thức', () => {
  assert.equal(cacheHit({ input: 0, cacheRead: 0, cacheWrite: 0 }), null);
  assert.equal(cacheHit({}), null);
  assert.equal(cacheHit({ input: 100, cacheRead: 300, cacheWrite: 100 }), 0.6);
  assert.equal(cacheHit({ input: 50, cacheRead: 0 }), 0);
});

test('cacheReport: gộp theo pha và runtime khớp tính tay (sai số ≤ 0,1 điểm %)', () => {
  const r = cacheReport(calls);
  const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a * 100 - b) <= 0.1, `${a} vs ${b}%`);
  near(r.byPhase.execute.hit, 70);
  near(r.byPhase.review.hit, 0);
  assert.equal(r.byPhase.plan.hit, null);
  near(r.byRuntime['claude-cli'].hit, 70);
  near(r.byRuntime.ollama.hit, 0);
  near(r.hit, (1400 / 2300) * 100);
  assert.equal(r.calls_.length, 4);
  assert.equal(r.calls_[3].hit, null);
  assert.equal(r.calls_[0].hit, 0.9);
  // chỉ số token và tên model, không có nội dung
  assert.ok(!('text' in r.calls_[0]));
});

test('KPI v2: có trường cache theo agent và toàn báo cáo', () => {
  const app = testApp();
  const rep = computeKpi({
    tasks: [{ id: 'T1', title: 'T1', status: 'done', createdAt: '2026-11-01T00:00:00Z', updatedAt: '', options: {}, runs: [] }] as never,
    calls: () => calls,
    transcript: () => [],
    project: () => undefined,
    agent: (id) => app.registry.agents.get(id),
    access: () => 'exec',
  });
  const k = rep.agents.find((a) => a.agentId === 'backend-dev')!;
  assert.ok(k.cache);
  assert.equal(k.cache!.byPhase.execute.cacheRead, 1400);
  assert.ok(Math.abs(k.cache!.byRuntime['claude-cli'].hit! - 0.7) < 1e-9);
  assert.ok(rep.cache && Math.abs(rep.cache.hit! - 1400 / 2300) < 1e-9);
});
