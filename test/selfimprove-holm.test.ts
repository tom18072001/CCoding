import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, holmAdjust, tCdf, type AbRun } from '../src/selfimprove.js';

const close = (a: number, b: number, tol: number, msg = ''): void => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

const mk = (n: number, f: (t: number, arm: 'A' | 'B') => { tokens: number; wallSec: number; safety: number }): AbRun[] =>
  Array.from({ length: n }, (_, t) => (['A', 'B'] as const).map((arm) => ({ phase: 'confirm' as const, task: `t${t}`, arm, ...f(t, arm) }))).flat();

test('Holm: tính tay 0,01/0,03/0,04 → 0,03/0,06/0,06 (giữ thứ tự đầu vào)', () => {
  const r = holmAdjust([0.01, 0.03, 0.04]);
  [0.03, 0.06, 0.06].forEach((v, i) => close(r[i], v, 1e-12));
  const shuffled = holmAdjust([0.04, 0.01, 0.03]);
  [0.06, 0.03, 0.06].forEach((v, i) => close(shuffled[i], v, 1e-12));
});

test('Holm: chặn trên ở 1 và đơn điệu', () => {
  assert.deepEqual(holmAdjust([0.5, 0.6, 0.9]), [1, 1, 1]);
  close(holmAdjust([0.4, 0.001, 0.2])[1], 0.003, 1e-12);
});

test('CDF t khớp bảng: t(0,975; df)', () => {
  close(tCdf(0, 5), 0.5, 1e-12);
  close(tCdf(2.2281, 10), 0.975, 2e-5, 'df=10');
  close(tCdf(2.0452, 29), 0.975, 2e-5, 'df=29');
  close(tCdf(12.7062, 1), 0.975, 2e-5, 'df=1');
  close(tCdf(1.6449, 1e6), 0.95, 1e-4, 'df lớn ~ chuẩn');
  close(tCdf(-2.5706, 5), 0.025, 2e-5, 'đối xứng');
  assert.equal(tCdf(Infinity, 3), 1);
});

test('Holm đạt nhưng Bonferroni không đạt; có pRaw/pHolm', () => {
  const noise = [0.9, -0.5, 0.3, -1.1, 0.7, -0.2, 1.0, -0.8];
  const runs = mk(8, (t, arm) => ({
    tokens: 1000 * (arm === 'B' ? 0.93 * Math.exp(noise[t] * 0.03) : 1),
    wallSec: 100 * (arm === 'B' ? 0.9 * Math.exp(noise[t] * 0.02) : 1),
    safety: 0.95 + (arm === 'B' ? 0.02 + noise[t] * 0.01 : 0),
  }));
  const d = decide(runs);
  const raw = [d.pRaw.token, d.pRaw.time, d.pRaw.safety].sort((a, b) => a - b);
  assert.ok(d.pHolm.token >= d.pRaw.token && d.pHolm.time >= d.pRaw.time && d.pHolm.safety >= d.pRaw.safety);
  assert.ok(raw[2] > 0.05 / 3 && raw[2] < 0.05, `p thô lớn nhất ${raw[2]} phải nằm trong (0,0167; 0,05)`);
  assert.equal(d.decision, 'pass', d.reasons.join(';'));
  assert.ok(Math.max(d.pHolm.token, d.pHolm.time, d.pHolm.safety) < 0.05);
  assert.ok(raw[2] * 3 > 0.05, 'Bonferroni (3·p) sẽ không bác bỏ');
});

test('decide: quy tắc and — một chỉ số không đạt thì fail', () => {
  const good = decide(mk(10, (t, arm) => ({ tokens: 1000 * (arm === 'B' ? 0.8 + t * 0.001 : 1), wallSec: 100 + t, safety: 0.9 + (arm === 'B' ? 0.01 : 0) + t * 0.0001 })));
  assert.equal(good.decision, 'pass', good.reasons.join(';'));
  const bad = decide(mk(10, (t, arm) => ({ tokens: 1000 * (arm === 'B' ? 0.8 + t * 0.001 : 1), wallSec: 100 + t, safety: 0.9 - (arm === 'B' ? 0.05 + t * 0.001 : 0) })));
  assert.equal(bad.decision, 'fail');
  assert.ok(bad.pHolm.safety >= 0.05 && bad.pHolm.token < 0.05);
});
