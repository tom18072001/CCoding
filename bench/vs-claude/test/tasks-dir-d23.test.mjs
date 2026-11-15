// D23: pairwise.mjs và e7/*.mjs nhận thư mục bài qua --tasks-dir / VSC_TASKS_DIR (mặc định <suite>/tasks).
// Mọi thứ dựng trong os.tmpdir(); không ghi vào bench/vs-claude/tasks/; không gọi `claude` thật (bin giả).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareItem } from '../e7/lib.mjs';
import { buildProduct } from '../e7/label-trials.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE = path.resolve(HERE, '..');
const FAKE = path.join(HERE, 'fixtures', 'fake-judge.mjs');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `ccvb-d23-${p}-`));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const cleanEnv = () => { const e = { ...process.env, FAKE_JUDGE_MODE: 'pref' }; delete e.VSC_TASKS_DIR; return e; };
const TID = 'zz-d23-only-in-tmp'; // id không tồn tại trong bench/vs-claude/tasks/

/** Thư mục bài tạm có một bài design (cho pairwise). */
function designTasks() {
  const dir = tmp('tasks');
  write(path.join(dir, TID, 'task.json'), JSON.stringify({ id: TID, category: 'design', deliverable: 'DESIGN.md', brief: 'brief giả của D23' }));
  return dir;
}
function mkRun() {
  const run = tmp('run'), rows = [];
  for (const arm of ['A0-sonnet', 'B0']) {
    const key = `${TID}__${arm}__r1`;
    write(path.join(run, 'artifacts', key, 'DESIGN.md'), `${arm === 'A0-sonnet' ? 'GOOD' : 'weak'} thiết kế`);
    rows.push({ key, task: TID, category: 'design', arm, rep: 1, leak: false });
  }
  write(path.join(run, 'runs.jsonl'), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
  return run;
}
const pairwise = (run, args, env) => spawnSync(process.execPath, [path.join(SUITE, 'pairwise.mjs'), run, '--judge-bin', process.execPath, '--judge-bin-args', JSON.stringify([FAKE]), ...args], { encoding: 'utf8', env, timeout: 60_000 });

test('pairwise: --tasks-dir trỏ vào thư mục tạm ⇒ đọc task.json ở đó', () => {
  const tasks = designTasks(), run = mkRun();
  const r = pairwise(run, ['--tasks-dir', tasks], cleanEnv());
  assert.equal(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(run, 'pairwise.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([rows.length, rows[0].task, rows[0].winner], [1, TID, 'x']);
});

test('pairwise: VSC_TASKS_DIR cũng được; không đặt gì ⇒ mặc định <suite>/tasks (bài tạm không có ở đó ⇒ lỗi)', () => {
  const tasks = designTasks();
  const viaEnv = pairwise(mkRun(), [], { ...cleanEnv(), VSC_TASKS_DIR: tasks });
  assert.equal(viaEnv.status, 0, viaEnv.stderr);
  const dflt = pairwise(mkRun(), [], cleanEnv());
  assert.notEqual(dflt.status, 0);
  assert.match(dflt.stderr, /ENOENT/);
  assert.ok(dflt.stderr.includes(path.join(SUITE, 'tasks')), 'mặc định là <suite>/tasks');
  assert.equal(fs.existsSync(path.join(SUITE, 'tasks', TID)), false, 'test không ghi vào cây repo');
});

/** Bài code tối thiểu + artifact đúng; suite rỗng (không có tasks/) để chứng minh đọc từ tasksDir. */
function codeFixture() {
  const suite = tmp('suite'), tasks = tmp('tasks2'), artifacts = path.join(suite, 'artifacts');
  const t = { id: 'zz-d23-code', category: 'coding', title: 'grade', deliverable: 'src/', grader: 'code', brief: 'grade' };
  write(path.join(tasks, t.id, 'task.json'), JSON.stringify(t));
  write(path.join(tasks, t.id, 'repo', 'data', 'note.txt'), 'starter-only\n');
  write(path.join(tasks, t.id, 'hidden', 'grade.hidden.test.js'), "import { test } from 'node:test'; import assert from 'node:assert/strict'; import { grade } from '../src/grade.js';\ntest('x', () => assert.equal(grade(95), 'A'));\n");
  const key = `${t.id}__A0-sonnet__r1`;
  write(path.join(artifacts, key, 'package.json'), '{"name":"x","type":"module","scripts":{"test":"node --test"}}\n');
  write(path.join(artifacts, key, 'src', 'grade.js'), "export const grade = (s) => (s >= 90 ? 'A' : 'B');\n");
  return { suite, tasks, artifacts, item: { id: 'dddddddddd', kind: 'clean', task: t.id, key, arm: 'A0-sonnet' } };
}

test('e7 buildProduct / prepareItem: tasksDir tường minh được dùng; mặc định vẫn là <suite>/tasks', async () => {
  const fx = codeFixture();
  const b = buildProduct(fx.item, { suite: fx.suite, artifacts: fx.artifacts, tasksDir: fx.tasks });
  try {
    assert.ok(b.dir, b.reason);
    assert.equal(fs.existsSync(path.join(b.dir, 'data', 'note.txt')), true, 'tệp starter lấy từ tasksDir');
    assert.equal(b.hiddenDir, path.join(fx.tasks, 'zz-d23-code', 'hidden'));
  } finally { fs.rmSync(b.dir, { recursive: true, force: true }); }
  assert.throws(() => buildProduct(fx.item, { suite: fx.suite, artifacts: fx.artifacts }), /ENOENT/); // mặc định <suite>/tasks không có bài
  const missing = await prepareItem({ ...fx.item, key: 'khong-co' }, { suite: fx.suite, artifacts: fx.artifacts, workRoot: tmp('w'), cc: null, tasksDir: fx.tasks });
  assert.deepEqual([missing.ok, missing.reason], [false, 'missing-artifact']);
  await assert.rejects(prepareItem(fx.item, { suite: fx.suite, artifacts: fx.artifacts, workRoot: tmp('w'), cc: null }), /ENOENT/);
});

test('e7/label-trials.mjs (CLI): --tasks-dir và VSC_TASKS_DIR, test ẩn chạy trên bài ở thư mục tạm', () => {
  const fx = codeFixture();
  const out = tmp('out');
  write(path.join(out, 'items.json'), JSON.stringify({ items: [fx.item], reserve: {} }));
  write(path.join(out, 'selected.json'), JSON.stringify({ items: [fx.item.id] }));
  const cli = path.join(SUITE, 'e7', 'label-trials.mjs');
  const base = [cli, '--out', out, '--artifacts', fx.artifacts, '--trials', '1', '--kinds', 'clean'];
  const a = spawnSync(process.execPath, [...base, '--tasks-dir', fx.tasks], { encoding: 'utf8', env: cleanEnv(), timeout: 120_000 });
  assert.equal(a.status, 0, a.stderr);
  const rows = fs.readFileSync(path.join(out, 'label-trials.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([rows[0].id, rows[0].fails], [fx.item.id, 0]);
  fs.rmSync(path.join(out, 'label-trials.jsonl'));
  const b = spawnSync(process.execPath, base, { encoding: 'utf8', env: { ...cleanEnv(), VSC_TASKS_DIR: fx.tasks }, timeout: 120_000 });
  assert.equal(b.status, 0, b.stderr);
  fs.rmSync(path.join(out, 'label-trials.jsonl'));
  const c = spawnSync(process.execPath, base, { encoding: 'utf8', env: cleanEnv(), timeout: 120_000 });
  assert.notEqual(c.status, 0, 'không truyền ⇒ mặc định <suite>/tasks, không có bài này');
});
