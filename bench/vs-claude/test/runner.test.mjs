// node --test bench/vs-claude/test/
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { gradeCode } from '../lib/grade.mjs';
import { spawnSync } from 'node:child_process';
import { cliVersion, gitCommit, modelsOf, provenance } from '../lib/queue.mjs';
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

// ---------- SR-03 / SR-19: nguồn gốc của dòng runs.jsonl (D1) ----------
test('SR-03: cliVersion đọc dòng đầu của <bin> --version (bin giả); bin không tồn tại ⇒ null', () => {
  const root = tmp(); const fake = path.join(root, 'fake-claude.mjs');
  write(fake, "if (process.argv.includes('--version')) console.log('9.9.9 (Fake CLI)\\nphụ');\n");
  assert.equal(cliVersion(process.execPath, [fake]), '9.9.9 (Fake CLI)');
  assert.equal(cliVersion(path.join(root, 'khong-co-bin.exe')), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('SR-03: gitCommit trả hash 40 ký tự trong repo; ngoài repo ⇒ null', () => {
  assert.match(gitCommit(SUITE), /^[0-9a-f]{40}$/);
  const root = tmp();
  assert.equal(gitCommit(root), null);
  fs.rmSync(root, { recursive: true, force: true });
});

test('SR-03: modelsOf — CCoding theo pha từ byPhaseModel, claude theo model thực, không biết ⇒ {}', () => {
  assert.deepEqual(modelsOf({ kind: 'ccoding' }, { research: { byPhaseModel: { plan: ['claude-opus-5-5'], execute: ['claude-sonnet-5-5', 'claude-opus-5-5'] } } }),
    { plan: 'claude-opus-5-5', execute: 'claude-sonnet-5-5+claude-opus-5-5' });
  assert.deepEqual(modelsOf({ kind: 'claude' }, { model: 'claude-sonnet-5-5' }), { exec: 'claude-sonnet-5-5' });
  assert.deepEqual(modelsOf({ kind: 'claude' }, { model: null }), {});
  assert.deepEqual(modelsOf({ kind: 'null' }, {}), {});
});

test('SR-19: provenance thiếu thông tin thì để null, không điền mặc định giả', () => {
  const p = provenance({ timeoutMin: 60 }, { kind: 'null' }, {});
  assert.deepEqual(p, { ccodingCommit: null, claudeCliVersion: null, models: {}, window: null, quotaState: null, timeoutMin: 60 });
  assert.equal(provenance({ quotaState: 'ok', timeoutMin: 1 }, {}, {}, { quotaState: 'rate-limited' }).quotaState, 'rate-limited');
});

test('SR-03/19: run.mjs ghi đủ trường D1 vào config.json và mỗi dòng runs.jsonl (oracle,null, bin giả in phiên bản)', () => {
  const root = tmp();
  const r = spawnSync(process.execPath, [path.join(SUITE, 'run.mjs'), '--arms', 'oracle,null', '--tasks', 't1-duration', '--repeats', '1',
    '--out', path.join(root, 'out'), '--work', path.join(root, 'w'), '--window', 'W9', '--quota-state', 'ok', '--timeout', '7',
    '--claude-bin', process.execPath], { encoding: 'utf8' }); // `node --version` đóng vai bin giả
  assert.equal(r.status, 0, r.stderr);
  const rows = fs.readFileSync(path.join(root, 'out', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 2);
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'out', 'config.json'), 'utf8'));
  assert.match(cfg.meta.ccodingCommit, /^[0-9a-f]{40}$/);
  assert.equal(cfg.meta.claudeCliVersion, process.version);
  for (const row of rows) {
    assert.equal(row.ccodingCommit, cfg.meta.ccodingCommit);
    assert.equal(row.claudeCliVersion, process.version);
    assert.deepEqual([row.window, row.quotaState, row.timeoutMin, row.excluded, row.failReason, row.status], ['W9', 'ok', 7, null, null, 'done']);
    assert.deepEqual(row.models, {});
  }
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// ---------- SR-21: dò rò rỉ chỉ trên đường dẫn và tham số công cụ ----------
import { leakInCalls, leakInSelectorPrompt, leakInTranscript, leakNeedles } from '../lib/queue.mjs';

const NEEDLES = leakNeedles(SUITE, path.sep);
const ev = (o) => JSON.stringify(o);
const toolUse = (input) => ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input }] } });

test('SR-21: văn bản prompt hệ thống/kết quả công cụ có chuỗi bộ đo KHÔNG phải rò rỉ', () => {
  const lines = [
    ev({ type: 'system', subtype: 'init', cwd: SUITE, system_prompt: `xem ${SUITE} và checklist.json` }),
    ev({ type: 'user', message: { content: [{ type: 'tool_result', content: 'issues.json hidden/answer.json' }] } }),
    ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'tôi sẽ không đọc checklist.json' }] } }),
    ev({ type: 'result', result: 'xong' }),
  ];
  assert.equal(leakInTranscript(lines, NEEDLES), false);
});

test('SR-21: tool_use đọc đường dẫn hidden/ hoặc suite ⇒ rò rỉ; tool_use bình thường thì không', () => {
  assert.equal(leakInTranscript([toolUse({ file_path: path.join(SUITE, 'tasks', 'x', 'hidden', 'answer.json') })], NEEDLES), true);
  assert.equal(leakInTranscript([toolUse({ command: 'cat hidden/answer.json' })], NEEDLES), true);
  assert.equal(leakInTranscript([toolUse({ file_path: 'src/index.js' })], NEEDLES), false);
  assert.equal(leakInTranscript(['dòng không phải JSON nhắc checklist.json'], NEEDLES), true, 'dòng thô giữ hành vi cũ (thận trọng)');
});

test('SR-21: calls.jsonl của CCoding chỉ xét `tools`, không xét `text`', () => {
  const j = (...r) => r.map((x) => JSON.stringify(x)).join('\n');
  assert.equal(leakInCalls(j({ text: `prompt nhắc ${SUITE} và hidden/answer.json`, tools: [{ name: 'Read', input: { file_path: 'a.js' } }] }), NEEDLES), false);
  assert.equal(leakInCalls(j({ text: 'x', tools: [{ name: 'Read', input: { file_path: 'tasks/x/hidden/answer.json' } }] }), NEEDLES), true);
  assert.equal(leakInCalls(j({ text: 'chỉ có văn bản' }), NEEDLES), false);
});

test('SR-21: bước chọn của A2 — prompt người chọn chứa chuỗi bộ đo ⇒ rò rỉ, bản giao nộp sạch thì không', () => {
  assert.equal(leakInSelectorPrompt('### Candidate 0\nbáo cáo sạch', NEEDLES), false);
  assert.equal(leakInSelectorPrompt(`### Candidate 1\nđã đọc ${path.join(SUITE, 'tasks')}`, NEEDLES), true);
  assert.equal(leakInSelectorPrompt('### Candidate 1\ntheo hidden/answer.json thì …', NEEDLES), true);
});
