// Test cho gates-pairs.mjs. Chạy: node --test docs/research/analysis/gates-pairs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gateKinds, taskGate, rowToPairs, jsonlToPairs, toCsv, main } from './gates-pairs.mjs';
import { parseCsv, report } from './agreement.mjs';

const ARMS = { _suites: { gates: { kinds: {
  'red-check': { prefixes: ['g1-', 'g2-'], expectGate: 'b02' },
  'plan-omission': { prefixes: ['g3-', 'g4-'], expectGate: 'b10' },
  'hidden-wrong': { prefixes: ['g5-', 'g6-'], expectGate: 'cto' },
} } } };
const kinds = gateKinds(ARMS);
const run = (key, task, gates, arm = 'B7cab') => ({ key, task, arm, gates });

test('đọc nhãn từ kinds', () => {
  assert.equal(taskGate('g2-x', kinds), 'b02');
  assert.equal(taskGate('g4-x', kinds), 'b10');
  assert.equal(taskGate('g6-x', kinds), 'cto');
  assert.equal(taskGate('t1-x', kinds), null);
});

test('(1) b02 chặn rồi sửa xong: decision → rounds cặp pred=1; run → 1 cặp', () => {
  const row = run('k1', 'g1-a', { b02: { blocked: true, rounds: 2 }, b10: null, cto: { pass: true } });
  const d = rowToPairs(row, kinds, { unit: 'decision', gates: ['b02'] });
  assert.deepEqual(d.pairs.map((p) => [p.ref, p.pred]), [['1', '1'], ['1', '1']]);
  const r = rowToPairs(row, kinds, { unit: 'run', gates: ['b02'] });
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].pred, '1');
});

test('b02 không chặn → 1 cặp pred=0; rounds thiếu mà blocked → 1 cặp', () => {
  assert.deepEqual(rowToPairs(run('k', 'g1-a', { b02: { blocked: false, rounds: 0 } }), kinds, { unit: 'decision', gates: ['b02'] }).pairs.map((p) => p.pred), ['0']);
  assert.equal(rowToPairs(run('k', 'g1-a', { b02: { blocked: true } }), kinds, { unit: 'decision', gates: ['b02'] }).pairs.length, 1);
});

test('(2) b10 null ở làn đơn: không có dòng b10, stderr đếm đúng', () => {
  const text = [run('a', 'g3-a', { b02: { blocked: false, rounds: 0 }, b10: null, cto: { pass: true } }), run('b', 'g3-b', { b02: null, b10: null, cto: null }), { key: 'c', task: 'g3-c', status: 'infra' }].map((x) => JSON.stringify(x)).join('\n');
  const r = jsonlToPairs(text, kinds, { unit: 'run' });
  assert.equal(r.pairs.filter((p) => p.gate === 'b10').length, 0);
  assert.deepEqual(r.skipped, { b02: 1, b10: 2, cto: 1 });
  assert.deepEqual(r.unrun, { infra: 1 });
});

test('(3) CTO không đạt trên g5/g6 → ref=1, pred=1; đạt → pred=0', () => {
  const bad = rowToPairs(run('k', 'g5-a', { cto: { pass: false } }), kinds, { unit: 'run', gates: ['cto'] }).pairs[0];
  assert.equal(bad.ref, '1'); assert.equal(bad.pred, '1');
  assert.equal(rowToPairs(run('k', 'g6-a', { cto: { pass: true } }), kinds, { unit: 'run', gates: ['cto'] }).pairs[0].pred, '0');
});

test('(4) lượt sạch → ref=0 cho mọi cổng; cổng khác kind cũng ref=0', () => {
  const ps = rowToPairs(run('k', 't1-a', { b02: { blocked: true, rounds: 1 }, b10: { blocked: false }, cto: { pass: false } }), kinds, { unit: 'run' }).pairs;
  assert.equal(ps.length, 3);
  assert.ok(ps.every((p) => p.ref === '0'));
  const g = rowToPairs(run('k', 'g3-a', { b02: { blocked: false, rounds: 0 }, b10: { blocked: true } }), kinds, { unit: 'run', negatives: 'cross' }).pairs;
  assert.deepEqual(g.map((p) => [p.gate, p.ref]), [['b02', '0'], ['b10', '1']]);
});

test('(5) CSV đọc đúng bằng parseCsv và report; main --out + --positive 1', () => {
  const rows = [run('k1', 'g1-a', { b02: { blocked: true, rounds: 2 } }), run('k2', 'g1-b', { b02: { blocked: false, rounds: 0 } }), run('k3', 't1-a', { b02: { blocked: false, rounds: 0 } })];
  const { pairs } = jsonlToPairs(rows.map((x) => JSON.stringify(x)).join('\n'), kinds, { unit: 'decision', gates: ['b02'] });
  const back = parseCsv(toCsv(pairs));
  assert.equal(back.length, 4);
  assert.deepEqual(Object.keys(back[0]), ['ref', 'pred', 'runId', 'gate', 'task', 'arm']);
  const rep = report(back.map((r) => ({ ref: r.ref, pred: r.pred, runId: r.runId })), { positive: '1', B: 50 });
  assert.equal(rep.nPositive, 3);
  // qua main + tệp tạm
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-')), f = path.join(dir, 'runs.jsonl'), a = path.join(dir, 'arms.json'), o = path.join(dir, 'o.csv');
  fs.writeFileSync(f, rows.map((x) => JSON.stringify(x)).join('\n')); fs.writeFileSync(a, JSON.stringify(ARMS));
  let err = ''; assert.equal(main([f, '--arms-json', a, '--unit', 'decision', '--gate', 'b02', '--out', o], { out: () => {}, err: (s) => { err += s; } }), 0);
  assert.equal(parseCsv(fs.readFileSync(o, 'utf8')).length, 4);
  assert.match(err, /4 cặp/);
});

test('(6) --gate lọc đúng; thiếu --unit → mã 2', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-')), f = path.join(dir, 'runs.jsonl'), a = path.join(dir, 'arms.json');
  fs.writeFileSync(f, JSON.stringify(run('k', 'g3-a', { b02: { blocked: false, rounds: 0 }, b10: { blocked: true }, cto: { pass: true } }))); fs.writeFileSync(a, JSON.stringify(ARMS));
  let out = ''; main([f, '--arms-json', a, '--unit', 'run', '--gate', 'b10'], { out: (s) => { out += s; }, err: () => {} });
  const rs = parseCsv(out); assert.equal(rs.length, 1); assert.equal(rs[0].gate, 'b10');
  out = ''; main([f, '--arms-json', a, '--unit', 'run', '--negatives', 'cross'], { out: (s) => { out += s; }, err: () => {} });
  assert.equal(parseCsv(out).length, 3);
  assert.equal(main([f], { out: () => {}, err: () => {} }), 2);
});

test('(7) bài g1 với --gate cto: mặc định bỏ khỏi mẫu (không thành chặn nhầm); negatives=cross giữ ref=0', () => {
  const row = run('k', 'g1-a', { b02: { blocked: true, rounds: 1 }, cto: { pass: false } });
  const d = jsonlToPairs(JSON.stringify(row), kinds, { unit: 'run', gates: ['cto'] });
  assert.equal(d.pairs.length, 0); assert.deepEqual(d.cross, { cto: 1 });
  const c = rowToPairs(row, kinds, { unit: 'run', gates: ['cto'], negatives: 'cross' });
  assert.deepEqual(c.pairs.map((p) => [p.ref, p.pred]), [['0', '1']]);
  assert.equal(rowToPairs(run('k', 't1-a', { cto: { pass: false } }), kinds, { gates: ['cto'] }).pairs[0].ref, '0');
  assert.equal(rowToPairs(run('k', 'g5-a', { cto: { pass: false } }), kinds, { gates: ['cto'] }).pairs[0].ref, '1');
});

test('(8) stderr tách cổng null, bài loại khác và dòng infra/error theo status; --negatives sai → mã 2', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-')), f = path.join(dir, 'runs.jsonl'), a = path.join(dir, 'arms.json');
  fs.writeFileSync(a, JSON.stringify(ARMS));
  fs.writeFileSync(f, [run('a', 'g1-a', { cto: { pass: false } }), run('b', 't1-a', { cto: null }), { key: 'c', task: 't1-b', status: 'infra' }, { key: 'd', task: 't1-c', status: 'error' }].map((x) => JSON.stringify(x)).join('\n'));
  let err = ''; main([f, '--arms-json', a, '--unit', 'run', '--gate', 'cto'], { out: () => {}, err: (s) => { err += s; } });
  assert.match(err, /cổng null: cto=1/); assert.match(err, /loại khác: cto=1/); assert.match(err, /infra=1 error=1/);
  assert.equal(main([f, '--arms-json', a, '--unit', 'run', '--negatives', 'x'], { out: () => {}, err: () => {} }), 2);
});
