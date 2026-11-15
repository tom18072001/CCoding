// node --test bench/vs-claude/test/
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkArms, classifyRun, doneKeys, isFinishedRow, replacementRuns, supportedLanes } from '../lib/queue.mjs';

const SUITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARMS = JSON.parse(fs.readFileSync(path.join(SUITE, 'arms.json'), 'utf8'));

test('arms.json có B6 (lane fast) và B7 (lane single, B-01 đã có)', () => {
  assert.equal(ARMS.B6.options.lane, 'fast');
  assert.equal(ARMS.B7.options.lane, 'single');
  assert.equal(ARMS.B7.pending, undefined, 'B-01 đã gộp: arm B7 không còn cờ pending');
});

test('dòng infra không được tính là xong, lượt đó phải chạy lại', () => {
  const text = [
    JSON.stringify({ key: 'a', status: 'done' }),
    JSON.stringify({ key: 'b', status: 'infra', infra: 'rate-limit', resetsAt: '4:50pm' }),
    JSON.stringify({ key: 'c', status: 'failed' }),
    'dòng hỏng',
    '',
  ].join('\n');
  const done = doneKeys(text);
  assert.ok(done.has('a'));
  assert.ok(!done.has('b'));
  assert.ok(!done.has('c'), 'SR-01a: failed phải chạy lại');
});

test('checkArms: B7 chạy được khi lane single được hỗ trợ; thiếu lane thì báo lỗi rõ, không tự lùi sang lane khác', () => {
  const lanes = ['auto', 'fast', 'full'];
  assert.deepEqual(checkArms(['B6', 'B0'], ARMS, lanes), []);
  assert.deepEqual(checkArms(['B7'], ARMS, lanes), ["Arm B7 cần lane 'single' — CCoding hiện chưa hỗ trợ"]);
  assert.deepEqual(checkArms(['B7'], ARMS, [...lanes, 'single']), []);
});

test('supportedLanes đọc union lane từ src/types.ts: có fast và single (B-01)', () => {
  const lanes = supportedLanes(path.resolve(SUITE, '../..'));
  assert.ok(lanes.includes('fast'));
  assert.ok(lanes.includes('single'));
});

test('arm B7 không bị chặn bởi kiểm arm của run.mjs (lane single có trong src/types.ts)', () => {
  assert.deepEqual(checkArms(['B7'], ARMS, supportedLanes(path.resolve(SUITE, '../..'))), []);
});

test('analyze.mjs loại dòng infra và in số dòng đã loại', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-an-'));
  const row = (o) => JSON.stringify({ task: 't1-duration', category: 'coding', size: 1, rep: 1, score: 1, pass: true, status: 'done', ...o });
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), [row({ key: 'k1', arm: 'A0-sonnet' }), row({ key: 'k2', arm: 'B0' }), row({ key: 'k3', arm: 'B6', status: 'infra', infra: 'rate-limit', score: 0, pass: false })].join('\n'));
  const r = spawnSync(process.execPath, [path.join(SUITE, 'analyze.mjs'), dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Đã loại 1 dòng infra/);
  assert.ok(!fs.readFileSync(path.join(dir, 'summary.csv'), 'utf8').includes('B6'));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// ---------- SR-01 ----------
const J = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n');

test('SR-01a: doneKeys chỉ nhận done (và khóa bị loại); failed/error/infra chạy lại; dòng cũ thiếu trường vẫn đọc được', () => {
  const d = doneKeys(J(
    { key: 'ok', status: 'done' }, { key: 'f', status: 'failed', failReason: 'error' }, { key: 'e', status: 'error' },
    { key: 'i', status: 'infra' }, { key: 'x', status: 'done', excluded: 'leak' }, { key: 'xf', status: 'failed', excluded: 'quota' },
  ));
  assert.deepEqual([...d].sort(), ['ok', 'x', 'xf']);
});

test('SR-01b: classifyRun gán failReason/excluded theo §4.3', () => {
  assert.deepEqual(classifyRun({ status: 'done' }, { timeoutMin: 60 }), { failReason: null, excluded: null });
  assert.deepEqual(classifyRun({ status: 'done', leak: true }, {}), { failReason: null, excluded: 'leak' });
  assert.deepEqual(classifyRun({ status: 'failed', infra: 'rate-limit' }, {}), { failReason: 'quota', excluded: 'quota' });
  assert.deepEqual(classifyRun({ status: 'failed', timedOut: true }, {}), { failReason: 'timeout', excluded: null }, 'timeout do hệ không xong thì giữ');
  assert.deepEqual(classifyRun({ status: 'failed', timedOut: true }, { infraTimeout: true }), { failReason: 'timeout', excluded: 'timeout' });
  assert.deepEqual(classifyRun({ status: 'failed', wallSec: 59 * 60 }, { timeoutMin: 60 }), { failReason: 'timeout', excluded: null });
  assert.deepEqual(classifyRun({ status: 'done' }, { error: 'ENOENT' }), { failReason: 'error', excluded: null });
  assert.equal(isFinishedRow({ status: 'failed', excluded: 'quota' }), true);
  assert.equal(isFinishedRow({ status: 'failed' }), false);
});

test('SR-01d: lượt thay nhận rep = max(rep)+1, khóa bị loại không chạy lại, không thay hai lần', () => {
  const cells = [{ task: 't', arm: 'A' }];
  const rows = [{ key: 't__A__r1', task: 't', arm: 'A', rep: 1, status: 'done' }, { key: 't__A__r2', task: 't', arm: 'A', rep: 2, status: 'done', excluded: 'leak' }];
  assert.deepEqual(replacementRuns(J(...rows), 2, cells), [{ task: 't', arm: 'A', rep: 3 }]);
  const withRepl = [...rows, { key: 't__A__r3', task: 't', arm: 'A', rep: 3, status: 'done' }];
  assert.deepEqual(replacementRuns(J(...withRepl), 2, cells), []);
  assert.deepEqual(replacementRuns(J(rows[0]), 2, cells), []);
  assert.deepEqual(replacementRuns(J(...rows.map((r) => ({ ...r, excluded: 'leak' }))), 2, cells).map((x) => x.rep), [3, 4]);
});

test('SR-01: run.mjs --dry-run chạy lượt thay cho khóa bị loại trong runs.jsonl có sẵn', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccvb-sr01-'));
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), J({ key: 't1-duration__null__r1', task: 't1-duration', arm: 'null', rep: 1, status: 'done', excluded: 'leak' }));
  const r = spawnSync(process.execPath, [path.join(SUITE, 'run.mjs'), '--arms', 'null', '--tasks', 't1-duration', '--repeats', '1', '--out', dir, '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /t1-duration__null__r2/);
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
