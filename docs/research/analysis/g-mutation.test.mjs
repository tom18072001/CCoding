// Test bằng dữ liệu giả cho g-mutation.mjs và g-analyze.mjs (V4-3f-G). Không đọc dữ liệu thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mutationSites, applySite, rng, sample, productFiles, evalRun } from './g-mutation.mjs';
import { analyze, cp, deltaStat, permDelta } from './g-analyze.mjs';

test('mutationSites: đủ các toán tử và áp đúng vị trí', () => {
  const src = 'export function f(a, b) {\n  if (a < b && !a) return a + 1;\n  return a === b ? 0 : b;\n}\n';
  const s = mutationSites(src);
  const ops = new Set(s.map((x) => x.op));
  for (const o of ['ROR', 'LCR', 'UOI', 'AOR', 'CRP', 'EQ', 'COND']) assert.ok(ops.has(o), `thiếu ${o}`);
  const ror = s.find((x) => x.op === 'ROR' && x.repl === '<=');
  assert.match(applySite(src, ror), /a <= b/);
  const uoi = s.find((x) => x.op === 'UOI');
  assert.match(applySite(src, uoi), /&& a\)/);
  assert.ok(s.every((x) => x.line >= 1));
});

test('rng và sample: cùng hạt giống cho cùng mẫu, khác hạt giống thì khác', () => {
  const arr = Array.from({ length: 50 }, (_, i) => i);
  assert.deepEqual(sample(arr, 12, rng('20261104|k1')), sample(arr, 12, rng('20261104|k1')));
  assert.notDeepEqual(sample(arr, 12, rng('20261104|k1')), sample(arr, 12, rng('20261104|k2')));
  assert.equal(new Set(sample(arr, 12, rng('x'))).size, 12);
  assert.equal(sample([1, 2], 12, rng('x')).length, 2);
});

test('productFiles: chỉ tệp nguồn thuộc deliverable, bỏ tệp test', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'g-pf-'));
  for (const f of ['src/a.js', 'src/a.test.js', 'src/sub/b.mjs', 'test/x.test.js', 'bin/c.js', 'README.md']) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), '1;'); }
  assert.deepEqual(productFiles(d, 'src/, bin/c.js'), ['bin/c.js', 'src/a.js', 'src/sub/b.mjs']);
  fs.rmSync(d, { recursive: true, force: true });
});

test('evalRun trên bài giả: base đúng, đột biến được phân loại thật/không thật và chặn/không chặn', { timeout: 120_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g-task-'));
  const art = path.join(root, 'art'), hid = path.join(root, 'hidden');
  fs.mkdirSync(path.join(art, 'src'), { recursive: true }); fs.mkdirSync(path.join(art, 'test'), { recursive: true }); fs.mkdirSync(hid, { recursive: true });
  fs.writeFileSync(path.join(art, 'package.json'), JSON.stringify({ name: 'g', private: true, type: 'commonjs', scripts: { test: 'node --test "test/**/*.test.js"' } }));
  fs.writeFileSync(path.join(art, 'src', 'clamp.js'), 'exports.clamp = (x, lo, hi) => {\n  if (x < lo) return lo;\n  if (x > hi) return hi;\n  return x;\n};\n');
  // test công khai yếu: chỉ kiểm cận dưới; test ẩn kiểm cả hai cận và biên
  fs.writeFileSync(path.join(art, 'test', 'clamp.test.js'), "const t=require('node:test');const a=require('node:assert');const {clamp}=require('../src/clamp.js');t('duoi',()=>a.equal(clamp(-5,0,10),0));\n");
  fs.writeFileSync(path.join(hid, 'clamp.hidden.test.js'), "const t=require('node:test');const a=require('node:assert');const {clamp}=require('../src/clamp.js');t('duoi',()=>a.equal(clamp(-5,0,10),0));t('tren',()=>a.equal(clamp(15,0,10),10));t('giua',()=>a.equal(clamp(5,0,10),5));t('bien',()=>{a.equal(clamp(0,0,10),0);a.equal(clamp(10,0,10),10);});\n");
  const rows = [];
  await evalRun({ run: { key: 'g__X__r1', task: 'g', arm: 'A0-sonnet', rep: 1 }, task: { deliverable: 'src/' }, artifactDir: art, hiddenDir: hid, perRun: 50, seed: 's' }, (r) => rows.push(r));
  const base = rows.find((r) => r.type === 'base');
  assert.equal(base.vRed, false); assert.equal(base.hPass, true); assert.equal(base.eligible, true);
  const mut = rows.filter((r) => r.type === 'mut');
  assert.equal(mut.length, base.sites);
  // đột biến ở cận trên (x > hi) là lỗi thật mà test công khai không bắt
  const upper = mut.filter((m) => m.line === 3 && m.op === 'ROR' && m.repl === '<=');
  assert.equal(upper.length, 1); assert.equal(upper[0].real, true); assert.equal(upper[0].vRed, false);
  // đột biến ở cận dưới đổi chiều (x >= lo) là lỗi thật và test công khai bắt
  const lower = mut.filter((m) => m.line === 2 && m.op === 'ROR' && m.repl === '>=');
  assert.equal(lower.length, 1); assert.equal(lower[0].real, true); assert.equal(lower[0].vRed, true);
  // tệp gốc được trả lại sau mỗi đột biến
  assert.match(fs.readFileSync(path.join(art, 'src', 'clamp.js'), 'utf8'), /x > hi/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('cp: Clopper–Pearson khớp giá trị đã biết', () => {
  const [lo, hi] = cp(0, 50); assert.equal(lo, 0); assert.ok(Math.abs(hi - 0.0711) < 0.001, String(hi));
  const [l1, h1] = cp(1, 1); assert.ok(Math.abs(l1 - 0.025) < 0.001); assert.equal(h1, 1);
  const [l2] = cp(2, 2); assert.ok(Math.abs(l2 - 0.158) < 0.001, String(l2));
});

function synth(rA, rC, tasks = 6, runsPer = 6, mutPer = 10) {
  const base = [], mut = [];
  for (let t = 0; t < tasks; t++) for (const [arm, r] of [['A0-sonnet', rA], ['B7', rC]]) for (let k = 0; k < runsPer; k++) {
    const key = `t${t}__${arm}__r${k}`;
    base.push({ type: 'base', key, task: `t${t}`, arm, vRed: false, hPass: true, eligible: true });
    for (let i = 0; i < mutPer; i++) mut.push({ type: 'mut', key, task: `t${t}`, arm, i, op: 'ROR', real: true, vRed: i < Math.round(r * mutPer) });
  }
  return { base, mut, missing: [] };
}

test('analyze: hai nhóm như nhau → Δ = 0, p lớn; nhóm C bắt nhiều hơn 30 điểm → Δ ≈ 0,3, p nhỏ', () => {
  const same = analyze(synth(0.5, 0.5), { B: 200, M: 500 });
  assert.equal(same.g3delta.obs, 0); assert.ok(same.g3delta.p > 0.5);
  const diff = analyze(synth(0.4, 0.7), { B: 200, M: 500 });
  assert.ok(Math.abs(diff.g3delta.obs - 0.3) < 1e-9); assert.ok(diff.g3delta.p < 0.01, String(diff.g3delta.p));
  assert.ok(diff.g3delta.ci.lo > 0);
  assert.equal(diff.g3.A.recall, 0.4); assert.equal(diff.g3.C.recall, 0.7);
  assert.equal(diff.survivors.length, synth(0.4, 0.7).mut.filter((m) => !m.vRed).length);
});

test('analyze: G-1/G-2 đếm đúng; lượt không có package.json không tính', () => {
  const d = { base: [
    { type: 'base', key: 'a', task: 't', arm: 'A0-sonnet', vRed: true, hPass: true },
    { type: 'base', key: 'b', task: 't', arm: 'A0-sonnet', vRed: true, hPass: false },
    { type: 'base', key: 'c', task: 't', arm: 'A0-sonnet', vRed: false, hPass: true },
    { type: 'base', key: 'd', task: 't', arm: 'A0-sonnet', vRed: false, hPass: true, vNone: true },
  ], mut: [], missing: [] };
  const r = analyze(d, { B: 10, M: 10 });
  assert.equal(r.g1['A0-sonnet'].n, 2); assert.equal(r.g1['A0-sonnet'].red, 1);
  assert.equal(r.g2['A0-sonnet'].n, 3); assert.equal(r.g2['A0-sonnet'].red, 2);
});

test('deltaStat/permDelta: bài thiếu một nhóm bị bỏ', () => {
  const runs = [{ key: 'x', task: 't1', arm: 'A0-sonnet', real: 2, caught: 1 }, { key: 'y', task: 't2', arm: 'B7', real: 2, caught: 2 }];
  assert.ok(Number.isNaN(deltaStat(runs)));
  const r2 = [...runs, { key: 'z', task: 't1', arm: 'B6', real: 4, caught: 4 }];
  assert.equal(deltaStat(r2), 0.5);
  assert.ok(permDelta(r2, 50, 's').p > 0);
});
