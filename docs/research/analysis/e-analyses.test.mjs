// Test cho phân tích đợt 3e chạy sau khi đủ dữ liệu: e5f-analyze (E5′), h6-sensitivity (E6), e4-analyze (E4). Dữ liệu giả.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze as e5f, bootstrapDiff, select } from './e5f-analyze.mjs';
import { sensitivity } from './h6-sensitivity.mjs';
import { analyze as e4 } from './e4-analyze.mjs';

const row = (o) => ({ status: 'done', excluded: null, leak: false, tokens: { weighted: 100 }, wallSec: 10, score: 1, pass: true, byPhase: {}, ...o });

test('e5f: R̂ đúng khi B1F tốn bằng nửa B0F; quy tắc (8) loại cả cặp khi B0F không họp', () => {
  const rows = [];
  for (const task of ['l1-modules', 'l2-chain']) for (let rep = 1; rep <= 5; rep++) {
    rows.push(row({ key: `${task}__B0F__r${rep}`, task, arm: 'B0F', rep, tokens: { weighted: 200 + rep }, wallSec: 20, byPhase: rep === 5 && task === 'l2-chain' ? {} : { discuss: 5, finalize: 5 } }));
    rows.push(row({ key: `${task}__B1F__r${rep}`, task, arm: 'B1F', rep, tokens: { weighted: (200 + rep) / 2 }, wallSec: 10 }));
  }
  const a = e5f(rows);
  assert.deepEqual(a.excludedPairs, ['l2-chain|5']);
  assert.deepEqual(a.n['l2-chain'], { B0F: 4, B1F: 4 });
  assert.ok(Math.abs(a.weighted.est - 0.5) < 1e-9);
  assert.equal(a.weighted.verdict, 'B1F thấp hơn');
  assert.ok(Math.abs(a.wallSec.est - 0.5) < 1e-9);
  assert.equal(e5f(rows, { exclude: false }).excludedPairs.length, 0);
  assert.equal(select([row({ key: 'k', task: 'l1-modules', arm: 'B0F', rep: 1, leak: true })]).leak.length, 1);
  const d = bootstrapDiff([[0.5, 0.5], [1, 1]], [[0.6, 0.6], [1, 1]]);
  assert.ok(Math.abs(d.est - 0.05) < 1e-12);
});

test('h6-sensitivity: Δ_i theo bài, bỏ t2-orders và t4-perf ở (i)', () => {
  const tasks = ['l1-modules', 'l2-chain', 't1-duration', 't2-orders', 't3-api', 't4-perf', 't5-logq'];
  const rows = tasks.flatMap((task) => ['A1', 'A2', 'B0'].flatMap((arm) => [1, 2].map((rep) => row({ task, arm, rep, score: task === 't2-orders' && arm === 'B0' ? 0.9 : 1 }))));
  const s = sensitivity(rows);
  assert.ok(Math.abs(s.A1.all7.est - 0.1 / 7) < 1e-12);
  assert.equal(s.A1.five.tasks.length, 5);
  assert.ok(Math.abs(s.A1.five.est) < 1e-12);
  assert.equal(s.A1.perTask.find((t) => t.task === 't2-orders').range, 0.47);
  assert.equal(s.A1.sensitive, true, 'Δ̂ đổi phía (dương → 0)');
});

test('e4: q̂, recall chưa ước lượng được khi < 10 dương, b10 theo bài, lượt sạch, B-16', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e4t-'));
  const w = (name, rs) => { const f = path.join(dir, `${name}.jsonl`); fs.writeFileSync(f, rs.map((r) => JSON.stringify(r)).join('\n')); return f; };
  const g = [];
  for (let rep = 1; rep <= 4; rep++) for (const arm of ['B7cab', 'B7cabO']) {
    g.push(row({ key: `g1-x__${arm}__r${rep}`, task: 'g1-x', arm, rep, gates: { b02: { blocked: rep === 1, checksRed: rep === 1 ? 2 : 0 }, cto: { pass: !(arm === 'B7cab' && rep === 2) } } }));
    g.push(row({ key: `g5-x__${arm}__r${rep}`, task: 'g5-x', arm, rep, pass: rep !== 3, gates: { cto: { pass: arm === 'B7cab' && rep === 3 } } }));
  }
  for (let rep = 1; rep <= 12; rep++) g.push(row({ key: `g3-x__B6__r${rep}`, task: 'g3-x', arm: 'B6', rep, gates: { b10: { blocked: rep <= 3 } } }));
  g.push({ key: 'g3-x__B6__r1', task: 'g3-x', arm: 'B6', rep: 1, status: 'infra' });
  const clean = w('clean', [row({ key: 'l1__B0__r1', task: 'l1-modules', arm: 'B0', rep: 1, gates: { b02: { blocked: false }, b10: null, cto: { pass: false } } })]);
  const a = e4({ e4: w('e4', g), clean: [['E3', clean]] });
  assert.equal(a.rows.done, 28);
  assert.deepEqual([a.b02.runs, a.b02.positives, a.b02.recall], [8, 2, null]);
  assert.deepEqual([a.cto.runs, a.cto.positives, a.cto.recall], [8, 2, null]);
  assert.deepEqual([a.b10.runs, a.b10.blocked], [12, 3]);
  assert.ok(Math.abs(a.b10.recall - 0.25) < 1e-12);
  assert.deepEqual([a.clean.n, a.clean.cto.blocked, a.clean.b02.blocked, a.clean.b10.n], [1, 1, 0, 0]);
  assert.deepEqual(a.b16.wrongAccept.B7cab, { positives: 1, wrong: 1 });
  assert.deepEqual(a.b16.wrongAccept.B7cabO, { positives: 1, wrong: 0 });
  assert.deepEqual([a.b16.mcnemarWrongAccept.sonnetOnly, a.b16.mcnemarWrongAccept.opusOnly], [1, 0]);
});
