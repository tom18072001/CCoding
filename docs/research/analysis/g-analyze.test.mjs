// Test bằng dữ liệu giả cho g-analyze.mjs sau khi sửa ở BRIEF-19 S1 (D-G1, D-G2). Không đọc dữ liệu thật.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rng, bootstrap2, deltaStat, cp } from './g-analyze.mjs';
import { rng as rngMut } from './g-mutation.mjs';

const run = (task, arm, real, caught, i = 0) => ({ key: `${task}__${arm}__${i}`, task, arm, real, caught, mutants: real });

test('D-G2: g-analyze.mjs không import g-mutation.mjs (chạy được khi chưa cài typescript) và rng trùng dãy với bản gốc', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('./g-analyze.mjs', import.meta.url)), 'utf8');
  assert.ok(!/from\s+['"]\.\/g-mutation\.mjs['"]/.test(src));
  for (const seed of ['20261104|perm', '20261104|g3|*', 's']) {
    const a = rng(seed), b = rngMut(seed);
    for (let i = 0; i < 50; i++) assert.equal(a(), b());
  }
});

test('D-G1: deltaStat nhóm theo lần rút `_c` nên bài rút hai lần giữ bội số 2', () => {
  // bài X: C bắt 90 %, A bắt 0 → d = 0,9; bài Y: d = 0
  const X = [run('X', 'A0-sonnet', 10, 0), run('X', 'B0', 10, 9)];
  const Y = [run('Y', 'A0-sonnet', 10, 5), run('Y', 'B0', 10, 5)];
  // không có `_c`: nhóm theo bài như cũ → (0,9 + 0) / 2
  assert.ok(Math.abs(deltaStat([...X, ...Y]) - 0.45) < 1e-12);
  // X rút hai lần (cụm 0, 1), Y một lần (cụm 2) → (0,9 + 0,9 + 0) / 3
  const tag = (rs, c) => rs.map((r) => ({ ...r, _c: c }));
  assert.ok(Math.abs(deltaStat([...tag(X, 0), ...tag(X, 1), ...tag(Y, 2)]) - 0.6) < 1e-12);
});

test('D-G1: bootstrap2 mỗi lần rút bài là một cụm; cụm chỉ chứa lượt của một bài; số cụm = số bài', () => {
  const runs = [];
  for (const t of ['a', 'b', 'c']) for (let i = 0; i < 4; i++) runs.push(run(t, i % 2 ? 'B0' : 'A0-sonnet', 10, 5, i));
  const seen = [];
  bootstrap2(runs, (pick) => { const byC = new Map(); for (const r of pick) { if (!byC.has(r._c)) byC.set(r._c, new Set()); byC.get(r._c).add(r.task); } seen.push([...byC.values()]); return 0; }, 50, 'seed');
  for (const clusters of seen) {
    assert.equal(clusters.length, 3);
    for (const s of clusters) assert.equal(s.size, 1);
  }
  // cùng hạt → cùng kết quả; Δ có CI hữu hạn và lo ≤ hi
  const ci1 = bootstrap2(runs, deltaStat, 200, 'seed'), ci2 = bootstrap2(runs, deltaStat, 200, 'seed');
  assert.deepEqual(ci1, ci2);
  assert.ok(ci1.lo <= ci1.hi);
});

test('cp vẫn khớp giá trị đã biết (0/239 cận trên ≈ 1,5 %)', () => {
  const [lo, hi] = cp(0, 239);
  assert.equal(lo, 0);
  assert.ok(Math.abs(hi - 0.0153) < 0.0005);
});
