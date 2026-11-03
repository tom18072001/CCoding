// B-13 (model + token theo pha), B-12 (bộ đọc gate.decision), B-16 (arm B7cabO, bộ bài g1–g6). Dữ liệu giả, không gọi LLM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gateDecisions, researchFields } from '../lib/ccoding.mjs';
import { checkArms, suiteTaskIds } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));
const { _suites: SUITES, ...ARMS } = RAW;
const line = (o) => JSON.stringify(o);

test('B-13: model và đủ bốn thành phần token + ms theo pha; trường cũ giữ nguyên', () => {
  const calls = [
    line({ ts: '2026-11-03T00:00:10Z', phase: 'execute', model: 'sonnet', durationMs: 4000, input: 10, output: 2, cacheRead: 5, cacheWrite: 1 }),
    line({ ts: '2026-11-03T00:00:20Z', phase: 'execute', model: 'sonnet', durationMs: 1500, input: 1, output: 1, cacheRead: 9, cacheWrite: 0 }),
    line({ ts: '2026-11-03T00:00:30Z', phase: 'accept', model: 'opus', durationMs: 2000, input: 3, output: 4, cacheRead: 0, cacheWrite: 2 }),
  ].join('\n');
  const r = researchFields(calls, {});
  assert.deepEqual(r.byPhaseDetail.execute, { calls: 2, input: 11, cacheRead: 14, cacheWrite: 1, output: 3, ms: 5500 });
  assert.deepEqual(r.byPhaseModel, { execute: ['sonnet'], accept: ['opus'] });
  assert.deepEqual(r.models, ['sonnet', 'opus']);
  assert.deepEqual(r.byPhaseTokens.execute, { input: 11, output: 3, cacheRead: 14, cacheWrite: 1 }); // trường B-11 không đổi
  assert.deepEqual(r.byPhaseSec, { execute: 5.5, accept: 2 });
});

test('B-13: dữ liệu cũ (không model, không events) vẫn chạy, gates null', () => {
  const r = researchFields(line({ ts: '2026-11-03T00:00:10Z', phase: 'plan', input: 1 }), {});
  assert.deepEqual(r.byPhaseModel, {});
  assert.deepEqual(r.models, []);
  assert.deepEqual(r.gates, { b02: null, b10: null, cto: null });
});

test('B-12: gateDecisions đọc data hoặc ngang hàng, bỏ dòng hỏng và sự kiện khác', () => {
  const ev = [
    line({ kind: 'task.start' }),
    'dòng hỏng',
    line({ kind: 'gate.decision', data: { gate: 'b02', verdict: 'block', rounds: 1, subtaskId: 's1' } }),
    line({ kind: 'gate.decision', data: { gate: 'b02', verdict: 'block', rounds: 2 } }),
    line({ kind: 'gate.decision', data: { gate: 'b02', verdict: 'pass' } }),
    line({ kind: 'gate.decision', gate: 'b10', verdict: 'pass' }),
    line({ kind: 'gate.decision', data: { gate: 'cto', verdict: 'block' } }),
    line({ kind: 'gate.decision', data: { gate: 'cto', verdict: 'pass' } }),
    line({ kind: 'gate.decision', data: { gate: 'zzz', verdict: 'block' } }),
  ].join('\n');
  assert.deepEqual(gateDecisions(ev), { b02: { blocked: true, rounds: 2 }, b10: { blocked: false }, cto: { pass: true } });
});

test('B-12: thiếu dữ liệu → null từng cổng', () => {
  assert.deepEqual(gateDecisions(''), { b02: null, b10: null, cto: null });
  assert.deepEqual(gateDecisions(undefined), { b02: null, b10: null, cto: null });
  const only = gateDecisions(line({ kind: 'gate.decision', data: { gate: 'cto', verdict: 'block' } }));
  assert.deepEqual(only, { b02: null, b10: null, cto: { pass: false } });
});

test('B-12: researchFields nhận events.jsonl làm tham số thứ ba', () => {
  const ev = line({ kind: 'gate.decision', data: { gate: 'b10', verdict: 'block' } });
  assert.deepEqual(researchFields('', {}, ev).gates.b10, { blocked: true });
});

test('B-16: arm B7cabO parse được — làn đơn, nghiệm thu brief, phaseModels.accept = opus; B7cab không đổi', () => {
  const a = ARMS.B7cabO;
  assert.equal(a.kind, 'ccoding');
  assert.equal(a.options.lane, 'single');
  assert.equal(a.options.slim.accept, 'brief');
  assert.equal(a.options.phaseModels.accept, 'opus');
  assert.deepEqual(Object.keys(a.options.phaseModels), ['accept']);
  assert.equal(ARMS.B7cab.options.phaseModels, undefined);
  assert.deepEqual(checkArms(['B7cabO'], ARMS, ['single', 'fast']), []);
});

test('B-12: _suites.gates khớp bảng tên g1–g6 và lọc đúng bài; mọi khóa còn lại trong arms.json vẫn là arm', () => {
  const k = SUITES.gates.kinds;
  assert.deepEqual([k['red-check'], k['plan-omission'], k['hidden-wrong']].map((x) => x.expectGate), ['b02', 'b10', 'cto']);
  assert.deepEqual(k['red-check'].prefixes, ['g1-', 'g2-']);
  assert.deepEqual(SUITES.gates.selfTestArms, ['oracle', 'null']);
  for (const a of SUITES.gates.selfTestArms.concat(SUITES.gates.pilotArms)) assert.ok(ARMS[a], a);
  const all = ['c1-iis-ecs', 'g1-red', 'g2-red', 'g3-omit', 'g5-hidden', 'g6-hidden', 'g10-x', 't1-duration'];
  assert.deepEqual(suiteTaskIds(SUITES, 'gates', all), ['g1-red', 'g2-red', 'g3-omit', 'g5-hidden', 'g6-hidden']);
  assert.throws(() => suiteTaskIds(SUITES, 'nope', all), /Không có bộ bài/);
  for (const [id, v] of Object.entries(ARMS)) assert.ok(v.kind, id);
});

test('B-13: dòng runs.jsonl dạng cũ (byPhase là số, không model/gates) vẫn chạy qua analyze.mjs', async () => {
  const { spawnSync } = await import('node:child_process');
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b13-'));
  try {
    const old = (arm, score) => line({ key: `t1-duration__${arm}__r1`, task: 't1-duration', category: 'code', size: 'S', arm, rep: 1, at: '2026-11-03T00:00:00Z', status: 'done', wallSec: 10, tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, total: 2, weighted: 6 }, costUsd: 0, turns: 1, calls: 1, byPhase: { execute: 6 }, leak: false, score, pass: score >= 1, formatMiss: false });
    fs.writeFileSync(path.join(dir, 'runs.jsonl'), `${old('A0-sonnet', 1)}\n${old('B0', 0.5)}\n`);
    const r = spawnSync(process.execPath, [path.join(SUITE, 'analyze.mjs'), dir], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
