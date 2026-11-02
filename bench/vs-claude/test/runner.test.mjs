// node --test bench/vs-claude/test/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gradeCode } from '../lib/grade.mjs';
import { populateWorkspace, taskDirs } from '../lib/workspace.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-test-'));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const readTask = (id) => JSON.parse(fs.readFileSync(path.join(SUITE, 'tasks', id, 'task.json'), 'utf8'));

test('repo/ thiếu thì workspace là thư mục rỗng, không ENOENT', () => {
  const root = tmp();
  const dir = path.join(root, 'ws');
  write(path.join(dir, 'cu.txt'), 'x'); // phải bị dọn đi
  populateWorkspace(dir, path.join(root, 'khong-co'));
  assert.ok(fs.statSync(dir).isDirectory());
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('task mặc định dùng repo/, không có solutionDir', () => {
  const d = taskDirs('/s', { id: 'x' });
  assert.equal(d.repoDir, path.join('/s', 'tasks', 'x', 'repo'));
  assert.equal(d.solutionDir, undefined);
});

test('task dạng starter/ dùng đúng repoDir/solutionDir; oracle (ref đè starter) đạt 1,00', () => {
  const d = taskDirs(SUITE, readTask('t1-duration'));
  assert.equal(d.repoDir, path.join(SUITE, 'tasks/t1-duration/starter'));
  assert.equal(d.solutionDir, path.join(SUITE, 'tasks/t1-duration/ref'));
  assert.equal(d.hiddenDir, path.join(SUITE, 'tasks/t1-duration/hidden'));
  const root = tmp();
  const ws = populateWorkspace(path.join(root, 'ws'), d.repoDir);
  assert.ok(fs.existsSync(path.join(ws, 'SPEC.md')));
  fs.cpSync(d.solutionDir, ws, { recursive: true });
  const g = gradeCode({ workdir: ws, hiddenDir: d.hiddenDir });
  assert.equal(g.score, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('gradeCode chép cả helper trong hidden/ nhưng chỉ chạy *.test.js', () => {
  const root = tmp();
  const work = path.join(root, 'work'), hidden = path.join(root, 'hidden');
  write(path.join(work, 'src/a.js'), 'module.exports = () => 42;\n');
  write(path.join(hidden, '_helper.js'), 'module.exports = { want: 42 };\n');
  write(path.join(hidden, 'a.hidden.test.js'),
    "const t = require('node:test'); const assert = require('node:assert/strict');\n" +
    "const a = require('../src/a'); const { want } = require('./_helper');\n" +
    "t('dùng helper', () => assert.equal(a(), want));\n");
  write(path.join(hidden, '_broken.js'), "throw new Error('helper không được chạy như test');\n");
  const g = gradeCode({ workdir: work, hiddenDir: hidden });
  assert.deepEqual([g.score, g.pass, g.details.total], [1, true, 1]);
  fs.rmSync(root, { recursive: true, force: true });
});

test('mọi task có task.json đều có thư mục repo (hoặc repoDir) và hidden/ trong git', () => {
  for (const id of fs.readdirSync(path.join(SUITE, 'tasks'))) {
    if (!fs.existsSync(path.join(SUITE, 'tasks', id, 'task.json'))) continue;
    const d = taskDirs(SUITE, readTask(id));
    assert.ok(fs.existsSync(d.repoDir), `${id}: thiếu ${d.repoDir}`);
    assert.ok(fs.existsSync(d.hiddenDir), `${id}: thiếu hidden/`);
  }
});
