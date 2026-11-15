// SR-24: arm nearmiss — lời giải gần đúng cho mọi bài (cũ và mới) phải chấm 0 < điểm < 1 (oracle = 1,00), và runner chạy được arm này.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeCode, GRADERS } from '../lib/grade.mjs';
import { priceRun } from '../lib/pricing.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = fs.readdirSync(path.join(ROOT, 'tasks')).filter((d) => fs.existsSync(path.join(ROOT, 'tasks', d, 'task.json'))).sort();
const dirOf = (id) => path.join(ROOT, 'tasks', id);
const taskOf = (id) => JSON.parse(fs.readFileSync(path.join(dirOf(id), 'task.json'), 'utf8'));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-nm-'));

/** Dựng workspace như run.mjs: repo khởi đầu + lời giải tham chiếu (oracle), rồi (nếu near) đè hidden/nearmiss/. */
function build(id, near) {
  const t = taskOf(id), h = path.join(dirOf(id), 'hidden'), dir = tmp();
  fs.cpSync(path.join(dirOf(id), t.repoDir ?? 'repo'), dir, { recursive: true });
  if (t.solutionDir) fs.cpSync(path.join(dirOf(id), t.solutionDir), dir, { recursive: true });
  if (fs.existsSync(path.join(h, 'solution'))) fs.cpSync(path.join(h, 'solution'), dir, { recursive: true });
  if (fs.existsSync(path.join(h, 'answer.json'))) fs.copyFileSync(path.join(h, 'answer.json'), path.join(dir, t.deliverable.endsWith('.json') ? t.deliverable : 'answer.json'));
  if (fs.existsSync(path.join(h, 'reference'))) fs.cpSync(path.join(h, 'reference'), dir, { recursive: true });
  if (near) fs.cpSync(path.join(h, 'nearmiss'), dir, { recursive: true });
  return dir;
}
const grade = (id, dir) => {
  const t = taskOf(id), args = { workdir: dir, hiddenDir: path.join(dirOf(id), 'hidden'), suiteRepoDir: path.join(dirOf(id), t.repoDir ?? 'repo'), finalText: '', task: t, judge: { enabled: false } };
  return t.grader === 'code' ? gradeCode({ ...args, visibleCheck: false }) : GRADERS[t.grader](args);
};

test('SR-24: mọi bài (kể cả a2/re2/s2) có hidden/nearmiss/ không rỗng và ghi chú đột biến', () => {
  assert.ok(ids.length >= 29);
  for (const id of ids) {
    const nm = path.join(dirOf(id), 'hidden', 'nearmiss');
    assert.ok(fs.existsSync(nm) && fs.readdirSync(nm).length > 0, `${id}: thiếu hidden/nearmiss/`);
    assert.match(fs.readFileSync(path.join(dirOf(id), 'hidden', 'nearmiss.note.txt'), 'utf8'), /^SR-24: /, id);
  }
});

/**
 * Oracle chấm lại tối đa 3 lần khi chưa đạt 1: t4-perf có test ẩn đo thời gian (< 1000 ms, tốt nhất trong 3 lần) nên đỏ ngẫu nhiên khi máy bận
 * (đã thấy 18/19 = 0,947 ở 1 trong 10 lần chạy test:bench, xem docs/test-bench-flaky.md). Oracle sai thật thì cả 3 lần đều sai.
 */
export async function gradeOracle(id, gradeFn = grade, buildFn = build, attempts = 3) {
  let o;
  for (let k = 0; k < attempts; k++) { o = await gradeFn(id, buildFn(id, false)); if (o.score === 1) break; }
  return o;
}

test('SR-24: nearmiss < oracle = 1,00 và nearmiss > null ở từng bài', async () => {
  for (const id of ids) {
    const o = await gradeOracle(id);
    const n = await grade(id, build(id, true));
    assert.equal(o.score, 1, `${id}: oracle`);
    assert.ok(n.score < 1 && n.score > 0, `${id}: nearmiss ${n.score} phải trong (0, 1)`);
    if (taskOf(id).grader !== 'code') { // null của bài code chậm (t4 ~3 phút); với bài code, kiểm null nằm ở lệnh run.mjs --arms oracle,null,nearmiss
      const empty = tmp(); fs.cpSync(path.join(dirOf(id), 'repo'), empty, { recursive: true });
      assert.ok(n.score > (await grade(id, empty)).score, `${id}: nearmiss phải hơn null`);
    }
  }
});

test('SR-24: arms.json khai arm nearmiss; chi phí = 0 như oracle/null', () => {
  const arms = JSON.parse(fs.readFileSync(path.join(ROOT, 'arms.json'), 'utf8'));
  assert.equal(arms.nearmiss.kind, 'nearmiss');
  assert.equal(priceRun(arms.nearmiss, {}).costUsd, 0);
});

test('SR-24: run.mjs --arms oracle,nearmiss chạy thật trên bài cũ (g1) và bài mới (s2): nearmiss < oracle, chi phí 0', () => {
  const out = tmp();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'run.mjs'), '--arms', 'oracle,nearmiss', '--tasks', 'g1-slug-dedupe,s2-support-review', '--repeats', '1', '--out', out, '--work', tmp()], { encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 4);
  for (const task of ['g1-slug-dedupe', 's2-support-review']) {
    const o = rows.find((x) => x.task === task && x.arm === 'oracle'), n = rows.find((x) => x.task === task && x.arm === 'nearmiss');
    assert.equal(o.score, 1, task);
    assert.ok(n.score < 1 && n.score > 0, `${task}: ${n.score}`);
    assert.equal(n.costUsd, 0);
    assert.equal(n.status, 'done');
  }
});

test('SR-24: gradeOracle thử lại khi điểm < 1 do nhiễu thời gian, nhưng oracle sai thật vẫn đỏ', async () => {
  const seq = [{ score: 0.95 }, { score: 1 }];
  assert.equal((await gradeOracle('x', async () => seq.shift(), () => 'd')).score, 1);
  let n = 0;
  assert.equal((await gradeOracle('x', async () => { n++; return { score: 0.5 }; }, () => 'd')).score, 0.5);
  assert.equal(n, 3);
});
